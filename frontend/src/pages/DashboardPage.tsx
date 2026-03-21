import { useEffect, useState } from 'react';
import { DashboardResponse, fetchDashboard } from '../api';
import { KpiCard } from '../components/KpiCard';

type DashboardPageProps = {
  token: string;
};

const defaultDashboard: DashboardResponse = {
  employees: 0,
  incidents: 0,
  trainings: 0,
  compliance: 0,
  highRisks: 0,
};

export function DashboardPage({ token }: DashboardPageProps) {
  const [dashboard, setDashboard] = useState<DashboardResponse>(defaultDashboard);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchDashboard(token)
      .then((data) => {
        setDashboard(data);
        setError('');
      })
      .catch((requestError) => {
        const message = requestError instanceof Error ? requestError.message : 'No fue posible cargar el dashboard.';
        setError(message);
      });
  }, [token]);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Dashboard Ejecutivo</h2>
      <p style={{ color: '#475569' }}>Indicadores clave del SG-SST para tu empresa.</p>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        <KpiCard title="Cumplimiento SG-SST (%)" value={`${dashboard.compliance}%`} emphasizeValue />
        <KpiCard title="Empleados" value={dashboard.employees} />
        <KpiCard title="Incidentes" value={dashboard.incidents} />
        <KpiCard title="Capacitaciones" value={dashboard.trainings} />
        <KpiCard title="Riesgos altos" value={dashboard.highRisks} />
      </div>
    </section>
  );
}
