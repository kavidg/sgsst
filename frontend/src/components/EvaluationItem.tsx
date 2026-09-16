import type { DragEvent, ReactNode } from 'react';
import { useId, useState } from 'react';
import { Icons } from './Icons';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import {
  PHVA_AUTO_STATUS_BADGE_CLASS,
  PHVA_AUTO_STATUS_LABEL,
  PhvaAutoEvaluationResult,
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
   * FASE 2 — Resultado automático del motor para este estándar.
   * `undefined`  → el estándar no participa del motor (flujo manual intacto).
   * `null`       → participa pero aún sin respuesta (cargando o con error).
   */
  autoResult?: PhvaAutoEvaluationResult | null;
  /** true mientras el motor está respondiendo para este estándar. */
  autoLoading?: boolean;
  /** true si la consulta del motor falló para este estándar. */
  autoError?: boolean;
  /**
   * Bloquea el select manual: el veredicto lo administra el motor y el usuario
   * no puede sobrescribirlo.
   */
  autoLocked?: boolean;
  /** Reintenta la consulta del motor para toda la empresa (botón reintentar). */
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
  const fileInputId = useId();
  const [status, setStatus] = useState<ComplianceOption>(controlledStatus ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openReview, setOpenReview] = useState(false);
  const [openAutoTrace, setOpenAutoTrace] = useState(false);
  const [plan, setPlan] = useState<ImprovementPlan>(initialPlan);

  const onDropFile = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setSelectedFile(droppedFile);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const savePlan = () => {
    setIsModalOpen(false);
  };

  const participatesInEngine = autoResult !== undefined;
  const currentStatus = controlledStatus ?? status;
  const isDocumentPending = !currentStatus;

  const handleStatusChange = (nextStatus: ComplianceOption) => {
    if (autoLocked) {
      // El veredicto automático no puede sobrescribirse manualmente.
      return;
    }
    if (controlledStatus === undefined) {
      setStatus(nextStatus);
    }
    onStatusChange?.(code, nextStatus);
  };

  // ── FASE 2 — Regla del plan de mejoramiento según veredicto automático ────
  // Solo un NO_CUMPLE confirmado por el motor habilita el ingreso al plan.
  // PENDIENTE_ANALISIS/error lo dejan deshabilitado y lo explican; NO_APLICA
  // no muestra el botón. Los ítems fuera del motor conservan el comportamiento
  // exacto anterior.
  const hasConfirmedBreach = autoResult?.status === 'NO_CUMPLE';
  const isNotApplicable = autoResult?.status === 'NO_APLICA';
  const improvementPlanBlockedReason =
    participatesInEngine && !hasConfirmedBreach && !isNotApplicable
      ? 'El plan de mejoramiento se habilita cuando el motor confirme un incumplimiento (No cumple).'
      : '';

  const canOpenImprovementPlan = participatesInEngine ? hasConfirmedBreach : Boolean(currentStatus);
  const hideImprovementPlan = participatesInEngine && isNotApplicable;

  return (
    <article className={`evaluation-item ${hasError ? 'evaluation-item--error' : ''}`.trim()}>
      <div className="evaluation-item__header">
        <div className="evaluation-item__heading">
          <h3 className="evaluation-item__title">
            {code} · {title}
          </h3>
          {headerAction}
        </div>
        <span className="evaluation-item__weight">Peso: {weight}%</span>
      </div>

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
              <p className="evaluation-item__text whitespace-pre-line">{modeReview}</p>
            </div>
            <div className="field">
              <span className="label">Criterio</span>
              <p className="evaluation-item__text whitespace-pre-line">{criteria}</p>
            </div>
          </div>
        </div>
      </section>

      {participatesInEngine ? (
        <section className="auto-evaluation" aria-live="polite">
          <div className="auto-evaluation__header">
            <span className="label">Resultado automático</span>
            {autoLoading ? (
              <span className="muted">Cargando evaluación…</span>
            ) : autoError ? (
              <span className="badge badge--warning">Error al consultar evaluación</span>
            ) : autoResult ? (
              <span className={PHVA_AUTO_STATUS_BADGE_CLASS[autoResult.status]}>
                {PHVA_AUTO_STATUS_LABEL[autoResult.status]}
              </span>
            ) : (
              <span className="badge badge--warning">Pendiente de análisis</span>
            )}
            {autoError && !autoLoading ? (
              <Button type="button" variant="ghost" onClick={onRetryAutoEvaluation}>
                Reintentar
              </Button>
            ) : null}
          </div>

          {autoResult?.status === 'PENDIENTE_ANALISIS' && autoResult.missingInformation.length > 0 ? (
            <div className="auto-evaluation__missing">
              <span className="label">Información faltante</span>
              <ul>
                {autoResult.missingInformation.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {autoResult && autoResult.findings.length > 0 ? (
            <div className="auto-evaluation__findings">
              {autoResult.findings.map((finding) => (
                <div key={`${finding.source}:${finding.title}`} className="auto-evaluation__finding">
                  <strong>{finding.title}</strong>
                  <p className="muted">{finding.description}</p>
                </div>
              ))}
            </div>
          ) : null}

          {autoResult && autoResult.ruleTrace.length > 0 ? (
            <div className="auto-evaluation__trace">
              <button
                type="button"
                className="review-panel__toggle"
                onClick={() => setOpenAutoTrace((current) => !current)}
                aria-expanded={openAutoTrace}
              >
                <span className="label">Requisitos evaluados por el motor</span>
                <span className={`review-panel__chevron ${openAutoTrace ? 'open' : ''}`.trim()}>
                  <Icons.chevronDown />
                </span>
              </button>
              {openAutoTrace ? (
                <ul className="auto-evaluation__trace-list">
                  {autoResult.ruleTrace.map((trace) => (
                    <li key={trace.requirement}>
                      <span
                        className={`badge ${
                          trace.satisfied === true
                            ? 'badge--success'
                            : trace.satisfied === false
                              ? 'badge--warning'
                              : 'badge--info'
                        }`}
                      >
                        {trace.satisfied === true ? '✓' : trace.satisfied === false ? '✗' : '—'}
                      </span>
                      <span>{trace.requirement}</span>
                      {trace.evidence ? <small className="muted">{trace.evidence}</small> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {improvementPlanBlockedReason ? (
            <p className="muted auto-evaluation__hint">{improvementPlanBlockedReason}</p>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-2">
        <label className="field">
          <span className="label">
            Resultado de evaluación{participatesInEngine ? ' (automático)' : ''}
          </span>
          <Select
            value={currentStatus}
            disabled={readOnly || autoLocked}
            onChange={(event) => handleStatusChange(event.target.value as ComplianceOption)}
          >
            <option value="" disabled>
              Selecciona una opción
            </option>
            <option value="Cumple totalmente">Cumple totalmente</option>
            <option value="No cumple">No cumple</option>
            <option value="No aplica">No aplica</option>
          </Select>
          {participatesInEngine && autoLocked ? (
            <span className="muted">Determinado automáticamente por el motor según la gestión avanzada.</span>
          ) : null}
        </label>

        <div className="field">
          <span className="label">Evidencia</span>
          <label
            htmlFor={fileInputId}
            className={`upload-zone ${isDragOver ? 'upload-zone--active' : ''}`.trim()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDropFile}
          >
            <input
              id={fileInputId}
              type="file"
              className="upload-zone__input"
              disabled={readOnly}
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <span className="upload-zone__title">Arrastra y suelta un archivo</span>
            <span className="muted">{readOnly ? 'Solo visualización para manager' : 'o haz clic para seleccionarlo'}</span>
            {selectedFile ? <span className="upload-zone__file">Archivo: {selectedFile.name}</span> : null}
          </label>
        </div>
      </div>

      {isDocumentPending && !participatesInEngine ? (
        <p className="muted" style={{ marginTop: '.5rem' }}>Documento pendiente por cargar/evaluar.</p>
      ) : null}

      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        {hideImprovementPlan ? null : (
          <Button type="button" disabled={!canOpenImprovementPlan || readOnly} onClick={() => setIsModalOpen(true)}>
            Ingresar plan de mejoramiento
          </Button>
        )}
      </div>

      <Modal isOpen={isModalOpen} title={`Plan de mejoramiento · ${code}`} onClose={closeModal}>
        <div className="form-grid">
          <p className="muted">
            Plan de mejoramiento derivado del incumplimiento detectado por el motor para {code} · {title}.
          </p>
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
