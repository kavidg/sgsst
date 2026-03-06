import { FormEvent, useEffect, useState } from 'react';
import {
  EmployeeModel,
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployee,
} from '../api';

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
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h2>Módulo de empleados</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem' }}>
        <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre" required />
        <input value={form.document} onChange={(event) => setForm((prev) => ({ ...prev, document: event.target.value }))} placeholder="Documento" required />
        <input value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} placeholder="Cargo" required />
        <input value={form.area} onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))} placeholder="Área" required />
        <input value={form.contractType} onChange={(event) => setForm((prev) => ({ ...prev, contractType: event.target.value }))} placeholder="Tipo de contrato" required />
        <input value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} placeholder="Estado" required />

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={loading}>
            {editingEmployeeId ? 'Editar empleado' : 'Crear empleado'}
          </button>
          {editingEmployeeId ? (
            <button type="button" onClick={resetForm}>
              Cancelar edición
            </button>
          ) : null}
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Nombre</th>
            <th align="left">Documento</th>
            <th align="left">Cargo</th>
            <th align="left">Área</th>
            <th align="left">Estado</th>
            <th align="left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee._id}>
              <td>{employee.name}</td>
              <td>{employee.document}</td>
              <td>{employee.position}</td>
              <td>{employee.area}</td>
              <td>{employee.status}</td>
              <td>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => handleEdit(employee)}>
                    Editar empleado
                  </button>
                  <button type="button" onClick={() => handleDelete(employee._id)}>
                    Eliminar empleado
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!employees.length ? (
            <tr>
              <td colSpan={6}>No hay empleados registrados.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </section>
  );
}
