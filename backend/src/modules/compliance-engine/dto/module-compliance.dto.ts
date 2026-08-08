import { ComplianceLevel } from '../enums/compliance-level.enum';

/**
 * Cumplimiento de un módulo fuente del SG-SST dentro del motor.
 */
export class ModuleComplianceDto {
  module!: string;
  compliance!: number;
  level!: ComplianceLevel;
  lastUpdated!: string;
}
