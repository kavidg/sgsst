/**
 * Servicio del Document Catalog (SPRINT FRONT-1).
 *
 * Integra el catálogo documental del DocumentGenerationEngine en el frontend.
 * Reutiliza las funciones tipadas de api.ts (que a su vez reutilizan apiFetch):
 * no se duplica autenticación ni manejo de errores.
 *
 * Endpoints consumidos:
 * - GET /document-generation/catalog
 * - GET /document-generation/catalog/company/:companyId
 * - GET /document-generation/catalog/:id
 */
import {
  fetchDocumentCatalog,
  fetchDocumentCatalogByCompany,
  fetchDocumentCatalogItem,
} from '../api';
import type {
  DocumentCatalogDetail,
  DocumentCatalogPage,
  DocumentCatalogQuery,
} from '../types/document-catalog';

/**
 * Catálogo documental paginado con filtros.
 */
export function getCatalog(
  token: string,
  query?: DocumentCatalogQuery,
): Promise<DocumentCatalogPage> {
  return fetchDocumentCatalog(token, query);
}

/**
 * Catálogo documental forzado a una empresa.
 */
export function getCatalogByCompany(
  token: string,
  companyId: string,
  query?: DocumentCatalogQuery,
): Promise<DocumentCatalogPage> {
  return fetchDocumentCatalogByCompany(token, companyId, query);
}

/**
 * Detalle de una instancia documental (instancia + aprobación + versiones).
 */
export function getCatalogItem(
  token: string,
  id: string,
): Promise<DocumentCatalogDetail> {
  return fetchDocumentCatalogItem(token, id);
}
