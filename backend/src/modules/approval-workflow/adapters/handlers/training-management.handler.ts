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

/** Estados locales del approval embebido de Training Management (1.2.1). */
type TrainingApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ADJUSTMENTS_REQUESTED';

/**
 * Handler de la sub-entidad Training Management (1.2.1) del módulo PHVA
 * Advanced para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo existente de Capacitaciones SIN
 * modificar sus endpoints ni su lógica: reutiliza EXCLUSIVAMENTE
 * PhvaAdvancedService.approveTrainingManagement para aplicar la decisión. Ese
 * método conserva el approval embebido (status, approvedBy, approvedAt,
 * comments, version), el historial (history) y la TrainingSignature existente.
 *
 * Particularidad del dominio: el registro es UNO por empresa (itemCode fijo
 * '1.2.1'), por lo que getEntity soporta entityId opcional — cuando no se
 * provee, resuelve el registro vigente por companyId (findTrainingManagementByCompany).
 *
 * No existe un método reject independiente: el módulo recibe el estado deseado
 * en approveTrainingManagement (APPROVED | REJECTED | ADJUSTMENTS_REQUESTED),
 * por lo que las tres decisiones del motor se traducen a ese mismo método.
 */
@Injectable()
export class TrainingManagementHandler {
  constructor(
    @Inject(forwardRef(() => PhvaAdvancedService))
    private readonly phvaAdvancedService: PhvaAdvancedService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Carga el registro validando pertenencia por companyId y devuelve el
   * contexto de la entidad (entity, status, version).
   *
   * Soporta dos escenarios:
   * A) entityId presente → carga el registro específico.
   * B) entityId undefined → carga el registro vigente de la empresa.
   */
  async getEntity(companyId: string, entityId?: string) {
    const record = entityId
      ? await this.phvaAdvancedService.findTrainingManagementById(new Types.ObjectId(entityId))
      : await this.phvaAdvancedService.findTrainingManagementByCompany(
          new Types.ObjectId(companyId),
        );

    if (record.companyId.toString() !== companyId) {
      throw new NotFoundException('Training management not found');
    }

    return {
      entity: record,
      status: record.approval?.status,
      version: record.approval?.version ?? 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre el registro real, reutilizando la
   * lógica existente (PhvaAdvancedService.approveTrainingManagement) que
   * conserva approval, history, approvedBy/At, comments, version y la
   * TrainingSignature. El módulo recibe el estado deseado como payload.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const record = await this.phvaAdvancedService.findTrainingManagementById(
      new Types.ObjectId(ctx.entityId.toString()),
    );
    if (record.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('Training management not found');
    }

    const user = await this.resolveUser(ctx.actor);

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const status: TrainingApprovalStatus = 'APPROVED';
        return this.phvaAdvancedService.approveTrainingManagement(ctx.companyId, user, {
          status,
          comments: ctx.comments ?? ctx.reason,
        });
      }
      case ApprovalDecision.REJECTED: {
        const status: TrainingApprovalStatus = 'REJECTED';
        return this.phvaAdvancedService.approveTrainingManagement(ctx.companyId, user, {
          status,
          comments: ctx.reason ?? ctx.comments ?? 'Rechazado',
        });
      }
      case ApprovalDecision.ADJUSTMENTS_REQUESTED: {
        const status: TrainingApprovalStatus = 'ADJUSTMENTS_REQUESTED';
        return this.phvaAdvancedService.approveTrainingManagement(ctx.companyId, user, {
          status,
          comments: ctx.comments ?? ctx.reason,
        });
      }
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    // Conversión canónica centralizada (Fase 6.7): PENDING →
    // PENDING_APPROVAL, APPROVED → APPROVED, REJECTED → REJECTED,
    // ADJUSTMENTS_REQUESTED → ADJUSTMENTS_REQUESTED, DRAFT/desconocido → DRAFT.
    return mapPhvaAdvancedStatus(localStatus);
  }

  allowedRoles(): string[] {
    // Roles actuales de aprobación de Training Management (controller):
    // owner y manager.
    return ['owner', 'manager'];
  }

  /**
   * Resuelve el usuario que aprueba/rechaza: si el actor trae un ObjectId lo usa
   * directamente; si trae un UID de Firebase (o userId sin ObjectId) lo busca
   * en la colección User.
   */
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
