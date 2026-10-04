import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ManagementImprovementActionModel,
  type ImprovementActionOrigin,
  type ImprovementActionPriority,
  type ImprovementActionStatus,
  type ImplementationStatus,
  type PerceivedEffectiveness,
  type MiaHistoryModel,
  type CreateMiaActionPayload,
  type UserModel,
  fetchMiaActions,
  fetchMiaAction,
  createMiaAction,
  updateMiaAction,
  updateMiaActionStatus,
  addMiaActionEvidence,
  registerMiaActionFollowUp,
  fetchMiaActionHistory,
  fetchAdmins,
  fetchMembers,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  isMiaComplianceMetadataV1,
  miaRatioToPercent,
  isMiaActionOverdue,
  MIA_DIMENSION_KEYS,
  MIA_DIMENSION_LABELS,
  MIA_DIMENSION_WEIGHT_FALLBACK,
  MIA_ORIGIN_LABELS,
  MIA_PRIORITY_LABELS,
  MIA_STATUS_LABELS,
  MIA_IMPLEMENTATION_STATUS_LABELS,
  MIA_PERCEIVED_EFFECTIVENESS_LABELS,
  MIA_STATUS_VARIANTS,
  MIA_PRIORITY_VARIANTS,
  MIA_IMPLEMENTATION_STATUS_VARIANTS,
  MIA_PERCEIVED_EFFECTIVENESS_VARIANTS,
  MIA_VALID_TRANSITIONS,
  MIA_TRANSITION_LABELS,
  MIA_HISTORY_ACTION_LABELS,
  MIA_FINDING_ACTIONS,
  type MiaComplianceMetadataV1,
} from '../types/management-improvement-actions';
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
// E3 (7.1.2): IA complementaria — interpreta el resultado oficial; si falla,
// el componente no bloquea la página (fallback interno tolerante).
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';

/**
 * E3 (7.1.2) — Gestión Avanzada de las Acciones de mejora de la alta
 * dirección.
 *
 * REGLA DE SCORE: el frontend NO calcula el cumplimiento. Porcentaje, estado,
 * nivel y metadata dimensional provienen exclusivamente de
 * GET /compliance-engine/overview (module === 'management-improvement-actions',
 * dimensions:v1 — provider oficial E2). `miaRatioToPercent` es solo
 * presentación visual. `isMiaActionOverdue` replica la regla OFICIAL derivada
 * del scorer (dueDate < now && estado no terminal) — SOLO presentación,
 * nunca se envía al backend.
 *
 * FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 * seguimiento (perceivedEffectiveness) — la UI NUNCA la presenta como
 * "verificación de eficacia" ni "eficacia formal".
 *
 * Roles (E1): lectura owner/admin/manager; member SIN acceso; escritura
 * owner/admin (el backend es la autoridad — aquí solo se ocultan acciones).
 * El estado SOLO cambia por PATCH /:id/status (transiciones válidas espejo;
 * PENDING → COMPLETED prohibido); el seguimiento por POST /:id/follow-up;
 * la evidencia por POST /:id/evidence.
 */

interface ManagementImprovementActionsPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: '📋' },
  { id: 'acciones', label: 'Acciones', icon: '🗂️' },
];

/** Solo lectura de fecha (input date emite YYYY-MM-DD, aceptado por IsDateString). */
function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function formatDate(value?: string): string {
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

export function ManagementImprovementActionsPage({ token, role }: ManagementImprovementActionsPageProps) {
  const writable = canWrite(role);
  const [activeTab, setActiveTab] = useState<string>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Datos
  const [actions, setActions] = useState<ManagementImprovementActionModel[]>([]);
  const [users, setUsers] = useState<UserModel[]>([]);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<MiaComplianceMetadataV1 | null>(null);

  // Filtros del tab Acciones
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterOrigin, setFilterOrigin] = useState<string>('');
  const [filterResponsible, setFilterResponsible] = useState<string>('');
  const [filterOverdue, setFilterOverdue] = useState<string>('');
  const [filterFollowUp, setFilterFollowUp] = useState<string>('');
  const [filterEvidence, setFilterEvidence] = useState<string>('');

  // Estado de guardado
  const [saving, setSaving] = useState(false);
  /** Se incrementa con cada mutación → el detalle abierto se refresca. */
  const [detailRevision, setDetailRevision] = useState(0);

  // Modales
  const [formModal, setFormModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; action: ManagementImprovementActionModel }
    | null
  >(null);
  const [detailActionId, setDetailActionId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<
    | { action: ManagementImprovementActionModel; next: ImprovementActionStatus }
    | null
  >(null);
  const [evidenceModal, setEvidenceModal] = useState<
    | { action: ManagementImprovementActionModel }
    | null
  >(null);
  const [followUpModal, setFollowUpModal] = useState<
    | { action: ManagementImprovementActionModel }
    | null
  >(null);

  // ─── Carga (tolerante: compliance falla ≠ romper la gestión) ────────────
  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === 'management-improvement-actions') ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isMiaComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === 'management-improvement-actions'));
  }, [token]);

  const loadActions = useCallback(async () => {
    setActions(await fetchMiaActions(token).catch(() => []));
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
        const [list, overview] = await Promise.all([
          fetchMiaActions(token),
          getOverview(token, '').catch(() => null),
        ]);
        if (cancelled) return;
        setActions(list);
        const moduleCompliance =
          overview?.moduleCompliance?.find((m) => m.module === 'management-improvement-actions') ?? null;
        setCompliance(moduleCompliance);
        setMetadata(
          moduleCompliance && isMiaComplianceMetadataV1(moduleCompliance.metadata)
            ? moduleCompliance.metadata
            : null,
        );
        setFindings((overview?.findings ?? []).filter((f) => f.module === 'management-improvement-actions'));
        void loadUsers();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadUsers]);

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
    (a: ManagementImprovementActionModel) =>
      a.responsibleSnapshot ||
      (a.responsibleUserId ? userNameById.get(a.responsibleUserId) ?? a.responsibleUserId : '—'),
    [userNameById],
  );

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (filterStatus && a.status !== filterStatus) return false;
      if (filterPriority && a.priority !== filterPriority) return false;
      if (filterOrigin && a.origin !== filterOrigin) return false;
      if (filterResponsible && a.responsibleUserId !== filterResponsible) return false;
      if (filterOverdue === 'yes' && !isMiaActionOverdue(a)) return false;
      if (filterOverdue === 'no' && isMiaActionOverdue(a)) return false;
      if (filterFollowUp === 'yes' && !a.followUp) return false;
      if (filterFollowUp === 'no' && a.followUp) return false;
      if (filterFollowUp === 'EFECTIVA' && a.followUp?.perceivedEffectiveness !== 'EFECTIVA') return false;
      if (filterFollowUp === 'NO_EFECTIVA' && a.followUp?.perceivedEffectiveness !== 'NO_EFECTIVA') return false;
      if (filterFollowUp === 'INDETERMINADA' && a.followUp?.perceivedEffectiveness !== 'INDETERMINADA') return false;
      if (filterEvidence === 'yes' && !a.evidence) return false;
      if (filterEvidence === 'no' && a.evidence) return false;
      return true;
    });
  }, [actions, filterStatus, filterPriority, filterOrigin, filterResponsible, filterOverdue, filterFollowUp, filterEvidence]);

  const statusBadge = loading
    ? <span className="badge badge--info">⏳ Cargando…</span>
    : compliance === null
      ? <span className="badge badge--warning">Cumplimiento no disponible</span>
      : status === 'NO_DATA'
        ? <span className="badge badge--warning">Sin datos evaluables</span>
        : status === 'TARGET_MET'
          ? <span className="badge badge--success">✅ Meta alcanzada</span>
          : <span className="badge badge--danger">Meta no alcanzada</span>;

  // ─── Acción: transición de estado ───────────────────────────────────────
  const handleStatusChange = async () => {
    if (!statusModal) return;
    setSaving(true);
    try {
      await updateMiaActionStatus(token, statusModal.action._id, { status: statusModal.next });
      const next = statusModal.next;
      setStatusModal(null);
      await Promise.all([loadActions(), loadCompliance()]);
      setDetailRevision((r) => r + 1);
      setBanner(`Estado actualizado a ${MIA_STATUS_LABELS[next]}.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const goToFindingAction = (findingId: string) => {
    const action = MIA_FINDING_ACTIONS[findingId];
    if (action) setActiveTab(action.tab);
  };

  const actionById = useCallback((id: string) => actions.find((a) => a._id === id) ?? null, [actions]);

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/act"
        backLabel="← Volver a Actuar"
        moduleCode="7.1.2"
        moduleTitle="Acciones de mejora de la alta dirección"
        description="Gestión, seguimiento y trazabilidad de las acciones de mejora aprobadas por la alta dirección."
        statusBadge={statusBadge}
        actions={writable
          ? [{ label: '🔄 Recargar', onClick: () => { void loadActions(); void loadCompliance(); }, variant: 'secondary' as const }]
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
            label: 'Cumplimiento oficial 7.1.2',
            value: loading ? '…' : status === 'NO_DATA' ? 'Sin datos' : percentage === null ? 'N/D' : `${percentage}%`,
            variant: status === 'TARGET_MET' ? 'success' : status === 'NO_DATA' || compliance === null ? 'warning' : 'danger',
          },
          { label: 'Total acciones', value: counters?.totalActions ?? actions.length, variant: 'info' },
          { label: 'Pendientes', value: counters?.pendingActions ?? 0, variant: 'warning' },
          { label: 'En ejecución', value: counters?.inProgressActions ?? 0, variant: 'info' },
          { label: 'Completadas', value: counters?.completedActions ?? 0, variant: 'success' },
          { label: 'Vencidas', value: counters?.overdueActions ?? 0, variant: 'danger' },
        ]}
        columns={6}
      />

      <div className="flex gap-6">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />
        <AdvancedTabsContent>
          {error ? <p>⚠️ {error}</p> : null}

          {/* ══════════════ RESUMEN ══════════════ */}
          {activeTab === 'resumen' && (
            <AdvancedSection
              title="Cumplimiento oficial — 7.1.2"
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
                          ? 'Sin datos evaluables — todavía no existen acciones de mejora de la alta dirección registradas.'
                          : `${percentage ?? 0}%`}
                      </strong>
                      <p style={{ margin: 0 }}>
                        Estado: {status ?? '—'} · Nivel: {compliance.level} ·{' '}
                        Período evaluado: {metadata?.evaluatedPeriod ?? '—'}
                      </p>
                      {status === 'NO_DATA' && writable ? (
                        <div style={{ marginTop: '.5rem' }}>
                          <Button onClick={() => setFormModal({ mode: 'create' })}>Crear primera acción</Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="card">
                      <strong>Seguimiento y evidencia</strong>
                      <p style={{ margin: 0 }}>
                        Con seguimiento: {counters?.actionsWithFollowUp ?? 0} · Sin seguimiento: {counters?.actionsWithoutFollowUp ?? 0} ·{' '}
                        Con evidencia: {counters?.actionsWithEvidence ?? 0} · Sin evidencia: {counters?.actionsWithoutEvidence ?? 0} ·{' '}
                        Requieren seguimiento adicional: {counters?.actionsRequiringContinuedFollowUp ?? 0}
                      </p>
                    </div>
                    <div className="card">
                      <strong>Percepción de efectividad (declarada en seguimiento)</strong>
                      <p style={{ margin: 0 }}>
                        Efectivas: {counters?.effectiveActions ?? 0} · No efectivas: {counters?.ineffectiveActions ?? 0} ·{' '}
                        Sin concluir: {counters?.indeterminateEffectivenessActions ?? 0}
                      </p>
                      <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                        La percepción de efectividad es un resultado declarado del seguimiento de la acción de
                        mejora — no es una verificación formal de eficacia (esa es la frontera del estándar 7.1.1).
                      </p>
                    </div>
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
                          {MIA_DIMENSION_KEYS.map((key) => {
                            const dim = metadata.dimensions[key];
                            const pct = miaRatioToPercent(dim?.ratio);
                            const subchecks = dim?.subchecks;
                            const detailText = subchecks
                              ? `Subcondiciones: ${subchecks.satisfied}/${subchecks.total}`
                              : key === 'continuity' && dim?.ratio === null
                                ? 'Una sola vigencia — redistribuida (no penaliza)'
                                : '';
                            return (
                              <tr key={key}>
                                <td>{MIA_DIMENSION_LABELS[key]}</td>
                                <td>{pct === null ? 'No evaluable' : `${pct}%`}</td>
                                <td>{dim?.weight ?? MIA_DIMENSION_WEIGHT_FALLBACK[key]}%</td>
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
                        const action = MIA_FINDING_ACTIONS[f.id];
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

                  {/* IA 7.1.2 — sección claramente diferenciada del resultado
                      oficial; su fallo no afecta la gestión. */}
                  <ComplianceAIInsight token={token} standardCode="7.1.2" />
                </>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ ACCIONES ══════════════ */}
          {activeTab === 'acciones' && (
            <AdvancedSection
              title="Acciones de mejora de la alta dirección"
              description={`Registradas: ${actions.length} · Mostradas: ${filteredActions.length}`}
            >
              {writable ? (
                <div style={{ marginBottom: '.75rem' }}>
                  <Button onClick={() => setFormModal({ mode: 'create' })}>+ Nueva acción</Button>
                </div>
              ) : null}

              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Estado">
                  <option value="">Todos los estados</option>
                  {(Object.keys(MIA_STATUS_LABELS) as ImprovementActionStatus[]).map((s) => (
                    <option key={s} value={s}>{MIA_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
                <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} aria-label="Prioridad">
                  <option value="">Todas las prioridades</option>
                  {(Object.keys(MIA_PRIORITY_LABELS) as ImprovementActionPriority[]).map((p) => (
                    <option key={p} value={p}>{MIA_PRIORITY_LABELS[p]}</option>
                  ))}
                </Select>
                <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)} aria-label="Origen">
                  <option value="">Todos los orígenes</option>
                  {(Object.keys(MIA_ORIGIN_LABELS) as ImprovementActionOrigin[]).map((o) => (
                    <option key={o} value={o}>{MIA_ORIGIN_LABELS[o]}</option>
                  ))}
                </Select>
                <Select value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)} aria-label="Responsable">
                  <option value="">Todos los responsables</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>
                  ))}
                </Select>
                <Select value={filterOverdue} onChange={(e) => setFilterOverdue(e.target.value)} aria-label="Vencidas">
                  <option value="">Vencimiento: todas</option>
                  <option value="yes">Solo vencidas</option>
                  <option value="no">Sin vencer</option>
                </Select>
                <Select value={filterFollowUp} onChange={(e) => setFilterFollowUp(e.target.value)} aria-label="Seguimiento">
                  <option value="">Seguimiento: todas</option>
                  <option value="yes">Con seguimiento</option>
                  <option value="no">Sin seguimiento</option>
                  <option value="EFECTIVA">Percibidas efectivas</option>
                  <option value="NO_EFECTIVA">Percibidas no efectivas</option>
                  <option value="INDETERMINADA">Sin concluir</option>
                </Select>
                <Select value={filterEvidence} onChange={(e) => setFilterEvidence(e.target.value)} aria-label="Evidencia">
                  <option value="">Evidencia: todas</option>
                  <option value="yes">Con evidencia</option>
                  <option value="no">Sin evidencia</option>
                </Select>
              </div>

              <Table>
                <thead>
                  <tr>
                    <th>Código</th><th>Título</th><th>Origen</th><th>Prioridad</th><th>Responsable</th>
                    <th>Vencimiento</th><th>Estado</th><th>Seguimiento</th><th>Evidencia</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActions.length === 0 ? (
                    <tr>
                      <td colSpan={10}>
                        {actions.length === 0
                          ? 'Aún no hay acciones de mejora de alta dirección registradas.'
                          : 'Sin resultados para los filtros aplicados.'}
                      </td>
                    </tr>
                  ) : (
                    filteredActions.map((a) => {
                      const overdue = isMiaActionOverdue(a);
                      const fu = a.followUp;
                      return (
                        <tr key={a._id}>
                          <td>{a.actionCode || '—'}</td>
                          <td style={{ maxWidth: 220 }}>{a.title}</td>
                          <td style={{ maxWidth: 180 }}>{MIA_ORIGIN_LABELS[a.origin]}</td>
                          <td><span className={`badge ${MIA_PRIORITY_VARIANTS[a.priority]}`}>{MIA_PRIORITY_LABELS[a.priority]}</span></td>
                          <td>{displayResponsible(a)}</td>
                          <td>
                            {formatDate(a.dueDate)}
                            {overdue ? <span className="badge badge--danger">VENCIDA</span> : null}
                          </td>
                          <td><span className={`badge ${MIA_STATUS_VARIANTS[a.status]}`}>{MIA_STATUS_LABELS[a.status]}</span></td>
                          <td>
                            {fu ? (
                              <span className={`badge ${MIA_IMPLEMENTATION_STATUS_VARIANTS[fu.implementationStatus ?? 'NOT_STARTED']}`}>
                                {fu.implementationStatus ? MIA_IMPLEMENTATION_STATUS_LABELS[fu.implementationStatus] : 'Seguimiento sin estado'}
                              </span>
                            ) : (
                              <span className="badge badge--warning">Sin seguimiento</span>
                            )}
                          </td>
                          <td>{a.evidence ? '✅' : '—'}</td>
                          <td>
                            <div className="actions">
                              <Button variant="ghost" onClick={() => setDetailActionId(a._id)}>Ver</Button>
                              {writable && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? (
                                <Button variant="secondary" onClick={() => setFormModal({ mode: 'edit', action: a })}>Editar</Button>
                              ) : null}
                              {writable && MIA_VALID_TRANSITIONS[a.status].length > 0
                                ? MIA_VALID_TRANSITIONS[a.status].map((next) => (
                                    <Button
                                      key={next}
                                      variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                      onClick={() => setStatusModal({ action: a, next })}
                                    >
                                      {MIA_TRANSITION_LABELS[next] ?? next}
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
      {detailActionId ? (
        <MiaActionDetail
          token={token}
          writable={writable}
          actionId={detailActionId}
          revision={detailRevision}
          users={users}
          onError={(msg) => setBanner(`Error: ${msg}`)}
          onClose={() => setDetailActionId(null)}
          onEdit={() => {
            const a = actionById(detailActionId);
            if (a) setFormModal({ mode: 'edit', action: a });
          }}
          onStatus={(a, next) => setStatusModal({ action: a, next })}
          onEvidence={(a) => setEvidenceModal({ action: a })}
          onFollowUp={(a) => setFollowUpModal({ action: a })}
        />
      ) : null}

      {/* ══════════════ MODALES ══════════════ */}

      {formModal ? (
        <MiaActionFormModal
          token={token}
          mode={formModal.mode}
          action={formModal.mode === 'edit' ? formModal.action : null}
          users={users}
          onClose={() => setFormModal(null)}
          onSaved={async (saved) => {
            setFormModal(null);
            await loadActions();
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner(
              saved.status === 'PENDING'
                ? 'Acción creada como Pendiente. Al ejecutarla registre la fecha de ejecución para poder completarla.'
                : 'Acción guardada.',
            );
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {statusModal ? (
        <Modal
          isOpen
          title={`${MIA_TRANSITION_LABELS[statusModal.next] ?? statusModal.next} — ${statusModal.action.title}`}
          onClose={() => setStatusModal(null)}
        >
          <p>
            Cambiará el estado de <strong>{MIA_STATUS_LABELS[statusModal.action.status]}</strong> a{' '}
            <strong>{MIA_STATUS_LABELS[statusModal.next]}</strong>.
            {statusModal.next === 'COMPLETED'
              ? ' Al completar la acción se registra su cierre y responsable de cierre. El backend exige fecha de ejecución registrada; una acción COMPLETED queda en solo lectura.'
              : statusModal.next === 'CANCELLED'
                ? ' Una acción CANCELLED queda en solo lectura y no puede reactivarse.'
                : ''}
          </p>
          {statusModal.next === 'COMPLETED' && !statusModal.action.executionDate ? (
            <p className="error">⚠️ Esta acción no tiene fecha de ejecución: edítela y regístrela antes de completar.</p>
          ) : null}
          <div className="actions">
            <Button variant="secondary" onClick={() => setStatusModal(null)}>Cancelar</Button>
            <Button
              variant={statusModal.next === 'CANCELLED' ? 'danger' : 'primary'}
              disabled={saving || (statusModal.next === 'COMPLETED' && !statusModal.action.executionDate)}
              onClick={() => void handleStatusChange()}
            >
              {saving ? 'Aplicando…' : 'Confirmar'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {evidenceModal ? (
        <MiaEvidenceModal
          token={token}
          action={evidenceModal.action}
          onClose={() => setEvidenceModal(null)}
          onSaved={async (updated) => {
            setEvidenceModal(null);
            setActions((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Evidencia registrada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {followUpModal ? (
        <MiaFollowUpModal
          token={token}
          action={followUpModal.action}
          onClose={() => setFollowUpModal(null)}
          onSaved={async (updated) => {
            setFollowUpModal(null);
            setActions((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Seguimiento registrado.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}
    </AdvancedPageLayout>
  );
}

// ═══════════════════════════ Detalle de acción ═══════════════════════════

function MiaActionDetail(props: {
  token: string;
  writable: boolean;
  actionId: string;
  revision: number;
  users: UserModel[];
  onClose: () => void;
  onEdit: () => void;
  onStatus: (action: ManagementImprovementActionModel, next: ImprovementActionStatus) => void;
  onEvidence: (action: ManagementImprovementActionModel) => void;
  onFollowUp: (action: ManagementImprovementActionModel) => void;
  onError: (message: string) => void;
}) {
  const { token, writable, actionId, revision, users, onClose, onEdit, onStatus, onEvidence, onFollowUp, onError } = props;
  const [action, setAction] = useState<ManagementImprovementActionModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<MiaHistoryModel[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchMiaAction(token, actionId);
        if (!cancelled) setAction(detail);
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
  }, [token, actionId, revision]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchMiaActionHistory(token, actionId);
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
      <Modal isOpen title="Detalle de la acción de mejora" onClose={onClose}>
        <p>Cargando…</p>
      </Modal>
    );
  }
  if (!action) {
    return (
      <Modal isOpen title="Detalle de la acción de mejora" onClose={onClose}>
        <p>No fue posible cargar la acción.</p>
      </Modal>
    );
  }

  const readOnly = action.status === 'COMPLETED' || action.status === 'CANCELLED';
  const fu = action.followUp;
  const responsibleName =
    action.responsibleSnapshot ||
    (action.responsibleUserId
      ? users.find((u) => u._id === action.responsibleUserId)
        ? `${users.find((u) => u._id === action.responsibleUserId)!.firstName} ${users.find((u) => u._id === action.responsibleUserId)!.lastName}`.trim()
        : action.responsibleUserId
      : '—');

  return (
    <Modal isOpen title={`${action.actionCode ? `${action.actionCode} — ` : ''}${action.title}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <div>
          <span className={`badge ${MIA_STATUS_VARIANTS[action.status]}`}>{MIA_STATUS_LABELS[action.status]}</span>{' '}
          <span className={`badge ${MIA_PRIORITY_VARIANTS[action.priority]}`}>{MIA_PRIORITY_LABELS[action.priority]}</span>{' '}
          {isMiaActionOverdue(action) ? <span className="badge badge--danger">VENCIDA</span> : null}
          {readOnly ? <span className="badge badge--warning">🔒 Solo lectura</span> : null}
        </div>

        <h4>Información general</h4>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Origen:</strong> {MIA_ORIGIN_LABELS[action.origin]}</p>
            <p style={{ margin: 0 }}><strong>Responsable:</strong> {responsibleName}</p>
            <p style={{ margin: 0 }}><strong>Prioridad:</strong> {MIA_PRIORITY_LABELS[action.priority]}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Planificada:</strong> {formatDate(action.plannedDate)}</p>
            <p style={{ margin: 0 }}><strong>Límite:</strong> {formatDate(action.dueDate)}</p>
            <p style={{ margin: 0 }}><strong>Ejecución:</strong> {formatDate(action.executionDate)}</p>
            <p style={{ margin: 0 }}><strong>Cierre:</strong> {formatDate(action.closureDate)}{action.closedBySnapshot ? ` · ${action.closedBySnapshot}` : ''}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Descripción:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{action.description}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Decisión que origina la acción:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{action.decisionReference || '—'}</p>
            {action.originReferenceId ? (
              <p style={{ margin: 0 }}><strong>Referencia del origen:</strong> {String(action.originReferenceId)}</p>
            ) : null}
          </div>
        </div>

        <h4>Seguimiento</h4>
        {fu ? (
          <div className="card">
            {fu.implementationStatus ? (
              <p style={{ margin: 0 }}>
                <span className={`badge ${MIA_IMPLEMENTATION_STATUS_VARIANTS[fu.implementationStatus]}`}>
                  {MIA_IMPLEMENTATION_STATUS_LABELS[fu.implementationStatus]}
                </span>
              </p>
            ) : null}
            {fu.perceivedEffectiveness ? (
              <p style={{ margin: 0 }}>
                <strong>Percepción de efectividad:</strong>{' '}
                <span className={`badge ${MIA_PERCEIVED_EFFECTIVENESS_VARIANTS[fu.perceivedEffectiveness]}`}>
                  {MIA_PERCEIVED_EFFECTIVENESS_LABELS[fu.perceivedEffectiveness]}
                </span>{' '}
                <span className="muted">(resultado declarado del seguimiento)</span>
              </p>
            ) : null}
            <p style={{ margin: 0 }}><strong>Último seguimiento:</strong> {formatDate(fu.lastFollowUpDate)}</p>
            {fu.requiresContinuedFollowUp === true ? (
              <p style={{ margin: 0 }}><span className="badge badge--warning">Requiere seguimiento adicional</span></p>
            ) : null}
            {fu.observations ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>Observaciones: {fu.observations}</p> : null}
          </div>
        ) : (
          <p style={{ margin: 0 }}><span className="badge badge--warning">Sin seguimiento registrado</span></p>
        )}

        <h4>Evidencia</h4>
        {action.evidence ? (
          <div className="card">
            <p style={{ margin: 0 }}><strong>Evidencia registrada</strong></p>
            {action.evidence.documentSnapshot ? <p style={{ margin: 0 }}>Documento: {action.evidence.documentSnapshot}</p> : null}
            {action.evidence.evidenceUrl ? (
              <p style={{ margin: 0 }}>
                URL: <a href={action.evidence.evidenceUrl} target="_blank" rel="noreferrer">{action.evidence.evidenceUrl}</a>
              </p>
            ) : null}
            {action.evidence.comment ? <p style={{ margin: 0 }}>Comentario: {action.evidence.comment}</p> : null}
          </div>
        ) : (
          <p style={{ margin: 0 }}>Sin evidencia.</p>
        )}

        {writable ? (
          <div className="actions">
            {!readOnly ? <Button variant="secondary" onClick={onEdit}>Editar</Button> : null}
            {!readOnly ? <Button variant="secondary" onClick={() => onEvidence(action)}>Evidencia</Button> : null}
            {!readOnly ? <Button variant="secondary" onClick={() => onFollowUp(action)}>Registrar seguimiento</Button> : null}
            {MIA_VALID_TRANSITIONS[action.status].map((next) => (
              <Button
                key={next}
                variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                onClick={() => onStatus(action, next)}
              >
                {MIA_TRANSITION_LABELS[next] ?? next}
              </Button>
            ))}
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
                <tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Detalles</th></tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const message = typeof h.details?.message === 'string' ? h.details.message : '';
                  const before = h.before as { status?: string } | undefined;
                  const after = h.after as { status?: string } | undefined;
                  const transition = before?.status && after?.status ? `${before.status} → ${after.status}` : '';
                  return (
                    <tr key={h._id}>
                      <td>{new Date(h.createdAt).toLocaleString()}</td>
                      <td>{MIA_HISTORY_ACTION_LABELS[h.action] ?? h.action}</td>
                      <td>{h.actorSnapshot}</td>
                      <td>{message || transition || '—'}</td>
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

// ═══════════════════════════ Formulario de acción ═══════════════════════════

type MiaFormState = {
  actionCode: string;
  title: string;
  description: string;
  origin: ImprovementActionOrigin;
  originReferenceId: string;
  decisionReference: string;
  priority: ImprovementActionPriority;
  responsibleUserId: string;
  plannedDate: string;
  dueDate: string;
  executionDate: string;
};

function emptyForm(): MiaFormState {
  return {
    actionCode: '',
    title: '',
    description: '',
    origin: 'OTHER',
    originReferenceId: '',
    decisionReference: '',
    priority: 'MEDIUM',
    responsibleUserId: '',
    plannedDate: '',
    dueDate: '',
    executionDate: '',
  };
}

function formFrom(a: ManagementImprovementActionModel): MiaFormState {
  const iso = (v?: string) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  return {
    actionCode: a.actionCode ?? '',
    title: a.title,
    description: a.description,
    origin: a.origin,
    originReferenceId: a.originReferenceId ?? '',
    decisionReference: a.decisionReference ?? '',
    priority: a.priority,
    responsibleUserId: a.responsibleUserId,
    plannedDate: iso(a.plannedDate),
    dueDate: iso(a.dueDate),
    executionDate: iso(a.executionDate),
  };
}

/**
 * Formulario de creación/edición (PATCH de contenido). NUNCA envía companyId/
 * createdBy/updatedBy/status/evidence/followUp/closure: el backend los resuelve
 * server-side (forbidNonWhitelisted) y el formulario ni los expone. Las
 * validaciones aquí son UX; las de seguridad y máquina de estados viven en el
 * backend.
 */
function MiaActionFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  action: ManagementImprovementActionModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (saved: ManagementImprovementActionModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, mode, action, users, onClose, onSaved, onError } = props;
  const [form, setForm] = useState<MiaFormState>(action ? formFrom(action) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof MiaFormState>(key: K, value: MiaFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título de la acción es requerido.';
    if (!form.description.trim()) return 'La descripción de la acción es requerida.';
    if (!form.origin) return 'El origen de la acción es requerido (use "Otro" si no proviene de un módulo).';
    if (!form.responsibleUserId) return 'El responsable de la acción es requerido.';
    if (!isISODate(form.dueDate)) return 'La fecha límite es inválida o está vacía.';
    if (form.plannedDate) {
      if (!isISODate(form.plannedDate)) return 'La fecha planificada es inválida.';
      if (Date.parse(form.plannedDate) > Date.parse(form.dueDate)) {
        return 'La fecha planificada no puede ser posterior a la fecha límite.';
      }
    }
    if (form.executionDate) {
      if (!isISODate(form.executionDate)) return 'La fecha de ejecución es inválida.';
      if (Date.parse(form.executionDate) > Date.now()) return 'La fecha de ejecución no puede ser futura.';
      if (form.plannedDate && Date.parse(form.executionDate) < Date.parse(form.plannedDate)) {
        return 'La fecha de ejecución no puede ser anterior a la fecha planificada.';
      }
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
      if (mode === 'create') {
        const payload: CreateMiaActionPayload = {
          ...(form.actionCode.trim() ? { actionCode: form.actionCode.trim() } : {}),
          title: form.title.trim(),
          description: form.description.trim(),
          origin: form.origin,
          ...(form.originReferenceId ? { originReferenceId: form.originReferenceId } : {}),
          ...(form.decisionReference.trim() ? { decisionReference: form.decisionReference.trim() } : {}),
          ...(form.priority ? { priority: form.priority } : {}),
          responsibleUserId: form.responsibleUserId,
          ...(form.plannedDate ? { plannedDate: form.plannedDate } : {}),
          dueDate: form.dueDate,
        };
        const saved = await createMiaAction(token, payload);
        await onSaved(saved);
      } else {
        const payload = {
          ...(form.actionCode.trim() ? { actionCode: form.actionCode.trim() } : {}),
          title: form.title.trim(),
          description: form.description.trim(),
          origin: form.origin,
          ...(form.originReferenceId ? { originReferenceId: form.originReferenceId } : { originReferenceId: undefined }),
          ...(form.decisionReference.trim() ? { decisionReference: form.decisionReference.trim() } : { decisionReference: undefined }),
          ...(form.priority ? { priority: form.priority } : {}),
          responsibleUserId: form.responsibleUserId,
          ...(form.plannedDate ? { plannedDate: form.plannedDate } : { plannedDate: undefined }),
          dueDate: form.dueDate,
          ...(form.executionDate ? { executionDate: form.executionDate } : { executionDate: undefined }),
        };
        const saved = await updateMiaAction(token, action!._id, payload);
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
      title={mode === 'create' ? 'Nueva acción de mejora de la alta dirección' : 'Editar acción de mejora'}
      onClose={onClose}
    >
      <div className="form-grid">
        <label htmlFor="mia-code">Código (opcional)</label>
        <Input id="mia-code" value={form.actionCode} onChange={(e) => set('actionCode', e.target.value)} placeholder="Ej: AM-2026-01" maxLength={100} />
        <label htmlFor="mia-title">Título *</label>
        <Input id="mia-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={300} required />
        <label htmlFor="mia-desc">Descripción *</label>
        <textarea id="mia-desc" className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} required />
        <label htmlFor="mia-origin">Origen *</label>
        <Select id="mia-origin" value={form.origin} onChange={(e) => set('origin', e.target.value as ImprovementActionOrigin)} required>
          {(Object.keys(MIA_ORIGIN_LABELS) as ImprovementActionOrigin[]).map((o) => (
            <option key={o} value={o}>{MIA_ORIGIN_LABELS[o]}</option>
          ))}
        </Select>
        <label htmlFor="mia-originref">Referencia del origen (opcional)</label>
        <Input id="mia-originref" value={form.originReferenceId} onChange={(e) => set('originReferenceId', e.target.value)} placeholder="ObjectId del documento origen (trazabilidad declarativa)" />
        <label htmlFor="mia-decision">Decisión que origina la acción</label>
        <textarea id="mia-decision" className="input" rows={2} value={form.decisionReference} onChange={(e) => set('decisionReference', e.target.value)} maxLength={2000} placeholder="Ej: Acta 2026-01 — aprobar el plan de recursos del SG-SST" />
        <label htmlFor="mia-priority">Prioridad</label>
        <Select id="mia-priority" value={form.priority} onChange={(e) => set('priority', e.target.value as ImprovementActionPriority)}>
          {(Object.keys(MIA_PRIORITY_LABELS) as ImprovementActionPriority[]).map((p) => (
            <option key={p} value={p}>{MIA_PRIORITY_LABELS[p]}</option>
          ))}
        </Select>
        <label htmlFor="mia-responsible">Responsable *</label>
        <Select id="mia-responsible" value={form.responsibleUserId} onChange={(e) => set('responsibleUserId', e.target.value)} required>
          <option value="">Seleccione el responsable</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
        <label htmlFor="mia-planned">Fecha planificada</label>
        <Input id="mia-planned" type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} />
        <label htmlFor="mia-due">Fecha límite *</label>
        <Input id="mia-due" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} required />
        {mode === 'edit' ? (
          <>
            <label htmlFor="mia-exec">Fecha de ejecución (requerida para completar)</label>
            <Input id="mia-exec" type="date" value={form.executionDate} onChange={(e) => set('executionDate', e.target.value)} />
          </>
        ) : null}
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Guardando…' : mode === 'create' ? 'Crear acción' : 'Guardar cambios'}
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Evidencia ═══════════════════════════

function MiaEvidenceModal(props: {
  token: string;
  action: ManagementImprovementActionModel;
  onClose: () => void;
  onSaved: (updated: ManagementImprovementActionModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, action, onClose, onSaved, onError } = props;
  const [documentId, setDocumentId] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [comment, setComment] = useState('');
  const [replace, setReplace] = useState(true);
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
      const updated = await addMiaActionEvidence(token, action._id, {
        ...(documentId.trim() ? { documentId: documentId.trim() } : {}),
        ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        replace,
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
    <Modal isOpen title={`Evidencia — ${action.title}`} onClose={onClose}>
      {action.evidence ? (
        <p className="muted">
          Evidencia registrada: {action.evidence.documentSnapshot || action.evidence.evidenceUrl || '—'}.{' '}
          Marque «reemplazar» para sustituirla; desmáquelo para conservar la existente.
        </p>
      ) : null}
      <div className="form-grid">
        <label htmlFor="mia-ev-doc">documentId (Gestión documental, opcional)</label>
        <Input id="mia-ev-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="ObjectId del documento" />
        <label htmlFor="mia-ev-url">URL de evidencia (opcional)</label>
        <Input id="mia-ev-url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://…" />
        <label htmlFor="mia-ev-comment">Comentario</label>
        <textarea id="mia-ev-comment" className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
        <label htmlFor="mia-ev-replace">Reemplazar evidencia existente</label>
        <Select id="mia-ev-replace" value={replace ? 'yes' : 'no'} onChange={(e) => setReplace(e.target.value === 'yes')}>
          <option value="yes">Sí — la última evidencia es la vigente</option>
          <option value="no">No — conservar la existente</option>
        </Select>
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar evidencia'}</Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Seguimiento (follow-up) ═══════════════════════════

function MiaFollowUpModal(props: {
  token: string;
  action: ManagementImprovementActionModel;
  onClose: () => void;
  onSaved: (updated: ManagementImprovementActionModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, action, onClose, onSaved, onError } = props;
  const [lastFollowUpDate, setLastFollowUpDate] = useState('');
  const [implementationStatus, setImplementationStatus] = useState<ImplementationStatus | ''>('ON_TRACK');
  const [perceivedEffectiveness, setPerceivedEffectiveness] = useState<PerceivedEffectiveness | ''>('');
  const [requiresContinuedFollowUp, setRequiresContinuedFollowUp] = useState<boolean>(true);
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (lastFollowUpDate && !isISODate(lastFollowUpDate)) {
      setFormError('La fecha de seguimiento es inválida.');
      return;
    }
    if (lastFollowUpDate && Date.parse(lastFollowUpDate) > Date.now()) {
      setFormError('La fecha de seguimiento no puede ser futura.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await registerMiaActionFollowUp(token, action._id, {
        ...(lastFollowUpDate ? { lastFollowUpDate } : {}),
        ...(implementationStatus ? { implementationStatus } : {}),
        ...(perceivedEffectiveness ? { perceivedEffectiveness } : {}),
        requiresContinuedFollowUp,
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
    <Modal isOpen title={`Registrar seguimiento — ${action.title}`} onClose={onClose}>
      <p className="muted">
        El seguimiento documenta la implementación y la percepción de efectividad de la acción de mejora
        (resultado declarado). No es una verificación formal de eficacia — esa es la frontera del estándar 7.1.1.
      </p>
      <div className="form-grid">
        <label htmlFor="mia-fu-date">Fecha de seguimiento (opcional — default: hoy)</label>
        <Input id="mia-fu-date" type="date" value={lastFollowUpDate} onChange={(e) => setLastFollowUpDate(e.target.value)} />
        <label htmlFor="mia-fu-impl">Estado de implementación</label>
        <Select id="mia-fu-impl" value={implementationStatus} onChange={(e) => setImplementationStatus(e.target.value as ImplementationStatus | '')}>
          <option value="">Sin estado</option>
          {(Object.keys(MIA_IMPLEMENTATION_STATUS_LABELS) as ImplementationStatus[]).map((s) => (
            <option key={s} value={s}>{MIA_IMPLEMENTATION_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <label htmlFor="mia-fu-eff">Percepción de efectividad</label>
        <Select id="mia-fu-eff" value={perceivedEffectiveness} onChange={(e) => setPerceivedEffectiveness(e.target.value as PerceivedEffectiveness | '')}>
          <option value="">Sin concluir</option>
          {(Object.keys(MIA_PERCEIVED_EFFECTIVENESS_LABELS) as PerceivedEffectiveness[]).map((r) => (
            <option key={r} value={r}>{MIA_PERCEIVED_EFFECTIVENESS_LABELS[r]}</option>
          ))}
        </Select>
        <label htmlFor="mia-fu-continued">¿Requiere seguimiento adicional?</label>
        <Select id="mia-fu-continued" value={requiresContinuedFollowUp ? 'yes' : 'no'} onChange={(e) => setRequiresContinuedFollowUp(e.target.value === 'yes')}>
          <option value="yes">Sí — mantener en seguimiento</option>
          <option value="no">No — seguimiento concluido</option>
        </Select>
        <label htmlFor="mia-fu-obs">Observaciones</label>
        <textarea id="mia-fu-obs" className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={2000} />
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar seguimiento'}</Button>
      </div>
    </Modal>
  );
}
