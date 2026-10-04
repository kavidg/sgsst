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
 * DTO de creación de mantenimiento (POST /maintenance).
 *
 * El historial y los metadatos de trazabilidad (statusHistory, createdBy,
 * updatedBy) NO se reciben del cliente: el service los completa server-side
 * con el usuario autenticado (trazabilidad no alterable por el usuario).
 */
export class CreateMaintenanceDto {
  @IsString()
  @MaxLength(200)
  itemName!: string;

  @IsEnum(Object.values(MaintenanceItemType))
  itemType!: MaintenanceItemType;

  @IsEnum(Object.values(MaintenanceType))
  maintenanceType!: MaintenanceType;

  @IsString()
  @MaxLength(1000)
  description!: string;

  @Type(() => Date)
  @IsDate()
  plannedDate!: Date;

  /**
   * Estado inicial opcional (V1: solo PROGRAMMED o IN_PROGRESS — un
   * mantenimiento no puede nacer completado ni cancelado).
   */
  @IsOptional()
  @IsIn([MaintenanceStatus.PROGRAMMED, MaintenanceStatus.IN_PROGRESS])
  status?: MaintenanceStatus;

  @IsString()
  @MaxLength(200)
  responsible!: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;
}
