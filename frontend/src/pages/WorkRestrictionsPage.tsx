import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createWorkRestriction,
  deactivateWorkRestriction,
  fetchEmployees,
  fetchWorkRestrictions,
  RestrictionStatusType,
  RestrictionTypeType,
  updateWorkRestriction,
  UserRole,
  WorkRestrictionModel,
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

const RESTRICTION_TYPE_OPTIONS: { value: RestrictionTypeType; label: string }[] = [
  { value: 'TEMPORARY_RESTRICTION', label: 'Restricción temporal' },
  { value: 'PERMANENT_RESTRICTION', label: 'Restricción permanente' },
  { value: 'WORK_RECOMMENDATION', label: 'Recomendación laboral' },
  { value: 'JOB_ADJUSTMENT', label: 'Ajuste del puesto' },
  { value: 'OTHER', label: 'Otro' },
];

const RESTRICTION_STATUS_OPTIONS: { value: RestrictionStatusType; label: string }[] = [
  { value: 'ACTIVE', label: 'Activa' },
  { value: 'FOLLOW_UP', label: 'En seguimiento' },
  { value: 'CLOSED', label: 'Cerrada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const STATUS_COLORS: Record<RestrictionStatusType, { color: string; bg: string }> = {
  ACTIVE: { color: '#166534', bg: '#dcfce7' },
  FOLLOW_UP: { color: '#9a3412', bg: '#ffedd5' },
  CLOSED: { color: '#1e40af', bg: '#dbeafe' },
  CANCELLED: { color: '#525252', bg: '#e5e5e5' },
};

type RestrictionForm = {
  employeeId: string;
  restrictionType: RestrictionTypeType;
  status: RestrictionStatusType;
  receivedAt: string;
  effectiveFrom: string;
  effectiveUntil: string;
  responsibleUserId: string;
  actions: string;
  followUpDate: string;
  followUpStatus: string;
  evidence: string;
};

const emptyForm: RestrictionForm = {
  employeeId: '',
  restrictionType: 'TEMPORARY_RESTRICTION',
  status: 'ACTIVE',
  receivedAt: '',
  effectiveFrom: '',
  effectiveUntil: '',
  responsibleUserId: '',
  actions: '',
  followUpDate: '',
  followUpStatus: '',
  evidence: '',
};

function restrictionTypeLabel(value: RestrictionTypeType): string {
  return RESTRICTION_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function restrictionStatusLabel(value: RestrictionStatusType): string {
  return RESTRICTION_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CO');
}

/**
 * Página de restricciones y recomendaciones médico-laborales (3.1.6 — FASE 33).
 *
 * Trabaja EXCLUSIVAMENTE con metadatos administrativos/operativos: tipo de
 * medida, estado, fechas, responsable, acciones laborales y seguimiento.
 * NO registra ni muestra contenido clínico: ni diagnósticos, ni CIE, ni
 * historias clínicas, ni tratamientos, ni medicamentos, ni resultados.
 */
export function WorkRestrictionsPage({ token, role }: Props) {
  const navigate = useNavigate();

  const canWrite = role === 'owner' || role === 'admin';
  const readOnly = !canWrite;

  const [records, setRecords] = useState<WorkRestrictionModel[]>([]);
  const [employees, setEmployees] = useState<{ _id: string; name: string; document: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RestrictionStatusType>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | RestrictionTypeType>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RestrictionForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [restrictionData, employeeData] = await Promise.all([
        fetchWorkRestrictions(token),
        fetchEmployees(token),
      ]);
      setRecords(restrictionData);
      setEmployees(employeeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar las restricciones/recomendaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const employeeName = (employeeId: string): string => {
    const employee = employees.find((e) => e._id === employeeId);
    return employee ? employee.name : employeeId;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((record) => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      if (typeFilter !== 'all' && record.restrictionType !== typeFilter) return false;
      if (!q) return true;
      return [
        record.restrictionType,
        record.status,
        record.actions,
        record.evidence,
        employeeName(record.employeeId),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, search, statusFilter, typeFilter, employees]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (record: WorkRestrictionModel) => {
    setForm({
      employeeId: record.employeeId,
      restrictionType: record.restrictionType,
      status: record.status,
      receivedAt: record.receivedAt ? record.receivedAt.slice(0, 10) : '',
      effectiveFrom: record.effectiveFrom ? record.effectiveFrom.slice(0, 10) : '',
      effectiveUntil: record.effectiveUntil ? record.effectiveUntil.slice(0, 10) : '',
      responsibleUserId: record.responsibleUserId ?? '',
      actions: record.actions ?? '',
      followUpDate: record.followUpDate ? record.followUpDate.slice(0, 10) : '',
      followUpStatus: record.followUpStatus ?? '',
      evidence: record.evidence ?? '',
    });
    setEditingId(record._id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof RestrictionForm>(field: K, value: RestrictionForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.employeeId) {
      setError('Debe asociar un trabajador a la restricción/recomendación.');
      return;
    }
    if (!form.receivedAt) {
      setError('La fecha de recepción es obligatoria.');
      return;
    }
    if (form.effectiveFrom && form.effectiveUntil && form.effectiveUntil < form.effectiveFrom) {
      setError('La fecha de fin de vigencia no puede ser anterior al inicio.');
      return;
    }
    if (form.status === 'FOLLOW_UP' && !form.followUpDate) {
      setError('El estado "En seguimiento" exige fecha de seguimiento.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const basePayload = {
        employeeId: form.employeeId,
        restrictionType: form.restrictionType,
        status: form.status,
        receivedAt: new Date(`${form.receivedAt}T00:00:00.000Z`).toISOString(),
        effectiveFrom: form.effectiveFrom
          ? new Date(`${form.effectiveFrom}T00:00:00.000Z`).toISOString()
          : undefined,
        effectiveUntil: form.effectiveUntil
          ? new Date(`${form.effectiveUntil}T00:00:00.000Z`).toISOString()
          : undefined,
        actions: form.actions.trim() || undefined,
        followUpDate: form.followUpDate
          ? new Date(`${form.followUpDate}T00:00:00.000Z`).toISOString()
          : undefined,
        followUpStatus: form.followUpStatus.trim() || undefined,
        evidence: form.evidence.trim() || undefined,
      };

      if (editingId) {
        await updateWorkRestriction(token, editingId, basePayload);
      } else {
        await createWorkRestriction(token, basePayload);
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la restricción/recomendación.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (record: WorkRestrictionModel) => {
    setError('');
    try {
      await deactivateWorkRestriction(token, record._id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible desactivar el registro.');
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1120, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            🧑‍⚕️ Restricciones y recomendaciones médico-laborales
          </h1>
          <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b', maxWidth: 780 }}>
            Gestión administrativa y operacional de restricciones/recomendaciones laborales — Estándar 3.1.6.
            Este módulo registra <strong>restricciones y acciones laborales</strong>, no historias clínicas:
            no almacena ni solicita diagnósticos, CIE, tratamientos, medicamentos ni resultados clínicos.
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
      <Card title="¿Qué se evalúa en 3.1.6?" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem', fontSize: '.8rem', color: '#334155' }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C1 — Existencia (25%):</strong> trabajadores con al menos una restricción/recomendación registrada (deduplicada).
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C2 — Gestión (25%):</strong> restricciones con acciones laborales registradas.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C3 — Seguimiento (25%):</strong> responsable asignado y/o seguimiento administrativo.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C4 — Cierre/control (25%):</strong> vigencia coherente o cierre con trazabilidad.
          </div>
        </div>
        <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#64748b' }}>
          La evidencia proviene exclusivamente de los registros de este módulo. Las recomendaciones médicas,
          exámenes ocupacionales y perfiles de cargo NO cuentan como evidencia de 3.1.6. El porcentaje y los
          hallazgos se reflejan en el PHVA — Hacer.
        </p>
      </Card>

      {error ? <pre className="error" style={{ marginBottom: '.75rem' }}>{error}</pre> : null}

      {/* ── Formulario ── */}
      {showForm && !readOnly && (
        <Card title={editingId ? 'Editar restricción/recomendación' : 'Nueva restricción/recomendación'} style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Trabajador *</span>
                <Select value={form.employeeId} onChange={(e) => updateField('employeeId', e.target.value)} required>
                  <option value="">Seleccione un trabajador…</option>
                  {employees.map((employee) => (
                    <option key={employee._id} value={employee._id}>
                      {employee.name} — {employee.document}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span className="label">Tipo de medida *</span>
                <Select value={form.restrictionType} onChange={(e) => updateField('restrictionType', e.target.value as RestrictionTypeType)}>
                  {RESTRICTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Estado administrativo</span>
                <Select value={form.status} onChange={(e) => updateField('status', e.target.value as RestrictionStatusType)}>
                  {RESTRICTION_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Fecha de recepción *</span>
                <Input type="date" value={form.receivedAt} onChange={(e) => updateField('receivedAt', e.target.value)} required />
              </label>
              <label className="field">
                <span className="label">Vigencia desde</span>
                <Input type="date" value={form.effectiveFrom} onChange={(e) => updateField('effectiveFrom', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Vigencia hasta</span>
                <Input type="date" value={form.effectiveUntil} onChange={(e) => updateField('effectiveUntil', e.target.value)} />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Acciones laborales (gestión, no tratamiento médico)</span>
                <textarea className="input" rows={2} value={form.actions} onChange={(e) => updateField('actions', e.target.value)} placeholder="Ej: adaptación temporal de tarea, cambio de actividad, ajuste de jornada, restricción de exposición…" />
              </label>
              <label className="field">
                <span className="label">Fecha de seguimiento</span>
                <Input type="date" value={form.followUpDate} onChange={(e) => updateField('followUpDate', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Resultado del seguimiento</span>
                <Input value={form.followUpStatus} onChange={(e) => updateField('followUpStatus', e.target.value)} placeholder="Ej: medida vigente, reevaluación programada" />
              </label>
              <label className="field">
                <span className="label">Evidencia documental administrativa</span>
                <Input value={form.evidence} onChange={(e) => updateField('evidence', e.target.value)} placeholder="Ej: referencia al concepto del médico evaluador" />
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
      <Card title={`Restricciones/recomendaciones (${filtered.length})`}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por trabajador, acciones o evidencia…" style={{ maxWidth: 320 }} />
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} style={{ maxWidth: 230 }}>
            <option value="all">Todos los tipos</option>
            {RESTRICTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ maxWidth: 190 }}>
            <option value="all">Todos los estados</option>
            {RESTRICTION_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '.9rem' }}>Cargando restricciones/recomendaciones…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>🧑‍⚕️</div>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
              {records.length === 0
                ? 'No hay restricciones/recomendaciones médico-laborales registradas'
                : 'Ningún registro coincide con los filtros.'}
            </p>
            {records.length === 0 ? (
              <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
                {readOnly
                  ? 'Los registros se gestionan con un usuario owner o admin de la empresa.'
                  : 'Registra la primera restricción/recomendación para el estándar 3.1.6.'}
              </p>
            ) : null}
            {!readOnly && records.length === 0 ? (
              <Button type="button" onClick={openCreate} style={{ marginTop: '.75rem' }}>+ Nuevo registro</Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="border border-black p-3">Trabajador</th>
                <th className="border border-black p-3">Tipo</th>
                <th className="border border-black p-3">Recepción</th>
                <th className="border border-black p-3">Vigencia</th>
                <th className="border border-black p-3">Acciones laborales</th>
                <th className="border border-black p-3">Seguimiento</th>
                <th className="border border-black p-3">Estado</th>
                <th className="border border-black p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const status = STATUS_COLORS[record.status] ?? STATUS_COLORS.ACTIVE;
                return (
                  <tr key={record._id} style={record.active ? undefined : { opacity: 0.55 }}>
                    <td className="border border-black p-3" style={{ fontWeight: 600 }}>{employeeName(record.employeeId)}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.82rem' }}>{restrictionTypeLabel(record.restrictionType)}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>{formatDate(record.receivedAt)}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      {formatDate(record.effectiveFrom)} → {formatDate(record.effectiveUntil)}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem', maxWidth: 240 }}>
                      {record.actions ? record.actions : <span style={{ color: '#b45309' }}>Sin acciones registradas</span>}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      {record.followUpDate ? formatDate(record.followUpDate) : '—'}
                      {record.followUpStatus ? <div style={{ fontSize: '.72rem', color: '#64748b' }}>{record.followUpStatus}</div> : null}
                    </td>
                    <td className="border border-black p-3">
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color: status.color, backgroundColor: status.bg }}>
                        {restrictionStatusLabel(record.status)}
                      </span>
                      {!record.active ? (
                        <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: '.25rem' }}>Inactivo</div>
                      ) : null}
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
