import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OccupationalDiseaseQualification,
  OccupationalDiseaseStatisticalCase,
  OccupationalDiseaseStatisticalCaseDocument,
} from '../../occupational-disease-statistical-case/schemas/occupational-disease-statistical-case.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.3.5
 * "Medición de la incidencia de enfermedad laboral".
 *
 * Definición aprobada (FASE 35D-1/35D-2, MODEL B):
 *   incidence = (newCases / referencePopulation) × 1000
 *
 *   newCases             = casos NUEVOS del registro estadístico del tenant:
 *                          occupationalQualification = QUALIFIED, active = true,
 *                          firstOccurrence = true y recognitionDate dentro del
 *                          período evaluado.
 *   referencePopulation  = headcount censal del tenant (Employee.status =
 *                          'Activo', admissionDate <= periodEnd; admissionDate
 *                          ausente se considera incluido por compatibilidad).
 *   1000                 = factor fijo por normativa (no configurable).
 *
 * Semántica de firstOccurrence (FASE 35D-1, demostrada en código):
 *   "primera ocurrencia estadística registrada para ese statisticalCaseId
 *   dentro del tenant". NO es "primer caso clínico de la persona". La unidad
 *   epidemiológica es el episodio estadístico { companyId, statisticalCaseId }.
 *
 * Reglas del numerador (MODEL B):
 * - caseStatus (OPEN/CLOSED) NO determina la inclusión: un caso reconocido en
 *   el período cuenta esté abierto o cerrado (cerrar ≠ eliminar del numerador;
 *   reabrir ≠ caso nuevo: firstOccurrence es inmutable, Gate 9 de 35B).
 * - firstOccurrence = false NO cuenta (episodio/recurrencia posterior dentro
 *   del registro estadístico).
 * - UNDER_REVIEW / NOT_QUALIFIED / DISCARDED nunca cuentan (Reglas C/D 35B).
 * - active = false (baja lógica/corrección) nunca cuenta.
 * - recognitionDate ausente nunca cuenta (no se infiere de createdAt/period).
 * - recognitionDate anterior o posterior al período no cuenta.
 *
 * Período (decisión técnica 35D-2): año calendario UTC en curso.
 *   periodStart = 1 de enero 00:00:00.000 UTC
 *   periodEnd   = 31 de diciembre 23:59:59.999 UTC
 *   OPEN_NORMATIVE_QUESTION: la frecuencia normativa no está parametrizada;
 *   deuda NO bloqueante documentada.
 *
 * Casos especiales (FASE 35D-2 §6):
 * - companyId inválido → NO_DATA (invalidCompanyId).
 * - denominador = 0 → NO_DATA (sin división, sin TARGET automático).
 * - colección completamente vacía → NO_DATA (Caso A/C: no puede distinguirse
 *   "cero real" de "nunca se registró").
 * - registros presentes + 0 casos nuevos + denominador > 0 → incidence = 0
 *   VÁLIDA (no NO_DATA), con advertencia de posible subregistro.
 * - múltiples firstOccurrence = true para el mismo employeeId en el período →
 *   el cálculo NO se bloquea ni se altera el numerador; C2 se degrada y se
 *   emite finding de posible duplicidad/ambigüedad estadística (Caso E).
 * - employeeId ausente → el caso cuenta; C2 se degrada (Caso F).
 *
 * Criterios y pesos (30/30/20/20, patrón 3.3.4/3.3.1/3.3.2/3.3.3):
 * - C1: Nuevos casos válidos:                   30%
 * - C2: Trazabilidad del numerador:             30%
 * - C3: Población de referencia y cálculo:      20%
 * - C4: Cobertura temporal de la medición:      20%
 *
 * Limitaciones documentadas (deuda NO bloqueante, FASE 35D-1/35D-2 §19):
 * - denominador = census_headcount_proxy (no hay cohorte de trabajadores
 *   expuestos; OPEN_NORMATIVE_QUESTION sobre "trabajadores expuestos").
 * - Employee sin exitDate: el headcount histórico no es reproducible.
 * - La medición no se persiste históricamente (patrón stateless del engine).
 * - La identidad estadística de episodios no equivale a identidad clínica.
 *
 * El score evalúa la CALIDAD DE LA MEDICIÓN (C1–C4), NO la magnitud
 * epidemiológica: incidence = 0 con registro en uso es TARGET_MET; una
 * incidencia positiva NO reduce el score por su magnitud (no existe umbral
 * normativo cuantitativo validado).
 */
@Injectable()
export class DiseaseIncidenceProvider implements ComplianceProvider {
  private static readonly MODULE = 'disease-incidence';
  private static readonly COMPLIANCE_TARGET = 90;
  /** Factor fijo normativo: casos nuevos por 1.000 trabajadores. */
  private static readonly SCALE_FACTOR = 1000;

  constructor(
    @InjectModel(OccupationalDiseaseStatisticalCase.name)
    private readonly caseModel: Model<OccupationalDiseaseStatisticalCaseDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  /** Metadata del provider (patrón 3.3.4/3.1.8/3.1.9). */
  get metadata() {
    return {
      module: DiseaseIncidenceProvider.MODULE,
      standard: '3.3.5',
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      title: 'Medición de la incidencia de enfermedad laboral',
      description:
        'Nuevos casos de enfermedad laboral (primera ocurrencia estadística, calificados y reconocidos dentro del período) por cada 1.000 trabajadores de la población de referencia del mismo tenant.',
    };
  }

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    if (!Types.ObjectId.isValid(companyId)) {
      return this.noData('disease-incidence-invalid-company', 'companyId inválido');
    }

    const objectId = new Types.ObjectId(companyId);

    // ── Período técnico: año calendario UTC en curso (patrón temporal de los
    // providers del capítulo 3). Selector histórico/parametrización: deuda. ──
    const now = new Date();
    const year = now.getUTCFullYear();
    const periodStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const periodStartDay = Date.UTC(year, 0, 1);
    const periodEndDay = Date.UTC(year, 11, 31);

    // ── Lectura tenant-scoped del registro estadístico (única fuente del
    // numerador). Sin conversión desde Incident/DiseaseInvestigation/Absenteeism. ──
    const allCases = await this.caseModel
      .find({ companyId: objectId })
      .lean()
      .exec();

    // ── Denominador: headcount censal del tenant a la fecha de cierre del
    // período (mismo proxy validado en 3.3.4). status === 'Activo' y
    // admissionDate <= periodEnd; admissionDate ausente/null → incluido
    // (compatibilidad aprobada FASE 35C-1). ──
    const denominator = await this.employeeModel
      .countDocuments({
        companyId: objectId,
        status: 'Activo',
        $or: [
          { admissionDate: { $lte: periodEnd } },
          { admissionDate: { $exists: false } },
          { admissionDate: null },
        ],
      })
      .exec();

    const totalRecords = allCases.length;

    // ══ GATE: colección completamente vacía (Caso C — §6) ══
    if (totalRecords === 0) {
      return {
        module: DiseaseIncidenceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'disease-incidence-no-data',
            module: DiseaseIncidenceProvider.MODULE,
            title: 'Sin datos para calcular la incidencia',
            description:
              'El registro estadístico de enfermedad laboral no tiene ningún caso registrado. ' +
              'No es posible distinguir un cero real de la ausencia de información. ' +
              'Registrar los casos de enfermedad laboral para habilitar la medición de incidencia (3.3.5).',
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
        metadata: this.buildMetadata(0, denominator, periodStart, periodEnd, {
          collectionEmpty: true,
          totalRecords: 0,
        }),
      };
    }

    // ══ GATE: denominador cero (Caso B — §6): nunca dividir por cero ══
    if (denominator === 0) {
      return {
        module: DiseaseIncidenceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'disease-incidence-no-denominator',
            module: DiseaseIncidenceProvider.MODULE,
            title: 'No existe población de referencia válida',
            description:
              'No existe población de referencia válida para calcular la incidencia ' +
              '(0 trabajadores activos al cierre del período). Verificar el estado de la nómina en el sistema.',
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
        metadata: this.buildMetadata(0, 0, periodStart, periodEnd, {
          collectionEmpty: false,
          zeroDenominator: true,
          totalRecords,
        }),
      };
    }

    // ══ Numerador (MODEL B — §2): QUALIFIED + active + firstOccurrence +
    // recognitionDate dentro del período (corte por día UTC, coherente con
    // la Regla E del service 35B). ══
    const newCases = allCases.filter((c) => {
      if (c.occupationalQualification !== OccupationalDiseaseQualification.QUALIFIED) return false;
      if (c.active !== true) return false;
      if (c.firstOccurrence !== true) return false;
      if (!c.recognitionDate) return false;
      const d = new Date(c.recognitionDate);
      if (Number.isNaN(d.getTime())) return false;
      const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return day >= periodStartDay && day <= periodEndDay;
    });

    // ══ Trazabilidad (Caso E/Caso F — §6) ══
    // employeeId ausente: el caso cuenta pero degrada la trazabilidad.
    const withoutEmployee = newCases.filter((c) => !c.employeeId).length;
    const withEmployee = newCases.length - withoutEmployee;
    const employeeTraceabilityCoverage =
      newCases.length > 0 ? Math.round((withEmployee / newCases.length) * 100) : 100;

    // Posible duplicidad estadística: mismo employeeId con ≥ 2 casos nuevos
    // (firstOccurrence = true) dentro del período. NO bloquea ni altera el
    // numerador (semántica vigente: episodio estadístico); degrada C2 y emite
    // finding de calidad estadística.
    const newCasesByEmployee = new Map<string, number>();
    for (const c of newCases) {
      if (!c.employeeId) continue;
      const key = c.employeeId.toString();
      newCasesByEmployee.set(key, (newCasesByEmployee.get(key) ?? 0) + 1);
    }
    let duplicatePotentialCount = 0;
    for (const count of newCasesByEmployee.values()) {
      if (count > 1) duplicatePotentialCount += 1;
    }

    // ══ C1 — Nuevos casos válidos (30%) ══
    // Registro en uso + denominador válido: la medición existe y es
    // determinista (0 registros ya devolvió NO_DATA).
    const c1 = 100;

    // ══ C2 — Trazabilidad del numerador (30%) ══
    // Cobertura employeeId + penalización por grupos de posible duplicidad.
    const c2 = Math.max(0, employeeTraceabilityCoverage - duplicatePotentialCount * 10);

    // ══ C3 — Población de referencia y cálculo (20%) ══
    // Ya verificado denominator > 0 (gate previo); fórmula determinista.
    const c3 = 100;

    // ══ C4 — Cobertura temporal (20%) ══
    // Período explícito en metadata. La fuente temporal del estándar es
    // recognitionDate: si ningún caso del registro tiene fecha válida, la
    // asignación al período no es trazable. Sin periodicidad normativa dura.
    const hasDatedRecognition = allCases.some((c) => {
      if (!c.recognitionDate) return false;
      const d = new Date(c.recognitionDate);
      return !Number.isNaN(d.getTime());
    });
    const c4 = hasDatedRecognition ? 100 : 0;

    const percentage = Math.round(c1 * 0.3 + c2 * 0.3 + c3 * 0.2 + c4 * 0.2);

    // ══ Fórmula (§5): factor 1000 fijo, precisión interna completa. ══
    const incidence =
      denominator > 0 ? (newCases.length / denominator) * DiseaseIncidenceProvider.SCALE_FACTOR : 0;

    // ══ Findings ══
    const findings: ProviderComplianceResult['findings'] = [];

    if (newCases.length === 0) {
      // Caso D (§6): 0 casos nuevos + denominador válido + registro en uso
      // = medición VÁLIDA (no NO_DATA), con advertencia de subregistro.
      findings.push({
        id: 'disease-incidence-zero-cases',
        module: DiseaseIncidenceProvider.MODULE,
        title: '0 casos nuevos registrados en el período',
        description:
          `El registro estadístico está en uso (${totalRecords} registro(s) administrativo(s)) y hay ` +
          `${denominator} trabajador(es) de referencia, pero no existen casos nuevos (QUALIFIED, ` +
          `firstOccurrence, recognitionDate dentro del período). Incidencia = 0.00 por 1.000 trabajadores. ` +
          'Advertencia: un cero puede reflejar subregistro; verificar que los casos reales estén siendo calificados y registrados.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else {
      findings.push({
        id: 'disease-incidence-rate',
        module: DiseaseIncidenceProvider.MODULE,
        title: `Incidencia de enfermedad laboral: ${incidence.toFixed(2)} por 1.000 trabajadores`,
        description:
          `${newCases.length} caso(s) nuevo(s) (QUALIFIED, primera ocurrencia estadística, reconocidos ` +
          `dentro del período ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}) ` +
          `sobre ${denominator} trabajador(es) de referencia. ` +
          `Tasa con precisión interna completa: ${incidence} (factor fijo 1.000). ` +
          'El score evalúa la calidad de la medición (C1–C4), no la magnitud epidemiológica.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (withoutEmployee > 0) {
      findings.push({
        id: 'disease-incidence-traceability-gap',
        module: DiseaseIncidenceProvider.MODULE,
        title: `${withoutEmployee} caso(s) nuevo(s) sin trabajador asociado`,
        description:
          'Casos nuevos sin employeeId: la trazabilidad por trabajador es incompleta (el modelo 35B permite casos sin vínculo). ' +
          'Asociar el caso al trabajador correspondiente cuando sea posible.',
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (duplicatePotentialCount > 0) {
      findings.push({
        id: 'disease-incidence-duplicate-episodes',
        module: DiseaseIncidenceProvider.MODULE,
        title: `Posible duplicidad estadística en ${duplicatePotentialCount} trabajador(es)`,
        description:
          'Un mismo trabajador acumula múltiples casos nuevos (firstOccurrence = true) dentro del período. ' +
          'La identidad estadística de episodios (statisticalCaseId) no equivale necesariamente a la identidad clínica: ' +
          'verificar si corresponde a episodios genuinamente distintos. El cálculo no se altera.',
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ══ Resultado (contrato ProviderComplianceResult) ══
    const status =
      percentage >= DiseaseIncidenceProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET';

    return {
      module: DiseaseIncidenceProvider.MODULE,
      percentage,
      status,
      findings,
      pending: 0,
      completed: newCases.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.buildMetadata(incidence, denominator, periodStart, periodEnd, {
        collectionEmpty: false,
        totalRecords,
        newCases: newCases.length,
        withoutEmployeeLink: withoutEmployee,
        employeeTraceabilityCoverage,
        duplicatePotentialCount,
      }),
    };
  }

  /** NO_DATA reutilizable (patrón 3.3.4/3.1.8). */
  private noData(findingId: string, title: string): ProviderComplianceResult {
    return {
      module: DiseaseIncidenceProvider.MODULE,
      percentage: 0,
      status: 'NO_DATA',
      findings: [
        {
          id: findingId,
          module: DiseaseIncidenceProvider.MODULE,
          title,
          description: 'No es posible calcular la incidencia de enfermedad laboral (3.3.5).',
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
      metadata: this.buildMetadata(0, 0, new Date(), new Date(), {
        collectionEmpty: true,
        invalidCompanyId: true,
      }),
    };
  }

  /** Metadata mínima (§9): metric/unit/scaleFactor/numerator/denominator/período + flags. */
  private buildMetadata(
    incidence: number,
    denominator: number,
    periodStart: Date,
    periodEnd: Date,
    extra: {
      collectionEmpty: boolean;
      invalidCompanyId?: boolean;
      zeroDenominator?: boolean;
      totalRecords?: number;
      newCases?: number;
      withoutEmployeeLink?: number;
      employeeTraceabilityCoverage?: number;
      duplicatePotentialCount?: number;
    },
  ): Record<string, unknown> {
    return {
      metric: 'incidence',
      unit: 'casos nuevos por 1.000 trabajadores',
      scaleFactor: DiseaseIncidenceProvider.SCALE_FACTOR,
      /** Valor con precisión interna completa (sin redondeo intermedio). */
      incidence,
      numerator: extra.newCases ?? 0,
      newCases: extra.newCases ?? 0,
      denominator,
      referencePopulation: denominator,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      denominatorType: 'census_headcount_proxy',
      collectionEmpty: extra.collectionEmpty,
      invalidCompanyId: extra.invalidCompanyId ?? false,
      zeroDenominator: extra.zeroDenominator ?? false,
      totalRecords: extra.totalRecords ?? 0,
      withoutEmployeeLink: extra.withoutEmployeeLink ?? 0,
      employeeTraceabilityCoverage: extra.employeeTraceabilityCoverage ?? 100,
      duplicatePotentialCount: extra.duplicatePotentialCount ?? 0,
    };
  }
}
