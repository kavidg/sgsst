import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  CopasstAuditPlanningStatus,
  PlannedAuditItemStatus,
} from '../schemas/copasst-audit-planning.schema';

/**
 * E1 (6.1.4) — DTOs ESTRICTOS del dominio copasst-audit-planning.
 *
 * Seguridad de payload (ValidationPipe global: whitelist + forbidNonWhitelisted):
 * - NUNCA se aceptan: companyId, createdBy, updatedBy, history, timestamps,
 *   status (en PATCH de contenido) ni cualquier campo interno — el tenant, la
 *   autoría y el estado se resuelven SIEMPRE server-side.
 * - Fechas: @IsDateString() (ISO-8601; convención del repo).
 * - Rangos y coherencia de fechas: validados server-side en el service.
 */

const MAX_TEXT = 2000;
const MAX_ITEMS = 100;

// ─── Participación COPASST (embebida) ───────────────────────────────────────
// Declarada ANTES de los DTOs que la referencian (emitDecoratorMetadata: una
// referencia hacia atrás produce TDZ al cargar el módulo — patrón 6.1.3).

export class CopasstParticipationParticipantDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsString()
  @MaxLength(300)
  nameSnapshot!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  role?: string;
}

export class CopasstParticipationDto {
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  participated?: boolean;

  @IsOptional()
  @IsDateString()
  participationDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CopasstParticipationParticipantDto)
  participants?: CopasstParticipationParticipantDto[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

// ─── Items planificados (embebidos) ─────────────────────────────────────────

export class CreatePlannedAuditDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsMongoId()
  auditorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  auditorUserSnapshot?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleUserSnapshot?: string;

  @IsString()
  @MaxLength(MAX_TEXT)
  objective!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  criteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  methodology?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CopasstParticipationDto)
  copasstParticipation?: CopasstParticipationDto;

  /** Referencia declarativa a AnnualAudit (6.1.2) — validada tenant-safe. */
  @IsOptional()
  @IsMongoId()
  annualAuditId?: string;
}

export class UpdatePlannedAuditDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsMongoId()
  auditorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  auditorUserSnapshot?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleUserSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  criteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  methodology?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CopasstParticipationDto)
  copasstParticipation?: CopasstParticipationDto;

  @IsOptional()
  @IsMongoId()
  annualAuditId?: string;
}

export class UpdatePlannedAuditStatusDto {
  @IsEnum(PlannedAuditItemStatus)
  status!: PlannedAuditItemStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

// ─── Planificación ──────────────────────────────────────────────────────────

export class CreateCopasstAuditPlanningDto {
  /** Código asignado por la empresa (único POR tenant; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  planningCode?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  objectives?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  criteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  methodology?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleUserSnapshot?: string;

  /** Referencia declarativa al período COPASST — validada tenant-safe. */
  @IsOptional()
  @IsMongoId()
  copasstPeriodId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreatePlannedAuditDto)
  items?: CreatePlannedAuditDto[];
}

export class UpdateCopasstAuditPlanningDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  planningCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  objectives?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  criteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  methodology?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleUserSnapshot?: string;

  @IsOptional()
  @IsMongoId()
  copasstPeriodId?: string;

  // El estado va por endpoint dedicado PATCH /:id/status.
}

export class UpdateCopasstAuditPlanningStatusDto {
  @IsEnum(CopasstAuditPlanningStatus)
  status!: CopasstAuditPlanningStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/** Límite de items embebidos (fuente única; usado por el service). */
export const MAX_PLANNED_AUDITS_PER_PLANNING = MAX_ITEMS;
