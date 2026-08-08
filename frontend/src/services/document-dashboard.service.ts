/**
 * Servicio del Dashboard Documental (SPRINT FRONT-5).
 *
 * Consume el catálogo del DocumentGenerationEngine (GET /document-generation/catalog)
 * y prepara las métricas del Panel de gestión documental. Toda la lógica de
 * agregación vive aquí (no en componentes).
 */
import { getCatalog } from './document-catalog.service';
import type { DocumentDashboardSummary, DocumentTypeSummary } from '../types/document-dashboard';

/**
 * Límite de consulta del catálogo para el dashboard. El backend capa `limit`
 * a 100, por lo que las métricas se calculan sobre hasta 100 instancias;
 * `totalDocuments` usa el total exacto devuelto por la paginación.
 */
const DASHBOARD_CATALOG_LIMIT = 100;

/**
 * Métricas del panel documental.
 *
 * Semántica de estados (espejo del enum DocumentStatus del motor):
 * - approved  → instancias APPROVED + SIGNED (firmado implica aprobado)
 * - pending   → instancias PENDING_APPROVAL
 * - rejected  → 0 (el ciclo de vida de DocumentInstance no genera instancias
 *               para decisiones rechazadas; se expone por compatibilidad)
 * - archived  → instancias ARCHIVED
 */
export async function getDocumentDashboard(token: string): Promise<DocumentDashboardSummary> {
  const page = await getCatalog(token, { limit: DASHBOARD_CATALOG_LIMIT });
  const items = page.items;

  const count = (status: string): number =>
    items.filter((item) => item.status === status).length;

  const byTypeMap = new Map<string, number>();
  for (const item of items) {
    byTypeMap.set(item.documentType, (byTypeMap.get(item.documentType) ?? 0) + 1);
  }
  const byType: DocumentTypeSummary[] = [...byTypeMap.entries()]
    .map(([documentType, countValue]) => ({ documentType, count: countValue }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDocuments: page.total,
    approved: count('APPROVED') + count('SIGNED'),
    pending: count('PENDING_APPROVAL'),
    rejected: 0,
    archived: count('ARCHIVED'),
    byType,
  };
}
