import { DragEvent, useId, useState } from 'react';
import { Icons } from './Icons';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';

type EvaluationItemProps = {
  code: string;
  title: string;
  weight: number;
  modeReview: string;
  criteria: string;
  status?: ComplianceOption;
  onStatusChange?: (code: string, status: ComplianceOption) => void;
  hasError?: boolean;
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
}: EvaluationItemProps) {
  const fileInputId = useId();
  const [status, setStatus] = useState<ComplianceOption>(controlledStatus ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openReview, setOpenReview] = useState(false);
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

  const currentStatus = controlledStatus ?? status;

  const handleStatusChange = (nextStatus: ComplianceOption) => {
    if (controlledStatus === undefined) {
      setStatus(nextStatus);
    }
    onStatusChange?.(code, nextStatus);
  };

  return (
    <article className={`evaluation-item ${hasError ? 'evaluation-item--error' : ''}`.trim()}>
      <div className="evaluation-item__header">
        <h3 className="evaluation-item__title">
          {code} · {title}
        </h3>
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

      <div className="grid grid-2">
        <label className="field">
          <span className="label">Resultado de evaluación</span>
          <Select value={currentStatus} onChange={(event) => handleStatusChange(event.target.value as ComplianceOption)}>
            <option value="" disabled>
              Selecciona una opción
            </option>
            <option value="Cumple totalmente">Cumple totalmente</option>
            <option value="No cumple">No cumple</option>
            <option value="No aplica">No aplica</option>
          </Select>
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
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <span className="upload-zone__title">Arrastra y suelta un archivo</span>
            <span className="muted">o haz clic para seleccionarlo</span>
            {selectedFile ? <span className="upload-zone__file">Archivo: {selectedFile.name}</span> : null}
          </label>
        </div>
      </div>

      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Button type="button" disabled={!currentStatus} onClick={() => setIsModalOpen(true)}>
          Ingresar plan de mejoramiento
        </Button>
      </div>

      <Modal isOpen={isModalOpen} title={`Plan de mejoramiento · ${code}`} onClose={closeModal}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Actividad a implementar</span>
            <Input
              value={plan.activity}
              onChange={(event) => setPlan((current) => ({ ...current, activity: event.target.value }))}
              placeholder="Describe la actividad"
            />
          </label>
          <label className="field">
            <span className="label">Responsable</span>
            <Input
              value={plan.responsible}
              onChange={(event) => setPlan((current) => ({ ...current, responsible: event.target.value }))}
              placeholder="Nombre del responsable"
            />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Fecha inicio</span>
              <Input
                type="date"
                value={plan.startDate}
                onChange={(event) => setPlan((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span className="label">Fecha fin</span>
              <Input
                type="date"
                value={plan.endDate}
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
            />
          </label>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="button" onClick={savePlan}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  );
}
