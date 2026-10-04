/**
 * Retorno contextual al PHVA (navegación "← Volver al PHVA").
 *
 * Problema: los módulos de Gestión Avanzada y módulos internos fijaban su
 * retorno a una fase fija (p. ej. siempre /documents/plan) y el usuario
 * perdía el contexto del estándar desde el que entró.
 *
 * Solución: al salir de un ítem PHVA, la navegación adjunta en
 * `location.state` el ORIGEN (fase + código de estándar + scrollY). Los
 * botones "← Volver al PHVA" leen ese origen para regresar a la fase correcta,
 * y la página PHVA restaura el viewport sobre el ítem mediante el atributo
 * DOM estable `data-phva-standard` (ver components/EvaluationItem.tsx).
 *
 * Funciones PURAS: sin React, sin router, sin fetch. Compatibles con los
 * estados `state.source = 'phva-<code>'` existentes (se conservan, nunca se
 * sobrescriben) y con entrada directa sin state (fallback intacto).
 */

/** Fases del ciclo PHVA (mismos valores del StandardCatalog). */
export type PhvaReturnPhase = 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';

/** Origen de navegación adjuntado por las páginas PHVA al salir de un ítem. */
export interface PhvaReturnState {
  phase: PhvaReturnPhase;
  standardCode: string;
  /** Scroll del window al salir (respaldo si el ítem no se encuentra al volver). */
  scrollY?: number;
}

/** Clave del origen dentro de location.state. */
export const PHVA_RETURN_STATE_KEY = 'phvaReturn';

/**
 * Construye el objeto `options` de `navigate(to, options)` conservando TODO el
 * estado existente (p. ej. `{ source: 'phva-2.5.1' }`) y añadiendo el origen.
 *
 * Uso en las páginas PHVA:
 *   navigate('/document-management', buildPhvaReturnState('HACER', item.code, { source: 'phva-2.5.1' }, window.scrollY))
 */
export function buildPhvaReturnState(
  phase: PhvaReturnPhase,
  standardCode: string,
  existingState?: unknown,
  scrollY?: number,
): { state: Record<string, unknown> & { [PHVA_RETURN_STATE_KEY]?: PhvaReturnState } } {
  const base = (existingState && typeof existingState === 'object' ? existingState : {}) as Record<string, unknown>;
  const phvaReturn: PhvaReturnState = {
    phase,
    standardCode,
    ...(typeof scrollY === 'number' && Number.isFinite(scrollY) ? { scrollY } : {}),
  };
  return { state: { ...base, [PHVA_RETURN_STATE_KEY]: phvaReturn } };
}

/**
 * Lee el origen de un `location.state` cualquiera. Devuelve null si no existe
 * o es inválido (entrada directa sin origen PHVA → el caller usa su fallback).
 */
export function readPhvaReturn(state: unknown): PhvaReturnState | null {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const candidate = (state as Record<string, unknown>)[PHVA_RETURN_STATE_KEY];
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const { phase, standardCode, scrollY } = candidate as Partial<PhvaReturnState>;
  const validPhases: readonly string[] = ['PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR'];
  if (typeof standardCode !== 'string' || standardCode.length === 0 || !validPhases.includes(phase as string)) {
    return null;
  }
  return {
    phase: phase as PhvaReturnPhase,
    standardCode,
    ...(typeof scrollY === 'number' && Number.isFinite(scrollY) ? { scrollY } : {}),
  };
}

/**
 * Ruta de retorno para un botón "← Volver al PHVA":
 *   - con origen válido → ruta de la fase de origen;
 *   - sin origen (entrada directa) → fallbackPath (comportamiento actual).
 *
 * Las rutas de fase son las existentes; NO se crean rutas nuevas.
 */
export function phvaBackTarget(fallbackPath: string, state: unknown): string {
  const origin = readPhvaReturn(state);
  if (!origin) {
    return fallbackPath;
  }
  const phaseRoutes: Record<PhvaReturnPhase, string> = {
    PLANEAR: '/documents/plan',
    HACER: '/documents/do',
    VERIFICAR: '/documents/check',
    ACTUAR: '/documents/act',
  };
  return phaseRoutes[origin.phase];
}
