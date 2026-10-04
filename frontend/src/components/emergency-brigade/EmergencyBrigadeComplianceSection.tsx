import type {
  DashboardFinding,
  DashboardModuleCompliance,
} from '../../types/compliance-dashboard';
import {
  isEmergencyBrigadeComplianceMetadataV1,
  readDimensionBoolean,
  readDimensionNumber,
  readDimensionString,
  readDimensionStringArray,
  type EmergencyBrigadeComplianceDimensionV1,
  type EmergencyBrigadeComplianceMetadataV1,
} from '../../types/emergency-brigade-compliance';
import { Card } from '../ui/Card';
import { AdvancedProgressBar } from '../advanced-layout/AdvancedProgressBar';
import { EmergencyBrigadeActionItem, type EmergencyBrigadeActionConfig } from './EmergencyBrigadeActionItem';

/**
 * 5.1.2 — Resumen de cumplimiento oficial de la Brigada de emergencia.
 *
 * PRESENTACIONAL: muestra el resultado OFICIAL del Compliance Engine
 * (moduleCompliance.module === 'emergency-brigade' + findings del overview).
 * NO recalcula score, pesos, dimensiones ni porcentajes. La metadata V1 se
 * interpreta solo para presentación: ratio 0–1 × 100 SOLO visual (nunca se
 * usa para modificar el score); ratio null = "No evaluable" (nunca 0).
 * Sin metadata V1 sigue mostrando el score oficial con una nota aclaratoria;
 * sin resultado para 'emergency-brigade' muestra estado vacío (nunca 0%).
 *
 * NO_DATA: no se muestra "0% de cumplimiento" como evaluación normal; se
 * muestra un estado explícito "Sin datos evaluables" con contexto tomado de
 * los findings oficiales.
 *
 * FRONTERA 5.1.1: esta sección solo muestra findings con module
 * 'emergency-brigade' (el filtrado lo hace la página). No incluye simulacros,
 * extintores, rutas, puntos de encuentro ni plan de emergencias (5.1.1).
 */

// ============================================================
// LABELS (espejo de los nombres reales de emergency-brigade-scoring.ts)
// ============================================================

/** Orden y pesos OFICIALES de las 7 dimensiones (EMERGENCY_BRIGADE_SCORE_WEIGHTS). */
const DIMENSION_ORDER = [
  'existence',
  'composition',
  'functionalCoverage',
  'training',
  'alternates',
  'traceability',
  'operation',
] as const;

const DIMENSION_NAMES: Record<(typeof DIMENSION_ORDER)[number], string> = {
  existence: 'Existencia',
  composition: 'Composición',
  functionalCoverage: 'Cobertura funcional',
  training: 'Capacitación',
  alternates: 'Alternos',
  traceability: 'Trazabilidad',
  operation: 'Operación',
};

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  existence: 'Brigada activa con nombre registrado.',
  composition: 'Brigadistas activos válidos sobre el total de brigadistas activos.',
  functionalCoverage: 'Titulares para funciones núcleo (EVACUATION, FIRST_AID, FIREFIGHTING) más líder.',
  training: 'Titulares con fecha de capacitación válida (no futura) y evidencia.',
  alternates: 'Funciones núcleo con alterno activo.',
  traceability: 'Brigadistas con employeeId válido, snapshot de nombre y función documentada.',
  operation: 'Última reunión de brigada registrada y no futura.',
};

/** Labels humanos para los contadores REALES del backend (EmergencyBrigadeScoreBreakdown.counters). */
const COUNTER_LABELS: Record<string, string> = {
  brigadesPresent: 'Brigadas registradas',
  activeBrigades: 'Brigadas activas',
  brigadesNamed: 'Brigadas con nombre',
  activeMembers: 'Brigadistas activos',
  validMembers: 'Brigadistas válidos',
  leaders: 'Líderes',
  alternates: 'Alternos (suplentes)',
  evacuationMembers: 'Evacuación',
  firstAidMembers: 'Primeros auxilios',
  firefightingMembers: 'Contra incendio',
  communicationMembers: 'Comunicaciones',
  logisticsMembers: 'Logística',
  trainedMembers: 'Capacitados',
  trainedWithEvidence: 'Con evidencia de capacitación',
  membersWithoutTraining: 'Sin capacitación',
  membersWithFutureTrainingDate: 'Fechas de capacitación futuras',
  duplicateEmployees: 'Brigadistas duplicados',
  membersWithoutEmployee: 'Sin empleado asociado',
  membersWithInvalidFunction: 'Con función inválida',
  traceableMembers: 'Trazables',
  coreFunctionsWithAlternate: 'Funciones núcleo con alterno',
  evacuationAlternates: 'Alterno de evacuación',
  firstAidAlternates: 'Alterno de primeros auxilios',
  firefightingAlternates: 'Alterno contra incendio',
  lastMeetingDatePresent: 'Con reunión registrada',
  lastMeetingDateFuture: 'Con fecha de reunión futura',
};

/** Grupos visuales de contadores (solo los que existen en el backend). */
const COUNTER_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Brigadas', keys: ['brigadesPresent', 'activeBrigades', 'brigadesNamed'] },
  { title: 'Integrantes', keys: ['activeMembers', 'validMembers', 'leaders', 'alternates'] },
  { title: 'Funciones', keys: ['evacuationMembers', 'firstAidMembers', 'firefightingMembers', 'communicationMembers', 'logisticsMembers'] },
  { title: 'Capacitación', keys: ['trainedMembers', 'trainedWithEvidence', 'membersWithoutTraining', 'membersWithFutureTrainingDate'] },
  { title: 'Integridad', keys: ['duplicateEmployees', 'membersWithoutEmployee', 'membersWithInvalidFunction', 'traceableMembers'] },
];

/** Funciones núcleo OFICIALES (CORE_FUNCTIONS del backend). */
const CORE_FUNCTION_LABELS: Record<string, string> = {
  EVACUATION: 'Evacuación',
  FIRST_AID: 'Primeros auxilios',
  FIREFIGHTING: 'Contra incendio',
};

/** Labels informativos de composición (NO son funciones núcleo obligatorias). */
const OTHER_FUNCTION_LABELS: Record<string, string> = {
  COMMUNICATION: 'Comunicaciones',
  LOGISTICS: 'Logística',
  OTHER: 'Otra',
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

const fmtFunctionList = (codes: string[] | undefined): string => {
  if (!codes || codes.length === 0) return '—';
  return codes
    .map((code) => CORE_FUNCTION_LABELS[code] ?? OTHER_FUNCTION_LABELS[code] ?? code)
    .join(', ');
};

// ============================================================
// PROPS
// ============================================================

export interface EmergencyBrigadeComplianceSectionProps {
  /** Resultado OFICIAL del overview para module 'emergency-brigade' (o null). */
  compliance: DashboardModuleCompliance | null;
  /** Hallazgos del overview filtrados por module 'emergency-brigade'. */
  findings: DashboardFinding[];
  loading?: boolean;
  /** Rol del usuario (member = sin acciones de escritura; sin consultas extra). */
  role?: string;
  /**
   * Callback para abrir el tab 'brigadas' de /emergencies desde un hallazgo
   * (navegación interna existente; sin rutas nuevas). Si no se pasa, el
   * hallazgo se muestra sin acción.
   */
  onOpenBrigadesTab?: () => void;
}

// ============================================================
// COMPONENTE
// ============================================================

export function EmergencyBrigadeComplianceSection({
  compliance,
  findings,
  loading = false,
  role,
  onOpenBrigadesTab,
}: EmergencyBrigadeComplianceSectionProps) {
  const metadata: EmergencyBrigadeComplianceMetadataV1 | null =
    compliance && isEmergencyBrigadeComplianceMetadataV1(compliance.metadata) ? compliance.metadata : null;

  // Helper de lectura segura de contadores V1 (nunca recalcular en frontend).
  const counter = (key: string): number | undefined => {
    const v = metadata?.counters?.[key];
    return typeof v === 'number' ? v : undefined;
  };

  if (loading) {
    return (
      <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ margin: 0 }}>Cargando resultado del motor de cumplimiento…</p>
      </Card>
    );
  }

  // Sin moduleCompliance emergency-brigade: estado vacío — NUNCA 0%.
  if (!compliance) {
    return (
      <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ margin: '0 0 .25rem', fontWeight: 600 }}>Cumplimiento SG-SST — 5.1.2 Brigada de emergencia</p>
        <p className="muted" style={{ margin: 0 }}>Sin resultado disponible para 5.1.2.</p>
      </Card>
    );
  }

  const isNoData = compliance.status === 'NO_DATA';

  const sortedFindings = [...findings].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
  );

  // ── Acciones requeridas (solo findings reales; sin scoring nuevo) ──
  // member: sin botones de escritura — los hallazgos quedan informativos.
  // Todas las acciones navegan al tab 'brigadas' existente (sin rutas nuevas).
  const canConfigure = role !== 'member';
  const actionByFinding = (f: DashboardFinding): EmergencyBrigadeActionConfig | null => {
    if (!canConfigure) return null;
    const goBrigades = (): EmergencyBrigadeActionConfig => ({
      title: '',
      description: '',
      actionLabel: 'Ir a Brigadas',
      onAction: () => onOpenBrigadesTab?.(),
    });
    switch (f.id) {
      case 'emergency-brigade-no-data':
        return { ...goBrigades(), title: 'Sin brigada de emergencia', description: 'Cree y active la brigada de emergencia para que el estándar pueda evaluarse.' };
      case 'emergency-brigade-no-active-brigade':
        return { ...goBrigades(), title: 'Brigadas desactivadas', description: 'Active una brigada existente o cree la vigente: sin brigada activa no hay evaluación posible.' };
      case 'emergency-brigade-no-members':
        return { ...goBrigades(), title: 'Brigada sin brigadistas', description: 'Agregue brigadistas titulares desde el módulo de empleados para conformar la brigada.' };
      case 'emergency-brigade-invalid-members':
        return { ...goBrigades(), title: 'Brigadistas con integridad incompleta', description: 'Revise employeeId, función y observaciones de los brigadistas: los registros inválidos no puntúan.' };
      case 'emergency-brigade-duplicates':
        return { ...goBrigades(), title: 'Brigadistas duplicados', description: 'El mismo empleado está registrado más de una vez en la misma brigada; elimine el duplicado.', counterValue: counter('duplicateEmployees') };
      case 'emergency-brigade-no-leader':
        return { ...goBrigades(), title: 'Falta líder de brigada', description: 'Registre un brigadista titular activo con función LEADER: la autoridad se define por la función, no por el campo de texto.' };
      case 'emergency-brigade-core-functions-incomplete':
        return { ...goBrigades(), title: 'Funciones núcleo sin titular', description: 'La cobertura estructural exige titulares para Evacuación, Primeros auxilios y Contra incendio; un alterno no sustituye al titular.' };
      case 'emergency-brigade-training-incomplete':
        return { ...goBrigades(), title: 'Titulares sin capacitación vigente', description: 'Registre la fecha de capacitación (no futura) de cada brigadista titular.', counterValue: counter('membersWithoutTraining') };
      case 'emergency-brigade-training-evidence-missing':
        return { ...goBrigades(), title: 'Capacitaciones sin evidencia', description: 'Adjunte la evidencia (URL) de la capacitación de los brigadistas capacitados.' };
      case 'emergency-brigade-alternates-incomplete':
        return { ...goBrigades(), title: 'Funciones núcleo sin alterno', description: 'La redundancia operacional exige al menos un alterno activo por función núcleo.', counterValue: counter('coreFunctionsWithAlternate') };
      case 'emergency-brigade-meeting-overdue':
        return { ...goBrigades(), title: 'Reunión de brigada sin registrar', description: 'Registre la última reunión de operación de la brigada activa (fecha válida y no futura).' };
      case 'emergency-brigade-integrity':
        return { ...goBrigades(), title: 'Calidad de registro mejorable', description: 'Complete el snapshot de nombre y las observaciones de la función OTHER para mejorar la trazabilidad.' };
      default:
        return null;
    }
  };

  // Acciones: findings con mapeo seguro al tab real. Los demás (p. ej.
  // emergency-brigade-no-data cuando member) siguen visibles como información
  // — nunca se fuerzan a una acción inventada.
  const actionItems = sortedFindings
    .map((f) => ({ finding: f, config: actionByFinding(f) }))
    .filter((x): x is { finding: DashboardFinding; config: EmergencyBrigadeActionConfig } => x.config !== null);
  const informationalFindings = sortedFindings.filter(
    (f) => !actionItems.some((a) => a.finding.id === f.id),
  );

  // ── Dimensiones (presentación) ──
  const dimensions = metadata?.dimensions;
  const functionalDim = dimensions?.functionalCoverage as EmergencyBrigadeComplianceDimensionV1 | undefined;
  const trainingDim = dimensions?.training as EmergencyBrigadeComplianceDimensionV1 | undefined;
  const alternatesDim = dimensions?.alternates as EmergencyBrigadeComplianceDimensionV1 | undefined;
  const traceabilityDim = dimensions?.traceability as EmergencyBrigadeComplianceDimensionV1 | undefined;
  const operationDim = dimensions?.operation as EmergencyBrigadeComplianceDimensionV1 | undefined;

  const leaderPresent = readDimensionBoolean(functionalDim, 'leaderPresent');
  const coreFunctionsWithTitular = readDimensionStringArray(functionalDim, 'coreFunctionsWithTitular');
  const missingCoreFunctions = readDimensionStringArray(functionalDim, 'missingCoreFunctions');
  const communicationMembers = readDimensionNumber(functionalDim, 'communicationMembers');
  const logisticsMembers = readDimensionNumber(functionalDim, 'logisticsMembers');

  const activeTitularMembers = readDimensionNumber(trainingDim, 'activeTitularMembers');
  const trainedTitulars = readDimensionNumber(trainingDim, 'trainedMembers');
  const trainedWithEvidenceDim = readDimensionNumber(trainingDim, 'trainedWithEvidence');
  const futureTrainingDates = readDimensionNumber(trainingDim, 'futureTrainingDates');
  const trainingTypeDocumented = readDimensionNumber(trainingDim, 'trainingTypeDocumented');

  const alternatesCount = readDimensionNumber(alternatesDim, 'alternates');
  const coreFunctionsWithAlternate = readDimensionStringArray(alternatesDim, 'coreFunctionsWithAlternate');

  const missingSnapshot = readDimensionNumber(traceabilityDim, 'missingSnapshot');
  const otherWithoutObservations = readDimensionNumber(traceabilityDim, 'otherWithoutObservations');

  const latestMeetingDate = readDimensionString(operationDim, 'latestMeetingDate');
  const futureMeetingDates = readDimensionNumber(operationDim, 'futureMeetingDates');
  const meetingFrequencies = readDimensionStringArray(operationDim, 'meetingFrequency');

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* ── A. ENCABEZADO + SCORE OFICIAL ── */}
      <Card style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <h4 style={{ margin: 0 }}>Cumplimiento SG-SST — 5.1.2 Brigada de emergencia</h4>
            <p className="muted" style={{ margin: '.15rem 0 0', fontSize: '.85rem' }}>
              Resultado oficial del motor de cumplimiento · <span className="badge badge--info">Fuente: Compliance Engine</span>
            </p>
          </div>
          {compliance.status && (
            <span className={`badge ${compliance.status === 'TARGET_MET' ? 'badge--success' : 'badge--warning'}`}>
              {compliance.status === 'TARGET_MET'
                ? '✅ Meta cumplida'
                : compliance.status === 'NO_DATA'
                  ? 'Sin datos evaluables'
                  : '⚠ Cumplimiento por mejorar'}
            </span>
          )}
        </div>

        {isNoData ? (
          /* NO_DATA: estado explícito — NUNCA "0% de cumplimiento" normal. */
          <div style={{ margin: '1rem 0 .25rem' }}>
            <p style={{ margin: '0 0 .35rem', fontSize: '1.5rem', fontWeight: 700 }}>Sin datos evaluables</p>
            <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
              No existe una brigada de emergencia activa evaluable. Registre y active una brigada con brigadistas
              en el tab Brigadas para que el estándar 5.1.2 pueda evaluarse.
            </p>
            {sortedFindings.length > 0 && (
              <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
                {sortedFindings.map((f) => f.title).join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '.75rem', margin: '1rem 0 .5rem' }}>
              {/* Porcentaje OFICIAL: tal cual lo entrega el backend (sin redondeos). */}
              <span style={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1 }}>{compliance.compliance}%</span>
              <span className={`badge ${compliance.level === 'EXCELLENT' || compliance.level === 'HIGH' ? 'badge--success' : compliance.level === 'MEDIUM' ? 'badge--warning' : 'badge--danger'}`}>
                Nivel: {compliance.level}
              </span>
            </div>
            <AdvancedProgressBar value={Math.max(0, Math.min(100, compliance.compliance))} showPercentage />
          </>
        )}

        {/* Sin metadata V1: score oficial + nota. Sin dimensiones artificiales. */}
        {!metadata && !isNoData && (
          <p className="muted" style={{ margin: '.75rem 0 0', fontSize: '.85rem' }}>
            El detalle dimensional V1 no está disponible para este resultado.
          </p>
        )}
      </Card>

      {/* ── B. LAS 7 DIMENSIONES OFICIALES (solo evaluación normal) ── */}
      {metadata?.dimensions && !isNoData && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '.75rem' }}>
            {DIMENSION_ORDER.map((key) => {
              const dim = dimensions?.[key] as EmergencyBrigadeComplianceDimensionV1 | undefined;
              const weight = metadata.weights?.[key];
              const pct = ratioToPercent(dim?.ratio);
              return (
                <Card key={key} style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{DIMENSION_NAMES[key]}</strong>
                    {/* Peso INFORMATIVO: nunca se usa para recalcular. */}
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

          {/* ── C. DETALLE DE COBERTURA FUNCIONAL ── */}
          <Card style={{ padding: '1rem', marginTop: '.75rem' }}>
            <strong>Cobertura funcional — funciones núcleo</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
              <div>
                <span className="label">Líder (LEADER) presente</span>
                <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>
                  {leaderPresent === undefined ? '—' : leaderPresent ? '✅ Sí' : '❌ No'}
                </p>
              </div>
              <div>
                <span className="label">Funciones núcleo con titular</span>
                <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{fmtFunctionList(coreFunctionsWithTitular)}</p>
              </div>
              <div>
                <span className="label">Funciones núcleo faltantes</span>
                <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{fmtFunctionList(missingCoreFunctions)}</p>
              </div>
            </div>
            {/* Composición informativa: NO son funciones núcleo obligatorias. */}
            {(communicationMembers !== undefined || logisticsMembers !== undefined) && (
              <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
                Composición complementaria (informativa, no obligatoria): comunicaciones {communicationMembers ?? '—'} ·
                logística {logisticsMembers ?? '—'} brigadista(s).
              </p>
            )}
          </Card>

          {/* ── D. DETALLE DE CAPACITACIÓN ── */}
          {trainingDim && (
            <Card style={{ padding: '1rem', marginTop: '.75rem' }}>
              <strong>Capacitación de brigadistas</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
                <div>
                  <span className="label">Integrantes titulares</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{activeTitularMembers ?? '—'}</p>
                </div>
                <div>
                  <span className="label">Titulares capacitados</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{trainedTitulars ?? '—'}</p>
                </div>
                <div>
                  <span className="label">Con evidencia</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{trainedWithEvidenceDim ?? '—'}</p>
                </div>
                <div>
                  <span className="label">Tipo de capacitación documentado</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{trainingTypeDocumented ?? '—'}</p>
                </div>
              </div>
              {/* Calidad de datos: 0 DEBE mostrarse (sin truthiness). */}
              {futureTrainingDates !== undefined && (
                <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
                  {futureTrainingDates > 0
                    ? `⚠ ${futureTrainingDates} fecha(s) de capacitación son futuras y no cuentan para el score.`
                    : 'Calidad de datos: 0 fechas de capacitación futuras.'}
                </p>
              )}
            </Card>
          )}

          {/* ── E. DETALLE DE ALTERNOS ── */}
          {alternatesDim && (
            <Card style={{ padding: '1rem', marginTop: '.75rem' }}>
              <strong>Cobertura de alternos (redundancia operacional)</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
                <div>
                  <span className="label">Alternos registrados</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{alternatesCount ?? '—'}</p>
                </div>
                <div>
                  <span className="label">Funciones núcleo con alterno</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{fmtFunctionList(coreFunctionsWithAlternate)}</p>
                </div>
              </div>
            </Card>
          )}

          {/* ── F. DETALLE DE TRAZABILIDAD ── */}
          {traceabilityDim && (
            <Card style={{ padding: '1rem', marginTop: '.75rem' }}>
              <strong>Trazabilidad y calidad de registro</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
                <div>
                  <span className="label">Miembros sin snapshot de nombre</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{missingSnapshot ?? '—'}</p>
                </div>
                <div>
                  <span className="label">OTHER sin observaciones</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{otherWithoutObservations ?? '—'}</p>
                </div>
                <div>
                  <span className="label">Duplicados</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{counter('duplicateEmployees') ?? '—'}</p>
                </div>
              </div>
            </Card>
          )}

          {/* ── G. DETALLE DE OPERACIÓN ── */}
          {operationDim && (
            <Card style={{ padding: '1rem', marginTop: '.75rem' }}>
              <strong>Operación de la brigada</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
                <div>
                  <span className="label">Última reunión registrada</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{latestMeetingDate ? fmtDate(latestMeetingDate) : '—'}</p>
                </div>
                <div>
                  <span className="label">Indicador de reunión</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>
                    {latestMeetingDate ? (futureMeetingDates !== undefined && futureMeetingDates > 0 ? '⚠ Fecha futura' : '✅ Registrada') : '❌ Sin registro'}
                  </p>
                </div>
                <div>
                  <span className="label">Frecuencia declarada</span>
                  <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>
                    {meetingFrequencies && meetingFrequencies.length > 0 ? meetingFrequencies.join(', ') : '—'}
                  </p>
                </div>
              </div>
              {futureMeetingDates !== undefined && futureMeetingDates > 0 && (
                <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
                  ⚠ {futureMeetingDates} brigada(s) con fecha de reunión futura: no cuentan como operación válida.
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── H. CONTADORES OPERATIVOS (solo los que existen; nunca sección vacía) ── */}
      {metadata?.counters && (
        <Card style={{ padding: '1rem' }}>
          <strong>Indicadores operativos</strong>
          {COUNTER_GROUPS.map((group) => {
            const entries = group.keys
              .map((key) => [key, counter(key)] as const)
              .filter((entry): entry is [string, number] => typeof entry[1] === 'number');
            if (entries.length === 0) return null;
            return (
              <div key={group.title} style={{ marginTop: '.5rem' }}>
                <span className="label">{group.title}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem', marginTop: '.15rem' }}>
                  {entries.map(([key, value]) => (
                    <div key={key}>
                      <span className="label">{COUNTER_LABELS[key] ?? key}</span>
                      <p style={{ margin: '.1rem 0 0', fontWeight: 600 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* ── I. ACCIONES REQUERIDAS (sobre findings reales del módulo) ── */}
      <Card style={{ padding: '1rem' }}>
        <strong>Hallazgos y acciones ({sortedFindings.length})</strong>
        <p className="muted" style={{ margin: '.15rem 0 0', fontSize: '.78rem' }}>
          Hallazgos oficiales del Compliance Engine para 5.1.2. El score oficial no se recalcula aquí.
        </p>
        {sortedFindings.length === 0 ? (
          <p className="muted" style={{ margin: '.5rem 0 0' }}>Sin hallazgos para 5.1.2.</p>
        ) : (
          <div style={{ display: 'grid', gap: '.5rem', marginTop: '.5rem' }}>
            {actionItems.map(({ finding, config }) => (
              <EmergencyBrigadeActionItem key={finding.id} finding={finding} config={config} />
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

      {/* ── J. ÚLTIMA ACTUALIZACIÓN ── */}
      <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
        Última actualización: {fmtDate(compliance.lastUpdated)}
      </p>
    </div>
  );
}
