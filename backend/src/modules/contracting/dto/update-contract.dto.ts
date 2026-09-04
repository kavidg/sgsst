import { IsString, IsOptional, IsDateString, IsMongoId } from 'class-validator';

/**
 * DTO para actualizar un contrato.
 * Todos los campos son opcionales — solo se modifican los campos enviados.
 *
 * NO permite modificar: companyId, status, createdBy, createdByName.
 * El status se controlará posteriormente desde Approval Workflow.
 */
export class UpdateContractDto {
  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  contractorId?: string;

  @IsOptional()
  @IsDateString()
  contractStart?: string;

  @IsOptional()
  @IsDateString()
  contractEnd?: string;

  @IsOptional()
  @IsString()
  sstRequirements?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
