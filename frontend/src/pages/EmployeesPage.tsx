import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  bulkCreateEmployees,
  BulkEmployeesResponse,
  CreateEmployeePayload,
  EmployeeModel,
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployee,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
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

interface BulkPreviewItem {
  row: number;
  data: CreateEmployeePayload;
  error?: string;
}

const emptyEmployee: EmployeeFormState = {
  name: '',
  document: '',
  position: '',
  area: '',
  contractType: '',
  status: 'Activo',
};

const BULK_ALLOWED_STATUS = new Set(['Activo', 'No activo']);

export function EmployeesPage({ token }: EmployeesPageProps) {
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(emptyEmployee);

  const [bulkPreview, setBulkPreview] = useState<BulkPreviewItem[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkEmployeesResponse | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const parseBulkEmployee = (value: unknown): string => {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number') {
      return String(value).trim();
    }

    return '';
  };

  const handleBulkFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setBulkResult(null);
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!worksheet) {
        setError('El archivo no contiene una hoja válida.');
        setBulkPreview([]);
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

      const preview = rows.map((row: Record<string, unknown>, index: number) => {
        const data: CreateEmployeePayload = {
          name: parseBulkEmployee(row['nombre']),
          document: parseBulkEmployee(row['documento']),
          position: parseBulkEmployee(row['cargo']),
          area: parseBulkEmployee(row['area']),
          contractType: parseBulkEmployee(row['tipo de contrato']),
          status: parseBulkEmployee(row['estado']),
        };

        const missingRequired = Object.values(data).some((field) => !field);

        if (missingRequired) {
          return {
            row: index + 2,
            data,
            error: 'Todos los campos son obligatorios.',
          };
        }

        if (!BULK_ALLOWED_STATUS.has(data.status)) {
          return {
            row: index + 2,
            data,
            error: 'El estado debe ser "Activo" o "No activo".',
          };
        }

        return {
          row: index + 2,
          data,
        };
      });

      setBulkPreview(preview);
    } catch {
      setError('No fue posible leer el archivo Excel. Verifica el formato.');
      setBulkPreview([]);
    } finally {
      event.target.value = '';
    }
  };

  const handleBulkUpload = async () => {
    const validEmployees = bulkPreview.filter((item) => !item.error).map((item) => item.data);

    if (!validEmployees.length) {
      setError('No hay registros válidos para cargar.');
      return;
    }

    setBulkLoading(true);
    setError('');

    try {
      const response = await bulkCreateEmployees(token, { employees: validEmployees });
      setBulkResult(response);
      await loadEmployees();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible realizar la carga masiva.');
    } finally {
      setBulkLoading(false);
    }
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        nombre: 'Juan Pérez',
        documento: '123456789',
        cargo: 'Analista SST',
        area: 'Talento humano',
        'tipo de contrato': 'Indefinido',
        estado: 'Activo',
      },
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Empleados');
    XLSX.writeFile(workbook, 'plantilla-empleados.xlsx');
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
            <label className="field">
              <span className="label">Estado</span>
              <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required>
                <option value="Activo">Activo</option>
                <option value="No activo">No activo</option>
              </Select>
            </label>
          </div>
          <div className="actions">
            <Button type="submit" disabled={loading}>{editingEmployeeId ? 'Editar empleado' : 'Crear empleado'}</Button>
            {editingEmployeeId ? <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button> : null}
          </div>
        </form>
      </Card>

      <Card title="Carga masiva de empleados">
        <div className="actions">
          <Button type="button" onClick={() => fileInputRef.current?.click()}>
            Cargue masivo
          </Button>
          <Button type="button" variant="secondary" onClick={downloadTemplate}>
            Descargar plantilla Excel
          </Button>
          <Button type="button" onClick={handleBulkUpload} disabled={bulkLoading || !bulkPreview.length}>
            {bulkLoading ? 'Cargando...' : 'Enviar válidos'}
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleBulkFile} className="hidden" />

        {bulkPreview.length ? (
          <Table>
            <thead>
              <tr>
                <th className="border border-black p-3">Fila</th>
                <th className="border border-black p-3">Nombre</th>
                <th className="border border-black p-3">Documento</th>
                <th className="border border-black p-3">Cargo</th>
                <th className="border border-black p-3">Área</th>
                <th className="border border-black p-3">Tipo de contrato</th>
                <th className="border border-black p-3">Estado</th>
                <th className="border border-black p-3">Validación</th>
              </tr>
            </thead>
            <tbody>
              {bulkPreview.map((item) => (
                <tr key={`${item.row}-${item.data.document}`}>
                  <td className="border border-black p-3">{item.row}</td>
                  <td className="border border-black p-3">{item.data.name}</td>
                  <td className="border border-black p-3">{item.data.document}</td>
                  <td className="border border-black p-3">{item.data.position}</td>
                  <td className="border border-black p-3">{item.data.area}</td>
                  <td className="border border-black p-3">{item.data.contractType}</td>
                  <td className="border border-black p-3">{item.data.status}</td>
                  <td className="border border-black p-3">{item.error ?? 'Válido'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      {bulkResult ? (
        <Card title="Resultado de carga masiva">
          <p>Insertados: {bulkResult.inserted}</p>
          <p>Fallidos: {bulkResult.failed}</p>
          {bulkResult.errors.length ? (
            <ul>
              {bulkResult.errors.map((bulkError) => (
                <li key={`${bulkError.row}-${bulkError.message}`}>
                  Fila {bulkError.row}: {bulkError.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

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
