import { IsString, IsOptional, IsDateString, IsEnum, IsArray } from 'class-validator';
import { ChangeType, ImpactLevel, ChangeStatus } from '../schema/change-request.schema';

/**
 * DTO para actualizar una solicitud de gestión del cambio.
 * Todos los campos son opcionales — solo se modifican los campos enviados.
 *
 * NO permite: companyId, createdBy, createdByName, requestedBy, requestedByName.
 * La identidad del solicitante y creador permanece inmutable.
 *
 * El campo `status` se incluye aquí pero con restricciones de negocio
 * en el service que impiden transiciones no válidas.
 */
export class UpdateChangeRequestDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ChangeType)
  changeType?: ChangeType;

  @IsOptional()
  @IsEnum(ImpactLevel)
  impactLevel?: ImpactLevel;

  @IsOptional()
  @IsEnum(ChangeStatus)
  status?: ChangeStatus;

  @IsOptional()
  @IsString()
  riskAnalysis?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  controlActions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedProcesses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedWorkers?: string[];

  @IsOptional()
  @IsDateString()
  implementationDate?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
