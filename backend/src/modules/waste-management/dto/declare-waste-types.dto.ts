import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WasteType } from '../schemas/waste-management-record.schema';

/**
 * Declaración de tipos de residuo generados por la empresa
 * (3.1.9 — FASE 34C, criterio C1).
 *
 * companyId NUNCA se acepta: se deriva de la sesión autenticada. La
 * declaración es la autoridad del denominador de cobertura C1; sin ella el
 * provider usa los tipos que la empresa ya registra.
 */
export class DeclareWasteTypesDto {
  // declaredWasteTypes: subconjunto no vacío del enum cerrado.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(WasteType, { each: true })
  declaredWasteTypes!: WasteType[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  updatedBy?: string;
}
