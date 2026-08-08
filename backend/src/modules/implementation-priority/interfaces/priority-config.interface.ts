import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';

/** Criticidad normativa del paso según Resolución 0312 (config estática). */
export type PriorityCriticality = 'ALTA' | 'MEDIA' | 'BAJA';

/** Esfuerzo estimado de completar el paso (config estática, no derivable). */
export type PriorityEffort = 'BAJO' | 'MEDIO' | 'ALTO';

/** Nivel de riesgo derivado del paso (criticality × porcentaje). FASE 2. */
export type PriorityRiskLevel = 'ALTO' | 'MEDIO' | 'BAJO' | 'NINGUNO';

/**
 * Configuración estática por paso. ÚNICA fuente de reglas estáticas del motor.
 *
 * NO contiene lógica ni cálculos: solo datos (criticality, effort,
 * dependencias y plantillas de acción).
 */
export interface StepPriorityConfig {
  criticality: PriorityCriticality;
  estimatedEffort: PriorityEffort;
  /** Prerrequisitos del paso (pasos que deben estar completos primero). */
  dependencies: StepId[];
  /** Plantilla de acción recomendada si no hay pendingCriteria. */
  actionTemplate: string;
}

/**
 * Coeficientes de la fórmula PS(s) del PriorityScore (FASE 2).
 *
 * Suma = 1. Configurables por empresa/producto en el futuro.
 */
export interface PriorityScoreWeights {
  /** Peso del impacto recuperable (peso del paso × restante). */
  impact: number;
  /** Peso de la criticidad normativa. */
  criticality: number;
  /** Peso del potencial de desbloqueo de dependientes. */
  unlock: number;
  /** Penalización por estar bloqueado por prerrequisitos. */
  block: number;
}
