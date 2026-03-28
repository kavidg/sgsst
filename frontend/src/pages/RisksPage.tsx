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
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table } from '../components/ui/Table';

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
    <section className="grid">
      <Card title="Matriz de riesgos">
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="grid grid-2">
            <label className="field"><span className="label">Proceso</span><Input value={form.process} onChange={(event) => setForm((prev) => ({ ...prev, process: event.target.value }))} required /></label>
            <label className="field"><span className="label">Actividad</span><Input value={form.activity} onChange={(event) => setForm((prev) => ({ ...prev, activity: event.target.value }))} required /></label>
            <label className="field"><span className="label">Peligro</span><Input value={form.hazard} onChange={(event) => setForm((prev) => ({ ...prev, hazard: event.target.value }))} required /></label>
            <label className="field"><span className="label">Riesgo</span><Input value={form.risk} onChange={(event) => setForm((prev) => ({ ...prev, risk: event.target.value }))} required /></label>
            <label className="field"><span className="label">Probabilidad</span><Input type="number" min={0} value={form.probability} onChange={(event) => setForm((prev) => ({ ...prev, probability: Number(event.target.value) || 0 }))} required /></label>
            <label className="field"><span className="label">Consecuencia</span><Input type="number" min={0} value={form.consequence} onChange={(event) => setForm((prev) => ({ ...prev, consequence: Number(event.target.value) || 0 }))} required /></label>
          </div>
          <label className="field"><span className="label">Medidas de control</span><Input value={form.controlMeasures} onChange={(event) => setForm((prev) => ({ ...prev, controlMeasures: event.target.value }))} required /></label>
          <div className="card" style={{ padding: '.6rem .8rem' }}>Nivel de riesgo (automático): <strong>{riskLevel}</strong></div>
          <div className="actions">
            <Button type="submit" disabled={loading}>{editingRiskId ? 'Editar riesgo' : 'Crear riesgo'}</Button>
            {editingRiskId ? <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button> : null}
          </div>
        </form>
      </Card>

      <Table>
        <thead><tr><th>Proceso</th><th>Actividad</th><th>Peligro</th><th>Riesgo</th><th>Nivel</th><th>Acciones</th></tr></thead>
        <tbody>
          {risks.map((riskItem) => (
            <tr key={riskItem._id}>
              <td>{riskItem.process}</td><td>{riskItem.activity}</td><td>{riskItem.hazard}</td><td>{riskItem.risk}</td><td>{riskItem.riskLevel}</td>
              <td><div className="actions"><Button type="button" variant="secondary" onClick={() => handleEdit(riskItem)}>Editar</Button><Button type="button" variant="danger" onClick={() => handleDelete(riskItem._id)}>Eliminar</Button></div></td>
            </tr>
          ))}
          {!risks.length ? <tr><td colSpan={6}>No hay riesgos registrados.</td></tr> : null}
        </tbody>
      </Table>

      {error ? <pre className="error">{error}</pre> : null}
    </section>
  );
}
