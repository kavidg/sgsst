import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  ActionItemType,
  ActionOrigin,
  ActionPriority,
  ActionStatus,
  EffectivenessResult,
} from '../schemas/corrective-preventive-action.schema';

/**
 * E1 (7.1.1) — DTOs ESTRICTOS del dominio corrective-preventive-actions.
 *
 * Seguridad de payload (ValidationPipe global: whitelist + forbidNonWhitelisted):
 * - NUNCA se aceptan: companyId, createdBy, updatedBy, closedByUserId,
 *   closureDate, effectivenessVerification, history, timestamps, status (en
 *   PATCH de contenido ni en evidencia/eficacia) ni cualquier campo interno —
 *   el tenant, la autoría y el estado se resuelven SIEMPRE server-side.
 * - El estado va EXCLUSIVAMENTE por el endpoint dedicado PATCH /:id/status
 *   (máquina de estados server-side).
 * - Fechas: @IsDateString() (ISO-8601; convención del repo).
 * - Coherencia de rangos de fechas y reglas de negocio: validadas server-side
 *   en el service.
 */

// ─── Evidencia (referencia declarativa — sin sistema de archivos propio) ────

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

  @IsOptional()
  @IsBoolean()
  /** Reemplazar la evidencia existente (default: true — la última evidencia es la vigente). */
  replace?: boolean;
}

// ─── Verificación de eficacia (endpoint especializado) ──────────────────────

export class VerifyEffectivenessDto {
  @IsEnum(EffectivenessResult)
  result!: EffectivenessResult;

  /** El verificador es SIEMPRE el actor autenticado (resuelto server-side). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  /**
   * Fecha de verificación ISO-8601; default: ahora (server-side).
   * Si se envía, NO puede ser futura (validado en service).
   */
  @IsOptional()
  @IsDateString()
  verificationDate?: string;
}

// ─── Crear acción ───────────────────────────────────────────────────────────

export class CreateCorrectivePreventiveActionDto {
  /** Código asignado por la empresa (único POR tenant; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  actionCode?: string;

  @IsEnum(ActionItemType)
  type!: ActionItemType;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  /** Origen OBLIGATORIO (OTHER si no proviene de un módulo del sistema). */
  @IsEnum(ActionOrigin)
  origin!: ActionOrigin;

  /**
   * Referencia declarativa al documento origen — OPCIONAL y sin FK estricta
   * (trazabilidad; el acoplamiento innecesario está prohibido en E1).
   */
  @IsOptional()
  @IsMongoId()
  originReferenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  finding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rootCause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actionPlan?: string;

  @IsOptional()
  @IsEnum(ActionPriority)
  priority?: ActionPriority;

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

  // evidence / effectivenessVerification / closure / status / score:
  // NUNCA en creación — endpoints especializados y estados server-side.
}

// ─── Actualizar acción (PATCH de contenido; el estado va por /status) ───────

export class UpdateCorrectivePreventiveActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  actionCode?: string;

  @IsOptional()
  @IsEnum(ActionItemType)
  type?: ActionItemType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(ActionOrigin)
  origin?: ActionOrigin;

  @IsOptional()
  @IsMongoId()
  originReferenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  finding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rootCause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actionPlan?: string;

  @IsOptional()
  @IsEnum(ActionPriority)
  priority?: ActionPriority;

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

  // effectivenessVerification / closureDate / closedByUserId / status:
  // solo por endpoints especializados (verificaci\u00f3n de eficacia y /status).
}

// ─── Cambio de estado (endpoint dedicado; máquina de estados server-side) ───

export class UpdateActionStatusDto {
  @IsEnum(ActionStatus)
  status!: ActionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
