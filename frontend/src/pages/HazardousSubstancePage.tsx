import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HazardousSubstanceModel,
  CreateHazardousSubstancePayload,
  UpdateHazardousSubstancePayload,
  createHazardousSubstance,
  deleteHazardousSubstance,
  fetchHazardousSubstances,
  updateHazardousSubstance,
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
import {
  SUBSTANCE_TYPE_LABELS,
  SDS_STATUS_LABELS,
  SDS_STATUS_CLASSES,
  STATUS_LABELS,
  STATUS_CLASSES,
} from '../types/hazardousSubstance';

/**
 * FASE 11 — BLOQUE 12
 * Página de gestión avanzada del estándar 4.1.3
 * "Sustancias peligrosas"
 */

interface HazardousSubstancePageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'inventario', label: 'Inventario', icon: '🧪' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

export function HazardousSubstancePage({ token, role }: HazardousSubstancePageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [substances, setSubstances] = useState<HazardousSubstanceModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('inventario');
  const [selectedSubstance, setSelectedSubstance] = useState<HazardousSubstanceModel | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<StandardAnalysisResponse | null>(null);
  const [intelligenceError, setIntelligenceError] = useState('');

  // Form state
  const [form, setForm] = useState({
    name: '',
    casNumber: '',
    hazardClassification: '',
    substanceType: 'CHEMICAL',
    supplier: '',
    storageLocation: '',
    sdsStatus: 'NOT_AVAILABLE',
    sdsUrl: '',
    sdsIssueDate: '',
    sdsReviewDate: '',
    controlsImplemented: '',
    riskId: '',
    notes: '',
    status: 'ACTIVE',
  });

  // ── Data loading ──
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchHazardousSubstances(token);
      setSubstances(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar las sustancias.');
    } finally {
      setLoading(false);
    }
  };

  const loadIntelligence = async () => {
    setIntelligenceLoading(true);
    setIntelligenceError('');
    try {
      const data = await fetchStandardAnalysis(token, '4.1.3');
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
  const metrics = useMemo(() => {
    const total = substances.length;
    const active = substances.filter((s) => s.status === 'ACTIVE').length;
    const inactive = substances.filter((s) => s.status === 'INACTIVE').length;
    const withCurrentSds = substances.filter((s) => s.status === 'ACTIVE' && s.sdsStatus === 'CURRENT').length;
    const withExpiredSds = substances.filter((s) => s.status === 'ACTIVE' && s.sdsStatus === 'EXPIRED').length;
    const withPendingSds = substances.filter((s) => s.status === 'ACTIVE' && s.sdsStatus === 'PENDING').length;
    const withNoSds = substances.filter((s) => s.status === 'ACTIVE' && s.sdsStatus === 'NOT_AVAILABLE').length;
    const withControls = substances.filter((s) => s.status === 'ACTIVE' && s.controlsImplemented && s.controlsImplemented.trim().length > 0).length;
    const withoutControls = substances.filter((s) => s.status === 'ACTIVE' && (!s.controlsImplemented || s.controlsImplemented.trim().length === 0)).length;

    const sdsCoverage = active > 0 ? Math.round((withCurrentSds / active) * 100) : 0;
    const controlsCoverage = active > 0 ? Math.round((withControls / active) * 100) : 0;

    return {
      total,
      active,
      inactive,
      withCurrentSds,
      withExpiredSds,
      withPendingSds,
      withNoSds,
      withControls,
      withoutControls,
      sdsCoverage,
      controlsCoverage,
    };
  }, [substances]);

  // ── CRUD handlers ──
  const resetForm = () => {
    setForm({
      name: '',
      casNumber: '',
      hazardClassification: '',
      substanceType: 'CHEMICAL',
      supplier: '',
      storageLocation: '',
      sdsStatus: 'NOT_AVAILABLE',
      sdsUrl: '',
      sdsIssueDate: '',
      sdsReviewDate: '',
      controlsImplemented: '',
      riskId: '',
      notes: '',
      status: 'ACTIVE',
    });
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload: CreateHazardousSubstancePayload = {
        name: form.name,
        casNumber: form.casNumber || undefined,
        hazardClassification: form.hazardClassification || undefined,
        substanceType: form.substanceType as any,
        supplier: form.supplier || undefined,
        storageLocation: form.storageLocation || undefined,
        sdsStatus: form.sdsStatus as any,
        sdsUrl: form.sdsUrl || undefined,
        sdsIssueDate: form.sdsIssueDate || undefined,
        sdsReviewDate: form.sdsReviewDate || undefined,
        controlsImplemented: form.controlsImplemented || undefined,
        riskId: form.riskId || undefined,
        notes: form.notes || undefined,
        status: form.status as any,
      };

      if (editingId) {
        await updateHazardousSubstance(token, editingId, payload as UpdateHazardousSubstancePayload);
      } else {
        await createHazardousSubstance(token, payload);
      }

      resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar la sustancia.');
      setLoading(false);
    }
  };

  const handleEdit = (substance: HazardousSubstanceModel) => {
    setEditingId(substance._id);
    setForm({
      name: substance.name,
      casNumber: substance.casNumber ?? '',
      hazardClassification: substance.hazardClassification ?? '',
      substanceType: substance.substanceType,
      supplier: substance.supplier ?? '',
      storageLocation: substance.storageLocation ?? '',
      sdsStatus: substance.sdsStatus,
      sdsUrl: substance.sdsUrl ?? '',
      sdsIssueDate: substance.sdsIssueDate?.slice(0, 10) ?? '',
      sdsReviewDate: substance.sdsReviewDate?.slice(0, 10) ?? '',
      controlsImplemented: substance.controlsImplemented ?? '',
      riskId: substance.riskId ?? '',
      notes: substance.notes ?? '',
      status: substance.status,
    });
    setActiveTab('inventario');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar registro?\n\nEsta acción eliminará la sustancia del inventario.')) return;
    setLoading(true);
    setError('');
    try {
      await deleteHazardousSubstance(token, id);
      if (editingId === id) resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar la sustancia.');
      setLoading(false);
    }
  };

  // ── Header actions ──
  const headerActions: HeaderAction[] = [
    { label: '← Volver al PHVA', onClick: () => navigate('/documents/do'), variant: 'secondary' },
    { label: loading ? 'Cargando...' : '🔄 Recargar', onClick: () => void loadData(), variant: 'secondary', disabled: loading },
  ];

  // ── NO_DATA state ──
  if (!loading && substances.length === 0) {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/do"
          backLabel="← Volver al PHVA"
          moduleCode="SST-HS-413"
          moduleTitle="Sustancias peligrosas"
          description="Inventario de sustancias químicas peligrosas, SDS y controles — Estándar 4.1.3"
          statusBadge={<span className="badge badge--info">📋 4.1.3</span>}
          actions={headerActions}
        />
        <AdvancedSection title="Estado vacío" description="No hay sustancias registradas" accent="info">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1rem' }}>
              No hay sustancias peligrosas registradas en el inventario.
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Registra la primera sustancia peligrosa conforme al estándar 4.1.3.
            </p>
            <Button onClick={() => setActiveTab('inventario')}>
              + Nueva sustancia
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
        moduleCode="SST-HS-413"
        moduleTitle="Sustancias peligrosas"
        description="Inventario de sustancias químicas peligrosas, SDS y controles — Estándar 4.1.3"
        statusBadge={<span className="badge badge--info">📋 4.1.3</span>}
        actions={headerActions}
      />

      {/* KPIs */}
      <AdvancedKpiGrid
        items={[
          { label: 'Total', value: metrics.total, variant: 'info' },
          { label: 'Activas', value: metrics.active, variant: metrics.active > 0 ? 'success' : 'warning' },
          { label: 'SDS vigentes', value: metrics.withCurrentSds, variant: metrics.withCurrentSds > 0 ? 'success' : 'warning' },
          { label: 'SDS vencidas', value: metrics.withExpiredSds, variant: metrics.withExpiredSds > 0 ? 'danger' : 'info' },
          { label: 'Con controles', value: metrics.withControls, variant: metrics.withControls > 0 ? 'success' : 'warning' },
          { label: 'Cobertura SDS', value: `${metrics.sdsCoverage}%`, variant: metrics.sdsCoverage >= 90 ? 'success' : 'warning' },
        ]}
        columns={3}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: INVENTARIO ===================== */}
          {activeTab === 'inventario' && (
            <>
              {/* Form */}
              <AdvancedSection
                title={editingId ? 'Editar sustancia' : 'Nueva sustancia'}
                description="Complete los campos para registrar una sustancia peligrosa"
                accent="info"
              >
                <form onSubmit={handleSubmit} className="form-grid">
                  <div className="grid grid-2">
                    <label className="field"><span className="label">Nombre *</span>
                      <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required placeholder="Nombre comercial o químico" />
                    </label>
                    <label className="field"><span className="label">Número CAS</span>
                      <Input value={form.casNumber} onChange={(event) => setForm((prev) => ({ ...prev, casNumber: event.target.value }))} placeholder="Ej: 67-64-1" />
                    </label>
                    <label className="field"><span className="label">Tipo de sustancia *</span>
                      <Select value={form.substanceType} onChange={(event) => setForm((prev) => ({ ...prev, substanceType: event.target.value }))} required>
                        {Object.entries(SUBSTANCE_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="field"><span className="label">Clasificación de peligro</span>
                      <Input value={form.hazardClassification} onChange={(event) => setForm((prev) => ({ ...prev, hazardClassification: event.target.value }))} placeholder="GHS, NFPA u otra" />
                    </label>
                    <label className="field"><span className="label">Proveedor</span>
                      <Input value={form.supplier} onChange={(event) => setForm((prev) => ({ ...prev, supplier: event.target.value }))} placeholder="Proveedor o fabricante" />
                    </label>
                    <label className="field"><span className="label">Ubicación de almacenamiento</span>
                      <Input value={form.storageLocation} onChange={(event) => setForm((prev) => ({ ...prev, storageLocation: event.target.value }))} placeholder="Almacén, área, estante" />
                    </label>
                    <label className="field"><span className="label">Estado SDS *</span>
                      <Select value={form.sdsStatus} onChange={(event) => setForm((prev) => ({ ...prev, sdsStatus: event.target.value }))} required>
                        {Object.entries(SDS_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="field"><span className="label">URL/referencia SDS</span>
                      <Input value={form.sdsUrl} onChange={(event) => setForm((prev) => ({ ...prev, sdsUrl: event.target.value }))} placeholder="URL del documento SDS" />
                    </label>
                    <label className="field"><span className="label">Fecha emisión SDS</span>
                      <Input type="date" value={form.sdsIssueDate} onChange={(event) => setForm((prev) => ({ ...prev, sdsIssueDate: event.target.value }))} />
                    </label>
                    <label className="field"><span className="label">Fecha revisión SDS</span>
                      <Input type="date" value={form.sdsReviewDate} onChange={(event) => setForm((prev) => ({ ...prev, sdsReviewDate: event.target.value }))} />
                    </label>
                    <label className="field"><span className="label">Estado *</span>
                      <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))} required>
                        <option value="ACTIVE">Activo</option>
                        <option value="INACTIVE">Inactivo</option>
                      </Select>
                    </label>
                    <label className="field"><span className="label">Riesgo asociado</span>
                      <Input value={form.riskId} onChange={(event) => setForm((prev) => ({ ...prev, riskId: event.target.value }))} placeholder="ID del riesgo (opcional)" />
                    </label>
                  </div>
                  <label className="field"><span className="label">Controles implementados</span>
                    <textarea className="input" value={form.controlsImplemented} onChange={(event) => setForm((prev) => ({ ...prev, controlsImplemented: event.target.value }))} rows={3} placeholder="Controles para manipulación, almacenamiento y disposición" />
                  </label>
                  <label className="field"><span className="label">Notas</span>
                    <textarea className="input" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={2} placeholder="Notas adicionales (opcional)" />
                  </label>

                  <div className="actions">
                    <Button type="submit" disabled={loading}>
                      {editingId ? 'Guardar cambios' : 'Nueva sustancia'}
                    </Button>
                    {editingId ? (
                      <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button>
                    ) : null}
                  </div>
                </form>
              </AdvancedSection>

              {/* Listado */}
              <AdvancedSection
                title="Inventario de sustancias"
                description={`Total: ${substances.length} registro(s)`}
                accent="default"
              >
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>CAS</th>
                        <th>Tipo</th>
                        <th>Proveedor</th>
                        <th>SDS</th>
                        <th>Controles</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {substances.map((s) => (
                        <tr key={s._id}>
                          <td><strong>{s.name}</strong></td>
                          <td>{s.casNumber || '—'}</td>
                          <td>{SUBSTANCE_TYPE_LABELS[s.substanceType as keyof typeof SUBSTANCE_TYPE_LABELS] ?? s.substanceType}</td>
                          <td>{s.supplier || '—'}</td>
                          <td>
                            <span className={`badge ${SDS_STATUS_CLASSES[s.sdsStatus as keyof typeof SDS_STATUS_CLASSES] ?? 'badge--info'}`}>
                              {SDS_STATUS_LABELS[s.sdsStatus as keyof typeof SDS_STATUS_LABELS] ?? s.sdsStatus}
                            </span>
                          </td>
                          <td>
                            {s.controlsImplemented && s.controlsImplemented.trim().length > 0
                              ? <span className="badge badge--success">Documentado</span>
                              : <span className="badge badge--muted">Sin documentar</span>
                            }
                          </td>
                          <td>
                            <span className={`badge ${STATUS_CLASSES[s.status as keyof typeof STATUS_CLASSES] ?? 'badge--info'}`}>
                              {STATUS_LABELS[s.status as keyof typeof STATUS_LABELS] ?? s.status}
                            </span>
                          </td>
                          <td>
                            <div className="actions">
                              <Button type="button" variant="secondary" onClick={() => setSelectedSubstance(s)}>Ver</Button>
                              <Button type="button" variant="secondary" onClick={() => handleEdit(s)}>Editar</Button>
                              {(role === 'owner' || role === 'admin') && (
                                <Button type="button" variant="danger" onClick={() => handleDelete(s._id)}>Eliminar</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!substances.length ? (
                        <tr><td colSpan={8}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay sustancias registradas.</p></td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdvancedSection>
            </>
          )}

          {/* ===================== TAB: DASHBOARD ===================== */}
          {activeTab === 'dashboard' && (
            <AdvancedSection title="Dashboard de sustancias peligrosas" description="Métricas agregadas del estándar 4.1.3" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Sustancias activas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.active > 0 ? '#10b981' : '#f59e0b' }}>
                    {metrics.active}
                  </p>
                  <p className="muted">de {metrics.total} registros totales</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Cobertura SDS</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.sdsCoverage >= 90 ? '#10b981' : '#f59e0b' }}>
                    {metrics.sdsCoverage}%
                  </p>
                  <p className="muted">{metrics.withCurrentSds} de {metrics.active} con SDS vigente</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">Cobertura controles</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.controlsCoverage >= 90 ? '#10b981' : '#f59e0b' }}>
                    {metrics.controlsCoverage}%
                  </p>
                  <p className="muted">{metrics.withControls} de {metrics.active} con controles documentados</p>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 className="card-title">SDS vencidas</h4>
                  <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: metrics.withExpiredSds > 0 ? '#ef4444' : '#10b981' }}>
                    {metrics.withExpiredSds}
                  </p>
                  <p className="muted">requieren actualización</p>
                </div>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: INTELLIGENCE ===================== */}
          {activeTab === 'intelligence' && (
            <AdvancedSection title="Intelligence — 4.1.3" description="Análisis inteligente de sustancias peligrosas" accent="info">
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
      {selectedSubstance && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedSubstance(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Detalle de sustancia</h3>

            <AdvancedSection title="Información general" accent="info">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div><strong>Nombre:</strong> {selectedSubstance.name}</div>
                <div><strong>CAS:</strong> {selectedSubstance.casNumber || '—'}</div>
                <div><strong>Tipo:</strong> {SUBSTANCE_TYPE_LABELS[selectedSubstance.substanceType as keyof typeof SUBSTANCE_TYPE_LABELS] ?? selectedSubstance.substanceType}</div>
                <div><strong>Clasificación:</strong> {selectedSubstance.hazardClassification || '—'}</div>
                <div><strong>Proveedor:</strong> {selectedSubstance.supplier || '—'}</div>
                <div><strong>Ubicación:</strong> {selectedSubstance.storageLocation || '—'}</div>
                <div><strong>Estado:</strong> <span className={`badge ${STATUS_CLASSES[selectedSubstance.status as keyof typeof STATUS_CLASSES] ?? 'badge--info'}`}>{STATUS_LABELS[selectedSubstance.status as keyof typeof STATUS_LABELS] ?? selectedSubstance.status}</span></div>
              </div>
            </AdvancedSection>

            <AdvancedSection title="SDS / Hoja de Datos de Seguridad" accent="default">
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div><strong>Estado SDS:</strong> <span className={`badge ${SDS_STATUS_CLASSES[selectedSubstance.sdsStatus as keyof typeof SDS_STATUS_CLASSES] ?? 'badge--info'}`}>{SDS_STATUS_LABELS[selectedSubstance.sdsStatus as keyof typeof SDS_STATUS_LABELS] ?? selectedSubstance.sdsStatus}</span></div>
                <div><strong>URL SDS:</strong> {selectedSubstance.sdsUrl ? <a href={selectedSubstance.sdsUrl} target="_blank" rel="noopener noreferrer">Ver SDS</a> : '—'}</div>
                <div><strong>Fecha emisión:</strong> {formatDate(selectedSubstance.sdsIssueDate)}</div>
                <div><strong>Fecha revisión:</strong> {formatDate(selectedSubstance.sdsReviewDate)}</div>
              </div>
            </AdvancedSection>

            <AdvancedSection title="Controles e información adicional" accent="default">
              <div style={{ marginBottom: '1rem' }}>
                <strong>Controles implementados:</strong>
                {selectedSubstance.controlsImplemented && selectedSubstance.controlsImplemented.trim().length > 0 ? (
                  <p style={{ margin: '0.25rem 0' }}>{selectedSubstance.controlsImplemented}</p>
                ) : (
                  <p className="muted">Sin controles documentados</p>
                )}
              </div>
              {selectedSubstance.notes && (
                <div>
                  <strong>Notas:</strong>
                  <p style={{ margin: '0.25rem 0' }}>{selectedSubstance.notes}</p>
                </div>
              )}
            </AdvancedSection>

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setSelectedSubstance(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </AdvancedPageLayout>
  );
}
