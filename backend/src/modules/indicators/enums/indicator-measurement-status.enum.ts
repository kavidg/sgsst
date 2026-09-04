/**
 * Estados de una medición de indicador.
 *
 * NO_DATA: no hay datos suficientes para calcular
 * CALCULATED: valor calculado pero sin evaluación de meta (o sin meta definida)
 * TARGET_MET: valor calculado y meta alcanzada
 * TARGET_NOT_MET: valor calculado y meta no alcanzada
 */
export enum IndicatorMeasurementStatus {
  NO_DATA = 'NO_DATA',
  CALCULATED = 'CALCULATED',
  TARGET_MET = 'TARGET_MET',
  TARGET_NOT_MET = 'TARGET_NOT_MET',
}
