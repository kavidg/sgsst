/**
 * Servicio frontend del PHVA Evaluation Engine (motor de evaluación automática
 * por estándar — FASE 1 backend).
 *
 * Proyecta el contrato real del backend (AutoEvaluationResult) a tipos
 * estrictos del frontend. NO recalcula nada: el veredicto lo determina
 * exclusivamente el motor (PhvaEvaluationEngineService).
 *
 * Endpoints (solo consulta, protegidos con FirebaseAuthGuard + RolesGuard +
 * CompanyAccessGuard):
 * - GET /phva-evaluation-engine/company/:companyId/evaluate/:code
 * - GET /phva-evaluation-engine/company/:companyId/evaluate
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

/** Estados del veredicto automático (espejo del enum backend AutoResultStatus). */
export type PhvaAutoResultStatus =
  | 'CUMPLE_TOTALMENTE'
  | 'NO_CUMPLE'
  | 'NO_APLICA'
  | 'PENDIENTE_ANALISIS';

/** Traza de un requisito evaluado por la regla del estándar. */
export interface PhvaRuleTrace {
  requirement: string;
  /** true demostrado · false incumplido/pendiente · null no evaluable. */
  satisfied: boolean | null;
  evidence?: string;
}

/** Hallazgo por incumplimiento demostrable (prepara el plan de mejoramiento). */
export interface PhvaAutoFinding {
  title: string;
  description: string;
  source: string;
}

/** Resultado automático de un estándar (espejo de AutoEvaluationResult). */
export interface PhvaAutoEvaluationResult {
  code: string;
  status: PhvaAutoResultStatus;
  ruleTrace: PhvaRuleTrace[];
  findings: PhvaAutoFinding[];
  missingInformation: string[];
  evaluatedAt: string;
  engineVersion: string;
}

/** Etiquetas visibles por estado (mismo vocabulario del flujo manual). */
export const PHVA_AUTO_STATUS_LABEL: Record<PhvaAutoResultStatus, string> = {
  CUMPLE_TOTALMENTE: 'Cumple totalmente',
  NO_CUMPLE: 'No cumple',
  PENDIENTE_ANALISIS: 'Pendiente de análisis',
  NO_APLICA: 'No aplica',
};

/** Clases CSS de badge existentes en el proyecto (index.css). */
export const PHVA_AUTO_STATUS_BADGE_CLASS: Record<PhvaAutoResultStatus, string> = {
  CUMPLE_TOTALMENTE: 'badge badge--success',
  NO_CUMPLE: 'badge badge--danger',
  PENDIENTE_ANALISIS: 'badge badge--warning',
  NO_APLICA: 'badge badge--info',
};

async function engineFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (data as { message?: unknown } | null)?.message ?? 'Error calling backend endpoint';
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }

  return data as T;
}

/** Obtiene el resultado automático de un estándar individual. */
export async function evaluateStandard(
  token: string,
  companyId: string,
  code: string,
): Promise<PhvaAutoEvaluationResult> {
  const path = `/phva-evaluation-engine/company/${encodeURIComponent(companyId)}/evaluate/${encodeURIComponent(code)}`;
  return engineFetch<PhvaAutoEvaluationResult>(path, token, { method: 'GET' });
}

/** Obtiene los resultados de todos los estándares con regla activa. */
export async function evaluateCompany(
  token: string,
  companyId: string,
  options: { signal?: AbortSignal } = {},
): Promise<PhvaAutoEvaluationResult[]> {
  const path = `/phva-evaluation-engine/company/${encodeURIComponent(companyId)}/evaluate`;
  return engineFetch<PhvaAutoEvaluationResult[]>(path, token, {
    method: 'GET',
    signal: options.signal,
  });
}
