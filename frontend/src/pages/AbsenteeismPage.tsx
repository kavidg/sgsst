import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AbsenteeismModel,
  AbsenteeismType,
  EmployeeModel,
  createAbsenteeism,
  deleteAbsenteeism,
  fetchAbsenteeismByCompany,
  fetchEmployees,
} from '../api';
import { KpiCard } from '../components/KpiCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

interface FilterState {
  startDate: string;
  endDate: string;
  tipo: '' | AbsenteeismType;
}

interface MonthlyLostDaysDatum {
  month: string;
  lostDays: number;
}

interface TypeDistributionDatum {
  name: AbsenteeismType;
  value: number;
}

interface EmployeeCasesDatum {
  employeeName: string;
  cases: number;
}

const ABSENTEEISM_TYPES: AbsenteeismType[] = ['ENFERMEDAD', 'ACCIDENTE', 'PERMISO'];
const PIE_COLORS = ['#2563eb', '#14b8a6', '#f97316'];

const emptyForm: AbsenteeismFormState = {
  userId: '',
  tipo: 'ENFERMEDAD',
  fechaInicio: '',
  fechaFin: '',
  descripcion: '',
  soporte: null,
};

const defaultFilters: FilterState = {
  startDate: '',
  endDate: '',
  tipo: '',
};

export function AbsenteeismPage({ token, companyId }: AbsenteeismPageProps) {
  const [records, setRecords] = useState<AbsenteeismModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<AbsenteeismFormState>(emptyForm);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const employeeNames = useMemo(() => new Map(employees.map((employee) => [employee._id, employee.name])), [employees]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const start = new Date(record.fechaInicio);
      const end = new Date(record.fechaFin);

      if (filters.tipo && record.tipo !== filters.tipo) {
        return false;
      }

      if (filters.startDate) {
        const minDate = new Date(filters.startDate);
        if (end < minDate) {
          return false;
        }
      }

      if (filters.endDate) {
        const maxDate = new Date(filters.endDate);
        if (start > maxDate) {
          return false;
        }
      }

      return true;
    });
  }, [records, filters]);

  const totalDiasPerdidos = useMemo(() => filteredRecords.reduce((sum, item) => sum + item.dias, 0), [filteredRecords]);
  const totalCasos = filteredRecords.length;
  const promedioDiasPorCaso = totalCasos ? totalDiasPerdidos / totalCasos : 0;

  const rangeDays = useMemo(() => {
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      const msPerDay = 1000 * 60 * 60 * 24;
      return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
    }

    if (!filteredRecords.length) {
      return 0;
    }

    const starts = filteredRecords.map((record) => new Date(record.fechaInicio).getTime());
    const ends = filteredRecords.map((record) => new Date(record.fechaFin).getTime());
    const msPerDay = 1000 * 60 * 60 * 24;

    return Math.max(1, Math.floor((Math.max(...ends) - Math.min(...starts)) / msPerDay) + 1);
  }, [filters.startDate, filters.endDate, filteredRecords]);

  const tasaAusentismo = useMemo(() => {
    if (!employees.length || !rangeDays) {
      return 0;
    }

    return (totalDiasPerdidos / (employees.length * rangeDays)) * 100;
  }, [employees.length, totalDiasPerdidos, rangeDays]);

  const monthlyLostDays = useMemo<MonthlyLostDaysDatum[]>(() => {
    const monthly = new Map<string, number>();

    filteredRecords.forEach((record) => {
      const monthKey = new Date(record.fechaInicio).toLocaleDateString('es-CO', { year: 'numeric', month: 'short' });
      monthly.set(monthKey, (monthly.get(monthKey) ?? 0) + record.dias);
    });

    return Array.from(monthly.entries()).map(([month, lostDays]) => ({ month, lostDays }));
  }, [filteredRecords]);

  const typeDistribution = useMemo<TypeDistributionDatum[]>(() => {
    const initialValues = ABSENTEEISM_TYPES.reduce<Record<AbsenteeismType, number>>(
      (accumulator, type) => ({ ...accumulator, [type]: 0 }),
      { ENFERMEDAD: 0, ACCIDENTE: 0, PERMISO: 0 },
    );

    filteredRecords.forEach((record) => {
      initialValues[record.tipo] += 1;
    });

    return ABSENTEEISM_TYPES.map((type) => ({ name: type, value: initialValues[type] }));
  }, [filteredRecords]);

  const employeeCases = useMemo<EmployeeCasesDatum[]>(() => {
    const employeeMap = new Map<string, number>();

    filteredRecords.forEach((record) => {
      employeeMap.set(record.userId, (employeeMap.get(record.userId) ?? 0) + 1);
    });

    return Array.from(employeeMap.entries())
      .map(([userId, cases]) => ({ employeeName: employeeNames.get(userId) ?? userId, cases }))
      .sort((a, b) => b.cases - a.cases)
      .slice(0, 10);
  }, [filteredRecords, employeeNames]);

  const loadData = async () => {
    if (!token || !companyId) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [absenteeismData, employeeData] = await Promise.all([fetchAbsenteeismByCompany(token, companyId), fetchEmployees(token)]);

      setRecords(absenteeismData);
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

      <Card>
        <div className="grid grid-3">
          <label className="field">
            <span className="label">Fecha inicio</span>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilters((previous) => ({ ...previous, startDate: event.target.value }))}
            />
          </label>

          <label className="field">
            <span className="label">Fecha fin</span>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilters((previous) => ({ ...previous, endDate: event.target.value }))}
            />
          </label>

          <label className="field">
            <span className="label">Tipo</span>
            <Select
              value={filters.tipo}
              onChange={(event) => setFilters((previous) => ({ ...previous, tipo: event.target.value as '' | AbsenteeismType }))}
            >
              <option value="">Todos</option>
              {ABSENTEEISM_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <KpiCard title="Total casos" value={totalCasos} />
        <KpiCard title="Total días perdidos" value={totalDiasPerdidos} />
        <KpiCard title="Promedio días por caso" value={Number(promedioDiasPorCaso.toFixed(2))} />
        <KpiCard title="Tasa de ausentismo (%)" value={`${tasaAusentismo.toFixed(2)}%`} />
      </div>

      <div className="grid grid-2">
        <Card title="Días perdidos por mes">
          <div className="absenteeism-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyLostDays}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="lostDays" name="Días perdidos" stroke="#2563eb" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Distribución por tipo">
          <div className="absenteeism-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeDistribution} dataKey="value" nameKey="name" outerRadius={95} label>
                  {typeDistribution.map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Casos por empleado">
        <div className="absenteeism-chart absenteeism-chart--tall">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={employeeCases}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="employeeName" interval={0} angle={-20} textAnchor="end" height={72} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="cases" name="Casos" fill="#14b8a6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

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
          {filteredRecords.map((record) => (
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
          {!filteredRecords.length ? (
            <tr>
              <td className="border border-black p-3" colSpan={6}>No hay ausentismos registrados para los filtros seleccionados.</td>
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
