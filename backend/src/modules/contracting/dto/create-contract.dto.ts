import { IsString, IsOptional, IsDateString, IsMongoId } from 'class-validator';

export class CreateContractDto {
  /** Número único del contrato (obligatorio, único por empresa). */
  @IsString()
  contractNumber!: string;

  /** Título/descripción corta del contrato. */
  @IsString()
  title!: string;

  /** Descripción detallada del contrato. */
  @IsOptional()
  @IsString()
  description?: string;

  /** Referencia al contratista (Supplier con type CONTRACTOR). */
  @IsMongoId()
  contractorId!: string;

  /** Fecha de inicio del contrato. */
  @IsOptional()
  @IsDateString()
  contractStart?: string;

  /** Fecha de fin del contrato. */
  @IsOptional()
  @IsDateString()
  contractEnd?: string;

  /** Requisitos SST establecidos para el contrato. */
  @IsOptional()
  @IsString()
  sstRequirements?: string;

  /** Observaciones adicionales. */
  @IsOptional()
  @IsString()
  observations?: string;
}
