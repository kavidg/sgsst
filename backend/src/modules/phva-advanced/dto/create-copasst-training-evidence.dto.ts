import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { CopasstTrainingEvidenceType } from '../schemas/phva-advanced-copasst-training.schema';

/**
 * DTO de creación de evidencia de la Capacitación COPASST (1.1.7, Fase 4).
 *
 * Se usa en el endpoint multipart (FileInterceptor): los campos de formulario
 * llegan como strings y el ValidationPipe global (whitelist + transform +
 * forbidNonWhitelisted) los tipa y rechaza campos no declarados.
 *
 * NUNCA incluye `companyId` ni `itemCode`: el backend los resuelve desde el
 * contexto autenticado (header x-company-id) y el discriminador '1.1.7' es
 * fijo del dominio. Tampoco acepta metadata de miembros COPASST maestra.
 */
export class CreateCopasstTrainingEvidenceDto {
  @IsEnum(CopasstTrainingEvidenceType)
  type!: CopasstTrainingEvidenceType;

  /**
   * Índice ESTABLE de la sesión asociada dentro de record.sessions (opcional).
   * Las sesiones del modelo no poseen _id propio: el índice es el identificador
   * estable del modelo existente (se valida contra el arreglo real).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sessionIndex?: number;

  @IsOptional()
  @IsUrl()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  storagePath?: string;

  /** Metadata abierta tipada (p.ej. participantUserId para certificados). */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
