import { StandardDefinition } from '../interfaces/standard-definition.interface';
import { CATALOG_60 } from './catalog-60';

/**
 * CATÁLOGO NIVEL 7 — empresas de 1 a 10 trabajadores (riesgo I, II o III).
 *
 * Resolución 0312 de 2019, Artículo 3: para este segmento la norma define 7
 * estándares mínimos. La plataforma desglosa varios de esos ítems normativos en
 * códigos más granulares (responsable, responsabilidades, afiliación ARL,
 * capacitación, objetivos, evaluación inicial, plan anual, exámenes médicos,
 * identificación de peligros y medidas de control), por lo que el catálogo
 * derivado contiene 11 códigos que COBREN los 7 estándares normativos.
 *
 * Es una aproximación documentada: el catálogo del nivel 7 NO replica uno a uno
 * los 7 ítems textuales de la norma. La alineación normativa exacta se hará en
 * la fase de integración posterior, no en esta base.
 */
export const CATALOG_7: readonly StandardDefinition[] = CATALOG_60.filter((standard) =>
  standard.applicableLevels.includes('7'),
);

/** Códigos del nivel 7 (comodín para validaciones). */
export const CATALOG_7_CODES: readonly string[] = CATALOG_7.map((standard) => standard.code);
