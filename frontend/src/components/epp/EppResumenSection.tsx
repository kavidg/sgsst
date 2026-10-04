import { useNavigate } from 'react-router-dom';
import {
  isEppComplianceMetadataV2,
  type DashboardFinding,
  type DashboardModuleCompliance,
  type EppComplianceDimensionV2,
  type EppComplianceMetadataV2,
} from '../../types/compliance-dashboard';
import { Card } from '../ui/Card';
import { AdvancedProgressBar } from '../advanced-layout/AdvancedProgressBar';
import { EppActionItem, type EppActionConfig } from './EppActionItem';

/**
 * ETAPA 4 (4.2.6) — Resumen V2 de cumplimiento EPP.
 *
 * PRESENTACIONAL: muestra el resultado OFICIAL del Compliance Engine
 * (moduleCompliance['epp-compliance'] + findings del overview).
 * NO recalcula score, pesos, dimensiones ni porcentajes. La metadata V2 se
 * interpreta solo para presentación: ratio 0–1 × 100 SOLO visual (el valor
 * recibido no se muta ni se reenvía); ratio null = "No evaluable" (nunca 0).
 * Sin metadata V2 sigue mostrando el score oficial con una nota aclaratoria;
 * sin resultado para 'epp-compliance' muestra estado vacío (nunca 0%).
 */

// ============================================================
// LABELS (espejo de los códigos reales del provider EPP)
// ============================================================

/** Labels humanos para los contadores REALES de epp-scoring.ts (EppScoreCounters). */
const COUNTER_LABELS: Record<string, string> = {
  catalogItems: 'Ítems de catálogo',
  catalogActive: 'Ítems de catálogo activos',
  jobProfilesActive: 'Cargos (JobProfiles) activos',
  jobProfilesWithWorkers: 'Cargos activos con trabajadores',
  jobProfilesWithMatrix: 'Cargos con matriz EPP válida',
  jobProfilesWithoutMatrix: 'Cargos sin matriz EPP',
  inactiveItemReferences: 'Referencias a EPP inactivo',
  workersWithRequirements: 'Trabajadores con requisitos EPP',
  fullyCoveredWorkers: 'Trabajadores completamente cubiertos',
  workersWithoutJobProfile: 'Trabajadores sin cargo estructurado',
  workersWithInactiveJobProfile: 'Trabajadores con cargo inactivo',
  applicableRequirements: 'Requisitos EPP aplicables',
  coveredRequirements: 'Requisitos EPP cubiertos',
  activeDeliveries: 'Entregas activas',
  activeValidDeliveries: 'Entregas activas vigentes y en buen estado',
  overdue: 'Entregas con reposición vencida',
  replaced: 'Entregas reemplazadas',
  returned: 'Entregas devueltas',
  damaged: 'Entregas dadas de baja por daño',
  withEvidence: 'Entregas con evidencia',
  traceable: 'Entregas trazables',
  deficientCondition: 'Entregas en condición deficiente',
  severeCondition: 'Entregas en condición severa',
  deliveriesOutsideApplicability: 'Entregas fuera de matriz',
  activeRequiringAction: 'Entregas que requieren acción',
};

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  program: 'Cargos activos con matriz EPP válida y definida.',
  coverage: 'Requisitos EPP cubiertos sobre los aplicables según cargo.',
  validityCondition: 'Vigencia y condición física de las entregas activas.',
  traceability: 'Trazabilidad y evidencia de las entregas.',
};

const DIMENSION_ORDER = ['program', 'coverage', 'validityCondition', 'traceability'] as const;
const DIMENSION_NAMES: Record<(typeof DIMENSION_ORDER)[number], string> = {
  program: 'Programa',
  coverage: 'Cobertura (M2)',
  validityCondition: 'Condición / Vigencia',
  traceability: 'Trazabilidad',
};

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// ============================================================
// HELPERS (solo presentación; ningún cálculo de score)
// ============================================================

/** ratio 0–1 → porcentaje SOLO para presentación. null → null (no evaluable). */
const ratioToPercent = (ratio: number | null | undefined): number | null =>
  typeof ratio === 'number' && Number.isFinite(ratio) ? Math.round(ratio * 100) : null;

const fmtDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO');
};

// ============================================================
// PROPS
// ============================================================

export interface EppResumenSectionProps {
  /** Resultado OFICIAL del overview para module 'epp-compliance' (o null). */
  compliance: DashboardModuleCompliance | null;
  /** Hallazgos del overview correspondientes al módulo EPP. */
  findings: DashboardFinding[];
  loading?: boolean;
  /** Rol del usuario (adaptar acciones disponibles; sin consultas extra). */
  role?: string;
  /**
   * Callback opcional para abrir una pestaña de la página EPP desde un
   * hallazgo (navegación interna segura; sin rutas nuevas). Si no se pasa,
   * el hallazgo se muestra sin acción.
   */
  onOpenTab?: (tabId: 'entregas' | 'matriz' | 'catalogo' | 'trabajadores') => void;
}

// ============================================================
// COMPONENTE
// ============================================================

export function EppResumenSection({ compliance, findings, loading = false, role, onOpenTab }: EppResumenSectionProps) {
  const navigate = useNavigate();
  const metadata: EppComplianceMetadataV2 | null =
    compliance && isEppComplianceMetadataV2(compliance.metadata) ? compliance.metadata : null;

  // Helper de lectura segura de contadores V2 (nunca recalcular en frontend).
  const counter = (key: string): number | undefined => {
    const v = metadata?.counters?.[key];
    return typeof v === 'number' ? v : undefined;
  };

  // Edge case D: counters vacío o sin valores numéricos → NO renderizar la sección.
  const counterEntries = Object.entries(metadata?.counters ?? {}).filter(
    ([, value]) => typeof value === 'number',
  );

  if (loading) {
    return (
      <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ margin: 0 }}>Cargando resultado del motor de cumplimiento…</p>
      </Card>
    );
  }

  // Sin moduleCompliance epp-compliance: estado vacío — NUNCA 0%.
  if (!compliance) {
    return (
      <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ margin: '0 0 .25rem', fontWeight: 600 }}>Resumen de cumplimiento — 4.2.6 EPP</p>
        <p className="muted" style={{ margin: 0 }}>Sin resultado disponible para 4.2.6.</p>
      </Card>
    );
  }

  const sortedFindings = [...findings].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
  );

  // ── Acciones requeridas (solo findings reales; sin scoring nuevo) ──
  // member: sin acciones de configuración ni acceso a entregas.
  const canConfigure = role !== 'member';
  const canSeeDeliveries = role !== 'member';
  const actionByFinding = (f: DashboardFinding): EppActionConfig | null => {
    switch (f.id) {
      case 'epp-jobprofile-without-matrix':
        return canConfigure ? { title: 'Cargos sin matriz EPP', description: 'Define qué EPP requiere cada cargo para que la cobertura pueda evaluarse.', counterValue: counter('jobProfilesWithoutMatrix'), actionLabel: 'Definir matriz', onAction: () => onOpenTab?.('matriz') } : null;
      case 'epp-worker-without-job-profile':
        return canConfigure ? { title: 'Trabajadores sin cargo estructurado', description: 'Asigna un cargo a cada trabajador activo para derivar sus requisitos EPP.', counterValue: counter('workersWithoutJobProfile'), actionLabel: 'Configurar cargos', onAction: () => navigate('/job-profiles') } : null;
      case 'epp-worker-inactive-job-profile':
        return canConfigure ? { title: 'Trabajadores con cargo inactivo', description: 'El cargo asignado no existe o está inactivo: revisa y reactiva o reasigna.', counterValue: counter('workersWithInactiveJobProfile'), actionLabel: 'Revisar cargos', onAction: () => navigate('/job-profiles') } : null;
      case 'epp-inactive-item-reference':
        return canConfigure ? { title: 'Referencias de EPP inactivas', description: 'La matriz referencia elementos inactivos del catálogo: revisa el catálogo o la matriz.', counterValue: counter('inactiveItemReferences'), actionLabel: 'Revisar catálogo', onAction: () => onOpenTab?.('catalogo') } : null;
      case 'epp-low-coverage':
        return canSeeDeliveries ? { title: 'Cobertura EPP insuficiente', description: 'Existen requisitos EPP sin entrega vigente. Identifica los trabajadores afectados.', actionLabel: 'Ver trabajadores', onAction: () => onOpenTab?.('trabajadores') } : null;
      case 'epp-overdue':
        return canSeeDeliveries ? { title: 'Entregas vencidas', description: 'Entregas activas cuya reposición esperada ya pasó: registra la reposición o actualiza la fecha.', counterValue: counter('overdue'), actionLabel: 'Revisar entregas', onAction: () => onOpenTab?.('entregas') } : null;
      case 'epp-condition':
        return canSeeDeliveries ? { title: 'Condiciones de EPP por revisar', description: 'Entregas activas en condición Regular, Mala o Dañada que requieren revisión o reposición.', counterValue: counter('deficientCondition'), actionLabel: 'Revisar entregas', onAction: () => onOpenTab?.('entregas') } : null;
      case 'epp-missing-evidence':
        return canSeeDeliveries ? { title: 'Entregas sin evidencia', description: 'Entregas evaluables sin acta, firma o foto adjunta: completa la evidencia del evento.', actionLabel: 'Revisar entregas', onAction: () => onOpenTab?.('entregas') } : null;
      case 'epp-delivery-outside-matrix':
        return canSeeDeliveries ? { title: 'Entregas fuera de matriz', description: 'Entregas registradas para EPP no requeridos actualmente en el cargo del trabajador.', counterValue: counter('deliveriesOutsideApplicability'), actionLabel: 'Revisar entregas', onAction: () => onOpenTab?.('entregas'), note: 'Señal de revisión. No afecta directamente la cobertura M2 ni el puntaje.' } : null;
      default:
        return null;
    }
  };

  // Acciones: findings con mapeo seguro a una operación real. Los demás
  // (p. ej. epp-no-data, epp-no-program) siguen visibles como información
  // en el bloque "Otros hallazgos" — nunca se fuerzan a una acción inventada.
  const actionItems = sortedFindings
    .map((f) => ({ finding: f, config: actionByFinding(f) }))
    .filter((x): x is { finding: DashboardFinding; config: EppActionConfig } => x.config !== null);
  const informationalFindings = sortedFindings.filter(
    (f) => !actionItems.some((a) => a.finding.id === f.id),
  );

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* ── A. ENCABEZADO + B. SCORE OFICIAL ── */}
      <Card style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <h4 style={{ margin: 0 }}>Resumen de cumplimiento — 4.2.6 EPP</h4>
            <p className="muted" style={{ margin: '.15rem 0 0', fontSize: '.85rem' }}>
              Resultado oficial del motor de cumplimiento · <span className="badge badge--info">Fuente: Compliance Engine</span>
            </p>
          </div>
          {compliance.status && (
            <span className={`badge ${compliance.status === 'TARGET_MET' ? 'badge--success' : compliance.status === 'NO_DATA' ? 'badge--warning' : 'badge--warning'}`}>
              {compliance.status === 'TARGET_MET' ? '✅ Meta cumplida' : compliance.status === 'NO_DATA' ? 'Sin datos suficientes' : '⚠ Cumplimiento por mejorar'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', margin: '1rem 0 .5rem' }}>
          <span style={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1 }}>{compliance.compliance}%</span>
          <span className={`badge ${compliance.level === 'EXCELLENT' || compliance.level === 'HIGH' ? 'badge--success' : compliance.level === 'MEDIUM' ? 'badge--warning' : 'badge--danger'}`}>
            Nivel: {compliance.level}
          </span>
        </div>
        <AdvancedProgressBar value={Math.max(0, Math.min(100, compliance.compliance))} showPercentage />

        {/* Sin metadata V2: score oficial + nota. Sin dimensiones artificiales. */}
        {!metadata && (
          <p className="muted" style={{ margin: '.75rem 0 0', fontSize: '.85rem' }}>
            El detalle dimensional V2 no está disponible para este resultado.
          </p>
        )}
      </Card>

      {/* ── C. DIMENSIONES V2 ── */}
      {metadata?.dimensions && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '.75rem' }}>
            {DIMENSION_ORDER.map((key) => {
              const dim = metadata.dimensions?.[key] as EppComplianceDimensionV2 | undefined;
              const weight = metadata.weights?.[key];
              const pct = ratioToPercent(dim?.ratio);
              return (
                <Card key={key} style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{DIMENSION_NAMES[key]}</strong>
                    {typeof weight === 'number' && <span className="badge badge--info">Peso {weight}%</span>}
                  </div>
                  <p style={{ margin: '.5rem 0', fontSize: '1.5rem', fontWeight: 700 }}>
                    {pct === null ? <span className="muted">No evaluable</span> : `${pct}%`}
                  </p>
                  <AdvancedProgressBar value={pct ?? 0} showPercentage={false} />
                  <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
                    {dim?.numerator ?? '—'} / {dim?.denominator ?? '—'}
                    {DIMENSION_DESCRIPTIONS[key] ? ` — ${DIMENSION_DESCRIPTIONS[key]}` : ''}
                  </p>
                </Card>
              );
            })}
          </div>

          {/* ── D. COBERTURA M2 / M1 ── */}
          {metadata.dimensions.coverage && (
            <Card style={{ padding: '1rem', marginTop: '.75rem' }}>
              <strong>Cobertura de requisitos (M2)</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
                <div><span className="label">Requisitos aplicables</span><p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{metadata.dimensions.coverage.applicableRequirements ?? '—'}</p></div>
                <div><span className="label">Requisitos cubiertos</span><p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{metadata.dimensions.coverage.coveredRequirements ?? '—'}</p></div>
                <div><span className="label">Trabajadores con requisitos</span><p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{metadata.dimensions.coverage.workersWithRequirements ?? '—'}</p></div>
                <div><span className="label">Trabajadores completamente cubiertos</span><p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{metadata.dimensions.coverage.fullyCoveredWorkers ?? '—'}</p></div>
              </div>
              {/* Edge case F: workersWithoutJobProfile = 0 DEBE mostrarse (sin truthiness). */}
              {typeof metadata.dimensions.coverage.workersWithoutJobProfile === 'number' && (
                <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
                  {metadata.dimensions.coverage.workersWithoutJobProfile > 0
                    ? `⚠ Calidad de datos: ${metadata.dimensions.coverage.workersWithoutJobProfile} trabajador(es) sin cargo estructurado.`
                    : 'Calidad de datos: 0 trabajadores sin cargo estructurado.'}
                </p>
              )}
              {typeof metadata.dimensions.coverage.fullyCoveredWorkers === 'number'
                && typeof metadata.dimensions.coverage.workersWithRequirements === 'number'
                && metadata.dimensions.coverage.workersWithRequirements > 0 && (
                <p className="muted" style={{ margin: '.35rem 0 0', fontSize: '.8rem' }}>
                  Indicador complementario M1: {metadata.dimensions.coverage.fullyCoveredWorkers} de {metadata.dimensions.coverage.workersWithRequirements} trabajadores completamente cubiertos (informativo; no afecta el score).
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── E. CONTADORES V2 (solo los que existen; nunca sección vacía) ── */}
      {counterEntries.length > 0 && (
        <Card style={{ padding: '1rem' }}>
          <strong>Contadores operativos</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
            {counterEntries.map(([key, value]) => (
              <div key={key}>
                <span className="label">{COUNTER_LABELS[key] ?? key}</span>
                <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── F. ACCIONES REQUERIDAS (centro de acciones sobre findings reales) ── */}
      <Card style={{ padding: '1rem' }}>
        <strong>Acciones requeridas ({actionItems.length})</strong>
        <p className="muted" style={{ margin: '.15rem 0 0', fontSize: '.78rem' }}>
          Recomendaciones operativas derivadas de hallazgos del Compliance Engine. El score oficial no se recalcula aquí.
        </p>
        {actionItems.length === 0 ? (
          <p className="muted" style={{ margin: '.5rem 0 0' }}>Sin acciones pendientes para 4.2.6.</p>
        ) : (
          <div style={{ display: 'grid', gap: '.5rem', marginTop: '.5rem' }}>
            {actionItems.map(({ finding, config }) => (
              <EppActionItem key={finding.id} finding={finding} config={config} />
            ))}
          </div>
        )}
        {informationalFindings.length > 0 && (
          <div style={{ marginTop: '.75rem', borderTop: '1px solid #edf2f7', paddingTop: '.5rem' }}>
            <span className="label">Otros hallazgos (solo información)</span>
            {informationalFindings.map((f) => (
              <p key={f.id} style={{ margin: '.25rem 0 0', fontSize: '.8rem' }}>
                <span className="badge">{f.priority}</span>{' '}
                <strong>{f.title}</strong> — {f.description}
              </p>
            ))}
          </div>
        )}
      </Card>

      {/* ── G. ÚLTIMA ACTUALIZACIÓN ── */}
      <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
        Última actualización: {fmtDate(compliance.lastUpdated)}
      </p>
    </div>
  );
}
