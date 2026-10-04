import {
  ArrayMaxSize,
  IsArray,
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
  ManagementReviewDecisionCategory,
  ManagementReviewDecisionStatus,
  ManagementReviewDirectionStatus,
  ManagementReviewInputStatus,
  ManagementReviewInputType,
  ManagementReviewAttendance,
  ManagementReviewType,
} from '../schemas/management-review-direction.schema';

/**
 * E1 (6.1.3) — DTOs ESTRICTOS del dominio management-review-direction.
 *
 * Seguridad de payload (ValidationPipe global: whitelist + forbidNonWhitelisted):
 * - NUNCA se aceptan: companyId, createdBy, updatedBy, history, timestamps,
 *   status (en PATCH de contenido) ni cualquier campo interno — el tenant, la
 *   autoría y el estado se resuelven SIEMPRE server-side.
 * - Fechas: @IsDateString() (ISO-8601; convención del repo).
 * - Rangos y coherencia de fechas: validados server-side en el service.
 */

const MAX_TEXT = 2000;
const MAX_LIST_ITEMS = 50;

// ─── Participantes (embebidos) ──────────────────────────────────────────────
// NOTA: declarados ANTES de los DTOs que los referencian: con
// emitDecoratorMetadata, `design:type` se evalúa al cargar el módulo y una
// referencia hacia atrás produce TDZ en tiempo de ejecución.

export class ReviewParticipantDto {
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

  @IsOptional()
  @IsEnum(ManagementReviewAttendance)
  attendance?: ManagementReviewAttendance;
}

// ─── Análisis (embebido) ────────────────────────────────────────────────────

export class ReviewAnalysisDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_TEXT, { each: true })
  strengths?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_TEXT, { each: true })
  gaps?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_TEXT, { each: true })
  priorities?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  managementObservations?: string;
}

// ─── Revisión ───────────────────────────────────────────────────────────────

export class CreateManagementReviewDirectionDto {
  /** Código asignado por la empresa (único POR tenant; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reviewCode?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsEnum(ManagementReviewType)
  reviewType?: ManagementReviewType;

  // Planeación
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  objectives?: string;

  // Responsable (usuario del tenant; validación en service)
  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleNameSnapshot?: string;

  // Participantes (snapshots para trazabilidad histórica)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReviewParticipantDto)
  participants?: ReviewParticipantDto[];
}

export class UpdateManagementReviewDirectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reviewCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsEnum(ManagementReviewType)
  reviewType?: ManagementReviewType;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  objectives?: string;

  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  responsibleNameSnapshot?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReviewParticipantDto)
  participants?: ReviewParticipantDto[];

  // Ejecución (fechas reales; el estado se cambia por endpoint dedicado)
  @IsOptional()
  @IsDateString()
  actualStartDate?: string;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string;

  // Análisis de la dirección (secciones propias del dominio)
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewAnalysisDto)
  analysis?: ReviewAnalysisDto;

  // Evidencia del acta (referencias; la validación de tenencia es en service)
  @IsOptional()
  @IsMongoId()
  minutesDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  minutesEvidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reportTitle?: string;
}

export class UpdateManagementReviewDirectionStatusDto {
  @IsEnum(ManagementReviewDirectionStatus)
  status!: ManagementReviewDirectionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

// ─── Filtros de listado ─────────────────────────────────────────────────────

export class ListManagementReviewDirectionQueryDto {
  @IsOptional()
  @IsEnum(ManagementReviewDirectionStatus)
  status?: ManagementReviewDirectionStatus;

  @IsOptional()
  @IsEnum(ManagementReviewType)
  reviewType?: ManagementReviewType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

// ─── Entradas de la revisión ────────────────────────────────────────────────

export class CreateReviewInputDto {
  @IsEnum(ManagementReviewInputType)
  type!: ManagementReviewInputType;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  description?: string;

  /** Referencias declarativas a otros dominios: entradas, NO recálculos. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceModule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceEntityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencePeriod?: string;

  @IsOptional()
  @IsEnum(ManagementReviewInputStatus)
  status?: ManagementReviewInputStatus;

  @IsOptional()
  @IsMongoId()
  evidenceDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

export class UpdateReviewInputDto {
  @IsOptional()
  @IsEnum(ManagementReviewInputType)
  type?: ManagementReviewInputType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceModule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceEntityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencePeriod?: string;

  @IsOptional()
  @IsEnum(ManagementReviewInputStatus)
  status?: ManagementReviewInputStatus;

  @IsOptional()
  @IsMongoId()
  evidenceDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

// ─── Decisiones de dirección ────────────────────────────────────────────────

export class CreateReviewDecisionDto {
  @IsString()
  @MaxLength(MAX_TEXT)
  description!: string;

  @IsEnum(ManagementReviewDecisionCategory)
  category!: ManagementReviewDecisionCategory;

  @IsOptional()
  @IsEnum(ManagementReviewDecisionStatus)
  status?: ManagementReviewDecisionStatus;

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
  @IsString()
  @MaxLength(MAX_TEXT)
  resourcesRequired?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

export class UpdateReviewDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  description?: string;

  @IsOptional()
  @IsEnum(ManagementReviewDecisionCategory)
  category?: ManagementReviewDecisionCategory;

  @IsOptional()
  @IsEnum(ManagementReviewDecisionStatus)
  status?: ManagementReviewDecisionStatus;

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
  @IsString()
  @MaxLength(MAX_TEXT)
  resourcesRequired?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  observations?: string;
}

// ─── Evidencia documental (DocumentMaster tenant-safe) ──────────────────────

export class AttachMinutesEvidenceDto {
  /** ObjectId de DocumentMaster de la MISMA empresa (validación en service). */
  @IsMongoId()
  documentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

// Límites de colecciones embebidas (fuente única; usados por el service).
export const MAX_INPUTS_PER_REVIEW = 100;
export const MAX_DECISIONS_PER_REVIEW = 100;
export const MAX_PARTICIPANTS_PER_REVIEW = 50;
