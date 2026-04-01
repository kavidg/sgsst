import { NavLink } from 'react-router-dom';
import { UserRole } from '../api';
import { Icons } from './Icons';

type SidebarLink = {
  to: string;
  label: string;
  icon: () => JSX.Element;
};

const links: SidebarLink[] = [
  { to: '/dashboard', label: 'Panel', icon: Icons.dashboard },
  { to: '/companies', label: 'Empresas', icon: Icons.companies },
  { to: '/users', label: 'Usuarios', icon: Icons.users },
  { to: '/employees', label: 'Empleados', icon: Icons.users },
  { to: '/evaluations', label: 'Evaluaciones', icon: Icons.chart },
  { to: '/incidents', label: 'Incidentes', icon: Icons.alert },
  { to: '/risks', label: 'Riesgos', icon: Icons.shield },
  { to: '/documents', label: 'Documentos', icon: Icons.file },
  { to: '/trainings', label: 'Capacitaciones', icon: Icons.chart },
];

const managerLinks = [{ to: '/dashboard', label: 'Panel', icon: Icons.dashboard }];

type SidebarProps = {
  role?: UserRole;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function Sidebar({ role, mobileOpen, onCloseMobile }: SidebarProps) {
  const visibleLinks = role === 'manager' ? managerLinks : links;

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
        </nav>
      </aside>
    </>
  );
}
