import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
// Tokens de referencias DECLARATIVAS ({id, companyId}): solo inyección de
// modelos para validar tenencia; NO se importan servicios ni lógica de esos
// dominios y NUNCA se consultan para scoring (frontera 6.1.4 ↔ 6.1.2/COPASST).
import { CopasstPeriod, CopasstPeriodDocument } from '../copasst/schemas/copasst.schema';
import { AnnualAudit, AnnualAuditDocument } from '../annual-audit/schemas/annual-audit.schema';
import {
  CopasstAuditPlanning,
  CopasstAuditPlanningDocument,
  CopasstAuditPlanningStatus,
  CopasstParticipation,
  COPASST_AUDIT_PLANNING_VALID_TRANSITIONS,
  CopasstPlannedAuditItem,
  PLANNED_AUDIT_ITEM_VALID_TRANSITIONS,
  PlannedAuditItemStatus,
} from './schemas/copasst-audit-planning.schema';
import {
  CopasstAuditPlanningHistory,
  CopasstAuditPlanningHistoryAction,
  CopasstAuditPlanningHistoryDocument,
} from './schemas/copasst-audit-planning-history.schema';
import {
  CreateCopasstAuditPlanningDto,
  CreatePlannedAuditDto,
  MAX_PLANNED_AUDITS_PER_PLANNING,
  UpdateCopasstAuditPlanningDto,
  UpdateCopasstAuditPlanningStatusDto,
  UpdatePlannedAuditDto,
  UpdatePlannedAuditStatusDto,
} from './dto/copasst-audit-planning.dto';

/**
 * E1 (6.1.4) — Service del dominio COPASST-AUDIT-PLANNING (Planificación de
 * auditorías COPASST).
 *
 * Seguridad y trazabilidad:
 * - TODAS las operaciones son tenant-scoped: el companyId proviene del usuario
 *   autenticado (resuelto en el controller) y se incluye en cada query. Un id
 *   de otra empresa produce NotFoundException (404) — nunca datos de otro
 *   tenant.
 * - El historial es SERVER-SIDE y APPEND-ONLY (CREATE, UPDATE, STATUS_CHANGE,
 *   ITEM_CREATED, ITEM_UPDATED, ITEM_STATUS_CHANGE); el cliente nunca puede
 *   enviarlo ni alterarlo. NO se reutiliza CopasstPeriod.auditHistory.
 * - Referencias DECLARATIVAS tenant-safe: copasstPeriodId (CopasstPeriod) y
 *   annualAuditId (AnnualAudit) se validan por {id, companyId} al
 *   escribirse, pero este dominio NUNCA consulta esos dominios para calcular
 *   scoring/porcentajes/findings (la frontera 6.1.4 ↔ 6.1.2 se respeta).
 * - Usuarios tenant-safe: un solo query $in por operación (sin N+1); los
 *   snapshots de nombre se generan server-side.
 * - SIN SCORING: este service no calcula percentage/compliance/findings —
 *   E1 solo captura y administra datos (el scorer/provider llegan en E2).
 */
@Injectable()
export class CopasstAuditPlanningService {
  constructor(
    @InjectModel(CopasstAuditPlanning.name)
    private readonly planningModel: Model<CopasstAuditPlanningDocument>,
    @InjectModel(CopasstAuditPlanningHistory.name)
    private readonly historyModel: Model<CopasstAuditPlanningHistoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // Referencias declarativas (solo validación tenant-safe {id, companyId}).
    @InjectModel(CopasstPeriod.name)
    private readonly copasstPeriodModel: Model<CopasstPeriodDocument>,
    @InjectModel(AnnualAudit.name)
    private readonly annualAuditModel: Model<AnnualAuditDocument>,
  ) {}

  // ── Creación ────────────────────────────────────────────────────────────

  async create(
    companyId: Types.ObjectId,
    dto: CreateCopasstAuditPlanningDto,
    actor: PlanningActor,
  ): Promise<CopasstAuditPlanningDocument> {
    this.assertPeriodRange(dto.startDate, dto.endDate);

    if (dto.items && dto.items.length > MAX_PLANNED_AUDITS_PER_PLANNING) {
      throw new BadRequestException(`Máximo ${MAX_PLANNED_AUDITS_PER_PLANNING} items por planificación`);
    }

    const userIds = this.collectUserIds({
      responsibleUserId: dto.responsibleUserId,
      items: dto.items ?? [],
    });
    for (const item of dto.items ?? []) {
      userIds.push(...this.collectParticipantUserIds(item.copasstParticipation));
    }
    await this.assertUsersInTenant(companyId, userIds);

    const copasstPeriodSnapshot = await this.resolveCopasstPeriodRef(companyId, dto.copasstPeriodId);
    await this.assertAnnualAuditsInTenant(companyId, (dto.items ?? []).map((i) => i.annualAuditId));

    try {
      const created = await this.planningModel.create({
        // companyId SIEMPRE server-side: se aplica DESPUÉS del spread para que
        // ningún campo del payload pueda sobrescribirlo.
        ...dto,
        companyId,
        status: CopasstAuditPlanningStatus.DRAFT,
        copasstPeriodSnapshot,
        items: (dto.items ?? []).map((item) => this.buildItem(item)),
        createdBy: actor.userId,
        createdBySnapshot: actor.userEmail,
      });

      await this.recordHistory(companyId, created._id, actor, CopasstAuditPlanningHistoryAction.CREATE, 'Planificación de auditorías COPASST creada', undefined, {
        title: created.title,
        status: created.status,
        items: created.items.length,
      });

      return created;
    } catch (err) {
      // Índice único {companyId, planningCode} (E11000) → conflicto de código.
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException(`El planningCode '${dto.planningCode}' ya existe en esta empresa`);
      }
      throw err;
    }
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  async findAll(
    companyId: Types.ObjectId,
    filters: {
      status?: CopasstAuditPlanningStatus;
      responsibleUserId?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<CopasstAuditPlanningDocument[]> {
    const query: Record<string, unknown> = { companyId };
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.responsibleUserId && Types.ObjectId.isValid(filters.responsibleUserId)) {
      query.responsibleUserId = new Types.ObjectId(filters.responsibleUserId);
    }
    if (filters.from || filters.to) {
      const startDate: Record<string, Date> = {};
      if (filters.from) startDate.$gte = new Date(filters.from);
      if (filters.to) startDate.$lte = new Date(filters.to);
      query.startDate = startDate;
    }
    return this.planningModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /** {id, companyId} SIEMPRE: cross-tenant → 404 (indistinguible de inexistente). */
  async findById(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<CopasstAuditPlanningDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`CopasstAuditPlanning with id ${id} not found`);
    }
    const planning = await this.planningModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();
    if (!planning) {
      throw new NotFoundException(`CopasstAuditPlanning with id ${id} not found`);
    }
    return planning;
  }

  async getHistory(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<CopasstAuditPlanningHistoryDocument[]> {
    await this.findById(companyId, id); // 404 si no es del tenant
    return this.historyModel
      .find({ companyId, planningId: new Types.ObjectId(id) })
      .sort({ createdAt: -1 })
      .exec();
  }

  // ── Actualización ───────────────────────────────────────────────────────

  async update(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateCopasstAuditPlanningDto,
    actor: PlanningActor,
  ): Promise<CopasstAuditPlanningDocument> {
    const planning = await this.findById(companyId, id);
    this.assertPlanningEditable(planning.status);

    if (dto.startDate || dto.endDate) {
      this.assertPeriodRange(dto.startDate ?? planning.startDate.toISOString(), dto.endDate ?? planning.endDate.toISOString());
    }

    await this.assertUsersInTenant(companyId, this.collectUserIds({ ...dto, items: [] }));

    let copasstPeriodSnapshot = planning.copasstPeriodSnapshot;
    if (dto.copasstPeriodId !== undefined) {
      copasstPeriodSnapshot = await this.resolveCopasstPeriodRef(companyId, dto.copasstPeriodId || undefined);
    }

    const previous = {
      title: planning.title,
      status: planning.status,
      scope: planning.scope,
      objectives: planning.objectives,
    };

    // Campos de negocio permitidos (nunca companyId/createdBy/history/status).
    if (dto.planningCode !== undefined) planning.planningCode = dto.planningCode;
    if (dto.title !== undefined) planning.title = dto.title;
    if (dto.startDate !== undefined) planning.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) planning.endDate = new Date(dto.endDate);
    if (dto.scope !== undefined) planning.scope = dto.scope;
    if (dto.objectives !== undefined) planning.objectives = dto.objectives;
    if (dto.criteria !== undefined) planning.criteria = dto.criteria;
    if (dto.methodology !== undefined) planning.methodology = dto.methodology;
    if (dto.responsibleUserId !== undefined) planning.responsibleUserId = new Types.ObjectId(dto.responsibleUserId);
    if (dto.responsibleUserSnapshot !== undefined) planning.responsibleUserSnapshot = dto.responsibleUserSnapshot;
    if (dto.copasstPeriodId !== undefined) {
      planning.copasstPeriodId = dto.copasstPeriodId ? new Types.ObjectId(dto.copasstPeriodId) : undefined;
      planning.copasstPeriodSnapshot = copasstPeriodSnapshot;
    }
    planning.updatedBy = actor.userId;
    planning.updatedBySnapshot = actor.userEmail;

    const saved = await planning.save();

    await this.recordHistory(companyId, planning._id, actor, CopasstAuditPlanningHistoryAction.UPDATE, 'Planificación actualizada', previous, {
      title: saved.title,
      scope: saved.scope,
      objectives: saved.objectives,
    });

    return saved;
  }

  // ── Estado ──────────────────────────────────────────────────────────────

  async updateStatus(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateCopasstAuditPlanningStatusDto,
    actor: PlanningActor,
  ): Promise<CopasstAuditPlanningDocument> {
    const planning = await this.findById(companyId, id);
    this.assertValidTransition(planning.status, dto.status);
    this.assertDatesCoherentWithStatus(planning, dto.status);

    const previous = { status: planning.status };
    planning.status = dto.status;
    planning.updatedBy = actor.userId;
    planning.updatedBySnapshot = actor.userEmail;
    const saved = await planning.save();

    await this.recordHistory(
      companyId,
      planning._id,
      actor,
      CopasstAuditPlanningHistoryAction.STATUS_CHANGE,
      dto.comment?.trim() || `Estado: ${previous.status} → ${dto.status}`,
      previous,
      { status: dto.status },
    );

    return saved;
  }

  // ── Items planificados ──────────────────────────────────────────────────

  async addItem(
    companyId: Types.ObjectId,
    id: string,
    dto: CreatePlannedAuditDto,
    actor: PlanningActor,
  ): Promise<CopasstAuditPlanningDocument> {
    const planning = await this.findById(companyId, id);
    this.assertPlanningEditable(planning.status);
    if (planning.items.length >= MAX_PLANNED_AUDITS_PER_PLANNING) {
      throw new BadRequestException(`Máximo ${MAX_PLANNED_AUDITS_PER_PLANNING} items por planificación`);
    }

    await this.assertUsersInTenant(companyId, [
      ...(dto.auditorUserId ? [dto.auditorUserId] : []),
      ...(dto.responsibleUserId ? [dto.responsibleUserId] : []),
      ...this.collectParticipantUserIds(dto.copasstParticipation),
    ]);
    await this.assertAnnualAuditsInTenant(companyId, [dto.annualAuditId]);
    this.assertItemDateInPeriod(planning, dto.plannedDate);

    const item = this.buildItem(dto);
    item._id = new Types.ObjectId();
    planning.items.push(item);
    planning.updatedBy = actor.userId;
    planning.updatedBySnapshot = actor.userEmail;
    const saved = await planning.save();

    await this.recordHistory(companyId, planning._id, actor, CopasstAuditPlanningHistoryAction.ITEM_CREATED, `Item planificado: ${dto.title}`, undefined, {
      itemId: String(item._id),
      title: item.title,
      plannedDate: item.plannedDate,
    }, item._id);

    return saved;
  }

  async updateItem(
    companyId: Types.ObjectId,
    id: string,
    itemId: string,
    dto: UpdatePlannedAuditDto,
    actor: PlanningActor,
  ): Promise<CopasstAuditPlanningDocument> {
    const planning = await this.findById(companyId, id);
    this.assertPlanningEditable(planning.status);
    const item = this.findItem(planning, itemId);

    await this.assertUsersInTenant(companyId, [
      ...(dto.auditorUserId ? [dto.auditorUserId] : []),
      ...(dto.responsibleUserId ? [dto.responsibleUserId] : []),
      ...this.collectParticipantUserIds(dto.copasstParticipation),
    ]);
    await this.assertAnnualAuditsInTenant(companyId, [dto.annualAuditId]);
    if (dto.plannedDate !== undefined) {
      this.assertItemDateInPeriod(planning, dto.plannedDate);
    }

    const previous = {
      title: item.title,
      plannedDate: item.plannedDate,
      status: item.status,
      objective: item.objective,
    };

    if (dto.title !== undefined) item.title = dto.title;
    if (dto.plannedDate !== undefined) item.plannedDate = new Date(dto.plannedDate);
    if (dto.auditorUserId !== undefined) item.auditorUserId = new Types.ObjectId(dto.auditorUserId);
    if (dto.auditorUserSnapshot !== undefined) item.auditorUserSnapshot = dto.auditorUserSnapshot;
    if (dto.responsibleUserId !== undefined) item.responsibleUserId = new Types.ObjectId(dto.responsibleUserId);
    if (dto.responsibleUserSnapshot !== undefined) item.responsibleUserSnapshot = dto.responsibleUserSnapshot;
    if (dto.objective !== undefined) item.objective = dto.objective;
    if (dto.scope !== undefined) item.scope = dto.scope;
    if (dto.criteria !== undefined) item.criteria = dto.criteria;
    if (dto.methodology !== undefined) item.methodology = dto.methodology;
    if (dto.copasstParticipation !== undefined) {
      item.copasstParticipation = this.mergeParticipation(item.copasstParticipation, dto.copasstParticipation);
    }
    if (dto.annualAuditId !== undefined) {
      item.annualAuditId = dto.annualAuditId ? new Types.ObjectId(dto.annualAuditId) : undefined;
    }
    planning.updatedBy = actor.userId;
    planning.updatedBySnapshot = actor.userEmail;
    const saved = await planning.save();

    await this.recordHistory(companyId, planning._id, actor, CopasstAuditPlanningHistoryAction.ITEM_UPDATED, `Item actualizado: ${item.title}`, previous, {
      itemId: String(item._id),
      title: item.title,
      plannedDate: item.plannedDate,
    }, item._id);

    return saved;
  }

  async updateItemStatus(
    companyId: Types.ObjectId,
    id: string,
    itemId: string,
    dto: UpdatePlannedAuditStatusDto,
    actor: PlanningActor,
  ): Promise<CopasstAuditPlanningDocument> {
    const planning = await this.findById(companyId, id);
    this.assertPlanningEditable(planning.status);
    const item = this.findItem(planning, itemId);

    const allowed = PLANNED_AUDIT_ITEM_VALID_TRANSITIONS[item.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Transición inválida: ${item.status} → ${dto.status}`);
    }
    // Un item COMPLETED no puede superar la fecha planificada futura: si se
    // cierra antes de que llegue su fecha, la planificación era inconsistente.
    if (dto.status === PlannedAuditItemStatus.COMPLETED && item.plannedDate && this.isDateInFuture(item.plannedDate)) {
      throw new BadRequestException('No se puede completar un item cuya plannedDate está en el futuro');
    }

    const previous = { status: item.status };
    item.status = dto.status;
    planning.updatedBy = actor.userId;
    planning.updatedBySnapshot = actor.userEmail;
    const saved = await planning.save();

    await this.recordHistory(companyId, planning._id, actor, CopasstAuditPlanningHistoryAction.ITEM_STATUS_CHANGE, dto.comment?.trim() || `Item ${item.title}: ${previous.status} → ${dto.status}`, previous, {
      itemId: String(item._id),
      status: dto.status,
    }, item._id);

    return saved;
  }

  // ── Validaciones privadas ───────────────────────────────────────────────

  private buildItem(dto: CreatePlannedAuditDto): CopasstPlannedAuditItem {
    return {
      _id: new Types.ObjectId(),
      title: dto.title,
      plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
      auditorUserId: dto.auditorUserId ? new Types.ObjectId(dto.auditorUserId) : undefined,
      auditorUserSnapshot: dto.auditorUserSnapshot,
      responsibleUserId: dto.responsibleUserId ? new Types.ObjectId(dto.responsibleUserId) : undefined,
      responsibleUserSnapshot: dto.responsibleUserSnapshot,
      objective: dto.objective,
      scope: dto.scope,
      criteria: dto.criteria,
      methodology: dto.methodology,
      copasstParticipation: this.buildParticipation(dto.copasstParticipation),
      status: PlannedAuditItemStatus.PLANNED,
      annualAuditId: dto.annualAuditId ? new Types.ObjectId(dto.annualAuditId) : undefined,
    } as CopasstPlannedAuditItem;
  }

  private buildParticipation(dto?: {
    required?: boolean;
    participated?: boolean;
    participationDate?: string;
    participants?: Array<{ userId?: string; nameSnapshot: string; role?: string }>;
    observations?: string;
  }): CopasstParticipation {
    return {
      required: dto?.required ?? true,
      participated: dto?.participated ?? false,
      participationDate: dto?.participationDate ? new Date(dto.participationDate) : undefined,
      participants: (dto?.participants ?? []).map((p) => ({
        ...(p.userId ? { userId: new Types.ObjectId(p.userId) } : {}),
        nameSnapshot: p.nameSnapshot,
        ...(p.role ? { role: p.role } : {}),
      })),
      observations: dto?.observations,
    } as CopasstParticipation;
  }

  private mergeParticipation(
    current: CopasstParticipation,
    dto: NonNullable<UpdatePlannedAuditDto['copasstParticipation']>,
  ): CopasstParticipation {
    return {
      required: dto.required ?? current.required,
      participated: dto.participated ?? current.participated,
      participationDate: dto.participationDate
        ? new Date(dto.participationDate)
        : current.participationDate,
      participants: dto.participants
        ? dto.participants.map((p) => ({
            ...(p.userId ? { userId: new Types.ObjectId(p.userId) } : {}),
            nameSnapshot: p.nameSnapshot,
            ...(p.role ? { role: p.role } : {}),
          }))
        : current.participants,
      observations: dto.observations !== undefined ? dto.observations : current.observations,
    } as CopasstParticipation;
  }

  /** startDate ≤ endDate (rango del período de la planificación). */
  private assertPeriodRange(startDate: string, endDate: string): void {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new BadRequestException('Fechas del período inválidas');
    }
    if (start > end) {
      throw new BadRequestException('startDate no puede ser posterior a endDate');
    }
  }

  /** plannedDate dentro del período de la planificación (cuando existe). */
  private assertItemDateInPeriod(planning: CopasstAuditPlanningDocument, plannedDate?: string): void {
    if (!plannedDate) return;
    const t = new Date(plannedDate).getTime();
    if (Number.isNaN(t)) {
      throw new BadRequestException('plannedDate inválida');
    }
    if (t < planning.startDate.getTime() || t > planning.endDate.getTime()) {
      throw new BadRequestException('plannedDate del item debe estar dentro del período de la planificación');
    }
  }

  private isDateInFuture(date: string | Date): boolean {
    const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
    return t > Date.now();
  }

  private isDateInPast(date: string | Date): boolean {
    const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
    return t < Date.now();
  }

  /** userIds de copasstParticipation.participants (referencias tenant-safe). */
  private collectParticipantUserIds(
    participation?: { participants?: Array<{ userId?: string }> },
  ): string[] {
    return (participation?.participants ?? [])
      .map((p) => p.userId)
      .filter((uid): uid is string => !!uid);
  }

  /** Consolidar userIds a validar (responsable + items: auditor y responsable). */
  private collectUserIds(input: {
    responsibleUserId?: string;
    items: Array<Pick<CreatePlannedAuditDto, 'auditorUserId' | 'responsibleUserId'>>;
  }): string[] {
    const ids: string[] = [];
    if (input.responsibleUserId) ids.push(input.responsibleUserId);
    for (const item of input.items) {
      if (item.auditorUserId) ids.push(item.auditorUserId);
      if (item.responsibleUserId) ids.push(item.responsibleUserId);
    }
    return ids;
  }

  /** UN query $in por operación (sin N+1). Snapshots server-side. */
  private async assertUsersInTenant(companyId: Types.ObjectId, userIds: string[]): Promise<void> {
    const ids = userIds.filter((uid) => Types.ObjectId.isValid(uid)).map((uid) => new Types.ObjectId(uid));
    if (ids.length === 0) return;
    const unique = [...new Map(ids.map((id) => [String(id), id])).values()];
    const count = await this.userModel.countDocuments({ _id: { $in: unique }, companyId }).exec();
    if (count !== unique.length) {
      throw new BadRequestException('El responsable/auditor indicado no pertenece a esta empresa');
    }
  }

  /**
   * Referencia declarativa tenant-safe a CopasstPeriod: {id, companyId}.
   * Devuelve el snapshot del período (periodName) para trazabilidad.
   * NUNCA consulta COPASST para scoring.
   */
  private async resolveCopasstPeriodRef(
    companyId: Types.ObjectId,
    copasstPeriodId?: string,
  ): Promise<string | undefined> {
    if (!copasstPeriodId) return undefined;
    if (!Types.ObjectId.isValid(copasstPeriodId)) {
      throw new BadRequestException('copasstPeriodId no es un ObjectId válido');
    }
    const period = await this.copasstPeriodModel
      .findOne({ _id: new Types.ObjectId(copasstPeriodId), companyId })
      .select({ periodName: 1 })
      .exec();
    if (!period) {
      throw new NotFoundException(`CopasstPeriod with id ${copasstPeriodId} not found`);
    }
    return period.periodName;
  }

  /** Referencias declarativas tenant-safe a AnnualAudit (bulk $in; sin N+1). */
  private async assertAnnualAuditsInTenant(
    companyId: Types.ObjectId,
    annualAuditIds: Array<string | undefined>,
  ): Promise<void> {
    const valid = annualAuditIds
      .filter((x): x is string => !!x && Types.ObjectId.isValid(x))
      .map((x) => new Types.ObjectId(x));
    if (valid.length === 0) return;
    const unique = [...new Map(valid.map((id) => [String(id), id])).values()];
    const count = await this.annualAuditModel
      .countDocuments({ _id: { $in: unique }, companyId })
      .exec();
    if (count !== unique.length) {
      throw new NotFoundException('AnnualAudit referenciada no existe en esta empresa');
    }
  }

  private findItem(planning: CopasstAuditPlanningDocument, itemId: string): CopasstPlannedAuditItem {
    if (!Types.ObjectId.isValid(itemId)) {
      throw new NotFoundException(`Item with id ${itemId} not found`);
    }
    const item = planning.items.find((i) => String(i._id) === String(new Types.ObjectId(itemId)));
    if (!item) {
      throw new NotFoundException(`Item with id ${itemId} not found`);
    }
    return item;
  }

  /** DRAFT/PLANNED/IN_PROGRESS editable; COMPLETED/CANCELLED solo lectura. */
  private assertPlanningEditable(status: CopasstAuditPlanningStatus): void {
    if (status === CopasstAuditPlanningStatus.COMPLETED || status === CopasstAuditPlanningStatus.CANCELLED) {
      throw new BadRequestException(`La planificación está en estado terminal (${status}) y no admite modificaciones`);
    }
  }

  private assertValidTransition(current: CopasstAuditPlanningStatus, next: CopasstAuditPlanningStatus): void {
    if (current === next) {
      throw new BadRequestException(`La planificación ya está en estado ${current}`);
    }
    const allowed = COPASST_AUDIT_PLANNING_VALID_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Transición inválida: ${current} → ${next}. Permitidas: ${allowed.join(', ') || 'ninguna'}`,
      );
    }
  }

  /**
   * Coherencia de la planificación con el estado destino:
   * - PLANNED exige contenido mínimo (título, período ya válido por schema,
   *   objetivos, alcance, responsable y ≥1 item planificado).
   * - IN_PROGRESS exige planificación válida (≥1 item con plannedDate).
   * - COMPLETED exige evidencia mínima de la PLANIFICACIÓN: ≥1 item completado
   *   con participación COPASST registrada. NO exige ejecución de auditorías
   *   (eso es 6.1.2) ni informes ni hallazgos.
   */
  private assertDatesCoherentWithStatus(
    planning: CopasstAuditPlanningDocument,
    next: CopasstAuditPlanningStatus,
  ): void {
    if (next === CopasstAuditPlanningStatus.PLANNED) {
      const missing: string[] = [];
      if (!planning.objectives?.trim()) missing.push('objectives');
      if (!planning.scope?.trim()) missing.push('scope');
      if (!planning.responsibleUserId) missing.push('responsibleUserId');
      if (planning.items.length === 0) missing.push('items (≥1 auditoría planificada)');
      if (missing.length > 0) {
        throw new BadRequestException(`No se puede pasar a PLANNED sin: ${missing.join(', ')}`);
      }
    }
    if (next === CopasstAuditPlanningStatus.IN_PROGRESS && planning.items.length === 0) {
      throw new BadRequestException('No se puede pasar a IN_PROGRESS sin items planificados');
    }
    if (next === CopasstAuditPlanningStatus.COMPLETED) {
      const completed = planning.items.filter(
        (i) => i.status === PlannedAuditItemStatus.COMPLETED && i.copasstParticipation?.participated,
      );
      if (completed.length === 0) {
        throw new BadRequestException(
          'No se puede COMPLETED sin al menos un item completado con participación COPASST registrada',
        );
      }
    }
  }

  /** Historial APPEND-ONLY (server-side; el cliente nunca lo envía). */
  private async recordHistory(
    companyId: Types.ObjectId,
    planningId: Types.ObjectId,
    actor: PlanningActor,
    action: CopasstAuditPlanningHistoryAction,
    comment?: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>,
    itemId?: Types.ObjectId,
  ): Promise<void> {
    await this.historyModel.create({
      companyId,
      planningId,
      userId: actor.userId,
      userEmail: actor.userEmail,
      action,
      comment,
      previousValue,
      newValue,
      ...(itemId ? { itemId } : {}),
    });
  }
}

/** Actor de una mutación (resuelto server-side en el controller). */
export interface PlanningActor {
  userId?: Types.ObjectId;
  userEmail: string;
}
