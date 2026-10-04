import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarLink } from './sidebarConfig';
import { MenuSearchMatch, searchSidebarLinks } from './menuSearch';

// E1 — Buscador Sidebar: command palette 100% frontend. Recibe las opciones YA
// filtradas por rol (paridad Sidebar); no conoce reglas de negocio SG-SST, no
// consume API ni backend. Sin dependencias nuevas (patrón combobox/listbox ARIA
// implementado a mano, igual que el resto de la UI propia del proyecto).

type MenuSearchCommandPaletteProps = {
  open: boolean;
  links: SidebarLink[];
  onClose: () => void;
  // Cerrar el Sidebar móvil al navegar (mismo comportamiento que los NavLink
  // del menú). Opcional para reutilizar el palette fuera del Sidebar.
  onNavigate?: () => void;
};

const NO_RESULTS_MESSAGE = 'No encontramos opciones del menú';
const HELP_MESSAGE = 'Busca una opción del menú';
const SHORTCUT_HINT = '⌘K / Ctrl K';

export function MenuSearchCommandPalette({ open, links, onClose, onNavigate }: MenuSearchCommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches: MenuSearchMatch[] = useMemo(() => searchSidebarLinks(links, query), [links, query]);

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

  // Mantener el resultado activo visible mientras se navega con flechas.
  useEffect(() => {
    const activeElement = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) {
    return null;
  }

  const goToResult = (match: MenuSearchMatch) => {
    onClose();
    // En móvil, cerrar también el overlay del Sidebar (paridad con NavLink).
    onNavigate?.();
    // Se conserva el `to` exacto (incluye query params como ?standard=3.1.7).
    navigate(match.link.to);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (matches.length > 0) {
        setActiveIndex((current) => (current + 1) % matches.length);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (matches.length > 0) {
        setActiveIndex((current) => (current - 1 + matches.length) % matches.length);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const match = matches[activeIndex];
      if (match) {
        goToResult(match);
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
    <div className="menu-search-overlay" onClick={onClose}>
      <div
        className="menu-search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en el menú"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="menu-search-input-row">
          <span className="menu-search-input-icon" aria-hidden>🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="menu-search-input"
            placeholder={HELP_MESSAGE}
            aria-label="Buscar en el menú"
            // E7 — aria-controls SOLO cuando la listbox existe (corrige el
            // hallazgo de E2: no referenciar un id inexistente sin resultados).
            aria-controls={matches.length > 0 ? 'menu-search-results' : undefined}
            aria-expanded={matches.length > 0}
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
          matches.length > 0 ? (
            <ul
              id="menu-search-results"
              ref={listRef}
              className="menu-search-results"
              role="listbox"
              aria-label="Resultados del menú"
            >
              {matches.map((match, index) => (
                <li
                  key={match.link.to}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`menu-search-result ${index === activeIndex ? 'active' : ''}`.trim()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => goToResult(match)}
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
            </ul>
          ) : (
            <p className="menu-search-empty" role="status">{NO_RESULTS_MESSAGE}</p>
          )
        ) : (
          <p className="menu-search-empty" role="status">{HELP_MESSAGE}</p>
        )}
      </div>
    </div>
  );
}
