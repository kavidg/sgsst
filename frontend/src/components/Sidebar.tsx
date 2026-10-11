import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { UserRole } from '../api';
import { Icons } from './Icons';
import {
  DocumentsSubmenuLink,
  RAW_DOCUMENTS_SUBMENU,
  SidebarLink,
  filterSidebarLinks,
  getSearchableSidebarLinks,
} from './sidebar/sidebarConfig';
import { MenuSearchCommandPalette } from './sidebar/MenuSearchCommandPalette';
import { PhvaGlobalSearchEntries } from './sidebar/PhvaGlobalSearchEntries';
import { OpenGlobalSearchEventDetail, OPEN_GLOBAL_SEARCH_EVENT } from '../pages/documents/search/phvaSearchConfig';

type SidebarProps = {
  role?: UserRole;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function Sidebar({ role, mobileOpen, onCloseMobile, collapsed, onToggleCollapsed }: SidebarProps) {
  // E1 — La configuración del menú y el filtro de roles viven ahora en
  // components/sidebar/sidebarConfig.ts (fuente única compartida con el
  // buscador). Mismo comportamiento: manager solo ve Panel; el resto pasa por
  // la cadena if-else por `to` exacto (incluye query strings).
  const visibleLinks: SidebarLink[] = filterSidebarLinks(role);
  const location = useLocation();
  const [openDocuments, setOpenDocuments] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // E7 — Elemento que solicitó abrir el buscador global (p. ej. el trigger
  // "Buscar en PHVA" de una página). Al cerrar, el foco vuelve a él si aún
  // existe en el documento; si no, al botón de búsqueda del Sidebar.
  const [globalSearchOpener, setGlobalSearchOpener] = useState<HTMLElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (location.pathname.startsWith('/documents')) {
      setOpenDocuments(true);
    }
  }, [location.pathname]);

  // E7 — Atajo global Ctrl/Cmd + K: abre/cierra el BUSCADADOR GLOBAL (única
  // paleta, grupos MENÚ + PHVA) desde CUALQUIER página autenticada, incluida
  // /documents/* (antes el atajo lo cedía al buscador PHVA local; hoy la
  // paleta global ya incluye PHVA, así que no hay segundo atajo ni segunda
  // paleta). Un solo listener; se limpia al desmontar.
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        // E7 — cerrar vía atajo devuelve el foco al opener (o al trigger del
        // Sidebar), mismo comportamiento que cerrar con Escape/click.
        if (searchOpen) {
          handleSearchClose();
        } else {
          setGlobalSearchOpener(null);
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [searchOpen, globalSearchOpener]);

  // E7 — Los triggers de las páginas PHVA ("Buscar en PHVA") solicitan la
  // apertura del buscador global vía evento DOM (no conocen este componente).
  // Se recuerda el elemento solicitante para devolverle el foco al cerrar.
  useEffect(() => {
    const handleOpenGlobalSearch = (event: Event) => {
      const detail = (event as CustomEvent<OpenGlobalSearchEventDetail>).detail;
      setGlobalSearchOpener(
        detail?.returnFocusTo instanceof HTMLElement ? detail.returnFocusTo : null,
      );
      setSearchOpen(true);
    };
    window.addEventListener(OPEN_GLOBAL_SEARCH_EVENT, handleOpenGlobalSearch);
    return () => window.removeEventListener(OPEN_GLOBAL_SEARCH_EVENT, handleOpenGlobalSearch);
  }, []);

  const handleSearchClose = () => {
    setSearchOpen(false);
    // Devolver el foco: primero al elemento que abrió (si sigue montado);
    // si no, al botón de búsqueda del Sidebar (comportamiento E1/E7).
    const opener = globalSearchOpener;
    setGlobalSearchOpener(null);
    if (opener && opener.isConnected) {
      opener.focus();
      return;
    }
    searchButtonRef.current?.focus();
  };

  return (
    <>
      {mobileOpen ? <button className="sidebar-backdrop" onClick={onCloseMobile} aria-label="Close menu" /> : null}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`.trim()}>
        <div className="sidebar-header">
          {!collapsed ? <h2 style={{ margin: 0, fontSize: '1rem' }}>SG-SST</h2> : <span aria-hidden />}
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className={`sidebar-collapse-icon ${collapsed ? 'collapsed' : ''}`.trim()}><Icons.chevronDown /></span>
          </button>
        </div>
        <nav>
          {/* E1/E7 — Trigger del BUSCADOR GLOBAL: misma ubicación y estilo del
              botón del menú; en colapsado queda como icono con tooltip. Abre
              la única paleta (grupos MENÚ + PHVA). */}
          <button
            type="button"
            ref={searchButtonRef}
            className="nav-link menu-search-trigger"
            onClick={() => {
              setGlobalSearchOpener(null);
              setSearchOpen(true);
            }}
            aria-label="Buscar en el menú y en el PHVA"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            data-tooltip={collapsed ? 'Buscar' : undefined}
          >
            <Icons.search />
            {!collapsed ? <span>Buscar</span> : null}
          </button>

          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onCloseMobile}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`.trim()}
              data-tooltip={collapsed ? link.label : undefined}
              aria-label={collapsed ? link.label : undefined}
            >
              <link.icon />
              {!collapsed ? <span>{link.label}</span> : null}
            </NavLink>
          ))}

          <div className="documents-menu-group">
              <div className={`documents-parent-row ${location.pathname.startsWith('/documents') ? 'active' : ''}`.trim()}>
                {/* AJUSTE VISUAL/NAVEGACIÓN — PHVA es solo acordeón: no navega a /documents */}
                <button
                  type="button"
                  onClick={() => {
                    if (collapsed) {
                      onToggleCollapsed();
                    }
                    setOpenDocuments((open) => !open);
                  }}
                  className="nav-link documents-parent"
                  aria-expanded={openDocuments}
                  data-tooltip={collapsed ? 'PHVA' : undefined}
                  aria-label={collapsed ? 'PHVA' : undefined}
                >
                  <Icons.file />
                  {!collapsed ? (
                    <>
                      <span>PHVA</span>
                      <span className={`documents-chevron ${openDocuments ? 'open' : ''}`.trim()}><Icons.chevronDown /></span>
                    </>
                  ) : null}
                </button>
              </div>

              <div className={`documents-submenu ${openDocuments ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`.trim()}>
                {RAW_DOCUMENTS_SUBMENU.map((submenuLink: DocumentsSubmenuLink) => (
                  <NavLink
                    key={submenuLink.to}
                    to={submenuLink.to}
                    onClick={onCloseMobile}
                    className={({ isActive }) => `documents-submenu-link ${isActive ? 'active' : ''}`.trim()}
                  >
                    {submenuLink.label}
                  </NavLink>
                ))}
              </div>

            </div>
        </nav>
      </aside>
      {/* E7 — ÚNICA command palette global. Recibe las opciones de MENÚ YA
          filtradas por rol (paridad con el Sidebar) y, para roles ≠ member,
          el índice PHVA YA filtrado por rol (PhvaGlobalSearchEntries →
          usePhvaCatalog + buildPhvaSearchIndex; member conserva su
          comportamiento actual y ni siquiera descarga el catálogo). */}
      {role === 'member' ? (
        <MenuSearchCommandPalette
          open={searchOpen}
          links={getSearchableSidebarLinks(role)}
          onClose={handleSearchClose}
          onNavigate={onCloseMobile}
        />
      ) : (
        <PhvaGlobalSearchEntries role={role ?? 'owner'}>
          {({ phvaEntries, phvaLoading }) => (
            <MenuSearchCommandPalette
              open={searchOpen}
              links={getSearchableSidebarLinks(role)}
              phvaEntries={phvaEntries}
              phvaLoading={phvaLoading}
              onClose={handleSearchClose}
              onNavigate={onCloseMobile}
            />
          )}
        </PhvaGlobalSearchEntries>
      )}
    </>
  );
}
