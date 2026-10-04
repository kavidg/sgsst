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
  ActionEvidence,
  ActionItemType,
  ActionOrigin,
  ActionPriority,
  ActionStatus,
  CorrectivePreventiveAction,
  CorrectivePreventiveActionDocument,
  CPA_VALID_TRANSITIONS,
  EffectivenessResult,
  EffectivenessVerification,
} from './schemas/corrective-preventive-action.schema';
import {
  CorrectivePreventiveActionHistory,
  CorrectivePreventiveActionHistoryAction,
  CorrectivePreventiveActionHistoryDocument,
} from './schemas/corrective-preventive-action-history.schema';
import {
  AddActionEvidenceDto,
  CreateCorrectivePreventiveActionDto,
  UpdateActionStatusDto,
  UpdateCorrectivePreventiveActionDto,
  VerifyEffectivenessDto,
} from './dto/corrective-preventive-action.dto';

/**
 * E1 (7.1.1) — Service del dominio CORRECTIVE-PREVENTIVE-ACTIONS (Acciones
 * preventivas y correctivas).
 *
 * Seguridad y trazabilidad:
 * - TODAS las operaciones son tenant-scoped: el companyId proviene del usuario
 *   autenticado (resuelto en el controller) y se incluye en cada query. Un id
 *   de otra empresa produce NotFoundException (404) — nunca datos de otro
 *   tenant (defecto detectado en accountability-commitment NO se replica).
 * - El historial es SERVER-SIDE y APPEND-ONLY (CREATE, UPDATE, STATUS_CHANGE,
 *   EVIDENCE, EFFECTIVENESS, CLOSURE); el cliente nunca puede enviarlo ni
 *   alterarlo.
 * - Usuarios tenant-safe: un solo query $in por operación (sin N+1); los
 *   snapshots se generan server-side.
 * - Referencia declarativa tenant-safe a DocumentMaster (evidencia): se
   * valida {id, companyId} al escribirse; este dominio NO implementa upload
 *   ni storage propio.
 * - Máquina de estados: PENDING → IN_PROGRESS → COMPLETED (+ CANCELLED desde
 *   PENDING/IN_PROGRESS; COMPLETED/CANCELLED terminales). El estado SOLO
 *   cambia por changeStatus(); OVERDUE es derivado (NUNCA persistido).
 * - COMPLETED ≠ eficacia verificada: la verificación es un paso posterior
 *   exclusivo de acciones COMPLETED (verifyEffectiveness).
 * - SIN SCORING: este service no calcula percentage/compliance/findings —
 *   E1 solo captura y administra datos (el scorer/provider llegan en E2).
 */
@Injectable()
export class CorrectivePreventiveActionsService {
  constructor(
    @InjectModel(CorrectivePreventiveAction.name)
    private readonly actionModel: Model<CorrectivePreventiveActionDocument>,
    @InjectModel(CorrectivePreventiveActionHistory.name)
    private readonly historyModel: Model<CorrectivePreventiveActionHistoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // Referencia declarativa de evidencia (solo validación tenant-safe).
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMaster>,
  ) {}

  // ── Creación ────────────────────────────────────────────────────────────

  async create(
    companyId: Types.ObjectId,
    dto: CreateCorrectivePreventiveActionDto,
    actor: CpaActor,
  ): Promise<CorrectivePreventiveActionDocument> {
    this.assertActionDates(dto.dueDate, dto.plannedDate, undefined);

    await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);

    const documentSnapshot = await this.resolveDocumentRef(companyId, undefined);

    try {
      const created = await this.actionModel.create({
        // companyId SIEMPRE server-side: se aplica DESPUÉS del spread para que
        // ningún campo del payload pueda sobrescribirlo.
        ...dto,
        companyId,
        status: ActionStatus.PENDING,
        dueDate: new Date(dto.dueDate),
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        originReferenceId: dto.originReferenceId ? new Types.ObjectId(dto.originReferenceId) : undefined,
        responsibleUserId: new Types.ObjectId(dto.responsibleUserId),
        responsibleSnapshot: await this.resolveUserSnapshot(companyId, dto.responsibleUserId, dto.responsibleSnapshot),
        evidence: undefined,
        effectivenessVerification: undefined,
        closureDate: undefined,
        closedByUserId: undefined,
        closedBySnapshot: undefined,
        createdBy: actor.userId,
        createdBySnapshot: actor.userEmail,
      });

      await this.recordHistory(companyId, created._id, actor, CorrectivePreventiveActionHistoryAction.CREATE, 'Acción preventiva/correctiva creada', undefined, {
        title: created.title,
        type: created.type,
        origin: created.origin,
        priority: created.priority,
        status: created.status,
        dueDate: created.dueDate,
      }, created.actionCode);

      return created;
    } catch (err) {
      // Índice único {companyId, actionCode} (E11000) → conflicto de código.
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException(`El actionCode '${dto.actionCode}' ya existe en esta empresa`);
      }
      throw err;
    }
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  async findAll(
    companyId: Types.ObjectId,
    filters: {
      status?: ActionStatus;
      type?: ActionItemType;
      priority?: ActionPriority;
      origin?: ActionOrigin;
      responsibleUserId?: string;
    } = {},
  ): Promise<CorrectivePreventiveActionDocument[]> {
    const query: Record<string, unknown> = { companyId };
    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;
    if (filters.priority) query.priority = filters.priority;
    if (filters.origin) query.origin = filters.origin;
    if (filters.responsibleUserId && Types.ObjectId.isValid(filters.responsibleUserId)) {
      query.responsibleUserId = new Types.ObjectId(filters.responsibleUserId);
    }
    return this.actionModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /** {_id, companyId} SIEMPRE: cross-tenant → 404 (indistinguible de inexistente). */
  async findById(companyId: Types.ObjectId, id: string): Promise<CorrectivePreventiveActionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`CorrectivePreventiveAction with id ${id} not found`);
    }
    const action = await this.actionModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();
    if (!action) {
      throw new NotFoundException(`CorrectivePreventiveAction with id ${id} not found`);
    }
    return action;
  }

  async getHistory(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<CorrectivePreventiveActionHistoryDocument[]> {
    await this.findById(companyId, id); // 404 si no es del tenant
    return this.historyModel
      .find({ companyId, actionId: new Types.ObjectId(id) })
      .sort({ createdAt: 1 }) // Orden cronológico consistente (append-only).
      .exec();
  }

  // ── Actualización ───────────────────────────────────────────────────────

  async update(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateCorrectivePreventiveActionDto,
    actor: CpaActor,
  ): Promise<CorrectivePreventiveActionDocument> {
    const action = await this.findById(companyId, id);
    this.assertEditable(action.status);

    // Coherencia de fechas considerando los valores ya persistidos.
    const nextDue = dto.dueDate ?? action.dueDate.toISOString();
    const nextPlanned = dto.plannedDate !== undefined
      ? (dto.plannedDate || undefined)
      : (action.plannedDate ? action.plannedDate.toISOString() : undefined);
    const nextExecution = dto.executionDate !== undefined
      ? (dto.executionDate || undefined)
      : (action.executionDate ? action.executionDate.toISOString() : undefined);
    this.assertActionDates(nextDue, nextPlanned, nextExecution);
    if (dto.plannedDate) {
      this.assertNotFutureDate(dto.plannedDate, 'plannedDate');
    }
    if (dto.executionDate) {
      this.assertNotFutureDate(dto.executionDate, 'executionDate');
    }

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const previous = {
      title: action.title,
      type: action.type,
      priority: action.priority,
      responsibleUserId: action.responsibleUserId,
      dueDate: action.dueDate,
    };

    // Campos de negocio permitidos (nunca companyId/createdBy/history/status/
    // effectivenessVerification/closureDate/closedByUserId).
    if (dto.actionCode !== undefined) action.actionCode = dto.actionCode;
    if (dto.type !== undefined) action.type = dto.type;
    if (dto.title !== undefined) action.title = dto.title;
    if (dto.description !== undefined) action.description = dto.description;
    if (dto.origin !== undefined) action.origin = dto.origin;
    if (dto.originReferenceId !== undefined) {
      action.originReferenceId = dto.originReferenceId ? new Types.ObjectId(dto.originReferenceId) : undefined;
    }
    if (dto.finding !== undefined) action.finding = dto.finding;
    if (dto.rootCause !== undefined) action.rootCause = dto.rootCause;
    if (dto.actionPlan !== undefined) action.actionPlan = dto.actionPlan;
    if (dto.priority !== undefined) action.priority = dto.priority;
    if (dto.responsibleUserId !== undefined) {
      action.responsibleUserId = new Types.ObjectId(dto.responsibleUserId);
      action.responsibleSnapshot = await this.resolveUserSnapshot(companyId, dto.responsibleUserId, dto.responsibleSnapshot);
    } else if (dto.responsibleSnapshot !== undefined) {
      action.responsibleSnapshot = dto.responsibleSnapshot;
    }
    if (dto.plannedDate !== undefined) action.plannedDate = dto.plannedDate ? new Date(dto.plannedDate) : undefined;
    if (dto.dueDate !== undefined) action.dueDate = new Date(dto.dueDate);
    if (dto.executionDate !== undefined) action.executionDate = dto.executionDate ? new Date(dto.executionDate) : undefined;
    action.updatedBy = actor.userId;
    action.updatedBySnapshot = actor.userEmail;

    const saved = await action.save();

    await this.recordHistory(companyId, action._id, actor, CorrectivePreventiveActionHistoryAction.UPDATE, 'Acción actualizada', previous, {
      title: saved.title,
      type: saved.type,
      priority: saved.priority,
      status: saved.status,
      dueDate: saved.dueDate,
    }, saved.actionCode);

    return saved;
  }

  // ── Estado (máquina de estados; único punto de cambio de status) ────────

  async changeStatus(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateActionStatusDto,
    actor: CpaActor,
  ): Promise<CorrectivePreventiveActionDocument> {
    const action = await this.findById(companyId, id);
    this.assertValidTransition(action.status, dto.status);

    if (dto.status === ActionStatus.COMPLETED) {
      // Cierre operacional: exige ejecución registrada y no futura.
      // NO exige evidencia ni verificación de eficacia (son pasos propios).
      if (!action.executionDate) {
        throw new BadRequestException(
          'No se puede COMPLETED sin executionDate registrada (registre la fecha de ejecución de la acción)',
        );
      }
      action.closureDate = new Date();
      action.closedByUserId = actor.userId;
      action.closedBySnapshot = actor.userEmail;
    }

    const previous = { status: action.status };
    action.status = dto.status;
    action.updatedBy = actor.userId;
    action.updatedBySnapshot = actor.userEmail;
    const saved = await action.save();

    await this.recordHistory(
      companyId,
      action._id,
      actor,
      dto.status === ActionStatus.COMPLETED
        ? CorrectivePreventiveActionHistoryAction.CLOSURE
        : CorrectivePreventiveActionHistoryAction.STATUS_CHANGE,
      dto.comment?.trim() || `Estado: ${previous.status} → ${dto.status}`,
      previous,
      {
        status: dto.status,
        ...(dto.status === ActionStatus.COMPLETED ? { closureDate: saved.closureDate } : {}),
      },
      saved.actionCode,
    );

    return saved;
  }

  // ── Evidencia (referencia declarativa; sin upload/storage propio) ───────

  async addEvidence(
    companyId: Types.ObjectId,
    id: string,
    dto: AddActionEvidenceDto,
    actor: CpaActor,
  ): Promise<CorrectivePreventiveActionDocument> {
    const action = await this.findById(companyId, id);
    this.assertEditable(action.status);

    if (!dto.documentId && !dto.evidenceUrl?.trim()) {
      throw new BadRequestException('La evidencia requiere documentId (DocumentManagement) o evidenceUrl');
    }

    const replace = dto.replace ?? true;
    if (!replace && action.evidence) {
      throw new BadRequestException('La acción ya tiene evidencia; use replace=true para reemplazarla');
    }

    const documentSnapshot = await this.resolveDocumentRef(companyId, dto.documentId);

    const previous = action.evidence
      ? ({ documentId: action.evidence.documentId, evidenceUrl: action.evidence.evidenceUrl } as Record<string, unknown>)
      : undefined;

    action.evidence = {
      ...(dto.documentId ? { documentId: new Types.ObjectId(dto.documentId) } : {}),
      ...(documentSnapshot ? { documentSnapshot } : {}),
      ...(dto.evidenceUrl?.trim() ? { evidenceUrl: dto.evidenceUrl.trim() } : {}),
      ...(dto.comment?.trim() ? { comment: dto.comment.trim() } : {}),
    } as ActionEvidence;
    action.updatedBy = actor.userId;
    action.updatedBySnapshot = actor.userEmail;
    const saved = await action.save();

    await this.recordHistory(companyId, action._id, actor, CorrectivePreventiveActionHistoryAction.EVIDENCE, 'Evidencia registrada', previous, {
      documentId: dto.documentId,
      evidenceUrl: dto.evidenceUrl,
      comment: dto.comment,
    }, saved.actionCode);

    return saved;
  }

  // ── Verificación de eficacia (solo acciones COMPLETED) ──────────────────

  async verifyEffectiveness(
    companyId: Types.ObjectId,
    id: string,
    dto: VerifyEffectivenessDto,
    actor: CpaActor,
  ): Promise<CorrectivePreventiveActionDocument> {
    const action = await this.findById(companyId, id);

    if (action.status !== ActionStatus.COMPLETED) {
      throw new BadRequestException(
        `Solo una acción COMPLETED puede verificar eficacia (estado actual: ${action.status})`,
      );
    }

    // El verificador (actor autenticado) DEBE pertenecer al tenant — regla
    // explícita 7.1.1: verifiedByUserId pertenece a la empresa. El actor
    // llega resuelto server-side, pero se valida por defensa en profundidad.
    await this.assertActorInTenant(companyId, actor);

    // La fecha de verificación NO puede ser futura (default: ahora).
    const verificationDate = dto.verificationDate ? new Date(dto.verificationDate) : new Date();
    if (Number.isNaN(verificationDate.getTime())) {
      throw new BadRequestException('verificationDate inválida');
    }
    this.assertNotFutureDate(verificationDate.toISOString(), 'verificationDate');

    const previous = action.effectivenessVerification
      ? ({ result: action.effectivenessVerification.result, verificationDate: action.effectivenessVerification.verificationDate } as Record<string, unknown>)
      : undefined;

    const verification: EffectivenessVerification = {
      verified: true,
      result: dto.result,
      verifiedByUserId: actor.userId,
      verifiedBySnapshot: actor.userEmail,
      verificationDate,
      ...(dto.observations?.trim() ? { observations: dto.observations.trim() } : {}),
    };

    action.effectivenessVerification = verification;
    action.updatedBy = actor.userId;
    action.updatedBySnapshot = actor.userEmail;
    const saved = await action.save();

    await this.recordHistory(companyId, action._id, actor, CorrectivePreventiveActionHistoryAction.EFFECTIVENESS, `Eficacia verificada: ${dto.result}`, previous, {
      result: dto.result,
      verificationDate,
      verifiedByUserId: actor.userId,
      observations: dto.observations,
    }, saved.actionCode);

    return saved;
  }

  // ── Validaciones privadas ───────────────────────────────────────────────

  /**
   * Coherencia de fechas de la acción:
   * - dueDate válida y obligatoria.
   * - plannedDate (si existe) no posterior a dueDate.
   * - executionDate (si existe) no anterior a plannedDate.
   * - Una acción CANCELLED no exige ejecución (regla aplicada en changeStatus:
   *   cancelar no requiere executionDate; completar sí).
   */
  private assertActionDates(dueDate: string | Date, plannedDate?: string, executionDate?: string): void {
    const due = dueDate instanceof Date ? dueDate.getTime() : new Date(dueDate).getTime();
    if (Number.isNaN(due)) {
      throw new BadRequestException('dueDate inválida');
    }
    if (plannedDate) {
      const planned = new Date(plannedDate).getTime();
      if (Number.isNaN(planned)) {
        throw new BadRequestException('plannedDate inválida');
      }
      if (planned > due) {
        throw new BadRequestException('plannedDate no puede ser posterior a dueDate');
      }
      if (executionDate) {
        const execution = new Date(executionDate).getTime();
        if (Number.isNaN(execution)) {
          throw new BadRequestException('executionDate inválida');
        }
        if (execution < planned) {
          throw new BadRequestException('executionDate no puede ser anterior a plannedDate');
        }
      }
    } else if (executionDate) {
      const execution = new Date(executionDate).getTime();
      if (Number.isNaN(execution)) {
        throw new BadRequestException('executionDate inválida');
      }
    }
  }

  /** Ninguna fecha operativa se acepta en el futuro (planned/execution/verification). */
  private assertNotFutureDate(date: string | Date, field: string): void {
    const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
    if (t > Date.now()) {
      throw new BadRequestException(`${field} no puede ser una fecha futura`);
    }
  }

  /** UN query $in por operación (sin N+1). Snapshots server-side. */
  private async assertUsersInTenant(companyId: Types.ObjectId, userIds: string[]): Promise<void> {
    const ids = userIds
      .filter((uid) => Types.ObjectId.isValid(uid))
      .map((uid) => new Types.ObjectId(uid));
    if (ids.length === 0) return;
    const unique = [...new Map(ids.map((id) => [String(id), id])).values()];
    const count = await this.userModel.countDocuments({ _id: { $in: unique }, companyId }).exec();
    if (count !== unique.length) {
      throw new BadRequestException('El responsable indicado no pertenece a esta empresa');
    }
  }

  /**
   * El actor (verificador) debe ser un usuario registrado de la empresa.
   * Defensa en profundidad: el actor proviene del token (server-side), pero
   * la verificación de eficacia exige explícitamente pertenencia al tenant.
   */
  private async assertActorInTenant(companyId: Types.ObjectId, actor: CpaActor): Promise<void> {
    if (!actor.userId) {
      throw new ForbiddenException('Missing authenticated actor');
    }
    const count = await this.userModel.countDocuments({ _id: actor.userId, companyId }).exec();
    if (count === 0) {
      throw new ForbiddenException('El verificador de eficacia no pertenece a esta empresa');
    }
  }

  /**
   * Snapshot del responsable (server-side): si el cliente envía uno se ignora
   * en favor del nombre real del usuario del tenant (patrón snapshots 6.1.4).
   */
  private async resolveUserSnapshot(
    companyId: Types.ObjectId,
    userId: string,
    _clientSnapshot?: string,
  ): Promise<string> {
    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(userId), companyId })
      .select({ firstName: 1, lastName: 1, email: 1 })
      .exec();
    if (!user) {
      // Ya validado por assertUsersInTenant; defensa en profundidad.
      throw new ForbiddenException('El usuario indicado no pertenece a esta empresa');
    }
    const name = `${(user as unknown as { firstName?: string }).firstName ?? ''} ${(user as unknown as { lastName?: string }).lastName ?? ''}`.trim();
    return name || (user as unknown as { email?: string }).email || '';
  }

  /**
   * Referencia declarativa tenant-safe a DocumentMaster (evidencia): {id,
   * companyId}. Devuelve snapshot del documento para trazabilidad. NO
   * implementa upload/storage; si el acoplamiento a DocumentManagement no
   * estuviera disponible, la referencia seguiría siendo declarativa.
   */
  private async resolveDocumentRef(
    companyId: Types.ObjectId,
    documentId?: string,
  ): Promise<string | undefined> {
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

  /** PENDING/IN_PROGRESS editable; COMPLETED/CANCELLED solo lectura. */
  private assertEditable(status: ActionStatus): void {
    if (status === ActionStatus.COMPLETED || status === ActionStatus.CANCELLED) {
      throw new BadRequestException(`La acción está en estado terminal (${status}) y no admite modificaciones`);
    }
  }

  private assertValidTransition(current: ActionStatus, next: ActionStatus): void {
    if (current === next) {
      throw new BadRequestException(`La acción ya está en estado ${current}`);
    }
    const allowed = CPA_VALID_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Transición inválida: ${current} → ${next}. Permitidas: ${allowed.join(', ') || 'ninguna'}`,
      );
    }
  }

  /** Historial APPEND-ONLY (server-side; el cliente nunca lo envía). */
  private async recordHistory(
    companyId: Types.ObjectId,
    actionId: Types.ObjectId,
    actor: CpaActor,
    action: CorrectivePreventiveActionHistoryAction,
    details?: string,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
    actionCode?: string,
  ): Promise<void> {
    await this.historyModel.create({
      companyId,
      actionId,
      actionCode,
      userId: actor.userId,
      actorSnapshot: actor.userEmail,
      action,
      details: details ? { message: details } : undefined,
      before,
      after,
    });
  }
}

/** Actor de una mutación (resuelto server-side en el controller). */
export interface CpaActor {
  userId?: Types.ObjectId;
  userEmail: string;
}

/** Re-export para conveniencia de tests (enum de resultados de eficacia). */
export { EffectivenessResult };
