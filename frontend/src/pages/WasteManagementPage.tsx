import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createWasteManagementRecord,
  declareWasteTypes,
  deactivateWasteManagementRecord,
  fetchDeclaredWasteTypes,
  fetchWasteManagementRecords,
  updateWasteManagementRecord,
  WasteDisposalFrequencyType,
  WasteManagementRecordModel,
  WasteManagementStatusType,
  WasteTypeType,
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

const WASTE_TYPE_OPTIONS: { value: WasteTypeType; label: string }[] = [
  { value: 'SOLID', label: 'Sólido' },
  { value: 'LIQUID', label: 'Líquido' },
  { value: 'GASEOUS', label: 'Gaseoso' },
];

const STATUS_OPTIONS: { value: WasteManagementStatusType; label: string }[] = [
  { value: 'PLANNED', label: 'Planeado (sin gestión ejecutada)' },
  { value: 'ACTIVE', label: 'Activo (gestión en curso)' },
  { value: 'SUSPENDED', label: 'Suspendido' },
];

const FREQUENCY_OPTIONS: { value: WasteDisposalFrequencyType; label: string }[] = [
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
];

const STATUS_COLORS: Record<WasteManagementStatusType, { color: string; bg: string }> = {
  PLANNED: { color: '#525252', bg: '#e5e5e5' },
  ACTIVE: { color: '#166534', bg: '#dcfce7' },
  SUSPENDED: { color: '#991b1b', bg: '#fee2e2' },
};

type WasteForm = {
  wasteType: WasteTypeType;
  hazardous: boolean;
  code: string;
  source: string;
  generationDescription: string;
  handlingMethod: string;
  disposalMethod: string;
  disposalDestination: string;
  disposalFrequency: WasteDisposalFrequencyType;
  lastDisposalDate: string;
  nextDisposalDate: string;
  responsible: string;
  evidenceUrl: string;
  observations: string;
  status: WasteManagementStatusType;
};

const emptyForm: WasteForm = {
  wasteType: 'SOLID',
  hazardous: false,
  code: '',
  source: '',
  generationDescription: '',
  handlingMethod: '',
  disposalMethod: '',
  disposalDestination: '',
  disposalFrequency: 'ANNUAL',
  lastDisposalDate: '',
  nextDisposalDate: '',
  responsible: '',
  evidenceUrl: '',
  observations: '',
  status: 'PLANNED',
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

const FREQUENCY_DAYS: Record<WasteDisposalFrequencyType, number> = {
  WEEKLY: 8,
  MONTHLY: 31,
  QUARTERLY: 92,
  SEMIANNUAL: 183,
  ANNUAL: 365,
};

function isOverdue(record: WasteManagementRecordModel): boolean {
  const now = Date.now();
  const next = record.nextDisposalDate
    ? new Date(record.nextDisposalDate).getTime()
    : undefined;
  if (next !== undefined) return next < now;
  if (!record.lastDisposalDate) return false;
  const expiry =
    new Date(record.lastDisposalDate).getTime() +
    FREQUENCY_DAYS[record.disposalFrequency] * 86400000;
  return expiry < now;
}

/**
 * Página de gestión de residuos (3.1.9 — FASE 34C).
 *
 * METADATA-ONLY: registra la gestión real de residuos generados por la
 * operación. NO registra información clínica ni resultados de mediciones
 * ambientales, y NO es un sistema ambiental general.
 *
 * Nota clave para el usuario: marcar un residuo como PELIGROSO no implica
 * cumplimiento — el cumplimiento exige manejo + disposición + trazabilidad.
 *
 * El resumen por tipo es SOLO UI: el score real vive en el ComplianceEngine.
 */
export function WasteManagementPage({ token, role }: Props) {
  const navigate = useNavigate();

  const canWrite = role === 'owner' || role === 'admin';
  const readOnly = !canWrite;

  const [records, setRecords] = useState<WasteManagementRecordModel[]>([]);
  const [declared, setDeclared] = useState<WasteTypeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | WasteTypeType>('all');
  const [hazardousFilter, setHazardousFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WasteManagementStatusType>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WasteForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, declaration] = await Promise.all([
        fetchWasteManagementRecords(token),
        fetchDeclaredWasteTypes(token),
      ]);
      setRecords(data);
      setDeclared(declaration?.declaredWasteTypes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar la gestión de residuos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeRecords = records.filter((r) => r.active);

  const handleDeclareTypes = async (types: WasteTypeType[]) => {
    setError('');
    try {
      const declaration = await declareWasteTypes(token, types);
      setDeclared(declaration?.declaredWasteTypes ?? types);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la declaración.');
    }
  };

  // Resumen por tipo (SOLO UI — el score real vive en el ComplianceEngine).
  const summary = useMemo(() => {
    return WASTE_TYPE_OPTIONS.map((option) => {
      const typeRecords = activeRecords
        .filter((r) => r.wasteType === option.value)
        .sort(
          (a, b) =>
            new Date(b.lastDisposalDate ?? 0).getTime() -
            new Date(a.lastDisposalDate ?? 0).getTime(),
        );
      const latest = typeRecords[0];
      if (!latest) return { ...option, state: declared.includes(option.value) ? ('bad' as const) : ('na' as const), latest: undefined };
      if (latest.status === 'PLANNED' || latest.status === 'SUSPENDED') {
        return { ...option, state: 'warn' as const, latest };
      }
      if (!latest.disposalMethod || isOverdue(latest)) {
        return { ...option, state: 'warn' as const, latest };
      }
      return { ...option, state: 'ok' as const, latest };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, declared]);

  const filtered = useMemo(() => {
    return activeRecords.filter((record) => {
      if (typeFilter !== 'all' && record.wasteType !== typeFilter) return false;
      if (hazardousFilter === 'yes' && !record.hazardous) return false;
      if (hazardousFilter === 'no' && record.hazardous) return false;
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      return true;
    });
  }, [records, typeFilter, hazardousFilter, statusFilter]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (record: WasteManagementRecordModel) => {
    setForm({
      wasteType: record.wasteType,
      hazardous: record.hazardous,
      code: record.code,
      source: record.source,
      generationDescription: record.generationDescription,
      handlingMethod: record.handlingMethod,
      disposalMethod: record.disposalMethod ?? '',
      disposalDestination: record.disposalDestination ?? '',
      disposalFrequency: record.disposalFrequency,
      lastDisposalDate: record.lastDisposalDate ? record.lastDisposalDate.slice(0, 10) : '',
      nextDisposalDate: record.nextDisposalDate ? record.nextDisposalDate.slice(0, 10) : '',
      responsible: record.responsible,
      evidenceUrl: record.evidenceUrl ?? '',
      observations: record.observations ?? '',
      status: record.status,
    });
    setEditingId(record._id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof WasteForm>(field: K, value: WasteForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDeclared = async (type: WasteTypeType) => {
    const next = declared.includes(type)
      ? declared.filter((t) => t !== type)
      : [...declared, type];
    if (next.length === 0) return; // al menos un tipo declarado
    await handleDeclareTypes(next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.code.trim()) {
      setError('El código del registro es obligatorio.');
      return;
    }
    if (!form.source.trim() || !form.generationDescription.trim()) {
      setError('La fuente y la descripción de generación son obligatorias.');
      return;
    }
    if (!form.handlingMethod.trim()) {
      setError('El método de manejo es obligatorio.');
      return;
    }
    if (!form.responsible.trim()) {
      setError('El responsable es obligatorio.');
      return;
    }
    if (form.status === 'ACTIVE' && !form.disposalMethod.trim()) {
      setError('Un registro ACTIVO exige método de disposición.');
      return;
    }
    if (form.nextDisposalDate && form.lastDisposalDate && form.nextDisposalDate < form.lastDisposalDate) {
      setError('La próxima disposición no puede ser anterior a la última.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const basePayload = {
        code: form.code.trim(),
        wasteType: form.wasteType,
        hazardous: form.hazardous,
        source: form.source.trim(),
        generationDescription: form.generationDescription.trim(),
        handlingMethod: form.handlingMethod.trim(),
        disposalMethod: form.disposalMethod.trim() || undefined,
        disposalDestination: form.disposalDestination.trim() || undefined,
        disposalFrequency: form.disposalFrequency,
        lastDisposalDate: form.lastDisposalDate
          ? new Date(`${form.lastDisposalDate}T00:00:00.000Z`).toISOString()
          : undefined,
        nextDisposalDate: form.nextDisposalDate
          ? new Date(`${form.nextDisposalDate}T00:00:00.000Z`).toISOString()
          : undefined,
        responsible: form.responsible.trim(),
        evidenceUrl: form.evidenceUrl.trim() || undefined,
        observations: form.observations.trim() || undefined,
        status: form.status,
      };

      if (editingId) {
        await updateWasteManagementRecord(token, editingId, basePayload);
      } else {
        await createWasteManagementRecord(token, basePayload);
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el registro de residuo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (record: WasteManagementRecordModel) => {
    setError('');
    try {
      await deactivateWasteManagementRecord(token, record._id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible desactivar el registro.');
    }
  };

  const stateIcon = (state: 'ok' | 'warn' | 'bad' | 'na'): string => {
    if (state === 'ok') return '✓';
    if (state === 'warn') return '⚠';
    if (state === 'bad') return '✕';
    return '—';
  };

  const stateColor = (state: 'ok' | 'warn' | 'bad' | 'na'): string => {
    if (state === 'ok') return '#166534';
    if (state === 'warn') return '#9a3412';
    if (state === 'bad') return '#991b1b';
    return '#94a3b8';
  };

  return (
    <div className="page" style={{ maxWidth: 1160, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            ♻️ Eliminación adecuada de residuos sólidos, líquidos o gaseosos
          </h1>
          <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b', maxWidth: 800 }}>
            Gestión y disposición de residuos generados por la operación — Estándar 3.1.9.
            Este módulo registra <strong>la gestión real del residuo</strong> (manejo, disposición,
            trazabilidad y continuidad). Un residuo marcado como <strong>peligroso NO implica
            cumplimiento automático</strong>: exige método de disposición y trazabilidad completa.
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
      <Card title="¿Qué se evalúa en 3.1.9?" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem', fontSize: '.8rem', color: '#334155' }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C1 — Cobertura (25%):</strong> tipos con registro / tipos realmente generados (declaración).
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C2 — Manejo y disposición (25%):</strong> handling + disposal (+ destino) por registro activo.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C3 — Trazabilidad (25%):</strong> fecha de disposición + responsable + evidencia + destino.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C4 — Continuidad (25%):</strong> disposición dentro de la frecuencia; vencida penaliza.
          </div>
        </div>
        <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#64748b' }}>
          La evidencia proviene exclusivamente de los registros de este módulo. Las sustancias
          peligrosas (4.1.3), las mediciones ambientales (4.1.4), las inspecciones (4.2.4), los
          mantenimientos (4.2.5), las condiciones sanitarias (3.1.8) y los documentos NO cuentan
          como evidencia de 3.1.9. El porcentaje y los hallazgos se reflejan en el PHVA — Hacer.
        </p>
      </Card>

      {error ? <pre className="error" style={{ marginBottom: '.75rem' }}>{error}</pre> : null}

      {/* ── Declaración de tipos generados (C1) ── */}
      {!readOnly && (
        <Card title="¿Qué tipos de residuo genera realmente su empresa?" style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 .5rem', fontSize: '.8rem', color: '#64748b' }}>
            La cobertura (C1) se mide contra los tipos que su empresa realmente genera. Marque solo
            los que aplica — no se penaliza un tipo que la empresa no genera.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {WASTE_TYPE_OPTIONS.map((o) => {
              const selected = declared.includes(o.value);
              return (
                <Button
                  key={o.value}
                  type="button"
                  variant={selected ? undefined : 'secondary'}
                  onClick={() => void toggleDeclared(o.value)}
                  style={{ fontSize: '.8rem' }}
                >
                  {selected ? '✓ ' : ''}{o.label}
                </Button>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Resumen por tipo (SOLO UI — el score vive en el Engine) ── */}
      <Card title="Estado por tipo de residuo (resumen informativo)" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.5rem' }}>
          {summary.map((item) => (
            <div key={item.value} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 8, padding: '.55rem .7rem', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '.85rem', fontWeight: 600, color: '#334155' }}>{item.label}</span>
              <span
                style={{ fontSize: '1rem', fontWeight: 700, color: stateColor(item.state) }}
                title={
                  item.latest
                    ? `Última disposición: ${formatDate(item.latest.lastDisposalDate)}`
                    : item.state === 'bad'
                      ? 'Declarado pero sin registros'
                      : 'No declarado como generado'
                }
              >
                {stateIcon(item.state)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Formulario ── */}
      {showForm && !readOnly && (
        <Card title={editingId ? 'Editar registro de residuo' : 'Nuevo registro de residuo'} style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Tipo de residuo *</span>
                <Select value={form.wasteType} onChange={(e) => updateField('wasteType', e.target.value as WasteTypeType)}>
                  {WASTE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">¿Residuo peligroso? (no implica cumplimiento)</span>
                <Select value={form.hazardous ? 'yes' : 'no'} onChange={(e) => updateField('hazardous', e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                </Select>
              </label>
              <label className="field">
                <span className="label">Código *</span>
                <Input value={form.code} onChange={(e) => updateField('code', e.target.value)} placeholder="Ej: RES-SOL-001" required />
              </label>
              <label className="field">
                <span className="label">Fuente generadora *</span>
                <Input value={form.source} onChange={(e) => updateField('source', e.target.value)} placeholder="Ej: Talleres — mantenimiento de equipos" required />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Descripción de la generación *</span>
                <Input value={form.generationDescription} onChange={(e) => updateField('generationDescription', e.target.value)} placeholder="Ej: Aceites usados y trapos contaminados del cambio de aceite de equipos" required />
              </label>
              <label className="field">
                <span className="label">Método de manejo *</span>
                <Input value={form.handlingMethod} onChange={(e) => updateField('handlingMethod', e.target.value)} placeholder="Ej: segregación en contenedores etiquetados" required />
              </label>
              <label className="field">
                <span className="label">Método de disposición</span>
                <Input value={form.disposalMethod} onChange={(e) => updateField('disposalMethod', e.target.value)} placeholder="Ej: entrega a gestor autorizado" />
              </label>
              <label className="field">
                <span className="label">Destino de la disposición</span>
                <Input value={form.disposalDestination} onChange={(e) => updateField('disposalDestination', e.target.value)} placeholder="Ej: Gestor autorizado XYZ S.A.S. — RMSD-2026-014" />
              </label>
              <label className="field">
                <span className="label">Frecuencia de disposición</span>
                <Select value={form.disposalFrequency} onChange={(e) => updateField('disposalFrequency', e.target.value as WasteDisposalFrequencyType)}>
                  {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Última disposición</span>
                <Input type="date" value={form.lastDisposalDate} onChange={(e) => updateField('lastDisposalDate', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Próxima disposición</span>
                <Input type="date" value={form.nextDisposalDate} onChange={(e) => updateField('nextDisposalDate', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Estado de la gestión</span>
                <Select value={form.status} onChange={(e) => updateField('status', e.target.value as WasteManagementStatusType)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Responsable *</span>
                <Input value={form.responsible} onChange={(e) => updateField('responsible', e.target.value)} placeholder="Ej: Coordinadora SST" required />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Evidencia (manifiesto, certificado, registro, soporte)</span>
                <Input value={form.evidenceUrl} onChange={(e) => updateField('evidenceUrl', e.target.value)} placeholder="Ej: gestor-xyz.com/manifiesto-2026-014" />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Observaciones operativas</span>
                <textarea className="input" rows={2} value={form.observations} onChange={(e) => updateField('observations', e.target.value)} placeholder="Ej: almacenamiento temporal en bodega de residuos" />
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
      <Card title={`Registros de residuos activos (${filtered.length})`}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} style={{ maxWidth: 180 }}>
            <option value="all">Todos los tipos</option>
            {WASTE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select value={hazardousFilter} onChange={(e) => setHazardousFilter(e.target.value as typeof hazardousFilter)} style={{ maxWidth: 200 }}>
            <option value="all">Peligrosos y no peligrosos</option>
            <option value="yes">Solo peligrosos</option>
            <option value="no">Solo no peligrosos</option>
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ maxWidth: 220 }}>
            <option value="all">Todos los estados</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '.9rem' }}>Cargando registros…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>♻️</div>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
              {activeRecords.length === 0
                ? 'No hay registros de residuos'
                : 'Ningún registro coincide con los filtros.'}
            </p>
            {activeRecords.length === 0 ? (
              <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
                {readOnly
                  ? 'Los registros se gestionan con un usuario owner o admin de la empresa.'
                  : 'Registra el primer residuo para el estándar 3.1.9.'}
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
                <th className="border border-black p-3">Tipo</th>
                <th className="border border-black p-3">Código / Fuente</th>
                <th className="border border-black p-3">Peligroso</th>
                <th className="border border-black p-3">Manejo → Disposición</th>
                <th className="border border-black p-3">Destino</th>
                <th className="border border-black p-3">Última disposición</th>
                <th className="border border-black p-3">Vigencia</th>
                <th className="border border-black p-3">Responsable</th>
                <th className="border border-black p-3">Estado</th>
                <th className="border border-black p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const status = STATUS_COLORS[record.status] ?? STATUS_COLORS.PLANNED;
                const overdue = isOverdue(record);
                return (
                  <tr key={record._id} style={record.active ? undefined : { opacity: 0.55 }}>
                    <td className="border border-black p-3" style={{ fontWeight: 600, fontSize: '.82rem' }}>
                      {optionsLabel(WASTE_TYPE_OPTIONS, record.wasteType)}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      <div style={{ fontWeight: 600 }}>{record.code}</div>
                      <div style={{ fontSize: '.72rem', color: '#64748b' }}>{record.source}</div>
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      {record.hazardous ? (
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color: '#991b1b', backgroundColor: '#fee2e2' }}>Sí</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>No</span>
                      )}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.78rem', maxWidth: 220 }}>
                      {record.handlingMethod}
                      {' → '}
                      {record.disposalMethod ? (
                        record.disposalMethod
                      ) : (
                        <span style={{ color: '#b45309' }}>sin disposición</span>
                      )}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.75rem', maxWidth: 160 }}>
                      {record.disposalDestination ?? <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      {formatDate(record.lastDisposalDate)}
                      <div style={{ fontSize: '.7rem', color: '#64748b' }}>{optionsLabel(FREQUENCY_OPTIONS, record.disposalFrequency)}</div>
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>
                      {formatDate(record.nextDisposalDate)}
                      {overdue ? (
                        <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#991b1b' }}>⚠ Vencida</div>
                      ) : null}
                    </td>
                    <td className="border border-black p-3" style={{ fontSize: '.8rem' }}>{record.responsible}</td>
                    <td className="border border-black p-3">
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600, color: status.color, backgroundColor: status.bg }}>
                        {record.status}
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
