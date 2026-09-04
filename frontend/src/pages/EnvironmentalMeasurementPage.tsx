import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EnvironmentalMeasurementModel,
  CreateEnvironmentalMeasurementPayload,
  createEnvironmentalMeasurement,
  deleteEnvironmentalMeasurement,
  fetchEnvironmentalMeasurements,
  updateEnvironmentalMeasurement,
  fetchStandardAnalysis,
  type StandardAnalysisResponse,
} from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useCompanyContext } from '../context/CompanyContext';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
  type HeaderAction,
} from '../components/advanced-layout';
import {
  MEASUREMENT_TYPE_LABELS,
  COMPLIANCE_RESULT_LABELS,
  COMPLIANCE_RESULT_CLASSES,
  MEASUREMENT_STATUS_LABELS,
  MEASUREMENT_STATUS_CLASSES,
} from '../types/environmentalMeasurement';

/**
 * FASE 15
 * Página de gestión avanzada del estándar 4.1.4
 * "Mediciones ambientales"
 */

interface EnvironmentalMeasurementPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'mediciones', label: 'Mediciones', icon: '🌡️' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

export function EnvironmentalMeasurementPage({ token, role }: EnvironmentalMeasurementPageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [measurements, setMeasurements] = useState<EnvironmentalMeasurementModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('mediciones');
  const [selectedMeasurement, setSelectedMeasurement] = useState<EnvironmentalMeasurementModel | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<StandardAnalysisResponse | null>(null);
  const [intelligenceError, setIntelligenceError] = useState('');

  // Form state
  const [form, setForm] = useState({
    measurementType: 'NOISE',
    description: '',
    area: '',
    measurementDate: new Date().toISOString().split('T')[0],
    responsible: '',
    resultValue: '',
    resultUnit: '',
    regulatoryLimit: '',
    regulatoryLimitUnit: '',
    complianceResult: '',
    methodInstrument: '',
    observations: '',
    status: 'COMPLETED',
  });

  const isManager = role === 'manager';
  const canEdit = !isManager;

  // Load data
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEnvironmentalMeasurements(token);
      setMeasurements(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar mediciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Load intelligence
  useEffect(() => {
    if (activeTab !== 'intelligence') return;
    if (intelligence) return;
    setIntelligenceLoading(true);
    setIntelligenceError('');
    fetchStandardAnalysis(token, '4.1.4')
      .then(setIntelligence)
      .catch((err: unknown) => setIntelligenceError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setIntelligenceLoading(false));
  }, [activeTab, token, intelligence]);

  // KPIs
  const kpis = useMemo(() => {
    const total = measurements.length;
    const completed = measurements.filter((m) => m.status === 'COMPLETED').length;
    const withinLimits = measurements.filter((m) => m.complianceResult === 'WITHIN_LIMITS').length;
    const exceedsLimits = measurements.filter((m) => m.complianceResult === 'EXCEEDS_LIMITS').length;
    const types = new Set(measurements.map((m) => m.measurementType));
    return { total, completed, withinLimits, exceedsLimits, typesCount: types.size };
  }, [measurements]);

  // Form handlers
  const resetForm = () => {
    setForm({
      measurementType: 'NOISE',
      description: '',
      area: '',
      measurementDate: new Date().toISOString().split('T')[0],
      responsible: '',
      resultValue: '',
      resultUnit: '',
      regulatoryLimit: '',
      regulatoryLimitUnit: '',
      complianceResult: '',
      methodInstrument: '',
      observations: '',
      status: 'COMPLETED',
    });
    setEditingId(null);
    setSelectedMeasurement(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: CreateEnvironmentalMeasurementPayload = {
      measurementType: form.measurementType as any,
      description: form.description,
      area: form.area,
      measurementDate: form.measurementDate,
      responsible: form.responsible || undefined,
      resultValue: form.resultValue ? Number(form.resultValue) : undefined,
      resultUnit: form.resultUnit || undefined,
      regulatoryLimit: form.regulatoryLimit ? Number(form.regulatoryLimit) : undefined,
      regulatoryLimitUnit: form.regulatoryLimitUnit || undefined,
      complianceResult: form.complianceResult || undefined,
      methodInstrument: form.methodInstrument || undefined,
      observations: form.observations || undefined,
      status: form.status as any,
    };

    try {
      if (editingId) {
        await updateEnvironmentalMeasurement(token, editingId, payload);
      } else {
        await createEnvironmentalMeasurement(token, payload);
      }
      resetForm();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta medición?')) return;
    try {
      await deleteEnvironmentalMeasurement(token, id);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleEdit = (m: EnvironmentalMeasurementModel) => {
    setForm({
      measurementType: m.measurementType,
      description: m.description,
      area: m.area,
      measurementDate: m.measurementDate.split('T')[0],
      responsible: m.responsible || '',
      resultValue: m.resultValue?.toString() || '',
      resultUnit: m.resultUnit || '',
      regulatoryLimit: m.regulatoryLimit?.toString() || '',
      regulatoryLimitUnit: m.regulatoryLimitUnit || '',
      complianceResult: m.complianceResult || '',
      methodInstrument: m.methodInstrument || '',
      observations: m.observations || '',
      status: m.status,
    });
    setEditingId(m._id);
    setSelectedMeasurement(null);
  };

  if (measurements.length === 0 && !loading && !error) {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          code="SST-EM-414"
          title="Mediciones ambientales"
          badge="📋 4.1.4"
          subtitle="Evidencia de mediciones ambientales ocupacionales"
          onBack={() => navigate('/documents/do')}
        />
        <AdvancedSection title="Sin registros">
          <p style={{ color: '#64748b', margin: '1rem 0' }}>
            No hay mediciones ambientales registradas. Registre la primera medición para evaluar el cumplimiento del estándar 4.1.4.
          </p>
          {canEdit && (
            <Button onClick={() => resetForm()}>Nueva medición</Button>
          )}
          {renderForm()}
        </AdvancedSection>
      </AdvancedPageLayout>
    );
  }

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        code="SST-EM-414"
        title="Mediciones ambientales"
        badge="📋 4.1.4"
        subtitle="Evidencia de mediciones ambientales ocupacionales"
        onBack={() => navigate('/documents/do')}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Total', value: kpis.total },
          { label: 'Completadas', value: kpis.completed },
          { label: 'Dentro del límite', value: kpis.withinLimits },
          { label: 'Exceden límite', value: kpis.exceedsLimits },
          { label: 'Tipos evaluados', value: `${kpis.typesCount}/8` },
        ]}
      />

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <AdvancedTabsSidebar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <AdvancedTabsContent activeTab={activeTab}>
          {activeTab === 'mediciones' && (
            <AdvancedSection title="Mediciones ambientales">
              {canEdit && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={resetForm}>Nueva medición</Button>
                </div>
              )}

              {error && <p style={{ color: '#dc2626' }}>{error}</p>}
              {loading && <p style={{ color: '#64748b' }}>Cargando...</p>}

              {renderForm()}

              {selectedMeasurement && !editingId && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                  <h4>Detalle</h4>
                  <p><strong>Tipo:</strong> {MEASUREMENT_TYPE_LABELS[selectedMeasurement.measurementType as keyof typeof MEASUREMENT_TYPE_LABELS] ?? selectedMeasurement.measurementType}</p>
                  <p><strong>Descripción:</strong> {selectedMeasurement.description}</p>
                  <p><strong>Área:</strong> {selectedMeasurement.area}</p>
                  <p><strong>Fecha:</strong> {formatDate(selectedMeasurement.measurementDate)}</p>
                  {selectedMeasurement.responsible && <p><strong>Responsable:</strong> {selectedMeasurement.responsible}</p>}
                  {selectedMeasurement.resultValue !== undefined && <p><strong>Resultado:</strong> {selectedMeasurement.resultValue} {selectedMeasurement.resultUnit}</p>}
                  {selectedMeasurement.regulatoryLimit !== undefined && <p><strong>Límite normativo:</strong> {selectedMeasurement.regulatoryLimit} {selectedMeasurement.regulatoryLimitUnit}</p>}
                  {selectedMeasurement.complianceResult && (
                    <p><strong>Comparación:</strong> <span className={`badge ${COMPLIANCE_RESULT_CLASSES[selectedMeasurement.complianceResult as keyof typeof COMPLIANCE_RESULT_CLASSES] ?? ''}`}>{COMPLIANCE_RESULT_LABELS[selectedMeasurement.complianceResult as keyof typeof COMPLIANCE_RESULT_LABELS] ?? selectedMeasurement.complianceResult}</span></p>
                  )}
                  {selectedMeasurement.methodInstrument && <p><strong>Método/Instrumento:</strong> {selectedMeasurement.methodInstrument}</p>}
                  {selectedMeasurement.observations && <p><strong>Observaciones:</strong> {selectedMeasurement.observations}</p>}
                  <p><strong>Estado:</strong> <span className={`badge ${MEASUREMENT_STATUS_CLASSES[selectedMeasurement.status as keyof typeof MEASUREMENT_STATUS_CLASSES] ?? ''}`}>{MEASUREMENT_STATUS_LABELS[selectedMeasurement.status as keyof typeof MEASUREMENT_STATUS_LABELS] ?? selectedMeasurement.status}</span></p>
                  <Button variant="secondary" onClick={() => setSelectedMeasurement(null)}>Cerrar</Button>
                </div>
              )}

              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Área</th>
                    <th>Resultado</th>
                    <th>Comparación</th>
                    <th>Estado</th>
                    {canEdit && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m) => (
                    <tr key={m._id}>
                      <td>{formatDate(m.measurementDate)}</td>
                      <td>{MEASUREMENT_TYPE_LABELS[m.measurementType as keyof typeof MEASUREMENT_TYPE_LABELS] ?? m.measurementType}</td>
                      <td>{m.area}</td>
                      <td>{m.resultValue !== undefined ? `${m.resultValue} ${m.resultUnit ?? ''}` : '—'}</td>
                      <td>
                        {m.complianceResult ? (
                          <span className={`badge ${COMPLIANCE_RESULT_CLASSES[m.complianceResult as keyof typeof COMPLIANCE_RESULT_CLASSES] ?? ''}`}>
                            {COMPLIANCE_RESULT_LABELS[m.complianceResult as keyof typeof COMPLIANCE_RESULT_LABELS] ?? m.complianceResult}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`badge ${MEASUREMENT_STATUS_CLASSES[m.status as keyof typeof MEASUREMENT_STATUS_CLASSES] ?? ''}`}>
                          {MEASUREMENT_STATUS_LABELS[m.status as keyof typeof MEASUREMENT_STATUS_LABELS] ?? m.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td>
                          <Button variant="secondary" onClick={() => setSelectedMeasurement(m)}>Ver</Button>{' '}
                          <Button variant="secondary" onClick={() => handleEdit(m)}>Editar</Button>{' '}
                          <Button variant="danger" onClick={() => handleDelete(m._id)}>Eliminar</Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdvancedSection>
          )}

          {activeTab === 'dashboard' && (
            <AdvancedSection title="Dashboard">
              <div className="advanced-doc-grid">
                <article className="advanced-doc-card">
                  <strong>Total mediciones</strong>
                  <span>{kpis.total}</span>
                </article>
                <article className="advanced-doc-card">
                  <strong>Completadas</strong>
                  <span>{kpis.completed}</span>
                </article>
                <article className="advanced-doc-card">
                  <strong>Dentro del límite</strong>
                  <span>{kpis.withinLimits}</span>
                </article>
                <article className="advanced-doc-card">
                  <strong>Exceden límite</strong>
                  <span>{kpis.exceedsLimits}</span>
                </article>
                <article className="advanced-doc-card">
                  <strong>Tipos evaluados</strong>
                  <span>{kpis.typesCount}/8</span>
                </article>
              </div>
            </AdvancedSection>
          )}

          {activeTab === 'intelligence' && (
            <AdvancedSection title="Intelligence — 4.1.4">
              {intelligenceLoading && <p style={{ color: '#64748b' }}>Cargando análisis...</p>}
              {intelligenceError && <p style={{ color: '#dc2626' }}>{intelligenceError}</p>}
              {intelligence && (
                <div>
                  <p><strong>Resumen:</strong> {intelligence.summary}</p>
                  {intelligence.keyIssues && intelligence.keyIssues.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <strong>Problemas principales:</strong>
                      <ul>
                        {intelligence.keyIssues.map((issue, i) => (
                          <li key={i}><strong>[{issue.priority}]</strong> {issue.title} — {issue.recommendation}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {intelligence.quickWins && intelligence.quickWins.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <strong>Quick wins:</strong>
                      <ul>
                        {intelligence.quickWins.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {intelligence.nextSteps && intelligence.nextSteps.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <strong>Próximos pasos:</strong>
                      <ul>
                        {intelligence.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {!intelligenceLoading && !intelligenceError && !intelligence && (
                <p style={{ color: '#64748b' }}>No hay datos de análisis disponibles</p>
              )}
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>
    </AdvancedPageLayout>
  );

  function renderForm() {
    if (!canEdit) return null;
    return (
      <form onSubmit={handleSubmit} style={{ marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
        <h4>{editingId ? 'Editar medición' : 'Nueva medición'}</h4>
        <div className="form-grid">
          <Select label="Tipo de medición" value={form.measurementType} onChange={(e) => setForm({ ...form, measurementType: e.target.value })} required>
            {Object.entries(MEASUREMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          <Input label="Área / Ubicación" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} required />
          <Input label="Fecha" type="date" value={form.measurementDate} onChange={(e) => setForm({ ...form, measurementDate: e.target.value })} required />
          <Input label="Responsable" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          <Input label="Resultado" type="number" value={form.resultValue} onChange={(e) => setForm({ ...form, resultValue: e.target.value })} />
          <Input label="Unidad" value={form.resultUnit} onChange={(e) => setForm({ ...form, resultUnit: e.target.value })} placeholder="dB, lux, °C, mg/m³" />
          <Input label="Límite normativo" type="number" value={form.regulatoryLimit} onChange={(e) => setForm({ ...form, regulatoryLimit: e.target.value })} />
          <Input label="Unidad del límite" value={form.regulatoryLimitUnit} onChange={(e) => setForm({ ...form, regulatoryLimitUnit: e.target.value })} />
          <Select label="Comparación normativa" value={form.complianceResult} onChange={(e) => setForm({ ...form, complianceResult: e.target.value })}>
            <option value="">Sin definir</option>
            {Object.entries(COMPLIANCE_RESULT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input label="Método / Instrumento" value={form.methodInstrument} onChange={(e) => setForm({ ...form, methodInstrument: e.target.value })} />
          <Select label="Estado" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {Object.entries(MEASUREMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Observaciones</label>
          <textarea
            value={form.observations}
            onChange={(e) => setForm({ ...form, observations: e.target.value })}
            rows={3}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          />
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <Button type="submit">{editingId ? 'Actualizar' : 'Crear'}</Button>
          {editingId && <Button variant="secondary" onClick={resetForm}>Cancelar</Button>}
        </div>
      </form>
    );
  }
}
