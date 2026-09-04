const APPROVAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  ADJUSTMENTS_REQUESTED: 'Requiere ajustes',
};

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  PENDING_APPROVAL: '#d97706',
  APPROVED: '#16a34a',
  REJECTED: '#dc2626',
  ADJUSTMENTS_REQUESTED: '#7c3aed',
};

const APPROVAL_STATUS_ICONS: Record<string, string> = {
  DRAFT: '📝',
  PENDING_APPROVAL: '⏳',
  APPROVED: '✅',
  REJECTED: '❌',
  ADJUSTMENTS_REQUESTED: '🔧',
};

type Props = {
  status: string | null | undefined;
  className?: string;
};

/**
 * Badge genérico para mostrar el estado de aprobación de una entidad.
 * Reutilizable por cualquier módulo que use Approval Workflow.
 *
 * @example
 * <ApprovalStatusBadge status={acquisition.approvalStatus} />
 */
export function ApprovalStatusBadge({ status, className = '' }: Props) {
  if (!status) return null;

  const label = APPROVAL_STATUS_LABELS[status] ?? status;
  const color = APPROVAL_STATUS_COLORS[status] ?? '#94a3b8';
  const icon = APPROVAL_STATUS_ICONS[status] ?? '';

  return (
    <span
      className={`acq-badge acq-badge--approval ${className}`}
      style={{ backgroundColor: color }}
    >
      {icon} {label}
    </span>
  );
}

export { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS, APPROVAL_STATUS_ICONS };
