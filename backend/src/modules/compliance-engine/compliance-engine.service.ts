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
import { JobProfileMedicalInformationProvider } from './providers/job-profile-medical-information.provider';
import { HealthPromotionProvider } from './providers/health-promotion.provider';
// FASE 32: provider 3.1.7 — Estilos de vida y entornos saludables (EXACT).
import { LifestyleHealthyEnvironmentProvider } from './providers/lifestyle-healthy-environment.provider';
// FASE 33: provider 3.1.6 — Restricciones y recomendaciones médico-laborales (EXACT).
import { WorkRestrictionProvider } from './providers/work-restriction.provider';
// FASE 34B: provider 3.1.8 — Agua potable, servicios sanitarios y disposición de basuras (EXACT).
import { WorkplaceSanitaryConditionsProvider } from './providers/workplace-sanitary-conditions.provider';
// FASE 34C: provider 3.1.9 — Eliminación adecuada de residuos sólidos, líquidos o gaseosos (EXACT).
import { WasteManagementProvider } from './providers/waste-management.provider';
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
// FASE 30F: provider EXACT para 3.1.5 — Custodia de historias clínicas ocupacionales.
import { OccupationalMedicalRecordCustodyProvider } from './providers/occupational-medical-record-custody.provider';
import { AccidentReportingProvider } from './providers/accident-reporting.provider';
import { AccidentFrequencyProvider } from './providers/accident-frequency.provider';
import { AccidentMortalityProvider } from './providers/accident-mortality.provider';
// SCOPE-1: 3.3.4/3.3.5/3.3.6 quedaron FUERA DEL ALCANCE aprobado por los
// socios. Los providers DiseasePrevalenceProvider, DiseaseIncidenceProvider y
// MedicalAbsenteeismProvider (fases 35C-2/35D-2/35E-2) se conservan en el
// repositorio pero NO participan del engine: no se inyectan ni se agregan a
// this.providers (sin scoring, sin findings, sin alerts).
import { AccidentStatisticsProvider } from './providers/accident-statistics.provider';
import { AccidentSeverityProvider } from './providers/accident-severity.provider';
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
import { getPhaseWeights, PHASE_DEPENDENCIES, filterScoringEligible } from './utils/compliance-weights';
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
    // Legacy: exámenes médicos ocupacionales (PARTIAL para 3.1.2 "Promoción y
    // prevención en salud" — FASE 30B-2/30C; excluido del scoring).
    private readonly occupationalExamProvider: OccupationalExamProvider,
    // medical-recommendation — 3.1.3 legacy "seguimiento a recomendaciones".
    // PARTIAL para 3.1.3 oficial ("Información al médico de perfiles de cargo",
    // FASE 30D-1 = PLANNED): queda excluido del scoring vía SCORING_INELIGIBLE_MODULES.
    private readonly medicalRecommendationProvider: MedicalRecommendationProvider,
    // FASE 30E: 3.1.2 — Promoción y prevención en salud (EXACT).
    // Reemplaza la semántica del módulo legacy occupational-exam (PARTIAL,
    // excluido del scoring vía SCORING_INELIGIBLE_MODULES).
    private readonly healthPromotionProvider: HealthPromotionProvider,
    // Evaluación automática 3.1.4 — Realización de Evaluaciones Médicas Ocupacionales.
    private readonly occupationalEvaluationProvider: OccupationalEvaluationProvider,
    // FASE 30D-2: 3.1.3 — Información al médico de perfiles de cargo (EXACT).
    private readonly jobProfileMedicalInformationProvider: JobProfileMedicalInformationProvider,
    // Evaluación automática 3.2.1 — Reporte de accidentes y enfermedades laborales.
    private readonly accidentReportingProvider: AccidentReportingProvider,
    // Evaluación automática 3.2.1 — Trazabilidad administrativa del registro
    // de ausentismo (el comentario legacy "3.3.6" era incorrecto: el provider
    // absenteísmo acredita 3.2.1; el provider EXACT de 3.3.6 es
    // MedicalAbsenteeismProvider desde FASE 35E-2).
    private readonly absenteeismProvider: AbsenteeismProvider,
    // Evaluación automática 3.2.2 — Investigación de enfermedades laborales.
    private readonly diseaseInvestigationProvider: DiseaseInvestigationProvider,
    // Evaluación automática 3.3.1 — Programas de vigilancia epidemiológica.
    private readonly epidemiologicalSurveillanceProvider: EpidemiologicalSurveillanceProvider,
    // Evaluación automática 3.3.3 — Mortalidad por accidentes de trabajo.
    private readonly accidentMortalityProvider: AccidentMortalityProvider,
    // Evaluación automática 3.3.1 — Frecuencia de accidentalidad.
    private readonly accidentFrequencyProvider: AccidentFrequencyProvider,
    // FASE 30C: 3.2.3 — Registro y análisis estadístico de accidentes.
    private readonly accidentStatisticsProvider: AccidentStatisticsProvider,
    // FASE 30C: 3.3.2 — Severidad de la accidentalidad.
    private readonly accidentSeverityProvider: AccidentSeverityProvider,
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
    // FASE 30F: 3.1.5 — Custodia de historias clínicas ocupacionales (EXACT).
    private readonly occupationalMedicalRecordCustodyProvider: OccupationalMedicalRecordCustodyProvider,
    // FASE 32: 3.1.7 — Estilos de vida y entornos saludables (EXACT).
    // Consume EXCLUSIVAMENTE evidencia complianceStandard=STANDARD_3_1_7
    // (frontera anti-double-scoring con HealthPromotionProvider/3.1.2).
    private readonly lifestyleHealthyEnvironmentProvider: LifestyleHealthyEnvironmentProvider,
    // FASE 33: 3.1.6 — Restricciones y recomendaciones médico-laborales (EXACT).
    private readonly workRestrictionProvider: WorkRestrictionProvider,
    // FASE 34B: 3.1.8 — Agua potable, servicios sanitarios y disposición de basuras (EXACT).
    // Consume EXCLUSIVAMENTE la colección propia WorkplaceSanitaryCondition.
    private readonly workplaceSanitaryConditionsProvider: WorkplaceSanitaryConditionsProvider,
    // FASE 34C: 3.1.9 — Eliminación adecuada de residuos sólidos, líquidos o gaseosos (EXACT).
    // Consume EXCLUSIVAMENTE las colecciones propias WasteManagementRecord + WasteTypeDeclaration.
    private readonly wasteManagementProvider: WasteManagementProvider,
    // SCOPE-1: DiseasePrevalenceProvider (3.3.4), DiseaseIncidenceProvider
    // (3.3.5) y MedicalAbsenteeismProvider (3.3.6) desregistrados — estándares
    // fuera del alcance aprobado. Código conservado como infraestructura futura.
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
      // Legacy PARTIAL (exámenes ≠ promoción/prevención): se conserva para
      // hallazgos/diagnósticos; filtrado del scoring (FASE 30B-2/30C/30E).
      this.occupationalExamProvider,
      // medical-recommendation — 3.1.3 legacy (recomendaciones ≠ información al médico).
      // Se conserva para hallazgos/diagnósticos; filtrado del scoring (FASE 30B-2/30D-1).
      this.medicalRecommendationProvider,
      // Evaluación automática 3.1.4 — Realización de Evaluaciones Médicas Ocupacionales.
      this.occupationalEvaluationProvider,
      // FASE 30D-2: 3.1.3 — Información al médico de perfiles de cargo (EXACT).
      this.jobProfileMedicalInformationProvider,
      // FASE 30E: 3.1.2 — Promoción y prevención en salud (EXACT).
      this.healthPromotionProvider,
      // FASE 30B-1: 3.2.1 — Reporte de accidentes y enfermedades laborales.
      this.accidentReportingProvider,
      // FASE 30B-1: 3.2.2 — Investigación de incidentes, accidentes y enfermedades.
      this.diseaseInvestigationProvider,
      // FASE 30B-1: 3.3.1 — Frecuencia de accidentalidad.
      this.accidentFrequencyProvider,
      // FASE 30B-1: 3.3.3 — Mortalidad por accidentes de trabajo.
      this.accidentMortalityProvider,
      // FASE 30C: 3.2.3 — Registro y análisis estadístico de accidentes.
      this.accidentStatisticsProvider,
      // FASE 30C: 3.3.2 — Severidad de la accidentalidad.
      this.accidentSeverityProvider,
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
      // FASE 30B-1: 3.2.1 — Trazabilidad del registro de ausentismo.
      this.absenteeismProvider,
      // FASE 30F: 3.1.5 — Custodia de historias clínicas ocupacionales (EXACT).
      this.occupationalMedicalRecordCustodyProvider,
      // FASE 32: 3.1.7 — Estilos de vida y entornos saludables (EXACT).
      this.lifestyleHealthyEnvironmentProvider,
      // FASE 33: 3.1.6 — Restricciones y recomendaciones médico-laborales (EXACT).
      this.workRestrictionProvider,
      // FASE 34B: 3.1.8 — Agua potable, servicios sanitarios y disposición de basuras (EXACT).
      this.workplaceSanitaryConditionsProvider,
      // FASE 34C: 3.1.9 — Eliminación adecuada de residuos sólidos, líquidos o gaseosos (EXACT).
      this.wasteManagementProvider,
      // SCOPE-1: los providers 3.3.4/3.3.5/3.3.6 ya no participan del pipeline.
    ];
  }

  /**
   * Devuelve el overview de cumplimiento SG-SST de una empresa.
   *
   * @param companyId - Identificador de la empresa.
   */
  async getOverview(companyId: string): Promise<ComplianceOverviewDto> {
    const allResults = await Promise.all(
      this.providers.map((provider) => provider.getCompliance(companyId)),
    );

    // FASE 30A: Filtering DUPLICATE / COMPLEMENTARY / PHANTOM modules
    // from phase scoring while preserving them in moduleCompliance for display.
    const scoringResults = filterScoringEligible(allResults);
    const phaseCompliance = this.resolvePhaseCompliance(scoringResults);
    const overallCompliance = roundComplianceScore(
      calculateWeightedCompliance(phaseCompliance, getPhaseWeights()),
    );

    const findings = allResults.flatMap((result) => result.findings);
    const alerts = allResults.flatMap((result) => result.alerts ?? []);

    const overview: ComplianceOverviewDto = {
      overallCompliance,
      phaseCompliance,
      moduleCompliance: allResults.map((result) => this.toModuleCompliance(result)),
      findings,
      recommendations: generateRecommendations(allResults),
      alerts,
      prediction: this.buildPrediction(),
      trend: null,
      executiveSummary: buildExecutiveSummary({
        overallCompliance,
        phaseCompliance,
        findings,
        results: allResults,
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
