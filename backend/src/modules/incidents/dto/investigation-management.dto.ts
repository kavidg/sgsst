import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  IncidentLifecycleStage,
  InvestigationActionImplementationStatus,
  InvestigationPerceivedEffectiveness,
  InvestigationProgressStatus,
} from '../schemas/incident-lifecycle.schema';
import {
  InvestigationActionStatus,
  InvestigationActionType,
} from '../schemas/incident.schema';

/**
 * E1 (7.1.3) — DTOs ESTRICTOS de la gestión avanzada de los casos
 * accidentales (investigación, causas, equipo, acciones, evidencia,
 * seguimiento y lifecycle).
 *
 * Seguridad de payload (ValidationPipe global: whitelist +
 * forbidNonWhitelisted):
 * - NUNCA se aceptan: companyId, employeeId (creación de caso es el CRUD
 *   3.2.1 existente), closedBy*, timestamps, history — todo se resuelve
 *   server-side.
 * - El lifecycle canónico va EXCLUSIVAMENTE por el endpoint dedicado
 *   PATCH /:id/lifecycle; el estado de la acción por PATCH
 *   /:id/actions/:actionId/status.
 * - Fechas: @IsDate() + @Type(() => Date) (convención del dominio incidents).
 */

// ── Equipo investigador ─────────────────────────────────────────────────────

export class InvestigationTeamMemberDto {
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  participationRole?: string;
}

// ── Investigación (PATCH /:id/investigation) ────────────────────────────────

export class UpdateInvestigationDto {
  @IsOptional()
  @IsMongoId()
  /** Responsable de la investigación (usuario del tenant; validado en service). */
  investigationResponsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  methodology?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvestigationTeamMemberDto)
  /** Reemplaza el equipo investigador completo (operación idempotente). */
  investigationTeam?: InvestigationTeamMemberDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  immediateCauses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  /** Causas básicas (alias canónico; coexiste con rootCauses legacy). */
  basicCauses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  /** Causas básicas legacy (se acepta por compatibilidad con el CRUD 3.2.1). */
  rootCauses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedFactors?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  conclusions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  recommendations?: string;

  @IsOptional()
  @IsEnum(InvestigationProgressStatus)
  investigationStatus?: InvestigationProgressStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  /** Fecha de inicio de la investigación (no futura; validado en service). */
  investigationDate?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  /** Compatibilidad: snapshot legacy del responsable (se ignora si va userId). */
  responsible?: string;
}

// ── Evidencia (POST /:id/investigation/evidence) ────────────────────────────

export class AddInvestigationEvidenceDto {
  @IsOptional()
  @IsMongoId()
  /** Referencia declarativa a DocumentMaster (validada { _id, companyId }). */
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

// ── Acciones de investigación ───────────────────────────────────────────────

export class CreateInvestigationActionDto {
  @IsString()
  @MaxLength(2000)
  /** Descripción de la acción (campo legacy `action`). */
  action!: string;

  @IsOptional()
  @IsEnum(InvestigationActionType)
  /** Derivable del arreglo padre si se omite (corrective/preventive). */
  actionType?: InvestigationActionType;

  @IsOptional()
  @IsMongoId()
  /** Responsable tipado tenant-safe (validado en service; no inventa userId). */
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  /** Compatibilidad: responsable string legacy (coexiste con userId). */
  responsibleSnapshot?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  plannedDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @IsEnum(InvestigationActionStatus)
  /** Default: PENDING (server-side). */
  status?: InvestigationActionStatus;
}

export class UpdateInvestigationActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  action?: string;

  @IsOptional()
  @IsEnum(InvestigationActionType)
  actionType?: InvestigationActionType;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleSnapshot?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  plannedDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;
}

export class UpdateInvestigationActionStatusDto {
  @IsEnum(InvestigationActionStatus)
  status!: InvestigationActionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

// ── Evidencia de acción (POST /:id/actions/:actionId/evidence) ──────────────

export class AddActionEvidenceDto {
  @IsOptional()
  @IsMongoId()
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

// ── Seguimiento de acción (POST /:id/actions/:actionId/follow-up) ───────────

export class RegisterActionFollowUpDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  /** Fecha del seguimiento (no futura; default: ahora — server-side). */
  followUpDate?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsOptional()
  @IsEnum(InvestigationActionImplementationStatus)
  implementationStatus?: InvestigationActionImplementationStatus;

  @IsOptional()
  @IsEnum(InvestigationPerceivedEffectiveness)
  /** PERCEPCIÓN de efectividad — NO eficacia formal (frontera con 7.1.1). */
  perceivedEffectiveness?: InvestigationPerceivedEffectiveness;
}

// ── Lifecycle del caso (PATCH /:id/lifecycle) ───────────────────────────────

export class UpdateIncidentLifecycleDto {
  @IsEnum(IncidentLifecycleStage)
  stage!: IncidentLifecycleStage;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
