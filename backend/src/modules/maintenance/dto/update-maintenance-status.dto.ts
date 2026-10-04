import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MaintenanceStatus } from '../schemas/maintenance.schema';

/**
 * DTO de cambio de estado (PATCH /maintenance/:id/status).
 *
 * El historial NO se recibe del cliente: el service lo agrega server-side
 * con el uid autenticado (trazabilidad no alterable por el usuario).
 */
export class UpdateMaintenanceStatusDto {
  @IsEnum(Object.values(MaintenanceStatus))
  status!: MaintenanceStatus;

  /** Motivo/comentario del cambio (recomendado al cancelar o reabrir). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  /**
   * Fecha de ejecución real (obligatoria cuando status = COMPLETED; el
   * service la valida — sin default inventado).
   */
  @IsOptional()
  @IsString()
  completedDate?: string;

  /**
   * Evidencia del mantenimiento (obligatoria al COMPLETAR si el registro
   * aún no la tiene — el service valida la trazabilidad documental).
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;

  /** Observaciones de la ejecución (opcionales al completar). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;
}
