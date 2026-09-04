import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ComplianceResultCard } from '../components/ComplianceResultCard';
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';
import { Button } from '../components/ui/Button';
import { fetchSociodemographicStats } from '../api';
import type { SociodemographicStats } from '../api';

type Props = {
  token: string;
};

/* ── Label helpers (shared with IntelligenceCompliancePage) ── */

const GENDER_LABELS: Record<string, string> = {
  MASCULINO: 'Masculino',
  FEMENINO: 'Femenino',
  OTRO: 'Otro',
};

const EDUCATION_LABELS: Record<string, string> = {
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
  TECNICO: 'Técnico',
  TECNOLOGO: 'Tecnólogo',
  PROFESIONAL: 'Profesional',
  POSGRADO: 'Posgrado',
};

const MARITAL_LABELS: Record<string, string> = {
  SOLTERO: 'Soltero(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUDO: 'Viudo(a)',
  UNION_LIBRE: 'Unión libre',
};

/* ── Small stat card ── */

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      padding: '.5rem .75rem',
      borderRadius: 8,
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      textAlign: 'center',
      minWidth: 100,
    }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: color ?? '#0f172a' }}>{value}</div>
      <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ── Distribution block ── */

function DistributionBlock({ title, entries, labelMap }: {
  title: string;
  entries: Array<{ label: string; count: number }> | undefined;
  labelMap?: Record<string, string>;
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <div style={{ marginBottom: '.5rem' }}>
      <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#475569', marginBottom: '.25rem' }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
        {entries.map((e) => (
          <span key={e.label} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 12,
            backgroundColor: '#f1f5f9',
            border: '1px solid #e2e8f0',
            fontSize: '.75rem',
            color: '#334155',
          }}>
            {labelMap?.[e.label] ?? e.label}
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{e.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Gap row ── */

function GapRow({ label, filled, total }: { label: string; filled: number; total: number }) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const missing = total - filled;
  const missingPct = total > 0 ? 100 - pct : 0;
  const barColor = pct >= 90 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';

  return (
    <div style={{ marginBottom: '.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.2rem' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155' }}>{label}</span>
        <span style={{ fontSize: '.75rem', color: '#64748b' }}>
          {pct}% cobertura — {missing} pendiente{missing !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: '#e2e8f0',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 3,
          width: `${pct}%`,
          backgroundColor: barColor,
          transition: 'width .3s ease',
        }} />
      </div>
      <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: '.15rem' }}>
        {filled} de {total} con dato registrado{missingPct > 0 ? ` — ${missingPct}% pendiente` : ''}
      </div>
    </div>
  );
}

/* ── Main component ── */

export function SociodemographicManagementPage({ token }: Props) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<SociodemographicStats | null>(null);

  const loadStats = () => {
    setLoading(true);
    setError('');
    fetchSociodemographicStats(token)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar estadísticas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const totalWorkers = stats?.totalWorkers ?? 0;
  const completeProfiles = stats?.completeProfiles ?? 0;
  const incompleteProfiles = totalWorkers - completeProfiles;
  const completionPercentage = stats?.completionPercentage ?? 0;

  /* ── Gap analysis ── */

  type GapEntry = { label: string; filled: number; total: number };

  const computeGaps = (): GapEntry[] => {
    if (!stats || totalWorkers === 0) return [];

    const countFromDistribution = (entries: Array<{ label: string; count: number }>) =>
      entries.reduce((sum, e) => sum + e.count, 0);

    const gaps: GapEntry[] = [
      { label: 'Nivel educativo', filled: countFromDistribution(stats.educationDistribution), total: totalWorkers },
      { label: 'Estado civil', filled: countFromDistribution(stats.maritalStatusDistribution), total: totalWorkers },
      { label: 'Género', filled: countFromDistribution(stats.genderDistribution), total: totalWorkers },
      { label: 'Rangos de edad', filled: countFromDistribution(stats.ageRanges), total: totalWorkers },
      { label: 'Tipo de contrato', filled: countFromDistribution(stats.contractTypeDistribution), total: totalWorkers },
      { label: 'Jornada laboral', filled: countFromDistribution(stats.workScheduleDistribution), total: totalWorkers },
      { label: 'Tipo de vivienda', filled: countFromDistribution(stats.housingTypeDistribution), total: totalWorkers },
      { label: 'Grupo étnico', filled: countFromDistribution(stats.ethnicGroupDistribution), total: totalWorkers },
      { label: 'Discapacidad', filled: countFromDistribution(stats.disabilityDistribution), total: totalWorkers },
      { label: 'Estrato socioeconómico', filled: stats.socioeconomicStratumDistribution.reduce((sum, d) => sum + d.count, 0), total: totalWorkers },
      { label: 'Personas a cargo', filled: countFromDistribution(stats.dependentsDistribution), total: totalWorkers },
    ];

    return gaps.sort((a, b) => {
      const pctA = a.total > 0 ? a.filled / a.total : 0;
      const pctB = b.total > 0 ? b.filled / b.total : 0;
      return pctA - pctB;
    });
  };

  const gaps = computeGaps();

  /* ── Render ── */

  return (
    <div className="page" style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
              👥 Perfil sociodemográfico
            </h1>
            <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b' }}>
              Gestión y monitoreo de la información sociodemográfica de los trabajadores — Estándar 3.1.1
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" onClick={() => navigate('/documents/plan')}>
              ← Volver al Plan
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/employees')}>
              👥 Ir a Empleados
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/intelligence-compliance')}>
              🧠 Ver análisis de cumplimiento
            </Button>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading ? (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#94a3b8',
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}>
          Cargando información sociodemográfica…
        </div>
      ) : error ? (
        /* ── Error ── */
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#fef2f2',
          borderRadius: 12,
          border: '1px solid #fecaca',
        }}>
          <p style={{ margin: 0, color: '#dc2626', fontSize: '.9rem' }}>{error}</p>
          <Button type="button" variant="secondary" onClick={() => loadStats()} style={{ marginTop: '.5rem' }}>
            Reintentar
          </Button>
        </div>
      ) : totalWorkers === 0 ? (
        /* ── Empty state: no workers ── */
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📭</div>
          <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
            No hay trabajadores registrados
          </p>
          <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
            Registra trabajadores en el módulo de Empleados para comenzar a gestionar y analizar el perfil sociodemográfico del estándar 3.1.1.
          </p>
          <Button type="button" onClick={() => navigate('/employees')} style={{ marginTop: '.75rem' }}>
            Ir a Empleados
          </Button>
        </div>
      ) : (
        <div>

          {/* ── Section 1: KPIs ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📊 Resumen
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
              <StatCard label="Total trabajadores" value={totalWorkers} color="#0f172a" />
              <StatCard label="Perfiles completos" value={`${completeProfiles}/${totalWorkers}`} color="#15803d" />
              <StatCard label="Perfiles incompletos" value={incompleteProfiles} color={incompleteProfiles > 0 ? '#d97706' : '#15803d'} />
              <StatCard
                label="Cobertura sociodemográfica"
                value={`${completionPercentage}%`}
                color={completionPercentage >= 80 ? '#16a34a' : completionPercentage >= 50 ? '#d97706' : '#dc2626'}
              />
              <StatCard
                label="Campos pendientes"
                value={gaps.filter((g) => g.filled < g.total).length}
                color={gaps.filter((g) => g.filled < g.total).length > 0 ? '#d97706' : '#15803d'}
              />
              <StatCard label="Actualizaciones recientes" value={stats?.recentUpdates ?? 0} color="#64748b" />
            </div>
          </section>

          {/* ── Section 2: Coverage ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📈 Cobertura del perfil sociodemográfico
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              {/* Progress bar */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#e2e8f0',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 5,
                    width: `${Math.min(100, completionPercentage)}%`,
                    backgroundColor: completionPercentage >= 80 ? '#16a34a'
                      : completionPercentage >= 50 ? '#d97706'
                      : '#dc2626',
                    transition: 'width .3s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.35rem' }}>
                  <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#0f172a' }}>
                    {completionPercentage}% completitud
                  </span>
                  <span style={{ fontSize: '.75rem', color: '#64748b' }}>
                    {completeProfiles} de {totalWorkers} perfiles con los 4 campos principales completos
                  </span>
                </div>
              </div>

              {/* Coverage breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem' }}>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#15803d' }}>{completeProfiles}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Completos</div>
                </div>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#d97706' }}>{incompleteProfiles}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Incompletos</div>
                </div>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{totalWorkers}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Total trabajadores</div>
                </div>
              </div>

              {completionPercentage === 0 && totalWorkers > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#fffbeb',
                  borderRadius: 8,
                  border: '1px solid #fde68a',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#92400e' }}>
                    Hay trabajadores registrados, pero falta información sociodemográfica.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#a16207' }}>
                    Completa la información de los trabajadores en el módulo de Empleados.
                  </p>
                  <Button type="button" onClick={() => navigate('/employees')} style={{ marginTop: '.5rem' }}>
                    Completar información
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 3: Distributions ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📋 Distribuciones
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.75rem' }}>
                <DistributionBlock title="📅 Rangos de edad" entries={stats?.ageRanges} />
                <DistributionBlock title="⚧ Género" entries={stats?.genderDistribution} labelMap={GENDER_LABELS} />
                <DistributionBlock title="🎓 Nivel educativo" entries={stats?.educationDistribution} labelMap={EDUCATION_LABELS} />
                <DistributionBlock title="💍 Estado civil" entries={stats?.maritalStatusDistribution} labelMap={MARITAL_LABELS} />
                <DistributionBlock title="📋 Tipo de contrato" entries={stats?.contractTypeDistribution} />
                <DistributionBlock title="🕐 Jornada laboral" entries={stats?.workScheduleDistribution} />
                <DistributionBlock title="🏠 Tipo de vivienda" entries={stats?.housingTypeDistribution} />
                <DistributionBlock title="🌍 Grupo étnico" entries={stats?.ethnicGroupDistribution} />
                <DistributionBlock title="♿ Discapacidad" entries={stats?.disabilityDistribution} />
                <DistributionBlock
                  title="📊 Estrato"
                  entries={stats?.socioeconomicStratumDistribution.map(d => ({ label: `Estrato ${d.stratum}`, count: d.count }))}
                />
                <DistributionBlock title="👨‍👩‍👧 Personas a cargo" entries={stats?.dependentsDistribution} />
              </div>
            </div>
          </section>

          {/* ── Section 4: Gaps ── */}
          {gaps.length > 0 && (
            <section style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
                ⚠️ Información pendiente
              </h2>
              <div style={{
                backgroundColor: '#f8fafc',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                padding: '1.25rem',
              }}>
                {gaps.map((gap) => (
                  <GapRow key={gap.label} label={gap.label} filled={gap.filled} total={gap.total} />
                ))}
              </div>
            </section>
          )}

          {/* ── Section 5: Actions ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🎯 Acciones
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                <Button type="button" onClick={() => navigate('/employees')}>
                  Completar información
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/intelligence-compliance')}>
                  Ver análisis de cumplimiento
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/documents/plan')}>
                  Volver al Plan
                </Button>
              </div>
            </div>
          </section>

          {/* ── Section 6: Intelligence ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🧠 Inteligencia y cumplimiento
            </h2>
            <div style={{ display: 'grid', gap: '.75rem' }}>
              <ComplianceResultCard
                token={token}
                module="sociodemographic"
                standardCode="3.1.1"
                standardTitle="Perfil sociodemográfico"
                actionRoute="/sociodemographic-management"
              />
              <ComplianceAIInsight token={token} standardCode="3.1.1" />
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
