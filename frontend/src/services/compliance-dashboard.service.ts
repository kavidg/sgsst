/**
 * Servicio de consumo del Compliance Intelligence Engine y del
 * Compliance Action Engine para el Dashboard Inteligente.
 *
 * Endpoints consumidos:
 * - GET /compliance-engine/company/:companyId/overview
 * - GET /compliance-action-engine/company/:companyId/recommendations
 *
 * Tipado estricto, sin any.
 */
import {
  ComplianceDashboardData,
  DashboardRecommendation,
} from '../types/compliance-dashboard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

interface EngineErrorMessage {
  message?: string | string[];
}

/** Wrapper de fetch GET con el patrón de api.ts (Authorization Bearer). */
async function engineFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const payload = data as EngineErrorMessage | null;
    const message = payload?.message ?? 'Error al consultar el motor de cumplimiento';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return data as T;
}

/**
 * Obtiene el overview de cumplimiento SG-SST de una empresa desde el
 * Compliance Intelligence Engine.
 */
export function getOverview(
  token: string,
  companyId: string,
): Promise<ComplianceDashboardData> {
  return engineFetch<ComplianceDashboardData>(
    `/compliance-engine/company/${encodeURIComponent(companyId)}/overview`,
    token,
  );
}

/**
 * Obtiene las acciones recomendadas desde el Compliance Action Engine.
 */
export function getRecommendations(
  token: string,
  companyId: string,
): Promise<DashboardRecommendation[]> {
  return engineFetch<DashboardRecommendation[]>(
    `/compliance-action-engine/company/${encodeURIComponent(companyId)}/recommendations`,
    token,
  );
}
