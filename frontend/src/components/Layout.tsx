import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { UserRole } from '../api';
import { Sidebar } from './Sidebar';
import { Button } from './ui/Button';
import { Icons } from './Icons';

type LayoutProps = {
  role?: UserRole;
};

export function Layout({ role }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="layout">
        <Sidebar role={role} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <main className="content">
          <header className="topbar">
            <div className="actions" style={{ alignItems: 'center' }}>
              <Button type="button" variant="ghost" className="mobile-toggle" onClick={() => setMobileOpen(true)}>
                <Icons.menu />
              </Button>
              <strong>Safety Dashboard</strong>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
