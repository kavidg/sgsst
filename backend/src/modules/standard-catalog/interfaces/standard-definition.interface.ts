/**
 * Niveles de estándares mínimos del SG-SST según la Resolución 0312 de 2019.
 *
 * - '7'  → empresas de 1 a 10 trabajadores (riesgo I, II o III).
 * - '21' → empresas de 11 a 50 trabajadores (riesgo I, II o III).
 * - '60' → empresas de más de 50 trabajadores (y ≤50 con riesgo IV o V).
 */
export type StandardLevel = '7' | '21' | '60';

/** Fase del ciclo PHVA a la que pertenece el estándar. */
export type PhvaPhase = 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';

/**
 * Estado de implementación del estándar en la plataforma.
 *
 * - `IMPLEMENTED` → existe módulo funcional en la plataforma.
 * - `PARTIAL`     → existe parcialmente (p. ej. solo evaluación PHVA) o
 *                   depende de fases futuras.
 * - `PLANNED`     → estándar normativo sin implementación aún.
 */
export type ImplementationStatus = 'IMPLEMENTED' | 'PARTIAL' | 'PLANNED';

/** Metadatos de prioridad estáticos (config, sin lógica). */
export interface StandardPriorityMetadata {
  /** Criticidad normativa del estándar (Resolución 0312). */
  criticality: 'ALTA' | 'MEDIA' | 'BAJA';
  /** Esfuerzo estimado de implementación. */
  estimatedEffort: 'BAJO' | 'MEDIO' | 'ALTO';
}

/**
 * Sección del PHVA a la que pertenece el estándar dentro de su página de
 * evaluación (PlanPage, DoPage, CheckPage, ActPage). FASE 7.1 — preparación.
 */
export interface StandardSection {
  /** Identificador de la sección (sectionId de las páginas PHVA). */
  id: string;
  /** Título de la sección tal como se muestra en el PHVA. */
  title: string;
  /** Porcentaje de la sección dentro del peso total del PHVA. */
  percentage: number;
}

/**
 * Definición canónica de un estándar mínimo del SG-SST.
 *
 * Es la ÚNICA fuente de verdad del catálogo normativo. La plataforma expone
 * 50 códigos verificados (PHVA + Evaluación Inicial) y el catálogo completo de
 * 60 estándares incluye los ítems del anexo de la Resolución 0312 aún sin
 * módulo en el sistema (moduleRoute vacío y `implementationStatus: 'PLANNED'`).
 *
 * Pesos: `normativeWeight` es el peso normativo original (la escala PHVA de
 * la plataforma suma 100 para los 50 códigos implementados). `effectiveWeight`
 * NO vive en este modelo: se calcula automáticamente (ver
 * `utils/effective-weights.ts`) solo para estándares IMPLEMENTED/PARTIAL y se
 * normaliza para sumar exactamente 100.
 */
export interface StandardDefinition {
  /** Código canónico del estándar (p. ej. '1.1.1', '2.3.1'). */
  code: string;
  /** Título legible del estándar. */
  title: string;
  /** Descripción del estándar (criterio de cumplimiento). */
  description: string;
  /** Capítulo normativo (Recursos, Gestión integral, etc.). */
  chapter: string;
  /** Fase del ciclo PHVA. */
  phva: PhvaPhase;
  /** Peso normativo original del estándar (0-100, escala PHVA de la plataforma). */
  normativeWeight: number;
  /** Niveles de empresa a los que aplica el estándar. */
  applicableLevels: StandardLevel[];
  /** Ruta frontend del módulo que lo gestiona ('' si aún no existe). */
  moduleRoute: string;
  /** Estado de implementación en la plataforma. */
  implementationStatus: ImplementationStatus;
  /** Provider del ImplementationValidator que lo valida (si existe). */
  validationProvider?: string;
  /** Metadatos de prioridad estáticos (opcional). */
  priorityMetadata?: StandardPriorityMetadata;
  /**
   * Criterio de cumplimiento del estándar (texto PHVA existente, opcional).
   * Solo se puebla en estándares con contenido (pilotos FASE 7.1); el resto
   * permanece sin criteria.
   */
  criteria?: string;
  /**
   * Modo de revisión / verificación del estándar (texto PHVA existente,
   * opcional). Solo se puebla en estándares con contenido (pilotos FASE 7.1).
   */
  modeReview?: string;
  /** Sección del PHVA a la que pertenece el estándar (opcional). */
  section?: StandardSection;
}
