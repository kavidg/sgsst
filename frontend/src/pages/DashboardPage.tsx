import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { KpiCard, type KpiCardVariant } from '../components/KpiCard';
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
import { AdvancedPageLayout } from '../components/advanced-layout/AdvancedPageLayout';
import { AdvancedHeader } from '../components/advanced-layout/AdvancedHeader';
import { AdvancedKpiGrid } from '../components/advanced-layout/AdvancedKpiGrid';
import { ComplianceProgress } from '../components/ComplianceProgress';
import { getOverview, getRecommendations } from '../services/compliance-dashboard.service';
import {
  ComplianceDashboardData,
  CompliancePhaseKey,
  DashboardRecommendation,
  FindingSeverity,
} from '../types/compliance-dashboard';

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

const PHASE_TO_KEY: Record<PhaseKey, CompliancePhaseKey> = {
  PLANEAR: 'plan',
  HACER: 'do',
  VERIFICAR: 'check',
  ACTUAR: 'act',
};

const PHASE_ORDER: PhaseKey[] = ['PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR'];
const PHASE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' });

const PRIORITY_RANK: Record<FindingSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const SEVERITY_BADGE: Record<FindingSeverity, { label: string; className: string }> = {
  CRITICAL: { label: 'CRÍTICA', className: 'advanced-management__badge advanced-management__badge--danger' },
  HIGH: { label: 'ALTA', className: 'alerts-severity alerts-severity--high' },
  MEDIUM: { label: 'MEDIA', className: 'alerts-severity alerts-severity--medium' },
  LOW: { label: 'BAJA', className: 'alerts-severity alerts-severity--low' },
};

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

function formatLastUpdated(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function phaseLabel(key: CompliancePhaseKey | null | undefined): string {
  switch (key) {
    case 'plan':
      return 'Planear';
    case 'do':
      return 'Hacer';
    case 'check':
      return 'Verificar';
    case 'act':
      return 'Actuar';
    default:
      return '—';
  }
}

function getComplianceLevel(percentage: number): { label: string; className: string } {
  if (percentage >= 85) return { label: 'Excelente', className: 'advanced-management__badge advanced-management__badge--success' };
  if (percentage >= 70) return { label: 'Alto', className: 'advanced-management__badge advanced-management__badge--success' };
  if (percentage >= 50) return { label: 'Medio', className: 'advanced-management__badge advanced-management__badge--warning' };
  if (percentage >= 30) return { label: 'Bajo', className: 'advanced-management__badge advanced-management__badge--danger' };
  return { label: 'Crítico', className: 'advanced-management__badge advanced-management__badge--danger' };
}

function complianceVariant(value: number): KpiCardVariant {
  if (value >= 80) return 'success';
  if (value >= 50) return 'warning';
  return 'danger';
}

function DashboardSkeleton() {
  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <article key={i} className="card skeleton-block" style={{ height: 118 }} />
        ))}
      </div>
      <div className="grid grid-2">
        <article className="card skeleton-block" style={{ height: 280 }} />
        <article className="card skeleton-block" style={{ height: 280 }} />
      </div>
      <article className="card skeleton-block" style={{ height: 140 }} />
    </div>
  );
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

  // Estado del Motor Inteligente
  const [overview, setOverview] = useState<ComplianceDashboardData | null>(null);
  const [recommendations, setRecommendations] = useState<DashboardRecommendation[]>([]);
  const [intelligentLoading, setIntelligentLoading] = useState(false);
  const [intelligentError, setIntelligentError] = useState('');

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

  // Motor Inteligente: overview + acciones recomendadas en paralelo
  const loadIntelligent = useCallback(async () => {
    if (!token || !companyId) {
      return;
    }

    setIntelligentLoading(true);
    setIntelligentError('');
    setOverview(null);
    setRecommendations([]);

    try {
      const [overviewData, recommendationsData] = await Promise.all([
        getOverview(token, companyId),
        getRecommendations(token, companyId),
      ]);
      setOverview(overviewData);
      setRecommendations(recommendationsData);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : 'No fue posible obtener el análisis inteligente.';
      setIntelligentError(message);
    } finally {
      setIntelligentLoading(false);
    }
  }, [token, companyId]);

  useEffect(() => {
    void loadIntelligent();
  }, [loadIntelligent]);

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

  // Fases PHVA alimentadas por el Compliance Engine (fallback al cálculo local)
  const enginePhaseCompliance = useMemo(() => {
    if (!overview) return null;
    return PHASE_ORDER.map((phase) => ({
      phase,
      name: PHASE_LABELS[phase],
      value: overview.phaseCompliance[PHASE_TO_KEY[phase]],
    }));
  }, [overview]);

  const pieData = enginePhaseCompliance ?? phaseCompliance;

  // KPIs del motor inteligente
  const engineKpis = useMemo(() => {
    if (!overview) return [];
    const items: { label: string; value: string | number; variant?: KpiCardVariant }[] = [
      { label: 'Cumplimiento general', value: `${overview.overallCompliance}%`, variant: complianceVariant(overview.overallCompliance) },
      { label: 'Alertas', value: overview.alerts.length, variant: overview.alerts.length > 0 ? 'warning' : 'success' },
      { label: 'Hallazgos', value: overview.findings.length, variant: overview.findings.length > 0 ? 'warning' : 'success' },
      { label: 'Última actualización', value: formatLastUpdated(overview.lastUpdated) },
    ];
    return items;
  }, [overview]);

  // Hallazgos ordenados por severidad CRITICAL > HIGH > MEDIUM > LOW
  const sortedFindings = useMemo(() => {
    if (!overview) return [];
    return [...overview.findings].sort(
      (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
    );
  }, [overview]);

  // Indicador de tendencia (null → "Histórico insuficiente")
  const trendBadge = useMemo(() => {
    if (!overview) return null;
    if (!overview.trend || overview.trend.length < 2) {
      return <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Histórico insuficiente</span>;
    }
    const last = overview.trend[overview.trend.length - 1];
    const prev = overview.trend[overview.trend.length - 2];
    const variation = last.compliance - prev.compliance;
    if (variation > 0.5) return <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>📈 En mejora (+{variation.toFixed(1)} pts)</span>;
    if (variation < -0.5) return <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>📉 En descenso ({variation.toFixed(1)} pts)</span>;
    return <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8' }}>➡️ Estable</span>;
  }, [overview]);

  const shouldShowRecCard = role === 'owner' || role === 'admin' || role === 'manager';

  // Nivel de cumplimiento derivado del porcentaje global
  const complianceLevel = overview ? getComplianceLevel(overview.overallCompliance) : null;

  return (
    <AdvancedPageLayout>
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

      <AdvancedHeader
        moduleCode="SST-DASH-001"
        moduleTitle="Dashboard Inteligente SG-SST"
        description="Motor inteligente de análisis del cumplimiento · Planear · Hacer · Verificar · Actuar"
        statusBadge={
          complianceLevel
            ? <span className={complianceLevel.className}>{complianceLevel.label}</span>
            : <span className="advanced-management__badge">⚡ Motor inteligente</span>
        }
      />

      {/* ============ MOTOR INTELIGENTE ============ */}
      {intelligentError && !overview ? (
        <article className="card card--error" style={{ display: 'grid', gap: '.75rem' }}>
          <h3 className="card-title">No fue posible obtener el análisis inteligente.</h3>
          <p className="muted">{intelligentError}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => void loadIntelligent()}>
              Reintentar
            </button>
          </div>
        </article>
      ) : null}

      {intelligentError && overview ? (
        <div className="toast-alert" style={{ position: 'static' }}>
          <p>⚠️ No se pudo actualizar el análisis inteligente. Mostrando datos anteriores.</p>
        </div>
      ) : null}

      {intelligentLoading && !overview ? <DashboardSkeleton /> : null}

      {overview ? (
        <>
          {/* KPIs del motor */}
          <AdvancedKpiGrid items={engineKpis} columns={4} />

          {/* Estado inteligente + cumplimiento por fases */}
          <div className="grid grid-2">
            <article className="card">
              <h3 className="card-title">🧠 Estado Inteligente</h3>
              <div className="grid" style={{ gap: '.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                  <span className="muted">Nivel de cumplimiento</span>
                  {complianceLevel ? <span className={complianceLevel.className}>{complianceLevel.label}</span> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                  <span className="muted">Tendencia</span>
                  {trendBadge}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                  <span className="muted">Última actualización</span>
                  <strong>{formatLastUpdated(overview.lastUpdated)}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                  <span className="muted">Alertas activas</span>
                  <strong>{overview.alerts.length}</strong>
                </div>
              </div>
            </article>

            <ComplianceProgress
              total={{ title: 'Cumplimiento general', percentage: overview.overallCompliance }}
              sections={[
                { title: 'Planear', percentage: overview.phaseCompliance.plan },
                { title: 'Hacer', percentage: overview.phaseCompliance.do },
                { title: 'Verificar', percentage: overview.phaseCompliance.check },
                { title: 'Actuar', percentage: overview.phaseCompliance.act },
              ]}
            />
          </div>

          {/* Resumen ejecutivo */}
          <article className="card" style={{ borderLeft: '4px solid #2563eb', display: 'grid', gap: '.5rem' }}>
            <h3 className="card-title">📊 Resumen Ejecutivo</h3>
            <p style={{ margin: 0, color: '#334155', lineHeight: 1.6, fontSize: '.95rem' }}>
              {overview.executiveSummary || 'Sin resumen disponible.'}
            </p>
          </article>

          {/* Hallazgos inteligentes */}
          <article className="card">
            <h3 className="card-title">🔎 Hallazgos Inteligentes ({overview.findings.length})</h3>
            {sortedFindings.length === 0 ? (
              <p className="muted">Sin hallazgos detectados. El cumplimiento se encuentra en buen estado.</p>
            ) : (
              <div className="grid" style={{ gap: '.75rem' }}>
                {sortedFindings.map((finding) => {
                  const severity = finding.severity ?? finding.priority;
                  const badge = SEVERITY_BADGE[severity];
                  return (
                    <article key={finding.id} className="advanced-list__item" style={{ display: 'grid', gap: '.55rem' }}>
                      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '.95rem' }}>{finding.title}</strong>
                        <span className={badge.className}>{badge.label}</span>
                      </div>
                      <p style={{ margin: 0, color: '#475569', fontSize: '.9rem' }}>{finding.description}</p>
                      <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', fontSize: '.82rem', color: '#64748b' }}>
                        <span>📍 Fase: {phaseLabel(finding.affectedPhase)}</span>
                        {finding.recommendedAction ? <span>💡 {finding.recommendedAction}</span> : null}
                        {finding.estimatedImpact ? <span>⚠️ {finding.estimatedImpact}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>

          {/* Acciones recomendadas */}
          <article className="card">
            <h3 className="card-title">⚡ Acciones Recomendadas ({recommendations.length})</h3>
            {recommendations.length === 0 ? (
              <p className="muted">Sin acciones recomendadas por el momento.</p>
            ) : (
              <div className="grid" style={{ gap: '.75rem' }}>
                {recommendations.map((rec) => {
                  const badge = SEVERITY_BADGE[rec.priority];
                  return (
                    <article key={rec.id} className="advanced-list__item" style={{ display: 'grid', gap: '.6rem' }}>
                      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '.95rem' }}>{rec.title}</strong>
                        <span className={badge.className}>{rec.priority}</span>
                      </div>
                      <p style={{ margin: 0, color: '#475569', fontSize: '.9rem' }}>{rec.description}</p>
                      <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap', fontSize: '.82rem', color: '#64748b' }}>
                        <span>🎯 Impacto esperado: +{rec.estimatedImpact}%</span>
                        <span>⏱ Duración: {rec.estimatedDurationDays} días</span>
                        <span>👤 Responsable: {rec.recommendedResponsibleRole}</span>
                        {rec.affectedPhase ? <span>📍 Fase: {phaseLabel(rec.affectedPhase)}</span> : null}
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled
                          title="Disponible en la siguiente fase"
                          style={{ fontSize: '.85rem', padding: '.5rem .85rem' }}
                        >
                          ➕ Crear actividad
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </>
      ) : null}

      {/* ============ CONTENIDO EXISTENTE ============ */}
      <section className="grid dashboard">
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
                  <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={85}>
                    {pieData.map((entry, index) => (
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
    </AdvancedPageLayout>
  );
}
