import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SanitaryConditionResult,
  SanitaryConditionStatus,
  SanitaryConditionType,
  VERIFICATION_FREQUENCY_DAYS,
  WorkplaceSanitaryCondition,
  WorkplaceSanitaryConditionDocument,
} from '../../workplace-sanitary-conditions/schemas/workplace-sanitary-condition.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.8 "Agua potable, servicios
 * sanitarios y disposición de basuras" (FASE 34B). Semantic: EXACT.
 *
 * METADATA:
 *   standard: 3.1.8
 *   module: workplace-sanitary-conditions
 *   phase: do
 *   semantic: EXACT
 *
 * REGLAS DE IMPLEMENTACIÓN (NO NEGOCIABLES — frontera anti-double-scoring):
 *
 * 1. La evidencia proviene EXCLUSIVAMENTE de WorkplaceSanitaryCondition
 *    (entidad propia del estándar 3.1.8). Employee se utiliza ÚNICAMENTE como
 *    denominador poblacional cuando corresponda (no afecta la fórmula actual).
 * 2. NO consume como evidencia: EnvironmentalMeasurement (4.1.4),
 *    HazardousSubstance (4.1.3), InspectionActivity (4.2.4), Maintenance
 *    (4.2.5), HealthPromotionActivity (3.1.2/3.1.7), WorkRestriction (3.1.6),
 *    JobProfile (3.1.3), Risk ni DocumentMaster. Una inspección, medición o
 *    documento puede existir como contexto complementario, pero NO altera el
 *    porcentaje técnico de este provider.
 * 3. Registro VÁLIDO: active = true. Un registro inactivo no es evidencia
 *    vigente (conserva trazabilidad histórica, no puntúa cobertura).
 * 4. Un registro DEFICIENT o NOT_APT sigue siendo evidencia de VERIFICACIÓN
 *    (C1/C3), pero NO constituye condición adecuada (C2 lo penaliza).
 * 5. Un documento (DocumentMaster u otro) NO sustituye un registro: sin
 *    WorkplaceSanitaryCondition no hay evidencia para este estándar.
 *
 * CRITERIOS C1–C4 (25% cada uno):
 *
 * C1 — Existencia y cobertura: componentes (de los 3 tipos normativos) con al
 *      menos un registro activo / 3. Solo los tipos con registro cuentan; no
 *      se asume cobertura automática por trabajador.
 * C2 — Condición/aptitud: por cada componente cubierto, se evalúa el ÚLTIMO
 *      registro activo (por lastVerificationDate). OPERATIONAL/APT → 1;
 *      DEFICIENT/INCONCLUSIVE → 0.5; OUT_OF_SERVICE/NOT_APT → 0.
 *      "Fue verificado" ≠ "está en condición adecuada".
 * C3 — Verificación y trazabilidad: componentes cuyo último registro activo
 *      tiene fecha + responsable + evidencia (evidenceUrl).
 * C4 — Continuidad/vigencia: componentes cuya última verificación está dentro
 *      de la frecuencia declarada. nextVerificationDate vencida penaliza el
 *      componente (no se acepta vigencia indefinida).
 *
 * NOTA DE DENOMINADORES: C2/C3/C4 se evalúan SOBRE LOS COMPONENTES CUBIERTOS
 * (tipos con al menos un registro activo). La cobertura faltante ya penaliza
 * C1; no se penaliza dos veces el mismo hecho en cuatro criterios.
 */
@Injectable()
export class WorkplaceSanitaryConditionsProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  /** Tipos normativos exigidos por 3.1.8. */
  private static readonly REQUIRED_TYPES: SanitaryConditionType[] = [
    SanitaryConditionType.POTABLE_WATER,
    SanitaryConditionType.SANITARY_SERVICE,
    SanitaryConditionType.GARBAGE_MANAGEMENT,
  ];

  constructor(
    @InjectModel(WorkplaceSanitaryCondition.name)
    private readonly conditionModel: Model<WorkplaceSanitaryConditionDocument>,
  ) {}

  /** Metadata del provider. */
  get metadata() {
    return {
      module: 'workplace-sanitary-conditions',
      standard: '3.1.8',
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      title: 'Agua potable, servicios sanitarios y disposición de basuras',
      description:
        'Disponibilidad y condición de agua potable, servicios sanitarios adecuados y manejo/disposición de basuras en el lugar de trabajo.',
    };
  }

  /**
   * Calcula el cumplimiento del estándar 3.1.8 para una empresa.
   */
  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    if (!Types.ObjectId.isValid(companyId)) {
      return this.noData('workplace-sanitary-invalid-company', 'companyId inválido');
    }

    const companyObjectId = new Types.ObjectId(companyId);

    const records = await this.conditionModel
      .find({ companyId: companyObjectId })
      .sort({ lastVerificationDate: -1 })
      .lean();

    // Registro activo: única evidencia vigente (§3).
    const activeRecords = records.filter((r) => r.active);

    // ── NO_DATA: sin registros activos no existe evidencia evaluable ──
    if (activeRecords.length === 0) {
      return {
        module: 'workplace-sanitary-conditions',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'workplace-sanitary-no-records',
            module: 'workplace-sanitary-conditions',
            title: 'Sin condiciones sanitarias verificadas registradas',
            description:
              'No existen registros activos de agua potable, servicios sanitarios o manejo de basuras. El estándar 3.1.8 exige evidencia verificable de los tres componentes en el lugar de trabajo. Registrar los documentos NO sustituye este registro.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // ── Último registro activo por componente (orden: lastVerificationDate desc) ──
    const latestByType = new Map<SanitaryConditionType, WorkplaceSanitaryCondition>();
    for (const record of activeRecords) {
      if (!latestByType.has(record.conditionType)) {
        latestByType.set(record.conditionType, record as WorkplaceSanitaryCondition);
      }
    }

    const coveredTypes = [...latestByType.keys()].filter((t) =>
      WorkplaceSanitaryConditionsProvider.REQUIRED_TYPES.includes(t),
    );

    // ── C1 — Existencia y cobertura (25%): tipos cubiertos / tipos requeridos ──
    const c1 = coveredTypes.length / WorkplaceSanitaryConditionsProvider.REQUIRED_TYPES.length;

    // Denominador de C2/C3/C4: componentes CUBIERTOS (con evidencia activa).
    // El enum es cerrado (solo los 3 tipos requeridos), por lo que
    // coveredTypes.length === latestByType.size; el guard evita división por 0.
    const coveredCount = Math.max(coveredTypes.length, 1);

    // ── C2 — Condición/aptitud (25%): último registro por componente cubierto ──
    let c2Sum = 0;
    for (const record of latestByType.values()) {
      if (
        record.status === SanitaryConditionStatus.OPERATIONAL &&
        record.conditionResult === SanitaryConditionResult.APT
      ) {
        c2Sum += 1;
      } else if (
        record.status === SanitaryConditionStatus.DEFICIENT ||
        record.conditionResult === SanitaryConditionResult.INCONCLUSIVE
      ) {
        c2Sum += 0.5;
      }
      // OUT_OF_SERVICE o NOT_APT → 0 (incumplimiento verificable)
    }
    const c2 = c2Sum / coveredCount;

    // ── C3 — Verificación y trazabilidad (25%): fecha + responsable + evidencia ──
    let c3Sum = 0;
    for (const record of latestByType.values()) {
      const hasDate = record.lastVerificationDate !== undefined && record.lastVerificationDate !== null;
      const hasResponsible = (record.responsible ?? '').trim().length > 0;
      const hasEvidence = (record.evidenceUrl ?? '').trim().length > 0;
      if (hasDate && hasResponsible && hasEvidence) {
        c3Sum += 1;
      }
    }
    const c3 = c3Sum / coveredCount;

    // ── C4 — Continuidad/vigencia (25%): verificación dentro de la frecuencia ──
    const now = Date.now();
    let c4Sum = 0;
    let overdueCount = 0;
    for (const record of latestByType.values()) {
      const days = VERIFICATION_FREQUENCY_DAYS[record.verificationFrequency];
      const last = new Date(record.lastVerificationDate).getTime();
      const expiry = last + days * 24 * 60 * 60 * 1000;
      const withinFrequency = now <= expiry;
      // nextVerificationDate vencida penaliza el componente aunque la
      // frecuencia aún no lo expirara (compromiso programado incumplido).
      const nextOverdue =
        record.nextVerificationDate !== undefined &&
        record.nextVerificationDate !== null &&
        new Date(record.nextVerificationDate).getTime() < now;
      if (withinFrequency && !nextOverdue) {
        c4Sum += 1;
      } else {
        // Fuera de frecuencia o con próximo vencido: penaliza C4 y se reporta.
        overdueCount += 1;
      }
    }
    const c4 = c4Sum / coveredCount;

    const percentage = Math.round(c1 * 25 + c2 * 25 + c3 * 25 + c4 * 25);

    // ── Estado (mapeo de los cuatro estados de la fase sobre el contrato existente) ──
    // NO_DATA       → sin evidencia (rama anterior).
    // NON_COMPLIANT → evidencia verificable de incumplimiento (NOT_APT/OUT_OF_SERVICE);
    //                 tiene precedencia: un componente fuera de servicio NO es "meta cumplida".
    // TARGET_MET    → cumplimiento ≥ objetivo (90), convención de providers.
    // PARTIAL       → evidencia con brechas de cobertura/trazabilidad/vigencia.
    const hasDeficientEvidence = coveredTypes.some((t) => {
      const record = latestByType.get(t);
      return (
        record &&
        (record.conditionResult === SanitaryConditionResult.NOT_APT ||
          record.status === SanitaryConditionStatus.OUT_OF_SERVICE)
      );
    });
    const status = hasDeficientEvidence
      ? 'NON_COMPLIANT'
      : percentage >= WorkplaceSanitaryConditionsProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'PARTIAL';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    const missingTypes = WorkplaceSanitaryConditionsProvider.REQUIRED_TYPES.filter(
      (t) => !latestByType.has(t),
    );
    if (missingTypes.length > 0) {
      findings.push({
        id: 'workplace-sanitary-missing-types',
        module: 'workplace-sanitary-conditions',
        title: `Componente(s) sin cobertura: ${missingTypes.join(', ')}`,
        description:
          'El estándar 3.1.8 exige evidencia de agua potable, servicios sanitarios y manejo de basuras. Registrar y verificar cada componente faltante.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const deficientTypes = coveredTypes.filter((t) => {
      const record = latestByType.get(t);
      return (
        record &&
        (record.status === SanitaryConditionStatus.DEFICIENT ||
          record.status === SanitaryConditionStatus.OUT_OF_SERVICE ||
          record.conditionResult === SanitaryConditionResult.NOT_APT)
      );
    });
    if (deficientTypes.length > 0) {
      findings.push({
        id: 'workplace-sanitary-deficient-conditions',
        module: 'workplace-sanitary-conditions',
        title: `Condición deficiente o fuera de servicio: ${deficientTypes.join(', ')}`,
        description:
          'Un registro DEFICIENT/OUT_OF_SERVICE evidencia que la condición fue verificada, pero NO constituye condición adecuada. Corregir la condición y actualizar el registro.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const withoutFullTraceability = coveredTypes.filter((t) => {
      const record = latestByType.get(t);
      return !(
        record &&
        record.lastVerificationDate &&
        (record.responsible ?? '').trim().length > 0 &&
        (record.evidenceUrl ?? '').trim().length > 0
      );
    });
    if (withoutFullTraceability.length > 0) {
      findings.push({
        id: 'workplace-sanitary-traceability-pending',
        module: 'workplace-sanitary-conditions',
        title: `Verificación sin trazabilidad completa: ${withoutFullTraceability.join(', ')}`,
        description:
          'Cada componente debe tener fecha de verificación, responsable y evidencia asociada. Un documento genérico no sustituye la verificación registrada.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (overdueCount > 0) {
      findings.push({
        id: 'workplace-sanitary-verification-overdue',
        module: 'workplace-sanitary-conditions',
        title: `${overdueCount} componente(s) con verificación vencida`,
        description:
          'La vigencia de la verificación depende de la frecuencia declarada. Re-verificar los componentes vencidos; no se acepta vigencia indefinida.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const completed = coveredTypes.filter((t) => {
      const record = latestByType.get(t);
      return (
        record &&
        record.status === SanitaryConditionStatus.OPERATIONAL &&
        record.conditionResult === SanitaryConditionResult.APT
      );
    }).length;

    return {
      module: 'workplace-sanitary-conditions',
      percentage,
      status,
      findings,
      pending: coveredTypes.length - completed,
      completed,
      overdue: overdueCount,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  /** Resultado NO_DATA con finding estructurado (código, no solo texto). */
  private noData(findingId: string, title: string): ProviderComplianceResult {
    return {
      module: 'workplace-sanitary-conditions',
      percentage: 0,
      status: 'NO_DATA',
      findings: [
        {
          id: findingId,
          module: 'workplace-sanitary-conditions',
          title,
          description:
            'No fue posible evaluar el estándar 3.1.8. Verifique los datos de la empresa.',
          priority: FindingPriority.CRITICAL,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
      pending: 0,
      completed: 0,
      overdue: 0,
      phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
