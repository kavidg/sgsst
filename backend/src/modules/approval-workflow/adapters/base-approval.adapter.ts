import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalNotificationEvent } from '../services/approval-notification.service';
import { ApprovalAdapter, ApplyDecisionContext } from './approval-adapter.interface';

/**
 * Clase abstracta base para adapters del Approval Workflow Core.
 *
 * Proporciona valores por defecto y métodos opcionales para reducir
 * boilerplate en adapters específicos de dominio.
 *
 * Cada adapter concreto debe:
 * - Definir `module` (ApprovalEntity)
 * - Implementar `getEntity()`, `applyDecision()`, `mapStatus()`
 * - Opcionalmente sobreescribir `allowedRoles()`, `getEntityLabel()`, `getDefaultActionUrl()`
 * - Opcionalmente sobreescribir `getNotificationMessage()`, `getModuleCode()`, `getModuleName()`
 *
 * Ejemplo de uso:
 * ```ts
 * @Injectable()
 * export class MyAdapter extends BaseApprovalAdapter {
 *   readonly module = ApprovalEntity.MY_ENTITY;
 *   // ... implementar métodos abstractos
 * }
 * ```
 */
export abstract class BaseApprovalAdapter implements ApprovalAdapter {
  abstract readonly module: ApprovalEntity;

  abstract getEntity(companyId: string, entityId?: string): Promise<unknown>;

  abstract applyDecision(ctx: ApplyDecisionContext): Promise<unknown>;

  abstract mapStatus(localStatus: string): ApprovalStatus;

  /**
   * Roles autorizados para decidir sobre esta entidad.
   * Por defecto: owner y manager.
   * Sobreescribir en adapters que requieran otros roles.
   */
  allowedRoles(): string[] {
    return ['owner', 'manager'];
  }

  /**
   * Retorna un identificador legible de la entidad para mensajes y alertas.
   * Ejemplo: "ADQ-2026-0001", "DOC-2026-0042"
   *
   * Opcional — si no se implementa, se usa el entityId como fallback.
   */
  getEntityLabel?(entity: unknown): string;

  /**
   * Retorna la URL de navegación para la entidad.
   * Ejemplo: "/acquisitions", "/documents"
   *
   * Opcional — si no se implementa, se usa "/" como fallback.
   */
  getDefaultActionUrl?(entity: unknown): string;

  /**
   * Retorna el mensaje de notificación específico del dominio para un evento.
   * Por defecto genera un mensaje genérico usando el entityLabel.
   * Sobreescribir para personalizar por dominio.
   */
  getNotificationMessage(event: ApprovalNotificationEvent, entityLabel: string): string {
    const entityName = this.getModuleName?.() ?? this.module;
    switch (event) {
      case 'APPROVAL_SUBMITTED':
        return `${entityName} ${entityLabel} enviada al flujo de aprobación y requiere revisión.`;
      case 'APPROVED':
        return `${entityName} ${entityLabel} fue aprobada correctamente.`;
      case 'REJECTED':
        return `${entityName} ${entityLabel} fue rechazada y requiere revisión.`;
      case 'ADJUSTMENTS_REQUESTED':
        return `${entityName} ${entityLabel}: se solicitaron ajustes antes de continuar con la aprobación.`;
    }
  }

  /**
   * Retorna el moduleCode para la alerta.
   * Por defecto retorna cadena vacía. Sobreescribir por dominio.
   */
  getModuleCode(): string {
    return '';
  }

  /**
   * Retorna el moduleName para la alerta.
   * Por defecto retorna cadena vacía. Sobreescribir por dominio.
   */
  getModuleName(): string {
    return '';
  }

  /**
   * Mapa canónico de decisiones a estados.
   * Reutilizable por todos los adapters — no necesita sobreescribirse.
   */
  protected mapDecisionToStatus(decision: string): ApprovalStatus {
    switch (decision) {
      case 'APPROVED':
        return ApprovalStatus.APPROVED;
      case 'REJECTED':
        return ApprovalStatus.REJECTED;
      case 'ADJUSTMENTS_REQUESTED':
        return ApprovalStatus.ADJUSTMENTS_REQUESTED;
      default:
        return ApprovalStatus.DRAFT;
    }
  }
}
