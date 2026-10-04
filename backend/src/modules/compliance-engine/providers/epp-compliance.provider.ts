import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EppDelivery, EppDeliveryDocument } from '../../epp/schemas/epp-delivery.schema';
import { EppApplicability, EppApplicabilityDocument } from '../../epp/schemas/epp-applicability.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { JobProfile, JobProfileDocument } from '../../job-profile/schemas/job-profile.schema';
import { SstEpp, SstEppDocument } from '../../phva-advanced/schemas/phva-advanced-epp.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { EPP_SCORE_WEIGHTS, computeEppScore } from './epp-scoring';

/**
 * Evaluación automática del estándar 4.2.6 — "EPP" (Elementos de Protección
 * Personal). Semántica EXACT con fórmula V2 por dimensiones:
 *
 *   PROGRAMA           25 — jobProfiles con matriz válida / jobProfiles activos con trabajadores
 *   COBERTURA          30 — requisitos EPP cubiertos / requisitos EPP aplicables (M2, principal)
 *   VIGENCIA_CONDICION 25 — Σ valor(entrega) / entregas ACTIVE de requisitos aplicables
 *   TRAZABILIDAD       20 — entregas trazables / entregas de requisitos aplicables
 *
 * FUENTES (frontera anti-double-scoring, regla V2):
 *  - SstEpp           → catálogo EPP (identidad lógica eppId).
 *  - JobProfile       → perfiles de cargo (solo lectura; schema intacto).
 *  - Employee         → trabajadores activos y su jobProfileId (identidad _id).
 *  - EppApplicability → ÚNICA fuente de REQUISITOS (qué EPP requiere cada
 *                       JobProfile). requiredFor NO se consulta.
 *  - EppDelivery      → ÚNICA fuente de entregas reales (evidencia del
 *                       cumplimiento). complianceStatus NO se consulta.
 *
 * NO consume: InspectionActivity (4.2.4), Maintenance (4.2.5),
 * Risk.controls / ControlVerification (4.2.2), training-management ni
 * SstEpp.assignments[] (fuente legacy sin scoring).
 *
 * PERFORMANCE: 5 consultas tenant-scoped por companyId (server-side), todas en
 * un Promise.all; después Maps/Sets en memoria. NINGUNA consulta dentro de
 * loops (sin N+1, independiente del número de trabajadores).
 */
@Injectable()
export class EppComplianceProvider implements ComplianceProvider {
  private static readonly MODULE = 'epp-compliance';
  private static readonly COMPLIANCE_TARGET = 90;
  /** Umbral determinista: cobertura M2 < 60% → HIGH; ≥ 60% → MEDIUM. */
  private static readonly LOW_COVERAGE_HIGH_THRESHOLD = 0.6;
  /** Umbral determinista: condición severa > 20% de las ACTIVE aplicables → HIGH. */
  private static readonly BAD_CONDITION_HIGH_THRESHOLD = 0.2;

  constructor(
    @InjectModel(SstEpp.name)
    private readonly eppModel: Model<SstEppDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(JobProfile.name)
    private readonly jobProfileModel: Model<JobProfileDocument>,
    @InjectModel(EppApplicability.name)
    private readonly applicabilityModel: Model<EppApplicabilityDocument>,
    @InjectModel(EppDelivery.name)
    private readonly deliveryModel: Model<EppDeliveryDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // ── PERFORMANCE: 5 consultas bulk tenant-scoped + cálculo en memoria ──
    const [eppRecords, jobProfiles, workers, applicabilities, deliveries] = await Promise.all([
      this.eppModel.find({ companyId: companyObjectId }).exec(),
      this.jobProfileModel.find({ companyId: companyObjectId }).exec(),
      this.employeeModel.find({ companyId: companyObjectId }).exec(),
      this.applicabilityModel.find({ companyId: companyObjectId }).exec(),
      this.deliveryModel.find({ companyId: companyObjectId }).exec(),
    ]);

    const now = new Date();
    const breakdown = computeEppScore(
      { eppRecord: eppRecords[0] ?? null, jobProfiles, workers, applicabilities, deliveries },
      now,
    );
    const percentage = breakdown.score;

    const findings: ProviderComplianceResult['findings'] = [];
    const openFinding = (
      id: string,
      title: string,
      description: string,
      priority: FindingPriority,
    ): void => {
      findings.push({
        id,
        module: EppComplianceProvider.MODULE,
        title,
        description,
        priority,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: now.toISOString(),
      });
    };

    // ── NO_DATA: sin ninguna fuente evaluable de 4.2.6 ──
    // No se convierte en NO_DATA una empresa CON trabajadores activos pero sin
    // matriz: sabemos que deberían existir requisitos → TARGET_NOT_MET con
    // epp-jobprofile-without-matrix (regla explícita V2).
    const isNoData =
      !breakdown.hasCatalog &&
      !breakdown.hasApplicableRequirements &&
      !breakdown.hasEvaluableDeliveries &&
      breakdown.counters.jobProfilesWithWorkers === 0;

    if (isNoData) {
      const noDataFindings: ProviderComplianceResult['findings'] = [{
        id: 'epp-no-data',
        module: EppComplianceProvider.MODULE,
        title: 'Sin registros de EPP',
        description: 'No existe matriz de EPP ni entregas registradas. El estándar 4.2.6 requiere una matriz de EPP por cargo o tarea con entrega documentada.',
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: now.toISOString(),
      }];
      // Los hallazgos de integridad de trabajadores NO se pierden en NO_DATA.
      if (breakdown.workersWithoutJobProfile) {
        noDataFindings.push({
          id: 'epp-worker-without-job-profile',
          module: EppComplianceProvider.MODULE,
          title: `${breakdown.counters.workersWithoutJobProfile} trabajador(es) activo(s) sin perfil de cargo`,
          description: 'Trabajadores activos sin jobProfileId asignado: no pueden generar requisitos EPP. Asigne el perfil de cargo para incluirlos en la matriz.',
          priority: FindingPriority.MEDIUM,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: now.toISOString(),
        });
      }
      if (breakdown.workersWithInactiveJobProfile) {
        noDataFindings.push({
          id: 'epp-worker-inactive-job-profile',
          module: EppComplianceProvider.MODULE,
          title: `${breakdown.counters.workersWithInactiveJobProfile} trabajador(es) activo(s) con cargo inactivo`,
          description: 'Trabajadores activos cuyo jobProfileId apunta a un JobProfile inactivo o inexistente: no generan requisitos EPP.',
          priority: FindingPriority.MEDIUM,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: now.toISOString(),
        });
      }
      return {
        module: EppComplianceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: noDataFindings,
        pending: 0, completed: 0, overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: this.metadata(breakdown, { noData: true }),
      };
    }

    // ── PROGRAMA: sin requisitos EPP válidos (no hay matriz utilizable) ──
    if (!breakdown.hasApplicableRequirements) {
      openFinding(
        'epp-no-program',
        'Sin programa de EPP definido',
        breakdown.hasCatalog
          ? 'El catálogo EPP existe pero ningún requisito válido está definido en la matriz de aplicabilidad (EppApplicability) para los cargos con trabajadores.'
          : 'No existe catálogo de EPP registrado y ningún cargo con trabajadores tiene requisitos definidos. Defina la matriz de EPP por cargo.',
        FindingPriority.HIGH,
      );
    }

    // ── PROGRAMA: JobProfiles activos con trabajadores sin matriz requerida ──
    // Coincide exactamente con los JobProfiles que no entraron al numerador.
    if (breakdown.jobProfilesWithoutMatrix) {
      openFinding(
        'epp-jobprofile-without-matrix',
        `${breakdown.counters.jobProfilesWithoutMatrix} cargo(s) activo(s) sin matriz de EPP`,
        'Existen cargos activos con trabajadores que no tienen ningún requisito EPP definido en la matriz de aplicabilidad (EppApplicability). Defina qué EPP requiere cada cargo.',
        FindingPriority.HIGH,
      );
    }

    // ── Integridad: trabajadores activos sin jobProfileId ──
    if (breakdown.workersWithoutJobProfile) {
      openFinding(
        'epp-worker-without-job-profile',
        `${breakdown.counters.workersWithoutJobProfile} trabajador(es) activo(s) sin perfil de cargo`,
        'Trabajadores activos sin jobProfileId asignado: no pueden generar requisitos EPP ni evaluarse en cobertura. Asigne el perfil de cargo para incluirlos en la matriz.',
        FindingPriority.MEDIUM,
      );
    }

    // ── Integridad: trabajadores activos con JobProfile inactivo ──
    if (breakdown.workersWithInactiveJobProfile) {
      openFinding(
        'epp-worker-inactive-job-profile',
        `${breakdown.counters.workersWithInactiveJobProfile} trabajador(es) activo(s) con cargo inactivo`,
        'Trabajadores activos cuyo jobProfileId apunta a un JobProfile inactivo o inexistente: no generan requisitos EPP. Reactive el cargo o actualice la asignación del trabajador.',
        FindingPriority.MEDIUM,
      );
    }

    // ── Integridad: matriz que referencia EPP inactivo/inexistente ──
    if (breakdown.inactiveItemReferences) {
      openFinding(
        'epp-inactive-item-reference',
        `${breakdown.counters.inactiveItemReferences} relación(es) de matriz con EPP inactivo o inexistente`,
        'La matriz de aplicabilidad declara requisitos activos sobre elementos que ya no existen o están inactivos en el catálogo EPP. Es un problema de integridad: reactive el elemento o corrija la matriz.',
        FindingPriority.HIGH,
      );
    }

    // ── Cobertura M2 insuficiente (regla determinista: < 60% → HIGH) ──
    const coverageRatio = breakdown.dimensions.coverage.ratio;
    if (coverageRatio !== null && coverageRatio < 1) {
      const uncovered = breakdown.counters.applicableRequirements - breakdown.counters.coveredRequirements;
      openFinding(
        'epp-low-coverage',
        `${uncovered} requisito(s) EPP sin cobertura`,
        `${breakdown.details.coverage.coveredRequirements} de ${breakdown.details.coverage.applicableRequirements} requisitos EPP aplicables (trabajador × EPP de su matriz de cargo) tienen una entrega ACTIVE vigente en condición GOOD o FAIR. M1 complementaria: ${breakdown.details.coverage.fullyCoveredWorkers}/${breakdown.details.coverage.workersWithRequirements} trabajadores completamente cubiertos.`,
        coverageRatio < EppComplianceProvider.LOW_COVERAGE_HIGH_THRESHOLD
          ? FindingPriority.HIGH
          : FindingPriority.MEDIUM,
      );
    }

    // ── Entregas ACTIVE vencidas de requisitos aplicables (dinámico) ──
    if (breakdown.counters.overdue > 0) {
      openFinding(
        'epp-overdue',
        `${breakdown.counters.overdue} entrega(s) de EPP con reposición vencida`,
        'Entregas activas de requisitos EPP aplicables cuyo expectedReplacementDate ya pasó sin reposición registrada. La vigencia se calcula dinámicamente; reemplace o registre el cierre del ciclo.',
        FindingPriority.HIGH,
      );
    }

    // ── Condición deficiente (FAIR/POOR/DAMAGED) ──
    const deficient = breakdown.counters.deficientCondition;
    if (deficient > 0) {
      openFinding(
        'epp-condition',
        `${deficient} entrega(s) con condición deficiente`,
        'Entregas activas de requisitos aplicables en condición FAIR, POOR o DAMAGED. FAIR puntúa la mitad de la vigencia (y SÍ cubre el requisito); POOR y DAMAGED no acreditan condición adecuada. Reemplace o gestione el elemento.',
        breakdown.counters.severeCondition / Math.max(breakdown.counters.activeDeliveries, 1) >
          EppComplianceProvider.BAD_CONDITION_HIGH_THRESHOLD
          ? FindingPriority.HIGH
          : FindingPriority.MEDIUM,
      );
    }

    // ── Evidencia insuficiente (solo evidencia PROPIA de la entrega) ──
    const withoutEvidence =
      (breakdown.details.traceability.denominator) - breakdown.counters.withEvidence;
    if (withoutEvidence > 0) {
      openFinding(
        'epp-missing-evidence',
        `${withoutEvidence} entrega(s) sin evidencia propia`,
        'Entregas de requisitos aplicables sin evidenceUrl ni certificateUrl. La evidencia debe pertenecer al evento de entrega; la evidencia histórica del documento de matriz no acredita entregas nuevas.',
        FindingPriority.MEDIUM,
      );
    }

    // ── Entregas fuera de matriz (señal de revisión, NO penalización) ──
    if (breakdown.deliveriesOutsideApplicability) {
      openFinding(
        'epp-delivery-outside-matrix',
        `${breakdown.counters.deliveriesOutsideApplicability} entrega(s) fuera de la matriz de aplicabilidad`,
        'Existen entregas registradas de EPP que el cargo del trabajador no requiere actualmente en la matriz. Pueden ser entregas preventivas, cambios temporales o requisitos no actualizados: son señal de revisión y NO se penalizan en el score.',
        FindingPriority.LOW,
      );
    }

    // ── pending/completed/overdue con semántica V2 ──
    // completed = requisitos EPP cubiertos (preferencia documentada V2);
    //             activeValidDeliveries se conserva en metadata (dato operacional).
    // pending   = requisitos sin cobertura + entregas ACTIVE que requieren
    //             acción (vencidas o condición ≠ GOOD), SIN doble conteo: una
    //             entrega FAIR vigente que acredita cobertura no se cuenta dos
    //             veces (ver activeRequiringAction en epp-scoring.ts).
    // overdue   = entregas ACTIVE de requisitos aplicables con
    //             expectedReplacementDate < now (dinámico; nunca se persiste
    //             EXPIRED).
    const completed = breakdown.counters.coveredRequirements;
    const pending =
      breakdown.counters.applicableRequirements -
      breakdown.counters.coveredRequirements +
      breakdown.counters.activeRequiringAction;

    return {
      module: EppComplianceProvider.MODULE,
      percentage,
      status: percentage >= EppComplianceProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending,
      completed,
      overdue: breakdown.counters.overdue,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.metadata(breakdown),
    };
  }

  /** Metadata V2 serializable (sin documentos Mongo completos). */
  private metadata(
    breakdown: ReturnType<typeof computeEppScore>,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      semantic: 'EXACT',
      standardCode: '4.2.6',
      phase: 'do',
      formula: 'dimensions:v2',
      weights: { ...EPP_SCORE_WEIGHTS },
      dimensions: {
        program: { ...breakdown.details.program },
        coverage: { ...breakdown.details.coverage },
        validityCondition: { ...breakdown.details.validityCondition },
        traceability: { ...breakdown.details.traceability },
      },
      counters: { ...breakdown.counters },
      ...extra,
    };
  }
}
