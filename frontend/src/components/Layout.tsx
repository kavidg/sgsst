import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: 240, padding: '1.5rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
