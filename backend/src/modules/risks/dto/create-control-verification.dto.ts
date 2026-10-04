import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ControlVerificationResult } from '../enums/control-verification-result.enum';

/**
 * ETAPA 3 (PHVA 4.2.2) — DTO de creación de verificación de control.
 *
 * Solo recibe campos de usuario. El backend resuelve y genera:
 * companyId (contexto autenticado), riskId (ruta), controlDescriptionSnapshot
 * (desde Risk.controls[]) y followUpStatus (reglas de seguimiento).
 * El ValidationPipe global (whitelist + forbidNonWhitelisted) rechaza
 * propiedades desconocidas, incluido cualquier `companyId` enviado por cliente.
 */
export class CreateControlVerificationDto {
  /** Hex del _id del subdocumento ControlMeasure dentro de Risk.controls[]. */
  @IsMongoId()
  controlId!: string;

  /** Fecha de la verificación (ISO 8601, patrón IsDateString del repo). */
  @IsDateString()
  verificationDate!: string;

  @IsString()
  @MinLength(1)
  verifiedBy!: string;

  @IsEnum(ControlVerificationResult)
  result!: ControlVerificationResult;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresFollowUp?: boolean = false;

  /** Obligatoria cuando requiresFollowUp = true (regla del schema, replicada aquí). */
  @IsOptional()
  @ValidateIf((o) => o.requiresFollowUp === true)
  @IsDateString()
  followUpDueDate?: string;
}
