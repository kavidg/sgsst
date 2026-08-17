import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalAdapter, ApplyDecisionContext } from './approval-adapter.interface';
import { CopasstService } from '../../copasst/copasst.service';

/**
 * Adapter de COPASST para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo existente del COPASST SIN
 * modificar sus endpoints ni su lógica: reutiliza CopasstService.approve
 * (conserva el cambio a APPROVED_AND_SIGNED, auditHistory, approvedBy, acta de
 * constitución en PDF y las alertas a admins) y CopasstService.reject
 * (conserva REJECTED, rejectionReason, rejectedBy, auditHistory y alertas).
 *
 * Particularidad del dominio: los periodos son por empresa, por lo que
 * getEntity soporta periodId opcional — cuando no se provee, resuelve el
 * periodo activo vigente por companyId (findCurrent).
 *
 * Estados locales (schema CopasstPeriod.approvalStatus):
 * DRAFT, PENDING_APPROVAL, APPROVED, APPROVED_AND_SIGNED, REJECTED, ARCHIVED.
 * APPROVED_AND_SIGNED es un estado compuesto de negocio (aprobado y firmado)
 * que se mapea al ApprovalStatus.APPROVED canónico del motor.
 */
@Injectable()
export class CopasstAdapter implements ApprovalAdapter {
  readonly module = ApprovalEntity.COPASST;

  constructor(
    @Inject(forwardRef(() => CopasstService))
    private readonly copasstService: CopasstService,
  ) {}

  /**
   * Carga el periodo validando pertenencia por companyId y devuelve el contexto
   * de la entidad (entity, status, version).
   *
   * Soporta dos escenarios:
   * A) periodId presente → carga el periodo específico.
   * B) periodId undefined → carga el periodo activo vigente de la empresa.
   */
  async getEntity(companyId: string, periodId?: string) {
    const period = periodId
      ? await this.copasstService.findById(new Types.ObjectId(periodId))
      : await this.copasstService.findCurrent(new Types.ObjectId(companyId));

    if (period.companyId.toString() !== companyId) {
      throw new NotFoundException('COPASST period not found');
    }

    return {
      entity: period,
      status: period.approvalStatus,
      // El periodo conserva su propia versión textual (currentVersion "1.0");
      // se expone 1 por contrato del motor.
      version: 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre el periodo real, reutilizando la
   * lógica existente de CopasstService (approve/reject) que conserva el estado,
   * auditHistory, firmas, acta PDF y alertas del módulo.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const periodId = ctx.entityId.toString();
    const period = await this.copasstService.findById(new Types.ObjectId(periodId));
    if (period.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('COPASST period not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const userEmail =
          this.signatureValue(ctx, 'signerEmail') ?? ctx.actor.email ?? '';
        const role = this.signatureValue(ctx, 'signerRole') ?? ctx.actor.role ?? 'manager';
        // F7B-10.6-D: companyId del contexto del motor (verificado contra el
        // periodo arriba); el service vuelve a scope por _id + companyId.
        return this.copasstService.approve(
          new Types.ObjectId(ctx.companyId.toString()),
          periodId,
          userEmail,
          role,
        );
      }
      case ApprovalDecision.REJECTED: {
        const reason = ctx.reason ?? ctx.comments ?? 'Rechazado';
        return this.copasstService.reject(
          new Types.ObjectId(ctx.companyId.toString()),
          periodId,
          reason,
          ctx.actor.email ?? 'system',
        );
      }
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        throw new BadRequestException(
          'ADJUSTMENTS_REQUESTED is not supported by CopasstAdapter',
        );
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    switch (localStatus) {
      case 'PENDING_APPROVAL':
        return ApprovalStatus.PENDING_APPROVAL;
      case 'APPROVED':
      case 'APPROVED_AND_SIGNED':
        // Estado compuesto de negocio: el periodo fue aprobado y firmado.
        return ApprovalStatus.APPROVED;
      case 'REJECTED':
        return ApprovalStatus.REJECTED;
      case 'ARCHIVED':
        return ApprovalStatus.ARCHIVED;
      case 'DRAFT':
      default:
        return ApprovalStatus.DRAFT;
    }
  }

  allowedRoles(): string[] {
    // Roles actuales de aprobación/rechazo del COPASST (controller).
    return ['owner', 'manager'];
  }

  private signatureValue(ctx: ApplyDecisionContext, key: string): string | undefined {
    const value = ctx.metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
