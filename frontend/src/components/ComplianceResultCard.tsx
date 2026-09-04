import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardModuleCompliance, DashboardFinding } from '../types/compliance-dashboard';
import { Button } from './ui/Button';

type Props = {
  token: string;
  module: string;
  standardCode: string;
  standardTitle: string;
  actionRoute?: string;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  NO_DATA: { label: 'Sin datos suficientes', color: '#64748b', bg: '#f1f5f9', icon: '📭' },
  TARGET_MET: { label: 'Cumplimiento objetivo', color: '#15803d', bg: '#f0fdf4', icon: '✅' },
  TARGET_NOT_MET: { label: 'Cumplimiento por mejorar', color: '#d97706', bg: '#fffbeb', icon: '⚠️' },
  CRITICAL: { label: 'Crítico', color: '#dc2626', bg: '#fef2f2', icon: '🔴' },
  LOW: { label: 'Bajo', color: '#ea580c', bg: '#fff7ed', icon: '🟠' },
  MEDIUM: { label: 'Medio', color: '#d97706', bg: '#fffbeb', icon: '🟡' },
  HIGH: { label: 'Alto', color: '#16a34a', bg: '#f0fdf4', icon: '🟢' },
  EXCELLENT: { label: 'Excelente', color: '#15803d', bg: '#f0fdf4', icon: '🌟' },
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#94a3b8',
  MEDIUM: '#d97706',
  HIGH: '#ea580c',
  CRITICAL: '#dc2626',
};

function getProgressColor(pct: number): string {
  if (pct >= 90) return '#16a34a';
  if (pct >= 70) return '#2563eb';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

export function ComplianceResultCard({ token, module: moduleKey, standardCode, standardTitle, actionRoute }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleData, setModuleData] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getOverview(token, '')
      .then((overview) => {
        if (cancelled) return;
        const mod = overview.moduleCompliance.find((m) => m.module === moduleKey);
        setModuleData(mod ?? null);
        setFindings(overview.findings.filter((f) => f.module === moduleKey));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error al consultar cumplimiento');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, moduleKey]);

  if (loading) {
    return (
      <div className="crc-card crc-card--loading">
        <div className="crc-skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="crc-card crc-card--error">
        <p className="crc-error__text">No fue posible consultar el cumplimiento</p>
        <p className="crc-error__hint">{error}</p>
        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>Reintentar</Button>
      </div>
    );
  }

  if (!moduleData) {
    return null;
  }

  const statusInfo = STATUS_MAP[moduleData.level] ?? STATUS_MAP.MEDIUM;
  const noData = moduleData.level === 'NO_DATA' || moduleData.compliance === 0;

  return (
    <div className="crc-card">
      <div className="crc-header">
        <div className="crc-header__left">
          <span className="crc-header__icon">{statusInfo.icon}</span>
          <div>
            <h4 className="crc-header__title">Cumplimiento — {standardTitle}</h4>
            <p className="crc-header__subtitle">Evaluado automáticamente por ComplianceEngine</p>
          </div>
        </div>
        {actionRoute && (
          <Button type="button" variant="secondary" className="crc-action-btn" onClick={() => navigate(actionRoute)}>
            Gestionar
          </Button>
        )}
      </div>

      {noData ? (
        <div className="crc-nodata">
          <div className="crc-nodata__icon">📭</div>
          <p className="crc-nodata__title">Aún no hay datos suficientes</p>
          <p className="crc-nodata__desc">
            No existen datos suficientes para evaluar el estándar {standardCode} ({standardTitle}). Registra la información requerida en el módulo correspondiente.
          </p>
          {actionRoute && (
            <Button type="button" onClick={() => navigate(actionRoute)}>
              Ir a {standardTitle}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Score */}
          <div className="crc-score">
            <span className="crc-score__value" style={{ color: getProgressColor(moduleData.compliance) }}>
              {moduleData.compliance}%
            </span>
            <span className="crc-score__label">Cumplimiento actual</span>
          </div>

          {/* Progress bar */}
          <div className="crc-progress">
            <div
              className="crc-progress__track"
              role="progressbar"
              aria-valuenow={moduleData.compliance}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="crc-progress__fill"
                style={{
                  width: `${Math.max(0, Math.min(100, moduleData.compliance))}%`,
                  backgroundColor: getProgressColor(moduleData.compliance),
                }}
              />
            </div>
          </div>

          {/* Status badge */}
          <div className="crc-status" style={{ backgroundColor: statusInfo.bg, color: statusInfo.color, border: `1px solid ${statusInfo.color}20` }}>
            {statusInfo.label}
          </div>
        </>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="crc-findings">
          <h5 className="crc-findings__title">Hallazgos ({findings.length})</h5>
          {findings.map((f) => (
            <div key={f.id} className="crc-finding">
              <div className="crc-finding__header">
                <span className="crc-finding__priority" style={{ backgroundColor: PRIORITY_COLORS[f.priority] ?? '#94a3b8' }}>
                  {f.priority}
                </span>
                <span className="crc-finding__title">{f.title}</span>
              </div>
              {f.description && <p className="crc-finding__desc">{f.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
