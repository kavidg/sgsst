import { CompliancePhaseKey } from './compliance-engine.interface';
import { FindingCategory } from '../enums/finding-category.enum';
import { FindingPriority } from '../enums/finding-priority.enum';
import { FindingSeverity } from '../enums/finding-severity.enum';
import { FindingSource } from '../enums/finding-source.enum';

/**
 * Hallazgo inteligente derivado por reglas a partir del ComplianceOverviewDto.
 *
 * Se genera automáticamente (createdAutomatically = true) y nunca reemplaza
 * los hallazgos operativos de los providers: se agrega a ellos.
 */
export interface IntelligentFinding {
  id: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  category: FindingCategory;
  sourceModule: FindingSource;
  affectedPhase: CompliancePhaseKey | null;
  recommendedAction: string;
  estimatedImpact: string;
  priority: FindingPriority;
  createdAutomatically: true;
}
