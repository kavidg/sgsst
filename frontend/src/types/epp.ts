/**
 * Tipos del módulo operativo de entregas de EPP (4.2.6 — Alternativa B).
 *
 * CONTRATO: estos tipos reflejan EXACTAMENTE los DTOs y schemas del backend:
 *  - backend/src/modules/epp/dto/create-epp-delivery.dto.ts
 *  - backend/src/modules/epp/dto/update-epp-delivery.dto.ts
 *  - backend/src/modules/epp/dto/update-epp-delivery-status.dto.ts
 *  - backend/src/modules/epp/schemas/epp-delivery.schema.ts
 *
 * FRONTERAS (misma semántica del backend):
 *  - EppDelivery es la ÚNICA fuente de verdad de lo entregado realmente
 *    (cumplimiento). EppApplicability define REQUISITOS (ver api.ts).
 *  - El cliente NUNCA envía: companyId (tenant resuelto server-side),
 *    createdBy/updatedBy (server-side), history (server-side inmutable),
 *    snapshots de nombres ni status al crear (siempre ACTIVE).
 *  - El vencimiento es DINÁMICO: no existe estado EXPIRED persistido. El
 *    backend expone "vencidas" vía filtro ?overdue=true en el listado.
 *
 * NOTA DE SCORING: el score V2 de 4.2.6 es responsabilidad EXCLUSIVA del
 * backend (compliance-engine). Esta capa solo transporta datos; el frontend
 * NO recalcula cobertura, vigencia, condición ni trazabilidad.
 */

/** Condición física del EPP entregado (enum cerrado del schema). */
export type EppDeliveryCondition = 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';

/** Estado del ciclo de vida de la entrega (ACTIVE al crear; terminales vía /status). */
export type EppDeliveryStatus = 'ACTIVE' | 'REPLACED' | 'RETURNED' | 'DAMAGED';

/** Estados RESUELTOS que acepta PATCH /epp/deliveries/:id/status (DTO backend). */
export type EppDeliveryResolvedStatus = Exclude<EppDeliveryStatus, 'ACTIVE'>;

/** Acciones del historial server-side (enum EppDeliveryHistoryAction). */
export type EppDeliveryHistoryAction = 'CREATED' | 'UPDATED' | 'REPLACED' | 'RETURNED' | 'DAMAGED';

/** Entrada del historial inmutable (generada server-side; nunca se envía). */
export interface EppDeliveryHistoryEntry {
  action: EppDeliveryHistoryAction;
  date: string;
  performedBy: string;
  comment?: string | null;
}

/**
 * Entrega real de EPP a un trabajador (documento EppDelivery del backend).
 *
 * employeeId/eppItemId son la identidad de trazabilidad (inmutables tras crear).
 * eppItemId comparte el MISMO espacio de identidad lógico que
 * EppApplicability.eppItemId (eppId del catálogo SstEpp): no requiere adaptador.
 */
export interface EppDelivery {
  _id: string;
  companyId?: string;
  /** Employee._id (trabajador REAL de la empresa). */
  employeeId: string;
  /** Snapshot de auditoría del nombre del trabajador al momento de la entrega. */
  employeeNameSnapshot: string;
  /** Identidad LÓGICA del ítem en SstEpp.catalog[] (igual que EppApplicability). */
  eppItemId: string;
  /** Snapshot de auditoría del nombre del elemento. */
  eppNameSnapshot: string;

  /** Fecha de la ENTREGA REALIZADA (ISO; nunca futura). */
  deliveryDate: string;
  /** Reposición esperada (>= deliveryDate; base del vencimiento dinámico). */
  expectedReplacementDate?: string | null;
  /** Reposición efectiva (obligatoria cuando status = REPLACED). */
  actualReplacementDate?: string | null;

  /** Cantidad entregada (siempre positiva; el backend valida 1–1000). */
  quantity: number;
  condition: EppDeliveryCondition;
  status: EppDeliveryStatus;

  /** Evidencia ESPECÍFICA del evento de entrega (firma/acta/foto). */
  evidenceUrl?: string | null;
  /** Certificado/conformidad del elemento (trazabilidad técnica). */
  certificateUrl?: string | null;
  observations?: string | null;

  /** UID Firebase del creador (server-side; nunca del cliente). */
  createdBy?: string;
  updatedBy?: string;

  /** Historial inmutable generado server-side. */
  history?: EppDeliveryHistoryEntry[];

  createdAt?: string;
  updatedAt?: string;

  /**
   * Reservado para la especificación: el backend HOY NO agrega este campo a
   * los documentos; el vencimiento se consulta con el filtro ?overdue=true.
   * NO persistir ni enviar al backend.
   */
  overdue?: boolean;
}

// ============================================================
// PAYLOADS (contrato exacto de los DTOs backend)
// ============================================================

/**
 * Crear entrega — POST /epp/deliveries (CreateEppDeliveryDto).
 *
 * quantity y condition son OPCIONALES en el DTO (defaults backend: 1 y GOOD).
 * El cliente nunca envía status/companyId/history/snapshots.
 */
export interface CreateEppDeliveryPayload {
  employeeId: string;
  eppItemId: string;
  deliveryDate: string;
  /** Opcional en el DTO (default backend 1). */
  quantity?: number;
  /** Opcional en el DTO (default backend GOOD). */
  condition?: EppDeliveryCondition;
  expectedReplacementDate?: string;
  evidenceUrl?: string;
  certificateUrl?: string;
  observations?: string;
}

/**
 * Editar entrega — PATCH /epp/deliveries/:id (UpdateEppDeliveryDto).
 *
 * QUEDAN FUERA DEL CONTRATO (el ValidationPipe con whitelist +
 * forbidNonWhitelisted rechaza cualquier campo extra):
 *   companyId, employeeId, eppItemId, createdBy, updatedBy, history y status
 *   (las transiciones van SOLO por PATCH /:id/status).
 * Integridad: no se puede "reasignar" una entrega a otro trabajador/EPP; el
 * ciclo correcto es resolver (devolver/reemplazar/dar de baja) y crear una
 * entrega nueva.
 */
export interface UpdateEppDeliveryPayload {
  deliveryDate?: string;
  expectedReplacementDate?: string;
  actualReplacementDate?: string;
  quantity?: number;
  condition?: EppDeliveryCondition;
  evidenceUrl?: string;
  certificateUrl?: string;
  observations?: string;
}

/**
 * Cambio de estado — PATCH /epp/deliveries/:id/status
 * (UpdateEppDeliveryStatusDto del backend).
 *
 * Solo estados RESUELTOS (REPLACED/RETURNED/DAMAGED): el cliente no puede
 * re-activar una entrega; la reposición del ciclo es una NUEVA entrega.
 * El backend valida la transición ACTIVE → terminal.
 * Nota: el DTO solo acepta status/actualReplacementDate/comment/evidenceUrl
 * (certificateUrl y observations NO forman parte de este endpoint).
 */
export interface UpdateEppDeliveryStatusPayload {
  status: EppDeliveryResolvedStatus;
  /** Fecha efectiva del reemplazo (obligatoria si status=REPLACED; validado en service). */
  actualReplacementDate?: string;
  /** Comentario asociado a la entrada del historial (server-side). */
  comment?: string;
  /** Evidencia del evento (p. ej. foto del EPP dañado); asociada al historial. */
  evidenceUrl?: string;
}

// ============================================================
// FILTROS DE LISTADO (GET /epp/deliveries)
// ============================================================

/**
 * Filtros del listado de entregas. Se serializan solo los definidos
 * (sin parámetros undefined), siguiendo la convención de api.ts.
 */
export interface EppDeliveryFilters {
  employeeId?: string;
  eppItemId?: string;
  status?: EppDeliveryStatus;
  /** Fecha desde (deliveryDate >= from). */
  from?: string;
  /** Fecha hasta (deliveryDate <= to). */
  to?: string;
  /** true = solo entregas vencidas dinámicamente (reposición no registrada). */
  overdue?: boolean;
}

/** Respuesta del endpoint de historial (GET /epp/deliveries/:id/history). */
export interface EppDeliveryHistoryResponse {
  deliveryId: string;
  history: EppDeliveryHistoryEntry[];
}
