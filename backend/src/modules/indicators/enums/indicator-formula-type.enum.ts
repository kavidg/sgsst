/**
 * Tipos de fórmula para cálculo de indicadores.
 *
 * AUTOMATIC: calculado completamente desde fuentes de datos
 * SEMI_AUTOMATIC: parte calculada, parte manual
 * MANUAL: valor ingresado manualmente
 */
export enum IndicatorFormulaType {
  AUTOMATIC = 'AUTOMATIC',
  SEMI_AUTOMATIC = 'SEMI_AUTOMATIC',
  MANUAL = 'MANUAL',
}
