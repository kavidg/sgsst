/**
 * E6 — Integración del buscador PHVA en las páginas de fase
 * (PlanPage / DoPage / CheckPage / ActPage).
 *
 * Hook compartido: UNA sola implementación para las cuatro páginas (§3).
 * Reutiliza íntegramente E4 (buildPhvaSearchIndex) y el componente de E5;
 * no crea fetch, no duplica catálogo y no conoce Sidebar/E1.
 *
 * Rol: las páginas reciben `readOnly = role === 'manager'` (App.tsx), de modo
 * que se deriva:
 *   - readOnly → 'manager'  → índice completo con readOnly (E4 §14);
 *   - !readOnly → 'owner'|'admin' → índice completo;
 *   - member nunca monta estas páginas (guard de App.tsx), y E4 además
 *     devuelve [] para member: doble coherencia sin inventar autorización.
 *
 * Shortcut Ctrl/Cmd+K (§13/§15): SOLO se registra cuando pathname empieza por
 * `/documents/` (useLocation de react-router, no window.location). Fuera de
 * /documents/* este hook no tiene listener y el Ctrl/Cmd+K lo atiende el
 * listener único existente del Sidebar (E1) → comportamiento contextual sin
 * listeners duplicados ni doble apertura.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { PhvaCatalogItem } from '../../../services/phva-catalog.service';
import type { PhvaSearchEntry, PhvaSearchPhase } from './phvaSearchConfig';
import { buildPhvaSearchIndex } from './phvaSearchConfig';

/** Rutas del módulo PHVA donde este hook toma el Ctrl/Cmd+K. */
export const PHVA_SEARCH_ROUTE_PREFIX = '/documents/';

type UsePhvaSearchIntegrationOptions = {
  /** Catálogo ya cargado por usePhvaCatalog() en la página (sin refetch). */
  catalog: PhvaCatalogItem[];
  /** readOnly de la página (App.tsx: readOnly === manager). */
  readOnly: boolean;
  /** Fase de la página actual (filtro inicial/preferido del palette). */
  phase: PhvaSearchPhase;
};

export function usePhvaSearchIntegration({ catalog, readOnly, phase }: UsePhvaSearchIntegrationOptions) {
  const location = useLocation();
  const [isPhvaSearchOpen, setIsPhvaSearchOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Índice E4 a partir del catálogo que YA consume la página (§4/§9).
  const entries = useMemo<PhvaSearchEntry[]>(
    () => buildPhvaSearchIndex(catalog, readOnly ? 'manager' : 'owner'),
    [catalog, readOnly],
  );

  const insidePhva = location.pathname.startsWith(PHVA_SEARCH_ROUTE_PREFIX);

  // Atajo contextual: listener activo SOLO dentro de /documents/*. Cuando está
  // activo, el evento no alcanza al listener del Sidebar (se agotó aquí, mismo
  // target window) → nunca hay doble apertura ni dos overlays (§15).
  useEffect(() => {
    if (!insidePhva) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPhvaSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [insidePhva]);

  // Cierre con retorno de foco al trigger (§16). El rAF evita robar el foco
  // cuando el palette se cierra tras NAVEGAR (el foco pasa a la nueva página).
  const closePhvaSearch = () => {
    setIsPhvaSearchOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return {
    isPhvaSearchOpen,
    openPhvaSearch: () => setIsPhvaSearchOpen(true),
    closePhvaSearch,
    entries,
    currentPhase: phase,
    triggerRef,
  };
}
