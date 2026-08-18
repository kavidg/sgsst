import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ComplianceAIEngine } from '../compliance-ai/compliance-ai.service';
import { ComplianceActionEngineService } from '../compliance-action-engine/compliance-action-engine.service';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { PhvaAnalysisService } from '../phva/phva-analysis.service';
import { AnnualWorkPlanService } from '../annual-work-plan/services/annual-work-plan.service';
import { ActivityService } from '../annual-work-plan/services/activity.service';
import { TaskService } from '../annual-work-plan/services/task.service';
import { TaskEvidenceService } from '../annual-work-plan/services/task-evidence.service';
import {
  ActivityPriority,
  PlanActivityDocument,
} from '../annual-work-plan/schemas/plan-activity.schema';
import { PlanTaskDocument } from '../annual-work-plan/schemas/plan-task.schema';
import { TaskEvidenceDocument } from '../annual-work-plan/schemas/task-evidence.schema';
import { UserDocument } from '../users/schemas/user.schema';
import {
  AI_PIPELINE_ENGINE_VERSION,
  AiAnalysisActorType,
  AiAnalysisType,
  PipelineModule,
} from './enums/pipeline-module.enum';
import {
  AiAnalysisRecord,
  AiAnalysisRecordDocument,
  AiAnalysisFindingSnapshot,
  AiAnalysisRecommendationSnapshot,
} from './schemas/ai-analysis-record.schema';

/** Actor autorizado que solicita/ejecuta un análisis (AUDIT-4). */
export interface AnalysisActor {
  /** Identidad autorizada (firebaseUid) del usuario solicitante. */
  requestedBy?: string;
  actorType: AiAnalysisActorType;
}

/** Resultado determinista de la comparación entre dos análisis históricos. */
export interface AnalysisComparison {
  analysisType: AiAnalysisType;
  scoreBefore: number;
  scoreNow: number;
  delta: number;
  findingsNew: string[];
  findingsResolved: string[];
  recommendationsNew: string[];
  recommendationsResolved: string[];
}
import { PipelineTrace, PipelineTraceDocument } from './schemas/pipeline-trace.schema';

/**
 * Trazabilidad y persistencia del pipeline PHVA → IA → findings → acciones →
 * plan anual → tareas → evidencias → verificación (AUDIT-3).
 *
 * NO duplica motores: reutiliza ComplianceAIEngine, PhvaAnalysisService,
 * ComplianceActionEngineService y AnnualWorkPlanService. Este servicio solo
 * PERSISTE los resultados (snapshots) y las RELACIONES (traces) para poder
 * responder "¿por qué existe esta acción?" con datos reales y trazables.
 *
 * Tenant isolation: TODAS las consultas/escrituras llevan companyId del
 * contexto autorizado (nunca del DTO/cliente).
 */
@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger(AiPipelineService.name);

  constructor(
    @InjectModel(AiAnalysisRecord.name)
    private readonly analysisModel: Model<AiAnalysisRecordDocument>,
    @InjectModel(PipelineTrace.name)
    private readonly traceModel: Model<PipelineTraceDocument>,
    private readonly complianceAiEngine: ComplianceAIEngine,
    private readonly complianceEngineService: ComplianceEngineService,
    private readonly phvaAnalysisService: PhvaAnalysisService,
    private readonly actionEngineService: ComplianceActionEngineService,
    private readonly annualWorkPlanService: AnnualWorkPlanService,
    private readonly activityService: ActivityService,
    private readonly taskService: TaskService,
    private readonly taskEvidenceService: TaskEvidenceService,
  ) {}

  // -------------------------------------------------------------------------
  // Análisis IA persistido
  // -------------------------------------------------------------------------

  /**
   * Ejecuta el análisis de cumplimiento (motor determinista existente) y
   * persiste un snapshot trazable e inmutable. Idempotente: mismo companyId +
   * tipo + engineVersion + contenido → mismo fingerprint → no crea duplicados
   * (índice único).
   *
   * AUDIT-4: el análisis queda versionado (engineVersion), con actor
   * (USER/SYSTEM) y vinculado a sus findings por trazas AI_ANALYSIS → FINDING.
   */
  async analyzeAndPersist(
    companyId: Types.ObjectId,
    actor: AnalysisActor = { actorType: AiAnalysisActorType.SYSTEM },
  ): Promise<AiAnalysisRecordDocument> {
    const analysis = await this.complianceAiEngine.analyzeCompliance(companyId.toString());

    // Findings/recomendaciones con los IDs REALES del Compliance Engine
    // (misma fuente que el Action Engine): los snapshots persistidos son
    // resolubles desde la traza FINDING → ACTION (relatedFindingId coincide).
    const overview = await this.complianceEngineService.getOverview(companyId.toString());
    const findings: AiAnalysisFindingSnapshot[] = overview.findings.map((finding) => ({
      id: finding.id,
      module: finding.module,
      title: finding.title,
      description: finding.description,
      priority: finding.priority,
    }));
    const recommendations: AiAnalysisRecommendationSnapshot[] = overview.recommendations.map(
      (recommendation) => ({
        id: recommendation.id,
        module: recommendation.module,
        title: recommendation.title,
        targetPhase: recommendation.targetPhase,
      }),
    );

    const fingerprint = computeAnalysisFingerprint({
      companyId: companyId.toString(),
      analysisType: AiAnalysisType.COMPLIANCE,
      engineVersion: AI_PIPELINE_ENGINE_VERSION,
      score: analysis.overall,
      findings,
      recommendations,
    });

    const existing = await this.analysisModel
      .findOne({
        companyId,
        analysisType: AiAnalysisType.COMPLIANCE,
        fingerprint,
      })
      .exec();
    if (existing) return existing;

    const record = await this.createAnalysisRecord(
      companyId,
      AiAnalysisType.COMPLIANCE,
      AI_PIPELINE_ENGINE_VERSION,
      analysis.overall,
      fingerprint,
      findings,
      recommendations,
      actor,
    );

    // Trazabilidad (AUDIT-3/AUDIT-4): análisis → cada finding detectado.
    // Nota: en la ruta idempotente (findOne previo) se devuelve el registro
    // existente sin re-crear traces: ya fueron creadas cuando el registro se
    // persistió por primera vez.
    for (const finding of findings) {
      await this.linkTrace({
        companyId,
        sourceModule: PipelineModule.AI_ANALYSIS,
        sourceEntityId: record._id.toString(),
        targetModule: PipelineModule.FINDING,
        targetEntityId: finding.id,
      });
    }

    return record;
  }

  /**
   * Persiste el análisis PHVA (mismo motor PhvaAnalysisService existente).
   */
  async analyzePhvaAndPersist(
    companyId: Types.ObjectId,
    actor: AnalysisActor = { actorType: AiAnalysisActorType.SYSTEM },
  ): Promise<AiAnalysisRecordDocument> {
    const phva = await this.phvaAnalysisService.analyzeCompanyPHVA(companyId.toString());

    const phases: Array<{ key: string; percentage: number; pending: string[] }> = [
      { key: 'PLANEAR', percentage: phva.planear.percentage, pending: phva.planear.pending },
      { key: 'HACER', percentage: phva.hacer.percentage, pending: phva.hacer.pending },
      { key: 'VERIFICAR', percentage: phva.verificar.percentage, pending: phva.verificar.pending },
      { key: 'ACTUAR', percentage: phva.actuar.percentage, pending: phva.actuar.pending },
    ];

    const findings: AiAnalysisFindingSnapshot[] = phases.flatMap((phase) =>
      phase.pending.map((title, index) => ({
        id: this.stableId('phva-finding', companyId.toString(), phase.key, title),
        module: 'phva',
        title,
        priority: 'MEDIUM',
      })),
    );

    const fingerprint = computeAnalysisFingerprint({
      companyId: companyId.toString(),
      analysisType: AiAnalysisType.PHVA,
      engineVersion: AI_PIPELINE_ENGINE_VERSION,
      score: phva.overall,
      findings,
      recommendations: [],
    });

    const existing = await this.analysisModel
      .findOne({ companyId, analysisType: AiAnalysisType.PHVA, fingerprint })
      .exec();
    if (existing) return existing;

    const record = await this.createAnalysisRecord(
      companyId,
      AiAnalysisType.PHVA,
      AI_PIPELINE_ENGINE_VERSION,
      phva.overall,
      fingerprint,
      findings,
      [],
      actor,
    );

    // Trazabilidad PHVA → findings: cada pendiente de fase queda vinculado al
    // análisis. (A diferencia del análisis de cumplimiento, el origen del
    // vínculo es la fase PHVA y no el registro AI_ANALYSIS; la cadena
    // PHVA → FINDING → ACTION → AI_ANALYSIS se resuelve igualmente.)
    for (const finding of findings) {
      await this.linkTrace({
        companyId,
        sourceModule: PipelineModule.PHVA,
        sourceEntityId: `phva:${companyId.toString()}`,
        targetModule: PipelineModule.FINDING,
        targetEntityId: finding.id,
      });
    }

    return record;
  }

  // -------------------------------------------------------------------------
  // Trazabilidad
  // -------------------------------------------------------------------------

  /** Crea un vínculo de trazabilidad de forma idempotente (índice único + E11000). */
  async linkTrace(input: {
    companyId: Types.ObjectId;
    sourceModule: PipelineModule;
    sourceEntityId: string;
    targetModule: PipelineModule;
    targetEntityId: string;
    originType?: string;
    originId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PipelineTraceDocument> {
    const query = {
      companyId: input.companyId,
      sourceModule: input.sourceModule,
      sourceEntityId: input.sourceEntityId,
      targetModule: input.targetModule,
      targetEntityId: input.targetEntityId,
    };
    const existing = await this.traceModel.findOne(query).exec();
    if (existing) return existing;

    try {
      return await this.traceModel.create({ ...input });
    } catch (error) {
      // Carrera entre dos instancias: el índice único gana; devolvemos el
      // vínculo ya creado en lugar de fallar (idempotencia fail-closed).
      if (!this.isDuplicateKeyError(error)) throw error;
      const concurrent = await this.traceModel.findOne(query).exec();
      if (concurrent) return concurrent;
      throw error;
    }
  }

  /** Trazabilidad completa del pipeline de una empresa (tenant-scoped). */
  async getCompanyTrace(companyId: Types.ObjectId): Promise<PipelineTraceDocument[]> {
    return this.traceModel.find({ companyId }).sort({ createdAt: 1 }).exec();
  }

  /**
   * Historial de análisis persistidos de una empresa (tenant-scoped), ordenado
   * por createdAt DESC. AUDIT-4: paginación opcional (limit/offset) y nunca
   * recalcula el engine: lee únicamente los snapshots persistidos.
   */
  async getCompanyAnalyses(
    companyId: Types.ObjectId,
    options?: { limit?: number; offset?: number },
  ): Promise<AiAnalysisRecordDocument[]> {
    let query = this.analysisModel.find({ companyId }).sort({ createdAt: -1 });
    if (options?.limit && options.limit > 0) query = query.limit(options.limit);
    if (options?.offset && options.offset > 0) query = query.skip(options.offset);
    return query.exec();
  }

  /** Último análisis persistido de la empresa (tenant-scoped) o null. */
  async getLatestAnalysis(companyId: Types.ObjectId): Promise<AiAnalysisRecordDocument | null> {
    return this.analysisModel.findOne({ companyId }).sort({ createdAt: -1 }).exec();
  }

  /**
   * Consulta un análisis por id garantizando tenant isolation: si el id
   * pertenece a otra empresa devuelve NotFound genérico (sin revelar
   * existencia cross-tenant). NUNCA recalcula el snapshot histórico.
   */
  async getAnalysisScoped(companyId: Types.ObjectId, analysisId: string): Promise<AiAnalysisRecordDocument> {
    if (!Types.ObjectId.isValid(analysisId)) {
      throw new BadRequestException('Invalid analysisId');
    }
    const record = await this.analysisModel
      .findOne({ _id: new Types.ObjectId(analysisId), companyId })
      .exec();
    if (!record) throw new NotFoundException('Analysis not found');
    return record;
  }

  /**
   * Comparación determinista entre dos análisis históricos del mismo tenant.
   *
   * Calcula: delta de score, findings nuevos/resueltos y recomendaciones
   * nuevas/resueltas (por id). NO modifica los análisis (operación pura).
   */
  async compareAnalyses(
    companyId: Types.ObjectId,
    currentId: string,
    previousId: string,
  ): Promise<AnalysisComparison> {
    const current = await this.getAnalysisScoped(companyId, currentId);
    const previous = await this.getAnalysisScoped(companyId, previousId);

    // Solo tiene sentido comparar análisis del mismo tipo: el delta entre un
    // COMPLIANCE y un PHVA sería un número sin significado.
    if (current.analysisType !== previous.analysisType) {
      throw new BadRequestException('Cannot compare analyses of different types');
    }

    const currentFindingIds = new Set(current.findings.map((finding) => finding.id));
    const previousFindingIds = new Set(previous.findings.map((finding) => finding.id));
    const currentRecommendationIds = new Set(
      current.recommendations.map((recommendation) => recommendation.id),
    );
    const previousRecommendationIds = new Set(
      previous.recommendations.map((recommendation) => recommendation.id),
    );

    return {
      analysisType: current.analysisType,
      scoreBefore: previous.score,
      scoreNow: current.score,
      delta: Math.round((current.score - previous.score) * 100) / 100,
      findingsNew: current.findings
        .filter((finding) => !previousFindingIds.has(finding.id))
        .map((finding) => finding.id),
      findingsResolved: previous.findings
        .filter((finding) => !currentFindingIds.has(finding.id))
        .map((finding) => finding.id),
      recommendationsNew: current.recommendations
        .filter((recommendation) => !previousRecommendationIds.has(recommendation.id))
        .map((recommendation) => recommendation.id),
      recommendationsResolved: previous.recommendations
        .filter((recommendation) => !currentRecommendationIds.has(recommendation.id))
        .map((recommendation) => recommendation.id),
    };
  }

  // -------------------------------------------------------------------------
  // Finding → Action → Annual Work Plan (materialización)
  // -------------------------------------------------------------------------

  /**
   * Convierte una recomendación/acción del Action Engine en una actividad del
   * plan anual reutilizando AnnualWorkPlanService (nunca escritura directa).
   *
   * Idempotente: si la acción ya fue materializada (trace ACTION → ACTIVITY),
   * devuelve la actividad existente sin duplicarla.
   */
  async materializeAction(companyId: Types.ObjectId, actionId: string, user: UserDocument): Promise<PlanActivityDocument> {
    const recommendations = await this.actionEngineService.getRecommendations(companyId.toString());
    const recommendation = recommendations.find((action) => action.id === actionId);
    if (!recommendation) {
      throw new NotFoundException('Action recommendation not found');
    }

    const existingLink = await this.traceModel
      .findOne({
        companyId,
        sourceModule: PipelineModule.ACTION,
        sourceEntityId: recommendation.id,
        targetModule: PipelineModule.ACTIVITY,
      })
      .exec();
    if (existingLink) {
      // La actividad existente se reutiliza; si fue eliminada, se re-materializa.
      try {
        return await this.activityService.findById(new Types.ObjectId(existingLink.targetEntityId));
      } catch {
        // Re-materializar: la traza obsoleta se reemplaza al crear la nueva.
        await this.traceModel.deleteOne({ _id: existingLink._id }).exec();
      }
    }

    const plan = await this.annualWorkPlanService.findOrCreateCurrent(companyId, user);
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + recommendation.estimatedDurationDays);

    const created = await this.annualWorkPlanService.createActivity(
      plan._id,
      {
        title: recommendation.title,
        description: recommendation.description,
        sourceModule: 'compliance-action-engine',
        startDate: today.toISOString(),
        endDate: endDate.toISOString(),
        responsibleUser: user._id.toString(),
        priority: this.mapPriority(recommendation.priority),
        estimatedCost: recommendation.estimatedCost,
      },
      user,
    );
    const activity = created as PlanActivityDocument;

    // Trazabilidad: action → actividad + finding → action.
    await this.linkTrace({
      companyId,
      sourceModule: PipelineModule.ACTION,
      sourceEntityId: recommendation.id,
      targetModule: PipelineModule.ACTIVITY,
      targetEntityId: activity._id.toString(),
    });
    if (recommendation.relatedFindingId) {
      await this.linkTrace({
        companyId,
        sourceModule: PipelineModule.FINDING,
        sourceEntityId: recommendation.relatedFindingId,
        targetModule: PipelineModule.ACTION,
        targetEntityId: recommendation.id,
      });

      // AUDIT-4: action → análisis de origen. Permite responder "¿qué análisis
      // produjo esta acción?": se vincula al análisis de cumplimiento cuyo
      // snapshot contiene el finding que originó la recomendación.
      const sourceAnalysis = await this.analysisModel
        .findOne({
          companyId,
          analysisType: AiAnalysisType.COMPLIANCE,
          'findings.id': recommendation.relatedFindingId,
        })
        .sort({ createdAt: -1 })
        .exec();
      if (sourceAnalysis) {
        await this.linkTrace({
          companyId,
          sourceModule: PipelineModule.ACTION,
          sourceEntityId: recommendation.id,
          targetModule: PipelineModule.AI_ANALYSIS,
          targetEntityId: sourceAnalysis._id.toString(),
        });
      }
    }

    return activity;
  }

  // -------------------------------------------------------------------------
  // Evidencias
  // -------------------------------------------------------------------------

  /**
   * Vincula una evidencia a una tarea reutilizando TaskEvidenceService y
   * registra la traza TASK → EVIDENCE (idempotente).
   */
  async linkEvidenceToTask(
    companyId: Types.ObjectId,
    taskId: Types.ObjectId,
    fileUrl: string,
    fileType: string,
    uploadedBy: Types.ObjectId,
  ): Promise<TaskEvidenceDocument> {
    const task = await this.findTaskScoped(companyId, taskId);

    const created = await this.taskEvidenceService.create(taskId, fileUrl, fileType, uploadedBy);
    const evidence = created as TaskEvidenceDocument;

    await this.linkTrace({
      companyId,
      sourceModule: PipelineModule.TASK,
      sourceEntityId: taskId.toString(),
      targetModule: PipelineModule.EVIDENCE,
      targetEntityId: evidence._id.toString(),
      originType: 'task-evidence',
    });

    return evidence;
  }

  // -------------------------------------------------------------------------
  // Verificación
  // -------------------------------------------------------------------------

  /**
   * Cierre lógico del pipeline: evidencia → verificación.
   *
   * Distingue explícitamente:
   * - evidence submitted (existe evidencia vinculada)
   * - verification recorded (se registra el acto de verificación con actor y fecha)
   *
   * NO marca la acción como "efectiva" automáticamente: el sistema no tiene
   * ese concepto; aquí solo se registra la verificación y se re-calculan los
   * indicadores del plan anual (reassess). Devuelve la traza creada.
   */
  async verifyEvidence(
    companyId: Types.ObjectId,
    taskId: Types.ObjectId,
    verifiedBy: UserDocument,
  ): Promise<PipelineTraceDocument> {
    const task = await this.findTaskScoped(companyId, taskId);
    const evidences = await this.taskEvidenceService.findByTask(taskId);

    if (evidences.length === 0) {
      throw new NotFoundException('Task has no evidence to verify');
    }

    const verificationId = `verification:${taskId.toString()}:${Date.now()}`;
    const trace = await this.linkTrace({
      companyId,
      sourceModule: PipelineModule.TASK,
      sourceEntityId: taskId.toString(),
      targetModule: PipelineModule.VERIFICATION,
      targetEntityId: verificationId,
      originType: 'evidence-verification',
      metadata: {
        evidenceCount: evidences.length,
        verifiedBy: verifiedBy.email ?? verifiedBy._id.toString(),
        verifiedAt: new Date().toISOString(),
        status: 'VERIFIED',
      },
    });

    // Reassess: recalcula el cumplimiento del plan anual que contiene la tarea.
    await this.reassessPlan(companyId, task);

    return trace;
  }

  /**
   * Crea el registro de análisis tolerando la carrera de idempotencia:
   * si dos instancias crean el mismo fingerprint simultáneamente, el índice
   * único lanza E11000; se captura y se devuelve el registro existente
   * (fail-closed, sin duplicados, sin 500).
   */
  private async createAnalysisRecord(
    companyId: Types.ObjectId,
    analysisType: AiAnalysisType,
    engineVersion: string,
    score: number,
    fingerprint: string,
    findings: AiAnalysisFindingSnapshot[],
    recommendations: AiAnalysisRecommendationSnapshot[],
    actor: AnalysisActor,
  ): Promise<AiAnalysisRecordDocument> {
    const document = {
      companyId,
      analysisType,
      engineVersion,
      score,
      fingerprint,
      findings,
      recommendations,
      actorType: actor.actorType,
      requestedBy: actor.requestedBy,
      expiresAt: new Date(Date.now() + ANALYSIS_RETENTION_MS),
    };
    try {
      return await this.analysisModel.create(document);
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const existing = await this.analysisModel
        .findOne({ companyId, analysisType, fingerprint })
        .exec();
      if (existing) return existing;
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Resuelve una tarea garantizando que pertenece a la empresa (tenant-scoped). */
  private async findTaskScoped(companyId: Types.ObjectId, taskId: Types.ObjectId): Promise<PlanTaskDocument> {
    const task = await this.taskService.findById(taskId);
    const activity = await this.activityService.findById(task.activityId);
    const plan = await this.annualWorkPlanService.findById(activity.annualPlanId);
    if (plan.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  /** Recalcula el cumplimiento del plan anual de la tarea (reassess). */
  private async reassessPlan(companyId: Types.ObjectId, task: PlanTaskDocument): Promise<void> {
    try {
      const activity = await this.activityService.findById(task.activityId);
      const plan = await this.annualWorkPlanService.findById(activity.annualPlanId);
      if (plan.companyId.toString() !== companyId.toString()) return;
      await this.annualWorkPlanService.recalculateCompliance(plan._id);
    } catch (error) {
      this.logger.debug(`Reassess skipped: ${this.errorMessage(error)}`);
    }
  }

  private mapPriority(priority: string): ActivityPriority {
    switch (priority) {
      case 'CRITICAL':
        return ActivityPriority.CRITICAL;
      case 'HIGH':
        return ActivityPriority.HIGH;
      case 'LOW':
        return ActivityPriority.LOW;
      default:
        return ActivityPriority.MEDIUM;
    }
  }

  /** Id estable y determinista para entidades efímeras (findings/recomendaciones). */
  private stableId(...parts: string[]): string {
    return createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    const code = (error as { code?: number } | null)?.code;
    return code === 11000;
  }
}

/** Retención de análisis persistidos: 90 días. */
const ANALYSIS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Fingerprint de idempotencia del análisis (AUDIT-4).
 *
 * Función pura exportada para tests: representa el INPUT relevante del
 * análisis (empresa + tipo + versión del motor + score + findings +
 * recomendaciones). Incluye engineVersion: si el motor cambia sus reglas,
 * el fingerprint cambia y se genera un análisis nuevo (historial versionado).
 * No usa timestamp: mismo input → mismo fingerprint (idempotencia).
 */
export function computeAnalysisFingerprint(input: {
  companyId: string;
  analysisType: AiAnalysisType;
  engineVersion: string;
  score: number;
  findings: AiAnalysisFindingSnapshot[];
  recommendations: AiAnalysisRecommendationSnapshot[];
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
