import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EppDeliveryCondition } from '../schemas/epp-delivery.schema';

/**
 * DTO de creación de una entrega de EPP (4.2.6 — Alternativa B).
 *
 * SEGURIDAD: el cliente NUNCA envía companyId (resuelto server-side),
 * createdBy/updatedBy (server-side), history (server-side), status (siempre
 * ACTIVE al crear) ni snapshots de nombres (se toman de Employee y del
 * catálogo SstEpp con los valores reales de la empresa).
 */
export class CreateEppDeliveryDto {
  /** Trabajador REAL (Employee._id de la misma empresa; validado en service). */
  @IsMongoId()
  employeeId!: string;

  /** Identificador del elemento en el catálogo/matriz SstEpp de la empresa. */
  @IsString() @MinLength(1) @MaxLength(128)
  eppItemId!: string;

  /** Fecha de la ENTREGA REALIZADA (no futura; validado en service). */
  @IsDateString()
  deliveryDate!: string;

  @IsOptional() @IsInt() @Min(1) @Max(1000)
  quantity?: number;

  @IsOptional() @IsEnum(EppDeliveryCondition)
  condition?: EppDeliveryCondition;

  /** Reposición esperada (>= deliveryDate; validado en service). */
  @IsOptional() @IsDateString()
  expectedReplacementDate?: string;

  /** Evidencia ESPECÍFICA de esta entrega (firma/acta/foto) — no se hereda de SstEpp. */
  @IsOptional() @IsString() @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  certificateUrl?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;
}
