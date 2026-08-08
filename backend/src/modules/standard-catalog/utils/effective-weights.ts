import { StandardDefinition } from '../interfaces/standard-definition.interface';

/**
 * Normalización de pesos efectivos del catálogo de estándares.
 *
 * Concepto: `normativeWeight` es el peso normativo original (intacto en el
 * catálogo). `effectiveWeight` es el peso que usa el sistema, calculado
 * AUTOMÁTICAMENTE únicamente sobre los estándares IMPLEMENTED/PARTIAL
 * (los PLANNED quedan fuera del cálculo) y normalizado para que la suma del
 * catálogo efectivo sea exactamente 100.
 *
 * El cálculo es puro y no requiere mantenimiento: si mañana un estándar
 * PLANNED pasa a IMPLEMENTED (o viceversa), la normalización se recalcula
 * sola sin modificar código.
 *
 * Algoritmo: método del mayor residuo (largest remainder) con precisión de
 * 2 decimales, que garantiza que la suma de los `effectiveWeight` sea
 * EXACTAMENTE 100 sin errores de redondeo acumulados.
 *
 * CONSECUENCIA A CONOCER (decisión de migración futura): en el nivel 60 la
 * suma normativa activa ya es 100, por lo que `effectiveWeight ===
 * normativeWeight` (escala 1, sin reescalado). En los niveles 7 y 21 las
 * sumas normativas activas son 18 y 30.5, por lo que cada estándar se infla
 * proporcionalmente (p. ej. 1.1.1 pasa de 0.5 a ~2.78% en nivel 7). Cuando
 * InitialEvaluation/PHVA migren al catálogo efectivo deberá decidirse si se
 * usa esta escala por nivel o se conserva la escala PHVA de la plataforma.
 */

/** Escala objetivo del peso efectivo. */
export const EFFECTIVE_TOTAL = 100;

/** Precisión del peso efectivo (decimales). */
const DECIMALS = 2;

/** Factor de precisión (100 → unidades de 0.01). */
const FACTOR = 10 ** DECIMALS;

/**
 * Calcula los pesos efectivos normalizados por código de estándar.
 *
 * @param definitions Definiciones del catálogo (puede incluir PLANNED; se
 *   filtran internamente).
 * @returns Map<code, effectiveWeight> para los estándares IMPLEMENTED/PARTIAL.
 *   Si no hay estándares activos, devuelve un Map vacío.
 */
export function computeEffectiveWeights(
  definitions: readonly StandardDefinition[],
): Map<string, number> {
  const active = definitions.filter((definition) => definition.implementationStatus !== 'PLANNED');
  const weights = new Map<string, number>();

  if (active.length === 0) return weights;

  const totalNormative = active.reduce((acc, definition) => acc + definition.normativeWeight, 0);

  // Total normativo inválido (cero o negativo): defensivo, todos 0.
  if (!Number.isFinite(totalNormative) || totalNormative <= 0) {
    for (const definition of active) weights.set(definition.code, 0);
    return weights;
  }

  // Escala a unidades de 0.01 (EFFECTIVE_TOTAL * FACTOR = 10000 unidades).
  const totalUnits = EFFECTIVE_TOTAL * FACTOR;
  const raw = active.map((definition) => (definition.normativeWeight * totalUnits) / totalNormative);
  const floors = raw.map((value) => Math.floor(value));

  // Unidades restantes por distribuir (mayor residuo primero).
  let remainder = totalUnits - floors.reduce((acc, value) => acc + value, 0);
  const byFraction = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  let cursor = 0;
  while (remainder > 0 && byFraction.length > 0) {
    floors[byFraction[cursor % byFraction.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  active.forEach((definition, index) => {
    weights.set(definition.code, floors[index] / FACTOR);
  });

  return weights;
}
