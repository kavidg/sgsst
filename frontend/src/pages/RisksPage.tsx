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
import { useCompanyContext } from '../context/CompanyContext';
import { AdvancedPageLayout } from '../components/advanced-layout/AdvancedPageLayout';
import { AdvancedHeader, type HeaderAction } from '../components/advanced-layout/AdvancedHeader';
import { AdvancedKpiGrid } from '../components/advanced-layout/AdvancedKpiGrid';
import { AdvancedSection } from '../components/advanced-layout/AdvancedSection';

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
  const { companyId } = useCompanyContext();
  const [risks, setRisks] = useState<RiskModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [form, setForm] = useState<RiskFormState>(emptyRisk);
  const [lastSync, setLastSync] = useState('');

  const riskLevel = useMemo(() => form.probability * form.consequence, [form.probability, form.consequence]);

  const totalRiesgos = risks.length;
  const altoNivel = risks.filter((r) => r.riskLevel >= 15).length;
  const riesgoPromedio = totalRiesgos > 0
    ? (risks.reduce((sum, r) => sum + r.riskLevel, 0) / totalRiesgos).toFixed(1)
    : '0';
  const criticos = risks.filter((r) => r.riskLevel >= 20).length;

  const loadRisks = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await fetchRisks(token);
      setRisks(data);
      setLastSync(new Date().toLocaleString('es-CO'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar la matriz de riesgos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRisks();
  }, [companyId, token]);

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

  const headerActions: HeaderAction[] = [
    { label: '🔄 Recargar datos', onClick: loadRisks, variant: 'secondary' },
  ];

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        moduleCode="SST-RSK-001"
        moduleTitle="Matriz de Riesgos"
        description="Identificación, evaluación y control de peligros y riesgos laborales"
        statusBadge={<span className="badge badge--success">🟢 Activo</span>}
        actions={headerActions}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Total riesgos', value: totalRiesgos },
          {
            label: 'Alto nivel',
            value: altoNivel,
            variant: altoNivel > 0 ? 'warning' : 'default',
          },
          { label: 'Riesgo promedio', value: riesgoPromedio as string },
          {
            label: 'Críticos',
            value: criticos,
            variant: criticos > 0 ? 'danger' : 'default',
          },
        ]}
        columns={4}
      />

      {error && !loading ? <pre className="error">{error}</pre> : null}
      {loading ? <p className="muted">Cargando matriz de riesgos...</p> : null}

      <AdvancedSection title="Registro de riesgos" description="Complete los campos para crear o editar un riesgo laboral">
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
      </AdvancedSection>

      <AdvancedSection title="Listado de riesgos" description={`${risks.length} riesgo(s) registrado(s) en la matriz`}>
        <Table>
          <thead><tr><th className="border border-black p-3">Proceso</th><th className="border border-black p-3">Actividad</th><th className="border border-black p-3">Peligro</th><th className="border border-black p-3">Riesgo</th><th className="border border-black p-3">Nivel</th><th className="border border-black p-3">Acciones</th></tr></thead>
          <tbody>
            {risks.map((riskItem) => (
              <tr key={riskItem._id}>
                <td className="border border-black p-3">{riskItem.process}</td><td className="border border-black p-3">{riskItem.activity}</td><td className="border border-black p-3">{riskItem.hazard}</td><td className="border border-black p-3">{riskItem.risk}</td><td className="border border-black p-3">{riskItem.riskLevel}</td>
                <td className="border border-black p-3"><div className="actions"><Button type="button" variant="secondary" onClick={() => handleEdit(riskItem)}>Editar</Button><Button type="button" variant="danger" onClick={() => handleDelete(riskItem._id)}>Eliminar</Button></div></td>
              </tr>
            ))}
            {!risks.length ? <tr><td className="border border-black p-3" colSpan={6}>No hay riesgos registrados.</td></tr> : null}
          </tbody>
        </Table>
      </AdvancedSection>

      <Card title="Auditoría del módulo">
        <div className="grid grid-3">
          <div>
            <p className="label" style={{ margin: 0, fontSize: '0.82rem' }}>Total registros</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{risks.length}</p>
          </div>
          <div>
            <p className="label" style={{ margin: 0, fontSize: '0.82rem' }}>Última sincronización</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{lastSync || '—'}</p>
          </div>
          <div>
            <p className="label" style={{ margin: 0, fontSize: '0.82rem' }}>Estado del módulo</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>🟢 Activo</p>
          </div>
        </div>
      </Card>

      <p className="muted" style={{ fontSize: '0.82rem', textAlign: 'right' }}>
        Última actualización: {lastSync || '—'}
      </p>
    </AdvancedPageLayout>
  );
}
