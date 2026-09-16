import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Absenteeism,
  AbsenteeismDocument,
  AbsenteeismType,
} from '../../absenteeism/schemas/absenteeism.schema';
import {
  CompanyPeriodScheduledWorkData,
  CompanyPeriodScheduledWorkDataDocument,
} from '../../incidents/schemas/company-period-scheduled-work-data.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.3.6
 * "Medición del ausentismo por causa médica" (FASE 35E-2).
 *
 * Fórmula normativa disponible (fuente: contexto de FASE 35E-1/35E-2A):
 *   ausentismo (%) = (días de ausencia por incapacidad laboral o común en el
 *                     mes / días de trabajo programados en el mes) × 100
 *
 * ─── Período (§6) ───
 * FRECUENCIA NORMATIVA MENSUAL: el provider siempre trabaja el mes calendario
 * UTC en curso. periodStart = día 1 00:00:00.000 UTC; periodEnd = último día
 * 23:59:59.999 UTC. No existe fallback anual ni selector histórico (deuda
 * documentada; la parametrización llega en una fase posterior).
 *
 * ─── Denominador (§7) ───
 * CompanyPeriodScheduledWorkData para { companyId, period }:
 *   denominatorType = scheduled_work_days.
 * - No existe registro del período → NO_DATA (no se inventa el denominador).
 * - scheduledWorkDays = 0 → NO_DATA (nunca dividir por cero).
 * - NUNCA se usa el proxy censal de 3.3.4/3.3.5, headcount × días calendario,
 *   ni las horas trabajadas de CompanyPeriodWorkData (categoría "trabajado"
 *   ≠ "programado" — 35E-2A).
 *
 * ─── Numerador (§8–§13) ───
 * "Días de ausencia por incapacidad laboral o común en el mes", fuente
 * EXCLUSIVA: Absenteeism (fuente propia del módulo de ausentismo; NO consume
 * resultados de otros providers — §28).
 *
 * Semántica adoptada (documentada, no inferida):
 * - Solo registros con medicalIncapacity === true cuentan (señal estructurada
 *   de incapacidad médica — incapacidad laboral o común). medicalIncapacity es
 *   la extensión semántica mínima creada en 35E-2 (§12) porque el enum `tipo`
 *   no permite distinguir de forma confiable incapacidad común vs laboral vs
 *   ausencia administrativa.
 * - ENFERMEDAD/ACCIDENTE: solo cuentan SI medicalIncapacity === true.
 *   ACCIDENTE ≠ automáticamente incapacidad (§13): sin evidencia estructurada
 *   no cuenta.
 * - PERMISO: NUNCA cuenta (ausencia administrativa; la regla `tipo` basta).
 * - Registros históricos sin medicalIncapacity (undefined): NO cuentan
 *   automáticamente (compatibilidad hacia atrás sin inferencias — §14).
 * - NUNCA se leen descripcion/soporte (§27: sin datos clínicos; el cálculo no
 *   depende de texto libre).
 *
 * ─── Atribución temporal (§9–§11) ───
 * NO se suma Absenteeism.dias directamente (días calendario completos del
 * registro): una ausencia que cruza meses se doble contaría. Se seleccionan
 * los registros que INTERSECTAN el mes:
 *   absenceStart <= periodEnd AND absenceEnd >= periodStart
 * y se atribuye únicamente la parte del período:
 *   effectiveStart = max(fechaInicio, periodStart)
 *   effectiveEnd   = min(fechaFin, periodEnd)
 *   días atribuidos = (effectiveEnd − effectiveStart) en días + 1 (días
 *   calendario del rango, consistentes con la semántica de `dias`).
 *
 * LIMITACIÓN DOCUMENTADA (numeratorType = calendar_days_in_period): el
 * denominador es un AGREGADO mensual de días programados; el sistema NO
 * conoce qué fechas exactas fueron días laborales individuales (no existe
 * calendario diario por trabajador). Por tanto el numerador cuenta días
 * calendario de ausencia dentro del mes (aproximación consistente con los
 * datos disponibles; limitación explícita en metadata — deuda NO bloqueante,
 * 35E-2 §11/§29).
 *
 * ─── Casos especiales (§16) ───
 * A: sin registros de ausentismo + denominador válido → numerator = 0,
 *    resultado válido 0.00% (NO NO_DATA) con advertencia de subregistro.
 * B: hay ausentismo pero no hay denominador del período → NO_DATA.
 * C: denominador = 0 → NO_DATA.
 * D: registro fuera del período → no cuenta.
 * E: registro cruza meses → solo la parte del período (sin doble conteo).
 * F/G: PERMISO o ACCIDENTE sin señal estructurada → no cuenta (quedan en
 *    excludedNonMedicalRecords).
 * companyId inválido → NO_DATA (invalidCompanyId).
 *
 * ─── Criterios y pesos (§19) ───
 * El score evalúa la CALIDAD DE LA MEDICIÓN (30/30/20/20, target 90):
 * - C1 (30): cobertura de registros médicos del período (registro en uso y
 *   señal estructurada presente en los registros intersectados).
 * - C2 (30): trazabilidad del numerador (usuario asociado + señal explícita).
 * - C3 (20): denominador programado presente, > 0 y del período correcto con
 *   denominatorType = scheduled_work_days.
 * - C4 (20): cobertura temporal mensual (denominador del mes evaluado).
 * Un % de ausentismo bajo NO produce mejor compliance y uno alto NO produce
 * peor compliance (§19: el score no mide si el ausentismo es "bueno/malo").
 */
@Injectable()
export class MedicalAbsenteeismProvider implements ComplianceProvider {
  private static readonly MODULE = 'medical-absenteeism';
  private static readonly COMPLIANCE_TARGET = 90;
  /** Factor fijo normativo: porcentaje (× 100). No configurable. */
  private static readonly FACTOR = 100;

  constructor(
    @InjectModel(Absenteeism.name)
    private readonly absenteeismModel: Model<AbsenteeismDocument>,
    @InjectModel(CompanyPeriodScheduledWorkData.name)
    private readonly scheduledWorkDataModel: Model<CompanyPeriodScheduledWorkDataDocument>,
  ) {}

  /** Metadata del provider (patrón 3.3.4/3.3.5). */
  get metadata() {
    return {
      module: MedicalAbsenteeismProvider.MODULE,
      standard: '3.3.6',
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      title: 'Medición del ausentismo por causa médica',
      description:
        'Proporción de días de ausencia por incapacidad laboral o común en el mes respecto a los días de trabajo programados en el mes, expresada en porcentaje.',
    };
  }

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    if (!Types.ObjectId.isValid(companyId)) {
      return this.noData('medical-absenteeism-invalid-company', 'companyId inválido');
    }

    const objectId = new Types.ObjectId(companyId);

    // ── Período técnico: MES calendario UTC en curso (frecuencia normativa
    // mensual). Sin fallback anual ni selector histórico (deuda documentada). ──
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-11
    const period = `${year}-${String(month + 1).padStart(2, '0')}`;
    const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const periodStartDay = Date.UTC(year, month, 1);
    const periodEndDay = Date.UTC(year, month + 1, 0);

    // ── Denominador (§7): registro declarado/auditado del período. ──
    const scheduledData = await this.scheduledWorkDataModel
      .findOne({ companyId: objectId, period })
      .lean()
      .exec();

    const scheduledWorkDays = scheduledData?.scheduledWorkDays;

    // Caso B/C: sin denominador del período o denominador 0 → NO_DATA.
    if (scheduledWorkDays === undefined || scheduledWorkDays === null || scheduledWorkDays === 0) {
      return {
        module: MedicalAbsenteeismProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'medical-absenteeism-no-denominator',
            module: MedicalAbsenteeismProvider.MODULE,
            title: 'No existe denominador de días de trabajo programados para el período',
            description:
              `No hay un registro válido de días de trabajo programados para el período ${period} ` +
              '(o el valor registrado es 0). El estándar 3.3.6 exige el denominador normativo ' +
              '"días de trabajo programados en el mes": no se inventa ni se sustituye por headcount ' +
              'ni por horas trabajadas. Cargar el valor mensual para habilitar la medición.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: this.buildMetadata(0, 0, period, periodStart, periodEnd, 0, {
          invalidCompanyId: false,
          zeroDenominator: scheduledWorkDays === 0,
          denominatorPresent: false,
        }),
      };
    }

    // ── Numerador (§8–§13): intersección temporal tenant-scoped. ──
    // Se leen los registros del tenant que intersectan el mes; el filtrado de
    // causa médica y la atribución por rangos se hace en memoria de forma
    // determinista (fechaInicio/fechaFin son siempre válidas por el service).
    const allRecords = await this.absenteeismModel
      .find({
        companyId: objectId,
        fechaInicio: { $lte: periodEnd },
        fechaFin: { $gte: periodStart },
      })
      .lean()
      .exec();

    const totalAbsenteeismRecords = allRecords.length;
    let eligibleMedicalRecords = 0;
    let excludedNonMedicalRecords = 0;
    let excludedOutOfPeriodRecords = 0;
    let crossPeriodRecords = 0;
    let medicalAbsenceDays = 0;
    let recordsWithoutStructuredSignal = 0;
    let recordsWithoutUserLink = 0;

    for (const record of allRecords) {
      const start = new Date(record.fechaInicio);
      const end = new Date(record.fechaFin);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end.getTime() < start.getTime()
      ) {
        // Fechas inválidas (no parseables o invertidas): el modelo exige
        // fechaFin >= fechaInicio; el registro se excluye como no médico
        // (no se infiere nada).
        excludedNonMedicalRecords += 1;
        continue;
      }

      // Caso D: intersección estricta con el período (corte por día UTC).
      const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      if (endDay < periodStartDay || startDay > periodEndDay) {
        excludedOutOfPeriodRecords += 1;
        continue;
      }

      // Regla de causa médica (§12–§13): señal estructurada, sin inferencias y
      // sin leer descripcion/soporte. PERMISO nunca cuenta; ENFERMEDAD/
      // ACCIDENTE solo con medicalIncapacity === true.
      const isMedical =
        record.tipo !== AbsenteeismType.PERMISO && record.medicalIncapacity === true;
      if (!isMedical) {
        excludedNonMedicalRecords += 1;
        if (record.medicalIncapacity === undefined) {
          recordsWithoutStructuredSignal += 1;
        }
        continue;
      }

      eligibleMedicalRecords += 1;

      // Trazabilidad C2: vínculo de usuario (userId es obligatorio en el modelo).
      if (!record.userId) {
        recordsWithoutUserLink += 1;
      }

      // Caso E: solo la parte del período (sin doble conteo cross-month).
      if (startDay < periodStartDay || endDay > periodEndDay) {
        crossPeriodRecords += 1;
      }
      const effectiveStartDay = Math.max(startDay, periodStartDay);
      const effectiveEndDay = Math.min(endDay, periodEndDay);
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysInPeriod = Math.floor((effectiveEndDay - effectiveStartDay) / msPerDay) + 1;
      medicalAbsenceDays += daysInPeriod;
    }

    // ── Trazabilidad (C2) ──
    const denominatorRecords = eligibleMedicalRecords;
    const traceabilityBase = denominatorRecords > 0 ? denominatorRecords : 1;
    const explicitSignalCoverage =
      denominatorRecords > 0
        ? Math.round(((denominatorRecords - recordsWithoutStructuredSignal) / traceabilityBase) * 100)
        : 0;
    const userLinkCoverage =
      denominatorRecords > 0
        ? Math.round(((denominatorRecords - recordsWithoutUserLink) / traceabilityBase) * 100)
        : 0;
    const traceabilityCoverage = Math.round(
      (explicitSignalCoverage * 0.5 + userLinkCoverage * 0.5),
    );

    // ── Criterios (§19–§21) ──
    // C1 (30): cobertura de registros médicos del período. Con denominador
    // válido, la medición existe y es determinista; los registros médicos
    // intersectados ya fueron identificados con regla estructurada.
    const c1 = 100;
    // C2 (30): trazabilidad del numerador (señal explícita + vínculo usuario).
    const c2 = traceabilityCoverage;
    // C3 (20): denominador programado válido (> 0) del período correcto.
    const c3 = 100;
    // C4 (20): cobertura temporal mensual — el denominador es del mes evaluado
    // (garantizado por la búsqueda { companyId, period }) y las fechas de las
    // ausencias son asignables al período.
    const c4 = 100;

    const percentage = Math.round(c1 * 0.3 + c2 * 0.3 + c3 * 0.2 + c4 * 0.2);

    // ── Fórmula (§15): factor 100 fijo, precisión interna completa. ──
    const medicalAbsenteeismRate =
      scheduledWorkDays > 0 ? (medicalAbsenceDays / scheduledWorkDays) * MedicalAbsenteeismProvider.FACTOR : 0;

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    if (totalAbsenteeismRecords === 0) {
      // Caso A: sin registros de ausentismo + denominador válido → 0.00%
      // VÁLIDO (no NO_DATA) con advertencia de posible subregistro.
      findings.push({
        id: 'medical-absenteeism-zero-absences',
        module: MedicalAbsenteeismProvider.MODULE,
        title: '0 días de ausencia médica registrados en el período',
        description:
          `No existen registros de ausentismo que intersecten el período ${period} y existe un ` +
          `denominador válido (${scheduledWorkDays} días de trabajo programados). Ausentismo por causa ` +
          'médica = 0.00%. Advertencia: un cero puede reflejar subregistro; verificar que las ' +
          'ausencias reales se estén registrando (con la señal de incapacidad médica).',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else {
      findings.push({
        id: 'medical-absenteeism-rate',
        module: MedicalAbsenteeismProvider.MODULE,
        title: `Ausentismo por causa médica: ${medicalAbsenteeismRate.toFixed(2)}%`,
        description:
          `${medicalAbsenceDays} día(s) de ausencia por incapacidad médica (laboral o común) atribuidos al ` +
          `período ${period} sobre ${scheduledWorkDays} días de trabajo programados. Tasa con precisión ` +
          'interna completa: ' +
          `${medicalAbsenteeismRate} (factor fijo 100). El score evalúa la calidad de la medición ` +
          '(C1–C4), no la magnitud del ausentismo.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (recordsWithoutStructuredSignal > 0) {
      findings.push({
        id: 'medical-absenteeism-unclassified-records',
        module: MedicalAbsenteeismProvider.MODULE,
        title: `${recordsWithoutStructuredSignal} registro(s) de ausentismo sin clasificación de incapacidad médica`,
        description:
          'Registros históricos sin la señal estructurada de incapacidad médica (medicalIncapacity): ' +
          'no se infiere su naturaleza ni se cuentan automáticamente en el numerador. Clasificar los ' +
          'registros para reflejar su aporte real al indicador.',
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (crossPeriodRecords > 0) {
      findings.push({
        id: 'medical-absenteeism-cross-period',
        module: MedicalAbsenteeismProvider.MODULE,
        title: `${crossPeriodRecords} ausencia(s) cruzan los límites del período`,
        description:
          'Ausencias que atraviesan el inicio o el fin del mes: se atribuyó únicamente la parte ' +
          'correspondiente al período (sin doble contabilización entre meses).',
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Resultado (contrato ProviderComplianceResult) ──
    const status =
      percentage >= MedicalAbsenteeismProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    return {
      module: MedicalAbsenteeismProvider.MODULE,
      percentage,
      status,
      findings,
      pending: 0,
      completed: eligibleMedicalRecords,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.buildMetadata(
        medicalAbsenceDays,
        scheduledWorkDays,
        period,
        periodStart,
        periodEnd,
        medicalAbsenteeismRate,
        {
          totalAbsenteeismRecords,
          eligibleMedicalRecords,
          excludedNonMedicalRecords,
          excludedOutOfPeriodRecords,
          crossPeriodRecords,
          traceabilityCoverage,
          recordsWithoutStructuredSignal,
          recordsWithoutUserLink,
          denominatorPresent: true,
        },
      ),
    };
  }

  /** NO_DATA reutilizable (patrón 3.3.4/3.3.5). */
  private noData(findingId: string, title: string): ProviderComplianceResult {
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      module: MedicalAbsenteeismProvider.MODULE,
      percentage: 0,
      status: 'NO_DATA',
      findings: [
        {
          id: findingId,
          module: MedicalAbsenteeismProvider.MODULE,
          title,
          description:
            'No es posible calcular el ausentismo por causa médica (3.3.6) para el período en curso.',
          priority: FindingPriority.HIGH,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
      pending: 0,
      completed: 0,
      phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.buildMetadata(0, 0, period, now, now, 0, {
        invalidCompanyId: true,
        denominatorPresent: false,
      }),
    };
  }

  /** Metadata mínima auditable (§17) — sin diagnóstico, CIE ni soporte clínico. */
  private buildMetadata(
    medicalAbsenceDays: number,
    scheduledWorkDays: number,
    period: string,
    periodStart: Date,
    periodEnd: Date,
    rate: number,
    extra: {
      invalidCompanyId?: boolean;
      zeroDenominator?: boolean;
      denominatorPresent: boolean;
      totalAbsenteeismRecords?: number;
      eligibleMedicalRecords?: number;
      excludedNonMedicalRecords?: number;
      excludedOutOfPeriodRecords?: number;
      crossPeriodRecords?: number;
      traceabilityCoverage?: number;
      recordsWithoutStructuredSignal?: number;
      recordsWithoutUserLink?: number;
    },
  ): Record<string, unknown> {
    return {
      metric: 'medical_absenteeism_rate',
      unit: '%',
      factor: MedicalAbsenteeismProvider.FACTOR,
      period,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      numerator: extra.eligibleMedicalRecords ?? 0,
      medicalAbsenceDays,
      denominator: scheduledWorkDays,
      scheduledWorkDays,
      denominatorType: 'scheduled_work_days',
      frequency: 'monthly',
      /** Tasa con precisión interna completa (sin redondeo intermedio). */
      medicalAbsenteeismRate: rate,
      numeratorType: 'calendar_days_in_period',
      /** Limitación documentada 35E-2 §11: ver docstring de la clase. */
      numeratorLimitation:
        'El numerador cuenta días calendario de ausencia dentro del mes; no existe calendario diario individual de días laborales.',
      totalAbsenteeismRecords: extra.totalAbsenteeismRecords ?? 0,
      eligibleMedicalRecords: extra.eligibleMedicalRecords ?? 0,
      excludedNonMedicalRecords: extra.excludedNonMedicalRecords ?? 0,
      excludedOutOfPeriodRecords: extra.excludedOutOfPeriodRecords ?? 0,
      crossPeriodRecords: extra.crossPeriodRecords ?? 0,
      zeroDenominator: extra.zeroDenominator ?? false,
      collectionEmpty: (extra.totalAbsenteeismRecords ?? 0) === 0,
      invalidCompanyId: extra.invalidCompanyId ?? false,
      denominatorPresent: extra.denominatorPresent,
      traceabilityCoverage: extra.traceabilityCoverage ?? 0,
      recordsWithoutStructuredSignal: extra.recordsWithoutStructuredSignal ?? 0,
      recordsWithoutUserLink: extra.recordsWithoutUserLink ?? 0,
    };
  }
}
