import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchEppDeliveries,
  fetchEppDeliveryHistory,
  fetchEppApplicabilityMatrix,
  createEppDelivery,
  updateEppDelivery,
  updateEppDeliveryStatus,
  type EppApplicabilityMatrixResponse,
  type EmployeeModel,
} from '../../api';
import type {
  EppDelivery,
  EppDeliveryCondition,
  EppDeliveryHistoryEntry,
  EppDeliveryResolvedStatus,
  EppDeliveryStatus,
} from '../../types/epp';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';

/**
 * ETAPA 4.2.6 — Experiencia operativa de ENTREGAS de EPP (EppDelivery).
 *
 * FRONTERAS:
 *  - Esta sección consume EXCLUSIVAMENTE la API de EppDelivery
 *    (/epp/deliveries). NO lee SstEpp.assignments[] (legacy intacto en la
 *    pestaña "Asignaciones") y NO calcula score/cobertura: esos números los
 *    entrega el backend (scoring V2) y se mostrarán en el Resumen V2.
 *  - El vencimiento es DINÁMICO: el backend NO persiste EXPIRED. Aquí se
 *    deriva visualmente (badge "Vencido") comparando expectedReplacementDate
 *    con la carga del listado; nunca se envía ni persiste como estado.
 *  - PERMISOS (backend): owner/admin escriben; manager lee; member recibe 403
 *    en deliveries → la sección se oculta para member (canViewDeliveries).
 *  - Identidad de la entrega INMUTABLE: employeeId/eppItemId/status/companyId/
 *    createdBy/updatedBy/history/snapshots no son editables desde la UI.
 */

// ============================================================
// LABELS / BADGES
// ============================================================

const CONDITION_LABELS: Record<EppDeliveryCondition, string> = {
  GOOD: 'Buena',
  FAIR: 'Regular',
  POOR: 'Mala',
  DAMAGED: 'Dañada',
};

const STATUS_LABELS: Record<EppDeliveryStatus, string> = {
  ACTIVE: 'Activa',
  REPLACED: 'Reemplazada',
  RETURNED: 'Devuelta',
  DAMAGED: 'Dañada',
};

const CONDITION_BADGE: Record<EppDeliveryCondition, string> = {
  GOOD: 'badge badge--success',
  FAIR: 'badge badge--warning',
  POOR: 'badge badge--danger',
  DAMAGED: 'badge badge--danger',
};

const STATUS_BADGE: Record<EppDeliveryStatus, string> = {
  ACTIVE: 'badge badge--success',
  REPLACED: 'badge badge--info',
  RETURNED: 'badge badge--warning',
  DAMAGED: 'badge badge--danger',
};

/** Transiciones válidas del backend (EPP_DELIVERY_STATUS_TRANSITIONS). */
const VALID_TRANSITIONS: Record<EppDeliveryStatus, EppDeliveryResolvedStatus[]> = {
  ACTIVE: ['REPLACED', 'RETURNED', 'DAMAGED'],
  REPLACED: [],
  RETURNED: [],
  DAMAGED: [],
};

// ============================================================
// HELPERS
// ============================================================

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (value: string | null | undefined): string => {
  const d = toDate(value);
  return d ? d.toLocaleDateString('es-CO') : '—';
};

const fmtDateTime = (value: string | null | undefined): string => {
  const d = toDate(value);
  return d ? d.toLocaleString('es-CO') : '—';
};

/** Vencimiento DINÁMICO (derivado, nunca persistido): reposición esperada ya pasó sin reemplazo. */
const isDynamicallyOverdue = (delivery: EppDelivery, reference: Date): boolean => {
  if (delivery.status !== 'ACTIVE') return false;
  if (delivery.actualReplacementDate) return false;
  const expected = toDate(delivery.expectedReplacementDate);
  return Boolean(expected && expected.getTime() < reference.getTime());
};

/** Detecta el código de estado HTTP del mensaje de error del apiFetch. */
const httpStatusFromError = (err: unknown): number | null => {
  const msg = err instanceof Error ? err.message : '';
  const match = msg.match(/\b(401|403|404)\b/);
  return match ? Number(match[1]) : null;
};

/** Mensaje amigable diferenciando 401/403/404. */
const friendlyError = (err: unknown, fallback: string): string => {
  const status = httpStatusFromError(err);
  if (status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (status === 403) return 'Este usuario no tiene permisos para gestionar entregas de EPP.';
  if (status === 404) return 'La entrega no existe o no pertenece a tu empresa.';
  return err instanceof Error ? err.message : fallback;
};

const isValidUrl = (value: string): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const toDateInputValue = (value: string | null | undefined): string => {
  const d = toDate(value);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
};

// ============================================================
// PROPS
// ============================================================

export interface EppDeliveriesSectionProps {
  token: string;
  /** Rol del usuario actual (controla permisos de escritura y visibilidad). */
  role?: string;
  /** Empleados (para filtro y selector del formulario; preferir activos). */
  employees: EmployeeModel[];
  /** Catálogo EPP activo (para filtro y selector del formulario). */
  eppItems: EppApplicabilityMatrixResponse['eppItems'];
  /**
   * Conjunto BASE compartido: la página lo carga UNA vez (bulk) y también
   * alimenta a la pestaña Trabajadores. Sin filtros aplicados, esta vista
   * ES ese conjunto (sin segunda petición).
   */
  baseDeliveries: EppDelivery[];
  /** true mientras el padre carga el conjunto base. */
  baseLoading?: boolean;
  /** Recarga el conjunto base en el padre (tras crear/editar/cambiar estado). */
  reloadBaseDeliveries: () => Promise<void>;
}

// ============================================================
// FORM STATE
// ============================================================

interface CreateFormState {
  employeeId: string;
  eppItemId: string;
  deliveryDate: string;
  expectedReplacementDate: string;
  quantity: string;
  condition: EppDeliveryCondition;
  evidenceUrl: string;
  certificateUrl: string;
  observations: string;
}

interface EditFormState {
  deliveryDate: string;
  expectedReplacementDate: string;
  actualReplacementDate: string;
  quantity: string;
  condition: EppDeliveryCondition;
  evidenceUrl: string;
  certificateUrl: string;
  observations: string;
}

interface StatusFormState {
  status: EppDeliveryResolvedStatus;
  actualReplacementDate: string;
  comment: string;
  evidenceUrl: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  employeeId: '',
  eppItemId: '',
  deliveryDate: '',
  expectedReplacementDate: '',
  quantity: '1',
  condition: 'GOOD',
  evidenceUrl: '',
  certificateUrl: '',
  observations: '',
};

const EMPTY_STATUS_FORM: StatusFormState = { status: 'REPLACED', actualReplacementDate: '', comment: '', evidenceUrl: '' };

export function EppDeliveriesSection({
  token,
  role,
  employees,
  eppItems,
  baseDeliveries,
  baseLoading = false,
  reloadBaseDeliveries,
}: EppDeliveriesSectionProps) {
  const canWrite = role === 'owner' || role === 'admin';
  const canViewDeliveries = role !== 'member'; // member → 403 en /epp/deliveries

  // ── Datos del listado ──
  // `deliveries` es la VISTA actual: por defecto espeja el conjunto base del
  // padre; solo se separa de él cuando hay filtros operativos (server-side).
  const [deliveries, setDeliveries] = useState<EppDelivery[]>(baseDeliveries);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');

  // ── Filtros (server-side; cada cambio reconsulta la API) ──
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterEpp, setFilterEpp] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | EppDeliveryStatus>('');
  const [filterOverdue, setFilterOverdue] = useState<'' | 'true'>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Referencia temporal del listado (para el indicador dinámico de vencimiento).
  const [loadedAt, setLoadedAt] = useState<Date>(() => new Date());
  // KPIs SOLO de la vista actual (no son el score oficial 4.2.6).
  const viewKpis = useMemo(() => {
    const active = deliveries.filter((d) => d.status === 'ACTIVE');
    const overdue = deliveries.filter((d) => isDynamicallyOverdue(d, loadedAt));
    return { total: deliveries.length, active: active.length, overdue: overdue.length };
  }, [deliveries, loadedAt]);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const data = await fetchEppDeliveries(token, {
        employeeId: filterEmployee || undefined,
        eppItemId: filterEpp || undefined,
        status: filterStatus || undefined,
        overdue: filterOverdue === 'true' ? true : undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setDeliveries(data);
      setLoadedAt(new Date());
    } catch (err) {
      setListError(friendlyError(err, 'Error al cargar las entregas de EPP'));
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [token, filterEmployee, filterEpp, filterStatus, filterOverdue, filterFrom, filterTo]);

  // FUENTE ÚNICA: sin filtros activos la vista ES el conjunto base del padre
  // (se espeja, sin petición). Con filtros activos se hace la consulta
  // filtrada legítima (server-side). Al recargarse la base (p. ej. tras una
  // mutación) la vista se re-sincroniza sola desde aquí.
  useEffect(() => {
    if (!canViewDeliveries || baseLoading) return;
    const hasFilters = Boolean(
      filterEmployee || filterEpp || filterStatus || filterOverdue || filterFrom || filterTo,
    );
    if (!hasFilters) {
      setDeliveries(baseDeliveries);
      setLoadedAt(new Date());
      setLoading(false);
      setListError('');
      return;
    }
    void loadDeliveries();
  }, [canViewDeliveries, baseLoading, baseDeliveries, filterEmployee, filterEpp, filterStatus, filterOverdue, filterFrom, filterTo, loadDeliveries]);

  const hasActiveFilters = Boolean(
    filterEmployee || filterEpp || filterStatus || filterOverdue || filterFrom || filterTo,
  );

  const clearFilters = () => {
    setFilterEmployee('');
    setFilterEpp('');
    setFilterStatus('');
    setFilterOverdue('');
    setFilterFrom('');
    setFilterTo('');
  };

  // ── Empleados / catálogo para selects ──
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'Activo'),
    [employees],
  );
  const activeEppItems = useMemo(() => eppItems.filter((i) => i.active), [eppItems]);

  // Matriz (para sugerir EPP aplicables al cargo del trabajador; no bloquea).
  // Una sola consulta enriquecida; si falla, solo se pierde la advertencia.
  const [matrix, setMatrix] = useState<EppApplicabilityMatrixResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchEppApplicabilityMatrix(token)
      .then((m) => { if (!cancelled) setMatrix(m); })
      .catch(() => { /* opcional: sin matriz no hay advertencia */ });
    return () => { cancelled = true; };
  }, [token]);

  const requiredItemIdsFor = useCallback(
    (employeeId: string): { requiredIds: string[]; jobProfileName: string | null } => {
      if (!matrix) return { requiredIds: [], jobProfileName: null };
      const employee = employees.find((e) => e._id === employeeId);
      if (!employee?.jobProfileId) return { requiredIds: [], jobProfileName: null };
      const profile = matrix.jobProfiles.find((p) => p.id === employee.jobProfileId);
      const requiredIds = matrix.assignments
        .filter((a) => a.jobProfileId === employee.jobProfileId && a.active && a.required)
        .map((a) => a.eppItemId);
      return { requiredIds, jobProfileName: profile?.name ?? null };
    },
    [matrix, employees],
  );

  // ── Estado de modales ──
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<EppDelivery | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [statusForm, setStatusForm] = useState<StatusFormState | null>(null);
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<EppDelivery | null>(null);
  const [historyEntries, setHistoryEntries] = useState<EppDeliveryHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Crear ──
  const openCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateErrors({});
    setActionError('');
    setCreateOpen(true);
  };

  const validateCreate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createForm.employeeId) errors.employeeId = 'Selecciona el trabajador.';
    if (!createForm.eppItemId) errors.eppItemId = 'Selecciona el elemento EPP.';
    if (!createForm.deliveryDate) errors.deliveryDate = 'La fecha de entrega es obligatoria.';
    if (!/^\d+$/.test(createForm.quantity) || Number(createForm.quantity) < 1) {
      errors.quantity = 'La cantidad debe ser un entero ≥ 1.';
    }
    if (createForm.evidenceUrl && !isValidUrl(createForm.evidenceUrl)) errors.evidenceUrl = 'URL de evidencia inválida.';
    if (createForm.certificateUrl && !isValidUrl(createForm.certificateUrl)) errors.certificateUrl = 'URL de certificado inválida.';
    if (createForm.expectedReplacementDate && createForm.deliveryDate
      && createForm.expectedReplacementDate < createForm.deliveryDate) {
      errors.expectedReplacementDate = 'La reposición no puede ser anterior a la fecha de entrega.';
    }
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreate()) return;
    setActionLoading(true);
    setActionError('');
    try {
      // Solo los campos del CreateEppDeliveryPayload: la identidad, snapshots,
      // status, history y companyId los genera el backend.
      await createEppDelivery(token, {
        employeeId: createForm.employeeId,
        eppItemId: createForm.eppItemId,
        deliveryDate: createForm.deliveryDate,
        quantity: Number(createForm.quantity),
        condition: createForm.condition,
        expectedReplacementDate: createForm.expectedReplacementDate || undefined,
        evidenceUrl: createForm.evidenceUrl || undefined,
        certificateUrl: createForm.certificateUrl || undefined,
        observations: createForm.observations || undefined,
      });
      setCreateOpen(false);
      // Recarga del conjunto BASE compartido: la pestaña Trabajadores queda
      // sincronizada y esta vista se re-sincroniza por efecto (sin doble estado).
      await reloadBaseDeliveries();
    } catch (err) {
      setActionError(friendlyError(err, 'No se pudo registrar la entrega.'));
    } finally {
      setActionLoading(false);
    }
  };

  // ── Editar (solo campos del UpdateEppDeliveryPayload) ──
  const openEdit = (delivery: EppDelivery) => {
    setEditErrors({});
    setActionError('');
    setEditForm({
      deliveryDate: toDateInputValue(delivery.deliveryDate),
      expectedReplacementDate: toDateInputValue(delivery.expectedReplacementDate),
      actualReplacementDate: toDateInputValue(delivery.actualReplacementDate),
      quantity: String(delivery.quantity),
      condition: delivery.condition,
      evidenceUrl: delivery.evidenceUrl ?? '',
      certificateUrl: delivery.certificateUrl ?? '',
      observations: delivery.observations ?? '',
    });
  };

  const validateEdit = (): boolean => {
    if (!editForm) return false;
    const errors: Record<string, string> = {};
    if (!editForm.deliveryDate) errors.deliveryDate = 'La fecha de entrega es obligatoria.';
    if (!/^\d+$/.test(editForm.quantity) || Number(editForm.quantity) < 1) {
      errors.quantity = 'La cantidad debe ser un entero ≥ 1.';
    }
    if (editForm.evidenceUrl && !isValidUrl(editForm.evidenceUrl)) errors.evidenceUrl = 'URL de evidencia inválida.';
    if (editForm.certificateUrl && !isValidUrl(editForm.certificateUrl)) errors.certificateUrl = 'URL de certificado inválida.';
    if (editForm.expectedReplacementDate && editForm.deliveryDate
      && editForm.expectedReplacementDate < editForm.deliveryDate) {
      errors.expectedReplacementDate = 'La reposición no puede ser anterior a la fecha de entrega.';
    }
    if (editForm.actualReplacementDate && editForm.deliveryDate
      && editForm.actualReplacementDate < editForm.deliveryDate) {
      errors.actualReplacementDate = 'La reposición efectiva no puede ser anterior a la entrega.';
    }
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleEdit = async () => {
    if (!editForm) return;
    if (!validateEdit()) return;
    if (!detail) return;
    setActionLoading(true);
    setActionError('');
    try {
      await updateEppDelivery(token, detail._id, {
        deliveryDate: editForm.deliveryDate,
        expectedReplacementDate: editForm.expectedReplacementDate || undefined,
        actualReplacementDate: editForm.actualReplacementDate || undefined,
        quantity: Number(editForm.quantity),
        condition: editForm.condition,
        evidenceUrl: editForm.evidenceUrl || undefined,
        certificateUrl: editForm.certificateUrl || undefined,
        observations: editForm.observations || undefined,
      });
      setEditForm(null);
      setDetail(null);
      await reloadBaseDeliveries(); // sincroniza base compartida + esta vista
    } catch (err) {
      setActionError(friendlyError(err, 'No se pudo actualizar la entrega.'));
    } finally {
      setActionLoading(false);
    }
  };

  // ── Cambio de estado (solo transiciones válidas; contrato exacto del DTO) ──
  const openStatus = (delivery: EppDelivery) => {
    setStatusErrors({});
    setActionError('');
    setStatusForm({ ...EMPTY_STATUS_FORM, status: VALID_TRANSITIONS[delivery.status][0] ?? 'REPLACED', actualReplacementDate: '' });
  };

  const validateStatus = (): boolean => {
    if (!statusForm) return false;
    const errors: Record<string, string> = {};
    if (statusForm.status === 'REPLACED' && !statusForm.actualReplacementDate) {
      errors.actualReplacementDate = 'La fecha real de reposición es obligatoria para reemplazar.';
    }
    if (statusForm.evidenceUrl && !isValidUrl(statusForm.evidenceUrl)) errors.evidenceUrl = 'URL de evidencia inválida.';
    setStatusErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleStatus = async () => {
    if (!statusForm || !detail) return;
    if (!validateStatus()) return;
    setActionLoading(true);
    setActionError('');
    try {
      // Contrato exacto de UpdateEppDeliveryStatusPayload: el DTO del backend
      // NO acepta certificateUrl ni observations aquí.
      await updateEppDeliveryStatus(token, detail._id, {
        status: statusForm.status,
        actualReplacementDate: statusForm.actualReplacementDate || undefined,
        comment: statusForm.comment || undefined,
        evidenceUrl: statusForm.evidenceUrl || undefined,
      });
      setStatusForm(null);
      setDetail(null);
      await reloadBaseDeliveries(); // sincroniza base compartida + esta vista
    } catch (err) {
      setActionError(friendlyError(err, 'No se pudo cambiar el estado de la entrega.'));
    } finally {
      setActionLoading(false);
    }
  };

  // ── Historial (server-side de la entrega, NO SstEpp.history[]) ──
  const openHistory = async (delivery: EppDelivery) => {
    setHistoryFor(delivery);
    setHistoryEntries(null);
    setHistoryLoading(true);
    try {
      const res = await fetchEppDeliveryHistory(token, delivery._id);
      setHistoryEntries(res.history);
    } catch (err) {
      setHistoryEntries([]); // el detalle se muestra como error dentro del modal
      setListError(friendlyError(err, 'Error al cargar el historial de la entrega'));
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── member: sin acceso a deliveries (backend responde 403) ──
  if (!canViewDeliveries) {
    return (
      <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
        Tu rol no tiene acceso a la gestión de entregas de EPP.
      </p>
    );
  }

  const emptyAll = !loading && deliveries.length === 0 && !hasActiveFilters;
  const emptyFiltered = !loading && deliveries.length === 0 && hasActiveFilters;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* KPIs SOLO de la vista actual — no son el score oficial 4.2.6 */}
      <div className="grid grid-3" style={{ gap: '.75rem' }}>
        <div className="card" style={{ padding: '.75rem 1rem' }}>
          <span className="label">Entregas mostradas</span>
          <p style={{ margin: '.25rem 0 0', fontWeight: 700 }}>{viewKpis.total}</p>
        </div>
        <div className="card" style={{ padding: '.75rem 1rem' }}>
          <span className="label">Activas</span>
          <p style={{ margin: '.25rem 0 0', fontWeight: 700, color: '#15803d' }}>{viewKpis.active}</p>
        </div>
        <div className="card" style={{ padding: '.75rem 1rem' }}>
          <span className="label">Vencidas (reposición pendiente)</span>
          <p style={{ margin: '.25rem 0 0', fontWeight: 700, color: viewKpis.overdue > 0 ? '#dc2626' : 'inherit' }}>
            {viewKpis.overdue}
          </p>
        </div>
      </div>

      <div className="actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
        <strong>Entregas de EPP</strong>
        {canWrite && (
          <Button type="button" onClick={openCreate}>+ Nueva entrega</Button>
        )}
      </div>

      {/* FILTROS (server-side) */}
      <div className="grid" style={{ gap: '.5rem' }}>
        <div className="grid grid-3" style={{ gap: '.5rem' }}>
          <div>
            <label className="label" htmlFor="epp-dl-filter-worker">Trabajador</label>
            <Select id="epp-dl-filter-worker" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="">Todos</option>
              {activeEmployees.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="epp-dl-filter-epp">EPP</label>
            <Select id="epp-dl-filter-epp" value={filterEpp} onChange={(e) => setFilterEpp(e.target.value)}>
              <option value="">Todos</option>
              {activeEppItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="epp-dl-filter-status">Estado</label>
            <Select
              id="epp-dl-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as '' | EppDeliveryStatus)}
            >
              <option value="">Todos</option>
              {(Object.keys(STATUS_LABELS) as EppDeliveryStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-3" style={{ gap: '.5rem' }}>
          <div>
            <label className="label" htmlFor="epp-dl-filter-overdue">Vencimiento</label>
            <Select
              id="epp-dl-filter-overdue"
              value={filterOverdue}
              onChange={(e) => setFilterOverdue(e.target.value as '' | 'true')}
            >
              <option value="">Todos</option>
              <option value="true">Vencidos</option>
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="epp-dl-filter-from">Desde</label>
            <Input id="epp-dl-filter-from" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gap: '.35rem' }}>
            <label className="label" htmlFor="epp-dl-filter-to">Hasta</label>
            <div className="grid grid-2" style={{ gap: '.5rem', alignItems: 'end' }}>
              <Input id="epp-dl-filter-to" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              {hasActiveFilters && (
                <Button type="button" variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {listError && (
        <div className="card card--error" style={{ padding: '.75rem 1rem' }}>
          {listError}
          <Button type="button" variant="ghost" onClick={() => void loadDeliveries()}>Reintentar</Button>
        </div>
      )}

      {loading || baseLoading ? (
        <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>Cargando entregas…</p>
      ) : emptyAll ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 .75rem' }}>No hay entregas registradas.</p>
          {canWrite && <Button type="button" onClick={openCreate}>+ Nueva entrega</Button>}
        </div>
      ) : emptyFiltered ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 .75rem' }}>No encontramos entregas con los filtros seleccionados.</p>
          <Button type="button" variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>EPP</th>
                <th>Entrega</th>
                <th>Reposición</th>
                <th>Condición</th>
                <th>Estado</th>
                <th>Evidencia</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => {
                const overdue = isDynamicallyOverdue(d, loadedAt);
                return (
                  <tr key={d._id}>
                    <td>{d.employeeNameSnapshot}</td>
                    <td>{d.eppNameSnapshot}</td>
                    <td>{fmtDate(d.deliveryDate)}</td>
                    <td>{fmtDate(d.expectedReplacementDate)}</td>
                    <td><span className={CONDITION_BADGE[d.condition]}>{CONDITION_LABELS[d.condition]}</span></td>
                    <td>
                      <span className={STATUS_BADGE[d.status]}>{STATUS_LABELS[d.status]}</span>
                      {overdue && <span className="badge badge--danger" style={{ marginLeft: '.35rem' }} title="Reposición esperada ya vencida (indicador dinámico, no es un estado persistido)">Vencido</span>}
                    </td>
                    <td>
                      {d.evidenceUrl
                        ? <a href={d.evidenceUrl} target="_blank" rel="noopener noreferrer">Ver evidencia</a>
                        : <span className="muted">Sin evidencia</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <Button type="button" variant="ghost" onClick={() => setDetail(d)}>Detalle</Button>
                      {canWrite && d.status === 'ACTIVE' && (
                        <Button type="button" variant="ghost" onClick={() => openStatus(d)}>Cambiar estado</Button>
                      )}
                      <Button type="button" variant="ghost" onClick={() => void openHistory(d)}>Historial</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: nueva entrega */}
      <Modal isOpen={createOpen} title="Nueva entrega de EPP" onClose={() => setCreateOpen(false)}>
        <div className="form-grid">
          <div>
            <label className="label" htmlFor="epp-dl-worker">Trabajador *</label>
            <Select
              id="epp-dl-worker"
              value={createForm.employeeId}
              onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value })}
            >
              <option value="">Selecciona…</option>
              {activeEmployees.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </Select>
            {createErrors.employeeId && <p className="error">{createErrors.employeeId}</p>}
            {createForm.employeeId && (() => {
              const { requiredIds, jobProfileName } = requiredItemIdsFor(createForm.employeeId);
              const isRequired = requiredIds.includes(createForm.eppItemId);
              if (!createForm.eppItemId && requiredIds.length > 0 && jobProfileName) {
                return <p className="muted" style={{ fontSize: '.8rem', margin: '.25rem 0 0' }}>Cargo: {jobProfileName} — {requiredIds.length} EPP requerido(s) en matriz.</p>;
              }
              if (createForm.eppItemId && jobProfileName && !isRequired) {
                return <p className="muted" style={{ fontSize: '.8rem', margin: '.25rem 0 0' }}>⚠ Este EPP no está configurado como requisito para el cargo del trabajador.</p>;
              }
              return null;
            })()}
          </div>
          <div>
            <label className="label" htmlFor="epp-dl-item">Elemento EPP *</label>
            <Select
              id="epp-dl-item"
              value={createForm.eppItemId}
              onChange={(e) => setCreateForm({ ...createForm, eppItemId: e.target.value })}
            >
              <option value="">Selecciona…</option>
              {activeEppItems.map((item) => {
                const requiredIds = createForm.employeeId ? requiredItemIdsFor(createForm.employeeId).requiredIds : [];
                const required = requiredIds.includes(item.id);
                return (
                  <option key={item.id} value={item.id}>{required ? '★ ' : ''}{item.name} ({item.category})</option>
                );
              })}
            </Select>
            {createErrors.eppItemId && <p className="error">{createErrors.eppItemId}</p>}
            <p className="muted" style={{ fontSize: '.75rem', margin: '.25rem 0 0' }}>★ = requerido en la matriz del cargo del trabajador seleccionado.</p>
          </div>
          <div className="grid grid-2" style={{ gap: '.75rem' }}>
            <div>
              <label className="label" htmlFor="epp-dl-date">Fecha de entrega *</label>
              <Input id="epp-dl-date" type="date" value={createForm.deliveryDate} onChange={(e) => setCreateForm({ ...createForm, deliveryDate: e.target.value })} />
              {createErrors.deliveryDate && <p className="error">{createErrors.deliveryDate}</p>}
            </div>
            <div>
              <label className="label" htmlFor="epp-dl-expected">Próxima reposición (opcional)</label>
              <Input id="epp-dl-expected" type="date" value={createForm.expectedReplacementDate} onChange={(e) => setCreateForm({ ...createForm, expectedReplacementDate: e.target.value })} />
              {createErrors.expectedReplacementDate && <p className="error">{createErrors.expectedReplacementDate}</p>}
            </div>
          </div>
          <div className="grid grid-2" style={{ gap: '.75rem' }}>
            <div>
              <label className="label" htmlFor="epp-dl-qty">Cantidad *</label>
              <Input id="epp-dl-qty" type="number" min={1} max={1000} value={createForm.quantity} onChange={(e) => setCreateForm({ ...createForm, quantity: e.target.value })} />
              {createErrors.quantity && <p className="error">{createErrors.quantity}</p>}
            </div>
            <div>
              <label className="label" htmlFor="epp-dl-cond">Condición *</label>
              <Select id="epp-dl-cond" value={createForm.condition} onChange={(e) => setCreateForm({ ...createForm, condition: e.target.value as EppDeliveryCondition })}>
                {(Object.keys(CONDITION_LABELS) as EppDeliveryCondition[]).map((c) => (
                  <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="epp-dl-evidence">Evidencia (URL, opcional)</label>
            <Input id="epp-dl-evidence" value={createForm.evidenceUrl} onChange={(e) => setCreateForm({ ...createForm, evidenceUrl: e.target.value })} placeholder="https://… acta/foto/firma" />
            {createErrors.evidenceUrl && <p className="error">{createErrors.evidenceUrl}</p>}
          </div>
          <div>
            <label className="label" htmlFor="epp-dl-cert">Certificado (URL, opcional)</label>
            <Input id="epp-dl-cert" value={createForm.certificateUrl} onChange={(e) => setCreateForm({ ...createForm, certificateUrl: e.target.value })} placeholder="https://…" />
            {createErrors.certificateUrl && <p className="error">{createErrors.certificateUrl}</p>}
          </div>
          <div>
            <label className="label" htmlFor="epp-dl-obs">Observaciones (opcional)</label>
            <textarea id="epp-dl-obs" className="input" rows={2} value={createForm.observations} onChange={(e) => setCreateForm({ ...createForm, observations: e.target.value })} />
          </div>
          {actionError && <p className="error">{actionError}</p>}
          <div className="actions" style={{ justifyContent: 'flex-end', gap: '.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void handleCreate()} disabled={actionLoading}>{actionLoading ? 'Guardando…' : 'Registrar entrega'}</Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: detalle (+ editar) */}
      <Modal isOpen={detail !== null} title="Detalle de la entrega" onClose={() => { setDetail(null); setEditForm(null); }}>
        {detail && (
          <div style={{ display: 'grid', gap: '.75rem' }}>
            {!editForm ? (
              <>
                <div className="grid grid-2" style={{ gap: '.5rem' }}>
                  <div><span className="label">Trabajador</span><p style={{ margin: '.15rem 0 0' }}>{detail.employeeNameSnapshot}</p></div>
                  <div><span className="label">EPP</span><p style={{ margin: '.15rem 0 0' }}>{detail.eppNameSnapshot}</p></div>
                  <div><span className="label">Cantidad</span><p style={{ margin: '.15rem 0 0' }}>{detail.quantity}</p></div>
                  <div><span className="label">Condición</span><span className={CONDITION_BADGE[detail.condition]}>{CONDITION_LABELS[detail.condition]}</span></div>
                  <div><span className="label">Fecha de entrega</span><p style={{ margin: '.15rem 0 0' }}>{fmtDate(detail.deliveryDate)}</p></div>
                  <div><span className="label">Próxima reposición</span><p style={{ margin: '.15rem 0 0' }}>{fmtDate(detail.expectedReplacementDate)}</p></div>
                  <div><span className="label">Estado</span><span className={STATUS_BADGE[detail.status]}>{STATUS_LABELS[detail.status]}</span></div>
                  <div><span className="label">Vigencia</span><p style={{ margin: '.15rem 0 0' }}>
                    {isDynamicallyOverdue(detail, loadedAt)
                      ? <span className="badge badge--danger">Vencido</span>
                      : detail.status === 'ACTIVE' ? <span className="badge badge--success">Vigente</span> : <span className="muted">—</span>}
                  </p></div>
                </div>
                <div>
                  <span className="label">Evidencia</span>
                  <p style={{ margin: '.15rem 0 0' }}>
                    {detail.evidenceUrl
                      ? <a href={detail.evidenceUrl} target="_blank" rel="noopener noreferrer">Ver evidencia</a>
                      : <span className="muted">Sin evidencia</span>}
                    {detail.certificateUrl && (
                      <> · <a href={detail.certificateUrl} target="_blank" rel="noopener noreferrer">Ver certificado</a></>
                    )}
                  </p>
                </div>
                {detail.observations && (
                  <div><span className="label">Observaciones</span><p style={{ margin: '.15rem 0 0' }}>{detail.observations}</p></div>
                )}
                <div className="grid grid-2" style={{ gap: '.5rem' }}>
                  <div><span className="label">Creada</span><p style={{ margin: '.15rem 0 0' }}>{fmtDateTime(detail.createdAt)}</p></div>
                  <div><span className="label">Actualizada</span><p style={{ margin: '.15rem 0 0' }}>{fmtDateTime(detail.updatedAt)}</p></div>
                  <div><span className="label">Creada por</span><p style={{ margin: '.15rem 0 0' }}>{detail.createdBy || '—'}</p></div>
                </div>
                {canWrite && (
                  <div className="actions" style={{ justifyContent: 'flex-end', gap: '.5rem' }}>
                    {detail.status === 'ACTIVE' && (
                      <Button type="button" variant="secondary" onClick={() => openStatus(detail)}>Cambiar estado</Button>
                    )}
                    <Button type="button" onClick={() => openEdit(detail)}>Editar</Button>
                  </div>
                )}
              </>
            ) : (
              <div className="form-grid">
                <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
                  Trabajador: <strong>{detail.employeeNameSnapshot}</strong> · EPP: <strong>{detail.eppNameSnapshot}</strong> — identidad no editable.
                </p>
                <div className="grid grid-2" style={{ gap: '.75rem' }}>
                  <div>
                    <label className="label" htmlFor="epp-dl-ed-date">Fecha de entrega *</label>
                    <Input id="epp-dl-ed-date" type="date" value={editForm.deliveryDate} onChange={(e) => setEditForm({ ...editForm, deliveryDate: e.target.value })} />
                    {editErrors.deliveryDate && <p className="error">{editErrors.deliveryDate}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor="epp-dl-ed-expected">Próxima reposición</label>
                    <Input id="epp-dl-ed-expected" type="date" value={editForm.expectedReplacementDate} onChange={(e) => setEditForm({ ...editForm, expectedReplacementDate: e.target.value })} />
                    {editErrors.expectedReplacementDate && <p className="error">{editErrors.expectedReplacementDate}</p>}
                  </div>
                </div>
                <div className="grid grid-2" style={{ gap: '.75rem' }}>
                  <div>
                    <label className="label" htmlFor="epp-dl-ed-qty">Cantidad *</label>
                    <Input id="epp-dl-ed-qty" type="number" min={1} max={1000} value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
                    {editErrors.quantity && <p className="error">{editErrors.quantity}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor="epp-dl-ed-cond">Condición *</label>
                    <Select id="epp-dl-ed-cond" value={editForm.condition} onChange={(e) => setEditForm({ ...editForm, condition: e.target.value as EppDeliveryCondition })}>
                      {(Object.keys(CONDITION_LABELS) as EppDeliveryCondition[]).map((c) => (
                        <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="epp-dl-ed-evidence">Evidencia (URL)</label>
                  <Input id="epp-dl-ed-evidence" value={editForm.evidenceUrl} onChange={(e) => setEditForm({ ...editForm, evidenceUrl: e.target.value })} />
                  {editErrors.evidenceUrl && <p className="error">{editErrors.evidenceUrl}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="epp-dl-ed-cert">Certificado (URL)</label>
                  <Input id="epp-dl-ed-cert" value={editForm.certificateUrl} onChange={(e) => setEditForm({ ...editForm, certificateUrl: e.target.value })} />
                  {editErrors.certificateUrl && <p className="error">{editErrors.certificateUrl}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="epp-dl-ed-obs">Observaciones</label>
                  <textarea id="epp-dl-ed-obs" className="input" rows={2} value={editForm.observations} onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })} />
                </div>
                {actionError && <p className="error">{actionError}</p>}
                <div className="actions" style={{ justifyContent: 'flex-end', gap: '.5rem' }}>
                  <Button type="button" variant="ghost" onClick={() => setEditForm(null)}>Cancelar</Button>
                  <Button type="button" onClick={() => void handleEdit()} disabled={actionLoading}>{actionLoading ? 'Guardando…' : 'Guardar cambios'}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL: cambio de estado */}
      <Modal isOpen={statusForm !== null} title="Cambiar estado de la entrega" onClose={() => setStatusForm(null)}>
        {statusForm && detail && (
          <div className="form-grid">
            <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
              {detail.employeeNameSnapshot} — {detail.eppNameSnapshot}. La reposición del ciclo se registra como una NUEVA entrega.
            </p>
            <div>
              <label className="label" htmlFor="epp-dl-st-status">Nuevo estado *</label>
              <Select
                id="epp-dl-st-status"
                value={statusForm.status}
                onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value as EppDeliveryResolvedStatus })}
              >
                {VALID_TRANSITIONS[detail.status].map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </Select>
            </div>
            {statusForm.status === 'REPLACED' && (
              <div>
                <label className="label" htmlFor="epp-dl-st-date">Fecha real de reposición *</label>
                <Input
                  id="epp-dl-st-date"
                  type="date"
                  value={statusForm.actualReplacementDate}
                  onChange={(e) => setStatusForm({ ...statusForm, actualReplacementDate: e.target.value })}
                />
                {statusErrors.actualReplacementDate && <p className="error">{statusErrors.actualReplacementDate}</p>}
              </div>
            )}
            {statusForm.status !== 'RETURNED' && (
              <div>
                <label className="label" htmlFor="epp-dl-st-evidence">Evidencia (URL, opcional)</label>
                <Input
                  id="epp-dl-st-evidence"
                  value={statusForm.evidenceUrl}
                  onChange={(e) => setStatusForm({ ...statusForm, evidenceUrl: e.target.value })}
                  placeholder={statusForm.status === 'DAMAGED' ? 'https://… foto del EPP dañado' : 'https://…'}
                />
                {statusErrors.evidenceUrl && <p className="error">{statusErrors.evidenceUrl}</p>}
              </div>
            )}
            <div>
              <label className="label" htmlFor="epp-dl-st-comment">Comentario (opcional)</label>
              <textarea
                id="epp-dl-st-comment"
                className="input"
                rows={2}
                value={statusForm.comment}
                onChange={(e) => setStatusForm({ ...statusForm, comment: e.target.value })}
              />
            </div>
            {actionError && <p className="error">{actionError}</p>}
            <div className="actions" style={{ justifyContent: 'flex-end', gap: '.5rem' }}>
              <Button type="button" variant="ghost" onClick={() => setStatusForm(null)}>Cancelar</Button>
              <Button type="button" onClick={() => void handleStatus()} disabled={actionLoading}>{actionLoading ? 'Aplicando…' : 'Aplicar cambio'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: historial de la entrega */}
      <Modal isOpen={historyFor !== null} title="Historial de la entrega" onClose={() => setHistoryFor(null)}>
        {historyFor && (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
              {historyFor.employeeNameSnapshot} — {historyFor.eppNameSnapshot}
            </p>
            {historyLoading ? (
              <p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Cargando historial…</p>
            ) : (historyEntries?.length ?? 0) === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin eventos de historial.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Acción</th>
                      <th>Fecha</th>
                      <th>Usuario</th>
                      <th>Comentario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(historyEntries ?? [])].reverse().map((entry, i) => (
                      <tr key={i}>
                        <td><span className="badge">{entry.action}</span></td>
                        <td>{fmtDateTime(entry.date)}</td>
                        <td>{entry.performedBy}</td>
                        <td>{entry.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

