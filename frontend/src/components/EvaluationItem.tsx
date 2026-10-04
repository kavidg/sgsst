import type { ReactNode } from 'react';
import { useState } from 'react';
import { Icons } from './Icons';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import {
  PHVA_AUTO_STATUS_LABEL,
  PhvaAutoEvaluationResult,
  PhvaAutoResultStatus,
} from '../services/phva-evaluation-engine.service';

type EvaluationItemProps = {
  readOnly?: boolean;
  code: string;
  title: string;
  weight: number;
  modeReview: string;
  criteria: string;
  status?: ComplianceOption;
  onStatusChange?: (code: string, status: ComplianceOption) => void;
  hasError?: boolean;
  headerAction?: ReactNode;
  /**
   * Resultado automático del motor para este estándar.
   * `undefined` → el estándar NO participa del motor (evaluación manual).
   * `null`      → participa pero aún sin resultado (cargando o con error).
   */
  autoResult?: PhvaAutoEvaluationResult | null;
  /** true mientras el motor está respondiendo para este estándar. */
  autoLoading?: boolean;
  /** true si la consulta del motor falló para este estándar. */
  autoError?: boolean;
  /** El veredicto lo administra el motor: el select manual no se muestra. */
  autoLocked?: boolean;
  /** Reintenta la consulta del motor (estado de error). */
  onRetryAutoEvaluation?: () => void;
};

type ComplianceOption = '' | 'Cumple totalmente' | 'No cumple' | 'No aplica';

type ImprovementPlan = {
  activity: string;
  responsible: string;
  startDate: string;
  endDate: string;
  notes: string;
};

const initialPlan: ImprovementPlan = {
  activity: '',
  responsible: '',
  startDate: '',
  endDate: '',
  notes: '',
};

/**
 * FASE PHVA del estándar a partir de su código. Replica la clasificación real
 * de PHASE_PREFIXES del Compliance Engine (capítulos 1–2 PLANEAR; 3–5 y los
 * 2.x de módulos HACER; 6 y 2.6.1 VERIFICAR; 7 ACTUAR) sin importar backend.
 */
type PhvaPhase = 'PLANEAR' | 'HACER' | 'VERIFICAR' | 'ACTUAR';

const PHVA_PHASE_LABEL: Record<PhvaPhase, string> = {
  PLANEAR: 'Planear',
  HACER: 'Hacer',
  VERIFICAR: 'Verificar',
  ACTUAR: 'Actuar',
};

const DO_CHAPTER_TWO_CODES: readonly string[] = ['2.5.1', '2.8.1', '2.9.1', '2.10.1', '2.11.1'];

function derivePhvaPhase(code: string): PhvaPhase {
  if (code.startsWith('7.')) return 'ACTUAR';
  if (code === '2.6.1' || code.startsWith('6.')) return 'VERIFICAR';
  if (DO_CHAPTER_TWO_CODES.includes(code) || /^[345]\./.test(code)) return 'HACER';
  return 'PLANEAR';
}

/** Vista del bloque central de cumplimiento (protagonista de la ficha). */
type StatusView = {
  key: 'ok' | 'danger' | 'pending' | 'neutral' | 'loading' | 'error';
  icon: string;
  label: string;
  /** Mensaje breve de interpretación del estado (ZONA 3). */
  interpretation: string;
};

function buildEngineStatusView(
  autoResult: PhvaAutoEvaluationResult | null,
  loading: boolean,
  error: boolean,
): StatusView {
  if (loading) {
    return { key: 'loading', icon: '⏳', label: 'Cargando evaluación…', interpretation: 'Consultando la gestión registrada para este estándar.' };
  }
  if (error) {
    return {
      key: 'error',
      icon: '⚠',
      label: 'Error al consultar evaluación',
      interpretation: 'No fue posible obtener el resultado de este estándar. Intenta nuevamente.',
    };
  }
  if (!autoResult) {
    return {
      key: 'pending',
      icon: '⏳',
      label: PHVA_AUTO_STATUS_LABEL.PENDIENTE_ANALISIS,
      interpretation: 'Este estándar requiere información adicional para determinar su resultado.',
    };
  }
  const statusViews: Record<PhvaAutoResultStatus, StatusView> = {
    CUMPLE_TOTALMENTE: {
      key: 'ok',
      icon: '✓',
      label: PHVA_AUTO_STATUS_LABEL.CUMPLE_TOTALMENTE,
      interpretation: 'El sistema identifica que este estándar cumple con las condiciones evaluadas.',
    },
    NO_CUMPLE: {
      key: 'danger',
      icon: '⚠',
      label: PHVA_AUTO_STATUS_LABEL.NO_CUMPLE,
      interpretation: 'Este estándar requiere acciones de mejora. Revisa la gestión asociada y define las acciones correspondientes.',
    },
    PENDIENTE_ANALISIS: {
      key: 'pending',
      icon: '⏳',
      label: PHVA_AUTO_STATUS_LABEL.PENDIENTE_ANALISIS,
      interpretation: 'Este estándar requiere información adicional para determinar su resultado.',
    },
    NO_APLICA: {
      key: 'neutral',
      icon: '—',
      label: PHVA_AUTO_STATUS_LABEL.NO_APLICA,
      interpretation: 'Este estándar no aplica para las condiciones actuales de la empresa.',
    },
  };
  return statusViews[autoResult.status];
}

function buildManualStatusView(status: ComplianceOption): StatusView {
  if (status === 'Cumple totalmente') {
    return {
      key: 'ok',
      icon: '✓',
      label: status,
      interpretation: 'El sistema identifica que este estándar cumple con las condiciones evaluadas.',
    };
  }
  if (status === 'No cumple') {
    return {
      key: 'danger',
      icon: '⚠',
      label: status,
      interpretation: 'Este estándar requiere acciones de mejora. Revisa la gestión asociada y define las acciones correspondientes.',
    };
  }
  if (status === 'No aplica') {
    return {
      key: 'neutral',
      icon: '—',
      label: status,
      interpretation: 'Este estándar no aplica para las condiciones actuales de la empresa.',
    };
  }
  return {
    key: 'neutral',
    icon: '○',
    label: 'Sin evaluar',
    interpretation: 'Este estándar aún no cuenta con una evaluación registrada.',
  };
}

export function EvaluationItem({
  code,
  title,
  weight,
  modeReview,
  criteria,
  status: controlledStatus,
  onStatusChange,
  hasError = false,
  readOnly = false,
  headerAction,
  autoResult,
  autoLoading = false,
  autoError = false,
  autoLocked = false,
  onRetryAutoEvaluation,
}: EvaluationItemProps) {
  const [status, setStatus] = useState<ComplianceOption>(controlledStatus ?? '');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openReview, setOpenReview] = useState(false);
  const [plan, setPlan] = useState<ImprovementPlan>(initialPlan);

  const phase = derivePhvaPhase(code);
  // Evaluación automática: el estándar participa del motor o está gestionado
  // por él (veredicto sincronizado). En ambos casos el resultado no es editable.
  const isAutoManaged = autoResult !== undefined || autoLocked;
  const showManualSelect = !isAutoManaged;

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const savePlan = () => {
    setIsModalOpen(false);
  };

  const currentStatus = controlledStatus ?? status;

  const handleStatusChange = (nextStatus: ComplianceOption) => {
    if (isAutoManaged) {
      // El veredicto automático no puede sobrescribirse manualmente.
      return;
    }
    if (controlledStatus === undefined) {
      setStatus(nextStatus);
    }
    onStatusChange?.(code, nextStatus);
  };

  // ── ZONA 2 · Estado de cumplimiento ────────────────────────────────────────
  const statusView = isAutoManaged
    ? buildEngineStatusView(autoResult ?? null, autoLoading, autoError)
    : buildManualStatusView(currentStatus);

  // ── ZONA 5 · Plan de mejoramiento: visible siempre, habilitado solo NO_CUMPLE ──
  const resultIsNoCumple = isAutoManaged
    ? autoResult?.status === 'NO_CUMPLE'
    : currentStatus === 'No cumple';
  const canOpenImprovementPlan = resultIsNoCumple && !readOnly;

  return (
    <article
      className={`phva-card ${hasError ? 'phva-card--error' : ''}`.trim()}
      // Retorno contextual al PHVA: identificador DOM estable del estándar
      // (lib/phvaReturn.ts + hooks/usePhvaReturnRestore.ts lo usan para
      // restaurar el viewport sobre este ítem al volver de un módulo).
      data-phva-standard={code}
    >
      {/* ZONA 1 · ENCABEZADO: código, fase, peso, origen y título */}
      <header className="phva-card__header">
        <div className="phva-card__meta">
          <span className="phva-card__code">{code}</span>
          <span className={`phva-card__phase phva-card__phase--${phase.toLowerCase()}`}>
            {PHVA_PHASE_LABEL[phase]}
          </span>
          <span className="phva-card__weight">Peso {weight}%</span>
          <span
            className={`phva-card__origin phva-card__origin--${isAutoManaged ? 'auto' : 'manual'}`}
          >
            {isAutoManaged ? 'Automática' : 'Manual'}
          </span>
        </div>
        <h3 className="phva-card__title">{title}</h3>
      </header>

      {/* ZONA 2 · ESTADO PRINCIPAL (protagonista de la ficha) */}
      <section
        className={`phva-card__status phva-card__status--${statusView.key}`}
        aria-live="polite"
      >
        <span className="phva-card__status-icon" aria-hidden>
          {statusView.icon}
        </span>
        <div className="phva-card__status-body">
          <span className="phva-card__status-kind">
            {isAutoManaged ? 'Evaluación automática' : 'Evaluación manual'}
          </span>
          <strong className="phva-card__status-value">{statusView.label}</strong>
        </div>
        {isAutoManaged && autoError && !autoLoading ? (
          <Button type="button" variant="ghost" onClick={onRetryAutoEvaluation}>
            Reintentar
          </Button>
        ) : null}
      </section>

      {/* ZONA 3 · INTERPRETACIÓN breve del estado */}
      <section className={`phva-card__interpretation phva-card__interpretation--${statusView.key}`}>
        <p>{statusView.interpretation}</p>
      </section>

      {/* ZONA 4 · GESTIÓN CENTRALIZADA (reemplaza cualquier concepto de evidencia).
          El botón reutiliza la acción real de navegación provista por la página
          (headerAction → rutas existentes de Gestión Avanzada). Si la página no
          provee navegación funcional, no se muestra ningún botón. */}
      <section className="phva-card__centralized">
        <div className="phva-card__centralized-body">
          <span className="phva-card__zone-label">Gestión centralizada</span>
          <p className="phva-card__centralized-text">
            La información, los soportes y el diligenciamiento de este estándar se administran
            desde Gestión Avanzada.
          </p>
        </div>
        {headerAction ? <div className="phva-card__centralized-action">{headerAction}</div> : null}
      </section>

      {/* ZONA 5 · EVALUACIÓN + ACCIONES */}
      <div className="phva-card__bottom">
        <section className="phva-card__evaluation">
          {showManualSelect ? (
            <label className="field">
              <span className="label">Estado actual</span>
              <Select
                value={currentStatus}
                disabled={readOnly}
                onChange={(event) => handleStatusChange(event.target.value as ComplianceOption)}
              >
                <option value="" disabled>
                  Selecciona una opción
                </option>
                <option value="Cumple totalmente">Cumple totalmente</option>
                <option value="No cumple">No cumple</option>
                <option value="No aplica">No aplica</option>
              </Select>
            </label>
          ) : (
            <div className="field">
              <span className="label">Estado actual</span>
              <p className="phva-card__auto-note">
                Determinado automáticamente por el motor según la gestión avanzada.
              </p>
            </div>
          )}

          {/* Guía de verificación (colapsable) */}
          <section className="review-panel">
            <button
              type="button"
              className="review-panel__toggle"
              onClick={() => setOpenReview((current) => !current)}
              aria-expanded={openReview}
            >
              <span className="label">Modo de revisión</span>
              <span className={`review-panel__chevron ${openReview ? 'open' : ''}`.trim()}>
                <Icons.chevronDown />
              </span>
            </button>

            <div className={`review-panel__content ${openReview ? 'open' : ''}`.trim()}>
              <div className="review-panel__body">
                <div className="field">
                  <span className="label">Instrucciones de verificación</span>
                  <p className="phva-card__text whitespace-pre-line">{modeReview}</p>
                </div>
                <div className="field">
                  <span className="label">Criterio</span>
                  <p className="phva-card__text whitespace-pre-line">{criteria}</p>
                </div>
              </div>
            </div>
          </section>
        </section>

        <footer className="phva-card__action">
          <Button
            type="button"
            variant={canOpenImprovementPlan ? 'primary' : 'secondary'}
            disabled={!canOpenImprovementPlan}
            title={
              canOpenImprovementPlan
                ? 'Ingresar plan de mejoramiento'
                : readOnly
                  ? 'Modo solo visualización para manager'
                  : 'Disponible cuando el resultado sea No cumple'
            }
            onClick={() => setIsModalOpen(true)}
          >
            Plan de mejoramiento
          </Button>
        </footer>
      </div>

      <Modal isOpen={isModalOpen} title={`Plan de mejoramiento · ${code}`} onClose={closeModal}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Actividad a implementar</span>
            <Input
              value={plan.activity}
              onChange={(event) => setPlan((current) => ({ ...current, activity: event.target.value }))}
              placeholder="Describe la actividad"
              disabled={readOnly}
            />
          </label>
          <label className="field">
            <span className="label">Responsable</span>
            <Input
              value={plan.responsible}
              onChange={(event) => setPlan((current) => ({ ...current, responsible: event.target.value }))}
              placeholder="Nombre del responsable"
              disabled={readOnly}
            />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Fecha inicio</span>
              <Input
                type="date"
                value={plan.startDate}
                disabled={readOnly}
                onChange={(event) => setPlan((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span className="label">Fecha fin</span>
              <Input
                type="date"
                value={plan.endDate}
                disabled={readOnly}
                onChange={(event) => setPlan((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
          </div>
          <label className="field">
            <span className="label">Observaciones</span>
            <textarea
              className="textarea"
              value={plan.notes}
              onChange={(event) => setPlan((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Notas adicionales"
              disabled={readOnly}
            />
          </label>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="button" onClick={savePlan} disabled={readOnly}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  );
}
