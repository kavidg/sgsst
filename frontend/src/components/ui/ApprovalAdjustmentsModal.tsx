import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

type Props = {
  isOpen: boolean;
  entityLabel?: string;
  loading?: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
};

/**
 * Modal genérico para solicitar ajustes en el Approval Workflow.
 * Reutilizable por cualquier módulo.
 *
 * @example
 * <ApprovalAdjustmentsModal
 *   isOpen={showAdjustmentsModal}
 *   entityLabel={acquisition.requestNumber}
 *   loading={submitting}
 *   onSubmit={(reason) => handleRequestAdjustments(reason)}
 *   onClose={() => setShowAdjustmentsModal(false)}
 * />
 */
export function ApprovalAdjustmentsModal({ isOpen, entityLabel, loading = false, onSubmit, onClose }: Props) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onSubmit(reason.trim());
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} title="Solicitar ajustes" onClose={handleClose}>
      <div className="acq-form">
        {entityLabel && (
          <p style={{ marginBottom: '0.75rem', color: '#64748b' }}>
            Entidad: <strong>{entityLabel}</strong>
          </p>
        )}
        <label className="field">
          <span className="label">Razón de los ajustes *</span>
          <textarea
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe los ajustes necesarios..."
            disabled={loading}
          />
        </label>
        <div className="acq-form__actions">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={loading || !reason.trim()}>
            {loading ? 'Procesando...' : '🔧 Solicitar ajustes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
