import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  AnnualAuditStatus,
  AuditActionStatus,
  AuditFindingSeverity,
  AuditFindingStatus,
  AuditFindingType,
} from '../schemas/annual-audit.schema';

/**
 * E1 (6.1.2) — DTOs ESTRICTOS del dominio annual-audit.
 *
 * Seguridad de payload (ValidationPipe global: whitelist + forbidNonWhitelisted):
 * - NUNCA se aceptan: companyId, createdBy, updatedBy, history, timestamps,
 *   findings/actions como array completo, ni cualquier campo interno — el
 *   tenant y la autoría se resuelven SIEMPRE server-side.
 * - Fechas: @IsDateString() (formato ISO-8601 válido; convención del repo).
 * - Rangos y coherencia de fechas: validados en los DTOs de creación y
 *   re-validados server-side en el service.
 */

const MAX_TEXT = 2000;

// ─── Evidencia documental (referencias tenant-safe a DocumentMaster) ────────

export class AttachAuditEvidenceDto {
  /** ObjectId de DocumentMaster perteneciente a la MISMA empresa
   * (validación de tenencia en el service). */
  @IsMongoId()
  documentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

// ─── Auditoría ──────────────────────────────────────────────────────────────

export class CreateAnnualAuditDto {
  /** Código de auditoría asignado por la empresa (único POR tenant; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  auditCode?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsEnum(['INTERNAL', 'EXTERNAL'])
  auditType?: 'INTERNAL' | 'EXTERNAL';

  // Planificación
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

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

  // Auditor (competencia como espacio simple; sin sistema de certificaciones)
  @IsOptional()
  @IsMongoId()
  auditorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  auditorNameSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  auditorCompetence?: string;

  @IsOptional()
  @IsMongoId()
  auditorCompetenceEvidenceId?: string;
}

export class UpdateAnnualAuditDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  auditCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsEnum(['INTERNAL', 'EXTERNAL'])
  auditType?: 'INTERNAL' | 'EXTERNAL';

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

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
  auditorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  auditorNameSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  auditorCompetence?: string;

  @IsOptional()
  @IsMongoId()
  auditorCompetenceEvidenceId?: string;

  // Ejecución (fechas reales — el estado se cambia por endpoint dedicado)
  @IsOptional()
  @IsDateString()
  actualStartDate?: string;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string;

  // Informe
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reportTitle?: string;

  @IsOptional()
  @IsDateString()
  reportDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  reportSummary?: string;

  @IsOptional()
  @IsMongoId()
  reportDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reportEvidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  findingsSummary?: string;
}

export class UpdateAnnualAuditStatusDto {
  @IsEnum(AnnualAuditStatus)
  status!: AnnualAuditStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

// ─── Hallazgos ──────────────────────────────────────────────────────────────

export class CreateAuditFindingDto {
  @IsEnum(AuditFindingType)
  type!: AuditFindingType;

  @IsString()
  @MaxLength(MAX_TEXT)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  criterion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  evidence?: string;

  @IsOptional()
  @IsEnum(AuditFindingSeverity)
  severity?: AuditFindingSeverity;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleNameSnapshot?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(AuditFindingStatus)
  status?: AuditFindingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

export class UpdateAuditFindingDto {
  @IsOptional()
  @IsEnum(AuditFindingType)
  type?: AuditFindingType;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  criterion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  evidence?: string;

  @IsOptional()
  @IsEnum(AuditFindingSeverity)
  severity?: AuditFindingSeverity;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleNameSnapshot?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(AuditFindingStatus)
  status?: AuditFindingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

// ─── Acciones de seguimiento ────────────────────────────────────────────────

export class CreateAuditActionDto {
  @IsString()
  @MaxLength(MAX_TEXT)
  description!: string;

  @IsString()
  @MaxLength(300)
  responsible!: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(AuditActionStatus)
  status?: AuditActionStatus;

  @IsOptional()
  @IsDateString()
  completedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

export class UpdateAuditActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsible?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(AuditActionStatus)
  status?: AuditActionStatus;

  @IsOptional()
  @IsDateString()
  completedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

// Re-exportar el límite máximo de hallazgos para el service (fuente única).
export const MAX_FINDINGS_PER_AUDIT = 200;
export const MAX_ACTIONS_PER_FINDING = 50;
