import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/companies', label: 'Empresas' },
  { to: '/users', label: 'Usuarios' },
  { to: '/employees', label: 'Empleados' },
  { to: '/evaluations', label: 'Evaluaciones' },
  { to: '/risks', label: 'Matriz de riesgos' },
  { to: '/documents', label: 'Documentos' },
];

export function Sidebar() {
  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 240,
        background: '#0f172a',
        color: '#f8fafc',
        padding: '1.5rem 1rem',
        borderRight: '1px solid #1e293b',
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.1rem' }}>SG-SST</h2>
      <nav style={{ display: 'grid', gap: '0.5rem' }}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            style={({ isActive }) => ({
              textDecoration: 'none',
              color: '#f8fafc',
              background: isActive ? '#334155' : 'transparent',
              border: isActive ? '1px solid #475569' : '1px solid transparent',
              borderRadius: 8,
              padding: '0.55rem 0.75rem',
              fontSize: '0.95rem',
            })}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
