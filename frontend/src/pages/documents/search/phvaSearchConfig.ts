/**
 * E4 — Preparación y normalización del buscador PHVA.
 *
 * Capa PURA entre la fuente de verdad del catálogo (`usePhvaCatalog()`) y el
 * buscador visual (componente en E5/E6, todavía NO implementado). Este módulo:
 *   - normaliza cada estándar del catálogo a `PhvaSearchEntry`;
 *   - resuelve el DESTINO REAL de navegación mediante una tabla central
 *     derivada de los dispatchers reales de PlanPage/DoPage/CheckPage/ActPage
 *     (NO de `StandardCatalog.moduleRoute`, que E3 verificó divergente para
 *     ~15 códigos: p. ej. 2.10.1 → dispatcher '/contracting' vs moduleRoute
 *     '/documents/plan');
 *   - marca navegabilidad (`navigable`) y modo lectura (`readOnly`);
 *   - conserva duplicados normativos (`duplicateOf`) y el índice original
 *     (`catalogIndex`) para desempate determinista.
 *
 * REGLAS (E4):
 *   - NO hace fetch: los datos llegan como argumentos (§20; la integración
 *     debe recibir el catálogo del `usePhvaCatalog()` que ya usa la página).
 *   - NO importa React, CompanyContext ni Firebase.
 *   - NO consume `usePhvaCatalog` (el nivel de la empresa ya viene aplicado
 *     en los ítems recibidos).
 *   - NO implementa UI, botones ni atajos de teclado (E5/E6).
 *   - No filtra estándares silenciosamente: cada entrada representa UN
 *     ESTÁNDAR del nivel activo, incluidos PLANNED y duplicados.
 */

import type { UserRole } from '../../../api';
import type { PhvaCatalogItem } from '../../../services/phva-catalog.service';

/** Fases del ciclo PHVA (mismos valores que el StandardCatalog). */
export type PhvaSearchPhase = 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';

/** Guard interno: el backend garantiza estos valores (`PhvaPhase`). */
const PHVA_PHASES: readonly string[] = ['PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR'];

/** Sección PHVA (misma forma que `StandardSection` del catálogo). */
export interface PhvaSearchSection {
  id: string;
  title: string;
  percentage: number;
}

/**
 * Entrada normalizada del índice de búsqueda PHVA.
 *
 * Cada entrada representa UN ESTÁNDAR. No existen "requisitos" como entidades
 * propias del catálogo (E3): los textos de requisito son `criteria` y
 * `modeReview`, opcionales y presentes solo cuando el estándar los tiene.
 */
export interface PhvaSearchEntry {
  /** Código canónico del estándar (p. ej. '3.1.7'). */
  code: string;
  title: string;
  description: string;
  chapter: string;
  phase: PhvaSearchPhase;
  section?: PhvaSearchSection;
  criteria?: string;
  modeReview?: string;
  implementationStatus?: 'IMPLEMENTED' | 'PARTIAL' | 'PLANNED';
  /** Destino real verificado ('' si el estándar no tiene destino seguro). */
  standardRoute: string;
  /** React Router `state` EXACTO al que navega la tarjeta PHVA actual. */
  navigationState?: { source: string };
  /** true SOLO si existe destino real verificado (nunca ruta inventada). */
  navigable: boolean;
  /** true cuando el rol es manager (consulta el PHVA en solo lectura). */
  readOnly: boolean;
  /** Código del estándar canónico cuando el catálogo lo clasifica DUPLICATE. */
  duplicateOf?: string;
  /** Desempate determinista: posición del estándar en el catálogo recibido. */
  catalogIndex: number;
}

/**
 * Destino de navegación de un estándar: ruta + `state` EXACTOS a los que
 * navegan las tarjetas PHVA actuales. Un resultado del buscador debe ser
 * funcionalmente equivalente a hacer clic en la tarjeta correspondiente (E4 §8).
 */
export interface PhvaDestination {
  route: string;
  state?: { source: string };
}

/**
 * TABLA CENTRAL DE DESTINOS PHVA (E4 §4/§5).
 *
 * Derivada 1:1 de los dispatchers REALES:
 *   - PlanPage.onOpenAdvancedManagement (códigos de gestión integral);
 *   - DoPage.onOpenAdvancedManagement (3.1.x–5.1.x);
 *   - CheckPage: botones fijos por código (6.1.x);
 *   - ActPage: botones fijos por código (7.1.x).
 *
 * Cada ruta fue verificada contra `<Route path>` en App.tsx y cada `state`
 * contra el `navigate(..., { state: { source: 'phva-<code>' } })` real.
 * No se incluyó ningún destino no verificado.
 */
export const PHVA_STANDARD_DESTINATIONS: Readonly<Record<string, PhvaDestination>> = {
  // ── PlanPage — dispatcher (sección plan-gestion-integral) ──
  '2.5.1': { route: '/document-management', state: { source: 'phva-2.5.1' } },
  '2.6.1': { route: '/accountability', state: { source: 'phva-2.6.1' } },
  '2.7.1': { route: '/legal-matrix', state: { source: 'phva-2.7.1' } },
  '2.8.1': { route: '/communication', state: { source: 'phva-2.8.1' } },
  '2.9.1': { route: '/acquisitions', state: { source: 'phva-2.9.1' } },
  '2.10.1': { route: '/contracting', state: { source: 'phva-2.10.1' } },
  '2.11.1': { route: '/change-management', state: { source: 'phva-2.11.1' } },
  '3.1.1': { route: '/sociodemographic-management', state: { source: 'phva-3.1.1' } },
  // ── DoPage — dispatcher ──
  '3.1.2': { route: '/health-promotion', state: { source: 'phva-3.1.2' } },
  '3.1.3': { route: '/job-profiles', state: { source: 'phva-3.1.3' } },
  '3.1.4': { route: '/occupational-evaluation-management', state: { source: 'phva-3.1.4' } },
  '3.1.5': { route: '/occupational-medical-record-custody', state: { source: 'phva-3.1.5' } },
  '3.1.6': { route: '/work-restrictions', state: { source: 'phva-3.1.6' } },
  // 3.1.7 comparte módulo con 3.1.2 preseleccionado vía query param
  // (mecanismo de HealthPromotionPage — conservar el parámetro intacto).
  '3.1.7': { route: '/health-promotion?standard=3.1.7', state: { source: 'phva-3.1.7' } },
  '3.1.8': { route: '/workplace-sanitary-conditions', state: { source: 'phva-3.1.8' } },
  '3.1.9': { route: '/waste-management', state: { source: 'phva-3.1.9' } },
  '3.2.1': { route: '/absenteeism', state: { source: 'phva-3.2.1' } },
  '3.2.2': { route: '/disease-investigation-management', state: { source: 'phva-3.2.2' } },
  '3.2.3': { route: '/accident-statistics', state: { source: 'phva-3.2.3' } },
  '3.3.1': { route: '/epidemiological-surveillance', state: { source: 'phva-3.3.1' } },
  '3.3.2': { route: '/health-indicators', state: { source: 'phva-3.3.2' } },
  '3.3.3': { route: '/case-intervention', state: { source: 'phva-3.3.3' } },
  '4.1.1': { route: '/risk-methodology', state: { source: 'phva-4.1.1' } },
  '4.1.2': { route: '/worker-participation', state: { source: 'phva-4.1.2' } },
  '4.1.3': { route: '/hazardous-substances', state: { source: 'phva-4.1.3' } },
  '4.1.4': { route: '/environmental-measurements', state: { source: 'phva-4.1.4' } },
  // 4.2.1/4.2.2/4.2.3 — /risks es la fuente de evidencia (Risk.controlMeasures
  // y ControlVerification), igual patrón que el dispatcher de DoPage.
  '4.2.1': { route: '/risks', state: { source: 'phva-4.2.1' } },
  '4.2.2': { route: '/risks', state: { source: 'phva-4.2.2' } },
  '4.2.3': { route: '/risks', state: { source: 'phva-4.2.3' } },
  '4.2.4': { route: '/inspections', state: { source: 'phva-4.2.4' } },
  '4.2.5': { route: '/maintenance', state: { source: 'phva-4.2.5' } },
  '4.2.6': { route: '/epp', state: { source: 'phva-4.2.6' } },
  '5.1.1': { route: '/emergencies', state: { source: 'phva-5.1.1' } },
  '5.1.2': { route: '/emergencies', state: { source: 'phva-5.1.2' } },
  // ── CheckPage — botones fijos por código (VERIFICAR) ──
  '6.1.1': { route: '/indicators', state: { source: 'phva-6.1.1' } },
  '6.1.2': { route: '/annual-audit', state: { source: 'phva-6.1.2' } },
  '6.1.3': { route: '/management-review-direction', state: { source: 'phva-6.1.3' } },
  '6.1.4': { route: '/copasst-audit-planning', state: { source: 'phva-6.1.4' } },
  // ── ActPage — botones fijos por código (ACTUAR) ──
  '7.1.1': { route: '/corrective-preventive-actions', state: { source: 'phva-7.1.1' } },
  '7.1.2': { route: '/management-improvement-actions', state: { source: 'phva-7.1.2' } },
  '7.1.3': { route: '/incidents', state: { source: 'phva-7.1.3' } },
  '7.1.4': { route: '/improvement-plans', state: { source: 'phva-7.1.4' } },
};

/**
 * Duplicados normativos del catálogo (clasificación DUPLICATE en el maestro
 * catalog-60). El backend NO expone `classification`/`duplicateOf` por API
 * (E3), por lo que se registran aquí los 4 verificados. E4 NO elimina estos
 * estándares del índice: conservan identidad propia y E6 decidirá si navega
 * al canónico, muestra la equivalencia o deshabilita la navegación.
 */
export const PHVA_DUPLICATE_OF: Readonly<Record<string, string>> = {
  '1.1.9': '1.1.3',
  '1.1.10': '1.1.3',
  '4.3.1': '3.2.2',
  '7.2.1': '7.1.4',
};

/**
 * Resuelve el destino REAL de un estándar:
 *
 * 1. Tabla central (dispatchers verificados, con su `state`).
 * 2. `moduleRoute` SOLO cuando es un panel avanzado `/advanced-management/:code`,
 *    único caso donde coincide con la navegación real (PlanPage/DoPage hacen
 *    `navigate(catalogItem.moduleRoute)` sin state).
 * 3. Sin destino verificado → undefined (la entrada queda `navigable: false`;
 *    NO se inventa ruta ni se sustituye por /documents/<fase> — decisión para E6).
 */
export function resolvePhvaDestination(code: string, moduleRoute?: string): PhvaDestination | undefined {
  const fromTable = PHVA_STANDARD_DESTINATIONS[code];
  if (fromTable) {
    return fromTable;
  }
  if (moduleRoute && moduleRoute.startsWith('/advanced-management/')) {
    return { route: moduleRoute };
  }
  return undefined;
}

/**
 * Construye el índice de búsqueda PHVA a partir del catálogo del nivel activo
 * de la empresa (los ítems ya vienen filtrados por `usePhvaCatalog()`).
 *
 * Función PURA: sin fetch, sin React, sin CompanyContext, sin Firebase.
 *
 * Rol — se usa únicamente para derivar:
 *   - `readOnly = role === 'manager'` (manager consulta el PHVA en modo
 *     solo lectura, igual que las páginas: readOnly={profile?.role === 'manager'});
 *   - `member` → devuelve []: el módulo /documents/* no está disponible para
 *     member según el guard real de App.tsx (renderDocumentsRoutePage). No se
 *     inventa autorización; el nivel superior tampoco debería montar el
 *     buscador para member. Owner/admin → lista completa.
 *
 * Conserva TODOS los estándares recibidos (incluidos PLANNED y duplicados)
 * en el orden del catálogo; `catalogIndex` es la posición original.
 */
export function buildPhvaSearchIndex(
  catalogItems: readonly PhvaCatalogItem[],
  role?: UserRole,
): PhvaSearchEntry[] {
  if (role === 'member') {
    return [];
  }
  const readOnly = role === 'manager';

  return catalogItems.map((item, catalogIndex) => {
    const destination = resolvePhvaDestination(item.code, item.moduleRoute);
    const duplicateOf = PHVA_DUPLICATE_OF[item.code];

    return {
      code: item.code,
      title: item.title,
      description: item.description ?? '',
      chapter: item.chapter ?? '',
      // El backend tipa `phva` como la unión PLANEAR|HACER|VERIFICAR|ACTUAR.
      phase: item.phva as PhvaSearchPhase,
      ...(item.section ? { section: { ...item.section } } : {}),
      ...(item.criteria ? { criteria: item.criteria } : {}),
      ...(item.modeReview ? { modeReview: item.modeReview } : {}),
      ...(item.implementationStatus
        ? { implementationStatus: item.implementationStatus as PhvaSearchEntry['implementationStatus'] }
        : {}),
      standardRoute: destination?.route ?? '',
      ...(destination?.state ? { navigationState: destination.state } : {}),
      navigable: Boolean(destination),
      readOnly,
      ...(duplicateOf ? { duplicateOf } : {}),
      catalogIndex,
    } satisfies PhvaSearchEntry;
  });
}

/** Indica si un valor es una fase PHVA válida (comodín para integración E6). */
export function isPhvaPhase(value: string): value is PhvaSearchPhase {
  return PHVA_PHASES.includes(value);
}
