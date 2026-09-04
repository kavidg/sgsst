import { Button } from './Button';
import { Modal } from './Modal';
import { ApprovalStatusBadge, APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS, APPROVAL_STATUS_ICONS } from './ApprovalStatusBadge';

type HistoryEntry = {
  _id: string;
  action: string;
  actor?: { userId: string; name?: string; email?: string };
  previousStatus: string;
  newStatus: string;
  reason?: string;
  createdAt: string;
};

type Props = {
  isOpen: boolean;
  entityLabel?: string;
  status: string | null | undefined;
  history?: HistoryEntry[];
  historyLoading?: boolean;
  canSubmit?: boolean;
  canDecide?: boolean;
  loading?: boolean;
  onSubmit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onAdjustments?: () => void;
  onLoadHistory?: () => void;
  onClose: () => void;
  /** Renderiza contenido adicional específico del dominio (ej: info de rechazo/ajustes). */
  renderStatusInfo?: (status: string) => React.ReactNode;
};

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Modal genérico de detalle de aprobación.
 * Muestra estado, acciones disponibles e historial de decisiones.
 * Reutilizable por cualquier módulo que use Approval Workflow.
 */
export function ApprovalDetailModal({
  isOpen,
  entityLabel,
  status,
  history,
  historyLoading = false,
  canSubmit = false,
  canDecide = false,
  loading = false,
  onSubmit,
  onApprove,
  onReject,
  onAdjustments,
  onLoadHistory,
  onClose,
  renderStatusInfo,
}: Props) {
  const currentStatus = status ?? 'DRAFT';

  return (
    <Modal isOpen={isOpen} title={`Estado de aprobación — ${entityLabel ?? ''}`} onClose={onClose}>
      <div className="acq-approval-detail">
        {/* Status badge */}
        <div className="acq-approval-detail__status">
          <ApprovalStatusBadge status={currentStatus} />
        </div>

        {/* Actions */}
        <div className="acq-approval-detail__actions">
          {canSubmit && onSubmit && (!status || status === 'DRAFT' || status === 'REJECTED') && (
            <Button type="button" onClick={onSubmit} disabled={loading}>
              {loading ? 'Enviando...' : '📤 Enviar a aprobación'}
            </Button>
          )}
          {canSubmit && onSubmit && status === 'ADJUSTMENTS_REQUESTED' && (
            <Button type="button" onClick={onSubmit} disabled={loading}>
              {loading ? 'Enviando...' : '🔄 Enviar nuevamente a aprobación'}
            </Button>
          )}
          {canDecide && status === 'PENDING_APPROVAL' && (
            <>
              {onApprove && (
                <Button type="button" onClick={onApprove} disabled={loading}>
                  {loading ? 'Procesando...' : '✅ Aprobar'}
                </Button>
              )}
              {onReject && (
                <Button type="button" variant="secondary" onClick={onReject} disabled={loading}>
                  ❌ Rechazar
                </Button>
              )}
              {onAdjustments && (
                <Button type="button" variant="secondary" onClick={onAdjustments} disabled={loading}>
                  🔧 Solicitar ajustes
                </Button>
              )}
            </>
          )}
        </div>

        {/* Custom status info */}
        {renderStatusInfo && renderStatusInfo(currentStatus)}

        {/* History */}
        <div className="acq-approval-detail__history">
          {onLoadHistory && (
            <button
              type="button"
              className="acq-approval-detail__history-toggle"
              onClick={onLoadHistory}
              disabled={historyLoading}
            >
              {historyLoading ? 'Cargando historial...' : '📜 Ver historial de decisiones'}
            </button>
          )}
          {history && history.length > 0 && (
            <div className="acq-approval-detail__history-list">
              {history.map((entry) => (
                <div key={entry._id} className="acq-approval-detail__history-item">
                  <div className="acq-approval-detail__history-item__header">
                    <span
                      className="acq-approval-detail__history-item__action"
                      style={{ color: APPROVAL_STATUS_COLORS[entry.newStatus] ?? '#2563eb' }}
                    >
                      {APPROVAL_STATUS_ICONS[entry.newStatus] ?? '⚪'} {entry.action}
                    </span>
                    <span className="acq-approval-detail__history-item__date">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                  {entry.actor && (
                    <div className="acq-approval-detail__history-item__actor">
                      {entry.actor.name || entry.actor.email || '—'}
                    </div>
                  )}
                  {entry.reason && (
                    <p className="acq-approval-detail__history-item__reason">
                      <strong>Razón:</strong> {entry.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {history && history.length === 0 && !historyLoading && (
            <p className="acq-text-muted" style={{ padding: '0.5rem 0' }}>Sin decisiones registradas.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
