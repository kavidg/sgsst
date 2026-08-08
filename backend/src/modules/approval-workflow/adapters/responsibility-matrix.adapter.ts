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
import { MatrixApprovalStatus } from '../../responsibility-matrix/schemas/responsibility-matrix.schema';
import { ResponsibilityMatrixService } from '../../responsibility-matrix/responsibility-matrix.service';

/**
 * Adapter de Responsibility Matrix para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo existente de la Matriz de
 * Responsabilidades SIN modificar sus endpoints ni su lógica: reutiliza
 * ResponsibilityMatrixService.approve para aplicar la decisión (conserva el
 * cambio de MatrixApprovalStatus, las versiones, el historial local y la
 * creación automática de la campaña de firmas) y traduce MatrixApprovalStatus
 * al ApprovalStatus canónico.
 *
 * Particularidad del dominio: la matriz es UNA por empresa (itemCode fijo
 * '1.1.2'), por lo que getEntity soporta entityId opcional — cuando no se
 * provee, resuelve la matriz por companyId (findByCompany).
 *
 * El módulo NO posee flujo de rechazo de la matriz (solo rechazo de
 * aceptaciones de trabajadores, que pertenece a otro dominio): REJECTED y
 * ADJUSTMENTS_REQUESTED no están soportados, conservando el comportamiento
 * actual con un error explícito.
 */
@Injectable()
export class ResponsibilityMatrixAdapter implements ApprovalAdapter {
  readonly module = ApprovalEntity.RESPONSIBILITY_MATRIX;

  constructor(
    @Inject(forwardRef(() => ResponsibilityMatrixService))
    private readonly matrixService: ResponsibilityMatrixService,
  ) {}

  /**
   * Carga la matriz validando pertenencia por companyId y devuelve el contexto
   * de la entidad (entity, status, version).
   *
   * Soporta dos escenarios:
   * A) entityId presente → carga la matriz específica.
   * B) entityId undefined → carga la matriz de la empresa (una por company).
   */
  async getEntity(companyId: string, entityId?: string) {
    const matrix = entityId
      ? await this.matrixService.findById(new Types.ObjectId(entityId))
      : await this.matrixService.findByCompany(new Types.ObjectId(companyId));

    if (matrix.companyId.toString() !== companyId) {
      throw new NotFoundException('Responsibility matrix not found');
    }

    return {
      entity: matrix,
      status: matrix.approvalStatus,
      // La matriz conserva su propio conteo de versiones.
      version: matrix.currentVersionNumber ?? 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre la matriz real, reutilizando la lógica
   * existente (ResponsibilityMatrixService.approve) que conserva el cambio de
   * MatrixApprovalStatus, las versiones, el historial local y la campaña de
   * firmas automática.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const matrix = await this.matrixService.findById(
      new Types.ObjectId(ctx.entityId.toString()),
    );
    if (matrix.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('Responsibility matrix not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const approvedByEmail =
          this.signatureValue(ctx, 'approvedByEmail') ?? ctx.actor.email ?? 'Manager';
        return this.matrixService.approve(
          ctx.companyId,
          {
            approvedByEmail,
            comments: ctx.comments ?? ctx.reason,
          },
          ctx.actor.email ?? 'system',
        );
      }
      case ApprovalDecision.REJECTED:
        // No existe flujo de rechazo de la matriz: conservar comportamiento actual.
        throw new BadRequestException(
          'REJECTED is not supported by ResponsibilityMatrixAdapter',
        );
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        throw new BadRequestException(
          'ADJUSTMENTS_REQUESTED is not supported by ResponsibilityMatrixAdapter',
        );
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    switch (localStatus) {
      case MatrixApprovalStatus.PENDING_APPROVAL:
        return ApprovalStatus.PENDING_APPROVAL;
      case MatrixApprovalStatus.APPROVED:
        return ApprovalStatus.APPROVED;
      case MatrixApprovalStatus.ARCHIVED:
        return ApprovalStatus.ARCHIVED;
      case MatrixApprovalStatus.DRAFT:
      default:
        return ApprovalStatus.DRAFT;
    }
  }

  allowedRoles(): string[] {
    return ['owner', 'admin', 'manager'];
  }

  private signatureValue(ctx: ApplyDecisionContext, key: string): string | undefined {
    const value = ctx.metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
