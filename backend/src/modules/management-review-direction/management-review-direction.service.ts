import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  ManagementReviewDecision,
  ManagementReviewDecisionStatus,
  ManagementReviewDirection,
  ManagementReviewDirectionDocument,
  ManagementReviewDirectionStatus,
  ManagementReviewInput,
  ManagementReviewInputStatus,
  ManagementReviewInputType,
  MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS,
} from './schemas/management-review-direction.schema';
import {
  ManagementReviewDirectionHistory,
  ManagementReviewDirectionHistoryAction,
  ManagementReviewDirectionHistoryDocument,
} from './schemas/management-review-direction-history.schema';
import {
  AttachMinutesEvidenceDto,
  CreateManagementReviewDirectionDto,
  CreateReviewDecisionDto,
  CreateReviewInputDto,
  MAX_DECISIONS_PER_REVIEW,
  MAX_INPUTS_PER_REVIEW,
  UpdateManagementReviewDirectionDto,
  UpdateManagementReviewDirectionStatusDto,
  UpdateReviewDecisionDto,
  UpdateReviewInputDto,
} from './dto/management-review-direction.dto';

/**
 * E1 (6.1.3) — Service del dominio MANAGEMENT-REVIEW-DIRECTION (Revisión por
 * la dirección).
 *
 * Seguridad y trazabilidad:
 * - TODAS las operaciones son tenant-scoped: el companyId proviene del
 *   usuario autenticado (resuelto en el controller) y se incluye en cada
 *   query. Un id de otra empresa produce NotFoundException (404) — nunca
 *   información de otro tenant.
 * - El historial es SERVER-SIDE y APPEND-ONLY: se registra en cada mutación
 *   (CREATE, UPDATE, STATUS_CHANGE, INPUT_CREATED, INPUT_UPDATED,
 *   DECISION_CREATED, DECISION_UPDATED, EVIDENCE_ATTACHED) y el frontend
 *   nunca puede enviarlo ni alterarlo.
 * - Evidencia documental: las referencias a DocumentMaster se validan con
 *   companyId (tenant-safe). DocumentMaster es evidencia; este dominio es el
 *   operativo para 6.1.3.
 * - ENTRADAS declarativas: sourceModule/sourceEntityId son referencias de
 *   información revisada; este dominio NUNCA recalcula resultados de otros
 *   módulos (no hay queries cruzadas a AnnualAudit/indicators/etc.).
 * - Sin N+1: participants/inputs/decisions viven embebidos en el documento
 *   padre; las validaciones de usuarios son un solo query $in por operación.
 * - Decisiones PROPIAS del dominio: NO se integra automáticamente con
 *   AccountabilityCommitment (evita doble scoring y contaminación).
 */
@Injectable()
export class ManagementReviewDirectionService {
  constructor(
    @InjectModel(ManagementReviewDirection.name)
    private readonly reviewModel: Model<ManagementReviewDirectionDocument>,
    @InjectModel(ManagementReviewDirectionHistory.name)
    private readonly historyModel: Model<ManagementReviewDirectionHistoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly documentMasterService: DocumentMasterService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  async create(
    companyId: Types.ObjectId,
    dto: CreateManagementReviewDirectionDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    if (dto.plannedDate && this.isDateInPast(dto.plannedDate)) {
      throw new BadRequestException('plannedDate no puede estar en el pasado');
    }

    const userIds = this.collectUserIds(dto.responsibleUserId, dto.participants);
    await this.assertUsersInTenant(companyId, userIds);

    try {
      const created = await this.reviewModel.create({
        //companyId SIEMPRE server-side: se aplica DESPUÉS del spread para que
        // ningún campo del payload pueda sobrescribirlo.
        ...dto,
        companyId,
        status: ManagementReviewDirectionStatus.DRAFT,
        analysis: {},
        inputs: [],
        decisions: [],
        createdBy: actor.userId,
      });

      await this.recordHistory(companyId, created._id, actor, ManagementReviewDirectionHistoryAction.CREATE, 'Revisión por la dirección creada', undefined, {
        title: created.title,
        status: created.status,
      });

      return created;
    } catch (err) {
      // Índice único {companyId, reviewCode} (E11000) → conflicto de código.
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException(`El reviewCode '${dto.reviewCode}' ya existe en esta empresa`);
      }
      throw err;
    }
  }

  async findAll(
    companyId: Types.ObjectId,
    filters: { status?: ManagementReviewDirectionStatus; reviewType?: string; from?: string; to?: string } = {},
  ): Promise<ManagementReviewDirectionDocument[]> {
    const query: Record<string, unknown> = { companyId };
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.reviewType) {
      query.reviewType = filters.reviewType;
    }
    if (filters.from || filters.to) {
      const plannedDate: Record<string, Date> = {};
      if (filters.from) plannedDate.$gte = new Date(filters.from);
      if (filters.to) plannedDate.$lte = new Date(filters.to);
      query.plannedDate = plannedDate;
    }
    return this.reviewModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(companyId: Types.ObjectId, id: string): Promise<ManagementReviewDirectionDocument> {
    return this.findTenantReview(companyId, id);
  }

  async update(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateManagementReviewDirectionDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    const review = await this.findTenantReview(companyId, id);
    this.assertNotCompleted(review, 'Una revisión COMPLETED es evidencia histórica y no puede editarse');

    const mergedDates = this.mergeDates(review, dto);
    if (mergedDates.actualStartDate && mergedDates.actualEndDate && mergedDates.actualStartDate > mergedDates.actualEndDate) {
      throw new BadRequestException('actualStartDate no puede ser posterior a actualEndDate');
    }
    // Las fechas de EJECUCIÓN ya realizada no pueden estar en el futuro.
    if (mergedDates.actualStartDate && mergedDates.actualStartDate.getTime() > Date.now()) {
      throw new BadRequestException('actualStartDate no puede estar en el futuro (la ejecución ya realizada se registra en el pasado)');
    }
    if (mergedDates.actualEndDate && mergedDates.actualEndDate.getTime() > Date.now()) {
      throw new BadRequestException('actualEndDate no puede estar en el futuro (la ejecución ya realizada se registra en el pasado)');
    }

    // Referencias tenant-safe: usuarios y documentos.
    const userIds = this.collectUserIds(dto.responsibleUserId, dto.participants);
    await this.assertUsersInTenant(companyId, userIds);
    const documentIds = [dto.minutesDocumentId].filter((v): v is string => typeof v === 'string');
    for (const documentId of documentIds) {
      await this.assertDocumentInTenant(companyId, documentId);
    }

    const previous = { status: review.status, title: review.title };
    const { participants, ...rest } = dto;
    Object.assign(review, rest);
    if (participants) {
      // Reemplazo completo del array de participantes (operación idempotente).
      review.participants = participants.map((p) => ({
        _id: new Types.ObjectId(),
        userId: p.userId ? new Types.ObjectId(p.userId) : undefined,
        nameSnapshot: p.nameSnapshot,
        role: p.role,
        attendance: p.attendance ?? 'ATTENDED',
      })) as unknown as ManagementReviewDirectionDocument['participants'];
    }
    const saved = await review.save();

    await this.recordHistory(
      companyId,
      review._id,
      actor,
      ManagementReviewDirectionHistoryAction.UPDATE,
      'Revisión actualizada',
      previous,
      { title: saved.title, status: saved.status },
    );

    return saved;
  }

  // ── Estado ──────────────────────────────────────────────────────────────

  async updateStatus(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateManagementReviewDirectionStatusDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    const review = await this.findTenantReview(companyId, id);
    this.assertValidTransition(review.status, dto.status);
    this.assertDatesCoherentWithStatus(review, dto.status);

    if (dto.status === ManagementReviewDirectionStatus.COMPLETED) {
      this.assertCompletionIntegrity(review);
    }

    const previous = { status: review.status };
    review.status = dto.status;
    const saved = await review.save();

    await this.recordHistory(
      companyId,
      review._id,
      actor,
      ManagementReviewDirectionHistoryAction.STATUS_CHANGE,
      dto.comment?.trim() || `Estado: ${previous.status} → ${dto.status}`,
      previous,
      { status: dto.status },
    );

    return saved;
  }

  // ── Entradas de la revisión ─────────────────────────────────────────────

  async addInput(
    companyId: Types.ObjectId,
    id: string,
    dto: CreateReviewInputDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    const review = await this.findTenantReview(companyId, id);
    this.assertNotCompleted(review, 'No se pueden registrar entradas en una revisión COMPLETED');
    if (review.inputs.length >= MAX_INPUTS_PER_REVIEW) {
      throw new BadRequestException(`Límite de ${MAX_INPUTS_PER_REVIEW} entradas por revisión alcanzado`);
    }

    if (dto.evidenceDocumentId) {
      await this.assertDocumentInTenant(companyId, dto.evidenceDocumentId);
    }

    const input: ManagementReviewInput = {
      _id: new Types.ObjectId(),
      type: dto.type,
      title: dto.title,
      description: dto.description,
      sourceModule: dto.sourceModule,
      sourceEntityId: dto.sourceEntityId,
      referencePeriod: dto.referencePeriod,
      status: dto.status ?? ManagementReviewInputStatus.PENDING,
      evidenceDocumentId: dto.evidenceDocumentId ? new Types.ObjectId(dto.evidenceDocumentId) : undefined,
      evidenceUrl: dto.evidenceUrl,
      observations: dto.observations,
    } as unknown as ManagementReviewInput;

    review.inputs.push(input);
    const saved = await review.save();

    await this.recordHistory(companyId, review._id, actor, ManagementReviewDirectionHistoryAction.INPUT_CREATED, 'Entrada registrada', undefined, {
      inputId: String(input._id),
      type: input.type,
      title: input.title,
      sourceModule: input.sourceModule,
    });

    return saved;
  }

  async updateInput(
    companyId: Types.ObjectId,
    id: string,
    inputId: string,
    dto: UpdateReviewInputDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    const review = await this.findTenantReview(companyId, id);
    this.assertNotCompleted(review, 'No se pueden modificar entradas de una revisión COMPLETED');

    const input = this.findEmbeddedInput(review, inputId);
    if (dto.evidenceDocumentId) {
      await this.assertDocumentInTenant(companyId, dto.evidenceDocumentId);
    }

    const previous = { status: input.status, title: input.title };
    Object.assign(input, dto);
    const saved = await review.save();

    await this.recordHistory(companyId, review._id, actor, ManagementReviewDirectionHistoryAction.INPUT_UPDATED, 'Entrada actualizada', previous, {
      inputId,
      status: input.status,
    });

    return saved;
  }

  // ── Decisiones de dirección (propias del dominio) ───────────────────────

  async addDecision(
    companyId: Types.ObjectId,
    id: string,
    dto: CreateReviewDecisionDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    const review = await this.findTenantReview(companyId, id);
    this.assertNotCompleted(review, 'No se pueden registrar decisiones en una revisión COMPLETED');
    if (review.decisions.length >= MAX_DECISIONS_PER_REVIEW) {
      throw new BadRequestException(`Límite de ${MAX_DECISIONS_PER_REVIEW} decisiones por revisión alcanzado`);
    }

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const decision: ManagementReviewDecision = {
      _id: new Types.ObjectId(),
      description: dto.description,
      category: dto.category,
      status: dto.status ?? ManagementReviewDecisionStatus.PENDING,
      responsibleUserId: dto.responsibleUserId ? new Types.ObjectId(dto.responsibleUserId) : undefined,
      responsibleNameSnapshot: dto.responsibleNameSnapshot,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      resourcesRequired: dto.resourcesRequired,
      evidenceUrl: dto.evidenceUrl,
      observations: dto.observations,
    } as unknown as ManagementReviewDecision;

    review.decisions.push(decision);
    const saved = await review.save();

    await this.recordHistory(companyId, review._id, actor, ManagementReviewDirectionHistoryAction.DECISION_CREATED, 'Decisión registrada', undefined, {
      decisionId: String(decision._id),
      category: decision.category,
      description: decision.description,
    });

    return saved;
  }

  async updateDecision(
    companyId: Types.ObjectId,
    id: string,
    decisionId: string,
    dto: UpdateReviewDecisionDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    const review = await this.findTenantReview(companyId, id);
    this.assertNotCompleted(review, 'No se pueden modificar decisiones de una revisión COMPLETED');

    const decision = this.findEmbeddedDecision(review, decisionId);
    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const previous = { status: decision.status, description: decision.description };
    Object.assign(decision, dto);
    const saved = await review.save();

    await this.recordHistory(companyId, review._id, actor, ManagementReviewDirectionHistoryAction.DECISION_UPDATED, 'Decisión actualizada', previous, {
      decisionId,
      status: decision.status,
    });

    return saved;
  }

  // ── Evidencia documental (DocumentMaster tenant-safe) ───────────────────

  async attachMinutesEvidence(
    companyId: Types.ObjectId,
    id: string,
    dto: AttachMinutesEvidenceDto,
    actor: ReviewActor,
  ): Promise<ManagementReviewDirectionDocument> {
    const review = await this.findTenantReview(companyId, id);
    this.assertNotCompleted(review, 'No se puede adjuntar evidencia a una revisión COMPLETED');

    // Validación de tenencia: el documento DEBE pertenecer a la misma empresa.
    await this.assertDocumentInTenant(companyId, dto.documentId);

    const previous = { minutesDocumentId: review.minutesDocumentId?.toString() ?? null };
    review.minutesDocumentId = new Types.ObjectId(dto.documentId);
    const saved = await review.save();

    await this.recordHistory(
      companyId,
      review._id,
      actor,
      ManagementReviewDirectionHistoryAction.EVIDENCE_ATTACHED,
      dto.comment?.trim() || 'Evidencia documental adjuntada (acta de revisión)',
      previous,
      { minutesDocumentId: dto.documentId },
    );

    return saved;
  }

  // ── Historial (append-only, server-side) ────────────────────────────────

  async getHistory(companyId: Types.ObjectId, id: string): Promise<ManagementReviewDirectionHistory[]> {
    const review = await this.findTenantReview(companyId, id);
    return this.historyModel
      .find({ companyId, reviewId: review._id })
      .sort({ createdAt: -1 })
      .exec();
  }

  // ── Helpers de dominio ──────────────────────────────────────────────────

  private async findTenantReview(companyId: Types.ObjectId, id: string): Promise<ManagementReviewDirectionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Management review direction with id ${id} not found`);
    }
    const review = await this.reviewModel.findOne({ _id: id, companyId }).exec();
    if (!review) {
      throw new NotFoundException(`Management review direction with id ${id} not found`);
    }
    return review;
  }

  private findEmbeddedInput(review: ManagementReviewDirectionDocument, inputId: string): ManagementReviewInput {
    const input = review.inputs.find((i) => String(i._id) === inputId);
    if (!input) {
      throw new NotFoundException(`Input with id ${inputId} not found`);
    }
    return input;
  }

  private findEmbeddedDecision(
    review: ManagementReviewDirectionDocument,
    decisionId: string,
  ): ManagementReviewDecision {
    const decision = review.decisions.find((d) => String(d._id) === decisionId);
    if (!decision) {
      throw new NotFoundException(`Decision with id ${decisionId} not found`);
    }
    return decision;
  }

  private assertNotCompleted(review: ManagementReviewDirectionDocument, message: string): void {
    if (review.status === ManagementReviewDirectionStatus.COMPLETED) {
      throw new BadRequestException(message);
    }
  }

  private assertValidTransition(current: ManagementReviewDirectionStatus, next: ManagementReviewDirectionStatus): void {
    if (current === next) {
      throw new BadRequestException(`La revisión ya está en estado ${current}`);
    }
    const allowed = MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Transición de estado inválida: ${current} → ${next}. Permitidas: ${allowed.join(', ') || '(ninguna)'}`,
      );
    }
  }

  /** Integridad: fechas coherentes con el estado destino. */
  private assertDatesCoherentWithStatus(review: ManagementReviewDirectionDocument, next: ManagementReviewDirectionStatus): void {
    if (next === ManagementReviewDirectionStatus.PLANNED && !review.plannedDate) {
      throw new BadRequestException('No se puede pasar a PLANNED sin plannedDate (regístrela vía PATCH /management-review-direction/:id)');
    }
    if (next === ManagementReviewDirectionStatus.PLANNED && !review.responsibleUserId) {
      throw new BadRequestException('No se puede pasar a PLANNED sin responsibleUserId (regístrelo vía PATCH /management-review-direction/:id)');
    }
    if (next === ManagementReviewDirectionStatus.IN_PROGRESS && !review.actualStartDate) {
      throw new BadRequestException('No se puede pasar a IN_PROGRESS sin actualStartDate (regístrela vía PATCH /management-review-direction/:id)');
    }
    if (next === ManagementReviewDirectionStatus.COMPLETED && !review.actualEndDate) {
      throw new BadRequestException('No se puede COMPLETED sin actualEndDate (regístrela vía PATCH /management-review-direction/:id)');
    }
  }

  /**
   * Integridad de COMPLETED: acta/evidencia mínima y una revisión real
   * (análisis con contenido o decisiones registradas). No se acepta una
   * revisión vacía como revisión de dirección completada.
   */
  private assertCompletionIntegrity(review: ManagementReviewDirectionDocument): void {
    const missing: string[] = [];
    if (!review.actualStartDate) missing.push('actualStartDate');
    if (!review.actualEndDate) missing.push('actualEndDate');
    if (!review.minutesDocumentId && !review.minutesEvidenceUrl && !review.reportTitle) {
      missing.push('acta/evidencia (minutesDocumentId, minutesEvidenceUrl o reportTitle)');
    }
    const hasAnalysisContent =
      !!review.analysis &&
      (!!review.analysis.summary?.trim() ||
        !!review.analysis.managementObservations?.trim() ||
        (review.analysis.strengths?.length ?? 0) > 0 ||
        (review.analysis.gaps?.length ?? 0) > 0 ||
        (review.analysis.priorities?.length ?? 0) > 0);
    if (!hasAnalysisContent && review.decisions.length === 0) {
      missing.push('contenido mínimo de revisión (analysis o decisions)');
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `No se puede COMPLETED: falta información mínima de la revisión (${missing.join(', ')})`,
      );
    }
  }

  private mergeDates(
    review: ManagementReviewDirectionDocument,
    dto: UpdateManagementReviewDirectionDto,
  ): { actualStartDate?: Date; actualEndDate?: Date } {
    return {
      actualStartDate: dto.actualStartDate
        ? new Date(dto.actualStartDate)
        : review.actualStartDate
          ? new Date(review.actualStartDate)
          : undefined,
      actualEndDate: dto.actualEndDate
        ? new Date(dto.actualEndDate)
        : review.actualEndDate
          ? new Date(review.actualEndDate)
          : undefined,
    };
  }

  /**
   * plannedDate es una planificación: en creación debe ser futura (una
   * planificación en el pasado no tiene sentido). Las fechas de ejecución
   * (actual*) se validan en update(): no pueden estar en el futuro.
   */
  private isDateInPast(date: string): boolean {
    return new Date(date).getTime() < Date.now();
  }

  /** Todos los usuarios referenciados deben pertenecer al tenant. */
  private async assertUsersInTenant(companyId: Types.ObjectId, userIds: string[]): Promise<void> {
    const ids = userIds.filter((uid) => Types.ObjectId.isValid(uid)).map((uid) => new Types.ObjectId(uid));
    if (ids.length === 0) return;
    const count = await this.userModel.countDocuments({ _id: { $in: ids }, companyId }).exec();
    if (count !== ids.length) {
      throw new BadRequestException('El responsable/participante indicado no pertenece a esta empresa');
    }
  }

  /** Evidencia tenant-safe: el documento debe existir Y pertenecer al tenant. */
  private async assertDocumentInTenant(companyId: Types.ObjectId, documentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new BadRequestException('documentId no es un ObjectId válido');
    }
    const doc = await this.documentMasterService.findById(new Types.ObjectId(documentId), companyId);
    if (!doc || doc.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException(`Document with id ${documentId} not found`);
    }
  }

  /** Consolidar todos los userId a validar (responsable + participantes). */
  private collectUserIds(
    responsibleUserId: string | undefined,
    participants: Array<{ userId?: string }> | undefined,
  ): string[] {
    const ids: string[] = [];
    if (responsibleUserId) ids.push(responsibleUserId);
    for (const p of participants ?? []) {
      if (p.userId) ids.push(p.userId);
    }
    return ids;
  }

  /** Historial server-side (append-only). El frontend nunca lo envía. */
  private async recordHistory(
    companyId: Types.ObjectId,
    reviewId: Types.ObjectId,
    actor: ReviewActor,
    action: ManagementReviewDirectionHistoryAction,
    comment?: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>,
  ): Promise<void> {
    await this.historyModel.create({
      companyId,
      reviewId,
      userId: actor.userId,
      userEmail: actor.userEmail,
      action,
      comment,
      previousValue,
      newValue,
    });
  }
}

/** Actor autenticado (resuelto server-side en el controller). */
export interface ReviewActor {
  userId?: Types.ObjectId;
  userEmail: string;
}
