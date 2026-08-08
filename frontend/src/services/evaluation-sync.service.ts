import {
  DashboardEvaluationModel,
  EvaluationStatus,
  fetchDashboardEvaluations,
  saveEvaluationAnswer,
} from '../api';

export type PhvaAnswer = { status: string };
export type PhvaAnswersState = Record<string, PhvaAnswer>;

export interface BackendAnswerEntry {
  code: string;
  status: EvaluationStatus;
}

/** Estados visibles del PHVA → estados del backend Evaluations. */
const FRONTEND_TO_BACKEND: Record<string, EvaluationStatus> = {
  'Cumple totalmente': 'CUMPLE',
  'No cumple': 'NO_CUMPLE',
  'No aplica': 'NO_APLICA',
};

/** Estados del backend Evaluations → estados visibles del PHVA. */
const BACKEND_TO_FRONTEND: Record<EvaluationStatus, string> = {
  CUMPLE: 'Cumple totalmente',
  NO_CUMPLE: 'No cumple',
  NO_APLICA: 'No aplica',
};

/**
 * Carga todas las evaluaciones PHVA de la empresa desde el backend.
 *
 * Fuente oficial: MongoDB (módulo Evaluations). El backend es la fuente única
 * de verdad; localStorage queda únicamente como caché temporal.
 */
export async function loadEvaluations(
  token: string,
  companyId: string,
): Promise<DashboardEvaluationModel[]> {
  return fetchDashboardEvaluations(token, companyId);
}

/**
 * Persiste únicamente el estándar modificado en el backend.
 *
 * Si el estado visible no tiene representación en el backend (por ejemplo, un
 * estado vacío), la operación se omite sin lanzar error.
 */
export async function saveEvaluation(
  token: string,
  userId: string,
  companyId: string,
  code: string,
  status: string,
): Promise<void> {
  const backendStatus = FRONTEND_TO_BACKEND[status];
  if (!backendStatus) {
    return;
  }

  await saveEvaluationAnswer(token, { companyId, userId, code, status: backendStatus });
}

/**
 * Convierte las evaluaciones del backend al formato interno del hook
 * (Record<code, { status }>), ignorando códigos o estados desconocidos.
 */
export function mapBackendToAnswers(evaluations: DashboardEvaluationModel[]): PhvaAnswersState {
  const answers: PhvaAnswersState = {};

  for (const evaluation of evaluations) {
    const status = BACKEND_TO_FRONTEND[evaluation.status];
    if (evaluation.code && status) {
      answers[evaluation.code] = { status };
    }
  }

  return answers;
}

/**
 * Convierte el estado interno del hook en la lista de respuestas a enviar
 * al backend (solo las respuestas con estado representable).
 */
export function mapAnswersToBackend(answers: PhvaAnswersState): BackendAnswerEntry[] {
  return Object.entries(answers).flatMap(([code, answer]) => {
    const status = FRONTEND_TO_BACKEND[answer.status];
    return status ? [{ code, status }] : [];
  });
}
