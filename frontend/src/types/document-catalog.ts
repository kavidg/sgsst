/**
 * Tipos del Document Catalog (SPRINT FRONT-1 / FRONT-2).
 *
 * Modelos de UI del catálogo documental del DocumentGenerationEngine. El
 * backend expone el ViewModel de cada instancia documental; estos tipos son
 * espejo estricto del contrato JSON (sin any).
 */

/** Estados del ciclo de vida de una instancia documental generada. */
export type DocumentCatalogStatus =
  | 'GENERATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SIGNED'
  | 'ARCHIVED';

/** Formatos de documento soportados por el motor. */
export type DocumentCatalogFormat = 'DOCX' | 'PDF';

/** Item del catálogo (ViewModel de listado y detalle). */
export interface DocumentCatalogItem {
  id: string;
  title: string;
  documentType: string;
  status: DocumentCatalogStatus;
  companyId: string;
  companyName: string | null;
  version: number;
  format: DocumentCatalogFormat;
  generatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  sourceModule: string;
  sourceEntity: string;
  downloadUrl: string;
  /**
   * Fecha de vencimiento (SPRINT FRONT-5). Campo preparado para el futuro:
   * DocumentInstance aún no la expone en el ViewModel del catálogo, por lo
   * que llega undefined y la UI muestra "Sin fecha definida". Nunca se
   * inventan fechas.
   */
  expirationDate?: string | null;
}

/** Metadatos de aprobación del detalle de una instancia. */
export interface DocumentCatalogApproval {
  status: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalEventId: string | null;
  approvalRequestId: string | null;
}

/**
 * Detalle de una instancia (GET /catalog/:id).
 *
 * Nota de contrato (FRONT-2): el backend devuelve el documento aplanado sobre
 * el propio detalle (la instancia ES el documento: id, title, status, etc.),
 * más los metadatos de aprobación (`approval`) y el historial de versiones
 * (`versions`). No existe una propiedad anidada `document`; los campos del
 * documento se consumen directamente desde el detail.
 */
export interface DocumentCatalogDetail extends DocumentCatalogItem {
  storagePath: string;
  sourceEntityId: string | null;
  templateId: string;
  template: {
    id: string;
    name: string;
    documentType: string;
    version: number;
  } | null;
  approval: DocumentCatalogApproval;
  /** Otras instancias de la misma entidad de origen (historial de versiones). */
  versions: DocumentCatalogItem[];
}

/** Página del catálogo (respuesta paginada del endpoint). */
export interface DocumentCatalogPage {
  items: DocumentCatalogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Información de aprobación documental (SPRINT FRONT-4).
 *
 * Espejo UI de DocumentCatalogDetail.approval; el ApprovalEvent del
 * ApprovalWorkflow Core es la fuente real de aprobación.
 */
export interface DocumentApprovalInfo {
  approvalStatus: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalEventId: string | null;
  requestId: string | null;
}

/** Item de versión de una instancia documental (SPRINT FRONT-4). */
export interface DocumentVersionItem {
  id: string;
  version: number;
  status: DocumentCatalogStatus;
  createdAt: string;
  createdBy: string | null;
  isCurrent: boolean;
  downloadUrl: string;
}

/** Evento de trazabilidad de una instancia documental (SPRINT FRONT-4). */
export interface DocumentHistoryItem {
  date: string;
  action: 'GENERATED' | 'APPROVED' | 'REJECTED' | 'VERSION';
  actor: string | null;
  description: string;
}

/** Filtros y paginación del catálogo (query params del endpoint). */
export interface DocumentCatalogQuery {
  companyId?: string;
  documentType?: string;
  status?: DocumentCatalogStatus;
  sourceModule?: string;
  search?: string;
  generatedFrom?: string;
  generatedTo?: string;
  page?: number;
  limit?: number;
  sort?: string;
}
