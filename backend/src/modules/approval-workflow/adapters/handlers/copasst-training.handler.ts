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
import { PhvaAdvancedCopasstTrainingService } from '../../../phva-advanced/phva-advanced-copasst-training.service';
import { User, UserDocument } from '../../../users/schemas/user.schema';
import { mapPhvaAdvancedStatus } from '../../utils/phva-status-map';

/** Estados locales del approval embebido de la Capacitación COPASST (1.1.7). */
type CopasstTrainingApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ADJUSTMENTS_REQUESTED';

/**
 * Handler de la sub-entidad Capacitación COPASST (1.1.7) del módulo PHVA
 * Advanced para el Approval Workflow Core (Fase 5).
 *
 * Conecta el motor de aprobaciones con el flujo de 1.1.7 SIN modificar sus
 * endpoints ni su lógica: reutiliza EXCLUSIVAMENTE
 * PhvaAdvancedCopasstTrainingService.submitCopasstTraining (submit, orquestado
 * por el controller) y PhvaAdvancedCopasstTrainingService.approveCopasstTraining
 * para aplicar las decisiones. Ese método conserva el approval embebido
 * (status, approvedBy, approvedAt, comments, version), el locking (`locked`)
 * y el historial (history) de la entidad.
 *
 * Particularidad del dominio: el registro es UNO por empresa/año (itemCode
 * fijo '1.1.7'), por lo que getEntity soporta entityId opcional — cuando no se
 * provee, resuelve el registro vigente por companyId (findByCompany).
 *
 * Igual que Training Management (1.2.1), no existe un método reject
 * independiente: el módulo recibe el estado deseado en approveCopasstTraining
 * (APPROVED | REJECTED | ADJUSTMENTS_REQUESTED), por lo que las tres
 * decisiones del motor se traducen a ese mismo método.
 */
@Injectable()
export class CopasstTrainingHandler {
  constructor(
    @Inject(forwardRef(() => PhvaAdvancedCopasstTrainingService))
    private readonly copasstTrainingService: PhvaAdvancedCopasstTrainingService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Carga el registro validando pertenencia por companyId y devuelve el
   * contexto de la entidad (entity, status, version).
   *
   * Soporta dos escenarios:
   * A) entityId presente → carga el registro específico (findById valida la
   *    pertenencia: una entidad de otra empresa lanza NotFound).
   * B) entityId undefined → carga el registro vigente de la empresa.
   */
  async getEntity(companyId: string, entityId?: string) {
    const record = entityId
      ? await this.copasstTrainingService.findById(
          new Types.ObjectId(companyId),
          new Types.ObjectId(entityId),
        )
      : await this.findByCompanyOrThrow(companyId);

    return {
      entity: record,
      status: record.approval?.status,
      version: record.approval?.version ?? 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre el registro real, reutilizando la
   * lógica existente (PhvaAdvancedCopasstTrainingService.approveCopasstTraining)
   * que conserva approval, history, approvedBy/At, comments, version y el
   * locking de la entidad. El módulo recibe el estado deseado como payload.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const record = await this.copasstTrainingService.findById(
      ctx.companyId,
      new Types.ObjectId(ctx.entityId.toString()),
    );
    // findById ya valida pertenencia a la empresa (NotFoundException en caso
    // contrario): una entidad de otra empresa no puede decidirse.

    const user = await this.resolveUser(ctx.actor);

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const status: CopasstTrainingApprovalStatus = 'APPROVED';
        return this.copasstTrainingService.approveCopasstTraining(ctx.companyId, user, {
          status,
          comments: ctx.comments ?? ctx.reason,
        });
      }
      case ApprovalDecision.REJECTED: {
        const status: CopasstTrainingApprovalStatus = 'REJECTED';
        return this.copasstTrainingService.approveCopasstTraining(ctx.companyId, user, {
          status,
          comments: ctx.reason ?? ctx.comments ?? 'Rechazado',
        });
      }
      case ApprovalDecision.ADJUSTMENTS_REQUESTED: {
        const status: CopasstTrainingApprovalStatus = 'ADJUSTMENTS_REQUESTED';
        return this.copasstTrainingService.approveCopasstTraining(ctx.companyId, user, {
          status,
          comments: ctx.comments ?? ctx.reason,
        });
      }
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    // Conversión canónica centralizada (utils/phva-status-map): PENDING →
    // PENDING_APPROVAL, APPROVED → APPROVED, REJECTED → REJECTED,
    // ADJUSTMENTS_REQUESTED → ADJUSTMENTS_REQUESTED, desconocido → DRAFT.
    return mapPhvaAdvancedStatus(localStatus);
  }

  allowedRoles(): string[] {
    // Roles actuales de aprobación de 1.1.7 (controller): submit owner/admin,
    // decisión owner/manager. El motor decide con owner/manager.
    return ['owner', 'manager'];
  }

  /**
   * Resuelve el usuario que decide: si el actor trae un ObjectId lo usa
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

  /** Registro vigente de la empresa (findByCompany devuelve null si no existe). */
  private async findByCompanyOrThrow(companyId: string) {
    const record = await this.copasstTrainingService.findByCompany(
      new Types.ObjectId(companyId),
    );
    if (!record) {
      throw new NotFoundException('Capacitación COPASST not found');
    }
    return record;
  }
}
