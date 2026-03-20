import { Outlet } from 'react-router-dom';
import { UserRole } from '../api';
import { Sidebar } from './Sidebar';

type LayoutProps = {
  role?: UserRole;
};

export function Layout({ role }: LayoutProps) {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'sans-serif' }}>
      <Sidebar role={role} />
      <main style={{ marginLeft: 240, padding: '1.5rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
