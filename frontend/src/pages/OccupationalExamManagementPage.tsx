import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ComplianceResultCard } from '../components/ComplianceResultCard';
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';
import { Button } from '../components/ui/Button';
import { fetchOccupationalExamStats } from '../api';
import type { OccupationalExamStats } from '../api';

type Props = {
  token: string;
};

/* ── Label maps ── */

const EXAM_TYPE_LABELS: Record<string, string> = {
  ENTRY: 'Ingreso',
  PERIODIC: 'Periódico',
  EXIT: 'Egreso',
  POST_INCAPACITY: 'Post-incapacidad',
  CHANGE_OF_OCCUPATION: 'Cambio de ocupación',
  OTHER: 'Otro',
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programado',
  COMPLETED: 'Completado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

const FITNESS_LABELS: Record<string, string> = {
  FIT: 'Apto',
  FIT_WITH_RESTRICTIONS: 'Apto con restricciones',
  UNFIT: 'No apto',
  PENDING: 'Pendiente',
  NOT_REPORTED: 'No reportado',
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

/* ── Coverage bar ── */

function CoverageBar({ label, numerator, denominator }: { label: string; numerator: number; denominator: number }) {
  const pct = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
  const barColor = pct >= 90 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';

  return (
    <div style={{ marginBottom: '.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155' }}>{label}</span>
        <span style={{ fontSize: '.75rem', color: '#64748b' }}>{pct}%</span>
      </div>
      <div style={{
        height: 8,
        borderRadius: 4,
        backgroundColor: '#e2e8f0',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 4,
          width: `${pct}%`,
          backgroundColor: barColor,
          transition: 'width .3s ease',
        }} />
      </div>
      <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: '.15rem' }}>
        {numerator} de {denominator} trabajadores
      </div>
    </div>
  );
}

/* ── Status indicator ── */

function StatusIndicator({ label, count, color, icon }: { label: string; count: number; color: string; icon: string }) {
  return (
    <div style={{
      padding: '.5rem .75rem',
      borderRadius: 8,
      backgroundColor: '#fff',
      border: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      gap: '.5rem',
    }}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{count}</div>
        <div style={{ fontSize: '.75rem', color: '#64748b' }}>{label}</div>
      </div>
    </div>
  );
}

/* ── Main component ── */

export function OccupationalExamManagementPage({ token }: Props) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<OccupationalExamStats | null>(null);

  const loadStats = () => {
    setLoading(true);
    setError('');
    fetchOccupationalExamStats(token)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar estadísticas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const totalWorkers = stats?.totalWorkers ?? 0;
  const totalExams = stats?.totalExams ?? 0;
  const hasExams = totalExams > 0;

  /* ── Render ── */

  return (
    <div className="page" style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
              🏥 Exámenes médicos ocupacionales
            </h1>
            <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b' }}>
              Gestión y monitoreo de exámenes médicos ocupacionales — Estándar 3.1.2
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" onClick={() => navigate('/documents/do')}>
              ← Volver al PHVA
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
          Cargando información de exámenes médicos ocupacionales…
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
            Registra trabajadores en el módulo de Empleados para comenzar a gestionar los exámenes médicos ocupacionales del estándar 3.1.2.
          </p>
          <Button type="button" onClick={() => navigate('/employees')} style={{ marginTop: '.75rem' }}>
            Ir a Empleados
          </Button>
        </div>
      ) : !hasExams ? (
        /* ── Empty state: no exams ── */
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📋</div>
          <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
            No hay exámenes médicos registrados
          </p>
          <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
            Registra exámenes médicos ocupacionales en el módulo de Empleados para evaluar el cumplimiento del estándar 3.1.2.
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
              <StatCard label="Total exámenes" value={totalExams} color="#2563eb" />
              <StatCard label="Completados" value={stats?.completedExams ?? 0} color="#15803d" />
              <StatCard label="Programados" value={stats?.scheduledExams ?? 0} color="#d97706" />
              <StatCard label="Vencidos" value={stats?.expiredExams ?? 0} color="#dc2626" />
              <StatCard label="Seguimientos" value={stats?.followUpsRequired ?? 0} color="#7c3aed" />
              <StatCard label="Próximos (30 días)" value={stats?.upcomingExams ?? 0} color="#0891b2" />
            </div>
          </section>

          {/* ── Section 2: Coverage ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📈 Cobertura de exámenes
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <CoverageBar label="Exámenes de ingreso" numerator={stats?.entryExams ?? 0} denominator={totalWorkers} />
              <CoverageBar label="Exámenes periódicos" numerator={stats?.periodicExams ?? 0} denominator={totalWorkers} />
              <CoverageBar label="Exámenes de egreso" numerator={stats?.exitExams ?? 0} denominator={totalWorkers} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem', marginTop: '1rem' }}>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#15803d' }}>{stats?.completedExams ?? 0}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Completados</div>
                </div>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#d97706' }}>{stats?.scheduledExams ?? 0}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Programados</div>
                </div>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{totalExams}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Total exámenes</div>
                </div>
              </div>
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
                <DistributionBlock title="📋 Tipo de examen" entries={stats?.examTypeDistribution} labelMap={EXAM_TYPE_LABELS} />
                <DistributionBlock title="📊 Estado" entries={stats?.statusDistribution} labelMap={STATUS_LABELS} />
                <DistributionBlock title="🏥 Aptitud" entries={stats?.fitnessDistribution} labelMap={FITNESS_LABELS} />
                <DistributionBlock title="🏢 Área" entries={stats?.areaDistribution} />
                <DistributionBlock title="📝 Tipo de contrato" entries={stats?.contractTypeDistribution} />
              </div>
            </div>
          </section>

          {/* ── Section 4: Expirations ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              ⏰ Estado de vencimientos
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem' }}>
                <StatusIndicator label="Exámenes vencidos" count={stats?.expiredExams ?? 0} color="#dc2626" icon="🔴" />
                <StatusIndicator label="Próximos (30 días)" count={stats?.upcomingExams ?? 0} color="#d97706" icon="🟡" />
                <StatusIndicator label="Programados" count={stats?.scheduledExams ?? 0} color="#2563eb" icon="🔵" />
                <StatusIndicator label="Completados" count={stats?.completedExams ?? 0} color="#15803d" icon="🟢" />
              </div>

              {(stats?.expiredExams ?? 0) > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#fef2f2',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#991b1b' }}>
                    Existen {stats?.expiredExams} examen(es) vencidos que requieren atención.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#b91c1c' }}>
                    Programa o completa los exámenes vencidos en el módulo de Empleados.
                  </p>
                  <Button type="button" onClick={() => navigate('/employees')} style={{ marginTop: '.5rem' }}>
                    Ir a Empleados
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 5: Follow-ups ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📞 Seguimientos médicos
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem' }}>
                <StatusIndicator label="Seguimientos requeridos" count={stats?.followUpsRequired ?? 0} color="#7c3aed" icon="📞" />
                <StatusIndicator label="Próximos exámenes" count={stats?.upcomingExams ?? 0} color="#0891b2" icon="📅" />
              </div>

              {(stats?.followUpsRequired ?? 0) > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#faf5ff',
                  borderRadius: 8,
                  border: '1px solid #e9d5ff',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#6b21a8' }}>
                    Existen {stats?.followUpsRequired} examen(es) que requieren seguimiento.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#7e22ce' }}>
                    Programa las fechas de seguimiento en el módulo de Empleados.
                  </p>
                </div>
              )}

              {(stats?.followUpsRequired ?? 0) === 0 && (
                <div style={{
                  marginTop: '.5rem',
                  padding: '.75rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  border: '1px solid #bbf7d0',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#15803d' }}>
                    No hay seguimientos médicos pendientes.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 6: Actions ── */}
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
                  Registrar examen
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/intelligence-compliance')}>
                  Ver análisis de cumplimiento
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/documents/do')}>
                  Volver al PHVA
                </Button>
              </div>
            </div>
          </section>

          {/* ── Section 7: Intelligence ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🧠 Inteligencia y cumplimiento
            </h2>
            <div style={{ display: 'grid', gap: '.75rem' }}>
              <ComplianceResultCard
                token={token}
                module="occupational-exam"
                standardCode="3.1.2"
                standardTitle="Exámenes médicos ocupacionales"
                actionRoute="/occupational-exam-management"
              />
              <ComplianceAIInsight token={token} standardCode="3.1.2" />
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
