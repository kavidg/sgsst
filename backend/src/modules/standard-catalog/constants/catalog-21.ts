import { StandardDefinition } from '../interfaces/standard-definition.interface';
import { CATALOG_60 } from './catalog-60';

/**
 * CATÁLOGO NIVEL 21 — empresas de 11 a 50 trabajadores (riesgo I, II o III).
 *
 * Resolución 0312 de 2019, Artículo 9: para este segmento la norma define 21
 * estándares. La plataforma los desglosa en códigos más granulares, por lo que
 * el catálogo derivado contiene 22 códigos que COBREN los 21 estándares
 * normativos (los 11 del nivel 7 más 11 adicionales de recursos y gestión).
 *
 * Es una aproximación documentada: el catálogo del nivel 21 NO replica uno a
 * uno los 21 ítems textuales de la norma. La alineación normativa exacta se
 * hará en la fase de integración posterior, no en esta base.
 */
export const CATALOG_21: readonly StandardDefinition[] = CATALOG_60.filter((standard) =>
  standard.applicableLevels.includes('21'),
);

/** Códigos del nivel 21 (comodín para validaciones). */
export const CATALOG_21_CODES: readonly string[] = CATALOG_21.map((standard) => standard.code);
