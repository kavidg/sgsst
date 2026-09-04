import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalDecision } from '../../enums/approval-decision.enum';
import { ApprovalStatus } from '../../enums/approval-status.enum';
import { ApprovalActor } from '../../interfaces/approval-actor.interface';
import { ApplyDecisionContext } from '../approval-adapter.interface';
import { PhvaAdvancedService } from '../../../phva-advanced/phva-advanced.service';
import { User, UserDocument } from '../../../users/schemas/user.schema';
import { mapPhvaAdvancedStatus } from '../../utils/phva-status-map';

/**
 * Handler de la sub-entidad Emergencias (1.1.10) del módulo PHVA Advanced
 * para el Approval Workflow Core.
 */
@Injectable()
export class EmergenciesHandler {
  constructor(
    @Inject(forwardRef(() => PhvaAdvancedService))
    private readonly phvaAdvancedService: PhvaAdvancedService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getEntity(companyId: string, _entityId?: string) {
    const record = await this.phvaAdvancedService.findOrCreateEmergencies(
      new Types.ObjectId(companyId),
    );

    if (record.companyId.toString() !== companyId) {
      throw new NotFoundException('Emergencias not found');
    }

    return {
      entity: record,
      status: record.complianceStatus,
      version: 1,
    };
  }

  async applyDecision(ctx: ApplyDecisionContext) {
    const record = await this.phvaAdvancedService.findOrCreateEmergencies(
      new Types.ObjectId(ctx.companyId.toString()),
    );

    if (record.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('Emergencias not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        record.complianceStatus = 'COMPLIES';
        record.complianceReason = 'Plan de emergencias aprobado.';
        await record.save();
        return record;
      }
      case ApprovalDecision.REJECTED: {
        record.complianceStatus = 'NON_COMPLIANT';
        record.complianceReason = ctx.reason ?? 'Plan de emergencias rechazado.';
        await record.save();
        return record;
      }
      case ApprovalDecision.ADJUSTMENTS_REQUESTED: {
        record.complianceStatus = 'PENDING';
        record.complianceReason = ctx.comments ?? 'Ajustes solicitados en plan de emergencias.';
        await record.save();
        return record;
      }
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    return mapPhvaAdvancedStatus(localStatus);
  }

  allowedRoles(): string[] {
    return ['owner', 'manager'];
  }

  private async resolveUser(actor: ApprovalActor): Promise<UserDocument> {
    let user: UserDocument | null = null;
    if (Types.ObjectId.isValid(actor.userId)) {
      user = await this.userModel.findById(actor.userId).exec();
    }
    if (!user) {
      user = await this.userModel
        .findOne({ firebaseUid: actor.firebaseUid ?? actor.userId })
        .exec();
    }
    if (!user) {
      throw new NotFoundException(`User ${actor.userId} not found`);
    }
    return user;
  }
}
