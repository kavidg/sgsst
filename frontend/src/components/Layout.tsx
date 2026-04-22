import { Link, Outlet } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { AlertModel, MyCompanyModel, UserRole, fetchAlertsByCompany, markAlertAsRead } from '../api';
import { CompanySelector } from '../CompanySelector';
import { Sidebar } from './Sidebar';
import { Button } from './ui/Button';
import { Icons } from './Icons';

type LayoutProps = {
  token: string;
  role?: UserRole;
  companies: MyCompanyModel[];
  activeCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
  loading: boolean;
};

const MAX_DROPDOWN_ALERTS = 6;

export function Layout({ token, role, companies, activeCompanyId, onSelectCompany, onRefresh, onLogout, loading }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const showCompanySelector = role === 'owner';
  const unreadAlertsCount = useMemo(() => alerts.filter((alert) => !alert.isRead).length, [alerts]);

  const loadAlerts = async () => {
    if (!activeCompanyId || !token) {
      setAlerts([]);
      return;
    }

    setAlertsLoading(true);
    try {
      const data = await fetchAlertsByCompany(token, activeCompanyId);
      setAlerts(data);
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [activeCompanyId, token]);

  const handleMarkAsRead = async (alertId: string) => {
    await markAlertAsRead(token, alertId);
    setAlerts((prev) => prev.map((alert) => (alert._id === alertId ? { ...alert, isRead: true } : alert)));
  };

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
              <div className="alerts-dropdown">
                <Button type="button" variant="ghost" className="alerts-bell-button" onClick={() => setAlertsOpen((open) => !open)}>
                  <Icons.bell />
                  {unreadAlertsCount > 0 ? <span className="alerts-bell-badge">{unreadAlertsCount}</span> : null}
                </Button>
                {alertsOpen ? (
                  <div className="alerts-dropdown-panel">
                    <div className="alerts-dropdown-panel__header">
                      <strong>Alertas</strong>
                      <Link to="/alerts" onClick={() => setAlertsOpen(false)}>Ver todas</Link>
                    </div>
                    <div className="alerts-dropdown-panel__content">
                      {alertsLoading ? <p className="muted">Cargando alertas...</p> : null}
                      {!alertsLoading && !alerts.length ? <p className="muted">Sin alertas registradas.</p> : null}
                      {alerts.slice(0, MAX_DROPDOWN_ALERTS).map((alert) => (
                        <article key={alert._id} className={`alerts-item ${alert.isRead ? 'alerts-item--read' : ''}`.trim()}>
                          <div className="alerts-item__header">
                            <span className={`alerts-severity alerts-severity--${alert.severity.toLowerCase()}`.trim()}>{alert.severity}</span>
                            {!alert.isRead ? <span className="alerts-item__new">Nueva</span> : null}
                          </div>
                          <p className="alerts-item__message">{alert.message}</p>
                          {!alert.isRead ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="alerts-item__action"
                              onClick={() => void handleMarkAsRead(alert._id)}
                            >
                              Marcar leída
                            </Button>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
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
