import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SupplierModel,
  AcquisitionModel,
  AcquisitionsDashboardModel,
  AcquisitionsHistoryModel,
  AcquisitionApprovalStatus,
  AcquisitionApprovalResponse,
  AcquisitionApprovalHistoryResponse,
  fetchAcquisitionsDashboard,
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  fetchAcquisitions,
  createAcquisition,
  updateAcquisition,
  deleteAcquisition,
  changeAcquisitionStatus,
  assignAcquisitionSupplier,
  fetchAcquisitionsHistory,
  fetchAcquisitionApproval,
  submitAcquisitionForApproval,
  approveAcquisition,
  rejectAcquisition,
  fetchAcquisitionApprovalHistory,
  requestAcquisitionAdjustments,
  fetchMyProfile,
  UserModel,
} from '../api';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

type Props = {
  token: string;
  onComplianceChange?: (status: string) => void;
};

type TabId = 'dashboard' | 'suppliers' | 'acquisitions' | 'history';

/* ==================== LOCALIZATION MAPS ==================== */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  REQUESTED: 'Solicitada',
  IN_REVIEW: 'En revisión',
  SUPPLIER_SELECTED: 'Proveedor seleccionado',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  REQUESTED: '#2563eb',
  IN_REVIEW: '#d97706',
  SUPPLIER_SELECTED: '#7c3aed',
  IN_PROGRESS: '#ea580c',
  COMPLETED: '#16a34a',
  CANCELLED: '#dc2626',
  ACTIVE: '#16a34a',
  INACTIVE: '#94a3b8',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#94a3b8',
  MEDIUM: '#2563eb',
  HIGH: '#d97706',
  CRITICAL: '#dc2626',
};

const TYPE_LABELS: Record<string, string> = {
  PROVIDER: 'Proveedor',
  CONTRACTOR: 'Contratista',
  THIRD_PARTY: 'Tercero',
};

const HISTORY_ACTION_COLORS: Record<string, string> = {
  SUPPLIER_CREATED: '#16a34a',
  ACQUISITION_CREATED: '#16a34a',
  SUPPLIER_UPDATED: '#7c3aed',
  ACQUISITION_UPDATED: '#7c3aed',
  ACQUISITION_STATUS_CHANGED: '#d97706',
  ACQUISITION_SUPPLIER_ASSIGNED: '#2563eb',
  SUPPLIER_DELETED: '#dc2626',
  ACQUISITION_DELETED: '#dc2626',
};

const HISTORY_ACTION_ICONS: Record<string, string> = {
  SUPPLIER_CREATED: '🟢',
  ACQUISITION_CREATED: '🟢',
  SUPPLIER_UPDATED: '🟣',
  ACQUISITION_UPDATED: '🟣',
  ACQUISITION_STATUS_CHANGED: '🟠',
  ACQUISITION_SUPPLIER_ASSIGNED: '🔵',
  SUPPLIER_DELETED: '🔴',
  ACQUISITION_DELETED: '🔴',
  ACQUISITION_SUBMITTED_FOR_APPROVAL: '📤',
  ACQUISITION_ADJUSTMENTS_REQUESTED: '🔧',
};

import { ApprovalStatusBadge, APPROVAL_STATUS_COLORS, APPROVAL_STATUS_ICONS } from './ui/ApprovalStatusBadge';

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

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* Inline dropdown menu (no external dependency) */
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

function SkeletonRows({ rows = 4, cols = 6 }: { rows?: number; cols?: number }) {
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

/* ==================== MAIN COMPONENT ==================== */

export default function AcquisitionsAdvancedPanel({ token }: Props) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [dashboard, setDashboard] = useState<AcquisitionsDashboardModel | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierModel[]>([]);
  const [acquisitions, setAcquisitions] = useState<AcquisitionModel[]>([]);
  const [history, setHistory] = useState<AcquisitionsHistoryModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // User role
  const [userProfile, setUserProfile] = useState<UserModel | null>(null);
  const role = userProfile?.role ?? 'member';
  const canSubmitApproval = role === 'owner' || role === 'admin' || role === 'manager';
  const canDecideApproval = role === 'owner' || role === 'manager';

  // Search & filters
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState('');
  const [acqSearch, setAcqSearch] = useState('');
  const [acqStatusFilter, setAcqStatusFilter] = useState('');
  const [acqPriorityFilter, setAcqPriorityFilter] = useState('');

  // Modals
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [showEditSupplier, setShowEditSupplier] = useState<SupplierModel | null>(null);
  const [showCreateAcquisition, setShowCreateAcquisition] = useState(false);
  const [showEditAcquisition, setShowEditAcquisition] = useState<AcquisitionModel | null>(null);
  const [showAssignSupplier, setShowAssignSupplier] = useState<AcquisitionModel | null>(null);
  const [assignSearch, setAssignSearch] = useState('');

  // Approval state
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState<AcquisitionModel | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showAdjustmentsModal, setShowAdjustmentsModal] = useState<AcquisitionModel | null>(null);
  const [adjustmentsReason, setAdjustmentsReason] = useState('');
  const [approvalDetailAcq, setApprovalDetailAcq] = useState<AcquisitionModel | null>(null);
  const [approvalDetail, setApprovalDetail] = useState<AcquisitionApprovalResponse | null>(null);
  const [approvalDetailLoading, setApprovalDetailLoading] = useState(false);
  const [approvalHistory, setApprovalHistory] = useState<AcquisitionApprovalHistoryResponse | null>(null);
  const [approvalHistoryLoading, setApprovalHistoryLoading] = useState(false);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const emptySupplierForm = { name: '', legalName: '', taxId: '', type: 'PROVIDER', contactName: '', email: '', phone: '', address: '', observations: '' };
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const emptyAcqForm = { title: '', description: '', requestingArea: '', requestedBy: '', priority: 'MEDIUM', sstCriteria: '', observations: '', requiredDate: '' };
  const [acquisitionForm, setAcquisitionForm] = useState(emptyAcqForm);

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  /* ==================== DATA LOADING ==================== */

  const loadDashboard = useCallback(async () => {
    try { setDashboard(await fetchAcquisitionsDashboard(token)); } catch { /* ignore */ }
  }, [token]);

  const loadSuppliers = useCallback(async () => {
    try { setSuppliers(await fetchSuppliers(token)); } catch { /* ignore */ }
  }, [token]);

  const loadAcquisitions = useCallback(async () => {
    try { setAcquisitions(await fetchAcquisitions(token)); } catch { /* ignore */ }
  }, [token]);

  const loadHistory = useCallback(async () => {
    try { setHistory(await fetchAcquisitionsHistory(token)); } catch { /* ignore */ }
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const profile = await fetchMyProfile(token).catch(() => null);
      setUserProfile(profile);
      await Promise.all([loadDashboard(), loadSuppliers(), loadAcquisitions(), loadHistory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [token, loadDashboard, loadSuppliers, loadAcquisitions, loadHistory]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* ==================== FILTERED DATA ==================== */

  const filteredSuppliers = useMemo(() => {
    let result = suppliers;
    if (supplierSearch) {
      const q = supplierSearch.toLowerCase();
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.legalName && s.legalName.toLowerCase().includes(q)) ||
        (s.taxId && s.taxId.toLowerCase().includes(q)) ||
        (s.contactName && s.contactName.toLowerCase().includes(q))
      );
    }
    if (supplierTypeFilter) result = result.filter((s) => s.type === supplierTypeFilter);
    if (supplierStatusFilter) result = result.filter((s) => s.status === supplierStatusFilter);
    return result;
  }, [suppliers, supplierSearch, supplierTypeFilter, supplierStatusFilter]);

  const filteredAcquisitions = useMemo(() => {
    let result = acquisitions;
    if (acqSearch) {
      const q = acqSearch.toLowerCase();
      result = result.filter((a) =>
        a.requestNumber.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q)
      );
    }
    if (acqStatusFilter) result = result.filter((a) => a.status === acqStatusFilter);
    if (acqPriorityFilter) result = result.filter((a) => a.priority === acqPriorityFilter);
    return result;
  }, [acquisitions, acqSearch, acqStatusFilter, acqPriorityFilter]);

  const filteredAssignSuppliers = useMemo(() => {
    if (!assignSearch) return suppliers.filter((s) => s.status === 'ACTIVE');
    const q = assignSearch.toLowerCase();
    return suppliers.filter((s) => s.status === 'ACTIVE' && (
      s.name.toLowerCase().includes(q) ||
      (s.contactName && s.contactName.toLowerCase().includes(q))
    ));
  }, [suppliers, assignSearch]);

  const clearSupplierFilters = () => { setSupplierSearch(''); setSupplierTypeFilter(''); setSupplierStatusFilter(''); };
  const clearAcqFilters = () => { setAcqSearch(''); setAcqStatusFilter(''); setAcqPriorityFilter(''); };
  const hasSupplierFilters = supplierSearch || supplierTypeFilter || supplierStatusFilter;
  const hasAcqFilters = acqSearch || acqStatusFilter || acqPriorityFilter;

  /* ==================== HANDLERS ==================== */

  const handleCreateSupplier = async () => {
    setSubmitting(true);
    try {
      await createSupplier(token, supplierForm);
      setShowCreateSupplier(false);
      setSupplierForm(emptySupplierForm);
      notify('Proveedor creado exitosamente');
      await Promise.all([loadSuppliers(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleUpdateSupplier = async () => {
    if (!showEditSupplier) return;
    setSubmitting(true);
    try {
      await updateSupplier(token, showEditSupplier._id, supplierForm);
      setShowEditSupplier(null);
      notify('Proveedor actualizado');
      await Promise.all([loadSuppliers(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este proveedor? Esta acción no se puede deshacer.')) return;
    try {
      await deleteSupplier(token, id);
      notify('Proveedor eliminado');
      await Promise.all([loadSuppliers(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleToggleSupplierStatus = async (supplier: SupplierModel) => {
    try {
      await updateSupplier(token, supplier._id, { status: supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      notify(`Proveedor ${supplier.status === 'ACTIVE' ? 'desactivado' : 'activado'}`);
      await Promise.all([loadSuppliers(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleCreateAcquisition = async () => {
    setSubmitting(true);
    try {
      await createAcquisition(token, acquisitionForm);
      setShowCreateAcquisition(false);
      setAcquisitionForm(emptyAcqForm);
      notify('Adquisición creada exitosamente');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleUpdateAcquisition = async () => {
    if (!showEditAcquisition) return;
    setSubmitting(true);
    try {
      await updateAcquisition(token, showEditAcquisition._id, acquisitionForm);
      setShowEditAcquisition(null);
      notify('Adquisición actualizada');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteAcquisition = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta adquisición? Esta acción no se puede deshacer.')) return;
    try {
      await deleteAcquisition(token, id);
      notify('Adquisición eliminada');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleChangeStatus = async (id: string, newStatus: string) => {
    try {
      await changeAcquisitionStatus(token, id, newStatus);
      notify(`Estado cambiado a ${STATUS_LABELS[newStatus] ?? newStatus}`);
      await Promise.all([loadAcquisitions(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleAssignSupplier = async (supplierId: string) => {
    if (!showAssignSupplier) return;
    try {
      await assignAcquisitionSupplier(token, showAssignSupplier._id, supplierId);
      setShowAssignSupplier(null);
      notify('Proveedor asignado correctamente');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  /* ==================== APPROVAL HANDLERS ==================== */

  const handleOpenApprovalDetail = async (acq: AcquisitionModel) => {
    setApprovalDetailAcq(acq);
    setApprovalDetail(null);
    setApprovalHistory(null);
    setApprovalDetailLoading(true);
    try {
      const detail = await fetchAcquisitionApproval(token, acq._id);
      setApprovalDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener estado de aprobación');
    } finally {
      setApprovalDetailLoading(false);
    }
  };

  const handleLoadApprovalHistory = async (acqId: string) => {
    setApprovalHistoryLoading(true);
    try {
      const hist = await fetchAcquisitionApprovalHistory(token, acqId);
      setApprovalHistory(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial');
    } finally {
      setApprovalHistoryLoading(false);
    }
  };

  const handleSubmitApproval = async (acqId: string) => {
    setApprovalLoading(true);
    try {
      await submitAcquisitionForApproval(token, acqId);
      notify('Adquisición enviada a aprobación');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
      // Refresh approval detail if open
      if (approvalDetailAcq?._id === acqId) {
        const detail = await fetchAcquisitionApproval(token, acqId);
        setApprovalDetail(detail);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar a aprobación');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleApprove = async (acqId: string) => {
    setApprovalLoading(true);
    try {
      await approveAcquisition(token, acqId);
      notify('Adquisición aprobada');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
      if (approvalDetailAcq?._id === acqId) {
        const detail = await fetchAcquisitionApproval(token, acqId);
        setApprovalDetail(detail);
        void handleLoadApprovalHistory(acqId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleReject = async () => {
    if (!showRejectModal) return;
    if (!rejectReason.trim()) {
      setError('Debe proporcionar una razón de rechazo');
      return;
    }
    setApprovalLoading(true);
    try {
      await rejectAcquisition(token, showRejectModal._id, rejectReason);
      setShowRejectModal(null);
      setRejectReason('');
      notify('Adquisición rechazada');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
      if (approvalDetailAcq?._id === showRejectModal._id) {
        const detail = await fetchAcquisitionApproval(token, showRejectModal._id);
        setApprovalDetail(detail);
        void handleLoadApprovalHistory(showRejectModal._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al rechazar');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleRequestAdjustments = async () => {
    if (!showAdjustmentsModal) return;
    if (!adjustmentsReason.trim()) {
      setError('Debe proporcionar una razón para los ajustes');
      return;
    }
    setApprovalLoading(true);
    try {
      await requestAcquisitionAdjustments(token, showAdjustmentsModal._id, adjustmentsReason);
      setShowAdjustmentsModal(null);
      setAdjustmentsReason('');
      notify('Ajustes solicitados correctamente');
      await Promise.all([loadAcquisitions(), loadDashboard()]);
      if (approvalDetailAcq?._id === showAdjustmentsModal._id) {
        const detail = await fetchAcquisitionApproval(token, showAdjustmentsModal._id);
        setApprovalDetail(detail);
        void handleLoadApprovalHistory(showAdjustmentsModal._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al solicitar ajustes');
    } finally {
      setApprovalLoading(false);
    }
  };

  /* ==================== RENDER ==================== */

  return (
    <div className="acq-panel">
      {/* ========== HEADER ========== */}
      <div className="acq-header">
        <div className="acq-header__left">
          <h2 className="acq-header__title">📦 Adquisiciones</h2>
          <p className="acq-header__subtitle">Gestión de proveedores, compras y criterios SST</p>
        </div>
        <div className="acq-header__actions">
          <Button type="button" onClick={() => { setAcquisitionForm(emptyAcqForm); setShowCreateAcquisition(true); }}>
            + Nueva adquisición
          </Button>
          <Button type="button" variant="secondary" onClick={() => { setSupplierForm(emptySupplierForm); setShowCreateSupplier(true); }}>
            + Nuevo proveedor
          </Button>
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
          { id: 'suppliers' as TabId, label: 'Proveedores', count: suppliers.length },
          { id: 'acquisitions' as TabId, label: 'Adquisiciones', count: acquisitions.length },
          { id: 'history' as TabId, label: 'Historial', count: undefined },
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
      {tab === 'dashboard' && dashboard && (
        <div className="acq-dashboard">
          <div className="acq-dashboard__section">
            <h3 className="acq-dashboard__section-title">Proveedores</h3>
            <div className="acq-kpi-grid acq-kpi-grid--3">
              <article className="acq-kpi acq-kpi--primary">
                <span className="acq-kpi__label">Total</span>
                <span className="acq-kpi__value" style={{ color: '#2563eb' }}>{dashboard.totalSuppliers}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Activos</span>
                <span className="acq-kpi__value" style={{ color: '#16a34a' }}>{dashboard.activeSuppliers}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Inactivos</span>
                <span className="acq-kpi__value" style={{ color: '#94a3b8' }}>{dashboard.inactiveSuppliers}</span>
              </article>
            </div>
          </div>

          <div className="acq-dashboard__section">
            <h3 className="acq-dashboard__section-title">Adquisiciones</h3>
            <div className="acq-kpi-grid acq-kpi-grid--4">
              <article className="acq-kpi acq-kpi--primary">
                <span className="acq-kpi__label">Total</span>
                <span className="acq-kpi__value" style={{ color: '#7c3aed' }}>{dashboard.totalAcquisitions}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Borrador</span>
                <span className="acq-kpi__value">{dashboard.draftAcquisitions}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Solicitadas</span>
                <span className="acq-kpi__value">{dashboard.requestedAcquisitions}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">En revisión</span>
                <span className="acq-kpi__value">{dashboard.inReviewAcquisitions}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Proveedor sel.</span>
                <span className="acq-kpi__value">{dashboard.supplierSelectedAcquisitions}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">En progreso</span>
                <span className="acq-kpi__value">{dashboard.inProgressAcquisitions}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Completadas</span>
                <span className="acq-kpi__value" style={{ color: '#16a34a' }}>{dashboard.completedAcquisitions}</span>
              </article>
              <article className="acq-kpi">
                <span className="acq-kpi__label">Canceladas</span>
                <span className="acq-kpi__value" style={{ color: '#dc2626' }}>{dashboard.cancelledAcquisitions}</span>
              </article>
            </div>
          </div>
        </div>
      )}

      {/* ========== SUPPLIERS ========== */}
      {tab === 'suppliers' && (
        <div className="acq-section">
          <div className="acq-filters">
            <input className="acq-search" placeholder="🔍 Buscar por nombre, NIT o contacto..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} aria-label="Buscar proveedores" />
            <select className="acq-filter-select" value={supplierTypeFilter} onChange={(e) => setSupplierTypeFilter(e.target.value)} aria-label="Filtrar por tipo">
              <option value="">Todos los tipos</option>
              <option value="PROVIDER">Proveedor</option>
              <option value="CONTRACTOR">Contratista</option>
              <option value="THIRD_PARTY">Tercero</option>
            </select>
            <select className="acq-filter-select" value={supplierStatusFilter} onChange={(e) => setSupplierStatusFilter(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
            {hasSupplierFilters && (
              <button type="button" className="acq-clear-btn" onClick={clearSupplierFilters}>Limpiar</button>
            )}
          </div>

          <div className="acq-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Tipo</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonRows rows={4} cols={5} /> : filteredSuppliers.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <strong>{s.name}</strong>
                      {s.legalName && <div className="acq-text-muted">{s.legalName}</div>}
                      {s.taxId && <div className="acq-text-muted">NIT: {s.taxId}</div>}
                    </td>
                    <td><Badge value={s.type} map={TYPE_LABELS} colors={{ PROVIDER: '#2563eb', CONTRACTOR: '#7c3aed', THIRD_PARTY: '#d97706' }} /></td>
                    <td>
                      {s.contactName || '—'}
                      {s.email && <div className="acq-text-muted">{s.email}</div>}
                      {s.phone && <div className="acq-text-muted">{s.phone}</div>}
                    </td>
                    <td><Badge value={s.status} map={STATUS_LABELS} colors={STATUS_COLORS} /></td>
                    <td>
                      <RowActions>
                        <button className="acq-dropdown__item" onClick={() => {
                          setSupplierForm({ name: s.name, legalName: s.legalName || '', taxId: s.taxId || '', type: s.type, contactName: s.contactName || '', email: s.email || '', phone: s.phone || '', address: s.address || '', observations: s.observations || '' });
                          setShowEditSupplier(s);
                        }}>✏️ Editar</button>
                        <button className="acq-dropdown__item" onClick={() => void handleToggleSupplierStatus(s)}>
                          {s.status === 'ACTIVE' ? '⏸ Desactivar' : '▶ Activar'}
                        </button>
                        <button className="acq-dropdown__item acq-dropdown__item--danger" onClick={() => void handleDeleteSupplier(s._id)}>🗑 Eliminar</button>
                      </RowActions>
                    </td>
                  </tr>
                ))}
                {!loading && filteredSuppliers.length === 0 && (
                  <tr><td colSpan={5}>
                    {hasSupplierFilters ? (
                      <div className="acq-empty">
                        <div className="acq-empty__icon">🔍</div>
                        <p className="acq-empty__title">No encontramos resultados</p>
                        <p className="acq-empty__desc">Prueba cambiando los filtros o términos de búsqueda.</p>
                        <button type="button" className="acq-empty__action" onClick={clearSupplierFilters}>Limpiar filtros</button>
                      </div>
                    ) : (
                      <div className="acq-empty">
                        <div className="acq-empty__icon">📦</div>
                        <p className="acq-empty__title">No hay proveedores registrados</p>
                        <p className="acq-empty__desc">Crea tu primer proveedor para comenzar la gestión de adquisiciones.</p>
                        <button type="button" className="acq-empty__action" onClick={() => { setSupplierForm(emptySupplierForm); setShowCreateSupplier(true); }}>+ Nuevo proveedor</button>
                      </div>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== ACQUISITIONS ========== */}
      {tab === 'acquisitions' && (
        <div className="acq-section">
          <div className="acq-filters">
            <input className="acq-search" placeholder="🔍 Buscar por número o título..." value={acqSearch} onChange={(e) => setAcqSearch(e.target.value)} aria-label="Buscar adquisiciones" />
            <select className="acq-filter-select" value={acqStatusFilter} onChange={(e) => setAcqStatusFilter(e.target.value)} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).filter(([k]) => !['ACTIVE', 'INACTIVE'].includes(k)).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select className="acq-filter-select" value={acqPriorityFilter} onChange={(e) => setAcqPriorityFilter(e.target.value)} aria-label="Filtrar por prioridad">
              <option value="">Todas las prioridades</option>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {hasAcqFilters && (
              <button type="button" className="acq-clear-btn" onClick={clearAcqFilters}>Limpiar</button>
            )}
          </div>

          <div className="acq-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Título</th>
                  <th>Prioridad</th>
                  <th>Proveedor</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonRows rows={4} cols={6} /> : filteredAcquisitions.map((a) => (
                  <tr key={a._id}>
                    <td><strong>{a.requestNumber}</strong></td>
                    <td>{a.title}</td>
                    <td><Badge value={a.priority} map={PRIORITY_LABELS} colors={PRIORITY_COLORS} /></td>
                    <td>{typeof a.supplierId === 'object' && a.supplierId ? (a.supplierId as SupplierModel).name : <span className="acq-text-muted">Sin asignar</span>}</td>
                    <td>
                      <Badge value={a.status} map={STATUS_LABELS} colors={STATUS_COLORS} />
                      {a.approvalStatus && (
                        <ApprovalStatusBadge status={a.approvalStatus} className="acq-badge--inline" />
                      )}
                    </td>
                    <td>
                      <RowActions>
                        <button className="acq-dropdown__item" onClick={() => {
                          setAcquisitionForm({ title: a.title, description: a.description || '', requestingArea: a.requestingArea || '', requestedBy: a.requestedBy || '', priority: a.priority, sstCriteria: a.sstCriteria || '', observations: a.observations || '', requiredDate: a.requiredDate ? a.requiredDate.slice(0, 10) : '' });
                          setShowEditAcquisition(a);
                        }}>✏️ Editar</button>
                        {a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && (
                          <>
                            <div className="acq-dropdown__separator" />
                            <div className="acq-dropdown__label">Cambiar estado</div>
                            {['REQUESTED', 'IN_REVIEW', 'SUPPLIER_SELECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
                              .filter((s) => s !== a.status)
                              .map((s) => (
                                <button key={s} className="acq-dropdown__item" onClick={() => void handleChangeStatus(a._id, s)}>
                                  → {STATUS_LABELS[s]}
                                </button>
                              ))
                            }
                            <div className="acq-dropdown__separator" />
                            <button className="acq-dropdown__item" onClick={() => setShowAssignSupplier(a)}>🏷 Asignar proveedor</button>
                          </>
                        )}
                        <div className="acq-dropdown__separator" />
                        <div className="acq-dropdown__label">Aprobación</div>
                        <button className="acq-dropdown__item" onClick={() => void handleOpenApprovalDetail(a)}>
                          📋 Ver estado de aprobación
                        </button>
                        {canSubmitApproval && (!a.approvalStatus || a.approvalStatus === 'DRAFT' || a.approvalStatus === 'REJECTED') && (
                          <button className="acq-dropdown__item" onClick={() => void handleSubmitApproval(a._id)} disabled={approvalLoading}>
                            📤 Enviar a aprobación
                          </button>
                        )}
                        {canSubmitApproval && a.approvalStatus === 'ADJUSTMENTS_REQUESTED' && (
                          <button className="acq-dropdown__item" onClick={() => void handleSubmitApproval(a._id)} disabled={approvalLoading}>
                            🔄 Enviar nuevamente a aprobación
                          </button>
                        )}
                        {canDecideApproval && a.approvalStatus === 'PENDING_APPROVAL' && (
                          <>
                            <button className="acq-dropdown__item acq-dropdown__item--success" onClick={() => void handleApprove(a._id)} disabled={approvalLoading}>
                              ✅ Aprobar
                            </button>
                            <button className="acq-dropdown__item acq-dropdown__item--danger" onClick={() => setShowRejectModal(a)}>
                              ❌ Rechazar
                            </button>
                            <button className="acq-dropdown__item" onClick={() => setShowAdjustmentsModal(a)}>
                              🔧 Solicitar ajustes
                            </button>
                          </>
                        )}
                        <div className="acq-dropdown__separator" />
                        <button className="acq-dropdown__item acq-dropdown__item--danger" onClick={() => void handleDeleteAcquisition(a._id)}>🗑 Eliminar</button>
                      </RowActions>
                    </td>
                  </tr>
                ))}
                {!loading && filteredAcquisitions.length === 0 && (
                  <tr><td colSpan={6}>
                    {hasAcqFilters ? (
                      <div className="acq-empty">
                        <div className="acq-empty__icon">🔍</div>
                        <p className="acq-empty__title">No encontramos resultados</p>
                        <p className="acq-empty__desc">Prueba cambiando los filtros o términos de búsqueda.</p>
                        <button type="button" className="acq-empty__action" onClick={clearAcqFilters}>Limpiar filtros</button>
                      </div>
                    ) : (
                      <div className="acq-empty">
                        <div className="acq-empty__icon">📋</div>
                        <p className="acq-empty__title">No hay adquisiciones registradas</p>
                        <p className="acq-empty__desc">Crea una adquisición para comenzar el seguimiento.</p>
                        <button type="button" className="acq-empty__action" onClick={() => { setAcquisitionForm(emptyAcqForm); setShowCreateAcquisition(true); }}>+ Nueva adquisición</button>
                      </div>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== HISTORY ========== */}
      {tab === 'history' && (
        <div className="acq-section">
          {loading ? (
            <div className="acq-history">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="acq-history__item acq-skeleton-block" style={{ height: 80 }} />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="acq-empty">
              <div className="acq-empty__icon">📜</div>
              <p className="acq-empty__title">No hay historial registrado</p>
              <p className="acq-empty__desc">Las acciones realizadas en proveedores y adquisiciones aparecerán aquí.</p>
            </div>
          ) : (
            <div className="acq-history">
              {history.map((h) => (
                <article key={h._id} className="acq-history__item">
                  <div className="acq-history__icon">{HISTORY_ACTION_ICONS[h.action] ?? '⚪'}</div>
                  <div className="acq-history__content">
                    <div className="acq-history__header">
                      <span className="acq-history__action" style={{ color: HISTORY_ACTION_COLORS[h.action] ?? '#2563eb' }}>
                        {h.action.replace(/_/g, ' ')}
                      </span>
                      <span className="acq-history__date">{formatDateTime(h.createdAt)}</span>
                    </div>
                    {h.userEmail && <div className="acq-history__user">{h.userEmail}</div>}
                    {h.description && <p className="acq-history__desc">{h.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== MODALS ========== */}

      {/* Create/Edit Supplier */}
      <Modal isOpen={showCreateSupplier || Boolean(showEditSupplier)} title={showEditSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'} onClose={() => { setShowCreateSupplier(false); setShowEditSupplier(null); }}>
        <div className="acq-form">
          <label className="field"><span className="label">Nombre *<span className="acq-required">*</span></span><input className="input" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} disabled={submitting} /></label>
          <label className="field"><span className="label">Razón social</span><input className="input" value={supplierForm.legalName} onChange={(e) => setSupplierForm({ ...supplierForm, legalName: e.target.value })} disabled={submitting} /></label>
          <label className="field"><span className="label">NIT</span><input className="input" value={supplierForm.taxId} onChange={(e) => setSupplierForm({ ...supplierForm, taxId: e.target.value })} disabled={submitting} /></label>
          <label className="field"><span className="label">Tipo</span>
            <select className="input" value={supplierForm.type} onChange={(e) => setSupplierForm({ ...supplierForm, type: e.target.value })} disabled={submitting}>
              <option value="PROVIDER">Proveedor</option>
              <option value="CONTRACTOR">Contratista</option>
              <option value="THIRD_PARTY">Tercero</option>
            </select>
          </label>
          <label className="field"><span className="label">Contacto</span><input className="input" value={supplierForm.contactName} onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })} disabled={submitting} /></label>
          <div className="acq-form__row">
            <label className="field"><span className="label">Email</span><input className="input" type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} disabled={submitting} /></label>
            <label className="field"><span className="label">Teléfono</span><input className="input" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} disabled={submitting} /></label>
          </div>
          <label className="field"><span className="label">Dirección</span><input className="input" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} disabled={submitting} /></label>
          <label className="field"><span className="label">Observaciones</span><textarea className="input" rows={2} value={supplierForm.observations} onChange={(e) => setSupplierForm({ ...supplierForm, observations: e.target.value })} disabled={submitting} /></label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => { setShowCreateSupplier(false); setShowEditSupplier(null); }} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={() => void (showEditSupplier ? handleUpdateSupplier() : handleCreateSupplier())} disabled={submitting || !supplierForm.name.trim()}>
              {submitting ? 'Guardando...' : showEditSupplier ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Acquisition */}
      <Modal isOpen={showCreateAcquisition || Boolean(showEditAcquisition)} title={showEditAcquisition ? 'Editar Adquisición' : 'Nueva Adquisición'} onClose={() => { setShowCreateAcquisition(false); setShowEditAcquisition(null); }}>
        <div className="acq-form">
          <label className="field"><span className="label">Título *</span><input className="input" value={acquisitionForm.title} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, title: e.target.value })} disabled={submitting} /></label>
          <label className="field"><span className="label">Descripción</span><textarea className="input" rows={2} value={acquisitionForm.description} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, description: e.target.value })} disabled={submitting} /></label>
          <div className="acq-form__row">
            <label className="field"><span className="label">Área solicitante</span><input className="input" value={acquisitionForm.requestingArea} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, requestingArea: e.target.value })} disabled={submitting} /></label>
            <label className="field"><span className="label">Solicitado por</span><input className="input" value={acquisitionForm.requestedBy} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, requestedBy: e.target.value })} disabled={submitting} /></label>
          </div>
          <div className="acq-form__row">
            <label className="field"><span className="label">Prioridad</span>
              <select className="input" value={acquisitionForm.priority} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, priority: e.target.value })} disabled={submitting}>
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="CRITICAL">Crítica</option>
              </select>
            </label>
            <label className="field"><span className="label">Fecha requerida</span><input className="input" type="date" value={acquisitionForm.requiredDate} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, requiredDate: e.target.value })} disabled={submitting} /></label>
          </div>
          <label className="field"><span className="label">Criterios SST</span><textarea className="input" rows={2} value={acquisitionForm.sstCriteria} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, sstCriteria: e.target.value })} disabled={submitting} /></label>
          <label className="field"><span className="label">Observaciones</span><textarea className="input" rows={2} value={acquisitionForm.observations} onChange={(e) => setAcquisitionForm({ ...acquisitionForm, observations: e.target.value })} disabled={submitting} /></label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => { setShowCreateAcquisition(false); setShowEditAcquisition(null); }} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={() => void (showEditAcquisition ? handleUpdateAcquisition() : handleCreateAcquisition())} disabled={submitting || !acquisitionForm.title.trim()}>
              {submitting ? 'Guardando...' : showEditAcquisition ? 'Guardar cambios' : 'Crear adquisición'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Supplier */}
      <Modal isOpen={Boolean(showAssignSupplier)} title={`Asignar proveedor — ${showAssignSupplier?.requestNumber ?? ''}`} onClose={() => { setShowAssignSupplier(null); setAssignSearch(''); }}>
        <div className="acq-assign">
          <input className="acq-search" placeholder="🔍 Buscar proveedor..." value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} aria-label="Buscar proveedor" />
          <div className="acq-assign__list">
            {filteredAssignSuppliers.length === 0 ? (
              <div className="acq-empty" style={{ padding: '1rem' }}>
                <p className="acq-empty__title">No hay proveedores disponibles</p>
              </div>
            ) : filteredAssignSuppliers.map((s) => (
              <button key={s._id} type="button" className="acq-assign__item" onClick={() => void handleAssignSupplier(s._id)}>
                <div className="acq-assign__info">
                  <strong>{s.name}</strong>
                  <span className="acq-text-muted">{TYPE_LABELS[s.type] ?? s.type}</span>
                  {s.contactName && <span className="acq-text-muted">{s.contactName}</span>}
                </div>
                <span className="acq-assign__select">Seleccionar</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={Boolean(showRejectModal)} title="Rechazar adquisición" onClose={() => { setShowRejectModal(null); setRejectReason(''); }}>
        <div className="acq-form">
          <p style={{ marginBottom: '0.75rem', color: '#64748b' }}>
            Adquisición: <strong>{showRejectModal?.requestNumber}</strong> — {showRejectModal?.title}
          </p>
          <label className="field">
            <span className="label">Razón del rechazo *</span>
            <textarea className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Describe la razón del rechazo..." disabled={approvalLoading} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => { setShowRejectModal(null); setRejectReason(''); }} disabled={approvalLoading}>Cancelar</Button>
            <Button type="button" onClick={() => void handleReject()} disabled={approvalLoading || !rejectReason.trim()}>
              {approvalLoading ? 'Procesando...' : '❌ Rechazar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Request Adjustments Modal */}
      <Modal isOpen={Boolean(showAdjustmentsModal)} title="Solicitar ajustes" onClose={() => { setShowAdjustmentsModal(null); setAdjustmentsReason(''); }}>
        <div className="acq-form">
          <p style={{ marginBottom: '0.75rem', color: '#64748b' }}>
            Adquisición: <strong>{showAdjustmentsModal?.requestNumber}</strong> — {showAdjustmentsModal?.title}
          </p>
          <label className="field">
            <span className="label">Razón de los ajustes *</span>
            <textarea className="input" rows={3} value={adjustmentsReason} onChange={(e) => setAdjustmentsReason(e.target.value)} placeholder="Describe los ajustes necesarios..." disabled={approvalLoading} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => { setShowAdjustmentsModal(null); setAdjustmentsReason(''); }} disabled={approvalLoading}>Cancelar</Button>
            <Button type="button" onClick={() => void handleRequestAdjustments()} disabled={approvalLoading || !adjustmentsReason.trim()}>
              {approvalLoading ? 'Procesando...' : '🔧 Solicitar ajustes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Approval Detail Modal */}
      <Modal isOpen={Boolean(approvalDetailAcq)} title={`Estado de aprobación — ${approvalDetailAcq?.requestNumber ?? ''}`} onClose={() => { setApprovalDetailAcq(null); setApprovalDetail(null); setApprovalHistory(null); }}>
        {approvalDetailLoading ? (
          <div className="acq-approval-detail">
            <div className="acq-skeleton-block" style={{ height: 120 }} />
          </div>
        ) : approvalDetail ? (
          <div className="acq-approval-detail">
            {/* Status */}
            <div className="acq-approval-detail__status">
              <ApprovalStatusBadge status={approvalDetail.approvalStatus ?? 'DRAFT'} className="acq-badge--detail" />
            </div>

            {/* Actions */}
            <div className="acq-approval-detail__actions">
              {approvalDetail.canSubmit && canSubmitApproval && (!approvalDetail.approvalStatus || approvalDetail.approvalStatus === 'DRAFT' || approvalDetail.approvalStatus === 'REJECTED') && (
                <Button type="button" onClick={() => void handleSubmitApproval(approvalDetail.acquisitionId)} disabled={approvalLoading}>
                  {approvalLoading ? 'Enviando...' : '📤 Enviar a aprobación'}
                </Button>
              )}
              {canSubmitApproval && approvalDetail.approvalStatus === 'ADJUSTMENTS_REQUESTED' && (
                <Button type="button" onClick={() => void handleSubmitApproval(approvalDetail.acquisitionId)} disabled={approvalLoading}>
                  {approvalLoading ? 'Enviando...' : '🔄 Enviar nuevamente a aprobación'}
                </Button>
              )}
              {canDecideApproval && approvalDetail.approvalStatus === 'PENDING_APPROVAL' && (
                <>
                  <Button type="button" onClick={() => void handleApprove(approvalDetail.acquisitionId)} disabled={approvalLoading}>
                    {approvalLoading ? 'Procesando...' : '✅ Aprobar'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { setShowRejectModal(approvalDetailAcq); }} disabled={approvalLoading}>
                    ❌ Rechazar
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { setShowAdjustmentsModal(approvalDetailAcq); }} disabled={approvalLoading}>
                    🔧 Solicitar ajustes
                  </Button>
                </>
              )}
            </div>

            {/* Rejection info */}
            {approvalDetail.approvalStatus === 'REJECTED' && (
              <div className="acq-approval-detail__info acq-approval-detail__info--rejected">
                <span className="acq-approval-detail__info-icon">❌</span>
                <div>
                  <p className="acq-approval-detail__info-title">Adquisición rechazada</p>
                  <p className="acq-approval-detail__info-desc">Esta adquisición fue rechazada. Puede enviarla nuevamente a aprobación después de realizar los ajustes necesarios.</p>
                </div>
              </div>
            )}

            {approvalDetail.approvalStatus === 'APPROVED' && (
              <div className="acq-approval-detail__info acq-approval-detail__info--approved">
                <span className="acq-approval-detail__info-icon">✅</span>
                <div>
                  <p className="acq-approval-detail__info-title">Adquisición aprobada</p>
                  <p className="acq-approval-detail__info-desc">Esta adquisición ha sido aprobada formalmente.</p>
                </div>
              </div>
            )}

            {approvalDetail.approvalStatus === 'ADJUSTMENTS_REQUESTED' && (
              <div className="acq-approval-detail__info acq-approval-detail__info--adjustments">
                <span className="acq-approval-detail__info-icon">🔧</span>
                <div>
                  <p className="acq-approval-detail__info-title">Ajustes solicitados</p>
                  <p className="acq-approval-detail__info-desc">Se requieren ajustes antes de aprobar. Realice los cambios necesarios y envíe nuevamente a aprobación.</p>
                </div>
              </div>
            )}

            {/* History */}
            <div className="acq-approval-detail__history">
              <button type="button" className="acq-approval-detail__history-toggle" onClick={() => void handleLoadApprovalHistory(approvalDetail.acquisitionId)} disabled={approvalHistoryLoading}>
                {approvalHistoryLoading ? 'Cargando historial...' : '📜 Ver historial de decisiones'}
              </button>
              {approvalHistory && (
                <div className="acq-approval-detail__history-list">
                  {approvalHistory.history.length === 0 ? (
                    <p className="acq-text-muted" style={{ padding: '0.5rem 0' }}>Sin decisiones registradas.</p>
                  ) : approvalHistory.history.map((entry) => (
                    <div key={entry._id} className="acq-approval-detail__history-item">
                      <div className="acq-approval-detail__history-item__header">
                        <span className="acq-approval-detail__history-item__action" style={{ color: APPROVAL_STATUS_COLORS[entry.newStatus] ?? '#2563eb' }}>
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
            </div>
          </div>
        ) : (
          <div className="acq-approval-detail">
            <p className="acq-text-muted">Sin información de aprobación disponible.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
