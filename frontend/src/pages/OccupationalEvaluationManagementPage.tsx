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
        {numerator} de {denominator} evaluaciones
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

/* ── Alert card ── */

function AlertCard({ severity, message }: { severity: 'high' | 'medium' | 'low'; message: string }) {
  const bg = severity === 'high' ? '#fef2f2' : severity === 'medium' ? '#fffbeb' : '#f0fdf4';
  const border = severity === 'high' ? '#fecaca' : severity === 'medium' ? '#fde68a' : '#bbf7d0';
  const text = severity === 'high' ? '#991b1b' : severity === 'medium' ? '#92400e' : '#15803d';

  return (
    <div style={{
      padding: '.75rem',
      backgroundColor: bg,
      borderRadius: 8,
      border: `1px solid ${border}`,
      marginBottom: '.5rem',
    }}>
      <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: text }}>
        {message}
      </p>
    </div>
  );
}

/* ── Main component ── */

export function OccupationalEvaluationManagementPage({ token }: Props) {
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

  const totalExams = stats?.totalExams ?? 0;
  const hasExams = totalExams > 0;

  /* ── Alertas ── */

  const alerts: Array<{ severity: 'high' | 'medium' | 'low'; message: string }> = [];

  if ((stats?.expiredExams ?? 0) > 0) {
    alerts.push({ severity: 'high', message: `Existen ${stats!.expiredExams} evaluación(es) vencida(s) que requieren atención.` });
  }
  if ((stats?.communicationPending ?? 0) > 0) {
    alerts.push({ severity: 'medium', message: `Existen ${stats!.communicationPending} evaluación(es) sin comunicación confirmada al trabajador.` });
  }
  if ((stats?.periodicityPending ?? 0) > 0) {
    alerts.push({ severity: 'medium', message: `Existen ${stats!.periodicityPending} evaluación(es) periódica(s) sin periodicidad definida.` });
  }
  if ((stats?.hazardCoveragePending ?? 0) > 0) {
    alerts.push({ severity: 'medium', message: `Existen ${stats!.hazardCoveragePending} evaluación(es) sin relación con peligros ocupacionales.` });
  }

  /* ── Render ── */

  return (
    <div className="page" style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
              📋 Realización de Evaluaciones Médicas Ocupacionales
            </h1>
            <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b' }}>
              Gestión avanzada del cumplimiento de evaluaciones médicas ocupacionales — Estándar 3.1.4
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
          Cargando información de evaluaciones médicas ocupacionales…
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
      ) : !hasExams ? (
        /* ── Empty state: no exams ── */
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📭</div>
          <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
            No hay evaluaciones médicas ocupacionales registradas
          </p>
          <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
            Registra evaluaciones médicas ocupacionales en el módulo de Empleados para comenzar a evaluar el cumplimiento del estándar 3.1.4.
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
              <StatCard label="Total evaluaciones" value={totalExams} color="#2563eb" />
              <StatCard label="Ingreso" value={stats?.entryExams ?? 0} color="#0f172a" />
              <StatCard label="Periódicas" value={stats?.periodicExams ?? 0} color="#7c3aed" />
              <StatCard label="Egreso" value={stats?.exitExams ?? 0} color="#0891b2" />
              <StatCard label="Completadas" value={stats?.completedExams ?? 0} color="#15803d" />
              <StatCard label="Comunicación" value={stats?.communicationAcknowledged ?? 0} color="#16a34a" />
              <StatCard label="Periodicidad" value={stats?.periodicityDefined ?? 0} color="#d97706" />
              <StatCard label="Peligros" value={stats?.hazardCoverage ?? 0} color="#9333ea" />
            </div>
          </section>

          {/* ── Section 2: Cobertura de evaluaciones ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📈 Cobertura de evaluaciones
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <CoverageBar label="Evaluaciones de ingreso" numerator={stats?.entryExams ?? 0} denominator={totalExams} />
              <CoverageBar label="Evaluaciones periódicas" numerator={stats?.periodicExams ?? 0} denominator={totalExams} />
              <CoverageBar label="Evaluaciones de egreso" numerator={stats?.exitExams ?? 0} denominator={totalExams} />
              <CoverageBar label="Evaluaciones completadas" numerator={stats?.completedExams ?? 0} denominator={totalExams} />
            </div>
          </section>

          {/* ── Section 3: Comunicación al trabajador ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              📨 Comunicación de resultados
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <CoverageBar
                label="Comunicación registrada"
                numerator={stats?.communicationAcknowledged ?? 0}
                denominator={totalExams}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem', marginTop: '1rem' }}>
                <StatusIndicator label="Comunicación realizada" count={stats?.communicationAcknowledged ?? 0} color="#16a34a" icon="✅" />
                <StatusIndicator label="Comunicación pendiente" count={stats?.communicationPending ?? 0} color="#d97706" icon="⏳" />
              </div>

              {(stats?.communicationPending ?? 0) > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#fffbeb',
                  borderRadius: 8,
                  border: '1px solid #fde68a',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#92400e' }}>
                    Existen {stats!.communicationPending} evaluación(es) sin constancia de comunicación al trabajador.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#b45309' }}>
                    El estándar 3.1.4 requiere comunicación por escrito de los resultados de las evaluaciones médicas.
                  </p>
                </div>
              )}

              {(stats?.communicationPending ?? 0) === 0 && (
                <div style={{
                  marginTop: '.5rem',
                  padding: '.75rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  border: '1px solid #bbf7d0',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#15803d' }}>
                    Toda la comunicación de resultados está registrada.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 4: Periodicidad ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🔄 Periodicidad de evaluaciones
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <CoverageBar
                label="Periodicidad definida"
                numerator={stats?.periodicityDefined ?? 0}
                denominator={totalExams}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem', marginTop: '1rem' }}>
                <StatusIndicator label="Periodicidad definida" count={stats?.periodicityDefined ?? 0} color="#16a34a" icon="✅" />
                <StatusIndicator label="Periodicidad pendiente" count={stats?.periodicityPending ?? 0} color="#d97706" icon="⏳" />
              </div>

              {(stats?.periodicityPending ?? 0) > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#fffbeb',
                  borderRadius: 8,
                  border: '1px solid #fde68a',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#92400e' }}>
                    Existen {stats!.periodicityPending} evaluación(es) periódica(s) sin periodicidad registrada.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#b45309' }}>
                    El estándar 3.1.4 requiere definir la frecuencia de las evaluaciones periódicas.
                  </p>
                </div>
              )}

              {(stats?.periodicityPending ?? 0) === 0 && (
                <div style={{
                  marginTop: '.5rem',
                  padding: '.75rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  border: '1px solid #bbf7d0',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#15803d' }}>
                    Todas las evaluaciones periódicas tienen periodicidad definida.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 5: Peligros ocupacionales ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              ⚠️ Relación con peligros ocupacionales
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              <CoverageBar
                label="Cobertura de peligros"
                numerator={stats?.hazardCoverage ?? 0}
                denominator={totalExams}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.5rem', marginTop: '1rem' }}>
                <StatusIndicator label="Con peligros asociados" count={stats?.hazardCoverage ?? 0} color="#16a34a" icon="✅" />
                <StatusIndicator label="Sin peligros asociados" count={stats?.hazardCoveragePending ?? 0} color="#d97706" icon="⏳" />
              </div>

              {(stats?.hazardCoveragePending ?? 0) > 0 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '.75rem',
                  backgroundColor: '#fffbeb',
                  borderRadius: 8,
                  border: '1px solid #fde68a',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#92400e' }}>
                    Existen {stats!.hazardCoveragePending} evaluación(es) que requieren asociación con peligros ocupacionales.
                  </p>
                  <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', color: '#b45309' }}>
                    El estándar 3.1.4 requiere evidencia de la relación entre evaluaciones y peligros/exposición.
                  </p>
                </div>
              )}

              {(stats?.hazardCoveragePending ?? 0) === 0 && (
                <div style={{
                  marginTop: '.5rem',
                  padding: '.75rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  border: '1px solid #bbf7d0',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#15803d' }}>
                    Todas las evaluaciones tienen peligros ocupacionales asociados.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 6: Distribuciones ── */}
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
                <DistributionBlock title="📋 Tipo de evaluación" entries={stats?.examTypeDistribution} labelMap={EXAM_TYPE_LABELS} />
                <DistributionBlock title="🏥 Aptitud" entries={stats?.fitnessDistribution} labelMap={FITNESS_LABELS} />
                <DistributionBlock title="🏢 Área" entries={stats?.areaDistribution} />
                <DistributionBlock title="📝 Tipo de contrato" entries={stats?.contractTypeDistribution} />
              </div>
            </div>
          </section>

          {/* ── Section 7: Alertas ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🚨 Alertas administrativas
            </h2>
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
            }}>
              {alerts.length > 0 ? (
                alerts.map((alert, i) => (
                  <AlertCard key={i} severity={alert.severity} message={alert.message} />
                ))
              ) : (
                <div style={{
                  padding: '.75rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 8,
                  border: '1px solid #bbf7d0',
                }}>
                  <p style={{ margin: 0, fontSize: '.85rem', fontWeight: 600, color: '#15803d' }}>
                    No se identifican alertas administrativas pendientes.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 8: Actions ── */}
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
                <Button type="button" variant="secondary" onClick={() => navigate('/documents/do')}>
                  Volver al PHVA
                </Button>
              </div>
            </div>
          </section>

          {/* ── Section 9: Intelligence ── */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
              🧠 Inteligencia y cumplimiento
            </h2>
            <div style={{ display: 'grid', gap: '.75rem' }}>
              <ComplianceResultCard
                token={token}
                module="occupational-evaluation"
                standardCode="3.1.4"
                standardTitle="Realización de Evaluaciones Médicas Ocupacionales"
                actionRoute="/occupational-evaluation-management"
              />
              <ComplianceAIInsight token={token} standardCode="3.1.4" />
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
