import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MaintenanceItemType,
  MaintenanceStatus,
  MaintenanceType,
} from '../schemas/maintenance.schema';

/**
 * DTO de actualización de mantenimiento (PATCH /maintenance/:id).
 *
 * NO permite cambiar `status` (eso es una transición de estado con historial
 * obligatorio → PATCH /maintenance/:id/status). Permite editar la
 * información del registro; sobre COMPLETED solo se acepta ejecución
 * (validación del service).
 */
export class UpdateMaintenanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  itemName?: string;

  @IsOptional()
  @IsEnum(Object.values(MaintenanceItemType))
  itemType?: MaintenanceItemType;

  @IsOptional()
  @IsEnum(Object.values(MaintenanceType))
  maintenanceType?: MaintenanceType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  plannedDate?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsible?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  frequency?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextMaintenanceDate?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  /** Evidencia (ejecución): URL o referencia documental del soporte. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;
}
