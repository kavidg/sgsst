import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import {
  fetchWizardDashboard,
  completeWizardOnboarding,
  generateWizardCertificate,
  updateWizardStep,
  WizardDashboardModel,
  WizardStepId,
  WizardStepStatus,
} from '../api';

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
  convivencia_committee: 'Configure el Comité de Convivencia o justifique exención.',
  training: 'Defina el plan anual de capacitaciones.',
  communication: 'Genere al menos una comunicación interna.',
  legal_matrix: 'Genere la Matriz Legal.',
  document_management: 'Active el repositorio maestro de documentos.',
};

const STEP_MODULES: Record<WizardStepId, string> = {
  company_info: '/company-configuration',
  users_roles: '/users',
  responsible_sst: '/company-configuration',
  course_50_hours: '/company-configuration',
  sst_policy: '/documents/plan',
  sst_objectives: '/documents/plan',
  initial_evaluation: '/evaluations',
  annual_plan: '/annual-work-plan',
  copasst: '/documents/do',
  convivencia_committee: '/documents/do',
  training: '/trainings',
  communication: '/documents/do',
  legal_matrix: '/legal-matrix',
  document_management: '/document-management',
};

function StepIcon({ status }: { status: WizardStepStatus }) {
  if (status === 'COMPLETED') return <span style={{ fontSize: 20 }}>✔</span>;
  if (status === 'IN_PROGRESS') return <span style={{ fontSize: 20 }}>⏳</span>;
  if (status === 'BLOCKED') return <span style={{ fontSize: 20 }}>✖</span>;
  return <span style={{ fontSize: 20, opacity: 0.5 }}>○</span>;
}

function getStepColor(status: WizardStepStatus): string {
  switch (status) {
    case 'COMPLETED': return '#16a34a';
    case 'IN_PROGRESS': return '#2563eb';
    case 'BLOCKED': return '#dc2626';
    default: return '#cbd5e1';
  }
}

export default function ImplementationWizardPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [wizard, setWizard] = useState<WizardDashboardModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedStep, setSelectedStep] = useState<WizardStepId | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [generatingCert, setGeneratingCert] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };
  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWizardDashboard(token);
      setWizard(data);
      if (!data.isOnboardingComplete && data.completionPercentage < 30) {
        setShowOnboarding(true);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al cargar wizard');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const handleCompleteOnboarding = async () => {
    try {
      await completeWizardOnboarding(token);
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
      setWizard(updated);
      notify(`¡Certificado generado! Código: ${updated.certificateVerificationCode}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al generar certificado');
    } finally {
      setGeneratingCert(false);
    }
  };

  const handleMarkComplete = async (stepId: WizardStepId) => {
    try {
      const updated = await updateWizardStep(token, stepId, { score: 100, status: 'COMPLETED' });
      setWizard(updated);
      notify(`"${STEP_LABELS[stepId]}" marcado como completado`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleGoToModule = (stepId: WizardStepId) => {
    navigate(STEP_MODULES[stepId]);
  };

  if (!wizard) {
    return <div className="card"><p className="muted">{loading ? 'Cargando wizard de implementación...' : 'No hay datos disponibles.'}</p></div>;
  }

  return (
    <div className="company-config">
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
              Este asistente le guiará a través de los 14 pasos necesarios para una implementación completa.
            </p>
            <div className="actions" style={{ justifyContent: 'center', gap: 12 }}>
              <Button type="button" onClick={handleCompleteOnboarding}>Iniciar implementación</Button>
              <Button type="button" variant="secondary" onClick={() => setShowOnboarding(false)}>Continuar más tarde</Button>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="advanced-management__hero">
        <div>
          <h3>Implementación SG-SST</h3>
          <p className="muted">Asistente guiado para la implementación del Sistema de Gestión de Seguridad y Salud en el Trabajo.</p>
        </div>
        <div className="actions" style={{ gap: 8 }}>
          <span className={`company-config__badge ${wizard.completionPercentage >= 80 ? 'company-config__badge--success' : wizard.completionPercentage >= 40 ? 'company-config__badge--warning' : 'company-config__badge--danger'}`}>
            {wizard.completionPercentage}% Implementado
          </span>
          {wizard.isImplementationComplete && !wizard.certificateGenerated && (
            <Button type="button" onClick={handleGenerateCertificate} disabled={generatingCert}>
              {generatingCert ? 'Generando...' : 'Generar Certificado'}
            </Button>
          )}
        </div>
      </section>

      {/* Score Overview */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <article className="card kpi-card">
          <h3 className="kpi-title">Puntaje General</h3>
          <p className="kpi-value" style={{ fontSize: '2.3rem' }}>{wizard.overallScore}%</p>
        </article>
        <article className="card kpi-card">
          <h3 className="kpi-title">Pasos Completados</h3>
          <p className="kpi-value" style={{ fontSize: '2.3rem' }}>{wizard.completedSteps}/{wizard.totalSteps}</p>
        </article>
        <article className="card kpi-card">
          <h3 className="kpi-title">Pendientes</h3>
          <p className="kpi-value" style={{ fontSize: '2.3rem', color: '#eab308' }}>{wizard.pendingSteps}</p>
        </article>
        <article className="card kpi-card">
          <h3 className="kpi-title">En Progreso</h3>
          <p className="kpi-value" style={{ fontSize: '2.3rem', color: '#2563eb' }}>{wizard.inProgressSteps}</p>
        </article>
      </div>

      {/* Progress Bar */}
      <div className="objective-progress" style={{ marginBottom: 20 }}>
        <div className="objective-progress__track" style={{ height: 18 }}>
          <span
            className={`objective-progress__bar ${wizard.completionPercentage >= 80 ? 'objective-progress__bar--high' : wizard.completionPercentage >= 40 ? 'objective-progress__bar--medium' : 'objective-progress__bar--low'}`}
            style={{ width: `${wizard.completionPercentage}%` }}
          />
        </div>
        <strong style={{ fontSize: '0.9rem', minWidth: 45 }}>{wizard.completionPercentage}%</strong>
      </div>

      {/* Certificate info */}
      {wizard.certificateGenerated && (
        <div className="advanced-management__section" style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16,
        }}>
          <p style={{ color: '#15803d', margin: 0 }}>
            ✅ Certificado de Implementación generado · Código: <strong>{wizard.certificateVerificationCode}</strong>
          </p>
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="advanced-management__success">{success}</p> : null}

      {/* Stepper — 14 steps */}
      <div className="wizard-stepper">
        {wizard.steps.map((step, idx) => {
          const isSelected = selectedStep === step.stepId;
          const color = getStepColor(step.status);
          return (
            <div
              key={step.stepId}
              className={`wizard-step ${isSelected ? 'wizard-step--selected' : ''}`}
              style={{ borderLeft: `4px solid ${color}` }}
            >
              <div className="wizard-step__header">
                <div className="actions" style={{ alignItems: 'center', gap: 8 }}>
                  <StepIcon status={step.status} />
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>{idx + 1}. {step.label}</strong>
                    <span style={{
                      display: 'inline-block', marginLeft: 8,
                      fontSize: '0.75rem', fontWeight: 700,
                      padding: '2px 8px', borderRadius: 999,
                      background: step.status === 'COMPLETED' ? '#dcfce7' : step.status === 'IN_PROGRESS' ? '#dbeafe' : step.status === 'BLOCKED' ? '#fee2e2' : '#f1f5f9',
                      color: step.status === 'COMPLETED' ? '#166534' : step.status === 'IN_PROGRESS' ? '#1e40af' : step.status === 'BLOCKED' ? '#991b1b' : '#475569',
                    }}>
                      {step.status === 'COMPLETED' ? 'Completado' : step.status === 'IN_PROGRESS' ? 'En progreso' : step.status === 'BLOCKED' ? 'Bloqueado' : 'Pendiente'}
                    </span>
                    {step.score > 0 && step.score < 100 && (
                      <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#64748b' }}>{step.score}%</span>
                    )}
                  </div>
                </div>
                <Button type="button" variant="ghost" onClick={() => setSelectedStep(isSelected ? null : step.stepId)}>
                  {isSelected ? '▼' : '▶'}
                </Button>
              </div>

              {isSelected && (
                <div className="wizard-step__body">
                  <p className="muted" style={{ margin: '8px 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {step.description || STEP_DESCRIPTIONS[step.stepId]}
                  </p>
                  {step.details && (
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0' }}>Detalles: {step.details}</p>
                  )}
                  {step.validatedAt && (
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0' }}>
                      Última validación: {new Date(step.validatedAt).toLocaleString()}
                    </p>
                  )}
                  <div className="actions" style={{ gap: 8, marginTop: 8 }}>
                    <Button type="button" onClick={() => handleGoToModule(step.stepId)}>Ir al módulo</Button>
                    {step.status !== 'COMPLETED' && (
                      <Button type="button" variant="secondary" onClick={() => handleMarkComplete(step.stepId)}>
                        Marcar completado
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* History Timeline */}
      {wizard.history.length > 0 && (
        <section className="advanced-management__section" style={{ marginTop: 16 }}>
          <h3>Historial de Implementación</h3>
          <div className="timeline">
            {wizard.history.slice(0, 10).map((entry, idx) => (
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
        </section>
      )}

      <div className="advanced-management__footer">
        <span className="muted">14 pasos · {wizard.completedSteps} completados · Puntaje: {wizard.overallScore}%</span>
        <Button type="button" variant="ghost" onClick={() => void load()}>Recargar</Button>
      </div>
    </div>
  );
}
