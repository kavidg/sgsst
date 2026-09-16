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
 * Creación de una condición sanitaria del lugar de trabajo (3.1.8 — FASE 34B).
 *
 * La empresa (companyId) SIEMPRE se deriva de la sesión autenticada en el
 * controller; nunca se acepta del cuerpo de la petición.
 *
 * METADATA-ONLY: este DTO NO acepta información clínica ni datos sensibles de
 * trabajadores. Solo registra la condición sanitaria verificada (agua potable,
 * servicios sanitarios, manejo de basuras).
 */
export class CreateWorkplaceSanitaryConditionDto {
  // conditionType: discriminador obligatorio del componente 3.1.8 (enum cerrado).
  @IsEnum(SanitaryConditionType)
  conditionType!: SanitaryConditionType;

  // code: identificación operativa del registro (letras, números, - y _).
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message: 'code solo admite letras, números, guiones y guiones bajos',
  })
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  // description: descripción operativa de la condición verificada.
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  // location: ubicación física de la condición (requerida para evidencia).
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location!: string;

  // status: estado operativo (default OPERATIONAL en schema).
  @IsOptional()
  @IsEnum(SanitaryConditionStatus)
  status?: SanitaryConditionStatus;

  // conditionResult: resultado de la verificación (default APT en schema).
  @IsOptional()
  @IsEnum(SanitaryConditionResult)
  conditionResult?: SanitaryConditionResult;

  // lastVerificationDate: fecha de la última verificación (obligatoria).
  @IsDateString()
  lastVerificationDate!: string;

  // nextVerificationDate: próxima verificación; >= lastVerificationDate (service).
  @IsOptional()
  @IsDateString()
  nextVerificationDate?: string;

  // verificationFrequency: frecuencia de verificación (default ANNUAL en schema).
  @IsOptional()
  @IsEnum(VerificationFrequency)
  verificationFrequency?: VerificationFrequency;

  // responsible: responsable de la condición/verificación (obligatorio).
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  responsible!: string;

  // evidenceUrl: referencia documental de la verificación (opcional pero
  // necesaria para C3 — trazabilidad completa).
  @IsOptional()
  @IsString()
  @Matches(/^\S+$/i, { message: 'evidenceUrl no debe contener espacios' })
  @MaxLength(500)
  evidenceUrl?: string;

  // observations: observaciones operativas (NO clínicas).
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  // active: opcional (por defecto true).
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
