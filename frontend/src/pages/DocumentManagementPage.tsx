import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getCatalog, getCatalogItem } from '../services/document-catalog.service';
import { getDocumentDashboard } from '../services/document-dashboard.service';
import {
  fetchDocumentManagementList,
  fetchDocumentPendingApprovals,
  fetchDocumentCatalogByMaster,
  submitDocumentForApproval,
  approveDocument,
  rejectDocument,
  requestDocumentAdjustments,
  type DocumentMasterItem,
  type DocumentApprovalItem,
} from '../api';
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
import { PhvaBackButton } from '../components/PhvaBackButton';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { ApprovalStatusBadge } from '../components/ui/ApprovalStatusBadge';
import { ApprovalRejectModal } from '../components/ui/ApprovalRejectModal';
import { ApprovalAdjustmentsModal } from '../components/ui/ApprovalAdjustmentsModal';
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
  { id: 'documents', label: 'Documentos generados' },
  { id: 'versions', label: 'Versiones' },
  { id: 'approvals', label: 'Gestión y aprobaciones' },
  { id: 'expiration', label: 'Vencimientos' },
  { id: 'history', label: 'Historial' },
  { id: 'archive', label: 'Archivo' },
];

export function DocumentManagementPage({ token }: Props) {
  const location = useLocation();
  const sourceParam = (location.state as Record<string, unknown> | null)?.source;
  const isFromPhva251 = sourceParam === 'phva-2.5.1';

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

  // BLOQUE 4 — Aprobación documental 2.5.1 (DocumentMaster).
  const [pendingApprovals, setPendingApprovals] = useState<DocumentApprovalItem[]>([]);
  const [pendingApprovalsLoading, setPendingApprovalsLoading] = useState(false);
  const [masterDocuments, setMasterDocuments] = useState<DocumentMasterItem[]>([]);
  const [masterDocumentsLoading, setMasterDocumentsLoading] = useState(false);

  // BLOQUE 4 — modales de aprobación.
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showAdjustmentsModal, setShowAdjustmentsModal] = useState(false);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [selectedDocumentForAction, setSelectedDocumentForAction] = useState<DocumentMasterItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // BLOQUE 5C — navegación cruzada entre pestañas.
  const [highlightMasterId, setHighlightMasterId] = useState<string | null>(null);
  const [highlightInstanceId, setHighlightInstanceId] = useState<string | null>(null);

  // BLOQUE 5.1 — caché de instancias resueltas por documentMasterId.
  // Evita llamadas API repetidas para el mismo master.
  const [resolvedInstances, setResolvedInstances] = useState<Map<string, DocumentCatalogItem>>(new Map());
  const [resolvingMasterId, setResolvingMasterId] = useState<string | null>(null);

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

  // BLOQUE 4 — carga aprobaciones pendientes y documentos master.
  const loadPendingApprovals = useCallback(async () => {
    setPendingApprovalsLoading(true);
    setActionError('');
    try {
      const approvals = await fetchDocumentPendingApprovals(token);
      setPendingApprovals(approvals);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error cargando aprobaciones pendientes');
    } finally {
      setPendingApprovalsLoading(false);
    }
  }, [token]);

  const loadMasterDocuments = useCallback(async () => {
    setMasterDocumentsLoading(true);
    try {
      const docs = await fetchDocumentManagementList(token);
      setMasterDocuments(docs);
    } catch { /* ignore */ } finally {
      setMasterDocumentsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'dashboard') void loadPanelData();
    if (tab === 'documents') void loadCatalog();
    if (tab === 'expiration') void loadExpirationItems();
    if (tab === 'archive') void loadArchived();
    if (tab === 'approvals') { void loadPendingApprovals(); void loadMasterDocuments(); }
  }, [tab, loadPanelData, loadCatalog, loadExpirationItems, loadArchived, loadPendingApprovals, loadMasterDocuments]);

  // BLOQUE 5.1 — resolver instancias vinculadas cuando la pestaña Aprobaciones
  // carga documentos master y el catálogo no está disponible.
  useEffect(() => {
    if (tab !== 'approvals' || masterDocuments.length === 0) return;
    // Solo resolver si no tenemos todas las instancias en catálogo o resolvedInstances.
    const unresolved = masterDocuments.filter((doc) => {
      if (catalogPage?.items.some((item) => item.documentMasterId === doc._id)) return false;
      if (resolvedInstances.has(doc._id)) return false;
      return true;
    });
    if (unresolved.length === 0) return;
    // Resolver en paralelo, sin bloquear la UI.
    void Promise.allSettled(
      unresolved.map((doc) => resolveLinkedInstance(doc._id)),
    );
  }, [tab, masterDocuments, catalogPage, resolvedInstances, resolveLinkedInstance]);

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

  // BLOQUE 4 — handlers de aprobación documental.
  const handleApprove = useCallback(async () => {
    if (!selectedApprovalId) return;
    setActionLoading(true);
    setActionError('');
    try {
      await approveDocument(token, selectedApprovalId, {});
      setSelectedApprovalId(null);
      setSelectedDocumentForAction(null);
      void loadPendingApprovals();
      void loadMasterDocuments();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error al aprobar el documento');
    } finally {
      setActionLoading(false);
    }
  }, [token, selectedApprovalId, loadPendingApprovals, loadMasterDocuments]);

  const handleReject = useCallback(async (reason: string) => {
    if (!selectedApprovalId) return;
    setActionLoading(true);
    setActionError('');
    try {
      await rejectDocument(token, selectedApprovalId, reason);
      setShowRejectModal(false);
      setSelectedApprovalId(null);
      setSelectedDocumentForAction(null);
      void loadPendingApprovals();
      void loadMasterDocuments();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error al rechazar el documento');
    } finally {
      setActionLoading(false);
    }
  }, [token, selectedApprovalId, loadPendingApprovals, loadMasterDocuments]);

  const handleRequestAdjustments = useCallback(async (reason: string) => {
    if (!selectedDocumentForAction) return;
    setActionLoading(true);
    setActionError('');
    try {
      await requestDocumentAdjustments(token, selectedDocumentForAction._id, reason);
      setShowAdjustmentsModal(false);
      setSelectedApprovalId(null);
      setSelectedDocumentForAction(null);
      void loadPendingApprovals();
      void loadMasterDocuments();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error al solicitar ajustes');
    } finally {
      setActionLoading(false);
    }
  }, [token, selectedDocumentForAction, loadPendingApprovals, loadMasterDocuments]);

  const handleSubmitForApproval = useCallback(async (documentId: string) => {
    setActionLoading(true);
    setActionError('');
    try {
      await submitDocumentForApproval(token, documentId);
      void loadPendingApprovals();
      void loadMasterDocuments();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error al enviar a aprobación');
    } finally {
      setActionLoading(false);
    }
  }, [token, loadPendingApprovals, loadMasterDocuments]);

  const openRejectModal = useCallback((approvalId: string, doc: DocumentMasterItem) => {
    setSelectedApprovalId(approvalId);
    setSelectedDocumentForAction(doc);
    setShowRejectModal(true);
    setActionError('');
  }, []);

  const openAdjustmentsModal = useCallback((doc: DocumentMasterItem) => {
    setSelectedDocumentForAction(doc);
    setShowAdjustmentsModal(true);
    setActionError('');
  }, []);

  /** Helper: obtiene el label legible de un documento para los modales. */
  const documentLabel = useCallback((doc: DocumentMasterItem | null) => {
    if (!doc) return '';
    return `${doc.code} — ${doc.name}`;
  }, []);

  // BLOQUE 5C — navegación cruzada.
  const navigateToApprovals = useCallback((masterId: string) => {
    setHighlightMasterId(masterId);
    setTab('approvals');
    // Limpiar highlight después de 3 segundos.
    setTimeout(() => setHighlightMasterId(null), 3000);
  }, []);

  const navigateToDocuments = useCallback((instanceId: string) => {
    setHighlightInstanceId(instanceId);
    setTab('documents');
    // Limpiar highlight después de 3 segundos.
    setTimeout(() => setHighlightInstanceId(null), 3000);
  }, []);

  // BLOQUE 5.1 — resuelve un DocumentInstance a partir de un DocumentMasterId.
  // Primero busca en catalogPage (si ya está cargado), luego en resolvedInstances,
  // y finalmente consulta la API si no existe en memoria.
  const resolveLinkedInstance = useCallback(async (masterId: string): Promise<DocumentCatalogItem | null> => {
    // 1. Buscar en catalogPage cargado.
    if (catalogPage) {
      const found = catalogPage.items.find((item) => item.documentMasterId === masterId);
      if (found) return found;
    }
    // 2. Buscar en caché de resueltas.
    const cached = resolvedInstances.get(masterId);
    if (cached) return cached;
    // 3. Consultar la API.
    try {
      setResolvingMasterId(masterId);
      const instance = await fetchDocumentCatalogByMaster(token, masterId);
      if (instance) {
        setResolvedInstances((prev) => new Map(prev).set(masterId, instance));
      }
      return instance;
    } catch {
      return null;
    } finally {
      setResolvingMasterId(null);
    }
  }, [token, catalogPage, resolvedInstances]);

  return (
    <div className="doc-mgmt">
      <PhvaBackButton />
      {isFromPhva251 && (
        <div style={{ padding: '.5rem 1rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '.375rem', fontSize: '.85rem', color: '#0369a1', marginBottom: '1rem' }}>
          📋 Gestión documental — soporte para PHVA 2.5.1 «Conservación documental»
        </div>
      )}
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
                    <tr key={item.id} style={{ cursor: 'pointer', backgroundColor: highlightInstanceId === item.id ? '#eff6ff' : undefined, transition: 'background-color 0.3s' }} tabIndex={0}
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
                          {item.documentMasterId && (
                            <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                              aria-label={`Ver aprobación de ${item.title}`}
                              onClick={(e) => { e.stopPropagation(); navigateToApprovals(item.documentMasterId!); }}>
                              📋 Ver aprobación
                            </Button>
                          )}
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
          {actionError && (
            <div className="advanced-management__alert" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>{actionError}</div>
          )}

          {/* === Aprobaciones pendientes === */}
          <div className="advanced-management__section">
            <div className="actions" style={{ justifyContent: 'space-between', marginBottom: '.5rem' }}>
              <h3 style={{ margin: 0 }}>Aprobaciones pendientes</h3>
              <Button type="button" variant="secondary" onClick={() => void loadPendingApprovals()} disabled={pendingApprovalsLoading}>
                Actualizar
              </Button>
            </div>
            {pendingApprovalsLoading ? <p className="muted">Cargando aprobaciones pendientes...</p> : null}
            {!pendingApprovalsLoading && pendingApprovals.length === 0 ? (
              <p className="muted">No hay documentos pendientes de aprobación.</p>
            ) : null}
            {!pendingApprovalsLoading && pendingApprovals.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Solicitado por</th>
                      <th>Fecha solicitud</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingApprovals.map((approval) => {
                      const doc = typeof approval.documentId === 'object' && approval.documentId !== null
                        ? approval.documentId as DocumentMasterItem
                        : null;
                      return (
                        <tr key={approval._id}>
                          <td>
                            <strong>{doc?.code ?? '—'}</strong>
                            <div className="muted" style={{ fontSize: '.78rem' }}>{doc?.name ?? '—'}</div>
                          </td>
                          <td>{approval.requestedBy?.email ?? '—'}</td>
                          <td style={{ fontSize: '.85rem' }}>{formatDate(approval.createdAt)}</td>
                          <td>
                            <div className="actions" style={{ gap: '.35rem' }}>
                              <Button type="button" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                                disabled={actionLoading}
                                onClick={() => { setSelectedApprovalId(approval._id); void handleApprove(); }}>
                                {actionLoading && selectedApprovalId === approval._id ? 'Aprobando...' : '✅ Aprobar'}
                              </Button>
                              <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                                disabled={actionLoading}
                                onClick={() => openRejectModal(approval._id, doc!)}>
                                ❌ Rechazar
                              </Button>
                              <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                                disabled={actionLoading}
                                onClick={() => openAdjustmentsModal(doc!)}>
                                🔧 Solicitar ajustes
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {/* === Todos los documentos (DocumentMaster) con acciones por estado === */}
          <div className="advanced-management__section">
            <div className="actions" style={{ justifyContent: 'space-between', marginBottom: '.5rem' }}>
              <h3 style={{ margin: 0 }}>Todos los documentos</h3>
              <Button type="button" variant="secondary" onClick={() => void loadMasterDocuments()} disabled={masterDocumentsLoading}>
                Actualizar
              </Button>
            </div>
            {masterDocumentsLoading ? <p className="muted">Cargando documentos...</p> : null}
            {!masterDocumentsLoading && masterDocuments.length === 0 ? (
              <p className="muted">No hay documentos registrados.</p>
            ) : null}
            {!masterDocumentsLoading && masterDocuments.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterDocuments.map((doc) => {
                      // BLOQUE 5.1: buscar instancia generada asociada.
                      // Prioridad: catalogPage > resolvedInstances > loading indicator.
                      const linkedInstance = catalogPage?.items.find((item) => item.documentMasterId === doc._id)
                        ?? resolvedInstances.get(doc._id)
                        ?? null;
                      const isResolving = resolvingMasterId === doc._id;
                      return (
                      <tr key={doc._id} style={{ backgroundColor: highlightMasterId === doc._id ? '#eff6ff' : undefined, transition: 'background-color 0.3s' }}>
                        <td><strong>{doc.code}</strong></td>
                        <td>{doc.name}</td>
                        <td style={{ fontSize: '.85rem' }}>{doc.documentType}</td>
                        <td><ApprovalStatusBadge status={doc.status} /></td>
                        <td>
                          <div className="actions" style={{ gap: '.35rem' }}>
                            {(doc.status === 'DRAFT' || doc.status === 'UNDER_REVIEW') && (
                              <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                                disabled={actionLoading}
                                onClick={() => void handleSubmitForApproval(doc._id)}>
                                📤 Enviar a aprobación
                              </Button>
                            )}
                            {linkedInstance && (
                              <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                                onClick={() => navigateToDocuments(linkedInstance.id)}>
                                📄 Ver documento generado
                              </Button>
                            )}
                            {!linkedInstance && isResolving && (
                              <span className="muted" style={{ fontSize: '.78rem' }}>Buscando documento...</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {/* === Timeline de aprobación del documento seleccionado === */}
          {selectedDocumentDetail ? (
            <>
              <div className="advanced-management__section">
                <strong>{selectedDocumentDetail.title}</strong>
                <span style={{ marginLeft: '.5rem' }}><CatalogStatusBadge status={selectedDocumentDetail.status} /></span>
              </div>
              <DocumentApprovalTimeline approval={toApprovalInfo(selectedDocumentDetail)} />
            </>
          ) : null}

          {/* === Modales de aprobación === */}
          <ApprovalRejectModal
            isOpen={showRejectModal}
            entityLabel={documentLabel(selectedDocumentForAction)}
            loading={actionLoading}
            onSubmit={handleReject}
            onClose={() => { setShowRejectModal(false); setSelectedApprovalId(null); setSelectedDocumentForAction(null); }}
          />
          <ApprovalAdjustmentsModal
            isOpen={showAdjustmentsModal}
            entityLabel={documentLabel(selectedDocumentForAction)}
            loading={actionLoading}
            onSubmit={handleRequestAdjustments}
            onClose={() => { setShowAdjustmentsModal(false); setSelectedDocumentForAction(null); }}
          />
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
