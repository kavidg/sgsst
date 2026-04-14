import { FormEvent, useEffect, useState } from 'react';
import {
  EmployeeModel,
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployee,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table } from '../components/ui/Table';

interface EmployeesPageProps {
  token: string;
}

interface EmployeeFormState {
  name: string;
  document: string;
  position: string;
  area: string;
  contractType: string;
  status: string;
}

const emptyEmployee: EmployeeFormState = {
  name: '',
  document: '',
  position: '',
  area: '',
  contractType: '',
  status: 'Activo',
};

export function EmployeesPage({ token }: EmployeesPageProps) {
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(emptyEmployee);

  const loadEmployees = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await fetchEmployees(token);
      setEmployees(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar empleados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, [token]);

  const resetForm = () => {
    setForm(emptyEmployee);
    setEditingEmployeeId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingEmployeeId) {
        await updateEmployee(token, editingEmployeeId, form);
      } else {
        await createEmployee(token, form);
      }

      resetForm();
      await loadEmployees();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar empleado.');
      setLoading(false);
    }
  };

  const handleEdit = (employee: EmployeeModel) => {
    setEditingEmployeeId(employee._id);
    setForm({
      name: employee.name,
      document: employee.document,
      position: employee.position,
      area: employee.area,
      contractType: employee.contractType,
      status: employee.status,
    });
  };

  const handleDelete = async (employeeId: string) => {
    setLoading(true);
    setError('');

    try {
      await deleteEmployee(token, employeeId);
      if (editingEmployeeId === employeeId) {
        resetForm();
      }
      await loadEmployees();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar empleado.');
      setLoading(false);
    }
  };

  return (
    <section className="grid">
      <Card title="Módulo de empleados">
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="grid grid-2">
            <label className="field"><span className="label">Nombre</span><Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required /></label>
            <label className="field"><span className="label">Documento</span><Input value={form.document} onChange={(event) => setForm((prev) => ({ ...prev, document: event.target.value }))} required /></label>
            <label className="field"><span className="label">Cargo</span><Input value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} required /></label>
            <label className="field"><span className="label">Área</span><Input value={form.area} onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))} required /></label>
            <label className="field"><span className="label">Tipo de contrato</span><Input value={form.contractType} onChange={(event) => setForm((prev) => ({ ...prev, contractType: event.target.value }))} required /></label>
            <label className="field"><span className="label">Estado</span><Input value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required /></label>
          </div>
          <div className="actions">
            <Button type="submit" disabled={loading}>{editingEmployeeId ? 'Editar empleado' : 'Crear empleado'}</Button>
            {editingEmployeeId ? <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button> : null}
          </div>
        </form>
      </Card>

      <Table>
        <thead>
          <tr>
            <th className="border border-black p-3">Nombre</th><th className="border border-black p-3">Documento</th><th className="border border-black p-3">Cargo</th><th className="border border-black p-3">Área</th><th className="border border-black p-3">Estado</th><th className="border border-black p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee._id}>
              <td className="border border-black p-3">{employee.name}</td><td className="border border-black p-3">{employee.document}</td><td className="border border-black p-3">{employee.position}</td><td className="border border-black p-3">{employee.area}</td><td className="border border-black p-3">{employee.status}</td>
              <td className="border border-black p-3"><div className="actions"><Button type="button" variant="secondary" onClick={() => handleEdit(employee)}>Editar</Button><Button type="button" variant="danger" onClick={() => handleDelete(employee._id)}>Eliminar</Button></div></td>
            </tr>
          ))}
          {!employees.length ? <tr><td className="border border-black p-3" colSpan={6}>No hay empleados registrados.</td></tr> : null}
        </tbody>
      </Table>

      {error ? <pre className="error">{error}</pre> : null}
    </section>
  );
}
