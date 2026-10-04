import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO de edición de una relación Cargo → EPP (matriz de aplicabilidad 4.2.6).
 *
 * SOLO campos de contenido. Quedan FUERA del contrato (el ValidationPipe global
 * con whitelist + forbidNonWhitelisted los rechaza con 400):
 *
 *   companyId, jobProfileId, eppItemId, createdBy, updatedBy, createdAt, _id
 *
 * La identidad de la relación (cargo/EPP) es inmutable: si se necesita cambiar
 * cargo o EPP, se desactiva la relación y se crea una nueva (trazabilidad).
 */
export class UpdateEppApplicabilityDto {
  @IsOptional() @IsBoolean()
  required?: boolean;

  @IsOptional() @IsString() @MaxLength(250)
  reason?: string;

  @IsOptional() @IsString() @MaxLength(250)
  scope?: string;

  /** Desactivación lógica (active=false conserva el histórico). */
  @IsOptional() @IsBoolean()
  active?: boolean;
}
