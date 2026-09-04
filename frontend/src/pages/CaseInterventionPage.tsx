import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreateIncidentPayload,
  IncidentModel,
  UpdateIncidentPayload,
  createIncident,
  deleteIncident,
  fetchIncidents,
  updateIncident,
  fetchStandardAnalysis,
  type StandardAnalysisResponse,
} from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useCompanyContext } from '../context/CompanyContext';
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

/**
 * FASE 9D — Página de gestión del estándar 3.3.3
 * "Intervención y seguimiento de casos"
 *
 * Reutiliza el módulo Incident existente.
 * Filtra los casos que tienen investigativeActions (corrective/preventive).
 */

interface CaseInterventionPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'casos', label: 'Casos', icon: '📋' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

function statusBadgeClass(status: string): string {
  const s = status?.toUpperCase() ?? '';
  if (s === 'COMPLETED' || s === 'Cerrado') return 'badge--success';
  if (s === 'IN_PROGRESS') return 'badge--info';
  if (s === 'PENDING') return 'badge--warning';
  if (s === 'CANCELLED') return 'badge--muted';
  return 'badge--warning';
}

function statusLabel(status: string): string {
  const s = status?.toUpperCase() ?? '';
  if (s === 'COMPLETED') return 'Completada';
  if (s === 'IN_PROGRESS') return 'En progreso';
  if (s === 'PENDING') return 'Pendiente';
  if (s === 'CANCELLED') return 'Cancelada';
  if (s === 'Cerrado' || s === 'CERRADO') return 'Cerrado';
  return status || '—';
}

function severityBadge(severity: string): string {
  const s = severity?.toLowerCase() ?? '';
  if (s.includes('alta') || s.includes('grave') || s.includes('critic')) return 'badge--danger';
  if (s.includes('media') || s.includes('moderad')) return 'badge--warning';
  return 'badge--info';
}

export function CaseInterventionPage({ token, role }: CaseInterventionPageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [incidents, setIncidents] = useState<IncidentModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('casos');
  const [selectedIncident, setSelectedIncident] = useState<IncidentModel | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<StandardAnalysisResponse | null>(null);
  const [intelligenceError, setIntelligenceError] = useState('');

  // Form state
  const [form, setForm] = useState({
    type: 'Incidente laboral',
    date: '',
    description: '',
    severity: 'Media',
    status: 'Abierto',
    responsible: '',
    investigationDate: '',
    closureDate: '',
    correctiveActions: [] as Array<{ action: string; responsible: string; status: string; dueDate: string; completedDate: string }>,
    preventiveActions: [] as Array<{ action: string; responsible: string; status: string; dueDate: string; completedDate: string }>,
  });

  // ── Data loading ──
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchIncidents(token);
      setIncidents(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar los casos.');
    } finally {
      setLoading(false);
    }
  };

  const loadIntelligence = async () => {
    setIntelligenceLoading(true);
    setIntelligenceError('');
    try {
      const data = await fetchStandardAnalysis(token, '3.3.3');
      setIntelligence(data);
    } catch (requestError) {
      setIntelligenceError(requestError instanceof Error ? requestError.message : 'No fue posible cargar el análisis.');
    } finally {
      setIntelligenceLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [companyId, token]);

  useEffect(() => {
    if (activeTab === 'intelligence') {
      void loadIntelligence();
    }
  }, [activeTab]);

  // ── Computed metrics ──
  const metrics = useMemo(() => {
    const total = incidents.length;
    const now = new Date();

    let totalActions = 0;
    let completedActions = 0;
    let openActions = 0;
    let overdueActions = 0;
    let casesWithIntervention = 0;
    let casesWithClosure = 0;

    for (const c of incidents) {
      const allActions = [
        ...((c as any).correctiveActions ?? []),
        ...((c as any).preventiveActions ?? []),
      ];
      totalActions += allActions.length;
      for (const a of allActions) {
        if (a.status === 'COMPLETED') {
          completedActions++;
        } else {
          openActions++;
          if (a.dueDate && new Date(a.dueDate).getTime() < now.getTime()) {
            overdueActions++;
          }
        }
      }
      if (allActions.length > 0) casesWithIntervention++;
      if ((c as any).closureDate) casesWithClosure++;
    }

    return {
      total,
      totalActions,
      completedActions,
      openActions,
      overdueActions,
      casesWithIntervention,
      casesWithClosure,
      interventionRate: total > 0 ? Math.round((casesWithIntervention / total) * 100) : 0,
      closureRate: total > 0 ? Math.round((casesWithClosure / total) * 100) : 0,
    };
  }, [incidents]);

  // ── CRUD handlers ──
  const resetForm = () => {
    setForm({
      type: 'Incidente laboral',
      date: '',
      description: '',
      severity: 'Media',
      status: 'Abierto',
      responsible: '',
      investigationDate: '',
      closureDate: '',
      correctiveActions: [],
      preventiveActions: [],
    });
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload: CreateIncidentPayload = {
        employeeId: '000000000000000000000000', // Placeholder — backend will resolve from JWT
        type: form.type,
        date: form.date,
        description: form.description,
        severity: form.severity,
        status: form.status,
        responsible: form.responsible || undefined,
        investigationDate: form.investigationDate || undefined,
        closureDate: form.closureDate || undefined,
        correctiveActions: form.correctiveActions.length > 0 ? form.correctiveActions.map((a) => ({
          action: a.action,
          responsible: a.responsible,
          status: a.status || 'PENDING',
          dueDate: a.dueDate || undefined,
          completedDate: a.completedDate || undefined,
        })) : undefined,
        preventiveActions: form.preventiveActions.length > 0 ? form.preventiveActions.map((a) => ({
          action: a.action,
          responsible: a.responsible,
          status: a.status || 'PENDING',
          dueDate: a.dueDate || undefined,
          completedDate: a.completedDate || undefined,
        })) : undefined,
      };

      if (editingId) {
        await updateIncident(token, editingId, payload as UpdateIncidentPayload);
      } else {
        await createIncident(token, payload);
      }

      resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar el caso.');
      setLoading(false);
    }
  };

  const handleEdit = (incident: IncidentModel) => {
    setEditingId(incident._id);
    setForm({
      type: incident.type,
      date: incident.date.slice(0, 10),
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      responsible: (incident as any).responsible ?? '',
      investigationDate: (incident as any).investigationDate?.slice(0, 10) ?? '',
      closureDate: (incident as any).closureDate?.slice(0, 10) ?? '',
      correctiveActions: ((incident as any).correctiveActions ?? []).map((a: any) => ({
        action: a.action ?? '',
        responsible: a.responsible ?? '',
        status: a.status ?? 'PENDING',
        dueDate: a.dueDate?.slice(0, 10) ?? '',
        completedDate: a.completedDate?.slice(0, 10) ?? '',
      })),
      preventiveActions: ((incident as any).preventiveActions ?? []).map((a: any) => ({
        action: a.action ?? '',
        responsible: a.responsible ?? '',
        status: a.status ?? 'PENDING',
        dueDate: a.dueDate?.slice(0, 10) ?? '',
        completedDate: a.completedDate?.slice(0, 10) ?? '',
      })),
    });
    setActiveTab('casos');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este caso?')) return;
    setLoading(true);
    setError('');
    try {
      await deleteIncident(token, id);
      if (editingId === id) resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el caso.');
      setLoading(false);
    }
  };

  // ── Action helpers ──
  const addAction = (type: 'correctiveActions' | 'preventiveActions') =>
    setForm((prev) => ({
      ...prev,
      [type]: [...prev[type], { action: '', responsible: '', status: 'PENDING', dueDate: '', completedDate: '' }],
    }));

  const removeAction = (type: 'correctiveActions' | 'preventiveActions', index: number) =>
    setForm((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }));

  const updateAction = (type: 'correctiveActions' | 'preventiveActions', index: number, field: string, value: string) =>
    setForm((prev) => ({
      ...prev,
      [type]: prev[type].map((a, i) => i === index ? { ...a, [field]: value } : a),
    }));

  // ── Header actions ──
  const headerActions: HeaderAction[] = [
    { label: '← Volver al PHVA', onClick: () => navigate('/documents/do'), variant: 'secondary' },
    { label: loading ? 'Cargando...' : '🔄 Recargar', onClick: () => void loadData(), variant: 'secondary', disabled: loading },
  ];

  // ── NO_DATA state ──
  if (!loading && incidents.length === 0) {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/do"
          backLabel="← Volver al PHVA"
          moduleCode="SST-CI-003"
          moduleTitle="Intervención y seguimiento de casos"
          description="Gestión integral de casos de salud laboral con trazabilidad de acciones y cierre — Estándar 3.3.3"
          statusBadge={<span className="badge badge--info">📋 3.3.3</span>}
          actions={headerActions}
        />
        <AdvancedSection title="Estado vacío" description="No hay casos registrados" accent="info">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1rem' }}>
              No hay casos de salud laboral registrados.
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Los casos gestionados aparecerán aquí para dar seguimiento a las intervenciones.
            </p>
            <Button onClick={() => setActiveTab('casos')}>
              + Registrar caso
            </Button>
          </div>
        </AdvancedSection>
      </AdvancedPageLayout>
    );
  }

  return (
    <AdvancedPageLayout>
      {error ? <p className="error">{error}</p> : null}

      <AdvancedHeader
        backPath="/documents/do"
        backLabel="← Volver al PHVA"
        moduleCode="SST-CI-003"
        moduleTitle="Intervención y seguimiento de casos"
        description="Gestión integral de casos de salud laboral con trazabilidad de acciones y cierre — Estándar 3.3.3"
        statusBadge={<span className="badge badge--info">📋 3.3.3</span>}
        actions={headerActions}
      />

      {/* KPIs */}
      <AdvancedKpiGrid
        items={[
          { label: 'Total casos', value: metrics.total, variant: 'info' },
          { label: 'Casos intervenidos', value: metrics.casesWithIntervention, variant: metrics.casesWithIntervention > 0 ? 'success' : 'warning' },
          { label: 'Acciones abiertas', value: metrics.openActions, variant: metrics.openActions > 0 ? 'warning' : 'success' },
          { label: 'Acciones vencidas', value: metrics.overdueActions, variant: metrics.overdueActions > 0 ? 'danger' : 'success' },
          { label: 'Acciones completadas', value: metrics.completedActions, variant: 'success' },
          { label: 'Casos cerrados', value: metrics.casesWithClosure, variant: metrics.casesWithClosure > 0 ? 'success' : 'info' },
          { label: 'Intervención %', value: `${metrics.interventionRate}%`, variant: metrics.interventionRate >= 70 ? 'success' : 'warning' },
          { label: 'Cierre %', value: `${metrics.closureRate}%`, variant: metrics.closureRate >= 70 ? 'success' : 'warning' },
        ]}
        columns={4}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: CASOS ===================== */}
          {activeTab === 'casos' && (
            <>
              {/* Form */}
              <AdvancedSection
                title={editingId ? 'Editar caso' : 'Registrar caso'}
                description="Complete los campos para gestionar un caso de salud laboral"
                accent="info"
              >
                <form onSubmit={handleSubmit} className="form-grid">
                  <div className="grid grid-2">
                    <label className="field"><span className="label">Tipo *</span>
                      <Input value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))} required />
                    </label>
                    <label className="field"><span className="label">Fecha del evento *</span>
                      <Input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} required />
                    </label>
                    <label className="field"><span className="label">Severidad *</span>
                      <Select value={form.severity} onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))} required>
                        <option value="Baja">Baja</option>
                        <option value="Media">Media</option>
                        <option value="Alta">Alta</option>
                        <option value="Crítica">Crítica</option>
                      </Select>
                    </label>
                    <label className="field"><span className="label">Estado *</span>
                      <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required>
                        <option value="Abierto">Abierto</option>
                        <option value="En proceso">En proceso</option>
                        <option value="Cerrado">Cerrado</option>
                      </Select>
                    </label>
                    <label className="field"><span className="label">Responsable</span>
                      <Input value={form.responsible} onChange={(event) => setForm((prev) => ({ ...prev, responsible: event.target.value }))} placeholder="Nombre del responsable" />
                    </label>
                    <label className="field"><span className="label">Fecha de investigación</span>
                      <Input type="date" value={form.investigationDate} onChange={(event) => setForm((prev) => ({ ...prev, investigationDate: event.target.value }))} />
                    </label>
                    <label className="field"><span className="label">Fecha de cierre</span>
                      <Input type="date" value={form.closureDate} onChange={(event) => setForm((prev) => ({ ...prev, closureDate: event.target.value }))} />
                    </label>
                  </div>
                  <label className="field"><span className="label">Descripción *</span>
                    <textarea className="input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required rows={3} />
                  </label>

                  {/* Acciones correctivas */}
                  <AdvancedSection title="Acciones correctivas" description="Defina las acciones correctivas del caso" accent="info">
                    {form.correctiveActions.map((action, index) => (
                      <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'end' }}>
                        <label className="field"><span className="label">Acción</span>
                          <Input value={action.action} onChange={(event) => updateAction('correctiveActions', index, 'action', event.target.value)} placeholder="Descripción" />
                        </label>
                        <label className="field"><span className="label">Responsable</span>
                          <Input value={action.responsible} onChange={(event) => updateAction('correctiveActions', index, 'responsible', event.target.value)} placeholder="Responsable" />
                        </label>
                        <label className="field"><span className="label">Estado</span>
                          <Select value={action.status} onChange={(event) => updateAction('correctiveActions', index, 'status', event.target.value)}>
                            <option value="PENDING">Pendiente</option>
                            <option value="IN_PROGRESS">En progreso</option>
                            <option value="COMPLETED">Completada</option>
                            <option value="CANCELLED">Cancelada</option>
                          </Select>
                        </label>
                        <label className="field"><span className="label">Fecha límite</span>
                          <Input type="date" value={action.dueDate} onChange={(event) => updateAction('correctiveActions', index, 'dueDate', event.target.value)} />
                        </label>
                        <Button type="button" variant="danger" onClick={() => removeAction('correctiveActions', index)}>✕</Button>
                      </div>
                    ))}
                    <Button type="button" variant="secondary" onClick={() => addAction('correctiveActions')}>+ Agregar acción correctiva</Button>
                  </AdvancedSection>

                  {/* Acciones preventivas */}
                  <AdvancedSection title="Acciones preventivas" description="Defina las acciones preventivas del caso" accent="info">
                    {form.preventiveActions.map((action, index) => (
                      <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'end' }}>
                        <label className="field"><span className="label">Acción</span>
                          <Input value={action.action} onChange={(event) => updateAction('preventiveActions', index, 'action', event.target.value)} placeholder="Descripción" />
                        </label>
                        <label className="field"><span className="label">Responsable</span>
                          <Input value={action.responsible} onChange={(event) => updateAction('preventiveActions', index, 'responsible', event.target.value)} placeholder="Responsable" />
                        </label>
                        <label className="field"><span className="label">Estado</span>
                          <Select value={action.status} onChange={(event) => updateAction('preventiveActions', index, 'status', event.target.value)}>
                            <option value="PENDING">Pendiente</option>
                            <option value="IN_PROGRESS">En progreso</option>
                            <option value="COMPLETED">Completada</option>
                            <option value="CANCELLED">Cancelada</option>
                          </Select>
                        </label>
                        <label className="field"><span className="label">Fecha límite</span>
                          <Input type="date" value={action.dueDate} onChange={(event) => updateAction('preventiveActions', index, 'dueDate', event.target.value)} />
                        </label>
                        <Button type="button" variant="danger" onClick={() => removeAction('preventiveActions', index)}>✕</Button>
                      </div>
                    ))}
                    <Button type="button" variant="secondary" onClick={() => addAction('preventiveActions')}>+ Agregar acción preventiva</Button>
                  </AdvancedSection>

                  <div className="actions">
                    <Button type="submit" disabled={loading}>
                      {editingId ? 'Guardar cambios' : 'Crear caso'}
                    </Button>
                    {editingId ? (
                      <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button>
                    ) : null}
                  </div>
                </form>
              </AdvancedSection>

              {/* Listado */}
              <AdvancedSection
                title="Casos registrados"
                description={`Total: ${incidents.length} casos`}
                accent="default"
              >
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Fecha</th>
                        <th>Severidad</th>
                        <th>Estado</th>
                        <th>Responsable</th>
                        <th>Intervención</th>
                        <th>Acciones</th>
                        <th>Cierre</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map((incident) => {
                        const hasActions = ((incident as any).correctiveActions?.length ?? 0) > 0 ||
                          ((incident as any).preventiveActions?.length ?? 0) > 0;
                        const isClosed = !!(incident as any).closureDate;

                        return (
                          <tr key={incident._id}>
                            <td>{incident.type}</td>
                            <td>{formatDate(incident.date)}</td>
                            <td>
                              <span className={`badge ${severityBadge(incident.severity)}`}>
                                {incident.severity}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${isClosed ? 'badge--success' : 'badge--warning'}`}>
                                {isClosed ? 'Cerrado' : 'Abierto'}
                              </span>
                            </td>
                            <td>{(incident as any).responsible || '—'}</td>
                            <td>{hasActions ? '✅' : '❌'}</td>
                            <td>
                              {((incident as any).correctiveActions?.length ?? 0) + ((incident as any).preventiveActions?.length ?? 0)}
                            </td>
                            <td>{formatDate((incident as any).closureDate)}</td>
                            <td>
                              <div className="actions">
                                <Button type="button" variant="secondary" onClick={() => setSelectedIncident(incident)}>Ver</Button>
                                <Button type="button" variant="secondary" onClick={() => handleEdit(incident)}>Editar</Button>
                                {role === 'owner' && (
                                  <Button type="button" variant="danger" onClick={() => handleDelete(incident._id)}>Eliminar</Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!incidents.length ? (
                        <tr><td colSpan={9}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay casos registrados.</p></td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdvancedSection>
            </>
          )}

          {/* ===================== TAB: DASHBOARD ===================== */}
          {activeTab === 'dashboard' && (
            <AdvancedSection title="Dashboard de intervención" description="Métricas agregadas del estándar 3.3.3" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Tasa de intervención</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.interventionRate >= 70 ? '#10b981' : '#f59e0b' }}>
                    {metrics.interventionRate}%
                  </p>
                  <p className="muted">{metrics.casesWithIntervention} de {metrics.total} casos con intervención</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Tasa de cierre</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.closureRate >= 70 ? '#10b981' : '#f59e0b' }}>
                    {metrics.closureRate}%
                  </p>
                  <p className="muted">{metrics.casesWithClosure} de {metrics.total} casos cerrados</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Acciones abiertas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.openActions > 0 ? '#f59e0b' : '#10b981' }}>
                    {metrics.openActions}
                  </p>
                  <p className="muted">{metrics.completedActions} completadas · {metrics.overdueActions} vencidas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Acciones vencidas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.overdueActions > 0 ? '#ef4444' : '#10b981' }}>
                    {metrics.overdueActions}
                  </p>
                  <p className="muted">Requieren atención inmediata</p>
                </div>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: INTELLIGENCE ===================== */}
          {activeTab === 'intelligence' && (
            <AdvancedSection title="Intelligence — 3.3.3" description="Análisis inteligente de intervención y seguimiento de casos" accent="info">
              {intelligenceLoading && <p className="muted">Cargando análisis...</p>}
              {intelligenceError && <p className="muted">{intelligenceError}</p>}

              {!intelligenceLoading && !intelligence && !intelligenceError && (
                <p className="muted">No hay datos de análisis disponibles.</p>
              )}

              {intelligence && (
                <>
                  {/* Compliance */}
                  <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                    <h4 className="card-title">Nivel de cumplimiento</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                      <span className={`badge ${intelligence.compliancePercentage >= 90 ? 'badge--success' : intelligence.compliancePercentage >= 50 ? 'badge--warning' : 'badge--danger'}`}>
                        {intelligence.complianceStatus}
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{intelligence.compliancePercentage}%</span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                    <h4 className="card-title">Resumen</h4>
                    <p>{intelligence.analysis.summary}</p>
                  </div>

                  {/* Key Issues */}
                  {intelligence.analysis.keyIssues.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">Problemas clave</h4>
                      {intelligence.analysis.keyIssues.map((issue, i) => (
                        <div key={i} style={{ padding: '0.5rem 0', borderBottom: i < intelligence.analysis.keyIssues.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`badge ${issue.priority === 'HIGH' ? 'badge--danger' : issue.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {issue.priority}
                            </span>
                            <strong>{issue.title}</strong>
                          </div>
                          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>{issue.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Wins */}
                  {intelligence.analysis.quickWins.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">⚡ Quick Wins</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {intelligence.analysis.quickWins.map((win, i) => <li key={i}>{win}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Next Steps */}
                  {intelligence.analysis.nextSteps.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">📌 Próximos pasos</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {intelligence.analysis.nextSteps.map((step, i) => <li key={i}>{step}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="card" style={{ padding: '1rem' }}>
                    <h4 className="card-title">Métricas</h4>
                    <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                      {Object.entries(intelligence.metrics).map(([key, value]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                          <span style={{ color: '#64748b' }}>{key}</span>
                          <strong>{String(value)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* Detail Modal */}
      {selectedIncident && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedIncident(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Detalle del caso</h3>
            <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div><strong>Tipo:</strong> {selectedIncident.type}</div>
              <div><strong>Fecha:</strong> {formatDate(selectedIncident.date)}</div>
              <div><strong>Severidad:</strong> {selectedIncident.severity}</div>
              <div><strong>Estado:</strong> {(selectedIncident as any).closureDate ? 'Cerrado' : 'Abierto'}</div>
              <div><strong>Responsable:</strong> {(selectedIncident as any).responsible || '—'}</div>
              <div><strong>Fecha investigación:</strong> {formatDate((selectedIncident as any).investigationDate)}</div>
              <div><strong>Fecha cierre:</strong> {formatDate((selectedIncident as any).closureDate)}</div>
            </div>

            {((selectedIncident as any).correctiveActions?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Acciones correctivas:</strong>
                <table className="table" style={{ marginTop: '0.5rem' }}>
                  <thead><tr><th>Acción</th><th>Responsable</th><th>Estado</th><th>Fecha límite</th></tr></thead>
                  <tbody>
                    {(selectedIncident as any).correctiveActions.map((a: any, i: number) => (
                      <tr key={i}>
                        <td>{a.action}</td>
                        <td>{a.responsible}</td>
                        <td><span className={`badge ${statusBadgeClass(a.status)}`}>{statusLabel(a.status)}</span></td>
                        <td>{formatDate(a.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {((selectedIncident as any).preventiveActions?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Acciones preventivas:</strong>
                <table className="table" style={{ marginTop: '0.5rem' }}>
                  <thead><tr><th>Acción</th><th>Responsable</th><th>Estado</th><th>Fecha límite</th></tr></thead>
                  <tbody>
                    {(selectedIncident as any).preventiveActions.map((a: any, i: number) => (
                      <tr key={i}>
                        <td>{a.action}</td>
                        <td>{a.responsible}</td>
                        <td><span className={`badge ${statusBadgeClass(a.status)}`}>{statusLabel(a.status)}</span></td>
                        <td>{formatDate(a.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {((selectedIncident as any).evidence?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Evidencias:</strong>
                <ul>{(selectedIncident as any).evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setSelectedIncident(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </AdvancedPageLayout>
  );
}
