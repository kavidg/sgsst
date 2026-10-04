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
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (location.pathname.startsWith('/documents')) {
      setOpenDocuments(true);
    }
  }, [location.pathname]);

  // E1 — Atajo global Ctrl/Cmd + K: abre/cierra el buscador desde cualquier
  // página autenticada (el Sidebar está montado en todas vía Layout). Un solo
  // listener global, se limpia al desmontar. No existía ningún atajo previo.
  // E6 — Comportamiento contextual: dentro de /documents/* el atajo lo atiende
  // el buscador PHVA (usePhvaSearchIntegration), de modo que aquí NO se abre
  // el buscador del menú (un solo overlay, sin doble apertura). La dependencia
  // `location.pathname` mantiene el guard sincronizado con la ruta real.
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (location.pathname.startsWith('/documents/')) {
          return;
        }
        event.preventDefault();
        // E7 — cerrar vía atajo devuelve el foco al trigger (mismo comportamiento
        // que cerrar con Escape/click); corrige el hallazgo de foco de E2.
        if (searchOpen) {
          handleSearchClose();
        } else {
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [location.pathname, searchOpen]);

  const handleSearchClose = () => {
    setSearchOpen(false);
    // Devolver el foco al botón que abrió el buscador.
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
          {/* E1 — Buscador del menú: botón coherente con los nav-link; en
              colapsado queda como icono con tooltip/aria-label. No altera el
              botón de colapsar ni el header. */}
          <button
            type="button"
            ref={searchButtonRef}
            className="nav-link menu-search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar en el menú"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            data-tooltip={collapsed ? 'Buscar en el menú' : undefined}
          >
            <Icons.search />
            {!collapsed ? <span>Buscar en el menú</span> : null}
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
      {/* E1 — Command palette del buscador. Recibe las opciones YA filtradas por
          rol (paridad con el Sidebar); no conoce reglas de negocio SG-SST. */}
      <MenuSearchCommandPalette
        open={searchOpen}
        links={getSearchableSidebarLinks(role)}
        onClose={handleSearchClose}
        onNavigate={onCloseMobile}
      />
    </>
  );
}
