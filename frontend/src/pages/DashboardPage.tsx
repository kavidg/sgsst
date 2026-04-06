import { useEffect, useState } from 'react';
import { DashboardEvaluationModel, fetchDashboardEvaluations } from '../api';

type DashboardPageProps = {
  token: string;
  companyId: string;
};

type PhaseKey = 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';

type ComplianceScore = 'good' | 'medium' | 'bad';

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

function getComplianceScore(percentage: number): ComplianceScore {
  if (percentage > 85) return 'good';
  if (percentage > 60) return 'medium';
  return 'bad';
}

function getScoreStyles(score: ComplianceScore) {
  if (score === 'good') {
    return {
      textClass: 'dashboard-saas__text--good',
      fillClass: 'dashboard-saas__bar-fill--good',
      toneClass: 'dashboard-saas__card--good',
    };
  }

  if (score === 'medium') {
    return {
      textClass: 'dashboard-saas__text--medium',
      fillClass: 'dashboard-saas__bar-fill--medium',
      toneClass: 'dashboard-saas__card--medium',
    };
  }

  return {
    textClass: 'dashboard-saas__text--bad',
    fillClass: 'dashboard-saas__bar-fill--bad',
    toneClass: 'dashboard-saas__card--bad',
  };
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
  const globalScoreStyles = getScoreStyles(globalComplianceScore);

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
    <section className="dashboard-saas">
      <div className="dashboard-saas__header">
        <h2 className="dashboard-saas__title">Dashboard Ejecutivo</h2>
        <p className="dashboard-saas__subtitle">Cumplimiento SG-SST e indicadores críticos por fase PHVA.</p>
      </div>

      {loading ? <p className="muted">Cargando evaluaciones...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="dashboard-saas__grid">
        <article className="dashboard-saas__card dashboard-saas__card--summary">
          <p className="dashboard-saas__label">Cumplimiento SG-SST</p>
          <p className={`dashboard-saas__summary-value ${globalScoreStyles.textClass}`}>{globalComplianceRounded}%</p>
          <div className="dashboard-saas__bar-track" aria-label="Cumplimiento global">
            <div
              className={`dashboard-saas__bar-fill ${globalScoreStyles.fillClass}`}
              style={{ width: `${Math.min(globalComplianceRounded, 100)}%` }}
            />
          </div>
        </article>

        <article className="dashboard-saas__card dashboard-saas__card--alerts">
          <h3 className="dashboard-saas__card-title">Alertas</h3>
          <div className="dashboard-saas__alerts-grid">
            <div className="dashboard-saas__alert-item dashboard-saas__card--bad">
              <p className="dashboard-saas__metric-label">NO CUMPLE</p>
              <p className="dashboard-saas__metric-value">{noCumpleItems.length}</p>
            </div>
            <div className="dashboard-saas__alert-item dashboard-saas__card--medium">
              <p className="dashboard-saas__metric-label">Planes pendientes</p>
              <p className="dashboard-saas__metric-value">{pendingPlans}</p>
            </div>
          </div>
        </article>

        <article className="dashboard-saas__card dashboard-saas__card--phases">
          <h3 className="dashboard-saas__card-title">Avance por fase PHVA</h3>
          <div className="dashboard-saas__phases-grid">
            {phaseCompliance.map((phase) => {
              const phaseScore = getScoreStyles(phase.score);

              return (
                <div key={phase.phase} className={`dashboard-saas__phase-card ${phaseScore.toneClass}`}>
                  <div className="dashboard-saas__phase-header">
                    <p className="dashboard-saas__phase-title">{phase.label}</p>
                    <p className={`dashboard-saas__phase-value ${phaseScore.textClass}`}>{phase.percentage}%</p>
                  </div>
                  <div className="dashboard-saas__bar-track dashboard-saas__bar-track--small" aria-label={`Cumplimiento ${phase.label}`}>
                    <div
                      className={`dashboard-saas__bar-fill ${phaseScore.fillClass}`}
                      style={{ width: `${Math.min(phase.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="dashboard-saas__card dashboard-saas__card--issues">
          <h3 className="dashboard-saas__card-title">Top 5 hallazgos NO_CUMPLE</h3>
          {topIssues.length > 0 ? (
            <ul className="dashboard-saas__issues-list">
              {topIssues.map((item) => (
                <li key={item._id} className="dashboard-saas__issue-item">
                  <strong>{item.code?.trim() || 'Sin código'}</strong>
                  <span className="muted">{item.improvementPlan?.activity?.trim() || 'Sin plan de mejoramiento definido'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No hay ítems en estado NO_CUMPLE.</p>
          )}
        </article>
      </div>
    </section>
  );
}
