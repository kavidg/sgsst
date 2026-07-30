import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { AlertModel, MyCompanyModel, UserModel, UserRole, fetchAlertsByCompany, markAlertAsRead } from '../api';
import { CompanySelector } from '../CompanySelector';
import { Sidebar } from './Sidebar';
import { Button } from './ui/Button';
import { Icons } from './Icons';

type LayoutProps = {
  token: string;
  profile?: UserModel | null;
  role?: UserRole;
  companies: MyCompanyModel[];
  activeCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
  loading: boolean;
};

type RealtimeAlertEvent = {
  companyId: string;
  message: string;
  severity: AlertModel['severity'];
  actionUrl?: string;
  targetUserId?: string;
};

type ToastNotification = {
  id: string;
  message: string;
};

const MAX_DROPDOWN_ALERTS = 6;
const TOAST_DURATION_MS = 5000;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const severityLabels: Record<AlertModel['severity'], string> = {
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return first + last || '';
}

function UserAvatar({ profile, size = 32 }: { profile?: UserModel | null; size?: number }) {
  if (profile?.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: '999px',
          objectFit: 'cover',
          border: '1px solid #cbd5e1',
        }}
      />
    );
  }

  const initials = getInitials(profile?.firstName, profile?.lastName);
  if (initials) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '999px',
          background: '#2563eb',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.45,
          fontWeight: 700,
          userSelect: 'none',
        }}
      >
        {initials}
      </div>
    );
  }

  return <Icons.user />;
}

export function Layout({ token, profile, role, companies, activeCompanyId, onSelectCompany, onRefresh, onLogout, loading }: LayoutProps) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const showCompanySelector = role === 'owner';
  const unreadAlertsCount = useMemo(() => alerts.filter((alert) => !alert.isRead).length, [alerts]);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const loadAlerts = async () => {
    if (!activeCompanyId || !token) {
      setAlerts([]);
      return;
    }

    setAlertsLoading(true);
    try {
      // Pass userId so MANAGER sees only their targeted alerts; admin/owner sees all
      const data = await fetchAlertsByCompany(token, activeCompanyId, profile?._id);
      setAlerts(data);
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [activeCompanyId, token]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }

    const socket = io(BACKEND_URL, {
      query: {
        companyId: activeCompanyId,
      },
    });

    const handleRealtimeAlert = (alert: RealtimeAlertEvent) => {
      if (alert.companyId !== activeCompanyId) {
        return;
      }

      const realtimeAlert: AlertModel = {
        _id: `realtime-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        companyId: alert.companyId,
        type: alert.actionUrl ? 'APPROVAL_REQUEST' : 'REALTIME',
        message: alert.message,
        severity: alert.severity,
        isRead: false,
        createdAt: new Date().toISOString(),
        actionUrl: alert.actionUrl,
      };

      setAlerts((prev) => [realtimeAlert, ...prev]);

      const toastId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [...prev, { id: toastId, message: alert.message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
      }, TOAST_DURATION_MS);
    };

    socket.on('new-alert', handleRealtimeAlert);
    socket.emit('join-company', activeCompanyId);

    return () => {
      socket.off('new-alert', handleRealtimeAlert);
      socket.disconnect();
    };
  }, [activeCompanyId]);

  const handleMarkAsRead = async (alertId: string) => {
    if (alertId.startsWith('realtime-')) {
      setAlerts((prev) => prev.map((alert) => (alert._id === alertId ? { ...alert, isRead: true } : alert)));
      return;
    }

    await markAlertAsRead(token, alertId);
    setAlerts((prev) => prev.map((alert) => (alert._id === alertId ? { ...alert, isRead: true } : alert)));
  };

  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const companyName = activeCompany?.name || (activeCompanyId && !activeCompany ? 'Empresa no configurada' : '');

  const roleLabel: Record<string, string> = {
    owner: 'Propietario',
    admin: 'ADMIN',
    manager: 'Gerente',
    member: 'Miembro',
  };

  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email?.split('@')[0] || 'Usuario';

  return (
    <div className="app-shell">
      <div className="layout">
        <Sidebar
          role={role}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        />
        <main className={`content ${collapsed ? 'content-collapsed' : ''}`.trim()}>
          <header className="topbar">
            <div className="actions" style={{ alignItems: 'center' }}>
              <Button type="button" variant="ghost" className="mobile-toggle" onClick={() => setMobileOpen(true)}>
                <Icons.menu />
              </Button>
              <strong>Panel SST</strong>
            </div>
            <div className="actions" style={{ alignItems: 'center', position: 'relative' }}>
              {showCompanySelector ? (
                <CompanySelector companies={companies} activeCompanyId={activeCompanyId} onSelectCompany={onSelectCompany} />
              ) : null}

              {/* User menu dropdown */}
              <div ref={userMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.5rem',
                    padding: '.35rem .6rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '.8rem',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '.88rem',
                    color: '#334155',
                    transition: 'all .15s',
                  }}
                  title={companyName ? `${displayName} — ${companyName}` : displayName}
                >
                  <UserAvatar profile={profile} size={30} />
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, textAlign: 'left' }}>
                    <span style={{ fontWeight: 600, fontSize: '.85rem', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName}
                    </span>
                    <span style={{ fontSize: '.7rem', color: '#94a3b8', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {roleLabel[role || ''] || role?.toUpperCase() || ''}{companyName ? ` • ${companyName}` : ''}
                    </span>
                  </div>
                  <svg className="layout-icon" style={{ width: 12, height: 12, opacity: 0.5, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 4px)',
                      width: 200,
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '.75rem',
                      boxShadow: '0 8px 24px rgba(15,23,42,.12)',
                      zIndex: 50,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '.65rem .75rem', borderBottom: '1px solid #f1f5f9' }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '.85rem', color: '#0f172a' }}>{displayName}</p>
                      <p style={{ margin: '.1rem 0 0', fontSize: '.78rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {profile?.email || ''}
                      </p>
                      {companyName ? (
                        <p style={{ margin: '.1rem 0 0', fontSize: '.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          🏢 {companyName}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ display: 'grid', gap: '.15rem', padding: '.35rem' }}>
                      <button
                        type="button"
                        onClick={() => { navigate('/profile'); setUserMenuOpen(false); }}
                        style={{ ...menuItemStyle }}
                      >
                        👤 Mi perfil
                      </button>
                      <button
                        type="button"
                        onClick={() => { navigate('/company-configuration'); setUserMenuOpen(false); }}
                        style={{ ...menuItemStyle }}
                      >
                        ⚙️ Configuración
                      </button>
                      <button
                        type="button"
                        onClick={() => { /* password change - could open a modal or redirect */ setUserMenuOpen(false); }}
                        style={{ ...menuItemStyle }}
                      >
                        🔑 Cambiar contraseña
                      </button>
                      <div style={{ borderTop: '1px solid #f1f5f9', margin: '.25rem 0' }} />
                      <button
                        type="button"
                        onClick={onLogout}
                        style={{ ...menuItemStyle, color: '#dc2626' }}
                      >
                        🚪 Cerrar sesión
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Alerts dropdown */}
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
                          <div
                            className="alerts-item__clickable"
                            onClick={() => {
                              if (alert.actionUrl) {
                                setAlertsOpen(false);
                                navigate(alert.actionUrl);
                              }
                              if (!alert.isRead) void handleMarkAsRead(alert._id);
                            }}
                            style={{ cursor: alert.actionUrl ? 'pointer' : 'default' }}
                          >
                            <div className="alerts-item__header">
                              <span className={`alerts-severity alerts-severity--${alert.severity.toLowerCase()}`.trim()}>{severityLabels[alert.severity]}</span>
                              {!alert.isRead ? <span className="alerts-item__new">Nueva</span> : null}
                              {alert.actionUrl ? <span className="alerts-item__review-link" style={{ marginLeft: '.5rem', fontSize: '.7rem', color: '#2563eb' }}>🔗 Revisar</span> : null}
                            </div>
                            <p className="alerts-item__message">{alert.message}</p>
                            {!alert.isRead ? (
                              <Button
                                type="button"
                                variant="secondary"
                                className="alerts-item__action"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleMarkAsRead(alert._id);
                                }}
                              >
                                Marcar leída
                              </Button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>Recargar</Button>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-alert">
            <strong>Nueva alerta</strong>
            <p>{toast.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '.5rem',
  width: '100%',
  padding: '.5rem .65rem',
  border: 'none',
  borderRadius: '.5rem',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '.88rem',
  color: '#334155',
  textAlign: 'left',
  transition: 'background .15s',
};
