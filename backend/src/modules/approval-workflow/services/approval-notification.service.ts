import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalAdapter } from '../adapters/approval-adapter.interface';

/**
 * Eventos del Approval Workflow que generan notificaciones.
 */
export type ApprovalNotificationEvent =
  | 'APPROVAL_SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ADJUSTMENTS_REQUESTED';

/**
 * Contexto necesario para construir una notificación de aprobación.
 */
export interface ApprovalNotificationContext {
  /** Empresa (companyId validado por CompanyAccessGuard). */
  companyId: Types.ObjectId;
  /** Entidad del sistema. */
  entity: ApprovalEntity;
  /** Identificador de la entidad (ObjectId). */
  entityId: string;
  /** Identificador legible de la entidad (ej: ADQ-2026-0001). */
  entityLabel: string;
  /** Evento que disparó la notificación. */
  event: ApprovalNotificationEvent;
  /** Email del usuario que realizó la acción. */
  actorEmail?: string;
  /** URL de navegación a la entidad. */
  actionUrl?: string;
}

/**
 * Convención de nombres de tipos de alerta:
 * <ENTITY>_<EVENT>
 *
 * Ejemplo: ACQUISITION_APPROVED, DOCUMENT_RETENTION_REJECTED
 */
const EVENT_TYPE_MAP: Record<ApprovalNotificationEvent, string> = {
  APPROVAL_SUBMITTED: 'APPROVAL_SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ADJUSTMENTS_REQUESTED: 'ADJUSTMENTS_REQUESTED',
};

const EVENT_SEVERITY_MAP: Record<ApprovalNotificationEvent, AlertSeverity> = {
  APPROVAL_SUBMITTED: AlertSeverity.HIGH,
  APPROVED: AlertSeverity.MEDIUM,
  REJECTED: AlertSeverity.HIGH,
  ADJUSTMENTS_REQUESTED: AlertSeverity.MEDIUM,
};

/**
 * Servicio genérico de notificaciones para el Approval Workflow.
 *
 * Centraliza la creación de alertas para eventos de aprobación,
 * eliminando la necesidad de duplicar notifyApprovalEvent() en cada módulo.
 *
 * El servicio NO contiene lógica específica de ningún dominio.
 * Delega en el adapter para:
 * - obtener el mensaje de notificación (getNotificationMessage)
 * - obtener el moduleCode y moduleName (getModuleCode, getModuleName)
 * - obtener la URL de acción (getDefaultActionUrl)
 * - obtener los roles autorizados (allowedRoles)
 *
 * Utiliza:
 * - AlertsService (sistema existente de notificaciones)
 * - UserModel (para obtener destinatarios por companyId y rol)
 * - Convención de nombres para tipos de alerta
 *
 * No bloquea el workflow si falla una alerta.
 * Mantiene tenant isolation en todas las queries.
 */
@Injectable()
export class ApprovalNotificationService {
  private readonly logger = new Logger(ApprovalNotificationService.name);

  constructor(
    private readonly alertsService: AlertsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Envía notificación a los destinatarios relevantes para un evento de aprobación.
   *
   * El servicio es completamente genérico: no contiene lógica específica de ningún dominio.
   * Los mensajes, URLs, moduleCode y moduleName provienen del adapter o del contexto.
   *
   * @param ctx - Contexto del evento de aprobación
   * @param adapter - Adapter del dominio (para obtener allowedRoles, getNotificationMessage, URLs)
   */
  async notify(
    ctx: ApprovalNotificationContext,
    adapter?: ApprovalAdapter,
  ): Promise<void> {
    try {
      const roles = adapter?.allowedRoles() ?? ['owner', 'manager'];
      const recipients = await this.userModel
        .find({
          companyId: ctx.companyId,
          role: { $in: roles },
          isActive: true,
        })
        .lean()
        .exec();

      // Obtener mensaje del adapter (genérico o específico del dominio)
      const message = adapter?.getNotificationMessage
        ? adapter.getNotificationMessage(ctx.event, ctx.entityLabel)
        : `${ctx.entityLabel} — evento ${ctx.event}`;

      // Obtener moduleCode y moduleName del adapter
      const moduleCode = adapter?.getModuleCode?.() ?? '';
      const moduleName = adapter?.getModuleName?.() ?? '';

      const alertType = `${ctx.entity}_${EVENT_TYPE_MAP[ctx.event]}`;
      const severity = EVENT_SEVERITY_MAP[ctx.event];

      // Obtener URL del adapter o del contexto, o fallback a '/'
      const actionUrl = ctx.actionUrl ?? adapter?.getDefaultActionUrl?.('') ?? '/';

      const alertPromises = recipients.map(async (user) => {
        try {
          await this.alertsService.create({
            companyId: ctx.companyId.toString(),
            type: alertType,
            message,
            severity,
            targetUserId: user._id.toString(),
            actionUrl,
            moduleCode,
            moduleName,
            submittedBy: ctx.actorEmail,
            submittedAt: new Date().toISOString(),
            documentId: ctx.entityId,
          });
        } catch (err) {
          this.logger.warn(
            `Failed to create alert for user ${user._id}: ${err instanceof Error ? err.message : 'unknown'}`,
          );
        }
      });

      await Promise.all(alertPromises);
    } catch (err) {
      this.logger.warn(
        `Failed to query recipients for approval alert: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
