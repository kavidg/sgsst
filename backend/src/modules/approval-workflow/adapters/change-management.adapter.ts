import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalNotificationEvent } from '../services/approval-notification.service';
import { ApplyDecisionContext } from './approval-adapter.interface';
import { BaseApprovalAdapter } from './base-approval.adapter';
import {
  ChangeRequest,
  ChangeRequestDocument,
  ChangeStatus,
} from '../../change-management/schema/change-request.schema';

/**
 * Adapter de Gestión del Cambio para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el dominio de Gestión del Cambio SIN
 * modificar la lógica de scoring del ComplianceEngine.
 *
 * La aprobación de un cambio es una decisión administrativa:
 *   APROBACIÓN ≠ CUMPLIMIENTO
 *
 * Un cambio APPROVED puede seguir teniendo findings de ComplianceEngine.
 * El adapter:
 *   - APPROVED → approvalStatus = APPROVED, status = APPROVED
 *   - REJECTED → approvalStatus = REJECTED, status = REJECTED
 *   - ADJUSTMENTS_REQUESTED → approvalStatus = ADJUSTMENTS_REQUESTED, status = DRAFT
 *
 * NO modifica el scoring de ComplianceEngine.
 */
@Injectable()
export class ChangeManagementAdapter extends BaseApprovalAdapter {
  readonly module = ApprovalEntity.CHANGE_MANAGEMENT;

  constructor(
    @InjectModel(ChangeRequest.name)
    private changeRequestModel: Model<ChangeRequestDocument>,
  ) {
    super();
  }

  getEntityLabel(entity: unknown): string {
    const request = entity as { title?: string } | undefined;
    return request?.title ?? 'Solicitud de cambio';
  }

  getDefaultActionUrl(): string {
    return '/change-management';
  }

  getModuleCode(): string {
    return '2.11.1';
  }

  getModuleName(): string {
    return 'Gestión del cambio';
  }

  /**
   * Obtiene la entidad de solicitud de cambio filtrando por companyId (tenant isolation).
   */
  async getEntity(companyId: string, entityId?: string) {
    if (!entityId) {
      throw new BadRequestException(
        'entityId is required by ChangeManagementAdapter',
      );
    }
    const request = await this.changeRequestModel
      .findOne({
        _id: new Types.ObjectId(entityId),
        companyId: new Types.ObjectId(companyId),
      })
      .exec();
    if (!request) {
      throw new NotFoundException(
        `Change request ${entityId} not found for company ${companyId}`,
      );
    }
    return request;
  }

  /**
   * Aplica una decisión del motor sobre la solicitud de cambio real.
   *
   * APPROVED → approvalStatus = APPROVED, status = APPROVED
   * REJECTED → approvalStatus = REJECTED, status = REJECTED
   * ADJUSTMENTS_REQUESTED → approvalStatus = ADJUSTMENTS_REQUESTED, status = DRAFT
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const requestId = new Types.ObjectId(ctx.entityId.toString());
    const companyId = ctx.companyId;

    const request = await this.changeRequestModel
      .findOne({ _id: requestId, companyId })
      .exec();

    if (!request) {
      throw new NotFoundException(`Change request ${ctx.entityId} not found`);
    }

    const newApprovalStatus = this.mapDecisionToStatus(
      ctx.decision as string,
    );

    // Determine the local status according to the decision
    const updatePayload: Record<string, unknown> = {
      approvalStatus: newApprovalStatus,
    };

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED:
        updatePayload.status = ChangeStatus.APPROVED;
        updatePayload.approvedBy = ctx.actor?.userId
          ? new Types.ObjectId(ctx.actor.userId)
          : undefined;
        updatePayload.approvedByName = ctx.actor?.name ?? '';
        updatePayload.approvedAt = new Date();
        break;
      case ApprovalDecision.REJECTED:
        updatePayload.status = ChangeStatus.REJECTED;
        break;
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        updatePayload.status = ChangeStatus.DRAFT;
        break;
    }

    // Update with companyId as defense in depth
    const updated = await this.changeRequestModel
      .findOneAndUpdate(
        { _id: requestId, companyId },
        { $set: updatePayload },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(
        `Change request ${ctx.entityId} not found for update`,
      );
    }

    return updated;
  }

  mapStatus(localStatus: string): ApprovalStatus {
    switch (localStatus) {
      case ApprovalStatus.PENDING_APPROVAL:
        return ApprovalStatus.PENDING_APPROVAL;
      case ApprovalStatus.APPROVED:
        return ApprovalStatus.APPROVED;
      case ApprovalStatus.REJECTED:
        return ApprovalStatus.REJECTED;
      case ApprovalStatus.ADJUSTMENTS_REQUESTED:
        return ApprovalStatus.ADJUSTMENTS_REQUESTED;
      default:
        return ApprovalStatus.DRAFT;
    }
  }

  allowedRoles(): string[] {
    return ['owner', 'admin', 'manager'];
  }

  getNotificationMessage(
    event: ApprovalNotificationEvent,
    entityLabel: string,
  ): string {
    switch (event) {
      case 'APPROVAL_SUBMITTED':
        return `Solicitud de cambio "${entityLabel}" enviada al flujo de aprobación y requiere revisión.`;
      case 'APPROVED':
        return `Solicitud de cambio "${entityLabel}" fue aprobada correctamente.`;
      case 'REJECTED':
        return `Solicitud de cambio "${entityLabel}" fue rechazada y requiere revisión.`;
      case 'ADJUSTMENTS_REQUESTED':
        return `Solicitud de cambio "${entityLabel}": se solicitaron ajustes antes de continuar con la aprobación.`;
    }
  }
}
