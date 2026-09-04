import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreateIncidentPayload,
  DiseaseInvestigationStats,
  EmployeeModel,
  IncidentModel,
  UpdateIncidentPayload,
  createIncident,
  deleteIncident,
  fetchDiseaseInvestigationStats,
  fetchEmployees,
  fetchIncidents,
  updateIncident,
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

interface DiseaseInvestigationManagementPageProps {
  token: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'registro', label: 'Registro', icon: '📝' },
  { id: 'listado', label: 'Listado', icon: '📋' },
  { id: 'indicadores', label: 'Indicadores', icon: '📊' },
  { id: 'tendencia', label: 'Tendencia', icon: '📈' },
];

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

export function DiseaseInvestigationManagementPage({ token }: DiseaseInvestigationManagementPageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [incidents, setIncidents] = useState<IncidentModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [stats, setStats] = useState<DiseaseInvestigationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('registro');
  const [selectedIncident, setSelectedIncident] = useState<IncidentModel | null>(null);

  // Form state for disease investigation
  const [form, setForm] = useState({
    employeeId: '',
    type: 'Enfermedad laboral',
    date: '',
    description: '',
    severity: 'Media',
    status: 'Abierto',
    investigationDate: '',
    responsible: '',
    rootCauses: [] as string[],
    immediateCauses: [] as string[],
    relatedFactors: [] as string[],
    evidence: [] as string[],
    closureDate: '',
    correctiveActions: [] as Array<{ action: string; responsible: string; status: string; dueDate: string; completedDate: string }>,
    preventiveActions: [] as Array<{ action: string; responsible: string; status: string; dueDate: string; completedDate: string }>,
  });

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee._id, employee.name])),
    [employees],
  );

  // Filter only DISEASE investigations
  const diseaseInvestigations = useMemo(
    () => incidents.filter((i) => (i as any).investigationType === 'DISEASE'),
    [incidents],
  );

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [incidentData, employeeData] = await Promise.all([
        fetchIncidents(token, { investigationType: 'DISEASE' }),
        fetchEmployees(token),
      ]);

      setIncidents(incidentData);
      setEmployees(employeeData);

      if (!form.employeeId && employeeData.length > 0) {
        setForm((prev) => ({ ...prev, employeeId: employeeData[0]._id }));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar investigaciones.');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const statsData = await fetchDiseaseInvestigationStats(token);
      setStats(statsData);
    } catch {
      // Stats not available
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    void loadStats();
  }, [companyId, token]);

  const resetForm = () => {
    setForm({
      employeeId: employees[0]?._id ?? '',
      type: 'Enfermedad laboral',
      date: '',
      description: '',
      severity: 'Media',
      status: 'Abierto',
      investigationDate: '',
      responsible: '',
      rootCauses: [],
      immediateCauses: [],
      relatedFactors: [],
      evidence: [],
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
        employeeId: form.employeeId,
        type: form.type,
        date: form.date,
        description: form.description,
        severity: form.severity,
        status: form.status,
        investigationType: 'DISEASE',
        investigationDate: form.investigationDate || undefined,
        responsible: form.responsible || undefined,
        rootCauses: form.rootCauses.length > 0 ? form.rootCauses : undefined,
        immediateCauses: form.immediateCauses.length > 0 ? form.immediateCauses : undefined,
        relatedFactors: form.relatedFactors.length > 0 ? form.relatedFactors : undefined,
        evidence: form.evidence.length > 0 ? form.evidence : undefined,
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
        const updatePayload: UpdateIncidentPayload = { ...payload };
        await updateIncident(token, editingId, updatePayload);
      } else {
        await createIncident(token, payload);
      }

      resetForm();
      await loadData();
      await loadStats();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar la investigación.');
      setLoading(false);
    }
  };

  const handleEdit = (incident: IncidentModel) => {
    setEditingId(incident._id);
    setForm({
      employeeId: incident.employeeId,
      type: incident.type,
      date: incident.date.slice(0, 10),
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      investigationDate: (incident as any).investigationDate?.slice(0, 10) ?? '',
      responsible: (incident as any).responsible ?? '',
      rootCauses: (incident as any).rootCauses ?? [],
      immediateCauses: (incident as any).immediateCauses ?? [],
      relatedFactors: (incident as any).relatedFactors ?? [],
      evidence: (incident as any).evidence ?? [],
      closureDate: (incident as any).closureDate?.slice(0, 10) ?? '',
      correctiveActions: (incident as any).correctiveActions ?? [],
      preventiveActions: (incident as any).preventiveActions ?? [],
    });
    setActiveTab('registro');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta investigación?')) return;
    setLoading(true);
    setError('');

    try {
      await deleteIncident(token, id);
      if (editingId === id) resetForm();
      await loadData();
      await loadStats();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar la investigación.');
      setLoading(false);
    }
  };

  const addRootCause = () => setForm((prev) => ({ ...prev, rootCauses: [...prev.rootCauses, ''] }));
  const removeRootCause = (index: number) => setForm((prev) => ({ ...prev, rootCauses: prev.rootCauses.filter((_, i) => i !== index) }));
  const updateRootCause = (index: number, value: string) => setForm((prev) => ({ ...prev, rootCauses: prev.rootCauses.map((c, i) => i === index ? value : c) }));

  const addImmediateCause = () => setForm((prev) => ({ ...prev, immediateCauses: [...prev.immediateCauses, ''] }));
  const removeImmediateCause = (index: number) => setForm((prev) => ({ ...prev, immediateCauses: prev.immediateCauses.filter((_, i) => i !== index) }));
  const updateImmediateCause = (index: number, value: string) => setForm((prev) => ({ ...prev, immediateCauses: prev.immediateCauses.map((c, i) => i === index ? value : c) }));

  const addRelatedFactor = () => setForm((prev) => ({ ...prev, relatedFactors: [...prev.relatedFactors, ''] }));
  const removeRelatedFactor = (index: number) => setForm((prev) => ({ ...prev, relatedFactors: prev.relatedFactors.filter((_, i) => i !== index) }));
  const updateRelatedFactor = (index: number, value: string) => setForm((prev) => ({ ...prev, relatedFactors: prev.relatedFactors.map((f, i) => i === index ? value : f) }));

  const addEvidence = () => setForm((prev) => ({ ...prev, evidence: [...prev.evidence, ''] }));
  const removeEvidence = (index: number) => setForm((prev) => ({ ...prev, evidence: prev.evidence.filter((_, i) => i !== index) }));
  const updateEvidence = (index: number, value: string) => setForm((prev) => ({ ...prev, evidence: prev.evidence.map((e, i) => i === index ? value : e) }));

  const addCorrectiveAction = () => setForm((prev) => ({
    ...prev,
    correctiveActions: [...prev.correctiveActions, { action: '', responsible: '', status: 'PENDING', dueDate: '', completedDate: '' }],
  }));
  const removeCorrectiveAction = (index: number) => setForm((prev) => ({ ...prev, correctiveActions: prev.correctiveActions.filter((_, i) => i !== index) }));
  const updateCorrectiveAction = (index: number, field: string, value: string) => setForm((prev) => ({
    ...prev,
    correctiveActions: prev.correctiveActions.map((a, i) => i === index ? { ...a, [field]: value } : a),
  }));

  const addPreventiveAction = () => setForm((prev) => ({
    ...prev,
    preventiveActions: [...prev.preventiveActions, { action: '', responsible: '', status: 'PENDING', dueDate: '', completedDate: '' }],
  }));
  const removePreventiveAction = (index: number) => setForm((prev) => ({ ...prev, preventiveActions: prev.preventiveActions.filter((_, i) => i !== index) }));
  const updatePreventiveAction = (index: number, field: string, value: string) => setForm((prev) => ({
    ...prev,
    preventiveActions: prev.preventiveActions.map((a, i) => i === index ? { ...a, [field]: value } : a),
  }));

  const headerActions: HeaderAction[] = [
    {
      label: '← Volver al PHVA',
      onClick: () => navigate('/documents/do'),
      variant: 'secondary',
    },
    {
      label: 'Ir a Empleados',
      onClick: () => navigate('/employees'),
      variant: 'secondary',
    },
    {
      label: 'Ver análisis de cumplimiento',
      onClick: () => navigate('/intelligence-compliance'),
      variant: 'secondary',
    },
    {
      label: loading ? 'Cargando...' : '🔄 Recargar',
      onClick: () => { void loadData(); void loadStats(); },
      variant: 'secondary',
      disabled: loading,
    },
  ];

  // NO_DATA state
  if (!loading && diseaseInvestigations.length === 0 && !statsLoading) {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/do"
          backLabel="← Volver al PHVA"
          moduleCode="SST-DI-002"
          moduleTitle="Investigación de enfermedades laborales"
          description="Gestión, análisis causal, acciones y seguimiento del estándar 3.2.2"
          statusBadge={<span className="badge badge--info">📋 3.2.2</span>}
          actions={headerActions}
        />
        <AdvancedSection title="Estado vacío" description="No hay investigaciones registradas" accent="info">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1rem' }}>
              No hay investigaciones de enfermedades laborales registradas.
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Registra una investigación para comenzar el seguimiento del estándar 3.2.2.
            </p>
            <Button onClick={() => setActiveTab('registro')}>
              + Registrar investigación
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
        moduleCode="SST-DI-002"
        moduleTitle="Investigación de enfermedades laborales"
        description="Gestión, análisis causal, acciones y seguimiento del estándar 3.2.2"
        statusBadge={<span className="badge badge--info">📋 3.2.2</span>}
        actions={headerActions}
      />

      {/* KPIs */}
      {stats && (
        <AdvancedKpiGrid
          items={[
            { label: 'Total investigaciones', value: stats.totalInvestigations, variant: 'info' },
            { label: 'Pendientes', value: stats.pendingInvestigations, variant: stats.pendingInvestigations > 0 ? 'warning' : 'success' },
            { label: 'Cerradas', value: stats.closedInvestigations, variant: 'success' },
            { label: 'Investigación formal', value: stats.investigationsWithFormalResearch, variant: 'info' },
            { label: 'Análisis causal', value: stats.investigationsWithRootCauses, variant: 'info' },
            { label: 'Con acciones', value: stats.investigationsWithCorrectiveActions, variant: 'info' },
            { label: 'Acciones correctivas abiertas', value: stats.openCorrectiveActions, variant: stats.openCorrectiveActions > 0 ? 'warning' : 'success' },
            { label: 'Acciones correctivas vencidas', value: stats.overdueCorrectiveActions, variant: stats.overdueCorrectiveActions > 0 ? 'danger' : 'success' },
            { label: 'Acciones preventivas abiertas', value: stats.openPreventiveActions, variant: stats.openPreventiveActions > 0 ? 'warning' : 'success' },
            { label: 'Acciones preventivas vencidas', value: stats.overduePreventiveActions, variant: stats.overduePreventiveActions > 0 ? 'danger' : 'success' },
            { label: 'Tiempo promedio cierre (días)', value: stats.averageClosureDays, variant: 'info' },
          ]}
          columns={4}
        />
      )}

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: REGISTRO ===================== */}
          {activeTab === 'registro' && (
            <AdvancedSection
              title={editingId ? 'Editar investigación' : 'Registrar investigación'}
              description="Complete los campos para registrar una investigación de enfermedad laboral"
              accent="info"
            >
              <form onSubmit={handleSubmit} className="form-grid">
                <div className="grid grid-2">
                  <label className="field"><span className="label">Empleado *</span>
                    <Select value={form.employeeId} onChange={(event) => setForm((prev) => ({ ...prev, employeeId: event.target.value }))} required>
                      {!employees.length ? <option value="">No hay empleados disponibles</option> : null}
                      {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}
                    </Select>
                  </label>
                  <label className="field"><span className="label">Fecha del evento *</span>
                    <Input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} required />
                  </label>
                  <label className="field"><span className="label">Severidad *</span>
                    <Input value={form.severity} onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))} required />
                  </label>
                  <label className="field"><span className="label">Estado *</span>
                    <Input value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required />
                  </label>
                  <label className="field"><span className="label">Fecha de investigación</span>
                    <Input type="date" value={form.investigationDate} onChange={(event) => setForm((prev) => ({ ...prev, investigationDate: event.target.value }))} />
                  </label>
                  <label className="field"><span className="label">Responsable</span>
                    <Input value={form.responsible} onChange={(event) => setForm((prev) => ({ ...prev, responsible: event.target.value }))} placeholder="Nombre del responsable" />
                  </label>
                  <label className="field"><span className="label">Fecha de cierre</span>
                    <Input type="date" value={form.closureDate} onChange={(event) => setForm((prev) => ({ ...prev, closureDate: event.target.value }))} />
                  </label>
                </div>
                <label className="field"><span className="label">Descripción *</span>
                  <textarea className="input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required rows={3} />
                </label>

                {/* Causas básicas */}
                <AdvancedSection title="Causas básicas" description="Identifique las causas básicas de la enfermedad laboral" accent="warning">
                  {form.rootCauses.map((cause, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <Input value={cause} onChange={(event) => updateRootCause(index, event.target.value)} placeholder={`Causa básica ${index + 1}`} />
                      <Button type="button" variant="danger" onClick={() => removeRootCause(index)}>✕</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={addRootCause}>+ Agregar causa básica</Button>
                </AdvancedSection>

                {/* Causas inmediatas */}
                <AdvancedSection title="Causas inmediatas" description="Identifique las causas inmediatas de la enfermedad laboral" accent="warning">
                  {form.immediateCauses.map((cause, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <Input value={cause} onChange={(event) => updateImmediateCause(index, event.target.value)} placeholder={`Causa inmediata ${index + 1}`} />
                      <Button type="button" variant="danger" onClick={() => removeImmediateCause(index)}>✕</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={addImmediateCause}>+ Agregar causa inmediata</Button>
                </AdvancedSection>

                {/* Factores relacionados */}
                <AdvancedSection title="Factores relacionados" description="Identifique los factores ocupacionales relacionados" accent="info">
                  {form.relatedFactors.map((factor, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <Input value={factor} onChange={(event) => updateRelatedFactor(index, event.target.value)} placeholder={`Factor ${index + 1}`} />
                      <Button type="button" variant="danger" onClick={() => removeRelatedFactor(index)}>✕</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={addRelatedFactor}>+ Agregar factor</Button>
                </AdvancedSection>

                {/* Acciones correctivas */}
                <AdvancedSection title="Acciones correctivas" description="Defina las acciones correctivas derivadas de la investigación" accent="info">
                  {form.correctiveActions.map((action, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'end' }}>
                      <label className="field"><span className="label">Acción</span>
                        <Input value={action.action} onChange={(event) => updateCorrectiveAction(index, 'action', event.target.value)} placeholder="Descripción" />
                      </label>
                      <label className="field"><span className="label">Responsable</span>
                        <Input value={action.responsible} onChange={(event) => updateCorrectiveAction(index, 'responsible', event.target.value)} placeholder="Responsable" />
                      </label>
                      <label className="field"><span className="label">Estado</span>
                        <Select value={action.status} onChange={(event) => updateCorrectiveAction(index, 'status', event.target.value)}>
                          <option value="PENDING">Pendiente</option>
                          <option value="IN_PROGRESS">En progreso</option>
                          <option value="COMPLETED">Completada</option>
                          <option value="CANCELLED">Cancelada</option>
                        </Select>
                      </label>
                      <label className="field"><span className="label">Fecha límite</span>
                        <Input type="date" value={action.dueDate} onChange={(event) => updateCorrectiveAction(index, 'dueDate', event.target.value)} />
                      </label>
                      <Button type="button" variant="danger" onClick={() => removeCorrectiveAction(index)}>✕</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={addCorrectiveAction}>+ Agregar acción correctiva</Button>
                </AdvancedSection>

                {/* Acciones preventivas */}
                <AdvancedSection title="Acciones preventivas" description="Defina las acciones preventivas derivadas de la investigación" accent="info">
                  {form.preventiveActions.map((action, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'end' }}>
                      <label className="field"><span className="label">Acción</span>
                        <Input value={action.action} onChange={(event) => updatePreventiveAction(index, 'action', event.target.value)} placeholder="Descripción" />
                      </label>
                      <label className="field"><span className="label">Responsable</span>
                        <Input value={action.responsible} onChange={(event) => updatePreventiveAction(index, 'responsible', event.target.value)} placeholder="Responsable" />
                      </label>
                      <label className="field"><span className="label">Estado</span>
                        <Select value={action.status} onChange={(event) => updatePreventiveAction(index, 'status', event.target.value)}>
                          <option value="PENDING">Pendiente</option>
                          <option value="IN_PROGRESS">En progreso</option>
                          <option value="COMPLETED">Completada</option>
                          <option value="CANCELLED">Cancelada</option>
                        </Select>
                      </label>
                      <label className="field"><span className="label">Fecha límite</span>
                        <Input type="date" value={action.dueDate} onChange={(event) => updatePreventiveAction(index, 'dueDate', event.target.value)} />
                      </label>
                      <Button type="button" variant="danger" onClick={() => removePreventiveAction(index)}>✕</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={addPreventiveAction}>+ Agregar acción preventiva</Button>
                </AdvancedSection>

                {/* Evidencias */}
                <AdvancedSection title="Evidencias" description="Referencias a documentos de soporte (nombres de archivos)" accent="info">
                  {form.evidence.map((ev, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <Input value={ev} onChange={(event) => updateEvidence(index, event.target.value)} placeholder={`Evidencia ${index + 1}`} />
                      <Button type="button" variant="danger" onClick={() => removeEvidence(index)}>✕</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={addEvidence}>+ Agregar evidencia</Button>
                </AdvancedSection>

                <div className="actions">
                  <Button type="submit" disabled={loading || !employees.length}>
                    {editingId ? 'Guardar cambios' : 'Crear investigación'}
                  </Button>
                  {editingId ? (
                    <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button>
                  ) : null}
                </div>
              </form>
            </AdvancedSection>
          )}

          {/* ===================== TAB: LISTADO ===================== */}
          {activeTab === 'listado' && (
            <AdvancedSection
              title="Investigaciones de enfermedades laborales"
              description={`Total: ${diseaseInvestigations.length} investigaciones`}
              accent="default"
            >
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Empleado</th>
                      <th>Estado</th>
                      <th>Investigación formal</th>
                      <th>Análisis causal</th>
                      <th>Acciones</th>
                      <th>Responsable</th>
                      <th>Evidencia</th>
                      <th>Cierre</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diseaseInvestigations.map((incident) => {
                      const hasFormalResearch = !!(incident as any).investigationDate;
                      const hasCausalAnalysis = ((incident as any).rootCauses?.length ?? 0) > 0 ||
                        ((incident as any).immediateCauses?.length ?? 0) > 0 ||
                        ((incident as any).relatedFactors?.length ?? 0) > 0;
                      const hasActions = ((incident as any).correctiveActions?.length ?? 0) > 0 ||
                        ((incident as any).preventiveActions?.length ?? 0) > 0;
                      const hasEvidence = ((incident as any).evidence?.length ?? 0) > 0;
                      const isClosed = !!(incident as any).closureDate;

                      return (
                        <tr key={incident._id}>
                          <td>{formatDate(incident.date)}</td>
                          <td>{employeeNames.get(incident.employeeId) ?? '—'}</td>
                          <td>
                            <span className={`badge ${isClosed ? 'badge--success' : 'badge--warning'}`}>
                              {isClosed ? 'Cerrada' : 'Abierta'}
                            </span>
                          </td>
                          <td>{hasFormalResearch ? '✅' : '❌'}</td>
                          <td>{hasCausalAnalysis ? '✅' : '❌'}</td>
                          <td>{hasActions ? '✅' : '❌'}</td>
                          <td>{(incident as any).responsible || '—'}</td>
                          <td>{hasEvidence ? '✅' : '❌'}</td>
                          <td>{formatDate((incident as any).closureDate)}</td>
                          <td>
                            <div className="actions">
                              <Button type="button" variant="secondary" onClick={() => handleEdit(incident)}>Editar</Button>
                              <Button type="button" variant="danger" onClick={() => handleDelete(incident._id)}>Eliminar</Button>
                              <Button type="button" variant="secondary" onClick={() => setSelectedIncident(incident)}>Ver detalle</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!diseaseInvestigations.length ? (
                      <tr><td colSpan={10}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay investigaciones de enfermedades laborales registradas.</p></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: INDICADORES ===================== */}
          {activeTab === 'indicadores' && stats && (
            <AdvancedSection title="Indicadores de investigación" description="Métricas calculadas con los datos registrados" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Tasa de cierre</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: stats.totalInvestigations > 0 ? '#10b981' : '#6b7280' }}>
                    {stats.totalInvestigations > 0 ? Math.round((stats.closedInvestigations / stats.totalInvestigations) * 100) : 0}%
                  </p>
                  <p className="muted">{stats.closedInvestigations} de {stats.totalInvestigations} investigaciones cerradas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Investigación formal</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: stats.investigationsWithFormalResearch > 0 ? '#10b981' : '#6b7280' }}>
                    {stats.totalInvestigations > 0 ? Math.round((stats.investigationsWithFormalResearch / stats.totalInvestigations) * 100) : 0}%
                  </p>
                  <p className="muted">{stats.investigationsWithFormalResearch} de {stats.totalInvestigations} con fecha formal</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Análisis causal</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: stats.investigationsWithRootCauses > 0 ? '#10b981' : '#6b7280' }}>
                    {stats.totalInvestigations > 0 ? Math.round((stats.investigationsWithRootCauses / stats.totalInvestigations) * 100) : 0}%
                  </p>
                  <p className="muted">{stats.investigationsWithRootCauses} de {stats.totalInvestigations} con causas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Acciones correctivas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: stats.completedCorrectiveActions > 0 ? '#10b981' : '#6b7280' }}>
                    {stats.openCorrectiveActions} abiertas
                  </p>
                  <p className="muted">{stats.completedCorrectiveActions} completadas · {stats.overdueCorrectiveActions} vencidas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Acciones preventivas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: stats.completedPreventiveActions > 0 ? '#10b981' : '#6b7280' }}>
                    {stats.openPreventiveActions} abiertas
                  </p>
                  <p className="muted">{stats.completedPreventiveActions} completadas · {stats.overduePreventiveActions} vencidas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Tiempo promedio de cierre</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#3b82f6' }}>
                    {stats.averageClosureDays} días
                  </p>
                  <p className="muted">Promedio de cierre de investigaciones</p>
                </div>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: TENDENCIA ===================== */}
          {activeTab === 'tendencia' && stats && (
            <AdvancedSection title="Tendencia mensual" description="Investigaciones por mes" accent="info">
              {stats.monthlyTrend.length > 0 ? (
                <div className="grid" style={{ gap: '0.5rem' }}>
                  {stats.monthlyTrend.map((entry) => (
                    <div key={entry.month} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ minWidth: '80px', fontWeight: 600 }}>{entry.month}</span>
                      <div style={{ flex: 1, background: '#e2e8f0', borderRadius: '4px', height: '24px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min((entry.count / Math.max(...stats.monthlyTrend.map((e) => e.count))) * 100, 100)}%`,
                          background: '#3b82f6',
                          height: '100%',
                          borderRadius: '4px',
                        }} />
                      </div>
                      <span style={{ minWidth: '30px', textAlign: 'right' }}>{entry.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No hay datos de tendencia disponibles.</p>
              )}
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* Detail Modal */}
      {selectedIncident && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedIncident(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Detalle de investigación</h3>
            <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div><strong>Fecha:</strong> {formatDate(selectedIncident.date)}</div>
              <div><strong>Empleado:</strong> {employeeNames.get(selectedIncident.employeeId) ?? '—'}</div>
              <div><strong>Estado:</strong> {(selectedIncident as any).closureDate ? 'Cerrada' : 'Abierta'}</div>
              <div><strong>Responsable:</strong> {(selectedIncident as any).responsible || '—'}</div>
              <div><strong>Fecha investigación:</strong> {formatDate((selectedIncident as any).investigationDate)}</div>
              <div><strong>Fecha cierre:</strong> {formatDate((selectedIncident as any).closureDate)}</div>
            </div>
            {((selectedIncident as any).rootCauses?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Causas básicas:</strong>
                <ul>{(selectedIncident as any).rootCauses.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
            {((selectedIncident as any).immediateCauses?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Causas inmediatas:</strong>
                <ul>{(selectedIncident as any).immediateCauses.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
            {((selectedIncident as any).relatedFactors?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Factores relacionados:</strong>
                <ul>{(selectedIncident as any).relatedFactors.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            {((selectedIncident as any).correctiveActions?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Acciones correctivas:</strong>
                <ul>{(selectedIncident as any).correctiveActions.map((a: any, i: number) => <li key={i}>{a.action} — {a.responsible} ({a.status})</li>)}</ul>
              </div>
            )}
            {((selectedIncident as any).preventiveActions?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Acciones preventivas:</strong>
                <ul>{(selectedIncident as any).preventiveActions.map((a: any, i: number) => <li key={i}>{a.action} — {a.responsible} ({a.status})</li>)}</ul>
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
