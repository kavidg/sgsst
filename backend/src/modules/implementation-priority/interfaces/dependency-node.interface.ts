import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';

/**
 * Nodo del grafo de dependencias del motor de prioridades.
 *
 * `dependsOn` proviene de la configuración estática (STEP_PRIORITY_CONFIG);
 * `dependents` (pasos que dependen de este nodo) se deriva en FASE 3
 * recorriendo el grafo.
 */
export interface DependencyNode {
  stepId: StepId;
  /** Prerrequisitos directos (config). */
  dependsOn: StepId[];
  /** Pasos que dependen directamente de este nodo (derivado en FASE 3). */
  dependents?: StepId[];
}
