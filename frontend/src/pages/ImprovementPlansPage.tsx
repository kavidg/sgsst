import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ImprovementPlanModel,
  type ImprovementPlanStatus,
  type ImprovementPlanOrigin,
  type ImprovementPlanPriority,
  type ImprovementPlanActivityStatus,
  type ImprovementPlanImplementationStatus,
  type ImprovementPlanPerceivedEffectiveness,
  type ImprovementPlanResourceType,
  type IpHistoryModel,
  type IpActivityModel,
  type CreateImprovementPlanPayload,
  type CreatePlanActivityPayload,
  type UpdatePlanActivityPayload,
  type UserModel,
  fetchImprovementPlans,
  fetchImprovementPlan,
  createImprovementPlan,
  updateImprovementPlan,
  updateImprovementPlanStatus,
  deleteImprovementPlan,
  createImprovementPlanActivity,
  updateImprovementPlanActivity,
  updateImprovementPlanActivityStatus,
  addImprovementPlanActivityEvidence,
  registerImprovementPlanActivityFollowUp,
  addPlanMonitoring,
  fetchImprovementPlanHistory,
  fetchAdmins,
  fetchMembers,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  IP_MODULE,
  IP_PLAN_STATUS_LABELS,
  IP_ACTIVITY_STATUS_LABELS,
  IP_ORIGIN_LABELS,
  IP_PRIORITY_LABELS,
  IP_RESOURCE_TYPE_LABELS,
  IP_IMPLEMENTATION_STATUS_LABELS,
  IP_PERCEIVED_EFFECTIVENESS_LABELS,
  IP_PLAN_STATUS_VARIANTS,
  IP_ACTIVITY_STATUS_VARIANTS,
  IP_PRIORITY_VARIANTS,
  IP_IMPLEMENTATION_STATUS_VARIANTS,
  IP_PERCEIVED_EFFECTIVENESS_VARIANTS,
  IP_PLAN_VALID_TRANSITIONS,
  IP_PLAN_TRANSITION_LABELS,
  IP_ACTIVITY_VALID_TRANSITIONS,
  IP_ACTIVITY_TRANSITION_LABELS,
  IP_HISTORY_ACTION_LABELS,
  IP_DIMENSION_KEYS,
  IP_DIMENSION_LABELS,
  IP_DIMENSION_WEIGHT_FALLBACK,
  IP_FINDING_ACTIONS,
  isIpPlanOverdue,
  isIpActivityOverdue,
  isIpPlanEditable,
  isIpActivityEditable,
  isIpComplianceMetadataV1,
  ipRatioToPercent,
  type IpComplianceMetadataV1,
} from '../types/improvement-plans';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  AdvancedProgressBar,
  type SidebarTabItem,
} from '../components/advanced-layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Table } from '../components/ui/Table';
// E3 (7.1.4): IA complementaria — interpreta el resultado oficial; si falla,
// el componente no bloquea la página (fallback interno tolerante).
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';

/**
 * E3 (7.1.4) — Gestión Avanzada del PLAN DE MEJORAMIENTO del SG-SST.
 *
 * REGLA DE SCORE: el frontend NO calcula el cumplimiento. Porcentaje, estado,
 * nivel y metadata dimensional provienen exclusivamente de
 * GET /compliance-engine/overview (module === 'improvement-plan',
 * dimensions:v1 — provider oficial E2). `ipRatioToPercent` es solo
 * presentación visual. `isIpPlanOverdue`/`isIpActivityOverdue` replican la
 * regla OFICIAL derivada del scorer (endDate/dueDate < now && estado no
 * terminal) — SOLO presentación, nunca se envían al backend.
 *
 * FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 * seguimiento de la actividad (perceivedEffectiveness) — la UI NUNCA la
 * presenta como "verificación de eficacia" ni "eficacia formal".
 *
 * Roles (E1): lectura owner/admin/manager; member SIN acceso (el router lo
 * redirige a /dashboard); escritura owner/admin (el backend es la autoridad —
 * aquí solo se ocultan acciones). El estado del plan SOLO cambia por
 * PATCH /:id/status (transiciones válidas espejo); el de la actividad por
 * PATCH /:id/activities/:activityId/status; el seguimiento del plan por
 * POST /:id/monitoring. DELETE solo DRAFT (backend); planes en curso se
 * CANCELLED (evidencia histórica preservada).
 *
 * IDs (activityId/monitoringId/objectiveId) son SIEMPRE server-side: el
 * frontend los muestra pero jamás los inventa ni los envía.
 */

interface ImprovementPlansPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: '📋' },
  { id: 'planes', label: 'Planes', icon: '🗂️' },
];

/** Solo lectura de fecha (input date emite YYYY-MM-DD, aceptado por IsDateString). */
function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function canWrite(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** Mensaje legible de un evento de historial (details.message / before→after). */
function historyMessage(h: IpHistoryModel): string {
  const message = typeof h.details?.message === 'string' ? h.details.message : '';
  if (message) return message;
  const before = h.before as { status?: string } | undefined;
  const after = h.after as { status?: string } | undefined;
  if (before?.status && after?.status) {
    return `Estado: ${before.status} → ${after.status}`;
  }
  if (h.activityId) return `Actividad ${h.activityId}`;
  if (h.monitoringId) return `Seguimiento ${h.monitoringId}`;
  return '—';
}

export function ImprovementPlansPage({ token, role }: ImprovementPlansPageProps) {
  const writable = canWrite(role);
  const [activeTab, setActiveTab] = useState<string>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Datos
  const [plans, setPlans] = useState<ImprovementPlanModel[]>([]);
  const [users, setUsers] = useState<UserModel[]>([]);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<IpComplianceMetadataV1 | null>(null);

  // Filtros del tab Planes
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterOrigin, setFilterOrigin] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterOverdue, setFilterOverdue] = useState<string>('');

  // Estado de guardado
  const [saving, setSaving] = useState(false);
  /** Se incrementa con cada mutación → el detalle abierto se refresca. */
  const [detailRevision, setDetailRevision] = useState(0);

  // Modales
  const [formModal, setFormModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; plan: ImprovementPlanModel }
    | null
  >(null);
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<
    | { plan: ImprovementPlanModel; next: ImprovementPlanStatus }
    | null
  >(null);
  const [deleteModal, setDeleteModal] = useState<
    | { plan: ImprovementPlanModel }
    | null
  >(null);
  const [monitoringModal, setMonitoringModal] = useState<
    | { plan: ImprovementPlanModel }
    | null
  >(null);
  const [activityModal, setActivityModal] = useState<
    | { mode: 'create'; plan: ImprovementPlanModel }
    | { mode: 'edit'; plan: ImprovementPlanModel; activity: IpActivityModel }
    | null
  >(null);
  const [evidenceModal, setEvidenceModal] = useState<
    | { plan: ImprovementPlanModel; activity: IpActivityModel }
    | null
  >(null);
  const [followUpModal, setFollowUpModal] = useState<
    | { plan: ImprovementPlanModel; activity: IpActivityModel }
    | null
  >(null);

  // ─── Carga (tolerante: compliance falla ≠ romper la gestión) ────────────
  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === IP_MODULE) ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isIpComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === IP_MODULE));
  }, [token]);

  const loadPlans = useCallback(async () => {
    setPlans(await fetchImprovementPlans(token).catch(() => []));
  }, [token]);

  const loadUsers = useCallback(async () => {
    // GET del dominio solo expone owner/admin/manager: la carga de usuarios es
    // tolerante (el responsable puede ser un admin/owner del tenant).
    const [admins, members] = await Promise.all([
      fetchAdmins(token).catch(() => [] as UserModel[]),
      fetchMembers(token).catch(() => [] as UserModel[]),
    ]);
    setUsers([...admins, ...members]);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list] = await Promise.all([
          fetchImprovementPlans(token),
          loadUsers(),
        ]);
        if (cancelled) return;
        setPlans(list);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void loadCompliance();
    return () => {
      cancelled = true;
    };
  }, [token, loadUsers, loadCompliance]);

  // ─── Derivados de presentación ──────────────────────────────────────────
  const percentage = compliance?.compliance ?? null;
  const status = compliance?.status ?? null;
  const counters = metadata?.counters ?? null;
  const target = metadata?.target;

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of plans) {
      if (typeof p.year === 'number') set.add(p.year);
      const y = p.startDate ? new Date(p.startDate).getUTCFullYear() : NaN;
      if (!Number.isNaN(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [plans]);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterPriority && p.priority !== filterPriority) return false;
      if (filterOrigin && p.origin !== filterOrigin) return false;
      if (filterOverdue === 'yes' && !isIpPlanOverdue(p)) return false;
      if (filterOverdue === 'no' && isIpPlanOverdue(p)) return false;
      if (filterYear) {
        const pYear = typeof p.year === 'number' ? String(p.year) : p.period ?? '';
        if (!pYear.includes(filterYear)) return false;
      }
      if (q) {
        const haystack = `${p.code} ${p.title} ${p.description ?? ''} ${p.period ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [plans, search, filterStatus, filterPriority, filterOrigin, filterYear, filterOverdue]);

  const statusBadge = loading
    ? <span className="badge badge--info">⏳ Cargando…</span>
    : compliance === null
      ? <span className="badge badge--warning">Cumplimiento no disponible</span>
      : status === 'NO_DATA'
        ? <span className="badge badge--warning">Sin datos evaluables</span>
        : status === 'TARGET_MET'
          ? <span className="badge badge--success">✅ Meta alcanzada</span>
          : <span className="badge badge--danger">Meta no alcanzada</span>;

  // ─── Transición de estado del plan ──────────────────────────────────────
  const handleStatusChange = async () => {
    if (!statusModal) return;
    setSaving(true);
    try {
      await updateImprovementPlanStatus(token, statusModal.plan._id, { status: statusModal.next });
      const next = statusModal.next;
      setStatusModal(null);
      await Promise.all([loadPlans(), loadCompliance()]);
      setDetailRevision((r) => r + 1);
      setBanner(`Estado actualizado a ${IP_PLAN_STATUS_LABELS[next]}.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Eliminar plan (solo DRAFT; backend valida) ─────────────────────────
  const handleDelete = async () => {
    if (!deleteModal) return;
    setSaving(true);
    try {
      await deleteImprovementPlan(token, deleteModal.plan._id);
      setDeleteModal(null);
      await Promise.all([loadPlans(), loadCompliance()]);
      setDetailRevision((r) => r + 1);
      setBanner('Plan eliminado.');
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const goToFindingAction = (findingId: string) => {
    const action = IP_FINDING_ACTIONS[findingId];
    if (action) setActiveTab(action.tab);
  };

  const planById = useCallback((id: string) => plans.find((p) => p._id === id) ?? null, [plans]);

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/act"
        backLabel="← Volver a Actuar"
        moduleCode="7.1.4"
        moduleTitle="Plan de mejoramiento"
        description="Gestión integral del plan de mejoramiento del SG-SST: identificación, priorización, objetivos, actividades, seguimiento, evidencias y cierre."
        statusBadge={statusBadge}
        actions={writable
          ? [{ label: '🔄 Recargar', onClick: () => { void loadPlans(); void loadCompliance(); }, variant: 'secondary' as const }]
          : []}
        lastSaved={compliance ? `Porcentaje oficial: ${percentage ?? 0}%` : undefined}
      />

      {banner ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <span>{banner}</span>{' '}
          <Button variant="ghost" onClick={() => setBanner(null)}>✕</Button>
        </div>
      ) : null}

      <AdvancedKpiGrid
        items={[
          {
            label: 'Cumplimiento oficial 7.1.4',
            value: loading ? '…' : status === 'NO_DATA' ? 'Sin datos' : percentage === null ? 'N/D' : `${percentage}%`,
            variant: status === 'TARGET_MET' ? 'success' : status === 'NO_DATA' || compliance === null ? 'warning' : 'danger',
          },
          { label: 'Planes', value: counters?.totalPlans ?? plans.length, variant: 'info' },
          {
            label: 'Planes activos',
            value: (counters ? counters.draftPlans + counters.submittedPlans + counters.inProgressPlans : plans.filter((p) => p.status !== 'CLOSED' && p.status !== 'CANCELLED' && p.status !== 'COMPLETED').length),
            variant: 'info',
          },
          { label: 'Actividades', value: counters?.totalActivities ?? 0, variant: 'info' },
          { label: 'Actividades completadas', value: counters?.completedActivities ?? 0, variant: 'success' },
          { label: 'Actividades vencidas', value: counters?.overdueActivities ?? 0, variant: 'danger' },
          { label: 'Planes con seguimiento', value: counters?.plansWithMonitoring ?? 0, variant: 'info' },
          { label: 'Planes cerrados', value: counters?.closedPlans ?? 0, variant: 'success' },
        ]}
        columns={4}
      />

      <div className="flex gap-6">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />
        <AdvancedTabsContent>
          {error ? <p>⚠️ {error}</p> : null}

          {/* ══════════════ RESUMEN ══════════════ */}
          {activeTab === 'resumen' && (
            <AdvancedSection
              title="Cumplimiento oficial — 7.1.4"
              description="Fuente única: ComplianceEngine (dimensions:v1). El frontend no recalcula."
            >
              {loading ? (
                <p>Cargando…</p>
              ) : compliance === null ? (
                <p>El resultado de cumplimiento no está disponible en este momento.</p>
              ) : (
                <>
                  <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div className="card">
                      <strong>
                        {status === 'NO_DATA'
                          ? 'Sin datos evaluables — todavía no existen planes de mejoramiento evaluables.'
                          : `${percentage ?? 0}%`}
                      </strong>
                      <p style={{ margin: 0 }}>
                        Estado: {status ?? '—'} · Nivel: {compliance.level} ·{' '}
                        {typeof target === 'number' ? `Meta: ${target}% · ` : ''}
                        Período evaluado: {metadata?.evaluatedPeriod ?? '—'}
                      </p>
                      {metadata?.weights ? (
                        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                          Fórmula: {metadata.formula} · Pesos:{' '}
                          {Object.entries(metadata.weights).map(([k, v]) => `${k} ${v}%`).join(' · ')}
                        </p>
                      ) : null}
                      {status === 'NO_DATA' && writable ? (
                        <div style={{ marginTop: '.5rem' }}>
                          <Button onClick={() => setFormModal({ mode: 'create' })}>Crear primer plan</Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="card">
                      <strong>Estructura del plan</strong>
                      <p style={{ margin: 0 }}>
                        Con objetivos: {counters?.plansWithObjectives ?? 0} · Sin objetivos: {counters?.plansWithoutObjectives ?? 0} ·{' '}
                        Con indicadores: {counters?.plansWithIndicators ?? 0} · Con recursos: {counters?.plansWithResources ?? 0}
                      </p>
                      <p style={{ margin: 0 }}>
                        Con seguimiento: {counters?.plansWithMonitoring ?? 0} · Sin seguimiento: {counters?.plansWithoutMonitoring ?? 0} ·{' '}
                        Cerrados: {counters?.plansClosed ?? 0} · Sin cierre: {counters?.plansNotClosed ?? 0}
                      </p>
                    </div>
                    <div className="card">
                      <strong>Actividades y evidencia</strong>
                      <p style={{ margin: 0 }}>
                        Pendientes: {counters?.pendingActivities ?? 0} · En progreso: {counters?.inProgressActivities ?? 0} ·{' '}
                        Completadas: {counters?.completedActivities ?? 0} · Vencidas: {counters?.overdueActivities ?? 0}
                      </p>
                      <p style={{ margin: 0 }}>
                        Con evidencia: {counters?.activitiesWithEvidence ?? 0} · Sin evidencia: {counters?.activitiesWithoutEvidence ?? 0} ·{' '}
                        Con seguimiento de actividad: {counters?.plansWithFollowUp ?? 0}
                      </p>
                    </div>
                  </div>

                  {metadata?.dimensions ? (
                    <>
                      <h4>Dimensiones oficiales</h4>
                      <Table>
                        <thead>
                          <tr>
                            <th>Dimensión</th><th>%</th><th>Peso</th><th>Numerador</th><th>Denominador</th><th>Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {IP_DIMENSION_KEYS.map((key) => {
                            const dim = metadata.dimensions?.[key];
                            const pct = ipRatioToPercent(dim?.ratio);
                            const subchecks = dim?.subchecks;
                            const detailText = subchecks
                              ? `Subcondiciones: ${subchecks.satisfied}/${subchecks.total}`
                              : key === 'continuity' && dim?.ratio === null
                                ? 'Un solo año — redistribuida (no penaliza)'
                                : '';
                            return (
                              <tr key={key}>
                                <td>{IP_DIMENSION_LABELS[key]}</td>
                                <td>{pct === null ? 'No evaluable' : `${pct}%`}</td>
                                <td>{dim?.weight ?? IP_DIMENSION_WEIGHT_FALLBACK[key]}%</td>
                                <td>{dim?.numerator ?? '—'}</td>
                                <td>{dim?.denominator ?? '—'}</td>
                                <td>{detailText || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                      <p className="muted" style={{ fontSize: '.85rem' }}>
                        Los pesos y ratios provienen del provider oficial del backend. Una dimensión
                        «No evaluable» fue redistribuida por el ComplianceEngine (nunca cuenta como 0).
                      </p>
                    </>
                  ) : (
                    <p>El detalle de dimensiones no está disponible.</p>
                  )}

                  <h4>Hallazgos ({findings.length})</h4>
                  {findings.length === 0 ? (
                    <p>✅ Sin hallazgos para este módulo — el plan de mejoramiento cumple los criterios evaluados.</p>
                  ) : (
                    <ul>
                      {findings.map((f) => {
                        const action = IP_FINDING_ACTIONS[f.id];
                        return (
                          <li key={f.id} style={{ marginBottom: '.5rem' }}>
                            <strong>{f.title}</strong>{' '}
                            <span className={`badge ${f.priority === 'HIGH' ? 'badge--danger' : f.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {f.priority}
                            </span>
                            <div>{f.description}</div>
                            <div className="muted" style={{ fontSize: '.85rem' }}>Estado: {f.status}</div>
                            {action ? (
                              <Button variant="secondary" onClick={() => goToFindingAction(f.id)}>{action.label}</Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* IA 7.1.4 — sección claramente diferenciada del resultado
                      oficial; su fallo no afecta la gestión. */}
                  <ComplianceAIInsight token={token} standardCode="7.1.4" />
                </>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ PLANES ══════════════ */}
          {activeTab === 'planes' && (
            <AdvancedSection
              title="Planes de mejoramiento"
              description={`Registrados: ${plans.length} · Mostrados: ${filteredPlans.length}`}
            >
              {writable ? (
                <div style={{ marginBottom: '.75rem' }}>
                  <Button onClick={() => setFormModal({ mode: 'create' })}>+ Nuevo plan</Button>
                </div>
              ) : null}

              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código, título o período"
                  aria-label="Buscar"
                  style={{ minWidth: 220 }}
                />
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Estado">
                  <option value="">Todos los estados</option>
                  {(Object.keys(IP_PLAN_STATUS_LABELS) as ImprovementPlanStatus[]).map((s) => (
                    <option key={s} value={s}>{IP_PLAN_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
                <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} aria-label="Prioridad">
                  <option value="">Todas las prioridades</option>
                  {(Object.keys(IP_PRIORITY_LABELS) as ImprovementPlanPriority[]).map((p) => (
                    <option key={p} value={p}>{IP_PRIORITY_LABELS[p]}</option>
                  ))}
                </Select>
                <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)} aria-label="Origen">
                  <option value="">Todos los orígenes</option>
                  {(Object.keys(IP_ORIGIN_LABELS) as ImprovementPlanOrigin[]).map((o) => (
                    <option key={o} value={o}>{IP_ORIGIN_LABELS[o]}</option>
                  ))}
                </Select>
                <Select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} aria-label="Año">
                  <option value="">Todos los años</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </Select>
                <Select value={filterOverdue} onChange={(e) => setFilterOverdue(e.target.value)} aria-label="Vencidos">
                  <option value="">Vencimiento: todos</option>
                  <option value="yes">Solo vencidos</option>
                  <option value="no">Sin vencer</option>
                </Select>
              </div>

              <Table>
                <thead>
                  <tr>
                    <th>Código</th><th>Título</th><th>Período</th><th>Origen</th><th>Prioridad</th>
                    <th>Estado</th><th>Actividades</th><th>Progreso</th><th>Vencimiento</th><th>Actualización</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        {plans.length === 0
                          ? 'Aún no hay planes de mejoramiento registrados.'
                          : 'Sin resultados para los filtros aplicados.'}
                      </td>
                    </tr>
                  ) : (
                    filteredPlans.map((p) => {
                      const overdue = isIpPlanOverdue(p);
                      const total = p.activities.length;
                      const completed = p.activities.filter((a) => a.status === 'COMPLETED').length;
                      return (
                        <tr key={p._id}>
                          <td>{p.code}</td>
                          <td style={{ maxWidth: 220 }}>{p.title}</td>
                          <td>{p.period || (typeof p.year === 'number' ? p.year : '—')}</td>
                          <td style={{ maxWidth: 160 }}>{IP_ORIGIN_LABELS[p.origin]}</td>
                          <td><span className={`badge ${IP_PRIORITY_VARIANTS[p.priority]}`}>{IP_PRIORITY_LABELS[p.priority]}</span></td>
                          <td>
                            <span className={`badge ${IP_PLAN_STATUS_VARIANTS[p.status]}`}>{IP_PLAN_STATUS_LABELS[p.status]}</span>
                            {overdue ? <span className="badge badge--danger">VENCIDO</span> : null}
                          </td>
                          <td>{completed}/{total}</td>
                          <td style={{ minWidth: 120 }}>
                            <AdvancedProgressBar
                              value={total > 0 ? Math.round((completed / total) * 100) : 0}
                              showPercentage
                              size="sm"
                            />
                          </td>
                          <td>
                            {formatDate(p.endDate)}
                            {overdue ? ' ⚠️' : ''}
                          </td>
                          <td>{formatDate(p.updatedAt)}</td>
                          <td>
                            <div className="actions">
                              <Button variant="ghost" onClick={() => setDetailPlanId(p._id)}>Ver</Button>
                              {writable && isIpPlanEditable(p.status) ? (
                                <Button variant="secondary" onClick={() => setFormModal({ mode: 'edit', plan: p })}>Editar</Button>
                              ) : null}
                              {writable && IP_PLAN_VALID_TRANSITIONS[p.status].length > 0
                                ? IP_PLAN_VALID_TRANSITIONS[p.status].map((next) => (
                                    <Button
                                      key={next}
                                      variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                      onClick={() => setStatusModal({ plan: p, next })}
                                    >
                                      {IP_PLAN_TRANSITION_LABELS[next] ?? next}
                                    </Button>
                                  ))
                                : null}
                              {writable && p.status === 'DRAFT' ? (
                                <Button variant="danger" onClick={() => setDeleteModal({ plan: p })}>Eliminar</Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* ══════════════ DETALLE ══════════════ */}
      {detailPlanId ? (
        <PlanDetail
          token={token}
          writable={writable}
          planId={detailPlanId}
          revision={detailRevision}
          users={users}
          onError={(msg) => setBanner(`Error: ${msg}`)}
          onClose={() => setDetailPlanId(null)}
          onEdit={() => {
            const p = planById(detailPlanId);
            if (p) setFormModal({ mode: 'edit', plan: p });
          }}
          onStatus={(p, next) => setStatusModal({ plan: p, next })}
          onDelete={(p) => setDeleteModal({ plan: p })}
          onMonitoring={(p) => setMonitoringModal({ plan: p })}
          onActivityCreate={(p) => setActivityModal({ mode: 'create', plan: p })}
          onActivityEdit={(p, a) => setActivityModal({ mode: 'edit', plan: p, activity: a })}
          onEvidence={(p, a) => setEvidenceModal({ plan: p, activity: a })}
          onFollowUp={(p, a) => setFollowUpModal({ plan: p, activity: a })}
        />
      ) : null}

      {/* ══════════════ MODALES ══════════════ */}

      {formModal ? (
        <PlanFormModal
          token={token}
          mode={formModal.mode}
          plan={formModal.mode === 'edit' ? formModal.plan : null}
          users={users}
          onClose={() => setFormModal(null)}
          onSaved={async () => {
            setFormModal(null);
            await Promise.all([loadPlans(), loadCompliance()]);
            setDetailRevision((r) => r + 1);
            setBanner('Plan guardado.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {statusModal ? (
        <Modal
          isOpen
          title={`${IP_PLAN_TRANSITION_LABELS[statusModal.next] ?? statusModal.next} — ${statusModal.plan.title}`}
          onClose={() => setStatusModal(null)}
        >
          <p>
            Cambiará el estado del plan <strong>{statusModal.plan.code}</strong> de{' '}
            <strong>{IP_PLAN_STATUS_LABELS[statusModal.plan.status]}</strong> a{' '}
            <strong>{IP_PLAN_STATUS_LABELS[statusModal.next]}</strong>.
            {statusModal.next === 'COMPLETED'
              ? ' El backend exige que todas las actividades estén completadas/canceladas y exista al menos un seguimiento del plan (monitoring).'
              : statusModal.next === 'CLOSED'
                ? ' El cierre documenta fecha y responsable (server-side); un plan CLOSED queda en solo lectura.'
                : statusModal.next === 'CANCELLED'
                  ? ' Un plan CANCELLED queda en solo lectura y no puede reactivarse.'
                  : ''}
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setStatusModal(null)}>Cancelar</Button>
            <Button
              variant={statusModal.next === 'CANCELLED' ? 'danger' : 'primary'}
              disabled={saving}
              onClick={() => void handleStatusChange()}
            >
              {saving ? 'Aplicando…' : 'Confirmar'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {deleteModal ? (
        <Modal
          isOpen
          title={`Eliminar plan — ${deleteModal.plan.code}`}
          onClose={() => setDeleteModal(null)}
        >
          <p>
            ¿Eliminar definitivamente el plan <strong>{deleteModal.plan.code} — {deleteModal.plan.title}</strong>?
            Solo es posible en estado Borrador; esta acción no puede deshacerse.
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="danger" disabled={saving} onClick={() => void handleDelete()}>
              {saving ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {monitoringModal ? (
        <MonitoringModal
          token={token}
          plan={monitoringModal.plan}
          onClose={() => setMonitoringModal(null)}
          onSaved={async (updated) => {
            setMonitoringModal(null);
            setPlans((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Seguimiento del plan registrado.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {activityModal ? (
        <ActivityFormModal
          token={token}
          mode={activityModal.mode}
          plan={activityModal.plan}
          activity={activityModal.mode === 'edit' ? activityModal.activity : null}
          users={users}
          onClose={() => setActivityModal(null)}
          onSaved={async (updated) => {
            setActivityModal(null);
            setPlans((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Actividad guardada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {evidenceModal ? (
        <ActivityEvidenceModal
          token={token}
          plan={evidenceModal.plan}
          activity={evidenceModal.activity}
          onClose={() => setEvidenceModal(null)}
          onSaved={async (updated) => {
            setEvidenceModal(null);
            setPlans((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Evidencia registrada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {followUpModal ? (
        <ActivityFollowUpModal
          token={token}
          plan={followUpModal.plan}
          activity={followUpModal.activity}
          onClose={() => setFollowUpModal(null)}
          onSaved={async (updated) => {
            setFollowUpModal(null);
            setPlans((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Seguimiento de la actividad registrado.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}
    </AdvancedPageLayout>
  );
}

// ═══════════════════════════ Detalle del plan ═══════════════════════════

function PlanDetail(props: {
  token: string;
  writable: boolean;
  planId: string;
  revision: number;
  users: UserModel[];
  onClose: () => void;
  onEdit: () => void;
  onStatus: (plan: ImprovementPlanModel, next: ImprovementPlanStatus) => void;
  onDelete: (plan: ImprovementPlanModel) => void;
  onMonitoring: (plan: ImprovementPlanModel) => void;
  onActivityCreate: (plan: ImprovementPlanModel) => void;
  onActivityEdit: (plan: ImprovementPlanModel, activity: IpActivityModel) => void;
  onEvidence: (plan: ImprovementPlanModel, activity: IpActivityModel) => void;
  onFollowUp: (plan: ImprovementPlanModel, activity: IpActivityModel) => void;
  onError: (message: string) => void;
}) {
  const { token, writable, planId, revision, users, onClose, onEdit, onStatus, onDelete, onMonitoring, onActivityCreate, onActivityEdit, onEvidence, onFollowUp, onError } = props;
  const [plan, setPlan] = useState<ImprovementPlanModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<IpHistoryModel[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchImprovementPlan(token, planId);
        if (!cancelled) setPlan(detail);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, planId, revision]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchImprovementPlanHistory(token, planId);
      setHistory(rows);
    } catch (err) {
      // Error local del historial: no rompe el detalle principal.
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  };

  /**
   * Transición de estado de actividad desde el detalle. COMPLETED exige
   * executionDate (backend); CANCELLED acepta comentario. Tras la mutación se
   * refresca el plan (el parent también incrementa detailRevision).
   */
  const handleActivityTransition = async (
    activity: IpActivityModel,
    next: ImprovementPlanActivityStatus,
  ): Promise<void> => {
    try {
      const executionDate =
        next === 'COMPLETED'
          ? window.prompt(
              'Fecha de ejecución (requerida para completar — formato YYYY-MM-DD):',
              new Date().toISOString().slice(0, 10),
            )
          : null;
      if (next === 'COMPLETED' && (!executionDate || !isISODate(executionDate))) {
        onError('La fecha de ejecución es obligatoria para completar la actividad.');
        return;
      }
      const comment =
        next === 'CANCELLED'
          ? window.prompt('Motivo de la cancelación (opcional):') ?? undefined
          : undefined;
      await updateImprovementPlanActivityStatus(token, planId, activity.activityId, {
        status: next,
        ...(next === 'COMPLETED' && executionDate ? { executionDate } : {}),
        ...(comment ? { comment } : {}),
      });
      const refreshed = await fetchImprovementPlan(token, planId);
      setPlan(refreshed);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <Modal isOpen title="Detalle del plan de mejoramiento" onClose={onClose}>
        <p>Cargando…</p>
      </Modal>
    );
  }
  if (!plan) {
    return (
      <Modal isOpen title="Detalle del plan de mejoramiento" onClose={onClose}>
        <p>No fue posible cargar el plan.</p>
      </Modal>
    );
  }

  const editable = isIpPlanEditable(plan.status);
  const overdue = isIpPlanOverdue(plan);
  const responsibleName =
    plan.responsibleUserSnapshot ||
    (plan.responsibleUserId
      ? users.find((u) => u._id === plan.responsibleUserId)
        ? `${users.find((u) => u._id === plan.responsibleUserId)!.firstName} ${users.find((u) => u._id === plan.responsibleUserId)!.lastName}`.trim()
        : plan.responsibleUserId
      : '—');

  return (
    <Modal isOpen title={`${plan.code} — ${plan.title}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <div>
          <span className={`badge ${IP_PLAN_STATUS_VARIANTS[plan.status]}`}>{IP_PLAN_STATUS_LABELS[plan.status]}</span>{' '}
          <span className={`badge ${IP_PRIORITY_VARIANTS[plan.priority]}`}>{IP_PRIORITY_LABELS[plan.priority]}</span>{' '}
          {overdue ? <span className="badge badge--danger">VENCIDO</span> : null}
          {!editable ? <span className="badge badge--warning">🔒 Solo lectura</span> : null}
        </div>

        <h4>Información general</h4>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Origen:</strong> {IP_ORIGIN_LABELS[plan.origin]}</p>
            <p style={{ margin: 0 }}><strong>Responsable:</strong> {responsibleName}</p>
            <p style={{ margin: 0 }}><strong>Período:</strong> {plan.period || (typeof plan.year === 'number' ? plan.year : '—')}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Inicio:</strong> {formatDate(plan.startDate)}</p>
            <p style={{ margin: 0 }}><strong>Fin:</strong> {formatDate(plan.endDate)}</p>
            <p style={{ margin: 0 }}><strong>Cierre:</strong> {formatDate(plan.closureDate)}{plan.closedByUserSnapshot ? ` · ${plan.closedByUserSnapshot}` : ''}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Descripción:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{plan.description || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Criterios de priorización:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{plan.prioritizationCriteria || '—'}</p>
            <p style={{ margin: 0 }}><strong>Descripción del origen:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{plan.originDescription || '—'}</p>
            {plan.originReferenceId ? (
              <p style={{ margin: 0 }}><strong>Referencia del origen:</strong> {String(plan.originReferenceId)}</p>
            ) : null}
          </div>
        </div>

        <h4>Objetivos, metas e indicadores</h4>
        {plan.objectives.length === 0 ? (
          <p style={{ margin: 0 }}>Sin objetivos definidos.</p>
        ) : (
          <Table>
            <thead>
              <tr><th>#</th><th>Objetivo</th><th>Meta</th><th>Indicador</th></tr>
            </thead>
            <tbody>
              {plan.objectives.map((o) => (
                <tr key={o.objectiveId ?? o.description}>
                  <td>{o.objectiveId ?? '—'}</td>
                  <td>{o.description}</td>
                  <td>{o.target || '—'}</td>
                  <td>{o.indicator || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <h4>Recursos</h4>
        {plan.resources.length === 0 ? (
          <p style={{ margin: 0 }}>Sin recursos definidos.</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {plan.resources.map((r, i) => (
              <li key={`${r.type}-${i}`}>
                <strong>{IP_RESOURCE_TYPE_LABELS[r.type]}:</strong> {r.description}
                {r.observations ? ` — ${r.observations}` : ''}
              </li>
            ))}
          </ul>
        )}

        <h4>Actividades</h4>
        {plan.activities.length === 0 ? (
          <p style={{ margin: 0 }}>Sin actividades registradas.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>#</th><th>Descripción</th><th>Responsable</th><th>Programada</th><th>Límite</th>
                <th>Estado</th><th>Progreso</th><th>Evidencia</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plan.activities.map((a) => {
                const activityOverdue = isIpActivityOverdue(a);
                const activityEditable = writable && isIpActivityEditable(a.status);
                return (
                  <tr key={a.activityId}>
                    <td>{a.activityId}</td>
                    <td style={{ maxWidth: 200 }}>{a.description}</td>
                    <td>{a.responsibleUserSnapshot || '—'}</td>
                    <td>{formatDate(a.plannedDate)}</td>
                    <td>
                      {formatDate(a.dueDate)}
                      {activityOverdue ? <span className="badge badge--danger">VENCIDA</span> : null}
                    </td>
                    <td>
                      <span className={`badge ${IP_ACTIVITY_STATUS_VARIANTS[a.status]}`}>{IP_ACTIVITY_STATUS_LABELS[a.status]}</span>
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <AdvancedProgressBar
                        value={a.status === 'COMPLETED' ? 100 : a.progress ?? 0}
                        showPercentage
                        size="sm"
                      />
                    </td>
                    <td>{a.evidence ? '✅' : '—'}</td>
                    <td>
                      <div className="actions">
                        {activityEditable ? (
                          <Button variant="secondary" onClick={() => onActivityEdit(plan, a)}>Editar</Button>
                        ) : null}
                        {activityEditable ? (
                          <Button variant="secondary" onClick={() => onEvidence(plan, a)}>Evidencia</Button>
                        ) : null}
                        {activityEditable ? (
                          <Button variant="secondary" onClick={() => onFollowUp(plan, a)}>Seguimiento</Button>
                        ) : null}
                        {writable && activityEditable
                          ? IP_ACTIVITY_VALID_TRANSITIONS[a.status].map((next) => (
                              <Button
                                key={next}
                                variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                onClick={() => void handleActivityTransition(a, next)}
                              >
                                {IP_ACTIVITY_TRANSITION_LABELS[next] ?? next}
                              </Button>
                            ))
                          : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {writable && editable ? (
          <div className="actions">
            <Button variant="secondary" onClick={() => onActivityCreate(plan)}>+ Nueva actividad</Button>
          </div>
        ) : null}

        <h4>Seguimiento del plan (monitoring)</h4>
        {plan.monitoring.length === 0 ? (
          <p style={{ margin: 0 }}>Sin registros de seguimiento del plan.</p>
        ) : (
          <Table>
            <thead>
              <tr><th>#</th><th>Fecha</th><th>Progreso</th><th>Desviaciones</th><th>Acciones de ajuste</th><th>Observaciones</th></tr>
            </thead>
            <tbody>
              {[...plan.monitoring].reverse().map((m) => (
                <tr key={m.monitoringId}>
                  <td>{m.monitoringId}</td>
                  <td>{formatDate(m.date)}</td>
                  <td>{typeof m.progress === 'number' ? `${m.progress}%` : '—'}</td>
                  <td style={{ maxWidth: 180 }}>{m.deviations || '—'}</td>
                  <td style={{ maxWidth: 180 }}>{m.adjustmentActions || '—'}</td>
                  <td style={{ maxWidth: 180 }}>{m.observations || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {writable && editable ? (
          <div className="actions">
            <Button variant="secondary" onClick={() => onMonitoring(plan)}>+ Registrar seguimiento</Button>
          </div>
        ) : null}

        <h4>Evidencias</h4>
        {plan.activities.filter((a) => a.evidence).length === 0 ? (
          <p style={{ margin: 0 }}>Sin evidencias registradas en las actividades.</p>
        ) : (
          <ul style={{ margin: 0 }}>
            {plan.activities.filter((a) => a.evidence).map((a) => (
              <li key={a.activityId}>
                <strong>{a.activityId}:</strong>{' '}
                {a.evidence?.documentSnapshot || a.evidence?.documentId || '—'}
                {a.evidence?.evidenceUrl ? (
                  <> · <a href={a.evidence.evidenceUrl} target="_blank" rel="noreferrer">{a.evidence.evidenceUrl}</a></>
                ) : null}
                {a.evidence?.comment ? ` · ${a.evidence.comment}` : ''}
              </li>
            ))}
          </ul>
        )}

        <h4>Seguimiento de efectividad percibida</h4>
        {plan.activities.filter((a) => a.followUp).length === 0 ? (
          <p style={{ margin: 0 }}>Sin seguimientos de actividad registrados.</p>
        ) : (
          <Table>
            <thead>
              <tr><th>Actividad</th><th>Fecha</th><th>Implementación</th><th>Percepción de efectividad</th><th>Continúa en seguimiento</th><th>Observaciones</th></tr>
            </thead>
            <tbody>
              {plan.activities.filter((a) => a.followUp).map((a) => {
                const fu = a.followUp!;
                return (
                  <tr key={a.activityId}>
                    <td>{a.activityId}</td>
                    <td>{formatDate(fu.followUpDate)}</td>
                    <td>
                      {fu.implementationStatus ? (
                        <span className={`badge ${IP_IMPLEMENTATION_STATUS_VARIANTS[fu.implementationStatus]}`}>
                          {IP_IMPLEMENTATION_STATUS_LABELS[fu.implementationStatus]}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {fu.perceivedEffectiveness ? (
                        <span className={`badge ${IP_PERCEIVED_EFFECTIVENESS_VARIANTS[fu.perceivedEffectiveness]}`}>
                          {IP_PERCEIVED_EFFECTIVENESS_LABELS[fu.perceivedEffectiveness]}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{fu.requiresContinuedFollowUp === true ? 'Sí' : fu.requiresContinuedFollowUp === false ? 'No' : '—'}</td>
                    <td style={{ maxWidth: 180 }}>{fu.observations || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
          La percepción de efectividad es un resultado declarado del seguimiento de la actividad — no es
          una verificación formal de eficacia (esa es la frontera del estándar 7.1.1).
        </p>

        <h4>Cierre</h4>
        {plan.status === 'CLOSED' || plan.status === 'COMPLETED' ? (
          <div className="card">
            <p style={{ margin: 0 }}><strong>Fecha de cierre:</strong> {formatDate(plan.closureDate)}</p>
            <p style={{ margin: 0 }}><strong>Responsable del cierre:</strong> {plan.closedByUserSnapshot || '—'}</p>
            <p style={{ margin: 0 }}><strong>Observaciones de cierre:</strong> {plan.closureObservations || '—'}</p>
          </div>
        ) : (
          <p style={{ margin: 0 }}>
            El plan aún no alcanza la fase de cierre (requiere estado COMPLETED → CLOSED con transiciones válidas).
          </p>
        )}

        {writable ? (
          <div className="actions">
            {editable ? <Button variant="secondary" onClick={onEdit}>Editar</Button> : null}
            {editable ? <Button variant="secondary" onClick={() => onMonitoring(plan)}>Registrar seguimiento</Button> : null}
            {IP_PLAN_VALID_TRANSITIONS[plan.status].map((next) => (
              <Button
                key={next}
                variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                onClick={() => onStatus(plan, next)}
              >
                {IP_PLAN_TRANSITION_LABELS[next] ?? next}
              </Button>
            ))}
            {plan.status === 'DRAFT' ? (
              <Button variant="danger" onClick={() => onDelete(plan)}>Eliminar</Button>
            ) : null}
          </div>
        ) : null}

        <h4>Historial</h4>
        <div>
          {!showHistory ? (
            <Button
              variant="secondary"
              onClick={() => {
                setShowHistory(true);
                void loadHistory();
              }}
            >
              Ver historial
            </Button>
          ) : historyLoading ? (
            <p>Cargando historial…</p>
          ) : history === null || history.length === 0 ? (
            <p>Sin eventos registrados.</p>
          ) : (
            <Table>
              <thead>
                <tr><th>Fecha</th><th>Evento</th><th>Actor</th><th>Actividad</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h._id}>
                    <td>{new Date(h.createdAt).toLocaleString()}</td>
                    <td>{IP_HISTORY_ACTION_LABELS[h.action] ?? h.action}</td>
                    <td>{h.actorSnapshot}</td>
                    <td>{h.activityId || '—'}</td>
                    <td style={{ maxWidth: 240 }}>{historyMessage(h)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}

/**
 * Helper de mensajes de historial (reutilizado por la tabla del detalle).
 * Se mantiene a nivel de módulo para no recrear la función por render.
 */

// ═══════════════════════════ Formulario de plan ═══════════════════════════

type IpObjectiveFormRow = { description: string; target: string; indicator: string; observations: string };
type IpResourceFormRow = { type: ImprovementPlanResourceType; description: string };

type IpPlanFormState = {
  code: string;
  title: string;
  description: string;
  period: string;
  year: string;
  responsibleUserId: string;
  origin: ImprovementPlanOrigin;
  originReferenceId: string;
  originDescription: string;
  priority: ImprovementPlanPriority;
  prioritizationCriteria: string;
  objectives: IpObjectiveFormRow[];
  resources: IpResourceFormRow[];
  startDate: string;
  endDate: string;
};

const emptyObjectiveRow = (): IpObjectiveFormRow => ({ description: '', target: '', indicator: '', observations: '' });

function emptyForm(): IpPlanFormState {
  const currentYear = String(new Date().getFullYear());
  return {
    code: '',
    title: '',
    description: '',
    period: currentYear,
    year: currentYear,
    responsibleUserId: '',
    origin: 'SELF_ASSESSMENT',
    originReferenceId: '',
    originDescription: '',
    priority: 'MEDIUM',
    prioritizationCriteria: '',
    objectives: [],
    resources: [],
    startDate: '',
    endDate: '',
  };
}

/** Edición: precarga SOLO campos actualizables (code nunca se envía en PATCH). */
function formFromPlan(p: ImprovementPlanModel): IpPlanFormState {
  const iso = (v?: string) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  return {
    code: p.code,
    title: p.title,
    description: p.description ?? '',
    period: p.period ?? '',
    year: typeof p.year === 'number' ? String(p.year) : '',
    responsibleUserId: p.responsibleUserId ?? '',
    origin: p.origin,
    originReferenceId: p.originReferenceId ?? '',
    originDescription: p.originDescription ?? '',
    priority: p.priority,
    prioritizationCriteria: p.prioritizationCriteria ?? '',
    objectives: p.objectives.map((o) => ({
      description: o.description,
      target: o.target ?? '',
      indicator: o.indicator ?? '',
      observations: o.observations ?? '',
    })),
    resources: p.resources.map((r) => ({ type: r.type, description: r.description })),
    startDate: iso(p.startDate),
    endDate: iso(p.endDate),
  };
}

/**
 * Formulario de creación/edición (PATCH de contenido). NUNCA envía companyId,
 * status, activities, monitoring, closure, activityId ni objectiveId: el
 * backend los resuelve server-side (forbidNonWhitelisted) y el formulario ni
 * los expone.
 * Las validaciones aquí son UX; las de seguridad y máquina de estados viven en
 * el backend.
 */
function PlanFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  plan: ImprovementPlanModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (saved: ImprovementPlanModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, mode, plan, users, onClose, onSaved, onError } = props;
  const [form, setForm] = useState<IpPlanFormState>(plan ? formFromPlan(plan) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof IpPlanFormState>(key: K, value: IpPlanFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setObjectiveRow = (index: number, patch: Partial<IpObjectiveFormRow>) =>
    setForm((prev) => ({
      ...prev,
      objectives: prev.objectives.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const setResourceRow = (index: number, patch: Partial<IpResourceFormRow>) =>
    setForm((prev) => ({
      ...prev,
      resources: prev.resources.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título del plan es requerido.';
    if (!isISODate(form.startDate)) return 'La fecha de inicio es inválida o está vacía.';
    if (!isISODate(form.endDate)) return 'La fecha de fin es inválida o está vacía.';
    if (Date.parse(form.startDate) > Date.parse(form.endDate)) {
      return 'La fecha de inicio no puede ser posterior a la fecha de fin.';
    }
    if (form.year && (Number(form.year) < 2000 || Number(form.year) > 2100)) {
      return 'El año debe estar entre 2000 y 2100.';
    }
    if (form.originReferenceId.trim() && form.originReferenceId.trim().length < 24) {
      return 'La referencia del origen debe ser un identificador válido (o dejarla vacía).';
    }
    for (const [i, o] of form.objectives.entries()) {
      if (!o.description.trim()) return `El objetivo #${i + 1} requiere descripción.`;
    }
    for (const [i, r] of form.resources.entries()) {
      if (!r.description.trim()) return `El recurso #${i + 1} requiere descripción.`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const validation = validate();
    if (validation) {
      setFormError(validation);
      return;
    }
    setSaving(true);
    setFormError(null);
    const objectivePayload = form.objectives
      .filter((o) => o.description.trim())
      .map((o) => ({
        description: o.description.trim(),
        ...(o.target.trim() ? { target: o.target.trim() } : {}),
        ...(o.indicator.trim() ? { indicator: o.indicator.trim() } : {}),
        ...(o.observations.trim() ? { observations: o.observations.trim() } : {}),
      }));
    const resourcePayload = form.resources
      .filter((r) => r.description.trim())
      .map((r) => ({
        type: r.type,
        description: r.description.trim(),
      }));
    try {
      if (mode === 'create') {
        const payload: CreateImprovementPlanPayload = {
          code: form.code.trim(),
          title: form.title.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          ...(form.period.trim() ? { period: form.period.trim() } : {}),
          ...(form.year ? { year: Number(form.year) } : {}),
          ...(form.responsibleUserId ? { responsibleUserId: form.responsibleUserId } : {}),
          origin: form.origin,
          ...(form.originReferenceId.trim() ? { originReferenceId: form.originReferenceId.trim() } : {}),
          ...(form.originDescription.trim() ? { originDescription: form.originDescription.trim() } : {}),
          ...(form.priority ? { priority: form.priority } : {}),
          ...(form.prioritizationCriteria.trim() ? { prioritizationCriteria: form.prioritizationCriteria.trim() } : {}),
          ...(objectivePayload.length > 0 ? { objectives: objectivePayload } : {}),
          ...(resourcePayload.length > 0 ? { resources: resourcePayload } : {}),
          startDate: form.startDate,
          endDate: form.endDate,
        };
        const saved = await createImprovementPlan(token, payload);
        await onSaved(saved);
      } else {
        const payload = {
          title: form.title.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : { description: undefined }),
          ...(form.period.trim() ? { period: form.period.trim() } : { period: undefined }),
          ...(form.year ? { year: Number(form.year) } : { year: undefined }),
          ...(form.responsibleUserId ? { responsibleUserId: form.responsibleUserId } : { responsibleUserId: undefined }),
          origin: form.origin,
          ...(form.originReferenceId.trim() ? { originReferenceId: form.originReferenceId.trim() } : { originReferenceId: undefined }),
          ...(form.originDescription.trim() ? { originDescription: form.originDescription.trim() } : { originDescription: undefined }),
          ...(form.priority ? { priority: form.priority } : {}),
          ...(form.prioritizationCriteria.trim() ? { prioritizationCriteria: form.prioritizationCriteria.trim() } : { prioritizationCriteria: undefined }),
          objectives: objectivePayload,
          resources: resourcePayload,
          startDate: form.startDate,
          endDate: form.endDate,
        };
        const saved = await updateImprovementPlan(token, plan!._id, payload);
        await onSaved(saved);
      }
    } catch (err) {
      const msg = errorMessage(err);
      setFormError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      title={mode === 'create' ? 'Nuevo plan de mejoramiento' : 'Editar plan de mejoramiento'}
      onClose={onClose}
    >
      <div className="form-grid">
        <h4 style={{ margin: 0 }}>Identificación</h4>
        {mode === 'create' ? (
          <>
            <label htmlFor="ip-code">Código *</label>
            <Input id="ip-code" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="Ej: PM-2026-01" maxLength={100} required />
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Código: {form.code} (no editable)</p>
        )}
        <label htmlFor="ip-title">Título *</label>
        <Input id="ip-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={300} required />
        <label htmlFor="ip-desc">Descripción</label>
        <textarea id="ip-desc" className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={3000} />
        <label htmlFor="ip-period">Período</label>
        <Input id="ip-period" value={form.period} onChange={(e) => set('period', e.target.value)} maxLength={100} placeholder="Ej: 2026 o 2026-2027" />
        <label htmlFor="ip-year">Año</label>
        <Input id="ip-year" type="number" min={2000} max={2100} value={form.year} onChange={(e) => set('year', e.target.value)} />

        <h4 style={{ margin: 0 }}>Origen</h4>
        <label htmlFor="ip-origin">Origen *</label>
        <Select id="ip-origin" value={form.origin} onChange={(e) => set('origin', e.target.value as ImprovementPlanOrigin)} required>
          {(Object.keys(IP_ORIGIN_LABELS) as ImprovementPlanOrigin[]).map((o) => (
            <option key={o} value={o}>{IP_ORIGIN_LABELS[o]}</option>
          ))}
        </Select>
        <label htmlFor="ip-originref">Referencia del origen (opcional)</label>
        <Input id="ip-originref" value={form.originReferenceId} onChange={(e) => set('originReferenceId', e.target.value)} placeholder="ObjectId del documento origen (trazabilidad declarativa)" />
        <label htmlFor="ip-originDesc">Descripción del origen</label>
        <textarea id="ip-originDesc" className="input" rows={2} value={form.originDescription} onChange={(e) => set('originDescription', e.target.value)} maxLength={2000} />

        <h4 style={{ margin: 0 }}>Priorización</h4>
        <label htmlFor="ip-priority">Prioridad</label>
        <Select id="ip-priority" value={form.priority} onChange={(e) => set('priority', e.target.value as ImprovementPlanPriority)}>
          {(Object.keys(IP_PRIORITY_LABELS) as ImprovementPlanPriority[]).map((p) => (
            <option key={p} value={p}>{IP_PRIORITY_LABELS[p]}</option>
          ))}
        </Select>
        <label htmlFor="ip-criteria">Criterios de priorización</label>
        <textarea id="ip-criteria" className="input" rows={2} value={form.prioritizationCriteria} onChange={(e) => set('prioritizationCriteria', e.target.value)} maxLength={2000} />

        <h4 style={{ margin: 0 }}>Responsable y fechas</h4>
        <label htmlFor="ip-responsible">Responsable</label>
        <Select id="ip-responsible" value={form.responsibleUserId} onChange={(e) => set('responsibleUserId', e.target.value)}>
          <option value="">Seleccione el responsable</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
        <label htmlFor="ip-start">Fecha de inicio *</label>
        <Input id="ip-start" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} required />
        <label htmlFor="ip-end">Fecha de fin *</label>
        <Input id="ip-end" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} required />

        <h4 style={{ margin: 0 }}>Objetivos (meta e indicador)</h4>
        {form.objectives.map((row, index) => (
          <div key={index} className="card" style={{ padding: '.5rem' }}>
            <Input
              value={row.description}
              onChange={(e) => setObjectiveRow(index, { description: e.target.value })}
              placeholder={`Descripción del objetivo #${index + 1} *`}
              maxLength={1000}
            />
            <Input value={row.target} onChange={(e) => setObjectiveRow(index, { target: e.target.value })} placeholder="Meta (valor esperado / fecha)" maxLength={500} />
            <Input value={row.indicator} onChange={(e) => setObjectiveRow(index, { indicator: e.target.value })} placeholder="Indicador de seguimiento" maxLength={300} />
            <div className="actions">
              <Input
                value={row.observations}
                onChange={(e) => setObjectiveRow(index, { observations: e.target.value })}
                placeholder="Observaciones"
                maxLength={1000}
              />
              <Button type="button" variant="danger" onClick={() => set('objectives', form.objectives.filter((_, i) => i !== index))}>✕</Button>
            </div>
          </div>
        ))}
        <div>
          <Button type="button" variant="secondary" onClick={() => set('objectives', [...form.objectives, emptyObjectiveRow()])}>
            + Agregar objetivo
          </Button>
        </div>

        <h4 style={{ margin: 0 }}>Recursos</h4>
        {form.resources.map((row, index) => (
          <div key={index} className="actions">
            <Select
              value={row.type}
              onChange={(e) => setResourceRow(index, { type: e.target.value as ImprovementPlanResourceType })}
              aria-label={`Tipo de recurso #${index + 1}`}
            >
              {(Object.keys(IP_RESOURCE_TYPE_LABELS) as ImprovementPlanResourceType[]).map((t) => (
                <option key={t} value={t}>{IP_RESOURCE_TYPE_LABELS[t]}</option>
              ))}
            </Select>
            <Input
              value={row.description}
              onChange={(e) => setResourceRow(index, { description: e.target.value })}
              placeholder={`Descripción del recurso #${index + 1} *`}
              maxLength={500}
            />
            <Button type="button" variant="danger" onClick={() => set('resources', form.resources.filter((_, i) => i !== index))}>✕</Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => set('resources', [...form.resources, { type: 'HUMAN' as ImprovementPlanResourceType, description: '' }])}
          >
            + Agregar recurso
          </Button>
        </div>

        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Guardando…' : mode === 'create' ? 'Crear plan' : 'Guardar cambios'}
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Actividad (crear/editar) ═══════════════════════════

function ActivityFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  plan: ImprovementPlanModel;
  activity: IpActivityModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (updated: ImprovementPlanModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, mode, plan, activity, users, onClose, onSaved, onError } = props;
  const [description, setDescription] = useState(activity?.description ?? '');
  const [responsibleUserId, setResponsibleUserId] = useState(activity?.responsibleUserId ?? '');
  const [plannedDate, setPlannedDate] = useState(activity?.plannedDate ? new Date(activity.plannedDate).toISOString().slice(0, 10) : '');
  const [dueDate, setDueDate] = useState(activity?.dueDate ? new Date(activity.dueDate).toISOString().slice(0, 10) : '');
  const [progress, setProgress] = useState<string>(activity?.progress !== undefined && activity.status !== 'COMPLETED' ? String(activity.progress) : '0');
  const [observations, setObservations] = useState(activity?.observations ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!description.trim()) return 'La descripción de la actividad es requerida.';
    if (plannedDate && !isISODate(plannedDate)) return 'La fecha programada es inválida.';
    if (dueDate && !isISODate(dueDate)) return 'La fecha límite es inválida.';
    if (plannedDate && dueDate && Date.parse(plannedDate) > Date.parse(dueDate)) {
      return 'La fecha programada no puede ser posterior a la fecha límite.';
    }
    const n = Number(progress);
    if (Number.isNaN(n) || n < 0 || n > 100) return 'El progreso debe estar entre 0 y 100.';
    return null;
  };

  const handleSubmit = async () => {
    const validation = validate();
    if (validation) {
      setFormError(validation);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (mode === 'create') {
        const payload: CreatePlanActivityPayload = {
          description: description.trim(),
          ...(responsibleUserId ? { responsibleUserId } : {}),
          ...(plannedDate ? { plannedDate } : {}),
          ...(dueDate ? { dueDate } : {}),
        };
        const updated = await createImprovementPlanActivity(token, plan._id, payload);
        await onSaved(updated);
      } else {
        const payload: UpdatePlanActivityPayload = {
          description: description.trim(),
          responsibleUserId: responsibleUserId || undefined,
          plannedDate: plannedDate || undefined,
          dueDate: dueDate || undefined,
          progress: Number(progress),
          observations: observations.trim() ? observations.trim() : undefined,
        };
        const updated = await updateImprovementPlanActivity(token, plan._id, activity!.activityId, payload);
        await onSaved(updated);
      }
    } catch (err) {
      const msg = errorMessage(err);
      setFormError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={mode === 'create' ? `Nueva actividad — ${plan.code}` : `Editar actividad ${activity?.activityId} — ${plan.code}`} onClose={onClose}>
      <div className="form-grid">
        <label htmlFor="ip-act-desc">Descripción *</label>
        <textarea id="ip-act-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} required />
        <label htmlFor="ip-act-resp">Responsable</label>
        <Select id="ip-act-resp" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
          <option value="">Seleccione el responsable</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
        <label htmlFor="ip-act-planned">Fecha programada</label>
        <Input id="ip-act-planned" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
        <label htmlFor="ip-act-due">Fecha límite</label>
        <Input id="ip-act-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        {mode === 'edit' ? (
          <>
            <label htmlFor="ip-act-progress">Progreso (0–100)</label>
            <Input id="ip-act-progress" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
            <label htmlFor="ip-act-obs">Observaciones</label>
            <textarea id="ip-act-obs" className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={2000} />
          </>
        ) : null}
        {mode === 'edit' && activity?.status === 'COMPLETED' ? (
          <p className="muted" style={{ margin: 0 }}>
            Actividad completada: el backend la muestra al 100% y no admite edición.
          </p>
        ) : null}
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Guardando…' : mode === 'create' ? 'Crear actividad' : 'Guardar cambios'}
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Evidencia de actividad ═══════════════════════════

function ActivityEvidenceModal(props: {
  token: string;
  plan: ImprovementPlanModel;
  activity: IpActivityModel;
  onClose: () => void;
  onSaved: (updated: ImprovementPlanModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, plan, activity, onClose, onSaved, onError } = props;
  const [documentId, setDocumentId] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!documentId.trim() && !evidenceUrl.trim()) {
      setFormError('Registre un documentId (Gestión documental) o una URL de evidencia.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await addImprovementPlanActivityEvidence(token, plan._id, activity.activityId, {
        ...(documentId.trim() ? { documentId: documentId.trim() } : {}),
        ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      await onSaved(updated);
    } catch (err) {
      const msg = errorMessage(err);
      setFormError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={`Evidencia — ${activity.activityId} (${plan.code})`} onClose={onClose}>
      {activity.evidence ? (
        <p className="muted">
          Evidencia registrada: {activity.evidence.documentSnapshot || activity.evidence.evidenceUrl || '—'}.
          Al registrar nuevamente se reemplaza (comportamiento server-side).
        </p>
      ) : null}
      <div className="form-grid">
        <label htmlFor="ip-ev-doc">documentId (Gestión documental, opcional)</label>
        <Input id="ip-ev-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="ObjectId del documento" />
        <label htmlFor="ip-ev-url">URL de evidencia (opcional)</label>
        <Input id="ip-ev-url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://…" />
        <label htmlFor="ip-ev-comment">Comentario</label>
        <textarea id="ip-ev-comment" className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar evidencia'}</Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Follow-up de actividad ═══════════════════════════

function ActivityFollowUpModal(props: {
  token: string;
  plan: ImprovementPlanModel;
  activity: IpActivityModel;
  onClose: () => void;
  onSaved: (updated: ImprovementPlanModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, plan, activity, onClose, onSaved, onError } = props;
  const [followUpDate, setFollowUpDate] = useState('');
  const [implementationStatus, setImplementationStatus] = useState<ImprovementPlanImplementationStatus | ''>('ON_TRACK');
  const [perceivedEffectiveness, setPerceivedEffectiveness] = useState<ImprovementPlanPerceivedEffectiveness | ''>('');
  const [requiresContinuedFollowUp, setRequiresContinuedFollowUp] = useState<boolean>(true);
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (followUpDate && !isISODate(followUpDate)) {
      setFormError('La fecha de seguimiento es inválida.');
      return;
    }
    if (followUpDate && Date.parse(followUpDate) > Date.now()) {
      setFormError('La fecha de seguimiento no puede ser futura.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await registerImprovementPlanActivityFollowUp(token, plan._id, activity.activityId, {
        ...(followUpDate ? { followUpDate } : {}),
        ...(observations.trim() ? { observations: observations.trim() } : {}),
        ...(implementationStatus ? { implementationStatus } : {}),
        ...(perceivedEffectiveness ? { perceivedEffectiveness } : {}),
        requiresContinuedFollowUp,
      });
      await onSaved(updated);
    } catch (err) {
      const msg = errorMessage(err);
      setFormError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={`Registrar seguimiento — ${activity.activityId} (${plan.code})`} onClose={onClose}>
      <p className="muted">
        El seguimiento documenta la implementación y la percepción de efectividad de la actividad
        (resultado declarado). No es una verificación formal de eficacia — esa es la frontera del estándar 7.1.1.
      </p>
      <div className="form-grid">
        <label htmlFor="ip-fu-date">Fecha de seguimiento (opcional — default: hoy)</label>
        <Input id="ip-fu-date" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        <label htmlFor="ip-fu-impl">Estado de implementación</label>
        <Select id="ip-fu-impl" value={implementationStatus} onChange={(e) => setImplementationStatus(e.target.value as ImprovementPlanImplementationStatus | '')}>
          <option value="">Sin estado</option>
          {(Object.keys(IP_IMPLEMENTATION_STATUS_LABELS) as ImprovementPlanImplementationStatus[]).map((s) => (
            <option key={s} value={s}>{IP_IMPLEMENTATION_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <label htmlFor="ip-fu-eff">Percepción de efectividad</label>
        <Select id="ip-fu-eff" value={perceivedEffectiveness} onChange={(e) => setPerceivedEffectiveness(e.target.value as ImprovementPlanPerceivedEffectiveness | '')}>
          <option value="">Sin concluir</option>
          {(Object.keys(IP_PERCEIVED_EFFECTIVENESS_LABELS) as ImprovementPlanPerceivedEffectiveness[]).map((r) => (
            <option key={r} value={r}>{IP_PERCEIVED_EFFECTIVENESS_LABELS[r]}</option>
          ))}
        </Select>
        <label htmlFor="ip-fu-continued">¿Requiere seguimiento adicional?</label>
        <Select id="ip-fu-continued" value={requiresContinuedFollowUp ? 'yes' : 'no'} onChange={(e) => setRequiresContinuedFollowUp(e.target.value === 'yes')}>
          <option value="yes">Sí — mantener en seguimiento</option>
          <option value="no">No — seguimiento concluido</option>
        </Select>
        <label htmlFor="ip-fu-obs">Observaciones</label>
        <textarea id="ip-fu-obs" className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={2000} />
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar seguimiento'}</Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Monitoring del plan ═══════════════════════════

function MonitoringModal(props: {
  token: string;
  plan: ImprovementPlanModel;
  onClose: () => void;
  onSaved: (updated: ImprovementPlanModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, plan, onClose, onSaved, onError } = props;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [progress, setProgress] = useState('0');
  const [deviations, setDeviations] = useState('');
  const [adjustmentActions, setAdjustmentActions] = useState('');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isISODate(date)) {
      setFormError('La fecha del seguimiento es inválida.');
      return;
    }
    if (Date.parse(date) > Date.now()) {
      setFormError('La fecha del seguimiento no puede ser futura.');
      return;
    }
    const n = Number(progress);
    if (progress !== '' && (Number.isNaN(n) || n < 0 || n > 100)) {
      setFormError('El progreso debe estar entre 0 y 100.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await addPlanMonitoring(token, plan._id, {
        date,
        ...(progress !== '' ? { progress: n } : {}),
        ...(deviations.trim() ? { deviations: deviations.trim() } : {}),
        ...(adjustmentActions.trim() ? { adjustmentActions: adjustmentActions.trim() } : {}),
        ...(observations.trim() ? { observations: observations.trim() } : {}),
      });
      await onSaved(updated);
    } catch (err) {
      const msg = errorMessage(err);
      setFormError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={`Registrar seguimiento del plan — ${plan.code}`} onClose={onClose}>
      <p className="muted">
        El seguimiento periódico del plan registra el avance global, las desviaciones detectadas y las
        acciones de ajuste. Es independiente del seguimiento de cada actividad.
      </p>
      <div className="form-grid">
        <label htmlFor="ip-mon-date">Fecha del seguimiento *</label>
        <Input id="ip-mon-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <label htmlFor="ip-mon-progress">Progreso global del plan (0–100)</label>
        <Input id="ip-mon-progress" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
        <label htmlFor="ip-mon-dev">Desviaciones detectadas</label>
        <textarea id="ip-mon-dev" className="input" rows={2} value={deviations} onChange={(e) => setDeviations(e.target.value)} maxLength={2000} />
        <label htmlFor="ip-mon-adj">Acciones de ajuste</label>
        <textarea id="ip-mon-adj" className="input" rows={2} value={adjustmentActions} onChange={(e) => setAdjustmentActions(e.target.value)} maxLength={2000} />
        <label htmlFor="ip-mon-obs">Observaciones</label>
        <textarea id="ip-mon-obs" className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={1000} />
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar seguimiento'}</Button>
      </div>
    </Modal>
  );
}
