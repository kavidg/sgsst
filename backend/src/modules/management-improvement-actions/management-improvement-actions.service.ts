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
  ImprovementActionEvidence,
  ImprovementActionFollowUp,
  ImprovementActionOrigin,
  ImprovementActionPriority,
  ImprovementActionStatus,
  ImplementationStatus,
  ManagementImprovementAction,
  ManagementImprovementActionDocument,
  MIA_VALID_TRANSITIONS,
  PerceivedEffectiveness,
} from './schemas/management-improvement-action.schema';
import {
  ManagementImprovementActionHistory,
  ManagementImprovementActionHistoryAction,
  ManagementImprovementActionHistoryDocument,
} from './schemas/management-improvement-action-history.schema';
import {
  AddImprovementActionEvidenceDto,
  CreateImprovementActionDto,
  RegisterImprovementActionFollowUpDto,
  UpdateImprovementActionDto,
  UpdateImprovementActionStatusDto,
} from './dto/management-improvement-action.dto';

/**
 * E1 (7.1.2) — Service del dominio MANAGEMENT-IMPROVEMENT-ACTIONS (Acciones
 * de mejora de la alta dirección).
 *
 * Seguridad y trazabilidad (patrón validado corrective-preventive-actions):
 * - TODAS las operaciones son tenant-scoped: el companyId proviene del usuario
 *   autenticado (resuelto en el controller) y se incluye en cada query. Un id
 *   de otra empresa produce NotFoundException (404) — nunca datos de otro
 *   tenant (defecto detectado en accountability NO se replica).
 * - El historial es SERVER-SIDE y APPEND-ONLY (CREATE, UPDATE, STATUS_CHANGE,
 *   EVIDENCE, FOLLOW_UP, CLOSURE); el cliente nunca puede enviarlo ni
 *   alterarlo.
 * - Usuarios tenant-safe: un solo query $in por operación (sin N+1); los
 *   snapshots se generan server-side.
 * - Referencia declarativa tenant-safe a DocumentMaster (evidencia): se
 *   valida {id, companyId} al escribirse; este dominio NO implementa upload
 *   ni storage propio.
 * - Máquina de estados: PENDING → IN_PROGRESS → COMPLETED (+ CANCELLED desde
 *   PENDING/IN_PROGRESS; COMPLETED/CANCELLED terminales; PENDING → COMPLETED
 *   prohibido). El estado SOLO cambia por changeStatus(); OVERDUE es derivado
 *   (NUNCA persistido).
 * - COMPLETED ≠ efectividad percibida: la efectividad se registra como
 *   percepción en el seguimiento (followUp.perceivedEffectiveness) y NO es
 *   una verificación formal de eficacia (frontera con 7.1.1).
 * - SIN SCORING: este service no calcula percentage/compliance/findings —
 *   E1 solo captura y administra datos (el scorer/provider llegan en E2).
 */
@Injectable()
export class ManagementImprovementActionsService {
  constructor(
    @InjectModel(ManagementImprovementAction.name)
    private readonly actionModel: Model<ManagementImprovementActionDocument>,
    @InjectModel(ManagementImprovementActionHistory.name)
    private readonly historyModel: Model<ManagementImprovementActionHistoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // Referencia declarativa de evidencia (solo validación tenant-safe).
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMaster>,
  ) {}

  // ── Creación ────────────────────────────────────────────────────────────

  async create(
    companyId: Types.ObjectId,
    dto: CreateImprovementActionDto,
    actor: MiaActor,
  ): Promise<ManagementImprovementActionDocument> {
    this.assertActionDates(dto.dueDate, dto.plannedDate, undefined);

    await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);

    try {
      const created = await this.actionModel.create({
        // companyId SIEMPRE server-side: se aplica DESPUÉS del spread para que
        // ningún campo del payload pueda sobrescribirlo.
        ...dto,
        companyId,
        status: ImprovementActionStatus.PENDING,
        dueDate: new Date(dto.dueDate),
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        originReferenceId: dto.originReferenceId ? new Types.ObjectId(dto.originReferenceId) : undefined,
        responsibleUserId: new Types.ObjectId(dto.responsibleUserId),
        responsibleSnapshot: await this.resolveUserSnapshot(companyId, dto.responsibleUserId, dto.responsibleSnapshot),
        evidence: undefined,
        followUp: undefined,
        closureDate: undefined,
        closedByUserId: undefined,
        closedBySnapshot: undefined,
        createdBy: actor.userId,
        createdBySnapshot: actor.userEmail,
      });

      await this.recordHistory(companyId, created._id, actor, ManagementImprovementActionHistoryAction.CREATE, 'Acción de mejora de la alta dirección creada', undefined, {
        title: created.title,
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
      status?: ImprovementActionStatus;
      origin?: ImprovementActionOrigin;
      priority?: ImprovementActionPriority;
      responsibleUserId?: string;
    } = {},
  ): Promise<ManagementImprovementActionDocument[]> {
    const query: Record<string, unknown> = { companyId };
    if (filters.status) query.status = filters.status;
    if (filters.origin) query.origin = filters.origin;
    if (filters.priority) query.priority = filters.priority;
    if (filters.responsibleUserId && Types.ObjectId.isValid(filters.responsibleUserId)) {
      query.responsibleUserId = new Types.ObjectId(filters.responsibleUserId);
    }
    return this.actionModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /** {_id, companyId} SIEMPRE: cross-tenant → 404 (indistinguible de inexistente). */
  async findById(companyId: Types.ObjectId, id: string): Promise<ManagementImprovementActionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`ManagementImprovementAction with id ${id} not found`);
    }
    const action = await this.actionModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();
    if (!action) {
      throw new NotFoundException(`ManagementImprovementAction with id ${id} not found`);
    }
    return action;
  }

  async getHistory(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<ManagementImprovementActionHistoryDocument[]> {
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
    dto: UpdateImprovementActionDto,
    actor: MiaActor,
  ): Promise<ManagementImprovementActionDocument> {
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
      priority: action.priority,
      responsibleUserId: action.responsibleUserId,
      dueDate: action.dueDate,
    };

    // Campos de negocio permitidos (nunca companyId/createdBy/history/status/
    // followUp/evidence/closureDate/closedByUserId).
    if (dto.actionCode !== undefined) action.actionCode = dto.actionCode;
    if (dto.title !== undefined) action.title = dto.title;
    if (dto.description !== undefined) action.description = dto.description;
    if (dto.origin !== undefined) action.origin = dto.origin;
    if (dto.originReferenceId !== undefined) {
      action.originReferenceId = dto.originReferenceId ? new Types.ObjectId(dto.originReferenceId) : undefined;
    }
    if (dto.decisionReference !== undefined) action.decisionReference = dto.decisionReference;
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

    await this.recordHistory(companyId, action._id, actor, ManagementImprovementActionHistoryAction.UPDATE, 'Acción de mejora actualizada', previous, {
      title: saved.title,
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
    dto: UpdateImprovementActionStatusDto,
    actor: MiaActor,
  ): Promise<ManagementImprovementActionDocument> {
    const action = await this.findById(companyId, id);
    this.assertValidTransition(action.status, dto.status);

    if (dto.status === ImprovementActionStatus.COMPLETED) {
      // Cierre operacional: exige ejecución registrada y no futura.
      // NO exige evidencia ni percepción de efectividad (son pasos propios).
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
      dto.status === ImprovementActionStatus.COMPLETED
        ? ManagementImprovementActionHistoryAction.CLOSURE
        : ManagementImprovementActionHistoryAction.STATUS_CHANGE,
      dto.comment?.trim() || `Estado: ${previous.status} → ${dto.status}`,
      previous,
      {
        status: dto.status,
        ...(dto.status === ImprovementActionStatus.COMPLETED ? { closureDate: saved.closureDate } : {}),
      },
      saved.actionCode,
    );

    return saved;
  }

  // ── Evidencia (referencia declarativa; sin upload/storage propio) ───────

  async addEvidence(
    companyId: Types.ObjectId,
    id: string,
    dto: AddImprovementActionEvidenceDto,
    actor: MiaActor,
  ): Promise<ManagementImprovementActionDocument> {
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
    } as ImprovementActionEvidence;
    action.updatedBy = actor.userId;
    action.updatedBySnapshot = actor.userEmail;
    const saved = await action.save();

    await this.recordHistory(companyId, action._id, actor, ManagementImprovementActionHistoryAction.EVIDENCE, 'Evidencia registrada', previous, {
      documentId: dto.documentId,
      evidenceUrl: dto.evidenceUrl,
      comment: dto.comment,
    }, saved.actionCode);

    return saved;
  }

  // ── Follow-up (seguimiento de implementación/efectividad — NO eficacia) ──

  /**
   * Registra seguimiento de la acción de mejora (criterio 7.1.2). Es la vía
   * para expresar implementación, percepción de efectividad y necesidad de
   * continuar el seguimiento. NO es una verificación formal de eficacia
   * (frontera con 7.1.1); disponible en estados no terminales — el
   * seguimiento es parte del ciclo de gestión de la acción.
   */
  async addFollowUp(
    companyId: Types.ObjectId,
    id: string,
    dto: RegisterImprovementActionFollowUpDto,
    actor: MiaActor,
  ): Promise<ManagementImprovementActionDocument> {
    const action = await this.findById(companyId, id);
    this.assertEditable(action.status);

    // La fecha de seguimiento NO puede ser futura (default: ahora).
    const lastFollowUpDate = dto.lastFollowUpDate ? new Date(dto.lastFollowUpDate) : new Date();
    if (Number.isNaN(lastFollowUpDate.getTime())) {
      throw new BadRequestException('lastFollowUpDate inválida');
    }
    this.assertNotFutureDate(lastFollowUpDate.toISOString(), 'lastFollowUpDate');

    const previous = action.followUp
      ? ({
          lastFollowUpDate: action.followUp.lastFollowUpDate,
          implementationStatus: action.followUp.implementationStatus,
          perceivedEffectiveness: action.followUp.perceivedEffectiveness,
        } as Record<string, unknown>)
      : undefined;

    const followUp: ImprovementActionFollowUp = {
      ...(lastFollowUpDate ? { lastFollowUpDate } : {}),
      ...(dto.observations?.trim() ? { observations: dto.observations.trim() } : {}),
      ...(dto.implementationStatus ? { implementationStatus: dto.implementationStatus } : {}),
      ...(dto.perceivedEffectiveness ? { perceivedEffectiveness: dto.perceivedEffectiveness } : {}),
      ...(dto.requiresContinuedFollowUp !== undefined
        ? { requiresContinuedFollowUp: dto.requiresContinuedFollowUp }
        : {}),
    };

    action.followUp = followUp;
    action.updatedBy = actor.userId;
    action.updatedBySnapshot = actor.userEmail;
    const saved = await action.save();

    await this.recordHistory(companyId, action._id, actor, ManagementImprovementActionHistoryAction.FOLLOW_UP, 'Seguimiento registrado', previous, {
      lastFollowUpDate,
      implementationStatus: dto.implementationStatus,
      perceivedEffectiveness: dto.perceivedEffectiveness,
      requiresContinuedFollowUp: dto.requiresContinuedFollowUp,
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

  /** Ninguna fecha operativa se acepta en el futuro (planned/execution/follow-up). */
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

  /** PENDING/IN_PROGRESS editable; COMPLETED/CANCELLED solo lectura. */
  private assertEditable(status: ImprovementActionStatus): void {
    if (status === ImprovementActionStatus.COMPLETED || status === ImprovementActionStatus.CANCELLED) {
      throw new BadRequestException(`La acción está en estado terminal (${status}) y no admite modificaciones`);
    }
  }

  private assertValidTransition(current: ImprovementActionStatus, next: ImprovementActionStatus): void {
    if (current === next) {
      throw new BadRequestException(`La acción ya está en estado ${current}`);
    }
    const allowed = MIA_VALID_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Transición inválida: ${current} → ${next}. Permitidas: ${allowed.join(', ') || 'ninguna'}`,
      );
    }
  }

  /**
   * Snapshot del responsable (server-side): si el cliente envía uno se ignora
   * en favor del nombre real del usuario del tenant (patrón snapshots 7.1.1).
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

  /** Historial APPEND-ONLY (server-side; el cliente nunca lo envía). */
  private async recordHistory(
    companyId: Types.ObjectId,
    actionId: Types.ObjectId,
    actor: MiaActor,
    action: ManagementImprovementActionHistoryAction,
    details?: string,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
    actionCode?: string,
  ): Promise<void> {
    await this.historyModel.create({
      companyId,
      actionId,
      actionCode,
      actorUserId: actor.userId,
      actorSnapshot: actor.userEmail,
      action,
      details: details ? { message: details } : undefined,
      before,
      after,
    });
  }
}

/** Actor de una mutación (resuelto server-side en el controller). */
export interface MiaActor {
  userId?: Types.ObjectId;
  userEmail: string;
}
