import { useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icons } from '../Icons';
import { PhvaSearchCommandPalette } from '../../pages/documents/search/PhvaSearchCommandPalette';
import type { PhvaSearchEntry } from '../../pages/documents/search/phvaSearchConfig';

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
 * E6 — Buscador PHVA: la barra común de las cuatro fases aloja el trigger
 * ("Buscar en PHVA") y monta el command palette de E5. El trigger recibe el
 * `ref` de la página (retorno de foco) y la navegación la decide la página
 * mediante `onNavigateSearchResult`; el componente sigue sin conocer rutas.
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
  /** E6 — Estado de apertura del buscador PHVA (la página lo administra). */
  searchOpen?: boolean;
  /** E6 — Abre el buscador (botón y/o atajo Ctrl/Cmd+K de la página). */
  onOpenSearch?: () => void;
  /** E6 — Ref del trigger para devolver el foco al cerrar el buscador. */
  searchTriggerRef?: React.RefObject<HTMLButtonElement>;
  /** E6 — Entradas del índice E4 (ya filtradas por rol por la página). */
  searchEntries?: PhvaSearchEntry[];
  /** E6 — Fase actual (filtro inicial/preferido del palette). */
  currentPhase?: 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';
  /** E6 — Cierra el buscador (con retorno de foco al trigger). */
  onCloseSearch?: () => void;
  /** E6 — La página decide cómo navegar con la entrada completa de E4. */
  onNavigateSearchResult?: (entry: PhvaSearchEntry) => void;
};

/** Sugerencia de atajo según plataforma (sin hardcodear Mac/Windows). */
function getShortcutHint(): string {
  const platform = typeof navigator !== 'undefined' ? String(navigator.platform) : '';
  return platform.toUpperCase().includes('MAC') ? '⌘K' : 'Ctrl K';
}

export function PhvaPhaseTabs({
  complianceByPhase,
  searchOpen = false,
  onOpenSearch,
  searchTriggerRef,
  searchEntries,
  currentPhase,
  onCloseSearch,
  onNavigateSearchResult,
}: PhvaPhaseTabsProps = {}) {
  const location = useLocation();
  const shortcutHint = useRef(getShortcutHint());
  const searchReady = Boolean(onOpenSearch && onCloseSearch && onNavigateSearchResult && searchEntries);

  return (
    <>
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
              aria-expanded={searchOpen}
              aria-controls="phva-search-results"
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
      {searchReady ? (
        <PhvaSearchCommandPalette
          open={searchOpen}
          entries={searchEntries ?? []}
          currentPhase={currentPhase}
          onClose={onCloseSearch ?? (() => {})}
          onNavigate={onNavigateSearchResult ?? (() => {})}
        />
      ) : null}
    </>
  );
}
