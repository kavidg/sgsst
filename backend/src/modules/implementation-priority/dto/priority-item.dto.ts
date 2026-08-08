import { StepId, StepStatus } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import {
  PriorityCriticality,
  PriorityEffort,
  PriorityRiskLevel,
} from '../interfaces/priority-config.interface';

/**
 * Item de prioridad del Centro de Implementación.
 *
 * DTO final previsto por el diseño del ImplementationPriorityEngine. En FASE 1A
 * la estructura queda completa y tipada; los campos de cálculo (priorityScore,
 * impactPoints, blockedBy, unlocks, ready, riskLevel, recommendedAction) se
 * poblan en FASE 2 (motor matemático) y FASE 3 (grafo de dependencias).
 */
export interface PriorityItemDto {
  stepId: StepId;
  /** Título legible del paso (STEP_LABELS). */
  title: string;
  /** Ruta frontend del módulo que alimenta el paso (STEP_MODULE_ROUTES). */
  moduleRoute: string;
  status: StepStatus;
  /** Cumplimiento porcentual real (0-100). */
  percentage: number;
  /** Puntaje de prioridad 0-100 (mayor = más urgente). FASE 2. */
  priorityScore: number;
  /** Posición tras ordenar por priorityScore desc. */
  rank: number;
  /** Impacto visible "+X% implementación" (calculateStepImpact). FASE 2. */
  estimatedImpact: string | null;
  /** Impacto numérico: peso × porcentaje restante. FASE 2. */
  impactPoints: number;
  /** Criticidad normativa (config). */
  criticality: PriorityCriticality;
  /** Nivel de riesgo derivado (criticality × porcentaje). FASE 2. */
  riskLevel: PriorityRiskLevel;
  /** Prerrequisitos incompletos que bloquean el paso. FASE 3. */
  blockedBy: string[];
  /** Pasos que dependen de este paso y se desbloquean al completarlo. FASE 3. */
  unlocks: string[];
  /** true si no hay prerrequisitos incompletos (blockedBy vacío). FASE 3. */
  ready: boolean;
  /** Potencial de desbloqueo normalizado 0-1 (dependientes / max). FASE 3. */
  unlockPotential: number;
  /** Criterios pendientes del provider (ya disponibles en el overview). */
  pendingCriteria: string[];
  /** Acción recomendada (pendingCriteria[0] o template de config). FASE 2. */
  recommendedAction: string;
  /** Esfuerzo estimado (config estática; NO derivable de datos). */
  estimatedEffort: PriorityEffort | null;
  /**
   * Reservado para futuras versiones (recomendaciones con IA / ajuste del
   * motor). NO se usa todavía.
   */
  confidence?: number;
  /**
   * Reservado para futuras versiones (acciones tipadas, p. ej.
   * 'NAVIGATE' | 'UPLOAD' | 'APPROVE' | 'EXEMPT'). NO se usa todavía.
   */
  actionType?: string;
}
