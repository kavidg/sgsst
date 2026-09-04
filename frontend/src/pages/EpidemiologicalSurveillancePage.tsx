import { FormEvent, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type EpidemiologicalSurveillanceProgram,
  type SurveillanceActivity,
  type SurveillanceActivityStatus,
  type SurveillanceProgramStatus,
  type SurveillanceType,
  type CreateEpidemiologicalSurveillancePayload,
  fetchEpidemiologicalSurveillancePrograms,
  createEpidemiologicalSurveillanceProgram,
  updateEpidemiologicalSurveillanceProgram,
  deleteEpidemiologicalSurveillanceProgram,
  fetchStandardAnalysis,
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

interface EpidemiologicalSurveillancePageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'listado', label: 'Listado', icon: '📋' },
  { id: 'crear', label: 'Crear programa', icon: '➕' },
  { id: 'indicadores', label: 'Indicadores', icon: '📊' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

const SURVEILLANCE_TYPE_LABELS: Record<SurveillanceType, string> = {
  BIOMECHANICAL: 'Biomecánico',
  PSYCHOSOCIAL: 'Psicosocial',
  CHEMICAL: 'Químico',
  BIOLOGICAL: 'Biológico',
  PHYSICAL: 'Físico',
  OTHER: 'Otro',
};

const STATUS_LABELS: Record<SurveillanceProgramStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  COMPLETED: 'Completado',
  ARCHIVED: 'Archivado',
};

const ACTIVITY_STATUS_LABELS: Record<SurveillanceActivityStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

function calculateProgramProgress(activities: SurveillanceActivity[] | undefined): number {
  if (!activities || activities.length === 0) return 0;
  const completed = activities.filter((a) => a.status === 'COMPLETED').length;
  return Math.round((completed / activities.length) * 100);
}

interface FormData {
  name: string;
  description: string;
  surveillanceType: SurveillanceType;
  relatedHazards: string[];
  targetAreas: string[];
  targetPositions: string[];
  startDate: string;
  endDate: string;
  status: SurveillanceProgramStatus;
  periodicityMonths: number | undefined;
  responsible: string;
  activities: SurveillanceActivity[];
}

function createEmptyForm(): FormData {
  return {
    name: '',
    description: '',
    surveillanceType: 'CHEMICAL',
    relatedHazards: [],
    targetAreas: [],
    targetPositions: [],
    startDate: '',
    endDate: '',
    status: 'DRAFT',
    periodicityMonths: 6,
    responsible: '',
    activities: [],
  };
}

export function EpidemiologicalSurveillancePage({ token, role }: EpidemiologicalSurveillancePageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [programs, setPrograms] = useState<EpidemiologicalSurveillanceProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('listado');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<EpidemiologicalSurveillanceProgram | null>(null);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState('');
  const [form, setForm] = useState<FormData>(createEmptyForm());

  // ── Data loading ──
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEpidemiologicalSurveillancePrograms(token);
      setPrograms(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar los programas.');
    } finally {
      setLoading(false);
    }
  };

  const loadIntelligence = async () => {
    setIntelligenceLoading(true);
    setIntelligenceError('');
    try {
      const data = await fetchStandardAnalysis(token, '3.3.1');
      setIntelligence(data);
    } catch {
      setIntelligenceError('Análisis inteligente no disponible para 3.3.1.');
    } finally {
      setIntelligenceLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    void loadIntelligence();
  }, [companyId, token]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const active = programs.filter((p) => p.status === 'ACTIVE').length;
    let totalActivities = 0;
    let completedActivities = 0;
    let hazardsCount = 0;
    for (const p of programs) {
      totalActivities += (p.activities?.length ?? 0);
      completedActivities += (p.activities?.filter((a) => a.status === 'COMPLETED').length ?? 0);
      hazardsCount += (p.relatedHazards?.length ?? 0);
    }
    const activityCompliance = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;
    return { active, total: programs.length, totalActivities, completedActivities, activityCompliance, hazardsCount };
  }, [programs]);

  // ── Form handlers ──
  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Validations
    if (!form.name.trim()) { setError('El nombre es requerido.'); return; }
    if (form.name.length > 200) { setError('El nombre no debe exceder 200 caracteres.'); return; }
    if (!form.startDate) { setError('La fecha de inicio es requerida.'); return; }
    if (!form.endDate) { setError('La fecha de fin es requerida.'); return; }
    if (new Date(form.endDate) < new Date(form.startDate)) { setError('La fecha de fin debe ser igual o posterior a la fecha de inicio.'); return; }
    if (form.periodicityMonths !== undefined && form.periodicityMonths !== null) {
      if (form.periodicityMonths < 1 || form.periodicityMonths > 60) { setError('La periodicidad debe estar entre 1 y 60 meses.'); return; }
    }

    // Validate activities
    for (const activity of form.activities) {
      if (!activity.title.trim()) { setError('Todas las actividades deben tener título.'); return; }
      if (!activity.startDate) { setError('Todas las actividades deben tener fecha de inicio.'); return; }
      if (!activity.endDate) { setError('Todas las actividades deben tener fecha de fin.'); return; }
      if (new Date(activity.endDate) < new Date(activity.startDate)) { setError('La fecha de fin de actividad debe ser igual o posterior a la fecha de inicio.'); return; }
      if (activity.progress !== undefined && (activity.progress < 0 || activity.progress > 100)) { setError('El progreso de actividad debe estar entre 0 y 100.'); return; }
    }

    setLoading(true);
    setError('');

    const payload: CreateEpidemiologicalSurveillancePayload = {
      name: form.name.trim(),
      description: form.description,
      surveillanceType: form.surveillanceType,
      relatedHazards: form.relatedHazards.filter((h) => h.trim()),
      targetAreas: form.targetAreas.filter((a) => a.trim()),
      targetPositions: form.targetPositions.filter((p) => p.trim()),
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      periodicityMonths: form.periodicityMonths,
      responsible: form.responsible,
      standardNumber: '3.3.1',
      activities: form.activities,
    };

    try {
      if (editingId) {
        await updateEpidemiologicalSurveillanceProgram(token, editingId, payload);
      } else {
        await createEpidemiologicalSurveillanceProgram(token, payload);
      }
      resetForm();
      setActiveTab('listado');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar el programa.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (program: EpidemiologicalSurveillanceProgram) => {
    setEditingId(program._id);
    setForm({
      ...createEmptyForm(),
      name: program.name,
      description: program.description ?? '',
      surveillanceType: program.surveillanceType,
      relatedHazards: program.relatedHazards ?? [],
      targetAreas: program.targetAreas ?? [],
      targetPositions: program.targetPositions ?? [],
      startDate: program.startDate?.slice(0, 10) ?? '',
      endDate: program.endDate?.slice(0, 10) ?? '',
      status: program.status,
      periodicityMonths: program.periodicityMonths,
      responsible: program.responsible ?? '',
      activities: (program.activities ?? []).map((a) => ({
        ...a,
        startDate: a.startDate?.slice(0, 10) ?? '',
        endDate: a.endDate?.slice(0, 10) ?? '',
      })),
    });
    setActiveTab('crear');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este programa?')) return;
    setLoading(true);
    setError('');
    try {
      await deleteEpidemiologicalSurveillanceProgram(token, id);
      if (editingId === id) resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el programa.');
    } finally {
      setLoading(false);
    }
  };

  // ── Chip/tag helpers for arrays ──
  const addChip = (field: 'relatedHazards' | 'targetAreas' | 'targetPositions', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setForm((prev) => {
      const arr = prev[field];
      if (arr.includes(trimmed)) return prev;
      return { ...prev, [field]: [...arr, trimmed] };
    });
  };

  const removeChip = (field: 'relatedHazards' | 'targetAreas' | 'targetPositions', index: number) => {
    setForm((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  };

  const ChipInput = ({ field, label, placeholder }: { field: 'relatedHazards' | 'targetAreas' | 'targetPositions'; label: string; placeholder: string }) => {
    const [input, setInput] = useState('');
    return (
      <label className="field">
        <span className="label">{label}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {form[field].map((chip, index) => (
            <span key={index} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#e0e7ff', color: '#3730a3', padding: '0.25rem 0.5rem', borderRadius: '9999px', fontSize: '0.85rem' }}>
              {chip}
              <button type="button" onClick={() => removeChip(field, index)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 700 }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChip(field, input); setInput(''); } }} />
          <Button type="button" variant="secondary" onClick={() => { addChip(field, input); setInput(''); }}>+</Button>
        </div>
      </label>
    );
  };

  // ── Activity helpers ──
  const addActivity = () => {
    setForm((prev) => ({
      ...prev,
      activities: [...prev.activities, { title: '', description: '', responsible: '', startDate: '', endDate: '', status: 'PENDING' as SurveillanceActivityStatus, progress: 0, evidence: [] }],
    }));
  };

  const removeActivity = (index: number) => {
    setForm((prev) => ({ ...prev, activities: prev.activities.filter((_, i) => i !== index) }));
  };

  const updateActivity = (index: number, field: string, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      activities: prev.activities.map((a, i) => i === index ? { ...a, [field]: value } : a),
    }));
  };

  // ── Header actions ──
  const headerActions: HeaderAction[] = [
    { label: '← Volver al PHVA', onClick: () => navigate('/documents/do'), variant: 'secondary' },
    { label: 'Ver análisis', onClick: () => navigate('/intelligence-compliance'), variant: 'secondary' },
    { label: loading ? 'Cargando...' : '🔄 Recargar', onClick: () => { void loadData(); void loadIntelligence(); }, variant: 'secondary', disabled: loading },
  ];

  // ── NO_DATA / EMPTY state ──
  if (!loading && programs.length === 0 && activeTab === 'listado') {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/do"
          backLabel="← Volver al PHVA"
          moduleCode="SST-ES-001"
          moduleTitle="Programas de vigilancia epidemiológica"
          description="Gestión y seguimiento de los programas de vigilancia epidemiológica de la organización."
          statusBadge={<span className="badge badge--info">📋 3.3.1</span>}
          actions={headerActions}
        />
        <AdvancedSection title="Estado vacío" description="No hay programas registrados" accent="info">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1rem' }}>
              Sin programas de vigilancia epidemiológica
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Aún no se han registrado programas de vigilancia epidemiológica para esta organización.
            </p>
            <Button onClick={() => setActiveTab('crear')}>
              + Crear primer programa
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
        moduleCode="SST-ES-001"
        moduleTitle="Programas de vigilancia epidemiológica"
        description="Gestión y seguimiento de los programas de vigilancia epidemiológica de la organización."
        statusBadge={<span className="badge badge--info">📋 3.3.1</span>}
        actions={headerActions}
      />

      {/* KPIs */}
      <AdvancedKpiGrid
        items={[
          { label: 'Programas activos', value: kpis.active, variant: kpis.active > 0 ? 'success' : 'warning' },
          { label: 'Total programas', value: kpis.total, variant: 'info' },
          { label: 'Actividades pendientes', value: kpis.totalActivities - kpis.completedActivities, variant: (kpis.totalActivities - kpis.completedActivities) > 0 ? 'warning' : 'success' },
          { label: 'Actividades completadas', value: kpis.completedActivities, variant: 'success' },
          { label: 'Cumplimiento actividades %', value: `${kpis.activityCompliance}%`, variant: kpis.activityCompliance >= 70 ? 'success' : 'warning' },
          { label: 'Peligros priorizados', value: kpis.hazardsCount, variant: 'info' },
        ]}
        columns={4}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: LISTADO ===================== */}
          {activeTab === 'listado' && (
            <AdvancedSection
              title="Programas de vigilancia epidemiológica"
              description={`Total: ${programs.length} programa(s)`}
              accent="default"
            >
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Peligros</th>
                      <th>Áreas</th>
                      <th>Actividades</th>
                      <th>Progreso</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Responsable</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programs.map((program) => {
                      const progress = calculateProgramProgress(program.activities);
                      return (
                        <tr key={program._id}>
                          <td style={{ fontWeight: 600 }}>{program.name}</td>
                          <td>{SURVEILLANCE_TYPE_LABELS[program.surveillanceType] ?? program.surveillanceType}</td>
                          <td>
                            <span className={`badge ${program.status === 'ACTIVE' ? 'badge--success' : program.status === 'COMPLETED' ? 'badge--info' : 'badge--warning'}`}>
                              {STATUS_LABELS[program.status] ?? program.status}
                            </span>
                          </td>
                          <td>{(program.relatedHazards ?? []).length}</td>
                          <td>{(program.targetAreas ?? []).join(', ') || '—'}</td>
                          <td>{(program.activities ?? []).length}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ flex: 1, background: '#e2e8f0', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, background: progress >= 70 ? '#10b981' : '#f59e0b', height: '100%', borderRadius: '4px' }} />
                              </div>
                              <span style={{ fontSize: '0.85rem', minWidth: '35px' }}>{progress}%</span>
                            </div>
                          </td>
                          <td>{formatDate(program.startDate)}</td>
                          <td>{formatDate(program.endDate)}</td>
                          <td>{program.responsible || '—'}</td>
                          <td>
                            <div className="actions">
                              <Button type="button" variant="secondary" onClick={() => setSelectedProgram(program)}>Ver</Button>
                              <Button type="button" variant="secondary" onClick={() => handleEdit(program)}>Editar</Button>
                              {role === 'owner' && (
                                <Button type="button" variant="danger" onClick={() => handleDelete(program._id)}>Eliminar</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!programs.length ? (
                      <tr><td colSpan={11}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay programas de vigilancia epidemiológica registrados.</p></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: CREAR / EDITAR ===================== */}
          {activeTab === 'crear' && (
            <AdvancedSection
              title={editingId ? 'Editar programa' : 'Crear programa'}
              description="Complete los campos para registrar un programa de vigilancia epidemiológica"
              accent="info"
            >
              <form onSubmit={handleSubmit} className="form-grid">
                <div className="grid grid-2">
                  <label className="field"><span className="label">Nombre del programa *</span>
                    <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre del programa" required maxLength={200} />
                  </label>
                  <label className="field"><span className="label">Tipo de vigilancia *</span>
                    <Select value={form.surveillanceType} onChange={(e) => setForm((prev) => ({ ...prev, surveillanceType: e.target.value as SurveillanceType }))} required>
                      {(Object.entries(SURVEILLANCE_TYPE_LABELS) as [SurveillanceType, string][]).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="field"><span className="label">Fecha de inicio *</span>
                    <Input type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} required />
                  </label>
                  <label className="field"><span className="label">Fecha de fin *</span>
                    <Input type="date" value={form.endDate} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))} required />
                  </label>
                  <label className="field"><span className="label">Estado</span>
                    <Select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as SurveillanceProgramStatus }))}>
                      {(Object.entries(STATUS_LABELS) as [SurveillanceProgramStatus, string][]).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="field"><span className="label">Periodicidad (meses)</span>
                    <Input type="number" value={form.periodicityMonths ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, periodicityMonths: e.target.value ? Number(e.target.value) : undefined }))} min={1} max={60} placeholder="6" />
                  </label>
                  <label className="field"><span className="label">Responsable</span>
                    <Input value={form.responsible} onChange={(e) => setForm((prev) => ({ ...prev, responsible: e.target.value }))} placeholder="Nombre del responsable" />
                  </label>
                </div>

                <label className="field"><span className="label">Descripción</span>
                  <textarea className="input" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Descripción del programa de vigilancia epidemiológica" />
                </label>

                <ChipInput field="relatedHazards" label="Peligros asociados" placeholder="Escriba y presione Enter para agregar" />
                <ChipInput field="targetAreas" label="Áreas objetivo" placeholder="Escriba y presione Enter para agregar" />
                <ChipInput field="targetPositions" label="Cargos objetivo" placeholder="Escriba y presione Enter para agregar" />

                {/* Actividades */}
                <AdvancedSection title="Actividades del programa" description="Defina las actividades de vigilancia epidemiológica" accent="info">
                  {form.activities.map((activity, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'end' }}>
                      <label className="field"><span className="label">Título *</span>
                        <Input value={activity.title} onChange={(e) => updateActivity(index, 'title', e.target.value)} placeholder="Título" />
                      </label>
                      <label className="field"><span className="label">Responsable</span>
                        <Input value={activity.responsible ?? ''} onChange={(e) => updateActivity(index, 'responsible', e.target.value)} placeholder="Responsable" />
                      </label>
                      <label className="field"><span className="label">Inicio *</span>
                        <Input type="date" value={activity.startDate} onChange={(e) => updateActivity(index, 'startDate', e.target.value)} />
                      </label>
                      <label className="field"><span className="label">Fin *</span>
                        <Input type="date" value={activity.endDate} onChange={(e) => updateActivity(index, 'endDate', e.target.value)} />
                      </label>
                      <label className="field"><span className="label">Estado</span>
                        <Select value={activity.status} onChange={(e) => updateActivity(index, 'status', e.target.value)}>
                          {(Object.entries(ACTIVITY_STATUS_LABELS) as [SurveillanceActivityStatus, string][]).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </Select>
                      </label>
                      <label className="field"><span className="label">Progreso %</span>
                        <Input type="number" value={activity.progress ?? 0} onChange={(e) => updateActivity(index, 'progress', Math.min(100, Math.max(0, Number(e.target.value))))} min={0} max={100} />
                      </label>
                      <Button type="button" variant="danger" onClick={() => removeActivity(index)}>✕</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={addActivity}>+ Agregar actividad</Button>
                </AdvancedSection>

                <div className="actions">
                  <Button type="submit" disabled={loading}>
                    {editingId ? 'Guardar cambios' : 'Crear programa'}
                  </Button>
                  {editingId ? (
                    <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button>
                  ) : null}
                </div>
              </form>
            </AdvancedSection>
          )}

          {/* ===================== TAB: INDICADORES ===================== */}
          {activeTab === 'indicadores' && (
            <AdvancedSection title="Indicadores de vigilancia epidemiológica" description="Métricas calculadas con los datos registrados" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Programas activos</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: kpis.active > 0 ? '#10b981' : '#6b7280' }}>
                    {kpis.active}
                  </p>
                  <p className="muted">de {kpis.total} programas totales</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Cumplimiento de actividades</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: kpis.activityCompliance >= 70 ? '#10b981' : '#f59e0b' }}>
                    {kpis.activityCompliance}%
                  </p>
                  <p className="muted">{kpis.completedActivities} de {kpis.totalActivities} actividades completadas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Peligros priorizados</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#3b82f6' }}>
                    {kpis.hazardsCount}
                  </p>
                  <p className="muted">peligros asociados a programas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Programas por tipo</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {Object.entries(SURVEILLANCE_TYPE_LABELS).map(([type, label]) => {
                      const count = programs.filter((p) => p.surveillanceType === type).length;
                      if (count === 0) return null;
                      return <span key={type} style={{ background: '#e0e7ff', color: '#3730a3', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.85rem' }}>{label}: {count}</span>;
                    })}
                  </div>
                </div>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: INTELLIGENCE ===================== */}
          {activeTab === 'intelligence' && (
            <AdvancedSection title="Intelligence — 3.3.1" description="Análisis inteligente del estándar de vigilancia epidemiológica" accent="info">
              {intelligenceLoading && <p className="muted">Cargando análisis...</p>}
              {intelligenceError && <p className="muted">{intelligenceError}</p>}
              {intelligence && (
                <div>
                  <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                    <div className="card" style={{ padding: '1rem' }}>
                      <h4 className="card-title">Nivel de cumplimiento</h4>
                      <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>
                        {intelligence.compliancePercentage ?? 0}%
                      </p>
                      <p className="muted">Estado: {intelligence.complianceStatus ?? 'N/A'}</p>
                    </div>
                    <div className="card" style={{ padding: '1rem' }}>
                      <h4 className="card-title">Datos disponibles</h4>
                      <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: intelligence.dataAvailable ? '#10b981' : '#f59e0b' }}>
                        {intelligence.dataAvailable ? '✅ Sí' : '⚠️ Sin datos'}
                      </p>
                    </div>
                  </div>

                  {intelligence.analysis?.summary && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">Resumen</h4>
                      <p style={{ margin: 0 }}>{intelligence.analysis.summary}</p>
                    </div>
                  )}

                  {intelligence.analysis?.keyIssues?.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">Problemas clave</h4>
                      {intelligence.analysis.keyIssues.map((issue: any, i: number) => (
                        <div key={i} style={{ padding: '0.5rem 0', borderBottom: i < intelligence.analysis.keyIssues.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`badge ${issue.priority === 'HIGH' ? 'badge--danger' : issue.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {issue.priority}
                            </span>
                            <strong>{issue.title}</strong>
                          </div>
                          {issue.impact && <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>{issue.impact}</p>}
                          {issue.recommendation && <p style={{ margin: '0.25rem 0 0', color: '#059669', fontSize: '0.9rem' }}>💡 {issue.recommendation}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {intelligence.analysis?.quickWins?.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">⚡ Quick Wins</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        {intelligence.analysis.quickWins.map((win: string, i: number) => (
                          <li key={i} style={{ marginBottom: '0.5rem' }}>{win}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {intelligence.analysis?.nextSteps?.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">📋 Próximos pasos</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        {intelligence.analysis.nextSteps.map((step: string, i: number) => (
                          <li key={i} style={{ marginBottom: '0.5rem' }}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {intelligence.metrics && Object.keys(intelligence.metrics).length > 0 && (
                    <div className="card" style={{ padding: '1rem' }}>
                      <h4 className="card-title">Métricas</h4>
                      <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                        {Object.entries(intelligence.metrics).map(([key, value]) => (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{key}</span>
                            <strong>{String(value)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!intelligenceLoading && !intelligence && !intelligenceError && (
                <p className="muted">No hay datos de análisis disponibles.</p>
              )}
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* Detail Modal */}
      {selectedProgram && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedProgram(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Detalle del programa</h3>
            <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div><strong>Nombre:</strong> {selectedProgram.name}</div>
              <div><strong>Tipo:</strong> {SURVEILLANCE_TYPE_LABELS[selectedProgram.surveillanceType]}</div>
              <div><strong>Estado:</strong> {STATUS_LABELS[selectedProgram.status]}</div>
              <div><strong>Responsable:</strong> {selectedProgram.responsible || '—'}</div>
              <div><strong>Vigencia:</strong> {formatDate(selectedProgram.startDate)} — {formatDate(selectedProgram.endDate)}</div>
              <div><strong>Periodicidad:</strong> {selectedProgram.periodicityMonths ? `${selectedProgram.periodicityMonths} meses` : '—'}</div>
            </div>
            {(selectedProgram.relatedHazards ?? []).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Peligros asociados:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {selectedProgram.relatedHazards!.map((h, i) => (
                    <span key={i} style={{ background: '#fee2e2', color: '#991b1b', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.85rem' }}>{h}</span>
                  ))}
                </div>
              </div>
            )}
            {(selectedProgram.targetAreas ?? []).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Áreas objetivo:</strong> {selectedProgram.targetAreas!.join(', ')}
              </div>
            )}
            {(selectedProgram.targetPositions ?? []).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Cargos objetivo:</strong> {selectedProgram.targetPositions!.join(', ')}
              </div>
            )}
            {selectedProgram.description && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Descripción:</strong> {selectedProgram.description}
              </div>
            )}
            {(selectedProgram.activities ?? []).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Actividades ({selectedProgram.activities!.length}):</strong>
                <div style={{ marginTop: '0.5rem' }}>
                  {selectedProgram.activities!.map((act, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 600, minWidth: '150px' }}>{act.title}</span>
                      <span className={`badge ${act.status === 'COMPLETED' ? 'badge--success' : act.status === 'CANCELLED' ? 'badge--danger' : 'badge--warning'}`}>
                        {ACTIVITY_STATUS_LABELS[act.status]}
                      </span>
                      <span>{formatDate(act.startDate)} — {formatDate(act.endDate)}</span>
                      <span>{act.progress ?? 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: '1rem' }}>
              <strong>Progreso general:</strong> {calculateProgramProgress(selectedProgram.activities)}%
            </div>
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setSelectedProgram(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </AdvancedPageLayout>
  );
}
