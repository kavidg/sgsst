/**
 * Retorno contextual al PHVA — hooks de integración (React Router).
 *
 * FLUJO COMPLETO (fix del bug verificado en navegador):
 *   1. Salida (páginas PHVA): navigate(destino, buildPhvaReturnState(...))
 *      adjunta el ORIGEN en location.state.phvaReturn.
 *   2. RETORNO (este hook): "← Volver al PHVA" navega a la fase de origen
 *      REENVIANDO location.state completo — sin esto el origen se pierde y la
 *      página PHVA jamás puede restaurar (causa raíz del bug).
 *   3. Restauración (usePhvaReturnRestore en la página PHVA): localiza el
 *      estándar por data-phva-standard y lo centra en el viewport.
 *
 * Por qué el usuario veía "el inicio de la fase": al volver, el catálogo aún
 * estaba cargando y la página renderizaba corta → el navegador clampea el
 * scroll a 0; como el estado no llegaba (punto 2), ningún efecto recolocaba
 * el viewport cuando los ítems terminaban de renderizar.
 *
 * Scroll: la ventana (window) es el contenedor que hace scroll en
 * /documents/* (ningún layout del flujo tiene overflow propio).
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PHVA_RETURN_STATE_KEY, phvaBackTarget, readPhvaReturn } from '../lib/phvaReturn';

function findStandardElement(standardCode: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-phva-standard="${standardCode}"]`);
}


/**
 * Restaura el viewport sobre el estándar de origen una vez renderizado.
 *
 * @param catalogReady true cuando la página ya puede tener ítems renderizados
 *        (legacy renderiza de inmediato; el catálogo llega async y el bucle de
 *        reintento lo cubre).
 */
export function usePhvaReturnRestore(catalogReady: boolean): void {
  const location = useLocation();
  const navigate = useNavigate();
  // Restaurar UNA sola vez por entrada con origen.
  const restoredRef = useRef<string | null>(null);

  useEffect(() => {
    const origin = readPhvaReturn(location.state);
    if (!origin) {
      return;
    }
    const entryKey = `${location.key}:${origin.standardCode}`;
    if (restoredRef.current === entryKey || !catalogReady) {
      return;
    }

    // El catálogo carga async: reintento temporizado. 40 × 150ms ≈ 6s para
    // cubrir redes lentas; el fallback legacy también renderiza los ítems.
    let attempts = 0;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const consumeState = () => {
      navigate(location.pathname + location.search, { replace: true, state: undefined });
    };

    /** Centra el elemento y verifica en el frame siguiente que quedó visible. */
    const centerElement = (el: HTMLElement) => {
      el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' });
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        // Evidencia del bug: efectos posteriores (render del catálogo, replace,
        // clamp) pueden mover el ítem fuera del viewport tras el centrado.
        // Re-centrar UNA vez si salió del viewport; no es un retry ciego.
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' });
        }
      });
    };

    const tryRestore = () => {
      if (cancelled) return;
      attempts += 1;
      const element = findStandardElement(origin.standardCode);
      if (element) {
        // PRIORIDAD 1 — dejar el estándar claramente visible. El scrollY de
        // salida NO se aplica aquí: es la posición donde el ítem NO era visible
        // (causa raíz demostrada en navegador — sobrescribía el centrado).
        centerElement(element);
        restoredRef.current = entryKey;
        consumeState();
        return;
      }
      if (attempts >= 40) {
        // PRIORIDAD 2 — ítem no disponible (p. ej. estándar fuera del nivel de
        // la empresa): AHÍ sí aplica el scrollY guardado como respaldo.
        if (typeof origin.scrollY === 'number' && origin.scrollY > 0) {
          window.scrollTo(0, origin.scrollY);
        }
        restoredRef.current = entryKey;
        consumeState();
        return;
      }
      timerId = setTimeout(tryRestore, 150);
    };
    timerId = setTimeout(tryRestore, 0);
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
    // location.key identifica la entrada de navegación; el estado viaja con ella.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, catalogReady]);
}

/**
 * onClick para botones "← Volver al PHVA".
 *
 * FIX CAUSA RAÍZ: reenvía location.state COMPLETO (incluido phvaReturn y el
 * state.source legacy) a la página PHVA — antes se perdía aquí y por eso la
 * restauración nunca se ejecutaba.
 */
export function usePhvaBack(fallbackPath: string): () => void {
  const location = useLocation();
  const navigate = useNavigate();
  return () => {
    navigate(phvaBackTarget(fallbackPath, location.state), { state: location.state });
  };
}

/** Exportación de conveniencia para módulos que leen el origen directamente. */
export { readPhvaReturn, phvaBackTarget, PHVA_RETURN_STATE_KEY };
