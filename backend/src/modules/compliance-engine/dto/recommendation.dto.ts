import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Recomendación generada por el Compliance Intelligence Engine.
 */
export class RecommendationDto {
  id!: string;
  module!: string;
  title!: string;
  description!: string;
  priority!: FindingPriority;
  targetPhase!: CompliancePhaseKey;
  createdAt!: string;
}
