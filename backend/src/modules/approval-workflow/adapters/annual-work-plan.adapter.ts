import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalAdapter, ApplyDecisionContext } from './approval-adapter.interface';
import { AnnualWorkPlanStatus } from '../../annual-work-plan/schemas/annual-work-plan.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { User, UserDocument } from '../../users/schemas/user.schema';

/**
 * Adapter de Annual Work Plan para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo de aprobación del Plan Anual
 * SIN modificar sus endpoints ni su lógica: reutiliza AnnualWorkPlanService.approve
 * para aplicar la decisión (conserva approvedBy, approvedAt, firma, comments y
 * PlanHistory) y traduce AnnualWorkPlanStatus al ApprovalStatus canónico.
 *
 * El módulo de Plan Anual no posee flujo de rechazo (los estados son
 * Draft → Active → Completed/Archived), por lo que REJECTED y
 * ADJUSTMENTS_REQUESTED no están soportados: se conserva el comportamiento
 * actual lanzando un error explícito.
 */
@Injectable()
export class AnnualWorkPlanAdapter implements ApprovalAdapter {
  readonly module = ApprovalEntity.ANNUAL_WORK_PLAN;

  constructor(
    @Inject(forwardRef(() => AnnualWorkPlanService))
    private readonly planService: AnnualWorkPlanService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Carga el plan validando pertenencia por companyId y devuelve el contexto
   * de la entidad (entity, status, version).
   */
  async getEntity(companyId: string, entityId?: string) {
    if (!entityId) {
      throw new BadRequestException('entityId is required by AnnualWorkPlanAdapter');
    }
    const plan = await this.planService.findById(new Types.ObjectId(entityId));
    if (plan.companyId.toString() !== companyId) {
      throw new NotFoundException('Annual work plan not found');
    }
    return {
      entity: plan,
      status: plan.status,
      // El Plan Anual no tiene control de versiones; se expone 1 por contrato.
      version: 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre el plan real, reutilizando la lógica
   * existente (AnnualWorkPlanService.approve) que conserva approvedBy,
   * approvedAt, firma, comments y PlanHistory.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const planId = new Types.ObjectId(ctx.entityId.toString());

    const plan = await this.planService.findById(planId);
    if (plan.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('Annual work plan not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const approvedBy =
          this.metadataObjectId(ctx, 'approvedById') ??
          (await this.resolveUserId(ctx.actor.userId));
        return this.planService.approve(
          planId,
          approvedBy,
          this.signatureValue(ctx, 'signerEmail') ?? ctx.actor.email,
          this.signatureValue(ctx, 'signerName') ?? ctx.actor.name ?? 'Approved Signer',
          this.signatureValue(ctx, 'signatureHash'),
          this.signatureValue(ctx, 'signatureUrl'),
          ctx.comments,
        );
      }
      case ApprovalDecision.REJECTED:
        // No existe flujo de rechazo en el módulo: conservar comportamiento actual.
        throw new BadRequestException('REJECTED is not supported by AnnualWorkPlanAdapter');
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        throw new BadRequestException(
          'ADJUSTMENTS_REQUESTED is not supported by AnnualWorkPlanAdapter',
        );
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    switch (localStatus) {
      case AnnualWorkPlanStatus.DRAFT:
        return ApprovalStatus.DRAFT;
      case 'PendingApproval':
      case 'PENDING_APPROVAL':
        return ApprovalStatus.PENDING_APPROVAL;
      case 'Approved':
      case 'Active':
      case AnnualWorkPlanStatus.ACTIVE:
      case AnnualWorkPlanStatus.COMPLETED:
        return ApprovalStatus.APPROVED;
      case 'Archived':
      case AnnualWorkPlanStatus.ARCHIVED:
        return ApprovalStatus.ARCHIVED;
      default:
        return ApprovalStatus.DRAFT;
    }
  }

  allowedRoles(): string[] {
    return ['owner', 'manager'];
  }

  /**
   * Resuelve el `_id` del usuario que aprueba: si el actor trae un ObjectId lo
   * usa directamente; si trae un UID de Firebase lo busca en la colección User.
   */
  private async resolveUserId(userId: string): Promise<Types.ObjectId> {
    if (Types.ObjectId.isValid(userId)) {
      return new Types.ObjectId(userId);
    }
    const user = await this.userModel
      .findOne({ firebaseUid: userId }, { _id: 1 })
      .lean()
      .exec();
    if (!user) {
      throw new NotFoundException(`User with firebaseUid ${userId} not found`);
    }
    return user._id;
  }

  private metadataObjectId(ctx: ApplyDecisionContext, key: string): Types.ObjectId | undefined {
    const value = ctx.metadata?.[key];
    return typeof value === 'string' && Types.ObjectId.isValid(value)
      ? new Types.ObjectId(value)
      : undefined;
  }

  private signatureValue(ctx: ApplyDecisionContext, key: string): string | undefined {
    const value = ctx.metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
