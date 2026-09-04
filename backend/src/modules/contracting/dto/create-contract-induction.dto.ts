import { IsString, IsOptional, IsDateString, IsMongoId, IsNumber, Min, Max } from 'class-validator';

/**
 * DTO para crear una inducción SST para contratistas.
 *
 * NO permite: companyId, status, createdBy (controlados por backend).
 */
export class CreateContractInductionDto {
  /** Contrato al que pertenece la inducción. */
  @IsMongoId()
  contractId!: string;

  /** Contratista (Supplier con type CONTRACTOR). */
  @IsMongoId()
  contractorId!: string;

  /** Nombre completo del trabajador inducido. */
  @IsString()
  workerName!: string;

  /** Cédula o identificación del trabajador. */
  @IsOptional()
  @IsString()
  workerId?: string;

  /** Fecha en que se realizó la inducción. */
  @IsOptional()
  @IsDateString()
  inductionDate?: string;

  /** Fecha de vencimiento de la inducción. */
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  /** Calificación de la inducción (0-100). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;
}
