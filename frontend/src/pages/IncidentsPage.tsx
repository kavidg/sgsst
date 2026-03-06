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

export function IncidentsPage({ token }: IncidentsPageProps) {
  const [incidents, setIncidents] = useState<IncidentModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [form, setForm] = useState<IncidentFormState>(emptyIncident);

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee._id, employee.name])),
    [employees],
  );

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
  }, [token]);

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

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h2>Módulo de incidentes y accidentes</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem' }}>
        <select
          value={form.employeeId}
          onChange={(event) => setForm((prev) => ({ ...prev, employeeId: event.target.value }))}
          required
        >
          {!employees.length ? <option value="">No hay empleados disponibles</option> : null}
          {employees.map((employee) => (
            <option key={employee._id} value={employee._id}>
              {employee.name}
            </option>
          ))}
        </select>

        <input
          value={form.type}
          onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
          placeholder="Tipo (incidente/accidente)"
          required
        />
        <input
          type="date"
          value={form.date}
          onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
          required
        />
        <textarea
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Descripción"
          required
          rows={3}
        />
        <input
          value={form.severity}
          onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))}
          placeholder="Severidad"
          required
        />
        <input
          value={form.status}
          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
          placeholder="Estado"
          required
        />

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={loading || !employees.length}>
            {editingIncidentId ? 'Editar incidente' : 'Crear incidente'}
          </button>
          {editingIncidentId ? (
            <button type="button" onClick={resetForm}>
              Cancelar edición
            </button>
          ) : null}
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Empleado</th>
            <th align="left">Tipo</th>
            <th align="left">Fecha</th>
            <th align="left">Severidad</th>
            <th align="left">Estado</th>
            <th align="left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <tr key={incident._id}>
              <td>{employeeNames.get(incident.employeeId) ?? incident.employeeId}</td>
              <td>{incident.type}</td>
              <td>{new Date(incident.date).toLocaleDateString('es-CO')}</td>
              <td>{incident.severity}</td>
              <td>{incident.status}</td>
              <td>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => handleEdit(incident)}>
                    Editar
                  </button>
                  <button type="button" onClick={() => handleDelete(incident._id)}>
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!incidents.length ? (
            <tr>
              <td colSpan={6}>No hay incidentes registrados.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </section>
  );
}
