/**
 * Servicio del Dashboard Documental.
 *
 * Consume el endpoint del backend (GET /document-management/dashboard) que
 * calcula métricas reales desde DocumentMaster (fuente única de verdad).
 * Ya no calcula métricas en el cliente.
 */
import { fetchDocumentDashboard } from '../api';
import type { DocumentDashboardSummary, DocumentTypeSummary } from '../types/document-dashboard';

/**
 * Métricas del panel documental.
 *
 * Consume directamente el endpoint backend que calcula desde DocumentMaster.
 * Reutiliza apiFetch (con BACKEND_URL y Bearer token) en vez de fetch() directo.
 */
export async function getDocumentDashboard(token: string): Promise<DocumentDashboardSummary> {
  const stats = await fetchDocumentDashboard(token);

  // Mapear byType del backend al formato del frontend
  const byType: DocumentTypeSummary[] = Object.entries(stats.byType)
    .map(([documentType, count]) => ({ documentType, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDocuments: stats.total,
    approved: stats.active,
    pending: 0,
    rejected: 0,
    archived: 0,
    byType,
    expiringSoon: stats.expiringSoon,
    expired: stats.expired,
  };
}
