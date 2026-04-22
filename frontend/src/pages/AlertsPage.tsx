import { useEffect, useMemo, useState } from 'react';
import { AlertModel, AlertSeverity, deleteAlert, fetchAlertsByCompany, markAlertAsRead } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { useCompanyContext } from '../context/CompanyContext';

type AlertsPageProps = {
  token: string;
};

const severityLabels: Record<AlertSeverity, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

export function AlertsPage({ token }: AlertsPageProps) {
  const { companyId } = useCompanyContext();
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');

  const loadAlerts = async () => {
    if (!companyId) {
      setAlerts([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await fetchAlertsByCompany(token, companyId);
      setAlerts(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar las alertas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [companyId, token]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (severityFilter !== 'ALL' && alert.severity !== severityFilter) {
        return false;
      }

      if (statusFilter === 'UNREAD' && alert.isRead) {
        return false;
      }

      if (statusFilter === 'READ' && !alert.isRead) {
        return false;
      }

      return true;
    });
  }, [alerts, severityFilter, statusFilter]);

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await markAlertAsRead(token, alertId);
      setAlerts((prev) => prev.map((item) => (item._id === alertId ? { ...item, isRead: true } : item)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible marcar la alerta como leída.');
    }
  };

  const handleDelete = async (alertId: string) => {
    try {
      await deleteAlert(token, alertId);
      setAlerts((prev) => prev.filter((item) => item._id !== alertId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar la alerta.');
    }
  };

  return (
    <section className="grid">
      <Card title="Alertas del sistema">
        <div className="alerts-page__toolbar">
          <label className="field">
            <span className="label">Severidad</span>
            <Select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as 'ALL' | AlertSeverity)}>
              <option value="ALL">Todas</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Media</option>
              <option value="LOW">Baja</option>
            </Select>
          </label>

          <label className="field">
            <span className="label">Estado</span>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'UNREAD' | 'READ')}>
              <option value="ALL">Todas</option>
              <option value="UNREAD">No leídas</option>
              <option value="READ">Leídas</option>
            </Select>
          </label>

          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => void loadAlerts()} disabled={loading}>
              {loading ? 'Cargando...' : 'Recargar'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="alerts-page__list">
          {filteredAlerts.map((alert) => (
            <article key={alert._id} className={`alerts-item ${alert.isRead ? 'alerts-item--read' : ''}`.trim()}>
              <div className="alerts-item__content">
                <div className="alerts-item__header">
                  <span className={`alerts-severity alerts-severity--${alert.severity.toLowerCase()}`.trim()}>{severityLabels[alert.severity]}</span>
                  {!alert.isRead ? <span className="alerts-item__new">Nueva</span> : null}
                </div>
                <p className="alerts-item__message">{alert.message}</p>
                <p className="muted">{new Date(alert.createdAt).toLocaleString('es-CO')}</p>
              </div>
              <div className="actions">
                {!alert.isRead ? (
                  <Button type="button" variant="secondary" onClick={() => void handleMarkAsRead(alert._id)}>
                    Marcar leída
                  </Button>
                ) : null}
                <Button type="button" variant="danger" onClick={() => void handleDelete(alert._id)}>
                  Eliminar
                </Button>
              </div>
            </article>
          ))}

          {!filteredAlerts.length ? <p className="muted">No hay alertas para los filtros seleccionados.</p> : null}
        </div>
      </Card>

      {error ? <pre className="error">{error}</pre> : null}
    </section>
  );
}
