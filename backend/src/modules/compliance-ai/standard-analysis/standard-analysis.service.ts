import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ComplianceEngineService } from '../../compliance-engine/compliance-engine.service';
import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisResponse,
} from '../dto/standard-analysis.dto';
import { StandardEvidenceAdapter } from './adapters/standard-evidence.adapter';
import { AcquisitionStandardAnalyzer } from './analyzers/acquisition-standard.analyzer';
import { ChangeManagementStandardAnalyzer } from './analyzers/change-management-standard.analyzer';
import { ContractingStandardAnalyzer } from './analyzers/contracting-standard.analyzer';
import { SociodemographicStandardAnalyzer } from './analyzers/sociodemographic-standard.analyzer';
import { OccupationalExamStandardAnalyzer } from './analyzers/occupational-exam-standard.analyzer';
import { MedicalRecommendationStandardAnalyzer } from './analyzers/medical-recommendation-standard.analyzer';
import { OccupationalEvaluationStandardAnalyzer } from './analyzers/occupational-evaluation-standard.analyzer';
import { AbsenteeismStandardAnalyzer } from './analyzers/absenteeism-standard.analyzer';
import { DiseaseInvestigationStandardAnalyzer } from './analyzers/disease-investigation-standard.analyzer';
import { EpidemiologicalSurveillanceStandardAnalyzer } from './analyzers/epidemiological-surveillance-standard.analyzer';
import { IndicatorHealthStandardAnalyzer } from './analyzers/indicator-health-standard.analyzer';
import { CaseInterventionStandardAnalyzer } from './analyzers/case-intervention-standard.analyzer';
import { RiskMethodologyStandardAnalyzer } from './analyzers/risk-methodology-standard.analyzer';
import { WorkerParticipationStandardAnalyzer } from './analyzers/worker-participation-standard.analyzer';
import { HazardousSubstanceStandardAnalyzer } from './analyzers/hazardous-substance-standard.analyzer';
import { EnvironmentalMeasurementStandardAnalyzer } from './analyzers/environmental-measurement-standard.analyzer';
import { ControlImplementationStandardAnalyzer } from './analyzers/control-implementation-standard.analyzer';
import { ControlVerificationStandardAnalyzer } from './analyzers/control-verification-standard.analyzer';
import { ProceduresStandardAnalyzer } from './analyzers/procedures-standard.analyzer';
import { InspectionComplianceStandardAnalyzer } from './analyzers/inspection-compliance-standard.analyzer';
import { MaintenanceStandardAnalyzer } from './analyzers/maintenance-standard.analyzer';
import { EppComplianceStandardAnalyzer } from './analyzers/epp-compliance-standard.analyzer';
import { EmergencyManagementStandardAnalyzer } from './analyzers/emergency-management-standard.analyzer';
import { ProceduresDocStandardAnalyzer } from './analyzers/procedures-doc-standard.analyzer';
import { RecordsDocStandardAnalyzer } from './analyzers/records-doc-standard.analyzer';
import { ManagementMeasurementStandardAnalyzer } from './analyzers/management-measurement-standard.analyzer';
import { ManagementReviewStandardAnalyzer } from './analyzers/management-review-standard.analyzer';
import { InternalAuditStandardAnalyzer } from './analyzers/internal-audit-standard.analyzer';
import { FindingsReviewStandardAnalyzer } from './analyzers/findings-review-standard.analyzer';
import { CorrectivePreventiveStandardAnalyzer } from './analyzers/corrective-preventive-standard.analyzer';
import { ManagementImprovementStandardAnalyzer } from './analyzers/management-improvement-standard.analyzer';
import { IncidentActionsStandardAnalyzer } from './analyzers/incident-actions-standard.analyzer';
import { ImprovementPlanStandardAnalyzer } from './analyzers/improvement-plan-standard.analyzer';
import { InductionReinductionStandardAnalyzer } from './analyzers/induction-reinduction-standard.analyzer';
import { HealthIndicatorsStandardAnalyzer } from './analyzers/health-indicators-standard.analyzer';

/**
 * Servicio de análisis inteligente de estándares PHVA.
 *
 * Reutiliza datos reales del ComplianceEngine y los interpreta mediante
 * analyzers específicos por estándar. NO recalcula compliance.
 *
 * Arquitectura extensible:
 *   - Agregar analyzer: crear clase + register()
 *   - Agregar adapter de evidencia: crear clase + registerEvidenceAdapter()
 */
@Injectable()
export class StandardAnalysisService {
  private readonly logger = new Logger(StandardAnalysisService.name);

  /** Registry de analyzers por código de estándar. */
  private readonly analyzers: Map<string, StandardAnalyzer> = new Map();

  /** Registry de evidence adapters por código de estándar. */
  private readonly evidenceAdapters: Map<string, StandardEvidenceAdapter> = new Map();

  constructor(
    private readonly complianceEngineService: ComplianceEngineService,
  ) {
    // Registro de analyzers disponibles
    this.register(new AcquisitionStandardAnalyzer());
    this.register(new ChangeManagementStandardAnalyzer());
    this.register(new ContractingStandardAnalyzer());
    this.register(new SociodemographicStandardAnalyzer());
    this.register(new OccupationalExamStandardAnalyzer());
    this.register(new MedicalRecommendationStandardAnalyzer());
    this.register(new OccupationalEvaluationStandardAnalyzer());
    this.register(new AbsenteeismStandardAnalyzer());
    this.register(new DiseaseInvestigationStandardAnalyzer());
    this.register(new EpidemiologicalSurveillanceStandardAnalyzer());
    this.register(new IndicatorHealthStandardAnalyzer());
    this.register(new CaseInterventionStandardAnalyzer());
    this.register(new RiskMethodologyStandardAnalyzer());
    this.register(new WorkerParticipationStandardAnalyzer());
    this.register(new HazardousSubstanceStandardAnalyzer());
    this.register(new EnvironmentalMeasurementStandardAnalyzer());
    this.register(new ControlImplementationStandardAnalyzer());
    this.register(new ControlVerificationStandardAnalyzer());
    this.register(new ProceduresStandardAnalyzer());
    this.register(new InspectionComplianceStandardAnalyzer());
    this.register(new MaintenanceStandardAnalyzer());
    this.register(new EppComplianceStandardAnalyzer());
    this.register(new EmergencyManagementStandardAnalyzer());
    this.register(new ProceduresDocStandardAnalyzer());
    this.register(new RecordsDocStandardAnalyzer());
    this.register(new ManagementMeasurementStandardAnalyzer());
    this.register(new ManagementReviewStandardAnalyzer());
    this.register(new InternalAuditStandardAnalyzer());
    this.register(new FindingsReviewStandardAnalyzer());
    this.register(new CorrectivePreventiveStandardAnalyzer());
    this.register(new ManagementImprovementStandardAnalyzer());
    this.register(new IncidentActionsStandardAnalyzer());
    this.register(new ImprovementPlanStandardAnalyzer());
    this.register(new InductionReinductionStandardAnalyzer());
    this.register(new HealthIndicatorsStandardAnalyzer());
  }

  /**
   * Registra un analyzer para un código de estándar.
   */
  private register(analyzer: StandardAnalyzer): void {
    const testCodes = ['1.2.2', '2.9.1', '2.11.1', '2.7.1', '2.5.1', '2.6.1', '2.8.1', '2.10.1', '3.1.1', '3.1.2', '3.1.3', '3.1.4', '3.2.1', '3.2.2', '3.3.1', '3.3.2', '3.3.3', '4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '4.3.1', '4.4.1', '5.1.1', '5.1.2', '6.1.1', '6.1.2', '6.1.3', '6.1.4', '7.1.1', '7.1.2', '7.1.3', '7.1.4'];
    for (const code of testCodes) {
      if (analyzer.supports(code)) {
        this.analyzers.set(code, analyzer);
        break;
      }
    }
  }

  /**
   * Registra un adapter de evidencia documental para un estándar.
   * Llamar desde el módulo después de inyectar las dependencias.
   */
  registerEvidenceAdapter(adapter: StandardEvidenceAdapter): void {
    const testCodes = ['1.2.2', '2.9.1', '2.11.1', '2.7.1', '2.5.1', '2.6.1', '2.8.1', '2.10.1', '3.1.1', '3.1.2', '3.1.3', '3.1.4', '3.2.1', '3.2.2', '3.3.1', '3.3.2', '3.3.3', '4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '4.3.1', '4.4.1', '5.1.1', '5.1.2', '6.1.1', '6.1.2', '6.1.3', '6.1.4', '7.1.1', '7.1.2', '7.1.3', '7.1.4'];
    for (const code of testCodes) {
      if (adapter.supports(code)) {
        this.evidenceAdapters.set(code, adapter);
        this.logger.log(`Evidence adapter registered for standard ${code}`);
        break;
      }
    }
  }

  /**
   * Analiza un estándar específico con datos reales del ComplianceEngine.
   *
   * @param standardCode - Código del estándar (ej: '2.9.1')
   * @param companyId - Identificador de la empresa (ya validado por CompanyAccessGuard)
   */
  async analyze(
    standardCode: string,
    companyId: string,
  ): Promise<StandardAnalysisResponse> {
    // 1. Validar standardCode
    if (!standardCode || typeof standardCode !== 'string') {
      throw new BadRequestException('standardCode es requerido');
    }

    // 2. Buscar analyzer
    const analyzer = this.analyzers.get(standardCode);
    if (!analyzer) {
      throw new NotFoundException(
        `El estándar ${standardCode} aún no dispone de análisis inteligente.`,
      );
    }

    // 3. Obtener overview del ComplianceEngine
    let overview;
    try {
      overview = await this.complianceEngineService.getOverview(companyId);
    } catch (error) {
      this.logger.debug(
        `Overview no disponible para análisis de ${standardCode}: ${this.errorMessage(error)}`,
      );
      throw new NotFoundException(
        'No fue posible obtener los datos de cumplimiento.',
      );
    }

    // 4. Buscar el módulo correspondiente
    const moduleKey = analyzer.getModule();
    const moduleCompliance = overview.moduleCompliance.find(
      (item) => item.module === moduleKey,
    );

    if (!moduleCompliance) {
      throw new NotFoundException(
        `No se encontraron datos de cumplimiento para el módulo ${moduleKey}.`,
      );
    }

    // 5. Filtrar findings del módulo
    const moduleFindings = overview.findings.filter(
      (finding) => finding.module === moduleKey,
    );

    // 6. Construir contexto
    const context: StandardAnalysisContext = {
      companyId,
      moduleCompliance,
      findings: moduleFindings,
      overview: {
        overallCompliance: overview.overallCompliance,
        phaseCompliance: {
          plan: overview.phaseCompliance.plan,
          do: overview.phaseCompliance.do,
          check: overview.phaseCompliance.check,
          act: overview.phaseCompliance.act,
        },
        moduleCompliance: overview.moduleCompliance,
      },
    };

    // 7. Obtener contexto de evidencia documental (si existe adapter)
    const evidenceAdapter = this.evidenceAdapters.get(standardCode);
    let evidenceContext;
    if (evidenceAdapter) {
      try {
        evidenceContext = await evidenceAdapter.getEvidenceContext(companyId);
      } catch (error) {
        this.logger.warn(
          `Error fetching evidence for ${standardCode}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    // 8. Inyectar evidencia al contexto del analyzer
    const enrichedContext: StandardAnalysisContext = {
      ...context,
      evidence: evidenceContext,
    };

    // 9. Ejecutar analyzer
    const interpretation = analyzer.analyze(enrichedContext);
    const metrics = analyzer.getMetrics(enrichedContext);

    // 10. Determinar si hay datos disponibles.
    // Cada módulo tiene su propio 'no-data' finding id para detectar ausencia de datos.
    const noDataFindingIds: Record<string, string> = {
      acquisitions: 'acq-no-data',
      contracting: 'ctr-no-data',
      'change-management': 'change-no-data',
      sociodemographic: 'socio-no-data',
      'occupational-exam': 'exam-no-data',
      'medical-recommendation': 'recommendation-no-data',
      'occupational-evaluation': 'occupational-evaluation-no-data',
      'absenteeism': 'absenteeism-no-data',
      'disease-investigation': 'disease-investigation-no-data',
      'epidemiological-surveillance': 'pve-no-data',
      'indicators': 'indicators-no-active',
      'incidents': 'case-intervention-no-data',
      'risk-methodology': 'methodology-no-data',
      'worker-participation': 'worker-participation-no-data',
      'hazardous-substance': 'hazardous-substance-no-data',
      'environmental-measurement': 'env-measurement-no-data',
      'control-implementation': 'control-impl-no-data',
      'control-verification': 'control-verification-no-data',
      'procedures': 'procedures-no-data',
      'inspection-compliance': 'inspection-no-data',
      'maintenance': 'maintenance-no-data',
      'epp-compliance': 'epp-no-data',
      'control-verification-standard': 'control-verification-standard-no-data',
      'emergency-management': 'emergency-management-no-data',
      'procedures-doc': 'procedures-doc-no-data',
      'records-doc': 'records-doc-no-data',
      'management-measurement': 'management-measurement-no-data',
      'management-review': 'management-review-no-data',
      'internal-audit': 'internal-audit-no-data',
      'findings-review': 'findings-review-no-data',
      'corrective-preventive': 'corrective-preventive-no-data',
      'management-improvement': 'management-improvement-no-data',
      'incident-actions': 'incident-actions-no-data',
      'improvement-plan': 'improvement-plan-no-data',
      'induction-reinduction': 'induction-no-data',
      'health-indicators': 'health-indicators-no-data',
    };
    const noDataFindingId = noDataFindingIds[moduleKey] ?? 'acq-no-data';
    const dataAvailable = !moduleFindings.some((f) => f.id === noDataFindingId);

    // 11. Construir respuesta (retrocompatible: evidence es opcional)
    return {
      standardCode,
      standardTitle: this.getStandardTitle(standardCode),
      module: moduleKey,
      compliancePercentage: moduleCompliance.compliance,
      complianceStatus: moduleCompliance.level,
      level: moduleCompliance.level,
      analysis: interpretation,
      metrics,
      evaluatedAt: new Date().toISOString(),
      dataAvailable,
      ...(evidenceContext ? { evidence: evidenceContext } : {}),
    };
  }

  /**
   * Retorna el título conocido de un estándar.
   * Evita depender del StandardCatalog para no crear acoplamiento innecesario.
   */
  private getStandardTitle(standardCode: string): string {
    const titles: Record<string, string> = {
      '2.9.1': 'Adquisiciones',
      '2.11.1': 'Gestión del cambio',
      '2.7.1': 'Matriz legal',
      '2.5.1': 'Conservación documental',
      '2.6.1': 'Rendición de cuentas',
      '2.8.1': 'Comunicación',
      '2.10.1': 'Contratación',
      '3.1.1': 'Perfil sociodemográfico',
      '3.1.2': 'Exámenes médicos ocupacionales',
      '3.1.3': 'Seguimiento a recomendaciones médicas',
      '3.1.4': 'Realización de Evaluaciones Médicas Ocupacionales',
      '3.2.1': 'Registro de ausentismo',
      '3.2.2': 'Investigación de enfermedades laborales',
      '3.3.1': 'Programas de vigilancia epidemiológica',
      '3.3.2': 'Medición y análisis de indicadores de salud',
      '3.3.3': 'Intervención y seguimiento de casos',
      '4.1.1': 'Metodología identificación de peligros',
      '4.1.2': 'Participación de trabajadores',
      '4.1.3': 'Sustancias peligrosas',
      '4.1.4': 'Mediciones ambientales',
      '4.2.1': 'Implementación de medidas de control',
      '4.2.2': 'Verificación de aplicación de medidas',
      '4.2.3': 'Procedimientos e instructivos',
      '4.2.4': 'Inspecciones',
      '4.2.5': 'Mantenimiento',
      '4.2.6': 'EPP',
      '4.3.1': 'Verificación de controles',
      '4.4.1': 'Gestión de emergencias',
      '5.1.1': 'Procedimientos SG-SST',
      '5.1.2': 'Registros SG-SST',
      '6.1.1': 'Medición de la gestión SST',
      '6.1.2': 'Revisión por la dirección',
      '6.1.3': 'Auditoría interna SG-SST',
      '6.1.4': 'Revisión de hallazgos',
      '7.1.1': 'Acciones preventivas y correctivas',
      '7.1.2': 'Acciones mejora alta dirección',
      '7.1.3': 'Acciones por accidentes',
      '7.1.4': 'Plan de mejoramiento',
      '1.2.2': 'Inducción y Reinducción SG-SST',
    };
    return titles[standardCode] ?? standardCode;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
