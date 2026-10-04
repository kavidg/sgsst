/**
 * E3 (6.1.3) — Servicio frontend del dominio MANAGEMENT-REVIEW-DIRECTION
 * (Revisión por la dirección SG-SST).
 *
 * Patrón: el repo centraliza el transporte en `api.ts` (apiFetch con Bearer +
 * manejo de errores estándar: message string|string[] → Error). Para no
 * duplicar lógica de autenticación, este servicio reutiliza esa capa.
 *
 * Endpoints (backend E1 — controller management-review-direction):
 * - GET    /management-review-direction          (filtros status/reviewType/from/to)
 * - GET    /management-review-direction/:id
 * - POST   /management-review-direction
 * - PATCH  /management-review-direction/:id
 * - PATCH  /management-review-direction/:id/status
 * - POST   /management-review-direction/:id/inputs
 * - PATCH  /management-review-direction/:id/inputs/:inputId
 * - POST   /management-review-direction/:id/decisions
 * - PATCH  /management-review-direction/:id/decisions/:decisionId
 * - PATCH  /management-review-direction/:id/evidence/minutes
 * - GET    /management-review-direction/:id/history
 *
 * Roles backend (autoridad): READ owner/admin/manager/member;
 * WRITE owner/admin. companyId/createdBy los resuelve SIEMPRE el backend.
 */
import { apiFetch } from '../api';
import type {
  AttachManagementReviewMinutesPayload,
  CreateManagementReviewDecisionPayload,
  CreateManagementReviewInputPayload,
  CreateManagementReviewPayload,
  ManagementReviewDirectionHistoryModel,
  ManagementReviewDirectionModel,
  ManagementReviewDirectionStatus,
  ManagementReviewType,
  UpdateManagementReviewDecisionPayload,
  UpdateManagementReviewInputPayload,
  UpdateManagementReviewPayload,
  UpdateManagementReviewStatusPayload,
} from '../types/management-review-direction';

const BASE = '/management-review-direction';

export interface ListManagementReviewsFilters {
  status?: ManagementReviewDirectionStatus;
  reviewType?: ManagementReviewType;
  /** ISO-8601 (IsDateString); el backend valida coherencia from ≤ to. */
  from?: string;
  to?: string;
}

/** Lista las revisiones del tenant (4 roles). */
export function listManagementReviews(
  token: string,
  filters: ListManagementReviewsFilters = {},
): Promise<ManagementReviewDirectionModel[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.reviewType) params.set('reviewType', filters.reviewType);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  return apiFetch<ManagementReviewDirectionModel[]>(`${BASE}${qs ? `?${qs}` : ''}`, token, { method: 'GET' });
}

/** Obtiene una revisión del tenant (404 si pertenece a otra empresa). */
export function getManagementReview(token: string, id: string): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${id}`, token, { method: 'GET' });
}

/** Crea una revisión (owner/admin en backend). NUNCA enviar companyId/createdBy. */
export function createManagementReview(
  token: string,
  payload: CreateManagementReviewPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(BASE, token, { method: 'POST', body: JSON.stringify(payload) });
}

/** Actualiza una revisión (owner/admin; el estado va por endpoint /status). */
export function updateManagementReview(
  token: string,
  id: string,
  payload: UpdateManagementReviewPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

/** Cambia el estado con transición validada en backend (owner/admin). */
export function changeManagementReviewStatus(
  token: string,
  id: string,
  payload: UpdateManagementReviewStatusPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${id}/status`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

/** Crea una entrada de información embebida (owner/admin). */
export function createManagementReviewInput(
  token: string,
  reviewId: string,
  payload: CreateManagementReviewInputPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${reviewId}/inputs`, token, { method: 'POST', body: JSON.stringify(payload) });
}

/** Actualiza una entrada de información (owner/admin). Marcar REVIEWED va aquí. */
export function updateManagementReviewInput(
  token: string,
  reviewId: string,
  inputId: string,
  payload: UpdateManagementReviewInputPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${reviewId}/inputs/${inputId}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

/** Crea una decisión de dirección embebida (owner/admin). */
export function createManagementReviewDecision(
  token: string,
  reviewId: string,
  payload: CreateManagementReviewDecisionPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${reviewId}/decisions`, token, { method: 'POST', body: JSON.stringify(payload) });
}

/** Actualiza una decisión de dirección (owner/admin). */
export function updateManagementReviewDecision(
  token: string,
  reviewId: string,
  decisionId: string,
  payload: UpdateManagementReviewDecisionPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${reviewId}/decisions/${decisionId}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

/** Adjunta acta/evidencia documental (DocumentMaster tenant-safe; owner/admin). */
export function updateManagementReviewEvidence(
  token: string,
  reviewId: string,
  payload: AttachManagementReviewMinutesPayload,
): Promise<ManagementReviewDirectionModel> {
  return apiFetch<ManagementReviewDirectionModel>(`${BASE}/${reviewId}/evidence/minutes`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

/** Historial append-only (server-side; solo lectura — nunca se edita). */
export function getManagementReviewHistory(token: string, reviewId: string): Promise<ManagementReviewDirectionHistoryModel[]> {
  return apiFetch<ManagementReviewDirectionHistoryModel[]>(`${BASE}/${reviewId}/history`, token, { method: 'GET' });
}
