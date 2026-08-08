import type { StandardSection } from '../../../models/standard-catalog';
import type { PhvaCatalogItem } from '../../../services/phva-catalog.service';
import type { PhvaSectionGroup } from './groupCatalogItems';

/**
 * Fases del ciclo PHVA soportadas por el StandardCatalog.
 */
export type PhvaPhase = 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';

/**
 * Interfaz mínima que los ítems del catálogo deben exponer al reemplazar el
 * set legacy de una fase. Es la misma interfaz que usan EvaluationSection /
 * EvaluationItem / evaluationState / ComplianceProgress:
 * { code, title, weight, criteria, modeReview, section }.
 */
export interface CatalogEvaluationItem {
  code: string;
  title: string;
  weight: number;
  criteria: string;
  modeReview: string;
  section?: StandardSection;
}

/**
 * Verifica que un estándar del catálogo tenga metadata mínima completa:
 * code, title, normativeWeight, phva, section, criteria y modeReview.
 */
function isComplete(item: PhvaCatalogItem): boolean {
  return Boolean(
    item.code &&
      item.title &&
      typeof item.normativeWeight === 'number' &&
      item.normativeWeight > 0 &&
      item.phva &&
      item.section?.id &&
      item.section.title &&
      typeof item.section.percentage === 'number' &&
      item.criteria &&
      item.modeReview,
  );
}

/**
 * FASE 7.7.G — Gate de migración controlada del set PHVA.
 *
 * Determina si el catálogo recibido (ya filtrado por el nivel de la empresa)
 * puede reemplazar el set legacy de una fase. DECISIÓN DEL USUARIO: NO depende
 * de conteos fijos (los de la spec quedan solo como referencia de auditoría);
 * valida la completitud real del StandardCatalog del nivel:
 *
 * 1. Obtiene todos los estándares aplicables al nivel actual (param `catalog`).
 * 2. Filtra únicamente los estándares PHVA de la fase actual (`phva === phase`),
 *    excluyendo estándares PLANNED.
 * 3. Verifica que CADA estándar requerido tenga metadata completa:
 *    code, title, normativeWeight, phva, section, criteria, modeReview.
 *
 * Si todos los estándares del nivel para esa fase están completos → true
 * (activar render desde catálogo). Si existe cualquier estándar incompleto, o
 * la fase no tiene estándares en el nivel → false (mantener render legacy como
 * fallback).
 */
export function shouldUseCatalogSet(phase: PhvaPhase, catalog: readonly PhvaCatalogItem[]): boolean {
  const phaseItems = catalog.filter(
    (item) => item.phva === phase && item.implementationStatus !== 'PLANNED',
  );
  if (phaseItems.length === 0) return false;
  return phaseItems.every(isComplete);
}

/**
 * Verifica que el catálogo agrupado tenga al menos un ítem en alguna de las
 * secciones que la página renderiza. Garantiza que la pantalla nunca quede
 * completamente vacía cuando se activa el render desde catálogo (p. ej. una
 * empresa nivel 7 sin secciones VERIFICAR/ACTUAR en su catálogo).
 */
export function hasCatalogSectionItems(
  catalogGroups: Record<string, PhvaSectionGroup<unknown>>,
  sectionIds: readonly string[],
): boolean {
  return sectionIds.some((id) => (catalogGroups[id]?.items.length ?? 0) > 0);
}

/**
 * Convierte un ítem del StandardCatalog a la interfaz de ítem de evaluación
 * ({ code, title, weight, criteria, modeReview, section }) conservando la
 * misma interfaz de EvaluationSection / EvaluationItem / evaluationState /
 * ComplianceProgress.
 */
export function catalogItemToEvaluationItem(item: PhvaCatalogItem): CatalogEvaluationItem {
  return {
    code: item.code,
    title: item.title,
    weight: item.normativeWeight,
    criteria: item.criteria ?? '',
    modeReview: item.modeReview ?? '',
    section: item.section,
  };
}
