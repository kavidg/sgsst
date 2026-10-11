/**
 * E6 → E7 — Integración del buscador PHVA con el BUSCADOR GLOBAL ÚNICO.
 *
 * A partir de E7 ya NO existe una paleta PHVA independiente ni un atajo
 * Ctrl/Cmd+K local: la única experiencia de búsqueda vive en el Sidebar
 * (MenuSearchCommandPalette con grupos MENÚ + PHVA). Este hook conserva su API
 * exacta para las cuatro páginas (PlanPage/DoPage/CheckPage/ActPage, que no
 * cambian) pero su comportamiento ahora es:
 *
 *   - `entries`: índice E4 (`buildPhvaSearchIndex`) a partir del catálogo que
 *     YA consume la página (sin refetch). Se sigue entregando a PhvaPhaseTabs
 *     para habilitar el trigger.
 *   - `openPhvaSearch`: SOLICITA la apertura del buscador global vía el evento
 *     DOM `OPEN_GLOBAL_SEARCH_EVENT` (escuchado por el Sidebar), adjuntando el
 *     trigger en `detail.returnFocusTo` para conservar el retorno de foco.
 *   - `isPhvaSearchOpen`: siempre false (nunca hay paleta local → nunca hay
 *     doble overlay ni doble paleta).
 *   - `closePhvaSearch`: conservado por compatibilidad; solo devuelve el foco
 *     al trigger (la paleta global se cierra por sí misma).
 *
 * Rol: las páginas reciben `readOnly = role === 'manager'` (App.tsx), de modo
 * que se deriva:
 *   - readOnly → 'manager'  → índice completo con readOnly (E4 §14);
 *   - !readOnly → 'owner'|'admin' → índice completo;
 *   - member nunca monta estas páginas (guard de App.tsx), y E4 además
 *     devuelve [] para member: doble coherencia sin inventar autorización.
 */

import { useMemo, useRef } from 'react';
import type { PhvaCatalogItem } from '../../../services/phva-catalog.service';
import {
  OpenGlobalSearchEventDetail,
  PhvaSearchEntry,
  PhvaSearchPhase,
  OPEN_GLOBAL_SEARCH_EVENT,
  buildPhvaSearchIndex,
} from './phvaSearchConfig';

/** Prefijo de las rutas del módulo PHVA (exportado por compatibilidad E6). */
export const PHVA_SEARCH_ROUTE_PREFIX = '/documents/';

type UsePhvaSearchIntegrationOptions = {
  /** Catálogo ya cargado por usePhvaCatalog() en la página (sin refetch). */
  catalog: PhvaCatalogItem[];
  /** readOnly de la página (App.tsx: readOnly === manager). */
  readOnly: boolean;
  /** Fase de la página actual (metadato del índice; filtro era de E5). */
  phase: PhvaSearchPhase;
};

export function usePhvaSearchIntegration({ catalog, readOnly, phase }: UsePhvaSearchIntegrationOptions) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Índice E4 a partir del catálogo que YA consume la página (§4/§9).
  const entries = useMemo<PhvaSearchEntry[]>(
    () => buildPhvaSearchIndex(catalog, readOnly ? 'manager' : 'owner'),
    [catalog, readOnly],
  );

  // E7 — Sin listener local de Ctrl/Cmd+K (lo atiende el Sidebar, ÚNICO atajo).
  // El trigger "Buscar en PHVA" solo SOLICITA abrir el buscador global. La
  // petición viaja por evento DOM para no acoplar las páginas al Sidebar
  // (las páginas no se modifican y no conocen el buscador global).
  const openPhvaSearch = () => {
    const detail: OpenGlobalSearchEventDetail = { returnFocusTo: triggerRef.current };
    window.dispatchEvent(new CustomEvent<OpenGlobalSearchEventDetail>(OPEN_GLOBAL_SEARCH_EVENT, { detail }));
  };

  // Conservado por compatibilidad con la API que consumen las páginas. La
  // paleta global se cierra sola; aquí solo se devuelve el foco al trigger.
  const closePhvaSearch = () => {
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return {
    // Siempre false: la paleta es única y global (Sidebar) — nunca local.
    isPhvaSearchOpen: false,
    openPhvaSearch,
    closePhvaSearch,
    entries,
    currentPhase: phase,
    triggerRef,
  };
}
