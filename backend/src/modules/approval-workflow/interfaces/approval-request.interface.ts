import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalActor } from './approval-actor.interface';

/**
 * Evidencia de firma vinculada a una solicitud de aprobación.
 * En Fase 0 solo se define la estructura; los adapters de firmas
 * (hash, imagen o campaña de firmas) se conectan en fases posteriores.
 */
export interface ApprovalSignature {
  method: 'HASH' | 'IMAGE' | 'CAMPAIGN';
  hash?: string;
  url?: string;
  campaignId?: string;
}

/**
 * Solicitud de aprobación del Approval Workflow Core.
 *
 * Fase 0: modelo de datos base. No se conecta a ningún módulo todavía;
 * los adapters se encargarán de aplicar las decisiones a los módulos reales.
 */
export interface ApprovalRequest {
  /** Empresa propietaria de la solicitud. */
  companyId: string;
  /** Tipo de entidad del sistema (DOCUMENT, ANNUAL_WORK_PLAN, ...). */
  module: ApprovalEntity;
  /** Nombre del modelo de negocio (p.ej. 'DocumentMaster', 'CopasstPeriod'). */
  entityType: string;
  /** Identificador de la entidad que se solicita aprobar. */
  entityId: string;
  /** Estado canónico del workflow. */
  status: ApprovalStatus;
  /** Paso actual del flujo (preparado para multi-paso futuro). */
  currentStep: number;
  /** Usuario que solicitó la aprobación. */
  requestedBy: ApprovalActor;
  /** Roles autorizados para decidir (por defecto owner y manager). */
  assignedRoles: string[];
  /** Última decisión tomada (null si aún no se decide). */
  decision?: ApprovalDecision;
  /** Usuario que tomó la decisión. */
  decidedBy?: ApprovalActor;
  /** Motivo del rechazo o de los ajustes solicitados. */
  rejectionReason?: string;
  /** Evidencia de firma (preparada para fases futuras). */
  signature?: ApprovalSignature;
  /** Versión de la entidad al momento de la solicitud. */
  version?: number;
  /** Comentarios del solicitante. */
  comments?: string;
}
