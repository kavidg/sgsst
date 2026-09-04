import { useEffect, useState } from 'react';
import { Button } from './ui/Button';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

type Props = {
  token: string;
  standardCode: string;
};

type KeyIssue = {
  id: string;
  title: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: string;
  recommendation: string;
};

type EvidenceContext = {
  standardCode: string;
  totalDocuments: number;
  activeDocuments: number;
  expiredDocuments: number;
  expiringDocuments: number;
  pendingApprovalDocuments: number;
  acquisitionsWithDocuments: number;
  acquisitionsWithoutDocuments: number;
  suppliersWithDocuments: number;
  suppliersWithoutDocuments: number;
  documentCoveragePercentage: number;
  evidenceFindings: Array<{ id: string; type: string; description: string }>;
  approvalMetrics?: {
    totalPending: number;
    totalApproved: number;
    totalRejected: number;
  };
};

type AnalysisResponse = {
  standardCode: string;
  standardTitle: string;
  module: string;
  compliancePercentage: number;
  complianceStatus: string;
  level: string;
  analysis: {
    summary: string;
    keyIssues: KeyIssue[];
    quickWins: string[];
    nextSteps: string[];
  };
  metrics: Record<string, number>;
  evaluatedAt: string;
  dataAvailable: boolean;
  evidence?: EvidenceContext;
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  HIGH: { label: 'Alta', color: '#dc2626', bg: '#fef2f2', icon: '🔴' },
  MEDIUM: { label: 'Media', color: '#d97706', bg: '#fffbeb', icon: '🟠' },
  LOW: { label: 'Baja', color: '#94a3b8', bg: '#f1f5f9', icon: '⚪' },
};

export function ComplianceAIInsight({ token, standardCode }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalysisResponse | null>(null);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${BACKEND_URL}/compliance-ai/standard-analysis/${standardCode}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.message ?? 'Error al generar el análisis';
        throw new Error(Array.isArray(message) ? message.join(', ') : message);
      }

      const result: AnalysisResponse = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible generar el análisis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && standardCode) {
      void fetchAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, standardCode]);

  if (loading) {
    return (
      <div className="cai-card cai-card--loading">
        <div className="cai-header">
          <span className="cai-header__icon">🧠</span>
          <div>
            <h4 className="cai-header__title">Análisis inteligente</h4>
            <p className="cai-header__subtitle">Interpretación de los datos actuales de cumplimiento</p>
          </div>
        </div>
        <div className="cai-skeleton" />
        <div className="cai-skeleton cai-skeleton--short" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cai-card cai-card--error">
        <div className="cai-header">
          <span className="cai-header__icon">🧠</span>
          <div>
            <h4 className="cai-header__title">Análisis inteligente</h4>
            <p className="cai-header__subtitle">No fue posible generar el análisis</p>
          </div>
        </div>
        <p className="cai-error__text">{error}</p>
        <Button type="button" variant="secondary" onClick={() => void fetchAnalysis()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { analysis } = data;

  if (!data.dataAvailable) {
    return (
      <div className="cai-card cai-card--nodata">
        <div className="cai-header">
          <span className="cai-header__icon">🧠</span>
          <div>
            <h4 className="cai-header__title">Análisis inteligente</h4>
            <p className="cai-header__subtitle">Interpretación de los datos actuales de cumplimiento</p>
          </div>
        </div>
        <p className="cai-nodata__text">{analysis.summary}</p>
        {analysis.quickWins.length > 0 && (
          <div className="cai-section">
            <h5 className="cai-section__title">Acciones sugeridas</h5>
            <ul className="cai-list">
              {analysis.quickWins.map((win, i) => (
                <li key={i} className="cai-list__item">{win}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cai-card">
      <div className="cai-header">
        <span className="cai-header__icon">🧠</span>
        <div>
          <h4 className="cai-header__title">Análisis inteligente</h4>
          <p className="cai-header__subtitle">Interpretación de los datos actuales de cumplimiento</p>
        </div>
      </div>

      {/* Summary */}
      <p className="cai-summary">{analysis.summary}</p>

      {/* Key Issues */}
      {analysis.keyIssues.length > 0 && (
        <div className="cai-section">
          <h5 className="cai-section__title">Principales problemas</h5>
          {analysis.keyIssues.map((issue) => {
            const config = PRIORITY_CONFIG[issue.priority] ?? PRIORITY_CONFIG.LOW;
            return (
              <div key={issue.id} className="cai-issue" style={{ borderLeftColor: config.color }}>
                <div className="cai-issue__header">
                  <span className="cai-issue__priority" style={{ backgroundColor: config.bg, color: config.color }}>
                    {config.icon} {config.label}
                  </span>
                  <span className="cai-issue__title">{issue.title}</span>
                </div>
                <p className="cai-issue__impact">{issue.impact}</p>
                <p className="cai-issue__recommendation">
                  <strong>Recomendación:</strong> {issue.recommendation}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Wins */}
      {analysis.quickWins.length > 0 && (
        <div className="cai-section">
          <h5 className="cai-section__title">Acciones rápidas</h5>
          <ul className="cai-list">
            {analysis.quickWins.map((win, i) => (
              <li key={i} className="cai-list__item cai-list__item--win">
                <span className="cai-list__check">✅</span> {win}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next Steps */}
      {analysis.nextSteps.length > 0 && (
        <div className="cai-section">
          <h5 className="cai-section__title">Siguientes pasos</h5>
          <ol className="cai-list cai-list--ordered">
            {analysis.nextSteps.map((step, i) => (
              <li key={i} className="cai-list__item">{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Evidencia documental */}
      {data.evidence && (
        <div className="cai-section cai-evidence">
          <h5 className="cai-section__title">
            <span className="cai-evidence__icon">📄</span> Evidencia documental
          </h5>

          {data.evidence.totalDocuments === 0 && data.evidence.acquisitionsWithDocuments === 0 ? (
            <p className="cai-evidence__empty">
              No hay evidencia documental relacionada con adquisiciones registrada actualmente.
            </p>
          ) : (
            <>
              <div className="cai-evidence__grid">
                <div className="cai-evidence__kpi">
                  <span className="cai-evidence__kpi-value">{data.evidence.totalDocuments}</span>
                  <span className="cai-evidence__kpi-label">Documentos</span>
                </div>
                <div className="cai-evidence__kpi">
                  <span className="cai-evidence__kpi-value cai-evidence__kpi-value--active">{data.evidence.activeDocuments}</span>
                  <span className="cai-evidence__kpi-label">Activos</span>
                </div>
                {data.evidence.expiredDocuments > 0 && (
                  <div className="cai-evidence__kpi">
                    <span className="cai-evidence__kpi-value cai-evidence__kpi-value--expired">{data.evidence.expiredDocuments}</span>
                    <span className="cai-evidence__kpi-label">Vencidos</span>
                  </div>
                )}
                {data.evidence.expiringDocuments > 0 && (
                  <div className="cai-evidence__kpi">
                    <span className="cai-evidence__kpi-value cai-evidence__kpi-value--expiring">{data.evidence.expiringDocuments}</span>
                    <span className="cai-evidence__kpi-label">Por vencer</span>
                  </div>
                )}
              </div>

              <div className="cai-evidence__coverage">
                <div className="cai-evidence__coverage-bar">
                  <div
                    className="cai-evidence__coverage-fill"
                    style={{ width: `${data.evidence.documentCoveragePercentage}%` }}
                  />
                </div>
                <span className="cai-evidence__coverage-text">
                  {data.evidence.acquisitionsWithDocuments} de {data.evidence.acquisitionsWithDocuments + data.evidence.acquisitionsWithoutDocuments} adquisiciones con evidencia ({data.evidence.documentCoveragePercentage}%)
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Métricas de aprobación */}
      {data.evidence?.approvalMetrics && (
        <div className="cai-section cai-approval-metrics">
          <h5 className="cai-section__title">
            <span className="cai-evidence__icon">📋</span> Aprobaciones
          </h5>

          {data.evidence.approvalMetrics.totalPending === 0 &&
           data.evidence.approvalMetrics.totalApproved === 0 &&
           data.evidence.approvalMetrics.totalRejected === 0 ? (
            <p className="cai-evidence__empty">
              Sin información de aprobación disponible.
            </p>
          ) : (
            <div className="cai-evidence__grid cai-approval-metrics__grid">
              {data.evidence.approvalMetrics.totalPending > 0 && (
                <div className="cai-evidence__kpi">
                  <span className="cai-evidence__kpi-value cai-evidence__kpi-value--expiring">
                    {data.evidence.approvalMetrics.totalPending}
                  </span>
                  <span className="cai-evidence__kpi-label">Pendientes</span>
                </div>
              )}
              {data.evidence.approvalMetrics.totalApproved > 0 && (
                <div className="cai-evidence__kpi">
                  <span className="cai-evidence__kpi-value cai-evidence__kpi-value--active">
                    {data.evidence.approvalMetrics.totalApproved}
                  </span>
                  <span className="cai-evidence__kpi-label">Aprobadas</span>
                </div>
              )}
              {data.evidence.approvalMetrics.totalRejected > 0 && (
                <div className="cai-evidence__kpi">
                  <span className="cai-evidence__kpi-value cai-evidence__kpi-value--expired">
                    {data.evidence.approvalMetrics.totalRejected}
                  </span>
                  <span className="cai-evidence__kpi-label">Rechazadas</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
