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
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h2>Módulo de capacitaciones</h2>

      <form onSubmit={handleSubmitTraining} style={{ display: 'grid', gap: '0.5rem' }}>
        <input
          value={form.topic}
          onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
          placeholder="Tema"
          required
        />
        <input
          type="date"
          value={form.date}
          onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
          required
        />
        <input
          value={form.instructor}
          onChange={(event) => setForm((prev) => ({ ...prev, instructor: event.target.value }))}
          placeholder="Instructor"
          required
        />
        <textarea
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Descripción"
          rows={3}
          required
        />

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={loading}>
            {editingTrainingId ? 'Editar capacitación' : 'Crear capacitación'}
          </button>
          {editingTrainingId ? (
            <button type="button" onClick={resetTrainingForm}>
              Cancelar edición
            </button>
          ) : null}
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Tema</th>
            <th align="left">Fecha</th>
            <th align="left">Instructor</th>
            <th align="left">Cantidad de asistentes</th>
            <th align="left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {trainings.map((training) => (
            <tr key={training._id}>
              <td>{training.topic}</td>
              <td>{new Date(training.date).toLocaleDateString()}</td>
              <td>{training.instructor}</td>
              <td>{attendanceCount[training._id] ?? 0}</td>
              <td>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => handleEditTraining(training)}>
                    Editar
                  </button>
                  <button type="button" onClick={() => handleDeleteTraining(training._id)}>
                    Eliminar
                  </button>
                  <button type="button" onClick={() => openAttendance(training._id)}>
                    Ver asistentes
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!trainings.length ? (
            <tr>
              <td colSpan={5}>No hay capacitaciones registradas.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {selectedTrainingId ? (
        <section style={{ border: '1px solid #dbe3ee', borderRadius: 8, padding: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Asistencia de la capacitación</h3>

          <form onSubmit={handleSaveAttendance} style={{ display: 'grid', gap: '0.5rem' }}>
            <select
              multiple
              value={selectedEmployees}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions, (option) => option.value);
                setSelectedEmployees(values);
              }}
              style={{ minHeight: 180 }}
            >
              {employees.map((employee) => (
                <option key={employee._id} value={employee._id}>
                  {employee.name} - {employee.document}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={loading}>
                Guardar asistentes
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTrainingId(null);
                  setSelectedEmployees([]);
                }}
              >
                Cerrar
              </button>
            </div>
          </form>

          <ul style={{ marginBottom: 0 }}>
            {selectedAttendance.map((attendance) => (
              <li key={attendance._id}>{attendance.employeeId.name}</li>
            ))}
            {!selectedAttendance.length ? <li>Sin asistentes registrados.</li> : null}
          </ul>
        </section>
      ) : null}

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </section>
  );
}
