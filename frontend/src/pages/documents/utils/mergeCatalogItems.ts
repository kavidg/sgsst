import type { StandardSection } from '../../../models/standard-catalog';
import type { PhvaCatalogItem } from '../../../services/phva-catalog.service';

/**
 * Shape mínima común de los ítems legacy del PHVA. Los campos adicionales que
 * cada página defina (p. ej. description o moduleRoute) se conservan intactos
 * mediante el spread de `...item`.
 */
export type LegacyEvaluationItem = {
  code: string;
  title: string;
  weight: number;
  modeReview: string;
  criteria: string;
  section?: StandardSection;
  description?: string;
  moduleRoute?: string;
};

/**
 * FASE 7.7.B.2 — Consolidación del merge PHVA.
 * FASE 7.7.C  — Migración de title y weight al catálogo (sin eliminar legacy).
 *
 * Unifica el patrón de merge que antes estaba duplicado en PlanPage, DoPage,
 * CheckPage y ActPage. El StandardCatalog es la fuente oficial de metadata:
 *
 * - title:       catalog.title ?? legacy.title
 * - weight:      catalog.normativeWeight ?? legacy.weight
 * - criteria:    catalog.criteria ?? legacy.criteria
 * - modeReview:  catalog.modeReview ?? legacy.modeReview
 * - section:     catalog.section ?? legacy.section
 *
 * Cualquier otro campo legacy (code, description, moduleRoute, etc.) se
 * conserva intacto vía el spread de `...item`.
 *
 * Comportamiento preservado de las páginas:
 * - Si `useCatalog` es false (catálogo vacío o con error), se devuelve el
 *   array legacy tal cual (misma referencia) — el fallback nunca deja la
 *   pantalla vacía.
 * - Si un código no existe en el catálogo, el ítem legacy se devuelve sin
 *   modificar (misma referencia), preservando la estabilidad de identidad que
 *   necesita registerSection.
 */
export function mergeCatalogItems<T extends LegacyEvaluationItem>(
  legacyItems: readonly T[],
  catalogItemsByCode: ReadonlyMap<string, PhvaCatalogItem>,
  useCatalog: boolean,
): T[] {
  if (!useCatalog) return legacyItems as T[];

  return legacyItems.map((item) => {
    const catalogItem = catalogItemsByCode.get(item.code);
    if (!catalogItem) return item;

    return {
      ...item,
      title: catalogItem.title ?? item.title,
      weight: catalogItem.normativeWeight ?? item.weight,
      modeReview: catalogItem.modeReview ?? item.modeReview,
      criteria: catalogItem.criteria ?? item.criteria,
      section: catalogItem.section ?? item.section,
    } as T;
  });
}
