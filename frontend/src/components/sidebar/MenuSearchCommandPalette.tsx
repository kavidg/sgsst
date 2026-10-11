import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarLink } from './sidebarConfig';
import { MenuSearchMatch, searchSidebarLinks } from './menuSearch';
import {
  PhvaSearchEntry,
  PHVA_PHASE_LABELS,
} from '../../pages/documents/search/phvaSearchConfig';
import { PhvaSearchMatch, searchPhvaEntries } from '../../pages/documents/search/phvaSearch';
import { buildPhvaReturnState } from '../../lib/phvaReturn';
import { Icons } from '../Icons';
import './menuSearchGroups.css';

/**
 * E7 — Buscador GLOBAL (única command palette, 100% frontend).
 *
 * Una sola experiencia de búsqueda para todo el SaaS:
 *   - Grupo MENÚ: opciones del sidebar, scoring EXACTO de `searchSidebarLinks()`
 *     (E1, sin cambios) y navegación por el `to` exacto del link.
 *   - Grupo PHVA: estándares del catálogo activo, scoring EXACTO de
 *     `searchPhvaEntries()` (E4, sin cambios). El índice llega YA construido y
 *     YA filtrado por rol (`buildPhvaSearchIndex` en PhvaGlobalSearchEntries):
 *     member → sin entradas (el Sidebar ni siquiera monta el proveedor).
 *     Navegación SOLO hacia destinos verificados (`entry.standardRoute` +
 *     `navigationState` de PHVA_STANDARD_DESTINATIONS), adjuntando el origen
 *     PHVA (`buildPhvaReturnState`) igual que las páginas E6, para que
 *     "← Volver al PHVA" siga funcionando. No se adjunta scrollY: la paleta
 *     global no representa a una fase concreta.
 *
 * No consume API, ni backend, ni CompanyContext, ni Firebase. Sin dependencias
 * nuevas (combobox/listbox ARIA a mano, igual que el resto de la UI propia).
 */

type MenuSearchCommandPaletteProps = {
  open: boolean;
  links: SidebarLink[];
  /** Índice PHVA YA filtrado por rol (opcional; ausente → paleta solo-MENÚ). */
  phvaEntries?: PhvaSearchEntry[];
  /** true mientras el catálogo PHVA se carga (nota informativa en el grupo). */
  phvaLoading?: boolean;
  onClose: () => void;
  // Cerrar el Sidebar móvil al navegar (mismo comportamiento que los NavLink
  // del menú). Opcional para reutilizar el palette fuera del Sidebar.
  onNavigate?: () => void;
};

const NO_RESULTS_MESSAGE = 'No encontramos resultados en el menú ni en el PHVA';
const HELP_MESSAGE = 'Busca una opción del menú o un estándar del PHVA';
const SHORTCUT_HINT = '⌘K / Ctrl K';
const MENU_GROUP_LABEL = 'MENÚ';
const PHVA_GROUP_LABEL = 'PHVA';
const PHVA_LOADING_NOTE = 'Buscando en PHVA…';
const PHVA_NOT_NAVIGABLE_NOTE = 'Sin módulo disponible';

/** Fila seleccionable plana (teclado): primero MENÚ, luego PHVA. */
type SelectableRow =
  | { kind: 'menu'; match: MenuSearchMatch }
  | { kind: 'phva'; match: PhvaSearchMatch };

export function MenuSearchCommandPalette({
  open,
  links,
  phvaEntries,
  phvaLoading = false,
  onClose,
  onNavigate,
}: MenuSearchCommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Grupo MENÚ: scoring intacto de E1.
  const menuMatches: MenuSearchMatch[] = useMemo(
    () => searchSidebarLinks(links, query),
    [links, query],
  );

  // Grupo PHVA: scoring intacto de E4 sobre el índice ya filtrado por rol.
  const phvaMatches: PhvaSearchMatch[] = useMemo(
    () => searchPhvaEntries(phvaEntries ?? [], query),
    [phvaEntries, query],
  );

  // Filas seleccionables planas (MENÚ primero, PHVA después). Los encabezados
  // de grupo NO son seleccionables (role="presentation", igual que E5).
  const selectableRows: SelectableRow[] = useMemo(
    () => [
      ...menuMatches.map((match): SelectableRow => ({ kind: 'menu', match })),
      ...phvaMatches.map((match): SelectableRow => ({ kind: 'phva', match })),
    ],
    [menuMatches, phvaMatches],
  );

  const totalResults = selectableRows.length;

  // Estado inicial al abrir: input enfocado, query limpia, primer resultado activo.
  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setActiveIndex(0);
    // El modal se monta con open=true (render condicional), así que el input ya existe.
    inputRef.current?.focus();
  }, [open]);

  // Escape cierra (respaldo del keydown del input, cubre foco fuera del input).
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  // Mantener el índice activo dentro de rango cuando cambian los resultados.
  useEffect(() => {
    setActiveIndex((current) => (current < totalResults ? current : 0));
  }, [totalResults]);

  // Mantener el resultado activo visible mientras se navega con flechas.
  useEffect(() => {
    const activeElement = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) {
    return null;
  }

  const goToMenuResult = (match: MenuSearchMatch) => {
    onClose();
    // En móvil, cerrar también el overlay del Sidebar (paridad con NavLink).
    onNavigate?.();
    // Se conserva el `to` exacto (incluye query params como ?standard=3.1.7).
    navigate(match.link.to);
  };

  const goToPhvaResult = (match: PhvaSearchMatch) => {
    // Entradas sin destino verificado: NO navegar NI inventar rutas (E5 §12).
    if (!match.entry.navigable) {
      return;
    }
    onClose();
    onNavigate?.();
    // Navegación EXACTA de E6: destino verificado + origen PHVA adjunto para
    // "← Volver al PHVA". Sin scrollY (la paleta global no es una fase).
    navigate(
      match.entry.standardRoute,
      buildPhvaReturnState(match.entry.phase, match.entry.code, match.entry.navigationState),
    );
  };

  const goToResult = (row: SelectableRow) => {
    if (row.kind === 'menu') {
      goToMenuResult(row.match);
      return;
    }
    goToPhvaResult(row.match);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (totalResults > 0) {
        setActiveIndex((current) => (current + 1) % totalResults);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (totalResults > 0) {
        setActiveIndex((current) => (current - 1 + totalResults) % totalResults);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = selectableRows[activeIndex];
      if (row) {
        goToResult(row);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const phvaDescription = (entry: PhvaSearchEntry): string => {
    const base = [entry.section?.title, entry.chapter].filter(Boolean).join(' · ');
    const suffix = entry.navigable ? '' : ` · ${PHVA_NOT_NAVIGABLE_NOTE}`;
    return `${base || entry.code}${suffix}`;
  };

  const showPhvaLoadingNote = Boolean(phvaLoading) && phvaMatches.length === 0;

  return (
    <div className="menu-search-overlay" onClick={onClose}>
      <div
        className="menu-search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Buscador global"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="menu-search-input-row">
          <span className="menu-search-input-icon" aria-hidden>🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="menu-search-input"
            placeholder={HELP_MESSAGE}
            aria-label="Buscar en el menú y en el PHVA"
            // E7 — aria-controls SOLO cuando la listbox existe (hallazgo E2).
            aria-controls={totalResults > 0 ? 'menu-search-results' : undefined}
            aria-expanded={totalResults > 0}
            role="combobox"
            aria-autocomplete="list"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
          />
          <kbd className="menu-search-kbd">{SHORTCUT_HINT}</kbd>
        </div>

        {query.trim() ? (
          totalResults > 0 ? (
            <ul
              id="menu-search-results"
              ref={listRef}
              className="menu-search-results"
              role="listbox"
              aria-label="Resultados del buscador global"
            >
              {menuMatches.length > 0 ? (
                <>
                  <li role="presentation" className="menu-search-group-header">{MENU_GROUP_LABEL}</li>
                  {menuMatches.map((match, index) => (
                    <li
                      key={match.link.to}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`menu-search-result ${index === activeIndex ? 'active' : ''}`.trim()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => goToMenuResult(match)}
                    >
                      <span className="menu-search-result-icon" aria-hidden><match.link.icon /></span>
                      <span className="menu-search-result-text">
                        <span className="menu-search-result-label">{match.link.label}</span>
                        {match.link.description ? (
                          <span className="menu-search-result-description">{match.link.description}</span>
                        ) : null}
                      </span>
                      {match.link.standardCode ? (
                        <span className="menu-search-result-code">{match.link.standardCode}</span>
                      ) : null}
                    </li>
                  ))}
                </>
              ) : null}

              {phvaMatches.length > 0 ? (
                <>
                  <li role="presentation" className="menu-search-group-header">{PHVA_GROUP_LABEL}</li>
                  {phvaMatches.map((match, phvaIndex) => {
                    const index = menuMatches.length + phvaIndex;
                    const { entry } = match;
                    return (
                      <li
                        key={`phva-${entry.code}-${entry.catalogIndex}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        aria-disabled={!entry.navigable}
                        data-navigable={entry.navigable ? 'true' : 'false'}
                        className={`menu-search-result ${index === activeIndex ? 'active' : ''}`.trim()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => goToPhvaResult(match)}
                      >
                        <span className="menu-search-result-icon" aria-hidden><Icons.file /></span>
                        <span className="menu-search-result-text">
                          <span className="menu-search-result-label">
                            {`${PHVA_PHASE_LABELS[entry.phase]} — ${entry.title}`}
                          </span>
                          <span className="menu-search-result-description">
                            {phvaDescription(entry)}
                          </span>
                        </span>
                        <span className="menu-search-result-code">{entry.code}</span>
                      </li>
                    );
                  })}
                </>
              ) : null}

              {showPhvaLoadingNote ? (
                <li role="presentation" className="menu-search-group-note" aria-live="polite">
                  {PHVA_LOADING_NOTE}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="menu-search-empty" role="status">
              {showPhvaLoadingNote ? PHVA_LOADING_NOTE : NO_RESULTS_MESSAGE}
            </p>
          )
        ) : (
          <p className="menu-search-empty" role="status">{HELP_MESSAGE}</p>
        )}
      </div>
    </div>
  );
}
