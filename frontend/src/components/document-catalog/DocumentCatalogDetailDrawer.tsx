import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { DocumentApprovalTimeline } from './DocumentApprovalTimeline';
import { DocumentVersionTimeline } from './DocumentVersionTimeline';
import {
  buildVersionItems,
  CatalogStatusBadge,
  documentTypeLabel,
  formatDate,
  sourceEntityLabel,
  sourceModuleLabel,
  toApprovalInfo,
} from './catalog-ui';
import type { DocumentCatalogDetail } from '../../types/document-catalog';

/**
 * Drawer de detalle y trazabilidad del Catálogo Documental (SPRINT FRONT-2).
 *
 * Componente presentacional (SPRINT FRONT-4): la carga del detalle
 * (GET /document-generation/catalog/:id) la realiza la página padre, que
 * inyecta detail/loading/error/notFound y el callback onRetry. Así la misma
 * instancia cargada alimenta también las pestañas Versiones/Aprobaciones/
 * Historial. Sin any, TypeScript estricto.
 */

type Props = {
  open: boolean;
  detail: DocumentCatalogDetail | null;
  loading: boolean;
  error: string;
  notFound: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
};

export function DocumentCatalogDetailDrawer({
  open, detail, loading, error, notFound, onOpenChange, onRetry,
}: Props) {
  return (
    <Sheet open={open} title="Detalle documental"
      description={detail ? detail.title : 'Trazabilidad de la instancia generada'}
      onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      {loading ? <p className="muted">Cargando detalle...</p> : null}

      {!loading && notFound ? (
        <div style={{ display: 'grid', gap: '.75rem', textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: '2rem' }}>📄</div>
          <p>El documento solicitado no existe o fue eliminado.</p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </div>
      ) : null}

      {!loading && error ? (
        <div style={{ display: 'grid', gap: '.75rem', textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <p className="muted">{error}</p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <Button type="button" onClick={onRetry}>Reintentar</Button>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </div>
      ) : null}

      {!loading && !error && !notFound && detail ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* Información general */}
          <div className="advanced-management__section">
            <h3>Información general</h3>
            <div className="grid grid-2" style={{ gap: '.5rem', fontSize: '.9rem' }}>
              <div><span className="muted">Título:</span> <strong>{detail.title}</strong></div>
              <div><span className="muted">Tipo:</span> {documentTypeLabel(detail.documentType)}</div>
              <div><span className="muted">Empresa:</span> {detail.companyName ?? '—'}</div>
              <div>
                <span className="muted">Estado:</span>{' '}
                <CatalogStatusBadge status={detail.status} />
              </div>
              <div><span className="muted">Versión:</span> v{detail.version}</div>
              <div><span className="muted">Generado:</span> {formatDate(detail.generatedAt)}</div>
              <div><span className="muted">Formato:</span> {detail.format}</div>
              {detail.template ? (
                <div><span className="muted">Plantilla:</span> {detail.template.name} (v{detail.template.version})</div>
              ) : null}
            </div>
          </div>

          {/* SPRINT FRONT-4 — timeline de aprobación reutilizable (ApprovalEvent). */}
          <DocumentApprovalTimeline approval={toApprovalInfo(detail)} />

          {/* SPRINT FRONT-3 — Evidencia documental (origen con formato legible). */}
          <div className="advanced-management__section">
            <h3>Evidencia documental</h3>
            <div className="grid grid-2" style={{ gap: '.5rem', fontSize: '.9rem' }}>
              <div><span className="muted">Tipo documental:</span> {documentTypeLabel(detail.documentType)}</div>
              <div><span className="muted">Módulo fuente:</span> {sourceModuleLabel(detail.sourceModule)}</div>
              <div><span className="muted">Entidad fuente:</span> {sourceEntityLabel(detail.sourceEntity)}</div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="muted">Id entidad:</span> {detail.sourceEntityId ?? '—'}
              </div>
            </div>
          </div>

          {/* SPRINT FRONT-4 — timeline de versiones reutilizable (DocumentInstance). */}
          <div className="advanced-management__section">
            <h3>Versiones</h3>
            <DocumentVersionTimeline versions={buildVersionItems(detail)} />
          </div>

          {/* Acción descargar */}
          <div className="actions">
            <a className="btn btn-primary" href={detail.downloadUrl} target="_blank" rel="noreferrer"
              aria-label={`Descargar ${detail.title}`}>
              ⬇ Descargar documento
            </a>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
