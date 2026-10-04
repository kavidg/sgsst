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
// 5.1.1: el analyzer procedures-doc fue RETIRADO del registro (su único uso
// era 5.1.1, wrong-mapping). La clase ProceduresDocStandardAnalyzer se conserva
// en analyzers/procedures-doc-standard.analyzer.ts SIN registro, disponible
// para una futura reasignación o eliminación. NO se reasigna automáticamente.
import { EmergencyPlanStandardAnalyzer } from './analyzers/emergency-plan-standard.analyzer';
// 5.1.2: el analyzer records-doc fue RETIRADO del registro (su único uso era
// 5.1.2, wrong-mapping de "Registros SG-SST" sobre brigadas). La clase
// RecordsDocStandardAnalyzer se conserva en analyzers/records-doc-standard.analyzer.ts
// SIN registro, disponible para una futura reasignación o eliminación. NO se
// reasigna automáticamente.
import { EmergencyBrigadeStandardAnalyzer } from './analyzers/emergency-brigade-standard.analyzer';
// 6.1.1 (E4-C): el analyzer management-measurement fue RETIRADO del registro
// (su único uso era 6.1.1, wrong-mapping previo a que el provider `indicators`
// fuera la fuente oficial). La clase ManagementMeasurementStandardAnalyzer se
// conserva en analyzers/ SIN registro, disponible para futuro o eliminación.
// NO se reasigna automáticamente (patrón 5.1.1/5.1.2).
import { IndicatorsStandardAnalyzer } from './analyzers/indicators-standard.analyzer';
import { AnnualAuditStandardAnalyzer } from './analyzers/annual-audit-standard.analyzer';
// E4 (6.1.3): el analyzer legacy InternalAuditStandardAnalyzer fue RETIRADO del
// registro (su único uso era 6.1.3, wrong-mapping: DocumentMaster AUDIT no es
// revisión por la dirección). La clase se conserva en analyzers/ SIN registro
// (patrón 5.1.1/5.1.2/6.1.1); NO se elimina físicamente ni se reasigna.
import { ManagementReviewStandardAnalyzer } from './analyzers/management-review-standard.analyzer';
// E4 (6.1.3): analyzer oficial de la Revisión por la dirección (consume la
// metadata dimensions:v1 del provider `management-review-direction`).
import { ManagementReviewDirectionStandardAnalyzer } from './analyzers/management-review-direction-standard.analyzer';
// E2 (6.1.4): el analyzer findings-review fue RETIRADO del registro (su único
// uso era 6.1.4, wrong-mapping: AccountabilityCommitment no es planificación de
// auditorías COPASST). La clase FindingsReviewStandardAnalyzer se conserva en
// analyzers/ SIN registro (patrón 5.1.1/5.1.2/6.1.1/6.1.3); NO se elimina
// físicamente ni se reasigna a otro estándar.
import { CopasstAuditPlanningStandardAnalyzer } from './analyzers/copasst-audit-planning-standard.analyzer';
// E2 (7.1.1): el analyzer corrective-preventive fue RETIRADO del registro (su
// único uso era 7.1.1 como proxy sobre AccountabilityCommitment). La clase
// CorrectivePreventiveStandardAnalyzer se conserva en analyzers/ SIN registro
// (patrón findings-review); NO se elimina físicamente ni se reasigna.
import { CorrectivePreventiveActionsStandardAnalyzer } from './analyzers/corrective-preventive-actions-standard.analyzer';
// ESTÁNDAR 7.1.2 — RETIRO DEL ANALYZER LEGACY: ManagementImprovementStandard
// Analyzer (reuniones de rendición de cuentas) se conserva en analyzers/ SIN
// registro (patrón findings-review/corrective-preventive); la fuente oficial
// de IA para 7.1.2 es ManagementImprovementActionsStandardAnalyzer.
// import { ManagementImprovementStandardAnalyzer } from './analyzers/management-improvement-standard.analyzer';
import { ManagementImprovementActionsStandardAnalyzer } from './analyzers/management-improvement-actions-standard.analyzer';
import { IncidentActionsStandardAnalyzer } from './analyzers/incident-actions-standard.analyzer';
import { ImprovementPlanStandardAnalyzer } from './analyzers/improvement-plan-standard.analyzer';
import { InductionReinductionStandardAnalyzer } from './analyzers/induction-reinduction-standard.analyzer';
import { HealthIndicatorsStandardAnalyzer } from './analyzers/health-indicators-standard.analyzer';
// FASE 34B: analyzer 3.1.8 — Agua potable, servicios sanitarios y disposición de basuras (EXACT).
import { WorkplaceSanitaryConditionsStandardAnalyzer } from './analyzers/workplace-sanitary-conditions-standard.analyzer';
// FASE 34C: analyzer 3.1.9 — Eliminación adecuada de residuos sólidos, líquidos o gaseosos (EXACT).
import { WasteManagementStandardAnalyzer } from './analyzers/waste-management-standard.analyzer';
// SCOPE-1: los analyzers 3.3.4/3.3.5/3.3.6 (DiseasePrevalenceStandardAnalyzer,
// DiseaseIncidenceStandardAnalyzer, MedicalAbsenteeismStandardAnalyzer) se
// conservan en analyzers/ con sus tests, pero NO se registran: esos estándares
// quedaron fuera del alcance aprobado por los socios y no son análisis activo
// del producto. analyze() responde 404 si se les consulta.

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
    // 5.1.1: analyzer oficial del Plan de prevención, preparación y respuesta
    // ante emergencias (consume la metadata del provider `emergency-plan`).
    this.register(new EmergencyPlanStandardAnalyzer());
    // 5.1.2: analyzer oficial de la Brigada de emergencia (consume la metadata
    // del provider `emergency-brigade`; reemplaza el wrong-mapping de records-doc).
    this.register(new EmergencyBrigadeStandardAnalyzer());
    // 6.1.1: analyzer oficial de Indicadores SG-SST (consume la metadata
    // dimensions:v1 del provider `indicators`; reemplaza el wrong-mapping de
    // management-measurement).
    this.register(new IndicatorsStandardAnalyzer());
    // E4 (6.1.2): analyzer oficial de Auditoría anual (consume la metadata
    // dimensions:v1 del provider `annual-audit`; reemplaza la asociación
    // incorrecta de management-review). La clase legacy
    // ManagementReviewStandardAnalyzer permanece registrada para su contexto
    // legítimo (revisión por la dirección) pero SIN capturar 6.1.2: el registro
    // por orden de llegada haría que AnnualAuditStandardAnalyzer (registrado
    // antes) gane la resolución de '6.1.2'.
    this.register(new AnnualAuditStandardAnalyzer());
    this.register(new ManagementReviewStandardAnalyzer());
    // E4 (6.1.3): analyzer oficial de la Revisión por la dirección (única
    // fuente de IA para este estándar; reemplaza el wrong-mapping de
    // internal-audit, retirado del registro — ver nota de import arriba).
    this.register(new ManagementReviewDirectionStandardAnalyzer());
    // E2 (6.1.4): analyzer oficial de la Planificación de auditorías COPASST
    // (única fuente de IA para este estándar; reemplaza el wrong-mapping de
    // findings-review, retirado del registro — ver nota de import arriba).
    this.register(new CopasstAuditPlanningStandardAnalyzer());
    // E2 (7.1.1): analyzer OFICIAL de las Acciones preventivas y correctivas
    // (dominio propio E1; corrective-preventive queda retirado del registro).
    this.register(new CorrectivePreventiveActionsStandardAnalyzer());
    // ESTÁNDAR 7.1.2: analyzer OFICIAL (dominio propio E1); el legacy
    // ManagementImprovementStandardAnalyzer (AccountabilityMeeting) queda SIN
    // registro (first-wins: el oficial debe ser el ÚNICO registrado).
    this.register(new ManagementImprovementActionsStandardAnalyzer());
    this.register(new IncidentActionsStandardAnalyzer());
    this.register(new ImprovementPlanStandardAnalyzer());
    this.register(new InductionReinductionStandardAnalyzer());
    this.register(new HealthIndicatorsStandardAnalyzer());
    // FASE 34B: analyzer EXACT para 3.1.8.
    this.register(new WorkplaceSanitaryConditionsStandardAnalyzer());
    // FASE 34C: analyzer EXACT para 3.1.9.
    this.register(new WasteManagementStandardAnalyzer());
    // SCOPE-1: los analyzers 3.3.4/3.3.5/3.3.6 ya no se registran (fuera del
    // alcance aprobado). Código y tests conservados como infraestructura futura.
  }

  /**
   * Registra un analyzer para un código de estándar.
   *
   * E4 (6.1.3) — FIX de frontera: el registro es FIRST-WINS. Si otro analyzer
   * ya reclamó el código, el nuevo se ignora y se registra una advertencia.
   * Así el orden de registro ya NO decide silenciosamente qué analyzer atiende
   * un estándar (bug documentado: ManagementReviewStandardAnalyzer, registrado
   * después de AnnualAuditStandardAnalyzer, terminaba capturando 6.1.2).
   */
  private register(analyzer: StandardAnalyzer): void {
    const testCodes = ['1.2.2', '2.9.1', '2.11.1', '2.7.1', '2.5.1', '2.6.1', '2.8.1', '2.10.1', '3.1.1', '3.1.2', '3.1.3', '3.1.4', '3.1.8', '3.1.9', '3.2.1', '3.2.2', '3.3.1', '3.3.2', '3.3.3', '3.3.4', '3.3.5', '3.3.6', '4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '4.3.1', '4.4.1', '5.1.1', '5.1.2', '6.1.1', '6.1.2', '6.1.3', '6.1.4', '7.1.1', '7.1.2', '7.1.3', '7.1.4'];
    for (const code of testCodes) {
      if (analyzer.supports(code)) {
        const existing = this.analyzers.get(code);
        if (existing) {
          this.logger.warn(
            `Analyzer duplicado para ${code}: se conserva el registrado primero (${existing.getModule()}); se ignora ${analyzer.getModule()}.`,
          );
          return;
        }
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
      'emergency-plan': 'emergency-plan-no-data',
      'emergency-brigade': 'emergency-brigade-no-data',
      'records-doc': 'records-doc-no-data',
      'management-measurement': 'management-measurement-no-data',
      'management-review': 'management-review-no-data',
      'internal-audit': 'internal-audit-no-data',
      // E4 (6.1.3): finding oficial de ausencia de datos del provider oficial.
      'management-review-direction': 'management-review-direction-no-data',
      'findings-review': 'findings-review-no-data',
      'corrective-preventive': 'corrective-preventive-no-data',
      'management-improvement': 'management-improvement-no-data',
      'incident-actions': 'incident-actions-no-data',
      'improvement-plan': 'improvement-plan-no-data',
      'induction-reinduction': 'induction-no-data',
      'health-indicators': 'health-indicators-no-data',
    };
    const noDataFindingId = noDataFindingIds[moduleKey] ?? 'acq-no-data';
    // 5.1.2: la variante "brigadas existentes pero ninguna activa" es también
    // un estado sin evidencia evaluable (status NO_DATA del provider). Se
    // detecta con su finding oficial para que dataAvailable sea fiel.
    const noDataFindingIdsForModule = moduleKey === 'emergency-brigade'
      ? [noDataFindingId, 'emergency-brigade-no-active-brigade']
      : [noDataFindingId];
    const dataAvailable = !moduleFindings.some((f) => noDataFindingIdsForModule.includes(f.id));

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
      '5.1.1': 'Plan de prevención, preparación y respuesta ante emergencias',
      '5.1.2': 'Brigada de emergencia',
      '6.1.1': 'Medición de la gestión SST',
      // E4 (6.1.2): título normativo del catálogo (era 'Revisión por la
      // dirección' — etiqueta legacy del wrong-mapping de management-review).
      '6.1.2': 'Auditoría anual',
      // E4 (6.1.3): título normativo del catálogo (era 'Auditoría interna
      // SG-SST' — etiqueta del wrong-mapping de internal-audit, retirado).
      '6.1.3': 'Revisión alta dirección',
      // E4 (6.1.4): título normativo del catálogo (era 'Revisión de hallazgos'
      // — etiqueta del wrong-mapping de findings-review, retirado en E2). El
      // analyzer oficial de 6.1.4 es CopasstAuditPlanningStandardAnalyzer.
      '6.1.4': 'Planificación auditorías COPASST',
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
