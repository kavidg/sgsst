import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AbsenteeismModel,
  AbsenteeismStats,
  AbsenteeismType,
  EmployeeModel,
  createAbsenteeism,
  deleteAbsenteeism,
  fetchAbsenteeismByCompany,
  fetchAbsenteeismStatsByCompany,
  fetchEmployees,
} from '../api';
import { KpiCard } from '../components/KpiCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';

interface AbsenteeismPageProps {
  token: string;
  companyId: string;
}

interface AbsenteeismFormState {
  userId: string;
  tipo: AbsenteeismType;
  fechaInicio: string;
  fechaFin: string;
  descripcion: string;
  soporte: File | null;
}

const ABSENTEEISM_TYPES: AbsenteeismType[] = ['ENFERMEDAD', 'ACCIDENTE', 'PERMISO'];

const emptyForm: AbsenteeismFormState = {
  userId: '',
  tipo: 'ENFERMEDAD',
  fechaInicio: '',
  fechaFin: '',
  descripcion: '',
  soporte: null,
};

const emptyStats: AbsenteeismStats = {
  totalCasos: 0,
  totalDiasPerdidos: 0,
  promedioDias: 0,
};

export function AbsenteeismPage({ token, companyId }: AbsenteeismPageProps) {
  const [records, setRecords] = useState<AbsenteeismModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [stats, setStats] = useState<AbsenteeismStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<AbsenteeismFormState>(emptyForm);

  const employeeNames = useMemo(() => new Map(employees.map((employee) => [employee._id, employee.name])), [employees]);

  const loadData = async () => {
    if (!token || !companyId) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [absenteeismData, statsData, employeeData] = await Promise.all([
        fetchAbsenteeismByCompany(token, companyId),
        fetchAbsenteeismStatsByCompany(token, companyId),
        fetchEmployees(token),
      ]);

      setRecords(absenteeismData);
      setStats(statsData);
      setEmployees(employeeData);
      setForm((prev) => ({ ...prev, userId: prev.userId || employeeData[0]?._id || '' }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar los ausentismos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token, companyId]);

  const openModal = () => {
    setForm((prev) => ({ ...emptyForm, tipo: prev.tipo, userId: prev.userId || employees[0]?._id || '' }));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createAbsenteeism(token, {
        companyId,
        userId: form.userId,
        tipo: form.tipo,
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
        descripcion: form.descripcion || undefined,
        soporte: form.soporte?.name,
      });

      closeModal();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible crear el ausentismo.');
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setError('');

    try {
      await deleteAbsenteeism(token, id);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el ausentismo.');
      setLoading(false);
    }
  };

  return (
    <section className="grid">
      <h2 style={{ margin: 0 }}>Ausentismos</h2>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <KpiCard title="Total casos" value={stats.totalCasos} />
        <KpiCard title="Total días perdidos" value={stats.totalDiasPerdidos} />
        <KpiCard title="Promedio días" value={Number(stats.promedioDias.toFixed(2))} />
      </div>

      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Button type="button" onClick={openModal} disabled={loading || !employees.length}>Nuevo ausentismo</Button>
      </div>

      <Table>
        <thead>
          <tr>
            <th className="border border-black p-3">Empleado</th>
            <th className="border border-black p-3">Tipo</th>
            <th className="border border-black p-3">Fecha inicio</th>
            <th className="border border-black p-3">Fecha fin</th>
            <th className="border border-black p-3">Días</th>
            <th className="border border-black p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record._id}>
              <td className="border border-black p-3">{employeeNames.get(record.userId) ?? record.userId}</td>
              <td className="border border-black p-3">{record.tipo}</td>
              <td className="border border-black p-3">{new Date(record.fechaInicio).toLocaleDateString('es-CO')}</td>
              <td className="border border-black p-3">{new Date(record.fechaFin).toLocaleDateString('es-CO')}</td>
              <td className="border border-black p-3">{record.dias}</td>
              <td className="border border-black p-3">
                <div className="actions">
                  <Button type="button" variant="danger" onClick={() => handleDelete(record._id)}>
                    Eliminar
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {!records.length ? (
            <tr>
              <td className="border border-black p-3" colSpan={6}>No hay ausentismos registrados.</td>
            </tr>
          ) : null}
        </tbody>
      </Table>

      {error ? <pre className="error">{error}</pre> : null}
      {loading ? <p className="muted">Cargando...</p> : null}

      <Modal isOpen={isModalOpen} title="Nuevo ausentismo" onClose={closeModal}>
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span className="label">Empleado</span>
            <Select
              value={form.userId}
              onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}
              required
            >
              {!employees.length ? <option value="">No hay empleados disponibles</option> : null}
              {employees.map((employee) => (
                <option key={employee._id} value={employee._id}>{employee.name}</option>
              ))}
            </Select>
          </label>

          <label className="field">
            <span className="label">Tipo</span>
            <Select value={form.tipo} onChange={(event) => setForm((prev) => ({ ...prev, tipo: event.target.value as AbsenteeismType }))} required>
              {ABSENTEEISM_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </Select>
          </label>

          <div className="grid grid-2">
            <label className="field">
              <span className="label">Fecha inicio</span>
              <Input type="date" value={form.fechaInicio} onChange={(event) => setForm((prev) => ({ ...prev, fechaInicio: event.target.value }))} required />
            </label>
            <label className="field">
              <span className="label">Fecha fin</span>
              <Input type="date" value={form.fechaFin} onChange={(event) => setForm((prev) => ({ ...prev, fechaFin: event.target.value }))} required />
            </label>
          </div>

          <label className="field">
            <span className="label">Descripción</span>
            <textarea
              className="textarea"
              rows={3}
              value={form.descripcion}
              onChange={(event) => setForm((prev) => ({ ...prev, descripcion: event.target.value }))}
            />
          </label>

          <label className="field">
            <span className="label">Soporte (opcional)</span>
            <Input
              type="file"
              onChange={(event) => setForm((prev) => ({ ...prev, soporte: event.target.files?.[0] ?? null }))}
            />
          </label>

          <div className="actions">
            <Button type="submit" disabled={loading || !employees.length}>Guardar ausentismo</Button>
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
