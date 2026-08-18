import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AbsenteeismService } from '../../absenteeism/absenteeism.service';
import { ActivityStatus } from '../../annual-work-plan/schemas/plan-activity.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { Company, CompanyDocument } from '../../companies/schemas/company.schema';
import { ComplianceEngineService } from '../../compliance-engine/compliance-engine.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { IncidentsService } from '../../incidents/incidents.service';
import { InitialEvaluationService } from '../../initial-evaluation/initial-evaluation.service';
import { StandardEvaluationStatus } from '../../initial-evaluation/schemas/initial-evaluation.schema';
import { InspectionsService } from '../../inspections/inspections.service';
import { TrainingsService } from '../../trainings/trainings.service';
import { ConvivenciaComplianceSnapshot, ConvivenciaService } from '../../convivencia/convivencia.service';
import {
  CONVIVENCIA_ITEM_CODE,
  ConvivenciaPeriodDocument,
} from '../../convivencia/schemas/convivencia.schema';
import { DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { PhvaAnalysisResult } from '../../phva/interfaces/phva-analysis.interface';
import { PhvaAnalysisService } from '../../phva/phva-analysis.service';
import {
  CopasstTrainingCoverage,
  PhvaAdvancedCopasstTrainingService,
} from '../../phva-advanced/phva-advanced-copasst-training.service';
import { PhvaAdvancedCopasstTrainingDocument } from '../../phva-advanced/schemas/phva-advanced-copasst-training.schema';
import {
  CompanyAIContext,
  CompanyAIContextAbsenteeism,
  CompanyAIContextActivities,
  CompanyAIContextAudits,
  CompanyAIContextConvivencia,
  CompanyAIContextCopasstTraining,
  CompanyAIContextDocuments,
  CompanyAIContextIncidents,
  CompanyAIContextIndicators,
  CompanyAIContextInitialEvaluation,
  CompanyAIContextPrograms,
} from './interfaces/company-ai-context.interface';

/** Límite de elementos por lista para mantener el contexto compacto y legible. */
const MAX_ITEMS_PER_LIST = 10;

/**
 * Capa central de contexto IA.
 *
 * Construye el contexto operativo completo de una empresa (CompanyAIContext)
 * consultando datos REALES del sistema en paralelo:
 * - Empresa → Company (nombre, standardsType 7/21/60).
 * - Compliance → ComplianceEngineService.getOverview (overall, hallazgos, recomendaciones).
 * - PHVA → PhvaAnalysisService.analyzeCompanyPHVA (cumplimiento por fase).
 * - Documentos → DocumentMasterService.findAll (pendientes, vencidos, estado general).
 * - Actividades → AnnualWorkPlanService.findCurrent + getActivities (pendientes, atrasadas, completadas).
 *
 * Reutiliza servicios existentes, no inventa datos y tolera errores por módulo
 * sin romper el contexto (un módulo caído se representa con valores por defecto).
 * Arquitectura preparada para que todos los Engines IA y el futuro Copiloto
 * consuman un único contexto ya agregado.
 */
@Injectable()
export class AiContextService {
  private readonly logger = new Logger(AiContextService.name);

  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    private readonly complianceEngineService: ComplianceEngineService,
    private readonly phvaAnalysisService: PhvaAnalysisService,
    private readonly documentMasterService: DocumentMasterService,
    private readonly annualWorkPlanService: AnnualWorkPlanService,
    // Fase 7 (1.1.7): service de dominio de Capacitación COPASST. El contexto
    // NO recalcula cobertura ni miembros: reutiliza las reglas del dominio.
    private readonly copasstTrainingService: PhvaAdvancedCopasstTrainingService,
    // Fase 4 (1.1.8): service de dominio del Comité de Convivencia. El contexto
    // NO recalcula compliance: consume getComplianceSnapshot() (única fuente).
    private readonly convivenciaService: ConvivenciaService,
    // AUDIT-5: services reales de los dominios operativos. El contexto SOLO
    // agrega (nunca recalcula ni duplica la lógica de negocio de cada dominio).
    private readonly initialEvaluationService: InitialEvaluationService,
    private readonly dashboardService: DashboardService,
    private readonly incidentsService: IncidentsService,
    private readonly absenteeismService: AbsenteeismService,
    private readonly trainingsService: TrainingsService,
    private readonly inspectionsService: InspectionsService,
  ) {}

  /**
   * Construye el contexto operativo de una empresa con datos reales.
   *
   * @param companyId - Identificador de la empresa.
   */
  async buildCompanyContext(companyId: string): Promise<CompanyAIContext> {
    const companyObjectId = this.toObjectId(companyId);

    // Nota de diseño: se consulta ComplianceEngineService.getOverview directamente
    // (sección compliance) y PhvaAnalysisService.analyzeCompanyPHVA (sección phva),
    // que internamente vuelve a invocar getOverview. Este tradeoff es intencional:
    // reutilizar el servicio PHVA existente garantiza la misma lógica de mapeo de
    // pendientes por fase (sin duplicar código) y no modifica contratos existentes.
    // Si el rendimiento lo exige, PhvaAnalysisService podría aceptar el overview ya
    // agregado como parámetro opcional en una fase futura.
    const [
      company,
      overview,
      phva,
      documents,
      activities,
      copasstTraining,
      convivencia,
      initialEvaluation,
      indicators,
      incidents,
      absenteeism,
      programs,
      audits,
    ] = await Promise.all([
      this.safeFindCompany(companyId),
      this.safeGetOverview(companyId),
      this.safeGetPhva(companyId),
      this.safeGetDocuments(companyObjectId),
      this.safeGetActivities(companyObjectId),
      this.safeGetCopasstTraining(companyObjectId),
      this.safeGetConvivencia(companyObjectId),
      this.safeGetInitialEvaluation(companyObjectId),
      this.safeGetIndicators(companyObjectId),
      this.safeGetIncidents(companyObjectId),
      this.safeGetAbsenteeism(companyObjectId),
      this.safeGetPrograms(companyObjectId),
      this.safeGetAudits(companyObjectId),
    ]);

    return {
      company: {
        id: companyId,
        name: company?.name ?? '',
        standardsType: company?.standardsType ?? null,
      },
      compliance: {
        overallCompliance: overview?.overallCompliance ?? 0,
        gaps: this.unique((overview?.findings ?? []).map((finding) => finding.title)),
        recommendations: this.unique(
          (overview?.recommendations ?? []).map((recommendation) => recommendation.title),
        ),
      },
      phva: phva ?? this.emptyPhva(),
      documents: this.buildDocumentsContext(documents),
      activities: this.buildActivitiesContext(activities),
      copasstTraining: this.buildCopasstTrainingContext(copasstTraining),
      convivencia: this.buildConvivenciaContext(convivencia),
      // AUDIT-5: dominios operativos con datos reales (agregados sin PII).
      initialEvaluation: this.buildInitialEvaluationContext(initialEvaluation),
      indicators: this.buildIndicatorsContext(indicators),
      incidents: this.buildIncidentsContext(incidents),
      absenteeism: this.buildAbsenteeismContext(absenteeism),
      programs: this.buildProgramsContext(programs),
      audits: this.buildAuditsContext(audits),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers privados (lecturas tolerantes: un módulo sin datos no rompe el contexto)
  // -------------------------------------------------------------------------

  private toObjectId(companyId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException(`Invalid companyId: ${companyId}`);
    }
    return new Types.ObjectId(companyId);
  }

  private async safeFindCompany(companyId: string): Promise<CompanyDocument | null> {
    try {
      return await this.companyModel.findById(companyId).exec();
    } catch (error) {
      this.logger.debug(`Empresa no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetOverview(companyId: string) {
    try {
      return await this.complianceEngineService.getOverview(companyId);
    } catch (error) {
      this.logger.debug(`Overview no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetPhva(companyId: string): Promise<PhvaAnalysisResult | null> {
    try {
      return await this.phvaAnalysisService.analyzeCompanyPHVA(companyId);
    } catch (error) {
      this.logger.debug(`Análisis PHVA no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetDocuments(companyObjectId: Types.ObjectId) {
    try {
      return await this.documentMasterService.findAll(companyObjectId);
    } catch (error) {
      this.logger.debug(`Documentos no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private async safeGetActivities(companyObjectId: Types.ObjectId) {
    try {
      const plan = await this.annualWorkPlanService.findCurrent(companyObjectId);
      return await this.annualWorkPlanService.getActivities(plan._id);
    } catch (error) {
      // Empresa sin plan anual vigente: escenario esperado, no un error del sistema.
      this.logger.debug(`Actividades no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  /**
   * Lectura tolerante de la entidad 1.1.7 + cobertura real.
   *
   * Multi-tenancy: se consulta SIEMPRE a través del service de dominio con el
   * companyId autenticado (nunca por entityId suelto). Una empresa sin entidad
   * o con el módulo caído devuelve null (sección con valores por defecto).
   */
  private async safeGetCopasstTraining(
    companyObjectId: Types.ObjectId,
  ): Promise<{ record: PhvaAdvancedCopasstTrainingDocument; coverage: CopasstTrainingCoverage } | null> {
    try {
      const record = await this.copasstTrainingService.findByCompany(companyObjectId);
      if (!record) return null;
      const coverage = await this.copasstTrainingService.calculateCoverage(companyObjectId, record);
      return { record, coverage };
    } catch (error) {
      this.logger.debug(`Capacitación COPASST (1.1.7) no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  /**
   * Lectura tolerante del Comité de Convivencia (1.1.8): snapshot de
   * cumplimiento del dominio + datos reales del periodo vigente.
   *
   * Multi-tenancy: ambas lecturas pasan SIEMPRE por el service de dominio con
   * el companyId autenticado (nunca por periodId suelto). Una empresa sin
   * periodo o con el módulo caído devuelve null (sección con valores por
   * defecto y available: false). Lectura pura: sin side effects ni creación
   * de entidades (findCurrent NO crea; getComplianceSnapshot tampoco).
   */
  private async safeGetConvivencia(
    companyObjectId: Types.ObjectId,
  ): Promise<{ snapshot: ConvivenciaComplianceSnapshot; period: ConvivenciaPeriodDocument } | null> {
    try {
      const [snapshot, period] = await Promise.all([
        this.convivenciaService.getComplianceSnapshot(companyObjectId),
        this.convivenciaService.findCurrent(companyObjectId),
      ]);
      return { snapshot, period };
    } catch (error) {
      this.logger.debug(`Comité de Convivencia (1.1.8) no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  /** Evaluación inicial real (AUDIT-5): lectura pura vía el service del dominio. */
  private async safeGetInitialEvaluation(companyObjectId: Types.ObjectId) {
    try {
      return await this.initialEvaluationService.findCurrent(companyObjectId);
    } catch (error) {
      this.logger.debug(`Evaluación inicial no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  /** Indicadores agregados reales del dashboard (AUDIT-5). */
  private async safeGetIndicators(companyObjectId: Types.ObjectId) {
    try {
      return await this.dashboardService.getCompanyStats(companyObjectId);
    } catch (error) {
      this.logger.debug(`Indicadores no disponibles: ${this.errorMessage(error)}`);
      return null;
    }
  }

  /** Incidentes reales del tenant (AUDIT-5): agrega SIN PII (nunca employeeId/descripción). */
  private async safeGetIncidents(companyObjectId: Types.ObjectId) {
    try {
      return await this.incidentsService.findAll(companyObjectId);
    } catch (error) {
      this.logger.debug(`Incidentes no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  /** Ausentismo real del tenant (AUDIT-5): stats + registros recientes sin PII. */
  private async safeGetAbsenteeism(companyObjectId: Types.ObjectId) {
    try {
      const [stats, records] = await Promise.all([
        this.absenteeismService.getCompanyStats(companyObjectId.toString()),
        this.absenteeismService.findAllByCompany(companyObjectId.toString()),
      ]);
      return { stats, records };
    } catch (error) {
      this.logger.debug(`Ausentismo no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  /** Capacitaciones reales del tenant (AUDIT-5): agrega sin PII (sin instructores ni listas). */
  private async safeGetPrograms(companyObjectId: Types.ObjectId) {
    try {
      return await this.trainingsService.findAll(companyObjectId);
    } catch (error) {
      this.logger.debug(`Programas no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  /** Inspecciones/auditorías reales del tenant (AUDIT-5): títulos y estados sin notas. */
  private async safeGetAudits(companyObjectId: Types.ObjectId) {
    try {
      return await this.inspectionsService.findAll(companyObjectId);
    } catch (error) {
      this.logger.debug(`Auditorías no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  /** Sección de evaluación inicial (AUDIT-5): agregados reales, sin hallazgos completos. */
  private buildInitialEvaluationContext(
    evaluation: {
      status?: string;
      overallCompliance?: number;
      standards?: Array<{ status?: string }>;
      findings?: unknown[];
      actionPlan?: unknown[];
    } | null,
  ): CompanyAIContextInitialEvaluation {
    if (!evaluation) {
      return {
        available: false,
        status: null,
        overallCompliance: 0,
        totalStandards: 0,
        evaluated: 0,
        compliant: 0,
        nonCompliant: 0,
        findings: 0,
        actionItems: 0,
      };
    }
    const standards = evaluation.standards ?? [];
    const compliant = standards.filter(
      (standard) => standard.status === StandardEvaluationStatus.COMPLIES,
    ).length;
    const nonCompliant = standards.filter(
      (standard) => standard.status === StandardEvaluationStatus.DOES_NOT_COMPLY,
    ).length;
    return {
      available: true,
      status: evaluation.status ?? null,
      overallCompliance: evaluation.overallCompliance ?? 0,
      totalStandards: standards.length,
      evaluated: standards.length,
      compliant,
      nonCompliant,
      findings: (evaluation.findings ?? []).length,
      actionItems: (evaluation.actionPlan ?? []).length,
    };
  }

  /** Sección de indicadores (AUDIT-5): agrega el DashboardStats real del tenant. */
  private buildIndicatorsContext(
    stats: {
      employees: number;
      incidents: number;
      trainings: number;
      compliance: number;
      highRisks: number;
    } | null,
  ): CompanyAIContextIndicators {
    return {
      employees: stats?.employees ?? 0,
      incidents: stats?.incidents ?? 0,
      trainings: stats?.trainings ?? 0,
      compliance: stats?.compliance ?? 0,
      highRisks: stats?.highRisks ?? 0,
    };
  }

  /** Sección de accidentalidad (AUDIT-5): agregados sin employeeId ni descripción. */
  private buildIncidentsContext(
    incidents: Array<{ type: string; severity: string; date?: Date; status: string }>,
  ): CompanyAIContextIncidents {
    const open = incidents.filter(
      (incident) => incident.status.toLowerCase() !== 'cerrado',
    ).length;
    const severityMap = new Map<string, number>();
    for (const incident of incidents) {
      severityMap.set(
        incident.severity,
        (severityMap.get(incident.severity) ?? 0) + 1,
      );
    }
    return {
      total: incidents.length,
      open,
      severitySummary: Array.from(severityMap.entries()).map(([severity, count]) => ({
        severity,
        count,
      })),
      recent: incidents.slice(0, MAX_ITEMS_PER_LIST).map((incident) => ({
        type: incident.type,
        severity: incident.severity,
        date: incident.date ? this.toDate(incident.date).toISOString() : null,
        status: incident.status,
      })),
    };
  }

  /** Sección de ausentismo (AUDIT-5): agregados sin userId/descripción/soporte. */
  private buildAbsenteeismContext(data: {
    stats: { totalDiasPerdidos: number; totalCasos: number; promedioDias: number };
    records: Array<{ tipo: string; fechaInicio?: Date; dias: number }>;
  } | null): CompanyAIContextAbsenteeism {
    if (!data) {
      return { total: 0, totalDaysLost: 0, averageDays: 0, causes: [], recent: [] };
    }
    const causeMap = new Map<string, number>();
    for (const record of data.records) {
      causeMap.set(record.tipo, (causeMap.get(record.tipo) ?? 0) + 1);
    }
    return {
      total: data.stats.totalCasos,
      totalDaysLost: data.stats.totalDiasPerdidos,
      averageDays: data.stats.promedioDias,
      causes: Array.from(causeMap.entries()).map(([type, count]) => ({ type, count })),
      recent: data.records.slice(0, MAX_ITEMS_PER_LIST).map((record) => ({
        type: record.tipo,
        startDate: record.fechaInicio ? this.toDate(record.fechaInicio).toISOString() : null,
        days: record.dias,
      })),
    };
  }

  /** Sección de programas/capacitaciones (AUDIT-5): agregados sin PII. */
  private buildProgramsContext(
    programs: Array<{
      topic: string;
      date?: Date;
      attendanceControl?: { initialListUrl?: string; finalListUrl?: string };
    }>,
  ): CompanyAIContextPrograms {
    const withAttendanceControl = programs.filter(
      (program) =>
        program.attendanceControl &&
        (program.attendanceControl.initialListUrl || program.attendanceControl.finalListUrl),
    ).length;
    return {
      total: programs.length,
      withAttendanceControl,
      recent: programs.slice(0, MAX_ITEMS_PER_LIST).map((program) => ({
        topic: program.topic,
        date: program.date ? this.toDate(program.date).toISOString() : null,
      })),
    };
  }

  /** Sección de inspecciones/auditorías (AUDIT-5): agregados sin responsables ni notas. */
  private buildAuditsContext(
    audits: Array<{ title: string; status: string; plannedDate?: Date; completedDate?: Date }>,
  ): CompanyAIContextAudits {
    // Sin double-count: completado = no pendiente (completedDate es metadata).
    const pending = audits.filter((audit) => audit.status === 'pendiente').length;
    const completed = audits.length - pending;
    return {
      total: audits.length,
      pending,
      completed,
      recent: audits.slice(0, MAX_ITEMS_PER_LIST).map((audit) => ({
        title: audit.title,
        status: audit.status,
        plannedDate: audit.plannedDate ? this.toDate(audit.plannedDate).toISOString() : null,
      })),
    };
  }

  private buildDocumentsContext(
    documents: { name: string; status: DocumentStatus; expirationDate?: Date }[],
  ): CompanyAIContextDocuments {
    const now = new Date();
    const pending = documents
      .filter((document) =>
        [DocumentStatus.DRAFT, DocumentStatus.UNDER_REVIEW, DocumentStatus.PENDING_APPROVAL].includes(
          document.status,
        ),
      )
      .map((document) => document.name);
    const expired = documents
      .filter(
        (document) =>
          document.expirationDate !== undefined &&
          document.expirationDate.getTime() < now.getTime() &&
          document.status !== DocumentStatus.OBSOLETE &&
          document.status !== DocumentStatus.ARCHIVED,
      )
      .map((document) => document.name);

    const generalStatus =
      documents.length === 0
        ? 'SIN_DOCUMENTOS'
        : expired.length > 0
          ? 'CON_VENCIDOS'
          : pending.length > 0
            ? 'CON_PENDIENTES'
            : 'AL_DIA';

    return {
      total: documents.length,
      pending: pending.slice(0, MAX_ITEMS_PER_LIST),
      expired: expired.slice(0, MAX_ITEMS_PER_LIST),
      generalStatus,
    };
  }

  private buildActivitiesContext(
    activities: { title: string; status: ActivityStatus }[],
  ): CompanyAIContextActivities {
    const titlesByStatus = (status: ActivityStatus): string[] =>
      activities
        .filter((activity) => activity.status === status)
        .map((activity) => activity.title);

    const pending = titlesByStatus(ActivityStatus.PENDING);
    const delayed = titlesByStatus(ActivityStatus.DELAYED);
    const completed = titlesByStatus(ActivityStatus.COMPLETED);

    return {
      total: activities.length,
      pending: pending.slice(0, MAX_ITEMS_PER_LIST),
      delayed: delayed.slice(0, MAX_ITEMS_PER_LIST),
      completed: completed.slice(0, MAX_ITEMS_PER_LIST),
    };
  }

  /**
   * Construye la sección 1.1.7 del contexto con datos REALES del dominio.
   *
   * - Cobertura: `calculateCoverage` del dominio (misma definición que el
   *   Compliance Engine: miembros ACTIVOS con ≥1 sesión ejecutada / activos).
   * - Sesión ejecutada: `isSessionExecuted` del dominio (status 'Ejecutada' o
   *   completionDate). La IA NO reimplementa la regla.
   * - Miembros: snapshot `memberCoverage` (no re-resuelve el periodo).
   * - Evaluaciones: `evaluationAttempts` global de la entidad (no hay relación
   *   evaluación → participante en el modelo: no se inventa).
   * - Evidencias: conteos reales (legacy + estructuradas). Sin URLs.
   * - Tendencia: null (no hay histórico suficiente para una tendencia real).
   */
  private buildCopasstTrainingContext(data: {
    record: PhvaAdvancedCopasstTrainingDocument;
    coverage: CopasstTrainingCoverage;
  } | null): CompanyAIContextCopasstTraining {
    if (!data) {
      return this.emptyCopasstTrainingContext();
    }

    const { record, coverage } = data;
    const sessions = record.sessions ?? [];
    const memberCoverage = record.memberCoverage ?? [];
    const attempts = record.evaluationAttempts ?? [];

    const executed = sessions.filter((session) =>
      this.copasstTrainingService.isSessionExecuted(session),
    );
    const canceled = sessions.filter((session) => session.status === 'Cancelada');
    const notExecuted = sessions.filter(
      (session) => !this.copasstTrainingService.isSessionExecuted(session),
    );
    const now = new Date();
    const expired = notExecuted.filter(
      (session) =>
        session.expirationDate !== undefined &&
        this.toDate(session.expirationDate).getTime() < now.getTime(),
    );
    const upcoming = notExecuted.filter(
      (session) =>
        session.scheduledDate !== undefined &&
        this.toDate(session.scheduledDate).getTime() >= now.getTime(),
    );
    const scheduled = notExecuted.filter((session) => session.status !== 'Cancelada');
    const pendingMembers = memberCoverage.filter((member) => !member.trained);

    return {
      itemCode: record.itemCode ?? null,
      year: record.year ?? null,
      complianceStatus: record.complianceStatus ?? null,
      complianceReason: record.complianceReason ?? null,
      coverage: {
        percentage: coverage.coveragePercentage,
        totalMembers: coverage.totalMembers,
        trainedMembers: coverage.trainedMembers,
        pendingMembers: coverage.totalMembers - coverage.trainedMembers,
        pendingMemberNames: pendingMembers
          .map((member) => member.name)
          .slice(0, MAX_ITEMS_PER_LIST),
      },
      sessions: {
        total: sessions.length,
        executed: executed.length,
        scheduled: scheduled.length,
        canceled: canceled.length,
        expired: expired.length,
        upcoming: upcoming.length,
      },
      members: memberCoverage.slice(0, MAX_ITEMS_PER_LIST).map((member) => ({
        userId: member.userId.toString(),
        name: member.name,
        committeeRole: member.committeeRole,
        representationType: member.representationType,
        status: member.status,
        trained: member.trained,
        trainedAt: member.trainedAt ? this.toDate(member.trainedAt).toISOString() : null,
        executedSessions: member.executedSessions,
      })),
      evaluations: {
        attempts: attempts.length,
        passed: attempts.filter((attempt) => attempt.passed).length,
        failed: attempts.filter((attempt) => !attempt.passed).length,
      },
      evidences: {
        legacyCount:
          (record.attendanceEvidence ?? []).length +
          (record.signatureEvidence ?? []).length +
          (record.evidenceFiles ?? []).length +
          (record.certificates ?? []).length,
        structuredCount: (record.evidences ?? []).length,
      },
      trend: null,
    };
  }

  /** Sección 1.1.7 vacía (empresa sin entidad o módulo caído): no rompe el contrato. */
  private emptyCopasstTrainingContext(): CompanyAIContextCopasstTraining {
    return {
      itemCode: null,
      year: null,
      complianceStatus: null,
      complianceReason: null,
      coverage: {
        percentage: 0,
        totalMembers: 0,
        trainedMembers: 0,
        pendingMembers: 0,
        pendingMemberNames: [],
      },
      sessions: { total: 0, executed: 0, scheduled: 0, canceled: 0, expired: 0, upcoming: 0 },
      members: [],
      evaluations: { attempts: 0, passed: 0, failed: 0 },
      evidences: { legacyCount: 0, structuredCount: 0 },
      trend: null,
    };
  }

  /**
   * Construye la sección 1.1.8 del contexto con datos REALES del dominio.
   *
   * - Cumplimiento: `getComplianceSnapshot` del dominio (complianceStatus,
   *   complianceReason, percentage, exempt, metCriteria, missingCriteria,
   *   periodStatus, approvalStatus, evidenceCount). La IA NO reimplementa la
   *   regla (resolveCompliance vive en el dominio) y NO reconstruye el
   *   porcentaje a partir de reuniones/miembros: PENDING nunca aparece como
   *   100%.
   * - Miembros: conteo real + lista limitada (nombre, rol, representación,
   *   estado; sin documentos/teléfonos/PII innecesaria).
   * - Reuniones: conteos reales + lista limitada (fecha y estado únicamente;
   *   sin actas, sin URLs, sin asistentes).
   * - Compromisos: conteo real + agregados por estado (sin responsables ni
   *   descripciones de contenido sensible).
   * - Casos confidenciales: SOLO conteos (total/abiertos/cerrados). NUNCA se
   *   envían nombres, descripciones, evidencias ni contenido sensible.
   */
  private buildConvivenciaContext(data: {
    snapshot: ConvivenciaComplianceSnapshot;
    period: ConvivenciaPeriodDocument;
  } | null): CompanyAIContextConvivencia {
    if (!data) {
      return this.emptyConvivenciaContext();
    }

    const { snapshot, period } = data;
    const members = period.members ?? [];
    const meetings = period.meetings ?? [];
    const commitments = (period.commitments as Array<{ status?: string }> | undefined) ?? [];
    const cases = period.cases ?? [];

    const completedMeetings = meetings.filter((meeting) => meeting.status === 'CERRADA').length;

    const commitmentCounts = {
      open: commitments.filter((c) => c.status === 'OPEN').length,
      inProgress: commitments.filter((c) => c.status === 'IN_PROGRESS').length,
      completed: commitments.filter((c) => c.status === 'COMPLETED').length,
      overdue: commitments.filter((c) => c.status === 'OVERDUE').length,
      cancelled: commitments.filter((c) => c.status === 'CANCELLED').length,
    };

    return {
      available: true,
      itemCode: period.itemCode ?? CONVIVENCIA_ITEM_CODE,
      complianceStatus: snapshot.complianceStatus,
      complianceReason: snapshot.complianceReason,
      percentage: snapshot.percentage,
      exempt: snapshot.exempt,
      metCriteria: snapshot.metCriteria,
      missingCriteria: snapshot.missingCriteria,
      periodStatus: snapshot.periodStatus,
      approvalStatus: snapshot.approvalStatus,
      memberCount: members.length,
      meetingCount: meetings.length,
      completedMeetingCount: completedMeetings,
      evidenceCount: snapshot.evidenceCount,
      commitmentCount: commitments.length,
      commitmentStatusCounts: commitmentCounts,
      cases: {
        total: cases.length,
        open: cases.filter((c) => c.status !== 'CLOSED').length,
        closed: cases.filter((c) => c.status === 'CLOSED').length,
      },
      members: members.slice(0, MAX_ITEMS_PER_LIST).map((member) => ({
        userId: member.userId.toString(),
        name: member.userName,
        committeeRole: member.committeeRole,
        representationType: member.representationType,
        status: member.status,
      })),
      meetings: meetings.slice(0, MAX_ITEMS_PER_LIST).map((meeting) => ({
        meetingDate: meeting.meetingDate ? this.toDate(meeting.meetingDate).toISOString() : null,
        status: meeting.status,
      })),
    };
  }

  /** Sección 1.1.8 vacía (empresa sin periodo o módulo caído): no rompe el contrato. */
  private emptyConvivenciaContext(): CompanyAIContextConvivencia {
    return {
      available: false,
      itemCode: null,
      complianceStatus: null,
      complianceReason: null,
      percentage: 0,
      exempt: false,
      metCriteria: [],
      missingCriteria: [],
      periodStatus: '',
      approvalStatus: '',
      memberCount: 0,
      meetingCount: 0,
      completedMeetingCount: 0,
      evidenceCount: 0,
      commitmentCount: 0,
      commitmentStatusCounts: {
        open: 0,
        inProgress: 0,
        completed: 0,
        overdue: 0,
        cancelled: 0,
      },
      cases: { total: 0, open: 0, closed: 0 },
      members: [],
      meetings: [],
    };
  }

  /** Normaliza una fecha del dominio (Date o string) para comparaciones seguras. */
  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  /** Estructura PHVA vacía (sin datos) para no romper el contrato del contexto. */
  private emptyPhva(): PhvaAnalysisResult {
    return {
      overall: 0,
      planear: { percentage: 0, pending: [] },
      hacer: { percentage: 0, pending: [] },
      verificar: { percentage: 0, pending: [] },
      actuar: { percentage: 0, pending: [] },
    };
  }

  private unique(items: string[]): string[] {
    return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
