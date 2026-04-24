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
};

export function Sidebar({ role, mobileOpen, onCloseMobile }: SidebarProps) {
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
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`.trim()}>
        <div className="sidebar-header">
          <h2 style={{ margin: 0, fontSize: '1rem' }}>SG-SST</h2>
        </div>
        <nav>
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onCloseMobile}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`.trim()}
            >
              <link.icon />
              <span>{link.label}</span>
            </NavLink>
          ))}

          <div className="documents-menu-group">
              <button
                type="button"
                onClick={() => setOpenDocuments((open) => !open)}
                className={`nav-link documents-parent ${location.pathname.startsWith('/documents') ? 'active' : ''}`.trim()}
              >
                <Icons.file />
                <span>Documentos - Autoevaluación</span>
                <span className={`documents-chevron ${openDocuments ? 'open' : ''}`.trim()}><Icons.chevronDown /></span>
              </button>

              <div className={`documents-submenu ${openDocuments ? 'open' : ''}`.trim()}>
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
