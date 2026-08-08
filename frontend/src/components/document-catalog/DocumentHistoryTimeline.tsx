import type { DocumentHistoryItem } from '../../types/document-catalog';
import { formatDateTime } from './catalog-ui';

/**
 * Timeline de trazabilidad de una instancia documental (SPRINT FRONT-4).
 *
 * Muestra únicamente eventos reales construidos a partir de la información
 * disponible de DocumentInstance + metadata de aprobación. NO inventa datos:
 * si un evento no existe simplemente no se renderiza. Sin any.
 */

const ACTION_LABELS: Record<DocumentHistoryItem['action'], string> = {
  GENERATED: 'Documento generado',
  APPROVED: 'Documento aprobado',
  REJECTED: 'Documento rechazado',
  VERSION: 'Nueva versión',
};

function actionClass(action: DocumentHistoryItem['action']): string {
  switch (action) {
    case 'APPROVED': return 'approved';
    case 'REJECTED': return 'rejected';
    case 'VERSION': return 'version';
    default: return 'generated';
  }
}

export function DocumentHistoryTimeline({ items }: { items: DocumentHistoryItem[] }) {
  if (items.length === 0) {
    return <p className="muted">Sin actividad documental registrada.</p>;
  }

  const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="history-feed">
      {sorted.map((entry, index) => (
        <div key={`${entry.action}-${entry.date}-${index}`} className="history-item">
          <div className="history-item__header">
            <span className={`history-item__action history-item__action--${actionClass(entry.action)}`}>
              {ACTION_LABELS[entry.action]}
            </span>
            <span style={{ fontSize: '.85rem', color: '#475569' }}>{entry.actor ?? '—'}</span>
            <span className="history-item__date">{formatDateTime(entry.date)}</span>
          </div>
          {entry.description && <p className="history-item__desc">{entry.description}</p>}
        </div>
      ))}
    </div>
  );
}
