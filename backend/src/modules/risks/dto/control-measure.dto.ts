import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * ETAPA 1 (PHVA 4.2.2) — DTO de medida de control estructurada.
 *
 * Soporte OPCIONAL: el flujo legacy sigue funcionando enviando solo
 * `controlMeasures: string`. Este DTO permite crear/editar riesgos con
 * controles estructurados (validación atómica dentro de Risk).
 *
 * `id` es OPCIONAL en el DTO: el `_id` del subdocumento es la identidad
 * estable; si el cliente lo envía, se respeta.
 */
export class ControlMeasureDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1, { message: 'La descripción de la medida de control no puede estar vacía' })
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
