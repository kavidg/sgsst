import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import {
  PriorityCriticality,
  PriorityEffort,
  PriorityRiskLevel,
} from './priority-config.interface';

/**
 * Resultado interno normalizado del motor de prioridades (FASE 2/3).
 *
 * Es la salida intermedia del motor antes del mapeo final a PriorityItemDto:
 * contiene los valores calculados, mientras que el DTO añade los campos de
 * presentación (title, moduleRoute, percentage, pendingCriteria, rank).
 */
export interface PriorityResult {
  stepId: StepId;
  /** Puntaje PS(s) 0-100 (FASE 2). */
  priorityScore: number;
  /** Impacto numérico recuperable (peso × restante) (FASE 2). */
  impactPoints: number;
  /** Impacto visible "+X% implementación" (FASE 2). */
  estimatedImpact: string | null;
  /** Prerrequisitos incompletos (FASE 3). */
  blockedBy: string[];
  /** Pasos que se desbloquean al completar este (FASE 3). */
  unlocks: string[];
  /** true si no hay prerrequisitos incompletos (FASE 3). */
  ready: boolean;
  /** Potencial de desbloqueo normalizado 0-1 (FASE 3). */
  unlockPotential: number;
  criticality: PriorityCriticality;
  /** Nivel de riesgo derivado (FASE 2). */
  riskLevel: PriorityRiskLevel;
  estimatedEffort: PriorityEffort | null;
  /** Acción recomendada (pendingCriteria[0] o template de config) (FASE 2). */
  recommendedAction: string;
  /** Reservado para futuras versiones. NO se usa todavía. */
  confidence?: number;
  /** Reservado para futuras versiones. NO se usa todavía. */
  actionType?: string;
}
