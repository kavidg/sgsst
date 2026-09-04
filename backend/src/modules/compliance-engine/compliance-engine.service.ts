import { Injectable } from '@nestjs/common';
import { ComplianceOverviewDto } from './dto/compliance-overview.dto';
import { CompliancePhaseDto } from './dto/compliance-phase.dto';
import { FindingDto } from './dto/finding.dto';
import { ModuleComplianceDto } from './dto/module-compliance.dto';
import { PredictionDto } from './dto/prediction.dto';
import { IntelligentFinding } from './interfaces/intelligent-finding.interface';
import { ComplianceProvider, ProviderComplianceResult } from './providers/compliance-provider.interface';
import { CompliancePhaseKey } from './interfaces/compliance-engine.interface';
import { AlertsProvider } from './providers/alerts.provider';
import { AnnualWorkPlanProvider } from './providers/annual-work-plan.provider';
import { ConvivenciaProvider } from './providers/convivencia.provider';
import { SstObjectivesProvider } from './providers/sst-objectives.provider';
import { EmergenciesProvider } from './providers/emergencies.provider';
import { IndicatorsProvider } from './providers/indicators.provider';
import { ProgramsProvider } from './providers/programs.provider';
import { DocumentEvaluationProvider } from './providers/document-evaluation.provider';
import { AcquisitionProvider } from './providers/acquisition.provider';
import { ContractingProvider } from './providers/contracting.provider';
import { ChangeManagementProvider } from './providers/change-management.provider';
import { SociodemographicProvider } from './providers/sociodemographic.provider';
import { OccupationalExamProvider } from './providers/occupational-exam.provider';
import { MedicalRecommendationProvider } from './providers/medical-recommendation.provider';
import { OccupationalEvaluationProvider } from './providers/occupational-evaluation.provider';
import { AbsenteeismProvider } from './providers/absenteeism.provider';
import { DiseaseInvestigationProvider } from './providers/disease-investigation.provider';
import { EpidemiologicalSurveillanceProvider } from './providers/epidemiological-surveillance.provider';
import { CaseInterventionProvider } from './providers/case-intervention.provider';
import { RiskMethodologyProvider } from './providers/risk-methodology.provider';
import { WorkerParticipationProvider } from './providers/worker-participation.provider';
import { EnvironmentalMeasurementProvider } from './providers/environmental-measurement.provider';
import { ControlImplementationProvider } from './providers/control-implementation.provider';
import { ControlVerificationProvider } from './providers/control-verification.provider';
import { ProceduresProvider } from './providers/procedures.provider';
import { InspectionComplianceProvider } from './providers/inspection-compliance.provider';
import { MaintenanceProvider } from './providers/maintenance.provider';
import { EppComplianceProvider } from './providers/epp-compliance.provider';
import { ControlVerificationStandardProvider } from './providers/control-verification-standard.provider';
import { EmergencyManagementProvider } from './providers/emergency-management.provider';
import { ProceduresDocProvider } from './providers/procedures-doc.provider';
import { RecordsDocProvider } from './providers/records-doc.provider';
import { ManagementMeasurementProvider } from './providers/management-measurement.provider';
import { ManagementReviewProvider } from './providers/management-review.provider';
import { InternalAuditProvider } from './providers/internal-audit.provider';
import { FindingsReviewProvider } from './providers/findings-review.provider';
import { CorrectivePreventiveProvider } from './providers/corrective-preventive.provider';
import { ManagementImprovementProvider } from './providers/management-improvement.provider';
import { IncidentActionsProvider } from './providers/incident-actions.provider';
import { ImprovementPlanProvider } from './providers/improvement-plan.provider';
import { InductionReinductionProvider } from './providers/induction-reinduction.provider';
import { HealthIndicatorsProvider } from './providers/health-indicators.provider';
import { HazardousSubstanceProvider } from './providers/hazardous-substance.provider';
import { CopasstTrainingProvider } from './providers/copasst-training.provider';
import { DashboardProvider } from './providers/dashboard.provider';
import { DocumentsProvider } from './providers/documents.provider';
import { EvaluationsProvider } from './providers/evaluations.provider';
import { IncidentsProvider } from './providers/incidents.provider';
import { InitialEvaluationProvider } from './providers/initial-evaluation.provider';
import { InspectionsProvider } from './providers/inspections.provider';
import { LegalMatrixProvider } from './providers/legal-matrix.provider';
import { RisksProvider } from './providers/risks.provider';
import { TrainingsProvider } from './providers/trainings.provider';
import { calculateWeightedCompliance } from './utils/compliance-calculator';
import { classifyComplianceLevel, roundComplianceScore } from './utils/compliance-score';
import { getPhaseWeights, PHASE_DEPENDENCIES } from './utils/compliance-weights';
import { buildExecutiveSummary } from './utils/executive-summary';
import { generateIntelligentFindings } from './utils/intelligent-findings.engine';
import { generateRecommendations } from './utils/recommendation-engine';

/**
 * Servicio del Compliance Intelligence Engine.
 *
 * Agregador central del SG-SST: consulta todos los providers en paralelo
 * (Promise.all) y construye un único ComplianceOverviewDto con datos reales.
 * No contiene datos MOCK.
 */
@Injectable()
export class ComplianceEngineService {
  private readonly providers: ComplianceProvider[];

  constructor(
    private readonly evaluationsProvider: EvaluationsProvider,
    private readonly annualWorkPlanProvider: AnnualWorkPlanProvider,
    private readonly incidentsProvider: IncidentsProvider,
    private readonly risksProvider: RisksProvider,
    private readonly trainingsProvider: TrainingsProvider,
    private readonly inspectionsProvider: InspectionsProvider,
    private readonly documentsProvider: DocumentsProvider,
    private readonly legalMatrixProvider: LegalMatrixProvider,
    private readonly alertsProvider: AlertsProvider,
    private readonly dashboardProvider: DashboardProvider,
    private readonly initialEvaluationProvider: InitialEvaluationProvider,
    private readonly copasstTrainingProvider: CopasstTrainingProvider,
    private readonly convivenciaProvider: ConvivenciaProvider,
    // FASE 1: provider de cumplimiento 2.2.1 — Objetivos SST.
    private readonly sstObjectivesProvider: SstObjectivesProvider,
    // FASE 1: provider de cumplimiento 1.1.10 — Emergencias.
    private readonly emergenciesProvider: EmergenciesProvider,
    // Indicadores SG-SST — desempeño medido (6.1.1).
    private readonly indicatorsProvider: IndicatorsProvider,
    // Programas SG-SST — dominio operativo (HACER).
    private readonly programsProvider: ProgramsProvider,
    // Evaluación automática 2.5.1 — Conservación documental.
    private readonly documentEvaluationProvider: DocumentEvaluationProvider,
    private readonly acquisitionProvider: AcquisitionProvider,
    private readonly contractingProvider: ContractingProvider,
    // Evaluación automática 2.11.1 — Gestión del cambio.
    private readonly changeManagementProvider: ChangeManagementProvider,
    // Evaluación automática 3.1.1 — Perfil sociodemográfico.
    private readonly sociodemographicProvider: SociodemographicProvider,
    // Evaluación automática 3.1.2 — Exámenes médicos ocupacionales.
    private readonly occupationalExamProvider: OccupationalExamProvider,
    // Evaluación automática 3.1.3 — Seguimiento a recomendaciones médicas.
    private readonly medicalRecommendationProvider: MedicalRecommendationProvider,
    // Evaluación automática 3.1.4 — Realización de Evaluaciones Médicas Ocupacionales.
    private readonly occupationalEvaluationProvider: OccupationalEvaluationProvider,
    // Evaluación automática 3.2.1 — Registro de ausentismo.
    private readonly absenteeismProvider: AbsenteeismProvider,
    // Evaluación automática 3.2.2 — Investigación de enfermedades laborales.
    private readonly diseaseInvestigationProvider: DiseaseInvestigationProvider,
    // Evaluación automática 3.3.1 — Programas de vigilancia epidemiológica.
    private readonly epidemiologicalSurveillanceProvider: EpidemiologicalSurveillanceProvider,
    // Evaluación automática 3.3.3 — Intervención y seguimiento de casos.
    private readonly caseInterventionProvider: CaseInterventionProvider,
    // Evaluación automática 4.1.1 — Metodología identificación de peligros.
    private readonly riskMethodologyProvider: RiskMethodologyProvider,
    // Evaluación automática 4.1.2 — Participación de trabajadores.
    private readonly workerParticipationProvider: WorkerParticipationProvider,
    // Evaluación automática 4.1.3 — Sustancias peligrosas.
    private readonly hazardousSubstanceProvider: HazardousSubstanceProvider,
    // Evaluación automática 4.1.4 — Mediciones ambientales.
    private readonly environmentalMeasurementProvider: EnvironmentalMeasurementProvider,
    // Evaluación automática 4.2.1 — Implementación de medidas de control.
    private readonly controlImplementationProvider: ControlImplementationProvider,
    // Evaluación automática 4.2.2 — Verificación de medidas de control.
    private readonly controlVerificationProvider: ControlVerificationProvider,
    // Evaluación automática 4.2.3 — Procedimientos e instructivos.
    private readonly proceduresProvider: ProceduresProvider,
    // Evaluación automática 4.2.4 — Inspecciones.
    private readonly inspectionComplianceProvider: InspectionComplianceProvider,
    // Evaluación automática 4.2.5 — Mantenimiento.
    private readonly maintenanceProvider: MaintenanceProvider,
    // Evaluación automática 4.2.6 — EPP.
    private readonly eppComplianceProvider: EppComplianceProvider,
    // Evaluación automática 4.3.1 — Verificación de controles.
    private readonly controlVerificationStandardProvider: ControlVerificationStandardProvider,
    // Evaluación automática 4.4.1 — Gestión de emergencias.
    private readonly emergencyManagementProvider: EmergencyManagementProvider,
    // Evaluación automática 5.1.1 — Procedimientos SG-SST.
    private readonly proceduresDocProvider: ProceduresDocProvider,
    // Evaluación automática 5.1.2 — Registros SG-SST.
    private readonly recordsDocProvider: RecordsDocProvider,
    // Evaluación automática 6.1.1 — Medición de la gestión SST.
    private readonly managementMeasurementProvider: ManagementMeasurementProvider,
    // Evaluación automática 6.1.2 — Revisión por la dirección.
    private readonly managementReviewProvider: ManagementReviewProvider,
    // Evaluación automática 6.1.3 — Auditoría interna SG-SST.
    private readonly internalAuditProvider: InternalAuditProvider,
    // Evaluación automática 6.1.4 — Revisión de hallazgos.
    private readonly findingsReviewProvider: FindingsReviewProvider,
    // Evaluación automática 7.1.1 — Acciones preventivas y correctivas.
    private readonly correctivePreventiveProvider: CorrectivePreventiveProvider,
    // Evaluación automática 7.1.2 — Acciones mejora alta dirección.
    private readonly managementImprovementProvider: ManagementImprovementProvider,
    // Evaluación automática 7.1.3 — Acciones por accidentes.
    private readonly incidentActionsProvider: IncidentActionsProvider,
    // Evaluación automática 7.1.4 — Plan de mejoramiento.
    private readonly improvementPlanProvider: ImprovementPlanProvider,
    // Evaluación automática 1.2.2 — Inducción y Reinducción SG-SST.
    private readonly inductionReinductionProvider: InductionReinductionProvider,
    // FASE 25: 3.3.2 — Medición y análisis de indicadores de salud (HACER).
    private readonly healthIndicatorsProvider: HealthIndicatorsProvider,
  ) {
    this.providers = [
      this.evaluationsProvider,
      this.annualWorkPlanProvider,
      this.incidentsProvider,
      this.risksProvider,
      this.trainingsProvider,
      this.inspectionsProvider,
      this.documentsProvider,
      this.legalMatrixProvider,
      this.alertsProvider,
      this.dashboardProvider,
      this.initialEvaluationProvider,
      this.copasstTrainingProvider,
      // FASE 3: 1.1.8 — Comité de Convivencia (consume el dominio como fuente
      // única de verdad; ver ConvivenciaProvider).
      this.convivenciaProvider,
      // FASE 1: 2.2.1 — Objetivos SST (PHVA Advanced).
      this.sstObjectivesProvider,
      // FASE 1: 1.1.10 — Emergencias (PHVA Advanced).
      this.emergenciesProvider,
      // Indicadores SG-SST — desempeño medido (6.1.1).
      this.indicatorsProvider,
      // Programas SG-SST — dominio operativo (HACER).
      this.programsProvider,
      // Evaluación automática 2.5.1 — Conservación documental.
      this.documentEvaluationProvider,
      // Evaluación automática 2.9.1 — Adquisiciones.
      this.acquisitionProvider,
      // Evaluación automática 2.10.1 — Contratación.
      this.contractingProvider,
      // Evaluación automática 2.11.1 — Gestión del cambio.
      this.changeManagementProvider,
      // Evaluación automática 3.1.1 — Perfil sociodemográfico.
      this.sociodemographicProvider,
      // Evaluación automática 3.1.2 — Exámenes médicos ocupacionales.
      this.occupationalExamProvider,
      // Evaluación automática 3.1.3 — Seguimiento a recomendaciones médicas.
      this.medicalRecommendationProvider,
      // Evaluación automática 3.1.4 — Realización de Evaluaciones Médicas Ocupacionales.
      this.occupationalEvaluationProvider,
      // Evaluación automática 3.2.1 — Registro de ausentismo.
      this.absenteeismProvider,
      // Evaluación automática 3.2.2 — Investigación de enfermedades laborales.
      this.diseaseInvestigationProvider,
      // Evaluación automática 3.3.1 — Programas de vigilancia epidemiológica.
      this.epidemiologicalSurveillanceProvider,
      // Evaluación automática 3.3.3 — Intervención y seguimiento de casos.
      this.caseInterventionProvider,
      // Evaluación automática 4.1.1 — Metodología identificación de peligros.
      this.riskMethodologyProvider,
      // Evaluación automática 4.1.2 — Participación de trabajadores.
      this.workerParticipationProvider,
      // Evaluación automática 4.1.3 — Sustancias peligrosas.
      this.hazardousSubstanceProvider,
      // Evaluación automática 4.1.4 — Mediciones ambientales.
      this.environmentalMeasurementProvider,
      // Evaluación automática 4.2.x — Medidas de prevención y control.
      this.controlImplementationProvider,
      this.controlVerificationProvider,
      this.proceduresProvider,
      this.inspectionComplianceProvider,
      this.maintenanceProvider,
      this.eppComplianceProvider,
      // FASE 16.2: 4.3.1 — Verificación de controles (VERIFICAR).
      this.controlVerificationStandardProvider,
      // FASE 16.2: 4.4.1 — Gestión de emergencias (HACER).
      this.emergencyManagementProvider,
      // FASE 17: 5.1.1 — Procedimientos SG-SST (HACER).
      this.proceduresDocProvider,
      // FASE 17: 5.1.2 — Registros SG-SST (HACER).
      this.recordsDocProvider,
      // FASE 18: 6.1.x — Verificación SG-SST (VERIFICAR).
      this.managementMeasurementProvider,
      this.managementReviewProvider,
      this.internalAuditProvider,
      this.findingsReviewProvider,
      // FASE 20: 7.1.x — Verificación y mejora (ACTUAR).
      this.correctivePreventiveProvider,
      this.managementImprovementProvider,
      this.incidentActionsProvider,
      this.improvementPlanProvider,
      // FASE 24: 1.2.2 — Inducción y Reinducción SG-SST (PLANEAR).
      this.inductionReinductionProvider,
      // FASE 25: 3.3.2 — Medición y análisis de indicadores de salud (HACER).
      this.healthIndicatorsProvider,
    ];
  }

  /**
   * Devuelve el overview de cumplimiento SG-SST de una empresa.
   *
   * @param companyId - Identificador de la empresa.
   */
  async getOverview(companyId: string): Promise<ComplianceOverviewDto> {
    const results = await Promise.all(
      this.providers.map((provider) => provider.getCompliance(companyId)),
    );

    const phaseCompliance = this.resolvePhaseCompliance(results);
    const overallCompliance = roundComplianceScore(
      calculateWeightedCompliance(phaseCompliance, getPhaseWeights()),
    );

    const findings = results.flatMap((result) => result.findings);
    const alerts = results.flatMap((result) => result.alerts ?? []);

    const overview: ComplianceOverviewDto = {
      overallCompliance,
      phaseCompliance,
      moduleCompliance: results.map((result) => this.toModuleCompliance(result)),
      findings,
      recommendations: generateRecommendations(results),
      alerts,
      prediction: this.buildPrediction(),
      trend: null,
      executiveSummary: buildExecutiveSummary({
        overallCompliance,
        phaseCompliance,
        findings,
        results,
      }),
      lastUpdated: new Date().toISOString(),
    };

    // Fase 4 — Intelligent Findings Engine: enriquece el arreglo de hallazgos
    // con hallazgos inteligentes derivados por reglas del overview agregado.
    // No reemplaza los hallazgos existentes: solo agrega nuevos.
    const intelligentFindings = generateIntelligentFindings(overview);
    overview.findings = [
      ...overview.findings,
      ...intelligentFindings.map((finding) => this.toFindingDto(finding)),
    ];

    return overview;
  }

  /**
   * Resuelve el cumplimiento por fase PHVA agregando contribuciones de
   * múltiples providers con deduplicación por dependencias.
   *
   * Arquitectura multi-provider (PLANEAR-BLOQUE-4A):
   *   1. Cada provider puede contribuir con `phases.plan`, `phases.do`,
   *      `phases.check` y/o `phases.act`.
   *   2. Se recogen todas las contribuciones válidas (0-100, non-NaN).
   *   3. Se aplica deduplicación: si AnnualWorkPlan tiene una contribución
   *      válida de phases.plan, se ignoran SST Objectives e
   *      InitialEvaluation (AWP consolida esas fuentes).
   *   4. Se calcula el promedio simple de las fuentes independientes.
   *   5. EvaluationsProvider es una fuente legacy independiente: NUNCA se
   *      excluye.
   *
   * moduleCompliance[] NO se modifica: sigue mostrando cada provider
   * individualmente.
   */
  private resolvePhaseCompliance(results: ProviderComplianceResult[]): CompliancePhaseDto {
    const phaseKeys: CompliancePhaseKey[] = ['plan', 'do', 'check', 'act'];
    const resolved: Partial<Record<CompliancePhaseKey, number>> = {};

    for (const phaseKey of phaseKeys) {
      // 1. Collect all valid contributions for this phase
      const contributions = new Map<string, number>();
      for (const result of results) {
        const val = result.phases?.[phaseKey as CompliancePhaseKey];
        if (typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100) {
          contributions.set(result.module, val);
        }
      }

      // 2. Deduplication: apply dependency-based exclusion
      const activeModules = new Set(contributions.keys());
      for (const [module, deps] of Object.entries(PHASE_DEPENDENCIES)) {
        if (activeModules.has(module)) {
          for (const dep of deps) {
            activeModules.delete(dep);
          }
        }
      }

      // 3. Compute average of active, independent contributions
      const activeValues = [...contributions.entries()]
        .filter(([module]) => activeModules.has(module))
        .map(([, val]) => val);

      resolved[phaseKey as CompliancePhaseKey] = activeValues.length > 0
        ? Math.round(activeValues.reduce((s, v) => s + v, 0) / activeValues.length * 100) / 100
        : 0;
    }

    return {
      plan: resolved.plan ?? 0,
      do: resolved.do ?? 0,
      check: resolved.check ?? 0,
      act: resolved.act ?? 0,
    };
  }

  /**
   * Convierte un hallazgo inteligente a la forma FindingDto manteniendo la
   * compatibilidad del contrato JSON. Los campos enriquecidos (severity,
   * category, sourceModule, affectedPhase, recommendedAction, estimatedImpact,
   * createdAutomatically) se conservan como metadatos adicionales.
   */
  private toFindingDto(finding: IntelligentFinding): FindingDto {
    return {
      ...finding,
      module: finding.sourceModule,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    };
  }

  private toModuleCompliance(result: ProviderComplianceResult): ModuleComplianceDto {
    return {
      module: result.module,
      compliance: result.percentage,
      level: classifyComplianceLevel(result.percentage),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Predicción de cumplimiento.
   *
   * ESTADO ACTUAL: sin información histórica suficiente → null.
   * Cuando exista una serie temporal de cumplimiento se implementará
   * la proyección (sin IA por ahora).
   */
  private buildPrediction(): PredictionDto | null {
    return null;
  }
}
