import type { DocumentApprovalInfo } from '../../types/document-catalog';
import { formatDateTime } from './catalog-ui';

/**
 * Timeline de aprobación documental (SPRINT FRONT-4).
 *
 * Muestra el estado de aprobación de una instancia documental y sus
 * metadatos: aprobador, fecha, evento del ApprovalWorkflow y solicitud.
 * Consume exclusivamente DocumentApprovalInfo (espejo de
 * DocumentCatalogDetail.approval). Sin any.
 */

function approvalBadge(status: string | null): { label: string; cls: string } {
  switch (status) {
    case 'APPROVED':
      return { label: 'Aprobado', cls: 'active' };
    case 'REJECTED':
      return { label: 'Rechazado', cls: 'obsolete' };
    case 'PENDING':
    case 'PENDING_APPROVAL':
      return { label: 'Pendiente', cls: 'pending' };
    default:
      return { label: status ?? '—', cls: 'draft' };
  }
}

export function DocumentApprovalTimeline({ approval }: { approval: DocumentApprovalInfo | null }) {
  if (!approval) {
    return <p className="muted">Sin información de aprobación para este documento.</p>;
  }

  const { label, cls } = approvalBadge(approval.approvalStatus);

  return (
    <div className="advanced-management__section">
      <h3>Aprobación documental</h3>
      <div className="grid grid-2" style={{ gap: '.5rem', fontSize: '.9rem' }}>
        <div>
          <span className="muted">Estado:</span>{' '}
          <span className={`status-badge status-badge--${cls}`}>{label}</span>
        </div>
        <div><span className="muted">Aprobador:</span> {approval.approvedBy ?? '—'}</div>
        <div><span className="muted">Fecha:</span> {formatDateTime(approval.approvedAt)}</div>
        <div><span className="muted">Evento:</span> {approval.approvalEventId ?? '—'}</div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span className="muted">Solicitud:</span> {approval.requestId ?? '—'}
        </div>
      </div>
    </div>
  );
}
