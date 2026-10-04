import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type CopasstAuditPlanningModel,
  type CopasstAuditPlanningStatus,
  type AuditPlanningItemStatus,
  type CopasstPlannedAuditItemModel,
  type CopasstAuditPlanningHistoryModel,
  type CreateCopasstAuditPlanningPayload,
  type CreatePlannedAuditPayload,
  type CopasstParticipationPayload,
  type UserModel,
  type CopasstPeriodModel,
  fetchCopasstAuditPlannings,
  fetchCopasstAuditPlanning,
  createCopasstAuditPlanning,
  updateCopasstAuditPlanning,
  updateCopasstAuditPlanningStatus,
  addCopasstAuditPlanningItem,
  updateCopasstAuditPlanningItem,
  updateCopasstAuditPlanningItemStatus,
  fetchCopasstAuditPlanningHistory,
  fetchCopasstCurrent,
  fetchAdmins,
  fetchMembers,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  isCopasstAuditPlanningComplianceMetadataV1,
  copasstPlanningRatioToPercent,
  COPASST_PLANNING_DIMENSION_KEYS,
  COPASST_PLANNING_DIMENSION_LABELS,
  COPASST_PLANNING_DIMENSION_WEIGHT_FALLBACK,
  COPASST_PLANNING_STATUS_LABELS,
  PLANNING_ITEM_STATUS_LABELS,
  COPASST_PLANNING_VALID_TRANSITIONS,
  PLANNING_ITEM_VALID_TRANSITIONS,
  COPASST_PLANNING_TRANSITION_LABELS,
  COPASST_PLANNING_HISTORY_ACTION_LABELS,
  type CopasstAuditPlanningComplianceMetadataV1,
} from '../types/copasst-audit-planning';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
} from '../components/advanced-layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Table } from '../components/ui/Table';
// E4 (6.1.4): IA complementaria — interpreta el resultado oficial; si falla,
// el componente no bloquea la página (fallback interno tolerante).
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';

/**
 * E3 (6.1.4) — Gestión Avanzada de Planificación de auditorías COPASST.
 *
 * REGLA DE SCORE: el frontend NO calcula el cumplimiento. Porcentaje, estado,
 * nivel y metadata dimensional provienen exclusivamente de
 * GET /compliance-engine/overview (module === 'copasst-audit-planning',
 * dimensions:v1 — provider oficial E2). `copasstPlanningRatioToPercent` es
 * solo presentación visual.
 *
 * Roles (E1): lectura owner/admin/manager; sin acceso member; escritura
 * owner/admin (el backend es la autoridad — aquí solo se ocultan acciones).
 * Transiciones de estado: el backend valida
 * (COPASST_AUDIT_PLANNING_VALID_TRANSITIONS); el frontend solo ofrece las
 * opciones válidas por estado y muestra el error backend si la transición
 * es rechazada. Estados e items usan los endpoints dedicados /status.
 *
 * Frontera 6.1.2 ↔ 6.1.4: `annualAuditId` en items es referencia DECLARATIVA
 * (trazabilidad); nunca habilita edición de auditorías (6.1.2) ni depende
 * de ellas para puntuar.
 */

interface CopasstAuditPlanningPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: '📋' },
  { id: 'planificaciones', label: 'Planificaciones', icon: '🗂️' },
];

const STATUS_VARIANTS: Record<CopasstAuditPlanningStatus, string> = {
  DRAFT: 'badge--info',
  PLANNED: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

const ITEM_STATUS_VARIANTS: Record<AuditPlanningItemStatus, string> = {
  PLANNED: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

/** Acción mínima por finding oficial (IDs de copasst-audit-planning-scoring.ts). */
const FINDING_ACTION: Record<string, { tab: string; label: string }> = {
  'copasst-audit-planning-no-data': { tab: 'planificaciones', label: 'Crear planificación' },
  'copasst-audit-planning-no-evaluable-plannings': { tab: 'planificaciones', label: 'Ir a Planificaciones' },
  'copasst-audit-planning-completeness-incomplete': { tab: 'planificaciones', label: 'Completar planificación' },
  'copasst-audit-planning-schedule-incomplete': { tab: 'planificaciones', label: 'Formalizar cronograma' },
  'copasst-audit-planning-copasst-participation-incomplete': { tab: 'planificaciones', label: 'Documentar participación' },
  'copasst-audit-planning-traceability-incomplete': { tab: 'planificaciones', label: 'Mejorar trazabilidad' },
  'copasst-audit-planning-items-without-date': { tab: 'planificaciones', label: 'Asignar fechas' },
  'copasst-audit-planning-overdue-items': { tab: 'planificaciones', label: 'Reprogramar vencidas' },
  'copasst-audit-planning-copasst-period-ref-missing': { tab: 'planificaciones', label: 'Referenciar período' },
  'copasst-audit-planning-history-limited': { tab: 'resumen', label: 'Ver cumplimiento' },
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Solo lectura de fecha (input date emite YYYY-MM-DD, aceptado por IsDateString). */
function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function canWrite(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Vencimiento DERIVADO en presentación (patrón FASE 9): un item planificado
 * está vencido si no está en estado terminal y su fecha ya pasó.
 * NUNCA se envía al backend (overdueItems lo calcula el scorer oficial).
 */
function isItemOverdue(item: CopasstPlannedAuditItemModel): boolean {
  if (item.status === 'COMPLETED' || item.status === 'CANCELLED') return false;
  if (!item.plannedDate) return false;
  const due = new Date(item.plannedDate).getTime();
  return !Number.isNaN(due) && due < Date.now();
}

export function CopasstAuditPlanningPage({ token, role }: CopasstAuditPlanningPageProps) {
  const writable = canWrite(role);
  const [activeTab, setActiveTab] = useState<string>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Datos
  const [plannings, setPlannings] = useState<CopasstAuditPlanningModel[]>([]);
  const [users, setUsers] = useState<UserModel[]>([]);
  const [copasstPeriod, setCopasstPeriod] = useState<CopasstPeriodModel | null>(null);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<CopasstAuditPlanningComplianceMetadataV1 | null>(null);

  // Filtros del tab Planificaciones
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Estado de guardado
  const [saving, setSaving] = useState(false);
  /** Se incrementa con cada mutación → el detalle abierto se refresca. */
  const [detailRevision, setDetailRevision] = useState(0);

  // Modales
  const [formModal, setFormModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; planning: CopasstAuditPlanningModel }
    | null
  >(null);
  const [detailPlanningId, setDetailPlanningId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<
    | { planning: CopasstAuditPlanningModel; next: CopasstAuditPlanningStatus }
    | null
  >(null);
  const [itemModal, setItemModal] = useState<
    | { planningId: string; mode: 'create' }
    | { planningId: string; mode: 'edit'; item: CopasstPlannedAuditItemModel }
    | null
  >(null);
  const [itemStatusModal, setItemStatusModal] = useState<
    | { planningId: string; item: CopasstPlannedAuditItemModel; next: AuditPlanningItemStatus }
    | null
  >(null);

  // ─── Carga (tolerante: compliance falla ≠ romper la gestión) ────────────
  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === 'copasst-audit-planning') ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isCopasstAuditPlanningComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === 'copasst-audit-planning'));
  }, [token]);

  const loadPlannings = useCallback(async () => {
    setPlannings(await fetchCopasstAuditPlannings(token).catch(() => []));
  }, [token]);

  const loadUsers = useCallback(async () => {
    // El backend del dominio solo expone GET a owner/admin/manager: la carga
    // de usuarios es tolerante (manager la usa solo para mostrar snapshots).
    const [admins, members] = await Promise.all([
      fetchAdmins(token).catch(() => [] as UserModel[]),
      fetchMembers(token).catch(() => [] as UserModel[]),
    ]);
    setUsers([...admins, ...members]);
  }, [token]);

  const loadCopasstPeriod = useCallback(async () => {
    setCopasstPeriod(await fetchCopasstCurrent(token).catch(() => null));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list, overview] = await Promise.all([
          fetchCopasstAuditPlannings(token),
          getOverview(token, '').catch(() => null),
        ]);
        if (cancelled) return;
        setPlannings(list);
        const moduleCompliance =
          overview?.moduleCompliance?.find((m) => m.module === 'copasst-audit-planning') ?? null;
        setCompliance(moduleCompliance);
        setMetadata(
          moduleCompliance && isCopasstAuditPlanningComplianceMetadataV1(moduleCompliance.metadata)
            ? moduleCompliance.metadata
            : null,
        );
        setFindings((overview?.findings ?? []).filter((f) => f.module === 'copasst-audit-planning'));
        // Cargas secundarias (su fallo no rompe la página).
        void loadUsers();
        void loadCopasstPeriod();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadUsers, loadCopasstPeriod]);

  // ─── Derivados de presentación ──────────────────────────────────────────
  const percentage = compliance?.compliance ?? null;
  const status = compliance?.status ?? null;
  const counters = metadata?.counters ?? null;

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      map.set(u._id, `${u.firstName} ${u.lastName}`.trim() || u.email);
    }
    return map;
  }, [users]);

  const displayResponsible = useCallback(
    (p: CopasstAuditPlanningModel) =>
      p.responsibleUserSnapshot ||
      (p.responsibleUserId ? userNameById.get(p.responsibleUserId) ?? p.responsibleUserId : '') ||
      '—',
    [userNameById],
  );

  const filteredPlannings = useMemo(() => {
    return plannings.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const code = (p.planningCode ?? '').toLowerCase();
        const title = p.title.toLowerCase();
        if (!code.includes(q) && !title.includes(q)) return false;
      }
      return true;
    });
  }, [plannings, filterStatus, search]);

  // Rango de fechas de la planificación vigente según la metadata oficial del
  // provider (latestPlanning); fallback a '—' cuando no existe.
  const latestPeriodLabel = metadata?.latestPlanning
    ? `${formatDate(metadata.latestPlanning.startDate ?? undefined)} → ${formatDate(metadata.latestPlanning.endDate ?? undefined)}`
    : '—';

  const statusBadge = loading
    ? <span className="badge badge--info">⏳ Cargando…</span>
    : compliance === null
      ? <span className="badge badge--warning">Cumplimiento no disponible</span>
      : status === 'NO_DATA'
        ? <span className="badge badge--warning">Sin datos evaluables</span>
        : status === 'TARGET_MET'
          ? <span className="badge badge--success">✅ Meta alcanzada</span>
          : <span className="badge badge--danger">Meta no alcanzada</span>;

  // ─── Acciones: transición de estado ─────────────────────────────────────
  const handleStatusChange = async () => {
    if (!statusModal) return;
    setSaving(true);
    try {
      await updateCopasstAuditPlanningStatus(token, statusModal.planning._id, { status: statusModal.next });
      const next = statusModal.next;
      setStatusModal(null);
      await Promise.all([loadPlannings(), loadCompliance()]);
      setDetailRevision((r) => r + 1);
      setBanner(`Estado actualizado a ${COPASST_PLANNING_STATUS_LABELS[next]}.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleItemStatusChange = async () => {
    if (!itemStatusModal) return;
    setSaving(true);
    try {
      const updated = await updateCopasstAuditPlanningItemStatus(
        token,
        itemStatusModal.planningId,
        itemStatusModal.item._id,
        { status: itemStatusModal.next },
      );
      setItemStatusModal(null);
      setPlannings((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      void loadCompliance();
      setDetailRevision((r) => r + 1);
      setBanner(`Estado de la auditoría planificada actualizado a ${PLANNING_ITEM_STATUS_LABELS[itemStatusModal.next]}.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const goToFindingAction = (findingId: string) => {
    const action = FINDING_ACTION[findingId];
    if (action) setActiveTab(action.tab);
  };

  const planningById = useCallback((id: string) => plannings.find((p) => p._id === id) ?? null, [plannings]);

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/check"
        backLabel="← Volver a Verificación"
        moduleCode="6.1.4"
        moduleTitle="Planificación de auditorías COPASST"
        description="Planifique, programe y haga seguimiento a las auditorías y verificaciones con participación del COPASST."
        statusBadge={statusBadge}
        actions={writable
          ? [{ label: '🔄 Recargar', onClick: () => { void loadPlannings(); void loadCompliance(); }, variant: 'secondary' as const }]
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
            label: 'Cumplimiento oficial 6.1.4',
            value: loading ? '…' : status === 'NO_DATA' ? 'Sin datos' : percentage === null ? 'N/D' : `${percentage}%`,
            variant: status === 'TARGET_MET' ? 'success' : status === 'NO_DATA' || compliance === null ? 'warning' : 'danger',
          },
          { label: 'Planificaciones', value: counters?.planningsTotal ?? plannings.length, variant: 'info' },
          { label: 'Auditorías planificadas', value: counters?.itemsTotal ?? plannings.reduce((s, p) => s + p.items.length, 0), variant: 'info' },
          { label: 'Items vencidos', value: counters?.overdueItems ?? 0, variant: 'danger' },
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
              title="Cumplimiento oficial — 6.1.4"
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
                          ? metadata?.noDataReason === 'no-plannings'
                            ? 'Sin datos evaluables — todavía no existen planificaciones de auditorías COPASST registradas.'
                            : 'Sin planificaciones evaluables — existen registros, pero ninguno cumple las condiciones mínimas (período válido, título y al menos una auditoría planificada con fecha).'
                          : `${percentage ?? 0}%`}
                      </strong>
                      <p style={{ margin: 0 }}>
                        Estado: {status ?? '—'} · Nivel: {compliance.level} ·{' '}
                        Período evaluado: {metadata?.evaluatedPeriod ?? '—'}
                      </p>
                    </div>
                    {metadata?.latestPlanning ? (
                      <div className="card">
                        <strong>
                          {metadata.latestPlanning.planningCode ? `${metadata.latestPlanning.planningCode} — ` : ''}
                          {metadata.latestPlanning.title ?? 'Planificación vigente'}
                        </strong>
                        <p style={{ margin: 0 }}>
                          Planificación evaluable más reciente · Estado: {metadata.latestPlanning.status ?? '—'} ·{' '}
                          Período: {latestPeriodLabel}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {metadata ? (
                    <>
                      <h4>Dimensiones oficiales</h4>
                      <Table>
                        <thead>
                          <tr>
                            <th>Dimensión</th><th>%</th><th>Peso</th><th>Numerador</th><th>Denominador</th><th>Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {COPASST_PLANNING_DIMENSION_KEYS.map((key) => {
                            const dim = metadata.dimensions[key];
                            const pct = copasstPlanningRatioToPercent(dim?.ratio);
                            const subchecks = dim?.subchecks;
                            const detailText = subchecks
                              ? `Subcondiciones: ${subchecks.satisfied}/${subchecks.total}`
                              : '';
                            return (
                              <tr key={key}>
                                <td>{COPASST_PLANNING_DIMENSION_LABELS[key]}</td>
                                <td>{pct === null ? 'No evaluable' : `${pct}%`}</td>
                                <td>{dim?.weight ?? COPASST_PLANNING_DIMENSION_WEIGHT_FALLBACK[key]}%</td>
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
                    <p>Sin hallazgos para este módulo.</p>
                  ) : (
                    <ul>
                      {findings.map((f) => {
                        const action = FINDING_ACTION[f.id];
                        return (
                          <li key={f.id} style={{ marginBottom: '.5rem' }}>
                            <strong>{f.title}</strong>{' '}
                            <span className={`badge ${f.priority === 'HIGH' ? 'badge--danger' : f.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {f.priority}
                            </span>
                            <div>{f.description}</div>
                            {action ? (
                              <Button variant="secondary" onClick={() => goToFindingAction(f.id)}>{action.label}</Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* IA 6.1.4 — sección claramente diferenciada del resultado
                      oficial; su fallo no afecta la gestión. */}
                  <ComplianceAIInsight token={token} standardCode="6.1.4" />
                </>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ PLANIFICACIONES ══════════════ */}
          {activeTab === 'planificaciones' && (
            <AdvancedSection
              title="Planificaciones de auditorías COPASST"
              description={`Registradas: ${plannings.length} · Mostradas: ${filteredPlannings.length}`}
            >
              {writable ? (
                <div style={{ marginBottom: '.75rem' }}>
                  <Button onClick={() => setFormModal({ mode: 'create' })}>+ Nueva planificación</Button>
                </div>
              ) : null}

              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Estado">
                  <option value="">Todos los estados</option>
                  {(Object.keys(COPASST_PLANNING_STATUS_LABELS) as CopasstAuditPlanningStatus[]).map((s) => (
                    <option key={s} value={s}>{COPASST_PLANNING_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código o título…"
                  aria-label="Búsqueda"
                />
              </div>

              <Table>
                <thead>
                  <tr>
                    <th>Código</th><th>Título</th><th>Período</th><th>Responsable</th><th>Auditorías</th>
                    <th>COPASST</th><th>Estado</th><th>Actualizada</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlannings.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        {plannings.length === 0
                          ? 'No hay planificaciones de auditorías COPASST registradas.'
                          : 'Sin resultados para los filtros aplicados.'}
                      </td>
                    </tr>
                  ) : (
                    filteredPlannings.map((p) => {
                      const activeItems = p.items.filter((i) => i.status !== 'CANCELLED');
                      const withParticipation = activeItems.filter(
                        (i) => i.copasstParticipation?.required && i.copasstParticipation?.participated,
                      ).length;
                      return (
                        <tr key={p._id}>
                          <td>{p.planningCode || '—'}</td>
                          <td>{p.title}</td>
                          <td>{formatDate(p.startDate)} → {formatDate(p.endDate)}</td>
                          <td>{displayResponsible(p)}</td>
                          <td>{activeItems.length}</td>
                          <td>{withParticipation > 0 ? `✅ ${withParticipation}/${activeItems.length}` : '—'}</td>
                          <td><span className={`badge ${STATUS_VARIANTS[p.status]}`}>{COPASST_PLANNING_STATUS_LABELS[p.status]}</span></td>
                          <td>{formatDate(p.updatedAt)}</td>
                          <td>
                            <div className="actions">
                              <Button variant="ghost" onClick={() => setDetailPlanningId(p._id)}>Ver</Button>
                              {writable && p.status !== 'COMPLETED' && p.status !== 'CANCELLED' ? (
                                <Button variant="secondary" onClick={() => setFormModal({ mode: 'edit', planning: p })}>Editar</Button>
                              ) : null}
                              {writable && COPASST_PLANNING_VALID_TRANSITIONS[p.status].length > 0
                                ? COPASST_PLANNING_VALID_TRANSITIONS[p.status].map((next) => (
                                    <Button
                                      key={next}
                                      variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                      onClick={() => setStatusModal({ planning: p, next })}
                                    >
                                      {COPASST_PLANNING_TRANSITION_LABELS[next] ?? next}
                                    </Button>
                                  ))
                                : null}
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
      {detailPlanningId ? (
        <CopasstAuditPlanningDetail
          token={token}
          writable={writable}
          planningId={detailPlanningId}
          revision={detailRevision}
          users={users}
          copasstPeriod={copasstPeriod}
          onError={(msg) => setBanner(`Error: ${msg}`)}
          onClose={() => setDetailPlanningId(null)}
          onEdit={() => {
            const p = planningById(detailPlanningId);
            if (p) setFormModal({ mode: 'edit', planning: p });
          }}
          onStatus={(p, next) => setStatusModal({ planning: p, next })}
          onNewItem={(planningId) => setItemModal({ planningId, mode: 'create' })}
          onEditItem={(planningId, item) => setItemModal({ planningId, mode: 'edit', item })}
          onItemStatus={(planningId, item, next) => setItemStatusModal({ planningId, item, next })}
        />
      ) : null}

      {/* ══════════════ MODALES ══════════════ */}

      {formModal ? (
        <PlanningFormModal
          token={token}
          mode={formModal.mode}
          planning={formModal.mode === 'edit' ? formModal.planning : null}
          users={users}
          copasstPeriod={copasstPeriod}
          onClose={() => setFormModal(null)}
          onSaved={async (saved) => {
            setFormModal(null);
            await loadPlannings();
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner(
              saved.status === 'DRAFT'
                ? 'Planificación creada en borrador. Complete alcance, objetivos y cronograma y luego "Planificar".'
                : 'Planificación guardada.',
            );
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {statusModal ? (
        <Modal
          isOpen
          title={`${COPASST_PLANNING_TRANSITION_LABELS[statusModal.next] ?? statusModal.next} — ${statusModal.planning.title}`}
          onClose={() => setStatusModal(null)}
        >
          <p>
            Cambiará el estado de <strong>{COPASST_PLANNING_STATUS_LABELS[statusModal.planning.status]}</strong> a{' '}
            <strong>{COPASST_PLANNING_STATUS_LABELS[statusModal.next]}</strong>.
            {statusModal.next === 'COMPLETED'
              ? ' Una planificación COMPLETED queda en solo lectura y no puede reabrirse.'
              : statusModal.next === 'CANCELLED'
                ? ' Una planificación CANCELLED queda en solo lectura y no puede reactivarse.'
                : ''}
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setStatusModal(null)}>Cancelar</Button>
            <Button variant={statusModal.next === 'CANCELLED' ? 'danger' : 'primary'} disabled={saving} onClick={() => void handleStatusChange()}>
              {saving ? 'Aplicando…' : 'Confirmar'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {itemModal ? (
        <ItemFormModal
          token={token}
          mode={itemModal.mode}
          planningId={itemModal.planningId}
          item={itemModal.mode === 'edit' ? itemModal.item : null}
          users={users}
          onClose={() => setItemModal(null)}
          onSaved={async (updated) => {
            setItemModal(null);
            if (updated) setPlannings((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Auditoría planificada guardada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {itemStatusModal ? (
        <Modal
          isOpen
          title={`${itemStatusModal.next === 'CANCELLED' ? 'Cancelar' : 'Cambiar estado de'} — ${itemStatusModal.item.title}`}
          onClose={() => setItemStatusModal(null)}
        >
          <p>
            Cambiará el estado de la auditoría planificada de{' '}
            <strong>{PLANNING_ITEM_STATUS_LABELS[itemStatusModal.item.status]}</strong> a{' '}
            <strong>{PLANNING_ITEM_STATUS_LABELS[itemStatusModal.next]}</strong>.
            {itemStatusModal.next === 'COMPLETED'
              ? ' Un item COMPLETED queda en solo lectura.'
              : itemStatusModal.next === 'CANCELLED'
                ? ' Un item CANCELLED queda en solo lectura.'
                : ''}
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setItemStatusModal(null)}>Cancelar</Button>
            <Button variant={itemStatusModal.next === 'CANCELLED' ? 'danger' : 'primary'} disabled={saving} onClick={() => void handleItemStatusChange()}>
              {saving ? 'Aplicando…' : 'Confirmar'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </AdvancedPageLayout>
  );
}

// ═══════════════════════════ Detalle de planificación ═══════════════════════════

function CopasstAuditPlanningDetail(props: {
  token: string;
  writable: boolean;
  planningId: string;
  revision: number;
  users: UserModel[];
  copasstPeriod: CopasstPeriodModel | null;
  onClose: () => void;
  onEdit: () => void;
  onStatus: (planning: CopasstAuditPlanningModel, next: CopasstAuditPlanningStatus) => void;
  onNewItem: (planningId: string) => void;
  onEditItem: (planningId: string, item: CopasstPlannedAuditItemModel) => void;
  onItemStatus: (planningId: string, item: CopasstPlannedAuditItemModel, next: AuditPlanningItemStatus) => void;
  onError: (message: string) => void;
}) {
  const {
    token, writable, planningId, revision, users, copasstPeriod, onClose,
    onEdit, onStatus, onNewItem, onEditItem, onItemStatus, onError,
  } = props;
  const [planning, setPlanning] = useState<CopasstAuditPlanningModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CopasstAuditPlanningHistoryModel[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchCopasstAuditPlanning(token, planningId);
        if (!cancelled) setPlanning(detail);
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
  }, [token, planningId, revision]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchCopasstAuditPlanningHistory(token, planningId);
      setHistory(rows);
    } catch (err) {
      // Error local del historial: no rompe el detalle principal.
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) {
    return (
      <Modal isOpen title="Detalle de planificación" onClose={onClose}>
        <p>Cargando…</p>
      </Modal>
    );
  }
  if (!planning) {
    return (
      <Modal isOpen title="Detalle de planificación" onClose={onClose}>
        <p>No fue posible cargar la planificación.</p>
      </Modal>
    );
  }

  const readOnly = planning.status === 'COMPLETED' || planning.status === 'CANCELLED';
  const responsibleName =
    planning.responsibleUserSnapshot ||
    (planning.responsibleUserId
      ? users.find((u) => u._id === planning.responsibleUserId)
        ? `${users.find((u) => u._id === planning.responsibleUserId)!.firstName} ${users.find((u) => u._id === planning.responsibleUserId)!.lastName}`.trim()
        : planning.responsibleUserId
      : '—');

  return (
    <Modal isOpen title={`${planning.planningCode ? `${planning.planningCode} — ` : ''}${planning.title}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <div>
          <span className={`badge ${STATUS_VARIANTS[planning.status]}`}>{COPASST_PLANNING_STATUS_LABELS[planning.status]}</span>{' '}
          {readOnly ? <span className="badge badge--warning">🔒 Solo lectura</span> : null}
        </div>

        <h4>Información general</h4>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Responsable:</strong> {responsibleName}</p>
            <p style={{ margin: 0 }}><strong>Período:</strong> {formatDate(planning.startDate)} → {formatDate(planning.endDate)}</p>
            <p style={{ margin: 0 }}>
              <strong>Período COPASST:</strong>{' '}
              {planning.copasstPeriodId
                ? planning.copasstPeriodSnapshot ||
                  (copasstPeriod && copasstPeriod._id === planning.copasstPeriodId ? copasstPeriod.periodName : planning.copasstPeriodId)
                : '—'}
            </p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Alcance:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{planning.scope || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Objetivos:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{planning.objectives || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Criterios:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{planning.criteria || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Metodología:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{planning.methodology || '—'}</p>
          </div>
        </div>

        {writable ? (
          <div className="actions">
            {!readOnly ? <Button variant="secondary" onClick={onEdit}>Editar</Button> : null}
            {COPASST_PLANNING_VALID_TRANSITIONS[planning.status].map((next) => (
              <Button
                key={next}
                variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                onClick={() => onStatus(planning, next)}
              >
                {COPASST_PLANNING_TRANSITION_LABELS[next] ?? next}
              </Button>
            ))}
          </div>
        ) : null}

        <h4>Auditorías planificadas ({planning.items.length})</h4>
        {writable && !readOnly ? (
          <div>
            <Button onClick={() => onNewItem(planning._id)}>+ Nueva auditoría planificada</Button>
          </div>
        ) : null}
        {planning.items.length === 0 ? (
          <p>
            Sin auditorías planificadas. Una planificación evaluable requiere al menos una auditoría
            con título, objetivo y fecha dentro del período.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nombre</th><th>Fecha</th><th>Auditor/Responsable</th><th>Objetivo</th>
                <th>Alcance</th><th>Metodología</th><th>COPASST</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {planning.items.map((item) => {
                const overdue = isItemOverdue(item);
                const participation = item.copasstParticipation;
                return (
                  <tr key={item._id}>
                    <td>{item.title}</td>
                    <td>
                      {formatDate(item.plannedDate)}
                      {overdue ? <span className="badge badge--danger">Vencida</span> : null}
                    </td>
                    <td>
                      {item.auditorUserSnapshot ||
                        (item.auditorUserId
                          ? users.find((u) => u._id === item.auditorUserId)
                            ? `${users.find((u) => u._id === item.auditorUserId)!.firstName} ${users.find((u) => u._id === item.auditorUserId)!.lastName}`.trim()
                            : item.auditorUserId
                          : item.responsibleUserSnapshot || item.responsibleUserId || '—')}
                    </td>
                    <td style={{ maxWidth: 220 }}>{item.objective}</td>
                    <td style={{ maxWidth: 180 }}>{item.scope || '—'}</td>
                    <td style={{ maxWidth: 180 }}>{item.methodology || '—'}</td>
                    <td>
                      {participation?.required ? (
                        participation.participated ? <span className="badge badge--success">Participó</span> : <span className="badge badge--info">Requerida</span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${ITEM_STATUS_VARIANTS[item.status]}`}>{PLANNING_ITEM_STATUS_LABELS[item.status]}</span>
                    </td>
                    <td>
                      <div className="actions">
                        {writable && !readOnly ? <Button variant="ghost" onClick={() => onEditItem(planning._id, item)}>Editar</Button> : null}
                        {writable && !readOnly && PLANNING_ITEM_VALID_TRANSITIONS[item.status].length > 0
                          ? PLANNING_ITEM_VALID_TRANSITIONS[item.status].map((next) => (
                              <Button
                                key={next}
                                variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                onClick={() => onItemStatus(planning._id, item, next)}
                              >
                                {next === 'CANCELLED' ? 'Cancelar' : PLANNING_ITEM_STATUS_LABELS[next]}
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

        <h4>Participación COPASST</h4>
        {(() => {
          const itemsWithParticipation = planning.items.filter((i) => i.copasstParticipation?.required);
          if (itemsWithParticipation.length === 0) {
            return (
              <p style={{ margin: 0 }}>
                Ninguna auditoría planificada declara participación del COPASST como requerida.
                La participación del comité es componente central del estándar 6.1.4.
              </p>
            );
          }
          return itemsWithParticipation.map((item) => {
            const p = item.copasstParticipation;
            return (
              <div key={item._id} className="card" style={{ marginBottom: '.5rem' }}>
                <p style={{ margin: '.25rem 0' }}><strong>{item.title}</strong></p>
                <p style={{ margin: 0 }}>
                  Requerida: {p.required ? 'Sí' : 'No'} · Declarada: {p.participated ? 'Sí' : 'No'} ·{' '}
                  Fecha: {formatDate(p.participationDate)}
                </p>
                {p.participants.length > 0 ? (
                  <p style={{ margin: 0 }}>
                    Participantes:{' '}
                    {p.participants
                      .map((x) => (x.role ? `${x.nameSnapshot} (${x.role})` : x.nameSnapshot))
                      .join(', ')}
                  </p>
                ) : null}
                {p.observations ? (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>Observaciones: {p.observations}</p>
                ) : null}
              </div>
            );
          });
        })()}

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
                <tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Item</th><th>Comentario</th></tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const affected = h.itemId ? planning.items.find((i) => i._id === h.itemId) : null;
                  return (
                    <tr key={h._id}>
                      <td>{new Date(h.createdAt).toLocaleString()}</td>
                      <td>{COPASST_PLANNING_HISTORY_ACTION_LABELS[h.action] ?? h.action}</td>
                      <td>{h.userEmail}</td>
                      <td>{affected ? affected.title : '—'}</td>
                      <td>{h.comment || '—'}</td>
                    </tr>
                  );
                })}
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

// ═══════════════════════════ Formulario de planificación ═══════════════════════════

type PlanningFormState = {
  planningCode: string; title: string;
  startDate: string; endDate: string;
  scope: string; objectives: string; criteria: string; methodology: string;
  responsibleUserId: string; copasstPeriodId: string;
};

function emptyPlanningForm(): PlanningFormState {
  return {
    planningCode: '', title: '',
    startDate: '', endDate: '',
    scope: '', objectives: '', criteria: '', methodology: '',
    responsibleUserId: '', copasstPeriodId: '',
  };
}

function planningFormFrom(p: CopasstAuditPlanningModel): PlanningFormState {
  const iso = (v?: string) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  return {
    planningCode: p.planningCode ?? '',
    title: p.title,
    startDate: iso(p.startDate),
    endDate: iso(p.endDate),
    scope: p.scope ?? '',
    objectives: p.objectives ?? '',
    criteria: p.criteria ?? '',
    methodology: p.methodology ?? '',
    responsibleUserId: p.responsibleUserId ?? '',
    copasstPeriodId: p.copasstPeriodId ?? '',
  };
}

/**
 * Formulario de creación/edición de planificación (patrón AnnualAuditFormModal).
 * NUNCA envía companyId/createdBy/updatedBy/history/status: el backend los
 * resuelve server-side (forbidNonWhitelisted) y el formulario ni los expone.
 * Las validaciones aquí son UX; las de seguridad viven en el backend.
 */
function PlanningFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  planning: CopasstAuditPlanningModel | null;
  users: UserModel[];
  copasstPeriod: CopasstPeriodModel | null;
  onClose: () => void;
  onSaved: (saved: CopasstAuditPlanningModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, mode, planning, users, copasstPeriod, onClose, onSaved, onError } = props;
  const [form, setForm] = useState<PlanningFormState>(planning ? planningFormFrom(planning) : emptyPlanningForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof PlanningFormState>(key: K, value: PlanningFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título de la planificación es requerido.';
    if (!isISODate(form.startDate)) return 'La fecha de inicio es inválida.';
    if (!isISODate(form.endDate)) return 'La fecha final es inválida.';
    if (Date.parse(form.endDate) < Date.parse(form.startDate)) {
      return 'La fecha final debe ser posterior o igual a la fecha de inicio.';
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
    try {
      const payload: CreateCopasstAuditPlanningPayload = {
        ...(form.planningCode.trim() ? { planningCode: form.planningCode.trim() } : {}),
        title: form.title.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        ...(form.scope.trim() ? { scope: form.scope.trim() } : {}),
        ...(form.objectives.trim() ? { objectives: form.objectives.trim() } : {}),
        ...(form.criteria.trim() ? { criteria: form.criteria.trim() } : {}),
        ...(form.methodology.trim() ? { methodology: form.methodology.trim() } : {}),
        ...(form.responsibleUserId
          ? {
              responsibleUserId: form.responsibleUserId,
              responsibleUserSnapshot:
                users.find((u) => u._id === form.responsibleUserId)
                  ? `${users.find((u) => u._id === form.responsibleUserId)!.firstName} ${users.find((u) => u._id === form.responsibleUserId)!.lastName}`.trim()
                  : undefined,
            }
          : {}),
        ...(form.copasstPeriodId ? { copasstPeriodId: form.copasstPeriodId } : {}),
      };
      const saved =
        mode === 'create'
          ? await createCopasstAuditPlanning(token, payload)
          : await updateCopasstAuditPlanning(token, planning!._id, payload);
      await onSaved(saved);
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
      title={mode === 'create' ? 'Nueva planificación de auditorías COPASST' : 'Editar planificación'}
      onClose={onClose}
    >
      <div className="form-grid">
        <label htmlFor="cap-code">Código (opcional)</label>
        <Input
          id="cap-code"
          value={form.planningCode}
          onChange={(e) => set('planningCode', e.target.value)}
          placeholder="Ej: PA-2026-01"
          maxLength={100}
        />
        <label htmlFor="cap-title">Título *</label>
        <Input
          id="cap-title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Ej: Planificación de auditorías COPASST vigencia 2026"
          maxLength={300}
          required
        />
        <label htmlFor="cap-start">Fecha de inicio *</label>
        <Input id="cap-start" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} required />
        <label htmlFor="cap-end">Fecha final *</label>
        <Input id="cap-end" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} required />
        <label htmlFor="cap-scope">Alcance</label>
        <textarea
          id="cap-scope"
          className="input"
          rows={2}
          value={form.scope}
          onChange={(e) => set('scope', e.target.value)}
          maxLength={2000}
        />
        <label htmlFor="cap-objectives">Objetivos</label>
        <textarea
          id="cap-objectives"
          className="input"
          rows={2}
          value={form.objectives}
          onChange={(e) => set('objectives', e.target.value)}
          maxLength={2000}
        />
        <label htmlFor="cap-criteria">Criterios</label>
        <textarea
          id="cap-criteria"
          className="input"
          rows={2}
          value={form.criteria}
          onChange={(e) => set('criteria', e.target.value)}
          maxLength={2000}
        />
        <label htmlFor="cap-methodology">Metodología</label>
        <textarea
          id="cap-methodology"
          className="input"
          rows={2}
          value={form.methodology}
          onChange={(e) => set('methodology', e.target.value)}
          maxLength={2000}
        />
        <label htmlFor="cap-responsible">Responsable</label>
        <Select id="cap-responsible" value={form.responsibleUserId} onChange={(e) => set('responsibleUserId', e.target.value)}>
          <option value="">Sin responsable definido</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
        <label htmlFor="cap-period">Período COPASST</label>
        <Select id="cap-period" value={form.copasstPeriodId} onChange={(e) => set('copasstPeriodId', e.target.value)}>
          <option value="">Sin referencia al período COPASST</option>
          {copasstPeriod ? (
            <option value={copasstPeriod._id}>
              {copasstPeriod.periodName} ({formatDate(copasstPeriod.startDate)} → {formatDate(copasstPeriod.endDate)})
            </option>
          ) : null}
        </Select>
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Guardando…' : mode === 'create' ? 'Crear planificación' : 'Guardar cambios'}
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Formulario de item planificado ═══════════════════════════

type ItemFormState = {
  title: string; plannedDate: string;
  auditorUserId: string; responsibleUserId: string;
  objective: string; scope: string; criteria: string; methodology: string;
  participationRequired: boolean; participationParticipated: boolean; participationDate: string;
  participationObservations: string;
  participantsText: string;
};

function emptyItemForm(): ItemFormState {
  return {
    title: '', plannedDate: '',
    auditorUserId: '', responsibleUserId: '',
    objective: '', scope: '', criteria: '', methodology: '',
    participationRequired: true, participationParticipated: false, participationDate: '',
    participationObservations: '',
    participantsText: '',
  };
}

function itemFormFrom(item: CopasstPlannedAuditItemModel): ItemFormState {
  const iso = (v?: string) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  return {
    title: item.title,
    plannedDate: iso(item.plannedDate),
    auditorUserId: item.auditorUserId ?? '',
    responsibleUserId: item.responsibleUserId ?? '',
    objective: item.objective,
    scope: item.scope ?? '',
    criteria: item.criteria ?? '',
    methodology: item.methodology ?? '',
    participationRequired: item.copasstParticipation?.required ?? true,
    participationParticipated: item.copasstParticipation?.participated ?? false,
    participationDate: iso(item.copasstParticipation?.participationDate),
    participationObservations: item.copasstParticipation?.observations ?? '',
    participantsText: (item.copasstParticipation?.participants ?? [])
      .map((p) => p.nameSnapshot)
      .join(', '),
  };
}

/**
 * Formulario de auditoría/verificación planificada. `copasstParticipation` se
 * compone aquí y se envía dentro del payload del item (DTO Create/Update).
 * `annualAuditId` (6.1.2) es referencia declarativa y NO se edita desde esta
 * pantalla: mezclar ambas responsabilidades rompería la frontera 6.1.2 ↔ 6.1.4.
 */
function ItemFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  planningId: string;
  item: CopasstPlannedAuditItemModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (updated: CopasstAuditPlanningModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, mode, planningId, item, users, onClose, onSaved, onError } = props;
  const [form, setForm] = useState<ItemFormState>(item ? itemFormFrom(item) : emptyItemForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El nombre de la auditoría planificada es requerido.';
    if (!form.objective.trim()) return 'El objetivo de la auditoría planificada es requerido.';
    if (form.plannedDate && !isISODate(form.plannedDate)) return 'La fecha programada es inválida.';
    if (form.participationDate && !isISODate(form.participationDate)) return 'La fecha de participación es inválida.';
    if (form.participationParticipated && !form.participationDate && !form.participantsText.trim() && !form.participationObservations.trim()) {
      return 'Para declarar la participación del COPASST registre fecha, participantes u observaciones.';
    }
    return null;
  };

  const buildParticipation = (): CopasstParticipationPayload => ({
    required: form.participationRequired,
    participated: form.participationParticipated,
    ...(form.participationDate ? { participationDate: form.participationDate } : {}),
    participants: form.participantsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((nameSnapshot) => ({ nameSnapshot })),
    ...(form.participationObservations.trim() ? { observations: form.participationObservations.trim() } : {}),
  });

  const handleSubmit = async () => {
    const validation = validate();
    if (validation) {
      setFormError(validation);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: CreatePlannedAuditPayload = {
        title: form.title.trim(),
        ...(form.plannedDate ? { plannedDate: form.plannedDate } : {}),
        ...(form.auditorUserId
          ? {
              auditorUserId: form.auditorUserId,
              auditorUserSnapshot:
                users.find((u) => u._id === form.auditorUserId)
                  ? `${users.find((u) => u._id === form.auditorUserId)!.firstName} ${users.find((u) => u._id === form.auditorUserId)!.lastName}`.trim()
                  : undefined,
            }
          : {}),
        ...(form.responsibleUserId
          ? {
              responsibleUserId: form.responsibleUserId,
              responsibleUserSnapshot:
                users.find((u) => u._id === form.responsibleUserId)
                  ? `${users.find((u) => u._id === form.responsibleUserId)!.firstName} ${users.find((u) => u._id === form.responsibleUserId)!.lastName}`.trim()
                  : undefined,
            }
          : {}),
        objective: form.objective.trim(),
        ...(form.scope.trim() ? { scope: form.scope.trim() } : {}),
        ...(form.criteria.trim() ? { criteria: form.criteria.trim() } : {}),
        ...(form.methodology.trim() ? { methodology: form.methodology.trim() } : {}),
        copasstParticipation: buildParticipation(),
      };
      const updated =
        mode === 'create'
          ? await addCopasstAuditPlanningItem(token, planningId, payload)
          : await updateCopasstAuditPlanningItem(token, planningId, item!._id, payload);
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
    <Modal
      isOpen
      title={mode === 'create' ? 'Nueva auditoría planificada' : 'Editar auditoría planificada'}
      onClose={onClose}
    >
      <div className="form-grid">
        <label htmlFor="capi-title">Nombre *</label>
        <Input
          id="capi-title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Ej: Auditoría de servicios de salud ocupacional"
          maxLength={300}
          required
        />
        <label htmlFor="capi-date">Fecha programada</label>
        <Input id="capi-date" type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} />
        <label htmlFor="capi-auditor">Auditor</label>
        <Select id="capi-auditor" value={form.auditorUserId} onChange={(e) => set('auditorUserId', e.target.value)}>
          <option value="">Sin auditor definido</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
        <label htmlFor="capi-responsible">Responsable</label>
        <Select id="capi-responsible" value={form.responsibleUserId} onChange={(e) => set('responsibleUserId', e.target.value)}>
          <option value="">Sin responsable definido</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
        <label htmlFor="capi-objective">Objetivo *</label>
        <textarea
          id="capi-objective"
          className="input"
          rows={2}
          value={form.objective}
          onChange={(e) => set('objective', e.target.value)}
          maxLength={2000}
          required
        />
        <label htmlFor="capi-scope">Alcance</label>
        <textarea
          id="capi-scope"
          className="input"
          rows={2}
          value={form.scope}
          onChange={(e) => set('scope', e.target.value)}
          maxLength={2000}
        />
        <label htmlFor="capi-criteria">Criterios</label>
        <textarea
          id="capi-criteria"
          className="input"
          rows={2}
          value={form.criteria}
          onChange={(e) => set('criteria', e.target.value)}
          maxLength={2000}
        />
        <label htmlFor="capi-methodology">Metodología</label>
        <textarea
          id="capi-methodology"
          className="input"
          rows={2}
          value={form.methodology}
          onChange={(e) => set('methodology', e.target.value)}
          maxLength={2000}
        />

        <h4 style={{ margin: '0.5rem 0 0' }}>Participación COPASST</h4>
        <label htmlFor="capi-part-required">Participación requerida</label>
        <Select
          id="capi-part-required"
          value={form.participationRequired ? 'yes' : 'no'}
          onChange={(e) => set('participationRequired', e.target.value === 'yes')}
        >
          <option value="yes">Sí — el comité debe participar</option>
          <option value="no">No</option>
        </Select>
        <label htmlFor="capi-part-done">Participación realizada</label>
        <Select
          id="capi-part-done"
          value={form.participationParticipated ? 'yes' : 'no'}
          onChange={(e) => set('participationParticipated', e.target.value === 'yes')}
        >
          <option value="no">No declarada</option>
          <option value="yes">Sí — declarar participación</option>
        </Select>
        {form.participationParticipated ? (
          <>
            <label htmlFor="capi-part-date">Fecha de participación</label>
            <Input
              id="capi-part-date"
              type="date"
              value={form.participationDate}
              onChange={(e) => set('participationDate', e.target.value)}
            />
            <label htmlFor="capi-participants">Participantes (separados por coma)</label>
            <Input
              id="capi-participants"
              value={form.participantsText}
              onChange={(e) => set('participantsText', e.target.value)}
              placeholder="Ej: María Pérez (Presidenta), Juan Gómez (Secretario)"
            />
            <label htmlFor="capi-part-obs">Observaciones</label>
            <textarea
              id="capi-part-obs"
              className="input"
              rows={2}
              value={form.participationObservations}
              onChange={(e) => set('participationObservations', e.target.value)}
              maxLength={2000}
            />
          </>
        ) : null}
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Guardando…' : mode === 'create' ? 'Agregar auditoría' : 'Guardar cambios'}
        </Button>
      </div>
    </Modal>
  );
}
