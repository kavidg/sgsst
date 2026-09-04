import { IsString, IsOptional, IsDateString, IsEnum, IsArray, ValidateIf } from 'class-validator';
import { ChangeType, ImpactLevel } from '../schema/change-request.schema';

/**
 * DTO para crear una solicitud de gestión del cambio (2.11.1).
 *
 * NO permite: companyId, requestedBy, requestedByName, createdBy, createdByName.
 * Estos valores se controlan exclusivamente en el backend.
 */
export class CreateChangeRequestDto {
  /** Título descriptivo del cambio. */
  @IsString()
  title!: string;

  /** Descripción detallada del cambio. */
  @IsString()
  description!: string;

  /** Tipo de cambio. */
  @IsEnum(ChangeType)
  changeType!: ChangeType;

  /** Nivel de impacto en SST. */
  @IsEnum(ImpactLevel)
  impactLevel!: ImpactLevel;

  /** Análisis de riesgos SST. Requerido para impactos MEDIUM, HIGH, CRITICAL. */
  @IsOptional()
  @IsString()
  riskAnalysis?: string;

  /** Acciones de control a implementar. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  controlActions?: string[];

  /** Procesos afectados. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedProcesses?: string[];

  /** Trabajadores o áreas afectadas. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedWorkers?: string[];

  /** Fecha planificada de implementación. */
  @IsOptional()
  @IsDateString()
  implementationDate?: string;

  /** Fecha de seguimiento post-implementación. */
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  /** Observaciones adicionales. */
  @IsOptional()
  @IsString()
  observations?: string;
}
