import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreateIncidentPayload,
  EmployeeModel,
  UpdateIncidentPayload,
  createIncident,
  deleteIncident,
  fetchAdmins,
  fetchEmployees,
  fetchIncidents,
  fetchMembers,
  updateIncident,
  type UserModel,
} from '../api';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useCompanyContext } from '../context/CompanyContext';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  type IncidentModel,
  type IncidentComplianceMetadataV1,
  INCIDENT_DIMENSION_KEYS,
  INCIDENT_DIMENSION_LABELS,
  INCIDENT_DIMENSION_WEIGHT_FALLBACK,
  INCIDENT_LIFECYCLE_STAGE_LABELS,
  INCIDENT_LIFECYCLE_STAGE_VARIANTS,
  INCIDENT_FINDING_LABELS,
  isIncidentComplianceMetadataV1,
  isActionOverdue,
  incidentRatioToPercent,
  type IncidentDimensionKey,
  type IncidentLifecycleStage,
} from '../types/incidents';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  type HeaderAction,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
} from '../components/advanced-layout';
import { Button } from '../components/ui/Button';
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';
import { IncidentCaseDetailModal } from '../components/IncidentCaseDetailModal';

interface IncidentsPageProps {
  token: string;
  /** Rol del usuario autenticado (control de visualización; el backend es la autoridad). */
  role?: string;
}

type IncidentFormState = CreateIncidentPayload;

const emptyIncident: IncidentFormState = {
  employeeId: '',
  type: '',
  date: '',
  description: '',
  severity: 'Media',
  status: 'Abierto',
};

const TABS: SidebarTabItem[] = [
  { id: 'registro', label: 'Registro', icon: '📝' },
  { id: 'accidentalidad', label: 'Accidentalidad', icon: '📋' },
  { id: 'gestion713', label: 'Gestión 7.1.3', icon: '🛡️' },
  { id: 'cumplimiento', label: 'Cumplimiento', icon: '📊' },
  { id: 'auditoria', label: 'Auditoría', icon: '🔍' },
];

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

function canWrite(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function IncidentsPage({ token, role }: IncidentsPageProps) {
  const { companyId } = useCompanyContext();
  const writable = canWrite(role);
  const [incidents, setIncidents] = useState<IncidentModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [users, setUsers] = useState<UserModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [form, setForm] = useState<IncidentFormState>(emptyIncident);
  const [activeTab, setActiveTab] = useState('registro');

  // ── Compliance oficial 7.1.3 (fuente única: moduleCompliance) ──
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<IncidentComplianceMetadataV1 | null>(null);

  // ── Detalle del caso ──
  const [detailIncidentId, setDetailIncidentId] = useState<string | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee._id, employee.name])),
    [employees],
  );

  // KPIs de accidentalidad (3.2.1 — presentación; sin scoring 7.1.3).
  const kpis = useMemo(() => {
    const total = incidents.length;
    const abiertos = incidents.filter((i) => i.status === 'Abierto').length;
    const cerrados = incidents.filter((i) => i.status === 'Cerrado').length;
    const accidents = incidents.filter((i) => (i.investigationType ?? 'ACCIDENT') !== 'DISEASE').length;
    const diseases = incidents.filter((i) => i.investigationType === 'DISEASE').length;
    const altaSeveridad = incidents.filter(
      (i) => i.severity?.toLowerCase() === 'alta' || i.severity?.toLowerCase() === 'critical' || i.severity?.toLowerCase() === 'alto'
    ).length;
    return { total, abiertos, cerrados, accidents, diseases, altaSeveridad };
  }, [incidents]);

  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === 'incident-actions') ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isIncidentComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === 'incident-actions'));
  }, [token]);

  const loadUsers = useCallback(async () => {
    // Solo owner/admin/manager acceden a la gestión avanzada; la carga de
    // usuarios es tolerante (lista de responsables del tenant).
    const [admins, members] = await Promise.all([
      fetchAdmins(token).catch(() => [] as UserModel[]),
      fetchMembers(token).catch(() => [] as UserModel[]),
    ]);
    setUsers([...admins, ...members]);
  }, [token]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [incidentData, employeeData] = await Promise.all([
        fetchIncidents(token),
        fetchEmployees(token),
      ]);

      setIncidents(incidentData);
      setEmployees(employeeData);

      if (!form.employeeId && employeeData.length > 0) {
        setForm((prev) => ({ ...prev, employeeId: employeeData[0]._id }));
      }
      void loadCompliance();
      void loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar incidentes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, token]);

  const resetForm = () => {
    setForm({
      ...emptyIncident,
      employeeId: employees[0]?._id ?? '',
    });
    setEditingIncidentId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingIncidentId) {
        const payload: UpdateIncidentPayload = { ...form };
        await updateIncident(token, editingIncidentId, payload);
      } else {
        await createIncident(token, form);
      }

      resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar el incidente.');
      setLoading(false);
    }
  };

  const handleEdit = (incident: IncidentModel) => {
    setEditingIncidentId(incident._id);
    setForm({
      employeeId: incident.employeeId,
      type: incident.type,
      date: incident.date.slice(0, 10),
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
    });
    setActiveTab('registro');
  };

  const handleDelete = async (incidentId: string) => {
    setLoading(true);
    setError('');

    try {
      await deleteIncident(token, incidentId);
      if (editingIncidentId === incidentId) {
        resetForm();
      }
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el incidente.');
      setLoading(false);
    }
  };

  // ── Derivados de presentación 7.1.3 (sin recálculo de score) ──
  const percentage = compliance?.compliance ?? null;
  const status = compliance?.status ?? null;
  const counters = metadata?.counters ?? null;
  const detailIncident = detailIncidentId ? incidents.find((i) => i._id === detailIncidentId) ?? null : null;

  const headerActions: HeaderAction[] = [
    {
      label: loading ? 'Cargando...' : '🔄 Recargar',
      onClick: () => void loadData(),
      variant: 'secondary',
      disabled: loading,
    },
  ];

  return (
    <AdvancedPageLayout>
      {error ? <p className="error">{error}</p> : null}

      <AdvancedHeader
        backPath="/dashboard"
        backLabel="← Volver al Panel"
        moduleCode="SST-ACC-001 · 7.1.3"
        moduleTitle="Accidentalidad y acciones por accidentes"
        description="Investigación, análisis causal, acciones preventivas/correctivas y seguimiento"
        statusBadge={
          status === 'NO_DATA' ? (
            <span className="badge badge--warning">Sin datos evaluables (7.1.3)</span>
          ) : status === 'TARGET_MET' ? (
            <span className="badge badge--success">🎯 Meta cumplida (7.1.3: {percentage}%)</span>
          ) : percentage !== null ? (
            <span className="badge badge--warning">7.1.3: {percentage}%</span>
          ) : (
            <span className="badge badge--success">🟢 Activo</span>
          )
        }
        actions={headerActions}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Total Accidentes/Incidentes', value: kpis.total, variant: 'info' },
          { label: 'Accidentes', value: kpis.accidents, variant: 'default' },
          { label: 'Enfermedades laborales', value: kpis.diseases, variant: 'default' },
          { label: 'Casos Abiertos', value: kpis.abiertos, variant: kpis.abiertos > 0 ? 'warning' : 'success' },
          { label: 'Casos Cerrados', value: kpis.cerrados, variant: 'success' },
          { label: 'Alta Severidad', value: kpis.altaSeveridad, variant: kpis.altaSeveridad > 0 ? 'danger' : 'default' },
        ]}
        columns={6}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: REGISTRO (3.2.1 — intacto) ===================== */}
          {activeTab === 'registro' && (
            <AdvancedSection
              title={editingIncidentId ? 'Editar Incidente' : 'Registrar Incidente'}
              description="Registro básico de accidentalidad (3.2.1): accidentes, incidentes y enfermedades laborales"
              accent="info"
            >
              {!writable ? (
                <p className="muted">Modo lectura: el registro y la edición de accidentalidad corresponden a owner/admin. Puede consultar los casos en la pestaña Accidentalidad y la gestión 7.1.3 en su pestaña.</p>
              ) : null}
              {writable ? (
              <form onSubmit={handleSubmit} className="form-grid">
                <div className="grid grid-2">
                  <label className="field"><span className="label">Empleado *</span>
                    <Select value={form.employeeId} onChange={(event) => setForm((prev) => ({ ...prev, employeeId: event.target.value }))} required>
                      {!employees.length ? <option value="">No hay empleados disponibles</option> : null}
                      {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}
                    </Select>
                  </label>
                  <label className="field"><span className="label">Tipo *</span>
                    <Input value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))} placeholder="incidente/accidente" required />
                  </label>
                  <label className="field"><span className="label">Fecha *</span>
                    <Input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} required />
                  </label>
                  <label className="field"><span className="label">Severidad *</span>
                    <Input value={form.severity} onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))} required />
                  </label>
                  <label className="field"><span className="label">Estado *</span>
                    <Input value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required />
                  </label>
                </div>
                <label className="field"><span className="label">Descripción *</span>
                  <textarea className="input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required rows={3} />
                </label>
                <div className="actions">
                  <Button type="submit" disabled={loading || !employees.length}>
                    {editingIncidentId ? 'Editar incidente' : 'Crear incidente'}
                  </Button>
                  {editingIncidentId ? (
                    <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button>
                  ) : null}
                </div>
              </form>
              ) : null}
            </AdvancedSection>
          )}

          {/* ===================== TAB: ACCIDENTALIDAD (3.2.1 — intacto) ===================== */}
          {activeTab === 'accidentalidad' && (
            <>
              <AdvancedSection
                title="Registro de Accidentalidad"
                description={`Total de registros: ${incidents.length}`}
                accent="default"
              >
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Empleado</th>
                        <th>Tipo</th>
                        <th>Fecha</th>
                        <th>Severidad</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map((incident) => (
                        <tr key={incident._id}>
                          <td>{employeeNames.get(incident.employeeId) ?? incident.employeeId}</td>
                          <td><span className="badge badge--info">{incident.type}</span></td>
                          <td>{formatDate(incident.date)}</td>
                          <td>
                            <span className={`badge ${
                              incident.severity?.toLowerCase() === 'alta' || incident.severity?.toLowerCase() === 'critical'
                                ? 'badge--danger'
                                : incident.severity?.toLowerCase() === 'media'
                                ? 'badge--warning'
                                : 'badge--success'
                            }`}>
                              {incident.severity}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${
                              incident.status === 'Cerrado' ? 'badge--success' : 'badge--warning'
                            }`}>
                              {incident.status}
                            </span>
                          </td>
                          <td>
                            {writable ? (
                              <div className="actions">
                                <Button type="button" variant="secondary" onClick={() => handleEdit(incident)}>Editar</Button>
                                <Button type="button" variant="danger" onClick={() => handleDelete(incident._id)}>Eliminar</Button>
                              </div>
                            ) : (
                              <Button type="button" variant="secondary" onClick={() => { setDetailIncidentId(incident._id); setDetailRevision((r) => r + 1); }}>Ver detalle</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!incidents.length ? (
                        <tr><td colSpan={6}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay incidentes registrados.</p></td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdvancedSection>

              {/* Historial */}
              <AdvancedSection title="Historial" description="Eventos recientes del módulo de accidentalidad" accent="info">
                <div className="timeline">
                  {incidents.length > 0 ? (
                    [...incidents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map((inc) => (
                      <article key={inc._id} className="timeline__item">
                        <strong>{inc.type}</strong>
                        <p>{employeeNames.get(inc.employeeId) ?? inc.employeeId} — {formatDate(inc.date)}</p>
                        <small className="muted">Severidad: {inc.severity} · Estado: {inc.status}</small>
                      </article>
                    ))
                  ) : (
                    <p className="muted">Sin eventos registrados.</p>
                  )}
                </div>
              </AdvancedSection>

              {/* Auditoría */}
              <AdvancedSection title="Auditoría" description="Registro de cambios y modificaciones" accent="warning">
                <p className="muted">
                  La auditoría detallada estará disponible próximamente. 
                  Actualmente se registran {incidents.length} incidentes en el sistema.
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <span className="badge badge--info">📅 Última actualización: {incidents.length > 0 ? formatDate(Math.max(...incidents.map((i) => new Date(i.date).getTime())).toString()) : '—'}</span>
                </div>
              </AdvancedSection>

              {/* Última actualización */}
              <AdvancedSection title="Última Actualización" accent="default">
                <p className="muted">
                  Datos sincronizados al {new Date().toLocaleString('es-CO')}.
                  {incidents.length > 0 ? ` Total de registros: ${incidents.length}.` : ' No hay registros disponibles.'}
                </p>
              </AdvancedSection>
            </>
          )}

          {/* ===================== TAB: GESTIÓN 7.1.3 ===================== */}
          {activeTab === 'gestion713' && (
            <>
              {/* Panel oficial — única fuente: moduleCompliance */}
              <AdvancedSection
                title="7.1.3 — Acciones por accidentes"
                description="Investigación → análisis causal → acciones → seguimiento → evidencia → cierre documentado (fuente oficial del cumplimiento: ComplianceEngine)"
                accent="warning"
              >
                {status === 'NO_DATA' ? (
                  <div>
                    <p>
                      <span className="badge badge--warning">Sin datos evaluables</span>
                    </p>
                    <p className="muted">
                      No hay accidentes o incidentes evaluables para 7.1.3. Los casos de enfermedad laboral
                      (DISEASE) pertenecen al estándar 3.2.2 y no puntúan este estándar; para activar la
                      evaluación deben existir casos de tipo ACCIDENT o INCIDENTE.
                    </p>
                    {counters && counters.diseasesExcluded > 0 ? (
                      <p className="muted">Casos de enfermedad excluidos del puntaje: {counters.diseasesExcluded}.</p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '2rem', fontWeight: 800 }}>{percentage !== null ? `${percentage}%` : '—'}</span>
                      <span className="badge badge--info">Meta: {metadata?.target ?? 90}%</span>
                      {metadata?.evaluatedPeriod ? <span className="badge badge--default">Vigencia: {metadata.evaluatedPeriod}</span> : null}
                    </div>

                    {/* Dimensiones oficiales (ratio → % solo presentación) */}
                    <div className="grid grid-2" style={{ gap: '0.75rem', marginTop: '0.75rem' }}>
                      {INCIDENT_DIMENSION_KEYS.map((key: IncidentDimensionKey) => {
                        const dim = metadata?.dimensions?.[key];
                        const pct = incidentRatioToPercent(dim?.ratio);
                        const weight = metadata?.weights?.[key] ?? INCIDENT_DIMENSION_WEIGHT_FALLBACK[key];
                        return (
                          <div key={key} className="card" style={{ padding: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                              <strong>{INCIDENT_DIMENSION_LABELS[key]}</strong>
                              <span className="badge badge--default">{weight}%</span>
                            </div>
                            <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.25rem 0 0' }}>
                              {pct === null ? 'N/D' : `${pct}%`}
                            </p>
                            {dim && typeof dim.numerator === 'number' && typeof dim.denominator === 'number' ? (
                              <p className="muted" style={{ margin: 0 }}>
                                {dim.numerator}/{dim.denominator}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {/* Counters oficiales */}
                    {counters ? (
                      <div className="grid grid-2" style={{ gap: '0.5rem', marginTop: '0.75rem' }}>
                        <span className="badge badge--info">Casos evaluables: {counters.evaluableIncidents}</span>
                        <span className="badge badge--info">Investigados: {counters.investigatedCases}</span>
                        <span className="badge badge--info">Con acciones: {counters.casesWithActions}</span>
                        <span className="badge badge--info">Acciones totales: {counters.totalActions}</span>
                        <span className="badge badge--info">Completadas: {counters.completedActions}</span>
                        <span className="badge badge--danger">Vencidas: {counters.overdueActions}</span>
                        <span className="badge badge--info">Con seguimiento: {counters.actionsWithFollowUp}</span>
                        <span className="badge badge--success">Casos cerrados: {counters.casesClosed}</span>
                      </div>
                    ) : null}
                  </>
                )}
              </AdvancedSection>

              {/* Findings oficiales */}
              {findings.length > 0 && status !== 'NO_DATA' ? (
                <AdvancedSection title="Hallazgos oficiales" description="Producidos por el ComplianceEngine — presentación directa" accent="danger">
                  <div className="advanced-list">
                    {findings.map((f) => (
                      <article key={f.id} className="advanced-list__item">
                        <strong>{f.title}</strong>
                        <p>{f.description}</p>
                        <small className="muted">
                          {INCIDENT_FINDING_LABELS[f.id] ?? ''} · Prioridad: {f.priority}
                        </small>
                      </article>
                    ))}
                  </div>
                </AdvancedSection>
              ) : null}

              {/* IA oficial */}
              <AdvancedSection title="Análisis IA del estándar 7.1.3" description="Asistente IA — apoyo sobre el resultado oficial (no recalcula)" accent="info">
                <ComplianceAIInsight token={token} standardCode="7.1.3" />
              </AdvancedSection>

              {/* Listado de casos con etapa 7.1.3 */}
              <AdvancedSection
                title="Casos e investigación"
                description="Seleccione un caso para gestionar su investigación, acciones, evidencia, seguimiento y cierre"
                accent="warning"
              >
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Descripción</th>
                        <th>Severidad</th>
                        <th>Estado</th>
                        <th>Etapa 7.1.3</th>
                        <th>Investigación</th>
                        <th>Acciones</th>
                        <th>Vencimientos</th>
                        <th>Evidencia</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents
                        .filter((i) => (i.investigationType ?? 'ACCIDENT') !== 'DISEASE')
                        .map((incident) => {
                          const actions = [...(incident.correctiveActions ?? []), ...(incident.preventiveActions ?? [])];
                          const overdue = actions.filter((a) => isActionOverdue(a)).length;
                          const stage = incident.lifecycleStage as IncidentLifecycleStage | undefined;
                          return (
                            <tr key={incident._id}>
                              <td>{formatDate(incident.date)}</td>
                              <td><span className="badge badge--info">{incident.type}</span></td>
                              <td>{incident.description}</td>
                              <td>{incident.severity}</td>
                              <td>{incident.status}</td>
                              <td>
                                {stage ? (
                                  <span className={`badge ${INCIDENT_LIFECYCLE_STAGE_VARIANTS[stage] ?? 'badge--info'}`}>
                                    {INCIDENT_LIFECYCLE_STAGE_LABELS[stage] ?? stage}
                                  </span>
                                ) : (
                                  <span className="badge badge--info">Sin iniciar</span>
                                )}
                              </td>
                              <td>
                                {incident.investigationDate ? (
                                  <span className="badge badge--success">Iniciada</span>
                                ) : (
                                  <span className="badge badge--warning">Pendiente</span>
                                )}
                              </td>
                              <td>{actions.length}</td>
                              <td>{overdue > 0 ? <span className="badge badge--danger">{overdue} vencida(s)</span> : '—'}</td>
                              <td>
                                {(incident.investigationEvidence?.length ?? 0) > 0 || (incident.evidence?.length ?? 0) > 0 ? (
                                  <span className="badge badge--success">Sí</span>
                                ) : (
                                  <span className="badge badge--warning">No</span>
                                )}
                              </td>
                              <td>
                                <Button type="button" variant="secondary" onClick={() => { setDetailIncidentId(incident._id); setDetailRevision((r) => r + 1); }}>
                                  Ver detalle
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      {incidents.filter((i) => (i.investigationType ?? 'ACCIDENT') !== 'DISEASE').length === 0 ? (
                        <tr><td colSpan={11}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Aún no hay casos de accidente/incidente registrados. Regístrelos en la pestaña Registro.</p></td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdvancedSection>
            </>
          )}

          {/* ===================== TAB: CUMPLIMIENTO (indicadores 3.2.1) ===================== */}
          {activeTab === 'cumplimiento' && (
            <AdvancedSection title="Indicadores de Accidentalidad" description="Métricas calculadas con los datos registrados (3.2.1)" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Tasa de Cierre</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: kpis.total > 0 ? '#10b981' : '#6b7280' }}>
                    {kpis.total > 0 ? Math.round((kpis.cerrados / kpis.total) * 100) : 0}%
                  </p>
                  <p className="muted">{kpis.cerrados} de {kpis.total} casos cerrados</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Casos Abiertos</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: kpis.abiertos > 0 ? '#f59e0b' : '#10b981' }}>
                    {kpis.abiertos}
                  </p>
                  <p className="muted">Pendientes de resolución</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Alta Severidad</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: kpis.altaSeveridad > 0 ? '#ef4444' : '#6b7280' }}>
                    {kpis.altaSeveridad}
                  </p>
                  <p className="muted">Casos críticos que requieren atención</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Total Registros</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#3b82f6' }}>
                    {kpis.total}
                  </p>
                  <p className="muted">Incidentes y accidentes registrados</p>
                </div>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: AUDITORÍA ===================== */}
          {activeTab === 'auditoria' && (
            <AdvancedSection
              title="Auditoría del Sistema"
              description="Información de seguimiento y control del módulo de Accidentalidad Laboral"
              accent="warning"
            >
              <div className="advanced-list">
                <article className="advanced-list__item">
                  <strong>Módulo</strong>
                  <p>Accidentalidad Laboral (SST-ACC-001) · Gestión 7.1.3</p>
                  <small className="muted">Versión 2.0 — investigación, acciones, seguimiento y cierre</small>
                </article>
                <article className="advanced-list__item">
                  <strong>Total de registros</strong>
                  <p>{incidents.length} incidentes/accidentes</p>
                  <small className="muted">Datos cargados desde el backend</small>
                </article>
                <article className="advanced-list__item">
                  <strong>Última sincronización</strong>
                  <p>{new Date().toLocaleString('es-CO')}</p>
                  <small className="muted">Los datos se actualizan automáticamente al crear, editar o eliminar</small>
                </article>
                <article className="advanced-list__item">
                  <strong>Empleados registrados</strong>
                  <p>{employees.length} empleados en el sistema</p>
                  <small className="muted">Fuente: Módulo de empleados</small>
                </article>
              </div>
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* Detalle del caso (modal — evita navegación entre páginas) */}
      {detailIncident ? (
        <IncidentCaseDetailModal
          token={token}
          incident={detailIncident}
          writable={writable}
          users={users}
          revision={detailRevision}
          onClose={() => setDetailIncidentId(null)}
          onMutated={() => {
            setDetailRevision((r) => r + 1);
            void loadData();
          }}
        />
      ) : null}
    </AdvancedPageLayout>
  );
}
