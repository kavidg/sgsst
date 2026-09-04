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
import { Contract, ContractDocument, ContractStatus } from '../../contracting/schemas/contract.schema';

/**
 * Adapter de Contratación para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el dominio de Contratación SIN
 * modificar la lógica de scoring del ComplianceEngine.
 *
 * La aprobación de un contrato es una decisión administrativa:
 *   APROBACIÓN ≠ CUMPLIMIENTO
 *
 * Un contrato APPROVED puede seguir teniendo findings de ComplianceEngine.
 * El adapter:
 *   - APPROVED → approvalStatus = APPROVED, status = ACTIVE
 *   - REJECTED → approvalStatus = REJECTED, status = DRAFT
 *   - ADJUSTMENTS_REQUESTED → approvalStatus = ADJUSTMENTS_REQUESTED, status = DRAFT
 *
 * NO modifica el scoring de ComplianceEngine.
 */
@Injectable()
export class ContractingAdapter extends BaseApprovalAdapter {
  readonly module = ApprovalEntity.CONTRACTING;

  constructor(
    @InjectModel(Contract.name)
    private contractModel: Model<ContractDocument>,
  ) {
    super();
  }

  getEntityLabel(entity: unknown): string {
    const contract = entity as { contractNumber?: string; title?: string } | undefined;
    return contract?.contractNumber ?? contract?.title ?? 'Contrato';
  }

  getDefaultActionUrl(): string {
    return '/contracting';
  }

  getModuleCode(): string {
    return '2.10.1';
  }

  getModuleName(): string {
    return 'Contratación';
  }

  /**
   * Obtiene la entidad de contrato filtrando por companyId (tenant isolation).
   */
  async getEntity(companyId: string, entityId?: string) {
    if (!entityId) {
      throw new BadRequestException('entityId is required by ContractingAdapter');
    }
    const contract = await this.contractModel
      .findOne({ _id: new Types.ObjectId(entityId), companyId: new Types.ObjectId(companyId) })
      .exec();
    if (!contract) {
      throw new NotFoundException(`Contract ${entityId} not found for company ${companyId}`);
    }
    return contract;
  }

  /**
   * Aplica una decisión del motor sobre el contrato real.
   *
   * APPROVED → approvalStatus = APPROVED, status = ACTIVE
   * REJECTED → approvalStatus = REJECTED, status = DRAFT
   * ADJUSTMENTS_REQUESTED → approvalStatus = ADJUSTMENTS_REQUESTED, status = DRAFT
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const contractId = new Types.ObjectId(ctx.entityId.toString());
    const companyId = ctx.companyId;

    const contract = await this.contractModel
      .findOne({ _id: contractId, companyId })
      .exec();

    if (!contract) {
      throw new NotFoundException(`Contract ${ctx.entityId} not found`);
    }

    const previousApprovalStatus = contract.approvalStatus;
    const newApprovalStatus = this.mapDecisionToStatus(ctx.decision as string);

    // Determinar el status operativo según la decisión
    const updatePayload: Record<string, unknown> = {
      approvalStatus: newApprovalStatus,
    };

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED:
        updatePayload.status = ContractStatus.ACTIVE;
        break;
      case ApprovalDecision.REJECTED:
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        updatePayload.status = ContractStatus.DRAFT;
        break;
    }

    // Actualizar con companyId como defensa en profundidad
    const updated = await this.contractModel
      .findOneAndUpdate(
        { _id: contractId, companyId },
        { $set: updatePayload },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Contract ${ctx.entityId} not found for update`);
    }

    return updated;
  }

  mapStatus(localStatus: string): ApprovalStatus {
    // Mapear approvalStatus del contrato al ApprovalStatus canónico
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
    return ['owner', 'manager'];
  }

  getNotificationMessage(event: ApprovalNotificationEvent, entityLabel: string): string {
    switch (event) {
      case 'APPROVAL_SUBMITTED':
        return `Contrato ${entityLabel} enviado al flujo de aprobación y requiere revisión.`;
      case 'APPROVED':
        return `Contrato ${entityLabel} fue aprobado correctamente.`;
      case 'REJECTED':
        return `Contrato ${entityLabel} fue rechazado y requiere revisión.`;
      case 'ADJUSTMENTS_REQUESTED':
        return `Contrato ${entityLabel}: se solicitaron ajustes antes de continuar con la aprobación.`;
    }
  }
}
