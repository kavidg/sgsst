import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import {
  CompanyProfileModel,
  fetchCompanyProfile,
  updateCompanyProfile,
  addWorkCenter,
  updateWorkCenter,
  deleteWorkCenter,
  upsertContact,
  addCompanyDocument,
  deleteCompanyDocument,
  fetchEmployees,
  EmployeeModel,
} from '../api';

const COMPANY_SIZE_OPTIONS = ['Microempresa', 'Pequeña', 'Mediana', 'Grande'];
const RISK_LEVEL_OPTIONS = ['I', 'II', 'III', 'IV', 'V'];
const IMPLEMENTATION_STATUS_OPTIONS = ['Not Started', 'Initial Stage', 'In Progress', 'Implemented', 'Mature'];
const WORK_SCHEDULE_OPTIONS = ['Administrativo', 'Operativo', 'Mixto'];
const DOCUMENT_TYPES = [
  { value: 'CHAMBER_COMMERCE', label: 'Cámara de Comercio' },
  { value: 'RUT', label: 'RUT' },
  { value: 'LEGAL_REP_ID', label: 'Cédula Representante Legal' },
  { value: 'ARL_CERTIFICATE', label: 'Certificado ARL' },
  { value: 'LOGO', label: 'Logo Empresa' },
  { value: 'OTHER', label: 'Otro' },
];
const CONTACT_TYPES = [
  { value: 'LEGAL_REPRESENTATIVE', label: 'Representante Legal' },
  { value: 'HR', label: 'Recursos Humanos' },
  { value: 'SST', label: 'Responsable SST' },
  { value: 'EMERGENCY', label: 'Contacto Emergencia' },
  { value: 'ARL', label: 'Contacto ARL' },
];

function toInputDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

type TabName = 'general' | 'labor' | 'sst' | 'workcenters' | 'contacts' | 'documents' | 'history';

const TABS: { key: TabName; label: string }[] = [
  { key: 'general', label: 'Información General' },
  { key: 'labor', label: 'Información Laboral' },
  { key: 'sst', label: 'Información SG-SST' },
  { key: 'workcenters', label: 'Centros de Trabajo' },
  { key: 'contacts', label: 'Contactos' },
  { key: 'documents', label: 'Documentos Empresa' },
  { key: 'history', label: 'Historial' },
];

export default function CompanyConfigurationPage({ token }: { token: string }) {
  const [profile, setProfile] = useState<CompanyProfileModel | null>(null);
  const [tab, setTab] = useState<TabName>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // New Work Center form
  const [newWc, setNewWc] = useState({ name: '', address: '', city: '', riskLevel: '', employeeCount: 0 });
  // New Contact form
  const [newContact, setNewContact] = useState({ type: '', name: '', position: '', phone: '', email: '' });
  // New Document form
  const [newDoc, setNewDoc] = useState({ type: '', name: '', fileUrl: '' });

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([
        fetchCompanyProfile(token),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
      ]);
      setProfile(p);
      setEmployees(e);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const handleUpdate = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const updated = await updateCompanyProfile(token, payload);
      setProfile(updated);
      notify('Guardado correctamente');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddWorkCenter = async () => {
    if (!newWc.name.trim()) { showError('El nombre del centro de trabajo es obligatorio'); return; }
    try {
      const updated = await addWorkCenter(token, newWc);
      setProfile(updated);
      setNewWc({ name: '', address: '', city: '', riskLevel: '', employeeCount: 0 });
      notify('Centro de trabajo agregado');
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleRemoveWorkCenter = async (index: number) => {
    if (!confirm('¿Eliminar este centro de trabajo?')) return;
    try {
      const updated = await deleteWorkCenter(token, index);
      setProfile(updated);
      notify('Centro de trabajo eliminado');
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleUpsertContact = async () => {
    if (!newContact.type || !newContact.name.trim()) { showError('Tipo y nombre son obligatorios'); return; }
    try {
      const updated = await upsertContact(token, newContact);
      setProfile(updated);
      setNewContact({ type: '', name: '', position: '', phone: '', email: '' });
      notify('Contacto guardado');
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleAddDocument = async () => {
    if (!newDoc.type || !newDoc.name.trim()) { showError('Tipo y nombre son obligatorios'); return; }
    try {
      const updated = await addCompanyDocument(token, newDoc);
      setProfile(updated);
      setNewDoc({ type: '', name: '', fileUrl: '' });
      notify('Documento registrado');
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleRemoveDocument = async (index: number) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      const updated = await deleteCompanyDocument(token, index);
      setProfile(updated);
      notify('Documento eliminado');
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      void handleUpdate({ logoUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSetSstResponsible = async (userId: string) => {
    try {
      const updated = await updateCompanyProfile(token, { responsibleSstUserId: userId });
      setProfile(updated);
      notify('Responsable SST asignado');
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const sel = (field: string) => (profile as unknown as Record<string, unknown>)?.[field];
  const updateField = (field: string, value: unknown) => {
    setProfile((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  if (!profile) {
    return <div className="card"><p className="muted">{loading ? 'Cargando configuración de empresa...' : 'No hay datos de configuración disponibles.'}</p></div>;
  }

  return (
    <div className="company-config">
      {/* Hero */}
      <section className="advanced-management__hero">
        <div>
          <h3>Configuración de Empresa</h3>
          <p className="muted">Complete la información de su empresa para habilitar la implementación SG-SST.</p>
        </div>
        <div className="actions" style={{ gap: 8 }}>
          <span className={`company-config__badge ${profile.completionPercentage >= 80 ? 'company-config__badge--success' : profile.completionPercentage >= 40 ? 'company-config__badge--warning' : 'company-config__badge--danger'}`}>
            {profile.completionPercentage}% Completo
          </span>
        </div>
      </section>

      {/* Progress Bar */}
      <div className="objective-progress" style={{ margin: '12px 0' }}>
        <div className="objective-progress__track" style={{ height: 14 }}>
          <span
            className={`objective-progress__bar ${profile.completionPercentage >= 80 ? 'objective-progress__bar--high' : profile.completionPercentage >= 40 ? 'objective-progress__bar--medium' : 'objective-progress__bar--low'}`}
            style={{ width: `${profile.completionPercentage}%` }}
          />
        </div>
        <strong style={{ fontSize: '0.85rem', minWidth: 40 }}>{profile.completionPercentage}%</strong>
      </div>

      {/* Required fields warning */}
      {profile.completionPercentage < 100 && (
        <div className="advanced-management__section" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          <p className="muted" style={{ color: '#92400e', margin: 0 }}>
            ⚠ Complete los campos obligatorios (Nombre, NIT, Sector Económico, Nivel Riesgo, ARL, Responsable SST, Total Empleados) antes de iniciar la implementación SG-SST.
          </p>
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="advanced-management__success">{success}</p> : null}
      {saving ? <p className="muted">Guardando...</p> : null}

      {/* Tabs */}
      <div className="advanced-tabs" role="tablist" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <Button key={t.key} type="button" variant={tab === t.key ? 'primary' : 'secondary'} onClick={() => setTab(t.key)}>{t.label}</Button>
        ))}
      </div>

      {/* ============ TAB 1: GENERAL ============ */}
      {tab === 'general' && (
        <section className="advanced-management__section">
          <h3>Información General</h3>
          <div className="form-grid">
            <div className="grid grid-3">
              <label className="field"><span className="label">Nombre Comercial *</span><input className="input" value={profile.companyName || ''} disabled placeholder="Sincronizado de la empresa" title="Se sincroniza automáticamente desde los datos de la empresa" /></label>
              <label className="field"><span className="label">Razón Social</span><input className="input" value={sel('legalName') as string || ''} onChange={(e) => { updateField('legalName', e.target.value); void handleUpdate({ legalName: e.target.value }); }} /></label>
              <label className="field"><span className="label">NIT *</span><input className="input" value={profile.nit || ''} disabled title="Se sincroniza automáticamente desde los datos de la empresa" /></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">Digito Verificación</span><input className="input" value={sel('verificationDigit') as string || ''} onChange={(e) => { updateField('verificationDigit', e.target.value); void handleUpdate({ verificationDigit: e.target.value }); }} placeholder="Ej: 5" /></label>
              <label className="field"><span className="label">Sector Económico *</span><input className="input" value={profile.economicSector || ''} disabled title="Se sincroniza automáticamente desde los datos de la empresa" /></label>
              <label className="field"><span className="label">Actividad Económica</span><input className="input" value={sel('companyType') as string || ''} onChange={(e) => { updateField('companyType', e.target.value); void handleUpdate({ companyType: e.target.value }); }} /></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">Código CIIU</span><input className="input" value={sel('companyType') as string || ''} onChange={(e) => { updateField('companyType', e.target.value); void handleUpdate({ companyType: e.target.value }); }} placeholder="Ej: 0111" /></label>
              <label className="field"><span className="label">Tamaño Empresa</span><select className="input" value={sel('companySize') as string || ''} onChange={(e) => { updateField('companySize', e.target.value); void handleUpdate({ companySize: e.target.value }); }}><option value="">Seleccionar</option>{COMPANY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
              <label className="field"><span className="label">Nivel de Riesgo *</span><select className="input" value={sel('riskLevel') as string || ''} onChange={(e) => { updateField('riskLevel', e.target.value); void handleUpdate({ riskLevel: e.target.value }); }}><option value="">Seleccionar</option>{RISK_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>Clase {o}</option>)}</select></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">Dirección</span><input className="input" value={sel('address') as string || ''} onChange={(e) => { updateField('address', e.target.value); void handleUpdate({ address: e.target.value }); }} /></label>
              <label className="field"><span className="label">Ciudad</span><input className="input" value={sel('city') as string || ''} onChange={(e) => { updateField('city', e.target.value); void handleUpdate({ city: e.target.value }); }} /></label>
              <label className="field"><span className="label">Departamento</span><input className="input" value={sel('department') as string || ''} onChange={(e) => { updateField('department', e.target.value); void handleUpdate({ department: e.target.value }); }} /></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">País</span><input className="input" value={sel('country') as string || 'Colombia'} onChange={(e) => { updateField('country', e.target.value); void handleUpdate({ country: e.target.value }); }} /></label>
              <label className="field"><span className="label">Teléfono</span><input className="input" value={sel('phone') as string || ''} onChange={(e) => { updateField('phone', e.target.value); void handleUpdate({ phone: e.target.value }); }} /></label>
              <label className="field"><span className="label">Email</span><input className="input" type="email" value={sel('email') as string || ''} onChange={(e) => { updateField('email', e.target.value); void handleUpdate({ email: e.target.value }); }} /></label>
            </div>
            <label className="field"><span className="label">Sitio Web</span><input className="input" value={sel('website') as string || ''} onChange={(e) => { updateField('website', e.target.value); void handleUpdate({ website: e.target.value }); }} placeholder="https://" /></label>
            <label className="field"><span className="label">Logo Empresa</span>
              <div className="actions" style={{ gap: 8 }}>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoUpload} />
                {(logoPreview || sel('logoUrl')) && <img src={logoPreview || sel('logoUrl') as string} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0' }} />}
              </div>
            </label>
          </div>
        </section>
      )}

      {/* ============ TAB 2: LABOR ============ */}
      {tab === 'labor' && (
        <section className="advanced-management__section">
          <h3>Información Laboral</h3>
          <div className="form-grid">
            <div className="grid grid-3">
              <label className="field"><span className="label">Total Empleados *</span><input className="input" type="number" min={0} value={profile.totalEmployees} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('totalEmployees', v); void handleUpdate({ totalEmployees: v }); }} /></label>
              <label className="field"><span className="label">Directos</span><input className="input" type="number" min={0} value={profile.directEmployees} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('directEmployees', v); void handleUpdate({ directEmployees: v }); }} /></label>
              <label className="field"><span className="label">Contratistas</span><input className="input" type="number" min={0} value={profile.contractors} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('contractors', v); void handleUpdate({ contractors: v }); }} /></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">Aprendices</span><input className="input" type="number" min={0} value={profile.apprentices} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('apprentices', v); void handleUpdate({ apprentices: v }); }} /></label>
              <label className="field"><span className="label">Temporales</span><input className="input" type="number" min={0} value={profile.temporaryWorkers} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('temporaryWorkers', v); void handleUpdate({ temporaryWorkers: v }); }} /></label>
            </div>
            <h4>Distribución por Género</h4>
            <div className="grid grid-3">
              <label className="field"><span className="label">Hombres</span><input className="input" type="number" min={0} value={profile.maleEmployees} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('maleEmployees', v); void handleUpdate({ maleEmployees: v }); }} /></label>
              <label className="field"><span className="label">Mujeres</span><input className="input" type="number" min={0} value={profile.femaleEmployees} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('femaleEmployees', v); void handleUpdate({ femaleEmployees: v }); }} /></label>
              <label className="field"><span className="label">Otro</span><input className="input" type="number" min={0} value={profile.otherGenderEmployees} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('otherGenderEmployees', v); void handleUpdate({ otherGenderEmployees: v }); }} /></label>
            </div>
            <h4>Distribución por Edad</h4>
            <div className="grid grid-3">
              <label className="field"><span className="label">Menores 18</span><input className="input" type="number" min={0} value={profile.ageUnder18} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('ageUnder18', v); void handleUpdate({ ageUnder18: v }); }} /></label>
              <label className="field"><span className="label">18-25</span><input className="input" type="number" min={0} value={profile.age18to25} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('age18to25', v); void handleUpdate({ age18to25: v }); }} /></label>
              <label className="field"><span className="label">26-35</span><input className="input" type="number" min={0} value={profile.age26to35} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('age26to35', v); void handleUpdate({ age26to35: v }); }} /></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">36-45</span><input className="input" type="number" min={0} value={profile.age36to45} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('age36to45', v); void handleUpdate({ age36to45: v }); }} /></label>
              <label className="field"><span className="label">46-60</span><input className="input" type="number" min={0} value={profile.age46to60} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('age46to60', v); void handleUpdate({ age46to60: v }); }} /></label>
              <label className="field"><span className="label">60+</span><input className="input" type="number" min={0} value={profile.ageOver60} onChange={(e) => { const v = parseInt(e.target.value) || 0; updateField('ageOver60', v); void handleUpdate({ ageOver60: v }); }} /></label>
            </div>
            <h4>Jornadas Laborales</h4>
            <div className="actions" style={{ flexWrap: 'wrap' }}>
              {WORK_SCHEDULE_OPTIONS.map((s) => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <input type="checkbox" checked={profile.workSchedules.includes(s)} onChange={() => {
                    const next = profile.workSchedules.includes(s) ? profile.workSchedules.filter((x) => x !== s) : [...profile.workSchedules, s];
                    updateField('workSchedules', next);
                    void handleUpdate({ workSchedules: next });
                  }} /> {s}
                </label>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ TAB 3: SG-SST ============ */}
      {tab === 'sst' && (
        <section className="advanced-management__section">
          <h3>Información SG-SST</h3>
          <div className="form-grid">
            <div className="grid grid-2">
              <label className="field"><span className="label">ARL *</span>
                <select className="input" value={profile.arlName || ''} onChange={(e) => { updateField('arlName', e.target.value); void handleUpdate({ arlName: e.target.value }); }}>
                  <option value="">Seleccionar ARL</option>
                  <option value="Positiva">Positiva</option>
                  <option value="Sura">Sura</option>
                  <option value="Colmena">Colmena</option>
                  <option value="Bolívar">Bolívar</option>
                  <option value="Liberty">Liberty</option>
                  <option value="Seguros del Estado">Seguros del Estado</option>
                  <option value="Equidad">Equidad</option>
                  <option value="Mapfre">Mapfre</option>
                  <option value="Otro">Otra ARL</option>
                </select>
              </label>
              <label className="field"><span className="label">Número Afiliación ARL</span><input className="input" value={profile.arlAffiliateNumber || ''} onChange={(e) => { updateField('arlAffiliateNumber', e.target.value); void handleUpdate({ arlAffiliateNumber: e.target.value }); }} /></label>
            </div>
            <div className="grid grid-2">
              <label className="field"><span className="label">Responsable SST *</span>
                <select className="input" value={profile.responsibleSstUserId || ''} onChange={(e) => handleSetSstResponsible(e.target.value)}>
                  <option value="">Seleccionar empleado</option>
                  {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} · {emp.position}</option>)}
                </select>
              </label>
              <label className="field"><span className="label">Fecha Inicio SST</span><input className="input" type="date" value={toInputDate(profile.sstStartDate)} onChange={(e) => { updateField('sstStartDate', e.target.value); void handleUpdate({ sstStartDate: e.target.value }); }} /></label>
            </div>
            <label className="field"><span className="label">Estado de Implementación</span>
              <select className="input" value={profile.implementationStatus || ''} onChange={(e) => { updateField('implementationStatus', e.target.value); void handleUpdate({ implementationStatus: e.target.value }); }}>
                <option value="">Seleccionar</option>
                {IMPLEMENTATION_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o === 'Not Started' ? 'No iniciado' : o === 'Initial Stage' ? 'Etapa inicial' : o === 'In Progress' ? 'En progreso' : o === 'Implemented' ? 'Implementado' : 'Maduro'}</option>)}
              </select>
            </label>

            {/* Legal Representative Configuration */}
            <div className="field" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={profile.managerActsAsLegalRepresentative !== false}
                  onChange={(e) => { updateField('managerActsAsLegalRepresentative', e.target.checked); void handleUpdate({ managerActsAsLegalRepresentative: e.target.checked }); }}
                  style={{ marginTop: '.25rem', transform: 'scale(1.2)' }}
                />
                <div>
                  <strong>☑ El usuario MANAGER actúa como Representante Legal</strong>
                  <p className="muted" style={{ margin: '.25rem 0 0', fontSize: '.82rem' }}>
                    Cuando esta opción está activa, la aprobación realizada por Gerencia también se considera la firma del Representante Legal.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* ============ TAB 4: WORK CENTERS ============ */}
      {tab === 'workcenters' && (
        <section className="advanced-management__section">
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <h3>Centros de Trabajo</h3>
          </div>
          <div className="form-grid" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="grid grid-3">
              <label className="field"><span className="label">Nombre *</span><input className="input" value={newWc.name} onChange={(e) => setNewWc({ ...newWc, name: e.target.value })} placeholder="Centro principal" /></label>
              <label className="field"><span className="label">Dirección</span><input className="input" value={newWc.address} onChange={(e) => setNewWc({ ...newWc, address: e.target.value })} /></label>
              <label className="field"><span className="label">Ciudad</span><input className="input" value={newWc.city} onChange={(e) => setNewWc({ ...newWc, city: e.target.value })} /></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">Nivel Riesgo</span><select className="input" value={newWc.riskLevel} onChange={(e) => setNewWc({ ...newWc, riskLevel: e.target.value })}><option value="">Seleccionar</option>{RISK_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>Clase {o}</option>)}</select></label>
              <label className="field"><span className="label">Empleados</span><input className="input" type="number" min={0} value={newWc.employeeCount} onChange={(e) => setNewWc({ ...newWc, employeeCount: parseInt(e.target.value) || 0 })} /></label>
              <Button type="button" onClick={handleAddWorkCenter}>+ Agregar</Button>
            </div>
          </div>
          <div className="grid grid-2" style={{ gap: 8 }}>
            {profile.workCenters.map((wc, idx) => (
              <article key={idx} className="advanced-doc-card">
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <strong>{wc.name}</strong>
                  <span className={`doc-type-badge ${wc.active ? 'doc-type-badge--policy' : 'doc-type-badge--default'}`}>{wc.active ? 'Activo' : 'Inactivo'}</span>
                </div>
                <p className="muted">{wc.address ? `${wc.address}, ` : ''}{wc.city || ''} · Riesgo: {wc.riskLevel || 'N/A'} · {wc.employeeCount} empleados</p>
                <div className="actions">
                  <Button type="button" variant="danger" onClick={() => handleRemoveWorkCenter(idx)}>Eliminar</Button>
                </div>
              </article>
            ))}
            {!profile.workCenters.length && <p className="empty-state">No hay centros de trabajo registrados.</p>}
          </div>
        </section>
      )}

      {/* ============ TAB 5: CONTACTS ============ */}
      {tab === 'contacts' && (
        <section className="advanced-management__section">
          <h3>Contactos</h3>
          <div className="form-grid" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="grid grid-2">
              <label className="field"><span className="label">Tipo *</span>
                <select className="input" value={newContact.type} onChange={(e) => setNewContact({ ...newContact, type: e.target.value })}>
                  <option value="">Seleccionar</option>
                  {CONTACT_TYPES.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                </select>
              </label>
              <label className="field"><span className="label">Nombre *</span><input className="input" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} /></label>
            </div>
            <div className="grid grid-3">
              <label className="field"><span className="label">Cargo</span><input className="input" value={newContact.position} onChange={(e) => setNewContact({ ...newContact, position: e.target.value })} /></label>
              <label className="field"><span className="label">Teléfono</span><input className="input" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} /></label>
              <label className="field"><span className="label">Email</span><input className="input" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} /></label>
            </div>
            <Button type="button" onClick={handleUpsertContact}>Guardar Contacto</Button>
          </div>
          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Tipo</th><th>Nombre</th><th>Cargo</th><th>Teléfono</th><th>Email</th></tr></thead>
              <tbody>
                {profile.contacts.map((c, idx) => (
                  <tr key={idx}>
                    <td><span className="doc-type-badge doc-type-badge--default">{CONTACT_TYPES.find((ct) => ct.value === c.type)?.label || c.type}</span></td>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.position || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!profile.contacts.length && <p className="empty-state">No hay contactos registrados.</p>}
        </section>
      )}

      {/* ============ TAB 6: DOCUMENTS ============ */}
      {tab === 'documents' && (
        <section className="advanced-management__section">
          <h3>Documentos Empresa</h3>
          <p className="muted">Estos documentos se integran con el Sistema de Gestión Documental.</p>
          <div className="form-grid" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="grid grid-3">
              <label className="field"><span className="label">Tipo *</span>
                <select className="input" value={newDoc.type} onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value })}>
                  <option value="">Seleccionar</option>
                  {DOCUMENT_TYPES.map((dt) => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                </select>
              </label>
              <label className="field"><span className="label">Nombre *</span><input className="input" value={newDoc.name} onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })} placeholder="Nombre del documento" /></label>
              <label className="field"><span className="label">URL (opcional)</span><input className="input" value={newDoc.fileUrl} onChange={(e) => setNewDoc({ ...newDoc, fileUrl: e.target.value })} placeholder="https://..." /></label>
            </div>
            <Button type="button" onClick={handleAddDocument}>+ Registrar Documento</Button>
          </div>
          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Tipo</th><th>Nombre</th><th>Verificado</th><th>Fecha</th><th>Acciones</th></tr></thead>
              <tbody>
                {profile.companyDocuments.map((d, idx) => (
                  <tr key={idx}>
                    <td><span className="doc-type-badge doc-type-badge--default">{DOCUMENT_TYPES.find((dt) => dt.value === d.type)?.label || d.type}</span></td>
                    <td>{d.fileUrl ? <a href={d.fileUrl} target="_blank" rel="noreferrer">{d.name}</a> : d.name}</td>
                    <td>{d.isVerified ? '✅ Sí' : '❌ No'}</td>
                    <td>{d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : '—'}</td>
                    <td><Button type="button" variant="danger" onClick={() => handleRemoveDocument(idx)}>Eliminar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!profile.companyDocuments.length && <p className="empty-state">No hay documentos registrados. Se integrarán con el sistema de gestión documental.</p>}
        </section>
      )}

      {/* ============ TAB 7: HISTORY ============ */}
      {tab === 'history' && (
        <section className="advanced-management__section">
          <h3>Historial de Cambios</h3>
          <div className="timeline">
            {profile.history.slice().reverse().map((entry, idx) => (
              <article key={idx} className="timeline__item">
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <strong>{entry.action === 'UPDATE' ? 'Actualización' : entry.action === 'CREATE' ? 'Creación' : entry.action === 'DELETE' ? 'Eliminación' : entry.action}</strong>
                  <small className="muted">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</small>
                </div>
                <p className="muted">Campo: <strong>{entry.field}</strong></p>
                {entry.userEmail && <small className="muted">Usuario: {entry.userEmail}</small>}
                {entry.previousValue && entry.previousValue !== 'undefined' && entry.previousValue !== '""' && (
                  <small className="advanced-management__audit-warning" style={{ display: 'block' }}>Anterior: {entry.previousValue}</small>
                )}
                {entry.newValue && entry.newValue !== 'undefined' && entry.newValue !== '""' && (
                  <small className="advanced-management__success" style={{ display: 'block' }}>Nuevo: {entry.newValue}</small>
                )}
              </article>
            ))}
          </div>
          {!profile.history.length && <p className="empty-state">No hay cambios registrados aún.</p>}
        </section>
      )}

      <div className="advanced-management__footer">
        <span className="muted">Última actualización: {profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : '—'}</span>
        <Button type="button" variant="ghost" onClick={() => void load()}>Recargar</Button>
      </div>
    </div>
  );
}
