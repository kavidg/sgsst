import type { StandardSection } from '../../../models/standard-catalog';

/**
 * Ítem mínimo con metadata de sección que groupCatalogItems acepta.
 */
type SectionCarrier = {
  code: string;
  section?: StandardSection;
};

/**
 * Sección PHVA agrupada desde el StandardCatalog.
 */
export interface PhvaSectionGroup<T = unknown> {
  /** Identificador único de la sección (p. ej. 'plan-recursos'). */
  sectionId: string;
  /** Título legible de la sección (incluye porcentaje). */
  title: string;
  /** Porcentaje de la sección dentro de la fase PHVA. */
  percentage: number;
  /** Ítems de la sección, en el orden del catálogo. */
  items: T[];
}

/**
 * FASE 7.7.F — Agrupación de estándares PHVA desde el StandardCatalog.
 *
 * Agrupa los ítems del catálogo por `section.id`, conservando el orden del
 * catálogo (la primera aparición de cada sección define el orden de las
 * claves, y el orden de los ítems dentro de cada sección respeta el orden de
 * entrada).
 *
 * Los ítems sin `section` (p. ej. estándares PLANNED sin metadata) se omiten.
 */
export function groupCatalogItems<T extends SectionCarrier>(items: readonly T[]): Record<string, PhvaSectionGroup<T>> {
  const groups: Record<string, PhvaSectionGroup<T>> = {};

  for (const item of items) {
    const section = item.section;
    if (!section) continue;

    let group = groups[section.id];
    if (!group) {
      group = { sectionId: section.id, title: section.title, percentage: section.percentage, items: [] };
      groups[section.id] = group;
    }
    group.items.push(item);
  }

  return groups;
}
