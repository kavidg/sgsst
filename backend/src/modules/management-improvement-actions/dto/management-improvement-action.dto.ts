import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  ImprovementActionOrigin,
  ImprovementActionPriority,
  ImprovementActionStatus,
  ImplementationStatus,
  PerceivedEffectiveness,
} from '../schemas/management-improvement-action.schema';

/**
 * E1 (7.1.2) — DTOs ESTRICTOS del dominio management-improvement-actions.
 *
 * Seguridad de payload (ValidationPipe global: whitelist + forbidNonWhitelisted):
 * - NUNCA se aceptan: companyId, createdBy, updatedBy, closedByUserId,
 *   closureDate, followUp completo, history, timestamps, status (ni en PATCH
 *   de contenido) — el tenant, la autoría y el estado se resuelven SIEMPRE
 *   server-side.
 * - El estado va EXCLUSIVAMENTE por el endpoint dedicado PATCH /:id/status
 *   (máquina de estados server-side).
 * - Fechas: @IsDateString() (ISO-8601; convención del repo).
 * - Coherencia de rangos de fechas y reglas de negocio: validadas server-side
 *   en el service.
 */

// ─── Evidencia (referencia declarativa — sin sistema de archivos propio) ────

export class AddImprovementActionEvidenceDto {
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

  @IsOptional()
  @IsBoolean()
  /** Reemplazar la evidencia existente (default: true — la última evidencia es la vigente). */
  replace?: boolean;
}

// ─── Follow-up (endpoint especializado; NO existe verify-effectiveness) ─────

export class RegisterImprovementActionFollowUpDto {
  /**
   * Fecha del seguimiento ISO-8601; default: ahora (server-side).
   * Si se envía, NO puede ser futura (validado en service).
   */
  @IsOptional()
  @IsDateString()
  lastFollowUpDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsOptional()
  @IsEnum(ImplementationStatus)
  implementationStatus?: ImplementationStatus;

  @IsOptional()
  @IsEnum(PerceivedEffectiveness)
  perceivedEffectiveness?: PerceivedEffectiveness;

  @IsOptional()
  @IsBoolean()
  requiresContinuedFollowUp?: boolean;
}

// ─── Cambio de estado (endpoint dedicado; única vía de cambio de status) ────

export class UpdateImprovementActionStatusDto {
  @IsEnum(ImprovementActionStatus)
  status!: ImprovementActionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

// ─── Crear acción ───────────────────────────────────────────────────────────

export class CreateImprovementActionDto {
  /** Código asignado por la empresa (único POR tenant; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  actionCode?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  /** Origen OBLIGATORIO (OTHER si no proviene de un módulo del sistema). */
  @IsEnum(ImprovementActionOrigin)
  origin!: ImprovementActionOrigin;

  /**
   * Referencia declarativa al documento origen — OPCIONAL y sin FK estricta
   * (trazabilidad; NUNCA dispara queries automáticas — frontera E1).
   */
  @IsOptional()
  @IsMongoId()
  originReferenceId?: string;

  /** Decisión de la alta dirección que originó la acción (trazabilidad). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionReference?: string;

  @IsOptional()
  @IsEnum(ImprovementActionPriority)
  priority?: ImprovementActionPriority;

  @IsMongoId()
  responsibleUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleSnapshot?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsDateString()
  dueDate!: string;

  // evidence / followUp / closure / status / score:
  // NUNCA en creación — endpoints especializados y estados server-side.
}

// ─── Actualizar acción (PATCH de contenido; el estado va por /status) ───────

export class UpdateImprovementActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  actionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(ImprovementActionOrigin)
  origin?: ImprovementActionOrigin;

  @IsOptional()
  @IsMongoId()
  originReferenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionReference?: string;

  @IsOptional()
  @IsEnum(ImprovementActionPriority)
  priority?: ImprovementActionPriority;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleSnapshot?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  executionDate?: string;

  // followUp / evidence / closureDate / closedByUserId / status:
  // solo por endpoints especializados (evidencia, follow-up y /status).
}
