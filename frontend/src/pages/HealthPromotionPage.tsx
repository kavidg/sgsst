import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  createHealthPromotionActivity,
  createLifestyleHealthyEnvironmentActivity,
  deactivateHealthPromotionActivity,
  deactivateLifestyleHealthyEnvironmentActivity,
  EmployeeModel,
  fetchEmployees,
  fetchHealthPromotionActivities,
  fetchRisks,
  HealthPromotionActivityModel,
  HealthPromotionCategoryType,
  HealthPromotionComplianceStandardType,
  HealthPromotionStatusType,
  LifestyleTopicType,
  reactivateHealthPromotionActivity,
  reactivateLifestyleHealthyEnvironmentActivity,
  RiskModel,
  updateHealthPromotionActivity,
  updateLifestyleHealthyEnvironmentActivity,
  UserRole,
} from '../api';
import { HazardPicker } from '../components/HazardPicker';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';

type Props = {
  token: string;
  role?: UserRole;
};

const CATEGORY_OPTIONS: { value: HealthPromotionCategoryType; label: string }[] = [
  { value: 'HEALTH_PROMOTION', label: 'Promoción de la salud' },
  { value: 'DISEASE_PREVENTION', label: 'Prevención de enfermedades' },
  { value: 'HEALTH_EDUCATION', label: 'Educación en salud' },
  { value: 'HEALTH_CAMPAIGN', label: 'Campaña / jornada de salud' },
  { value: 'HEALTH_SCREENING', label: 'Tamizaje / chequeo preventivo' },
  { value: 'HEALTH_VACCINATION', label: 'Vacunación' },
  { value: 'HEALTH_WELLNESS', label: 'Bienestar y estilos de vida' },
];

const STATUS_OPTIONS: { value: HealthPromotionStatusType; label: string }[] = [
  { value: 'PLANNED', label: 'Planificada' },
  { value: 'COMPLETED', label: 'Ejecutada / Completada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

// FASE 32 — frontera normativa 3.1.2 ↔ 3.1.7 (una evidencia = un estándar).
type StandardScope = '3.1.2' | '3.1.7';

const STANDARD_SCOPE: Record<StandardScope, { label: string; color: string; bg: string }> = {
  '3.1.2': { label: '3.1.2 Promoción y prevención', color: '#15803d', bg: '#f0fdf4' },
  '3.1.7': { label: '3.1.7 Estilos de vida y entornos', color: '#0f766e', bg: '#f0fdfa' },
};

const LIFESTYLE_TOPIC_OPTIONS: { value: LifestyleTopicType; label: string }[] = [
  { value: 'SMOKING_CONTROL', label: 'Control de tabaquismo' },
  { value: 'ALCOHOL_CONTROL', label: 'Control de alcoholismo' },
  { value: 'SUBSTANCE_DEPENDENCY_CONTROL', label: 'Control de farmacodependencia' },
  { value: 'HEALTHY_LIFESTYLE', label: 'Estilos de vida saludables' },
  { value: 'HEALTHY_ENVIRONMENT', label: 'Entornos saludables' },
  { value: 'OTHER', label: 'Otros factores del estándar' },
];

const LIFESTYLE_TOPIC_COLORS: Record<string, { color: string; bg: string }> = {
  SMOKING_CONTROL: { color: '#b91c1c', bg: '#fef2f2' },
  ALCOHOL_CONTROL: { color: '#9333ea', bg: '#faf5ff' },
  SUBSTANCE_DEPENDENCY_CONTROL: { color: '#c2410c', bg: '#fff7ed' },
  HEALTHY_LIFESTYLE: { color: '#0f766e', bg: '#f0fdfa' },
  HEALTHY_ENVIRONMENT: { color: '#4d7c0f', bg: '#f7fee7' },
  OTHER: { color: '#475569', bg: '#f1f5f9' },
};

function topicLabel(topic: string): string {
  return LIFESTYLE_TOPIC_OPTIONS.find((o) => o.value === topic)?.label ?? topic;
}

function standardOf(activity: HealthPromotionActivityModel): StandardScope {
  // Legacy (sin campo) se interpreta como 3.1.2 (política FASE 32).
  return activity.complianceStandard === 'STANDARD_3_1_7' ? '3.1.7' : '3.1.2';
}

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  HEALTH_PROMOTION: { color: '#15803d', bg: '#f0fdf4' },
  DISEASE_PREVENTION: { color: '#2563eb', bg: '#eff6ff' },
  HEALTH_EDUCATION: { color: '#7c3aed', bg: '#faf5ff' },
  HEALTH_CAMPAIGN: { color: '#0891b2', bg: '#ecfeff' },
  HEALTH_SCREENING: { color: '#d97706', bg: '#fffbeb' },
  HEALTH_VACCINATION: { color: '#be123c', bg: '#fff1f2' },
  HEALTH_WELLNESS: { color: '#0f766e', bg: '#f0fdfa' },
};

const emptyForm = {
  code: '',
  title: '',
  description: '',
  category: 'HEALTH_PROMOTION' as HealthPromotionCategoryType,
  complianceStandard: 'STANDARD_3_1_2' as HealthPromotionComplianceStandardType,
  lifestyleTopic: 'HEALTHY_LIFESTYLE' as LifestyleTopicType,
  objective: '',
  activityDate: '',
  responsible: '',
  targetPopulation: '',
  targetEmployeeIds: [] as string[],
  participantEmployeeIds: [] as string[],
  relatedRiskIds: [] as string[],
  evidence: '',
  status: 'PLANNED' as HealthPromotionStatusType,
  active: true,
};

function catLabel(category: string): string {
  return CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;
}

/* ── Selector de trabajadores (Employee real, mismo tenant) ── */

function WorkerMultiPicker({ employees, selected, onToggle, placeholder }: {
  employees: EmployeeModel[];
  selected: string[];
  onToggle: (employeeId: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) =>
      `${employee.name} ${employee.document} ${employee.position} ${employee.area}`.toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{ marginBottom: '.35rem' }}
      />
      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: '.35rem', backgroundColor: '#fff' }}>
        {filtered.length === 0 ? (
          <p style={{ margin: '.25rem', fontSize: '.8rem', color: '#94a3b8' }}>
            No hay trabajadores registrados en esta empresa.
          </p>
        ) : (
          filtered.map((employee) => {
            const checked = selected.includes(employee._id);
            return (
              <label key={employee._id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '.45rem',
                padding: '.25rem .4rem',
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: checked ? '#eff6ff' : 'transparent',
              }}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(employee._id)} style={{ marginTop: '.2rem' }} />
                <span style={{ fontSize: '.8rem', lineHeight: 1.3 }}>
                  <strong>{employee.name}</strong>
                  <span style={{ color: '#64748b' }}> — {employee.document}{employee.position ? ` · ${employee.position}` : ''}</span>
                </span>
              </label>
            );
          })
        )}
      </div>
      <p style={{ fontSize: '.72rem', color: '#64748b', margin: '.25rem 0 0' }}>{selected.length} trabajador(es) seleccionado(s).</p>
    </div>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  const color = active ? (status === 'COMPLETED' ? '#15803d' : status === 'PLANNED' ? '#2563eb' : '#94a3b8') : '#64748b';
  const bg = active ? (status === 'COMPLETED' ? '#f0fdf4' : status === 'PLANNED' ? '#eff6ff' : '#f1f5f9') : '#f1f5f9';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color, backgroundColor: bg }}>
      {active
        ? STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
        : 'Inactiva'}
    </span>
  );
}

export function HealthPromotionPage({ token, role }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const canWrite = role === 'owner' || role === 'admin';
  const readOnly = !canWrite;

  // FASE 32 — alcance del módulo: 3.1.2 (promoción/prevención) ó 3.1.7
  // (estilos de vida y entornos saludables). Frontera visible y explícita;
  // la autoridad de scoring siempre es el backend (providers).
  const scopeParam = searchParams.get('standard') === '3.1.7' ? '3.1.7' : '3.1.2';
  const scope: StandardScope = scopeParam;
  const isLifestyle = scope === '3.1.7';

  const [activities, setActivities] = useState<HealthPromotionActivityModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [risks, setRisks] = useState<RiskModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HealthPromotionStatusType>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | HealthPromotionCategoryType>('all');
  const [topicFilter, setTopicFilter] = useState<'all' | LifestyleTopicType>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [activityData, employeeData, riskData] = await Promise.all([
        fetchHealthPromotionActivities(token),
        fetchEmployees(token),
        fetchRisks(token),
      ]);
      setActivities(activityData);
      setEmployees(employeeData);
      setRisks(riskData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar las actividades de promoción y prevención.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((activity) => {
      // Frontera normativa del alcance actual (una evidencia = un estándar).
      if (standardOf(activity) !== scope) return false;
      if (statusFilter !== 'all' && activity.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && activity.category !== categoryFilter) return false;
      if (isLifestyle && topicFilter !== 'all' && activity.lifestyleTopic !== topicFilter) return false;
      if (!q) return true;
      return `${activity.code} ${activity.title} ${activity.responsible}`.toLowerCase().includes(q);
    });
  }, [activities, search, statusFilter, categoryFilter, topicFilter, scope, isLifestyle]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      complianceStandard: isLifestyle ? 'STANDARD_3_1_7' : 'STANDARD_3_1_2',
      lifestyleTopic: isLifestyle ? 'HEALTHY_LIFESTYLE' : emptyForm.lifestyleTopic,
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (activity: HealthPromotionActivityModel) => {
    setForm({
      code: activity.code,
      title: activity.title,
      description: activity.description ?? '',
      category: activity.category,
      complianceStandard: activity.complianceStandard === 'STANDARD_3_1_7' ? 'STANDARD_3_1_7' : 'STANDARD_3_1_2',
      lifestyleTopic: activity.lifestyleTopic ?? 'HEALTHY_LIFESTYLE',
      objective: activity.objective ?? '',
      activityDate: activity.activityDate ? activity.activityDate.slice(0, 10) : '',
      responsible: activity.responsible ?? '',
      targetPopulation: activity.targetPopulation ?? '',
      targetEmployeeIds: [...(activity.targetEmployeeIds ?? [])],
      participantEmployeeIds: [...(activity.participantEmployeeIds ?? [])],
      relatedRiskIds: [...(activity.relatedRiskIds ?? [])],
      evidence: activity.evidence ?? '',
      status: activity.status,
      active: activity.active,
    });
    setEditingId(activity._id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof typeof emptyForm>(field: K, value: (typeof emptyForm)[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleInList = (
    field: 'targetEmployeeIds' | 'participantEmployeeIds' | 'relatedRiskIds',
    id: string,
  ) => {
    setForm((prev) => {
      const list = prev[field];
      return {
        ...prev,
        [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.code.trim() || !form.title.trim()) {
      setError('El código y el título de la actividad son obligatorios.');
      return;
    }
    if (form.status === 'COMPLETED' && !form.activityDate) {
      setError('Una actividad ejecutada debe registrar la fecha de ejecución (activityDate).');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const basePayload = {
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        objective: form.objective,
        activityDate: form.activityDate || undefined,
        responsible: form.responsible,
        targetPopulation: form.targetPopulation,
        targetEmployeeIds: form.targetEmployeeIds,
        participantEmployeeIds: form.participantEmployeeIds,
        relatedRiskIds: form.relatedRiskIds,
        evidence: form.evidence,
        status: form.status,
        active: form.active,
      };
      if (editingId) {
        if (isLifestyle) {
          await updateLifestyleHealthyEnvironmentActivity(token, editingId, {
            ...basePayload,
            lifestyleTopic: form.lifestyleTopic,
          });
        } else {
          await updateHealthPromotionActivity(token, editingId, basePayload);
        }
      } else if (isLifestyle) {
        // FASE 32: la creación fija la clasificación normativa (inmutable).
        await createLifestyleHealthyEnvironmentActivity(token, {
          ...basePayload,
          lifestyleTopic: form.lifestyleTopic,
        });
      } else {
        await createHealthPromotionActivity(token, basePayload);
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la actividad.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (activity: HealthPromotionActivityModel) => {
    setError('');
    try {
      if (isLifestyle) {
        if (activity.active) {
          await deactivateLifestyleHealthyEnvironmentActivity(token, activity._id);
        } else {
          await reactivateLifestyleHealthyEnvironmentActivity(token, activity._id);
        }
      } else if (activity.active) {
        await deactivateHealthPromotionActivity(token, activity._id);
      } else {
        await reactivateHealthPromotionActivity(token, activity._id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cambiar el estado de la actividad.');
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page" style={{ maxWidth: 1120, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            {isLifestyle ? '🌿 Estilos de vida y entornos saludables' : '🩺 Promoción y prevención en salud'}
          </h1>
          <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b', maxWidth: 760 }}>
            {isLifestyle
              ? 'Controles de tabaquismo, alcoholismo, farmacodependencia y otros; estilos de vida y entornos saludables — Estándar 3.1.7.'
              : 'Actividades reales de promoción y prevención dirigidas a la población trabajadora — Estándar 3.1.2.'}
            {readOnly ? ' El perfil actual tiene permisos de solo lectura.' : ''}
          </p>
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem' }}>
            {(['3.1.2', '3.1.7'] as StandardScope[]).map((s) => {
              const cfg = STANDARD_SCOPE[s];
              const activeScope = scope === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSearchParams(s === '3.1.7' ? { standard: '3.1.7' } : {})}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 999,
                    fontSize: '.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: activeScope ? `1px solid ${cfg.color}` : '1px solid #e2e8f0',
                    color: activeScope ? cfg.color : '#64748b',
                    backgroundColor: activeScope ? cfg.bg : '#fff',
                  }}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={() => navigate('/documents/do')}>
            ← Volver al PHVA
          </Button>
          {!readOnly && (
            <Button type="button" onClick={openCreate} disabled={showForm}>
              + Nueva actividad
            </Button>
          )}
        </div>
      </div>

      {/* ── Guía de evaluación (sin recalcular: la fuente es el provider/ComplianceEngine) ── */}
      <Card title={isLifestyle ? '¿Qué se evalúa en 3.1.7?' : '¿Qué se evalúa en 3.1.2?'} style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem', fontSize: '.8rem', color: '#334155' }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C1 — Planificación (25%):</strong> existe al menos una actividad no cancelada en el período.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C2 — Cobertura (25%):</strong> trabajadores alcanzados por actividades <em>ejecutadas</em> / trabajadores totales.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C3 — Ejecución (25%):</strong> actividades ejecutadas (fecha + responsable + evidencia + participantes).
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C4 — Continuidad (25%):</strong> ejecución en varios períodos, no un registro aislado.
          </div>
        </div>
        <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#64748b' }}>
          Solo las actividades <strong>Ejecutadas</strong> (COMPLETED con fecha no futura) demuestran ejecución. Los exámenes médicos
          ocupacionales y las recomendaciones médicas NO cuentan como evidencia de este estándar. Una actividad puntúa en un solo
          estándar (3.1.2 ó 3.1.7) según su clasificación normativa. El porcentaje/hallazgos se reflejan en el PHVA — Hacer.
        </p>
      </Card>

      {error ? <pre className="error" style={{ marginBottom: '.75rem' }}>{error}</pre> : null}

      {/* ── Formulario ── */}
      {showForm && !readOnly && (
        <Card title={editingId ? 'Editar actividad' : `Nueva actividad ${isLifestyle ? 'de estilos de vida y entornos saludables' : 'de promoción y prevención'}`} style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Código *</span>
                <Input value={form.code} onChange={(e) => updateField('code', e.target.value)} placeholder="Ej: PYP-001" required />
              </label>
              <label className="field">
                <span className="label">Título *</span>
                <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Ej: Jornada de vacunación contra influenza" required />
              </label>
              <label className="field">
                <span className="label">Categoría</span>
                <Select value={form.category} onChange={(e) => updateField('category', e.target.value as HealthPromotionCategoryType)}>
                  {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Estándar normativo (fijo)</span>
                <Select
                  value={form.complianceStandard}
                  disabled
                  onChange={() => {
                    /* FASE 32: la clasificación se define por el alcance
                       seleccionado (3.1.2/3.1.7) y es inmutable tras crear. */
                  }}
                >
                  <option value="STANDARD_3_1_2">3.1.2 — Promoción y prevención</option>
                  <option value="STANDARD_3_1_7">3.1.7 — Estilos de vida y entornos</option>
                </Select>
                <p style={{ fontSize: '.72rem', color: '#64748b', margin: '.25rem 0 0' }}>
                  Una actividad puntúa en UN solo estándar (sin doble scoring). Se define por el alcance
                  seleccionado arriba y no es modificable después de crearla.
                </p>
              </label>
              {form.complianceStandard === 'STANDARD_3_1_7' && (
                <label className="field">
                  <span className="label">Tema 3.1.7</span>
                  <Select value={form.lifestyleTopic} onChange={(e) => updateField('lifestyleTopic', e.target.value as LifestyleTopicType)}>
                    {LIFESTYLE_TOPIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </label>
              )}
              <label className="field">
                <span className="label">Estado</span>
                <Select value={form.status} onChange={(e) => updateField('status', e.target.value as HealthPromotionStatusType)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">{form.status === 'COMPLETED' ? 'Fecha de ejecución *' : 'Fecha (programada o ejecución)'}</span>
                <Input
                  type="date"
                  value={form.activityDate}
                  max={form.status === 'COMPLETED' ? today : undefined}
                  onChange={(e) => updateField('activityDate', e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Responsable</span>
                <Input value={form.responsible} onChange={(e) => updateField('responsible', e.target.value)} placeholder="Nombre/rol del responsable" />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Objetivo</span>
                <textarea className="input" rows={2} value={form.objective} onChange={(e) => updateField('objective', e.target.value)} placeholder="Objetivo de la actividad…" />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Descripción</span>
                <textarea className="input" rows={2} value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Descripción de la actividad…" />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Población objetivo (descripción)</span>
                <Input value={form.targetPopulation} onChange={(e) => updateField('targetPopulation', e.target.value)} placeholder="Ej: Todo el personal de la planta de producción" />
              </label>
            </div>

            <div className="grid grid-2" style={{ marginTop: '.5rem' }}>
              <div className="field">
                <span className="label">Trabajadores objetivo (convocados)</span>
                <WorkerMultiPicker
                  employees={employees}
                  selected={form.targetEmployeeIds}
                  onToggle={(id) => toggleInList('targetEmployeeIds', id)}
                  placeholder="Buscar por nombre, documento o cargo…"
                />
              </div>
              <div className="field">
                <span className="label">Participantes (trabajadores alcanzados) *</span>
                <WorkerMultiPicker
                  employees={employees}
                  selected={form.participantEmployeeIds}
                  onToggle={(id) => toggleInList('participantEmployeeIds', id)}
                  placeholder="Buscar por nombre, documento o cargo…"
                />
                <p style={{ fontSize: '.72rem', color: '#64748b', margin: '.25rem 0 0' }}>
                  Los participantes reales determinan la cobertura (C2). Los convocados no cuentan como alcanzados.
                </p>
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Peligros/riesgos prioritarios relacionados (matriz de riesgos — opcional)</span>
                <HazardPicker risks={risks} selected={form.relatedRiskIds} onToggle={(id) => toggleInList('relatedRiskIds', id)} />
              </div>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Evidencia / registro de ejecución</span>
                <textarea className="input" rows={3} value={form.evidence} onChange={(e) => updateField('evidence', e.target.value)} placeholder="Acta, registro de asistencia, fotos, link del documento, etc." />
              </label>
              <label className="field">
                <span className="label">Registro activo</span>
                <Select value={form.active ? 'true' : 'false'} onChange={(e) => updateField('active', e.target.value === 'true')}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </Select>
              </label>
            </div>

            <div className="actions">
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear actividad'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Filtros + listado ── */}
      <Card title={isLifestyle ? `Actividades de estilos de vida y entornos saludables (${filtered.length})` : `Actividades de promoción y prevención (${filtered.length})`}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, título o responsable…" style={{ maxWidth: 300 }} />
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)} style={{ maxWidth: 220 }}>
            <option value="all">Todas las categorías</option>
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {isLifestyle && (
            <Select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value as typeof topicFilter)} style={{ maxWidth: 250 }}>
              <option value="all">Todos los temas 3.1.7</option>
              {LIFESTYLE_TOPIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ maxWidth: 190 }}>
            <option value="all">Todos los estados</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '.9rem' }}>Cargando actividades…</p>
        ) : activities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>🩺</div>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
              No hay actividades de promoción y prevención registradas
            </p>
            <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
              {readOnly
                ? 'Las actividades se gestionan con un usuario owner o admin de la empresa.'
                : 'Registra la primera actividad (planificada o ejecutada) para el estándar 3.1.2.'}
            </p>
            {!readOnly ? (
              <Button type="button" onClick={openCreate} style={{ marginTop: '.75rem' }}>+ Nueva actividad</Button>
            ) : null}
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>Ninguna actividad coincide con los filtros.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="border border-black p-3">Código</th>
                <th className="border border-black p-3">Actividad</th>
                <th className="border border-black p-3">Categoría</th>
                <th className="border border-black p-3">Fecha</th>
                <th className="border border-black p-3">Estado</th>
                <th className="border border-black p-3">Responsable</th>
                <th className="border border-black p-3">Particip.</th>
                <th className="border border-black p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((activity) => {
                const cat = CATEGORY_COLORS[activity.category] ?? CATEGORY_COLORS.HEALTH_PROMOTION;
                return (
                  <tr key={activity._id}>
                    <td className="border border-black p-3" style={{ fontWeight: 600 }}>{activity.code}</td>
                    <td className="border border-black p-3">
                      <div style={{ fontWeight: 500 }}>{activity.title}</div>
                      {activity.objective ? <div style={{ fontSize: '.72rem', color: '#64748b' }}>{activity.objective}</div> : null}
                    </td>
                    <td className="border border-black p-3">
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color: cat.color, backgroundColor: cat.bg }}>
                        {catLabel(activity.category)}
                      </span>
                      {standardOf(activity) === '3.1.7' && activity.lifestyleTopic ? (
                        <div style={{ marginTop: '.25rem' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.68rem', fontWeight: 600, color: LIFESTYLE_TOPIC_COLORS[activity.lifestyleTopic]?.color ?? '#475569', backgroundColor: LIFESTYLE_TOPIC_COLORS[activity.lifestyleTopic]?.bg ?? '#f1f5f9' }}>
                            {topicLabel(activity.lifestyleTopic)}
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>
                      {activity.activityDate ? new Date(activity.activityDate).toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td className="border border-black p-3"><StatusBadge status={activity.status} active={activity.active} /></td>
                    <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>{activity.responsible || '—'}</td>
                    <td className="border border-black p-3" style={{ textAlign: 'center' }}>{activity.participantEmployeeIds?.length ?? 0}</td>
                    <td className="border border-black p-3">
                      {readOnly ? (
                        <span style={{ fontSize: '.75rem', color: '#64748b' }}>Solo lectura</span>
                      ) : (
                        <div className="actions">
                          <Button type="button" variant="secondary" onClick={() => openEdit(activity)} style={{ fontSize: '.75rem' }}>Editar</Button>
                          <Button
                            type="button"
                            variant={activity.active ? 'secondary' : 'primary'}
                            onClick={() => void handleToggleActive(activity)}
                            style={{ fontSize: '.75rem' }}
                          >
                            {activity.active ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
