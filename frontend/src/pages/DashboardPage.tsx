import { useEffect, useState } from 'react';
import { DashboardEvaluationModel, fetchDashboardEvaluations } from '../api';
import { KpiCard } from '../components/KpiCard';
import { Card } from '../components/ui/Card';

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

function getWeight(item: DashboardEvaluationModel) {
  return typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
}

function getPhaseByCode(code: string): PhaseKey | null {
  const segment = Number.parseInt(code.split('.')[0], 10);

  if (segment >= 1 && segment <= 2) return 'PLANEAR';
  if (segment >= 3 && segment <= 5) return 'HACER';
  if (segment === 6) return 'VERIFICAR';
  if (segment === 7) return 'ACTUAR';
  return null;
}

function getComplianceScore(percentage: number) {
  if (percentage >= 80) return 'good';
  if (percentage >= 60) return 'medium';
  return 'bad';
}

export function DashboardPage({ token, companyId }: DashboardPageProps) {
  const [evaluations, setEvaluations] = useState<DashboardEvaluationModel[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !companyId) {
      return;
    }

    setLoading(true);
    fetchDashboardEvaluations(token, companyId)
      .then((data) => {
        setEvaluations(data);
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

  const globalTotal = evaluations.reduce((sum, item) => sum + getWeight(item), 0);
  const globalComplies = evaluations.reduce((sum, item) => (item.status === 'CUMPLE' ? sum + getWeight(item) : sum), 0);
  const globalCompliance = globalTotal > 0 ? (globalComplies / globalTotal) * 100 : 0;
  const globalComplianceRounded = Number(globalCompliance.toFixed(1));
  const globalComplianceScore = getComplianceScore(globalComplianceRounded);

  const phaseCompliance = PHASE_ORDER.map((phase) => {
    const phaseItems = evaluations.filter((item) => getPhaseByCode(item.code) === phase);
    const total = phaseItems.reduce((sum, item) => sum + getWeight(item), 0);
    const complies = phaseItems.reduce((sum, item) => (item.status === 'CUMPLE' ? sum + getWeight(item) : sum), 0);
    const percentage = total > 0 ? Number(((complies / total) * 100).toFixed(1)) : 0;

    return {
      phase,
      label: PHASE_LABELS[phase],
      percentage,
      score: getComplianceScore(percentage),
    };
  });

  const noCumpleItems = evaluations.filter((item) => item.status === 'NO_CUMPLE');
  const pendingPlans = noCumpleItems.filter((item) => !item.improvementPlan?.activity?.trim()).length;
  const topIssues = noCumpleItems.slice(0, 5);

  return (
    <section className="grid dashboard">
      <div>
        <h2 style={{ margin: '0 0 .2rem' }}>Dashboard Ejecutivo</h2>
        <p className="muted">Cumplimiento SG-SST e indicadores críticos por fase PHVA.</p>
      </div>
      {loading ? <p className="muted">Cargando evaluaciones...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <Card title="Cumplimiento Global">
        <div className="dashboard-global">
          <p className={`dashboard-global__value dashboard-global__value--${globalComplianceScore}`}>{globalComplianceRounded}%</p>
          <div className="dashboard-progress">
            <div className="dashboard-progress__track" aria-label="Cumplimiento global">
              <div
                className={`dashboard-progress__fill dashboard-progress__fill--${globalComplianceScore}`}
                style={{ width: `${Math.min(globalComplianceRounded, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="kpi-grid dashboard-kpi-grid">
        {phaseCompliance.map((phase) => (
          <KpiCard
            key={phase.phase}
            title={`${phase.label} %`}
            value={`${phase.percentage}%`}
            emphasizeValue
            className={`dashboard-kpi dashboard-kpi--${phase.score}`}
          />
        ))}
      </div>

      <div className="grid grid-2">
        <Card title="Alertas">
          <div className="dashboard-alerts">
            <KpiCard title="Ítems NO_CUMPLE" value={noCumpleItems.length} className="dashboard-kpi dashboard-kpi--bad" />
            <KpiCard title="Planes pendientes" value={pendingPlans} className="dashboard-kpi dashboard-kpi--medium" />
          </div>
        </Card>

        <Card title="Top hallazgos críticos">
          {topIssues.length > 0 ? (
            <ul className="dashboard-issues">
              {topIssues.map((item) => (
                <li key={item._id} className="dashboard-issues__item">
                  <strong>{item.code}</strong>
                  <span className="muted">{item.improvementPlan?.activity?.trim() || 'Sin plan de mejoramiento definido'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No hay ítems en estado NO_CUMPLE.</p>
          )}
        </Card>
      </div>
    </section>
  );
}
