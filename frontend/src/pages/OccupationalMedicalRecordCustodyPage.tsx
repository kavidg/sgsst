import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createOccupationalMedicalRecordCustody,
  CustodyRecordType,
  CustodyStatusType,
  deactivateOccupationalMedicalRecordCustody,
  EmployeeModel,
  fetchEmployees,
  fetchOccupationalMedicalRecordCustody,
  OccupationalMedicalRecordCustodyModel,
  updateOccupationalMedicalRecordCustody,
  UserRole,
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

const RECORD_TYPE_OPTIONS: { value: CustodyRecordType; label: string }[] = [
  { value: 'INITIAL_OCCUPATIONAL_EXAM', label: 'Examen de ingreso' },
  { value: 'PERIODIC_OCCUPATIONAL_EXAM', label: 'Examen periódico' },
  { value: 'EXIT_OCCUPATIONAL_EXAM', label: 'Examen de egreso' },
  { value: 'OTHER_OCCUPATIONAL_RECORD', label: 'Otro registro ocupacional' },
];

const CUSTODY_STATUS_OPTIONS: { value: CustodyStatusType; label: string }[] = [
  { value: 'IN_CUSTODY', label: 'En custodia' },
  { value: 'TRANSFERRED', label: 'Transferida' },
  { value: 'ARCHIVED', label: 'Archivada' },
  { value: 'RELEASED', label: 'Liberada' },
];

const STATUS_COLORS: Record<CustodyStatusType, { color: string; bg: string }> = {
  IN_CUSTODY: { color: '#166534', bg: '#dcfce7' },
  TRANSFERRED: { color: '#9a3412', bg: '#ffedd5' },
  ARCHIVED: { color: '#1e40af', bg: '#dbeafe' },
  RELEASED: { color: '#525252', bg: '#e5e5e5' },
};

type CustodyForm = {
  employeeId: string;
  recordReference: string;
  recordType: CustodyRecordType;
  custodyStatus: CustodyStatusType;
  custodianName: string;
  custodianRole: string;
  custodyStartDate: string;
  retentionUntil: string;
  storageLocationReference: string;
  accessControlDescription: string;
  confidentialityConfirmed: boolean;
  integrityConfirmed: boolean;
  availabilityConfirmed: boolean;
  notes: string;
};

const emptyForm: CustodyForm = {
  employeeId: '',
  recordReference: '',
  recordType: 'INITIAL_OCCUPATIONAL_EXAM',
  custodyStatus: 'IN_CUSTODY',
  custodianName: '',
  custodianRole: '',
  custodyStartDate: '',
  retentionUntil: '',
  storageLocationReference: '',
  accessControlDescription: '',
  confidentialityConfirmed: false,
  integrityConfirmed: false,
  availabilityConfirmed: false,
  notes: '',
};

function recordTypeLabel(value: CustodyRecordType): string {
  return RECORD_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function custodyStatusLabel(value: CustodyStatusType): string {
  return CUSTODY_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CO');
}

/**
 * Página de custodia de historias clínicas ocupacionales (3.1.5 — FASE 30G).
 *
 * Trabaja EXCLUSIVAMENTE con metadatos administrativos de custodia
 * (responsable, ubicación, estado, fechas, trazabilidad). NO muestra
 * contenido clínico: ni diagnósticos, ni resultados médicos, ni
 * recomendaciones, ni historia clínica.
 */
export function OccupationalMedicalRecordCustodyPage({ token, role }: Props) {
  const navigate = useNavigate();

  const canWrite = role === 'owner' || role === 'admin';
  const readOnly = !canWrite;

  const [records, setRecords] = useState<OccupationalMedicalRecordCustodyModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CustodyStatusType>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CustodyRecordType>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustodyForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [custodyData, employeeData] = await Promise.all([
        fetchOccupationalMedicalRecordCustody(token),
        fetchEmployees(token),
      ]);
      setRecords(custodyData);
      setEmployees(employeeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar los registros de custodia.');
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
      if (statusFilter !== 'all' && record.custodyStatus !== statusFilter) return false;
      if (typeFilter !== 'all' && record.recordType !== typeFilter) return false;
      if (!q) return true;
      return [
        record.recordReference,
        record.custodianName,
        employeeName(record.employeeId),
        record.storageLocationReference,
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

  const openEdit = (record: OccupationalMedicalRecordCustodyModel) => {
    setForm({
      employeeId: record.employeeId,
      recordReference: record.recordReference,
      recordType: record.recordType,
      custodyStatus: record.custodyStatus,
      custodianName: record.custodianName,
      custodianRole: record.custodianRole ?? '',
      custodyStartDate: record.custodyStartDate ? record.custodyStartDate.slice(0, 10) : '',
      retentionUntil: record.retentionUntil ? record.retentionUntil.slice(0, 10) : '',
      storageLocationReference: record.storageLocationReference,
      accessControlDescription: record.accessControlDescription ?? '',
      confidentialityConfirmed: record.confidentialityConfirmed,
      integrityConfirmed: record.integrityConfirmed,
      availabilityConfirmed: record.availabilityConfirmed,
      notes: record.notes ?? '',
    });
    setEditingId(record._id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof CustodyForm>(field: K, value: CustodyForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.employeeId) {
      setError('Debe asociar un trabajador al registro de custodia.');
      return;
    }
    if (!form.recordReference.trim() || !form.custodianName.trim() || !form.storageLocationReference.trim()) {
      setError('Referencia del registro, responsable de custodia y ubicación son obligatorios.');
      return;
    }
    if (!form.custodyStartDate) {
      setError('La fecha de inicio de custodia es obligatoria.');
      return;
    }
    if (form.retentionUntil && form.retentionUntil < form.custodyStartDate) {
      setError('La fecha de retención no puede ser anterior a la fecha de inicio de custodia.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const basePayload = {
        employeeId: form.employeeId,
        recordReference: form.recordReference.trim(),
        recordType: form.recordType,
        custodyStatus: form.custodyStatus,
        custodianName: form.custodianName.trim(),
        custodianRole: form.custodianRole.trim() || undefined,
        custodyStartDate: new Date(`${form.custodyStartDate}T00:00:00.000Z`).toISOString(),
        retentionUntil: form.retentionUntil
          ? new Date(`${form.retentionUntil}T00:00:00.000Z`).toISOString()
          : undefined,
        storageLocationReference: form.storageLocationReference.trim(),
        accessControlDescription: form.accessControlDescription.trim() || undefined,
        confidentialityConfirmed: form.confidentialityConfirmed,
        integrityConfirmed: form.integrityConfirmed,
        availabilityConfirmed: form.availabilityConfirmed,
        notes: form.notes.trim() || undefined,
        active: true,
      };

      if (editingId) {
        await updateOccupationalMedicalRecordCustody(token, editingId, {
          ...basePayload,
          active: undefined,
        });
      } else {
        await createOccupationalMedicalRecordCustody(token, basePayload);
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el registro de custodia.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (record: OccupationalMedicalRecordCustodyModel) => {
    setError('');
    try {
      await deactivateOccupationalMedicalRecordCustody(token, record._id);
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
            🗄️ Custodia de historias clínicas
          </h1>
          <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b', maxWidth: 760 }}>
            Control administrativo de custodia de las historias clínicas ocupacionales — Estándar 3.1.5.
            Este módulo gestiona únicamente metadatos de custodia; no almacena ni muestra contenido clínico.
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

      {/* ── Guía de evaluación (sin recalcular: la fuente es el provider/ComplianceEngine) ── */}
      <Card title="¿Qué se evalúa en 3.1.5?" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem', fontSize: '.8rem', color: '#334155' }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C1 — Existencia (25%):</strong> trabajadores con al menos un registro de custodia activo y válido.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C2 — Identificación (25%):</strong> registros con trabajador, referencia, tipo y fecha de inicio completos.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C3 — Responsable y ubicación (25%):</strong> custodio identificado, ubicación controlada y estado válido.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C4 — CIA (25%):</strong> confidencialidad, integridad y disponibilidad confirmadas explícitamente.
          </div>
        </div>
        <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#64748b' }}>
          La evidencia proviene exclusivamente de los registros de custodia de este módulo. Las evaluaciones médicas
          ocupacionales, recomendaciones médicas y perfiles de cargo NO cuentan como evidencia de custodia. El
          porcentaje/hallazgos se reflejan en el PHVA — Hacer.
        </p>
      </Card>

      {error ? <pre className="error" style={{ marginBottom: '.75rem' }}>{error}</pre> : null}

      {/* ── Formulario ── */}
      {showForm && !readOnly && (
        <Card title={editingId ? 'Editar registro de custodia' : 'Nuevo registro de custodia'} style={{ marginBottom: '1rem' }}>
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
                <span className="label">Referencia del registro *</span>
                <Input value={form.recordReference} onChange={(e) => updateField('recordReference', e.target.value)} placeholder="Ej: EXP-2024-001" required />
              </label>
              <label className="field">
                <span className="label">Tipo de registro</span>
                <Select value={form.recordType} onChange={(e) => updateField('recordType', e.target.value as CustodyRecordType)}>
                  {RECORD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Estado de custodia</span>
                <Select value={form.custodyStatus} onChange={(e) => updateField('custodyStatus', e.target.value as CustodyStatusType)}>
                  {CUSTODY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Responsable de custodia *</span>
                <Input value={form.custodianName} onChange={(e) => updateField('custodianName', e.target.value)} placeholder="Nombre del custodio" required />
              </label>
              <label className="field">
                <span className="label">Rol del custodio</span>
                <Input value={form.custodianRole} onChange={(e) => updateField('custodianRole', e.target.value)} placeholder="Ej: Archivista SST" />
              </label>
              <label className="field">
                <span className="label">Fecha inicio custodia *</span>
                <Input type="date" value={form.custodyStartDate} onChange={(e) => updateField('custodyStartDate', e.target.value)} required />
              </label>
              <label className="field">
                <span className="label">Conservar hasta (retención)</span>
                <Input type="date" value={form.retentionUntil} onChange={(e) => updateField('retentionUntil', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Ubicación controlada *</span>
                <Input value={form.storageLocationReference} onChange={(e) => updateField('storageLocationReference', e.target.value)} placeholder="Ej: OFICINA-SST-3ER-PISO" required />
              </label>
              <label className="field">
                <span className="label">Controles de acceso</span>
                <Input value={form.accessControlDescription} onChange={(e) => updateField('accessControlDescription', e.target.value)} placeholder="Ej: Acceso restringido a personal autorizado" />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Notas administrativas</span>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Observaciones administrativas (sin información clínica)…" />
              </label>
            </div>

            <div className="grid grid-2" style={{ marginTop: '.5rem' }}>
              <label className="field">
                <span className="label">Confidencialidad confirmada</span>
                <Select value={form.confidentialityConfirmed ? 'true' : 'false'} onChange={(e) => updateField('confidentialityConfirmed', e.target.value === 'true')}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </Select>
              </label>
              <label className="field">
                <span className="label">Integridad confirmada</span>
                <Select value={form.integrityConfirmed ? 'true' : 'false'} onChange={(e) => updateField('integrityConfirmed', e.target.value === 'true')}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </Select>
              </label>
              <label className="field">
                <span className="label">Disponibilidad confirmada</span>
                <Select value={form.availabilityConfirmed ? 'true' : 'false'} onChange={(e) => updateField('availabilityConfirmed', e.target.value === 'true')}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </Select>
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
      <Card title={`Registros de custodia (${filtered.length})`}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por referencia, trabajador, custodio o ubicación…" style={{ maxWidth: 320 }} />
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} style={{ maxWidth: 230 }}>
            <option value="all">Todos los tipos</option>
            {RECORD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ maxWidth: 190 }}>
            <option value="all">Todos los estados</option>
            {CUSTODY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '.9rem' }}>Cargando registros de custodia…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>🗄️</div>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
              {records.length === 0
                ? 'No hay registros de custodia de historias clínicas'
                : 'Ningún registro coincide con los filtros.'}
            </p>
            {records.length === 0 ? (
              <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
                {readOnly
                  ? 'Los registros se gestionan con un usuario owner o admin de la empresa.'
                  : 'Registra el primer registro de custodia para el estándar 3.1.5.'}
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
                <th className="border border-black p-3">Referencia</th>
                <th className="border border-black p-3">Trabajador</th>
                <th className="border border-black p-3">Tipo</th>
                <th className="border border-black p-3">Custodio</th>
                <th className="border border-black p-3">Ubicación</th>
                <th className="border border-black p-3">Inicio</th>
                <th className="border border-black p-3">Retención</th>
                <th className="border border-black p-3">Estado</th>
                <th className="border border-black p-3">CIA</th>
                <th className="border border-black p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const status = STATUS_COLORS[record.custodyStatus] ?? STATUS_COLORS.IN_CUSTODY;
                const ciaOk = record.confidentialityConfirmed && record.integrityConfirmed && record.availabilityConfirmed;
                return (
                  <tr key={record._id} style={record.active ? undefined : { opacity: 0.55 }}>
                    <td className="border border-black p-3" style={{ fontWeight: 600 }}>{record.recordReference}</td>
                    <td className="border border-black p-3">{employeeName(record.employeeId)}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.82rem' }}>{recordTypeLabel(record.recordType)}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>
                      {record.custodianName}
                      {record.custodianRole ? <div style={{ fontSize: '.72rem', color: '#64748b' }}>{record.custodianRole}</div> : null}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.82rem' }}>{record.storageLocationReference}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>{formatDate(record.custodyStartDate)}</td>
                    <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>{formatDate(record.retentionUntil)}</td>
                    <td className="border border-black p-3">
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color: status.color, backgroundColor: status.bg }}>
                        {custodyStatusLabel(record.custodyStatus)}
                      </span>
                      {!record.active ? (
                        <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: '.25rem' }}>Inactivo</div>
                      ) : null}
                    </td>
                    <td className="border border-black p-3" style={{ textAlign: 'center' }}>
                      <span title="Confidencialidad · Integridad · Disponibilidad">
                        {ciaOk ? '✅' : '⚠️'}
                      </span>
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
