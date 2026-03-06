import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CreateRiskPayload,
  RiskModel,
  UpdateRiskPayload,
  createRisk,
  deleteRisk,
  fetchRisks,
  updateRisk,
} from '../api';

interface RisksPageProps {
  token: string;
}

type RiskFormState = CreateRiskPayload;

const emptyRisk: RiskFormState = {
  process: '',
  activity: '',
  hazard: '',
  risk: '',
  probability: 1,
  consequence: 1,
  controlMeasures: '',
};

export function RisksPage({ token }: RisksPageProps) {
  const [risks, setRisks] = useState<RiskModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [form, setForm] = useState<RiskFormState>(emptyRisk);

  const riskLevel = useMemo(() => form.probability * form.consequence, [form.probability, form.consequence]);

  const loadRisks = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await fetchRisks(token);
      setRisks(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar la matriz de riesgos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRisks();
  }, [token]);

  const resetForm = () => {
    setForm(emptyRisk);
    setEditingRiskId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingRiskId) {
        const payload: UpdateRiskPayload = { ...form };
        await updateRisk(token, editingRiskId, payload);
      } else {
        await createRisk(token, form);
      }

      resetForm();
      await loadRisks();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar el riesgo.');
      setLoading(false);
    }
  };

  const handleEdit = (riskItem: RiskModel) => {
    setEditingRiskId(riskItem._id);
    setForm({
      process: riskItem.process,
      activity: riskItem.activity,
      hazard: riskItem.hazard,
      risk: riskItem.risk,
      probability: riskItem.probability,
      consequence: riskItem.consequence,
      controlMeasures: riskItem.controlMeasures,
    });
  };

  const handleDelete = async (riskId: string) => {
    setLoading(true);
    setError('');

    try {
      await deleteRisk(token, riskId);
      if (editingRiskId === riskId) {
        resetForm();
      }
      await loadRisks();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el riesgo.');
      setLoading(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h2>Matriz de riesgos</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem' }}>
        <input value={form.process} onChange={(event) => setForm((prev) => ({ ...prev, process: event.target.value }))} placeholder="Proceso" required />
        <input value={form.activity} onChange={(event) => setForm((prev) => ({ ...prev, activity: event.target.value }))} placeholder="Actividad" required />
        <input value={form.hazard} onChange={(event) => setForm((prev) => ({ ...prev, hazard: event.target.value }))} placeholder="Peligro" required />
        <input value={form.risk} onChange={(event) => setForm((prev) => ({ ...prev, risk: event.target.value }))} placeholder="Riesgo" required />

        <input
          type="number"
          min={0}
          value={form.probability}
          onChange={(event) => setForm((prev) => ({ ...prev, probability: Number(event.target.value) || 0 }))}
          placeholder="Probabilidad"
          required
        />
        <input
          type="number"
          min={0}
          value={form.consequence}
          onChange={(event) => setForm((prev) => ({ ...prev, consequence: Number(event.target.value) || 0 }))}
          placeholder="Consecuencia"
          required
        />

        <input
          value={form.controlMeasures}
          onChange={(event) => setForm((prev) => ({ ...prev, controlMeasures: event.target.value }))}
          placeholder="Medidas de control"
          required
        />

        <div style={{ fontWeight: 600 }}>Nivel de riesgo (automático): {riskLevel}</div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={loading}>
            {editingRiskId ? 'Editar riesgo' : 'Crear riesgo'}
          </button>
          {editingRiskId ? (
            <button type="button" onClick={resetForm}>
              Cancelar edición
            </button>
          ) : null}
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Proceso</th>
            <th align="left">Actividad</th>
            <th align="left">Peligro</th>
            <th align="left">Riesgo</th>
            <th align="left">Nivel</th>
            <th align="left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {risks.map((riskItem) => (
            <tr key={riskItem._id}>
              <td>{riskItem.process}</td>
              <td>{riskItem.activity}</td>
              <td>{riskItem.hazard}</td>
              <td>{riskItem.risk}</td>
              <td>{riskItem.riskLevel}</td>
              <td>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => handleEdit(riskItem)}>
                    Editar
                  </button>
                  <button type="button" onClick={() => handleDelete(riskItem._id)}>
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!risks.length ? (
            <tr>
              <td colSpan={6}>No hay riesgos registrados.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </section>
  );
}
