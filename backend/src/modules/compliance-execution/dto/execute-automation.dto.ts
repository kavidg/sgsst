import { Type } from 'class-transformer';
import { IsDateString, IsMongoId, IsString, ValidateNested } from 'class-validator';
import { AutomationResultDto } from '../../compliance-automation/dto/automation-result.dto';

/**
 * Entrada del endpoint POST /compliance-execution/company/:companyId/execute.
 *
 * El controller fusiona el companyId del path con el body (fuente autoritativa).
 */
export class ExecuteAutomationDto {
  /** Empresa sobre la que se ejecuta la automatización. */
  @IsMongoId()
  companyId!: string;

  /** AutomationResult READY que origina la ejecución (nunca se persiste). */
  @ValidateNested()
  @Type(() => AutomationResultDto)
  automationResult!: AutomationResultDto;

  /** Usuario (id o email) que solicita la ejecución. */
  @IsString()
  executedBy!: string;

  /** Fecha de ejecución en formato ISO 8601. */
  @IsDateString()
  executionDate!: string;
}
