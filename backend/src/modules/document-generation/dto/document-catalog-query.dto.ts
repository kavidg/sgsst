import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DocumentStatus } from '../types/document-generation.types';
import { DocumentTemplateType } from '../types/document-generation.types';
import { DocumentSourceModule } from '../types/renderer.types';
import { DOCUMENT_CATALOG_SORT_FIELDS } from '../types/document-catalog.types';

/** Valores válidos de sort (claves whitelist con prefijo '-' opcional). */
export const CATALOG_SORT_WHITELIST: string[] = [
  ...DOCUMENT_CATALOG_SORT_FIELDS,
  ...DOCUMENT_CATALOG_SORT_FIELDS.map((field) => `-${field}`),
];

/**
 * Filtros y paginación del catálogo documental (Fase 6.5).
 *
 * Todos los campos son opcionales; el catálogo consulta EXCLUSIVAMENTE
 * DocumentInstance. El campo documentType se resuelve indirectamente: las
 * instancias no persisten documentType, por lo que el servicio primero
 * resuelve las plantillas con ese tipo y filtra por templateId.
 */
export class DocumentCatalogQueryDto {
  @IsOptional()
  @IsMongoId()
  companyId?: string;

  @IsOptional()
  @IsEnum(DocumentTemplateType)
  documentType?: DocumentTemplateType;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsEnum(DocumentSourceModule)
  sourceModule?: DocumentSourceModule;

  /** Búsqueda libre sobre título/plantilla y entidad de origen. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsDateString()
  generatedFrom?: string;

  @IsOptional()
  @IsDateString()
  generatedTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * Ordenamiento: clave de DOCUMENT_CATALOG_SORT_FIELDS con prefijo '-' para
   * descendente (p.ej. 'generatedAt' o '-generatedAt').
   */
  @IsOptional()
  @IsString()
  @IsIn(CATALOG_SORT_WHITELIST)
  sort?: string;
}
