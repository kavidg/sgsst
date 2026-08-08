import { IsDateString, IsMongoId, IsString } from 'class-validator';

/**
 * Entrada del endpoint POST /compliance-automation/company/:companyId/accept.
 *
 * El controller fusiona el companyId del path con el body; por eso el DTO
 * también lo declara (es el identificador de empresa sobre el que se
 * generan las recomendaciones).
 */
export class AcceptRecommendationDto {
  /** Identificador de la recomendación generada por el Action Engine. */
  @IsString()
  recommendationId!: string;

  /** Empresa a la que pertenece la recomendación. */
  @IsMongoId()
  companyId!: string;

  /** Usuario (id o email) que acepta la recomendación. */
  @IsString()
  acceptedBy!: string;

  /** Fecha de aceptación en formato ISO 8601. */
  @IsDateString()
  acceptDate!: string;
}
