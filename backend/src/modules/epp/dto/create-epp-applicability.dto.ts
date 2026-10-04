import { IsBoolean, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO de creación de una relación Cargo → EPP (matriz de aplicabilidad 4.2.6).
 *
 * SEGURIDAD: el cliente NUNCA envía companyId (server-side), createdBy/
 * updatedBy (server-side) ni timestamps. La unicidad
 * companyId+jobProfileId+eppItemId se valida en service (409).
 */
export class CreateEppApplicabilityDto {
  /** Perfil de cargo (JobProfile._id del MISMO tenant; validado en service). */
  @IsMongoId()
  jobProfileId!: string;

  /** Identidad lógica del ítem en SstEpp.catalog[] (eppId; validado en service). */
  @IsString() @MinLength(1) @MaxLength(128)
  eppItemId!: string;

  @IsOptional() @IsBoolean()
  required?: boolean;

  /** Motivo del requisito (máx. 250 caracteres). */
  @IsOptional() @IsString() @MaxLength(250)
  reason?: string;

  /** Ámbito de aplicación en texto (máx. 250 caracteres; no es entidad de tareas). */
  @IsOptional() @IsString() @MaxLength(250)
  scope?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}
