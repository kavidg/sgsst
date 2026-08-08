import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { DependencyNode } from '../interfaces/dependency-node.interface';
import { StepPriorityConfig } from '../interfaces/priority-config.interface';
import { PriorityStepInput } from '../interfaces/priority-input.interface';

/** Resolución de dependencias para un paso. */
export interface DependencyResolution {
  /** Prerrequisitos incompletos que bloquean el paso. */
  blockedBy: StepId[];
  /** Pasos que dependen de este paso (se desbloquean al completarlo). */
  unlocks: StepId[];
  /** true si no hay prerrequisitos incompletos. */
  ready: boolean;
  /**
   * Potencial de desbloqueo normalizado 0-1: dependientes / maxDependientes.
   * 0 si el paso no tiene dependientes.
   */
  unlockPotential: number;
}

/** Estado mínimo requerido de cada paso para resolver el grafo. */
type DependencyStepInput = Pick<PriorityStepInput, 'stepId' | 'percentage'>;

/**
 * Umbral de cumplimiento para que una dependencia NO bloquee.
 *
 * Coincide con el umbral de COMPLETED de deriveStepStatus (>= 80).
 * Exported para que tests y otras utilidades compartan el mismo valor.
 */
export const DEPENDENCY_COMPLETE_THRESHOLD = 80;

/**
 * Grafo de dependencias del motor de prioridades (determinista, read-only).
 *
 * Construye la resolución por paso a partir de la configuración estática
 * (STEP_PRIORITY_CONFIG[].dependencies) y del avance real de los pasos:
 *
 * - `blockedBy`: dependencias con percentage < 80 (o ausentes del input).
 * - `unlocks`: pasos que dependen directamente de este nodo.
 * - `ready`: true si blockedBy está vacío.
 * - `unlockPotential`: dependientes / maxDependientes (0-1).
 *
 * SOLO INFORMA: no modifica el status real de ningún paso. Es inmune a ciclos
 * (dos pasadas lineales, sin recursión).
 */
export function buildDependencyGraph(
  steps: ReadonlyArray<DependencyStepInput>,
  config: Record<StepId, StepPriorityConfig>,
): Partial<Record<StepId, DependencyResolution>> {
  const percentageByStep = new Map<StepId, number>();
  for (const step of steps) {
    percentageByStep.set(step.stepId, step.percentage);
  }

  // Nodos del grafo a partir de la configuración estática.
  const nodes = new Map<StepId, DependencyNode>();
  for (const stepId of Object.keys(config) as StepId[]) {
    nodes.set(stepId, {
      stepId,
      dependsOn: config[stepId].dependencies,
      dependents: [],
    });
  }

  // dependents: pasos que dependen directamente de cada nodo.
  for (const node of nodes.values()) {
    for (const dep of node.dependsOn) {
      nodes.get(dep)?.dependents?.push(node.stepId);
    }
  }

  // maxDependientes para normalizar unlockPotential (evita /0).
  let maxDependents = 0;
  for (const node of nodes.values()) {
    maxDependents = Math.max(maxDependents, node.dependents?.length ?? 0);
  }

  const resolutions: Partial<Record<StepId, DependencyResolution>> = {};
  for (const node of nodes.values()) {
    const blockedBy: StepId[] = [];
    for (const dep of node.dependsOn) {
      const percentage = percentageByStep.get(dep);
      // Dependencia ausente del input → no verificable → bloquea (defensivo).
      if (percentage === undefined || percentage < DEPENDENCY_COMPLETE_THRESHOLD) {
        blockedBy.push(dep);
      }
    }

    const unlocks = node.dependents ?? [];
    resolutions[node.stepId] = {
      blockedBy,
      unlocks,
      ready: blockedBy.length === 0,
      unlockPotential: maxDependents > 0 ? unlocks.length / maxDependents : 0,
    };
  }

  return resolutions;
}
