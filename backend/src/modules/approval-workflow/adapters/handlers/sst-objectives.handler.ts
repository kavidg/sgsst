import {
  BadRequestException,
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
 * Handler de la sub-entidad SST Objectives (2.2.1) del módulo PHVA Advanced
 * para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo de Objetivos SST SIN modificar
 * sus endpoints ni su lógica: reutiliza PhvaAdvancedService para aplicar la
 * decisión.
 *
 * La entidad es UNO por empresa (itemCode fijo '2.2.1'), por lo que getEntity
 * soporta entityId opcional.
 */
@Injectable()
export class SstObjectivesHandler {
  constructor(
    @Inject(forwardRef(() => PhvaAdvancedService))
    private readonly phvaAdvancedService: PhvaAdvancedService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getEntity(companyId: string, _entityId?: string) {
    // SST Objectives is ONE per company (itemCode '2.2.1'), entityId is ignored.
    // Read-only lookup — must not trigger a save.
    const record = await this.phvaAdvancedService.findSstObjectives(
      new Types.ObjectId(companyId),
    );

    if (!record || record.companyId.toString() !== companyId) {
      throw new NotFoundException('SST Objectives not found');
    }

    return {
      entity: record,
      status: record.complianceStatus,
      version: 1,
    };
  }

  async applyDecision(ctx: ApplyDecisionContext) {
    // Read-only lookup — avoids the double-save that findOrCreateSstObjectives
    // would cause (findOrCreate saves via saveSstObjectivesWithCompliance, then
    // applyDecision would save again for complianceStatus).
    const record = await this.phvaAdvancedService.findSstObjectives(
      new Types.ObjectId(ctx.companyId.toString()),
    );

    if (!record || record.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('SST Objectives not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        // Mark as compliant when approved
        record.complianceStatus = 'COMPLIES';
        record.complianceReason = 'Objetivos SST aprobados.';
        await record.save();
        return record;
      }
      case ApprovalDecision.REJECTED: {
        record.complianceStatus = 'NON_COMPLIANT';
        record.complianceReason = ctx.reason ?? 'Objetivos SST rechazados.';
        await record.save();
        return record;
      }
      case ApprovalDecision.ADJUSTMENTS_REQUESTED: {
        record.complianceStatus = 'PENDING';
        record.complianceReason = ctx.comments ?? 'Ajustes solicitados en objetivos SST.';
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
