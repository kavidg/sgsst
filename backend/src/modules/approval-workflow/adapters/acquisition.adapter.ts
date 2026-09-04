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
import { Acquisition, AcquisitionDocument } from '../../acquisitions/schemas/acquisition.schema';
import { AcquisitionHistory, AcquisitionHistoryDocument } from '../../acquisitions/schemas/acquisition-history.schema';

/**
 * Adapter de Adquisiciones para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el dominio de Adquisiciones SIN
 * modificar la lógica de scoring del ComplianceEngine.
 *
 * La aprobación de una adquisición es una decisión administrativa:
 *   APROBACIÓN ≠ CUMPLIMIENTO
 *
 * Una adquisición APPROVED puede seguir teniendo findings de ComplianceEngine.
 * El adapter:
 *   - APPROVED → actualiza approvalStatus a APPROVED, registra en historial
 *   - REJECTED → actualiza approvalStatus a REJECTED, registra en historial
 *   - ADJUSTMENTS_REQUESTED → actualiza approvalStatus, registra en historial
 *
 * NO modifica el campo `status` operativo de la adquisición.
 * NO modifica el scoring de ComplianceEngine.
 */
@Injectable()
export class AcquisitionAdapter extends BaseApprovalAdapter {
  readonly module = ApprovalEntity.ACQUISITION;

  constructor(
    @InjectModel(Acquisition.name)
    private acquisitionModel: Model<AcquisitionDocument>,
    @InjectModel(AcquisitionHistory.name)
    private historyModel: Model<AcquisitionHistoryDocument>,
  ) {
    super();
  }

  getEntityLabel(entity: unknown): string {
    const acq = entity as { requestNumber?: string; title?: string } | undefined;
    return acq?.requestNumber ?? acq?.title ?? 'Adquisición';
  }

  getDefaultActionUrl(): string {
    return '/acquisitions';
  }

  async getEntity(companyId: string, entityId?: string) {
    if (!entityId) {
      throw new BadRequestException('entityId is required by AcquisitionAdapter');
    }
    const acquisition = await this.acquisitionModel
      .findOne({ _id: new Types.ObjectId(entityId), companyId: new Types.ObjectId(companyId) })
      .exec();
    if (!acquisition) {
      throw new NotFoundException(`Acquisition ${entityId} not found for company ${companyId}`);
    }
    return acquisition;
  }

  /**
   * Aplica una decisión del motor sobre la adquisición real.
   *
   * APPROVED → approvalStatus = APPROVED
   * REJECTED → approvalStatus = REJECTED
   * ADJUSTMENTS_REQUESTED → approvalStatus = ADJUSTMENTS_REQUESTED
   *
   * Registra en AcquisitionHistory para trazabilidad.
   * NO modifica el campo `status` operativo.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const acquisitionId = new Types.ObjectId(ctx.entityId.toString());
    const companyId = ctx.companyId;

    const acquisition = await this.acquisitionModel
      .findOne({ _id: acquisitionId, companyId })
      .exec();

    if (!acquisition) {
      throw new NotFoundException(`Acquisition ${ctx.entityId} not found`);
    }

    const previousApprovalStatus = acquisition.approvalStatus;
    const newApprovalStatus = this.mapDecisionToStatus(ctx.decision as string);

    // Actualizar approvalStatus (incluye companyId como defensa en profundidad)
    const updated = await this.acquisitionModel
      .findOneAndUpdate(
        { _id: acquisitionId, companyId },
        { $set: { approvalStatus: newApprovalStatus } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Acquisition ${ctx.entityId} not found for update`);
    }

    // Registrar en historial
    await this.historyModel.create({
      companyId,
      userId: new Types.ObjectId(ctx.actor.userId),
      userEmail: ctx.actor.email ?? '',
      action: 'ACQUISITION_STATUS_CHANGED',
      entityType: 'Acquisition',
      entityId: acquisitionId.toString(),
      description: `Aprobación: ${previousApprovalStatus ?? 'Sin aprobación'} → ${newApprovalStatus} (${ctx.actor.name ?? 'unknown'})`,
      previousValue: { approvalStatus: previousApprovalStatus },
      newValue: { approvalStatus: newApprovalStatus },
    });

    return updated;
  }

  mapStatus(localStatus: string): ApprovalStatus {
    // Mapear approvalStatus de la adquisición al ApprovalStatus canónico
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
        return `Adquisición ${entityLabel} enviada al flujo de aprobación y requiere revisión.`;
      case 'APPROVED':
        return `Adquisición ${entityLabel} fue aprobada correctamente.`;
      case 'REJECTED':
        return `Adquisición ${entityLabel} fue rechazada y requiere revisión.`;
      case 'ADJUSTMENTS_REQUESTED':
        return `Adquisición ${entityLabel}: se solicitaron ajustes antes de continuar con la aprobación.`;
    }
  }

  getModuleCode(): string {
    return '2.9.1';
  }

  getModuleName(): string {
    return 'Adquisiciones';
  }
}
