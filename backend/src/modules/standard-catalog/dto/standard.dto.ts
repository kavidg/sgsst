import {
  ImplementationStatus,
  PhvaPhase,
  StandardPriorityMetadata,
  StandardSection,
} from '../interfaces/standard-definition.interface';

/**
 * DTO de un estándar mínimo del SG-SST (catálogo normativo).
 *
 * Proyección plana de `StandardDefinition` sin exponer el tipo de Mongo:
 * el catálogo es estático (read-only) y este DTO es lo que el frontend
 * consume para construir vistas de catálogo, PHVA o evaluaciones.
 *
 * Compatibilidad: `weight` conserva el peso normativo original (mismo valor
 * que `normativeWeight`) para no romper el contrato de `GET /standard-catalog/:level`.
 * `implementationStatus` es opcional (aditivo, no rompe consumidores previos).
 */
export class StandardDto {
  /** Código canónico del estándar (p. ej. '1.1.1'). */
  code!: string;
  /** Título legible del estándar. */
  title!: string;
  /** Descripción / criterio de cumplimiento. */
  description!: string;
  /** Capítulo normativo (Recursos, Gestión integral, etc.). */
  chapter!: string;
  /** Fase del ciclo PHVA. */
  phva!: PhvaPhase;
  /** Peso normativo original (escala PHVA de la plataforma). Alias de `normativeWeight`. */
  weight!: number;
  /** Niveles de empresa a los que aplica (7, 21, 60). */
  applicableLevels!: string[];
  /** Ruta frontend del módulo que lo gestiona ('' si aún no existe). */
  moduleRoute!: string;
  /** Estado de implementación en la plataforma (opcional, aditivo). */
  implementationStatus?: ImplementationStatus;
  /** Provider del ImplementationValidator que lo valida (si existe). */
  validationProvider?: string;
  /** Metadatos de prioridad estáticos (opcional). */
  priorityMetadata?: StandardPriorityMetadata;
  /**
   * Criterio de cumplimiento del estándar (texto PHVA existente, opcional).
   * Solo está presente cuando el estándar tiene contenido poblado (FASE 7.1).
   */
  criteria?: string;
  /**
   * Modo de revisión / verificación del estándar (texto PHVA existente,
   * opcional). Solo está presente cuando el estándar tiene contenido poblado.
   */
  modeReview?: string;
  /** Sección del PHVA a la que pertenece el estándar (opcional). */
  section?: StandardSection;
}
