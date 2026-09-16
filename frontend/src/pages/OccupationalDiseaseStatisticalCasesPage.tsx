import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  OccupationalDiseaseCaseStatusType,
  OccupationalDiseaseQualificationType,
  OccupationalDiseaseStatisticalCaseModel,
  closeOccupationalDiseaseStatisticalCase,
  createOccupationalDiseaseStatisticalCase,
  deactivateOccupationalDiseaseStatisticalCase,
  fetchOccupationalDiseaseStatisticalCases,
  reopenOccupationalDiseaseStatisticalCase,
  updateOccupationalDiseaseStatisticalCase,
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

const QUALIFICATION_OPTIONS: {
  value: OccupationalDiseaseQualificationType;
  label: string;
}[] = [
  { value: 'QUALIFIED', label: 'Calificado (enfermedad laboral)' },
  { value: 'UNDER_REVIEW', label: 'En revisión (no confirmado)' },
  { value: 'NOT_QUALIFIED', label: 'No calificado' },
  { value: 'DISCARDED', label: 'Descartado' },
];

const CASE_STATUS_OPTIONS: { value: OccupationalDiseaseCaseStatusType; label: string }[] = [
  { value: 'OPEN', label: 'Abierto' },
  { value: 'CLOSED', label: 'Cerrado' },
];

const QUALIFICATION_COLORS: Record<OccupationalDiseaseQualificationType, { color: string; bg: string }> = {
  QUALIFIED: { color: '#166534', bg: '#dcfce7' },
  UNDER_REVIEW: { color: '#92400e', bg: '#fef3c7' },
  NOT_QUALIFIED: { color: '#991b1b', bg: '#fee2e2' },
  DISCARDED: { color: '#525252', bg: '#e5e5e5' },
};

const CASE_STATUS_COLORS: Record<OccupationalDiseaseCaseStatusType, { color: string; bg: string }> = {
  OPEN: { color: '#1d4ed8', bg: '#dbeafe' },
  CLOSED: { color: '#525252', bg: '#e5e5e5' },
};

type CaseForm = {
  statisticalCaseId: string;
  employeeId: string;
  occupationalQualification: OccupationalDiseaseQualificationType;
  recognitionDate: string;
  investigationRef: string;
};

const emptyForm: CaseForm = {
  statisticalCaseId: '',
  employeeId: '',
  occupationalQualification: 'UNDER_REVIEW',
  recognitionDate: '',
  investigationRef: '',
};

function optionsLabel<T extends string>(
  options: { value: T; label: string }[],
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CO');
}

/**
 * Página administrativa de Casos Estadísticos de Enfermedad Laboral
 * (FASE 35B — infraestructura base compartida).
 *
 * IMPORTANTE (§ IMPORTANTE SOBRE PREVALENCIA E INCIDENCIA):
 * esta página NO muestra prevalencia, incidencia ni cumplimiento 3.3.4/3.3.5.
 * Es SOLO la administración estadística de casos; las métricas y el scoring
 * llegarán con los providers de las fases 35C (3.3.4) y 35D (3.3.5).
 * NO existen campos clínicos (diagnóstico, CIE, historia clínica, síntomas,
 * tratamientos, medicamentos, resultados clínicos) porque el modelo no los
 * almacena.
 */
export function OccupationalDiseaseStatisticalCasesPage({ token, role }: Props) {
  const navigate = useNavigate();

  const canWrite = role === 'owner' || role === 'admin';
  const readOnly = !canWrite;

  const [cases, setCases] = useState<OccupationalDiseaseStatisticalCaseModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchId, setSearchId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OccupationalDiseaseCaseStatusType>('all');
  const [qualificationFilter, setQualificationFilter] = useState<
    'all' | OccupationalDiseaseQualificationType
  >('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CaseForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOccupationalDiseaseStatisticalCases(token);
      setCases(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar los casos estadísticos.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeCases = cases.filter((c) => c.active);

  // Resumen administrativo (SOLO UI — sin métricas de prevalencia/incidencia).
  const summary = useMemo(() => {
    const qualified = activeCases.filter(
      (c) => c.occupationalQualification === 'QUALIFIED',
    );
    const first = qualified.filter((c) => c.firstOccurrence);
    const open = activeCases.filter((c) => c.caseStatus === 'OPEN');
    return {
      total: activeCases.length,
      qualified: qualified.length,
      firstOccurrence: first.length,
      open: open.length,
      closed: activeCases.length - open.length,
    };
  }, [cases]);

  const filtered = useMemo(() => {
    return activeCases.filter((c) => {
      if (statusFilter !== 'all' && c.caseStatus !== statusFilter) return false;
      if (
        qualificationFilter !== 'all' &&
        c.occupationalQualification !== qualificationFilter
      ) {
        return false;
      }
      if (
        searchId.trim() &&
        !c.statisticalCaseId.toLowerCase().includes(searchId.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [cases, statusFilter, qualificationFilter, searchId]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (record: OccupationalDiseaseStatisticalCaseModel) => {
    setForm({
      statisticalCaseId: record.statisticalCaseId,
      employeeId: record.employeeId ?? '',
      occupationalQualification: record.occupationalQualification,
      recognitionDate: record.recognitionDate
        ? record.recognitionDate.slice(0, 10)
        : '',
      investigationRef: record.investigationRef ?? '',
    });
    setEditingId(record._id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const updateField = <K extends keyof CaseForm>(field: K, value: CaseForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.statisticalCaseId.trim()) {
      setError('El identificador estadístico del caso es obligatorio.');
      return;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(form.statisticalCaseId.trim())) {
      setError(
        'El identificador solo acepta letras, números, punto, guion y guion bajo.',
      );
      return;
    }
    if (
      form.occupationalQualification === 'QUALIFIED' &&
      !form.recognitionDate
    ) {
      setError('Un caso CALIFICADO exige fecha de reconocimiento.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await updateOccupationalDiseaseStatisticalCase(token, editingId, {
          occupationalQualification: form.occupationalQualification,
          recognitionDate: form.recognitionDate
            ? new Date(`${form.recognitionDate}T00:00:00.000Z`).toISOString()
            : undefined,
          employeeId: form.employeeId.trim() || undefined,
          investigationRef: form.investigationRef.trim() || undefined,
        });
      } else {
        await createOccupationalDiseaseStatisticalCase(token, {
          statisticalCaseId: form.statisticalCaseId.trim(),
          employeeId: form.employeeId.trim() || undefined,
          occupationalQualification: form.occupationalQualification,
          recognitionDate: form.recognitionDate
            ? new Date(`${form.recognitionDate}T00:00:00.000Z`).toISOString()
            : undefined,
        });
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible guardar el caso estadístico.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (record: OccupationalDiseaseStatisticalCaseModel) => {
    setError('');
    try {
      await closeOccupationalDiseaseStatisticalCase(token, record._id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cerrar el caso.');
    }
  };

  const handleReopen = async (record: OccupationalDiseaseStatisticalCaseModel) => {
    setError('');
    try {
      await reopenOccupationalDiseaseStatisticalCase(token, record._id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible reabrir el caso.');
    }
  };

  const handleDeactivate = async (record: OccupationalDiseaseStatisticalCaseModel) => {
    setError('');
    try {
      await deactivateOccupationalDiseaseStatisticalCase(token, record._id);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No fue posible desactivar el caso.',
      );
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1160, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* ── Encabezado ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            🩺 Casos estadísticos de enfermedad laboral
          </h1>
          <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b', maxWidth: 820 }}>
            Registro administrativo/estadístico de casos de enfermedad laboral — base para la
            medición epidemiológica (futuros estándares 3.3.4 prevalencia y 3.3.5 incidencia).
            Este módulo <strong>NO almacena información clínica</strong> (diagnóstico, CIE,
            historia clínica, síntomas, tratamientos). Un caso en revisión NO es un caso
            confirmado; un caso cerrado no vuelve a contar como nuevo.
            {readOnly ? ' El perfil actual tiene permisos de solo lectura.' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={() => navigate('/documents/do')}>
            ← Volver al PHVA
          </Button>
          {!readOnly && (
            <Button type="button" onClick={openCreate} disabled={showForm}>
              + Nuevo caso
            </Button>
          )}
        </div>
      </div>

      {/* ── Alcance de la fase (sin scoring) ── */}
      <Card title="Alcance de esta fase" style={{ marginBottom: '1rem' }}>
        <p style={{ margin: 0, fontSize: '.82rem', color: '#334155' }}>
          Esta infraestructura registra <strong>casos estadísticos</strong> con su calificación
          ocupacional, fecha de reconocimiento, período y trazabilidad. Los indicadores de{' '}
          <strong>prevalencia (3.3.4)</strong> e <strong>incidencia (3.3.5)</strong> y su
          cumplimiento normativo se calcularán en fases posteriores a partir de estos casos; por
          ahora no se muestran métricas ni porcentajes de cumplimiento. La evidencia proviene
          exclusivamente de los casos registrados aquí — las investigaciones de incidentes
          (3.2.2), el ausentismo y los documentos NO se convierten automáticamente en casos.
        </p>
      </Card>

      {error ? <pre className="error" style={{ marginBottom: '.75rem' }}>{error}</pre> : null}
      {loading ? <p>Cargando casos estadísticos…</p> : null}

      {/* ── Resumen administrativo (SOLO UI) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '.6rem',
          marginBottom: '1rem',
        }}
      >
        {[
          { label: 'Casos activos', value: summary.total },
          { label: 'Calificados', value: summary.qualified },
          { label: 'Primera ocurrencia', value: summary.firstOccurrence },
          { label: 'Abiertos', value: summary.open },
          { label: 'Cerrados', value: summary.closed },
        ].map((item) => (
          <Card key={item.label} style={{ padding: '.6rem .8rem' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
            <div style={{ fontSize: '.75rem', color: '#64748b' }}>{item.label}</div>
          </Card>
        ))}
      </div>

      {/* ── Formulario ── */}
      {showForm && (
        <Card title={editingId ? 'Editar caso estadístico' : 'Nuevo caso estadístico'} style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem' }}>
              <label>
                <span style={{ fontSize: '.8rem', color: '#334155' }}>
                  Identificador estadístico * (único por empresa; ej. EL-2026-001)
                </span>
                <Input
                  value={form.statisticalCaseId}
                  onChange={(e) => updateField('statisticalCaseId', e.target.value)}
                  disabled={editingId !== null}
                  placeholder="EL-2026-001"
                />
              </label>
              <label>
                <span style={{ fontSize: '.8rem', color: '#334155' }}>Calificación ocupacional *</span>
                <Select
                  value={form.occupationalQualification}
                  onChange={(e) =>
                    updateField(
                      'occupationalQualification',
                      e.target.value as OccupationalDiseaseQualificationType,
                    )
                  }
                >
                  {QUALIFICATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                <span style={{ fontSize: '.8rem', color: '#334155' }}>
                  Fecha de reconocimiento {form.occupationalQualification === 'QUALIFIED' ? '*' : '(opcional)'}
                </span>
                <Input
                  type="date"
                  value={form.recognitionDate}
                  onChange={(e) => updateField('recognitionDate', e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label>
                <span style={{ fontSize: '.8rem', color: '#334155' }}>
                  ID del trabajador (opcional, administrativo)
                </span>
                <Input
                  value={form.employeeId}
                  onChange={(e) => updateField('employeeId', e.target.value)}
                  placeholder="ObjectId del empleado"
                />
              </label>
              {editingId !== null && (
                <label>
                  <span style={{ fontSize: '.8rem', color: '#334155' }}>
                    Ref. investigación (opcional; vínculo manual, no conversión)
                  </span>
                  <Input
                    value={form.investigationRef}
                    onChange={(e) => updateField('investigationRef', e.target.value)}
                    placeholder="ObjectId de la investigación"
                  />
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear caso'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelForm}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Filtros ── */}
      <div
        style={{
          display: 'flex',
          gap: '.75rem',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginBottom: '.75rem',
        }}
      >
        <label style={{ minWidth: 220 }}>
          <span style={{ fontSize: '.8rem', color: '#334155' }}>Buscar por identificador</span>
          <Input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="EL-2026-…"
          />
        </label>
        <label style={{ minWidth: 200 }}>
          <span style={{ fontSize: '.8rem', color: '#334155' }}>Estado</span>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">Todos</option>
            {CASE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label style={{ minWidth: 220 }}>
          <span style={{ fontSize: '.8rem', color: '#334155' }}>Calificación</span>
          <Select
            value={qualificationFilter}
            onChange={(e) => setQualificationFilter(e.target.value as typeof qualificationFilter)}
          >
            <option value="all">Todas</option>
            {QUALIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* ── Tabla de casos ── */}
      <Table>
        <thead>
          <tr>
            <th>Identificador</th>
            <th>Calificación</th>
            <th>Estado</th>
            <th>Reconocimiento</th>
            <th>Período</th>
            <th>1ª ocurrencia</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '1rem' }}>
                No hay casos estadísticos registrados con los filtros actuales.
              </td>
            </tr>
          ) : (
            filtered.map((record) => {
              const qColor = QUALIFICATION_COLORS[record.occupationalQualification];
              const sColor = CASE_STATUS_COLORS[record.caseStatus];
              return (
                <tr key={record._id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{record.statisticalCaseId}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '.15rem .5rem',
                        borderRadius: 999,
                        fontSize: '.72rem',
                        fontWeight: 600,
                        color: qColor.color,
                        backgroundColor: qColor.bg,
                      }}
                    >
                      {optionsLabel(QUALIFICATION_OPTIONS, record.occupationalQualification)}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '.15rem .5rem',
                        borderRadius: 999,
                        fontSize: '.72rem',
                        fontWeight: 600,
                        color: sColor.color,
                        backgroundColor: sColor.bg,
                      }}
                    >
                      {optionsLabel(CASE_STATUS_OPTIONS, record.caseStatus)}
                    </span>
                  </td>
                  <td>{formatDate(record.recognitionDate)}</td>
                  <td>{record.period}</td>
                  <td>{record.firstOccurrence ? 'Sí' : 'No'}</td>
                  <td>
                    {!readOnly && (
                      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => openEdit(record)}
                        >
                          Editar
                        </Button>
                        {record.caseStatus === 'OPEN' ? (
                          <Button type="button" variant="secondary" onClick={() => handleClose(record)}>
                            Cerrar
                          </Button>
                        ) : (
                          <Button type="button" variant="secondary" onClick={() => handleReopen(record)}>
                            Reabrir
                          </Button>
                        )}
                        <Button type="button" variant="secondary" onClick={() => handleDeactivate(record)}>
                          Desactivar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      {filtered.length === 0 && !loading ? null : (
        <p style={{ fontSize: '.78rem', color: '#64748b', marginTop: '.5rem' }}>
          {filtered.length} caso(s) mostrado(s). La información mostrada es exclusivamente
          administrativa/estadística; no incluye datos clínicos.
        </p>
      )}
    </div>
  );
}
