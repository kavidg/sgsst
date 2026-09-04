import { FormEvent, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type IndicatorDefinition,
  type IndicatorDashboardItem,
  type IndicatorMeasurementStatus,
  type IndicatorDashboardResponse,
  type StandardAnalysisResponse,
  fetchIndicators,
  fetchIndicatorDashboard,
  fetchIndicatorMeasurements,
  calculateIndicatorPeriod,
  fetchStandardAnalysis,
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

interface HealthIndicatorsPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'indicadores', label: 'Indicadores', icon: '📊' },
  { id: 'dashboard', label: 'Dashboard', icon: '📈' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

const CATEGORY_LABELS: Record<string, string> = {
  STRUCTURE: 'Estructura',
  PROCESS: 'Proceso',
  RESULT: 'Resultado',
};

const SUBCATEGORY_LABELS: Record<string, string> = {
  SAFETY: 'Seguridad',
  HEALTH: 'Salud',
  TRAINING: 'Capacitación',
  COMPLIANCE: 'Cumplimiento',
  MANAGEMENT: 'Gestión',
  EMERGENCY: 'Emergencia',
  RISK: 'Riesgo',
  DOCUMENTATION: 'Documentación',
  OTHER: 'Otro',
};

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANNUAL: 'Anual',
};

const STATUS_LABELS: Record<string, string> = {
  TARGET_MET: 'Meta alcanzada',
  TARGET_NOT_MET: 'Fuera de meta',
  NO_DATA: 'Sin datos',
  CALCULATED: 'Calculado',
};

const STATUS_VARIANTS: Record<string, string> = {
  TARGET_MET: 'badge--success',
  TARGET_NOT_MET: 'badge--danger',
  NO_DATA: 'badge--warning',
  CALCULATED: 'badge--info',
};

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getPeriodOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    options.push(`${y}-${m}`);
  }
  return options;
}

export function HealthIndicatorsPage({ token, role }: HealthIndicatorsPageProps) {
  const navigate = useNavigate();
  const { companyId } = useCompanyContext();
  const [indicators, setIndicators] = useState<IndicatorDefinition[]>([]);
  const [dashboard, setDashboard] = useState<IndicatorDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('indicadores');
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorDefinition | null>(null);
  const [indicatorDetail, setIndicatorDetail] = useState<IndicatorDashboardItem | null>(null);
  const [indicatorHistory, setIndicatorHistory] = useState<Array<{ period: string; calculatedValue: number; status: string }>>([]);
  const [calculating, setCalculating] = useState(false);
  const [intelligence, setIntelligence] = useState<StandardAnalysisResponse | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState('');
  const [periodOptions] = useState(getPeriodOptions());

  // ── Data loading ──
  const loadIndicators = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchIndicators(token);
      setIndicators(data.filter((i) => i.catalogCode === '3.3.2'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar los indicadores.');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchIndicatorDashboard(token, selectedPeriod);
      setDashboard(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const loadIntelligence = async () => {
    setIntelligenceLoading(true);
    setIntelligenceError('');
    try {
      const data = await fetchStandardAnalysis(token, '3.3.2');
      setIntelligence(data);
    } catch {
      setIntelligenceError('Análisis inteligente no disponible para 3.3.2.');
    } finally {
      setIntelligenceLoading(false);
    }
  };

  useEffect(() => {
    void loadIndicators();
  }, [companyId, token]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      void loadDashboard();
    }
    if (activeTab === 'intelligence') {
      void loadIntelligence();
    }
  }, [activeTab, selectedPeriod, companyId, token]);

  // ── Calculate period ──
  const handleCalculate = async () => {
    setCalculating(true);
    setError('');
    try {
      await calculateIndicatorPeriod(token, selectedPeriod);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible calcular el período.');
    } finally {
      setCalculating(false);
    }
  };

  // ── View indicator detail ──
  const handleViewIndicator = async (item: IndicatorDashboardItem) => {
    setSelectedIndicator(indicators.find((i) => i._id === item.id) ?? null);
    setIndicatorDetail(item);
    try {
      const history = await fetchIndicatorMeasurements(token, item.id);
      setIndicatorHistory(history.map((m) => ({ period: m.period, calculatedValue: m.calculatedValue, status: m.status })));
    } catch {
      setIndicatorHistory([]);
    }
  };

  // ── KPIs from dashboard ──
  const kpis = useMemo(() => {
    if (!dashboard) {
      return { active: indicators.length, withMeasurement: 0, targetMet: 0, targetNotMet: 0, noData: indicators.length, compliance: 0 };
    }
    return {
      active: dashboard.summary.total,
      withMeasurement: dashboard.summary.eligible,
      targetMet: dashboard.summary.targetMet,
      targetNotMet: dashboard.summary.targetNotMet,
      noData: dashboard.summary.noData,
      compliance: dashboard.summary.compliancePercentage,
    };
  }, [dashboard, indicators]);

  // ── Header actions ──
  const headerActions: HeaderAction[] = [
    { label: '← Volver al PHVA', onClick: () => navigate('/documents/check'), variant: 'secondary' },
    { label: 'Ver análisis', onClick: () => navigate('/intelligence-compliance'), variant: 'secondary' },
    { label: loading ? 'Cargando...' : '🔄 Recargar', onClick: () => { void loadIndicators(); if (activeTab === 'dashboard') void loadDashboard(); }, variant: 'secondary', disabled: loading },
  ];

  // ── EMPTY state ──
  if (!loading && indicators.length === 0 && activeTab === 'indicadores') {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/check"
          backLabel="← Volver al PHVA"
          moduleCode="SST-HI-002"
          moduleTitle="Indicadores de salud laboral"
          description="Medición, análisis y seguimiento de los indicadores de salud laboral del estándar 3.3.2."
          statusBadge={<span className="badge badge--info">📊 3.3.2 · VERIFICAR</span>}
          actions={headerActions}
        />
        <AdvancedSection title="Estado vacío" description="No hay indicadores configurados" accent="info">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1rem' }}>
              No existen indicadores de salud configurados
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Configure los indicadores requeridos para comenzar la medición y análisis del estándar 3.3.2.
            </p>
            <Button onClick={() => void loadIndicators()}>
              Cargar indicadores
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
        backPath="/documents/check"
        backLabel="← Volver al PHVA"
        moduleCode="SST-HI-002"
        moduleTitle="Indicadores de salud laboral"
        description="Medición, análisis y seguimiento de los indicadores de salud laboral del estándar 3.3.2."
        statusBadge={<span className="badge badge--info">📊 3.3.2 · VERIFICAR</span>}
        actions={headerActions}
      />

      {/* KPIs */}
      <AdvancedKpiGrid
        items={[
          { label: 'Indicadores activos', value: kpis.active, variant: 'info' },
          { label: 'Con medición', value: kpis.withMeasurement, variant: kpis.withMeasurement > 0 ? 'success' : 'warning' },
          { label: 'Meta alcanzada', value: kpis.targetMet, variant: 'success' },
          { label: 'Fuera de meta', value: kpis.targetNotMet, variant: kpis.targetNotMet > 0 ? 'danger' : 'success' },
          { label: 'Sin medición', value: kpis.noData, variant: kpis.noData > 0 ? 'warning' : 'success' },
          { label: 'Cumplimiento', value: `${kpis.compliance}%`, variant: kpis.compliance >= 70 ? 'success' : 'warning' },
        ]}
        columns={4}
      />

      <div className="incidents-layout">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />

        <AdvancedTabsContent>
          {loading && <p className="muted">Cargando...</p>}

          {/* ===================== TAB: INDICADORES ===================== */}
          {activeTab === 'indicadores' && (
            <AdvancedSection
              title="Indicadores de salud laboral (3.3.2)"
              description={`Total: ${indicators.length} indicador(es) configurados`}
              accent="default"
            >
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Código</th>
                      <th>Categoría</th>
                      <th>Subcategoría</th>
                      <th>Fórmula</th>
                      <th>Frecuencia</th>
                      <th>Meta</th>
                      <th>Unidad</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ind) => (
                      <tr key={ind._id}>
                        <td style={{ fontWeight: 600 }}>{ind.name}</td>
                        <td><code style={{ fontSize: '0.85rem' }}>{ind.code}</code></td>
                        <td>{CATEGORY_LABELS[ind.category] ?? ind.category}</td>
                        <td>{SUBCATEGORY_LABELS[ind.subcategory] ?? ind.subcategory}</td>
                        <td>{ind.formulaType}</td>
                        <td>{FREQUENCY_LABELS[ind.frequency] ?? ind.frequency}</td>
                        <td>
                          {ind.targetOperator && ind.targetValue != null
                            ? `${ind.targetOperator} ${ind.targetValue}`
                            : ind.targetOperator && ind.targetMin != null && ind.targetMax != null
                              ? `${ind.targetMin}–${ind.targetMax}`
                              : '—'}
                        </td>
                        <td>{ind.unit}</td>
                        <td>
                          <div className="actions">
                            <Button type="button" variant="secondary" onClick={() => {
                              // Find the matching dashboard item if available
                              const dashItem = dashboard?.indicators.find((d) => d.id === ind._id);
                              if (dashItem) {
                                void handleViewIndicator(dashItem);
                              } else {
                                setSelectedIndicator(ind);
                                setIndicatorDetail(null);
                                setIndicatorHistory([]);
                              }
                            }}>Ver</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!indicators.length ? (
                      <tr><td colSpan={9}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No hay indicadores de salud laboral configurados.</p></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </AdvancedSection>
          )}

          {/* ===================== TAB: DASHBOARD ===================== */}
          {activeTab === 'dashboard' && (
            <AdvancedSection
              title="Dashboard de indicadores"
              description={`Período: ${selectedPeriod}`}
              accent="info"
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <label className="field" style={{ flex: 1, minWidth: '150px' }}>
                  <span className="label">Período</span>
                  <Select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                    {periodOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </label>
                {role !== 'manager' && (
                  <Button type="button" onClick={() => void handleCalculate()} disabled={calculating}>
                    {calculating ? 'Calculando...' : '⚡ Calcular período'}
                  </Button>
                )}
              </div>

              {dashboard && (
                <>
                  <div className="responsive-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Indicador</th>
                          <th>Período</th>
                          <th>Valor calculado</th>
                          <th>Meta</th>
                          <th>Fuente</th>
                          <th>Estado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.indicators.map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td>{item.period}</td>
                            <td>{item.calculatedValue != null ? `${item.calculatedValue} ${item.unit}` : '—'}</td>
                            <td>
                              {item.target.operator && item.target.value != null
                                ? `${item.target.operator} ${item.target.value} ${item.unit}`
                                : '—'}
                            </td>
                            <td>{item.source ?? '—'}</td>
                            <td>
                              <span className={`badge ${STATUS_VARIANTS[item.status] ?? ''}`}>
                                {STATUS_LABELS[item.status] ?? item.status}
                              </span>
                            </td>
                            <td>
                              <Button type="button" variant="secondary" onClick={() => void handleViewIndicator(item)}>Ver</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Indicator detail modal */}
                  {indicatorDetail && selectedIndicator && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setIndicatorDetail(null); setSelectedIndicator(null); }}>
                      <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '1rem' }}>Detalle del indicador</h3>
                        <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                          <div><strong>Nombre:</strong> {selectedIndicator.name}</div>
                          <div><strong>Código:</strong> {selectedIndicator.code}</div>
                          <div><strong>Categoría:</strong> {CATEGORY_LABELS[selectedIndicator.category] ?? selectedIndicator.category}</div>
                          <div><strong>Subcategoría:</strong> {SUBCATEGORY_LABELS[selectedIndicator.subcategory] ?? selectedIndicator.subcategory}</div>
                          <div><strong>Frecuencia:</strong> {FREQUENCY_LABELS[selectedIndicator.frequency] ?? selectedIndicator.frequency}</div>
                          <div><strong>Fuente:</strong> {selectedIndicator.sourceModule || '—'}</div>
                          <div><strong>Meta:</strong> {selectedIndicator.targetOperator && selectedIndicator.targetValue != null ? `${selectedIndicator.targetOperator} ${selectedIndicator.targetValue} ${selectedIndicator.unit}` : '—'}</div>
                          <div><strong>Último valor:</strong> {indicatorDetail.calculatedValue != null ? `${indicatorDetail.calculatedValue} ${indicatorDetail.unit}` : '—'}</div>
                          <div><strong>Período:</strong> {indicatorDetail.period}</div>
                          <div><strong>Estado:</strong> <span className={`badge ${STATUS_VARIANTS[indicatorDetail.status] ?? ''}`}>{STATUS_LABELS[indicatorDetail.status] ?? indicatorDetail.status}</span></div>
                        </div>
                        {indicatorHistory.length > 0 && (
                          <div style={{ marginTop: '1rem' }}>
                            <strong>Historial:</strong>
                            <div style={{ marginTop: '0.5rem' }}>
                              {indicatorHistory.map((h, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0' }}>
                                  <span style={{ fontWeight: 600, minWidth: '80px' }}>{h.period}</span>
                                  <span>{h.calculatedValue != null ? `${h.calculatedValue}` : '—'}</span>
                                  <span className={`badge ${STATUS_VARIANTS[h.status] ?? ''}`}>{STATUS_LABELS[h.status] ?? h.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedIndicator.description && (
                          <div style={{ marginTop: '1rem' }}>
                            <strong>Descripción:</strong> {selectedIndicator.description}
                          </div>
                        )}
                        <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                          <Button variant="secondary" onClick={() => { setIndicatorDetail(null); setSelectedIndicator(null); }}>Cerrar</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {!dashboard && !loading && (
                <p className="muted">Seleccione un período para ver el dashboard.</p>
              )}
            </AdvancedSection>
          )}

          {/* ===================== TAB: INTELLIGENCE ===================== */}
          {activeTab === 'intelligence' && (
            <AdvancedSection title="Intelligence — 3.3.2" description="Análisis inteligente del estándar de indicadores de salud" accent="info">
              {intelligenceLoading && <p className="muted">Cargando análisis...</p>}
              {intelligenceError && <p className="muted">{intelligenceError}</p>}
              {intelligence && (
                <div>
                  <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                    <div className="card" style={{ padding: '1rem' }}>
                      <h4 className="card-title">Nivel de cumplimiento</h4>
                      <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>
                        {intelligence.compliancePercentage ?? 0}%
                      </p>
                      <p className="muted">Estado: {intelligence.complianceStatus ?? 'N/A'}</p>
                    </div>
                    <div className="card" style={{ padding: '1rem' }}>
                      <h4 className="card-title">Datos disponibles</h4>
                      <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: intelligence.dataAvailable ? '#10b981' : '#f59e0b' }}>
                        {intelligence.dataAvailable ? '✅ Sí' : '⚠️ Sin datos'}
                      </p>
                    </div>
                  </div>

                  {intelligence.analysis?.summary && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">Resumen</h4>
                      <p style={{ margin: 0 }}>{intelligence.analysis.summary}</p>
                    </div>
                  )}

                  {intelligence.analysis?.keyIssues?.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">Problemas clave</h4>
                      {intelligence.analysis.keyIssues.map((issue: any, i: number) => (
                        <div key={i} style={{ padding: '0.5rem 0', borderBottom: i < intelligence.analysis.keyIssues.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`badge ${issue.priority === 'HIGH' ? 'badge--danger' : issue.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {issue.priority}
                            </span>
                            <strong>{issue.title}</strong>
                          </div>
                          {issue.impact && <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>{issue.impact}</p>}
                          {issue.recommendation && <p style={{ margin: '0.25rem 0 0', color: '#059669', fontSize: '0.9rem' }}>💡 {issue.recommendation}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {intelligence.analysis?.quickWins?.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">⚡ Quick Wins</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        {intelligence.analysis.quickWins.map((win: string, i: number) => (
                          <li key={i} style={{ marginBottom: '0.5rem' }}>{win}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {intelligence.analysis?.nextSteps?.length > 0 && (
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h4 className="card-title">📋 Próximos pasos</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        {intelligence.analysis.nextSteps.map((step: string, i: number) => (
                          <li key={i} style={{ marginBottom: '0.5rem' }}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {intelligence.metrics && Object.keys(intelligence.metrics).length > 0 && (
                    <div className="card" style={{ padding: '1rem' }}>
                      <h4 className="card-title">Métricas</h4>
                      <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                        {Object.entries(intelligence.metrics).map(([key, value]) => (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{key}</span>
                            <strong>{String(value)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!intelligenceLoading && !intelligence && !intelligenceError && (
                <p className="muted">No hay datos de análisis disponibles.</p>
              )}
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>
    </AdvancedPageLayout>
  );
}
