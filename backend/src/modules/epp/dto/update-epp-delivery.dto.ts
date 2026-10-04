import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EppDeliveryCondition } from '../schemas/epp-delivery.schema';

/**
 * DTO de edición de una entrega de EPP (4.2.6 — Alternativa B).
 *
 * SOLO campos realmente editables. Quedan FUERA del contrato (el ValidationPipe
 * global con whitelist + forbidNonWhitelisted los rechaza):
 *   companyId, employeeId, eppItemId, createdBy, updatedBy, history,
 *   status (transiciones solo vía PATCH /:id/status), employeeNameSnapshot,
 *   eppNameSnapshot, createdAt/updatedAt.
 *
 * Nota: mantener employeeId/eppItemId inmutables preserva la integridad de la
 * trazabilidad (no se puede "reasignar" una entrega histórica a otro
 * trabajador/EPP; el ciclo correcto es devolver/reemplazar y crear nueva entrega).
 */
export class UpdateEppDeliveryDto {
  @IsOptional() @IsDateString()
  deliveryDate?: string;

  @IsOptional() @IsDateString()
  expectedReplacementDate?: string;

  /** Reposición efectiva (>= deliveryDate; validado en service). */
  @IsOptional() @IsDateString()
  actualReplacementDate?: string;

  @IsOptional() @IsInt() @Min(1) @Max(1000)
  quantity?: number;

  @IsOptional() @IsEnum(EppDeliveryCondition)
  condition?: EppDeliveryCondition;

  @IsOptional() @IsString() @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  certificateUrl?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;
}
