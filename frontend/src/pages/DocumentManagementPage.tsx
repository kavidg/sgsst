import { useEffect, useState, useCallback } from 'react';
import { getCatalog, getCatalogItem } from '../services/document-catalog.service';
import { getDocumentDashboard } from '../services/document-dashboard.service';
import type {
  DocumentCatalogPage,
  DocumentCatalogQuery,
  DocumentCatalogStatus,
  DocumentCatalogItem,
  DocumentCatalogDetail,
  DocumentHistoryItem,
} from '../types/document-catalog';
import type { DocumentDashboardSummary } from '../types/document-dashboard';
import { DocumentCatalogDetailDrawer } from '../components/document-catalog/DocumentCatalogDetailDrawer';
import { DocumentApprovalTimeline } from '../components/document-catalog/DocumentApprovalTimeline';
import { DocumentVersionTimeline } from '../components/document-catalog/DocumentVersionTimeline';
import { DocumentHistoryTimeline } from '../components/document-catalog/DocumentHistoryTimeline';
import { DocumentDashboardCards } from '../components/document-catalog/DocumentDashboardCards';
import { DocumentExpirationTable } from '../components/document-catalog/DocumentExpirationTable';
import { DocumentGenerateModal } from '../components/document-catalog/DocumentGenerateModal';
import {
  buildVersionItems,
  CATALOG_DOCUMENT_TYPE_OPTIONS,
  CATALOG_SOURCE_MODULE_OPTIONS,
  CATALOG_STATUS_LABELS,
  CatalogStatusBadge,
  formatDate,
  toApprovalInfo,
} from '../components/document-catalog/catalog-ui';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useCompanyContext } from '../context/CompanyContext';

// SPRINT FRONT-4 — trazabilidad construida SOLO con datos reales. Si el estado
// de aprobación es REJECTED se emite el evento (aunque approvedAt sea null);
// APPROVED requiere approvedAt real. Nunca se inventan eventos.
function buildHistoryItems(detail: DocumentCatalogDetail): DocumentHistoryItem[] {
  const items: DocumentHistoryItem[] = [{
    date: detail.generatedAt,
    action: 'GENERATED',
    actor: detail.approvedBy ?? null,
    description: 'Instancia documental generada por el DocumentGenerationEngine',
  }];
  if (detail.approval.status === 'REJECTED') {
    items.push({
      date: detail.approval.approvedAt ?? detail.generatedAt,
      action: 'REJECTED',
      actor: detail.approval.approvedBy,
      description: 'El documento fue rechazado',
    });
  } else if (detail.approval.approvedAt) {
    items.push({
      date: detail.approval.approvedAt,
      action: 'APPROVED',
      actor: detail.approval.approvedBy,
      description: 'Documento aprobado',
    });
  }
  for (const v of detail.versions) {
    items.push({
      date: v.generatedAt,
      action: 'VERSION',
      actor: v.approvedBy,
      description: `Nueva versión v${v.version} generada`,
    });
  }
  return items;
}

type Props = { token: string };

type TabId = 'dashboard' | 'documents' | 'versions' | 'approvals' | 'expiration' | 'history' | 'archive';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Panel' },
  { id: 'documents', label: 'Documentos' },
  { id: 'versions', label: 'Versiones' },
  { id: 'approvals', label: 'Aprobaciones' },
  { id: 'expiration', label: 'Vencimientos' },
  { id: 'history', label: 'Historial' },
  { id: 'archive', label: 'Archivo' },
];

export function DocumentManagementPage({ token }: Props) {
  // SPRINT FRONT-6B — la empresa activa se obtiene del mecanismo oficial del
  // proyecto (CompanyContext, persistido en localStorage vía getActiveCompanyId).
  const { companyId } = useCompanyContext();

  const [tab, setTab] = useState<TabId>('dashboard');
  // SPRINT FRONT-5 — el Panel consume las métricas calculadas del catálogo.
  const [panelSummary, setPanelSummary] = useState<DocumentDashboardSummary | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [error, setError] = useState('');

  // SPRINT FRONT-6B — modal de generación del DocumentGenerationEngine.
  const [showGenerate, setShowGenerate] = useState(false);

  // SPRINT FRONT-5 — Vencimientos consume el catálogo (DocumentInstance) con
  // filtros de fecha de generación. DocumentInstance aún no expone
  // expirationDate: la tabla muestra "Sin fecha definida" (sin inventar fechas).
  const [expirationItems, setExpirationItems] = useState<DocumentCatalogItem[]>([]);
  const [expirationLoading, setExpirationLoading] = useState(false);
  const [expFrom, setExpFrom] = useState('');
  const [expTo, setExpTo] = useState('');

  // SPRINT FRONT-1 — catálogo del DocumentGenerationEngine (tabla principal).
  const [catalogPage, setCatalogPage] = useState<DocumentCatalogPage | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogStatus, setCatalogStatus] = useState('');

  // SPRINT FRONT-3 — filtros avanzados del catálogo (documentType, sourceModule, rango de fechas).
  const [catalogDocType, setCatalogDocType] = useState('');
  const [catalogSourceModule, setCatalogSourceModule] = useState('');
  const [catalogFrom, setCatalogFrom] = useState('');
  const [catalogTo, setCatalogTo] = useState('');

  // SPRINT FRONT-2/4 — detalle del catálogo cargado en la página (alimenta
  // drawer + pestañas Versiones/Aprobaciones/Historial).
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedDocumentDetail, setSelectedDocumentDetail] = useState<DocumentCatalogDetail | null>(null);
  const [catalogDetailLoading, setCatalogDetailLoading] = useState(false);
  const [catalogDetailError, setCatalogDetailError] = useState('');
  const [catalogDetailNotFound, setCatalogDetailNotFound] = useState(false);

  // SPRINT FRONT-4 — Archivo consume el catálogo con status=ARCHIVED.
  const [archivedItems, setArchivedItems] = useState<DocumentCatalogItem[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  // SPRINT FRONT-5 — el Panel consume getDocumentDashboard() (DocumentInstance).
  const loadPanelData = useCallback(async () => {
    setPanelLoading(true);
    setError('');
    try {
      const summary = await getDocumentDashboard(token);
      setPanelSummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el panel documental');
    } finally {
      setPanelLoading(false);
    }
  }, [token]);

  // SPRINT FRONT-1 — carga el catálogo del DocumentGenerationEngine (única
  // fuente del listado principal).
  const loadCatalog = useCallback(async (query?: DocumentCatalogQuery) => {
    setCatalogLoading(true);
    setError('');
    try {
      const page = await getCatalog(token, query);
      setCatalogPage(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el catálogo documental');
    } finally {
      setCatalogLoading(false);
    }
  }, [token]);

  // SPRINT FRONT-3 — construye la query del catálogo con los filtros activos.
  const buildCatalogQuery = useCallback((): DocumentCatalogQuery => {
    const query: DocumentCatalogQuery = {};
    if (catalogSearch) query.search = catalogSearch;
    if (catalogStatus) query.status = catalogStatus as DocumentCatalogStatus;
    if (catalogDocType) query.documentType = catalogDocType;
    if (catalogSourceModule) query.sourceModule = catalogSourceModule;
    if (catalogFrom) query.generatedFrom = catalogFrom;
    if (catalogTo) query.generatedTo = catalogTo;
    return query;
  }, [catalogSearch, catalogStatus, catalogDocType, catalogSourceModule, catalogFrom, catalogTo]);

  // SPRINT FRONT-4 — carga el detalle completo (GET /catalog/:id) en la página.
  // Limpia el detalle previo para no mostrar datos obsoletos del documento
  // anterior mientras carga el nuevo.
  const loadCatalogDetail = useCallback(async (id: string) => {
    setCatalogDetailLoading(true);
    setCatalogDetailError('');
    setCatalogDetailNotFound(false);
    setSelectedDocumentDetail(null);
    try {
      const result = await getCatalogItem(token, id);
      setSelectedDocumentDetail(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error cargando el detalle documental';
      if (/not found|no encontrad/i.test(message)) {
        setCatalogDetailNotFound(true);
      } else {
        setCatalogDetailError(message);
      }
      setSelectedDocumentDetail(null);
    } finally {
      setCatalogDetailLoading(false);
    }
  }, [token]);

  // SPRINT FRONT-5 — Vencimientos reutiliza el catálogo (getCatalog) con
  // filtros de fecha de generación (generatedFrom / generatedTo).
  const buildExpirationQuery = useCallback((): DocumentCatalogQuery => {
    const query: DocumentCatalogQuery = {};
    if (expFrom) query.generatedFrom = expFrom;
    if (expTo) query.generatedTo = expTo;
    return query;
  }, [expFrom, expTo]);

  const loadExpirationItems = useCallback(async (query?: DocumentCatalogQuery) => {
    setExpirationLoading(true);
    try {
      const page = await getCatalog(token, query);
      setExpirationItems(page.items);
    } catch { /* ignore */ } finally {
      setExpirationLoading(false);
    }
  }, [token]);

  // SPRINT FRONT-4 — Archivo consume el catálogo con status=ARCHIVED.
  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const page = await getCatalog(token, { status: 'ARCHIVED' });
      setArchivedItems(page.items);
    } catch { /* ignore */ } finally {
      setArchivedLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'dashboard') void loadPanelData();
    if (tab === 'documents') void loadCatalog();
    if (tab === 'expiration') void loadExpirationItems();
    if (tab === 'archive') void loadArchived();
  }, [tab, loadPanelData, loadCatalog, loadExpirationItems, loadArchived]);

  // SPRINT FRONT-6B — tras generar un documento: cierra el modal y refresca el
  // catálogo (el DocumentGenerationEngine ya persistió la DocumentInstance).
  // El refresco conserva los filtros activos de la pestaña Documentos.
  const handleGenerated = useCallback(() => {
    setShowGenerate(false);
    void loadCatalog(buildCatalogQuery());
  }, [loadCatalog, buildCatalogQuery]);

  // SPRINT FRONT-2/4 — abre el detalle del catálogo y carga el detail completo.
  const openDetail = useCallback((id: string) => {
    setSelectedDocumentId(id);
    void loadCatalogDetail(id);
  }, [loadCatalogDetail]);

  const closeDetail = useCallback(() => {
    setSelectedDocumentId(null);
    setSelectedDocumentDetail(null);
    setCatalogDetailError('');
    setCatalogDetailNotFound(false);
  }, []);

  return (
    <div className="doc-mgmt">
      {error && <div className="advanced-management__alert" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>{error}</div>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`tab-btn ${tab === t.id ? 'tab-btn--active' : ''}`}
            onClick={() => { setTab(t.id); setError(''); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ DASHBOARD (SPRINT FRONT-5) ============ */}
      {/* Panel consume las métricas calculadas del catálogo (DocumentInstance). */}
      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <DocumentDashboardCards summary={panelSummary} />
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => void loadPanelData()} disabled={panelLoading}>
              Actualizar
            </Button>
          </div>
        </div>
      )}

      {/* ============ DOCUMENTS ============ */}
      {/* SPRINT FRONT-1/4: el listado principal consume EXCLUSIVAMENTE el
          catálogo del DocumentGenerationEngine (GET /document-generation/catalog). */}
      {tab === 'documents' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="filters-row">
            <Input placeholder="Buscar por título o entidad..." value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} aria-label="Buscar por título o entidad" />
            <Select value={catalogStatus} onChange={(e) => setCatalogStatus(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todos estados</option>
              {(Object.entries(CATALOG_STATUS_LABELS) as [DocumentCatalogStatus, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            {/* SPRINT FRONT-3 — filtros avanzados soportados por el backend. */}
            <Select value={catalogDocType} onChange={(e) => setCatalogDocType(e.target.value)} aria-label="Filtrar por tipo documental">
              <option value="">Todos tipos</option>
              {CATALOG_DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Select value={catalogSourceModule} onChange={(e) => setCatalogSourceModule(e.target.value)} aria-label="Filtrar por módulo fuente">
              <option value="">Todos módulos</option>
              {CATALOG_SOURCE_MODULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Input type="date" value={catalogFrom} onChange={(e) => setCatalogFrom(e.target.value)} aria-label="Generado desde" />
            <Input type="date" value={catalogTo} onChange={(e) => setCatalogTo(e.target.value)} aria-label="Generado hasta" />
            <Button type="button" onClick={() => void loadCatalog({ ...buildCatalogQuery(), page: 1 })}>Buscar</Button>
            <Button type="button" variant="secondary" onClick={() => { setCatalogSearch(''); setCatalogStatus(''); setCatalogDocType(''); setCatalogSourceModule(''); setCatalogFrom(''); setCatalogTo(''); void loadCatalog(); }}>Limpiar</Button>
            <Button type="button" onClick={() => setShowGenerate(true)}>+ Nuevo Documento</Button>
          </div>

          {catalogLoading ? <p className="muted">Cargando...</p> : null}

          {!catalogLoading && (catalogPage?.items.length ?? 0) === 0 ? (
            <p className="muted">No hay documentos en el catálogo. Genera un documento aprobado desde PHVA Advanced.</p>
          ) : null}

          {(catalogPage?.items.length ?? 0) > 0 && catalogPage ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre Documento</th>
                    <th>Empresa</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Versión</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogPage.items.map((item) => (
                    <tr key={item.id} style={{ cursor: 'pointer' }} tabIndex={0}
                      role="button"
                      aria-label={`Ver detalle de ${item.title}`}
                      onClick={() => openDetail(item.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(item.id); }
                      }}
                    >
                      <td>
                        <strong>{item.title}</strong>
                        <div className="muted" style={{ fontSize: '.78rem' }}>{item.sourceModule} / {item.sourceEntity}</div>
                      </td>
                      <td>{item.companyName ?? '—'}</td>
                      <td><CatalogStatusBadge status={item.status} /></td>
                      <td style={{ fontSize: '.85rem' }}>{formatDate(item.generatedAt)}</td>
                      <td>v{item.version}</td>
                      <td>
                        <div className="actions" style={{ gap: '.35rem' }}>
                          <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                            aria-label={`Ver detalle de ${item.title}`}
                            onClick={(e) => { e.stopPropagation(); openDetail(item.id); }}>
                            Ver detalle
                          </Button>
                          <a className="btn btn-secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }} href={item.downloadUrl} target="_blank" rel="noreferrer"
                            aria-label={`Descargar ${item.title}`}
                            onClick={(e) => e.stopPropagation()}>
                            Descargar
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Paginación del catálogo */}
              {catalogPage.totalPages > 1 ? (
                <div className="actions" style={{ marginTop: '.75rem', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" disabled={catalogPage.page <= 1}
                    onClick={() => void loadCatalog({ ...buildCatalogQuery(), page: catalogPage.page - 1 })}>
                    Anterior
                  </Button>
                  <span className="muted" style={{ fontSize: '.85rem' }}>Página {catalogPage.page} de {catalogPage.totalPages} · {catalogPage.total} documentos</span>
                  <Button type="button" variant="secondary" disabled={catalogPage.page >= catalogPage.totalPages}
                    onClick={() => void loadCatalog({ ...buildCatalogQuery(), page: catalogPage.page + 1 })}>
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* ============ VERSIONS (SPRINT FRONT-4) ============ */}
      {/* Consume DocumentInstance.versions vía selectedDocumentDetail. */}
      {tab === 'versions' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {!selectedDocumentDetail ? (
            <p className="muted">Selecciona un documento en la pestaña Documentos para ver sus versiones.</p>
          ) : (
            <>
              <div className="advanced-management__section">
                <strong>{selectedDocumentDetail.title}</strong>
                <span style={{ marginLeft: '.5rem' }}><CatalogStatusBadge status={selectedDocumentDetail.status} /></span>
              </div>
              <DocumentVersionTimeline versions={buildVersionItems(selectedDocumentDetail)} />
            </>
          )}
        </div>
      )}

      {/* ============ APPROVALS (SPRINT FRONT-4) ============ */}
      {/* Consume DocumentCatalogDetail.approval (ApprovalEvent del Workflow). */}
      {tab === 'approvals' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {!selectedDocumentDetail ? (
            <p className="muted">Selecciona un documento en la pestaña Documentos para ver su aprobación.</p>
          ) : (
            <>
              <div className="advanced-management__section">
                <strong>{selectedDocumentDetail.title}</strong>
                <span style={{ marginLeft: '.5rem' }}><CatalogStatusBadge status={selectedDocumentDetail.status} /></span>
              </div>
              <DocumentApprovalTimeline approval={toApprovalInfo(selectedDocumentDetail)} />
            </>
          )}
        </div>
      )}

      {/* ============ EXPIRATION (SPRINT FRONT-5) ============ */}
      {/* Consume el catálogo (DocumentInstance) con filtros de fecha de
          generación (generatedFrom / generatedTo). DocumentInstance aún no
          expone expirationDate: la tabla muestra "Sin fecha definida". */}
      {tab === 'expiration' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="filters-row">
            <Input type="date" value={expFrom} onChange={(e) => setExpFrom(e.target.value)} aria-label="Generado desde" />
            <Input type="date" value={expTo} onChange={(e) => setExpTo(e.target.value)} aria-label="Generado hasta" />
            <Button type="button" onClick={() => void loadExpirationItems(buildExpirationQuery())}>Buscar</Button>
            <Button type="button" variant="secondary" onClick={() => { setExpFrom(''); setExpTo(''); void loadExpirationItems(); }}>Limpiar</Button>
            <Button type="button" variant="secondary" onClick={() => void loadExpirationItems()}>Actualizar</Button>
          </div>
          <DocumentExpirationTable documents={expirationItems} loading={expirationLoading} />
        </div>
      )}

      {/* ============ HISTORY (SPRINT FRONT-4) ============ */}
      {/* Trazabilidad construida SOLO con datos reales de DocumentInstance +
          metadata de aprobación (sin eventos inventados). */}
      {tab === 'history' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {!selectedDocumentDetail ? (
            <p className="muted">Selecciona un documento en la pestaña Documentos para ver su trazabilidad.</p>
          ) : (
            <>
              <div className="advanced-management__section">
                <strong>{selectedDocumentDetail.title}</strong>
                <span style={{ marginLeft: '.5rem' }}><CatalogStatusBadge status={selectedDocumentDetail.status} /></span>
              </div>
              <DocumentHistoryTimeline items={buildHistoryItems(selectedDocumentDetail)} />
            </>
          )}
        </div>
      )}

      {/* ============ ARCHIVE (SPRINT FRONT-4) ============ */}
      {/* Consume el catálogo con status=ARCHIVED (reutiliza getCatalog). */}
      {tab === 'archive' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => void loadArchived()}>Actualizar</Button>
          </div>

          {archivedLoading ? <p className="muted">Cargando...</p> : null}

          {!archivedLoading && archivedItems.length === 0 ? (
            <p className="muted">No hay documentos archivados en el catálogo.</p>
          ) : (
            <div className="archive-grid">
              {archivedItems.map((item) => (
                <div key={item.id} className="archive-item">
                  <div className="archive-item__header">
                    <div>
                      <strong>{item.title}</strong>
                      <span style={{ marginLeft: '.5rem' }}><CatalogStatusBadge status={item.status} /></span>
                    </div>
                    <div className="actions">
                      <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                        onClick={() => openDetail(item.id)}>
                        Ver detalle
                      </Button>
                      <a className="btn btn-primary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }} href={item.downloadUrl} target="_blank" rel="noreferrer"
                        aria-label={`Descargar ${item.title}`}>
                        Descargar
                      </a>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '.82rem', color: '#64748b', flexWrap: 'wrap' }}>
                    <span>v{item.version}</span>
                    <span>{item.companyName ?? '—'}</span>
                    <span>Generado: {formatDate(item.generatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ SPRINT FRONT-2/4 — CATALOG DETAIL DRAWER ============ */}
      <DocumentCatalogDetailDrawer
        open={Boolean(selectedDocumentId)}
        detail={selectedDocumentDetail}
        loading={catalogDetailLoading}
        error={catalogDetailError}
        notFound={catalogDetailNotFound}
        onOpenChange={(open) => { if (!open) closeDetail(); }}
        onRetry={() => { if (selectedDocumentId) void loadCatalogDetail(selectedDocumentId); }}
      />

      {/* ============ SPRINT FRONT-6B — GENERATE MODAL (DocumentGenerationEngine) ============ */}
      {/* Usa exclusivamente GET /templates/company/:companyId y
          POST /templates/generate/:templateId (que delega internamente al motor). */}
      <DocumentGenerateModal
        open={showGenerate}
        token={token}
        companyId={companyId}
        onClose={() => setShowGenerate(false)}
        onGenerated={handleGenerated}
      />
    </div>
  );
}
