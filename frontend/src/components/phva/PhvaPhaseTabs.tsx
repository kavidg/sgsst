import { NavLink, useLocation } from 'react-router-dom';

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
};

export function PhvaPhaseTabs({ complianceByPhase }: PhvaPhaseTabsProps = {}) {
  const location = useLocation();

  return (
    <nav className="phva-tabs" aria-label="Gestión PHVA — fases del ciclo">
      <p className="phva-tabs__title">Gestión PHVA</p>
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
