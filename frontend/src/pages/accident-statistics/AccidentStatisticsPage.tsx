import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchIncidents } from '../../api';
import type { IncidentModel } from '../../types/incidents';
import { getOverview } from '../../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../../types/compliance-dashboard';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedProgressBar,
} from '../../components/advanced-layout';
import { Button } from '../../components/ui/Button';

/**
 * E3 (3.2.3) — Gestión Avanzada del REGISTRO Y ANÁLISIS ESTADÍSTICO de
 * accidentes de trabajo y enfermedades laborales.
 *
 * PROPÓSITO: panel de SOLO LECTURA que consolida visualmente los registros
 * operativos del dominio `Incident` (fuente única — NO se duplican accidentes,
 * NO se crea CRUD paralelo) y presenta el cumplimiento OFICIAL 3.2.3.
 *
 * REGLA DE SCORE: el frontend NO recalcula el cumplimiento. Porcentaje, estado,
 * nivel y las 4 dimensiones (existence / classification / temporalAnalysis /
 * workerPopulation) provienen EXCLUSIVAMENTE de
 * GET /compliance-engine/overview (module === 'accident-statistics',
 * metadata dimensions:v1 del provider oficial). Las métricas de la página
 * (totales, distribución por tipo, agrupación temporal) son PRESENTACIONALES
 * y derivadas de los registros ya cargados — nunca score de cumplimiento.
 *
 * CLASIFICACIÓN: `InvestigationType` del dominio incidents solo define
 * ACCIDENT y DISEASE (E2). NO se inventa una categoría "incidente": los
 * registros sin clasificación se muestran como "Sin clasificación AT/EL".
 *
 * ROLES: lectura owner/admin/manager (backend GET); member sin acceso a la
 * Gestión Avanzada (el router lo redirige/bloquea según patrón vigente).
 * La gestión de registros vive en /incidents (módulo 3.2.1/7.1.3).
 */

interface AccidentStatisticsPageProps {
  token: string;
  role?: string;
}

/** Metadata dimensions:v1 del provider accident-statistics (E2-lite). */
interface AsDimensionDetail {
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
}

interface AsComplianceMetadataV1 {
  semantic?: string;
  standardCode?: string;
  standardTitle?: string;
  formula?: string;
  target?: number;
  weights?: Record<string, number>;
  dimensions?: {
    existence?: AsDimensionDetail;
    classification?: AsDimensionDetail;
    temporalAnalysis?: AsDimensionDetail;
    workerPopulation?: AsDimensionDetail;
  };
  counters?: {
    totalEvents?: number;
    accidentCount?: number;
    diseaseCount?: number;
    unclassifiedCount?: number;
    totalDaysLost?: number;
    distinctMonths?: number;
    workerCount?: number;
  };
}

const AS_MODULE = 'accident-statistics';

const DIMENSION_LABELS: Record<string, string> = {
  existence: 'C1 — Existencia de registros estadísticos',
  classification: 'C2 — Clasificación de eventos (AT/EL)',
  temporalAnalysis: 'C3 — Análisis temporal documentado',
  workerPopulation: 'C4 — Población trabajadora de referencia',
};

const DIMENSION_KEYS = ['existence', 'classification', 'temporalAnalysis', 'workerPopulation'] as const;

/** Type guard defensivo de la metadata dimensions:v1 (sin validar números). */
function isAsComplianceMetadataV1(value: unknown): value is AsComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  return true;
}

/** Ratio 0–1 → % (solo presentación; null = no evaluable). */
function ratioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

export function AccidentStatisticsPage({ token }: AccidentStatisticsPageProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentModel[]>([]);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<AsComplianceMetadataV1 | null>(null);

  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === AS_MODULE) ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isAsComplianceMetadataV1(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === AS_MODULE));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list] = await Promise.all([fetchIncidents(token), loadCompliance()]);
        if (cancelled) return;
        setIncidents(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadCompliance]);

  // ── Métricas PRESENTACIONALES (derivadas de los registros cargados) ──
  const stats = useMemo(() => {
    const total = incidents.length;
    const accidents = incidents.filter((i) => i.investigationType === 'ACCIDENT').length;
    const diseases = incidents.filter((i) => i.investigationType === 'DISEASE').length;
    const unclassified = total - accidents - diseases;
    const daysLost = incidents.reduce((sum, i) => sum + (i.daysLost ?? 0), 0);

    // Agrupación temporal: mensual si el rango es ≤ 24 meses; anual si no.
    const monthly = new Map<string, number>();
    for (const i of incidents) {
      if (!i.date) continue;
      const d = new Date(i.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly.set(key, (monthly.get(key) ?? 0) + 1);
    }
    const monthKeys = [...monthly.keys()].sort();
    const useYearly = monthKeys.length > 24;
    const buckets = useYearly
      ? [...new Set(monthKeys.map((k) => k.slice(0, 4)))].map((year) => ({
          label: year,
          count: monthKeys.filter((k) => k.startsWith(year)).reduce((s, k) => s + (monthly.get(k) ?? 0), 0),
        }))
      : monthKeys.map((k) => {
          const [y, m] = k.split('-');
          return { label: `${m}/${y}`, count: monthly.get(k) ?? 0 };
        });
    const peak = buckets.reduce<{ label: string; count: number } | null>(
      (best, b) => (!best || b.count > best.count ? b : best),
      null,
    );

    const dates = incidents
      .map((i) => (i.date ? new Date(i.date).getTime() : NaN))
      .filter((t) => !Number.isNaN(t));
    const periodFrom = dates.length ? new Date(Math.min(...dates)) : null;
    const periodTo = dates.length ? new Date(Math.max(...dates)) : null;

    return { total, accidents, diseases, unclassified, daysLost, buckets, useYearly, peak, periodFrom, periodTo };
  }, [incidents]);

  const percentage = compliance?.compliance ?? null;
  const status = compliance?.status ?? null;
  const target = metadata?.target;
  const counters = metadata?.counters ?? null;
  const noData = incidents.length === 0;

  const statusBadge = loading ? (
    <span className="badge badge--info">⏳ Cargando…</span>
  ) : compliance === null ? (
    <span className="badge badge--warning">Cumplimiento no disponible</span>
  ) : status === 'NO_DATA' || noData ? (
    <span className="badge badge--warning">Sin datos evaluables</span>
  ) : status === 'TARGET_MET' ? (
    <span className="badge badge--success">✅ Meta alcanzada</span>
  ) : (
    <span className="badge badge--danger">Meta no alcanzada</span>
  );

  const maxBucket = Math.max(1, ...stats.buckets.map((b) => b.count));

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/do"
        backLabel="← Volver a Hacer"
        moduleCode="3.2.3"
        moduleTitle="Registro y análisis estadístico de accidentes y enfermedades laborales"
        description="Consolidación, análisis temporal y trazabilidad de accidentes de trabajo, enfermedades laborales e incidentes."
        statusBadge={statusBadge}
        actions={[
          {
            label: '🔄 Recargar',
            onClick: () => {
              void loadCompliance();
              setIncidents([]);
              setLoading(true);
            },
            variant: 'secondary' as const,
          },
        ]}
        lastSaved={compliance ? `Porcentaje oficial: ${percentage ?? 0}%` : undefined}
      />

      <p className="muted" style={{ marginTop: 0 }}>
        Panel de solo lectura: los registros operativos pertenecen al módulo de accidentes
        (/incidents). Esta Gestión Avanzada los consulta, consolida y presenta el cumplimiento
        oficial — no duplica ni edita accidentes.
      </p>

      {error ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          ⚠️ {error}
        </div>
      ) : null}

      {/* ── FASE 4/14: Resumen estadístico / estado vacío ── */}
      {noData && !loading ? (
        <AdvancedSection
          title="Sin registros estadísticos"
          description="No existen accidentes de trabajo ni enfermedades laborales registrados."
        >
          <div className="card">
            <strong>No hay datos evaluables para 3.2.3.</strong>
            <p style={{ margin: 0 }}>
              El estándar requiere registro y análisis estadístico de accidentalidad. Los registros
              se crean desde el módulo de accidentes (/incidents); al existir registros, este panel
              los consolidará automáticamente.
            </p>
            {findings.map((f) => (
              <p key={f.id} className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
                <strong> hallazgo oficial:</strong> {f.title} — {f.description}
              </p>
            ))}
          </div>
        </AdvancedSection>
      ) : (
        <>
          <AdvancedKpiGrid
            items={[
              { label: 'Total de registros', value: loading ? '…' : String(stats.total), variant: 'info' },
              { label: 'Accidentes de trabajo', value: loading ? '…' : String(stats.accidents), variant: 'warning' },
              { label: 'Enfermedades laborales', value: loading ? '…' : String(stats.diseases), variant: 'danger' },
              { label: 'Días perdidos acumulados', value: loading ? '…' : String(stats.daysLost), variant: 'info' },
            ]}
            columns={4}
          />

          {/* ── FASE 5: Distribución por tipo ── */}
          <AdvancedSection
            title="Distribución de eventos"
            description={
              stats.total > 0
                ? 'Clasificación vigente del dominio: Accidente de trabajo (ACCIDENT) y Enfermedad laboral (DISEASE).'
                : undefined
            }
          >
            {stats.total === 0 ? (
              <p className="muted">Sin registros para distribuir.</p>
            ) : (
              <div style={{ display: 'grid', gap: '.75rem' }}>
                {[
                  { label: 'Accidentes de trabajo', count: stats.accidents, badge: 'badge--warning' },
                  { label: 'Enfermedades laborales', count: stats.diseases, badge: 'badge--danger' },
                  ...(stats.unclassified > 0
                    ? [{ label: 'Sin clasificación AT/EL', count: stats.unclassified, badge: 'badge--info' }]
                    : []),
                ].map((row) => (
                  <div key={row.label} className="card" style={{ padding: '.75rem' }}>
                    <div className="plan-next-action plan-next-action--between" style={{ marginBottom: '.35rem' }}>
                      <strong>{row.label}</strong>
                      <span className={`badge ${row.badge}`}>
                        {row.count} · {Math.round((row.count / stats.total) * 100)}%
                      </span>
                    </div>
                    <AdvancedProgressBar
                      value={Math.round((row.count / stats.total) * 100)}
                      size="sm"
                    />
                  </div>
                ))}
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                  El modelo de eventos (InvestigationType) define ACCIDENT y DISEASE; no existe una
                  categoría "incidente" separada en el contrato actual — los registros sin
                  clasificación se muestran como "Sin clasificación AT/EL".
                </p>
              </div>
            )}
          </AdvancedSection>

          {/* ── FASE 6: Análisis temporal (descriptivo, no cumplimiento) ── */}
          <AdvancedSection
            title="Análisis temporal"
            description={
              stats.buckets.length > 0
                ? `Agrupación ${stats.useYearly ? 'anual' : 'mensual'} · período con más registros: ${
                    stats.peak ? `${stats.peak.label} (${stats.peak.count})` : '—'
                  }`
                : undefined
            }
          >
            {stats.buckets.length === 0 ? (
              <p className="muted">Sin fechas de evento para el análisis temporal.</p>
            ) : (
              <div style={{ display: 'grid', gap: '.4rem' }}>
                {stats.buckets.map((b) => (
                  <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px', gap: '.5rem', alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: '.85rem' }}>{b.label}</span>
                    <AdvancedProgressBar value={Math.round((b.count / maxBucket) * 100)} size="sm" />
                    <span style={{ textAlign: 'right' }}>{b.count}</span>
                  </div>
                ))}
              </div>
            )}
          </AdvancedSection>
        </>
      )}

      {/* ── FASE 7: Cumplimiento oficial (fuente única: moduleCompliance) ── */}
      <AdvancedSection
        title="Cumplimiento oficial — 3.2.3"
        description="Fuente única: ComplianceEngine (accident-statistics, dimensions:v1). El frontend no recalcula."
      >
        {loading ? (
          <p>Cargando…</p>
        ) : compliance === null ? (
          <p>El resultado de cumplimiento no está disponible en este momento.</p>
        ) : status === 'NO_DATA' || noData ? (
          <div className="card">
            <strong>Sin datos evaluables (NO_DATA).</strong>
            <p style={{ margin: 0 }}>
              El estándar no se evalúa hasta que existan registros de accidentalidad. Esto no es un
              incumplimiento ordinario: es la ausencia de datos de entrada.
            </p>
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <strong>
                {percentage ?? 0}% · Estado: {status ?? '—'} · Nivel: {compliance.level}
                {typeof target === 'number' ? ` · Meta: ${target}%` : ''}
              </strong>
              {counters ? (
                <p style={{ margin: 0 }}>
                  Eventos: {counters.totalEvents ?? '—'} ({counters.accidentCount ?? 0} AT ·{' '}
                  {counters.diseaseCount ?? 0} EL) · Sin clasificar: {counters.unclassifiedCount ?? 0} ·{' '}
                  Días perdidos: {counters.totalDaysLost ?? 0} · Meses con registros:{' '}
                  {counters.distinctMonths ?? 0} · Trabajadores: {counters.workerCount ?? 0}
                </p>
              ) : null}
            </div>
            {metadata?.dimensions ? (
              <>
                <h4>Dimensiones oficiales</h4>
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {DIMENSION_KEYS.map((key) => {
                    const dim = metadata.dimensions?.[key];
                    const pct = ratioToPercent(dim?.ratio);
                    return (
                      <div key={key} className="card" style={{ padding: '.75rem' }}>
                        <div className="plan-next-action plan-next-action--between" style={{ marginBottom: '.35rem' }}>
                          <strong>{DIMENSION_LABELS[key]}</strong>
                          <span className={`badge ${pct === null ? 'badge--warning' : pct >= 100 ? 'badge--success' : 'badge--info'}`}>
                            {pct === null ? 'No evaluable' : `${pct}%`} · peso {dim?.weight ?? 25}%
                          </span>
                        </div>
                        <AdvancedProgressBar value={pct ?? 0} showPercentage size="sm" />
                        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                          Numerador: {dim?.numerator ?? '—'} · Denominador: {dim?.denominator ?? '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="muted">El detalle de dimensiones no está disponible.</p>
            )}
          </>
        )}
      </AdvancedSection>

      {/* ── FASE 8: Hallazgos oficiales ── */}
      <AdvancedSection title="Hallazgos y pendientes" description="Findings oficiales del ComplianceEngine — no se generan hallazgos desde el frontend.">
        {findings.length === 0 ? (
          <p>✅ Sin hallazgos para este módulo.</p>
        ) : (
          <ul>
            {findings.map((f) => (
              <li key={f.id} style={{ marginBottom: '.5rem' }}>
                <strong>{f.title}</strong>{' '}
                <span className={`badge ${f.priority === 'HIGH' ? 'badge--danger' : f.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                  {f.priority}
                </span>
                <div>{f.description}</div>
                <div className="muted" style={{ fontSize: '.85rem' }}>Estado: {f.status}</div>
              </li>
            ))}
          </ul>
        )}
      </AdvancedSection>

      {/* ── FASE 9: Trazabilidad del registro estadístico ── */}
      <AdvancedSection
        title="Trazabilidad del registro estadístico"
        description="Incident → clasificación → consolidación estadística → análisis"
      >
        <div className="card">
          <p style={{ margin: 0 }}>
            <strong>Fuente de datos:</strong> módulo de accidentes e incidentes (dominio Incident —
            colección operativa única, sin duplicación).
          </p>
          <p style={{ margin: 0 }}>
            <strong>Período analizado:</strong>{' '}
            {stats.periodFrom && stats.periodTo
              ? `${formatDate(stats.periodFrom.toISOString())} — ${formatDate(stats.periodTo.toISOString())}`
              : '—'}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Registros consolidados:</strong> {stats.total}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Última fecha de evento:</strong> {formatDate(stats.periodTo?.toISOString() ?? null)}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
            La consolidación estadística y el cumplimiento oficial los calcula el backend
            (AccidentStatisticsProvider sobre los registros del tenant); este panel solo los presenta.
          </p>
        </div>
        <div className="actions" style={{ marginTop: '.75rem' }}>
          <Button variant="secondary" onClick={() => navigate('/incidents')}>
            Ir al módulo de accidentes (/incidents)
          </Button>
        </div>
      </AdvancedSection>
    </AdvancedPageLayout>
  );
}
