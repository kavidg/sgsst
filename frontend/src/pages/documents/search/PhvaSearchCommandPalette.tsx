/**
 * E5 — Componente visual del buscador PHVA (command palette).
 *
 * Reutilizable y DESACOPLADO: no consume usePhvaCatalog, CompanyContext,
 * Firebase, API, Sidebar ni App.tsx. Recibe por props TODO lo necesario:
 *   - `entries`: índice YA construido y YA filtrado por rol
 *     (`buildPhvaSearchIndex(...)` del padre — el componente no conoce roles).
 *   - `onNavigate(entry)`: el padre decide cómo navegar (rutas simples, query
 *     params, `state`, /advanced-management/:code). El componente NO conoce
 *     rutas y NUNCA reconstruye destinos.
 *
 * Búsqueda: delega 100% en `searchPhvaEntries()` (ranking determinista de E4);
 * no duplica lógica de ranking, sin fuzzy search y sin dependencias nuevas.
 *
 * Integración (E6): este componente NO se monta todavía en Plan/Do/Check/Act,
 * NO toca el Sidebar/E1 y NO modifica Ctrl/Cmd+K.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhvaSearchEntry, PhvaSearchPhase } from './phvaSearchConfig';
import { searchPhvaEntries } from './phvaSearch';
import './phvaSearch.css';

/** Fase preferida al abrir (la fase de la página desde la que se abre). */
export type PhvaSearchCurrentPhase = PhvaSearchPhase;

/** Valor del filtro de fase: 'Todas' o una fase concreta. */
type PhaseFilter = 'ALL' | PhvaSearchPhase;

export interface PhvaSearchCommandPaletteProps {
  /** Controlado por el padre (E6 lo conectará a su estado/botón). */
  open: boolean;
  /** Índice PHVA ya construido y ya filtrado por rol (responsabilidad del padre). */
  entries: PhvaSearchEntry[];
  /** Fase desde la que se abre: filtro inicial y prioridad en estado inicial. */
  currentPhase?: PhvaSearchCurrentPhase;
  onClose: () => void;
  /** Solo se invoca con entradas `navigable === true`; pasa la entrada completa. */
  onNavigate: (entry: PhvaSearchEntry) => void;
}

const PLACEHOLDER = 'Buscar en PHVA...';
const NO_RESULTS_TITLE = 'No encontramos resultados';
const NO_RESULTS_HINT = 'Prueba con otro código, estándar o palabra clave.';

/** Etiquetas legibles de fase (los valores siguen siendo los exactos §17). */
const PHASE_FILTERS: ReadonlyArray<{ value: PhaseFilter; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PLANEAR', label: 'Planear' },
  { value: 'HACER', label: 'Hacer' },
  { value: 'VERIFICAR', label: 'Verificar' },
  { value: 'ACTUAR', label: 'Actuar' },
];

const PHASE_LABELS: Record<PhvaSearchPhase, string> = {
  PLANEAR: 'Planear',
  HACER: 'Hacer',
  VERIFICAR: 'Verificar',
  ACTUAR: 'Actuar',
};

/** Estados de implementación EXACTOS del catálogo (no se inventan estados). */
const STATUS_LABELS: Record<NonNullable<PhvaSearchEntry['implementationStatus']>, string> = {
  IMPLEMENTED: 'Implementado',
  PARTIAL: 'Parcial',
  PLANNED: 'Planeado',
};

const RESULTS_ID = 'phva-search-results';

export function PhvaSearchCommandPalette({
  open,
  entries,
  currentPhase,
  onClose,
  onNavigate,
}: PhvaSearchCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('ALL');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Estado inicial al abrir: query limpia, fase actual como filtro (si existe),
  // primer resultado activo e input enfocado.
  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setPhaseFilter(currentPhase ?? 'ALL');
    setActiveIndex(0);
    // El palette se monta con open=true (render condicional): el input ya existe.
    inputRef.current?.focus();
  }, [open, currentPhase]);

  // Escape como respaldo del keydown del input (cubre foco fuera del input).
  // Listener limitado al componente mientras está abierto; se limpia al cerrar.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  // Estado inicial con query vacía: resultados "útiles" del catálogo respetando
  // el filtro de fase; si existe fase actual y el filtro es Todas, se prioriza
  // esa fase SIN alterar el orden del catálogo dentro de cada grupo (§5).
  const initialEntries = useMemo(() => {
    const pool = phaseFilter === 'ALL' ? entries : entries.filter((entry) => entry.phase === phaseFilter);
    if (!currentPhase || phaseFilter !== 'ALL') {
      return pool;
    }
    return [
      ...pool.filter((entry) => entry.phase === currentPhase),
      ...pool.filter((entry) => entry.phase !== currentPhase),
    ];
  }, [entries, phaseFilter, currentPhase]);

  // Con query: ranking EXACTO de searchPhvaEntries (fuente de verdad de E4).
  const visibleEntries: PhvaSearchEntry[] = useMemo(() => {
    if (!query.trim()) {
      return initialEntries;
    }
    return searchPhvaEntries(entries, query, {
      phase: phaseFilter === 'ALL' ? undefined : phaseFilter,
    }).map((match) => match.entry);
  }, [query, entries, phaseFilter, initialEntries]);

  // Mantener el índice activo dentro de rango cuando la lista cambia.
  useEffect(() => {
    setActiveIndex((current) => (current < visibleEntries.length ? current : 0));
  }, [visibleEntries]);

  // Mantener visible el resultado activo al navegar con flechas.
  useEffect(() => {
    const activeElement = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) {
    return null;
  }

  const hasResults = visibleEntries.length > 0;

  const selectEntry = (entry: PhvaSearchEntry) => {
    if (!entry.navigable) {
      // No navegable (p. ej. PLANNED o panel interno): NO intentar navegar ni
      // inventar destinos. La fila lo indica visiblemente (§12).
      return;
    }
    // El padre decide cómo navegar con la entrada completa (ruta, query y state).
    onNavigate(entry);
    onClose();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (visibleEntries.length > 0) {
        setActiveIndex((current) => (current + 1) % visibleEntries.length);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (visibleEntries.length > 0) {
        setActiveIndex((current) => (current - 1 + visibleEntries.length) % visibleEntries.length);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const entry = visibleEntries[activeIndex];
      if (entry) {
        selectEntry(entry);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="phva-search-overlay" onClick={onClose}>
      <div
        className="phva-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en el PHVA"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="phva-search-header">
          <span className="phva-search-header-icon" aria-hidden>🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="phva-search-input"
            placeholder={PLACEHOLDER}
            aria-label="Buscar en el PHVA"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={RESULTS_ID}
            // La lista es visible siempre que el palette está abierto: el
            // contenedor referenciado por aria-controls existe SIEMPRE (corrige
            // el hallazgo de E2 sobre aria-controls a elementos inexistentes).
            aria-expanded
            aria-activedescendant={hasResults ? `phva-search-option-${activeIndex}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
          />
          <kbd className="phva-search-kbd" aria-hidden>Esc</kbd>
          <button
            type="button"
            className="phva-search-close"
            onClick={onClose}
            aria-label="Cerrar buscador"
          >
            ✕
          </button>
        </div>

        <div className="phva-search-filters" role="group" aria-label="Filtrar por fase del PHVA">
          {PHASE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`phva-search-filter ${phaseFilter === filter.value ? 'active' : ''}`.trim()}
              aria-pressed={phaseFilter === filter.value}
              onClick={() => {
                setPhaseFilter(filter.value);
                setActiveIndex(0);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* E7 — Región live con el conteo de resultados (screen readers): mínima,
            visualmente oculta; el estado vacío ya anuncia con role=status. */}
        <p className="phva-search-sr-only" role="status" aria-live="polite">
          {query.trim() ? `${visibleEntries.length} resultado${visibleEntries.length === 1 ? '' : 's'}` : ''}
        </p>

        {/* Contenedor SIEMPRE presente cuando el palette está abierto (id estable
            para aria-controls). Dentro: listbox con resultados o estado vacío. */}
        <div id={RESULTS_ID} ref={listRef} className="phva-search-results">
          {hasResults ? (
            <ul className="phva-search-results-list" role="listbox" aria-label="Resultados del PHVA">
              {visibleEntries.map((entry, index) => (
                <li
                  key={`${entry.code}-${entry.catalogIndex}`}
                  id={`phva-search-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={!entry.navigable}
                  data-navigable={entry.navigable ? 'true' : 'false'}
                  className={`phva-search-result ${index === activeIndex ? 'phva-search-result-active' : ''}`.trim()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectEntry(entry)}
                >
                  <span className="phva-search-result-code">{entry.code}</span>
                  <span className="phva-search-result-main">
                    <span className="phva-search-result-title">{entry.title}</span>
                    <span className="phva-search-result-meta">
                      {[entry.section?.title, entry.chapter].filter(Boolean).join(' · ') || '—'}
                    </span>
                    {entry.criteria ? (
                      <span className="phva-search-result-criteria">{entry.criteria}</span>
                    ) : null}
                  </span>
                  <span className="phva-search-result-badges">
                    <span className="phva-search-result-phase">{PHASE_LABELS[entry.phase]}</span>
                    {entry.implementationStatus ? (
                      <span className={`phva-search-result-status ${entry.implementationStatus}`.trim()}>
                        {STATUS_LABELS[entry.implementationStatus]}
                      </span>
                    ) : null}
                    {!entry.navigable ? (
                      <span className="phva-search-result-status NAV">Sin módulo disponible</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="phva-search-empty" role="status">
              <p className="phva-search-empty-title">{NO_RESULTS_TITLE}</p>
              <p className="phva-search-empty-hint">{NO_RESULTS_HINT}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
