import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ComplianceResultCard } from '../components/ComplianceResultCard';
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';
import { Button } from '../components/ui/Button';
import { fetchMedicalRecommendationStats } from '../api';
import type { MedicalRecommendationStats } from '../api';

type Props = {
  token: string;
};

/* ── Label maps ── */

const RECOMMENDATION_TYPE_LABELS: Record<string, string> = {
  WORKPLACE_ADJUSTMENT: 'Ajuste laboral',
  FOLLOW_UP: 'Seguimiento',
  REFERRAL: 'Remisión',
  HEALTH_SURVEILLANCE: 'Vigilancia de salud',
  PREVENTIVE_ACTION: 'Acción preventiva',
  OTHER: 'Otro',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const ACTION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
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
        {numerator} de {denominator}
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

export function MedicalRecommendationManagementPage({ token }: Props) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<MedicalRecommendationStats | null>(null);

  const loadStats = () => {
    setLoading(true);
    setError('');
    fetchMedicalRecommendationStats(token)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar estadísticas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const totalRecommendations = stats?.totalRecommendations ?? 0;
  const totalActions = stats?.totalActions ?? 0;

  /* ── Render ── */

  return (
    <div className="page" style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
              📋 Seguimiento a recomendaciones médicas
            </h1>
            <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b' }}>
              Gestión y monitoreo de recomendaciones médicas ocupacionales — Estándar 3.1.3
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
          Cargando información de recomendaciones médicas…
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
      ) : totalRecommendations === 0 ? (
        /* ── Empty state: no recommendations ── */
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📭</div>
          <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
            No hay recomendaciones médicas registradas
          </p>
          <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
            Registra exámenes médicos y sus recomendaciones en el módulo de Empleados para evaluar el cumplimiento del estándar 3.1.3.
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
              <StatCard label="Total recomendaciones" value={totalRecommendations} color="#0f172a" />
              <StatCard label="Pendientes" value={stats?.pendingRecommendations ?? 0} color="#d97706" />
              <StatCard label="En progreso" value={stats?.inProgressRecommendations ?? 0} color="#2563eb" />
              <StatCard label="Completadas" value={stats?.completedRecommendations ?? 0} color="#15803d" />
              <StatCard label="Vencidas" value={stats?.overdueRecommendations ?? 0} color="#dc2626" />
              <StatCard label="Próximas (30 días)" value={stats?.dueSoonRecommendations ?? 0} color="#0891b2" />
              <StatCard label="Efectividad pendiente" value={stats?.effectivenessPending ?? 0} color="#7c3aed" />
            </div>
          </section>

          {/* ── Section 2: Coverage ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📈 Cobertura de seguimiento
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <CoverageBar label="Seguimiento completado" numerator={stats?.completedRecommendations ?? 0} denominator={totalRecommendations} />
              <CoverageBar label="Acciones ejecutadas" numerator={stats?.completedActions ?? 0} denominator={totalActions} />
              <CoverageBar label="Efectividad verificada" numerator={stats?.effectivenessVerified ?? 0} denominator={totalRecommendations} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem', marginTop: '1rem' }}>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#15803d' }}>{stats?.completedRecommendations ?? 0}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Completadas</div>
                </div>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#2563eb' }}>{stats?.completedActions ?? 0}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Acciones ejecutadas</div>
                </div>
                <div style={{ padding: '.5rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#7c3aed' }}>{stats?.effectivenessVerified ?? 0}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>Efectividad verificada</div>
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
                <DistributionBlock title="📋 Tipo de recomendación" entries={stats?.recommendationTypeDistribution} labelMap={RECOMMENDATION_TYPE_LABELS} />
                <DistributionBlock title="📊 Estado" entries={stats?.statusDistribution} labelMap={STATUS_LABELS} />
                <DistributionBlock title="🎯 Estado de acciones" entries={stats?.actionStatusDistribution} labelMap={ACTION_STATUS_LABELS} />
              </div>
            </div>
          </section>

          {/* ── Section 4: Expirations ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              ⏰ Estado de seguimiento
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem' }}>
                <StatusIndicator label="Recomendaciones vencidas" count={stats?.overdueRecommendations ?? 0} color="#dc2626" icon="🔴" />
                <StatusIndicator label="Próximas (30 días)" count={stats?.dueSoonRecommendations ?? 0} color="#d97706" icon="🟡" />
                <StatusIndicator label="Pendientes" count={stats?.pendingRecommendations ?? 0} color="#2563eb" icon="🔵" />
                <StatusIndicator label="Completadas" count={stats?.completedRecommendations ?? 0} color="#15803d" icon="🟢" />
              </div>

              {(stats?.overdueRecommendations ?? 0) > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#fef2f2',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#991b1b' }}>
                    Existen {stats?.overdueRecommendations} recomendación(es) vencida(s) que requieren atención.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#b91c1c' }}>
                    Prioriza y actualiza el seguimiento de las recomendaciones vencidas.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 5: Actions ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🎯 Acciones derivadas
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              {totalActions > 0 ? (
                <>
                  <CoverageBar label="Acciones completadas" numerator={stats?.completedActions ?? 0} denominator={totalActions} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem', marginTop: '1rem' }}>
                    <StatusIndicator label="Total acciones" count={totalActions} color="#0f172a" icon="📌" />
                    <StatusIndicator label="Pendientes" count={stats?.pendingActions ?? 0} color="#d97706" icon="⏳" />
                    <StatusIndicator label="Completadas" count={stats?.completedActions ?? 0} color="#15803d" icon="✅" />
                  </div>
                </>
              ) : (
                <div style={{
                  padding: '.75rem',
                  backgroundColor: '#f0f9ff',
                  borderRadius: 8,
                  border: '1px solid #bae6fd',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#0369a1' }}>
                    Sin acciones registradas
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#0284c7' }}>
                    Las acciones se derivan de las recomendaciones médicas registradas.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 6: Effectiveness ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              ✅ Verificación de efectividad
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <CoverageBar label="Efectividad verificada" numerator={stats?.effectivenessVerified ?? 0} denominator={totalRecommendations} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem', marginTop: '1rem' }}>
                <StatusIndicator label="Verificadas" count={stats?.effectivenessVerified ?? 0} color="#15803d" icon="✅" />
                <StatusIndicator label="Pendientes" count={stats?.effectivenessPending ?? 0} color="#d97706" icon="⏳" />
              </div>

              {(stats?.effectivenessPending ?? 0) > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#faf5ff',
                  borderRadius: 8,
                  border: '1px solid #e9d5ff',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#6b21a8' }}>
                    Existen {stats?.effectivenessPending} recomendación(es) con efectividad pendiente de verificación.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#7e22ce' }}>
                    Verificar administrativamente la efectividad de las acciones completadas.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 7: Quick Actions ── */}
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
                  Ir a Empleados
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

          {/* ── Section 8: Intelligence ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🧠 Inteligencia y cumplimiento
            </h2>
            <div style={{ display: 'grid', gap: '.75rem' }}>
              <ComplianceResultCard
                token={token}
                module="medical-recommendation"
                standardCode="3.1.3"
                standardTitle="Seguimiento a recomendaciones médicas"
                actionRoute="/medical-recommendation-management"
              />
              <ComplianceAIInsight token={token} standardCode="3.1.3" />
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
