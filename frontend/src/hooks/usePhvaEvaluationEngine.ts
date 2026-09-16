/**
 * Hook del PHVA Evaluation Engine (integración frontend — FASE 2).
 *
 * Carga UNA sola vez los resultados automáticos de todos los estándares con
 * regla activa (1.1.1, 1.1.2 y 1.1.3 en esta fase) para la empresa activa.
 * Los ítems que consultan el mapa NO generan peticiones propias.
 *
 * - Cambio de empresa → reset inmediato + recarga (nunca mezcla evaluaciones).
 * - Token: se usa el proporcionado por la página; si no hay, se resuelve con
 *   getCurrentUserIdToken() (patrón de usePhvaCatalog).
 * - Errores NO bloquean el PHVA: quedan en `error` con retry manual.
 * - Métodos de solo lectura: este hook nunca escribe en el backend.
 */
import { useCallback, useEffect, useState } from 'react';
import { useCompanyContext } from '../context/CompanyContext';
import { getCurrentUserIdToken } from '../firebase';
import {
  evaluateCompany,
  PhvaAutoEvaluationResult,
} from '../services/phva-evaluation-engine.service';

export type UsePhvaEvaluationEngineResult = {
  /** Resultados automáticos por código de estándar ({}` mientras carga). */
  results: Record<string, PhvaAutoEvaluationResult>;
  /** true durante la carga inicial o la recarga. */
  loading: boolean;
  /** true si la consulta falló (el PHVA sigue funcionando con el flujo manual). */
  error: boolean;
  /** Reintenta la consulta (botón reintentar). */
  refresh: () => Promise<void>;
};

export function usePhvaEvaluationEngine(token?: string): UsePhvaEvaluationEngineResult {
  const { companyId } = useCompanyContext();
  const [results, setResults] = useState<Record<string, PhvaAutoEvaluationResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) {
      setResults({});
      setError(false);
      return;
    }

    const resolvedToken: string | null = token ?? (await getCurrentUserIdToken());
    if (!resolvedToken) {
      // Sin sesión activa: sin resultados (el flujo manual sigue operativo).
      setResults({});
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const evaluations = await evaluateCompany(resolvedToken, companyId);
      const next: Record<string, PhvaAutoEvaluationResult> = {};
      for (const evaluation of evaluations) {
        next[evaluation.code] = evaluation;
      }
      setResults(next);
    } catch {
      // El motor no está disponible: el PHVA continúa con el flujo manual.
      setResults({});
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [companyId, token]);

  useEffect(() => {
    // Reset inmediato al cambiar de empresa: sin evaluaciones mezcladas.
    setResults({});
    setError(false);
    void refresh();
  }, [refresh]);

  return { results, loading, error, refresh };
}
