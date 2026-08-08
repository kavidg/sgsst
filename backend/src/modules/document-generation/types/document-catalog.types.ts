import { DocumentTemplateType } from './document-generation.types';
import { DocumentStatus } from './document-generation.types';
import { RendererFormat } from './renderer.types';

/**
 * Tipos del Document Catalog (Fase 6.5).
 *
 * Catálogo único de consulta de los documentos generados por el Document
 * Generation Engine. Consulta EXCLUSIVAMENTE DocumentInstance (única fuente
 * de verdad documental): no crea schemas nuevos ni duplica información.
 *
 * El catálogo devuelve un ViewModel (DocumentCatalogItem) — nunca el schema
 * completo — enriquecido con:
 * - title / documentType: resueltos desde la plantilla (DocumentTemplate) que
 *   referencia la instancia.
 * - companyName: resuelto desde la empresa propietaria (Company).
 * - downloadUrl: la fileUrl pública de la instancia.
 *
 * Los valores que no existen se devuelven null (p.ej. approvedAt en una
 * instancia GENERATED sin aprobación).
 */

/** Item del catálogo (ViewModel de listado y detalle). */
export interface DocumentCatalogItem {
  id: string;
  title: string;
  documentType: DocumentTemplateType;
  status: DocumentStatus;
  companyId: string;
  companyName: string | null;
  version: number;
  format: RendererFormat;
  generatedAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  sourceModule: string;
  sourceEntity: string;
  downloadUrl: string;
}

/**
 * Detalle de una instancia documental (GET /catalog/:id).
 *
 * Incluye la instancia, los metadatos de aprobación y el historial de
 * versiones de la MISMA entidad de origen (otras DocumentInstance con el
 * mismo companyId + sourceModule + sourceEntity + sourceEntityId, excluyendo
 * la consultada). Sin duplicar información: cada versión es una instancia
 * real ya persistida.
 */
export interface DocumentCatalogDetail extends DocumentCatalogItem {
  storagePath: string;
  sourceEntityId: string | null;
  templateId: string;
  template: {
    id: string;
    name: string;
    documentType: DocumentTemplateType;
    version: number;
  } | null;
  approval: {
    status: string | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    approvalEventId: string | null;
    approvalRequestId: string | null;
  };
  /** Otras instancias de la misma entidad de origen (historial de versiones). */
  versions: DocumentCatalogItem[];
}

/** Página del catálogo (respuesta paginada). */
export interface DocumentCatalogPage {
  items: DocumentCatalogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Claves de ordenamiento admitidas por el catálogo. Un prefijo '-' invierte
 * el orden (p.ej. '-generatedAt' = más reciente primero).
 */
export const DOCUMENT_CATALOG_SORT_FIELDS = [
  'generatedAt',
  'createdAt',
  'version',
  'status',
  'companyId',
  'sourceModule',
  'sourceEntity',
] as const;

export type DocumentCatalogSortField = (typeof DOCUMENT_CATALOG_SORT_FIELDS)[number];
