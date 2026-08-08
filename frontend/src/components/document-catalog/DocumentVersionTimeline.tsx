import type { DocumentVersionItem } from '../../types/document-catalog';
import { CatalogStatusBadge, formatDate } from './catalog-ui';

/**
 * Timeline de versiones de una instancia documental (SPRINT FRONT-4).
 *
 * Muestra cada versión (DocumentVersionItem) con su número, indicador de
 * versión actual, estado, fecha y enlace de descarga. Consume únicamente
 * DocumentInstance.versions. Sin any.
 */
export function DocumentVersionTimeline({ versions, currentId }: {
  versions: DocumentVersionItem[];
  currentId?: string | null;
}) {
  if (versions.length === 0) {
    return <p className="muted">Sin versiones registradas para este documento.</p>;
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className="versions-timeline">
      {sorted.map((v) => {
        const isCurrent = v.isCurrent || v.id === currentId;
        return (
          <div key={v.id} className={`version-item ${isCurrent ? 'version-item--current' : ''}`}>
            <div className="version-item__header">
              <span className="version-item__version">v{v.version}</span>
              {isCurrent && <span className="version-item__current-badge">Actual</span>}
              <span className="version-item__date">{formatDate(v.createdAt)}</span>
              <span className="version-item__by">{v.createdBy ? `por ${v.createdBy}` : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <CatalogStatusBadge status={v.status} />
              <a href={v.downloadUrl} target="_blank" rel="noopener noreferrer"
                aria-label={`Descargar versión ${v.version}`}
                style={{ fontSize: '.85rem', color: '#2563eb' }}>
                📄 Ver archivo
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
