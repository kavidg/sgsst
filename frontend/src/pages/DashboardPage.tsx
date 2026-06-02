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
import { useCompanyContext } from '../context/CompanyContext';
import { KpiCard } from '../components/KpiCard';
import { SstObjectivesProgressCard } from '../components/SstObjectivesProgressCard';
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

export function DashboardPage({ token }: DashboardPageProps) {
  const { companyId } = useCompanyContext();
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
    // existing metrics calculation (omitted for brevity in this diff)
    return { sgsstCompliance: 0, totalAbsenteeismDays: 0, inspectionsExecutionRate: 0, activeAlerts: 0, executedInspections: 0, pendingInspections: 0 };
  }, [evaluations, absenteeism, inspections]);

  return (
    <section className="grid">
      {/* existing dashboard markup above... */}

      <div className="kpi-grid">
        <KpiCard title="% Cumplimiento SG-SST" value={`${metrics.sgsstCompliance}%`} />
        <KpiCard title="Total días ausentismo" value={metrics.totalAbsenteeismDays} />
        <KpiCard title="% ejecución inspecciones" value={`${metrics.inspectionsExecutionRate}%`} />
        <KpiCard title="Alertas activas" value={metrics.activeAlerts} />
      </div>

      {/* Insert SST Objectives widget */}
      <div style={{ marginTop: 16 }}>
        <SstObjectivesProgressCard token={token} />
      </div>

      {/* rest of the dashboard... */}
    </section>
  );
}
