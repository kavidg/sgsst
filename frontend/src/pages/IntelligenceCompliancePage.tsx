import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ComplianceResultCard } from '../components/ComplianceResultCard';
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';
import { IntelligenceAssistant } from '../components/IntelligenceAssistant';
import { Button } from '../components/ui/Button';
import { fetchSociodemographicStats, fetchOccupationalExamStats } from '../api';
import type { SociodemographicStats, OccupationalExamStats } from '../api';

type Props = {
  token: string;
};

/* ── Label helpers ── */

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

const EXAM_TYPE_LABELS: Record<string, string> = {
  ENTRY: 'Ingreso',
  PERIODIC: 'Periódico',
  EXIT: 'Egreso',
  POST_INCAPACITY: 'Post-incapacidad',
  CHANGE_OF_OCCUPATION: 'Cambio de ocupación',
  OTHER: 'Otro',
};

const EXAM_STATUS_LABELS: Record<string, string> = {
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
  entries: Array<{ label: string; count: number }>;
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

/* ── Main component ── */

export function IntelligenceCompliancePage({ token }: Props) {
  const navigate = useNavigate();

  // Sociodemographic stats
  const [socioLoading, setSocioLoading] = useState(true);
  const [socioError, setSocioError] = useState('');
  const [socioStats, setSocioStats] = useState<SociodemographicStats | null>(null);

  // Occupational exam stats
  const [examLoading, setExamLoading] = useState(true);
  const [examError, setExamError] = useState('');
  const [examStats, setExamStats] = useState<OccupationalExamStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSocioLoading(true);
    fetchSociodemographicStats(token)
      .then((stats) => { if (!cancelled) setSocioStats(stats); })
      .catch((err) => { if (!cancelled) setSocioError(err instanceof Error ? err.message : 'Error al cargar estadísticas'); })
      .finally(() => { if (!cancelled) setSocioLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setExamLoading(true);
    fetchOccupationalExamStats(token)
      .then((stats) => { if (!cancelled) setExamStats(stats); })
      .catch((err) => { if (!cancelled) setExamError(err instanceof Error ? err.message : 'Error al cargar estadísticas de exámenes'); })
      .finally(() => { if (!cancelled) setExamLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="page" style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
          🤖 Inteligencia y cumplimiento
        </h1>
        <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b' }}>
          Análisis inteligente, cumplimiento y asistencia IA del SG-SST
        </p>
      </div>

      {/* ── 1. Compliance Overview ── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
          📊 Cumplimiento por estándar
        </h2>
        <div style={{ display: 'grid', gap: '.75rem' }}>
          <ComplianceResultCard
            token={token}
            module="acquisitions"
            standardCode="2.9.1"
            standardTitle="Adquisiciones"
            actionRoute="/acquisitions"
          />
          <ComplianceResultCard
            token={token}
            module="contracting"
            standardCode="2.10.1"
            standardTitle="Contratación"
            actionRoute="/contracting"
          />
          <ComplianceResultCard
            token={token}
            module="change-management"
            standardCode="2.11.1"
            standardTitle="Gestión del cambio"
            actionRoute="/change-management"
          />
          <ComplianceResultCard
            token={token}
            module="sociodemographic"
            standardCode="3.1.1"
            standardTitle="Perfil sociodemográfico"
            actionRoute="/sociodemographic-management"
          />
          <ComplianceResultCard
            token={token}
            module="occupational-exam"
            standardCode="3.1.2"
            standardTitle="Exámenes médicos ocupacionales"
            actionRoute="/occupational-exam-management"
          />
          <ComplianceResultCard
            token={token}
            module="medical-recommendation"
            standardCode="3.1.3"
            standardTitle="Seguimiento a recomendaciones médicas"
            actionRoute="/medical-recommendation-management"
          />
          <ComplianceResultCard
            token={token}
            module="occupational-evaluation"
            standardCode="3.1.4"
            standardTitle="Realización de Evaluaciones Médicas Ocupacionales"
            actionRoute="/occupational-evaluation-management"
          />
          <ComplianceResultCard
            token={token}
            module="absenteeism"
            standardCode="3.2.1"
            standardTitle="Registro de ausentismo"
            actionRoute="/absenteeism"
          />
          <ComplianceResultCard
            token={token}
            module="disease-investigation"
            standardCode="3.2.2"
            standardTitle="Investigación de enfermedades laborales"
            actionRoute="/disease-investigation-management"
          />
        </div>
      </section>

      {/* ── 2. Sociodemographic Profile Detail ── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
          👥 Perfil sociodemográfico — 3.1.1
        </h2>

        {socioLoading ? (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#94a3b8',
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}>
            Cargando estadísticas sociodemográficas…
          </div>
        ) : socioError ? (
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#fef2f2',
            borderRadius: 12,
            border: '1px solid #fecaca',
          }}>
            <p style={{ margin: 0, color: '#dc2626', fontSize: '.9rem' }}>{socioError}</p>
            <Button type="button" variant="secondary" onClick={() => {
              setSocioLoading(true);
              setSocioError('');
              fetchSociodemographicStats(token)
                .then(setSocioStats)
                .catch((err) => setSocioError(err instanceof Error ? err.message : 'Error'))
                .finally(() => setSocioLoading(false));
            }} style={{ marginTop: '.5rem' }}>
              Reintentar
            </Button>
          </div>
        ) : !socioStats || socioStats.totalWorkers === 0 ? (
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
              Registra la información de los trabajadores en el módulo de Empleados para construir el perfil sociodemográfico.
            </p>
            <Button type="button" onClick={() => navigate('/employees')} style={{ marginTop: '.75rem' }}>
              Ir a Empleados
            </Button>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
          }}>
            {/* KPI row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '1rem' }}>
              <StatCard label="Trabajadores" value={socioStats.totalWorkers} color="#0f172a" />
              <StatCard
                label="Perfiles completos"
                value={`${socioStats.completeProfiles}/${socioStats.totalWorkers}`}
                color="#15803d"
              />
              <StatCard
                label="Completitud"
                value={`${socioStats.completionPercentage}%`}
                color={socioStats.completionPercentage >= 80 ? '#16a34a' : socioStats.completionPercentage >= 50 ? '#d97706' : '#dc2626'}
              />
              <StatCard label="Actualizaciones recientes" value={socioStats.recentUpdates} color="#64748b" />
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: '#e2e8f0',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  borderRadius: 4,
                  width: `${Math.min(100, socioStats.completionPercentage)}%`,
                  backgroundColor: socioStats.completionPercentage >= 80 ? '#16a34a'
                    : socioStats.completionPercentage >= 50 ? '#d97706'
                    : '#dc2626',
                  transition: 'width .3s ease',
                }} />
              </div>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '.25rem' }}>
                {socioStats.completeProfiles} de {socioStats.totalWorkers} perfiles con los 4 campos principales completos
              </div>
            </div>

            {/* Distributions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.75rem' }}>
              <DistributionBlock title="📅 Rangos de edad" entries={socioStats.ageRanges} />
              <DistributionBlock title="⚧ Género" entries={socioStats.genderDistribution} labelMap={GENDER_LABELS} />
              <DistributionBlock title="🎓 Nivel educativo" entries={socioStats.educationDistribution} labelMap={EDUCATION_LABELS} />
              <DistributionBlock title="💍 Estado civil" entries={socioStats.maritalStatusDistribution} labelMap={MARITAL_LABELS} />
              <DistributionBlock title="📋 Tipo de contrato" entries={socioStats.contractTypeDistribution} />
              <DistributionBlock title="🕐 Jornada laboral" entries={socioStats.workScheduleDistribution} />
              <DistributionBlock title="🏠 Tipo de vivienda" entries={socioStats.housingTypeDistribution} />
              <DistributionBlock title="🌍 Grupo étnico" entries={socioStats.ethnicGroupDistribution} />
              <DistributionBlock title="♿ Discapacidad" entries={socioStats.disabilityDistribution} />
              <DistributionBlock title="📊 Estrato" entries={socioStats.socioeconomicStratumDistribution.map(d => ({ label: `Estrato ${d.stratum}`, count: d.count }))} />
              <DistributionBlock title="👨‍👩‍👧 Personas a cargo" entries={socioStats.dependentsDistribution} />
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Occupational Exam Detail ── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
          🏥 Exámenes médicos ocupacionales — 3.1.2
        </h2>

        {examLoading ? (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#94a3b8',
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}>
            Cargando estadísticas de exámenes médicos…
          </div>
        ) : examError ? (
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#fef2f2',
            borderRadius: 12,
            border: '1px solid #fecaca',
          }}>
            <p style={{ margin: 0, color: '#dc2626', fontSize: '.9rem' }}>{examError}</p>
            <Button type="button" variant="secondary" onClick={() => {
              setExamLoading(true);
              setExamError('');
              fetchOccupationalExamStats(token)
                .then(setExamStats)
                .catch((err) => setExamError(err instanceof Error ? err.message : 'Error'))
                .finally(() => setExamLoading(false));
            }} style={{ marginTop: '.5rem' }}>
              Reintentar
            </Button>
          </div>
        ) : !examStats || examStats.totalExams === 0 ? (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📭</div>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
              No hay exámenes médicos registrados
            </p>
            <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
              Registra los exámenes de los trabajadores en el módulo de Empleados para iniciar la evaluación del estándar 3.1.2.
            </p>
            <Button type="button" onClick={() => navigate('/employees')} style={{ marginTop: '.75rem' }}>
              Ir a Empleados
            </Button>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
          }}>
            {/* KPI row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '1rem' }}>
              <StatCard label="Trabajadores" value={examStats.totalWorkers} color="#0f172a" />
              <StatCard label="Total exámenes" value={examStats.totalExams} color="#2563eb" />
              <StatCard label="Completados" value={examStats.completedExams} color="#15803d" />
              <StatCard label="Programados" value={examStats.scheduledExams} color="#d97706" />
              <StatCard label="Vencidos" value={examStats.expiredExams} color="#dc2626" />
              <StatCard label="Seguimientos" value={examStats.followUpsRequired} color="#7c3aed" />
              <StatCard label="Próximos" value={examStats.upcomingExams} color="#0891b2" />
            </div>

            {/* Distributions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.75rem' }}>
              <DistributionBlock title="📋 Tipo de examen" entries={examStats.examTypeDistribution} labelMap={EXAM_TYPE_LABELS} />
              <DistributionBlock title="📊 Estado" entries={examStats.statusDistribution} labelMap={EXAM_STATUS_LABELS} />
              <DistributionBlock title="🏥 Aptitud" entries={examStats.fitnessDistribution} labelMap={FITNESS_LABELS} />
              <DistributionBlock title="🏢 Área" entries={examStats.areaDistribution} />
              <DistributionBlock title="📝 Tipo de contrato" entries={examStats.contractTypeDistribution} />
            </div>
          </div>
        )}
      </section>

      {/* ── 4. AI Insights ── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
          🧠 Análisis inteligente
        </h2>
        <div style={{ display: 'grid', gap: '.75rem' }}>
          <ComplianceAIInsight token={token} standardCode="2.9.1" />
          <ComplianceAIInsight token={token} standardCode="2.10.1" />
          <ComplianceAIInsight token={token} standardCode="2.11.1" />
          <ComplianceAIInsight token={token} standardCode="3.1.1" />
          <ComplianceAIInsight token={token} standardCode="3.1.2" />
          <ComplianceAIInsight token={token} standardCode="3.1.3" />
          <ComplianceAIInsight token={token} standardCode="3.1.4" />
          <ComplianceAIInsight token={token} standardCode="3.2.1" />
          <ComplianceAIInsight token={token} standardCode="3.2.2" />
        </div>
      </section>

      {/* ── 4. Global AI Assistant ── */}
      <section>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '.75rem' }}>
          🤖 Asistente IA global
        </h2>
        <IntelligenceAssistant token={token} />
      </section>
    </div>
  );
}
