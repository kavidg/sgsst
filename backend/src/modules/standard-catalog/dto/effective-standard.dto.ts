import {
  ImplementationStatus,
  PhvaPhase,
  StandardPriorityMetadata,
} from '../interfaces/standard-definition.interface';

/**
 * Estándar del catálogo EFECTIVO (normalizado).
 *
 * Incluye los dos conceptos de peso:
 * - `normativeWeight`: peso normativo original (intacto, sin modificar).
 * - `effectiveWeight`: peso normalizado que usa el sistema, calculado
 *   automáticamente solo sobre estándares IMPLEMENTED/PARTIAL de forma que
 *   la suma del catálogo efectivo sea exactamente 100.
 */
export class EffectiveStandardDto {
  /** Código canónico del estándar. */
  code!: string;
  /** Título legible del estándar. */
  title!: string;
  /** Descripción / criterio de cumplimiento. */
  description!: string;
  /** Capítulo normativo. */
  chapter!: string;
  /** Fase del ciclo PHVA. */
  phva!: PhvaPhase;
  /** Peso normativo original (NO normalizado). */
  normativeWeight!: number;
  /** Peso efectivo normalizado (suma del catálogo = 100). */
  effectiveWeight!: number;
  /** Niveles de empresa a los que aplica. */
  applicableLevels!: string[];
  /** Ruta frontend del módulo que lo gestiona. */
  moduleRoute!: string;
  /** Estado de implementación (nunca PLANNED en el catálogo efectivo). */
  implementationStatus!: ImplementationStatus;
  /** Provider del ImplementationValidator que lo valida (si existe). */
  validationProvider?: string;
  /** Metadatos de prioridad estáticos (opcional). */
  priorityMetadata?: StandardPriorityMetadata;
}

/**
 * Catálogo EFECTIVO de un nivel: solo estándares IMPLEMENTED/PARTIAL con sus
 * pesos normalizados (suma exacta = 100). El catálogo normativo no se toca.
 */
export class EffectiveStandardCatalogDto {
  /** Nivel de estándares solicitado ('7' | '21' | '60'). */
  level!: string;
  /** Cantidad de estándares efectivos (IMPLEMENTED + PARTIAL). */
  count!: number;
  /** Suma de effectiveWeight (siempre 100 cuando count > 0). */
  effectiveTotal!: number;
  /** Cuántos estándares efectivos están IMPLEMENTED. */
  implementedCount!: number;
  /** Cuántos estándares del nivel quedaron fuera (PLANNED). */
  plannedCount!: number;
  /** Estándares efectivos con effectiveWeight + implementationStatus. */
  standards!: EffectiveStandardDto[];
}
