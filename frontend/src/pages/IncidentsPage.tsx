import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CreateIncidentPayload,
  EmployeeModel,
  IncidentModel,
  UpdateIncidentPayload,
  createIncident,
  deleteIncident,
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

interface IncidentsPageProps {
  token: string;
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
  { id: 'indicadores', label: 'Indicadores', icon: '📊' },
  { id: 'auditoria', label: 'Auditoría', icon: '🔍' },
];

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

export function IncidentsPage({ token }: IncidentsPageProps) {
  const { companyId } = useCompanyContext();
  const [incidents, setIncidents] = useState<IncidentModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [form, setForm] = useState<IncidentFormState>(emptyIncident);
  const [activeTab, setActiveTab] = useState('registro');

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee._id, employee.name])),
    [employees],
  );

  // KPI calculations
  const kpis = useMemo(() => {
    const total = incidents.length;
    const abiertos = incidents.filter((i) => i.status === 'Abierto').length;
    const cerrados = incidents.filter((i) => i.status === 'Cerrado').length;
    const altaSeveridad = incidents.filter(
      (i) => i.severity?.toLowerCase() === 'alta' || i.severity?.toLowerCase() === 'critical' || i.severity?.toLowerCase() === 'alto'
    ).length;
    return { total, abiertos, cerrados, altaSeveridad };
  }, [incidents]);

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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar incidentes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
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
        moduleCode="SST-ACC-001"
        moduleTitle="Accidentalidad Laboral"
        description="Registro, seguimiento y control de accidentes e incidentes laborales"
        statusBadge={<span className="badge badge--success">🟢 Activo</span>}
        actions={headerActions}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Total Incidentes', value: kpis.total, variant: 'info' },
          { label: 'Casos Abiertos', value: kpis.abiertos, variant: kpis.abiertos > 0 ? 'warning' : 'success' },
          { label: 'Casos Cerrados', value: kpis.cerrados, variant: 'success' },
          { label: 'Alta Severidad', value: kpis.altaSeveridad, variant: kpis.altaSeveridad > 0 ? 'danger' : 'default' },
        ]}
        columns={4}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: REGISTRO ===================== */}
          {activeTab === 'registro' && (
            <AdvancedSection
              title={editingIncidentId ? 'Editar Incidente' : 'Registrar Incidente'}
              description="Complete los campos para registrar un nuevo incidente o accidente laboral"
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
            </AdvancedSection>
          )}

          {/* ===================== TAB: ACCIDENTALIDAD ===================== */}
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
                            <div className="actions">
                              <Button type="button" variant="secondary" onClick={() => handleEdit(incident)}>Editar</Button>
                              <Button type="button" variant="danger" onClick={() => handleDelete(incident._id)}>Eliminar</Button>
                            </div>
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

          {/* ===================== TAB: INDICADORES ===================== */}
          {activeTab === 'indicadores' && (
            <>
              <AdvancedSection title="Indicadores de Accidentalidad" description="Métricas calculadas con los datos registrados" accent="info">
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
            </>
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
                  <p>Accidentalidad Laboral (SST-ACC-001)</p>
                  <small className="muted">Versión 1.0</small>
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
    </AdvancedPageLayout>
  );
}
