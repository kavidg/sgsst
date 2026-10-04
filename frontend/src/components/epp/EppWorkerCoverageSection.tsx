import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EmployeeModel, EppApplicabilityMatrixResponse } from '../../api';
import type { EppDelivery } from '../../types/epp';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

/**
 * ETAPA 5 (4.2.6) — Cobertura M2 por trabajador (vista operativa).
 *
 * ARQUITECTURA: composición 100% EN MEMORIA sobre los datos que la página ya
 * carga (employees + EppApplicabilityMatrix + EppDelivery). Sin endpoints
 * nuevos, sin consultas por trabajador, sin fetch interno.
 *
 * SEMÁNTICA (espejo EXACTO de epp-scoring.ts — NO se modifica el score):
 *  - Requisito válido: Employee activo + JobProfile activo + relación
 *    EppApplicability active∧required con eppItemId ACTIVO en catálogo.
 *  - Cobertura: isDeliveryCoveringRequirement — status ACTIVE, NO vencida
 *    (dinámico, nunca un estado EXPIRED persistido), condición GOOD|FAIR
 *    (FAIR vigente SÍ cubre), quantity > 0. Booleana (0 o 1 por requisito).
 *  - Estados CUBIERTO/PARCIAL/PENDIENTE/SIN_CARGO/CARGO_INACTIVO/SIN_MATRIZ
 *    son exclusivamente de esta vista operativa: NUNCA se envían al backend
 *    ni representan el resultado oficial del Compliance Engine.
 */

// ============================================================
// TIPOS DE LA VISTA (solo frontend; no viajan al backend)
// ============================================================

type WorkerState = 'CUBIERTO' | 'PARCIAL' | 'PENDIENTE' | 'SIN_CARGO' | 'CARGO_INACTIVO' | 'SIN_MATRIZ';

interface RequirementView {
  eppItemId: string;
  eppName: string;
  category?: string;
  covered: boolean;
  /** Entrega a mostrar: la vigente que cubre, o la ACTIVE vencida que explica el pendiente. */
  currentDelivery: EppDelivery | null;
  isOverdue: boolean;
}

interface WorkerCoverage {
  employee: EmployeeModel;
  state: WorkerState;
  jobProfileName: string | null;
  applicable: number;
  covered: number;
  requirements: RequirementView[];
  /** Entregas del trabajador que no corresponden a requisitos aplicables (señal, no penalización). */
  outsideMatrixCount: number;
}

export interface EppWorkerCoverageSectionProps {
  role?: string;
  employees: EmployeeModel[];
  matrix: EppApplicabilityMatrixResponse | null;
  /** Entregas completas de la empresa (cargadas por la página; sin filtros). */
  deliveries: EppDelivery[];
  onOpenTab?: (tab: string) => void;
}

// ============================================================
// HELPERS — espejo documentado de la semántica del backend
// ============================================================

const TERMINAL_STATUSES = new Set(['REPLACED', 'RETURNED', 'DAMAGED']);

/**
 * Vencimiento dinámico (espejo de isEppDeliveryOverdue):
 * expectedReplacementDate existe ∧ actualReplacementDate vacía ∧
 * status no terminal ∧ expected < now. NUNCA se persiste EXPIRED.
 */
const isDeliveryOverdue = (d: EppDelivery, now: Date): boolean => {
  if (!d.expectedReplacementDate) return false;
  if (d.actualReplacementDate) return false;
  if (TERMINAL_STATUSES.has(d.status)) return false;
  const expected = new Date(d.expectedReplacementDate).getTime();
  return !Number.isNaN(expected) && expected < now.getTime();
};

/**
 * Cobertura de un requisito (espejo de isDeliveryCoveringRequirement):
 * ACTIVE ∧ no vencida ∧ GOOD|FAIR ∧ quantity > 0.
 */
const isDeliveryCovering = (d: EppDelivery, now: Date): boolean =>
  d.status === 'ACTIVE' &&
  !isDeliveryOverdue(d, now) &&
  (d.condition === 'GOOD' || d.condition === 'FAIR') &&
  Number.isFinite(d.quantity) &&
  d.quantity > 0;

const toDate = (v: string | null | undefined): number => {
  const t = new Date(v ?? '').getTime();
  return Number.isNaN(t) ? 0 : t;
};

const fmtDate = (v: string | null | undefined): string => {
  const t = new Date(v ?? '');
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleDateString('es-CO');
};

const CONDITION_LABELS: Record<string, string> = {
  GOOD: 'Buena',
  FAIR: 'Regular',
  POOR: 'Mala',
  DAMAGED: 'Dañada',
};

const STATE_BADGE: Record<WorkerState, string> = {
  CUBIERTO: 'badge badge--success',
  PARCIAL: 'badge badge--warning',
  PENDIENTE: 'badge badge--danger',
  SIN_CARGO: 'badge',
  CARGO_INACTIVO: 'badge badge--warning',
  SIN_MATRIZ: 'badge badge--warning',
};

const STATE_LABEL: Record<WorkerState, string> = {
  CUBIERTO: 'Cubierto',
  PARCIAL: 'Parcial',
  PENDIENTE: 'Pendiente',
  SIN_CARGO: 'Sin cargo estructurado',
  CARGO_INACTIVO: 'Cargo inactivo',
  SIN_MATRIZ: 'Cargo sin matriz EPP',
};

const STATE_FILTER_OPTIONS: Array<{ value: WorkerState | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'CUBIERTO', label: 'Cubierto' },
  { value: 'PARCIAL', label: 'Parcial' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'SIN_CARGO', label: 'Sin cargo' },
  { value: 'CARGO_INACTIVO', label: 'Cargo inactivo' },
  { value: 'SIN_MATRIZ', label: 'Sin matriz' },
];

// ============================================================
// COMPONENTE
// ============================================================

export function EppWorkerCoverageSection({
  role,
  employees,
  matrix,
  deliveries,
  onOpenTab,
}: EppWorkerCoverageSectionProps) {
  const navigate = useNavigate();

  // Nota: TODOS los hooks se declaran antes de cualquier retorno condicional
  // (Rules of Hooks). El gate de member se aplica en el render, no aquí.

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<WorkerState | ''>('');
  const [profileFilter, setProfileFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (employeeId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  // member: sin acceso a deliveries (backend 403) → nunca simular cobertura.
  // Se aplica DESPUÉS de los hooks (Rules of Hooks).
  if (role === 'member') {
    return (
      <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ margin: 0 }}>
          La cobertura por trabajador requiere acceso a registros de entrega de EPP.
        </p>
      </Card>
    );
  }

  // Instante de evaluación determinista por carga de datos (vencimiento dinámico).
  const evaluationNow = useMemo(
    () => new Date(),
    [deliveries, employees, matrix],
  );

  const coverage = useMemo<WorkerCoverage[]>(() => {
    // ── Índices en memoria (una pasada por fuente; sin queries) ──
    const activeCatalogIds = new Set((matrix?.eppItems ?? []).filter((i) => i.active).map((i) => i.id));
    const itemById = new Map((matrix?.eppItems ?? []).map((i) => [i.id, i]));
    const profileById = new Map((matrix?.jobProfiles ?? []).map((p) => [p.id, p]));

    // Matriz requerida por cargo: active ∧ required ∧ EPP activo en catálogo.
    const requiredByProfile = new Map<string, string[]>();
    for (const rel of matrix?.assignments ?? []) {
      if (!rel.active || !rel.required) continue;
      if (!activeCatalogIds.has(rel.eppItemId)) continue; // EPP inexistente/inactivo: no es requisito
      const list = requiredByProfile.get(rel.jobProfileId);
      if (list) {
        if (!list.includes(rel.eppItemId)) list.push(rel.eppItemId);
      } else {
        requiredByProfile.set(rel.jobProfileId, [rel.eppItemId]);
      }
    }

    // Entregas indexadas por requisito employeeId::eppItemId (una pasada).
    const bucketByRequirement = new Map<string, EppDelivery[]>();
    const deliveriesByEmployee = new Map<string, EppDelivery[]>();
    for (const d of deliveries) {
      const key = `${d.employeeId}::${d.eppItemId}`;
      const bucket = bucketByRequirement.get(key);
      if (bucket) bucket.push(d);
      else bucketByRequirement.set(key, [d]);
      const byEmployee = deliveriesByEmployee.get(d.employeeId);
      if (byEmployee) byEmployee.push(d);
      else deliveriesByEmployee.set(d.employeeId, [d]);
    }

    /** Entrega principal del requisito: la vigente que cubre (más reciente); si no, la ACTIVE vencida más reciente (explica el pendiente). Terminales nunca. */
    const primaryDelivery = (bucket: EppDelivery[]): { delivery: EppDelivery | null; overdue: boolean } => {
      const byDateDesc = (a: EppDelivery, b: EppDelivery) => toDate(b.deliveryDate) - toDate(a.deliveryDate);
      const covering = bucket.filter((d) => isDeliveryCovering(d, evaluationNow)).sort(byDateDesc)[0];
      if (covering) return { delivery: covering, overdue: false };
      const overdueActive = bucket.filter((d) => d.status === 'ACTIVE' && isDeliveryOverdue(d, evaluationNow)).sort(byDateDesc)[0];
      if (overdueActive) return { delivery: overdueActive, overdue: true };
      return { delivery: null, overdue: false };
    };

    // ── Un registro por trabajador ACTIVO (los inactivos no generan requisitos) ──
    return employees
      .filter((e) => e.status === 'Activo')
      .map((employee) => {
        const employeeDeliveries = deliveriesByEmployee.get(employee._id) ?? [];
        const base = { employee, applicable: 0, covered: 0, requirements: [] as RequirementView[] };

        const jobProfileId = employee.jobProfileId;
        if (!jobProfileId) {
          return {
            ...base,
            state: 'SIN_CARGO' as WorkerState,
            jobProfileName: null,
            outsideMatrixCount: employeeDeliveries.length,
          };
        }
        const profile = profileById.get(jobProfileId);
        if (!profile || !profile.active) {
          return {
            ...base,
            state: 'CARGO_INACTIVO' as WorkerState,
            jobProfileName: profile?.name ?? null,
            outsideMatrixCount: employeeDeliveries.length,
          };
        }
        const required = requiredByProfile.get(jobProfileId) ?? [];
        if (required.length === 0) {
          return {
            ...base,
            state: 'SIN_MATRIZ' as WorkerState,
            jobProfileName: profile.name,
            outsideMatrixCount: employeeDeliveries.length,
          };
        }

        const requirements: RequirementView[] = required.map((itemId) => {
          const item = itemById.get(itemId);
          const bucket = bucketByRequirement.get(`${employee._id}::${itemId}`) ?? [];
          const { delivery, overdue } = primaryDelivery(bucket);
          const covered = bucket.some((d) => isDeliveryCovering(d, evaluationNow));
          return {
            eppItemId: itemId,
            eppName: item?.name ?? delivery?.eppNameSnapshot ?? itemId,
            category: item?.category,
            covered,
            currentDelivery: delivery,
            isOverdue: overdue,
          };
        });
        const covered = requirements.filter((r) => r.covered).length;
        const requiredSet = new Set(required);
        return {
          ...base,
          requirements,
          applicable: requirements.length,
          covered,
          state: (covered === requirements.length ? 'CUBIERTO' : covered > 0 ? 'PARCIAL' : 'PENDIENTE') as WorkerState,
          jobProfileName: profile.name,
          outsideMatrixCount: employeeDeliveries.filter((d) => !requiredSet.has(d.eppItemId)).length,
        };
      });
  }, [employees, matrix, deliveries, evaluationNow]);

  // KPIs operativos sobre la lista completa (no filtrada).
  const kpis = useMemo(() => {
    const withRequirements = coverage.filter((w) => ['CUBIERTO', 'PARCIAL', 'PENDIENTE'].includes(w.state));
    return {
      withRequirements: withRequirements.length,
      fully: coverage.filter((w) => w.state === 'CUBIERTO').length,
      partial: coverage.filter((w) => w.state === 'PARCIAL').length,
      pending: coverage.filter((w) => w.state === 'PENDIENTE').length,
      withoutProfile: coverage.filter((w) => w.state === 'SIN_CARGO').length,
      inactiveProfile: coverage.filter((w) => w.state === 'CARGO_INACTIVO').length,
      withoutMatrix: coverage.filter((w) => w.state === 'SIN_MATRIZ').length,
    };
  }, [coverage]);

  const activeProfiles = useMemo(
    () => (matrix?.jobProfiles ?? []).filter((p) => p.active),
    [matrix],
  );

  const filtered = coverage.filter((w) => {
    if (stateFilter && w.state !== stateFilter) return false;
    if (profileFilter) {
      if (w.employee.jobProfileId !== profileFilter) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${w.employee.name} ${w.employee.position ?? ''} ${w.employee.document}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const hasFilters = Boolean(search.trim() || stateFilter || profileFilter);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Header */}
      <div>
        <h4 style={{ margin: 0 }}>Cobertura M2 por trabajador</h4>
        <p className="muted" style={{ margin: '.15rem 0 0', fontSize: '.85rem' }}>
          Vista operativa de requisitos y entregas de EPP. No modifica el resultado oficial de 4.2.6.
        </p>
      </div>

      {/* KPIs operativos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.75rem' }}>
        {[
          { label: 'Trabajadores con requisitos', value: kpis.withRequirements },
          { label: 'Completamente cubiertos', value: kpis.fully },
          { label: 'Parciales', value: kpis.partial },
          { label: 'Pendientes', value: kpis.pending },
        ].map((k) => (
          <Card key={k.label} style={{ padding: '.75rem 1rem' }}>
            <span className="label">{k.label}</span>
            <p style={{ margin: '.25rem 0 0', fontWeight: 700 }}>{k.value}</p>
            <p style={{ margin: '.15rem 0 0', fontSize: '.7rem', color: '#a0aec0' }}>Vista operativa</p>
          </Card>
        ))}
      </div>
      {kpis.withoutProfile + kpis.inactiveProfile + kpis.withoutMatrix > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
          Calidad de datos: {kpis.withoutProfile} sin cargo · {kpis.inactiveProfile} con cargo inactivo · {kpis.withoutMatrix} con cargo sin matriz
        </p>
      )}

      {/* Filtros locales (sin llamadas) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.5rem', alignItems: 'end' }}>
        <div>
          <label className="label" htmlFor="epp-cov-search">Buscar trabajador</label>
          <Input id="epp-cov-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, cargo o documento" />
        </div>
        <div>
          <label className="label" htmlFor="epp-cov-state">Estado</label>
          <Select id="epp-cov-state" value={stateFilter} onChange={(e) => setStateFilter(e.target.value as WorkerState | '')}>
            {STATE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="epp-cov-profile">Cargo</label>
          <Select id="epp-cov-profile" value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}>
            <option value="">Todos</option>
            {activeProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setSearch(''); setStateFilter(''); setProfileFilter(''); }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Lista de trabajadores (cards expandibles) */}
      {filtered.length === 0 ? (
        <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>
            {coverage.length === 0
              ? 'No hay trabajadores activos para evaluar cobertura.'
              : 'No encontramos trabajadores con los filtros seleccionados.'}
          </p>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              style={{ marginTop: '.5rem' }}
              onClick={() => { setSearch(''); setStateFilter(''); setProfileFilter(''); }}
            >
              Limpiar filtros
            </Button>
          )}
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '.6rem' }}>
          {filtered.map((w) => {
            const isOpen = expanded.has(w.employee._id);
            const operational = ['CUBIERTO', 'PARCIAL', 'PENDIENTE'].includes(w.state);
            return (
              <Card key={w.employee._id} style={{ padding: '.9rem 1rem' }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(w.employee._id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(w.employee._id); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', cursor: 'pointer', flexWrap: 'wrap' }}
                >
                  <div>
                    <strong>{w.employee.name}</strong>
                    <span className="muted" style={{ marginLeft: '.5rem', fontSize: '.85rem' }}>
                      {w.employee.position || '—'}{w.jobProfileName ? ` · ${w.jobProfileName}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                    <span className={STATE_BADGE[w.state]}>{STATE_LABEL[w.state]}</span>
                    {operational && (
                      <strong style={{ fontSize: '.85rem' }}>{w.covered} / {w.applicable} requisitos cubiertos</strong>
                    )}
                    <span className="muted">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #edf2f7', marginTop: '.6rem', paddingTop: '.6rem', display: 'grid', gap: '.5rem' }}>
                    {/* Estados de datos: CTA según el caso */}
                    {w.state === 'SIN_CARGO' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                          Trabajador activo sin cargo estructurado: no genera requisitos EPP.
                        </p>
                        <Button type="button" variant="ghost" onClick={() => navigate('/job-profiles')}>Configurar cargo</Button>
                      </div>
                    )}
                    {w.state === 'CARGO_INACTIVO' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                          Su cargo no existe o está inactivo: no genera requisitos EPP.
                        </p>
                        <Button type="button" variant="ghost" onClick={() => navigate('/job-profiles')}>Configurar cargo</Button>
                      </div>
                    )}
                    {w.state === 'SIN_MATRIZ' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                          El cargo no tiene ningún requisito EPP válido definido en la matriz.
                        </p>
                        {onOpenTab && <Button type="button" variant="ghost" onClick={() => onOpenTab('matriz')}>Definir matriz</Button>}
                      </div>
                    )}

                    {/* Requisitos (solo trabajadores con matriz válida) */}
                    {w.requirements.map((r) => (
                      <div key={r.eppItemId} style={{ display: 'grid', gap: '.15rem', borderTop: '1px solid #f1f5f9', paddingTop: '.4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '.85rem' }}>
                            {r.eppName}{r.category ? ` (${r.category})` : ''}
                          </strong>
                          {r.covered
                            ? <span className="badge badge--success">✓ Cubierto</span>
                            : <span className="badge badge--danger">⚠ Pendiente</span>}
                        </div>
                        {r.currentDelivery ? (
                          <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
                            {r.currentDelivery.status === 'ACTIVE' ? 'Activa' : r.currentDelivery.status}
                            {' · '}Condición: {CONDITION_LABELS[r.currentDelivery.condition] ?? r.currentDelivery.condition}
                            {' · '}Entregada: {fmtDate(r.currentDelivery.deliveryDate)}
                            {' · '}Reposición: {fmtDate(r.currentDelivery.expectedReplacementDate)}
                            {r.isOverdue && (
                              <>
                                {' '}
                                <span className="badge badge--danger" title="Reposición esperada ya vencida (indicador dinámico, no es un estado persistido)">Entrega vencida</span>
                                {' — '}el requisito permanece pendiente hasta registrar una reposición válida.
                              </>
                            )}
                          </p>
                        ) : (
                          <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>Sin entrega vigente.</p>
                        )}
                        {r.currentDelivery?.evidenceUrl && (
                          <p style={{ margin: 0, fontSize: '.8rem' }}>
                            <a href={r.currentDelivery.evidenceUrl} target="_blank" rel="noopener noreferrer">Ver evidencia</a>
                            {r.currentDelivery.certificateUrl && (
                              <> · <a href={r.currentDelivery.certificateUrl} target="_blank" rel="noopener noreferrer">Ver certificado</a></>
                            )}
                          </p>
                        )}
                      </div>
                    ))}

                    {/* Entregas fuera de matriz: señal discreta, nunca penalización */}
                    {w.outsideMatrixCount > 0 && (
                      <p className="muted" style={{ margin: 0, fontSize: '.75rem' }}>
                        ⓘ {w.outsideMatrixCount} entrega(s) fuera de matriz — señal de revisión, no afecta esta cobertura.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
