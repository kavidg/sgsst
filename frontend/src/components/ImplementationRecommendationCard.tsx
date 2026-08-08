import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchImplementationPriorities,
  fetchWizardDashboard,
  PriorityItemModel,
  WizardDashboardModel,
  WizardStepId,
} from '../api';

type UserRole = 'owner' | 'admin' | 'member' | 'manager';

type ImplRecCardProps = {
  token: string;
  role?: UserRole;
};

const DISMISS_STORAGE_PREFIX = 'impl-rec-dismiss-';

function isDismissed(companyId: string): boolean {
  try {
    const stored = localStorage.getItem(`${DISMISS_STORAGE_PREFIX}${companyId}`);
    if (!stored) return false;
    const expiry = Number(stored);
    return Date.now() < expiry;
  } catch {
    return false;
  }
}

function setDismissed(companyId: string) {
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${companyId}`, String(expiry));
}

const STEP_LABELS: Record<WizardStepId, string> = {
  company_info: 'Información Empresa',
  users_roles: 'Usuarios y Roles',
  responsible_sst: 'Responsable SG-SST',
  course_50_hours: 'Curso 50 Horas',
  sst_policy: 'Política SST',
  sst_objectives: 'Objetivos SST',
  initial_evaluation: 'Evaluación Inicial',
  annual_plan: 'Plan Anual',
  copasst: 'COPASST',
  convivencia_committee: 'Comité de Convivencia',
  training: 'Capacitación',
  communication: 'Comunicación',
  legal_matrix: 'Matriz Legal',
  document_management: 'Gestión Documental',
};

export function ImplementationRecommendationCard({ token, role }: ImplRecCardProps) {
  const navigate = useNavigate();
  const [wizard, setWizard] = useState<WizardDashboardModel | null>(null);
  // Prioridades reales del ImplementationPriorityEngine (null = no disponibles).
  const [priorities, setPriorities] = useState<PriorityItemModel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissedState] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // El dashboard y las prioridades del motor degradan de forma independiente.
    const [dashResult, prioResult] = await Promise.allSettled([
      fetchWizardDashboard(token),
      fetchImplementationPriorities(token),
    ]);
    if (dashResult.status === 'fulfilled') setWizard(dashResult.value);
    if (prioResult.status === 'fulfilled') setPriorities(prioResult.value.priorities);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const companyId = useMemo(() => {
    try {
      return localStorage.getItem('activeCompanyId') ?? '';
    } catch {
      return '';
    }
  }, []);

  // Check if dismissed on mount & when companyId changes
  useEffect(() => {
    if (companyId && isDismissed(companyId)) {
      setDismissedState(true);
    } else {
      setDismissedState(false);
    }
  }, [companyId]);

  const handleDismiss = () => {
    if (companyId) {
      setDismissed(companyId);
      setDismissedState(true);
    }
  };

  const handleGoToImpCenter = () => {
    navigate('/implementation-wizard');
  };

  // If loading or no data, show nothing (loading handled by parent)
  if (loading || !wizard || dismissed) return null; // Silently fail — don't pollute dashboard
  if (wizard.isImplementationComplete || wizard.completionPercentage >= 100) return null;

  const pct = wizard.completionPercentage;

  // Determine card color theme
  const isRed = pct >= 0 && pct <= 25;
  const isYellow = pct > 25 && pct <= 75;
  const isBlue = pct > 75 && pct < 100;

  const themeColors = isRed
    ? { border: '#fecaca', bg: '#fef2f2', accent: '#dc2626', text: '#991b1b', bar: 'linear-gradient(90deg, #f87171, #dc2626)', badgeBg: '#fee2e2', badgeText: '#991b1b' }
    : isYellow
    ? { border: '#fde68a', bg: '#fffbeb', accent: '#d97706', text: '#92400e', bar: 'linear-gradient(90deg, #facc15, #ca8a04)', badgeBg: '#fef9c3', badgeText: '#854d0e' }
    : { border: '#bfdbfe', bg: '#eff6ff', accent: '#2563eb', text: '#1e40af', bar: 'linear-gradient(90deg, #60a5fa, #2563eb)', badgeBg: '#dbeafe', badgeText: '#1e40af' };

  // Pending steps (not completed)
  const pendingSteps = wizard.steps.filter((s) => s.status !== 'COMPLETED');
  const completedSteps = wizard.completedSteps;
  const totalSteps = wizard.totalSteps;

  // Manager view: simplified
  const isManager = role === 'manager';

  return (
    <article
      className="card"
      style={{
        border: `1px solid ${themeColors.border}`,
        background: themeColors.bg,
        borderRadius: '1rem',
        padding: '1.25rem',
        display: 'grid',
        gap: '1rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'grid', gap: '0.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: themeColors.text }}>
            {isRed ? '⚠️ ' : isBlue ? '📋 ' : '⚡ '}
            {isManager
              ? 'Progreso de Implementación SG-SST'
              : '🚀 Complete la implementación inicial del SG-SST'}
          </h3>
          {!isManager && (
            <p className="muted" style={{ fontSize: '0.9rem', color: themeColors.text, opacity: 0.8 }}>
              Para obtener el máximo beneficio del sistema y cumplir con los requisitos iniciales del SG-SST,
              complete los pasos de implementación pendientes.
            </p>
          )}
        </div>

        {/* Percentage badge */}
        <span
          style={{
            borderRadius: '999px',
            padding: '0.3rem 0.75rem',
            fontSize: '1rem',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            background: themeColors.badgeBg,
            color: themeColors.badgeText,
            border: `1px solid ${themeColors.border}`,
          }}
        >
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="objective-progress" style={{ margin: 0 }}>
        <div className="objective-progress__track" style={{ height: '0.85rem' }}>
          <span
            className="objective-progress__bar"
            style={{
              width: `${pct}%`,
              background: themeColors.bar,
              borderRadius: '999px',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <strong style={{ fontSize: '0.85rem', minWidth: '3rem', color: themeColors.text }}>
          {pct}%
        </strong>
      </div>

      {/* Completed vs Pending summary */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.9rem', color: '#15803d', fontWeight: 600 }}>
          ✔ {completedSteps} de {totalSteps} pasos completados
        </span>
        <span style={{ fontSize: '0.9rem', color: themeColors.accent, fontWeight: 600 }}>
          ⚠ {pendingSteps.length} pendientes
        </span>
      </div>

      {/* Prioridades del motor (top 5) — fallback seguro si no hay endpoint */}
      {!isManager && priorities && priorities.length > 0 && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
            🎯 Prioridades del motor:
          </p>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.3rem' }}>
            {priorities.slice(0, 5).map((p) => (
              <li key={p.stepId} style={{ fontSize: '0.88rem', color: '#334155' }}>
                {STEP_LABELS[p.stepId] || p.title}
                <span style={{ color: themeColors.accent, fontWeight: 700 }}> · {p.priorityScore}/100</span>
                {p.estimatedImpact ? ` · ${p.estimatedImpact}` : ''}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Actions */}
      <div className="actions" style={{ gap: '0.65rem', justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{
            background: themeColors.accent,
            borderRadius: '0.85rem',
            padding: '0.6rem 1.1rem',
            fontWeight: 600,
          }}
          onClick={handleGoToImpCenter}
        >
          Ir al Centro de Implementación
        </button>
        {!isManager && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              borderRadius: '0.85rem',
              padding: '0.6rem 1.1rem',
              fontWeight: 600,
            }}
            onClick={handleDismiss}
          >
            Recordarme más tarde
          </button>
        )}
      </div>
    </article>
  );
}
