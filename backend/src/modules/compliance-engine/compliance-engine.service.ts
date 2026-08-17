import { Injectable } from '@nestjs/common';
import { ComplianceOverviewDto } from './dto/compliance-overview.dto';
import { CompliancePhaseDto } from './dto/compliance-phase.dto';
import { FindingDto } from './dto/finding.dto';
import { ModuleComplianceDto } from './dto/module-compliance.dto';
import { PredictionDto } from './dto/prediction.dto';
import { IntelligentFinding } from './interfaces/intelligent-finding.interface';
import { ComplianceProvider, ProviderComplianceResult } from './providers/compliance-provider.interface';
import { AlertsProvider } from './providers/alerts.provider';
import { AnnualWorkPlanProvider } from './providers/annual-work-plan.provider';
import { ConvivenciaProvider } from './providers/convivencia.provider';
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
import { getPhaseWeights } from './utils/compliance-weights';
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

  private resolvePhaseCompliance(results: ProviderComplianceResult[]): CompliancePhaseDto {
    const phases = results.find((result) => result.phases)?.phases ?? {};
    return {
      plan: phases.plan ?? 0,
      do: phases.do ?? 0,
      check: phases.check ?? 0,
      act: phases.act ?? 0,
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
