/**
 * Variación porcentual entre dos valores (típicamente 0-100).
 *
 * Devuelve null cuando la base es 0 o la variación no es calculable.
 * Resultado redondeado a 2 decimales.
 */
export function percentageVariation(from: number, to: number): number | null {
  if (from === 0) {
    return null;
  }
  return Math.round(((to - from) / from) * 10000) / 100;
}
