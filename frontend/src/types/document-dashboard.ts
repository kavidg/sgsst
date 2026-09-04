/**
 * Tipos del Dashboard Documental.
 *
 * Métricas de UI calculadas a partir de DocumentMaster (fuente única de
 * verdad) vía GET /document-management/dashboard.
 */

/** Conteo de instancias por tipo documental. */
export interface DocumentTypeSummary {
  documentType: string;
  count: number;
}

/**
 * Resumen del panel documental de una empresa.
 */
export interface DocumentDashboardSummary {
  totalDocuments: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;
  byType: DocumentTypeSummary[];
  /** Documentos próximos a vencer (dentro de 30 días). */
  expiringSoon?: number;
  /** Documentos ya vencidos. */
  expired?: number;
}
