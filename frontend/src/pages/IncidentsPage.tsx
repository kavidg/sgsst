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
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';

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
    <section className="grid">
      <Card title="Módulo de incidentes y accidentes">
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="grid grid-2">
            <label className="field"><span className="label">Empleado</span>
              <Select value={form.employeeId} onChange={(event) => setForm((prev) => ({ ...prev, employeeId: event.target.value }))} required>
                {!employees.length ? <option value="">No hay empleados disponibles</option> : null}
                {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}
              </Select>
            </label>
            <label className="field"><span className="label">Tipo</span><Input value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))} placeholder="incidente/accidente" required /></label>
            <label className="field"><span className="label">Fecha</span><Input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} required /></label>
            <label className="field"><span className="label">Severidad</span><Input value={form.severity} onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))} required /></label>
            <label className="field"><span className="label">Estado</span><Input value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required /></label>
          </div>
          <label className="field"><span className="label">Descripción</span><textarea className="textarea" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required rows={3} /></label>
          <div className="actions">
            <Button type="submit" disabled={loading || !employees.length}>{editingIncidentId ? 'Editar incidente' : 'Crear incidente'}</Button>
            {editingIncidentId ? <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button> : null}
          </div>
        </form>
      </Card>

      <Table>
        <thead><tr><th className="border border-black p-3">Empleado</th><th className="border border-black p-3">Tipo</th><th className="border border-black p-3">Fecha</th><th className="border border-black p-3">Severidad</th><th className="border border-black p-3">Estado</th><th className="border border-black p-3">Acciones</th></tr></thead>
        <tbody>
          {incidents.map((incident) => (
            <tr key={incident._id}>
              <td className="border border-black p-3">{employeeNames.get(incident.employeeId) ?? incident.employeeId}</td><td className="border border-black p-3">{incident.type}</td><td className="border border-black p-3">{new Date(incident.date).toLocaleDateString('es-CO')}</td><td className="border border-black p-3">{incident.severity}</td><td className="border border-black p-3">{incident.status}</td>
              <td className="border border-black p-3"><div className="actions"><Button type="button" variant="secondary" onClick={() => handleEdit(incident)}>Editar</Button><Button type="button" variant="danger" onClick={() => handleDelete(incident._id)}>Eliminar</Button></div></td>
            </tr>
          ))}
          {!incidents.length ? <tr><td className="border border-black p-3" colSpan={6}>No hay incidentes registrados.</td></tr> : null}
        </tbody>
      </Table>

      {error ? <pre className="error">{error}</pre> : null}
    </section>
  );
}
