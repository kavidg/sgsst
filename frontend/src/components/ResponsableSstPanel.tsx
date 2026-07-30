import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EmployeeModel,
  ResponsableSstAdvancedModel,
  ResponsableSstComplianceStatus,
  ResponsableSstDocumentType,
  fetchResponsableSstAdvanced,
  updateResponsableSstAdvanced,
  uploadResponsableSstDocument,
  modifyLicenseOcr,
  fetchEmployees,
  fetchCompanyProfile,
  WorkCenterModel,
} from '../api';
import { Button } from './ui/Button';

const SST_LICENSE_TYPES = ['Tecnólogo SST', 'Profesional SST', 'Especialista SST', 'Consultor SST', 'Otra'] as const;
const SST_PROFESSIONAL_TYPES = ['Profesional SST', 'Tecnólogo SST', 'Técnico SST', 'Estudiante', 'Otro'] as const;
const DOCUMENT_TYPES: Array<{ type: ResponsableSstDocumentType; label: string; accept: string }> = [
  { type: 'DIPLOMA', label: '📜 Diploma', accept: '.pdf,image/*,.doc,.docx' },
  { type: 'FIFTY_HOUR_CERTIFICATE', label: '📄 Certificado curso 50 horas', accept: '.pdf,image/*,.doc,.docx' },
  { type: 'TWENTY_HOUR_UPDATE_CERTIFICATE', label: '📄 Certificado actualización 20 horas', accept: '.pdf,image/*,.doc,.docx' },
  { type: 'SST_LICENSE_PDF', label: '📋 Licencia SST (PDF)', accept: '.pdf' },
  { type: 'SST_LICENSE_SCANNED', label: '🖼 Licencia SST (Escaneo)', accept: 'image/*,.pdf' },
  { type: 'SST_LICENSE_RESOLUTION', label: '📑 Resolución', accept: '.pdf,image/*,.doc,.docx' },
  { type: 'SST_LICENSE_SUPPORTING', label: '📎 Soportes adicionales', accept: '.pdf,image/*,.doc,.docx,.xls,.xlsx' },
];

function toDateInputValue(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function statusBadgeClass(status?: string) {
  if (status === 'Vigente') return 'badge badge--success';
  if (status === 'Vencida' || status === 'Vencido') return 'badge badge--danger';
  if (status === 'Próxima a vencer') return 'badge badge--warning';
  return 'badge badge--warning';
}

function complianceBadge(status?: ResponsableSstComplianceStatus) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'badge badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'badge badge--danger' };
  return { label: '⚠ Pendiente', className: 'badge badge--warning' };
}

function detectDateFromFileName(fileName: string) {
  const normalized = fileName.replace(/_/g, '-');
  const iso = normalized.match(/(20\d{2}|19\d{2})[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const latam = normalized.match(/(0?[1-9]|[12]\d|3[01])[-./](0?[1-9]|1[0-2])[-./](20\d{2}|19\d{2})/);
  if (latam) return `${latam[3]}-${latam[2].padStart(2, '0')}-${latam[1].padStart(2, '0')}`;
  return '';
}

export function ResponsableSstPanel({
  token,
  readOnly,
  onComplianceChange,
  onDirtyChange,
  saveRequest,
  discardRequest,
  onSaved,
}: {
  token: string;
  readOnly?: boolean;
  onComplianceChange: (status: ResponsableSstComplianceStatus) => void;
  onDirtyChange: (dirty: boolean) => void;
  saveRequest: number;
  discardRequest: number;
  onSaved: () => void;
}) {
  const tabs = ['Responsable', 'Formación', 'Licencia SST', 'Designación', 'Alertas', 'Historial'];
  const [tab, setTab] = useState(tabs[0]);
  const [record, setRecord] = useState<ResponsableSstAdvancedModel | null>(null);
  const [_employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenterModel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState('');
  const [error, setError] = useState('');
  const [selectedDocumentType, setSelectedDocumentType] = useState<ResponsableSstDocumentType>('SST_LICENSE_PDF');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrIndex, setOcrIndex] = useState(0);
  const [ocrOverride, setOcrOverride] = useState({ licenseNumber: '', issueDate: '', expirationDate: '', issuingAuthority: '' });
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const notify = (message: string) => { setNotification(message); window.setTimeout(() => setNotification(''), 3000); };

  const markDirty = () => { setDirty(true); setError(''); };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [result, workerList, profile] = await Promise.all([
        fetchResponsableSstAdvanced(token),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
        fetchCompanyProfile(token).catch(() => null),
      ]);
      if (profile?.workCenters) {
        setWorkCenters(profile.workCenters.filter((wc) => wc.active));
      }
      setRecord(result);
      setEmployees(workerList);
      // Auto-detect OCR index
      if (result.licenseOcrEntries?.length) {
        setOcrIndex(result.licenseOcrEntries.length - 1);
      }
      onComplianceChange(result.complianceStatus);
      setDirty(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el responsable SST.');
    } finally {
      setLoading(false);
    }
  }, [onComplianceChange, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (saveRequest > 0) void saveForm();
  }, [saveRequest]);

  useEffect(() => {
    if (discardRequest > 0) { setDirty(false); void load(); }
  }, [discardRequest, load]);

  const updateField = (field: string, value: string) => {
    if (!record) return;
    setRecord({ ...record, [field]: value });
    markDirty();
  };

  const saveForm = async () => {
    if (!record || !token) return;
    setLoading(true);
    setError('');
    try {
      const saved = await updateResponsableSstAdvanced(token, {
        fullName: record.fullName,
        documentNumber: record.documentNumber,
        position: record.position,
        profession: record.profession,
        sstProfessionalType: record.sstProfessionalType,
        sstLicenseNumber: record.sstLicenseNumber,
        licenseType: record.licenseType,
        issuingAuthority: record.issuingAuthority,
        department: record.department,
        observations: record.observations,
        licenseIssueDate: toDateInputValue(record.licenseIssueDate),
        licenseExpiresAt: toDateInputValue(record.licenseExpiresAt),
        course50HoursDate: toDateInputValue(record.course50HoursDate),
        course50HoursDetectedDate: toDateInputValue(record.course50HoursDetectedDate),
        course20HoursDate: toDateInputValue(record.course20HoursDate),
      });
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setDirty(false);
      notify('Cambios guardados correctamente.');
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar.');
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async () => {
    if (!selectedFile || !token || !record) return;
    setLoading(true);
    setError('');
    try {
      const detectedDate = detectDateFromFileName(selectedFile.name);
      const saved = await uploadResponsableSstDocument(token, {
        type: selectedDocumentType,
        file: selectedFile,
        ...(detectedDate ? { finalUserDate: detectedDate } : {}),
      });
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setSelectedFile(null);
      setSelectedDocumentType('SST_LICENSE_PDF');
      notify(`Documento "${selectedFile.name}" cargado exitosamente.`);
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo cargar el documento.');
    } finally {
      setLoading(false);
    }
  };

  const handleOcrModify = async () => {
    if (!token || !record || !record.licenseOcrEntries?.[ocrIndex]) return;
    setLoading(true);
    setError('');
    try {
      const saved = await modifyLicenseOcr(token, {
        ocrIndex,
        licenseNumber: ocrOverride.licenseNumber || undefined,
        issueDate: ocrOverride.issueDate || undefined,
        expirationDate: ocrOverride.expirationDate || undefined,
        issuingAuthority: ocrOverride.issuingAuthority || undefined,
      });
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setOcrOverride({ licenseNumber: '', issueDate: '', expirationDate: '', issuingAuthority: '' });
      notify('Valores OCR modificados correctamente. Se notificó a administradores.');
      await load();
    } catch (modifyError) {
      setError(modifyError instanceof Error ? modifyError.message : 'No se pudo modificar OCR.');
    } finally {
      setLoading(false);
    }
  };

  const badge = complianceBadge(record?.complianceStatus);
  const latestOcrEntry = record?.licenseOcrEntries?.[ocrIndex];

  if (loading && !record) return <p className="muted">Cargando gestión del responsable SG-SST...</p>;
  if (!record) return <div className="advanced-management"><p className="muted">{error || 'No hay datos disponibles.'}</p></div>;

  const requiresLicenseDoc = ['Tecnólogo SST', 'Profesional SST', 'Especialista SST'].includes(record.licenseType);
  const hasLicenseDoc = record.documents.some((doc) => doc.type === 'SST_LICENSE_PDF' || doc.type === 'SST_LICENSE_SCANNED');
  const daysUntilExpiry = record.licenseExpiresAt
    ? Math.ceil((new Date(record.licenseExpiresAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const licenseStatus = record.licenseStatus || (daysUntilExpiry !== null ? (daysUntilExpiry <= 0 ? 'Vencida' : daysUntilExpiry <= 30 ? 'Próxima a vencer' : 'Vigente') : 'Pendiente');

  return (
    <div className="advanced-management advanced-management--responsable-sst">
      {notification ? <div className="toast-alert" style={{ marginBottom: '1rem' }}><strong>✓</strong> {notification}</div> : null}
      {error ? <p className="error">{error}</p> : null}

      {/* Header */}
      <section className="advanced-management__hero">
        <div>
          <p className="muted">Estándar 1.1.1 · Responsable del SG-SST</p>
          <h3>{record.fullName || 'Sin responsable asignado'}</h3>
          <p className="muted">{record.complianceReason || 'Complete la información requerida para calcular el cumplimiento.'}</p>
        </div>
        <div className="actions" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className={badge.className}>{badge.label}</span>
          <span className={statusBadgeClass(licenseStatus)}>{licenseStatus === 'Vigente' ? '✅' : licenseStatus === 'Vencida' ? '❌' : '⚠'} Licencia: {licenseStatus}</span>
        </div>
      </section>

      {/* Tabs */}
      <div className="advanced-tabs" role="tablist" style={{ marginBottom: '1rem' }}>
        {tabs.map((name) => (
          <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>
            {name === 'Licencia SST' ? '🪪 ' : name === 'Alertas' ? '🔔 ' : name === 'Historial' ? '🕓 ' : ''}{name}
          </Button>
        ))}
      </div>

      {/* ===================== TAB 1: RESPONSABLE ===================== */}
      {tab === 'Responsable' ? (
        <section className="advanced-management__section">
          <h3>Información del Responsable SST</h3>
          <div className="form-grid">
            <label className="field"><span className="label">Nombre completo *</span>
              <input className="input" disabled={readOnly} value={record.fullName} onChange={(e) => updateField('fullName', e.target.value)} placeholder="Nombre del responsable SST" />
            </label>
            <label className="field"><span className="label">Número documento *</span>
              <input className="input" disabled={readOnly} value={record.documentNumber} onChange={(e) => updateField('documentNumber', e.target.value)} placeholder="CC / NIT" />
            </label>
            <label className="field"><span className="label">Cargo *</span>
              <input className="input" disabled={readOnly} value={record.position} onChange={(e) => updateField('position', e.target.value)} placeholder="Ej: Coordinador SST" />
            </label>
            <label className="field"><span className="label">Profesión *</span>
              <input className="input" disabled={readOnly} value={record.profession} onChange={(e) => updateField('profession', e.target.value)} placeholder="Ej: Ingeniero Industrial" />
            </label>
            <label className="field"><span className="label">Tipo profesional SST *</span>
              <select className="input" disabled={readOnly} value={record.sstProfessionalType} onChange={(e) => updateField('sstProfessionalType', e.target.value)}>
                <option value="">Seleccionar...</option>
                {SST_PROFESSIONAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Centro de trabajo / Sede</span>
              <select className="input" disabled={readOnly} value={workCenters.length > 0 ? record.department : 'Sede Principal'} onChange={(e) => updateField('department', e.target.value)}>
                {workCenters.length > 0 ? (
                  workCenters.map((wc) => (
                    <option key={wc.name} value={wc.name}>{wc.name}</option>
                  ))
                ) : (
                  <option value="Sede Principal">Sede Principal</option>
                )}
              </select>
              {workCenters.length === 0 ? (
                <small className="muted" style={{ display: 'block', marginTop: 4 }}>No existen Centros de Trabajo configurados. Se utilizará 'Sede Principal' por defecto.</small>
              ) : null}
            </label>
            <label className="field"><span className="label">Observaciones</span>
              <textarea className="input" disabled={readOnly} value={record.observations} onChange={(e) => updateField('observations', e.target.value)} rows={3} placeholder="Observaciones adicionales" />
            </label>
          </div>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <Button type="button" disabled={readOnly || loading} onClick={() => void saveForm()}>Guardar información</Button>
          </div>
        </section>
      ) : null}

      {/* ===================== TAB 2: FORMACIÓN ===================== */}
      {tab === 'Formación' ? (
        <section className="advanced-management__section">
          <h3>Cursos y Formación SST</h3>
          <div className="form-grid">
            <label className="field"><span className="label">Fecha curso 50 horas *</span>
              <input type="date" className="input" disabled={readOnly} value={toDateInputValue(record.course50HoursDate)} onChange={(e) => { updateField('course50HoursDate', e.target.value); }} />
            </label>
            <label className="field"><span className="label">Fecha detectada (OCR)</span>
              <input type="date" className="input" value={toDateInputValue(record.course50HoursDetectedDate)} disabled readOnly />
              <small className="muted">Detectada automáticamente del certificado cargado</small>
            </label>
            {record.requires20HourUpdate ? (
              <label className="field"><span className="label">Fecha curso 20 horas (requerido) *</span>
                <input type="date" className="input" disabled={readOnly} value={toDateInputValue(record.course20HoursDate)} onChange={(e) => updateField('course20HoursDate', e.target.value)} />
                <small className="advanced-management__audit-warning">Curso de 50 horas supera 3 años, requiere actualización de 20 horas</small>
              </label>
            ) : (
              <label className="field"><span className="label">Fecha curso 20 horas</span>
                <input type="date" className="input" disabled={readOnly} value={toDateInputValue(record.course20HoursDate)} onChange={(e) => updateField('course20HoursDate', e.target.value)} />
              </label>
            )}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            <Button type="button" variant="secondary" disabled={readOnly || loading} onClick={() => void saveForm()}>
              Guardar formación
            </Button>
          </div>
        </section>
      ) : null}

      {/* ===================== TAB 3: LICENCIA SST ===================== */}
      {tab === 'Licencia SST' ? (
        <section className="advanced-management__section">
          <h3>🪪 Licencia SST</h3>
          <p className="muted">Gestión completa de la licencia de seguridad y salud en el trabajo.</p>

          {/* License Status Summary */}
          <div className="advanced-doc-grid" style={{ marginBottom: '1rem' }}>
            <article className="advanced-doc-card">
              <strong>Estado</strong>
              <span className={statusBadgeClass(licenseStatus)} style={{ display: 'inline-block', marginTop: 4 }}>
                {licenseStatus === 'Vigente' ? '✅ Vigente' : licenseStatus === 'Vencida' ? '❌ Vencida' : '⚠ ' + licenseStatus}
              </span>
            </article>
            <article className="advanced-doc-card">
              <strong>Días restantes</strong>
              <span>{daysUntilExpiry !== null ? daysUntilExpiry > 0 ? `${daysUntilExpiry} días` : 'Vencida' : 'Sin fecha'}</span>
            </article>
            <article className="advanced-doc-card">
              <strong>Tipo licencia</strong>
              <span>{record.licenseType || 'No definido'}</span>
            </article>
            <article className="advanced-doc-card">
              <strong>Documento requerido</strong>
              <span>{requiresLicenseDoc ? (hasLicenseDoc ? '✅ Cargado' : '❌ Pendiente') : 'No requerido'}</span>
            </article>
          </div>

          {/* License Form */}
          <div className="form-grid">
            <label className="field"><span className="label">Número de licencia *</span>
              <input className="input" disabled={readOnly} value={record.sstLicenseNumber} onChange={(e) => updateField('sstLicenseNumber', e.target.value)} placeholder="Número de licencia SST" />
            </label>
            <label className="field"><span className="label">Tipo de licencia *</span>
              <select className="input" disabled={readOnly} value={record.licenseType} onChange={(e) => updateField('licenseType', e.target.value)}>
                <option value="">Seleccionar tipo...</option>
                {SST_LICENSE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Autoridad emisora</span>
              <input className="input" disabled={readOnly} value={record.issuingAuthority} onChange={(e) => updateField('issuingAuthority', e.target.value)} placeholder="Ej: Ministerio de Trabajo" />
            </label>
            <label className="field"><span className="label">Fecha de expedición *</span>
              <input type="date" className="input" disabled={readOnly} value={toDateInputValue(record.licenseIssueDate)} onChange={(e) => updateField('licenseIssueDate', e.target.value)} />
            </label>
            <label className="field"><span className="label">Fecha de vencimiento *</span>
              <input type="date" className="input" disabled={readOnly} value={toDateInputValue(record.licenseExpiresAt)} onChange={(e) => updateField('licenseExpiresAt', e.target.value)} />
            </label>
            <label className="field"><span className="label">Observaciones</span>
              <textarea className="input" disabled={readOnly} value={record.observations} onChange={(e) => updateField('observations', e.target.value)} rows={2} placeholder="Observaciones de la licencia" />
            </label>
          </div>

          <div className="actions" style={{ marginTop: '1rem' }}>
            <Button type="button" disabled={readOnly || loading} onClick={() => void saveForm()}>Guardar licencia</Button>
          </div>

          {/* Document Upload */}
          <h4 style={{ marginTop: '1.5rem' }}>Documentos de la Licencia SST</h4>
          <p className="muted">Cargue los documentos de soporte de la licencia. Los documentos PDF e imágenes serán procesados por OCR.</p>
          <div className="form-grid" style={{ marginTop: '0.5rem' }}>
            <label className="field">
              <span className="label">Tipo de documento</span>
              <select className="input" value={selectedDocumentType} onChange={(e) => setSelectedDocumentType(e.target.value as ResponsableSstDocumentType)}>
                {DOCUMENT_TYPES.filter((dt) => dt.type.startsWith('SST_LICENSE')).map((dt) => (
                  <option key={dt.type} value={dt.type}>{dt.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Archivo</span>
              <input
                type="file"
                className="input"
                accept={DOCUMENT_TYPES.find((dt) => dt.type === selectedDocumentType)?.accept || '.pdf,image/*'}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              {selectedFile ? <small className="muted">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</small> : null}
            </label>
          </div>
          <Button type="button" disabled={readOnly || loading || !selectedFile} onClick={() => void uploadDocument()}>
            {loading ? 'Cargando...' : 'Subir documento'}
          </Button>

          {/* Documents List */}
          {record.documents.filter((doc) => doc.type.startsWith('SST_LICENSE')).length > 0 ? (
            <div className="advanced-doc-grid" style={{ marginTop: '1rem' }}>
              {record.documents.filter((doc) => doc.type.startsWith('SST_LICENSE')).map((doc) => (
                <article key={`${doc.type}-${doc.fileName}`} className="advanced-doc-card">
                  <strong>{DOCUMENT_TYPES.find((dt) => dt.type === doc.type)?.label || doc.type}</strong>
                  <p className="muted">{doc.fileName} · {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : ''}</p>
                  {doc.detectedDate ? <small className="muted">Fecha detectada: {toDateInputValue(doc.detectedDate)}</small> : null}
                  <div className="actions" style={{ marginTop: 4 }}>
                    <a className="btn btn-secondary btn-sm" href={doc.fileUrl} target="_blank" rel="noreferrer">Previsualizar</a>
                    <a className="btn btn-ghost btn-sm" href={doc.fileUrl} download={doc.fileName}>Descargar</a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state" style={{ marginTop: '1rem' }}>No hay documentos de licencia cargados.</p>
          )}

          {/* OCR Section */}
          {record.licenseOcrEntries && record.licenseOcrEntries.length > 0 && (
            <section className="advanced-management__section advanced-management__related" style={{ marginTop: '1.5rem' }}>
              <h4>🤖 OCR - Valores detectados automáticamente</h4>
              <div className="form-grid">
                <label className="field"><span className="label">Índice OCR</span>
                  <select className="input" value={ocrIndex} onChange={(e) => setOcrIndex(Number(e.target.value))}>
                    {record.licenseOcrEntries.map((_, idx) => (
                      <option key={idx} value={idx}>Entrada #{idx + 1}</option>
                    ))}
                  </select>
                </label>
              </div>

              {latestOcrEntry && (
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Campo</th>
                        <th>Valor detectado (OCR)</th>
                        <th>Valor modificado</th>
                        <th>Nuevo valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Número licencia</td>
                        <td>{latestOcrEntry.detectedLicenseNumber || '—'}</td>
                        <td>{latestOcrEntry.modifiedLicenseNumber || '—'}</td>
                        <td><input className="input" size={12} value={ocrOverride.licenseNumber} onChange={(e) => setOcrOverride({ ...ocrOverride, licenseNumber: e.target.value })} placeholder="Nuevo valor" /></td>
                      </tr>
                      <tr>
                        <td>Fecha expedición</td>
                        <td>{toDateInputValue(latestOcrEntry.detectedIssueDate) || '—'}</td>
                        <td>{toDateInputValue(latestOcrEntry.modifiedIssueDate) || '—'}</td>
                        <td><input type="date" className="input" value={ocrOverride.issueDate} onChange={(e) => setOcrOverride({ ...ocrOverride, issueDate: e.target.value })} /></td>
                      </tr>
                      <tr>
                        <td>Fecha vencimiento</td>
                        <td>{toDateInputValue(latestOcrEntry.detectedExpirationDate) || '—'}</td>
                        <td>{toDateInputValue(latestOcrEntry.modifiedExpirationDate) || '—'}</td>
                        <td><input type="date" className="input" value={ocrOverride.expirationDate} onChange={(e) => setOcrOverride({ ...ocrOverride, expirationDate: e.target.value })} /></td>
                      </tr>
                      <tr>
                        <td>Autoridad emisora</td>
                        <td>{latestOcrEntry.detectedIssuingAuthority || '—'}</td>
                        <td>{latestOcrEntry.modifiedIssuingAuthority || '—'}</td>
                        <td><input className="input" size={16} value={ocrOverride.issuingAuthority} onChange={(e) => setOcrOverride({ ...ocrOverride, issuingAuthority: e.target.value })} placeholder="Nueva autoridad" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {latestOcrEntry?.hasManualModification ? (
                <p className="advanced-management__audit-warning">
                  ⚠ Los valores OCR han sido modificados manualmente. Se ha notificado a administradores y gerentes.
                </p>
              ) : (
                <p className="muted" style={{ marginTop: 8 }}>
                  Confianza OCR: {latestOcrEntry ? `${Math.round((latestOcrEntry.confidence ?? 0) * 100)}%` : '—'}
                  · Fuente: {latestOcrEntry?.sourceFileName || '—'}
                </p>
              )}

              <div className="actions" style={{ marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" disabled={readOnly || loading || !Object.values(ocrOverride).some(Boolean)} onClick={() => void handleOcrModify()}>
                  Aplicar modificación OCR
                </Button>
              </div>
            </section>
          )}
        </section>
      ) : null}

      {/* ===================== TAB 4: DESIGNACIÓN ===================== */}
      {tab === 'Designación' ? (
        <section className="advanced-management__section">
          <h3>Designación del Responsable SST</h3>
          <p className="muted">Documento formal de designación del responsable del SG-SST.</p>
          <div className="form-grid">
            <label className="field"><span className="label">Nombre del designado</span>
              <input className="input" disabled readOnly value={record.fullName || '—'} />
            </label>
            <label className="field"><span className="label">Cargo</span>
              <input className="input" disabled readOnly value={record.position || '—'} />
            </label>
            <label className="field"><span className="label">Tipo profesional</span>
              <input className="input" disabled readOnly value={record.sstProfessionalType || '—'} />
            </label>
          </div>
          <h4 style={{ marginTop: '1.5rem' }}>Documentos de designación</h4>
          {DOCUMENT_TYPES.filter((dt) => !dt.type.startsWith('SST_LICENSE')).map((dt) => {
            const existingDoc = record.documents.find((d) => d.type === dt.type);
            return (
              <div key={dt.type} style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                <strong>{dt.label}</strong>
                {existingDoc ? (
                  <div style={{ marginTop: 4 }}>
                    <span className="muted">{existingDoc.fileName}</span>
                    <div className="actions" style={{ marginTop: 4 }}>
                      <a className="btn btn-secondary btn-sm" href={existingDoc.fileUrl} target="_blank" rel="noreferrer">Ver</a>
                      <a className="btn btn-ghost btn-sm" href={existingDoc.fileUrl} download={existingDoc.fileName}>Descargar</a>
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ marginTop: 4 }}>No cargado</p>
                )}
              </div>
            );
          })}
          <div className="form-grid" style={{ marginTop: '1rem' }}>
            <label className="field"><span className="label">Tipo de documento</span>
              <select className="input" value={selectedDocumentType} onChange={(e) => setSelectedDocumentType(e.target.value as ResponsableSstDocumentType)}>
                {DOCUMENT_TYPES.filter((dt) => !dt.type.startsWith('SST_LICENSE')).map((dt) => (
                  <option key={dt.type} value={dt.type}>{dt.label}</option>
                ))}
              </select>
            </label>
            <label className="field"><span className="label">Archivo</span>
              <input type="file" className="input" accept={DOCUMENT_TYPES.find((dt) => dt.type === selectedDocumentType)?.accept || '.pdf,image/*'} onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Button type="button" disabled={readOnly || loading || !selectedFile} onClick={() => void uploadDocument()}>
            {loading ? 'Cargando...' : 'Subir documento'}
          </Button>
        </section>
      ) : null}

      {/* ===================== TAB 5: ALERTAS ===================== */}
      {tab === 'Alertas' ? (
        <section className="advanced-management__section">
          <h3>🔔 Alertas generadas</h3>
          {record.alerts.length > 0 ? (
            <div className="advanced-list">
              {record.alerts.map((alert, idx) => (
                <article key={`${alert.type}-${idx}`} className="advanced-list__item">
                  <span className={
                    alert.severity === 'HIGH' ? 'badge badge--danger' :
                    alert.severity === 'MEDIUM' ? 'badge badge--warning' : 'badge badge--success'
                  }>
                    {alert.severity}
                  </span>
                  <strong>{alert.type}</strong>
                  <p>{alert.message}</p>
                  <small className="muted">
                    Vence: {alert.dueAt ? new Date(alert.dueAt).toLocaleDateString() : '—'}
                    · Estado: {alert.generated ? 'Generada' : 'Pendiente'}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No hay alertas generadas para el responsable SST.</p>
          )}
        </section>
      ) : null}

      {/* ===================== TAB 6: HISTORIAL ===================== */}
      {tab === 'Historial' ? (
        <section className="advanced-management__section">
          <h3>🕓 Historial de auditoría</h3>
          {record.auditHistory.length > 0 ? (
            <div className="timeline">
              {record.auditHistory.slice().reverse().map((entry, idx) => (
                <article key={idx} className="timeline__item">
                  <strong>{entry.field}</strong>
                  <p>
                    {entry.oldValue ? `"${entry.oldValue}" → ` : ''}
                    {entry.newValue ? `"${entry.newValue}"` : ''}
                    {entry.warning ? <span className="advanced-management__audit-warning"> ⚠ {entry.warning}</span> : null}
                  </p>
                  <small className="muted">
                    {entry.userEmail || 'Sistema'} · {new Date(entry.changedAt).toLocaleString()}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No hay movimientos registrados todavía.</p>
          )}
        </section>
      ) : null}

      {/* Footer */}
      <div className="advanced-management__footer">
        <span className={dirty ? 'advanced-management__dirty' : 'muted'}>
          {dirty ? '💾 Cambios sin guardar' : '✓ Sin cambios pendientes'}
        </span>
        <div className="actions">
          <Button type="button" disabled={readOnly || loading} onClick={() => void saveForm()}>
            {loading ? 'Guardando...' : 'Guardar todos los cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ResponsableSstPanel;
