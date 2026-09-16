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
  SanitaryConditionResult,
  SanitaryConditionStatus,
  SanitaryConditionType,
  VerificationFrequency,
} from '../schemas/workplace-sanitary-condition.schema';

/**
 * Actualización parcial de una condición sanitaria (3.1.8 — FASE 34B).
 *
 * Todos los campos son opcionales; la coherencia temporal (next >= last) y la
 * pertenencia al tenant se validan en el service considerando los valores
 * previos del registro. companyId NUNCA es aceptado por este DTO.
 *
 * METADATA-ONLY: sin información clínica ni datos sensibles de trabajadores.
 */
export class UpdateWorkplaceSanitaryConditionDto {
  // conditionType: cambiar el discriminador es una reclasificación operativa.
  @IsOptional()
  @IsEnum(SanitaryConditionType)
  conditionType?: SanitaryConditionType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message: 'code solo admite letras, números, guiones y guiones bajos',
  })
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsEnum(SanitaryConditionStatus)
  status?: SanitaryConditionStatus;

  @IsOptional()
  @IsEnum(SanitaryConditionResult)
  conditionResult?: SanitaryConditionResult;

  @IsOptional()
  @IsDateString()
  lastVerificationDate?: string;

  @IsOptional()
  @IsDateString()
  nextVerificationDate?: string;

  @IsOptional()
  @IsEnum(VerificationFrequency)
  verificationFrequency?: VerificationFrequency;

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
  @IsBoolean()
  active?: boolean;
}
