import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChangeRequestModel,
  ChangeManagementStatsModel,
  ChangeApprovalResponse,
  ChangeApprovalHistoryResponse,
  fetchChangeRequests,
  fetchChangeManagementStats,
  createChangeRequest,
  updateChangeRequest,
  deleteChangeRequest,
  submitChangeForApproval,
  fetchChangeApproval,
  fetchChangeApprovalHistory,
  decideApprovalRequest,
  fetchMyProfile,
  UserModel,
} from '../../api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ApprovalStatusBadge, APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS, APPROVAL_STATUS_ICONS } from '../ui/ApprovalStatusBadge';
import { ApprovalDetailModal } from '../ui/ApprovalDetailModal';
import { ApprovalRejectModal } from '../ui/ApprovalRejectModal';
import { ApprovalAdjustmentsModal } from '../ui/ApprovalAdjustmentsModal';
import { ChangeManagementAI } from './ChangeManagementAI';

type Props = {
  token: string;
  onComplianceChange?: (status: string) => void;
};

type TabId = 'dashboard' | 'changes' | 'ai';

/* ==================== LOCALIZATION MAPS ==================== */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  APPROVED: 'Aprobado',
  IMPLEMENTED: 'Implementado',
  REJECTED: 'Rechazado',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  PENDING_APPROVAL: '#2563eb',
  APPROVED: '#16a34a',
  IMPLEMENTED: '#7c3aed',
  REJECTED: '#dc2626',
};

const IMPACT_LABELS: Record<string, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
  CRITICAL: 'Crítico',
};

const IMPACT_COLORS: Record<string, string> = {
  LOW: '#94a3b8',
  MEDIUM: '#d97706',
  HIGH: '#ea580c',
  CRITICAL: '#dc2626',
};

const TYPE_LABELS: Record<string, string> = {
  PROCESS: 'Proceso',
  STRUCTURE: 'Estructura',
  PERSONNEL: 'Personal',
  TECHNOLOGY: 'Tecnología',
  INFRASTRUCTURE: 'Infraestructura',
};

const TYPE_COLORS: Record<string, string> = {
  PROCESS: '#2563eb',
  STRUCTURE: '#7c3aed',
  PERSONNEL: '#16a34a',
  TECHNOLOGY: '#d97706',
  INFRASTRUCTURE: '#ea580c',
};

/* ==================== HELPER COMPONENTS ==================== */

function Badge({ value, map, colors }: { value: string; map: Record<string, string>; colors: Record<string, string> }) {
  return (
    <span className="acq-badge" style={{ backgroundColor: colors[value] ?? '#94a3b8' }}>
      {map[value] ?? value}
    </span>
  );
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* Inline dropdown menu */
function RowActions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="acq-more-btn"
        onClick={() => setOpen(!open)}
        aria-label="Más acciones"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="acq-dropdown" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function SkeletonRows({ rows = 4, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="acq-skeleton-row">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}><div className="acq-skeleton-line" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ==================== FORM STATE ==================== */

type ChangeFormState = {
  title: string;
  description: string;
  changeType: string;
  impactLevel: string;
  riskAnalysis: string;
  controlActions: string;
  affectedProcesses: string;
  affectedWorkers: string;
  implementationDate: string;
  followUpDate: string;
  observations: string;
};

const emptyForm: ChangeFormState = {
  title: '',
  description: '',
  changeType: 'PROCESS',
  impactLevel: 'LOW',
  riskAnalysis: '',
  controlActions: '',
  affectedProcesses: '',
  affectedWorkers: '',
  implementationDate: '',
  followUpDate: '',
  observations: '',
};

/* ==================== MAIN COMPONENT ==================== */

export default function ChangeManagementPanel({ token }: Props) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [stats, setStats] = useState<ChangeManagementStatsModel | null>(null);
  const [changes, setChanges] = useState<ChangeRequestModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // User role
  const [userProfile, setUserProfile] = useState<UserModel | null>(null);
  const role = userProfile?.role ?? 'member';
  const canCreate = role === 'owner' || role === 'admin' || role === 'manager';
  const canEdit = role === 'owner' || role === 'admin' || role === 'manager';
  const canDelete = role === 'owner';
  const canSubmitApproval = role === 'owner' || role === 'admin' || role === 'manager';
  const canDecide = role === 'owner' || role === 'admin';
  const isReadOnly = role === 'member';

  // Search & filters
  const [changeSearch, setChangeSearch] = useState('');
  const [changeStatusFilter, setChangeStatusFilter] = useState('');
  const [changeTypeFilter, setChangeTypeFilter] = useState('');
  const [changeImpactFilter, setChangeImpactFilter] = useState('');

  // Modals
  const [showCreateChange, setShowCreateChange] = useState(false);
  const [showEditChange, setShowEditChange] = useState<ChangeRequestModel | null>(null);
  const [changeForm, setChangeForm] = useState<ChangeFormState>(emptyForm);

  // Approval state
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState<ChangeRequestModel | null>(null);
  const [showAdjustmentsModal, setShowAdjustmentsModal] = useState<ChangeRequestModel | null>(null);
  const [approvalDetailChange, setApprovalDetailChange] = useState<ChangeRequestModel | null>(null);
  const [approvalDetail, setApprovalDetail] = useState<ChangeApprovalResponse | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<ChangeApprovalHistoryResponse | null>(null);
  const [approvalDetailLoading, setApprovalDetailLoading] = useState(false);
  const [approvalHistoryLoading, setApprovalHistoryLoading] = useState(false);

  // Show approve confirmation modal
  const [showApproveModal, setShowApproveModal] = useState<ChangeRequestModel | null>(null);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  /* ==================== DATA LOADING ==================== */

  const loadStats = useCallback(async () => {
    try { setStats(await fetchChangeManagementStats(token)); } catch { /* ignore */ }
  }, [token]);

  const loadChanges = useCallback(async () => {
    try { setChanges(await fetchChangeRequests(token)); } catch { /* ignore */ }
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const profile = await fetchMyProfile(token).catch(() => null);
      setUserProfile(profile);
      await Promise.all([loadStats(), loadChanges()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [token, loadStats, loadChanges]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* ==================== FILTERED DATA ==================== */

  const filteredChanges = useMemo(() => {
    let result = changes;
    if (changeSearch) {
      const q = changeSearch.toLowerCase();
      result = result.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }
    if (changeStatusFilter) result = result.filter((c) => c.status === changeStatusFilter);
    if (changeTypeFilter) result = result.filter((c) => c.changeType === changeTypeFilter);
    if (changeImpactFilter) result = result.filter((c) => c.impactLevel === changeImpactFilter);
    return result;
  }, [changes, changeSearch, changeStatusFilter, changeTypeFilter, changeImpactFilter]);

  const clearFilters = () => { setChangeSearch(''); setChangeStatusFilter(''); setChangeTypeFilter(''); setChangeImpactFilter(''); };
  const hasFilters = changeSearch || changeStatusFilter || changeTypeFilter || changeImpactFilter;

  /* ==================== HANDLERS ==================== */

  const handleCreateChange = async () => {
    setSubmitting(true);
    try {
      await createChangeRequest(token, {
        title: changeForm.title,
        description: changeForm.description,
        changeType: changeForm.changeType as 'PROCESS' | 'STRUCTURE' | 'PERSONNEL' | 'TECHNOLOGY' | 'INFRASTRUCTURE',
        impactLevel: changeForm.impactLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        riskAnalysis: changeForm.riskAnalysis || undefined,
        controlActions: changeForm.controlActions ? changeForm.controlActions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        affectedProcesses: changeForm.affectedProcesses ? changeForm.affectedProcesses.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        affectedWorkers: changeForm.affectedWorkers ? changeForm.affectedWorkers.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        implementationDate: changeForm.implementationDate || undefined,
        followUpDate: changeForm.followUpDate || undefined,
        observations: changeForm.observations || undefined,
      });
      setShowCreateChange(false);
      setChangeForm(emptyForm);
      notify('Solicitud de cambio creada exitosamente');
      await Promise.all([loadChanges(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleUpdateChange = async () => {
    if (!showEditChange) return;
    setSubmitting(true);
    try {
      await updateChangeRequest(token, showEditChange._id, {
        title: changeForm.title,
        description: changeForm.description,
        changeType: changeForm.changeType,
        impactLevel: changeForm.impactLevel,
        riskAnalysis: changeForm.riskAnalysis || undefined,
        controlActions: changeForm.controlActions ? changeForm.controlActions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        affectedProcesses: changeForm.affectedProcesses ? changeForm.affectedProcesses.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        affectedWorkers: changeForm.affectedWorkers ? changeForm.affectedWorkers.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        implementationDate: changeForm.implementationDate || undefined,
        followUpDate: changeForm.followUpDate || undefined,
        observations: changeForm.observations || undefined,
      });
      setShowEditChange(null);
      notify('Solicitud de cambio actualizada');
      await Promise.all([loadChanges(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteChange = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta solicitud de cambio? Esta acción no se puede deshacer.')) return;
    try {
      await deleteChangeRequest(token, id);
      notify('Solicitud de cambio eliminada');
      await Promise.all([loadChanges(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  /* ==================== APPROVAL HANDLERS ==================== */

  const handleOpenApprovalDetail = async (change: ChangeRequestModel) => {
    setApprovalDetailChange(change);
    setApprovalDetail(null);
    setApprovalHistory(null);
    setApprovalDetailLoading(true);
    try {
      const detail = await fetchChangeApproval(token, change._id);
      setApprovalDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener estado de aprobación');
    } finally {
      setApprovalDetailLoading(false);
    }
  };

  const handleLoadApprovalHistory = async (changeId: string) => {
    setApprovalHistoryLoading(true);
    try {
      const hist = await fetchChangeApprovalHistory(token, changeId);
      setApprovalHistory(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial');
    } finally {
      setApprovalHistoryLoading(false);
    }
  };

  const handleSubmitApproval = async (changeId: string) => {
    setApprovalLoading(true);
    try {
      await submitChangeForApproval(token, changeId);
      notify('Solicitud enviada a aprobación');
      await Promise.all([loadChanges(), loadStats()]);
      if (approvalDetailChange?._id === changeId) {
        const detail = await fetchChangeApproval(token, changeId);
        setApprovalDetail(detail);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar a aprobación');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!showApproveModal || !approvalDetail) return;
    setApprovalLoading(true);
    try {
      await decideApprovalRequest(token, approvalDetail.requestId, {
        decision: 'APPROVED',
        comments: `Solicitud de cambio "${showApproveModal.title}" aprobada`,
      });
      setShowApproveModal(null);
      notify('Solicitud de cambio aprobada');
      await Promise.all([loadChanges(), loadStats()]);
      if (approvalDetailChange?._id === showApproveModal._id) {
        const detail = await fetchChangeApproval(token, showApproveModal._id);
        setApprovalDetail(detail);
        void handleLoadApprovalHistory(showApproveModal._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!showRejectModal || !approvalDetail) return;
    setApprovalLoading(true);
    try {
      await decideApprovalRequest(token, approvalDetail.requestId, {
        decision: 'REJECTED',
        reason,
      });
      setShowRejectModal(null);
      notify('Solicitud de cambio rechazada');
      await Promise.all([loadChanges(), loadStats()]);
      if (approvalDetailChange?._id === showRejectModal._id) {
        const detail = await fetchChangeApproval(token, showRejectModal._id);
        setApprovalDetail(detail);
        void handleLoadApprovalHistory(showRejectModal._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al rechazar');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleRequestAdjustments = async (reason: string) => {
    if (!showAdjustmentsModal || !approvalDetail) return;
    setApprovalLoading(true);
    try {
      await decideApprovalRequest(token, approvalDetail.requestId, {
        decision: 'ADJUSTMENTS_REQUESTED',
        reason,
      });
      setShowAdjustmentsModal(null);
      notify('Ajustes solicitados correctamente');
      await Promise.all([loadChanges(), loadStats()]);
      if (approvalDetailChange?._id === showAdjustmentsModal._id) {
        const detail = await fetchChangeApproval(token, showAdjustmentsModal._id);
        setApprovalDetail(detail);
        void handleLoadApprovalHistory(showAdjustmentsModal._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al solicitar ajustes');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleMarkImplemented = async (changeId: string) => {
    if (!confirm('¿Marcar esta solicitud como implementada?')) return;
    try {
      await updateChangeRequest(token, changeId, { status: 'IMPLEMENTED' });
      notify('Solicitud marcada como implementada');
      await Promise.all([loadChanges(), loadStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al marcar como implementada');
    }
  };

  /* ==================== RENDER ==================== */

  const isHighImpact = changeForm.impactLevel !== 'LOW';
  const isChangeEditable = showEditChange
    ? showEditChange.status === 'DRAFT' || showEditChange.status === 'REJECTED'
    : true;

  return (
    <div className="acq-panel">
      {/* ========== HEADER ========== */}
      <div className="acq-header">
        <div className="acq-header__left">
          <h2 className="acq-header__title">🔄 Gestión del Cambio</h2>
          <p className="acq-header__subtitle">
            Solicitudes de cambio, análisis de impacto y seguimiento — 2.11.1
            {isReadOnly && <span style={{ marginLeft: '.5rem', color: '#94a3b8' }}>(solo lectura)</span>}
          </p>
        </div>
        <div className="acq-header__actions">
          {canCreate && (
            <Button type="button" onClick={() => { setChangeForm(emptyForm); setShowCreateChange(true); }}>
              + Nueva solicitud
            </Button>
          )}
          <button type="button" className="acq-refresh-btn" onClick={() => void loadAll()} disabled={loading} aria-label="Actualizar información" title="Actualizar información">
            ↻
          </button>
        </div>
      </div>

      {/* ========== ALERTS ========== */}
      {error && <div className="acq-alert acq-alert--error">{error}</div>}
      {success && <div className="acq-alert acq-alert--success">{success}</div>}

      {/* ========== TABS ========== */}
      <div className="acq-tabs" role="tablist">
        {([
          { id: 'dashboard' as TabId, label: 'Panel', count: undefined },
          { id: 'changes' as TabId, label: 'Solicitudes', count: changes.length },
          { id: 'ai' as TabId, label: '🤖 Asistente IA', count: undefined },
        ]).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`acq-tab ${tab === t.id ? 'acq-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* ========== DASHBOARD ========== */}
      {tab === 'dashboard' && stats && (
        <div className="acq-dashboard">
          <div className="acq-dashboard__section">
            <h3 className="acq-dashboard__section-title">Resumen de Solicitudes</h3>
            <div className="acq-kpi-grid acq-kpi-grid--3">
              <article className="acq-kpi acq-kpi--primary">
                <span className="acq-kpi__label">Total</span>
                <span className="acq-kpi__value" style={{ color: '#2563eb' }}>{stats.total}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Borradores</span>
                <span className="acq-kpi__value">{stats.draft}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Pendientes aprobación</span>
                <span className="acq-kpi__value" style={{ color: '#d97706' }}>{stats.pendingApproval}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Aprobados</span>
                <span className="acq-kpi__value" style={{ color: '#16a34a' }}>{stats.approved}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Implementados</span>
                <span className="acq-kpi__value" style={{ color: '#7c3aed' }}>{stats.implemented}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Rechazados</span>
                <span className="acq-kpi__value" style={{ color: '#dc2626' }}>{stats.rejected}</span>
              </article>
            </div>
          </div>

          <div className="acq-dashboard__section">
            <h3 className="acq-dashboard__section-title">Por Nivel de Impacto</h3>
            <div className="acq-kpi-grid acq-kpi-grid--4">
              {Object.entries(stats.byImpactLevel).map(([level, count]) => (
                <article key={level} className="acq-kpi">
                  <span className="acq-kpi__label">{IMPACT_LABELS[level] ?? level}</span>
                  <span className="acq-kpi__value" style={{ color: IMPACT_COLORS[level] ?? '#94a3b8' }}>{count}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="acq-dashboard__section">
            <h3 className="acq-dashboard__section-title">Por Tipo de Cambio</h3>
            <div className="acq-kpi-grid acq-kpi-grid--3">
              {Object.entries(stats.byChangeType).map(([type, count]) => (
                <article key={type} className="acq-kpi">
                  <span className="acq-kpi__label">{TYPE_LABELS[type] ?? type}</span>
                  <span className="acq-kpi__value" style={{ color: TYPE_COLORS[type] ?? '#94a3b8' }}>{count}</span>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== CHANGES TABLE ========== */}
      {tab === 'changes' && (
        <div className="acq-section">
          <div className="acq-filters">
            <input className="acq-search" placeholder="🔍 Buscar por título o descripción..." value={changeSearch} onChange={(e) => setChangeSearch(e.target.value)} aria-label="Buscar solicitudes" />
            <select className="acq-filter-select" value={changeStatusFilter} onChange={(e) => setChangeStatusFilter(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select className="acq-filter-select" value={changeTypeFilter} onChange={(e) => setChangeTypeFilter(e.target.value)} aria-label="Filtrar por tipo">
              <option value="">Todos los tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select className="acq-filter-select" value={changeImpactFilter} onChange={(e) => setChangeImpactFilter(e.target.value)} aria-label="Filtrar por impacto">
              <option value="">Todos los impactos</option>
              {Object.entries(IMPACT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {hasFilters && (
              <button type="button" className="acq-clear-btn" onClick={clearFilters}>Limpiar</button>
            )}
          </div>

          <div className="acq-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Impacto</th>
                  <th>Estado</th>
                  <th>Implementación</th>
                  <th>Seguimiento</th>
                  <th>Creado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonRows rows={4} cols={8} /> : filteredChanges.map((c) => (
                  <tr key={c._id}>
                    <td><strong>{c.title}</strong></td>
                    <td><Badge value={c.changeType} map={TYPE_LABELS} colors={TYPE_COLORS} /></td>
                    <td><Badge value={c.impactLevel} map={IMPACT_LABELS} colors={IMPACT_COLORS} /></td>
                    <td>
                      <Badge value={c.status} map={STATUS_LABELS} colors={STATUS_COLORS} />
                      {c.approvalStatus && (
                        <ApprovalStatusBadge status={c.approvalStatus} className="acq-badge--inline" />
                      )}
                    </td>
                    <td>{formatDate(c.implementationDate)}</td>
                    <td>{formatDate(c.followUpDate)}</td>
                    <td>{c.requestedByName || '—'}</td>
                    <td>
                      <RowActions>
                        {/* View detail */}
                        <button className="acq-dropdown__item" onClick={() => {
                          setChangeForm({
                            title: c.title,
                            description: c.description,
                            changeType: c.changeType,
                            impactLevel: c.impactLevel,
                            riskAnalysis: c.riskAnalysis || '',
                            controlActions: (c.controlActions || []).join(', '),
                            affectedProcesses: (c.affectedProcesses || []).join(', '),
                            affectedWorkers: (c.affectedWorkers || []).join(', '),
                            implementationDate: c.implementationDate ? c.implementationDate.slice(0, 10) : '',
                            followUpDate: c.followUpDate ? c.followUpDate.slice(0, 10) : '',
                            observations: c.observations || '',
                          });
                          setShowEditChange(c);
                        }}>✏️ Editar</button>

                        <div className="acq-dropdown__separator" />
                        <div className="acq-dropdown__label">Aprobación</div>

                        {/* Approval detail */}
                        <button className="acq-dropdown__item" onClick={() => void handleOpenApprovalDetail(c)}>
                          📋 Ver estado de aprobación
                        </button>

                        {/* Submit for approval: DRAFT or REJECTED */}
                        {canSubmitApproval && (c.status === 'DRAFT' || c.status === 'REJECTED') && (
                          <button className="acq-dropdown__item" onClick={() => void handleSubmitApproval(c._id)} disabled={approvalLoading}>
                            📤 Enviar a aprobación
                          </button>
                        )}

                        {/* Mark as implemented: APPROVED */}
                        {canEdit && c.status === 'APPROVED' && (
                          <button className="acq-dropdown__item" onClick={() => void handleMarkImplemented(c._id)}>
                            ✅ Marcar como implementado
                          </button>
                        )}

                        {/* Delete: owner only, DRAFT or REJECTED */}
                        {canDelete && (c.status === 'DRAFT' || c.status === 'REJECTED') && (
                          <>
                            <div className="acq-dropdown__separator" />
                            <button className="acq-dropdown__item acq-dropdown__item--danger" onClick={() => void handleDeleteChange(c._id)}>🗑 Eliminar</button>
                          </>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                ))}
                {!loading && filteredChanges.length === 0 && (
                  <tr><td colSpan={8}>
                    {hasFilters ? (
                      <div className="acq-empty">
                        <div className="acq-empty__icon">🔍</div>
                        <p className="acq-empty__title">No encontramos resultados</p>
                        <p className="acq-empty__desc">Prueba cambiando los filtros o términos de búsqueda.</p>
                        <button type="button" className="acq-empty__action" onClick={clearFilters}>Limpiar filtros</button>
                      </div>
                    ) : (
                      <div className="acq-empty">
                        <div className="acq-empty__icon">🔄</div>
                        <p className="acq-empty__title">No hay solicitudes de cambio registradas</p>
                        <p className="acq-empty__desc">
                          {isReadOnly
                            ? 'No existen solicitudes de cambio para esta empresa.'
                            : 'Registra la primera solicitud para comenzar a evaluar el estándar 2.11.1.'}
                        </p>
                        {canCreate && (
                          <button type="button" className="acq-empty__action" onClick={() => { setChangeForm(emptyForm); setShowCreateChange(true); }}>+ Nueva solicitud</button>
                        )}
                      </div>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== CREATE/EDIT MODAL ========== */}
      <Modal isOpen={showCreateChange || Boolean(showEditChange)} title={showEditChange ? 'Editar Solicitud de Cambio' : 'Nueva Solicitud de Cambio'} onClose={() => { setShowCreateChange(false); setShowEditChange(null); }}>
        <div className="acq-form">
          <label className="field"><span className="label">Título *</span><input className="input" value={changeForm.title} onChange={(e) => setChangeForm({ ...changeForm, title: e.target.value })} disabled={submitting} /></label>
          <label className="field"><span className="label">Descripción *</span><textarea className="input" rows={3} value={changeForm.description} onChange={(e) => setChangeForm({ ...changeForm, description: e.target.value })} disabled={submitting} /></label>
          <div className="acq-form__row">
            <label className="field"><span className="label">Tipo de cambio *</span>
              <select className="input" value={changeForm.changeType} onChange={(e) => setChangeForm({ ...changeForm, changeType: e.target.value })} disabled={submitting}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field"><span className="label">Nivel de impacto *</span>
              <select className="input" value={changeForm.impactLevel} onChange={(e) => setChangeForm({ ...changeForm, impactLevel: e.target.value })} disabled={submitting}>
                {Object.entries(IMPACT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Conditional fields for MEDIUM/HIGH/CRITICAL */}
          {isHighImpact && (
            <>
              <div style={{ padding: '.5rem .75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '.375rem', fontSize: '.8rem', color: '#92400e', marginBottom: '.5rem' }}>
                ⚠️ Para impacto {IMPACT_LABELS[changeForm.impactLevel]}, el análisis de riesgos y las acciones de control son obligatorios.
              </div>
              <label className="field"><span className="label">Análisis de riesgos SST *</span><textarea className="input" rows={3} value={changeForm.riskAnalysis} onChange={(e) => setChangeForm({ ...changeForm, riskAnalysis: e.target.value })} placeholder="Describe los riesgos identificados para este cambio..." disabled={submitting} /></label>
              <label className="field"><span className="label">Acciones de control *</span><textarea className="input" rows={2} value={changeForm.controlActions} onChange={(e) => setChangeForm({ ...changeForm, controlActions: e.target.value })} placeholder="Una acción por línea (separar con comas)" disabled={submitting} /></label>
            </>
          )}

          <div className="acq-form__row">
            <label className="field"><span className="label">Fecha implementación</span><input className="input" type="date" value={changeForm.implementationDate} onChange={(e) => setChangeForm({ ...changeForm, implementationDate: e.target.value })} disabled={submitting} /></label>
            <label className="field"><span className="label">Fecha seguimiento</span><input className="input" type="date" value={changeForm.followUpDate} onChange={(e) => setChangeForm({ ...changeForm, followUpDate: e.target.value })} disabled={submitting} /></label>
          </div>

          <label className="field"><span className="label">Procesos afectados</span><input className="input" value={changeForm.affectedProcesses} onChange={(e) => setChangeForm({ ...changeForm, affectedProcesses: e.target.value })} placeholder="Separar con comas" disabled={submitting} /></label>
          <label className="field"><span className="label">Trabajadores afectados</span><input className="input" value={changeForm.affectedWorkers} onChange={(e) => setChangeForm({ ...changeForm, affectedWorkers: e.target.value })} placeholder="Separar con comas" disabled={submitting} /></label>
          <label className="field"><span className="label">Observaciones</span><textarea className="input" rows={2} value={changeForm.observations} onChange={(e) => setChangeForm({ ...changeForm, observations: e.target.value })} disabled={submitting} /></label>

          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => { setShowCreateChange(false); setShowEditChange(null); }} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={() => void (showEditChange ? handleUpdateChange() : handleCreateChange())} disabled={submitting || !changeForm.title.trim() || !changeForm.description.trim()}>
              {submitting ? 'Guardando...' : showEditChange ? 'Guardar cambios' : 'Crear solicitud'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========== APPROVE CONFIRMATION MODAL ========== */}
      <Modal isOpen={Boolean(showApproveModal)} title="Aprobar solicitud de cambio" onClose={() => setShowApproveModal(null)}>
        <div className="acq-form">
          {showApproveModal && (
            <>
              <div style={{ padding: '.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '.375rem', marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#15803d' }}>✅ Confirmar aprobación</p>
                <p style={{ margin: '.25rem 0 0', fontSize: '.85rem', color: '#166534' }}>
                  Se aprobará la solicitud "{showApproveModal.title}".
                </p>
              </div>
              <div style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
                <p><strong>Tipo:</strong> {TYPE_LABELS[showApproveModal.changeType] ?? showApproveModal.changeType}</p>
                <p><strong>Impacto:</strong> <Badge value={showApproveModal.impactLevel} map={IMPACT_LABELS} colors={IMPACT_COLORS} /></p>
                {showApproveModal.riskAnalysis && <p><strong>Análisis SST:</strong> {showApproveModal.riskAnalysis.slice(0, 200)}{showApproveModal.riskAnalysis.length > 200 ? '...' : ''}</p>}
                {showApproveModal.implementationDate && <p><strong>Fecha implementación:</strong> {formatDate(showApproveModal.implementationDate)}</p>}
              </div>
              <div className="acq-form__actions">
                <Button type="button" variant="secondary" onClick={() => setShowApproveModal(null)} disabled={approvalLoading}>Cancelar</Button>
                <Button type="button" onClick={() => void handleApprove()} disabled={approvalLoading}>
                  {approvalLoading ? 'Procesando...' : '✅ Aprobar solicitud'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ========== REJECT MODAL (reusable) ========== */}
      <ApprovalRejectModal
        isOpen={Boolean(showRejectModal)}
        entityLabel={showRejectModal?.title}
        loading={approvalLoading}
        onSubmit={(reason) => void handleReject(reason)}
        onClose={() => setShowRejectModal(null)}
      />

      {/* ========== ADJUSTMENTS MODAL (reusable) ========== */}
      <ApprovalAdjustmentsModal
        isOpen={Boolean(showAdjustmentsModal)}
        entityLabel={showAdjustmentsModal?.title}
        loading={approvalLoading}
        onSubmit={(reason) => void handleRequestAdjustments(reason)}
        onClose={() => setShowAdjustmentsModal(null)}
      />

      {/* ========== AI ASSISTANT TAB ========== */}
      {tab === 'ai' && (
        <div className="acq-section">
          <ChangeManagementAI token={token} />
        </div>
      )}

      {/* ========== APPROVAL DETAIL MODAL (reusable) ========== */}
      <ApprovalDetailModal
        isOpen={Boolean(approvalDetailChange)}
        entityLabel={approvalDetailChange?.title}
        status={approvalDetail?.approvalStatus ?? approvalDetailChange?.approvalStatus}
        history={approvalHistory?.history as Array<{ _id: string; action: string; actor?: { userId: string; name?: string; email?: string }; previousStatus: string; newStatus: string; reason?: string; createdAt: string }> | undefined}
        historyLoading={approvalHistoryLoading}
        canSubmit={canSubmitApproval && approvalDetailChange ? (approvalDetailChange.status === 'DRAFT' || approvalDetailChange.status === 'REJECTED' || (approvalDetail?.approvalStatus === 'ADJUSTMENTS_REQUESTED')) : false}
        canDecide={canDecide && approvalDetail?.approvalStatus === 'PENDING_APPROVAL'}
        loading={approvalLoading}
        onSubmit={approvalDetailChange && approvalDetail ? () => void handleSubmitApproval(approvalDetailChange._id) : undefined}
        onApprove={canDecide && approvalDetail?.approvalStatus === 'PENDING_APPROVAL' && approvalDetailChange ? () => setShowApproveModal(approvalDetailChange) : undefined}
        onReject={canDecide && approvalDetail?.approvalStatus === 'PENDING_APPROVAL' && approvalDetailChange ? () => setShowRejectModal(approvalDetailChange) : undefined}
        onAdjustments={canDecide && approvalDetail?.approvalStatus === 'PENDING_APPROVAL' && approvalDetailChange ? () => setShowAdjustmentsModal(approvalDetailChange) : undefined}
        onLoadHistory={approvalDetailChange ? () => void handleLoadApprovalHistory(approvalDetailChange._id) : undefined}
        onClose={() => { setApprovalDetailChange(null); setApprovalDetail(null); setApprovalHistory(null); }}
        renderStatusInfo={(status) => {
          if (status === 'REJECTED' && approvalDetailChange?.observations) {
            return (
              <div style={{ padding: '.5rem .75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '.375rem', fontSize: '.85rem', color: '#991b1b', marginTop: '.5rem' }}>
                <strong>Motivo de rechazo:</strong> {approvalDetailChange.observations}
              </div>
            );
          }
          return null;
        }}
      />
    </div>
  );
}
