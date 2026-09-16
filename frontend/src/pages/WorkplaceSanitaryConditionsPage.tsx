import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createWorkplaceSanitaryCondition,
  deactivateWorkplaceSanitaryCondition,
  fetchWorkplaceSanitaryConditions,
  SanitaryConditionFrequencyType,
  SanitaryConditionResultType,
  SanitaryConditionStatusType,
  SanitaryConditionTypeType,
  updateWorkplaceSanitaryCondition,
  UserRole,
  WorkplaceSanitaryConditionModel,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';

type Props = {
  token: string;
  role?: UserRole;
};

const CONDITION_TYPE_OPTIONS: { value: SanitaryConditionTypeType; label: string }[] = [
  { value: 'POTABLE_WATER', label: 'Agua potable' },
  { value: 'SANITARY_SERVICE', label: 'Servicios sanitarios' },
  { value: 'GARBAGE_MANAGEMENT', label: 'Manejo de basuras' },
];

const STATUS_OPTIONS: { value: SanitaryConditionStatusType; label: string }[] = [
  { value: 'OPERATIONAL', label: 'Operativa' },
  { value: 'DEFICIENT', label: 'Deficiente' },
  { value: 'OUT_OF_SERVICE', label: 'Fuera de servicio' },
];

const RESULT_OPTIONS: { value: SanitaryConditionResultType; label: string }[] = [
  { value: 'APT', label: 'Apto / conforme' },
  { value: 'NOT_APT', label: 'No apto / no conforme' },
  { value: 'INCONCLUSIVE', label: 'Inconcluso' },
];

const FREQUENCY_OPTIONS: { value: SanitaryConditionFrequencyType; label: string }[] = [
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
];

const STATUS_COLORS: Record<SanitaryConditionStatusType, { color: string; bg: string }> = {
  OPERATIONAL: { color: '#166534', bg: '#dcfce7' },
  DEFICIENT: { color: '#9a3412', bg: '#ffedd5' },
  OUT_OF_SERVICE: { color: '#991b1b', bg: '#fee2e2' },
};

const RESULT_COLORS: Record<SanitaryConditionResultType, { color: string; bg: string }> = {
  APT: { color: '#166534', bg: '#dcfce7' },
  NOT_APT: { color: '#991b1b', bg: '#fee2e2' },
  INCONCLUSIVE: { color: '#525252', bg: '#e5e5e5' },
};

type ConditionForm = {
  conditionType: SanitaryConditionTypeType;
  code: string;
  description: string;
  location: string;
  status: SanitaryConditionStatusType;
  conditionResult: SanitaryConditionResultType;
  lastVerificationDate: string;
  nextVerificationDate: string;
  verificationFrequency: SanitaryConditionFrequencyType;
  responsible: string;
  evidenceUrl: string;
  observations: string;
};

const emptyForm: ConditionForm = {
  conditionType: 'POTABLE_WATER',
  code: '',
  description: '',
  location: '',
  status: 'OPERATIONAL',
  conditionResult: 'APT',
  lastVerificationDate: '',
  nextVerificationDate: '',
  verificationFrequency: 'ANNUAL',
  responsible: '',
  evidenceUrl: '',
  observations: '',
};

function optionsLabel<T extends string>(
  options: { value: T; label: string }[],
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CO');
}

function isOverdue(record: WorkplaceSanitaryConditionModel): boolean {
  const now = Date.now();
  const next = record.nextVerificationDate
    ? new Date(record.nextVerificationDate).getTime()
    : undefined;
  if (next !== undefined) return next < now;
  const days: Record<SanitaryConditionFrequencyType, number> = {
    MONTHLY: 31,
    QUARTERLY: 92,
    SEMIANNUAL: 183,
    ANNUAL: 365,
  };
  const expiry =
    new Date(record.lastVerificationDate).getTime() + days[record.verificationFrequency] * 86400000;
  return expiry < now;
}

/**
 * Página de condiciones sanitarias del lugar de trabajo (3.1.8 — FASE 34B).
 *
 * METADATA-ONLY: registra la condición verificada de agua potable, servicios
 * sanitarios y manejo de basuras. NO registra información clínica ni datos
 * sensibles de trabajadores, y NO es un sistema ambiental general.
 *
 * El resumen de componentes es SOLO UI: la fuente real del score sigue siendo
 * el provider 3.1.8 del ComplianceEngine.
 */
export function WorkplaceSanitaryConditionsPage({ token, role }: Props) {
  const navigate = useNavigate();

  const canWrite = role === 'owner' || role === 'admin';
  const readOnly = !canWrite;

  const [records, setRecords] = useState<WorkplaceSanitaryConditionModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SanitaryConditionTypeType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SanitaryConditionStatusType>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConditionForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWorkplaceSanitaryConditions(token);
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar las condiciones sanitarias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeRecords = records.filter((r) => r.active);

  // Resumen por componente (SOLO UI — el score real vive en el ComplianceEngine).
  const summary = useMemo(() => {
    return CONDITION_TYPE_OPTIONS.map((option) => {
      const typeRecords = activeRecords
        .filter((r) => r.conditionType === option.value)
        .sort((a, b) => new Date(b.lastVerificationDate).getTime() - new Date(a.lastVerificationDate).getTime());
      const latest = typeRecords[0];
      if (!latest) return { ...option, state: 'missing' as const, latest: undefined };
      if (latest.status === 'OUT_OF_SERVICE' || latest.conditionResult === 'NOT_APT') {
        return { ...option, state: 'bad' as const, latest };
      }
      if (latest.status === 'DEFICIENT' || latest.conditionResult === 'INCONCLUSIVE' || isOverdue(latest)) {
        return { ...option, state: 'warn' as const, latest };
      }
      return { ...option, state: 'ok' as const, latest };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const filtered = useMemo(() => {
    return activeRecords.filter((record) => {
      if (typeFilter !== 'all' && record.conditionType !== typeFilter) return false;
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      return true;
    });
  }, [records, typeFilter, statusFilter]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (record: WorkplaceSanitaryConditionModel) => {
    setForm({
      conditionType: record.conditionType,
      code: record.code,
      description: record.description,
      location: record.location,
      status: record.status,
      conditionResult: record.conditionResult,
      lastVerificationDate: record.lastVerificationDate ? record.lastVerificationDate.slice(0, 10) : '',
      nextVerificationDate: record.nextVerificationDate ? record.nextVerificationDate.slice(0, 10) : '',
      verificationFrequency: record.verificationFrequency,
      responsible: record.responsible,
      evidenceUrl: record.evidenceUrl ?? '',
      observations: record.observations ?? '',
    });
    setEditingId(record._id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof ConditionForm>(field: K, value: ConditionForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.code.trim()) {
      setError('El código del registro es obligatorio.');
      return;
    }
    if (!form.location.trim()) {
      setError('La ubicación es obligatoria para la evidencia.');
      return;
    }
    if (!form.responsible.trim()) {
      setError('El responsable es obligatorio.');
      return;
    }
    if (!form.lastVerificationDate) {
      setError('La fecha de última verificación es obligatoria.');
      return;
    }
    if (form.nextVerificationDate && form.nextVerificationDate < form.lastVerificationDate) {
      setError('La próxima verificación no puede ser anterior a la última.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const basePayload = {
        conditionType: form.conditionType,
        code: form.code.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        status: form.status,
        conditionResult: form.conditionResult,
        lastVerificationDate: new Date(`${form.lastVerificationDate}T00:00:00.000Z`).toISOString(),
        nextVerificationDate: form.nextVerificationDate
          ? new Date(`${form.nextVerificationDate}T00:00:00.000Z`).toISOString()
          : undefined,
        verificationFrequency: form.verificationFrequency,
        responsible: form.responsible.trim(),
        evidenceUrl: form.evidenceUrl.trim() || undefined,
        observations: form.observations.trim() || undefined,
      };

      if (editingId) {
        await updateWorkplaceSanitaryCondition(token, editingId, basePayload);
      } else {
        await createWorkplaceSanitaryCondition(token, basePayload);
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la condición sanitaria.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (record: WorkplaceSanitaryConditionModel) => {
    setError('');
    try {
      await deactivateWorkplaceSanitaryCondition(token, record._id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible desactivar el registro.');
    }
  };

  const stateIcon = (state: 'ok' | 'warn' | 'bad' | 'missing'): string => {
    if (state === 'ok') return '✓';
    if (state === 'warn') return '⚠';
    if (state === 'bad') return '✕';
    return '—';
  };

  const stateColor = (state: 'ok' | 'warn' | 'bad' | 'missing'): string => {
    if (state === 'ok') return '#166534';
    if (state === 'warn') return '#9a3412';
    if (state === 'bad') return '#991b1b';
    return '#94a3b8';
  };

  return (
    <div className="page" style={{ maxWidth: 1120, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            🚰 Agua potable, servicios sanitarios y disposición de basuras
          </h1>
          <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b', maxWidth: 780 }}>
            Registro y verificación de condiciones sanitarias del lugar de trabajo — Estándar 3.1.8.
            Este módulo registra <strong>condiciones verificadas del entorno laboral</strong> (metadata-only):
            no almacena información clínica ni datos sensibles de trabajadores, y no es un sistema ambiental general.
            {readOnly ? ' El perfil actual tiene permisos de solo lectura.' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={() => navigate('/documents/do')}>
            ← Volver al PHVA
          </Button>
          {!readOnly && (
            <Button type="button" onClick={openCreate} disabled={showForm}>
              + Nuevo registro
            </Button>
          )}
        </div>
      </div>

      {/* ── Guía de evaluación (fuente única: provider/ComplianceEngine) ── */}
      <Card title="¿Qué se evalúa en 3.1.8?" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem', fontSize: '.8rem', color: '#334155' }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C1 — Cobertura (25%):</strong> componentes con al menos un registro activo (agua / sanitarios / basuras).
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C2 — Condición (25%):</strong> último registro por componente conforme; DEFICIENT cuenta la mitad.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C3 — Trazabilidad (25%):</strong> fecha + responsable + evidencia por componente.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C4 — Vigencia (25%):</strong> verificación dentro de la frecuencia declarada; vencida penaliza.
          </div>
        </div>
        <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#64748b' }}>
          La evidencia proviene exclusivamente de los registros de este módulo. Las inspecciones (4.2.4),
          mantenimientos (4.2.5), mediciones ambientales (4.1.4), sustancias peligrosas (4.1.3) y documentos
          NO cuentan como evidencia de 3.1.8. El porcentaje y los hallazgos se reflejan en el PHVA — Hacer.
        </p>
      </Card>

      {error ? <pre className="error" style={{ marginBottom: '.75rem' }}>{error}</pre> : null}

      {/* ── Resumen de componentes (SOLO UI — el score vive en el Engine) ── */}
      <Card title="Estado de los componentes (resumen informativo)" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem' }}>
          {summary.map((item) => (
            <div key={item.value} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 8, padding: '.55rem .7rem', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '.85rem', fontWeight: 600, color: '#334155' }}>{item.label}</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: stateColor(item.state) }} title={item.latest ? `Última verificación: ${formatDate(item.latest.lastVerificationDate)}` : 'Sin registros activos'}>
                {stateIcon(item.state)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Formulario ── */}
      {showForm && !readOnly && (
        <Card title={editingId ? 'Editar condición sanitaria' : 'Nueva condición sanitaria'} style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Componente *</span>
                <Select value={form.conditionType} onChange={(e) => updateField('conditionType', e.target.value as SanitaryConditionTypeType)}>
                  {CONDITION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Código *</span>
                <Input value={form.code} onChange={(e) => updateField('code', e.target.value)} placeholder="Ej: AGUA-001, BAÑO-002, BASURA-001" required />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Descripción *</span>
                <Input value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Ej: Verificación de potabilidad del agua de la sede principal" required />
              </label>
              <label className="field">
                <span className="label">Ubicación *</span>
                <Input value={form.location} onChange={(e) => updateField('location', e.target.value)} placeholder="Ej: Sede principal — cocina" required />
              </label>
              <label className="field">
                <span className="label">Estado</span>
                <Select value={form.status} onChange={(e) => updateField('status', e.target.value as SanitaryConditionStatusType)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Resultado de la verificación</span>
                <Select value={form.conditionResult} onChange={(e) => updateField('conditionResult', e.target.value as SanitaryConditionResultType)}>
                  {RESULT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Última verificación *</span>
                <Input type="date" value={form.lastVerificationDate} onChange={(e) => updateField('lastVerificationDate', e.target.value)} required />
              </label>
              <label className="field">
                <span className="label">Próxima verificación</span>
                <Input type="date" value={form.nextVerificationDate} onChange={(e) => updateField('nextVerificationDate', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Frecuencia</span>
                <Select value={form.verificationFrequency} onChange={(e) => updateField('verificationFrequency', e.target.value as SanitaryConditionFrequencyType)}>
                  {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Responsable *</span>
                <Input value={form.responsible} onChange={(e) => updateField('responsible', e.target.value)} placeholder="Ej: Coordinadora de SST" required />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Evidencia (URL o referencia documental)</span>
                <Input value={form.evidenceUrl} onChange={(e) => updateField('evidenceUrl', e.target.value)} placeholder="Ej: laboratorio-xyz.com/informe-2026-014" />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Observaciones operativas</span>
                <textarea className="input" rows={2} value={form.observations} onChange={(e) => updateField('observations', e.target.value)} placeholder="Ej: tanque lavado trimestralmente; dispensadores revisados" />
              </label>
            </div>

            <div className="actions">
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear registro'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Filtros + listado ── */}
      <Card title={`Condiciones sanitarias activas (${filtered.length})`}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} style={{ maxWidth: 230 }}>
            <option value="all">Todos los componentes</option>
            {CONDITION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ maxWidth: 190 }}>
            <option value="all">Todos los estados</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '.9rem' }}>Cargando condiciones sanitarias…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>🚰</div>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
              {activeRecords.length === 0
                ? 'No hay condiciones sanitarias registradas'
                : 'Ningún registro coincide con los filtros.'}
            </p>
            {activeRecords.length === 0 ? (
              <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
                {readOnly
                  ? 'Los registros se gestionan con un usuario owner o admin de la empresa.'
                  : 'Registra la primera condición sanitaria para el estándar 3.1.8.'}
              </p>
            ) : null}
            {!readOnly && activeRecords.length === 0 ? (
              <Button type="button" onClick={openCreate} style={{ marginTop: '.75rem' }}>+ Nuevo registro</Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="border border-black p-3">Componente</th>
                <th className="border border-black p-3">Código / Ubicación</th>
                <th className="border border-black p-3">Estado</th>
                <th className="border border-black p-3">Resultado</th>
                <th className="border border-black p-3">Última verificación</th>
                <th className="border border-black p-3">Vigencia</th>
                <th className="border border-black p-3">Responsable</th>
                <th className="border border-black p-3">Evidencia</th>
                <th className="border border-black p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const status = STATUS_COLORS[record.status] ?? STATUS_COLORS.OPERATIONAL;
                const result = RESULT_COLORS[record.conditionResult] ?? RESULT_COLORS.APT;
                const overdue = isOverdue(record);
                return (
                  <tr key={record._id} style={record.active ? undefined : { opacity: 0.55 }}>
                    <td className="border border-black p-3" style={{ fontWeight: 600, fontSize: '.82rem' }}>
                      {optionsLabel(CONDITION_TYPE_OPTIONS, record.conditionType)}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      <div style={{ fontWeight: 600 }}>{record.code}</div>
                      <div style={{ fontSize: '.72rem', color: '#64748b' }}>{record.location}</div>
                    </td>
                    <td className="border border-black p-3">
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color: status.color, backgroundColor: status.bg }}>
                        {optionsLabel(STATUS_OPTIONS, record.status)}
                      </span>
                    </td>
                    <td className="border border-black p-3">
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color: result.color, backgroundColor: result.bg }}>
                        {optionsLabel(RESULT_OPTIONS, record.conditionResult)}
                      </span>
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      {formatDate(record.lastVerificationDate)}
                      <div style={{ fontSize: '.7rem', color: '#64748b' }}>{optionsLabel(FREQUENCY_OPTIONS, record.verificationFrequency)}</div>
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      {formatDate(record.nextVerificationDate)}
                      {overdue ? (
                        <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#991b1b' }}>⚠ Vencida</div>
                      ) : null}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>{record.responsible}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.75rem', maxWidth: 180, wordBreak: 'break-all' }}>
                      {record.evidenceUrl ? (
                        <a href={record.evidenceUrl.startsWith('http') ? record.evidenceUrl : `https://${record.evidenceUrl}`} target="_blank" rel="noreferrer">{record.evidenceUrl}</a>
                      ) : (
                        <span style={{ color: '#b45309' }}>Sin evidencia</span>
                      )}
                    </td>
                    <td className="border border-black p-3">
                      {readOnly ? (
                        <span style={{ fontSize: '.75rem', color: '#64748b' }}>Solo lectura</span>
                      ) : (
                        <div className="actions">
                          <Button type="button" variant="secondary" onClick={() => openEdit(record)} style={{ fontSize: '.75rem' }}>Editar</Button>
                          {record.active ? (
                            <Button type="button" variant="secondary" onClick={() => void handleDeactivate(record)} style={{ fontSize: '.75rem' }}>Desactivar</Button>
                          ) : null}
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
