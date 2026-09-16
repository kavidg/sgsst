import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  { to: '/job-profiles', label: 'Perfiles de cargo', icon: Icons.user },
  { to: '/health-promotion', label: 'Prom. y prevención', icon: Icons.file },
  // FASE 32: 3.1.7 — Estilos de vida y entornos saludables (mismo módulo con
  // frontera normativa; la clasificación 3.1.7 vive en el backend).
  { to: '/health-promotion?standard=3.1.7', label: 'Estilos de vida', icon: Icons.file },
  { to: '/occupational-medical-record-custody', label: 'Custodia HC', icon: Icons.file },
  // FASE 33: 3.1.6 — Restricciones y recomendaciones médico-laborales (owner/admin).
  { to: '/work-restrictions', label: 'Restricciones méd-lab', icon: Icons.file },
  // FASE 34B: 3.1.8 — Agua potable, servicios sanitarios y disposición de basuras (owner/admin).
  { to: '/workplace-sanitary-conditions', label: 'Condiciones sanitarias', icon: Icons.file },
  // FASE 34C: 3.1.9 — Eliminación adecuada de residuos sólidos, líquidos o gaseosos (owner/admin).
  { to: '/waste-management', label: 'Gestión de residuos', icon: Icons.file },
  // FASE 35B: Casos estadísticos de enfermedad laboral (owner/admin; sin scoring — base 3.3.4/3.3.5).
  { to: '/occupational-disease-statistical-cases', label: 'Enfermedad laboral (casos)', icon: Icons.file },
  { to: '/company-configuration', label: 'Empresa', icon: Icons.building },
  { to: '/implementation-wizard', label: 'Implementación', icon: Icons.chart },
  // LEGACY (FASE 3.4.1): la ruta /evaluations apunta a una página legacy rota
  // (EvaluationsPage usa contratos que ya no existen en el backend). Se oculta
  // temporalmente del menú sin borrar código; la migración posterior decidirá
  // si se elimina o se reconecta al módulo InitialEvaluation.
  // { to: '/evaluations', label: 'Evaluaciones', icon: Icons.chart },
  { to: '/incidents', label: 'Accidentalidad', icon: Icons.alert },
  { to: '/alerts', label: 'Alertas', icon: Icons.bell },
  { to: '/absenteeism', label: 'Ausentismos', icon: Icons.chart },
  { to: '/risks', label: 'Riesgos', icon: Icons.shield },
  { to: '/inspections', label: 'Inspecciones', icon: Icons.shield },
  { to: '/epp', label: 'EPP', icon: Icons.shield },
  { to: '/emergencies', label: 'Emergencias', icon: Icons.alert },
  { to: '/my-communications', label: 'Mis Comunic.', icon: Icons.bell },
  { to: '/intelligence-compliance', label: '🤖 Inteligencia', icon: Icons.chart },
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
    : links.filter((link) => {
      if (link.to === '/companies') return role === 'owner';
      if (link.to === '/job-profiles') return role === 'owner' || role === 'admin';
      if (link.to === '/health-promotion') return role === 'owner' || role === 'admin';
      // FASE 32: 3.1.7 — mismo módulo, alcance estilos de vida (owner/admin).
      if (link.to === '/health-promotion?standard=3.1.7') return role === 'owner' || role === 'admin';
      // FASE 33: 3.1.6 — Restricciones méd-lab (owner/admin).
      if (link.to === '/work-restrictions') return role === 'owner' || role === 'admin';
      // FASE 34B: 3.1.8 — Condiciones sanitarias (owner/admin).
      if (link.to === '/workplace-sanitary-conditions') return role === 'owner' || role === 'admin';
      // FASE 34C: 3.1.9 — Gestión de residuos (owner/admin).
      if (link.to === '/waste-management') return role === 'owner' || role === 'admin';
      // FASE 35B: Casos estadísticos de enfermedad laboral (owner/admin; lectura +manager en página).
      if (link.to === '/occupational-disease-statistical-cases') return role === 'owner' || role === 'admin';
      // 3.1.5 (FASE 30G): visible para owner/admin (gestión); manager accede
      // vía PHVA — Hacer. Igual patrón que health-promotion.
      if (link.to === '/occupational-medical-record-custody') return role === 'owner' || role === 'admin';
      if (link.to === '/my-communications') return role === 'member';
      return true;
    });
  const location = useLocation();
  const navigate = useNavigate();
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
              <div className={`documents-parent-row ${location.pathname.startsWith('/documents') ? 'active' : ''}`.trim()}>
                <button
                  type="button"
                  onClick={() => {
                    if (collapsed) {
                      onToggleCollapsed();
                    }
                    setOpenDocuments(true);
                    onCloseMobile();
                    navigate('/documents');
                  }}
                  className="nav-link documents-parent"
                  data-tooltip={collapsed ? 'Documentos - Autoevaluación' : undefined}
                  aria-label={collapsed ? 'Documentos - Autoevaluación' : undefined}
                >
                  <Icons.file />
                  {!collapsed ? <span>Documentos - Autoevaluación</span> : null}
                </button>
                {!collapsed ? (
                  <button
                    type="button"
                    className="documents-toggle"
                    aria-label={openDocuments ? 'Ocultar PHVA' : 'Mostrar PHVA'}
                    onClick={() => setOpenDocuments((open) => !open)}
                  >
                    <span className={`documents-chevron ${openDocuments ? 'open' : ''}`.trim()}><Icons.chevronDown /></span>
                  </button>
                ) : null}
              </div>

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
