import type { ReactNode } from 'react';
import type {
  DocumentApprovalInfo,
  DocumentCatalogDetail,
  DocumentCatalogStatus,
  DocumentVersionItem,
} from '../../types/document-catalog';

/**
 * Opciones de tipo documental para el filtro del catálogo (SPRINT FRONT-3).
 * Valores espejo del enum backend DocumentTemplateType. Preparado para
 * incorporar futuros documentos (p. ej. COPASST/Convivencia ya incluidos).
 */
export const CATALOG_DOCUMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'PHVA_RESPONSIBLE_SG_SST', label: 'Responsable SG-SST' },
  { value: 'PHVA_COPASST', label: 'COPASST' },
  { value: 'PHVA_RESPONSIBILITIES', label: 'Responsabilidades SG-SST' },
  { value: 'PHVA_RESOURCE_ASSIGNMENT', label: 'Asignación de Recursos' },
  { value: 'PHVA_SST_POLICY', label: 'Política SST' },
];

/**
 * Módulos fuente soportados por el motor (espejo del enum backend
 * DocumentSourceModule).
 */
export const CATALOG_SOURCE_MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: 'PHVA_ADVANCED', label: 'PHVA Advanced' },
  { value: 'DOCUMENT_MANAGEMENT', label: 'Gestión Documental' },
  { value: 'TEMPLATES', label: 'Plantillas' },
  { value: 'OTHER', label: 'Otro' },
];

/** Etiqueta legible de un tipo documental (desconocido → valor crudo). */
export function documentTypeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CATALOG_DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Etiqueta legible de un módulo fuente (desconocido → valor crudo). */
export function sourceModuleLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CATALOG_SOURCE_MODULE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Etiqueta legible de una entidad fuente (desconocido → valor crudo). */
export function sourceEntityLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const map: Record<string, string> = {
    RESPONSIBLE_SG_SST: 'Responsable SG-SST',
    COPASST: 'COPASST',
    RESPONSIBILITIES: 'Responsabilidades SG-SST',
    RESOURCE_ASSIGNMENT: 'Asignación de Recursos',
    SST_POLICY: 'Política SST',
  };
  return map[value] ?? value;
}

/**
 * Helpers de UI compartidos del Catálogo Documental (SPRINT FRONT-1 / FRONT-2).
 *
 * Centraliza las etiquetas y el mapeo de clases CSS de los estados del
 * DocumentGenerationEngine para evitar duplicación entre la página
 * (DocumentManagementPage) y el drawer de detalle (DocumentCatalogDetailDrawer).
 */

/** Etiquetas de estados del catálogo (DocumentGenerationEngine). */
export const CATALOG_STATUS_LABELS: Record<DocumentCatalogStatus, string> = {
  GENERATED: 'Generado',
  PENDING_APPROVAL: 'Pendiente aprobación',
  APPROVED: 'Aprobado',
  SIGNED: 'Firmado',
  ARCHIVED: 'Archivado',
};

/** Mapeo de estados del catálogo a las clases CSS existentes de status-badge. */
export const CATALOG_STATUS_BADGE_CLASS: Record<DocumentCatalogStatus, string> = {
  GENERATED: 'draft',
  PENDING_APPROVAL: 'pending',
  APPROVED: 'approved',
  SIGNED: 'active',
  ARCHIVED: 'archived',
};

/** Badge de estado del catálogo reutilizable. */
export function CatalogStatusBadge({ status }: { status: DocumentCatalogStatus }): ReactNode {
  const label = CATALOG_STATUS_LABELS[status] ?? status;
  const cls = CATALOG_STATUS_BADGE_CLASS[status] ?? 'draft';
  return <span className={`status-badge status-badge--${cls}`}>{label}</span>;
}

/** Formatea una fecha como fecha corta en es-CO. */
export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Formatea una fecha como fecha+hora en es-CO. */
export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Mapea un DocumentCatalogDetail a items de versión (SPRINT FRONT-4).
 *
 * Incluye la instancia actual (isCurrent: true) más las versiones previas
 * de la misma entidad que devuelve el backend. El campo createdBy usa
 * approvedBy como actor disponible en el ViewModel del catálogo.
 */
export function buildVersionItems(detail: DocumentCatalogDetail): DocumentVersionItem[] {
  const current: DocumentVersionItem = {
    id: detail.id,
    version: detail.version,
    status: detail.status,
    createdAt: detail.generatedAt,
    createdBy: detail.approvedBy,
    isCurrent: true,
    downloadUrl: detail.downloadUrl,
  };
  const others: DocumentVersionItem[] = detail.versions.map((v) => ({
    id: v.id,
    version: v.version,
    status: v.status,
    createdAt: v.generatedAt,
    createdBy: v.approvedBy,
    isCurrent: false,
    downloadUrl: v.downloadUrl,
  }));
  return [current, ...others];
}

/** Mapea la aprobación del detalle a DocumentApprovalInfo (SPRINT FRONT-4). */
export function toApprovalInfo(detail: DocumentCatalogDetail): DocumentApprovalInfo {
  return {
    approvalStatus: detail.approval.status,
    approvedBy: detail.approval.approvedBy,
    approvedAt: detail.approval.approvedAt,
    approvalEventId: detail.approval.approvalEventId,
    requestId: detail.approval.approvalRequestId,
  };
}
