import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ImprovementPlanImplementationStatus,
  ImprovementPlanPerceivedEffectiveness,
} from '../schemas/improvement-plan-lifecycle.schema';
import {
  ImprovementPlanActivityStatus,
  ImprovementPlanOrigin,
  ImprovementPlanPriority,
  ImprovementPlanResourceType,
} from '../schemas/improvement-plan.schema';

/**
 * E1 (7.1.4) — DTOs ESTRICTOS del dominio improvement-plans (Plan de
 * mejoramiento).
 *
 * Seguridad de payload (ValidationPipe global: whitelist +
 * forbidNonWhitelisted):
 * - NUNCA se aceptan: companyId, createdBy/updatedBy, closedBy*, closureDate,
 *   lifecycle final (status del plan va SOLO por PATCH /:id/status), snapshots
 *   (se generan server-side), activityId/monitoringId/objectiveId (server-side)
 *   ni history — todo se resuelve server-side.
 * - Fechas: @IsDateString() (convención del repo en dominios 7.1.x).
 * - El cliente NO controla: tenant, actor, ids generados, lifecycle final.
 */

// ─── Sub-estructuras de escritura ───────────────────────────────────────────

/** Recurso del plan (escritura). */
export class ImprovementPlanResourceDto {
  @IsEnum(ImprovementPlanResourceType)
  type!: ImprovementPlanResourceType;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}

/** Objetivo del plan (escritura; objectiveId es server-side). */
export class ImprovementPlanObjectiveDto {
  @IsString()
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  target?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  indicator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}

// ─── Crear plan ─────────────────────────────────────────────────────────────

export class CreateImprovementPlanDto {
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  period?: string;

  @IsOptional()
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsMongoId()
  /** Responsable del plan (usuario del tenant; validado en service). */
  responsibleUserId?: string;

  @IsEnum(ImprovementPlanOrigin)
  origin!: ImprovementPlanOrigin;

  @IsOptional()
  @IsMongoId()
  /** Referencia DECLARATIVA al registro origen (sin queries cruzadas). */
  originReferenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originDescription?: string;

  @IsOptional()
  @IsEnum(ImprovementPlanPriority)
  priority?: ImprovementPlanPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prioritizationCriteria?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImprovementPlanObjectiveDto)
  objectives?: ImprovementPlanObjectiveDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImprovementPlanResourceDto)
  resources?: ImprovementPlanResourceDto[];

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

// ─── Actualizar plan (PATCH de contenido; estado va por /status) ────────────

export class UpdateImprovementPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  period?: string;

  @IsOptional()
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsEnum(ImprovementPlanOrigin)
  origin?: ImprovementPlanOrigin;

  @IsOptional()
  @IsMongoId()
  originReferenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originDescription?: string;

  @IsOptional()
  @IsEnum(ImprovementPlanPriority)
  priority?: ImprovementPlanPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prioritizationCriteria?: string;

  /** Reemplaza los objetivos completos (objectiveId server-side). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImprovementPlanObjectiveDto)
  objectives?: ImprovementPlanObjectiveDto[];

  /** Reemplaza los recursos completos. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImprovementPlanResourceDto)
  resources?: ImprovementPlanResourceDto[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

// ─── Cambio de estado del plan (endpoint dedicado; única vía) ───────────────

export class UpdateImprovementPlanStatusDto {
  @IsString()
  @MaxLength(20)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  closureObservations?: string;
}

// ─── Actividades ────────────────────────────────────────────────────────────

export class CreatePlanActivityDto {
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsMongoId()
  /** Responsable tenant-safe (validado {_id, companyId} en service). */
  responsibleUserId?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdatePlanActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  /** Progreso 0–100 (no cambia el estado automáticamente). */
  progress?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;
}

export class UpdatePlanActivityStatusDto {
  @IsEnum(ImprovementPlanActivityStatus)
  status!: ImprovementPlanActivityStatus;

  @IsOptional()
  @IsDateString()
  /**
   * Fecha de ejecución (OBLIGATORIA para COMPLETED; no futura; validada en
   * service — aceptada aquí para permitir el registro explícito).
   */
  executionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

// ─── Evidencia (actividad; referencia declarativa tenant-safe) ──────────────

export class AddPlanActivityEvidenceDto {
  @IsOptional()
  @IsMongoId()
  /** Referencia declarativa a DocumentMaster (validada {_id, companyId}). */
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

// ─── Follow-up de actividad ─────────────────────────────────────────────────

export class RegisterPlanActivityFollowUpDto {
  @IsOptional()
  @IsDateString()
  /** Fecha del seguimiento (no futura; default: ahora — server-side). */
  followUpDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsOptional()
  @IsEnum(ImprovementPlanImplementationStatus)
  implementationStatus?: ImprovementPlanImplementationStatus;

  @IsOptional()
  @IsEnum(ImprovementPlanPerceivedEffectiveness)
  /** PERCEPCIÓN de efectividad — NO eficacia formal (frontera con 7.1.1). */
  perceivedEffectiveness?: ImprovementPlanPerceivedEffectiveness;

  @IsOptional()
  @IsBoolean()
  requiresContinuedFollowUp?: boolean;
}

// ─── Seguimiento periódico del plan ─────────────────────────────────────────

export class AddPlanMonitoringDto {
  @IsDateString()
  /** Fecha del seguimiento (no futura; validada en service). */
  date!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  /** Avance global del plan en el momento del seguimiento (0–100). */
  progress?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deviations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adjustmentActions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}
