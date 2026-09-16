import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  WasteDisposalFrequency,
  WasteManagementStatus,
  WasteType,
} from '../schemas/waste-management-record.schema';

/**
 * Actualización parcial de un registro de gestión de residuos
 * (3.1.9 — FASE 34C).
 *
 * Todos los campos son opcionales; la coherencia temporal
 * (nextDisposalDate >= lastDisposalDate) y la pertenencia al tenant se
 * validan en el service considerando los valores previos. companyId NUNCA es
 * aceptado por este DTO.
 *
 * METADATA-ONLY: sin información clínica ni datos personales innecesarios.
 */
export class UpdateWasteManagementRecordDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message: 'code solo admite letras, números, guiones y guiones bajos',
  })
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsEnum(WasteType)
  wasteType?: WasteType;

  @IsOptional()
  @IsBoolean()
  hazardous?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  source?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  generationDescription?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  handlingMethod?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  disposalMethod?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  disposalDestination?: string;

  @IsOptional()
  @IsEnum(WasteDisposalFrequency)
  disposalFrequency?: WasteDisposalFrequency;

  @IsOptional()
  @IsDateString()
  lastDisposalDate?: string;

  @IsOptional()
  @IsDateString()
  nextDisposalDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  responsible?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\S+$/i, { message: 'evidenceUrl no debe contener espacios' })
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsOptional()
  @IsEnum(WasteManagementStatus)
  status?: WasteManagementStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
