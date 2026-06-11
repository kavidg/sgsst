import { useEffect, useState, useCallback } from 'react';
import {
  DocumentMasterModel, DocumentVersionModel, DocumentHistoryModel,
  DocumentApprovalModel, DocumentSignatureModel, DocumentStatsModel,
  DocumentType, DocumentStatus,
  fetchDocumentsMaster, fetchDocumentMaster, createDocumentMaster,
  updateDocumentMaster, deleteDocumentMaster, changeDocumentStatus,
  fetchDocumentStats, searchDocuments,
  fetchDocumentVersions, uploadDocumentVersion,
  fetchDocumentHistory, fetchAllHistory,
  fetchPendingApprovals, fetchApprovalHistory,
  submitDocumentForApproval, approveDocument, rejectDocument,
  fetchDocumentSignatures, addDocumentSignature,
  fetchExpiringDocuments, fetchExpiredDocuments, checkDocumentExpiration,
  triggerDocumentAlerts,
  DocumentHistoryAction, fetchRetentionRules, createRetentionRule,
  fetchEmployees,
} from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Sheet } from '../components/ui/Sheet';
import { KpiCard } from '../components/KpiCard';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  POLICY: 'Política', PROCEDURE: 'Procedimiento', MANUAL: 'Manual',
  FORMAT: 'Formato', RECORD: 'Registro', MEETING_MINUTES: 'Acta',
  TRAINING_RECORD: 'Capacitación', AUDIT: 'Auditoría', INSPECTION: 'Inspección',
  EMERGENCY_PLAN: 'Plan Emergencia', COPASST: 'COPASST', COMMITTEE: 'Comité',
  LEGAL_DOCUMENT: 'Documento Legal', MEDICAL_RECORD: 'Historia Médica',
  CONTRACTOR_RECORD: 'Contratista', OTHER: 'Otro',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Borrador', UNDER_REVIEW: 'En Revisión', PENDING_APPROVAL: 'Pendiente Aprobación',
  APPROVED: 'Aprobado', ACTIVE: 'Activo', OBSOLETE: 'Obsoleto', ARCHIVED: 'Archivado',
};

const ACTION_LABELS: Record<DocumentHistoryAction, string> = {
  CREATE: 'Creación', EDIT: 'Edición', DELETE: 'Eliminación',
  VERSION_CHANGE: 'Cambio Versión', APPROVAL: 'Aprobación',
  SIGNATURE: 'Firma', ARCHIVE: 'Archivo', RESTORE: 'Restauración',
  STATUS_CHANGE: 'Cambio Estado', DOWNLOAD: 'Descarga', REPLACEMENT: 'Reemplazo',
};

function typeBadgeClass(dt: DocumentType): string {
  const map: Record<string, string> = {
    POLICY: 'policy', PROCEDURE: 'procedure', RECORD: 'record',
    MANUAL: 'manual', FORMAT: 'format', AUDIT: 'audit',
    INSPECTION: 'inspection', TRAINING_RECORD: 'training',
    COPASST: 'copasst',
  };
  return `doc-type-badge--${map[dt] || 'default'}`;
}

function statusBadgeClass(st: DocumentStatus): string {
  const map: Record<DocumentStatus, string> = {
    DRAFT: 'draft', UNDER_REVIEW: 'review', PENDING_APPROVAL: 'pending',
    APPROVED: 'approved', ACTIVE: 'active', OBSOLETE: 'obsolete', ARCHIVED: 'archived',
  };
  return `status-badge--${map[st]}`;
}

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getUserName(u: unknown): string {
  if (!u) return '—';
  if (typeof u === 'object' && u !== null) {
    const obj = u as Record<string, unknown>;
    return (obj.name as string) || (obj.email as string) || '—';
  }
  return String(u);
}

function getUserId(u: unknown): string {
  if (!u) return '';
  if (typeof u === 'object' && u !== null) {
    return ((u as Record<string, unknown>)._id as string) || '';
  }
  return String(u);
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
  const [tab, setTab] = useState<TabId>('dashboard');
  const [docs, setDocs] = useState<DocumentMasterModel[]>([]);
  const [stats, setStats] = useState<DocumentStatsModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Document detail drawer
  const [detailDocId, setDetailDocId] = useState<string | null>(null);
  const [detailDoc, setDetailDoc] = useState<DocumentMasterModel | null>(null);
  const [docVersions, setDocVersions] = useState<DocumentVersionModel[]>([]);
  const [docHistory, setDocHistory] = useState<DocumentHistoryModel[]>([]);
  const [docApprovals, setDocApprovals] = useState<DocumentApprovalModel[]>([]);
  const [docSignatures, setDocSignatures] = useState<DocumentSignatureModel[]>([]);
  const [expirationInfo, setExpirationInfo] = useState<{ isExpired: boolean; retentionDate: string | null; daysUntilExpiration: number | null } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create document modal
  const [showCreate, setShowCreate] = useState(false);
  const [createCode, setCreateCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createType, setCreateType] = useState<DocumentType>('POLICY');
  const [createProcess, setCreateProcess] = useState('');
  const [createExpiration, setCreateExpiration] = useState('');

  // Edit document modal
  const [editDoc, setEditDoc] = useState<DocumentMasterModel | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editProcess, setEditProcess] = useState('');

  // Search / Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searchProcess, setSearchProcess] = useState('');
  const [searchYear, setSearchYear] = useState('');

  // Pending approvals
  const [pendingApprovals, setPendingApprovals] = useState<DocumentApprovalModel[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<DocumentApprovalModel[]>([]);

  // Expiration
  const [expiringDocs, setExpiringDocs] = useState<Record<number, DocumentMasterModel[]>>({});
  const [expiredDocs, setExpiredDocs] = useState<DocumentMasterModel[]>([]);
  const [archiveDocs, setArchiveDocs] = useState<DocumentMasterModel[]>([]);

  // All history
  const [allHistory, setAllHistory] = useState<DocumentHistoryModel[]>([]);

  // Version upload
  const [showVersionUpload, setShowVersionUpload] = useState(false);
  const [versionFileUrl, setVersionFileUrl] = useState('');
  const [versionDescription, setVersionDescription] = useState('');

  // Approval flow
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');

  const [userName, setUserName] = useState('');
  useEffect(() => {
    const fn = localStorage.getItem('profile:firstName');
    const ln = localStorage.getItem('profile:lastName');
    setUserName([fn, ln].filter(Boolean).join(' ') || 'User');
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, s] = await Promise.all([
        fetchDocumentsMaster(token),
        fetchDocumentStats(token),
      ]);
      setDocs(d);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading documents');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadData(); }, [loadData]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const [doc, versions, history, approvals, signatures] = await Promise.all([
        fetchDocumentMaster(token, id),
        fetchDocumentVersions(token, id),
        fetchDocumentHistory(token, id),
        searchDocuments(token, { status: 'PENDING_APPROVAL' }),
        fetchDocumentSignatures(token, id),
      ]);
      setDetailDoc(doc);
      setDocVersions(versions);
      setDocHistory(history);
      setDocSignatures(signatures);
      try {
        const exp = await checkDocumentExpiration(token, id);
        setExpirationInfo(exp);
      } catch { setExpirationInfo(null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading document detail');
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (detailDocId) void loadDetail(detailDocId);
  }, [detailDocId, loadDetail]);

  const loadApprovals = useCallback(async () => {
    try {
      const [pending, history] = await Promise.all([
        fetchPendingApprovals(token),
        fetchApprovalHistory(token),
      ]);
      setPendingApprovals(pending);
      setApprovalHistory(history);
    } catch { /* ignore */ }
  }, [token]);

  const loadExpiration = useCallback(async () => {
    try {
      const [exp60, exp30, exp15, exp5, exp1, expired] = await Promise.all([
        fetchExpiringDocuments(token, 60),
        fetchExpiringDocuments(token, 30),
        fetchExpiringDocuments(token, 15),
        fetchExpiringDocuments(token, 5),
        fetchExpiringDocuments(token, 1),
        fetchExpiredDocuments(token),
      ]);
      setExpiringDocs({ 60: exp60, 30: exp30, 15: exp15, 5: exp5, 1: exp1 });
      setExpiredDocs(expired);
    } catch { /* ignore */ }
  }, [token]);

  const loadHistory = useCallback(async () => {
    try { setAllHistory(await fetchAllHistory(token)); } catch { /* ignore */ }
  }, [token]);

  const loadArchive = useCallback(async () => {
    try {
      const d = await fetchDocumentsMaster(token);
      setArchiveDocs(d.filter((doc) => doc.status === 'ARCHIVED' || doc.status === 'OBSOLETE'));
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    if (tab === 'approvals') void loadApprovals();
    if (tab === 'expiration') void loadExpiration();
    if (tab === 'history') void loadHistory();
    if (tab === 'archive') void loadArchive();
  }, [tab, loadApprovals, loadExpiration, loadHistory, loadArchive]);

  const handleCreate = async () => {
    if (!createCode || !createName) { setError('Código y nombre son requeridos'); return; }
    try {
      await createDocumentMaster(token, {
        code: createCode, name: createName,
        description: createDesc || undefined,
        documentType: createType,
        process: createProcess || undefined,
        expirationDate: createExpiration || undefined,
      });
      setShowCreate(false);
      setCreateCode(''); setCreateName(''); setCreateDesc(''); setCreateProcess(''); setCreateExpiration('');
      setSuccess('Documento creado exitosamente');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creando documento');
    }
  };

  const handleEdit = async () => {
    if (!editDoc) return;
    try {
      await updateDocumentMaster(token, editDoc._id, {
        name: editName, description: editDesc || undefined,
        process: editProcess || undefined,
      });
      setEditDoc(null);
      setSuccess('Documento actualizado');
      await loadData();
      if (detailDocId) await loadDetail(detailDocId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualizando documento');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDocumentMaster(token, id);
      setSuccess('Documento eliminado');
      await loadData();
      if (detailDocId === id) { setDetailDocId(null); setDetailDoc(null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando documento');
    }
  };

  const handleStatusChange = async (id: string, status: DocumentStatus) => {
    try {
      await changeDocumentStatus(token, id, status);
      setSuccess(`Estado cambiado a ${STATUS_LABELS[status]}`);
      await loadData();
      if (detailDocId) await loadDetail(detailDocId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cambiando estado');
    }
  };

  const handleSubmitApproval = async (docId: string) => {
    try {
      await submitDocumentForApproval(token, docId, approvalComment || undefined);
      setSuccess('Documento enviado para aprobación');
      setApprovalComment('');
      await loadData();
      if (detailDocId) await loadDetail(detailDocId);
      void loadApprovals();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error enviando para aprobación');
    }
  };

  const handleApprove = async (approvalId: string) => {
    try {
      await approveDocument(token, approvalId, {
        approvedBy: getUserId(detailDoc?.approvalUser || ''),
        comments: approvalComment || undefined,
        signerName: signerName || userName,
        signerEmail: signerEmail || undefined,
      });
      setSuccess('Documento aprobado');
      setApprovalComment(''); setSignerName(''); setSignerEmail('');
      void loadApprovals();
      if (detailDocId) await loadDetail(detailDocId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error aprobando documento');
    }
  };

  const handleReject = async () => {
    if (!showRejectModal || !rejectReason) { setError('Razón de rechazo requerida'); return; }
    try {
      await rejectDocument(token, showRejectModal, rejectReason, approvalComment || undefined);
      setSuccess('Documento rechazado');
      setShowRejectModal(null); setRejectReason(''); setApprovalComment('');
      void loadApprovals();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error rechazando documento');
    }
  };

  const handleUploadVersion = async (docId: string) => {
    if (!versionFileUrl) { setError('URL del archivo requerida'); return; }
    try {
      await uploadDocumentVersion(token, docId, versionFileUrl, versionDescription || undefined);
      setShowVersionUpload(false);
      setVersionFileUrl(''); setVersionDescription('');
      setSuccess('Nueva versión subida');
      if (detailDocId) await loadDetail(detailDocId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error subiendo versión');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await changeDocumentStatus(token, id, 'ACTIVE', 'Restaurado desde archivo');
      setSuccess('Documento restaurado');
      void loadArchive();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error restaurando documento');
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const filters: Record<string, string | number | undefined> = {};
      if (searchQuery) filters.query = searchQuery;
      if (searchType) filters.documentType = searchType;
      if (searchStatus) filters.status = searchStatus;
      if (searchProcess) filters.process = searchProcess;
      if (searchYear) filters.year = Number(searchYear);
      const result = await searchDocuments(token, filters);
      setDocs(result.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error buscando documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAlerts = async () => {
    try {
      await triggerDocumentAlerts(token);
      setSuccess('Alertas de documentos generadas');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando alertas');
    }
  };

  const filteredDocs = docs;

  const renderTypeBadge = (dt: DocumentType) => (
    <span className={`doc-type-badge ${typeBadgeClass(dt)}`}>{DOCUMENT_TYPE_LABELS[dt]}</span>
  );

  const renderStatusBadge = (st: DocumentStatus) => (
    <span className={`status-badge ${statusBadgeClass(st)}`}>{STATUS_LABELS[st]}</span>
  );

  const renderStatCard = (label: string, value: number | string, variant: string, extra?: string) => (
    <div className={`doc-stat-card doc-stat-card--${variant}`}>
      <div className="doc-stat-card__label">{label}</div>
      <div className="doc-stat-card__value">{value}</div>
      {extra ? <div className="muted" style={{ fontSize: '.8rem' }}>{extra}</div> : null}
    </div>
  );

  return (
    <div className="doc-mgmt">
      {error && <div className="advanced-management__alert" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>{error}</div>}
      {success && <div className="advanced-management__alert" style={{ borderColor: '#bbf7d0', background: '#f0fdf4', color: '#166534' }}>{success}</div>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`tab-btn ${tab === t.id ? 'tab-btn--active' : ''}`}
            onClick={() => { setTab(t.id); setError(''); setSuccess(''); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ DASHBOARD ============ */}
      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="doc-stats-grid">
            {renderStatCard('Total Documentos', stats?.total ?? '—', 'info')}
            {renderStatCard('Activos', stats?.active ?? '—', 'good')}
            {renderStatCard('Por Tipo', Object.keys(stats?.byType ?? {}).length, 'info', 'tipos diferentes')}
            {renderStatCard('Por Vencer', stats?.expiringSoon ?? '—', 'warning', 'próximos 30 días')}
            {renderStatCard('Vencidos', stats?.expired ?? '—', 'danger')}
          </div>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <Card title="Documentos por Estado">
              {stats && Object.entries(stats.byStatus).length > 0 ? (
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {Object.entries(stats.byStatus).map(([st, count]) => (
                    <div key={st} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.3rem 0' }}>
                      <span>{renderStatusBadge(st as DocumentStatus)}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">Sin datos</p>}
            </Card>
            <Card title="Documentos por Tipo">
              {stats && Object.entries(stats.byType).length > 0 ? (
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {Object.entries(stats.byType).slice(0, 10).map(([dt, count]) => (
                    <div key={dt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.3rem 0' }}>
                      <span>{renderTypeBadge(dt as DocumentType)}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">Sin datos</p>}
            </Card>
          </div>

          <div className="actions">
            <Button type="button" onClick={handleTriggerAlerts}>Generar Alertas de Vencimiento</Button>
            <Button type="button" variant="secondary" onClick={() => void loadData()}>Actualizar</Button>
          </div>
        </div>
      )}

      {/* ============ DOCUMENTS ============ */}
      {tab === 'documents' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="filters-row">
            <Input placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <Select value={searchType} onChange={(e) => setSearchType(e.target.value)}>
              <option value="">Todos tipos</option>
              {(Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            <Select value={searchStatus} onChange={(e) => setSearchStatus(e.target.value)}>
              <option value="">Todos estados</option>
              {(Object.entries(STATUS_LABELS) as [DocumentStatus, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            <Input placeholder="Proceso" value={searchProcess} onChange={(e) => setSearchProcess(e.target.value)} />
            <Input type="number" placeholder="Año" value={searchYear} onChange={(e) => setSearchYear(e.target.value)} />
            <Button type="button" onClick={handleSearch}>Buscar</Button>
            <Button type="button" variant="secondary" onClick={() => void loadData()}>Limpiar</Button>
            <Button type="button" onClick={() => setShowCreate(true)}>+ Nuevo Documento</Button>
          </div>

          {loading ? <p className="muted">Cargando...</p> : null}

          {!loading && filteredDocs.length === 0 ? (
            <p className="muted">No hay documentos registrados. Crea el primero.</p>
          ) : null}

          {filteredDocs.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Versión</th>
                    <th>Estado</th>
                    <th>Responsable</th>
                    <th>Vencimiento</th>
                    <th>Actualización</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => (
                    <tr key={doc._id}>
                      <td><strong>{doc.code}</strong></td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ padding: '.25rem .5rem', fontSize: '.88rem', textAlign: 'left', border: 'none', color: '#2563eb', cursor: 'pointer' }}
                          onClick={() => setDetailDocId(doc._id)}>
                          {doc.name}
                        </button>
                      </td>
                      <td>{renderTypeBadge(doc.documentType)}</td>
                      <td>v{doc.version}</td>
                      <td>{renderStatusBadge(doc.status)}</td>
                      <td style={{ fontSize: '.85rem' }}>{getUserName(doc.ownerUser)}</td>
                      <td style={{ fontSize: '.85rem' }}>{formatDate(doc.expirationDate)}</td>
                      <td style={{ fontSize: '.85rem' }}>{formatDate(doc.updatedAt)}</td>
                      <td>
                        <div className="actions" style={{ gap: '.35rem' }}>
                          <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                            onClick={() => { setEditDoc(doc); setEditName(doc.name); setEditDesc(doc.description || ''); setEditProcess(doc.process || ''); }}>
                            Editar
                          </Button>
                          <Button type="button" variant="danger" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                            onClick={() => handleDelete(doc._id)}>
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============ VERSIONS ============ */}
      {tab === 'versions' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="filters-row">
            <Input placeholder="Buscar documento..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <Button type="button" onClick={handleSearch}>Buscar</Button>
            <Button type="button" variant="secondary" onClick={() => void loadData()}>Todos</Button>
          </div>

          {loading ? <p className="muted">Cargando...</p> : null}

          {filteredDocs.filter((d) => d.status !== 'ARCHIVED' && d.status !== 'OBSOLETE').map((doc) => (
            <div key={doc._id} className="advanced-management__section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                <div>
                  <strong>{doc.code}</strong> — {doc.name}
                  <span style={{ marginLeft: '.5rem' }}>{renderStatusBadge(doc.status)}</span>
                </div>
                <div className="actions">
                  <Button type="button" variant="secondary" style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
                    onClick={() => { setDetailDocId(doc._id); setTab('documents'); }}>
                    Ver detalle
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {filteredDocs.filter((d) => d.status !== 'ARCHIVED' && d.status !== 'OBSOLETE').length === 0 && !loading && (
            <p className="muted">No hay documentos activos.</p>
          )}
        </div>
      )}

      {/* ============ APPROVALS ============ */}
      {tab === 'approvals' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <h2>Aprobaciones Pendientes</h2>
          {pendingApprovals.length === 0 ? (
            <p className="muted">No hay solicitudes de aprobación pendientes.</p>
          ) : (
            <div style={{ display: 'grid', gap: '.75rem' }}>
              {pendingApprovals.map((ap) => {
                const docData = typeof ap.documentId === 'object' ? ap.documentId as unknown as DocumentMasterModel : null;
                return (
                  <div key={ap._id} className="approval-card approval-card--pending">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
                      <div>
                        <strong>{docData ? `${docData.code} — ${docData.name}` : 'Documento #' + ap.documentId}</strong>
                        <p className="muted" style={{ fontSize: '.85rem' }}>Solicitado por {getUserName(ap.requestedBy)}</p>
                      </div>
                      <div className="actions">
                        <Button type="button" variant="secondary" style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
                          onClick={() => setDetailDocId(typeof ap.documentId === 'string' ? ap.documentId : (ap.documentId as unknown as DocumentMasterModel)._id)}>
                          Ver documento
                        </Button>
                      </div>
                    </div>
                    {ap.comments && <p style={{ margin: 0, fontSize: '.9rem', color: '#475569' }}>Comentarios: {ap.comments}</p>}
                    <div style={{ display: 'grid', gap: '.5rem', padding: '.5rem', background: '#f8fafc', borderRadius: '.75rem' }}>
                      <Input placeholder="Tu nombre (para firma)" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                      <Input placeholder="Email (opcional)" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
                      <Input placeholder="Comentarios" value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)} />
                      <div className="actions">
                        <Button type="button" onClick={() => handleApprove(ap._id)}>Aprobar y Firmar</Button>
                        <Button type="button" variant="danger" onClick={() => { setShowRejectModal(ap._id); setRejectReason(''); }}>Rechazar</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h2>Historial de Aprobaciones</h2>
          {approvalHistory.length === 0 ? (
            <p className="muted">Sin historial de aprobaciones.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Solicitante</th>
                    <th>Estado</th>
                    <th>Aprobador</th>
                    <th>Fecha</th>
                    <th>Comentarios</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalHistory.map((ap) => {
                    const docData = typeof ap.documentId === 'object' ? ap.documentId as unknown as DocumentMasterModel : null;
                    return (
                      <tr key={ap._id}>
                        <td>{docData ? `${docData.code} ${docData.name}` : '—'}</td>
                        <td style={{ fontSize: '.85rem' }}>{getUserName(ap.requestedBy)}</td>
                        <td>
                          <span className={`status-badge status-badge--${ap.status === 'APPROVED' ? 'active' : ap.status === 'REJECTED' ? 'obsolete' : 'pending'}`}>
                            {ap.status === 'APPROVED' ? 'Aprobado' : ap.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                          </span>
                        </td>
                        <td style={{ fontSize: '.85rem' }}>{getUserName(ap.approvedBy)}</td>
                        <td style={{ fontSize: '.85rem' }}>{formatDate(ap.approvedAt || ap.createdAt)}</td>
                        <td style={{ fontSize: '.85rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ap.comments || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============ EXPIRATION ============ */}
      {tab === 'expiration' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => void loadExpiration()}>Actualizar</Button>
            <Button type="button" onClick={handleTriggerAlerts}>Generar Alertas</Button>
          </div>

          {expiredDocs.length > 0 && (
            <div className="expiration-group">
              <div className="expiration-group__header" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                ⚠ Vencidos ({expiredDocs.length})
              </div>
              <div className="expiration-group__list">
                {expiredDocs.map((doc) => (
                  <div key={doc._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', padding: '.3rem 0', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{doc.code}</strong> — {doc.name}
                      <span style={{ marginLeft: '.5rem' }}>{renderTypeBadge(doc.documentType)}</span>
                    </div>
                    <div className="actions">
                      <span style={{ fontSize: '.85rem', color: '#b91c1c', fontWeight: 700 }}>Vence: {formatDate(doc.expirationDate)}</span>
                      <Button type="button" variant="secondary" style={{ padding: '.2rem .5rem', fontSize: '.8rem' }}
                        onClick={() => setDetailDocId(doc._id)}>Ver</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {[60, 30, 15, 5, 1].map((days) => {
            const list = expiringDocs[days] || [];
            if (list.length === 0) return null;
            return (
              <div key={days} className="expiration-group">
                <div className="expiration-group__header" style={days <= 5 ? { background: '#fef2f2', color: '#b91c1c' } : days <= 15 ? { background: '#fffbeb', color: '#a16207' } : {}}>
                  🕐 Vencen en {days} día{days !== 1 ? 's' : ''} ({list.length})
                </div>
                <div className="expiration-group__list">
                  {list.map((doc) => (
                    <div key={doc._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', padding: '.3rem 0', flexWrap: 'wrap' }}>
                      <div>
                        <strong>{doc.code}</strong> — {doc.name}
                        <span style={{ marginLeft: '.5rem' }}>{renderTypeBadge(doc.documentType)}</span>
                        <span style={{ marginLeft: '.5rem' }}>{renderStatusBadge(doc.status)}</span>
                      </div>
                      <div className="actions">
                        <span style={{ fontSize: '.85rem', color: '#64748b' }}>Vence: {formatDate(doc.expirationDate)}</span>
                        <Button type="button" variant="secondary" style={{ padding: '.2rem .5rem', fontSize: '.8rem' }}
                          onClick={() => setDetailDocId(doc._id)}>Ver</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {expiredDocs.length === 0 && Object.values(expiringDocs).every((arr) => arr.length === 0) && (
            <p className="muted">No hay documentos por vencer o vencidos.</p>
          )}
        </div>
      )}

      {/* ============ HISTORY ============ */}
      {tab === 'history' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => void loadHistory()}>Actualizar</Button>
          </div>

          {allHistory.length === 0 ? (
            <p className="muted">No hay actividad registrada aún.</p>
          ) : (
            <div className="history-feed">
              {allHistory.slice(0, 100).map((entry) => (
                <div key={entry._id} className="history-item">
                  <div className="history-item__header">
                    <span className={`history-item__action history-item__action--${entry.action.toLowerCase()}`}>
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    <span style={{ fontSize: '.85rem', color: '#475569' }}>{getUserName(entry.userId)}</span>
                    <span className="history-item__date">{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.description && <p className="history-item__desc">{entry.description}</p>}
                  {(entry.previousValue || entry.newValue) && (
                    <div className="history-item__diff">
                      {entry.previousValue && Object.keys(entry.previousValue).length > 0 && (
                        <div className="history-item__diff-old">
                          ← Anterior: {Object.entries(entry.previousValue).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}
                        </div>
                      )}
                      {entry.newValue && Object.keys(entry.newValue).length > 0 && (
                        <div className="history-item__diff-new">
                          → Nuevo: {Object.entries(entry.newValue).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ ARCHIVE ============ */}
      {tab === 'archive' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => void loadArchive()}>Actualizar</Button>
          </div>

          {archiveDocs.length === 0 ? (
            <p className="muted">No hay documentos archivados u obsoletos.</p>
          ) : (
            <div className="archive-grid">
              {archiveDocs.map((doc) => (
                <div key={doc._id} className="archive-item">
                  <div className="archive-item__header">
                    <div>
                      <strong>{doc.code}</strong> — {doc.name}
                      <span style={{ marginLeft: '.5rem' }}>{renderStatusBadge(doc.status)}</span>
                      <span style={{ marginLeft: '.5rem' }}>{renderTypeBadge(doc.documentType)}</span>
                    </div>
                    <div className="actions">
                      <Button type="button" variant="secondary" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                        onClick={() => setDetailDocId(doc._id)}>
                        Ver
                      </Button>
                      <Button type="button" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                        onClick={() => handleRestore(doc._id)}>
                        Restaurar
                      </Button>
                    </div>
                  </div>
                  {doc.description && <p className="muted" style={{ fontSize: '.85rem' }}>{doc.description}</p>}
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '.82rem', color: '#64748b', flexWrap: 'wrap' }}>
                    <span>v{doc.version}</span>
                    <span>Responsable: {getUserName(doc.ownerUser)}</span>
                    <span>Actualizado: {formatDate(doc.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ DOCUMENT DETAIL DRAWER ============ */}
      <Sheet open={Boolean(detailDocId)} title={detailDoc ? `${detailDoc.code} — ${detailDoc.name}` : 'Cargando...'}
        onOpenChange={(open) => { if (!open) { setDetailDocId(null); setDetailDoc(null); setShowVersionUpload(false); } }}>
        {detailLoading ? <p className="muted">Cargando detalle...</p> : null}

        {detailDoc && !detailLoading ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {/* Metadata */}
            <div className="advanced-management__section">
              <h3>Metadatos</h3>
              <div className="grid grid-2" style={{ gap: '.5rem', fontSize: '.9rem' }}>
                <div><span className="muted">Código:</span> <strong>{detailDoc.code}</strong></div>
                <div><span className="muted">Tipo:</span> {renderTypeBadge(detailDoc.documentType)}</div>
                <div><span className="muted">Estado:</span> {renderStatusBadge(detailDoc.status)}</div>
                <div><span className="muted">Versión:</span> v{detailDoc.version}</div>
                <div><span className="muted">Proceso:</span> {detailDoc.process || '—'}</div>
                <div><span className="muted">Responsable:</span> {getUserName(detailDoc.ownerUser)}</div>
                <div><span className="muted">Vencimiento:</span> {formatDate(detailDoc.expirationDate)}</div>
                <div><span className="muted">Actualizado:</span> {formatDate(detailDoc.updatedAt)}</div>
              </div>
              {detailDoc.description && <p style={{ margin: '.5rem 0 0', color: '#475569' }}>{detailDoc.description}</p>}
            </div>

            {/* Actions */}
            <div className="advanced-management__section">
              <h3>Acciones</h3>
              <div className="actions" style={{ gap: '.5rem' }}>
                {detailDoc.status === 'DRAFT' && (
                  <Button type="button" onClick={() => handleSubmitApproval(detailDoc._id)}>Enviar para Aprobación</Button>
                )}
                {detailDoc.status === 'ACTIVE' && (
                  <Button type="button" variant="secondary" onClick={() => { setShowVersionUpload(true); }}>Subir Nueva Versión</Button>
                )}
                {detailDoc.status !== 'ARCHIVED' && detailDoc.status !== 'OBSOLETE' && (
                  <Button type="button" variant="secondary" onClick={() => handleStatusChange(detailDoc._id, 'ARCHIVED')}>Archivar</Button>
                )}
                {detailDoc.status === 'ARCHIVED' && (
                  <Button type="button" onClick={() => handleStatusChange(detailDoc._id, 'ACTIVE')}>Restaurar</Button>
                )}
              </div>
            </div>

            {/* Version Upload */}
            {showVersionUpload && (
              <div className="advanced-management__section" style={{ borderColor: '#2563eb' }}>
                <h3>Subir Nueva Versión</h3>
                <div className="form-grid">
                  <Input placeholder="URL del archivo" value={versionFileUrl} onChange={(e) => setVersionFileUrl(e.target.value)} />
                  <Input placeholder="Descripción del cambio" value={versionDescription} onChange={(e) => setVersionDescription(e.target.value)} />
                  <div className="actions">
                    <Button type="button" onClick={() => handleUploadVersion(detailDoc._id)}>Subir</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowVersionUpload(false)}>Cancelar</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Versions */}
            <div className="advanced-management__section">
              <h3>Versiones ({docVersions.length})</h3>
              {docVersions.length === 0 ? <p className="muted">Sin versiones registradas.</p> : (
                <div className="versions-timeline">
                  {docVersions.map((v) => (
                    <div key={v._id} className={`version-item ${v.isCurrent ? 'version-item--current' : ''}`}>
                      <div className="version-item__header">
                        <span className="version-item__version">v{v.versionNumber}</span>
                        {v.isCurrent && <span className="version-item__current-badge">Actual</span>}
                        <span className="version-item__date">{formatDate(v.uploadDate || v.createdAt)}</span>
                        <span className="version-item__by">por {getUserName(v.uploadedBy)}</span>
                      </div>
                      {v.changeDescription && <p className="version-item__desc">{v.changeDescription}</p>}
                      {v.fileUrl && (
                        <a href={v.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem', color: '#2563eb' }}>
                          📄 Ver archivo
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Signatures */}
            <div className="advanced-management__section">
              <h3>Firmas ({docSignatures.length})</h3>
              {docSignatures.length === 0 ? <p className="muted">Sin firmas registradas.</p> : (
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {docSignatures.map((sig) => (
                    <div key={sig._id} style={{ border: '1px solid #e2e8f0', borderRadius: '.75rem', padding: '.65rem', display: 'grid', gap: '.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
                        <strong>{sig.signerName}</strong>
                        <span style={{ fontSize: '.82rem', color: '#64748b' }}>{formatDate(sig.createdAt)}</span>
                      </div>
                      {sig.signerEmail && <span style={{ fontSize: '.85rem', color: '#475569' }}>{sig.signerEmail}</span>}
                      {sig.comments && <p className="muted" style={{ fontSize: '.85rem' }}>{sig.comments}</p>}
                      {sig.signatureUrl && (
                        <a href={sig.signatureUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem', color: '#2563eb' }}>
                          📄 Ver firma
                        </a>
                      )}
                      {sig.isExecutiveSignature && <span className="status-badge status-badge--approved" style={{ width: 'fit-content' }}>Firma Ejecutiva</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expiration */}
            {expirationInfo && (
              <div className="advanced-management__section">
                <h3>Vencimiento</h3>
                <div style={{ display: 'grid', gap: '.35rem', fontSize: '.9rem' }}>
                  {expirationInfo.isExpired ? (
                    <span style={{ color: '#b91c1c', fontWeight: 700 }}>⚠ Documento vencido</span>
                  ) : expirationInfo.daysUntilExpiration !== null && expirationInfo.daysUntilExpiration <= 30 ? (
                    <span style={{ color: '#a16207', fontWeight: 700 }}>⚡ Vence en {expirationInfo.daysUntilExpiration} días</span>
                  ) : (
                    <span style={{ color: '#15803d' }}>✓ Vigente</span>
                  )}
                  {expirationInfo.retentionDate && <span>Fecha de retención: {formatDate(expirationInfo.retentionDate)}</span>}
                </div>
              </div>
            )}

            {/* History */}
            <div className="advanced-management__section">
              <h3>Historial ({docHistory.length})</h3>
              <div className="history-feed">
                {docHistory.slice(0, 20).map((entry) => (
                  <div key={entry._id} className="history-item" style={{ padding: '.6rem', fontSize: '.88rem' }}>
                    <div className="history-item__header">
                      <span className={`history-item__action history-item__action--${entry.action.toLowerCase()}`}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </span>
                      <span style={{ fontSize: '.82rem', color: '#64748b' }}>{getUserName(entry.userId)}</span>
                      <span className="history-item__date">{formatDate(entry.createdAt)}</span>
                    </div>
                    {entry.description && <p className="history-item__desc" style={{ fontSize: '.85rem' }}>{entry.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* ============ CREATE MODAL ============ */}
      <Modal isOpen={showCreate} title="Nuevo Documento" onClose={() => setShowCreate(false)}>
        <div className="form-grid">
          <Input placeholder="Código (ej: POL-001)" value={createCode} onChange={(e) => setCreateCode(e.target.value)} required />
          <Input placeholder="Nombre del documento" value={createName} onChange={(e) => setCreateName(e.target.value)} required />
          <Input placeholder="Descripción (opcional)" value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} />
          <Select value={createType} onChange={(e) => setCreateType(e.target.value as DocumentType)}>
            {(Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Input placeholder="Proceso (opcional)" value={createProcess} onChange={(e) => setCreateProcess(e.target.value)} />
          <label className="label">Fecha de vencimiento (opcional)</label>
          <Input type="date" value={createExpiration} onChange={(e) => setCreateExpiration(e.target.value)} />
          <div className="actions">
            <Button type="button" onClick={handleCreate}>Crear Documento</Button>
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* ============ EDIT MODAL ============ */}
      <Modal isOpen={Boolean(editDoc)} title={`Editar: ${editDoc?.code || ''}`} onClose={() => setEditDoc(null)}>
        <div className="form-grid">
          <Input placeholder="Nombre" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <Input placeholder="Descripción" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          <Input placeholder="Proceso" value={editProcess} onChange={(e) => setEditProcess(e.target.value)} />
          <div className="actions">
            <Button type="button" onClick={handleEdit}>Guardar Cambios</Button>
            <Button type="button" variant="secondary" onClick={() => setEditDoc(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* ============ REJECT MODAL ============ */}
      <Modal isOpen={Boolean(showRejectModal)} title="Rechazar Documento" onClose={() => setShowRejectModal(null)}>
        <div className="form-grid">
          <Input placeholder="Razón de rechazo" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required />
          <Input placeholder="Comentarios adicionales (opcional)" value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)} />
          <div className="actions">
            <Button type="button" variant="danger" onClick={handleReject}>Rechazar</Button>
            <Button type="button" variant="secondary" onClick={() => setShowRejectModal(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
