import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { MyCompanyModel, UserRole } from '../api';
import { CompanySelector } from '../CompanySelector';
import { Sidebar } from './Sidebar';
import { Button } from './ui/Button';
import { Icons } from './Icons';

type LayoutProps = {
  role?: UserRole;
  companies: MyCompanyModel[];
  activeCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
  loading: boolean;
};

export function Layout({ role, companies, activeCompanyId, onSelectCompany, onRefresh, onLogout, loading }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const showCompanySelector = role === 'owner';

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
            <div className="actions" style={{ alignItems: 'center' }}>
              {showCompanySelector ? (
                <CompanySelector companies={companies} activeCompanyId={activeCompanyId} onSelectCompany={onSelectCompany} />
              ) : null}
              <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>Recargar</Button>
              <Button type="button" variant="danger" onClick={onLogout}>Cerrar sesión</Button>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
