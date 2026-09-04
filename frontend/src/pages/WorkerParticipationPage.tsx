import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  WorkerParticipationModel,
  CreateWorkerParticipationPayload,
  UpdateWorkerParticipationPayload,
  createWorkerParticipation,
  deleteWorkerParticipation,
  fetchWorkerParticipations,
  updateWorkerParticipation,
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
 * FASE 11 — BLOQUE 5
 * Página de gestión avanzada del estándar 4.1.2
 * "Participación de trabajadores en la identificación de peligros,
 *  evaluación y valoración de riesgos, y toma de decisiones sobre
 *  medidas de prevención y establecimiento de controles"
 */

interface WorkerParticipationPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'participaciones', label: 'Participaciones', icon: '📋' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  HAZARD_IDENTIFICATION: 'Identificación de peligros',
  RISK_ASSESSMENT: 'Evaluación de riesgos',
  RISK_VALUATION: 'Valoración de riesgos',
  CONTROL_DECISION: 'Decisión sobre controles',
  CONTROL_ESTABLISHMENT: 'Establecimiento de controles',
  OTHER: 'Otra actividad',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--muted',
};

const ESSENTIAL_CATEGORIES = [
  'HAZARD_IDENTIFICATION',
  'RISK_ASSESSMENT',
  'RISK_VALUATION',
  'CONTROL_DECISION',
  'CONTROL_ESTABLISHMENT',
];

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

export function WorkerParticipationPage({ token, role }: WorkerParticipationPageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [participations, setParticipations] = useState<WorkerParticipationModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('participaciones');
  const [selectedParticipation, setSelectedParticipation] = useState<WorkerParticipationModel | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<StandardAnalysisResponse | null>(null);
  const [intelligenceError, setIntelligenceError] = useState('');

  // Form state
  const [form, setForm] = useState({
    activityType: 'HAZARD_IDENTIFICATION',
    participationDate: '',
    participants: [] as string[],
    description: '',
    observations: '',
    riskId: '',
    process: '',
    area: '',
    activity: '',
    status: 'DRAFT',
  });

  // ── Data loading ──
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWorkerParticipations(token);
      setParticipations(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar las participaciones.');
    } finally {
      setLoading(false);
    }
  };

  const loadIntelligence = async () => {
    setIntelligenceLoading(true);
    setIntelligenceError('');
    try {
      const data = await fetchStandardAnalysis(token, '4.1.2');
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
    const total = participations.length;
    const completed = participations.filter((p) => p.status === 'COMPLETED').length;
    const draft = participations.filter((p) => p.status === 'DRAFT').length;
    const cancelled = participations.filter((p) => p.status === 'CANCELLED').length;
    const withParticipants = participations.filter((p) => p.status === 'COMPLETED' && p.participants.length > 0).length;
    const withRisk = participations.filter((p) => p.riskId).length;

    // Coverage of essential categories from COMPLETED activities
    const coveredTypes = new Set<string>();
    for (const p of participations) {
      if (p.status === 'COMPLETED') {
        coveredTypes.add(p.activityType);
      }
    }
    const coveredEssential = ESSENTIAL_CATEGORIES.filter((c) => coveredTypes.has(c)).length;

    return {
      total,
      completed,
      draft,
      cancelled,
      withParticipants,
      withRisk,
      coveredEssential,
    };
  }, [participations]);

  // ── CRUD handlers ──
  const resetForm = () => {
    setForm({
      activityType: 'HAZARD_IDENTIFICATION',
      participationDate: '',
      participants: [],
      description: '',
      observations: '',
      riskId: '',
      process: '',
      area: '',
      activity: '',
      status: 'DRAFT',
    });
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload: CreateWorkerParticipationPayload = {
        activityType: form.activityType,
        participationDate: form.participationDate,
        description: form.description,
        observations: form.observations || undefined,
        riskId: form.riskId || undefined,
        process: form.process || undefined,
        area: form.area || undefined,
        activity: form.activity || undefined,
        status: form.status,
      };

      if (editingId) {
        await updateWorkerParticipation(token, editingId, payload as UpdateWorkerParticipationPayload);
      } else {
        await createWorkerParticipation(token, payload);
      }

      resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar la participación.');
      setLoading(false);
    }
  };

  const handleEdit = (participation: WorkerParticipationModel) => {
    setEditingId(participation._id);
    setForm({
      activityType: participation.activityType,
      participationDate: participation.participationDate?.slice(0, 10) ?? '',
      participants: participation.participants ?? [],
      description: participation.description,
      observations: participation.observations ?? '',
      riskId: participation.riskId ?? '',
      process: participation.process ?? '',
      area: participation.area ?? '',
      activity: participation.activity ?? '',
      status: participation.status,
    });
    setActiveTab('participaciones');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar registro?\n\nEsta acción eliminará el registro de participación.')) return;
    setLoading(true);
    setError('');
    try {
      await deleteWorkerParticipation(token, id);
      if (editingId === id) resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar la participación.');
      setLoading(false);
    }
  };

  // ── Header actions ──
  const headerActions: HeaderAction[] = [
    { label: '← Volver al PHVA', onClick: () => navigate('/documents/do'), variant: 'secondary' },
    { label: loading ? 'Cargando...' : '🔄 Recargar', onClick: () => void loadData(), variant: 'secondary', disabled: loading },
  ];

  // ── NO_DATA state ──
  if (!loading && participations.length === 0) {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/do"
          backLabel="← Volver al PHVA"
          moduleCode="SST-WP-412"
          moduleTitle="Participación de trabajadores"
          description="Evidencia de participación activa en la gestión de peligros y riesgos — Estándar 4.1.2"
          statusBadge={<span className="badge badge--info">📋 4.1.2</span>}
          actions={headerActions}
        />
        <AdvancedSection title="Estado vacío" description="No hay registros de participación" accent="info">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1rem' }}>
              No hay registros de participación de trabajadores.
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Registra la primera actividad de participación de trabajadores conforme al estándar 4.1.2.
            </p>
            <Button onClick={() => setActiveTab('participaciones')}>
              + Nueva participación
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
        moduleCode="SST-WP-412"
        moduleTitle="Participación de trabajadores"
        description="Evidencia de participación activa en la gestión de peligros y riesgos — Estándar 4.1.2"
        statusBadge={<span className="badge badge--info">📋 4.1.2</span>}
        actions={headerActions}
      />

      {/* KPIs */}
      <AdvancedKpiGrid
        items={[
          { label: 'Total registros', value: metrics.total, variant: 'info' },
          { label: 'Completados', value: metrics.completed, variant: metrics.completed > 0 ? 'success' : 'warning' },
          { label: 'Borradores', value: metrics.draft, variant: 'info' },
          { label: 'Cancelados', value: metrics.cancelled, variant: 'muted' },
          { label: 'Con participantes', value: metrics.withParticipants, variant: metrics.withParticipants > 0 ? 'success' : 'warning' },
          { label: 'Con riesgo', value: metrics.withRisk, variant: 'info' },
        ]}
        columns={3}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: PARTICIPACIONES ===================== */}
          {activeTab === 'participaciones' && (
            <>
              {/* Form */}
              <AdvancedSection
                title={editingId ? 'Editar participación' : 'Nueva participación'}
                description="Complete los campos para registrar una actividad de participación de trabajadores"
                accent="info"
              >
                <form onSubmit={handleSubmit} className="form-grid">
                  <div className="grid grid-2">
                    <label className="field"><span className="label">Tipo de actividad *</span>
                      <Select value={form.activityType} onChange={(event) => setForm((prev) => ({ ...prev, activityType: event.target.value }))} required>
                        {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="field"><span className="label">Fecha de participación *</span>
                      <Input type="date" value={form.participationDate} onChange={(event) => setForm((prev) => ({ ...prev, participationDate: event.target.value }))} required />
                    </label>
                    <label className="field"><span className="label">Estado *</span>
                      <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required>
                        <option value="DRAFT">Borrador</option>
                        <option value="COMPLETED">Completada</option>
                        <option value="CANCELLED">Cancelada</option>
                      </Select>
                    </label>
                    <label className="field"><span className="label">Riesgo asociado</span>
                      <Input value={form.riskId} onChange={(event) => setForm((prev) => ({ ...prev, riskId: event.target.value }))} placeholder="ID del riesgo (opcional)" />
                    </label>
                    <label className="field"><span className="label">Proceso</span>
                      <Input value={form.process} onChange={(event) => setForm((prev) => ({ ...prev, process: event.target.value }))} placeholder="Proceso/área" />
                    </label>
                    <label className="field"><span className="label">Área</span>
                      <Input value={form.area} onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))} placeholder="Área específica" />
                    </label>
                    <label className="field"><span className="label">Actividad</span>
                      <Input value={form.activity} onChange={(event) => setForm((prev) => ({ ...prev, activity: event.target.value }))} placeholder="Actividad específica" />
                    </label>
                  </div>
                  <label className="field"><span className="label">Descripción *</span>
                    <textarea className="input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required rows={3} placeholder="Describa la actividad de participación" />
                  </label>
                  <label className="field"><span className="label">Observaciones</span>
                    <textarea className="input" value={form.observations} onChange={(event) => setForm((prev) => ({ ...prev, observations: event.target.value }))} rows={2} placeholder="Observaciones adicionales (opcional)" />
                  </label>

                  <div className="actions">
                    <Button type="submit" disabled={loading}>
                      {editingId ? 'Guardar cambios' : 'Nueva participación'}
                    </Button>
                    {editingId ? (
                      <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button>
                    ) : null}
                  </div>
                </form>
              </AdvancedSection>

              {/* Cobertura de categorías */}
              <AdvancedSection
                title="Cobertura de categorías esenciales"
                description={`${metrics.coveredEssential}/5 categorías con evidencia en actividades completadas`}
                accent="info"
              >
                <div className="grid grid-3" style={{ gap: '0.5rem' }}>
                  {ESSENTIAL_CATEGORIES.map((cat) => {
                    const covered = participations.some(
                      (p) => p.status === 'COMPLETED' && p.activityType === cat,
                    );
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '6px', background: covered ? '#f0fdf4' : '#fef2f2' }}>
                        <span>{covered ? '✅' : '⚠️'}</span>
                        <span style={{ fontSize: '0.875rem' }}>{ACTIVITY_TYPE_LABELS[cat] ?? cat}</span>
                      </div>
                    );
                  })}
                </div>
              </AdvancedSection>

              {/* Listado */}
              <AdvancedSection
                title="Registros de participación"
                description={`Total: ${participations.length} registro(s)`}
                accent="default"
              >
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Proceso / Área</th>
                        <th>Actividad</th>
                        <th>Participantes</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participations.map((p) => (
                        <tr key={p._id}>
                          <td>{formatDate(p.participationDate)}</td>
                          <td>{ACTIVITY_TYPE_LABELS[p.activityType] ?? p.activityType}</td>
                          <td>{p.process || p.area || '—'}</td>
                          <td>{p.activity || '—'}</td>
                          <td>
                            {p.participants.length > 0
                              ? `${p.participants.length} participante(s)`
                              : '—'}
                          </td>
                          <td>
                            <span className={`badge ${STATUS_CLASSES[p.status] ?? 'badge--info'}`}>
                              {STATUS_LABELS[p.status] ?? p.status}
                            </span>
                          </td>
                          <td>
                            <div className="actions">
                              <Button type="button" variant="secondary" onClick={() => setSelectedParticipation(p)}>Ver</Button>
                              <Button type="button" variant="secondary" onClick={() => handleEdit(p)}>Editar</Button>
                              {(role === 'owner' || role === 'admin') && (
                                <Button type="button" variant="danger" onClick={() => handleDelete(p._id)}>Eliminar</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!participations.length ? (
                        <tr><td colSpan={7}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay registros de participación.</p></td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdvancedSection>
            </>
          )}

          {/* ===================== TAB: DASHBOARD ===================== */}
          {activeTab === 'dashboard' && (
            <AdvancedSection title="Dashboard de participación" description="Métricas agregadas del estándar 4.1.2" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Actividades completadas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.completed > 0 ? '#10b981' : '#f59e0b' }}>
                    {metrics.completed}
                  </p>
                  <p className="muted">de {metrics.total} registros totales</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Categorías cubiertas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.coveredEssential >= 5 ? '#10b981' : '#f59e0b' }}>
                    {metrics.coveredEssential}/5
                  </p>
                  <p className="muted">categorías esenciales con evidencia</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Con participantes</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.withParticipants > 0 ? '#10b981' : '#f59e0b' }}>
                    {metrics.withParticipants}
                  </p>
                  <p className="muted">actividades con trabajadores identificados</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Con riesgo asociado</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#6366f1' }}>
                    {metrics.withRisk}
                  </p>
                  <p className="muted">actividades vinculadas a riesgos</p>
                </div>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: INTELLIGENCE ===================== */}
          {activeTab === 'intelligence' && (
            <AdvancedSection title="Intelligence — 4.1.2" description="Análisis inteligente de participación de trabajadores" accent="info">
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
      {selectedParticipation && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedParticipation(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Detalle de participación</h3>

            <AdvancedSection title="Información general" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div><strong>Tipo:</strong> {ACTIVITY_TYPE_LABELS[selectedParticipation.activityType] ?? selectedParticipation.activityType}</div>
                <div><strong>Fecha:</strong> {formatDate(selectedParticipation.participationDate)}</div>
                <div><strong>Estado:</strong> <span className={`badge ${STATUS_CLASSES[selectedParticipation.status] ?? 'badge--info'}`}>{STATUS_LABELS[selectedParticipation.status] ?? selectedParticipation.status}</span></div>
              </div>
            </AdvancedSection>

            <AdvancedSection title="Contexto" accent="default">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div><strong>Proceso:</strong> {selectedParticipation.process || '—'}</div>
                <div><strong>Área:</strong> {selectedParticipation.area || '—'}</div>
                <div><strong>Actividad:</strong> {selectedParticipation.activity || '—'}</div>
                <div><strong>Riesgo:</strong> {selectedParticipation.riskId || '—'}</div>
              </div>
            </AdvancedSection>

            <AdvancedSection title="Participación" accent="default">
              <div style={{ marginBottom: '1rem' }}>
                <strong>Participantes:</strong>
                {selectedParticipation.participants.length > 0 ? (
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                    {selectedParticipation.participants.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                ) : (
                  <p className="muted">Sin participantes registrados</p>
                )}
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <strong>Descripción:</strong>
                <p style={{ margin: '0.25rem 0' }}>{selectedParticipation.description}</p>
              </div>
              {selectedParticipation.observations && (
                <div>
                  <strong>Observaciones:</strong>
                  <p style={{ margin: '0.25rem 0' }}>{selectedParticipation.observations}</p>
                </div>
              )}
            </AdvancedSection>

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setSelectedParticipation(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </AdvancedPageLayout>
  );
}
