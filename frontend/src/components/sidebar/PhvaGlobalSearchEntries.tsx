/**
 * Buscador global (E7) — Proveedor de entradas PHVA para la ÚNICA paleta.
 *
 * Integra el buscador PHVA existente en la paleta global del Sidebar SIN
 * duplicar nada:
 *   - El catálogo se obtiene con `usePhvaCatalog()` (el mismo hook que ya usan
 *     PlanPage/DoPage/CheckPage/ActPage; sin fetch nuevo ni arrays manuales).
 *   - El índice se construye con `buildPhvaSearchIndex()` (E4), que aplica las
 *     reglas de rol existentes: member → [] (sin entradas), manager → readOnly,
 *     owner/admin → índice completo. Los destinos (`standardRoute` +
 *     `navigationState`) siguen siendo SOLO los verificados de
 *     `PHVA_STANDARD_DESTINATIONS`.
 *
 * El componente se monta solo para roles ≠ member (el Sidebar decide), de modo
 * que member ni siquiera descarga el catálogo: su paleta queda exactamente con
 * el comportamiento actual (solo MENÚ + las 4 rutas del acordeón PHVA).
 *
 * No conoce UI de resultados ni navegación: solo entrega datos por render-prop.
 */

import { ReactNode, useMemo } from 'react';
import { UserRole } from '../../api';
import { usePhvaCatalog } from '../../hooks/usePhvaCatalog';
import { PhvaSearchEntry, buildPhvaSearchIndex } from '../../pages/documents/search/phvaSearchConfig';

export type PhvaGlobalSearchEntriesState = {
  /** Índice PHVA ya construido y YA filtrado por rol ([] para member). */
  phvaEntries: PhvaSearchEntry[];
  /** true mientras `usePhvaCatalog()` está cargando (fallback: índice vacío). */
  phvaLoading: boolean;
};

type PhvaGlobalSearchEntriesProps = {
  role: UserRole;
  children: (state: PhvaGlobalSearchEntriesState) => ReactNode;
};

export function PhvaGlobalSearchEntries({ role, children }: PhvaGlobalSearchEntriesProps) {
  const { catalog, loading } = usePhvaCatalog();

  const phvaEntries = useMemo<PhvaSearchEntry[]>(
    () => buildPhvaSearchIndex(catalog, role),
    [catalog, role],
  );

  return <>{children({ phvaEntries, phvaLoading: loading })}</>;
}
