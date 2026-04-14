import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CreateTrainingPayload,
  EmployeeModel,
  TrainingAttendanceModel,
  TrainingModel,
  UpdateTrainingPayload,
  createTraining,
  createTrainingAttendance,
  deleteTraining,
  fetchEmployees,
  fetchTrainingAttendance,
  fetchTrainings,
  updateTraining,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';

interface TrainingsPageProps {
  token: string;
}

type TrainingFormState = CreateTrainingPayload;

const emptyTraining: TrainingFormState = {
  topic: '',
  date: '',
  instructor: '',
  description: '',
};

export function TrainingsPage({ token }: TrainingsPageProps) {
  const [trainings, setTrainings] = useState<TrainingModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [attendanceByTraining, setAttendanceByTraining] = useState<Record<string, TrainingAttendanceModel[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [form, setForm] = useState<TrainingFormState>(emptyTraining);

  const attendanceCount = useMemo(() => {
    return Object.fromEntries(
      Object.entries(attendanceByTraining).map(([trainingId, attendance]) => [trainingId, attendance.length]),
    );
  }, [attendanceByTraining]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [trainingData, employeeData] = await Promise.all([fetchTrainings(token), fetchEmployees(token)]);
      setTrainings(trainingData);
      setEmployees(employeeData);

      const attendanceEntries = await Promise.all(
        trainingData.map(async (training) => [training._id, await fetchTrainingAttendance(token, training._id)] as const),
      );

      setAttendanceByTraining(Object.fromEntries(attendanceEntries));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar capacitaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const resetTrainingForm = () => {
    setForm(emptyTraining);
    setEditingTrainingId(null);
  };

  const handleSubmitTraining = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingTrainingId) {
        const payload: UpdateTrainingPayload = { ...form };
        await updateTraining(token, editingTrainingId, payload);
      } else {
        await createTraining(token, form);
      }

      resetTrainingForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar la capacitación.');
      setLoading(false);
    }
  };

  const handleEditTraining = (training: TrainingModel) => {
    setEditingTrainingId(training._id);
    setForm({
      topic: training.topic,
      date: training.date.slice(0, 10),
      instructor: training.instructor,
      description: training.description,
      evidenceUrl: training.evidenceUrl,
    });
  };

  const handleDeleteTraining = async (id: string) => {
    setLoading(true);
    setError('');

    try {
      await deleteTraining(token, id);

      if (editingTrainingId === id) {
        resetTrainingForm();
      }

      if (selectedTrainingId === id) {
        setSelectedTrainingId(null);
        setSelectedEmployees([]);
      }

      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar la capacitación.');
      setLoading(false);
    }
  };

  const openAttendance = (trainingId: string) => {
    setSelectedTrainingId(trainingId);
    const selected = attendanceByTraining[trainingId]?.map((entry) => entry.employeeId._id) ?? [];
    setSelectedEmployees(selected);
  };

  const handleSaveAttendance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTrainingId) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await Promise.all(
        selectedEmployees.map((employeeId) =>
          createTrainingAttendance(token, selectedTrainingId, { employeeId }),
        ),
      );

      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar asistentes.');
      setLoading(false);
    }
  };

  const selectedAttendance = selectedTrainingId ? attendanceByTraining[selectedTrainingId] ?? [] : [];

  return (
    <section className="grid">
      <Card title="Módulo de capacitaciones">
        <form onSubmit={handleSubmitTraining} className="form-grid">
          <div className="grid grid-2">
            <label className="field"><span className="label">Tema</span><Input value={form.topic} onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))} required /></label>
            <label className="field"><span className="label">Fecha</span><Input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} required /></label>
            <label className="field"><span className="label">Instructor</span><Input value={form.instructor} onChange={(event) => setForm((prev) => ({ ...prev, instructor: event.target.value }))} required /></label>
          </div>
          <label className="field"><span className="label">Descripción</span><textarea className="textarea" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} required /></label>
          <div className="actions">
            <Button type="submit" disabled={loading}>{editingTrainingId ? 'Editar capacitación' : 'Crear capacitación'}</Button>
            {editingTrainingId ? <Button type="button" variant="secondary" onClick={resetTrainingForm}>Cancelar edición</Button> : null}
          </div>
        </form>
      </Card>

      <Table>
        <thead><tr><th className="border border-black p-3">Tema</th><th className="border border-black p-3">Fecha</th><th className="border border-black p-3">Instructor</th><th className="border border-black p-3">Asistentes</th><th className="border border-black p-3">Acciones</th></tr></thead>
        <tbody>
          {trainings.map((training) => (
            <tr key={training._id}>
              <td className="border border-black p-3">{training.topic}</td><td className="border border-black p-3">{new Date(training.date).toLocaleDateString()}</td><td className="border border-black p-3">{training.instructor}</td><td className="border border-black p-3">{attendanceCount[training._id] ?? 0}</td>
              <td className="border border-black p-3"><div className="actions"><Button type="button" variant="secondary" onClick={() => handleEditTraining(training)}>Editar</Button><Button type="button" variant="danger" onClick={() => handleDeleteTraining(training._id)}>Eliminar</Button><Button type="button" variant="ghost" onClick={() => openAttendance(training._id)}>Ver asistentes</Button></div></td>
            </tr>
          ))}
          {!trainings.length ? <tr><td className="border border-black p-3" colSpan={5}>No hay capacitaciones registradas.</td></tr> : null}
        </tbody>
      </Table>

      {selectedTrainingId ? (
        <Card title="Asistencia de la capacitación">
          <form onSubmit={handleSaveAttendance} className="form-grid">
            <label className="field">
              <span className="label">Empleados asistentes</span>
              <Select
                multiple
                value={selectedEmployees}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions, (option) => option.value);
                  setSelectedEmployees(values);
                }}
                className="select"
                style={{ minHeight: 190 }}
              >
                {employees.map((employee) => (
                  <option key={employee._id} value={employee._id}>{employee.name}</option>
                ))}
              </Select>
            </label>
            <div className="actions"><Button type="submit" disabled={loading}>Guardar asistentes</Button><Button type="button" variant="secondary" onClick={() => setSelectedTrainingId(null)}>Cerrar</Button></div>
          </form>

          <Table>
            <thead><tr><th className="border border-black p-3">Empleado</th><th className="border border-black p-3">Fecha de registro</th></tr></thead>
            <tbody>
              {selectedAttendance.map((entry) => (
                <tr key={entry._id}><td className="border border-black p-3">{entry.employeeId.name}</td><td className="border border-black p-3">-</td></tr>
              ))}
              {!selectedAttendance.length ? <tr><td className="border border-black p-3" colSpan={2}>No hay asistentes registrados para esta capacitación.</td></tr> : null}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {error ? <pre className="error">{error}</pre> : null}
    </section>
  );
}
