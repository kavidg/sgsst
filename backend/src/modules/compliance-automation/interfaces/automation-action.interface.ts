import { ActionTemplate } from '../../compliance-action-engine/enums/action-template.enum';
import { RecommendedRole } from '../../compliance-action-engine/enums/recommended-role.enum';
import { CompliancePhaseKey } from '../../compliance-engine/interfaces/compliance-engine.interface';

/**
 * Acción futura preparada por el Compliance Automation Engine.
 *
 * Solo se describe; nunca se ejecuta en esta fase. `executable` permanece en
 * false hasta que la siguiente fase implemente la creación real de registros.
 */
export interface AutomationAction {
  /** Identificador único dentro de la recomendación aceptada. */
  actionId: string;
  /** Plantilla de acción de la que deriva. */
  template: ActionTemplate;
  title: string;
  description: string;
  /** Módulo fuente del SG-SST (coincide con FindingSource). */
  module: string;
  affectedPhase: CompliancePhaseKey | null;
  responsibleRole: RecommendedRole;
  estimatedDurationDays: number;
  /** Indica si la acción puede ejecutarse (false hasta la siguiente fase). */
  executable: boolean;
}
