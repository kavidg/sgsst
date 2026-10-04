import { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Modal } from './ui/Modal';
// Contratos y etiquetas 7.1.3 (fuente: types/incidents.ts — espejo backend).
import {
  type InvestigationActionModel,
  type IncidentHistoryModel,
  type InvestigationTeamMemberModel,
  type IncidentLifecycleStage,
  type InvestigationActionStatus,
  type InvestigationActionType,
  type InvestigationProgressStatus,
  type InvestigationActionImplementationStatus,
  type InvestigationPerceivedEffectiveness,
  INCIDENT_LIFECYCLE_STAGE_LABELS,
  INCIDENT_LIFECYCLE_STAGE_VARIANTS,
  INVESTIGATION_STATUS_LABELS,
  INVESTIGATION_ACTION_TYPE_LABELS,
  INVESTIGATION_ACTION_STATUS_LABELS,
  INVESTIGATION_ACTION_STATUS_VARIANTS,
  INVESTIGATION_ACTION_VALID_TRANSITIONS,
  IMPLEMENTATION_STATUS_LABELS,
  PERCEIVED_EFFECTIVENESS_LABELS,
  INCIDENT_HISTORY_ACTION_LABELS,
  isActionOverdue,
} from '../types/incidents';
// Funciones de API (patrón único apiFetch — sin cliente HTTP paralelo).
import {
  updateInvestigation,
  addInvestigationEvidence,
  createInvestigationAction,
  updateInvestigationActionStatus,
  addActionEvidence,
  registerActionFollowUp,
  updateIncidentLifecycle,
  fetchIncidentHistory,
  type UserModel,
} from '../api';

type Props = {
  token: string;
  incident: {
    _id: string;
    type: string;
    date: string;
    description: string;
    severity: string;
    status: string;
    daysLost?: number;
    employeeName?: string;
    lifecycleStage?: string;
    investigationDate?: string;
    investigationResponsibleSnapshot?: string;
    investigationResponsibleUserId?: string;
    responsible?: string;
    methodology?: string;
    investigationStatus?: string;
    investigationTeam?: InvestigationTeamMemberModel[];
    immediateCauses?: string[];
    basicCauses?: string[];
    rootCauses?: string[];
    relatedFactors?: string[];
    conclusions?: string;
    recommendations?: string;
    investigationEvidence?: Array<{ documentId?: string; documentSnapshot?: string; evidenceUrl?: string; comment?: string }>;
    evidence?: string[];
    correctiveActions?: InvestigationActionModel[];
    preventiveActions?: InvestigationActionModel[];
    closureDate?: string;
    closedBySnapshot?: string;
  };
  writable: boolean;
  users: UserModel[];
  revision: number;
  onClose: () => void;
  onMutated: () => void;
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Etiqueta comprensible del estado legacy (sin migrar el valor). */
function legacyStatusLabel(status: string): { label: string; variant: string } {
  const s = status.trim().toLowerCase();
  if (s === 'cerrado') return { label: 'Cerrado (legacy)', variant: 'badge--success' };
  if (s === 'abierto') return { label: 'Abierto (legacy)', variant: 'badge--info' };
  return { label: status || '—', variant: 'badge--info' };
}

/** Cadena visual del lifecycle (el backend es la autoridad). */
const LIFECYCLE_CHAIN: IncidentLifecycleStage[] = [
  'OPEN',
  'INVESTIGATING',
  'ACTIONS_PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
];

export function IncidentCaseDetailModal({ token, incident, writable, users, revision, onClose, onMutated }: Props) {
  const [tab, setTab] = useState<'resumen' | 'investigacion' | 'causas' | 'acciones' | 'historial'>('resumen');
  const [saving, setSaving] = useState(false);
  /** Error local (no rompe el modal; muestra el mensaje del backend). */
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [history, setHistory] = useState<IncidentHistoryModel[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ── Formularios locales (investigación / causas) ──
  const [invForm, setInvForm] = useState({
    investigationDate: incident.investigationDate?.slice(0, 10) ?? '',
    investigationResponsibleUserId: incident.investigationResponsibleUserId ?? '',
    methodology: incident.methodology ?? '',
    investigationStatus: (incident.investigationStatus ?? '') as InvestigationProgressStatus | '',
    conclusions: incident.conclusions ?? '',
    recommendations: incident.recommendations ?? '',
  });
  const [team, setTeam] = useState<Array<{ userId: string; participationRole: string }>>(
    (incident.investigationTeam ?? []).map((m) => ({ userId: m.userId, participationRole: m.participationRole ?? '' })),
  );
  const [causasForm, setCausasForm] = useState({
    immediateCauses: (incident.immediateCauses ?? []).join('\n'),
    basicCauses: (incident.basicCauses ?? (incident.rootCauses ?? [])).join('\n'),
    relatedFactors: (incident.relatedFactors ?? []).join('\n'),
    conclusions: incident.conclusions ?? '',
    recommendations: incident.recommendations ?? '',
  });

  // ── Modales de acción ──
  const [newAction, setNewAction] = useState<{ action: string; actionType: InvestigationActionType; responsibleUserId: string; dueDate: string } | null>(null);
  const [statusEdit, setStatusEdit] = useState<{ action: InvestigationActionModel; next: InvestigationActionStatus } | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<InvestigationActionModel | null>(null);
  const [followUpTarget, setFollowUpTarget] = useState<InvestigationActionModel | null>(null);

  const userNameById = new Map(users.map((u) => [u._id, `${u.firstName} ${u.lastName}`.trim() || u.email]));

  useEffect(() => {
    if (tab !== 'historial') return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchIncidentHistory(token, incident._id)
      .then((events) => {
        if (!cancelled) setHistory(events);
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(errMessage(err));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, token, incident._id, revision]);

  const withSaving = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      setBanner('Cambios guardados.');
      onMutated();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const allActions = [...(incident.correctiveActions ?? []), ...(incident.preventiveActions ?? [])];

  return (
    <Modal isOpen title="Detalle del caso — Investigación y acciones (7.1.3)" onClose={onClose}>
      <div className="modal-tabs" role="tablist">
        {(
          [
            ['resumen', 'Resumen'],
            ['investigacion', 'Investigación'],
            ['causas', 'Análisis causal'],
            ['acciones', `Acciones (${allActions.length})`],
            ['historial', 'Historial'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`modal-tab ${tab === id ? 'modal-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {banner ? <p className="muted">{banner}</p> : null}

      {/* ─────────── RESUMEN ─────────── */}
      {tab === 'resumen' && (
        <div className="advanced-list">
          <article className="advanced-list__item">
            <strong>Tipo</strong>
            <p>{incident.type}</p>
            <small className="muted">{incident.employeeName ? `Trabajador: ${incident.employeeName}` : undefined}</small>
          </article>
          <article className="advanced-list__item">
            <strong>Fecha</strong>
            <p>{formatDate(incident.date)}</p>
            <small className="muted">Severidad: {incident.severity} · Días perdidos: {incident.daysLost ?? 0}</small>
          </article>
          <article className="advanced-list__item">
            <strong>Descripción</strong>
            <p>{incident.description}</p>
          </article>
          <article className="advanced-list__item">
            <strong>Estados</strong>
            <p>
              <span className={legacyStatusLabel(incident.status).variant}>
                {legacyStatusLabel(incident.status).label}
              </span>{' '}
              {incident.lifecycleStage ? (
                <span className={`badge ${INCIDENT_LIFECYCLE_STAGE_VARIANTS[incident.lifecycleStage as IncidentLifecycleStage] ?? 'badge--info'}`}>
                  {INCIDENT_LIFECYCLE_STAGE_LABELS[incident.lifecycleStage as IncidentLifecycleStage] ?? incident.lifecycleStage}
                </span>
              ) : (
                <span className="badge badge--info">Sin etapa 7.1.3</span>
              )}
            </p>
            <small className="muted">El estado legacy se conserva; la etapa 7.1.3 es la máquina de estados canónica.</small>
          </article>
        </div>
      )}

      {/* ─────────── INVESTIGACIÓN ─────────── */}
      {tab === 'investigacion' && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <p className="muted">
            {incident.investigationDate ? `Investigación: ${formatDate(incident.investigationDate)}` : 'Sin investigación registrada.'}
            {incident.investigationResponsibleSnapshot ? ` · Responsable: ${incident.investigationResponsibleSnapshot}` : ''}
            {incident.responsible && !incident.investigationResponsibleSnapshot ? ` (legacy: ${incident.responsible})` : ''}
            {incident.investigationStatus ? ` · ${INVESTIGATION_STATUS_LABELS[incident.investigationStatus as InvestigationProgressStatus] ?? ''}` : ''}
          </p>
          {writable ? (
            <>
              <div className="grid grid-2">
                <label className="field"><span className="label">Fecha de investigación</span>
                  <Input type="date" value={invForm.investigationDate} onChange={(e) => setInvForm((p) => ({ ...p, investigationDate: e.target.value }))} />
                </label>
                <label className="field"><span className="label">Responsable (usuario del tenant)</span>
                  <Select value={invForm.investigationResponsibleUserId} onChange={(e) => setInvForm((p) => ({ ...p, investigationResponsibleUserId: e.target.value }))}>
                    <option value="">— Sin responsable —</option>
                    {users.map((u) => <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>)}
                  </Select>
                </label>
                <label className="field"><span className="label">Metodología</span>
                  <Input value={invForm.methodology} onChange={(e) => setInvForm((p) => ({ ...p, methodology: e.target.value }))} placeholder="Ivanov, IBC, 5 por qué…" />
                </label>
                <label className="field"><span className="label">Estado de la investigación</span>
                  <Select value={invForm.investigationStatus} onChange={(e) => setInvForm((p) => ({ ...p, investigationStatus: e.target.value as InvestigationProgressStatus | '' }))}>
                    <option value="">— Sin estado —</option>
                    {(Object.keys(INVESTIGATION_STATUS_LABELS) as InvestigationProgressStatus[]).map((s) => (
                      <option key={s} value={s}>{INVESTIGATION_STATUS_LABELS[s]}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <div>
                <span className="label">Equipo investigador</span>
                {team.map((m, i) => (
                  <div key={i} className="grid grid-2" style={{ gap: '0.5rem', marginTop: '0.25rem' }}>
                    <Select value={m.userId} onChange={(e) => setTeam((p) => p.map((x, j) => (j === i ? { ...x, userId: e.target.value } : x)))}>
                      <option value="">— Seleccione —</option>
                      {users.map((u) => <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>)}
                    </Select>
                    <Input value={m.participationRole} placeholder="Rol (Líder, COPASST…)" onChange={(e) => setTeam((p) => p.map((x, j) => (j === i ? { ...x, participationRole: e.target.value } : x)))} />
                    <Button type="button" variant="danger" onClick={() => setTeam((p) => p.filter((_, j) => j !== i))}>Quitar</Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={() => setTeam((p) => [...p, { userId: '', participationRole: '' }])}>+ Agregar participante</Button>
              </div>
              <div className="actions">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void withSaving(async () => {
                      await updateInvestigation(token, incident._id, {
                        ...(invForm.investigationDate ? { investigationDate: invForm.investigationDate } : {}),
                        ...(invForm.investigationResponsibleUserId ? { investigationResponsibleUserId: invForm.investigationResponsibleUserId } : {}),
                        ...(invForm.methodology ? { methodology: invForm.methodology } : {}),
                        ...(invForm.investigationStatus ? { investigationStatus: invForm.investigationStatus } : {}),
                        investigationTeam: team.filter((m) => m.userId),
                      });
                      setInvForm((p) => ({ ...p, conclusions: p.conclusions }));
                    })
                  }
                >
                  {saving ? 'Guardando…' : 'Guardar investigación'}
                </Button>
              </div>
              {/* Evidencia de investigación */}
              <div>
                <span className="label">Evidencia de la investigación</span>
                {(incident.investigationEvidence ?? []).length > 0 ? (
                  <ul className="muted">
                    {(incident.investigationEvidence ?? []).map((e, i) => (
                      <li key={i}>
                        {e.documentSnapshot ?? 'Documento'}
                        {e.evidenceUrl ? <> — <a href={e.evidenceUrl} target="_blank" rel="noreferrer">ver enlace</a></> : null}
                        {e.comment ? ` — ${e.comment}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Sin evidencia estructurada registrada.</p>
                )}
                {incident.evidence?.length ? <p className="muted">Legacy: {incident.evidence.join(', ')}</p> : null}
                <EvidenceInlineForm
                  writable={writable}
                  saving={saving}
                  onSubmit={(payload) =>
                    void withSaving(async () => {
                      await addInvestigationEvidence(token, incident._id, payload);
                    })
                  }
                />
              </div>
            </>
          ) : (
            <p className="muted">Modo lectura: la investigación solo puede modificarse por owner/admin.</p>
          )}
        </div>
      )}

      {/* ─────────── ANÁLISIS CAUSAL ─────────── */}
      {tab === 'causas' && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {writable ? (
            <>
              <label className="field"><span className="label">Causas inmediatas (una por línea)</span>
                <textarea className="input" rows={3} value={causasForm.immediateCauses} onChange={(e) => setCausasForm((p) => ({ ...p, immediateCauses: e.target.value }))} />
              </label>
              <label className="field"><span className="label">Causas básicas (una por línea)</span>
                <textarea className="input" rows={3} value={causasForm.basicCauses} onChange={(e) => setCausasForm((p) => ({ ...p, basicCauses: e.target.value }))} />
              </label>
              <label className="field"><span className="label">Factores relacionados (una por línea)</span>
                <textarea className="input" rows={2} value={causasForm.relatedFactors} onChange={(e) => setCausasForm((p) => ({ ...p, relatedFactors: e.target.value }))} />
              </label>
              <label className="field"><span className="label">Conclusiones</span>
                <textarea className="input" rows={2} value={causasForm.conclusions} onChange={(e) => setCausasForm((p) => ({ ...p, conclusions: e.target.value }))} />
              </label>
              <label className="field"><span className="label">Recomendaciones</span>
                <textarea className="input" rows={2} value={causasForm.recommendations} onChange={(e) => setCausasForm((p) => ({ ...p, recommendations: e.target.value }))} />
              </label>
              <div className="actions">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void withSaving(async () => {
                      await updateInvestigation(token, incident._id, {
                        immediateCauses: causasForm.immediateCauses.split('\n').map((s) => s.trim()).filter(Boolean),
                        basicCauses: causasForm.basicCauses.split('\n').map((s) => s.trim()).filter(Boolean),
                        rootCauses: causasForm.basicCauses.split('\n').map((s) => s.trim()).filter(Boolean),
                        relatedFactors: causasForm.relatedFactors.split('\n').map((s) => s.trim()).filter(Boolean),
                        conclusions: causasForm.conclusions || undefined,
                        recommendations: causasForm.recommendations || undefined,
                      });
                    })
                  }
                >
                  {saving ? 'Guardando…' : 'Guardar análisis causal'}
                </Button>
              </div>
              <p className="muted">Las causas básicas también se guardan en el campo legacy (rootCauses) para compatibilidad.</p>
            </>
          ) : (
            <div className="advanced-list">
              <article className="advanced-list__item"><strong>Causas inmediatas</strong><p>{(incident.immediateCauses ?? []).join(', ') || '—'}</p></article>
              <article className="advanced-list__item"><strong>Causas básicas</strong><p>{(incident.basicCauses ?? incident.rootCauses ?? []).join(', ') || '—'}</p></article>
              <article className="advanced-list__item"><strong>Factores relacionados</strong><p>{(incident.relatedFactors ?? []).join(', ') || '—'}</p></article>
              <article className="advanced-list__item"><strong>Conclusiones</strong><p>{incident.conclusions ?? '—'}</p></article>
              <article className="advanced-list__item"><strong>Recomendaciones</strong><p>{incident.recommendations ?? '—'}</p></article>
            </div>
          )}
        </div>
      )}

      {/* ─────────── ACCIONES ─────────── */}
      {tab === 'acciones' && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {allActions.length === 0 ? <p className="muted">Sin acciones derivadas de la investigación.</p> : null}
          {allActions.map((a) => {
            const overdue = isActionOverdue(a);
            const responsible =
              a.responsibleSnapshot ?? (a.responsibleUserId ? userNameById.get(a.responsibleUserId) : undefined) ?? a.responsible ?? '—';
            return (
              <article key={a.actionId ?? a.action} className="card" style={{ padding: '0.75rem', border: overdue ? '1px solid #ef4444' : undefined }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{a.actionId ?? '—'}</strong>
                  <span className="badge badge--info">{INVESTIGATION_ACTION_TYPE_LABELS[a.actionType ?? 'CORRECTIVE']}</span>
                  <span className={`badge ${INVESTIGATION_ACTION_STATUS_VARIANTS[a.status]}`}>
                    {INVESTIGATION_ACTION_STATUS_LABELS[a.status]}
                  </span>
                  {overdue ? <span className="badge badge--danger">VENCIDA</span> : null}
                </div>
                <p style={{ margin: '0.5rem 0 0' }}>{a.action}</p>
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  Responsable: {responsible} · Límite: {formatDate(a.dueDate)} · Programada: {formatDate(a.plannedDate)} · Completada: {formatDate(a.completedDate)}
                </p>
                {a.evidence ? (
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    Evidencia: {a.evidence.documentSnapshot ?? 'Documento'}
                    {a.evidence.evidenceUrl ? <> — <a href={a.evidence.evidenceUrl} target="_blank" rel="noreferrer">ver enlace</a></> : null}
                  </p>
                ) : (
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>Sin evidencia.</p>
                )}
                {a.followUp ? (
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    Seguimiento: {formatDate(a.followUp.followUpDate)}
                    {a.followUp.implementationStatus ? ` · ${IMPLEMENTATION_STATUS_LABELS[a.followUp.implementationStatus]}` : ''}
                    {a.followUp.perceivedEffectiveness
                      ? ` · Percepción de efectividad: ${PERCEIVED_EFFECTIVENESS_LABELS[a.followUp.perceivedEffectiveness]}`
                      : ''}
                  </p>
                ) : null}
                {writable ? (
                  <div className="actions" style={{ marginTop: '0.5rem' }}>
                    {INVESTIGATION_ACTION_VALID_TRANSITIONS[a.status].map((next) => (
                      <Button key={next} type="button" variant="secondary" disabled={saving} onClick={() => setStatusEdit({ action: a, next })}>
                        {next === 'IN_PROGRESS' ? 'Iniciar' : next === 'COMPLETED' ? 'Completar' : 'Cancelar'}
                      </Button>
                    ))}
                    <Button type="button" variant="secondary" disabled={saving} onClick={() => setEvidenceTarget(a)}>Evidencia</Button>
                    <Button type="button" variant="secondary" disabled={saving} onClick={() => setFollowUpTarget(a)}>Seguimiento</Button>
                  </div>
                ) : null}
              </article>
            );
          })}

          {writable ? (
            newAction ? (
              <div className="card" style={{ padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                <label className="field"><span className="label">Descripción *</span>
                  <Input value={newAction.action} onChange={(e) => setNewAction({ ...newAction, action: e.target.value })} />
                </label>
                <div className="grid grid-2">
                  <label className="field"><span className="label">Tipo</span>
                    <Select value={newAction.actionType} onChange={(e) => setNewAction({ ...newAction, actionType: e.target.value as InvestigationActionType })}>
                      {(Object.keys(INVESTIGATION_ACTION_TYPE_LABELS) as InvestigationActionType[]).map((t) => (
                        <option key={t} value={t}>{INVESTIGATION_ACTION_TYPE_LABELS[t]}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="field"><span className="label">Responsable</span>
                    <Select value={newAction.responsibleUserId} onChange={(e) => setNewAction({ ...newAction, responsibleUserId: e.target.value })}>
                      <option value="">— Sin responsable —</option>
                      {users.map((u) => <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>)}
                    </Select>
                  </label>
                  <label className="field"><span className="label">Fecha límite</span>
                    <Input type="date" value={newAction.dueDate} onChange={(e) => setNewAction({ ...newAction, dueDate: e.target.value })} />
                  </label>
                </div>
                <div className="actions">
                  <Button
                    type="button"
                    disabled={saving || !newAction.action.trim()}
                    onClick={() =>
                      void withSaving(async () => {
                        await createInvestigationAction(token, incident._id, {
                          action: newAction.action,
                          actionType: newAction.actionType,
                          ...(newAction.responsibleUserId ? { responsibleUserId: newAction.responsibleUserId } : {}),
                          ...(newAction.dueDate ? { dueDate: newAction.dueDate } : {}),
                        });
                        setNewAction(null);
                      })
                    }
                  >
                    {saving ? 'Guardando…' : 'Crear acción'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setNewAction(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setNewAction({ action: '', actionType: 'CORRECTIVE', responsibleUserId: '', dueDate: '' })}>
                + Nueva acción derivada
              </Button>
            )
          ) : null}
        </div>
      )}

      {/* ─────────── LIFECYCLE (en resumen) + estado del caso ─────────── */}
      {tab === 'resumen' && (
        <div style={{ marginTop: '0.75rem' }}>
          <span className="label">Progreso del caso (7.1.3)</span>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {LIFECYCLE_CHAIN.map((s, i) => {
              const current = (incident.lifecycleStage ?? 'OPEN') as IncidentLifecycleStage;
              const idx = LIFECYCLE_CHAIN.indexOf(current);
              const done = idx >= 0 && i <= idx;
              return (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className={`badge ${done ? INCIDENT_LIFECYCLE_STAGE_VARIANTS[s] : 'badge--info'}`} style={{ opacity: done ? 1 : 0.55 }}>
                    {INCIDENT_LIFECYCLE_STAGE_LABELS[s]}
                  </span>
                  {i < LIFECYCLE_CHAIN.length - 1 ? <span className="muted">→</span> : null}
                </span>
              );
            })}
            {incident.lifecycleStage === 'CANCELLED' ? <span className="badge badge--danger">Cancelado</span> : null}
          </div>
          {writable ? (
            <LifecycleControls
              incident={incident}
              saving={saving}
              onTransition={(stage, comment) =>
                void withSaving(async () => {
                  await updateIncidentLifecycle(token, incident._id, { stage, ...(comment ? { comment } : {}) });
                })
              }
            />
          ) : null}
        </div>
      )}

      {/* ─────────── HISTORIAL ─────────── */}
      {tab === 'historial' && (
        <div>
          {historyLoading ? <p className="muted">Cargando historial…</p> : null}
          {historyError ? <p className="error">{historyError}</p> : null}
          {!historyLoading && !historyError && history.length === 0 ? (
            <p className="muted">Sin eventos registrados aún para este caso.</p>
          ) : null}
          <div className="timeline">
            {history.map((h) => (
              <article key={h._id} className="timeline__item">
                <strong>{INCIDENT_HISTORY_ACTION_LABELS[h.action] ?? h.action}</strong>
                <p>
                  {h.actorSnapshot} — {new Date(h.createdAt).toLocaleString('es-CO')}
                  {h.actionId ? ` · ${h.actionId}` : ''}
                </p>
                {h.details?.message ? <small className="muted">{h.details.message}</small> : null}
              </article>
            ))}
          </div>
        </div>
      )}

      {/* ─────────── Modales de acción: estado / evidencia / seguimiento ─────────── */}
      {statusEdit ? (
        <Modal isOpen title="Cambiar estado de la acción" onClose={() => setStatusEdit(null)}>
          <p className="muted">
            {statusEdit.action.actionId ?? ''} — {INVESTIGATION_ACTION_STATUS_LABELS[statusEdit.action.status]} →{' '}
            {INVESTIGATION_ACTION_STATUS_LABELS[statusEdit.next]}
          </p>
          {statusEdit.next === 'COMPLETED' ? (
            <p className="muted">Al completar se registra la fecha de finalización (no puede ser futura).</p>
          ) : null}
          <div className="actions">
            <Button
              type="button"
              disabled={saving}
              onClick={() =>
                void withSaving(async () => {
                  await updateInvestigationActionStatus(token, incident._id, statusEdit.action.actionId ?? '', {
                    status: statusEdit.next,
                  });
                  setStatusEdit(null);
                })
              }
            >
              {saving ? 'Guardando…' : 'Confirmar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStatusEdit(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {evidenceTarget ? (
        <Modal isOpen title="Agregar evidencia de la acción" onClose={() => setEvidenceTarget(null)}>
          <EvidenceInlineForm
            writable
            saving={saving}
            onSubmit={(payload) =>
              void withSaving(async () => {
                await addActionEvidence(token, incident._id, evidenceTarget.actionId ?? '', payload);
                setEvidenceTarget(null);
              })
            }
          />
        </Modal>
      ) : null}

      {followUpTarget ? (
        <FollowUpInlineForm
          saving={saving}
          onSubmit={(payload) =>
            void withSaving(async () => {
              await registerActionFollowUp(token, incident._id, followUpTarget.actionId ?? '', payload);
              setFollowUpTarget(null);
            })
          }
          onCancel={() => setFollowUpTarget(null)}
        />
      ) : null}
    </Modal>
  );
}

// ── Sub-componentes internos ────────────────────────────────────────────────

/** Formulario de evidencia (documentId opcional o URL + comentario). */
function EvidenceInlineForm({
  writable,
  saving,
  onSubmit,
}: {
  writable: boolean;
  saving: boolean;
  onSubmit: (payload: { documentId?: string; evidenceUrl?: string; comment?: string }) => void;
}) {
  const [url, setUrl] = useState('');
  const [comment, setComment] = useState('');
  if (!writable) return null;
  return (
    <div className="card" style={{ padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      <label className="field"><span className="label">URL de evidencia</span>
        <Input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="field"><span className="label">Comentario</span>
        <Input value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="actions">
        <Button
          type="button"
          disabled={saving || (!url.trim() && !comment.trim())}
          onClick={() => onSubmit({ ...(url.trim() ? { evidenceUrl: url.trim() } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) })}
        >
          {saving ? 'Guardando…' : 'Agregar evidencia'}
        </Button>
      </div>
      <small className="muted">La evidencia requiere URL o referencia a documento del sistema (DocumentMaster).</small>
    </div>
  );
}

/** Formulario de seguimiento (implementación + percepción de efectividad). */
function FollowUpInlineForm({
  saving,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  onSubmit: (payload: {
    followUpDate?: string;
    observations?: string;
    implementationStatus?: InvestigationActionImplementationStatus;
    perceivedEffectiveness?: InvestigationPerceivedEffectiveness;
  }) => void;
  onCancel: () => void;
}) {
  const [followUpDate, setFollowUpDate] = useState(new Date().toISOString().slice(0, 10));
  const [observations, setObservations] = useState('');
  const [implementationStatus, setImplementationStatus] = useState<InvestigationActionImplementationStatus | ''>('');
  const [perceivedEffectiveness, setPerceivedEffectiveness] = useState<InvestigationPerceivedEffectiveness | ''>('');
  return (
    <Modal isOpen title="Registrar seguimiento de la acción" onClose={onCancel}>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <label className="field"><span className="label">Fecha de seguimiento</span>
          <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </label>
        <label className="field"><span className="label">Estado de implementación</span>
          <Select value={implementationStatus} onChange={(e) => setImplementationStatus(e.target.value as InvestigationActionImplementationStatus | '')}>
            <option value="">— Sin estado —</option>
            {(Object.keys(IMPLEMENTATION_STATUS_LABELS) as InvestigationActionImplementationStatus[]).map((s) => (
              <option key={s} value={s}>{IMPLEMENTATION_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </label>
        <label className="field"><span className="label">Percepción de efectividad</span>
          <Select value={perceivedEffectiveness} onChange={(e) => setPerceivedEffectiveness(e.target.value as InvestigationPerceivedEffectiveness | '')}>
            <option value="">— Sin concluir —</option>
            {(Object.keys(PERCEIVED_EFFECTIVENESS_LABELS) as InvestigationPerceivedEffectiveness[]).map((p) => (
              <option key={p} value={p}>{PERCEIVED_EFFECTIVENESS_LABELS[p]}</option>
            ))}
          </Select>
        </label>
        <label className="field"><span className="label">Observaciones</span>
          <textarea className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} />
        </label>
        <div className="actions">
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              onSubmit({
                ...(followUpDate ? { followUpDate } : {}),
                ...(implementationStatus ? { implementationStatus } : {}),
                ...(perceivedEffectiveness ? { perceivedEffectiveness } : {}),
                ...(observations.trim() ? { observations: observations.trim() } : {}),
              })
            }
          >
            {saving ? 'Guardando…' : 'Registrar seguimiento'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        </div>
        <small className="muted">La percepción de efectividad es el resultado declarado del seguimiento — no es una verificación formal de eficacia.</small>
      </div>
    </Modal>
  );
}

/** Controles de lifecycle (solo transiciones válidas; el backend es la autoridad). */
function LifecycleControls({
  incident,
  saving,
  onTransition,
}: {
  incident: Props['incident'];
  saving: boolean;
  onTransition: (stage: IncidentLifecycleStage, comment?: string) => void;
}) {
  const current = (incident.lifecycleStage ?? 'OPEN') as IncidentLifecycleStage;
  // Espejo de INCIDENT_LIFECYCLE_TRANSITIONS del backend (E1) — el backend
  // sigue siendo la autoridad y su mensaje se muestra si la transición falla.
  const TRANSITIONS: Record<IncidentLifecycleStage, readonly IncidentLifecycleStage[]> = {
    OPEN: ['INVESTIGATING', 'CANCELLED'],
    INVESTIGATING: ['ACTIONS_PENDING', 'CANCELLED'],
    ACTIONS_PENDING: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['CLOSED'],
    CLOSED: [],
    CANCELLED: [],
  };
  const nexts = TRANSITIONS[current] ?? [];
  if (nexts.length === 0) return null;
  return (
    <div className="actions" style={{ marginTop: '0.5rem' }}>
      {nexts.map((next) => (
        <Button key={next} type="button" variant="secondary" disabled={saving} onClick={() => onTransition(next)}>
          {next === 'INVESTIGATING'
            ? 'Iniciar investigación'
            : next === 'ACTIONS_PENDING'
              ? 'Definir acciones'
              : next === 'IN_PROGRESS'
                ? 'Iniciar ejecución'
                : next === 'COMPLETED'
                  ? 'Completar caso'
                  : next === 'CLOSED'
                    ? 'Cerrar caso (documentado)'
                    : 'Cancelar caso'}
        </Button>
      ))}
    </div>
  );
}
