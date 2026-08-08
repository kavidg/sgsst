/**
 * Servicio del PHVA Catalog (FASE 7.2 — conexión frontend con StandardCatalog).
 *
 * Infraestructura únicamente: las páginas PHVA (PlanPage/DoPage/CheckPage/
 * ActPage) siguen usando sus arrays legacy. Este servicio queda listo para que
 * el PHVA dinámico lo consuma en una fase posterior.
 *
 * NO inventa datos: proyecta cada StandardCatalogItem (ya normalizado por el
 * mapper interno de api.ts, que garantiza `normativeWeight`) a la forma que el
 * PHVA dinámico necesita.
 */
import { fetchStandardCatalog } from '../api';
import type { StandardCatalogItem, StandardSection } from '../models/standard-catalog';

/** Ítem del catálogo PHVA (proyección normalizada para el PHVA dinámico). */
export interface PhvaCatalogItem {
  /** Código canónico del estándar (p. ej. '1.1.1'). */
  code: string;
  /** Título legible del estándar. */
  title: string;
  /** Criterio de cumplimiento del estándar (opcional, solo si existe). */
  criteria?: string;
  /** Modo de revisión / verificación (opcional, solo si existe). */
  modeReview?: string;
  /** Sección del PHVA a la que pertenece (opcional, solo si existe). */
  section?: StandardSection;
  /** Peso normativo del estándar (siempre presente en el frontend). */
  normativeWeight: number;
  /** Ruta frontend del módulo que lo gestiona. */
  moduleRoute?: string;
  /** Estado de implementación en la plataforma (opcional). */
  implementationStatus?: string;
  /** Fase del ciclo PHVA (PLANEAR, HACER, VERIFICAR, ACTUAR). */
  phva: string;
}

/**
 * Obtiene el catálogo PHVA del nivel de empresa solicitado.
 *
 * Convierte cada estándar del backend en la forma del PHVA dinámico.
 */
export async function fetchPhvaCatalog(level: string, token: string): Promise<PhvaCatalogItem[]> {
  const response = await fetchStandardCatalog(level, token);

  return response.standards.map((standard: StandardCatalogItem) => ({
    code: standard.code,
    title: standard.title,
    criteria: standard.criteria,
    modeReview: standard.modeReview,
    section: standard.section,
    normativeWeight: standard.normativeWeight,
    moduleRoute: standard.moduleRoute,
    implementationStatus: standard.implementationStatus,
    phva: standard.phva,
  }));
}
