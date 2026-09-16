import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createJobProfile,
  deactivateJobProfile,
  fetchJobProfiles,
  fetchRisks,
  JobProfileModel,
  reactivateJobProfile,
  RiskModel,
  updateJobProfile,
  UserRole,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { HazardPicker } from '../components/HazardPicker';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';

type Props = {
  token: string;
  role?: UserRole;
};

const emptyForm = {
  code: '',
  name: '',
  description: '',
  functions: [] as string[],
  responsibilities: [] as string[],
  workConditions: [] as string[],
  associatedHazardIds: [] as string[],
  medicalRelevantInformation: '',
  active: true,
};

/* ── Editor de listas de texto (funciones / responsabilidades / condiciones) ── */

function StringListEditor({ items, onChange, placeholder, addLabel }: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div>
      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', gap: '.35rem', marginBottom: '.35rem' }}>
          <Input
            value={item}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...items];
              next[index] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="danger"
            style={{ fontSize: '.75rem' }}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Eliminar ${placeholder}`}
          >
            ✕
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        style={{ fontSize: '.75rem' }}
        onClick={() => onChange([...items, ''])}
      >
        + {addLabel}
      </Button>
    </div>
  );
}

/* ── Estado de badge ── */

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: '.75rem',
      fontWeight: 600,
      color: active ? '#15803d' : '#64748b',
      backgroundColor: active ? '#f0fdf4' : '#f1f5f9',
    }}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

/* ── Página principal ── */

export function JobProfilesPage({ token, role }: Props) {
  const navigate = useNavigate();

  const canWrite = role === 'owner' || role === 'admin';
  const readOnly = !canWrite;

  const [profiles, setProfiles] = useState<JobProfileModel[]>([]);
  const [risks, setRisks] = useState<RiskModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [profileData, riskData] = await Promise.all([
        fetchJobProfiles(token),
        fetchRisks(token),
      ]);
      setProfiles(profileData);
      setRisks(riskData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar los perfiles de cargo.');
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
    return profiles.filter((profile) => {
      if (statusFilter === 'active' && !profile.active) return false;
      if (statusFilter === 'inactive' && profile.active) return false;
      if (!q) return true;
      return `${profile.code} ${profile.name}`.toLowerCase().includes(q);
    });
  }, [profiles, search, statusFilter]);
  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (profile: JobProfileModel) => {
    setForm({
      code: profile.code,
      name: profile.name,
      description: profile.description ?? '',
      functions: [...(profile.functions ?? [])],
      responsibilities: [...(profile.responsibilities ?? [])],
      workConditions: [...(profile.workConditions ?? [])],
      associatedHazardIds: [...(profile.associatedHazardIds ?? [])],
      medicalRelevantInformation: profile.medicalRelevantInformation ?? '',
      active: profile.active,
    });
    setEditingId(profile._id);
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

  const toggleHazard = (riskId: string) => {
    setForm((prev) => ({
      ...prev,
      associatedHazardIds: prev.associatedHazardIds.includes(riskId)
        ? prev.associatedHazardIds.filter((id) => id !== riskId)
        : [...prev.associatedHazardIds, riskId],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setError('El código y el nombre del perfil son obligatorios.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description,
        functions: form.functions.filter((f) => f.trim().length > 0),
        responsibilities: form.responsibilities.filter((f) => f.trim().length > 0),
        workConditions: form.workConditions.filter((f) => f.trim().length > 0),
        associatedHazardIds: form.associatedHazardIds,
        medicalRelevantInformation: form.medicalRelevantInformation,
        active: form.active,
      };
      if (editingId) {
        await updateJobProfile(token, editingId, payload);
      } else {
        await createJobProfile(token, payload);
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el perfil de cargo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (profile: JobProfileModel) => {
    setError('');
    try {
      if (profile.active) {
        await deactivateJobProfile(token, profile._id);
      } else {
        await reactivateJobProfile(token, profile._id, { active: true });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cambiar el estado del perfil.');
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
            🧑‍🏭 Perfiles de cargo
          </h1>
          <p style={{ margin: '.35rem 0 0', fontSize: '.9rem', color: '#64748b', maxWidth: 720 }}>
            Información de los perfiles de cargo disponible para el médico en las evaluaciones médicas ocupacionales — Estándar 3.1.3.
            {readOnly ? ' El perfil actual tiene permisos de solo lectura.' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={() => navigate('/documents/do')}>
            ← Volver al PHVA
          </Button>
          {!readOnly && (
            <Button type="button" onClick={openCreate} disabled={showForm}>
              + Nuevo perfil
            </Button>
          )}
        </div>
      </div>

      {/* ── Estado de cumplimiento (guía C1–C4, sin recalcular: la fuente es el provider/ComplianceEngine en el PHVA) ── */}
      <Card title="¿Qué se evalúa en 3.1.3?" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.5rem', fontSize: '.8rem', color: '#334155' }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C1 — Cobertura (25%):</strong> trabajadores con perfil de cargo activo asociado.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C2 — Funcional (25%):</strong> descripción, funciones y responsabilidades del perfil.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C3 — Valoración médica (25%):</strong> condiciones de trabajo, peligros asociados e información médico-ocupacional del cargo.
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '.5rem .6rem', border: '1px solid #e2e8f0' }}>
            <strong>C4 — Evidencia PRE-examen (25%):</strong> perfil suministrado al evaluador en cada examen (contexto ocupacional).
          </div>
        </div>
        <p style={{ margin: '.6rem 0 0', fontSize: '.78rem', color: '#64748b' }}>
          El porcentaje y los hallazgos del estándar se calculan en el backend (ComplianceEngine / provider <code>job-profile-medical-information</code>) y se reflejan en el PHVA — Hacer. Esta pantalla gestiona los datos que lo alimentan.
        </p>
      </Card>

      {/* ── Error global ── */}
      {error ? <pre className="error" style={{ marginBottom: '.75rem' }}>{error}</pre> : null}

      {/* ── Formulario ── */}
      {showForm && !readOnly && (
        <Card title={editingId ? 'Editar perfil de cargo' : 'Nuevo perfil de cargo'} style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Código *</span>
                <Input value={form.code} onChange={(e) => updateField('code', e.target.value)} placeholder="Ej: OP-001" required />
              </label>
              <label className="field">
                <span className="label">Nombre del cargo *</span>
                <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Ej: Operario de producción" required />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Descripción del cargo (propósito, alcance)</span>
                <textarea
                  className="input"
                  rows={2}
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Descripción del cargo…"
                />
              </label>
            </div>

            <div className="grid grid-2" style={{ marginTop: '.5rem' }}>
              <label className="field">
                <span className="label">Funciones principales</span>
                <StringListEditor
                  items={form.functions}
                  onChange={(v) => updateField('functions', v)}
                  placeholder="Función del cargo"
                  addLabel="Agregar función"
                />
              </label>
              <label className="field">
                <span className="label">Responsabilidades</span>
                <StringListEditor
                  items={form.responsibilities}
                  onChange={(v) => updateField('responsibilities', v)}
                  placeholder="Responsabilidad del cargo"
                  addLabel="Agregar responsabilidad"
                />
              </label>
              <label className="field">
                <span className="label">Condiciones de trabajo (turnos, carga física, ambiente…)</span>
                <StringListEditor
                  items={form.workConditions}
                  onChange={(v) => updateField('workConditions', v)}
                  placeholder="Condición de trabajo"
                  addLabel="Agregar condición"
                />
              </label>
              <label className="field">
                <span className="label">Peligros asociados (matriz de riesgos)</span>
                <HazardPicker risks={risks} selected={form.associatedHazardIds} onToggle={toggleHazard} />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Información relevante para valoración médica ocupacional (del cargo, no clínica)</span>
                <textarea
                  className="input"
                  rows={3}
                  value={form.medicalRelevantInformation}
                  onChange={(e) => updateField('medicalRelevantInformation', e.target.value)}
                  placeholder="Exigencias físicas, exposición relevante, agentes, requerimientos específicos del cargo…"
                />
              </label>
              <label className="field">
                <span className="label">Estado</span>
                <Select value={form.active ? 'true' : 'false'} onChange={(e) => updateField('active', e.target.value === 'true')}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </Select>
              </label>
            </div>

            <div className="actions">
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear perfil'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Filtros + listado ── */}
      <Card title={`Perfiles de cargo (${filtered.length})`}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o nombre…"
            style={{ maxWidth: 320 }}
          />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ maxWidth: 180 }}>
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </Select>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '.9rem' }}>Cargando perfiles de cargo…</p>
        ) : profiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📄</div>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: '#475569' }}>
              No hay perfiles de cargo registrados
            </p>
            <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: '#64748b' }}>
              {readOnly
                ? 'Los perfiles de cargo se gestionan con un usuario owner o admin de la empresa.'
                : 'Crea el primer perfil de cargo para que la información esté disponible para la evaluación médica ocupacional (3.1.3).'}
            </p>
            {!readOnly ? (
              <Button type="button" onClick={openCreate} style={{ marginTop: '.75rem' }}>
                + Nuevo perfil
              </Button>
            ) : null}
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>Ningún perfil coincide con la búsqueda.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="border border-black p-3">Código</th>
                <th className="border border-black p-3">Nombre</th>
                <th className="border border-black p-3">Estado</th>
                <th className="border border-black p-3">Funciones</th>
                <th className="border border-black p-3">Responsab.</th>
                <th className="border border-black p-3">Peligros</th>
                <th className="border border-black p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => (
                <tr key={profile._id}>
                  <td className="border border-black p-3" style={{ fontWeight: 600 }}>{profile.code}</td>
                  <td className="border border-black p-3">
                    {profile.name}
                    {profile.description ? <div style={{ fontSize: '.75rem', color: '#64748b' }}>{profile.description}</div> : null}
                  </td>
                  <td className="border border-black p-3"><StatusBadge active={profile.active} /></td>
                  <td className="border border-black p-3" style={{ textAlign: 'center' }}>{profile.functions?.length ?? 0}</td>
                  <td className="border border-black p-3" style={{ textAlign: 'center' }}>{profile.responsibilities?.length ?? 0}</td>
                  <td className="border border-black p-3" style={{ textAlign: 'center' }}>
                    {profile.associatedHazardIds?.length ?? 0}
                  </td>
                  <td className="border border-black p-3">
                    {readOnly ? (
                      <span style={{ fontSize: '.75rem', color: '#64748b' }}>Solo lectura</span>
                    ) : (
                      <div className="actions">
                        <Button type="button" variant="secondary" onClick={() => openEdit(profile)} style={{ fontSize: '.75rem' }}>Editar</Button>
                        <Button
                          type="button"
                          variant={profile.active ? 'secondary' : 'primary'}
                          onClick={() => void handleToggleActive(profile)}
                          style={{ fontSize: '.75rem' }}
                        >
                          {profile.active ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ── Asociación con trabajadores (referencia) ── */}
      {profiles.length > 0 && (
        <Card title="Relación con trabajadores" style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0, fontSize: '.85rem', color: '#475569' }}>
            La asociación de un perfil a cada trabajador se realiza en el módulo <strong>Empleados</strong> (campo "Perfil de cargo").
            Los peligros del perfil se usan como referencia al registrar el contexto ocupacional de un examen médico (evidencia PRE-examen).
          </p>
          <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.25rem', fontSize: '.8rem', color: '#64748b' }}>
            {profiles.filter((p) => p.active).slice(0, 8).map((p) => (
              <li key={p._id}>
                <strong>{p.code}</strong> — {p.name}
                {p.associatedHazardIds?.length ? ` (${p.associatedHazardIds.length} peligro(s) asociados)` : ''}
              </li>
            ))}
            {profiles.filter((p) => p.active).length > 8 ? <li>…y {profiles.filter((p) => p.active).length - 8} más.</li> : null}
          </ul>
          <p style={{ margin: 0, fontSize: '.8rem', color: '#64748b', marginTop: '.5rem' }}>
            Perfiles en uso: {profiles.filter((p) => p.active).length} activo(s) de {profiles.length} total(es).
          </p>
        </Card>
      )}
    </div>
  );
}
