/**
 * Tipos del Dashboard Documental (SPRINT FRONT-5).
 *
 * Métricas de UI calculadas a partir del catálogo del DocumentGenerationEngine
 * (GET /document-generation/catalog). Espejo estricto del contrato calculado
 * por document-dashboard.service.ts — sin any, TypeScript estricto.
 */

/** Conteo de instancias por tipo documental. */
export interface DocumentTypeSummary {
  documentType: string;
  count: number;
}

/**
 * Resumen del panel documental de una empresa.
 *
 * Nota de semántica (SPRINT FRONT-5): el ciclo de vida de DocumentInstance no
 * incluye un estado REJECTED (las decisiones rechazadas nunca generan
 * instancias documentales), por lo que `rejected` se expone como 0.
 */
export interface DocumentDashboardSummary {
  totalDocuments: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;
  byType: DocumentTypeSummary[];
}
