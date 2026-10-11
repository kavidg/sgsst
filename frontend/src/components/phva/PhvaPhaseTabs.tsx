import { useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icons } from '../Icons';
import type { PhvaSearchEntry } from '../../pages/documents/search/phvaSearchConfig';
// E7 — La paleta PhvaSearchCommandPalette ya no se renderiza (paleta global
// única en el Sidebar), pero el trigger de esta barra sigue usando las clases
// .phva-search-trigger* que viven en phvaSearch.css. Se importa aquí para que
// los estilos del trigger se carguen aunque el palette no se monte.
import '../../pages/documents/search/phvaSearch.css';

/**
 * FASE 5.2 — Selector visual permanente del ciclo PHVA.
 *
 * Capa de navegación adicional para las cuatro páginas del ciclo:
 * /documents/plan · /documents/do · /documents/check · /documents/act
 *
 * - Detecta la fase activa automáticamente según la ruta actual.
 * - Conserva exactamente las URLs existentes (no crea rutas nuevas).
 * - La metadata de fase (label/descripción/peso) es exclusivamente de
 *   PRESENTACIÓN VISUAL: no es fuente de verdad de ningún cálculo. Los pesos
 *   reales viven en los ítems evaluados (useDocumentsEvaluation) y en el
 *   Compliance Engine del backend; aquí no se recalcula nada.
 * - La información dinámica (cumplimiento/estándares) se recibe por props SOLO
 *   cuando la página la tiene disponible; nunca se inventa ni se calcula aquí.
 *
 * E6 → E7 — Buscador: la barra común de las cuatro fases aloja SOLO el trigger
 * ("Buscar en PHVA"). La paleta es ÚNICA y GLOBAL (Sidebar): este componente
 * ya NO monta PhvaSearchCommandPalette (cero segunda paleta, cero overlay
 * duplicado). Al pulsar el trigger, la página (usePhvaSearchIntegration)
 * solicita la apertura del buscador global, que incluye el grupo PHVA con el
 * mismo índice E4. Por eso el trigger no declara aria-controls ni
 * aria-expanded: el diálogo que abre vive fuera de este componente.
 */

export type PhvaPhaseKey = 'plan' | 'do' | 'check' | 'act';

/** Cumplimiento real ya calculado por useDocumentsEvaluation (opcional). */
export type PhvaPhaseComplianceInfo = {
  /**
   * Porcentaje de cumplimiento de la fase — SOLO cuando un SectionCompliance
   * existente cubre exactamente la fase completa (Check y Act). En fases
   * multi-sección (Plan, Do) no existe un dato de fase y no se calcula.
   */
  percentage?: number;
  /** Cantidad de estándares de la fase (ítems reales registrados por la página). */
  standardsCount: number;
};

type PhvaPhaseTabInfo = {
  key: PhvaPhaseKey;
  label: string;
  description: string;
  route: string;
  /** Peso de la fase — solo presentación visual (los pesos reales están en los ítems). */
  weight: number;
};

export const PHVA_PHASE_TABS: readonly PhvaPhaseTabInfo[] = [
  { key: 'plan', label: 'PLANEAR', description: 'Preparar y definir', route: '/documents/plan', weight: 25 },
  { key: 'do', label: 'HACER', description: 'Ejecutar y controlar', route: '/documents/do', weight: 60 },
  { key: 'check', label: 'VERIFICAR', description: 'Comprobar resultados', route: '/documents/check', weight: 5 },
  { key: 'act', label: 'ACTUAR', description: 'Mejorar y corregir', route: '/documents/act', weight: 10 },
];

type PhvaPhaseTabsProps = {
  /**
   * Cumplimiento/estándares reales por fase, SOLO cuando la página los tiene
   * del contexto actual. Las fases ausentes del mapa se muestran sin datos
   * dinámicos (peso + descripción únicamente). Nunca se inventan valores.
   */
  complianceByPhase?: Partial<Record<PhvaPhaseKey, PhvaPhaseComplianceInfo>>;
  /**
   * E7 — Estado de apertura del buscador PHVA local (ya sin uso: la paleta es
   * única y global). Se conserva en el tipo porque las páginas siguen
   * pasándolo y NO se modifican.
   */
  searchOpen?: boolean;
  /** E7 — Abre el BUSCADOR GLOBAL (la página solicita la apertura vía evento). */
  onOpenSearch?: () => void;
  /** E7 — Ref del trigger para devolver el foco al cerrar el buscador global. */
  searchTriggerRef?: React.RefObject<HTMLButtonElement>;
  /** E6/E7 — Entradas del índice E4 (habilitan el trigger; la paleta global usa su propio índice). */
  searchEntries?: PhvaSearchEntry[];
  /** E7 — Fase actual (ya sin uso en UI: la paleta global no filtra por fase). */
  currentPhase?: 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';
  /** E7 — Cierre del buscador local (ya sin uso: no hay paleta local). */
  onCloseSearch?: () => void;
  /** E7 — Navegación de resultados local (ya sin uso: navega la paleta global). */
  onNavigateSearchResult?: (entry: PhvaSearchEntry) => void;
};

/** Sugerencia de atajo según plataforma (sin hardcodear Mac/Windows). */
function getShortcutHint(): string {
  const platform = typeof navigator !== 'undefined' ? String(navigator.platform) : '';
  return platform.toUpperCase().includes('MAC') ? '⌘K' : 'Ctrl K';
}

export function PhvaPhaseTabs({
  complianceByPhase,
  onOpenSearch,
  searchTriggerRef,
  searchEntries,
}: PhvaPhaseTabsProps = {}) {
  const location = useLocation();
  const shortcutHint = useRef(getShortcutHint());
  const searchReady = Boolean(onOpenSearch && searchTriggerRef && searchEntries);

  return (
    <nav className="phva-tabs" aria-label="Gestión PHVA — fases del ciclo">
      <div className="phva-tabs__title-row">
        <p className="phva-tabs__title">Gestión PHVA</p>
        {searchReady ? (
          <button
            type="button"
            ref={searchTriggerRef}
            className="phva-search-trigger"
            onClick={onOpenSearch}
            aria-label="Buscar en PHVA"
            aria-haspopup="dialog"
          >
            <Icons.search />
            <span className="phva-search-trigger__label">Buscar en PHVA</span>
            <kbd className="phva-search-trigger__kbd">{shortcutHint.current}</kbd>
          </button>
        ) : null}
      </div>
      <ul className="phva-tabs__list">
        {PHVA_PHASE_TABS.map((phase) => {
          const isActive = location.pathname === phase.route;
          const info = complianceByPhase?.[phase.key];
          return (
            <li key={phase.key} role="listitem">
              <NavLink
                to={phase.route}
                className={`phva-tabs__tab ${isActive ? 'phva-tabs__tab--active' : ''}`.trim()}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="phva-tabs__label">{phase.label}</span>
                <span className="phva-tabs__weight">{phase.weight}%</span>
                <span className="phva-tabs__description">{phase.description}</span>
                {info ? (
                  <span className="phva-tabs__dynamic">
                    {info.percentage !== undefined ? (
                      <span className="phva-tabs__compliance">{info.percentage}% cumplimiento</span>
                    ) : null}
                    <span className="phva-tabs__count">
                      {info.standardsCount} {info.standardsCount === 1 ? 'estándar' : 'estándares'}
                    </span>
                  </span>
                ) : null}
                <span className="phva-tabs__indicator" aria-hidden />
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
