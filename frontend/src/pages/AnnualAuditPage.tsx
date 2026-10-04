import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AnnualAuditModel,
  type AnnualAuditStatus,
  type AnnualAuditType,
  type AnnualAuditFindingModel,
  type AnnualAuditActionModel,
  type AuditFindingType,
  type AuditFindingSeverity,
  type AuditFindingStatus,
  type AuditActionStatus,
  type CreateAnnualAuditPayload,
  type CreateAuditFindingPayload,
  type CreateAuditActionPayload,
  fetchAnnualAudits,
  fetchAnnualAudit,
  createAnnualAudit,
  updateAnnualAudit,
  updateAnnualAuditStatus,
  createAnnualAuditFinding,
  updateAnnualAuditFinding,
  createAnnualAuditAction,
  updateAnnualAuditAction,
  attachAnnualAuditReportEvidence,
  attachAnnualAuditCompetenceEvidence,
  fetchAnnualAuditHistory,
  fetchAdmins,
  fetchMembers,
  type UserModel,
  type DocumentMasterItem,
  fetchDocumentManagementList,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  isAnnualAuditComplianceMetadataV1,
  annualAuditRatioToPercent,
  ANNUAL_AUDIT_DIMENSION_KEYS,
  ANNUAL_AUDIT_DIMENSION_LABELS,
  ANNUAL_AUDIT_DIMENSION_WEIGHT_FALLBACK,
  ANNUAL_AUDIT_STATUS_LABELS,
  AUDIT_FINDING_TYPE_LABELS,
  AUDIT_FINDING_SEVERITY_LABELS,
  AUDIT_FINDING_STATUS_LABELS,
  AUDIT_ACTION_STATUS_LABELS,
  ANNUAL_AUDIT_HISTORY_ACTION_LABELS,
  type AnnualAuditComplianceMetadataV1,
  type AnnualAuditHistoryModel,
} from '../types/annual-audit';
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
// E4 (6.1.2): IA complementaria — interpreta el resultado oficial; si falla,
// el componente no bloquea la página (fallback interno tolerante).
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';

/**
 * E3 (6.1.2) — Gestión Avanzada de Auditoría anual SG-SST.
 *
 * REGLA DE SCORE: el frontend NO calcula el cumplimiento. Porcentaje, estado,
 * nivel y metadata dimensional provienen exclusivamente de
 * GET /compliance-engine/overview (module === 'annual-audit', dimensions:v1).
 * `annualAuditRatioToPercent` es solo presentación visual.
 *
 * Roles (E1): lectura owner/admin/manager/member; escritura owner/admin
 * (el backend es la autoridad — aquí solo se ocultan acciones).
 * Transiciones de estado: el backend valida (ANNUAL_AUDIT_VALID_TRANSITIONS);
 * el frontend solo ofrece las opciones válidas por estado.
 */

interface AnnualAuditPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: '📋' },
  { id: 'auditorias', label: 'Auditorías', icon: '🗂️' },
];

const AUDIT_TYPE_LABELS: Record<AnnualAuditType, string> = {
  INTERNAL: 'Interna',
  EXTERNAL: 'Externa',
};

const STATUS_VARIANTS: Record<AnnualAuditStatus, string> = {
  DRAFT: 'badge--info',
  PLANNED: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

const SEVERITY_VARIANTS: Record<AuditFindingSeverity, string> = {
  LOW: 'badge--info',
  MEDIUM: 'badge--warning',
  HIGH: 'badge--danger',
};

/** Transiciones válidas por estado (espejo de ANNUAL_AUDIT_VALID_TRANSITIONS). */
const VALID_TRANSITIONS: Record<AnnualAuditStatus, AnnualAuditStatus[]> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

const TRANSITION_LABELS: Partial<Record<AnnualAuditStatus, string>> = {
  PLANNED: 'Planificar',
  IN_PROGRESS: 'Iniciar ejecución',
  COMPLETED: 'Completar',
  CANCELLED: 'Cancelar auditoría',
};

/** Acción mínima por finding oficial (IDs de annual-audit-scoring.ts). */
const FINDING_ACTION: Record<string, { tab: string; label: string }> = {
  'annual-audit-no-data': { tab: 'auditorias', label: 'Registrar auditoría' },
  'annual-audit-no-evaluable-audits': { tab: 'auditorias', label: 'Ir a Auditorías' },
  'annual-audit-program-incomplete': { tab: 'auditorias', label: 'Completar planificación' },
  'annual-audit-not-completed': { tab: 'auditorias', label: 'Ir a Auditorías' },
  'annual-audit-no-report': { tab: 'auditorias', label: 'Documentar informe' },
  'annual-audit-findings-incomplete': { tab: 'auditorias', label: 'Gestionar hallazgos' },
  'annual-audit-open-actions': { tab: 'auditorias', label: 'Ver acciones abiertas' },
  'annual-audit-overdue-actions': { tab: 'auditorias', label: 'Ver acciones vencidas' },
  'annual-audit-evidence-missing': { tab: 'auditorias', label: 'Adjuntar evidencia' },
  'annual-audit-history-incomplete': { tab: 'resumen', label: 'Ver cumplimiento' },
  'annual-audit-data-integrity': { tab: 'auditorias', label: 'Revisar datos' },
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
 * Condición de vencimiento DERIVADA en presentación (patrón FASE 9):
 * una acción está vencida si no está COMPLETED y su fecha límite ya pasó.
 * NO existe un estado OVERDUE persistente — nunca se envía al backend.
 */
function isActionOverdue(action: AnnualAuditActionModel): boolean {
  if (action.status === 'COMPLETED') return false;
  if (!action.dueDate) return false;
  const due = new Date(action.dueDate).getTime();
  return !Number.isNaN(due) && due < Date.now();
}

export function AnnualAuditPage({ token, role }: AnnualAuditPageProps) {
  const writable = canWrite(role);
  const [activeTab, setActiveTab] = useState<string>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Datos
  const [audits, setAudits] = useState<AnnualAuditModel[]>([]);
  const [users, setUsers] = useState<UserModel[]>([]);
  const [documents, setDocuments] = useState<DocumentMasterItem[]>([]);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<AnnualAuditComplianceMetadataV1 | null>(null);

  // Filtros del tab Auditorías
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterAuditor, setFilterAuditor] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Estado de guardado
  const [saving, setSaving] = useState(false);
  /** Se incrementa con cada mutación → el detalle abierto se refresca. */
  const [detailRevision, setDetailRevision] = useState(0);

  // Modales
  const [formModal, setFormModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; audit: AnnualAuditModel }
    | null
  >(null);
  const [detailAuditId, setDetailAuditId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<
    | { audit: AnnualAuditModel; next: AnnualAuditStatus }
    | null
  >(null);
  const [findingModal, setFindingModal] = useState<
    | { auditId: string; mode: 'create' }
    | { auditId: string; mode: 'edit'; finding: AnnualAuditFindingModel }
    | null
  >(null);
  const [actionModal, setActionModal] = useState<
    | { auditId: string; findingId: string; mode: 'create' }
    | { auditId: string; findingId: string; mode: 'edit'; action: AnnualAuditActionModel }
    | null
  >(null);
  const [evidenceModal, setEvidenceModal] = useState<
    | { audit: AnnualAuditModel; kind: 'report' | 'competence' }
    | null
  >(null);

  // ─── Carga (tolerante: compliance falla ≠ romper la gestión) ────────────
  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === 'annual-audit') ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isAnnualAuditComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === 'annual-audit'));
  }, [token]);

  const loadAudits = useCallback(async () => {
    setAudits(await fetchAnnualAudits(token).catch(() => []));
  }, [token]);

  const loadUsers = useCallback(async () => {
    const [admins, members] = await Promise.all([
      fetchAdmins(token).catch(() => [] as UserModel[]),
      fetchMembers(token).catch(() => [] as UserModel[]),
    ]);
    setUsers([...admins, ...members]);
  }, [token]);

  const loadDocuments = useCallback(async () => {
    setDocuments(await fetchDocumentManagementList(token).catch(() => []));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list, overview] = await Promise.all([
          fetchAnnualAudits(token),
          getOverview(token, '').catch(() => null),
        ]);
        if (cancelled) return;
        setAudits(list);
        const moduleCompliance =
          overview?.moduleCompliance?.find((m) => m.module === 'annual-audit') ?? null;
        setCompliance(moduleCompliance);
        setMetadata(
          moduleCompliance && isAnnualAuditComplianceMetadataV1(moduleCompliance.metadata)
            ? moduleCompliance.metadata
            : null,
        );
        setFindings((overview?.findings ?? []).filter((f) => f.module === 'annual-audit'));
        // Cargas secundarias (su fallo no rompe la página).
        void loadUsers();
        void loadDocuments();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadUsers, loadDocuments]);

  // ─── Derivados de presentación ──────────────────────────────────────────
  const percentage = compliance?.compliance ?? null;
  const status = compliance?.status ?? null;
  const counters = metadata?.counters ?? null;

  const auditors = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of audits) {
      if (a.auditorNameSnapshot) map.set(a.auditorNameSnapshot, a.auditorNameSnapshot);
      else if (a.auditorUserId) {
        const u = users.find((x) => x._id === a.auditorUserId);
        map.set(a.auditorUserId, u ? `${u.firstName} ${u.lastName}`.trim() || u.email : a.auditorUserId);
      }
    }
    return [...map.entries()];
  }, [audits, users]);

  const filteredAudits = useMemo(() => {
    return audits.filter((a) => {
      if (filterStatus && a.status !== filterStatus) return false;
      if (filterType && a.auditType !== filterType) return false;
      if (filterAuditor && a.auditorUserId !== filterAuditor && a.auditorNameSnapshot !== filterAuditor)
        return false;
      if (filterYear) {
        const y = a.actualEndDate ?? a.plannedEndDate ?? a.createdAt ?? '';
        if (!y.startsWith(filterYear)) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const code = (a.auditCode ?? '').toLowerCase();
        const title = a.title.toLowerCase();
        if (!code.includes(q) && !title.includes(q)) return false;
      }
      return true;
    });
  }, [audits, filterStatus, filterType, filterYear, filterAuditor, search]);

  /** Auditoría evaluable más reciente (COMPLETED con informe) — presentación. */
  const latestEvaluable = useMemo(() => {
    return (
      [...audits]
        .filter((a) => a.status === 'COMPLETED' && (a.reportTitle || a.reportDocumentId || a.reportEvidenceUrl))
        .sort((a, b) => {
          const ta = a.actualEndDate ? new Date(a.actualEndDate).getTime() : 0;
          const tb = b.actualEndDate ? new Date(b.actualEndDate).getTime() : 0;
          return tb - ta;
        })[0] ?? null
    );
  }, [audits]);

  const openActionsTotal = useMemo(
    () =>
      audits.reduce(
        (sum, a) => sum + a.findings.reduce((s, f) => s + f.actions.filter((x) => x.status !== 'COMPLETED').length, 0),
        0,
      ),
    [audits],
  );
  const overdueActionsTotal = useMemo(
    () => audits.reduce((sum, a) => sum + a.findings.reduce((s, f) => s + f.actions.filter(isActionOverdue).length, 0), 0),
    [audits],
  );

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
      await updateAnnualAuditStatus(token, statusModal.audit._id, { status: statusModal.next });
      const next = statusModal.next;
      setStatusModal(null);
      await Promise.all([loadAudits(), loadCompliance()]);
      setBanner(`Estado actualizado a ${ANNUAL_AUDIT_STATUS_LABELS[next]}.`);
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

  const auditById = useCallback((id: string) => audits.find((a) => a._id === id) ?? null, [audits]);

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/check"
        backLabel="← Volver a Verificación"
        moduleCode="6.1.2"
        moduleTitle="Auditoría anual"
        description="Programa, ejecución, informe, hallazgos y seguimiento de la auditoría anual al SG-SST."
        statusBadge={statusBadge}
        actions={writable
          ? [{ label: '🔄 Recargar', onClick: () => { void loadAudits(); void loadCompliance(); }, variant: 'secondary' as const }]
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
            label: 'Cumplimiento oficial 6.1.2',
            value: loading ? '…' : status === 'NO_DATA' ? 'Sin datos' : percentage === null ? 'N/D' : `${percentage}%`,
            variant: status === 'TARGET_MET' ? 'success' : status === 'NO_DATA' || compliance === null ? 'warning' : 'danger',
          },
          { label: 'Auditorías', value: counters?.totalAudits ?? audits.length, variant: 'info' },
          { label: 'Acciones abiertas', value: counters?.openActions ?? openActionsTotal, variant: 'warning' },
          { label: 'Acciones vencidas', value: counters?.overdueActions ?? overdueActionsTotal, variant: 'danger' },
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
              title="Cumplimiento oficial — 6.1.2"
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
                          ? metadata?.noDataReason === 'no-audits'
                            ? 'Sin datos evaluables — todavía no existen auditorías registradas.'
                            : 'Sin auditorías evaluables — existen registros, pero ninguno cumple las condiciones mínimas (COMPLETED + fechas reales + informe).'
                          : `${percentage ?? 0}%`}
                      </strong>
                      <p style={{ margin: 0 }}>
                        Estado: {status ?? '—'} · Nivel: {compliance.level} ·{' '}
                        Período evaluado: {metadata?.evaluatedPeriod ?? '—'}
                      </p>
                    </div>
                    {latestEvaluable ? (
                      <div className="card">
                        <strong>{latestEvaluable.auditCode ? `${latestEvaluable.auditCode} — ` : ''}{latestEvaluable.title}</strong>
                        <p style={{ margin: 0 }}>
                          Auditoría evaluable más reciente · Auditor: {latestEvaluable.auditorNameSnapshot || '—'} ·{' '}
                          Ejecución: {formatDate(latestEvaluable.actualStartDate)} → {formatDate(latestEvaluable.actualEndDate)} ·{' '}
                          Informe: {formatDate(latestEvaluable.reportDate)}
                        </p>
                        <p style={{ margin: 0 }}>
                          Hallazgos: {latestEvaluable.findings.length} ·{' '}
                          Acciones abiertas: {latestEvaluable.findings.reduce((s, f) => s + f.actions.filter((x) => x.status !== 'COMPLETED').length, 0)}
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
                          {ANNUAL_AUDIT_DIMENSION_KEYS.map((key) => {
                            const dim = metadata.dimensions[key];
                            const pct = annualAuditRatioToPercent(dim?.ratio);
                            const details = dim && typeof dim === 'object' ? (dim as Record<string, unknown>) : null;
                            const detailText = details
                              ? Object.entries(details)
                                  .filter(([k, v]) => !['ratio', 'numerator', 'denominator', 'weight'].includes(k) && v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && typeof v !== 'object')
                                  .map(([k, v]) => `${k}: ${String(v)}`)
                                  .join(' · ')
                              : '';
                            return (
                              <tr key={key}>
                                <td>{ANNUAL_AUDIT_DIMENSION_LABELS[key]}</td>
                                <td>{pct === null ? 'No evaluable' : `${pct}%`}</td>
                                <td>{dim?.weight ?? ANNUAL_AUDIT_DIMENSION_WEIGHT_FALLBACK[key]}%</td>
                                <td>{dim?.numerator ?? '—'}</td>
                                <td>{dim?.denominator ?? '—'}</td>
                                <td>{detailText || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
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

                  {/* E4: IA 6.1.2 — sección claramente diferenciada del
                      resultado oficial; su fallo no afecta la gestión. */}
                  <ComplianceAIInsight token={token} standardCode="6.1.2" />
                </>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ AUDITORÍAS ══════════════ */}
          {activeTab === 'auditorias' && (
            <AdvancedSection
              title="Auditorías"
              description={`Registradas: ${audits.length} · Mostradas: ${filteredAudits.length}`}
            >
              {writable ? (
                <div style={{ marginBottom: '.75rem' }}>
                  <Button onClick={() => setFormModal({ mode: 'create' })}>+ Nueva auditoría</Button>
                </div>
              ) : null}

              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Estado">
                  <option value="">Todos los estados</option>
                  {(Object.keys(ANNUAL_AUDIT_STATUS_LABELS) as AnnualAuditStatus[]).map((s) => (
                    <option key={s} value={s}>{ANNUAL_AUDIT_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Tipo">
                  <option value="">Todos los tipos</option>
                  <option value="INTERNAL">Interna</option>
                  <option value="EXTERNAL">Externa</option>
                </Select>
                <Select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} aria-label="Año">
                  <option value="">Todos los años</option>
                  {[...new Set(audits.map((a) => (a.actualEndDate ?? a.plannedEndDate ?? a.createdAt ?? '').slice(0, 4)).filter(Boolean))].sort().reverse().map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
                <Select value={filterAuditor} onChange={(e) => setFilterAuditor(e.target.value)} aria-label="Auditor">
                  <option value="">Todos los auditores</option>
                  {auditors.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
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
                    <th>Código</th><th>Título</th><th>Tipo</th><th>Auditor</th><th>Estado</th>
                    <th>Planificada</th><th>Ejecución</th><th>Hallazgos</th><th>Acciones abiertas</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudits.length === 0 ? (
                    <tr><td colSpan={10}>{audits.length === 0 ? 'Sin auditorías registradas.' : 'Sin resultados para los filtros aplicados.'}</td></tr>
                  ) : (
                    filteredAudits.map((a) => {
                      const openActions = a.findings.reduce((s, f) => s + f.actions.filter((x) => x.status !== 'COMPLETED').length, 0);
                      return (
                        <tr key={a._id}>
                          <td>{a.auditCode || '—'}</td>
                          <td>{a.title}</td>
                          <td>{a.auditType ? AUDIT_TYPE_LABELS[a.auditType] : '—'}</td>
                          <td>{a.auditorNameSnapshot || '—'}</td>
                          <td><span className={`badge ${STATUS_VARIANTS[a.status]}`}>{ANNUAL_AUDIT_STATUS_LABELS[a.status]}</span></td>
                          <td>{formatDate(a.plannedStartDate)} → {formatDate(a.plannedEndDate)}</td>
                          <td>{formatDate(a.actualStartDate)} → {formatDate(a.actualEndDate)}</td>
                          <td>{a.findings.length}</td>
                          <td>{openActions}</td>
                          <td>
                            <div className="actions">
                              <Button variant="ghost" onClick={() => setDetailAuditId(a._id)}>Ver</Button>
                              {writable && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? (
                                <Button variant="secondary" onClick={() => setFormModal({ mode: 'edit', audit: a })}>Editar</Button>
                              ) : null}
                              {writable && VALID_TRANSITIONS[a.status].length > 0
                                ? VALID_TRANSITIONS[a.status].map((next) => (
                                    <Button
                                      key={next}
                                      variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                      onClick={() => setStatusModal({ audit: a, next })}
                                    >
                                      {TRANSITION_LABELS[next] ?? next}
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
      {detailAuditId ? (
        <AnnualAuditDetail
          token={token}
          writable={writable}
          auditId={detailAuditId}
          revision={detailRevision}
          documents={documents}
          onError={(msg) => setBanner(`Error: ${msg}`)}
          onClose={() => setDetailAuditId(null)}
          onEdit={() => {
            const a = auditById(detailAuditId);
            if (a) setFormModal({ mode: 'edit', audit: a });
          }}
          onStatus={(a, next) => setStatusModal({ audit: a, next })}
          onEvidence={(a, kind) => setEvidenceModal({ audit: a, kind })}
          onNewFinding={(auditId) => setFindingModal({ auditId, mode: 'create' })}
          onEditFinding={(auditId, finding) => setFindingModal({ auditId, mode: 'edit', finding })}
          onNewAction={(auditId, findingId) => setActionModal({ auditId, findingId, mode: 'create' })}
          onEditAction={(auditId, findingId, action) => setActionModal({ auditId, findingId, mode: 'edit', action })}
        />
      ) : null}

      {/* ══════════════ MODALES ══════════════ */}

      {formModal ? (
        <AnnualAuditFormModal
          token={token}
          mode={formModal.mode}
          audit={formModal.mode === 'edit' ? formModal.audit : null}
          users={users}
          onClose={() => setFormModal(null)}
          onSaved={async (saved) => {
            setFormModal(null);
            await loadAudits();
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner(
              saved.status === 'DRAFT'
                ? 'Auditoría creada en borrador. Complete la planificación y luego "Planificar".'
                : 'Auditoría guardada.',
            );
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {statusModal ? (
        <Modal
          isOpen
          title={`${TRANSITION_LABELS[statusModal.next] ?? statusModal.next} — ${statusModal.audit.title}`}
          onClose={() => setStatusModal(null)}
        >
          <p>
            Cambiará el estado de <strong>{ANNUAL_AUDIT_STATUS_LABELS[statusModal.audit.status]}</strong> a{' '}
            <strong>{ANNUAL_AUDIT_STATUS_LABELS[statusModal.next]}</strong>.
            {statusModal.next === 'COMPLETED'
              ? ' Una auditoría COMPLETED queda en solo lectura y no puede reabrirse.'
              : statusModal.next === 'CANCELLED'
                ? ' Una auditoría CANCELLED queda en solo lectura y no puede reactivarse.'
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

      {findingModal ? (
        <FindingFormModal
          token={token}
          mode={findingModal.mode}
          auditId={findingModal.auditId}
          finding={findingModal.mode === 'edit' ? findingModal.finding : null}
          users={users}
          onClose={() => setFindingModal(null)}
          onSaved={async (updated) => {
            setFindingModal(null);
            if (updated) setAudits((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Hallazgo guardado.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {actionModal ? (
        <ActionFormModal
          token={token}
          mode={actionModal.mode}
          auditId={actionModal.auditId}
          findingId={actionModal.findingId}
          action={actionModal.mode === 'edit' ? actionModal.action : null}
          users={users}
          onClose={() => setActionModal(null)}
          onSaved={async (updated) => {
            setActionModal(null);
            if (updated) setAudits((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Acción guardada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {evidenceModal ? (
        <EvidenceModal
          token={token}
          audit={evidenceModal.audit}
          kind={evidenceModal.kind}
          documents={documents}
          onClose={() => setEvidenceModal(null)}
          onSaved={async (updated) => {
            setEvidenceModal(null);
            if (updated) setAudits((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
            void loadCompliance();
            setDetailRevision((r) => r + 1);
            setBanner('Evidencia asociada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}
    </AdvancedPageLayout>
  );
}

// ═══════════════════════════ Detalle ═══════════════════════════

/**
 * Detalle de auditoría (modal de página completa) con hallazgos, acciones,
 * evidencias e historial. La carga de detalle/historial es a demanda; el
 * fallo del historial no rompe el detalle principal (FASE 23).
 */
function AnnualAuditDetail(props: {
  token: string;
  writable: boolean;
  auditId: string;
  /** Se incrementa con cada mutación del padre → refresca el detalle. */
  revision: number;
  documents: DocumentMasterItem[];
  onClose: () => void;
  onEdit: () => void;
  onStatus: (audit: AnnualAuditModel, next: AnnualAuditStatus) => void;
  onEvidence: (audit: AnnualAuditModel, kind: 'report' | 'competence') => void;
  onNewFinding: (auditId: string) => void;
  onEditFinding: (auditId: string, finding: AnnualAuditFindingModel) => void;
  onNewAction: (auditId: string, findingId: string) => void;
  onEditAction: (auditId: string, findingId: string, action: AnnualAuditActionModel) => void;
  onError: (message: string) => void;
}) {
  const {
    token, writable, auditId, revision, documents, onClose,
    onEdit, onStatus, onEvidence, onNewFinding, onEditFinding, onNewAction, onEditAction, onError,
  } = props;
  const [audit, setAudit] = useState<AnnualAuditModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<AnnualAuditHistoryModel[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const detail = await fetchAnnualAudit(token, auditId);
        if (!cancelled) setAudit(detail);
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
  }, [token, auditId, revision]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchAnnualAuditHistory(token, auditId);
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
      <Modal isOpen title="Detalle de auditoría" onClose={onClose}>
        <p>Cargando…</p>
      </Modal>
    );
  }
  if (!audit) {
    return (
      <Modal isOpen title="Detalle de auditoría" onClose={onClose}>
        <p>No fue posible cargar la auditoría.</p>
      </Modal>
    );
  }

  const readOnly = audit.status === 'COMPLETED' || audit.status === 'CANCELLED';
  const reportDoc = audit.reportDocumentId
    ? documents.find((d) => d._id === audit.reportDocumentId) ?? null
    : null;
  const competenceDoc = audit.auditorCompetenceEvidenceId
    ? documents.find((d) => d._id === audit.auditorCompetenceEvidenceId) ?? null
    : null;

  return (
    <Modal isOpen title={`${audit.auditCode ? `${audit.auditCode} — ` : ''}${audit.title}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <div>
          <span className={`badge ${STATUS_VARIANTS[audit.status]}`}>{ANNUAL_AUDIT_STATUS_LABELS[audit.status]}</span>{' '}
          {audit.auditType ? <span className="badge badge--info">{AUDIT_TYPE_LABELS[audit.auditType]}</span> : null}
          {readOnly ? <span className="badge badge--warning">🔒 Solo lectura</span> : null}
        </div>

        <h4>Información general</h4>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Auditor:</strong> {audit.auditorNameSnapshot || '—'}</p>
            <p style={{ margin: 0 }}><strong>Planificada:</strong> {formatDate(audit.plannedStartDate)} → {formatDate(audit.plannedEndDate)}</p>
            <p style={{ margin: 0 }}><strong>Ejecución real:</strong> {formatDate(audit.actualStartDate)} → {formatDate(audit.actualEndDate)}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Alcance:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{audit.scope || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Objetivos:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{audit.objectives || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Criterios:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{audit.criteria || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Metodología:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{audit.methodology || '—'}</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <p style={{ margin: 0 }}><strong>Competencia del auditor:</strong></p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{audit.auditorCompetence || '—'}</p>
            <p style={{ margin: 0 }}>
              <strong>Evidencia de competencia:</strong>{' '}
              {competenceDoc ? `${competenceDoc.code} — ${competenceDoc.name}` : '—'}
            </p>
          </div>
        </div>

        <h4>Informe</h4>
        <p style={{ margin: 0 }}>
          <strong>Título:</strong> {audit.reportTitle || '—'} · <strong>Fecha:</strong> {formatDate(audit.reportDate)}
        </p>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{audit.reportSummary || 'Sin resumen del informe.'}</p>
        <p style={{ margin: 0 }}>
          <strong>Resumen de hallazgos:</strong> {audit.findingsSummary || '—'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Documento:</strong>{' '}
          {reportDoc ? `${reportDoc.code} — ${reportDoc.name} (v${reportDoc.version})` : 'Sin documento asociado'}
          {reportDoc ? (
            <>
              {' '}
              <Button variant="ghost" onClick={() => window.open('/document-management', '_blank')}>Ver en Gestión documental</Button>
            </>
          ) : null}
        </p>
        <p style={{ margin: 0 }}>
          <strong>URL de evidencia:</strong>{' '}
          {audit.reportEvidenceUrl ? (
            <a href={audit.reportEvidenceUrl} target="_blank" rel="noreferrer">{audit.reportEvidenceUrl}</a>
          ) : '—'}
        </p>

        {writable ? (
          <div className="actions">
            {!readOnly ? <Button variant="secondary" onClick={onEdit}>Editar</Button> : null}
            <Button variant="secondary" onClick={() => onEvidence(audit, 'report')}>Evidencia de informe</Button>
            <Button variant="secondary" onClick={() => onEvidence(audit, 'competence')}>Evidencia de competencia</Button>
            {!readOnly && audit.status === 'IN_PROGRESS' ? (
              <Button onClick={() => onStatus(audit, 'COMPLETED')}>Completar auditoría</Button>
            ) : null}
          </div>
        ) : null}

        <h4>Hallazgos ({audit.findings.length})</h4>
        {writable && !readOnly ? (
          <div>
            <Button onClick={() => onNewFinding(audit._id)}>+ Nuevo hallazgo</Button>
          </div>
        ) : null}
        {audit.findings.length === 0 ? (
          <p>Sin hallazgos registrados. Una auditoría sin hallazgos es válida si no se detectaron no conformidades.</p>
        ) : (
          audit.findings.map((f) => {
            const overdue = f.actions.filter(isActionOverdue).length;
            const open = f.actions.filter((x) => x.status !== 'COMPLETED').length;
            return (
              <div key={f._id} className="card" style={{ marginBottom: '.5rem' }}>
                <div>
                  <span className="badge badge--info">{AUDIT_FINDING_TYPE_LABELS[f.type]}</span>{' '}
                  {f.severity ? <span className={`badge ${SEVERITY_VARIANTS[f.severity]}`}>{AUDIT_FINDING_SEVERITY_LABELS[f.severity]}</span> : null}{' '}
                  <span className={`badge ${f.status === 'CLOSED' ? 'badge--success' : f.status === 'IN_PROGRESS' ? 'badge--warning' : 'badge--info'}`}>
                    {AUDIT_FINDING_STATUS_LABELS[f.status]}
                  </span>
                  {writable && !readOnly ? (
                    <Button variant="ghost" onClick={() => onEditFinding(audit._id, f)}>Editar</Button>
                  ) : null}
                </div>
                <p style={{ margin: '.25rem 0' }}><strong>{f.description}</strong></p>
                <p style={{ margin: 0 }}>Criterio: {f.criterion || '—'} · Evidencia: {f.evidence || '—'}</p>
                <p style={{ margin: 0 }}>
                  Responsable: {f.responsibleNameSnapshot || f.responsibleUserId || '—'} · Límite: {formatDate(f.dueDate)}
                  {f.observations ? ` · Observaciones: ${f.observations}` : ''}
                </p>

                <h5 style={{ margin: '.5rem 0 .25rem' }}>
                  Acciones ({f.actions.length}{open ? ` · ${open} abiertas` : ''}{overdue ? ` · ${overdue} vencidas` : ''})
                </h5>
                {writable && !readOnly ? (
                  <Button variant="secondary" onClick={() => onNewAction(audit._id, f._id)}>+ Nueva acción</Button>
                ) : null}
                {f.actions.length === 0 ? (
                  <p style={{ margin: 0 }}>Sin acciones de seguimiento.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr><th>Descripción</th><th>Responsable</th><th>Límite</th><th>Estado</th><th>Completada</th><th>Evidencia</th></tr>
                    </thead>
                    <tbody>
                      {f.actions.map((act) => {
                        const actOverdue = isActionOverdue(act);
                        return (
                          <tr key={act._id}>
                            <td>{act.description}</td>
                            <td>{act.responsible}</td>
                            <td>{formatDate(act.dueDate)}</td>
                            <td>
                              <span className={`badge ${act.status === 'COMPLETED' ? 'badge--success' : act.status === 'IN_PROGRESS' ? 'badge--warning' : 'badge--info'}`}>
                                {AUDIT_ACTION_STATUS_LABELS[act.status]}
                              </span>
                              {actOverdue ? <span className="badge badge--danger">Vencida</span> : null}
                            </td>
                            <td>{formatDate(act.completedDate)}</td>
                            <td>
                              {act.evidenceUrl ? (
                                <a href={act.evidenceUrl} target="_blank" rel="noreferrer">Ver</a>
                              ) : '—'}
                            </td>
                            <td>
                              {writable && !readOnly ? (
                                <Button variant="ghost" onClick={() => onEditAction(audit._id, f._id, act)}>Editar</Button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </div>
            );
          })
        )}

        <h4>Historial</h4>
        {writable || true ? (
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
                  <tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Comentario</th></tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h._id}>
                      <td>{new Date(h.createdAt).toLocaleString()}</td>
                      <td>{ANNUAL_AUDIT_HISTORY_ACTION_LABELS[h.action] ?? h.action}</td>
                      <td>{h.userEmail}</td>
                      <td>{h.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        ) : null}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Formulario de auditoría ═══════════════════════════

type AuditFormState = {
  auditCode: string; title: string; auditType: AnnualAuditType;
  plannedStartDate: string; plannedEndDate: string;
  scope: string; objectives: string; criteria: string; methodology: string;
  auditorUserId: string; auditorNameSnapshot: string; auditorCompetence: string;
  actualStartDate: string; actualEndDate: string;
  reportTitle: string; reportDate: string; reportSummary: string;
  reportEvidenceUrl: string; findingsSummary: string;
};

function emptyAuditForm(): AuditFormState {
  return {
    auditCode: '', title: '', auditType: 'INTERNAL',
    plannedStartDate: '', plannedEndDate: '',
    scope: '', objectives: '', criteria: '', methodology: '',
    auditorUserId: '', auditorNameSnapshot: '', auditorCompetence: '',
    actualStartDate: '', actualEndDate: '',
    reportTitle: '', reportDate: '', reportSummary: '',
    reportEvidenceUrl: '', findingsSummary: '',
  };
}

function auditFormFrom(a: AnnualAuditModel): AuditFormState {
  const iso = (v?: string) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  return {
    auditCode: a.auditCode ?? '',
    title: a.title,
    auditType: a.auditType ?? 'INTERNAL',
    plannedStartDate: iso(a.plannedStartDate),
    plannedEndDate: iso(a.plannedEndDate),
    scope: a.scope ?? '',
    objectives: a.objectives ?? '',
    criteria: a.criteria ?? '',
    methodology: a.methodology ?? '',
    auditorUserId: a.auditorUserId ?? '',
    auditorNameSnapshot: a.auditorNameSnapshot ?? '',
    auditorCompetence: a.auditorCompetence ?? '',
    actualStartDate: iso(a.actualStartDate),
    actualEndDate: iso(a.actualEndDate),
    reportTitle: a.reportTitle ?? '',
    reportDate: iso(a.reportDate),
    reportSummary: a.reportSummary ?? '',
    reportEvidenceUrl: a.reportEvidenceUrl ?? '',
    findingsSummary: a.findingsSummary ?? '',
  };
}

/**
 * Formulario de auditoría basado estrictamente en Create/UpdateAnnualAuditDto
 * (forbidNonWhitelisted): nunca envía companyId/createdBy/history/timestamps.
 * Fechas de informe/ejecución solo se ofrecen en edición (la creación es la
 * fase de planificación; el estado se cambia por endpoint dedicado).
 */
function AnnualAuditFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  audit: AnnualAuditModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (saved: AnnualAuditModel) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { token, mode, audit, users, onClose, onSaved, onError } = props;
  const [form, setForm] = useState<AuditFormState>(
    mode === 'edit' && audit ? auditFormFrom(audit) : emptyAuditForm(),
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AuditFormState>(key: K, value: AuditFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    // Validación de rangos en frontend (el backend re-valida server-side).
    if (form.plannedStartDate && form.plannedEndDate && form.plannedStartDate > form.plannedEndDate) {
      onError('La fecha de inicio planificada no puede ser posterior a la fecha fin planificada.');
      return;
    }
    if (form.actualStartDate && form.actualEndDate && form.actualStartDate > form.actualEndDate) {
      onError('La fecha real de inicio no puede ser posterior a la fecha real de fin.');
      return;
    }
    for (const [label, value] of [
      ['inicio planificada', form.plannedStartDate],
      ['fin planificada', form.plannedEndDate],
      ['inicio real', form.actualStartDate],
      ['fin real', form.actualEndDate],
      ['fecha del informe', form.reportDate],
    ] as Array<[string, string]>) {
      if (value && !isISODate(value)) {
        onError(`La fecha de ${label} no es válida.`);
        return;
      }
    }

    // Snapshot del nombre del auditor a partir del usuario seleccionado.
    const selectedUser = users.find((u) => u._id === form.auditorUserId);
    const auditorName = selectedUser
      ? `${selectedUser.firstName} ${selectedUser.lastName}`.trim() || selectedUser.email
      : form.auditorNameSnapshot.trim();

    // Creación: solo campos de planificación (CreateAnnualAuditDto).
    const createPayload: CreateAnnualAuditPayload = {
      title: form.title.trim(),
      auditType: form.auditType,
    };
    if (form.auditCode.trim()) createPayload.auditCode = form.auditCode.trim();
    if (form.plannedStartDate) createPayload.plannedStartDate = form.plannedStartDate;
    if (form.plannedEndDate) createPayload.plannedEndDate = form.plannedEndDate;
    if (form.scope.trim()) createPayload.scope = form.scope.trim();
    if (form.objectives.trim()) createPayload.objectives = form.objectives.trim();
    if (form.criteria.trim()) createPayload.criteria = form.criteria.trim();
    if (form.methodology.trim()) createPayload.methodology = form.methodology.trim();
    if (form.auditorUserId) createPayload.auditorUserId = form.auditorUserId;
    if (auditorName) createPayload.auditorNameSnapshot = auditorName;
    if (form.auditorCompetence.trim()) createPayload.auditorCompetence = form.auditorCompetence.trim();

    setSaving(true);
    try {
      if (mode === 'edit' && audit) {
        // Edición: UpdateAnnualAuditDto (todo opcional; incluye ejecución e informe).
        const updatePayload: Record<string, string> = {};
        if (form.auditCode.trim()) updatePayload.auditCode = form.auditCode.trim();
        updatePayload.title = form.title.trim();
        updatePayload.auditType = form.auditType;
        if (form.plannedStartDate) updatePayload.plannedStartDate = form.plannedStartDate;
        if (form.plannedEndDate) updatePayload.plannedEndDate = form.plannedEndDate;
        if (form.scope.trim()) updatePayload.scope = form.scope.trim();
        if (form.objectives.trim()) updatePayload.objectives = form.objectives.trim();
        if (form.criteria.trim()) updatePayload.criteria = form.criteria.trim();
        if (form.methodology.trim()) updatePayload.methodology = form.methodology.trim();
        if (form.auditorUserId) updatePayload.auditorUserId = form.auditorUserId;
        if (auditorName) updatePayload.auditorNameSnapshot = auditorName;
        if (form.auditorCompetence.trim()) updatePayload.auditorCompetence = form.auditorCompetence.trim();
        if (form.actualStartDate) updatePayload.actualStartDate = form.actualStartDate;
        if (form.actualEndDate) updatePayload.actualEndDate = form.actualEndDate;
        if (form.reportTitle.trim()) updatePayload.reportTitle = form.reportTitle.trim();
        if (form.reportDate) updatePayload.reportDate = form.reportDate;
        if (form.reportSummary.trim()) updatePayload.reportSummary = form.reportSummary.trim();
        if (form.reportEvidenceUrl.trim()) updatePayload.reportEvidenceUrl = form.reportEvidenceUrl.trim();
        if (form.findingsSummary.trim()) updatePayload.findingsSummary = form.findingsSummary.trim();

        const saved = await updateAnnualAudit(token, audit._id, updatePayload);
        await onSaved(saved);
      } else {
        const saved = await createAnnualAudit(token, createPayload);
        await onSaved(saved);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={mode === 'edit' ? 'Editar auditoría' : 'Nueva auditoría'} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <h4>Identificación</h4>
        <label>Código (opcional, único por empresa)<Input value={form.auditCode} onChange={(e) => set('auditCode', e.target.value)} maxLength={100} /></label>
        <label>Título *<Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={300} /></label>
        <label>Tipo
          <Select value={form.auditType} onChange={(e) => set('auditType', e.target.value as AnnualAuditType)}>
            <option value="INTERNAL">Interna</option>
            <option value="EXTERNAL">Externa</option>
          </Select>
        </label>

        <h4>Planeación</h4>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Inicio planificado
            <Input type="date" value={form.plannedStartDate} onChange={(e) => set('plannedStartDate', e.target.value)} />
          </label>
          <label>Fin planificado
            <Input type="date" value={form.plannedEndDate} onChange={(e) => set('plannedEndDate', e.target.value)} />
          </label>
        </div>
        <label>Alcance<textarea className="input" rows={2} value={form.scope} onChange={(e) => set('scope', e.target.value)} maxLength={2000} /></label>
        <label>Objetivos<textarea className="input" rows={2} value={form.objectives} onChange={(e) => set('objectives', e.target.value)} maxLength={2000} /></label>
        <label>Criterios<textarea className="input" rows={2} value={form.criteria} onChange={(e) => set('criteria', e.target.value)} maxLength={2000} /></label>
        <label>Metodología<textarea className="input" rows={2} value={form.methodology} onChange={(e) => set('methodology', e.target.value)} maxLength={2000} /></label>

        <h4>Auditor</h4>
        <label>Auditor (usuarios de la empresa)
          <Select value={form.auditorUserId} onChange={(e) => set('auditorUserId', e.target.value)}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email} ({u.email})</option>
            ))}
          </Select>
        </label>
        <label>Competencia del auditor (formación/experiencia)
          <textarea className="input" rows={2} value={form.auditorCompetence} onChange={(e) => set('auditorCompetence', e.target.value)} maxLength={2000} />
        </label>

        {mode === 'edit' ? (
          <>
            <h4>Ejecución e informe</h4>
            <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
              <label>Inicio real
                <Input type="date" value={form.actualStartDate} onChange={(e) => set('actualStartDate', e.target.value)} />
              </label>
              <label>Fin real
                <Input type="date" value={form.actualEndDate} onChange={(e) => set('actualEndDate', e.target.value)} />
              </label>
            </div>
            <label>Título del informe<Input value={form.reportTitle} onChange={(e) => set('reportTitle', e.target.value)} maxLength={300} /></label>
            <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
              <label>Fecha del informe
                <Input type="date" value={form.reportDate} onChange={(e) => set('reportDate', e.target.value)} />
              </label>
              <label>URL de evidencia del informe<Input value={form.reportEvidenceUrl} onChange={(e) => set('reportEvidenceUrl', e.target.value)} maxLength={500} /></label>
            </div>
            <label>Resumen del informe<textarea className="input" rows={3} value={form.reportSummary} onChange={(e) => set('reportSummary', e.target.value)} maxLength={2000} /></label>
            <label>Resumen de hallazgos<textarea className="input" rows={2} value={form.findingsSummary} onChange={(e) => set('findingsSummary', e.target.value)} maxLength={2000} /></label>
          </>
        ) : (
          <p style={{ margin: 0, color: '#64748b' }}>
            La ejecución y el informe se documentan después de crear la auditoría (editar) y sus estados se
            gestionan con Planificar → Iniciar → Completar.
          </p>
        )}
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving || !form.title.trim()} onClick={() => void submit()}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Formulario de hallazgo ═══════════════════════════

function FindingFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  auditId: string;
  finding: AnnualAuditFindingModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (updated: AnnualAuditModel) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { token, mode, auditId, finding, users, onClose, onSaved, onError } = props;
  const [type, setType] = useState<AuditFindingType>(finding?.type ?? 'NON_CONFORMITY');
  const [description, setDescription] = useState(finding?.description ?? '');
  const [criterion, setCriterion] = useState(finding?.criterion ?? '');
  const [evidence, setEvidence] = useState(finding?.evidence ?? '');
  const [severity, setSeverity] = useState<AuditFindingSeverity>(finding?.severity ?? 'MEDIUM');
  const [responsibleUserId, setResponsibleUserId] = useState(finding?.responsibleUserId ?? '');
  const [dueDate, setDueDate] = useState(finding?.dueDate ? new Date(finding.dueDate).toISOString().slice(0, 10) : '');
  const [status, setStatus] = useState<AuditFindingStatus>(finding?.status ?? 'OPEN');
  const [observations, setObservations] = useState(finding?.observations ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      if (mode === 'edit' && finding) {
        const payload: Record<string, string> = {
          type,
          description: description.trim(),
          criterion: criterion.trim(),
          evidence: evidence.trim(),
          severity,
          status,
          observations: observations.trim(),
        };
        if (responsibleUserId) payload.responsibleUserId = responsibleUserId;
        if (dueDate) payload.dueDate = dueDate;
        const updated = await updateAnnualAuditFinding(token, auditId, finding._id, payload);
        await onSaved(updated);
      } else {
        const payload: CreateAuditFindingPayload = {
          type,
          description: description.trim(),
          severity,
          status,
        };
        if (criterion.trim()) payload.criterion = criterion.trim();
        if (evidence.trim()) payload.evidence = evidence.trim();
        if (responsibleUserId) payload.responsibleUserId = responsibleUserId;
        if (dueDate) payload.dueDate = dueDate;
        if (observations.trim()) payload.observations = observations.trim();
        const updated = await createAnnualAuditFinding(token, auditId, payload);
        await onSaved(updated);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={mode === 'edit' ? 'Editar hallazgo' : 'Nuevo hallazgo'} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Tipo *
            <Select value={type} onChange={(e) => setType(e.target.value as AuditFindingType)}>
              {(Object.keys(AUDIT_FINDING_TYPE_LABELS) as AuditFindingType[]).map((t) => (
                <option key={t} value={t}>{AUDIT_FINDING_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </label>
          <label>Severidad
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as AuditFindingSeverity)}>
              {(Object.keys(AUDIT_FINDING_SEVERITY_LABELS) as AuditFindingSeverity[]).map((s) => (
                <option key={s} value={s}>{AUDIT_FINDING_SEVERITY_LABELS[s]}</option>
              ))}
            </Select>
          </label>
          <label>Estado
            <Select value={status} onChange={(e) => setStatus(e.target.value as AuditFindingStatus)}>
              {(Object.keys(AUDIT_FINDING_STATUS_LABELS) as AuditFindingStatus[]).map((s) => (
                <option key={s} value={s}>{AUDIT_FINDING_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </label>
        </div>
        <label>Descripción *<textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></label>
        <label>Criterio<textarea className="input" rows={2} value={criterion} onChange={(e) => setCriterion(e.target.value)} maxLength={2000} /></label>
        <label>Evidencia<textarea className="input" rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={2000} /></label>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Responsable
            <Select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>
              ))}
            </Select>
          </label>
          <label>Fecha límite
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <label>Observaciones<textarea className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={2000} /></label>
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving || !description.trim()} onClick={() => void submit()}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Formulario de acción ═══════════════════════════

function ActionFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  auditId: string;
  findingId: string;
  action: AnnualAuditActionModel | null;
  users: UserModel[];
  onClose: () => void;
  onSaved: (updated: AnnualAuditModel) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { token, mode, auditId, findingId, action, users, onClose, onSaved, onError } = props;
  const [description, setDescription] = useState(action?.description ?? '');
  const [responsibleUserId, setResponsibleUserId] = useState(action?.responsibleUserId ?? '');
  const [responsibleText, setResponsibleText] = useState(action?.responsible ?? '');
  const [dueDate, setDueDate] = useState(action?.dueDate ? new Date(action.dueDate).toISOString().slice(0, 10) : '');
  const [status, setStatus] = useState<AuditActionStatus>(action?.status ?? 'PENDING');
  const [completedDate, setCompletedDate] = useState(
    action?.completedDate ? new Date(action.completedDate).toISOString().slice(0, 10) : '',
  );
  const [evidenceUrl, setEvidenceUrl] = useState(action?.evidenceUrl ?? '');
  const [observations, setObservations] = useState(action?.observations ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (status === 'COMPLETED' && !completedDate) {
      onError('Indique la fecha de completitud de la acción.');
      return;
    }
    setSaving(true);
    try {
      const selectedUser = users.find((u) => u._id === responsibleUserId);
      const responsible = selectedUser
        ? `${selectedUser.firstName} ${selectedUser.lastName}`.trim() || selectedUser.email
        : responsibleText.trim();

      if (mode === 'edit' && action) {
        const payload: Record<string, string> = {
          description: description.trim(),
          responsible,
          status,
          observations: observations.trim(),
        };
        if (dueDate) payload.dueDate = dueDate;
        if (completedDate) payload.completedDate = completedDate;
        if (evidenceUrl.trim()) payload.evidenceUrl = evidenceUrl.trim();
        if (responsibleUserId) payload.responsibleUserId = responsibleUserId;
        const updated = await updateAnnualAuditAction(token, auditId, findingId, action._id, payload);
        await onSaved(updated);
      } else {
        if (!responsible) {
          onError('Indique el responsable de la acción.');
          setSaving(false);
          return;
        }
        const payload: CreateAuditActionPayload = {
          description: description.trim(),
          responsible,
          status,
        };
        if (responsibleUserId) payload.responsibleUserId = responsibleUserId;
        if (dueDate) payload.dueDate = dueDate;
        if (completedDate) payload.completedDate = completedDate;
        if (evidenceUrl.trim()) payload.evidenceUrl = evidenceUrl.trim();
        if (observations.trim()) payload.observations = observations.trim();
        const updated = await createAnnualAuditAction(token, auditId, findingId, payload);
        await onSaved(updated);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={mode === 'edit' ? 'Editar acción de seguimiento' : 'Nueva acción de seguimiento'} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <label>Descripción *<textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></label>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Responsable (usuario)
            <Select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>
              ))}
            </Select>
          </label>
          {!responsibleUserId ? (
            <label>Responsable (texto)<Input value={responsibleText} onChange={(e) => setResponsibleText(e.target.value)} maxLength={300} /></label>
          ) : null}
        </div>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Fecha límite<Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label>Estado
            <Select value={status} onChange={(e) => setStatus(e.target.value as AuditActionStatus)}>
              {(Object.keys(AUDIT_ACTION_STATUS_LABELS) as AuditActionStatus[]).map((s) => (
                <option key={s} value={s}>{AUDIT_ACTION_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </label>
          {status === 'COMPLETED' ? (
            <label>Fecha de completitud *<Input type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} /></label>
          ) : null}
        </div>
        <label>URL de evidencia de cierre<Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} maxLength={500} /></label>
        <label>Observaciones<textarea className="input" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={2000} /></label>
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving || !description.trim()} onClick={() => void submit()}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ Evidencia documental ═══════════════════════════

/**
 * Evidencias: referencia tenant-safe a DocumentMaster (sin uploads nuevos y
 * sin duplicar documentos). El backend valida que el documento pertenezca a
 * la misma empresa (E1) — aquí solo se selecciona de la lista del tenant.
 */
function EvidenceModal(props: {
  token: string;
  audit: AnnualAuditModel;
  kind: 'report' | 'competence';
  documents: DocumentMasterItem[];
  onClose: () => void;
  onSaved: (updated: AnnualAuditModel) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { token, audit, kind, documents, onClose, onSaved, onError } = props;
  const [documentId, setDocumentId] = useState(
    kind === 'report' ? (audit.reportDocumentId ?? '') : (audit.auditorCompetenceEvidenceId ?? ''),
  );
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const title = kind === 'report' ? 'Evidencia del informe de auditoría' : 'Evidencia de competencia del auditor';

  const submit = async () => {
    if (!documentId) {
      onError('Seleccione un documento de la empresa.');
      return;
    }
    setSaving(true);
    try {
      const payload = { documentId, ...(comment.trim() ? { comment: comment.trim() } : {}) };
      const updated =
        kind === 'report'
          ? await attachAnnualAuditReportEvidence(token, audit._id, payload)
          : await attachAnnualAuditCompetenceEvidence(token, audit._id, payload);
      await onSaved(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={title} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <label>Documento de la empresa (DocumentMaster)
          <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
            <option value="">—</option>
            {documents.map((d) => (
              <option key={d._id} value={d._id}>{d.code} — {d.name} (v{d.version})</option>
            ))}
          </Select>
        </label>
        <label>Comentario<Input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} /></label>
        <p style={{ margin: 0, color: '#64748b' }}>
          La evidencia es una referencia al documento; no se duplica el archivo. El backend valida que
          el documento pertenezca a su empresa.
        </p>
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving} onClick={() => void submit()}>{saving ? 'Asociando…' : 'Asociar evidencia'}</Button>
      </div>
    </Modal>
  );
}
