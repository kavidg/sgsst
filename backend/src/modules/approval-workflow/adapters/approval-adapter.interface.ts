import { Types } from 'mongoose';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalActor } from '../interfaces/approval-actor.interface';

/**
 * Token de inyección para el registro de adapters del Approval Workflow Core.
 * Cada adapter registrado habilita el motor para aplicar decisiones reales
 * sobre el módulo correspondiente.
 */
export const APPROVAL_ADAPTERS = 'APPROVAL_ADAPTERS';

/**
 * Contexto de aplicación de una decisión sobre una entidad de negocio.
 */
export interface ApplyDecisionContext {
  companyId: Types.ObjectId;
  entityId: Types.ObjectId;
  decision: ApprovalDecision;
  reason?: string;
  comments?: string;
  actor: ApprovalActor;
  /** Metadatos adicionales específicos del módulo (p.ej. evidencia de firma). */
  metadata?: Record<string, unknown>;
}

/**
 * Contrato base de un adapter del Approval Workflow Core.
 *
 * Un adapter conecta el motor de aprobaciones con un módulo existente SIN
 * modificar sus endpoints ni su lógica de negocio: traduce el estado local al
 * estado canónico y aplica las decisiones reutilizando los servicios del módulo.
 */
export interface ApprovalAdapter {
  /** Entidad del sistema que este adapter gestiona. */
  readonly module: ApprovalEntity;

  /**
   * Carga la entidad de negocio (para validación y contexto).
   *
   * `entityId` es opcional para permitir adapters que consultan por companyId
   * (p.ej. Initial Evaluation, que tiene UNA entidad por empresa). Los
   * adapters que requieren entityId deben lanzar un error controlado si no se
   * provee.
   */
  getEntity(companyId: string, entityId?: string): Promise<unknown>;

  /**
   * Aplica una decisión del motor sobre la entidad real, reutilizando la
   * lógica existente del módulo. Devuelve el resultado del módulo.
   */
  applyDecision(ctx: ApplyDecisionContext): Promise<unknown>;

  /** Traduce el estado local del módulo al ApprovalStatus canónico. */
  mapStatus(localStatus: string): ApprovalStatus;

  /** Roles autorizados para decidir sobre esta entidad. */
  allowedRoles(): string[];
}
