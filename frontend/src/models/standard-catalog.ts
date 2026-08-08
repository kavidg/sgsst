/**
 * Modelos del StandardCatalog (FASE 7.1 — preparación de arquitectura).
 *
 * Esta fase SOLO prepara los tipos: no se consumen todavía desde ninguna
 * pantalla. La FASE 7.2 conectará el StandardCatalog con el PHVA dinámico.
 */

/**
 * Sección del PHVA a la que pertenece un estándar dentro de su página de
 * evaluación (PlanPage, DoPage, CheckPage, ActPage).
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
 * Ítem del catálogo de estándares mínimos del SG-SST
 * (Resolución 0312 de 2019).
 */
export interface StandardCatalogItem {
  /** Código canónico del estándar (p. ej. '1.1.1'). */
  code: string;
  /** Título legible del estándar. */
  title: string;
  /** Descripción / criterio de cumplimiento. */
  description: string;
  /** Capítulo normativo (Recursos, Gestión integral, etc.). */
  chapter: string;
  /** Fase del ciclo PHVA (PLANEAR, HACER, VERIFICAR, ACTUAR). */
  phva: string;
  /** Peso normativo original del estándar. */
  normativeWeight: number;
  /** Niveles de empresa a los que aplica (7, 21, 60). */
  applicableLevels: string[];
  /** Estado de implementación en la plataforma (opcional). */
  implementationStatus?: string;
  /** Ruta frontend del módulo que lo gestiona (opcional). */
  moduleRoute?: string;
  /** Provider del ImplementationValidator que lo valida (opcional). */
  validationProvider?: string;
  /** Criterio de cumplimiento del estándar (opcional, solo si existe). */
  criteria?: string;
  /** Modo de revisión / verificación (opcional, solo si existe). */
  modeReview?: string;
  /** Sección del PHVA a la que pertenece (opcional, solo si existe). */
  section?: StandardSection;
}
