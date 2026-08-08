/**
 * Predicción de cumplimiento proyectado a futuro.
 */
export class PredictionDto {
  projectedCompliance!: number;
  confidence!: number;
  horizonMonths!: number;
  methodology!: string;
  generatedAt!: string;
}
