import { IsString, IsOptional, IsDateString, IsMongoId, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { InductionStatus } from '../schemas/contract-induction.schema';

/**
 * DTO para actualizar una inducción SST.
 * Todos los campos son opcionales — solo se modifican los campos enviados.
 *
 * NO permite: companyId, createdBy.
 */
export class UpdateContractInductionDto {
  @IsOptional()
  @IsMongoId()
  contractId?: string;

  @IsOptional()
  @IsMongoId()
  contractorId?: string;

  @IsOptional()
  @IsString()
  workerName?: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  @IsEnum(InductionStatus)
  status?: InductionStatus;

  @IsOptional()
  @IsDateString()
  inductionDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;
}
