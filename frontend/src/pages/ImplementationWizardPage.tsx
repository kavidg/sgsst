import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import {
  completeWizardOnboarding,
  fetchImplementationPriorities,
  fetchWizardDashboard,
  fetchWizardOverview,
  generateWizardCertificate,
  runWizardAutoValidation,
  PriorityItemModel,
  WizardDashboardModel,
  WizardOverviewModel,
  WizardStepId,
  WizardStepStatus,
} from '../api';
import {
  AdvancedHeader,
  type HeaderAction,
  AdvancedKpiGrid,
  AdvancedPageLayout,
  AdvancedProgressBar,
  AdvancedSection,
} from '../components/advanced-layout';

// Fallback de títulos cuando el backend no envía title (p. ej. historial).
// FASE 3.2.4: moduleRoute ya proviene siempre del backend (STEP_MODULE_ROUTES,
// incluye training → /trainings). STEP_LABELS se conserva para el historial.
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
  copasst_training: 'Capacitación COPASST',
  convivencia_committee: 'Comité de Convivencia',
  training: 'Capacitación',
  communication: 'Comunicación',
  legal_matrix: 'Matriz Legal',
  document_management: 'Gestión Documental',
};

const STEP_DESCRIPTIONS: Record<WizardStepId, string> = {
  company_info: 'Complete los datos generales de la empresa.',
  users_roles: 'Configure usuarios con roles en el sistema.',
  responsible_sst: 'Asigne un responsable del SG-SST.',
  course_50_hours: 'Valide el certificado del curso de 50 horas.',
  sst_policy: 'Cree, apruebe y firme la Política SST.',
  sst_objectives: 'Defina al menos un objetivo SST medible.',
  initial_evaluation: 'Complete la evaluación inicial del SG-SST.',
  annual_plan: 'Cree el Plan Anual de Trabajo.',
  copasst: 'Configure el COPASST o justifique exención.',
  copasst_training: 'Programe y ejecute la capacitación de los integrantes del COPASST (1.1.7).',
  convivencia_committee: 'Configure el Comité de Convivencia o justifique exención.',
  training: 'Defina el plan anual de capacitaciones.',
  communication: 'Genere al menos una comunicación interna.',
  legal_matrix: 'Genere la Matriz Legal.',
  document_management: 'Active el repositorio maestro de documentos.',
};

// Orden canónico de los 15 pasos (misma fuente que el backend).
const ALL_STEP_IDS: WizardStepId[] = [
  'company_info', 'users_roles', 'responsible_sst', 'course_50_hours',
  'sst_policy', 'sst_objectives', 'initial_evaluation', 'annual_plan',
  'copasst', 'copasst_training', 'convivencia_committee', 'training',
  'communication', 'legal_matrix', 'document_management',
];

/**
 * Paso unificado para la UI: combina los datos del ImplementationValidatorEngine
 * (overview: title/percentage/criteria/pendingCriteria/moduleRoute/estimatedImpact)
 * con los datos de historial/certificado del dashboard, degradando a los mapas
 * legacy cuando un campo llega vacío.
 */
interface DisplayStep {
  stepId: WizardStepId;
  status: WizardStepStatus;
  title: string;
  description: string;
  percentage: number;
  criteria: string[];
  pendingCriteria: string[];
  moduleRoute: string;
  details?: string;
  validatedAt?: string;
  estimatedImpact?: string | null;
}

const LEVEL_META: Record<string, { label: string; cls: string; emoji: string }> = {
  EXCELLENT: { label: 'Excelente', cls: 'wiz-badge--excellent', emoji: '🟢' },
  GOOD: { label: 'Bueno', cls: 'wiz-badge--good', emoji: '🔵' },
  FAIR: { label: 'Regular', cls: 'wiz-badge--fair', emoji: '🟡' },
  POOR: { label: 'Bajo', cls: 'wiz-badge--poor', emoji: '🟠' },
  NO_DATA: { label: 'Sin datos', cls: 'wiz-badge--no_data', emoji: '⚪' },
};

const STATUS_META: Record<
  WizardStepStatus,
  { label: string; cls: string; icon: string; iconCls: string; progress: 'success' | 'default' | 'warning' | 'danger' }
> = {
  COMPLETED: { label: 'Completado', cls: 'completed', icon: '✔', iconCls: 'completed', progress: 'success' },
  IN_PROGRESS: { label: 'En progreso', cls: 'inprogress', icon: '⏳', iconCls: 'inprogress', progress: 'default' },
  BLOCKED: { label: 'Bloqueado', cls: 'blocked', icon: '✖', iconCls: 'blocked', progress: 'danger' },
  PENDING: { label: 'Pendiente', cls: 'pending', icon: '○', iconCls: 'pending', progress: 'default' },
};

const RISK_META: Record<string, { label: string; cls: string }> = {
  ALTO: { label: 'ALTO', cls: 'wiz-risk--alto' },
  MEDIO: { label: 'MEDIO', cls: 'wiz-risk--medio' },
  BAJO: { label: 'BAJO', cls: 'wiz-risk--bajo' },
  NINGUNO: { label: 'NINGUNO', cls: 'wiz-risk--ninguno' },
};

export default function ImplementationWizardPage({ token }: { token: string }) {
  const navigate = useNavigate();
  // Fuente primaria: DTO real del ImplementationValidatorEngine.
  const [overview, setOverview] = useState<WizardOverviewModel | null>(null);
  // Fuente secundaria: historial, certificado y flags de onboarding.
  const [dashboard, setDashboard] = useState<WizardDashboardModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedStep, setSelectedStep] = useState<WizardStepId | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [generatingCert, setGeneratingCert] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  // Prioridades reales del ImplementationPriorityEngine (backend).
  const [priorities, setPriorities] = useState<PriorityItemModel[] | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };
  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    // Los endpoints son tolerantes (TTL de 5 min); se cargan en paralelo y
    // cada uno degrada independientemente (Promise.allSettled nunca rechaza).
    const [ovResult, dashResult, prioritiesResult] = await Promise.allSettled([
      fetchWizardOverview(token),
      fetchWizardDashboard(token),
      fetchImplementationPriorities(token),
    ]);

    const ov = ovResult.status === 'fulfilled' ? ovResult.value : null;
    const dash = dashResult.status === 'fulfilled' ? dashResult.value : null;
    // null = endpoint de prioridades no disponible (fallback seguro).
    const prio = prioritiesResult.status === 'fulfilled' ? prioritiesResult.value.priorities : null;
    setOverview(ov);
    setDashboard(dash);
    setPriorities(prio);

    const pct = ov?.overallPercentage ?? dash?.completionPercentage ?? 0;
    if (dash && !dash.isOnboardingComplete && pct < 30) {
      setShowOnboarding(true);
    }
    if (!ov && !dash) {
      showError('Error al cargar wizard');
    } else if (ov && !dash) {
      showError('Datos de historial y certificado no disponibles temporalmente');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // ─── Combinación segura de estados ───
  const overallPercentage = overview?.overallPercentage ?? dashboard?.completionPercentage ?? 0;
  const overallScore = overview?.overallScore ?? dashboard?.overallScore ?? 0;
  const completedSteps = overview?.completedSteps ?? dashboard?.completedSteps ?? 0;
  const totalSteps = overview?.totalSteps ?? dashboard?.totalSteps ?? ALL_STEP_IDS.length;
  const pendingSteps = overview
    ? overview.steps.filter((s) => s.status === 'PENDING').length
    : (dashboard?.pendingSteps ?? 0);
  const inProgressSteps = overview
    ? overview.steps.filter((s) => s.status === 'IN_PROGRESS').length
    : (dashboard?.inProgressSteps ?? 0);
  const isImplementationComplete = overview?.isImplementationComplete ?? dashboard?.isImplementationComplete ?? false;
  const certificateGenerated = dashboard?.certificateGenerated ?? false;
  const certificateVerificationCode = dashboard?.certificateVerificationCode;
  const lastValidatedAt = overview?.lastValidatedAt ?? dashboard?.lastValidatedAt ?? null;
  // Nivel del motor; si el overview no responde se deriva del % (misma regla
  // que classifyImplementationLevel del backend) para no mostrar "Sin datos".
  const level = overview?.level
    ?? (overallPercentage >= 80 ? 'EXCELLENT' : overallPercentage >= 60 ? 'GOOD' : overallPercentage >= 40 ? 'FAIR' : overallPercentage > 0 ? 'POOR' : 'NO_DATA');
  const levelMeta = LEVEL_META[level] ?? LEVEL_META.NO_DATA;
  const history = dashboard?.history ?? [];

  // Pasos unificados: overview primero, dashboard después, legacy al final.
  const displaySteps = useMemo<DisplayStep[]>(() => {
    return ALL_STEP_IDS.map((stepId) => {
      const ov = overview?.steps.find((s) => s.stepId === stepId);
      const db = dashboard?.steps.find((s) => s.stepId === stepId);
      return {
        stepId,
        status: ov?.status ?? db?.status ?? 'PENDING',
        title: ov?.title || db?.title || db?.label || STEP_LABELS[stepId] || stepId,
        description: db?.description || STEP_DESCRIPTIONS[stepId] || '',
        percentage: ov?.percentage ?? db?.percentage ?? db?.score ?? 0,
        criteria: ov?.criteria ?? db?.criteria ?? [],
        pendingCriteria: ov?.pendingCriteria ?? db?.pendingCriteria ?? [],
        moduleRoute: ov?.moduleRoute || db?.moduleRoute || '',
        details: db?.details,
        validatedAt: db?.validatedAt,
        estimatedImpact: ov?.estimatedImpact ?? null,
      };
    });
  }, [overview, dashboard]);

  const handleCompleteOnboarding = async () => {
    try {
      const updated = await completeWizardOnboarding(token);
      setDashboard(updated);
      setShowOnboarding(false);
      notify('¡Bienvenido! Puede comenzar la implementación.');
      void load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleGenerateCertificate = async () => {
    setGeneratingCert(true);
    try {
      const updated = await generateWizardCertificate(token);
      setDashboard(updated);
      notify(`¡Certificado generado! Código: ${updated.certificateVerificationCode}`);
      void load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al generar certificado');
    } finally {
      setGeneratingCert(false);
    }
  };

  /**
   * Actualiza el análisis ejecutando el motor real (POST /auto-validate).
   */
  const handleRevalidate = async () => {
    setRevalidating(true);
    try {
      await runWizardAutoValidation(token);
      notify('Análisis actualizado con datos reales de los módulos');
      void load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al actualizar análisis');
    } finally {
      setRevalidating(false);
    }
  };

  const handleGoToRoute = (route: string) => {
    if (route) navigate(route);
  };

  // Acorde visual hero/barra: azul (info) para empresas nuevas al 0%.
  const heroAccent = overallPercentage >= 80 ? 'success' : overallPercentage >= 40 ? 'warning' : overallPercentage > 0 ? 'danger' : 'info';
  const progressVariant = overallPercentage >= 80 ? 'success' : overallPercentage >= 40 ? 'warning' : overallPercentage > 0 ? 'danger' : 'default';

  const headerActions: HeaderAction[] = [
    {
      label: revalidating ? 'Analizando...' : '🔄 Actualizar análisis',
      onClick: () => void handleRevalidate(),
      variant: 'secondary',
      disabled: revalidating,
    },
  ];
  if (isImplementationComplete && !certificateGenerated) {
    headerActions.push({
      label: generatingCert ? 'Generando...' : '🏅 Generar Certificado',
      onClick: () => void handleGenerateCertificate(),
      variant: 'primary',
      disabled: generatingCert,
    });
  }

  if (!overview && !dashboard) {
    return (
      <AdvancedPageLayout>
        <div className="card">
          <p className="muted">{loading ? 'Cargando centro de implementación...' : 'No hay datos disponibles.'}</p>
        </div>
      </AdvancedPageLayout>
    );
  }

  return (
    <AdvancedPageLayout>
      {/* Onboarding Modal */}
      {showOnboarding && (
        <div className="modal-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: 520, padding: 32, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0 }}>Bienvenido al Sistema de Gestión SST</h2>
            <p className="muted" style={{ marginBottom: 24, lineHeight: 1.6 }}>
              Complete los pasos iniciales para comenzar la implementación del SG-SST.
              Este asistente le guiará a través de los 15 pasos necesarios para una implementación completa.
            </p>
            <div className="actions" style={{ justifyContent: 'center', gap: 12 }}>
              <Button type="button" onClick={handleCompleteOnboarding}>Iniciar implementación</Button>
              <Button type="button" variant="secondary" onClick={() => setShowOnboarding(false)}>Continuar más tarde</Button>
            </div>
          </div>
        </div>
      )}

      {/* Hero ejecutivo */}
      <AdvancedHeader
        moduleCode="SG-SST"
        moduleTitle="Centro de Implementación SG-SST"
        description={`Motor real de validación · ${totalSteps} módulos según Resolución 0312 de 2019 · ${completedSteps} completados · ${pendingSteps} pendientes`}
        statusBadge={
          <span className={`wiz-badge ${levelMeta.cls}`}>
            {levelMeta.emoji} Nivel {levelMeta.label}
          </span>
        }
        actions={headerActions}
        lastSaved={lastValidatedAt
          ? `Última validación automática: ${new Date(lastValidatedAt).toLocaleString()}`
          : undefined}
      />

      {/* Barra ejecutiva */}
      <AdvancedSection accent={heroAccent} className="wiz-hero">
        <div className="wiz-hero__main">
          <div className="wiz-hero__value">
            <span className="wiz-hero__pct">{overallPercentage}%</span>
            <span className="wiz-hero__label">Implementado</span>
          </div>
          <div className="wiz-hero__progress">
            <AdvancedProgressBar value={overallPercentage} size="lg" variant={progressVariant} showPercentage={false} />
            <div className="wiz-hero__meta">
              <span><strong>{overallScore}%</strong> Puntaje general</span>
              <span><strong>{completedSteps}/{totalSteps}</strong> pasos completados</span>
              <span>{isImplementationComplete ? '✅ Implementación completa' : '🚧 En implementación'}</span>
            </div>
          </div>
        </div>
      </AdvancedSection>

      {/* Grid de KPIs */}
      <AdvancedKpiGrid
        columns={4}
        items={[
          { label: 'Puntaje General', value: `${overallScore}%`, variant: 'info', icon: '🎯' },
          { label: 'Pasos Completados', value: `${completedSteps}/${totalSteps}`, variant: 'success', icon: '✅' },
          { label: 'En Progreso', value: inProgressSteps, variant: 'default', icon: '⏳' },
          { label: 'Pendientes', value: pendingSteps, variant: 'warning', icon: '⏰' },
        ]}
      />

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="advanced-management__success">{success}</p> : null}

      {/* Acciones Prioritarias — motor real del backend */}
      <AdvancedSection
        title="Acciones Prioritarias"
        description="Prioridades calculadas por el motor (score, riesgo, dependencias y desbloqueos)"
        accent="warning"
        headerRight={priorities && priorities.length > 0 ? (
          <span className="wiz-badge wiz-badge--count">{priorities.length} priorizadas</span>
        ) : undefined}
      >
        {priorities === null ? (
          <p className="muted" style={{ margin: 0 }}>
            Prioridades no disponibles en este momento.
          </p>
        ) : priorities.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            🎉 No hay acciones pendientes con impacto recuperable. ¡La implementación está al día!
          </p>
        ) : (
          <div className="wiz-priority">
            {priorities.map((p) => {
              const riskMeta = RISK_META[p.riskLevel] ?? RISK_META.MEDIO;
              return (
                <div className="wiz-priority__item" key={p.stepId}>
                  <span className="wiz-priority__rank">{p.rank}</span>
                  <div className="wiz-priority__body">
                    <span className="wiz-priority__title">{p.title}</span>
                    {p.recommendedAction && (
                      <span className="wiz-priority__meta">{p.recommendedAction}</span>
                    )}
                    {p.pendingCriteria.length > 0 && (
                      <span className="wiz-priority__meta">
                        Pendiente: {p.pendingCriteria.slice(0, 2).join(' · ')}
                      </span>
                    )}
                    {p.blockedBy.length > 0 && (
                      <span className="wiz-priority__deps wiz-priority__deps--blocked">
                        ⛔ Requiere primero: {p.blockedBy.map((b) => STEP_LABELS[b as WizardStepId] ?? b).join(', ')}
                      </span>
                    )}
                    {p.unlocks.length > 0 && (
                      <span className="wiz-priority__deps wiz-priority__deps--unlock">
                        🔓 Desbloquea: {p.unlocks.map((u) => STEP_LABELS[u as WizardStepId] ?? u).join(', ')}
                      </span>
                    )}
                  </div>
                  <span className="wiz-score">{p.priorityScore}/100</span>
                  {p.estimatedImpact && <span className="wiz-impact">{p.estimatedImpact}</span>}
                  <span className={`wiz-risk ${riskMeta.cls}`}>{riskMeta.label}</span>
                  {p.moduleRoute && (
                    <Button type="button" variant="secondary" onClick={() => handleGoToRoute(p.moduleRoute)}>
                      Ir al módulo
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </AdvancedSection>

      {/* Certificado */}
      {certificateGenerated && (
        <AdvancedSection title="Certificado de Implementación" accent="success">
          <div className="wiz-cert">
            <span className="wiz-cert__icon">🏅</span>
            <div>
              <strong>Certificado de Implementación generado</strong>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                Código de verificación: <strong>{certificateVerificationCode}</strong>
              </p>
            </div>
          </div>
        </AdvancedSection>
      )}

      {/* Tarjetas por módulo */}
      <AdvancedSection
        title="Módulos de Implementación"
        description="Cada tarjeta muestra el avance real calculado por el motor de validación"
      >
        <div className="wiz-grid">
          {displaySteps.map((step) => {
            const isSelected = selectedStep === step.stepId;
            const statusMeta = STATUS_META[step.status] ?? STATUS_META.PENDING;
            return (
              <article key={step.stepId} className={`wiz-card ${isSelected ? 'wiz-card--selected' : ''}`}>
                <div className="wiz-card__header">
                  <div className="wiz-card__title">
                    <span className={`wiz-card__icon wiz-card__icon--${statusMeta.iconCls}`}>{statusMeta.icon}</span>
                    <strong>{step.title}</strong>
                  </div>
                  <span className={`wiz-status wiz-status--${statusMeta.cls}`}>{statusMeta.label}</span>
                </div>

                <AdvancedProgressBar value={step.percentage} size="sm" variant={statusMeta.progress} showPercentage={false} />

                <div className="wiz-card__footer">
                  <span className="wiz-card__detail">{step.percentage}%</span>
                  {step.estimatedImpact && <span className="wiz-impact">{step.estimatedImpact}</span>}
                  <button
                    type="button"
                    className="wiz-card__toggle"
                    onClick={() => setSelectedStep(isSelected ? null : step.stepId)}
                  >
                    {isSelected ? '▲ Ocultar' : '▼ Detalle'}
                  </button>
                </div>

                {isSelected && (
                  <div className="wiz-card__body">
                    <p className="muted" style={{ margin: '4px 0 8px', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      {step.description}
                    </p>

                    {step.criteria.length > 0 && (
                      <div className="wiz-criteria">
                        <strong>✓ Completado</strong>
                        <ul>
                          {step.criteria.map((criterion, i) => (
                            <li key={i}>{criterion}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {step.pendingCriteria.length > 0 && (
                      <div className="wiz-pending">
                        <strong>⚠ Pendiente</strong>
                        <ul>
                          {step.pendingCriteria.map((criterion, i) => (
                            <li key={i}>{criterion}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {step.details && (
                      <p className="wiz-card__detail" style={{ margin: '6px 0 0' }}>Detalles: {step.details}</p>
                    )}
                    {step.validatedAt && (
                      <p className="wiz-card__detail" style={{ margin: '4px 0 0' }}>
                        Última validación: {new Date(step.validatedAt).toLocaleString()}
                      </p>
                    )}

                    {step.moduleRoute && (
                      <div style={{ marginTop: 8 }}>
                        <Button type="button" onClick={() => handleGoToRoute(step.moduleRoute)}>Ir al módulo</Button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </AdvancedSection>

      {/* Historial */}
      {history.length > 0 && (
        <AdvancedSection title="Historial de Implementación" description="Registro de las últimas acciones y validaciones">
          <div className="timeline">
            {history.slice(0, 10).map((entry, idx) => (
              <article key={idx} className="timeline__item">
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.85rem' }}>
                    {entry.action === 'ONBOARDING_COMPLETED' ? 'Onboarding completado' :
                     entry.action === 'STEP_VALIDATED' ? `Paso validado: ${entry.stepId ? (STEP_LABELS[entry.stepId] || entry.stepId) : ''}` :
                     entry.action === 'STEP_STATUS_CHANGED' ? `Estado cambiado: ${entry.stepId ? (STEP_LABELS[entry.stepId] || entry.stepId) : ''}` :
                     entry.action === 'CERTIFICATE_GENERATED' ? 'Certificado generado' :
                     entry.action === 'AUTO_VALIDATION_RUN' ? 'Validación automática' :
                     entry.action}
                  </strong>
                  <small className="muted">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</small>
                </div>
                {entry.description && <small className="muted" style={{ display: 'block' }}>{entry.description}</small>}
              </article>
            ))}
          </div>
        </AdvancedSection>
      )}

      <div className="advanced-management__footer">
        <span className="muted">{totalSteps} pasos · {completedSteps} completados · Puntaje: {overallScore}%</span>
        <Button type="button" variant="ghost" onClick={() => void load()}>Recargar</Button>
      </div>
    </AdvancedPageLayout>
  );
}
