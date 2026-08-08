import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateRequestDto } from './dto/create-request.dto';
import { DecideRequestDto } from './dto/decide-request.dto';
import { PendingRequestsDto } from './dto/pending-requests.dto';
import { ApprovalDecision } from './enums/approval-decision.enum';
import { ApprovalStatus } from './enums/approval-status.enum';
import { ApprovalEntity } from './enums/approval-entity.enum';
import { ApprovalActor } from './interfaces/approval-actor.interface';
import { ApprovalEventAction } from './interfaces/approval-event.interface';
import { ApprovalDocumentGenerationListener } from './document-generation/approval-document-generation.listener';
import {
  ApprovalRequest,
  ApprovalRequestDocument,
} from './schemas/approval-request.schema';
import { ApprovalEvent, ApprovalEventDocument } from './schemas/approval-event.schema';
import {
  APPROVAL_ADAPTERS,
  ApprovalAdapter,
  ApplyDecisionContext,
} from './adapters/approval-adapter.interface';

/**
 * Servicio base del Approval Workflow Core.
 *
 * Fase 0: infraestructura del motor de aprobaciones. Crea solicitudes, registra
 * decisiones y guarda un historial append-only de eventos.
 *
 * Fase 2: integra adapters por módulo (vía APPROVAL_ADAPTERS). El método
 * decideAndApply aplica la decisión sobre la entidad real reutilizando la
 * lógica existente del módulo, con tolerancia legacy para solicitudes previas
 * que aún no tienen ApprovalRequest.
 */
@Injectable()
export class ApprovalWorkflowService {
  constructor(
    @InjectModel(ApprovalRequest.name)
    private readonly requestModel: Model<ApprovalRequestDocument>,
    @InjectModel(ApprovalEvent.name)
    private readonly eventModel: Model<ApprovalEventDocument>,
    @Inject(APPROVAL_ADAPTERS)
    private readonly adapters: ApprovalAdapter[],
    /**
     * Listener global de generación documental post-aprobación (Fase 2.1).
     *
     * Opcional para compatibilidad con los specs unitarios que construyen el
     * servicio manualmente; en producción el DI del ApprovalWorkflowModule lo
     * inyecta siempre. Si no está presente, notifyDocumentGeneration no hace
     * nada (sin romper la decisión).
     */
    private readonly approvalDocumentGenerationListener?: ApprovalDocumentGenerationListener,
  ) {}

  /**
   * Crea una solicitud de aprobación en estado PENDING_APPROVAL.
   *
   * @param companyId - Identificador de la empresa.
   * @param dto - Datos de la solicitud.
   * @param actor - Usuario que solicita la aprobación.
   */
  async createRequest(
    companyId: string,
    dto: CreateRequestDto,
    actor: ApprovalActor,
  ): Promise<ApprovalRequestDocument> {
    const companyObjectId = this.toObjectId(companyId);

    const request = await this.requestModel.create({
      companyId: companyObjectId,
      module: dto.module,
      entityType: dto.entityType,
      entityId: this.toObjectId(dto.entityId),
      status: ApprovalStatus.PENDING_APPROVAL,
      currentStep: 1,
      requestedBy: actor,
      assignedRoles: dto.assignedRoles ?? ['owner', 'manager'],
      comments: dto.comments,
    });

    await this.recordEvent({
      requestId: request._id,
      companyId: companyObjectId,
      action: 'CREATED',
      actor,
      previousStatus: ApprovalStatus.DRAFT,
      newStatus: ApprovalStatus.PENDING_APPROVAL,
      reason: dto.comments,
    });

    return request;
  }

  /**
   * Decide sobre una solicitud pendiente (aprobar, rechazar o solicitar ajustes)
   * y registra el evento de la transición.
   *
   * Fase 2.5 (hardening): delega internamente en decideAndApply para eliminar
   * la doble vía de decisión. La decisión se aplica sobre la entidad real vía
   * el adapter del módulo (si está registrado), el ApprovalRequest cambia de
   * estado y se genera el ApprovalEvent correspondiente.
   *
   * @param companyId - Identificador de la empresa.
   * @param requestId - Identificador de la solicitud.
   * @param dto - Decisión del revisor.
   * @param actor - Usuario que decide.
   */
  async decideRequest(
    companyId: string,
    requestId: string,
    dto: DecideRequestDto,
    actor: ApprovalActor,
  ): Promise<ApprovalRequestDocument> {
    const request = await this.findOwnedRequest(companyId, requestId);

    if (request.status !== ApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Request ${requestId} is not pending approval (status: ${request.status})`,
      );
    }

    // La solicitud ya resuelta se pasa a decideAndApply para garantizar que la
    // decisión se aplique EXACTAMENTE a la solicitud objetivo (requestId) y no
    // a una más reciente de la misma entidad.
    const result = await this.decideAndApply(
      companyId,
      request.module,
      request.entityId.toString(),
      dto,
      actor,
      request,
    );

    // La respuesta compatible del endpoint sigue siendo la solicitud actualizada.
    return result.request as ApprovalRequestDocument;
  }

  /**
   * Decide sobre una entidad (buscando la solicitud por module + entityId) y
   * aplica la decisión sobre la entidad real mediante el adapter del módulo.
   *
   * Compatibilidad legacy (Fase 2.5): si aún no existe ApprovalRequest para la
   * entidad (solicitudes creadas antes de esta fase), aplica la decisión a
   * través del adapter y ADEMÁS crea un ApprovalRequest histórico con
   * `legacy: true` y registra el ApprovalEvent con metadata
   * `{ migrated: true, source: 'legacy' }` para no dejar auditoría incompleta.
   *
   * @param companyId - Identificador de la empresa.
   * @param module - Módulo al que pertenece la entidad.
   * @param entityId - Identificador de la entidad de negocio.
   * @param dto - Decisión del revisor.
   * @param actor - Usuario que decide.
   * @param requestOverride - Solicitud ya resuelta por el llamador (p.ej.
   * decideRequest por requestId) para garantizar que la decisión recaiga sobre
   * esa solicitud exacta y no sobre una más reciente de la misma entidad.
   */
  async decideAndApply(
    companyId: string,
    module: ApprovalEntity,
    entityId: string,
    dto: DecideRequestDto,
    actor: ApprovalActor,
    requestOverride?: ApprovalRequestDocument,
  ): Promise<{ applied: unknown; request: ApprovalRequestDocument | null }> {
    // requestOverride garantiza que la decisión recaiga sobre la solicitud
    // exacta indicada por el llamador (p.ej. decideRequest por requestId).
    const request =
      requestOverride ?? (await this.findRequestByEntity(companyId, module, entityId));
    const adapter = this.findAdapter(module);

    if (!adapter) {
      throw new BadRequestException(`No adapter registered for module ${module}`);
    }

    if (request && request.status !== ApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Request ${request._id} is not pending approval (status: ${request.status})`,
      );
    }

    const context: ApplyDecisionContext = {
      companyId: this.toObjectId(companyId),
      entityId: this.toObjectId(entityId),
      decision: dto.decision,
      reason: dto.reason,
      comments: dto.comments,
      actor,
      metadata: dto.metadata,
    };

    const applied = await adapter.applyDecision(context);

    if (!request) {
      const legacy = await this.createLegacyRequest(
        companyId,
        module,
        entityId,
        dto,
        actor,
        adapter,
      );
      await this.notifyDocumentGeneration({
        companyId,
        module,
        entityType: legacy.request.entityType,
        entityId,
        requestId: legacy.request._id.toString(),
        decision: dto.decision,
        actor,
        event: legacy.event,
      });
      return { applied, request: legacy.request };
    }

    const resolved = await this.applyDecisionToRequest(request, dto, actor);
    await this.notifyDocumentGeneration({
      companyId,
      module,
      entityType: resolved.request.entityType,
      entityId,
      requestId: resolved.request._id.toString(),
      decision: dto.decision,
      actor,
      event: resolved.event,
    });
    return { applied, request: resolved.request };
  }

  /**
   * Devuelve la solicitud de aprobación más reciente de una entidad.
   */
  async findRequestByEntity(
    companyId: string,
    module: ApprovalEntity,
    entityId: string,
  ): Promise<ApprovalRequestDocument | null> {
    return this.requestModel
      .findOne({
        companyId: this.toObjectId(companyId),
        module,
        entityId: this.toObjectId(entityId),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Devuelve una solicitud de aprobación de la empresa indicada.
   */
  async getRequest(companyId: string, requestId: string): Promise<ApprovalRequestDocument> {
    return this.findOwnedRequest(companyId, requestId);
  }

  /**
   * Devuelve la bandeja de solicitudes pendientes de una empresa.
   */
  async getPending(
    companyId: string,
    query: PendingRequestsDto,
  ): Promise<ApprovalRequestDocument[]> {
    const filter: Record<string, unknown> = {
      companyId: this.toObjectId(companyId),
      status: ApprovalStatus.PENDING_APPROVAL,
    };
    if (query.module) {
      filter.module = query.module;
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;

    return this.requestModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }

  /**
   * Devuelve el historial de eventos de una solicitud (append-only).
   *
   * Valida que la solicitud pertenezca a la empresa para evitar lectura
   * cruzada entre compañías (mismo control que getRequest/decideRequest).
   *
   * @param companyId - Identificador de la empresa.
   * @param requestId - Identificador de la solicitud.
   */
  async getHistory(companyId: string, requestId: string): Promise<ApprovalEventDocument[]> {
    const request = await this.findOwnedRequest(companyId, requestId);
    return this.eventModel
      .find({ requestId: request._id, companyId: request.companyId })
      .sort({ createdAt: 1 })
      .exec();
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  /**
   * Crea un ApprovalRequest histórico para decisiones legacy (sin solicitud
   * previa) y registra el ApprovalEvent de auditoría con metadata migrated.
   */
  private async createLegacyRequest(
    companyId: string,
    module: ApprovalEntity,
    entityId: string,
    dto: DecideRequestDto,
    actor: ApprovalActor,
    adapter: ApprovalAdapter,
  ): Promise<{ request: ApprovalRequestDocument; event: ApprovalEventDocument }> {
    const companyObjectId = this.toObjectId(companyId);
    const status = this.resolveDecisionStatus(dto.decision);

    const request = await this.requestModel.create({
      companyId: companyObjectId,
      module,
      entityType: 'legacy',
      entityId: this.toObjectId(entityId),
      status,
      currentStep: 1,
      requestedBy: actor,
      assignedRoles: adapter.allowedRoles(),
      decision: dto.decision,
      decidedBy: actor,
      version: 1,
      legacy: true,
    });

    const event = await this.recordEvent({
      requestId: request._id,
      companyId: companyObjectId,
      action: dto.decision as ApprovalEventAction,
      actor,
      previousStatus: ApprovalStatus.PENDING_APPROVAL,
      newStatus: status,
      reason: dto.reason ?? dto.comments,
      metadata: { migrated: true, source: 'legacy' },
    });

    return { request, event };
  }

  private findAdapter(module: ApprovalEntity): ApprovalAdapter | undefined {
    return this.adapters.find((adapter) => adapter.module === module);
  }

  private async applyDecisionToRequest(
    request: ApprovalRequestDocument,
    dto: DecideRequestDto,
    actor: ApprovalActor,
  ): Promise<{ request: ApprovalRequestDocument; event: ApprovalEventDocument }> {
    const previousStatus = request.status;
    const newStatus = this.resolveDecisionStatus(dto.decision);

    request.status = newStatus;
    request.decision = dto.decision;
    request.decidedBy = actor;
    if (dto.reason) {
      request.rejectionReason = dto.reason;
    }

    await request.save();

    const event = await this.recordEvent({
      requestId: request._id,
      companyId: request.companyId,
      action: dto.decision as ApprovalEventAction,
      actor,
      previousStatus,
      newStatus,
      reason: dto.reason ?? dto.comments,
    });

    return { request, event };
  }

  private async findOwnedRequest(
    companyId: string,
    requestId: string,
  ): Promise<ApprovalRequestDocument> {
    const request = await this.requestModel.findById(this.toObjectId(requestId)).exec();

    if (!request) {
      throw new NotFoundException(`Approval request ${requestId} not found`);
    }

    if (request.companyId.toString() !== this.toObjectId(companyId).toString()) {
      throw new NotFoundException(`Approval request ${requestId} not found`);
    }

    return request;
  }

  /**
   * Registra un evento inmutable en el historial (append-only).
   *
   * Devuelve el evento creado para que decideAndApply pueda notificar al
   * listener de generación documental con approvalEventId y approvedAt.
   */
  private async recordEvent(data: {
    requestId: Types.ObjectId;
    companyId: Types.ObjectId;
    action: ApprovalEventAction;
    actor: ApprovalActor;
    previousStatus: ApprovalStatus;
    newStatus: ApprovalStatus;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ApprovalEventDocument> {
    return this.eventModel.create(data);
  }

  /**
   * Notifica al listener global de generación documental tras registrar una
   * decisión. El listener decide si la entidad tiene documento formal y si la
   * decisión fue APPROVED; el Core solo orquesta la notificación.
   *
   * Fase 2.1: este es el ÚNICO punto de notificación de decisiones del Core,
   * por lo que tanto los endpoints PHVA como el endpoint genérico
   * POST /approval-workflow/.../decide generan el documento si corresponde.
   */
  private async notifyDocumentGeneration(params: {
    companyId: string;
    module: ApprovalEntity;
    entityType: string;
    entityId: string;
    requestId: string;
    decision: ApprovalDecision;
    actor: ApprovalActor;
    event: ApprovalEventDocument;
  }): Promise<void> {
    // Solo las decisiones APPROVED pueden originar un documento formal (el
    // listener también lo filtra como defensa en profundidad, pero el contrato
    // del Core notifica únicamente decisiones aprobadas).
    if (params.decision !== ApprovalDecision.APPROVED) {
      return;
    }

    // Listener ausente (specs unitarios): la decisión no se rompe.
    if (!this.approvalDocumentGenerationListener) {
      return;
    }

    // La decisión es autoritativa: la generación documental es un efecto
    // posterior. Si el generador falla (p.ej. el punto 1.1.1 no está COMPLIES
    // o el documento no puede renderizarse), la aprobación ya quedó aplicada y
    // el ApprovalEvent registrado; se registra el error pero NO se rompe la
    // respuesta de la decisión (endpoints PHVA y genérico /decide).
    try {
      await this.approvalDocumentGenerationListener.onDecisionApplied({
        companyId: params.companyId,
        module: params.module,
        entityType: params.entityType,
        entityId: params.entityId,
        requestId: params.requestId,
        decision: params.decision,
        actor: params.actor,
        approvalEventId: params.event._id,
        approvedAt: params.event.createdAt,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown generation error';
      console.warn(
        `[ApprovalWorkflow] document generation failed after approval (module=${params.module}, entityType=${params.entityType}, entityId=${params.entityId}): ${errorMessage}`,
      );
    }
  }

  private resolveDecisionStatus(decision: ApprovalDecision): ApprovalStatus {
    switch (decision) {
      case ApprovalDecision.APPROVED:
        return ApprovalStatus.APPROVED;
      case ApprovalDecision.REJECTED:
        return ApprovalStatus.REJECTED;
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        return ApprovalStatus.ADJUSTMENTS_REQUESTED;
    }
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ObjectId: ${id}`);
    }
    return new Types.ObjectId(id);
  }
}
