import { IsString, IsOptional, IsDateString, IsNumber, IsArray, Min, Max } from 'class-validator';

/**
 * DTO para actualizar una evaluación de desempeño.
 * Todos los campos son opcionales — solo se modifican los campos enviados.
 *
 * NO permite: companyId, contractId, contractorId, evaluatedBy.
 * La relación contractual permanece inmutable después de creada la evaluación.
 */
export class UpdateContractEvaluationDto {
  @IsOptional()
  @IsDateString()
  evaluationDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  criteria?: string[];

  @IsOptional()
  @IsString()
  observations?: string;
}
