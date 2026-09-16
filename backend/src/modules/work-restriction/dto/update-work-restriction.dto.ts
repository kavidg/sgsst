import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RestrictionStatus, RestrictionType } from '../schemas/work-restriction.schema';

/**
 * Actualización parcial de una restricción/recomendación médico-laboral
 * (3.1.6 — FASE 33).
 *
 * METADATA-ONLY: igual que el DTO de creación — ningún campo clínico.
 * Las transiciones de status se controlan en el service (§6). `companyId` y
 * `employeeId` del registro NO son reasignables aquí de forma arbitraria:
 * employeeId reasignado se valida contra el tenant en el service.
 */
export class UpdateWorkRestrictionDto {
  // employeeId: reasignación de trabajador; mismo tenant obligatorio (service).
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  @IsOptional()
  @IsEnum(RestrictionType)
  restrictionType?: RestrictionType;

  @IsOptional()
  @IsEnum(RestrictionStatus)
  status?: RestrictionStatus;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  actions?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  followUpStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  evidence?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
