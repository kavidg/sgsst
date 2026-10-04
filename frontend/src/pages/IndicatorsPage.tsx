import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type IndicatorDefinition,
  type IndicatorCategory,
  type IndicatorSubcategory,
  type IndicatorFormulaType,
  type IndicatorFrequency,
  type IndicatorDashboardResponse,
  type IndicatorPeriodModel,
  type CompanyPeriodWorkDataModel,
  type CreateIndicatorPayload,
  fetchIndicators,
  fetchIndicatorDashboard,
  fetchIndicatorMeasurements,
  calculateIndicatorPeriod,
  createIndicator,
  updateIndicator,
  createIndicatorMeasurement,
  fetchIndicatorPeriods,
  createIndicatorPeriod,
  closeIndicatorPeriod,
  fetchIndicatorsWorkData,
  upsertIndicatorsWorkData,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  isIndicatorsComplianceMetadataV1,
  indicatorRatioToPercent,
  INDICATOR_DIMENSION_KEYS,
  type IndicatorDimensionKey,
  type IndicatorsComplianceMetadataV1,
} from '../types/indicators-compliance';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
} from '../components/advanced-layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Table } from '../components/ui/Table';
// E4-C (6.1.1): IA complementaria — interpreta el resultado oficial; si falla,
// el componente no bloquea la página (fallback interno tolerante).
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';

/**
 * E4-B (6.1.1) — Gestión Avanzada de Indicadores SG-SST.
 *
 * REGLA DE SCORE: el frontend NO calcula el cumplimiento. Porcentaje, estado,
 * nivel y metadata dimensional provienen exclusivamente de
 * GET /compliance-engine/overview (module === 'indicators', dimensions:v1).
 * `indicatorRatioToPercent` es solo presentación visual.
 *
 * Roles: lectura owner/admin/manager/member; escritura owner/admin
 * (el backend es la autoridad — aquí solo se ocultan acciones).
 */

interface IndicatorsPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: '📋' },
  { id: 'indicadores', label: 'Indicadores', icon: '📊' },
  { id: 'mediciones', label: 'Mediciones', icon: '🧮' },
  { id: 'horas', label: 'Horas trabajadas', icon: '⏱️' },
  { id: 'periodos', label: 'Períodos', icon: '🗓️' },
];

const DIMENSION_LABELS: Record<IndicatorDimensionKey, string> = {
  existence: 'Existencia',
  definitionQuality: 'Calidad de la definición',
  measurement: 'Medición',
  targetCompliance: 'Cumplimiento de metas',
  analysisEvidence: 'Análisis / evidencia',
  history: 'Historial',
};

const DIMENSION_WEIGHT_FALLBACK: Record<IndicatorDimensionKey, number> = {
  existence: 10,
  definitionQuality: 20,
  measurement: 25,
  targetCompliance: 20,
  analysisEvidence: 15,
  history: 10,
};

const CATEGORY_LABELS: Record<string, string> = {
  STRUCTURE: 'Estructura', PROCESS: 'Proceso', RESULT: 'Resultado',
};
const SUBCATEGORY_LABELS: Record<string, string> = {
  SAFETY: 'Seguridad', HEALTH: 'Salud', TRAINING: 'Capacitación', COMPLIANCE: 'Cumplimiento',
  MANAGEMENT: 'Gestión', EMERGENCY: 'Emergencia', RISK: 'Riesgo', DOCUMENTATION: 'Documentación', OTHER: 'Otro',
};
const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'Mensual', QUARTERLY: 'Trimestral', SEMESTRAL: 'Semestral', ANNUAL: 'Anual',
};
const STATUS_LABELS: Record<string, string> = {
  TARGET_MET: 'Meta alcanzada', TARGET_NOT_MET: 'Fuera de meta', NO_DATA: 'Sin datos', CALCULATED: 'Calculado',
};
const STATUS_VARIANTS: Record<string, string> = {
  TARGET_MET: 'badge--success', TARGET_NOT_MET: 'badge--danger', NO_DATA: 'badge--warning', CALCULATED: 'badge--info',
};

const SOURCE_MODULE_OPTIONS = [
  'incidents', 'trainings', 'inspections', 'risks', 'documents',
  'absenteeism', 'work-data', 'evaluations', 'annual-work-plan',
];

const CATEGORY_OPTIONS: Array<{ value: IndicatorCategory; label: string }> = [
  { value: 'STRUCTURE', label: 'Estructura' },
  { value: 'PROCESS', label: 'Proceso' },
  { value: 'RESULT', label: 'Resultado' },
];
const SUBCATEGORY_OPTIONS: Array<{ value: IndicatorSubcategory; label: string }> = (
  Object.entries(SUBCATEGORY_LABELS) as Array<[IndicatorSubcategory, string]>
).map(([value, label]) => ({ value, label }));
const FORMULA_TYPE_OPTIONS: Array<{ value: IndicatorFormulaType; label: string }> = [
  { value: 'AUTOMATIC', label: 'Automática' },
  { value: 'SEMI_AUTOMATIC', label: 'Semi-automática' },
  { value: 'MANUAL', label: 'Manual' },
];
const FREQUENCY_OPTIONS: Array<{ value: IndicatorFrequency; label: string }> = [
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
];

/** Acción mínima por finding oficial (IDs de indicators-scoring.ts). */
const FINDING_ACTION: Record<string, { tab: string; label: string }> = {
  'indicators-no-active': { tab: 'indicadores', label: 'Ir a Indicadores' },
  'indicators-no-data': { tab: 'mediciones', label: 'Ir a Mediciones' },
  'indicators-definition-incomplete': { tab: 'indicadores', label: 'Completar ficha' },
  'indicators-without-measurement': { tab: 'mediciones', label: 'Ir a Mediciones' },
  'indicators-target-not-met': { tab: 'mediciones', label: 'Ver mediciones' },
  'indicators-analysis-missing': { tab: 'mediciones', label: 'Registrar análisis' },
  'indicators-history-incomplete': { tab: 'periodos', label: 'Ir a Períodos' },
  'indicators-duplicate-measurements': { tab: 'mediciones', label: 'Revisar histórico' },
};

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodOptions(count = 18): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return options;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function closedFriendlyMessage(err: unknown, action: string): string {
  const msg = errorMessage(err);
  return /closed/i.test(msg) ? `Este período está cerrado y no puede ${action}.` : msg;
}

function canWrite(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function IndicatorsPage({ token, role }: IndicatorsPageProps) {
  const writable = canWrite(role);
  const [activeTab, setActiveTab] = useState<string>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Datos
  const [definitions, setDefinitions] = useState<IndicatorDefinition[]>([]);
  const [periods, setPeriods] = useState<IndicatorPeriodModel[]>([]);
  const [workData, setWorkData] = useState<CompanyPeriodWorkDataModel[]>([]);
  const [dashboard, setDashboard] = useState<IndicatorDashboardResponse | null>(null);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<IndicatorsComplianceMetadataV1 | null>(null);

  // Período global compartido (Resumen / Mediciones / Horas)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(getCurrentPeriod());
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modales
  const [indicatorModal, setIndicatorModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; definition: IndicatorDefinition }
    | null
  >(null);
  const [toggleTarget, setToggleTarget] = useState<IndicatorDefinition | null>(null);
  const [historyModal, setHistoryModal] = useState<
    | { definition: IndicatorDefinition; rows: Array<{ _id: string; period: string; calculatedValue: number; status: string; source: string }> }
    | null
  >(null);
  const [measurementModal, setMeasurementModal] = useState<IndicatorDefinition | null>(null);
  const [workDataModal, setWorkDataModal] = useState<{ period: string; hours: string } | null>(null);
  const [createPeriodModal, setCreatePeriodModal] = useState(false);
  const [closePeriodTarget, setClosePeriodTarget] = useState<IndicatorPeriodModel | null>(null);

  const periodStatusMap = useMemo(() => {
    const map = new Map<string, 'OPEN' | 'CLOSED'>();
    for (const p of periods) map.set(p.period, p.status);
    return map;
  }, [periods]);
  const isPeriodClosed = useCallback(
    (period: string) => periodStatusMap.get(period) === 'CLOSED',
    [periodStatusMap],
  );

  // ─── Carga (tolerante: compliance falla ≠ romper la gestión) ────────────
  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance = overview?.moduleCompliance?.find((m) => m.module === 'indicators') ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isIndicatorsComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === 'indicators'));
  }, [token]);

  const loadDefinitions = useCallback(async () => {
    setDefinitions(await fetchIndicators(token).catch(() => []));
  }, [token]);

  const loadPeriods = useCallback(async () => {
    setPeriods(await fetchIndicatorPeriods(token).catch(() => []));
  }, [token]);

  const loadWorkData = useCallback(async () => {
    setWorkData(await fetchIndicatorsWorkData(token).catch(() => []));
  }, [token]);

  const loadDashboard = useCallback(async (period: string) => {
    setDashboard(await fetchIndicatorDashboard(token, period).catch(() => null));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [defs, per, wd, dash, overview] = await Promise.all([
          fetchIndicators(token).catch(() => [] as IndicatorDefinition[]),
          fetchIndicatorPeriods(token).catch(() => [] as IndicatorPeriodModel[]),
          fetchIndicatorsWorkData(token).catch(() => [] as CompanyPeriodWorkDataModel[]),
          fetchIndicatorDashboard(token, getCurrentPeriod()).catch(() => null),
          getOverview(token, '').catch(() => null),
        ]);
        if (cancelled) return;
        setDefinitions(defs);
        setPeriods(per);
        setWorkData(wd);
        setDashboard(dash);
        const moduleCompliance = overview?.moduleCompliance?.find((m) => m.module === 'indicators') ?? null;
        setCompliance(moduleCompliance);
        setMetadata(
          moduleCompliance && isIndicatorsComplianceMetadataV1(moduleCompliance.metadata)
            ? moduleCompliance.metadata
            : null,
        );
        setFindings((overview?.findings ?? []).filter((f) => f.module === 'indicators'));
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Cambio de período global → refrescar dashboard (solo si cambió).
  useEffect(() => {
    if (!loading) void loadDashboard(selectedPeriod);
  }, [selectedPeriod, loading, loadDashboard]);

  // ─── Acciones: indicadores ───────────────────────────────────────────────
  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setSaving(true);
    try {
      await updateIndicator(token, toggleTarget._id, { isActive: !toggleTarget.isActive });
      setToggleTarget(null);
      await Promise.all([loadDefinitions(), loadCompliance()]);
      setBanner('Estado del indicador actualizado.');
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Acciones: cálculo ───────────────────────────────────────────────────
  const handleCalculate = async () => {
    if (isPeriodClosed(selectedPeriod)) return;
    if (!window.confirm(`¿Ejecutar el cálculo automático de todos los indicadores para el período ${selectedPeriod}?`)) return;
    setCalculating(true);
    setBanner(null);
    try {
      const result = await calculateIndicatorPeriod(token, selectedPeriod);
      setBanner(
        `Cálculo ${selectedPeriod}: ${result.summary.calculated} calculados, ${result.summary.noData} sin datos, ${result.summary.failed} fallidos.`,
      );
      await Promise.all([loadDashboard(selectedPeriod), loadCompliance()]);
    } catch (err) {
      setBanner(`Error: ${closedFriendlyMessage(err, 'recalcularse')}`);
    } finally {
      setCalculating(false);
    }
  };

  // ─── Acciones: horas trabajadas ──────────────────────────────────────────
  const handleSaveWorkData = async () => {
    if (!workDataModal) return;
    const hours = Number(workDataModal.hours);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(workDataModal.period)) {
      setBanner('Error: el período debe tener formato YYYY-MM (mes 01–12).');
      return;
    }
    if (!Number.isFinite(hours) || hours < 0) {
      setBanner('Error: las horas deben ser un número >= 0.');
      return;
    }
    setSaving(true);
    try {
      await upsertIndicatorsWorkData(token, workDataModal.period, hours);
      setWorkDataModal(null);
      await loadWorkData();
      setBanner(`Horas trabajadas guardadas para ${workDataModal.period}.`);
    } catch (err) {
      setBanner(`Error: ${closedFriendlyMessage(err, 'modificarse (período cerrado)')}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Acciones: períodos ──────────────────────────────────────────────────
  const handleCreatePeriod = async (period: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      setBanner('Error: el período debe tener formato YYYY-MM (mes 01–12).');
      return;
    }
    setSaving(true);
    try {
      await createIndicatorPeriod(token, period);
      setCreatePeriodModal(false);
      await loadPeriods();
      setBanner(`Período ${period} creado.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClosePeriod = async () => {
    if (!closePeriodTarget) return;
    setSaving(true);
    try {
      await closeIndicatorPeriod(token, closePeriodTarget.period);
      const closed = closePeriodTarget.period;
      setClosePeriodTarget(null);
      await Promise.all([loadPeriods(), loadWorkData(), loadDashboard(closed), loadCompliance()]);
      setBanner(`Período ${closed} cerrado: sus horas y mediciones son ahora inmutables.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const goToFindingAction = (findingId: string) => {
    const action = FINDING_ACTION[findingId];
    if (action) setActiveTab(action.tab);
  };

  // ─── Derivados de presentación ───────────────────────────────────────────
  const percentage = compliance?.compliance ?? null;
  const status = compliance?.status ?? null;
  const workDataByPeriod = useMemo(() => {
    const map = new Map<string, CompanyPeriodWorkDataModel>();
    for (const w of workData) map.set(w.period, w);
    return map;
  }, [workData]);
  const activeCount = definitions.filter((d) => d.isActive).length;

  const statusBadge = loading
    ? <span className="badge badge--info">⏳ Cargando…</span>
    : compliance === null
      ? <span className="badge badge--warning">Cumplimiento no disponible</span>
      : status === 'NO_DATA'
        ? <span className="badge badge--warning">Sin datos evaluables</span>
        : status === 'TARGET_MET'
          ? <span className="badge badge--success">✅ Meta alcanzada</span>
          : <span className="badge badge--danger">Meta no alcanzada</span>;

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/check"
        backLabel="← Volver a Verificación"
        moduleCode="6.1.1"
        moduleTitle="Indicadores SG-SST"
        description="Definición, medición, metas, análisis y evidencia de los indicadores del SG-SST."
        statusBadge={statusBadge}
        actions={writable
          ? [{ label: '🔄 Recargar', onClick: () => { void loadDefinitions(); void loadCompliance(); }, variant: 'secondary' as const }]
          : []}
        lastSaved={compliance ? `Porcentaje oficial: ${percentage ?? 0}%` : undefined}
      />

      {banner ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <span>{banner}</span>{' '}
          <Button variant="ghost" onClick={() => setBanner(null)}>✕</Button>
        </div>
      ) : null}

      <AdvancedKpiGrid
        items={[
          {
            label: 'Cumplimiento oficial 6.1.1',
            value: loading ? '…' : status === 'NO_DATA' ? 'Sin datos' : percentage === null ? 'N/D' : `${percentage}%`,
            variant: status === 'TARGET_MET' ? 'success' : status === 'NO_DATA' || compliance === null ? 'warning' : 'danger',
          },
          { label: 'Indicadores activos', value: activeCount, variant: 'info' },
          { label: 'En meta (período)', value: dashboard?.summary?.targetMet ?? '—', variant: 'success' },
          { label: 'Sin medición (período)', value: dashboard?.summary?.noData ?? '—', variant: 'warning' },
        ]}
        columns={4}
      />

      <div className="flex gap-6">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />
        <AdvancedTabsContent>
          {error ? <p>⚠️ {error}</p> : null}

          {/* ══════════════ RESUMEN ══════════════ */}
          {activeTab === 'resumen' && (
            <AdvancedSection
              title="Cumplimiento oficial — 6.1.1"
              description="Fuente única: ComplianceEngine (dimensions:v1). El frontend no recalcula."
            >
              {loading ? (
                <p>Cargando…</p>
              ) : compliance === null ? (
                <p>El resultado de cumplimiento no está disponible en este momento.</p>
              ) : (
                <>
                  <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div className="card">
                      <strong>{status === 'NO_DATA' ? 'Sin datos evaluables' : `${percentage ?? 0}%`}</strong>
                      <p style={{ margin: 0 }}>
                        Estado: {STATUS_LABELS[status ?? ''] ?? status} · Nivel: {compliance.level} ·{' '}
                        Período evaluado: {metadata?.evaluatedPeriod ?? '—'}
                      </p>
                      {status === 'NO_DATA' ? (
                        <p style={{ margin: 0 }}>
                          {metadata?.noDataReason === 'no-active-indicators'
                            ? 'No existen indicadores activos para evaluar.'
                            : 'No existen mediciones válidas para el período evaluado.'}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <h4>Dimensiones oficiales</h4>
                  <Table>
                    <thead>
                      <tr>
                        <th>Dimensión</th><th>%</th><th>Peso</th><th>Numerador</th><th>Denominador</th><th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {INDICATOR_DIMENSION_KEYS.map((key) => {
                        const dim = metadata?.dimensions?.[key];
                        const pct = indicatorRatioToPercent(dim?.ratio);
                        const details = dim && typeof dim === 'object' ? (dim as Record<string, unknown>) : null;
                        const detailText = details
                          ? Object.entries(details)
                              .filter(([k, v]) => !['ratio', 'numerator', 'denominator', 'weight'].includes(k) && v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
                              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
                              .join(' · ')
                          : '';
                        return (
                          <tr key={key}>
                            <td>{DIMENSION_LABELS[key]}</td>
                            <td>{pct === null ? 'No evaluable' : `${pct}%`}</td>
                            <td>{dim?.weight ?? DIMENSION_WEIGHT_FALLBACK[key]}%</td>
                            <td>{dim?.numerator ?? '—'}</td>
                            <td>{dim?.denominator ?? '—'}</td>
                            <td>{detailText || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>

                  <h4>Hallazgos ({findings.length})</h4>
                  {findings.length === 0 ? (
                    <p>Sin hallazgos para este módulo.</p>
                  ) : (
                    <ul>
                      {findings.map((f) => {
                        const action = FINDING_ACTION[f.id];
                        return (
                          <li key={f.id} style={{ marginBottom: '.5rem' }}>
                            <strong>{f.title}</strong>{' '}
                            <span className={`badge ${f.priority === 'HIGH' ? 'badge--danger' : f.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {f.priority}
                            </span>
                            <div>{f.description}</div>
                            {action && writable ? (
                              <Button variant="secondary" onClick={() => goToFindingAction(f.id)}>{action.label}</Button>
                            ) : action ? (
                              <Button variant="secondary" onClick={() => goToFindingAction(f.id)}>{action.label}</Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* E4-C: IA 6.1.1 — sección claramente diferenciada del
                      resultado oficial; su fallo no afecta la gestión. */}
                  <ComplianceAIInsight token={token} standardCode="6.1.1" />
                </>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ INDICADORES ══════════════ */}
          {activeTab === 'indicadores' && (
            <AdvancedSection
              title="Indicadores"
              description={`Definiciones registradas: ${definitions.length} (${activeCount} activas).`}
            >
              {writable ? (
                <div style={{ marginBottom: '.75rem' }}>
                  <Button onClick={() => setIndicatorModal({ mode: 'create' })}>+ Nuevo indicador</Button>
                </div>
              ) : null}
              <Table>
                <thead>
                  <tr>
                    <th>Código</th><th>Nombre</th><th>Categoría</th><th>Subcategoría</th><th>Fuente</th>
                    <th>Fórmula</th><th>Unidad</th><th>Meta</th><th>Frecuencia</th><th>Responsable</th>
                    <th>Estado</th>{writable ? <th>Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {definitions.length === 0 ? (
                    <tr><td colSpan={writable ? 12 : 11}>Sin indicadores registrados.</td></tr>
                  ) : (
                    definitions.map((d) => (
                      <tr key={d._id}>
                        <td>{d.code}</td>
                        <td>{d.name}</td>
                        <td>{CATEGORY_LABELS[d.category] ?? d.category}</td>
                        <td>{SUBCATEGORY_LABELS[d.subcategory] ?? d.subcategory}</td>
                        <td>{d.sourceModule || '—'}</td>
                        <td>{d.formulaType}</td>
                        <td>{d.unit || '—'}</td>
                        <td>
                          {d.targetOperator === 'BETWEEN'
                            ? `${d.targetMin ?? '—'} – ${d.targetMax ?? '—'}`
                            : `${d.targetOperator ?? '—'} ${d.targetValue ?? '—'}`}
                        </td>
                        <td>{FREQUENCY_LABELS[d.frequency] ?? d.frequency}</td>
                        <td>{d.responsible || '—'}{d.responsibleArea ? ` (${d.responsibleArea})` : ''}</td>
                        <td>
                          <span className={`badge ${d.isActive ? 'badge--success' : 'badge--warning'}`}>
                            {d.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        {writable ? (
                          <td>
                            <div className="actions">
                              <Button variant="secondary" onClick={() => setIndicatorModal({ mode: 'edit', definition: d })}>Editar</Button>
                              <Button variant="secondary" onClick={() => setToggleTarget(d)}>{d.isActive ? 'Desactivar' : 'Activar'}</Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </AdvancedSection>
          )}

          {/* ══════════════ MEDICIONES ══════════════ */}
          {activeTab === 'mediciones' && (
            <AdvancedSection
              title={`Mediciones — período ${selectedPeriod}`}
              description="Cálculo automático y registro manual (según el tipo de fórmula de cada indicador)."
            >
              <div className="flex gap-6" style={{ flexWrap: 'wrap', alignItems: 'center', marginBottom: '.75rem' }}>
                <Select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  aria-label="Período"
                >
                  {getPeriodOptions().map((p) => (
                    <option key={p} value={p}>{p}{isPeriodClosed(p) ? ' 🔒' : ''}</option>
                  ))}
                </Select>
                {writable ? (
                  isPeriodClosed(selectedPeriod) ? (
                    <span className="badge badge--warning">🔒 Período cerrado: no puede recalcularse</span>
                  ) : (
                    <Button onClick={() => void handleCalculate()} disabled={calculating}>
                      {calculating ? 'Calculando…' : '⚙️ Calcular período'}
                    </Button>
                  )
                ) : null}
              </div>

              {dashboard === null ? (
                <p>No hay datos del dashboard para este período.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Código</th><th>Indicador</th><th>Valor</th><th>Unidad</th><th>Meta</th>
                      <th>Estado</th><th>Fuente</th>{writable ? <th>Acciones</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.indicators.length === 0 ? (
                      <tr><td colSpan={writable ? 8 : 7}>Sin indicadores para este período.</td></tr>
                    ) : (
                      dashboard.indicators.map((item) => {
                        const def = definitions.find((d) => d._id === item.id);
                        return (
                          <tr key={item.id}>
                            <td>{item.code}</td>
                            <td>{item.name}</td>
                            <td>{item.calculatedValue ?? '—'}</td>
                            <td>{item.unit}</td>
                            <td>
                              {item.target.operator === 'BETWEEN'
                                ? `${item.target.min ?? '—'} – ${item.target.max ?? '—'}`
                                : `${item.target.operator ?? '—'} ${item.target.value ?? '—'}`}
                            </td>
                            <td>
                              <span className={`badge ${STATUS_VARIANTS[item.status] ?? 'badge--info'}`}>
                                {STATUS_LABELS[item.status] ?? item.status}
                              </span>
                            </td>
                            <td>{item.source ?? '—'}</td>
                            {writable ? (
                              <td>
                                <div className="actions">
                                  {def && def.formulaType === 'MANUAL' && !isPeriodClosed(selectedPeriod) ? (
                                    <Button variant="secondary" onClick={() => setMeasurementModal(def)}>Registrar medición</Button>
                                  ) : null}
                                  {def ? (
                                    <Button variant="ghost" onClick={() => void openHistory(def)}>Ver historial</Button>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ HORAS TRABAJADAS ══════════════ */}
          {activeTab === 'horas' && (
            <AdvancedSection
              title="Horas trabajadas"
              description="Denominador oficial (YYYY-MM) de frecuencia de accidentalidad, severidad e índice de ausentismo. Sin registro → NO_DATA, nunca 0."
            >
              <Table>
                <thead>
                  <tr><th>Período</th><th>Horas trabajadas</th><th>Estado</th>{writable ? <th>Acción</th> : null}</tr>
                </thead>
                <tbody>
                  {getPeriodOptions(12).map((p) => {
                    const record = workDataByPeriod.get(p);
                    const closed = isPeriodClosed(p);
                    const statusP = periodStatusMap.get(p);
                    return (
                      <tr key={p}>
                        <td>{p}</td>
                        <td>{record ? record.hoursWorked : 'Sin registro (NO_DATA)'}</td>
                        <td>
                          {closed
                            ? <span className="badge badge--warning">🔒 CLOSED</span>
                            : statusP === 'OPEN'
                              ? <span className="badge badge--success">OPEN</span>
                              : <span className="badge badge--info">Sin período</span>}
                        </td>
                        {writable ? (
                          <td>
                            {closed ? (
                              <span title="Las horas de un período cerrado son inmutables.">🔒 Inmutable</span>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={() => setWorkDataModal({ period: p, hours: record ? String(record.hoursWorked) : '' })}
                              >
                                {record ? 'Editar' : 'Registrar'}
                              </Button>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </AdvancedSection>
          )}

          {/* ══════════════ PERÍODOS ══════════════ */}
          {activeTab === 'periodos' && (
            <AdvancedSection
              title="Períodos"
              description="Cerrar un período congela sus horas trabajadas y evita recálculos automáticos."
            >
              {writable ? (
                <div style={{ marginBottom: '.75rem' }}>
                  <Button onClick={() => setCreatePeriodModal(true)}>+ Crear período</Button>
                </div>
              ) : null}
              <Table>
                <thead>
                  <tr><th>Período</th><th>Estado</th><th>Apertura</th><th>Cierre</th>{writable ? <th>Acción</th> : null}</tr>
                </thead>
                <tbody>
                  {periods.length === 0 ? (
                    <tr><td colSpan={writable ? 5 : 4}>Sin períodos creados.</td></tr>
                  ) : (
                    periods.map((p) => (
                      <tr key={p._id}>
                        <td>{p.period}</td>
                        <td>
                          <span className={`badge ${p.status === 'CLOSED' ? 'badge--warning' : 'badge--success'}`}>{p.status}</span>
                        </td>
                        <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</td>
                        <td>{p.closedAt ? new Date(p.closedAt).toLocaleDateString() : '—'}</td>
                        {writable ? (
                          <td>
                            {p.status === 'OPEN' ? (
                              <Button variant="danger" onClick={() => setClosePeriodTarget(p)}>Cerrar período</Button>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* ══════════════ MODALES ══════════════ */}

      {indicatorModal ? (
        <IndicatorFormModal
          token={token}
          mode={indicatorModal.mode}
          definition={indicatorModal.mode === 'edit' ? indicatorModal.definition : null}
          onClose={() => setIndicatorModal(null)}
          onSaved={async () => {
            setIndicatorModal(null);
            await Promise.all([loadDefinitions(), loadCompliance()]);
            setBanner('Indicador guardado.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {toggleTarget ? (
        <Modal isOpen title={toggleTarget.isActive ? 'Desactivar indicador' : 'Activar indicador'} onClose={() => setToggleTarget(null)}>
          <p>
            {toggleTarget.isActive
              ? 'Desactivar este indicador puede afectar la evaluación de 6.1.1. No se borran sus mediciones históricas.'
              : `¿Reactivar el indicador ${toggleTarget.code}?`}
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setToggleTarget(null)}>Cancelar</Button>
            <Button variant={toggleTarget.isActive ? 'danger' : 'primary'} disabled={saving} onClick={() => void handleToggleActive()}>
              {saving ? 'Guardando…' : toggleTarget.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {measurementModal ? (
        <MeasurementModal
          token={token}
          definition={measurementModal}
          period={selectedPeriod}
          onClose={() => setMeasurementModal(null)}
          onSaved={async () => {
            setMeasurementModal(null);
            await Promise.all([loadDashboard(selectedPeriod), loadCompliance()]);
            setBanner('Medición manual registrada.');
          }}
          onError={(msg) => setBanner(`Error: ${msg}`)}
        />
      ) : null}

      {historyModal ? (
        <Modal isOpen title={`Historial — ${historyModal.definition.code}`} onClose={() => setHistoryModal(null)}>
          {historyModal.rows.length === 0 ? (
            <p>Sin mediciones registradas.</p>
          ) : (
            <Table>
              <thead>
                <tr><th>Período</th><th>Valor</th><th>Estado</th><th>Fuente</th></tr>
              </thead>
              <tbody>
                {historyModal.rows.map((m) => (
                  <tr key={m._id}>
                    <td>{m.period}</td>
                    <td>{m.calculatedValue}</td>
                    <td><span className={`badge ${STATUS_VARIANTS[m.status] ?? 'badge--info'}`}>{STATUS_LABELS[m.status] ?? m.status}</span></td>
                    <td>{m.source}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Modal>
      ) : null}

      {workDataModal ? (
        <Modal isOpen title={`Horas trabajadas — ${workDataModal.period}`} onClose={() => setWorkDataModal(null)}>
          <label>
            Período (YYYY-MM)
            <Input value={workDataModal.period} onChange={(e) => setWorkDataModal({ ...workDataModal, period: e.target.value })} />
          </label>
          <label>
            Horas trabajadas
            <Input
              type="number"
              min={0}
              step="any"
              value={workDataModal.hours}
              onChange={(e) => setWorkDataModal({ ...workDataModal, hours: e.target.value })}
            />
          </label>
          <div className="actions">
            <Button variant="secondary" onClick={() => setWorkDataModal(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void handleSaveWorkData()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </Modal>
      ) : null}

      {createPeriodModal ? (
        <CreatePeriodModal
          saving={saving}
          onClose={() => setCreatePeriodModal(false)}
          onCreate={(period) => void handleCreatePeriod(period)}
        />
      ) : null}

      {closePeriodTarget ? (
        <Modal isOpen title={`Cerrar período ${closePeriodTarget.period}`} onClose={() => setClosePeriodTarget(null)}>
          <p>
            <strong>Al cerrar el período no se podrán modificar las horas trabajadas ni recalcular automáticamente
            las mediciones de este período.</strong>
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setClosePeriodTarget(null)}>Cancelar</Button>
            <Button variant="danger" disabled={saving} onClick={() => void handleClosePeriod()}>
              {saving ? 'Cerrando…' : 'Cerrar definitivamente'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </AdvancedPageLayout>
  );

  async function openHistory(def: IndicatorDefinition) {
    try {
      const rows = await fetchIndicatorMeasurements(token, def._id);
      const sorted = [...rows].sort((a, b) => (a.period < b.period ? 1 : -1));
      setHistoryModal({ definition: def, rows: sorted });
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    }
  }
}

// ═══════════════════════════ Formularios ═══════════════════════════

type IndicatorFormState = {
  code: string; name: string; description: string;
  category: IndicatorCategory; subcategory: IndicatorSubcategory;
  sourceModule: string; formulaType: IndicatorFormulaType; formulaJson: string;
  unit: string; targetValue: string; targetOperator: string;
  targetMin: string; targetMax: string; frequency: IndicatorFrequency;
  responsible: string; responsibleArea: string; catalogCode: string;
};

function emptyForm(): IndicatorFormState {
  return {
    code: '', name: '', description: '',
    category: 'PROCESS', subcategory: 'SAFETY',
    sourceModule: '', formulaType: 'MANUAL', formulaJson: '',
    unit: '', targetValue: '', targetOperator: 'GTE', targetMin: '', targetMax: '',
    frequency: 'MONTHLY', responsible: '', responsibleArea: '', catalogCode: '6.1.1',
  };
}

function formFromDefinition(d: IndicatorDefinition): IndicatorFormState {
  return {
    code: d.code, name: d.name, description: d.description ?? '',
    category: d.category, subcategory: d.subcategory,
    sourceModule: d.sourceModule ?? '', formulaType: d.formulaType,
    formulaJson: d.formula && Object.keys(d.formula).length > 0 ? JSON.stringify(d.formula, null, 2) : '',
    unit: d.unit ?? '',
    targetValue: d.targetValue !== undefined ? String(d.targetValue) : '',
    targetOperator: d.targetOperator ?? 'GTE',
    targetMin: d.targetMin !== undefined ? String(d.targetMin) : '',
    targetMax: d.targetMax !== undefined ? String(d.targetMax) : '',
    frequency: d.frequency, responsible: d.responsible ?? '', responsibleArea: d.responsibleArea ?? '',
    catalogCode: d.catalogCode ?? '6.1.1',
  };
}

function IndicatorFormModal(props: {
  token: string;
  mode: 'create' | 'edit';
  definition: IndicatorDefinition | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { token, mode, definition, onClose, onSaved, onError } = props;
  const [form, setForm] = useState<IndicatorFormState>(
    mode === 'edit' && definition ? formFromDefinition(definition) : emptyForm(),
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof IndicatorFormState>(key: K, value: IndicatorFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const needsSource = form.formulaType === 'AUTOMATIC' || form.formulaType === 'SEMI_AUTOMATIC';

  const submit = async () => {
    // Construcción del payload: solo campos del DTO (forbidNonWhitelisted).
    const payload: CreateIndicatorPayload = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category,
      subcategory: form.subcategory,
      formulaType: form.formulaType,
      frequency: form.frequency,
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (needsSource && form.sourceModule.trim()) payload.sourceModule = form.sourceModule.trim();
    if (needsSource && form.formulaJson.trim()) {
      try {
        payload.formula = JSON.parse(form.formulaJson) as Record<string, unknown>;
      } catch {
        onError('La fórmula no es JSON válido.');
        return;
      }
    }
    if (form.unit.trim()) payload.unit = form.unit.trim();
    if (form.targetValue !== '') payload.targetValue = Number(form.targetValue);
    if (form.targetOperator) payload.targetOperator = form.targetOperator;
    if (form.targetOperator === 'BETWEEN') {
      if (form.targetMin !== '') payload.targetMin = Number(form.targetMin);
      if (form.targetMax !== '') payload.targetMax = Number(form.targetMax);
    }
    if (form.responsible.trim()) payload.responsible = form.responsible.trim();
    if (form.responsibleArea.trim()) payload.responsibleArea = form.responsibleArea.trim();
    if (form.catalogCode.trim()) payload.catalogCode = form.catalogCode.trim();

    setSaving(true);
    try {
      if (mode === 'edit' && definition) {
        await updateIndicator(token, definition._id, payload);
      } else {
        await createIndicator(token, payload);
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={mode === 'edit' ? `Editar ${form.code}` : 'Nuevo indicador'} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <label>Código *<Input value={form.code} onChange={(e) => set('code', e.target.value)} maxLength={100} /></label>
        <label>Nombre *<Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} /></label>
        <label>Descripción<Input value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} /></label>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Categoría *
            <Select value={form.category} onChange={(e) => set('category', e.target.value as IndicatorCategory)}>
              {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
          <label>Subcategoría
            <Select value={form.subcategory} onChange={(e) => set('subcategory', e.target.value as IndicatorSubcategory)}>
              {SUBCATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
        </div>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Tipo de fórmula *
            <Select value={form.formulaType} onChange={(e) => set('formulaType', e.target.value as IndicatorFormulaType)}>
              {FORMULA_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
          <label>Frecuencia *
            <Select value={form.frequency} onChange={(e) => set('frequency', e.target.value as IndicatorFrequency)}>
              {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
        </div>
        {needsSource ? (
          <>
            <label>Módulo fuente
              <Select value={form.sourceModule} onChange={(e) => set('sourceModule', e.target.value)}>
                <option value="">—</option>
                {SOURCE_MODULE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </label>
            <label>Fórmula (JSON declarativo)
              <textarea
                className="input"
                rows={5}
                value={form.formulaJson}
                onChange={(e) => set('formulaJson', e.target.value)}
                placeholder='{"type":"AVERAGE","source":{"module":"trainings","field":"avgCompletion"}}'
              />
            </label>
          </>
        ) : (
          <p style={{ margin: 0, color: '#64748b' }}>Fórmula manual: la medición se registra manualmente por período.</p>
        )}
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Unidad<Input value={form.unit} onChange={(e) => set('unit', e.target.value)} /></label>
          <label>Operador de meta
            <Select value={form.targetOperator} onChange={(e) => set('targetOperator', e.target.value)}>
              <option value="GTE">≥ (GTE)</option>
              <option value="LTE">≤ (LTE)</option>
              <option value="EQ">= (EQ)</option>
              <option value="BETWEEN">Entre (BETWEEN)</option>
            </Select>
          </label>
        </div>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          {form.targetOperator === 'BETWEEN' ? (
            <>
              <label>Mínimo<Input type="number" value={form.targetMin} onChange={(e) => set('targetMin', e.target.value)} /></label>
              <label>Máximo<Input type="number" value={form.targetMax} onChange={(e) => set('targetMax', e.target.value)} /></label>
            </>
          ) : (
            <label>Valor de meta<Input type="number" value={form.targetValue} onChange={(e) => set('targetValue', e.target.value)} /></label>
          )}
        </div>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Responsable<Input value={form.responsible} onChange={(e) => set('responsible', e.target.value)} /></label>
          <label>Área responsable<Input value={form.responsibleArea} onChange={(e) => set('responsibleArea', e.target.value)} /></label>
        </div>
        <label>Código de catálogo<Input value={form.catalogCode} onChange={(e) => set('catalogCode', e.target.value)} /></label>
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving || !form.code.trim() || !form.name.trim()} onClick={() => void submit()}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}

function MeasurementModal(props: {
  token: string;
  definition: IndicatorDefinition;
  period: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { token, definition, period, onClose, onSaved, onError } = props;
  const today = new Date().toISOString().slice(0, 10);
  const monthEnd = (() => {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, m, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [numerator, setNumerator] = useState('');
  const [denominator, setDenominator] = useState('');
  const [calculatedValue, setCalculatedValue] = useState('');
  const [evidence, setEvidence] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await createIndicatorMeasurement(token, definition._id, {
        indicatorId: definition._id,
        period,
        periodStart: `${period}-01`,
        periodEnd: monthEnd,
        ...(numerator !== '' ? { numerator: Number(numerator) } : {}),
        ...(denominator !== '' ? { denominator: Number(denominator) } : {}),
        ...(calculatedValue !== '' ? { calculatedValue: Number(calculatedValue) } : {}),
        ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError(/closed/i.test(msg) ? 'Este período está cerrado: no admite nuevas mediciones.' : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={`Medición manual — ${definition.code} (${period})`} onClose={onClose}>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
          <label>Numerador<Input type="number" value={numerator} onChange={(e) => setNumerator(e.target.value)} /></label>
          <label>Denominador<Input type="number" value={denominator} onChange={(e) => setDenominator(e.target.value)} /></label>
        </div>
        <label>Valor calculado<Input type="number" value={calculatedValue} onChange={(e) => setCalculatedValue(e.target.value)} /></label>
        <label>Evidencia<Input value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
        <label>Notas / análisis<Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></label>
        <p style={{ margin: 0, color: '#64748b' }}>Período del indicador: {period}-01 → {monthEnd}</p>
        <p style={{ margin: 0, color: '#64748b' }}>Fecha de referencia: {today}</p>
      </div>
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving} onClick={() => void submit()}>{saving ? 'Guardando…' : 'Registrar'}</Button>
      </div>
    </Modal>
  );
}

function CreatePeriodModal(props: {
  saving: boolean;
  onClose: () => void;
  onCreate: (period: string) => void | Promise<void>;
}) {
  const { saving, onClose, onCreate } = props;
  const [period, setPeriod] = useState(getCurrentPeriod());
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  return (
    <Modal isOpen title="Crear período" onClose={onClose}>
      <label>
        Período (YYYY-MM)
        <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-09" />
      </label>
      {!valid ? <p style={{ color: '#dc2626' }}>Formato inválido: use YYYY-MM con mes 01–12.</p> : null}
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={!valid || saving} onClick={() => void onCreate(period)}>
          {saving ? 'Creando…' : 'Crear'}
        </Button>
      </div>
    </Modal>
  );
}
