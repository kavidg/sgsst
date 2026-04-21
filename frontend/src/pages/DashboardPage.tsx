import { useEffect, useMemo, useState } from 'react';
import {
  AbsenteeismModel,
  DashboardEvaluationModel,
  InspectionActivityModel,
  fetchAbsenteeismByCompany,
  fetchDashboardEvaluations,
  fetchInspectionActivities,
  fetchInspectionScheduleByCompany,
} from '../api';
import { KpiCard } from '../components/KpiCard';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type DashboardPageProps = {
  token: string;
  companyId: string;
};

type PhaseKey = 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';

const PHASE_LABELS: Record<PhaseKey, string> = {
  PLANEAR: 'Planear',
  HACER: 'Hacer',
  VERIFICAR: 'Verificar',
  ACTUAR: 'Actuar',
};

const PHASE_ORDER: PhaseKey[] = ['PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR'];
const PHASE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' });

function getWeight(item: DashboardEvaluationModel) {
  return typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
}

function getPhaseByCode(code?: string): PhaseKey | null {
  if (!code?.trim()) {
    return null;
  }

  const segment = Number.parseInt(code.split('.')[0], 10);

  if (segment >= 1 && segment <= 2) return 'PLANEAR';
  if (segment >= 3 && segment <= 5) return 'HACER';
  if (segment === 6) return 'VERIFICAR';
  if (segment === 7) return 'ACTUAR';
  return null;
}

export function DashboardPage({ token, companyId }: DashboardPageProps) {
  const [evaluations, setEvaluations] = useState<DashboardEvaluationModel[]>([]);
  const [absenteeism, setAbsenteeism] = useState<AbsenteeismModel[]>([]);
  const [inspections, setInspections] = useState<InspectionActivityModel[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !companyId) {
      return;
    }

    setLoading(true);
    Promise.all([
      fetchDashboardEvaluations(token, companyId),
      fetchAbsenteeismByCompany(token, companyId),
      fetchInspectionScheduleByCompany(token, companyId).catch(() => fetchInspectionActivities(token)),
    ])
      .then(([evaluationData, absenteeismData, inspectionData]) => {
        setEvaluations(evaluationData);
        setAbsenteeism(absenteeismData);
        setInspections(inspectionData);
        setError('');
      })
      .catch((requestError) => {
        const message = requestError instanceof Error ? requestError.message : 'No fue posible cargar el dashboard.';
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, companyId]);

  const metrics = useMemo(() => {
    const totalWeight = evaluations.reduce((sum, item) => sum + getWeight(item), 0);
    const complyWeight = evaluations.reduce((sum, item) => (item.status === 'CUMPLE' ? sum + getWeight(item) : sum), 0);
    const sgsstCompliance = totalWeight > 0 ? (complyWeight / totalWeight) * 100 : 0;
    const totalAbsenteeismDays = absenteeism.reduce((sum, item) => sum + (item.dias || 0), 0);

    const executedInspections = inspections.filter((item) =>
      ['ejecutada', 'completada', 'finalizada', 'closed'].includes(item.status.toLowerCase())
    ).length;
    const pendingInspections = inspections.length - executedInspections;
    const inspectionsExecutionRate = inspections.length > 0 ? (executedInspections / inspections.length) * 100 : 0;

    const noCumpleItems = evaluations.filter((item) => item.status === 'NO_CUMPLE');
    const highAbsenteeism = absenteeism.filter((item) => item.dias > 10);
    const overduePendingActivities = inspections.filter((item) => {
      const isExecuted = ['ejecutada', 'completada', 'finalizada', 'closed'].includes(item.status.toLowerCase());
      return !isExecuted && new Date(item.plannedDate).getTime() < Date.now();
    });

    return {
      sgsstCompliance: Number(sgsstCompliance.toFixed(1)),
      totalAbsenteeismDays,
      inspectionsExecutionRate: Number(inspectionsExecutionRate.toFixed(1)),
      executedInspections,
      pendingInspections,
      noCumpleItems,
      highAbsenteeism,
      overduePendingActivities,
      activeAlerts: highAbsenteeism.length + overduePendingActivities.length + noCumpleItems.length,
    };
  }, [absenteeism, evaluations, inspections]);

  const absenteeismByMonth = useMemo(() => {
    const monthAccumulator = absenteeism.reduce<Record<string, number>>((acc, item) => {
      const monthKey = item.fechaInicio?.slice(0, 7);
      if (!monthKey) return acc;
      acc[monthKey] = (acc[monthKey] ?? 0) + (item.dias || 0);
      return acc;
    }, {});

    return Object.entries(monthAccumulator)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, days]) => ({
        month,
        label: MONTH_FORMATTER.format(new Date(`${month}-01T00:00:00`)),
        days,
      }));
  }, [absenteeism]);

  const phaseCompliance = useMemo(
    () =>
      PHASE_ORDER.map((phase) => {
        const phaseItems = evaluations.filter((item) => getPhaseByCode(item.code) === phase);
        const total = phaseItems.reduce((sum, item) => sum + getWeight(item), 0);
        const complies = phaseItems.reduce((sum, item) => (item.status === 'CUMPLE' ? sum + getWeight(item) : sum), 0);
        const percentage = total > 0 ? Number(((complies / total) * 100).toFixed(1)) : 0;
        return { phase, name: PHASE_LABELS[phase], value: percentage };
      }),
    [evaluations]
  );

  return (
    <section className="grid dashboard">
      <div>
        <h2 style={{ marginBottom: '.3rem' }}>Dashboard Gerencial SST</h2>
        <p className="muted">Indicadores de ausentismo, inspecciones y cumplimiento PHVA.</p>
      </div>

      {loading ? <p className="muted">Cargando evaluaciones...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="kpi-grid">
        <KpiCard title="% Cumplimiento SG-SST" value={`${metrics.sgsstCompliance}%`} />
        <KpiCard title="Total días ausentismo" value={metrics.totalAbsenteeismDays} />
        <KpiCard title="% ejecución inspecciones" value={`${metrics.inspectionsExecutionRate}%`} />
        <KpiCard title="Alertas activas" value={metrics.activeAlerts} />
      </div>

      <div className="grid grid-3">
        <article className="card" style={{ minHeight: 300 }}>
          <h3 className="card-title">Días perdidos por mes</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={absenteeismByMonth}>
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="days" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card" style={{ minHeight: 300 }}>
          <h3 className="card-title">Cumplimiento PHVA</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={phaseCompliance} dataKey="value" nameKey="name" outerRadius={85}>
                  {phaseCompliance.map((entry, index) => (
                    <Cell key={entry.phase} fill={PHASE_COLORS[index % PHASE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card" style={{ minHeight: 300 }}>
          <h3 className="card-title">Inspecciones ejecutadas vs pendientes</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart
                data={[
                  { name: 'Ejecutadas', total: metrics.executedInspections },
                  { name: 'Pendientes', total: metrics.pendingInspections },
                ]}
              >
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <article className="card">
        <h3 className="card-title">Alertas activas</h3>
        <div className="grid grid-3">
          <div>
            <p><strong>Ausencias &gt; 10 días:</strong> {metrics.highAbsenteeism.length}</p>
          </div>
          <div>
            <p><strong>Actividades sin ejecutar:</strong> {metrics.overduePendingActivities.length}</p>
          </div>
          <div>
            <p><strong>Ítems SG-SST en "No cumple":</strong> {metrics.noCumpleItems.length}</p>
          </div>
        </div>
      </article>
    </section>
  );
}
