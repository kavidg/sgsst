import { MonthlyTrendDirection } from '../interfaces/compliance-timeline.interface';

/**
 * Punto de la tendencia mensual de cumplimiento.
 */
export class MonthlyTrendPointDto {
  month!: string;
  overallCompliance!: number;
  variation!: number | null;
  trend!: MonthlyTrendDirection;
}
