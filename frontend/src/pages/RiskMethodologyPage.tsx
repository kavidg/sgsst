import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
  type HeaderAction,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
} from '../components/advanced-layout';

/**
 * FASE 10C — BLOQUE 4
 * Página de gestión avanzada del estándar 4.1.1
 * "Metodología para la identificación de peligros,
 *  evaluación y valoración de los riesgos"
 */

interface RiskMethodologyPageProps {
  token: string;
  role?: string;
}

interface Methodology {
  _id: string;
  companyId: string;
  name: string;
  version: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  effectiveFrom?: string;
  reviewDate?: string;
  reviewFrequencyMonths?: number;
  responsible?: string;
  identificationCriteria?: string;
  evaluationCriteria?: string;
  valuationCriteria?: string;
  probabilityScale?: string;
  consequenceScale?: string;
  riskLevelRules?: string;
  createdAt: string;
  updatedAt: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'metodologias', label: 'Metodologías', icon: '📋' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activa',
  ARCHIVED: 'Archivada',
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'badge--warning',
  ACTIVE: 'badge--success',
  ARCHIVED: 'badge--muted',
};

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

export function RiskMethodologyPage({ token, role }: RiskMethodologyPageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [methodologies, setMethodologies] = useState<Methodology[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('metodologias');
  const [selectedMethodology, setSelectedMethodology] = useState<Methodology | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<StandardAnalysisResponse | null>(null);
  const [intelligenceError, setIntelligenceError] = useState('');

  // Form state
  const [form, setForm] = useState({
    name: '',
    version: '1.0',
    description: '',
    status: 'DRAFT' as 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
    effectiveFrom: '',
    reviewDate: '',
    reviewFrequencyMonths: 12,
    responsible: '',
    identificationCriteria: '',
    evaluationCriteria: '',
    valuationCriteria: '',
    probabilityScale: '',
    consequenceScale: '',
    riskLevelRules: '',
  });

  // ── Data loading ──
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/risks/methodologies', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Error loading methodologies');
      const data = await response.json();
      setMethodologies(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar las metodologías.');
    } finally {
      setLoading(false);
    }
  };

  const loadIntelligence = async () => {
    setIntelligenceLoading(true);
    setIntelligenceError('');
    try {
      const data = await fetchStandardAnalysis(token, '4.1.1');
      setIntelligence(data);
    } catch (requestError) {
      setIntelligenceError(requestError instanceof Error ? requestError.message : 'No fue posible cargar el análisis.');
    } finally {
      setIntelligenceLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [companyId, token]);

  useEffect(() => {
    if (activeTab === 'intelligence') {
      void loadIntelligence();
    }
  }, [activeTab]);

  // ── Computed metrics ──
  const metrics = {
    total: methodologies.length,
    active: methodologies.filter((m) => m.status === 'ACTIVE').length,
    draft: methodologies.filter((m) => m.status === 'DRAFT').length,
    archived: methodologies.filter((m) => m.status === 'ARCHIVED').length,
    withReviewDate: methodologies.filter((m) => m.reviewDate).length,
    withCriteria: methodologies.filter((m) =>
      m.identificationCriteria && m.evaluationCriteria && m.valuationCriteria
    ).length,
  };

  // ── CRUD handlers ──
  const resetForm = () => {
    setForm({
      name: '',
      version: '1.0',
      description: '',
      status: 'DRAFT',
      effectiveFrom: '',
      reviewDate: '',
      reviewFrequencyMonths: 12,
      responsible: '',
      identificationCriteria: '',
      evaluationCriteria: '',
      valuationCriteria: '',
      probabilityScale: '',
      consequenceScale: '',
      riskLevelRules: '',
    });
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const url = editingId
        ? `/api/risks/methodologies/${editingId}`
        : '/api/risks/methodologies';
      const method = editingId ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Error guardando metodología');
      }

      resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar la metodología.');
      setLoading(false);
    }
  };

  const handleEdit = (methodology: Methodology) => {
    setEditingId(methodology._id);
    setForm({
      name: methodology.name,
      version: methodology.version,
      description: methodology.description ?? '',
      status: methodology.status,
      effectiveFrom: methodology.effectiveFrom?.slice(0, 10) ?? '',
      reviewDate: methodology.reviewDate?.slice(0, 10) ?? '',
      reviewFrequencyMonths: methodology.reviewFrequencyMonths ?? 12,
      responsible: methodology.responsible ?? '',
      identificationCriteria: methodology.identificationCriteria ?? '',
      evaluationCriteria: methodology.evaluationCriteria ?? '',
      valuationCriteria: methodology.valuationCriteria ?? '',
      probabilityScale: methodology.probabilityScale ?? '',
      consequenceScale: methodology.consequenceScale ?? '',
      riskLevelRules: methodology.riskLevelRules ?? '',
    });
    setActiveTab('metodologias');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta metodología?')) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/risks/methodologies/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Error eliminando metodología');
      if (editingId === id) resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar la metodología.');
      setLoading(false);
    }
  };

  // ── Header actions ──
  const headerActions: HeaderAction[] = [
    { label: '← Volver al PHVA', onClick: () => navigate('/documents/do'), variant: 'secondary' },
    { label: loading ? 'Cargando...' : '🔄 Recargar', onClick: () => void loadData(), variant: 'secondary', disabled: loading },
  ];

  // ── NO_DATA state ──
  if (!loading && methodologies.length === 0) {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/do"
          backLabel="← Volver al PHVA"
          moduleCode="SST-RSK-411"
          moduleTitle="Metodología identificación de peligros"
          description="Metodología documentada para la identificación, evaluación y valoración de riesgos — Estándar 4.1.1"
          statusBadge={<span className="badge badge--info">📋 4.1.1</span>}
          actions={headerActions}
        />
        <AdvancedSection title="Estado vacío" description="No hay metodologías registradas" accent="info">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1rem' }}>
              No hay metodologías de identificación de peligros registradas.
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              La metodología documentada es requerida por el estándar 4.1.1.
            </p>
            <Button onClick={() => setActiveTab('metodologias')}>
              + Crear metodología
            </Button>
          </div>
        </AdvancedSection>
      </AdvancedPageLayout>
    );
  }

  return (
    <AdvancedPageLayout>
      {error ? <p className="error">{error}</p> : null}

      <AdvancedHeader
        backPath="/documents/do"
        backLabel="← Volver al PHVA"
        moduleCode="SST-RSK-411"
        moduleTitle="Metodología identificación de peligros"
        description="Metodología documentada para la identificación, evaluación y valoración de riesgos — Estándar 4.1.1"
        statusBadge={<span className="badge badge--info">📋 4.1.1</span>}
        actions={headerActions}
      />

      {/* KPIs */}
      <AdvancedKpiGrid
        items={[
          { label: 'Total metodologías', value: metrics.total, variant: 'info' },
          { label: 'Activas', value: metrics.active, variant: metrics.active > 0 ? 'success' : 'warning' },
          { label: 'Borradores', value: metrics.draft, variant: 'info' },
          { label: 'Archivadas', value: metrics.archived, variant: 'muted' },
          { label: 'Con revisión', value: metrics.withReviewDate, variant: 'info' },
          { label: 'Con criterios completos', value: metrics.withCriteria, variant: metrics.withCriteria > 0 ? 'success' : 'warning' },
        ]}
        columns={3}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: METODOLOGÍAS ===================== */}
          {activeTab === 'metodologias' && (
            <>
              {/* Form */}
              <AdvancedSection
                title={editingId ? 'Editar metodología' : 'Crear metodología'}
                description="Complete los campos para registrar la metodología de identificación de peligros"
                accent="info"
              >
                <form onSubmit={handleSubmit} className="form-grid">
                  <div className="grid grid-2">
                    <label className="field"><span className="label">Nombre *</span>
                      <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required placeholder="Ej: GTC 45" />
                    </label>
                    <label className="field"><span className="label">Versión *</span>
                      <Input value={form.version} onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))} required />
                    </label>
                    <label className="field"><span className="label">Estado</span>
                      <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as any }))}>
                        <option value="DRAFT">Borrador</option>
                        <option value="ACTIVE">Activa</option>
                        <option value="ARCHIVED">Archivada</option>
                      </Select>
                    </label>
                    <label className="field"><span className="label">Responsable</span>
                      <Input value={form.responsible} onChange={(event) => setForm((prev) => ({ ...prev, responsible: event.target.value }))} />
                    </label>
                    <label className="field"><span className="label">Fecha de vigencia</span>
                      <Input type="date" value={form.effectiveFrom} onChange={(event) => setForm((prev) => ({ ...prev, effectiveFrom: event.target.value }))} />
                    </label>
                    <label className="field"><span className="label">Fecha de revisión</span>
                      <Input type="date" value={form.reviewDate} onChange={(event) => setForm((prev) => ({ ...prev, reviewDate: event.target.value }))} />
                    </label>
                    <label className="field"><span className="label">Frecuencia de revisión (meses)</span>
                      <Input type="number" min={1} value={form.reviewFrequencyMonths} onChange={(event) => setForm((prev) => ({ ...prev, reviewFrequencyMonths: Number(event.target.value) || 12 }))} />
                    </label>
                  </div>
                  <label className="field"><span className="label">Descripción</span>
                    <textarea className="input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={2} />
                  </label>

                  {/* Criterios */}
                  <AdvancedSection title="Criterios metodológicos" description="Defina los criterios de identificación, evaluación y valoración" accent="info">
                    <label className="field"><span className="label">Criterios de identificación</span>
                      <textarea className="input" value={form.identificationCriteria} onChange={(event) => setForm((prev) => ({ ...prev, identificationCriteria: event.target.value }))} rows={3} placeholder="Describa cómo se identifican los peligros" />
                    </label>
                    <label className="field"><span className="label">Criterios de evaluación</span>
                      <textarea className="input" value={form.evaluationCriteria} onChange={(event) => setForm((prev) => ({ ...prev, evaluationCriteria: event.target.value }))} rows={3} placeholder="Describa cómo se evalúan los riesgos" />
                    </label>
                    <label className="field"><span className="label">Criterios de valoración</span>
                      <textarea className="input" value={form.valuationCriteria} onChange={(event) => setForm((prev) => ({ ...prev, valuationCriteria: event.target.value }))} rows={3} placeholder="Describa cómo se valoran los riesgos" />
                    </label>
                  </AdvancedSection>

                  {/* Escalas */}
                  <AdvancedSection title="Escalas y reglas" description="Defina las escalas de probabilidad, consecuencia y reglas de nivel" accent="info">
                    <div className="grid grid-3">
                      <label className="field"><span className="label">Escala de probabilidad</span>
                        <Input value={form.probabilityScale} onChange={(event) => setForm((prev) => ({ ...prev, probabilityScale: event.target.value }))} placeholder="Ej: 1-5" />
                      </label>
                      <label className="field"><span className="label">Escala de consecuencia</span>
                        <Input value={form.consequenceScale} onChange={(event) => setForm((prev) => ({ ...prev, consequenceScale: event.target.value }))} placeholder="Ej: 1-5" />
                      </label>
                      <label className="field"><span className="label">Reglas de nivel de riesgo</span>
                        <Input value={form.riskLevelRules} onChange={(event) => setForm((prev) => ({ ...prev, riskLevelRules: event.target.value }))} placeholder="Ej: P × C" />
                      </label>
                    </div>
                  </AdvancedSection>

                  <div className="actions">
                    <Button type="submit" disabled={loading}>
                      {editingId ? 'Guardar cambios' : 'Crear metodología'}
                    </Button>
                    {editingId ? (
                      <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button>
                    ) : null}
                  </div>
                </form>
              </AdvancedSection>

              {/* Listado */}
              <AdvancedSection
                title="Metodologías registradas"
                description={`Total: ${methodologies.length} metodología(s)`}
                accent="default"
              >
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Versión</th>
                        <th>Estado</th>
                        <th>Responsable</th>
                        <th>Vigencia</th>
                        <th>Revisión</th>
                        <th>Criterios</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {methodologies.map((m) => (
                        <tr key={m._id}>
                          <td>{m.name}</td>
                          <td>{m.version}</td>
                          <td>
                            <span className={`badge ${STATUS_CLASSES[m.status] ?? 'badge--info'}`}>
                              {STATUS_LABELS[m.status] ?? m.status}
                            </span>
                          </td>
                          <td>{m.responsible || '—'}</td>
                          <td>{formatDate(m.effectiveFrom)}</td>
                          <td>{formatDate(m.reviewDate)}</td>
                          <td>
                            {m.identificationCriteria && m.evaluationCriteria && m.valuationCriteria
                              ? '✅ Completa'
                              : '⚠️ Incompleta'}
                          </td>
                          <td>
                            <div className="actions">
                              <Button type="button" variant="secondary" onClick={() => setSelectedMethodology(m)}>Ver</Button>
                              <Button type="button" variant="secondary" onClick={() => handleEdit(m)}>Editar</Button>
                              {role === 'owner' && (
                                <Button type="button" variant="danger" onClick={() => handleDelete(m._id)}>Eliminar</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!methodologies.length ? (
                        <tr><td colSpan={8}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay metodologías registradas.</p></td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdvancedSection>
            </>
          )}

          {/* ===================== TAB: DASHBOARD ===================== */}
          {activeTab === 'dashboard' && (
            <AdvancedSection title="Dashboard de metodología" description="Métricas agregadas del estándar 4.1.1" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Metodologías activas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.active > 0 ? '#10b981' : '#f59e0b' }}>
                    {metrics.active}
                  </p>
                  <p className="muted">de {metrics.total} metodologías registradas</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Criterios completos</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.withCriteria > 0 ? '#10b981' : '#f59e0b' }}>
                    {metrics.withCriteria}
                  </p>
                  <p className="muted">metodologías con criterios definidos</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Con fecha de revisión</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#3b82f6' }}>
                    {metrics.withReviewDate}
                  </p>
                  <p className="muted">metodologías con revisión programada</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Borradores</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#f59e0b' }}>
                    {metrics.draft}
                  </p>
                  <p className="muted">metodologías en borrador</p>
                </div>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: INTELLIGENCE ===================== */}
          {activeTab === 'intelligence' && (
            <AdvancedSection title="Intelligence — 4.1.1" description="Análisis inteligente de metodología de identificación de peligros" accent="info">
              {intelligenceLoading && <p className="muted">Cargando análisis...</p>}
              {intelligenceError && <p className="muted">{intelligenceError}</p>}

              {!intelligenceLoading && !intelligence && !intelligenceError && (
                <p className="muted">No hay datos de análisis disponibles.</p>
              )}

              {intelligence && (
                <>
                  {/* Compliance */}
                  <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                    <h4 className="card-title">Nivel de cumplimiento</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                      <span className={`badge ${intelligence.compliancePercentage >= 90 ? 'badge--success' : intelligence.compliancePercentage >= 50 ? 'badge--warning' : 'badge--danger'}`}>
                        {intelligence.complianceStatus}
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{intelligence.compliancePercentage}%</span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                    <h4 className="card-title">Resumen</h4>
                    <p>{intelligence.analysis.summary}</p>
                  </div>

                  {/* Key Issues */}
                  {intelligence.analysis.keyIssues.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">Problemas clave</h4>
                      {intelligence.analysis.keyIssues.map((issue, i) => (
                        <div key={i} style={{ padding: '0.5rem 0', borderBottom: i < intelligence.analysis.keyIssues.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`badge ${issue.priority === 'HIGH' ? 'badge--danger' : issue.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {issue.priority}
                            </span>
                            <strong>{issue.title}</strong>
                          </div>
                          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>{issue.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Wins */}
                  {intelligence.analysis.quickWins.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">⚡ Quick Wins</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {intelligence.analysis.quickWins.map((win, i) => <li key={i}>{win}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Next Steps */}
                  {intelligence.analysis.nextSteps.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">📌 Próximos pasos</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {intelligence.analysis.nextSteps.map((step, i) => <li key={i}>{step}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="card" style={{ padding: '1rem' }}>
                    <h4 className="card-title">Métricas</h4>
                    <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                      {Object.entries(intelligence.metrics).map(([key, value]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                          <span style={{ color: '#64748b' }}>{key}</span>
                          <strong>{String(value)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* Detail Modal */}
      {selectedMethodology && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedMethodology(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Detalle de metodología</h3>
            <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div><strong>Nombre:</strong> {selectedMethodology.name}</div>
              <div><strong>Versión:</strong> {selectedMethodology.version}</div>
              <div><strong>Estado:</strong> <span className={`badge ${STATUS_CLASSES[selectedMethodology.status]}`}>{STATUS_LABELS[selectedMethodology.status]}</span></div>
              <div><strong>Responsable:</strong> {selectedMethodology.responsible || '—'}</div>
              <div><strong>Vigencia:</strong> {formatDate(selectedMethodology.effectiveFrom)}</div>
              <div><strong>Revisión:</strong> {formatDate(selectedMethodology.reviewDate)}</div>
              <div><strong>Frecuencia:</strong> {selectedMethodology.reviewFrequencyMonths ? `${selectedMethodology.reviewFrequencyMonths} meses` : '—'}</div>
            </div>

            {selectedMethodology.description && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Descripción:</strong>
                <p>{selectedMethodology.description}</p>
              </div>
            )}

            {selectedMethodology.identificationCriteria && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Criterios de identificación:</strong>
                <p>{selectedMethodology.identificationCriteria}</p>
              </div>
            )}

            {selectedMethodology.evaluationCriteria && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Criterios de evaluación:</strong>
                <p>{selectedMethodology.evaluationCriteria}</p>
              </div>
            )}

            {selectedMethodology.valuationCriteria && (
              <div style={{ marginBottom: '1rem' }}>
                <strong>Criterios de valoración:</strong>
                <p>{selectedMethodology.valuationCriteria}</p>
              </div>
            )}

            <div className="grid grid-3" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div><strong>Escala probabilidad:</strong> {selectedMethodology.probabilityScale || '—'}</div>
              <div><strong>Escala consecuencia:</strong> {selectedMethodology.consequenceScale || '—'}</div>
              <div><strong>Reglas nivel:</strong> {selectedMethodology.riskLevelRules || '—'}</div>
            </div>

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setSelectedMethodology(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </AdvancedPageLayout>
  );
}
