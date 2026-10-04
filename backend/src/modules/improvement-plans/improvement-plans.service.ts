import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { DocumentMaster } from '../document-management/schemas/document-master.schema';
import {
  ImprovementPlan,
  ImprovementPlanActivity,
  ImprovementPlanActivityFollowUp,
  ImprovementPlanDocument,
  ImprovementPlanEvidence,
  ImprovementPlanObjective,
  ImprovementPlanResource,
  ImprovementPlanMonitoring,
  ImprovementPlanActivityStatus,
  ImprovementPlanStatus,
} from './schemas/improvement-plan.schema';
import {
  IMPROVEMENT_PLAN_ACTIVITY_TRANSITIONS,
  IMPROVEMENT_PLAN_TRANSITIONS,
  isActivityTransitionValid,
  isImprovementPlanTransitionValid,
} from './schemas/improvement-plan-lifecycle.schema';
import {
  ImprovementPlanHistory,
  ImprovementPlanHistoryAction,
  ImprovementPlanHistoryDocument,
} from './schemas/improvement-plan-history.schema';
import {
  AddPlanActivityEvidenceDto,
  AddPlanMonitoringDto,
  CreateImprovementPlanDto,
  CreatePlanActivityDto,
  RegisterPlanActivityFollowUpDto,
  UpdateImprovementPlanDto,
  UpdateImprovementPlanStatusDto,
  UpdatePlanActivityDto,
  UpdatePlanActivityStatusDto,
} from './dto/improvement-plan.dto';

/**
 * E1 (7.1.4) — Service del dominio IMPROVEMENT-PLANS (Plan de mejoramiento).
 *
 * Seguridad y trazabilidad (patrón 7.1.1/7.1.2/7.1.3):
 * - TODAS las operaciones son tenant-scoped: el companyId proviene del usuario
 *   autenticado (resuelto en el controller) y se incluye en cada query. NUNCA
 *   existe findById sin tenant. Un id de otra empresa produce 404.
 * - Historial SERVER-SIDE y APPEND-ONLY (CREATE, UPDATE, STATUS_CHANGE,
 *   ACTIVITY_CREATED, ACTIVITY_UPDATED, ACTIVITY_STATUS_CHANGED,
 *   EVIDENCE_ADDED, FOLLOW_UP, MONITORING_ADDED, COMPLETED, CLOSED,
 *   CANCELLED); el cliente nunca puede enviarlo ni alterarlo.
 * - Usuarios tenant-safe: validación {_id, companyId} con UN query $in
 *   agrupado por operación (sin N+1); snapshots server-side.
 * - DocumentMaster validado tenant-safe ({_id, companyId}); sin upload propio.
 * - Lifecycle del plan y de actividades server-side; OVERDUE es DERIVADO
 *   (NUNCA persistido). COMPLETED/CLOSED con reglas de cierre explícitas.
 * - SIN SCORING: este service no calcula percentage/compliance/findings —
 *   E1 solo captura y administra datos (scorer/provider llegan en E2).
 * - Origen DECLARATIVO: originReferenceId nunca dispara queries cruzadas
 *   (AnnualAudit/Incidents/ManagementReviewDirection/etc. no se consultan).
 */
@Injectable()
export class ImprovementPlansService {
  constructor(
    @InjectModel(ImprovementPlan.name)
    private readonly planModel: Model<ImprovementPlanDocument>,
    @InjectModel(ImprovementPlanHistory.name)
    private readonly historyModel: Model<ImprovementPlanHistoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // Referencia declarativa de evidencia (solo validación tenant-safe).
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMaster>,
  ) {}

  // ── Creación ────────────────────────────────────────────────────────────

  async create(
    companyId: Types.ObjectId,
    dto: CreateImprovementPlanDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    this.assertPlanDates(dto.startDate, dto.endDate);

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    try {
      const created = await this.planModel.create({
        // companyId SIEMPRE server-side: se aplica DESPUÉS del spread para que
        // ningún campo del payload pueda sobrescribirlo.
        ...dto,
        companyId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: ImprovementPlanStatus.DRAFT,
        objectives: (dto.objectives ?? []).map((o) => ({ ...o })),
        resources: (dto.resources ?? []).map((r) => ({ ...r })),
        activities: [],
        monitoring: [],
        responsibleUserSnapshot: dto.responsibleUserId
          ? await this.resolveUserSnapshot(companyId, dto.responsibleUserId)
          : undefined,
        closureDate: undefined,
        closedByUserId: undefined,
        closedByUserSnapshot: undefined,
        createdBy: actor.userId,
        createdBySnapshot: actor.userEmail,
      });

      await this.recordHistory(companyId, created._id, actor, ImprovementPlanHistoryAction.CREATE, 'Plan de mejoramiento creado', {
        after: { code: created.code, title: created.title, origin: created.origin },
      }, created.code);

      return created;
    } catch (err) {
      // Índice único {companyId, code} (E11000) → conflicto de código.
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException(`El code '${dto.code}' ya existe en esta empresa`);
      }
      throw err;
    }
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  async findAll(
    companyId: Types.ObjectId,
    filters: { status?: string; year?: number; responsibleUserId?: string } = {},
  ): Promise<ImprovementPlanDocument[]> {
    const query: Record<string, unknown> = { companyId };
    if (filters.status) query.status = filters.status;
    if (filters.year) query.year = filters.year;
    if (filters.responsibleUserId && Types.ObjectId.isValid(filters.responsibleUserId)) {
      query.responsibleUserId = new Types.ObjectId(filters.responsibleUserId);
    }
    return this.planModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /** {_id, companyId} SIEMPRE: cross-tenant → 404 (indistinguible de inexistente). */
  async findById(companyId: Types.ObjectId, id: string): Promise<ImprovementPlanDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`ImprovementPlan with id ${id} not found`);
    }
    const plan = await this.planModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();
    if (!plan) {
      throw new NotFoundException(`ImprovementPlan with id ${id} not found`);
    }
    return plan;
  }

  async getHistory(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<ImprovementPlanHistory[]> {
    await this.findById(companyId, id); // 404 si no es del tenant
    return this.historyModel
      .find({ companyId, planId: new Types.ObjectId(id) })
      .sort({ createdAt: 1 })
      .exec();
  }

  // ── Actualización del plan ──────────────────────────────────────────────

  async update(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateImprovementPlanDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    this.assertPlanEditable(plan.status);

    const nextStart = dto.startDate ?? plan.startDate.toISOString();
    const nextEnd = dto.endDate ?? plan.endDate.toISOString();
    this.assertPlanDates(nextStart, nextEnd);

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const previous = {
      title: plan.title,
      priority: plan.priority,
      responsibleUserId: plan.responsibleUserId?.toString(),
    };

    if (dto.title !== undefined) plan.title = dto.title;
    if (dto.description !== undefined) plan.description = dto.description;
    if (dto.period !== undefined) plan.period = dto.period;
    if (dto.year !== undefined) plan.year = dto.year;
    if (dto.origin !== undefined) plan.origin = dto.origin;
    if (dto.originReferenceId !== undefined) {
      plan.originReferenceId = dto.originReferenceId ? new Types.ObjectId(dto.originReferenceId) : undefined;
    }
    if (dto.originDescription !== undefined) plan.originDescription = dto.originDescription;
    if (dto.priority !== undefined) plan.priority = dto.priority;
    if (dto.prioritizationCriteria !== undefined) plan.prioritizationCriteria = dto.prioritizationCriteria;
    if (dto.startDate !== undefined) plan.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) plan.endDate = new Date(dto.endDate);
    if (dto.responsibleUserId !== undefined) {
      plan.responsibleUserId = dto.responsibleUserId ? new Types.ObjectId(dto.responsibleUserId) : undefined;
      plan.responsibleUserSnapshot = dto.responsibleUserId
        ? await this.resolveUserSnapshot(companyId, dto.responsibleUserId)
        : undefined;
    }
    if (dto.objectives !== undefined) {
      // Reemplazo completo de objetivos; objectiveId server-side (OBJ-001…).
      plan.objectives = dto.objectives.map((o, i) => ({
        objectiveId: `OBJ-${String(i + 1).padStart(3, '0')}`,
        description: o.description,
        ...(o.target ? { target: o.target } : {}),
        ...(o.indicator ? { indicator: o.indicator } : {}),
        ...(o.observations ? { observations: o.observations } : {}),
      })) as ImprovementPlanObjective[];
    }
    if (dto.resources !== undefined) {
      plan.resources = dto.resources.map((r) => ({ ...r })) as ImprovementPlanResource[];
    }
    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;

    const saved = await plan.save();

    await this.recordHistory(companyId, plan._id, actor, ImprovementPlanHistoryAction.UPDATE, 'Plan de mejoramiento actualizado', {
      before: previous,
      after: { title: saved.title, priority: saved.priority, status: saved.status },
    }, saved.code);

    return saved;
  }

  // ── Estado del plan (máquina de estados; único punto de cambio) ─────────

  async changeStatus(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateImprovementPlanStatusDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    const current = plan.status;
    const next = dto.status as ImprovementPlanStatus;

    if (!Object.values(ImprovementPlanStatus).includes(next)) {
      throw new BadRequestException(`Estado inválido: ${dto.status}`);
    }
    if (current === next) {
      throw new BadRequestException(`El plan ya está en estado ${current}`);
    }
    if (!isImprovementPlanTransitionValid(current, next)) {
      throw new BadRequestException(
        `Transición inválida: ${current} → ${next}. Permitidas: ${IMPROVEMENT_PLAN_TRANSITIONS_LABELS(current) || 'ninguna'}`,
      );
    }

    if (next === ImprovementPlanStatus.COMPLETED) {
      this.assertPlanCompletable(plan);
      plan.closureDate = plan.closureDate ?? new Date();
    }

    if (next === ImprovementPlanStatus.CLOSED) {
      // CLOSED solo desde COMPLETED: exige plan completado + trazabilidad.
      if (current !== ImprovementPlanStatus.COMPLETED) {
        throw new BadRequestException('Solo un plan COMPLETED puede pasar a CLOSED');
      }
      plan.closureDate = plan.closureDate ?? new Date();
      plan.closedByUserId = actor.userId;
      plan.closedByUserSnapshot = actor.userEmail;
      if (dto.closureObservations?.trim()) {
        plan.closureObservations = dto.closureObservations.trim();
      }
    }

    const previous = { status: current };
    plan.status = next;
    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;
    const saved = await plan.save();

    const historyAction =
      next === ImprovementPlanStatus.COMPLETED
        ? ImprovementPlanHistoryAction.COMPLETED
        : next === ImprovementPlanStatus.CLOSED
          ? ImprovementPlanHistoryAction.CLOSED
          : next === ImprovementPlanStatus.CANCELLED
            ? ImprovementPlanHistoryAction.CANCELLED
            : ImprovementPlanHistoryAction.STATUS_CHANGE;

    await this.recordHistory(
      companyId,
      plan._id,
      actor,
      historyAction,
      dto.closureObservations?.trim() || `Estado del plan: ${current} → ${next}`,
      { before: previous, after: { status: next } },
      saved.code,
    );

    return saved;
  }

  // ── Actividades ─────────────────────────────────────────────────────────

  async createActivity(
    companyId: Types.ObjectId,
    id: string,
    dto: CreatePlanActivityDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    this.assertPlanEditable(plan.status);

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }
    if (dto.plannedDate && dto.dueDate) {
      this.assertActivityDates({ plannedDate: new Date(dto.plannedDate), dueDate: new Date(dto.dueDate) });
    }

    const activity: ImprovementPlanActivity = {
      activityId: this.nextActivityId(plan),
      description: dto.description,
      ...(dto.responsibleUserId
        ? {
            responsibleUserId: new Types.ObjectId(dto.responsibleUserId),
            responsibleUserSnapshot: await this.resolveUserSnapshot(companyId, dto.responsibleUserId),
          }
        : {}),
      ...(dto.plannedDate ? { plannedDate: new Date(dto.plannedDate) } : {}),
      ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
      status: ImprovementPlanActivityStatus.PENDING,
      progress: 0,
    } as unknown as ImprovementPlanActivity;

    plan.activities = [...(plan.activities ?? []), activity];
    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;
    const saved = await plan.save();

    await this.recordHistory(companyId, plan._id, actor, ImprovementPlanHistoryAction.ACTIVITY_CREATED, 'Actividad creada', {
      activityId: activity.activityId,
      after: { description: activity.description, status: activity.status },
    }, saved.code);

    return saved;
  }

  async updateActivity(
    companyId: Types.ObjectId,
    id: string,
    activityId: string,
    dto: UpdatePlanActivityDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    this.assertPlanEditable(plan.status);
    const activity = this.findActivity(plan, activityId);
    this.assertActivityEditable(activity);

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const previous = { description: activity.description, status: activity.status, progress: activity.progress };

    if (dto.description !== undefined) activity.description = dto.description;
    if (dto.responsibleUserId !== undefined) {
      activity.responsibleUserId = dto.responsibleUserId ? new Types.ObjectId(dto.responsibleUserId) : undefined;
      activity.responsibleUserSnapshot = dto.responsibleUserId
        ? await this.resolveUserSnapshot(companyId, dto.responsibleUserId)
        : undefined;
    }
    if (dto.plannedDate !== undefined) activity.plannedDate = dto.plannedDate ? new Date(dto.plannedDate) : undefined;
    if (dto.dueDate !== undefined) activity.dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (dto.progress !== undefined) activity.progress = dto.progress;
    if (dto.observations !== undefined) activity.observations = dto.observations;

    this.assertActivityDates(activity);

    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;
    const saved = await plan.save();

    await this.recordHistory(companyId, plan._id, actor, ImprovementPlanHistoryAction.ACTIVITY_UPDATED, 'Actividad actualizada', {
      activityId,
      before: previous,
      after: { description: activity.description, progress: activity.progress },
    }, saved.code);

    return saved;
  }

  async changeActivityStatus(
    companyId: Types.ObjectId,
    id: string,
    activityId: string,
    dto: UpdatePlanActivityStatusDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    this.assertPlanEditable(plan.status);
    const activity = this.findActivity(plan, activityId);
    this.assertActivityEditable(activity);

    const current = activity.status;
    if (current === dto.status) {
      throw new BadRequestException(`La actividad ya está en estado ${current}`);
    }
    if (!isActivityTransitionValid(current, dto.status)) {
      throw new BadRequestException(
        `Transición inválida: ${current} → ${dto.status}. Permitidas: ${ACTIVITY_TRANSITIONS_LABELS(current) || 'ninguna'}`,
      );
    }

    const previous = { status: current };
    activity.status = dto.status;
    if (dto.status === ImprovementPlanActivityStatus.COMPLETED) {
      // COMPLETED exige executionDate registrada y no futura.
      if (!dto.executionDate && !activity.executionDate) {
        throw new BadRequestException(
          'No se puede COMPLETED sin executionDate registrada (registre la fecha de ejecución de la actividad)',
        );
      }
      if (dto.executionDate) {
        activity.executionDate = new Date(dto.executionDate);
      }
      this.assertNotFutureDate(activity.executionDate as Date, 'executionDate');
      activity.progress = 100;
    }

    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;
    const saved = await plan.save();

    await this.recordHistory(companyId, plan._id, actor, ImprovementPlanHistoryAction.ACTIVITY_STATUS_CHANGED, dto.comment?.trim() || `Estado de actividad: ${current} → ${dto.status}`, {
      activityId,
      before: previous,
      after: { status: dto.status, executionDate: activity.executionDate },
    }, saved.code);

    return saved;
  }

  // ── Evidencia de actividad ──────────────────────────────────────────────

  async addActivityEvidence(
    companyId: Types.ObjectId,
    id: string,
    activityId: string,
    dto: AddPlanActivityEvidenceDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    this.assertPlanEditable(plan.status);
    const activity = this.findActivity(plan, activityId);
    this.assertActivityEditable(activity);

    if (!dto.documentId && !dto.evidenceUrl?.trim()) {
      throw new BadRequestException('La evidencia requiere documentId (DocumentManagement) o evidenceUrl');
    }
    const documentSnapshot = await this.resolveDocumentRef(companyId, dto.documentId);

    const previous = activity.evidence
      ? ({ documentId: activity.evidence.documentId, evidenceUrl: activity.evidence.evidenceUrl } as Record<string, unknown>)
      : undefined;

    activity.evidence = {
      ...(dto.documentId ? { documentId: new Types.ObjectId(dto.documentId) } : {}),
      ...(documentSnapshot ? { documentSnapshot } : {}),
      ...(dto.evidenceUrl?.trim() ? { evidenceUrl: dto.evidenceUrl.trim() } : {}),
      ...(dto.comment?.trim() ? { comment: dto.comment.trim() } : {}),
    } as ImprovementPlanEvidence;
    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;
    const saved = await plan.save();

    await this.recordHistory(companyId, plan._id, actor, ImprovementPlanHistoryAction.EVIDENCE_ADDED, 'Evidencia de actividad registrada', {
      activityId,
      before: previous,
      after: { documentId: dto.documentId, evidenceUrl: dto.evidenceUrl },
    }, saved.code);

    return saved;
  }

  // ── Follow-up de actividad ──────────────────────────────────────────────

  async registerActivityFollowUp(
    companyId: Types.ObjectId,
    id: string,
    activityId: string,
    dto: RegisterPlanActivityFollowUpDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    this.assertPlanEditable(plan.status);
    const activity = this.findActivity(plan, activityId);
    this.assertActivityEditable(activity);

    const followUpDate = dto.followUpDate ? new Date(dto.followUpDate) : new Date();
    this.assertNotFutureDate(followUpDate, 'followUpDate');

    const previous = activity.followUp
      ? ({ followUpDate: activity.followUp.followUpDate, implementationStatus: activity.followUp.implementationStatus } as Record<string, unknown>)
      : undefined;

    activity.followUp = {
      followUpDate,
      ...(dto.observations?.trim() ? { observations: dto.observations.trim() } : {}),
      ...(dto.implementationStatus ? { implementationStatus: dto.implementationStatus } : {}),
      ...(dto.perceivedEffectiveness ? { perceivedEffectiveness: dto.perceivedEffectiveness } : {}),
      ...(dto.requiresContinuedFollowUp !== undefined ? { requiresContinuedFollowUp: dto.requiresContinuedFollowUp } : {}),
    } as ImprovementPlanActivityFollowUp;
    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;
    const saved = await plan.save();

    await this.recordHistory(companyId, plan._id, actor, ImprovementPlanHistoryAction.FOLLOW_UP, 'Seguimiento de actividad registrado', {
      activityId,
      before: previous,
      after: {
        implementationStatus: dto.implementationStatus,
        perceivedEffectiveness: dto.perceivedEffectiveness,
        requiresContinuedFollowUp: dto.requiresContinuedFollowUp,
      },
    }, saved.code);

    return saved;
  }

  // ── Seguimiento periódico del plan (independiente de las actividades) ───

  async addMonitoring(
    companyId: Types.ObjectId,
    id: string,
    dto: AddPlanMonitoringDto,
    actor: ImprovementPlanActor,
  ): Promise<ImprovementPlanDocument> {
    const plan = await this.findById(companyId, id);
    this.assertPlanEditable(plan.status);

    const date = new Date(dto.date);
    this.assertNotFutureDate(date, 'date');
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('date inválida');
    }

    const monitoring: ImprovementPlanMonitoring = {
      monitoringId: this.nextMonitoringId(plan),
      date,
      ...(dto.progress !== undefined ? { progress: dto.progress } : {}),
      ...(dto.deviations?.trim() ? { deviations: dto.deviations.trim() } : {}),
      ...(dto.adjustmentActions?.trim() ? { adjustmentActions: dto.adjustmentActions.trim() } : {}),
      ...(dto.observations?.trim() ? { observations: dto.observations.trim() } : {}),
    };

    plan.monitoring = [...(plan.monitoring ?? []), monitoring];
    plan.updatedBy = actor.userId;
    plan.updatedBySnapshot = actor.userEmail;
    const saved = await plan.save();

    await this.recordHistory(companyId, plan._id, actor, ImprovementPlanHistoryAction.MONITORING_ADDED, 'Seguimiento periódico registrado', {
      monitoringId: monitoring.monitoringId,
      after: { date: monitoring.date, progress: monitoring.progress, deviations: monitoring.deviations },
    }, saved.code);

    return saved;
  }

  // ── Eliminación (solo DRAFT; evidencia histórica se preserva con CANCELLED) ──

  async remove(
    companyId: Types.ObjectId,
    id: string,
    actor: ImprovementPlanActor,
  ): Promise<void> {
    const plan = await this.findById(companyId, id);
    if (plan.status !== ImprovementPlanStatus.DRAFT) {
      throw new BadRequestException(
        'Solo un plan en estado DRAFT puede eliminarse; use CANCELLED para planes en curso (trazabilidad histórica)',
      );
    }
    await this.historyModel
      .deleteMany({ companyId, planId: plan._id })
      .exec();
    await this.planModel
      .deleteOne({ _id: plan._id, companyId })
      .exec();
  }

  // ── Validaciones privadas ───────────────────────────────────────────────

  /** Coherencia del cronograma: endDate >= startDate y fechas válidas. */
  private assertPlanDates(startDate: string | Date, endDate: string | Date): void {
    const start = startDate instanceof Date ? startDate.getTime() : new Date(startDate).getTime();
    const end = endDate instanceof Date ? endDate.getTime() : new Date(endDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new BadRequestException('startDate/endDate inválidas');
    }
    if (end < start) {
      throw new BadRequestException('endDate no puede ser anterior a startDate');
    }
  }

  /** Coherencia de fechas de actividad: plannedDate <= dueDate. */
  private assertActivityDates(a: { plannedDate?: Date | null; dueDate?: Date | null; executionDate?: Date | null }): void {
    if (a.plannedDate && a.dueDate && a.plannedDate.getTime() > a.dueDate.getTime()) {
      throw new BadRequestException('dueDate no puede ser anterior a plannedDate');
    }
    if (a.executionDate && a.plannedDate && a.executionDate.getTime() < a.plannedDate.getTime()) {
      throw new BadRequestException('executionDate no puede ser anterior a plannedDate');
    }
  }

  /** Ninguna fecha operativa se acepta en el futuro (planned/due/execution/follow-up/monitoring). */
  private assertNotFutureDate(date: Date | string, field: string): void {
    const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
    if (Number.isNaN(t)) {
      throw new BadRequestException(`${field} inválida`);
    }
    if (t > Date.now()) {
      throw new BadRequestException(`${field} no puede ser una fecha futura`);
    }
  }

  /** DRAFT/SUBMITTED/IN_PROGRESS editable; COMPLETED/CLOSED/CANCELLED protegidos. */
  private assertPlanEditable(status: ImprovementPlanStatus): void {
    if (status === ImprovementPlanStatus.CLOSED || status === ImprovementPlanStatus.CANCELLED) {
      throw new BadRequestException(`El plan está en estado terminal (${status}) y no admite modificaciones`);
    }
    if (status === ImprovementPlanStatus.COMPLETED) {
      throw new BadRequestException('El plan está COMPLETED: solo puede cerrarse (CLOSED) o cancelarse; no admite ediciones de contenido');
    }
  }

  /** Actividad terminal (COMPLETED/CANCELLED) = solo lectura. */
  private assertActivityEditable(activity: ImprovementPlanActivity): void {
    if (activity.status === 'COMPLETED' || activity.status === 'CANCELLED') {
      throw new BadRequestException(`La actividad está en estado terminal (${activity.status}) y no admite modificaciones`);
    }
  }

  /** COMPLETED del plan: actividades sin pendientes + seguimiento registrado. */
  private assertPlanCompletable(plan: ImprovementPlanDocument): void {
    const activities = plan.activities ?? [];
    const pending = activities.filter(
      (a) => a.status === ImprovementPlanActivityStatus.PENDING || a.status === ImprovementPlanActivityStatus.IN_PROGRESS,
    );
    if (activities.length > 0 && pending.length > 0) {
      throw new BadRequestException(
        `No se puede COMPLETED con ${pending.length} actividad(es) pendiente(s) o en ejecución (complete o cancele las actividades pendientes)`,
      );
    }
    const completedWithoutExecution = activities.filter(
      (a) => a.status === ImprovementPlanActivityStatus.COMPLETED && !a.executionDate,
    );
    if (completedWithoutExecution.length > 0) {
      throw new BadRequestException(
        `${completedWithoutExecution.length} actividad(es) completada(s) sin executionDate`,
      );
    }
    if ((plan.monitoring ?? []).length === 0) {
      throw new BadRequestException(
        'No se puede COMPLETED sin seguimiento del plan registrado (agregue al menos un registro de monitoring)',
      );
    }
  }

  /** UN query $in por operación: todos los usuarios pertenecen al tenant. */
  private async assertUsersInTenant(companyId: Types.ObjectId, userIds: string[]): Promise<void> {
    const ids = userIds
      .filter((uid) => Types.ObjectId.isValid(uid))
      .map((uid) => new Types.ObjectId(uid));
    if (ids.length === 0) return;
    const unique = [...new Map(ids.map((id) => [String(id), id])).values()];
    const count = await this.userModel.countDocuments({ _id: { $in: unique }, companyId }).exec();
    if (count !== unique.length) {
      throw new ForbiddenException('El usuario indicado no pertenece a esta empresa');
    }
  }

  /** Snapshot del responsable (server-side; patrón 7.1.1/7.1.2/7.1.3). */
  private async resolveUserSnapshot(companyId: Types.ObjectId, userId: string): Promise<string> {
    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(userId), companyId })
      .select({ firstName: 1, lastName: 1, email: 1 })
      .exec();
    if (!user) {
      // Ya validado por assertUsersInTenant; defensa en profundidad.
      throw new ForbiddenException('El usuario indicado no pertenece a esta empresa');
    }
    const u = user as unknown as { firstName?: string; lastName?: string; email?: string };
    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return name || u.email || '';
  }

  /** Evidencia declarativa tenant-safe: { _id: documentId, companyId }. */
  private async resolveDocumentRef(companyId: Types.ObjectId, documentId?: string): Promise<string | undefined> {
    if (!documentId) return undefined;
    if (!Types.ObjectId.isValid(documentId)) {
      throw new BadRequestException('documentId no es un ObjectId válido');
    }
    const doc = await this.documentMasterModel
      .findOne({ _id: new Types.ObjectId(documentId), companyId })
      .select({ code: 1, name: 1 })
      .exec();
    if (!doc) {
      throw new NotFoundException(`DocumentMaster with id ${documentId} not found`);
    }
    const d = doc as unknown as { code?: string; name?: string };
    return [d.code, d.name].filter(Boolean).join(' — ') || undefined;
  }

  /** Identificador estable de actividad (server-side; único dentro del plan). */
  private nextActivityId(plan: ImprovementPlanDocument): string {
    const existing = new Set(
      (plan.activities ?? []).map((a) => a.activityId).filter(Boolean) as string[],
    );
    let i = existing.size + 1;
    while (existing.has(`ACT-${String(i).padStart(3, '0')}`)) i += 1;
    return `ACT-${String(i).padStart(3, '0')}`;
  }

  /** Identificador estable de seguimiento (server-side; único dentro del plan). */
  private nextMonitoringId(plan: ImprovementPlanDocument): string {
    const existing = new Set(
      (plan.monitoring ?? []).map((m) => m.monitoringId).filter(Boolean) as string[],
    );
    let i = existing.size + 1;
    while (existing.has(`MON-${String(i).padStart(3, '0')}`)) i += 1;
    return `MON-${String(i).padStart(3, '0')}`;
  }

  /** Localiza una actividad por activityId (o 404-equivalente de negocio). */
  private findActivity(plan: ImprovementPlanDocument, activityId: string): ImprovementPlanActivity {
    const activity = (plan.activities ?? []).find((a) => a.activityId === activityId);
    if (!activity) {
      throw new NotFoundException(`Activity ${activityId} not found`);
    }
    return activity;
  }

  /** Historial APPEND-ONLY (server-side; el cliente nunca lo envía). */
  private async recordHistory(
    companyId: Types.ObjectId,
    planId: Types.ObjectId,
    actor: ImprovementPlanActor,
    action: ImprovementPlanHistoryAction,
    details?: string,
    extras?: {
      activityId?: string;
      monitoringId?: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
    planCode?: string,
  ): Promise<void> {
    await this.historyModel.create({
      companyId,
      planId,
      activityId: extras?.activityId,
      monitoringId: extras?.monitoringId,
      planCode,
      actorUserId: actor.userId,
      actorSnapshot: actor.userEmail,
      action,
      details: details ? { message: details } : undefined,
      before: extras?.before,
      after: extras?.after,
    });
  }
}

/** Actor de una mutación (resuelto server-side en el controller). */
export interface ImprovementPlanActor {
  userId?: Types.ObjectId;
  userEmail: string;
}

/** Helper de mensaje de transiciones del plan (labels legibles). */
function IMPROVEMENT_PLAN_TRANSITIONS_LABELS(current: ImprovementPlanStatus): string {
  return IMPROVEMENT_PLAN_TRANSITIONS[current].join(', ');
}

/** Helper de mensaje de transiciones de actividad (labels legibles). */
function ACTIVITY_TRANSITIONS_LABELS(current: ImprovementPlanActivityStatus): string {
  return IMPROVEMENT_PLAN_ACTIVITY_TRANSITIONS[current].join(', ');
}
