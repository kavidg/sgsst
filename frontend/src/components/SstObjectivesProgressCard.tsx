import { useEffect, useState } from 'react';
import { fetchDashboardSstObjectives } from '../api';
import { Button } from './ui/Button';
import { KpiCard } from './KpiCard';

export function SstObjectivesProgressCard({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{ total: number; active: number; completed: number; delayed: number; expired: number; compliance: number } | null>(null);
  const [objectives, setObjectives] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchDashboardSstObjectives(token)
      .then((data) => {
        setSummary(data.summary);
        setObjectives(data.objectives ?? []);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No fue posible cargar objetivos SST');
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <section className="card">
      <h3 className="card-title">Objetivos SST (Resumido)</h3>
      {loading ? <p className="muted">Cargando...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {summary ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <KpiCard title="Total" value={summary.total} />
            <KpiCard title="Activos" value={summary.active} />
            <KpiCard title="Completados" value={summary.completed} />
            <KpiCard title="Retrasados" value={summary.delayed} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>% Cumplimiento:</strong> {summary.compliance}%
          </div>
        </div>
      ) : null}

      <div>
        <h4>Objetivos (reciente)</h4>
        {objectives.length === 0 ? <p className="muted">No hay objetivos disponibles.</p> : (
          <div className="objective-card-grid">
            {objectives.slice(0, 6).map((o) => (
              <div key={o.objectiveId || o._id} className="objective-card">
                <div>
                  <h5 style={{ margin: 0 }}>{o.name}</h5>
                  <p className="muted" style={{ margin: 0 }}>{o.responsible} — {o.dueDate ? new Date(o.dueDate).toLocaleDateString('es-CO') : ''}</p>
                </div>
                <div className="objective-progress">
                  <div className="objective-progress__track" style={{ width: '100%' }}>
                    <span className={o.currentProgress <= 30 ? 'objective-progress__bar objective-progress__bar--low' : o.currentProgress <= 70 ? 'objective-progress__bar objective-progress__bar--medium' : 'objective-progress__bar objective-progress__bar--high'} style={{ width: `${o.currentProgress ?? 0}%` }} aria-hidden />
                  </div>
                  <div style={{ minWidth: 42, textAlign: 'right' }}>{o.currentProgress ?? 0}%</div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary">Ver</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
