import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO de cambio de estado de una entrega de EPP (4.2.6 — Alternativa B).
 *
 * Solo estados RESUELTOS: el cliente no puede "re-activar" una entrega
 * (ACTIVE→ACTIVE ni volver de un estado terminal); la reposición del ciclo se
 * registra como NUEVA entrega (ver EPP_DELIVERY_STATUS_TRANSITIONS).
 *
 * El historial NUNCA se recibe del cliente: el service lo agrega server-side
 * con el uid autenticado.
 */
export class UpdateEppDeliveryStatusDto {
  @IsEnum(['REPLACED', 'RETURNED', 'DAMAGED'])
  status!: 'REPLACED' | 'RETURNED' | 'DAMAGED';

  /** Fecha efectiva del reemplazo (obligatoria si status=REPLACED; validado en service). */
  @IsOptional() @IsDateString()
  actualReplacementDate?: string;

  @IsOptional() @IsString() @MaxLength(500)
  comment?: string;

  /** Evidencia del evento (p. ej. foto del EPP dañado); asociada al historial. */
  @IsOptional() @IsString() @MaxLength(500)
  evidenceUrl?: string;
}
