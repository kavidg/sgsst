import { IsString, IsOptional, IsDateString, IsMongoId, IsNumber, IsArray, Min, Max } from 'class-validator';

/**
 * DTO para crear una evaluación de desempeño de un contratista.
 *
 * NO permite: companyId, evaluatedBy, createdAt, updatedAt (controlados por backend).
 */
export class CreateContractEvaluationDto {
  /** Contrato evaluado. */
  @IsMongoId()
  contractId!: string;

  /** Contratista (Supplier con type CONTRACTOR). */
  @IsMongoId()
  contractorId!: string;

  /** Fecha de la evaluación. */
  @IsDateString()
  evaluationDate!: string;

  /** Calificación de la evaluación (0-100). */
  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  /** Criterios evaluados (lista de nombres/descripciones). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  criteria?: string[];

  /** Observaciones de la evaluación. */
  @IsOptional()
  @IsString()
  observations?: string;
}
