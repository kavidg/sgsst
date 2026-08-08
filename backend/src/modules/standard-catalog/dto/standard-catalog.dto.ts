import { StandardDto } from './standard.dto';

/**
 * Respuesta de GET /standard-catalog/:level.
 *
 * DTO propio (sin schemas Mongo): agrupa el catálogo de estándares
 * aplicables a un nivel de empresa (7, 21 o 60 estándares).
 */
export class StandardCatalogDto {
  /** Nivel de estándares solicitado ('7' | '21' | '60'). */
  level!: string;
  /** Cantidad de estándares del catálogo. */
  count!: number;
  /** Estándares del catálogo (orden canónico del catálogo maestro). */
  standards!: StandardDto[];
}
