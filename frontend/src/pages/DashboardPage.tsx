import { useEffect, useState } from 'react';
import { DashboardResponse, fetchDashboard } from '../api';
import { Icons } from '../components/Icons';
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
    <section className="grid">
      <div>
        <h2 style={{ margin: '0 0 .2rem' }}>Dashboard Ejecutivo</h2>
        <p className="muted">Indicadores clave del SG-SST para tu empresa.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="kpi-grid">
        <KpiCard title="Cumplimiento SG-SST (%)" value={`${dashboard.compliance}%`} icon={<Icons.chart />} emphasizeValue />
        <KpiCard title="Empleados" value={dashboard.employees} icon={<Icons.users />} />
        <KpiCard title="Incidentes" value={dashboard.incidents} icon={<Icons.alert />} />
        <KpiCard title="Capacitaciones" value={dashboard.trainings} icon={<Icons.dashboard />} />
        <KpiCard title="Riesgos altos" value={dashboard.highRisks} icon={<Icons.shield />} />
      </div>
    </section>
  );
}
