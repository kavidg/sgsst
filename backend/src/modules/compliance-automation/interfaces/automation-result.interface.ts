import { AutomationStatus } from '../enums/automation-status.enum';
import { AutomationAction } from './automation-action.interface';

/**
 * Resultado de la aceptación de una recomendación.
 *
 * Contiene la descripción de las acciones futuras preparadas y los conteos
 * de registros que podrán generarse (actividades, objetivos, indicadores).
 * No crea ningún registro real en MongoDB.
 */
export interface AutomationResult {
  accepted: boolean;
  automationStatus: AutomationStatus;
  /** Acciones futuras preparadas (solo descripción, no ejecutadas). */
  generatedActions: AutomationAction[];
  /** Cantidad de actividades del plan anual que podrán generarse. */
  generatedActivities: number;
  /** Cantidad de objetivos que podrán generarse. */
  generatedObjectives: number;
  /** Cantidad de indicadores que podrán generarse. */
  generatedIndicators: number;
  estimatedImpact: number;
  estimatedDuration: number;
  estimatedCost: number;
  warnings: string[];
  summary: string;
  createdAutomatically: boolean;
}
