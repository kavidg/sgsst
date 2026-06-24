import { useEffect, useMemo, useState } from 'react';
import {
  AbsenteeismModel,
  DashboardEvaluationModel,
  InspectionActivityModel,
  InitialEvaluationExecutiveDashboardModel,
  LicenseDashboardModel,
  SstObjectivesAdvancedModel,
  fetchAbsenteeismByCompany,
  fetchDashboardEvaluations,
  fetchInspectionActivities,
  fetchInspectionScheduleByCompany,
  fetchInitialEvaluationExecutiveDashboard,
  fetchLicenseDashboard,
  fetchAnnualWorkPlanAdvanced,
  fetchMyAcceptances,
} from '../api';

import { useNavigate } from 'react-router-dom';
import { useCompanyContext } from '../context/CompanyContext';
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

import { ImplementationRecommendationCard } from '../components/ImplementationRecommendationCard';

type DashboardPageProps = {
  token: string;
  role?: 'owner' | 'admin' | 'member' | 'manager';
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

export function DashboardPage({ token, role }: DashboardPageProps) {
  const { companyId } = useCompanyContext();
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<DashboardEvaluationModel[]>([]);
  const [absenteeism, setAbsenteeism] = useState<AbsenteeismModel[]>([]);
  const [inspections, setInspections] = useState<InspectionActivityModel[]>([]);
  const [initialEvaluationDashboard, setInitialEvaluationDashboard] = useState<InitialEvaluationExecutiveDashboardModel | null>(null);
  const [annualWorkPlan, setAnnualWorkPlan] = useState<SstObjectivesAdvancedModel | null>(null);
  const [licenseDashboard, setLicenseDashboard] = useState<LicenseDashboardModel | null>(null);
  const [pendingAcceptancesCount, setPendingAcceptancesCount] = useState(0);
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
      fetchInitialEvaluationExecutiveDashboard(token).catch(() => null),
      fetchAnnualWorkPlanAdvanced(token).catch(() => null),
      fetchLicenseDashboard(token).catch(() => null),
    ])
      .then(([evaluationData, absenteeismData, inspectionData, initialEvaluationData, annualWorkPlanData, licenseData]) => {
        setEvaluations(evaluationData);
        setAbsenteeism(absenteeismData);
        setInspections(inspectionData);
        setInitialEvaluationDashboard(initialEvaluationData);
        setAnnualWorkPlan(annualWorkPlanData);
        setLicenseDashboard(licenseData);
        setError('');
      })
      .catch((requestError) => {
        const message = requestError instanceof Error ? requestError.message : 'No fue posible cargar el dashboard.';
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });

    // Fetch pending acceptances for the dashboard banner
    if (token) {
      fetchMyAcceptances(token)
        .then((accs) => setPendingAcceptancesCount(accs.filter((a: any) => a.acceptanceStatus === 'PENDING').length))
        .catch(() => {});
    }
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

  const annualWorkPlanMetrics = useMemo(() => {
    const tasks = annualWorkPlan?.objectives.flatMap((objective) => objective.activities.flatMap((activity) => activity.tasks ?? [])) ?? [];
    return {
      total: tasks.length,
      completed: tasks.filter((task) => task.status === 'Completed' || task.progress === 100).length,
      delayed: tasks.filter((task) => task.status === 'Delayed' || (task.status !== 'Completed' && new Date(task.dueDate) < new Date())).length,
      upcoming: tasks.filter((task) => task.status !== 'Completed' && new Date(task.dueDate) >= new Date()).length,
      critical: tasks.filter((task) => task.priority === 'Critical').length,
    };
  }, [annualWorkPlan]);

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

  const shouldShowRecCard = role === 'owner' || role === 'admin' || role === 'manager';

  return (
    <section className="grid dashboard">
      {/* Pending responsibilities banner */}
      {pendingAcceptancesCount > 0 && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '1rem',
          padding: '.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div>
            <strong>📋 Tienes {pendingAcceptancesCount} responsabilidad(es) pendiente(s) por revisar y firmar</strong>
            <p style={{ margin: '.25rem 0 0', color: '#854d0e', fontSize: '.9rem' }}>
              Revisa tus responsabilidades asignadas en el módulo de Gestión Avanzada.
            </p>
          </div>
          <button
            onClick={() => navigate('/advanced-management/1.1.2')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.5rem',
              padding: '.6rem 1rem',
              borderRadius: '.8rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '.9rem',
              cursor: 'pointer',
            }}
          >
            ✍ Revisar responsabilidades
          </button>
        </div>
      )}

      {shouldShowRecCard && (
        <ImplementationRecommendationCard
          token={token}
          role={role}
        />
      )}

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


      <article className="card">
        <h3 className="card-title">Ejecución del Plan Anual</h3>
        <div className="grid grid-3">
          <div><p><strong>Total Tareas:</strong> {annualWorkPlanMetrics.total}</p></div>
          <div><p><strong>Completadas:</strong> {annualWorkPlanMetrics.completed}</p></div>
          <div><p><strong>Retrasadas:</strong> {annualWorkPlanMetrics.delayed}</p></div>
          <div><p><strong>Próximas:</strong> {annualWorkPlanMetrics.upcoming}</p></div>
          <div><p><strong>Críticas:</strong> {annualWorkPlanMetrics.critical}</p></div>
          <div><p><strong>Cumplimiento:</strong> {annualWorkPlan?.complianceReason ?? 'Sin plan anual cargado'}</p></div>
        </div>
      </article>

      <article className="card">
        <h3 className="card-title">Evaluación Inicial SG-SST · Gestión avanzada</h3>
        <div className="grid grid-3">
          <div><p><strong>Cumplimiento:</strong> {initialEvaluationDashboard ? `${initialEvaluationDashboard.overallCompliance}%` : 'Pendiente'}</p></div>
          <div><p><strong>Hallazgos críticos:</strong> {initialEvaluationDashboard?.criticalFindings ?? 0}</p></div>
          <div><p><strong>Acciones pendientes:</strong> {initialEvaluationDashboard?.pendingActions ?? 0}</p></div>
          <div><p><strong>Nivel de riesgo:</strong> {initialEvaluationDashboard?.riskLevel ?? 'Sin diagnóstico'}</p></div>
          <div><p><strong>Estado ejecutivo:</strong> {initialEvaluationDashboard?.status ?? 'No iniciado'}</p></div>
        </div>
      </article>

      <article className="card">
        <h3 className="card-title">🪪 Licencia SST</h3>
        <div className="grid grid-3">
          <div><p><strong>Responsable:</strong> {licenseDashboard?.responsibleName ?? '—'}</p></div>
          <div><p><strong>Número:</strong> {licenseDashboard?.licenseNumber ?? '—'}</p></div>
          <div><p><strong>Tipo:</strong> {licenseDashboard?.licenseType ?? '—'}</p></div>
          <div><p><strong>Estado:</strong> <span className={
            licenseDashboard?.status === 'Vigente' ? 'badge badge--success' :
            licenseDashboard?.status === 'Vencida' || licenseDashboard?.status === 'Vencido' ? 'badge badge--danger' :
            'badge badge--warning'
          }>{licenseDashboard?.status ?? 'Pendiente'}</span></p></div>
          <div><p><strong>Vence:</strong> {licenseDashboard?.expirationDate ? new Date(licenseDashboard.expirationDate).toLocaleDateString() : '—'}</p></div>
          <div><p><strong>Días restantes:</strong> {licenseDashboard?.remainingDays !== null && licenseDashboard?.remainingDays !== undefined
            ? (licenseDashboard.remainingDays > 0 ? `${licenseDashboard.remainingDays} días` : 'Vencida')
            : '—'}</p></div>
        </div>
      </article>

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

      {/* SST Policy Widget (2.1.1) */}
      <article className="card" style={{ borderLeft: '4px solid #2563eb' }}>
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">📄 Política SST</h3>
          <button
            onClick={() => navigate('/advanced-management/2.1.1')}
            className="btn btn-primary"
            style={{ fontSize: '.85rem', padding: '.5rem .85rem', whiteSpace: 'nowrap' }}
          >
            Ver gestión avanzada →
          </button>
        </div>
        <div className="grid grid-3">
          <div><p><strong>📌 Versión:</strong> —</p></div>
          <div><p><strong>✅ Estado:</strong> —</p></div>
          <div><p><strong>👥 Socialización:</strong> —%</p></div>
        </div>
        <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
          Gestiona la Política SST con generación inteligente, aprobación, firmas digitales y socialización.
        </p>
      </article>

      {/* Training Program Widget */}
      <article className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">🎓 Programa de Capacitación SST</h3>
          <button
            onClick={() => navigate('/advanced-management/1.2.1')}
            className="btn btn-primary"
            style={{ fontSize: '.85rem', padding: '.5rem .85rem', whiteSpace: 'nowrap' }}
          >
            Entrar a Gestión Avanzada →
          </button>
        </div>
        <div className="grid grid-3">
          <div><p><strong>📅 Programadas:</strong> —</p></div>
          <div><p><strong>✅ Ejecutadas:</strong> —</p></div>
          <div><p><strong>⏳ Pendientes:</strong> —</p></div>
        </div>
        <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
          Gestiona el programa anual de capacitación en promoción y prevención (PyP).
        </p>
      </article>

      {/* Budget Execution Widget */}
      <article className="card" style={{ borderLeft: '4px solid #10b981' }}>
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">💰 Ejecución Presupuesto SG-SST</h3>
          <button
            onClick={() => navigate('/advanced-management/1.1.3')}
            className="btn btn-primary"
            style={{ fontSize: '.85rem', padding: '.5rem .85rem', whiteSpace: 'nowrap' }}
          >
            Ver gestión avanzada →
          </button>
        </div>
        <div className="grid grid-3">
          <div><p><strong>📊 Programado:</strong> —</p></div>
          <div><p><strong>💸 Ejecutado:</strong> —</p></div>
          <div><p><strong>💰 Disponible:</strong> —</p></div>
        </div>
        <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
          Los indicadores detallados están disponibles en la <a href="/advanced-management/1.1.3" style={{ color: '#2563eb' }}>gestión avanzada de 1.1.3</a>.
        </p>
      </article>

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
