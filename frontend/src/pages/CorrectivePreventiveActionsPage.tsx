import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type CorrectivePreventiveActionModel,
  type ActionItemType,
  type ActionOrigin,
  type ActionPriority,
  type ActionStatus,
  type EffectivenessResult,
  type CpaHistoryModel,
  type CreateCpaActionPayload,
  type UserModel,
  fetchCpaActions,
  fetchCpaAction,
  createCpaAction,
  updateCpaAction,
  updateCpaActionStatus,
  addCpaActionEvidence,
  verifyCpaActionEffectiveness,
  fetchCpaActionHistory,
  fetchAdmins,
  fetchMembers,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  isCpaComplianceMetadataV1,
  cpaRatioToPercent,
  isCpaActionOverdue,
  CPA_DIMENSION_KEYS,
  CPA_DIMENSION_LABELS,
  CPA_DIMENSION_WEIGHT_FALLBACK,
  CPA_TYPE_LABELS,
  CPA_ORIGIN_LABELS,
  CPA_PRIORITY_LABELS,
  CPA_STATUS_LABELS,
  CPA_EFFECTIVENESS_LABELS,
  CPA_STATUS_VARIANTS,
  CPA_PRIORITY_VARIANTS,
  CPA_EFFECTIVENESS_VARIANTS,
  CPA_VALID_TRANSITIONS,
  CPA_TRANSITION_LABELS,
  CPA_HISTORY_ACTION_LABELS,
  CPA_FINDING_ACTIONS,
  type CpaComplianceMetadataV1,
} from '../types/corrective-preventive-actions';
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
// E4 (7.1.1): IA complementaria — interpreta el resultado oficial; si falla,
// el componente no bloquea la página (fallback interno tolerante).
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';

/**
 * E3 (7.1.1) — Gestión Avanzada de Acciones preventivas y correctivas.
 *
 * REGLA DE SCORE: el frontend NO calcula el cumplimiento. Porcentaje, estado,
 * nivel y metadata dimensional provienen exclusivamente de
 * GET /compliance-engine/overview (module === 'corrective-preventive-actions',
 * dimensions:v1 — provider oficial E2). `cpaRatioToPercent` es solo
 * presentación visual. `isCpaActionOverdue` replica la regla OFICIAL derivada
 * del scorer (dueDate < now && estado no terminal) — SOLO presentación,
 * nunca se envía al backend.
 *
 * COMPLETED ≠ eficacia verificada: la distinción es visible en el listado,
 * los KPIs y el detalle (verificación de eficacia es un paso posterior
 * exclusivo de acciones COMPLETED).
 *
 * Roles (E1): lectura owner/admin/manager; member SIN acceso; escritura
 * owner/admin (el backend es la autoridad — aquí solo se ocultan acciones).
 * El estado SOLO cambia por PATCH /:id/status (transiciones válidas espejo);
 * la evidencia por POST /:id/evidence; la eficacia por POST /:id/effectiveness.
 */

interface CorrectivePreventiveActionsPageProps {
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

export function CorrectivePreventiveActionsPage({ token, role }: CorrectivePreventiveActionsPageProps) {
  const writable = canWrite(role);
  const [activeTab, setActiveTab] = useState<string>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Datos
  const [actions, setActions] = useState<CorrectivePreventiveActionModel[]>([]);
  const [users, setUsers] = useState<UserModel[]>([]);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<CpaComplianceMetadataV1 | null>(null);

  // Filtros del tab Acciones
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterOrigin, setFilterOrigin] = useState<string>('');
  const [filterOverdue, setFilterOverdue] = useState<string>('');
  const [filterEffectiveness, setFilterEffectiveness] = useState<string>('');

  // Estado de guardado
  const [saving, setSaving] = useState(false);
  /** Se incrementa con cada mutación → el detalle abierto se refresca. */
  const [detailRevision, setDetailRevision] = useState(0);

  // Modales
  const [formModal, setFormModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; action: CorrectivePreventiveActionModel }
    | null
  >(null);
  const [detailActionId, setDetailActionId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<
    | { action: CorrectivePreventiveActionModel; next: ActionStatus }
    | null
  >(null);
  const [evidenceModal, setEvidenceModal] = useState<
    | { action: CorrectivePreventiveActionModel }
    | null
  >(null);
  const [effectivenessModal, setEffectivenessModal] = useState<
    | { action: CorrectivePreventiveActionModel }
    | null
  >(null);

  // ─── Carga (tolerante: compliance falla ≠ romper la gestión) ────────────
  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === 'corrective-preventive-actions') ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isCpaComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === 'corrective-preventive-actions'));
  }, [token]);

  const loadActions = useCallback(async () => {
    setActions(await fetchCpaActions(token).catch(() => []));
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
          fetchCpaActions(token),
          getOverview(token, '').catch(() => null),
        ]);
        if (cancelled) return;
        setActions(list);
        const moduleCompliance =
          overview?.moduleCompliance?.find((m) => m.module === 'corrective-preventive-actions') ?? null;
        setCompliance(moduleCompliance);
        setMetadata(
          moduleCompliance && isCpaComplianceMetadataV1(moduleCompliance.metadata)
            ? moduleCompliance.metadata
            : null,
        );
        setFindings((overview?.findings ?? []).filter((f) => f.module === 'corrective-preventive-actions'));
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
    (a: CorrectivePreventiveActionModel) =>
      a.responsibleSnapshot ||
      (a.responsibleUserId ? userNameById.get(a.responsibleUserId) ?? a.responsibleUserId : '—'),
    [userNameById],
  );

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (filterStatus && a.status !== filterStatus) return false;
      if (filterType && a.type !== filterType) return false;
      if (filterPriority && a.priority !== filterPriority) return false;
      if (filterOrigin && a.origin !== filterOrigin) return false;
      if (filterOverdue === 'yes' && !isCpaActionOverdue(a)) return false;
      if (filterOverdue === 'no' && isCpaActionOverdue(a)) return false;
      if (filterEffectiveness === 'verified' && a.effectivenessVerification?.verified !== true) return false;
      if (filterEffectiveness === 'unverified' && a.effectivenessVerification?.verified === true) return false;
      if (filterEffectiveness === 'EFECTIVA' && a.effectivenessVerification?.result !== 'EFECTIVA') return false;
      if (filterEffectiveness === 'NO_EFECTIVA' && a.effectivenessVerification?.result !== 'NO_EFECTIVA') return false;
      return true;
    });
  }, [actions, filterStatus, filterType, filterPriority, filterOrigin, filterOverdue, filterEffectiveness]);

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
      await updateCpaActionStatus(token, statusModal.action._id, { status: statusModal.next });
      const next = statusModal.next;
      setStatusModal(null);
      await Promise.all([loadActions(), loadCompliance()]);
      setDetailRevision((r) => r + 1);
      setBanner(`Estado actualizado a ${CPA_STATUS_LABELS[next]}.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const goToFindingAction = (findingId: string) => {
    const action = CPA_FINDING_ACTIONS[findingId];
    if (action) setActiveTab(action.tab);
  };

  const actionById = useCallback((id: string) => actions.find((a) => a._id === id) ?? null, [actions]);

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/act"
        backLabel="← Volver a Actuar"
        moduleCode="7.1.1"
        moduleTitle="Acciones preventivas y correctivas"
        description="Acciones preventivas y correctivas definidas, ejecutadas y verificadas para evitar recurrencias."
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
            label: 'Cumplimiento oficial 7.1.1',
            value: loading ? '…' : status === 'NO_DATA' ? 'Sin datos' : percentage === null ? 'N/D' : `${percentage}%`,
            variant: status === 'TARGET_MET' ? 'success' : status === 'NO_DATA' || compliance === null ? 'warning' : 'danger',
          },
          { label: 'Total acciones', value: counters?.totalActions ?? actions.length, variant: 'info' },
          { label: 'Pendientes', value: counters?.pendingActions ?? actions.filter((a) => a.status === 'PENDING').length, variant: 'warning' },
          { label: 'Vencidas', value: counters?.overdueActions ?? 0, variant: 'danger' },
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
              title="Cumplimiento oficial — 7.1.1"
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
                          ? 'Sin datos evaluables — todavía no existen acciones preventivas/correctivas registradas.'
                          : `${percentage ?? 0}%`}
                      </strong>
                      <p style={{ margin: 0 }}>
                        Estado: {status ?? '—'} · Nivel: {compliance.level} ·{' '}
                        Período evaluado: {metadata?.evaluatedPeriod ?? '—'}
                      </p>
                    </div>
                    <div className="card">
                      <strong>Gestión de la eficacia</strong>
                      <p style={{ margin: 0 }}>
                        Completadas: {counters?.completedActions ?? 0} · Con verificación: {counters?.actionsWithEffectiveness ?? 0} ·{' '}
                        Efectivas: {counters?.effectiveActions ?? 0} · No efectivas: {counters?.ineffectiveActions ?? 0} ·{' '}
                        Requieren nueva acción: {counters?.actionsRequiringNewAction ?? 0}
                      </p>
                      <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                        Una acción COMPLETED no necesariamente está verificada como EFECTIVA — la verificación
                        de eficacia es un paso posterior exclusivo de acciones completadas.
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
                          {CPA_DIMENSION_KEYS.map((key) => {
                            const dim = metadata.dimensions[key];
                            const pct = cpaRatioToPercent(dim?.ratio);
                            const subchecks = dim?.subchecks;
                            const detailText = subchecks
                              ? `Subcondiciones: ${subchecks.satisfied}/${subchecks.total}`
                              : key === 'continuity' && dim?.ratio === null
                                ? 'Una sola vigencia — redistribuida (no penaliza)'
                                : '';
                            return (
                              <tr key={key}>
                                <td>{CPA_DIMENSION_LABELS[key]}</td>
                                <td>{pct === null ? 'No evaluable' : `${pct}%`}</td>
                                <td>{dim?.weight ?? CPA_DIMENSION_WEIGHT_FALLBACK[key]}%</td>
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
                        const action = CPA_FINDING_ACTIONS[f.id];
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

                  {/* IA 7.1.1 — sección claramente diferenciada del resultado
                      oficial; su fallo no afecta la gestión. */}
                  <ComplianceAIInsight token={token} standardCode="7.1.1" />
                </>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ ACCIONES ══════════════ */}
          {activeTab === 'acciones' && (
            <AdvancedSection
              title="Acciones preventivas y correctivas"
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
                  {(Object.keys(CPA_STATUS_LABELS) as ActionStatus[]).map((s) => (
                    <option key={s} value={s}>{CPA_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Tipo">
                  <option value="">Todos los tipos</option>
                  {(Object.keys(CPA_TYPE_LABELS) as ActionItemType[]).map((t) => (
                    <option key={t} value={t}>{CPA_TYPE_LABELS[t]}</option>
                  ))}
                </Select>
                <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} aria-label="Prioridad">
                  <option value="">Todas las prioridades</option>
                  {(Object.keys(CPA_PRIORITY_LABELS) as ActionPriority[]).map((p) => (
                    <option key={p} value={p}>{CPA_PRIORITY_LABELS[p]}</option>
                  ))}
                </Select>
                <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)} aria-label="Origen">
                  <option value="">Todos los orígenes</option>
                  {(Object.keys(CPA_ORIGIN_LABELS) as ActionOrigin[]).map((o) => (
                    <option key={o} value={o}>{CPA_ORIGIN_LABELS[o]}</option>
                  ))}
                </Select>
                <Select value={filterOverdue} onChange={(e) => setFilterOverdue(e.target.value)} aria-label="Vencidas">
                  <option value="">Vencimiento: todas</option>
                  <option value="yes">Solo vencidas</option>
                  <option value="no">Sin vencer</option>
                </Select>
                <Select value={filterEffectiveness} onChange={(e) => setFilterEffectiveness(e.target.value)} aria-label="Eficacia">
                  <option value="">Eficacia: todas</option>
                  <option value="verified">Verificadas</option>
                  <option value="unverified">Sin verificar</option>
                  <option value="EFECTIVA">Efectivas</option>
                  <option value="NO_EFECTIVA">No efectivas</option>
                </Select>
              </div>

              <Table>
                <thead>
                  <tr>
                    <th>Código</th><th>Título</th><th>Tipo</th><th>Origen</th><th>Prioridad</th><th>Responsable</th>
                    <th>Compromiso</th><th>Estado</th><th>Evidencia</th><th>Eficacia</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActions.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        {actions.length === 0
                          ? 'No hay acciones preventivas/correctivas registradas.'
                          : 'Sin resultados para los filtros aplicados.'}
                      </td>
                    </tr>
                  ) : (
                    filteredActions.map((a) => {
                      const overdue = isCpaActionOverdue(a);
                      const eff = a.effectivenessVerification;
                      return (
                        <tr key={a._id}>
                          <td>{a.actionCode || '—'}</td>
                          <td style={{ maxWidth: 220 }}>{a.title}</td>
                          <td>{CPA_TYPE_LABELS[a.type]}</td>
                          <td style={{ maxWidth: 180 }}>{CPA_ORIGIN_LABELS[a.origin]}</td>
                          <td><span className={`badge ${CPA_PRIORITY_VARIANTS[a.priority]}`}>{CPA_PRIORITY_LABELS[a.priority]}</span></td>
                          <td>{displayResponsible(a)}</td>
                          <td>
                            {formatDate(a.dueDate)}
                            {overdue ? <span className="badge badge--danger">VENCIDA</span> : null}
                          </td>
                          <td><span className={`badge ${CPA_STATUS_VARIANTS[a.status]}`}>{CPA_STATUS_LABELS[a.status]}</span></td>
                          <td>{a.evidence ? '✅' : '—'}</td>
                          <td>
                            {eff?.verified && eff.result ? (
                              <span className={`badge ${CPA_EFFECTIVENESS_VARIANTS[eff.result]}`}>{CPA_EFFECTIVENESS_LABELS[eff.result]}</span>
                            ) : a.status === 'COMPLETED' ? (
                              <span className="badge badge--warning">Sin verificar</span>
                            ) : '—'}
                          </td>
                          <td>
                            <div className="actions">
                              <Button variant="ghost" onClick={() => setDetailActionId(a._id)}>Ver</Button>
                              {writable && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? (
                                <Button variant="secondary" onClick={() => setFormModal({ mode: 'edit', action: a })}>Editar</Button>
                              ) : null}
                              {writable && CPA_VALID_TRANSITIONS[a.status].length > 0
                                ? CPA_VALID_TRANSITIONS[a.status].map((next) => (
                                    <Button
                                      key={next}
                                      variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                      onClick={() => setStatusModal({ action: a, next })}
                                    >
                                      {CPA_TRANSITION_LABELS[next] ?? next}
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
        <CpaActionDetail
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
          onEffectiveness={(a) => setEffectivenessModal({ action: a })}
        />
      ) : null}

      {/* ══════════════ MODALES ══════════════ */}

      {formModal ? (
        <CpaActionFormModal
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
          title={`${CPA_TRANSITION_LABELS[statusModal.next] ?? statusModal.next} — ${statusModal.action.title}`}
          onClose={() => setStatusModal(null)}
        >
          <p>
            Cambiará el estado de <strong>{CPA_STATUS_LABELS[statusModal.action.status]}</strong> a{' '}
            <strong>{CPA_STATUS_LABELS[statusModal.next]}</strong>.
            {statusModal.next === 'COMPLETED'
              ? ' El backend exige fecha de ejecución registrada; una acción COMPLETED queda en solo lectura (aún podrá verificar su eficacia).'
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
        <CpaEvidenceModal
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

      {effectivenessModal ? (
        <CpaEffectivenessModal
          token={token}
          action={effectivenessModal.action}
          onClose={() => setEffectivenessModal(null)}
          onSaved={async (updated) => {
            setEffectivenessModal(null);
            setActions((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Verificación de eficacia registrada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}
    </AdvancedPageLayout>
  );
}

// ═══════════════════════════ Detalle de acción ═══════════════════════════

function CpaActionDetail(props: {
  token: string;
  writable: boolean;
  actionId: string;
  revision: number;
  users: UserModel[];
  onClose: () => void;
  onEdit: () => void;
  onStatus: (action: CorrectivePreventiveActionModel, next: ActionStatus) => void;
  onEvidence: (action: CorrectivePreventiveActionModel) => void;
  onEffectiveness: (action: CorrectivePreventiveActionModel) => void;
  onError: (message: string) => void;
}) {
  const { token, writable, actionId, revision, users, onClose, onEdit, onStatus, onEvidence, onEffectiveness, onError } = props;
  const [action, setAction] = useState<CorrectivePreventiveActionModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CpaHistoryModel[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchCpaAction(token, actionId);
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
      const rows = await fetchCpaActionHistory(token, actionId);
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
      <Modal isOpen title="Detalle de la acción" onClose={onClose}>
        <p>Cargando…</p>
      </Modal>
    );
  }
  if (!action) {
    return (
      <Modal isOpen title="Detalle de la acción" onClose={onClose}>
        <p>No fue posible cargar la acción.</p>
      </Modal>
    );
  }

  const readOnly = action.status === 'COMPLETED' || action.status === 'CANCELLED';
  const eff = action.effectivenessVerification;
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
          <span className={`badge ${CPA_STATUS_VARIANTS[action.status]}`}>{CPA_STATUS_LABELS[action.status]}</span>{' '}
          <span className={`badge ${CPA_PRIORITY_VARIANTS[action.priority]}`}>{CPA_PRIORITY_LABELS[action.priority]}</span>{' '}
          {isCpaActionOverdue(action) ? <span className="badge badge--danger">VENCIDA</span> : null}
          {readOnly ? <span className="badge badge--warning">🔒 Solo lectura</span> : null}
        </div>

        <h4>Información general</h4>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Tipo:</strong> {CPA_TYPE_LABELS[action.type]}</p>
            <p style={{ margin: 0 }}><strong>Origen:</strong> {CPA_ORIGIN_LABELS[action.origin]}</p>
            <p style={{ margin: 0 }}><strong>Responsable:</strong> {responsibleName}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Planificada:</strong> {formatDate(action.plannedDate)}</p>
            <p style={{ margin: 0 }}><strong>Compromiso:</strong> {formatDate(action.dueDate)}</p>
            <p style={{ margin: 0 }}><strong>Ejecución:</strong> {formatDate(action.executionDate)}</p>
            <p style={{ margin: 0 }}><strong>Cierre:</strong> {formatDate(action.closureDate)}{action.closedBySnapshot ? ` · ${action.closedBySnapshot}` : ''}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Descripción:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{action.description}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Hallazgo:</strong> {action.finding || '—'}</p>
            <p style={{ margin: 0 }}><strong>Causa raíz:</strong> {action.rootCause || '—'}</p>
            <p style={{ margin: 0 }}><strong>Plan de acción:</strong> {action.actionPlan || '—'}</p>
          </div>
        </div>

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

        <h4>Verificación de eficacia</h4>
        {eff?.verified && eff.result ? (
          <div className="card">
            <span className={`badge ${CPA_EFFECTIVENESS_VARIANTS[eff.result]}`}>{CPA_EFFECTIVENESS_LABELS[eff.result]}</span>
            <p style={{ margin: 0 }}>
              Verificada: {formatDate(eff.verificationDate)} · Verificador: {eff.verifiedBySnapshot || '—'}
            </p>
            {eff.observations ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>Observaciones: {eff.observations}</p> : null}
          </div>
        ) : action.status === 'COMPLETED' ? (
          <p style={{ margin: 0 }}>
            <span className="badge badge--warning">Sin verificar</span>{' '}
            Completada ≠ eficaz: registre la verificación de eficacia para cerrar el ciclo del estándar.
          </p>
        ) : (
          <p style={{ margin: 0 }}>Sin verificar (disponible cuando la acción esté COMPLETED).</p>
        )}

        {writable ? (
          <div className="actions">
            {!readOnly ? <Button variant="secondary" onClick={onEdit}>Editar</Button> : null}
            {!readOnly ? <Button variant="secondary" onClick={() => onEvidence(action)}>Evidencia</Button> : null}
            {action.status === 'COMPLETED' ? <Button onClick={() => onEffectiveness(action)}>Verificar eficacia</Button> : null}
            {CPA_VALID_TRANSITIONS[action.status].map((next) => (
              <Button
                key={next}
                variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                onClick={() => onStatus(action, next)}
              >
                {CPA_TRANSITION_LABELS[next] ?? next}
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
                      <td>{CPA_HISTORY_ACTION_LABELS[h.action] ?? h.action}</td>
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

type CpaFormState = {
  actionCode: string;
  type: ActionItemType;
  title: string;
  description: string;
  origin: ActionOrigin;
  originReferenceId: string;
  finding: string;
  rootCause: string;
  actionPlan: string;
  priority: ActionPriority;
  responsibleUserId: string;
  plannedDate: string;
  dueDate: string;
  executionDate: string;
};

function emptyForm(): CpaFormState {
  return {
    actionCode: '',
    type: 'CORRECTIVE',
    title: '',
    description: '',
    origin: 'OTHER',
    originReferenceId: '',
    finding: '',
    rootCause: '',
    actionPlan: '',
    priority: 'MEDIUM',
    responsibleUserId: '',
    plannedDate: '',
    dueDate: '',
    executionDate: '',
  };
}

function formFrom(a: CorrectivePreventiveActionModel): CpaFormState {
  const iso = (v?: string) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  return {
    actionCode: a.actionCode ?? '',
    type: a.type,
    title: a.title,
    description: a.description,
    origin: a.origin,
    originReferenceId: a.originReferenceId ?? '',
    finding: a.finding ?? '',
    rootCause: a.rootCause ?? '',
    actionPlan: a.actionPlan ?? '',
    priority: a.priority,
    responsibleUserId: a.responsibleUserId,
    plannedDate: iso(a.plannedDate),
    dueDate: iso(a.dueDate),
    executionDate: iso(a.executionDate),
  };
}

/**
 * Formulario de creación/edición (PATCH de contenido). NUNCA envía companyId/
 * createdBy/updatedBy/status/effectivenessVerification/closure: el backend los
 * resuelve server-side (forbidNonWhitelisted) y el formulario ni los expone.
 * Las validaciones aquí son UX; las de seguridad y máquina de estados viven en
 * el backend.
 */
function CpaActionFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  action: CorrectivePreventiveActionModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (saved: CorrectivePreventiveActionModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, mode, action, users, onClose, onSaved, onError } = props;
  const [form, setForm] = useState<CpaFormState>(action ? formFrom(action) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof CpaFormState>(key: K, value: CpaFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!form.title.trim()) return 'El título de la acción es requerido.';
    if (!form.description.trim()) return 'La descripción de la acción es requerida.';
    if (!form.origin) return 'El origen de la acción es requerido (use "Otro" si no proviene de un módulo).';
    if (!form.responsibleUserId) return 'El responsable de la acción es requerido.';
    if (!isISODate(form.dueDate)) return 'La fecha compromiso es inválida o está vacía.';
    if (form.plannedDate) {
      if (!isISODate(form.plannedDate)) return 'La fecha planificada es inválida.';
      if (Date.parse(form.plannedDate) > Date.parse(form.dueDate)) {
        return 'La fecha planificada no puede ser posterior a la fecha compromiso.';
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
        const payload: CreateCpaActionPayload = {
          ...(form.actionCode.trim() ? { actionCode: form.actionCode.trim() } : {}),
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim(),
          origin: form.origin,
          ...(form.originReferenceId ? { originReferenceId: form.originReferenceId } : {}),
          ...(form.finding.trim() ? { finding: form.finding.trim() } : {}),
          ...(form.rootCause.trim() ? { rootCause: form.rootCause.trim() } : {}),
          ...(form.actionPlan.trim() ? { actionPlan: form.actionPlan.trim() } : {}),
          ...(form.priority ? { priority: form.priority } : {}),
          responsibleUserId: form.responsibleUserId,
          ...(form.plannedDate ? { plannedDate: form.plannedDate } : {}),
          dueDate: form.dueDate,
        };
        const saved = await createCpaAction(token, payload);
        await onSaved(saved);
      } else {
        const payload = {
          ...(form.actionCode.trim() ? { actionCode: form.actionCode.trim() } : {}),
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim(),
          origin: form.origin,
          ...(form.originReferenceId ? { originReferenceId: form.originReferenceId } : { originReferenceId: undefined }),
          ...(form.finding.trim() ? { finding: form.finding.trim() } : {}),
          ...(form.rootCause.trim() ? { rootCause: form.rootCause.trim() } : {}),
          ...(form.actionPlan.trim() ? { actionPlan: form.actionPlan.trim() } : {}),
          ...(form.priority ? { priority: form.priority } : {}),
          responsibleUserId: form.responsibleUserId,
          ...(form.plannedDate ? { plannedDate: form.plannedDate } : { plannedDate: undefined }),
          dueDate: form.dueDate,
          ...(form.executionDate ? { executionDate: form.executionDate } : { executionDate: undefined }),
        };
        const saved = await updateCpaAction(token, action!._id, payload);
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
      title={mode === 'create' ? 'Nueva acción preventiva/correctiva' : 'Editar acción'}
      onClose={onClose}
    >
      <div className="form-grid">
        <label htmlFor="cpa-code">Código (opcional)</label>
        <Input id="cpa-code" value={form.actionCode} onChange={(e) => set('actionCode', e.target.value)} placeholder="Ej: ACC-2026-01" maxLength={100} />
        <label htmlFor="cpa-type">Tipo *</label>
        <Select id="cpa-type" value={form.type} onChange={(e) => set('type', e.target.value as ActionItemType)} required>
          {(Object.keys(CPA_TYPE_LABELS) as ActionItemType[]).map((t) => (
            <option key={t} value={t}>{CPA_TYPE_LABELS[t]}</option>
          ))}
        </Select>
        <label htmlFor="cpa-title">Título *</label>
        <Input id="cpa-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={300} required />
        <label htmlFor="cpa-desc">Descripción *</label>
        <textarea id="cpa-desc" className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} required />
        <label htmlFor="cpa-origin">Origen *</label>
        <Select id="cpa-origin" value={form.origin} onChange={(e) => set('origin', e.target.value as ActionOrigin)} required>
          {(Object.keys(CPA_ORIGIN_LABELS) as ActionOrigin[]).map((o) => (
            <option key={o} value={o}>{CPA_ORIGIN_LABELS[o]}</option>
          ))}
        </Select>
        <label htmlFor="cpa-originref">Referencia del origen (opcional)</label>
        <Input id="cpa-originref" value={form.originReferenceId} onChange={(e) => set('originReferenceId', e.target.value)} placeholder="ObjectId del documento origen (trazabilidad declarativa)" />
        <label htmlFor="cpa-finding">Hallazgo</label>
        <textarea id="cpa-finding" className="input" rows={2} value={form.finding} onChange={(e) => set('finding', e.target.value)} maxLength={2000} />
        <label htmlFor="cpa-rootcause">Causa raíz</label>
        <textarea id="cpa-rootcause" className="input" rows={2} value={form.rootCause} onChange={(e) => set('rootCause', e.target.value)} maxLength={2000} />
        <label htmlFor="cpa-plan">Plan de acción</label>
        <textarea id="cpa-plan" className="input" rows={2} value={form.actionPlan} onChange={(e) => set('actionPlan', e.target.value)} maxLength={2000} />
        <label htmlFor="cpa-priority">Prioridad</label>
        <Select id="cpa-priority" value={form.priority} onChange={(e) => set('priority', e.target.value as ActionPriority)}>
          {(Object.keys(CPA_PRIORITY_LABELS) as ActionPriority[]).map((p) => (
            <option key={p} value={p}>{CPA_PRIORITY_LABELS[p]}</option>
          ))}
        </Select>
        <label htmlFor="cpa-responsible">Responsable *</label>
        <Select id="cpa-responsible" value={form.responsibleUserId} onChange={(e) => set('responsibleUserId', e.target.value)} required>
          <option value="">Seleccione el responsable</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {`${u.firstName} ${u.lastName}`.trim() || u.email}
            </option>
          ))}
        </Select>
        <label htmlFor="cpa-planned">Fecha planificada</label>
        <Input id="cpa-planned" type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} />
        <label htmlFor="cpa-due">Fecha compromiso *</label>
        <Input id="cpa-due" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} required />
        {mode === 'edit' ? (
          <>
            <label htmlFor="cpa-exec">Fecha de ejecución (requerida para completar)</label>
            <Input id="cpa-exec" type="date" value={form.executionDate} onChange={(e) => set('executionDate', e.target.value)} />
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

function CpaEvidenceModal(props: {
  token: string;
  action: CorrectivePreventiveActionModel;
  onClose: () => void;
  onSaved: (updated: CorrectivePreventiveActionModel) => Promise<void> | void;
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
      const updated = await addCpaActionEvidence(token, action._id, {
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
        <label htmlFor="cpa-ev-doc">documentId (Gestión documental, opcional)</label>
        <Input id="cpa-ev-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="ObjectId del documento" />
        <label htmlFor="cpa-ev-url">URL de evidencia (opcional)</label>
        <Input id="cpa-ev-url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://…" />
        <label htmlFor="cpa-ev-comment">Comentario</label>
        <textarea id="cpa-ev-comment" className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
        <label htmlFor="cpa-ev-replace">Reemplazar evidencia existente</label>
        <Select id="cpa-ev-replace" value={replace ? 'yes' : 'no'} onChange={(e) => setReplace(e.target.value === 'yes')}>
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

// ═══════════════════════════ Verificación de eficacia ═══════════════════════════

function CpaEffectivenessModal(props: {
  token: string;
  action: CorrectivePreventiveActionModel;
  onClose: () => void;
  onSaved: (updated: CorrectivePreventiveActionModel) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { token, action, onClose, onSaved, onError } = props;
  const [result, setResult] = useState<EffectivenessResult>('EFECTIVA');
  const [verificationDate, setVerificationDate] = useState('');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (verificationDate && !isISODate(verificationDate)) {
      setFormError('La fecha de verificación es inválida.');
      return;
    }
    if (verificationDate && Date.parse(verificationDate) > Date.now()) {
      setFormError('La fecha de verificación no puede ser futura.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await verifyCpaActionEffectiveness(token, action._id, {
        result,
        ...(observations.trim() ? { observations: observations.trim() } : {}),
        ...(verificationDate ? { verificationDate } : {}),
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
    <Modal isOpen title={`Verificación de eficacia — ${action.title}`} onClose={onClose}>
      <p className="muted">
        Completada ≠ eficaz: esta verificación es el paso final del ciclo de la acción
        (el backend solo la acepta sobre acciones COMPLETED).
      </p>
      <div className="form-grid">
        <label htmlFor="cpa-eff-result">Resultado *</label>
        <Select id="cpa-eff-result" value={result} onChange={(e) => setResult(e.target.value as EffectivenessResult)} required>
          {(Object.keys(CPA_EFFECTIVENESS_LABELS) as EffectivenessResult[]).map((r) => (
            <option key={r} value={r}>{CPA_EFFECTIVENESS_LABELS[r]}</option>
          ))}
        </Select>
        <label htmlFor="cpa-eff-date">Fecha de verificación (opcional — default: hoy)</label>
        <Input id="cpa-eff-date" type="date" value={verificationDate} onChange={(e) => setVerificationDate(e.target.value)} />
        <label htmlFor="cpa-eff-obs">Observaciones</label>
        <textarea id="cpa-eff-obs" className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={2000} />
        {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar verificación'}</Button>
      </div>
    </Modal>
  );
}
