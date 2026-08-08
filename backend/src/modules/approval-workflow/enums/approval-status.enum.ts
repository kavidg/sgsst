/**
 * Estado canónico de una solicitud de aprobación en el Approval Workflow Core.
 *
 * Flujo: DRAFT → PENDING_APPROVAL → APPROVED | REJECTED | ADJUSTMENTS_REQUESTED
 * Ciclo cerrado: ARCHIVED
 * Los módulos existentes conservan sus enums locales; este enum es la fuente
 * de verdad del motor de aprobaciones.
 *
 * ---------------------------------------------------------------------------
 * SEMÁNTICA DE CADA ESTADO
 * ---------------------------------------------------------------------------
 * - DRAFT: estado conceptual inicial. Puede no persistirse (el motor crea la
 *   solicitud directamente en PENDING_APPROVAL en la mayoría de los flujos).
 *
 * - PENDING_APPROVAL: la solicitud fue enviada y está esperando la decisión
 *   de los roles asignados (owner/admin/manager según `allowedRoles`).
 *
 * - APPROVED: decisión positiva; el adapter aplicó la aprobación sobre la
 *   entidad de negocio real reutilizando el servicio existente del módulo.
 *
 * - REJECTED: la solicitud fue rechazada con un motivo. La entidad puede
 *   corregirse y reenviarse, iniciando un NUEVO ciclo de aprobación (el índice
 *   compuesto companyId+module+entityId+status no es único precisamente para
 *   permitir este reflujo).
 *
 * - ADJUSTMENTS_REQUESTED: se solicitan correcciones antes de reaprobar; el
 *   solicitante actualiza la entidad y vuelve a enviar.
 *
 * - ARCHIVED: ciclo cerrado (p.ej. documento obsoleto o plan archivado); no se
 *   puede decidir ni reenviar sin abrir un nuevo ciclo.
 *
 * ---------------------------------------------------------------------------
 * EQUIVALENCIAS DE NEGOCIO (mapStatus de los adapters)
 * ---------------------------------------------------------------------------
 * - DocumentStatus: PENDING_APPROVAL → PENDING_APPROVAL; APPROVED/ACTIVE →
 *   APPROVED; OBSOLETE/ARCHIVED → ARCHIVED; DRAFT/UNDER_REVIEW → DRAFT.
 *
 * - AnnualWorkPlanStatus: Draft → DRAFT; PendingApproval/PENDING_APPROVAL →
 *   PENDING_APPROVAL; Approved/Active → APPROVED; Completed → APPROVED
 *   (equivalencia de negocio: un plan completado fue aprobado en su momento);
 *   Archived → ARCHIVED.
 */
export enum ApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ADJUSTMENTS_REQUESTED = 'ADJUSTMENTS_REQUESTED',
  ARCHIVED = 'ARCHIVED',
}
