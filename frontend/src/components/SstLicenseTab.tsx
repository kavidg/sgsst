import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from './ui/Button';
import {
  ResponsableSstAdvancedModel,
  ResponsableSstDocumentType,
  fetchResponsableSstAdvanced,
  updateResponsableSstAdvanced,
  uploadResponsableSstDocument,
  modifyLicenseOcr,
} from '../api';

const LICENSE_TYPES = ['Tecnólogo SST', 'Profesional SST', 'Especialista SST', 'Consultor SST', 'Otra'] as const;

const LICENSE_DOC_LABELS: Record<string, string> = {
  SST_LICENSE_PDF: 'Licencia SST (PDF)',
  SST_LICENSE_SCANNED: 'Licencia escaneada',
  SST_LICENSE_RESOLUTION: 'Documento resolución',
  SST_LICENSE_SUPPORTING: 'Soportes adicionales',
};

function toDate(value?: string | Date): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function statusBadge(status?: string) {
  if (status === 'Vigente') return { label: '✅ Vigente', className: 'advanced-management__badge advanced-management__badge--success' };
  if (status === 'Próxima a vencer' || status === 'Próximo a vencer') return { label: '⚠ Próxima a vencer', className: 'advanced-management__badge advanced-management__badge--warning' };
  if (status === 'Vencida' || status === 'Vencido') return { label: '❌ Vencida', className: 'advanced-management__badge advanced-management__badge--danger' };
  return { label: '⏳ Pendiente', className: 'advanced-management__badge advanced-management__badge--warning' };
}

export function SstLicenseTab({ token, readOnly }: { token: string; readOnly?: boolean }) {
  const [tab, setTab] = useState('Licencia SST');
  const [record, setRecord] = useState<ResponsableSstAdvancedModel | null>(null);
  const [licenseForm, setLicenseForm] = useState({
    sstLicenseNumber: '',
    licenseType: '',
    issuingAuthority: '',
    department: '',
    observations: '',
    licenseIssueDate: '',
    licenseExpiresAt: '',
  });
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [ocrModifications, setOcrModifications] = useState<Record<string, string>>({});

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchResponsableSstAdvanced(token);
      setRecord(data);
      setLicenseForm({
        sstLicenseNumber: data.sstLicenseNumber || '',
        licenseType: data.licenseType || '',
        issuingAuthority: data.issuingAuthority || '',
        department: data.department || '',
        observations: data.observations || '',
        licenseIssueDate: toDate(data.licenseIssueDate),
        licenseExpiresAt: toDate(data.licenseExpiresAt),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar licencia SST');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const latestOcr = useMemo(() => {
    if (!record?.licenseOcrEntries?.length) return null;
    return record.licenseOcrEntries[record.licenseOcrEntries.length - 1];
  }, [record]);

  const handleFormChange = (field: string, value: string) => {
    setLicenseForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const updated = await updateResponsableSstAdvanced(token, {
        fullName: record?.fullName || '',
        documentNumber: record?.documentNumber || '',
        position: record?.position || '',
        profession: record?.profession || '',
        sstProfessionalType: record?.sstProfessionalType || '',
        sstLicenseNumber: licenseForm.sstLicenseNumber,
        licenseType: licenseForm.licenseType,
        issuingAuthority: licenseForm.issuingAuthority,
        department: licenseForm.department,
        observations: licenseForm.observations,
        licenseIssueDate: licenseForm.licenseIssueDate,
        licenseExpiresAt: licenseForm.licenseExpiresAt,
        course50HoursDate: record?.course50HoursDate || '',
      });
      setRecord(updated);
      notify('Datos de licencia guardados correctamente');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar licencia');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (docType: string) => {
    const file = pendingFiles[docType];
    if (!file || !token) return;
    setLoading(true);
    setError('');
    try {
      const ocrLicenseNumber = ocrModifications.licenseNumber || undefined;
      const ocrIssueDate = ocrModifications.issueDate || undefined;
      const ocrExpirationDate = ocrModifications.expirationDate || undefined;
      const ocrIssuingAuthority = ocrModifications.issuingAuthority || undefined;

      const updated = await uploadResponsableSstDocument(token, {
        type: docType as ResponsableSstDocumentType,
        file,
        finalUserDate: undefined,
      });
      setRecord(updated);

      // If OCR data was provided, trigger OCR modification
      if (ocrLicenseNumber || ocrIssueDate || ocrExpirationDate || ocrIssuingAuthority) {
        if (updated.licenseOcrEntries?.length) {
          await modifyLicenseOcr(token, {
            ocrIndex: updated.licenseOcrEntries.length - 1,
            licenseNumber: ocrLicenseNumber,
            issueDate: ocrIssueDate,
            expirationDate: ocrExpirationDate,
            issuingAuthority: ocrIssuingAuthority,
          });
        }
      }

      setPendingFiles((prev) => {
        const next = { ...prev };
        delete next[docType];
        return next;
      });
      setOcrModifications({});
      notify(`Documento "${file.name}" cargado exitosamente`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar documento');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (docType: string, file: File) => {
    setPendingFiles((prev) => ({ ...prev, [docType]: file }));
    // Auto-detect OCR values from filename
    const detectedNumber = file.name.match(/(?:licencia|lic|no\.?|nro\.?)\s*[:#-]?\s*([A-Z0-9-]{6,})/i);
    const detectedDate = file.name.match(/(20\d{2}|19\d{2})[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])/);
    setOcrModifications({
      licenseNumber: detectedNumber?.[1] || '',
      issueDate: detectedDate ? `${detectedDate[1]}-${detectedDate[2].padStart(2, '0')}-${detectedDate[3].padStart(2, '0')}` : '',
      expirationDate: '',
      issuingAuthority: '',
    });
  };

  const remainingDays = useMemo(() => {
    if (!licenseForm.licenseExpiresAt) return null;
    const expDate = new Date(`${licenseForm.licenseExpiresAt}T00:00:00`);
    const now = new Date();
    return Math.ceil((expDate.getTime() - now.getTime()) / 86_400_000);
  }, [licenseForm.licenseExpiresAt]);

  const badge = statusBadge(record?.licenseStatus);

  const tabs = ['Licencia SST', 'Documentos', 'Alertas', 'Historial'];

  if (!record) {
    return <div className="advanced-management"><p className="muted">{loading ? 'Cargando licencia SST...' : 'Sin datos disponibles.'}</p></div>;
  }

  return (
    <div className="advanced-management advanced-management--license">
      <section className="advanced-management__hero">
        <div>
          <p className="muted">Módulo 1.1.1 · Licencia SST</p>
          <h3>Gestión de Licencia SST</h3>
          <p className="muted">
            Responsable: <strong>{record.fullName || 'Sin asignar'}</strong> · 
            Número: <strong>{licenseForm.sstLicenseNumber || '—'}</strong>
          </p>
        </div>
        <div className="actions" style={{ gap: 8 }}>
          <span className={badge.className}>{badge.label}</span>
          {remainingDays !== null && (
            <span className={`advanced-management__badge ${remainingDays <= 0 ? 'advanced-management__badge--danger' : remainingDays <= 30 ? 'advanced-management__badge--warning' : 'advanced-management__badge--success'}`}>
              {remainingDays <= 0 ? 'Vencida' : `${remainingDays} días restantes`}
            </span>
          )}
        </div>
      </section>

      {toast ? <div className="toast-alert advanced-management__toast"><strong>Notificación</strong><p>{toast}</p></div> : null}
      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Procesando...</p> : null}

      <div className="advanced-tabs" role="tablist" style={{ flexWrap: 'wrap' }}>
        {tabs.map((name) => (
          <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>
            {name}
          </Button>
        ))}
      </div>

      {/* ============ TAB: Licencia SST (Form) ============ */}
      {tab === 'Licencia SST' && (
        <section className="advanced-management__section">
          <h3>Datos de la Licencia SST</h3>
          <div className="form-grid">
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Número de Licencia</span>
                <input className="input" disabled={readOnly} value={licenseForm.sstLicenseNumber}
                  onChange={(e) => handleFormChange('sstLicenseNumber', e.target.value)} placeholder="Ej: 12345-SST" />
              </label>
              <label className="field">
                <span className="label">Tipo de Licencia</span>
                <select className="input" disabled={readOnly} value={licenseForm.licenseType}
                  onChange={(e) => handleFormChange('licenseType', e.target.value)}>
                  <option value="">Seleccionar tipo</option>
                  {LICENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Autoridad Emisora</span>
                <input className="input" disabled={readOnly} value={licenseForm.issuingAuthority}
                  onChange={(e) => handleFormChange('issuingAuthority', e.target.value)} placeholder="Ej: Ministerio de Trabajo" />
              </label>
              <label className="field">
                <span className="label">Departamento</span>
                <input className="input" disabled={readOnly} value={licenseForm.department}
                  onChange={(e) => handleFormChange('department', e.target.value)} placeholder="Ej: Antioquia" />
              </label>
            </div>
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Fecha de Expedición</span>
                <input type="date" className="input" disabled={readOnly} value={licenseForm.licenseIssueDate}
                  onChange={(e) => handleFormChange('licenseIssueDate', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Fecha de Vencimiento</span>
                <input type="date" className="input" disabled={readOnly} value={licenseForm.licenseExpiresAt}
                  onChange={(e) => handleFormChange('licenseExpiresAt', e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span className="label">Observaciones</span>
              <textarea className="input" rows={3} disabled={readOnly} value={licenseForm.observations}
                onChange={(e) => handleFormChange('observations', e.target.value)} placeholder="Notas adicionales sobre la licencia..." />
            </label>
          </div>

          {/* License Requirement Rules */}
          {['Tecnólogo SST', 'Profesional SST', 'Especialista SST'].includes(licenseForm.licenseType) && !licenseForm.sstLicenseNumber && (
            <div className="advanced-management__audit-warning" style={{ marginTop: 12, padding: 10 }}>
              ⚠ El tipo de licencia "{licenseForm.licenseType}" requiere un número de licencia SST válido para poder marcar cumplimiento automático.
            </div>
          )}

          {remainingDays !== null && remainingDays <= 90 && remainingDays > 0 && (
            <div className="advanced-management__audit-warning" style={{ marginTop: 8, padding: 10 }}>
              ⚠ La licencia SST vence en {remainingDays} días. Gestione la renovación con anticipación.
            </div>
          )}

          {remainingDays !== null && remainingDays <= 0 && (
            <div className="advanced-management__audit-warning" style={{ marginTop: 8, padding: 10, background: '#fef2f2', borderColor: '#fca5a5' }}>
              ❌ La licencia SST ha vencido. Es necesario renovarla inmediatamente para mantener el cumplimiento normativo.
            </div>
          )}

          <div className="actions" style={{ marginTop: 16 }}>
            <Button type="button" disabled={readOnly || loading} onClick={() => void handleSave()}>
              Guardar datos de licencia
            </Button>
          </div>
        </section>
      )}

      {/* ============ TAB: Documentos ============ */}
      {tab === 'Documentos' && (
        <section className="advanced-management__section">
          <h3>Documentos de la Licencia SST</h3>
          <p className="muted">Formatos aceptados: PDF, JPG, PNG, DOCX</p>

          {Object.entries(LICENSE_DOC_LABELS).map(([docType, label]) => {
            const existingDoc = record?.documents?.find((d) => d.type === docType);
            const pending = pendingFiles[docType];
            return (
              <div key={docType} className="upload-zone" style={{ marginBottom: 12 }}>
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{label}</strong>
                    {existingDoc && (
                      <p className="muted" style={{ fontSize: '0.8rem' }}>
                        Actual: {existingDoc.fileName} · Subido: {existingDoc.uploadedAt ? new Date(existingDoc.uploadedAt).toLocaleString() : '—'}
                      </p>
                    )}
                  </div>
                  {existingDoc?.fileUrl && (
                    <a className="btn btn-secondary" href={existingDoc.fileUrl} target="_blank" rel="noreferrer">
                      Ver documento
                    </a>
                  )}
                </div>
                {!readOnly && (
                  <>
                    <input
                      type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="upload-zone__input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(docType, file);
                      }}
                    />
                    {pending && (
                      <div className="actions" style={{ marginTop: 8 }}>
                        <span className="muted">Pendiente: {pending.name}</span>
                        <Button type="button" variant="primary" disabled={loading}
                          onClick={() => void handleFileUpload(docType)}>
                          Subir documento
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* OCR Visualization */}
          {latestOcr && (
            <section className="advanced-management__section advanced-management__related">
              <h3>Visualización OCR</h3>
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Valor Detectado (OCR)</th>
                      <th>Valor Manual</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Número de Licencia</td>
                      <td><code>{latestOcr.detectedLicenseNumber || '—'}</code></td>
                      <td><code>{latestOcr.modifiedLicenseNumber || '—'}</code></td>
                    </tr>
                    <tr>
                      <td>Fecha Expedición</td>
                      <td><code>{toDate(latestOcr.detectedIssueDate) || '—'}</code></td>
                      <td><code>{toDate(latestOcr.modifiedIssueDate) || '—'}</code></td>
                    </tr>
                    <tr>
                      <td>Fecha Vencimiento</td>
                      <td><code>{toDate(latestOcr.detectedExpirationDate) || '—'}</code></td>
                      <td><code>{toDate(latestOcr.modifiedExpirationDate) || '—'}</code></td>
                    </tr>
                    <tr>
                      <td>Autoridad Emisora</td>
                      <td><code>{latestOcr.detectedIssuingAuthority || '—'}</code></td>
                      <td><code>{latestOcr.modifiedIssuingAuthority || '—'}</code></td>
                    </tr>
                    <tr>
                      <td>Titular Detectado</td>
                      <td><code>{latestOcr.detectedLicenseHolder || '—'}</code></td>
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {latestOcr.hasManualModification && (
                <p className="advanced-management__audit-warning">
                  ⚠ Se detectaron modificaciones manuales a los valores OCR. Se ha notificado a ADMIN, MANAGER y OWNER.
                </p>
              )}
              {latestOcr.sourceFileName && (
                <p className="muted" style={{ fontSize: '0.8rem' }}>Fuente: {latestOcr.sourceFileName} · Confianza: {Math.round(latestOcr.confidence * 100)}%</p>
              )}
            </section>
          )}
        </section>
      )}

      {/* ============ TAB: Alertas ============ */}
      {tab === 'Alertas' && (
        <section className="advanced-management__section">
          <h3>Alertas de Licencia SST</h3>
          <p className="muted">Alertas automáticas generadas por el motor de vencimientos.</p>
          <div className="advanced-list">
            {record?.alerts?.filter((a) => a.type.includes('LICENSE') || a.type.includes('SST_LICENSE')).length ? (
              record.alerts.filter((a) => a.type.includes('LICENSE') || a.type.includes('SST_LICENSE')).map((alert, idx) => (
                <article key={idx} className="advanced-list__item">
                  <span className={`advanced-management__badge ${alert.severity === 'HIGH' ? 'advanced-management__badge--danger' : alert.severity === 'MEDIUM' ? 'advanced-management__badge--warning' : 'advanced-management__badge--success'}`}>
                    {alert.severity}
                  </span>
                  <strong>{alert.type}</strong>
                  <p>{alert.message}</p>
                  <small>Fecha: {new Date(alert.dueAt).toLocaleString()} · Generada: {alert.generated ? 'Sí' : 'Pendiente'}</small>
                </article>
              ))
            ) : (
              <p className="empty-state">No hay alertas de licencia SST generadas.</p>
            )}
          </div>

          {/* Expiration Timeline */}
          {licenseForm.licenseExpiresAt && (
            <section className="advanced-management__section" style={{ marginTop: 16 }}>
              <h3>Línea de tiempo de vencimientos</h3>
              <div className="advanced-list">
                {[90, 60, 30, 15, 5, 1].map((days) => {
                  const dueDate = new Date(`${licenseForm.licenseExpiresAt}T00:00:00`);
                  dueDate.setDate(dueDate.getDate() - days);
                  const isPast = dueDate < new Date();
                  return (
                    <article key={days} className={`advanced-list__item ${isPast ? '' : ''}`}>
                      <span className={`advanced-management__badge ${days <= 5 ? 'advanced-management__badge--danger' : days <= 30 ? 'advanced-management__badge--warning' : 'advanced-management__badge--success'}`}>
                        {days} día(s)
                      </span>
                      <p>
                        Alerta a los <strong>{days} días</strong> antes del vencimiento
                        {isPast ? ' · (ya generada)' : ''}
                      </p>
                      <small>Fecha programada: {dueDate.toLocaleDateString()}</small>
                    </article>
                  );
                })}
                <article className="advanced-list__item">
                  <span className="advanced-management__badge advanced-management__badge--danger">Vencimiento</span>
                  <p>Día de vencimiento de la licencia</p>
                  <small>Fecha: {new Date(`${licenseForm.licenseExpiresAt}T00:00:00`).toLocaleDateString()}</small>
                </article>
              </div>
            </section>
          )}
        </section>
      )}

      {/* ============ TAB: Historial ============ */}
      {tab === 'Historial' && (
        <section className="advanced-management__section">
          <h3>Historial de cambios</h3>
          {record?.auditHistory?.length ? (
            <div className="timeline">
              {record.auditHistory.slice().reverse().map((entry, idx) => (
                <article key={idx} className="timeline__item">
                  <div className="actions" style={{ justifyContent: 'space-between' }}>
                    <strong>{entry.field}</strong>
                    <small className="muted">{new Date(entry.changedAt).toLocaleString()}</small>
                  </div>
                  <p className="muted">Usuario: {entry.userEmail || '—'}</p>
                  {entry.oldValue && <small style={{ color: '#dc2626', display: 'block' }}>Anterior: {entry.oldValue}</small>}
                  {entry.newValue && <small style={{ color: '#16a34a', display: 'block' }}>Nuevo: {entry.newValue}</small>}
                  {entry.warning && (
                    <small className="advanced-management__audit-warning" style={{ display: 'block', marginTop: 4 }}>
                      ⚠ {entry.warning}
                    </small>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No hay cambios registrados en la licencia SST.</p>
          )}
        </section>
      )}

      <div className="advanced-management__footer">
        <span className="muted">
          Última actualización: {record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—'}
        </span>
        <Button type="button" variant="ghost" onClick={() => void load()}>Recargar</Button>
      </div>
    </div>
  );
}
