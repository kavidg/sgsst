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
 * Handler de la sub-entidad Responsible SG-SST (1.1.1) del módulo PHVA Advanced
 * para el Approval Workflow Core.
 *
 * Fase 2 — Conecta el motor de aprobaciones con el flujo del Responsable del
 * SG-SST SIN modificar sus endpoints ni su lógica: reutiliza
 * PhvaAdvancedService.approveResponsableSst (conserva el cambio a
 * APPROVED/APPROVED_AND_SIGNED, approvedBy, auditHistory y las alertas a
 * admins) y PhvaAdvancedService.rejectResponsableSst (conserva REJECTED,
 * rejectionReason, rejectedBy y auditHistory).
 *
 * Particularidad del dominio: el registro es UNO por empresa (itemCode fijo
 * '1.1.1'), por lo que getEntity soporta entityId opcional — cuando no se
 * provee, resuelve el registro vigente por companyId (findResponsableSstByCompany).
 *
 * Estados locales (schema approvalStatus):
 * DRAFT, PENDING_APPROVAL, APPROVED, APPROVED_AND_SIGNED, REJECTED, ARCHIVED.
 * APPROVED_AND_SIGNED es un estado compuesto de negocio (aprobado y firmado)
 * que se mapea al ApprovalStatus.APPROVED canónico del motor.
 */
@Injectable()
export class ResponsibleSgsstHandler {
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
      ? await this.phvaAdvancedService.findResponsableSstById(
          new Types.ObjectId(entityId),
        )
      : await this.phvaAdvancedService.findResponsableSstByCompany(
          new Types.ObjectId(companyId),
        );

    if (record.companyId.toString() !== companyId) {
      throw new NotFoundException('Responsable SST not found');
    }

    return {
      entity: record,
      status: record.approvalStatus,
      // El registro conserva su propia versión textual (currentVersion "1.0");
      // se expone 1 por contrato del motor.
      version: 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre el registro real, reutilizando la
   * lógica existente de PhvaAdvancedService (approve/reject) que conserva el
   * estado, auditHistory, approvedBy/rejectedBy y alertas del módulo.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const record = await this.phvaAdvancedService.findResponsableSstById(
      new Types.ObjectId(ctx.entityId.toString()),
    );
    if (record.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('Responsable SST not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const user = await this.resolveUser(ctx.actor);
        return this.phvaAdvancedService.approveResponsableSst(ctx.companyId, user);
      }
      case ApprovalDecision.REJECTED: {
        const user = await this.resolveUser(ctx.actor);
        const reason = ctx.reason ?? ctx.comments ?? 'Rechazado';
        return this.phvaAdvancedService.rejectResponsableSst(ctx.companyId, user, reason);
      }
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        throw new BadRequestException(
          'ADJUSTMENTS_REQUESTED is not supported by ResponsibleSgsstHandler',
        );
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    // Conversión canónica centralizada (Fase 6.7): APPROVED_AND_SIGNED →
    // APPROVED, PENDING_APPROVAL → PENDING_APPROVAL, REJECTED → REJECTED,
    // ARCHIVED → ARCHIVED, DRAFT/desconocido → DRAFT.
    return mapPhvaAdvancedStatus(localStatus);
  }

  allowedRoles(): string[] {
    // Roles actuales de aprobación/rechazo de Responsible SG-SST (controller):
    // submit owner/admin, approve/reject owner/manager.
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
