import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { UserRole } from '../api';
import { Icons } from './Icons';

type SidebarLink = {
  to: string;
  label: string;
  icon: () => JSX.Element;
};

type DocumentsSubmenuLink = {
  to: string;
  label: string;
};

const links: SidebarLink[] = [
  { to: '/dashboard', label: 'Panel', icon: Icons.dashboard },
  { to: '/companies', label: 'Empresas', icon: Icons.companies },
  { to: '/users', label: 'Usuarios', icon: Icons.users },
  { to: '/employees', label: 'Empleados', icon: Icons.users },
  { to: '/evaluations', label: 'Evaluaciones', icon: Icons.chart },
  { to: '/incidents', label: 'Incidentes', icon: Icons.alert },
  { to: '/alerts', label: 'Alertas', icon: Icons.bell },
  { to: '/absenteeism', label: 'Ausentismos', icon: Icons.chart },
  { to: '/risks', label: 'Riesgos', icon: Icons.shield },
  { to: '/trainings', label: 'Capacitaciones', icon: Icons.chart },
  { to: '/inspections', label: 'Inspecciones', icon: Icons.shield },
];

const documentsSubmenu: DocumentsSubmenuLink[] = [
  { to: '/documents/plan', label: 'I. Planear (25%)' },
  { to: '/documents/do', label: 'II. Hacer (60%)' },
  { to: '/documents/check', label: 'III. Verificar (5%)' },
  { to: '/documents/act', label: 'IV. Actuar (10%)' },
];

const managerLinks = [{ to: '/dashboard', label: 'Panel', icon: Icons.dashboard }];

type SidebarProps = {
  role?: UserRole;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function Sidebar({ role, mobileOpen, onCloseMobile, collapsed, onToggleCollapsed }: SidebarProps) {
  const visibleLinks = role === 'manager'
    ? managerLinks
    : links.filter((link) => (link.to === '/companies' ? role === 'owner' : true));
  const location = useLocation();
  const [openDocuments, setOpenDocuments] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith('/documents')) {
      setOpenDocuments(true);
    }
  }, [location.pathname]);

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
              <button
                type="button"
                onClick={() => setOpenDocuments((open) => !open)}
                className={`nav-link documents-parent ${location.pathname.startsWith('/documents') ? 'active' : ''}`.trim()}
                data-tooltip={collapsed ? 'Documentos - Autoevaluación' : undefined}
                aria-label={collapsed ? 'Documentos - Autoevaluación' : undefined}
              >
                <Icons.file />
                {!collapsed ? <span>Documentos - Autoevaluación</span> : null}
                {!collapsed ? <span className={`documents-chevron ${openDocuments ? 'open' : ''}`.trim()}><Icons.chevronDown /></span> : null}
              </button>

              <div className={`documents-submenu ${openDocuments ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`.trim()}>
                {documentsSubmenu.map((submenuLink) => (
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
    </>
  );
}
