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
  submitResponsableSstAdvanced,
  approveResponsableSstAdvanced,
  rejectResponsableSstAdvanced,
  fetchEmployees,
  fetchCompanyProfile,
  WorkCenterModel,
} from '../api';
import { Button } from './ui/Button';
import { AdvancedKpiGrid } from './advanced-layout';
import { AdvancedModuleReportTemplate } from '../pdf/templates/AdvancedModuleReportTemplate';
import { exportAdvancedPdf } from '../pdf/utils/exportAdvancedPdf';

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
  { type: 'DESIGNATION', label: '📜 Documento de designación', accept: '.pdf,image/*,.doc,.docx' },
];

function toDateInputValue(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Etiqueta DOCUMENTAL del estado de vigencia de la licencia (Fase 8.3.E).
 * La licencia SST NO tiene vencimiento normativo obligatorio: el backend solo
 * refleja aquí la fecha de vigencia indicada en el documento, cuando existe.
 * La etiqueta es informativa y nunca debe interpretarse como incumplimiento
 * del estándar SG-SST (no afecta complianceStatus).
 */
function licenseDocLabel(status?: string) {
  if (status === 'Vigente') return 'Vigencia documental vigente';
  if (status === 'Vencida' || status === 'Vencido') return 'Vigencia documental vencida (informativo)';
  if (status === 'Próxima a vencer') return 'Vigencia documental por vencer (informativo)';
  return 'Sin vigencia documental';
}

function complianceBadge(status?: ResponsableSstComplianceStatus) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'badge badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'badge badge--danger' };
  return { label: '⚠ Pendiente', className: 'badge badge--warning' };
}

/**
 * Estados locales del ciclo de aprobación del módulo 1.1.1. Amplía el set del
 * modelo (DRAFT/PENDING_APPROVAL/APPROVED/REJECTED) con los estados compuestos
 * que el backend puede devolver (APPROVED_AND_SIGNED / ARCHIVED).
 */
type PanelApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'APPROVED_AND_SIGNED' | 'REJECTED' | 'ARCHIVED';

function approvalBadge(status: PanelApprovalStatus) {
  if (status === 'APPROVED' || status === 'APPROVED_AND_SIGNED') {
    return { label: '✅ Documento aprobado', className: 'badge badge--success' };
  }
  if (status === 'PENDING_APPROVAL') {
    return { label: '⏳ Pendiente de aprobación', className: 'badge badge--warning' };
  }
  if (status === 'REJECTED') {
    return { label: '❌ Rechazado', className: 'badge badge--danger' };
  }
  if (status === 'ARCHIVED') {
    return { label: '📦 Archivado', className: 'badge badge--secondary' };
  }
  return { label: '📝 Borrador', className: 'badge badge--warning' };
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
  canApprove,
  reviewMode,
  onComplianceChange,
  onDirtyChange,
  saveRequest,
  discardRequest,
  onSaved,
}: {
  token: string;
  readOnly?: boolean;
  /** Indica si el usuario actual puede aprobar/rechazar (owner/manager). */
  canApprove?: boolean;
  /** Modo revisión (ruta /advanced-management/1.1.1?mode=review). */
  reviewMode?: boolean;
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
  const [companyInfo, setCompanyInfo] = useState<{ name: string; nit: string }>({ name: '', nit: '' });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState('');
  const [error, setError] = useState('');
  const [selectedDocumentType, setSelectedDocumentType] = useState<ResponsableSstDocumentType>('SST_LICENSE_PDF');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrIndex, setOcrIndex] = useState(0);
  const [ocrOverride, setOcrOverride] = useState({ licenseNumber: '', issueDate: '', expirationDate: '', issuingAuthority: '' });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
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
      if (profile) {
        setCompanyInfo({ name: profile.companyName ?? '', nit: profile.nit ?? '' });
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
    if (!record || record.locked) return;
    setRecord({ ...record, [field]: value });
    markDirty();
  };

  /**
   * Sube el archivo pendiente (selectedFile) al backend usando el documentType
   * indicado. Es la única ruta de upload del panel (Fase 8.3.E): tanto el botón
   * standalone como saveForm() la reutilizan para evitar duplicar lógica.
   *
   * Devuelve true solo si el documento quedó persistido. En caso de error el
   * mensaje queda visible y selectedFile se conserva para permitir reintento.
   */
  const performUpload = async (documentType: ResponsableSstDocumentType): Promise<true | string> => {
    const file = selectedFile;
    if (!file || !token || !record || record.locked) return 'No hay un archivo pendiente para subir.';
    setLoading(true);
    setError('');
    try {
      const detectedDate = detectDateFromFileName(file.name);
      const saved = await uploadResponsableSstDocument(token, {
        type: documentType,
        file,
        ...(detectedDate ? { finalUserDate: detectedDate } : {}),
      });
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setSelectedFile(null);
      setSelectedDocumentType('SST_LICENSE_PDF');
      notify(`Documento "${file.name}" cargado exitosamente.`);
      await load();
      return true;
    } catch (uploadError) {
      // El archivo permanece seleccionado para reintento; no se reporta éxito.
      const message = uploadError instanceof Error ? uploadError.message : 'No se pudo cargar el documento.';
      setError(message);
      return message;
    } finally {
      setLoading(false);
    }
  };

  /** Botón standalone de subida inmediata (pestaña Designación). */
  const uploadDocument = async (forcedType?: ResponsableSstDocumentType) => {
    await performUpload(forcedType ?? selectedDocumentType);
  };

  const saveForm = async () => {
    if (!record || !token || record.locked) return;
    // Fase 8.3.E — Guardado completo: cuando existe un archivo pendiente en las
    // pestañas con carga documental (Licencia SST / Designación), Guardar
    // persiste primero los campos de texto y después sube el documento.
    const fileToUpload = selectedFile;
    const pendingUploadType: ResponsableSstDocumentType | null =
      tab === 'Designación' ? 'DESIGNATION'
        : tab === 'Licencia SST' ? selectedDocumentType
          : null;
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
        // Fase 8.3.C — Designación
        designationDate: toDateInputValue(record.designationDate),
        designationNumber: record.designationNumber,
        designationIssuerName: record.designationIssuerName,
        designationIssuerPosition: record.designationIssuerPosition,
      });
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setDirty(false);

      if (fileToUpload && pendingUploadType) {
        const uploadResult = await performUpload(pendingUploadType);
        if (uploadResult === true) {
          notify(`Cambios y documento "${fileToUpload.name}" guardados correctamente.`);
          onSaved();
        } else {
          // PATCH OK + upload fallido: los datos sí quedaron guardados pero el
          // documento no se cargó. Mensaje claro y archivo conservado (performUpload
          // no lo limpia en el fallo) para reintentar; no se reporta éxito completo.
          setError(`Los datos se guardaron, pero el documento "${fileToUpload.name}" no pudo cargarse: ${uploadResult}. El archivo permanece seleccionado para reintentar.`);
        }
        return;
      }

      notify('Cambios guardados correctamente.');
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar.');
    } finally {
      setLoading(false);
    }
  };

  const handleOcrModify = async () => {
    if (!token || !record || record.locked || !record.licenseOcrEntries?.[ocrIndex]) return;
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

  // ===================== EXPORTACIÓN PDF (1.1.1) =====================
  const exportPdf = async () => {
    if (!record) return;
    const currentVersion = record.currentVersion ?? '1.0';
    const statusLabel =
      approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED'
        ? 'Aprobado'
        : approvalStatus === 'PENDING_APPROVAL'
          ? 'Pendiente de aprobación'
          : approvalStatus === 'REJECTED'
            ? 'Rechazado'
            : approvalStatus === 'ARCHIVED'
              ? 'Archivado'
              : 'Borrador';
    const licenseDocs = record.documents.filter((d) => d.type.startsWith('SST_LICENSE'));
    const designationDocs = record.documents.filter((d) => d.type === 'DESIGNATION');
    const doc50 = record.documents.find((d) => d.type === 'FIFTY_HOUR_CERTIFICATE');
    const doc20 = record.documents.find((d) => d.type === 'TWENTY_HOUR_UPDATE_CERTIFICATE');
    const diploma = record.documents.find((d) => d.type === 'DIPLOMA');

    await exportAdvancedPdf({
      filename: `responsable-sst-v${currentVersion}.pdf`,
      document: (
        <AdvancedModuleReportTemplate
          data={{
            title: 'Responsable SG-SST (PHVA 1.1.1)',
            companyName: companyInfo.name || undefined,
            nit: companyInfo.nit || undefined,
            version: `v${currentVersion}`,
            status: statusLabel,
            generatedAt: new Date().toLocaleString(),
            sections: [
              {
                title: 'Resumen',
                rows: [
                  { label: 'Estándar', value: '1.1.1' },
                  { label: 'Nombre', value: 'Responsable SG-SST' },
                  { label: 'Código / documento', value: 'PHVA-1.1.1' },
                  { label: 'Empresa', value: companyInfo.name || '—' },
                  { label: 'NIT', value: companyInfo.nit || '—' },
                  { label: 'Estado de aprobación', value: statusLabel },
                  { label: 'Versión actual', value: `v${currentVersion}` },
                  { label: 'Fecha de generación', value: new Date().toLocaleString() },
                  ...(record.submittedAt ? [{ label: 'Fecha de envío', value: new Date(record.submittedAt).toLocaleString() }] : []),
                  ...(record.approvedBy?.timestamp ? [{ label: 'Fecha de aprobación', value: new Date(record.approvedBy.timestamp).toLocaleString() }] : []),
                ],
              },
              {
                title: 'Responsable',
                rows: [
                  { label: 'Nombre', value: record.fullName || '—' },
                  { label: 'Identificación', value: record.documentNumber || '—' },
                  { label: 'Cargo', value: record.position || '—' },
                  { label: 'Profesión', value: record.profession || '—' },
                  { label: 'Tipo profesional SST', value: record.sstProfessionalType || '—' },
                  { label: 'Centro de trabajo / Sede', value: record.department || '—' },
                  { label: 'Observaciones', value: record.observations || '—' },
                ],
              },
              {
                title: 'Formación',
                rows: [
                  { label: 'Curso 50 horas', value: record.course50HoursDate ? toDateInputValue(record.course50HoursDate) : '—' },
                  { label: 'Fecha detectada (OCR)', value: record.course50HoursDetectedDate ? toDateInputValue(record.course50HoursDetectedDate) : '—' },
                  { label: 'Actualización 20 horas', value: record.course20HoursDate ? toDateInputValue(record.course20HoursDate) : record.requires20HourUpdate ? 'Requerida (curso 50h > 3 años)' : '—' },
                  { label: 'Evidencia curso 50h', value: doc50 ? doc50.fileName : '—' },
                  { label: 'Evidencia curso 20h', value: doc20 ? doc20.fileName : '—' },
                  { label: 'Diploma', value: diploma ? diploma.fileName : '—' },
                ],
              },
              {
                title: 'Licencia SST',
                rows: [
                  { label: 'Número', value: record.sstLicenseNumber || '—' },
                  { label: 'Entidad emisora', value: record.issuingAuthority || '—' },
                  { label: 'Tipo de licencia', value: record.licenseType || '—' },
                  { label: 'Fecha de expedición', value: record.licenseIssueDate ? toDateInputValue(record.licenseIssueDate) : '—' },
                  { label: 'Vigencia indicada en el documento (opcional)', value: record.licenseExpiresAt ? toDateInputValue(record.licenseExpiresAt) : 'No registrada' },
                  { label: 'Estado documental', value: licenseStatus },
                  { label: 'Documentos de licencia', value: licenseDocs.length ? licenseDocs.map((d) => d.fileName).join(', ') : '—' },
                ],
              },
              {
                title: 'Designación',
                rows: [
                  { label: 'Designado', value: record.fullName || '—' },
                  { label: 'Cargo del designado', value: record.position || '—' },
                  { label: 'Fecha de designación', value: record.designationDate ? toDateInputValue(record.designationDate) : '—' },
                  { label: 'Número de designación', value: record.designationNumber || '—' },
                  { label: 'Quien designa', value: record.designationIssuerName || '—' },
                  { label: 'Cargo de quien designa', value: record.designationIssuerPosition || '—' },
                  { label: 'Evidencia de designación', value: designationDocs.length ? designationDocs.map((d) => d.fileName).join(', ') : '—' },
                ],
              },
              {
                title: 'Cumplimiento',
                rows: [
                  { label: 'ComplianceStatus', value: badge.label },
                  { label: 'Motivo', value: record.complianceReason || '—' },
                  { label: 'Alertas', value: record.alerts.length ? record.alerts.map((a) => a.message).join(' | ') : 'Sin alertas' },
                ],
              },
            ],
          }}
        />
      ),
    });
    notify('📄 Reporte PDF exportado correctamente.');
  };

  // ===================== CICLO DE APROBACIÓN (1.1.1) =====================
  const submitForApproval = async () => {
    if (!token) return;
    // Fase 8.3.C — persiste primero los cambios pendientes (patrón 1.1.2/1.1.3)
    // para que el snapshot que se envía refleje la última edición del usuario.
    if (dirty) await saveForm();
    setLoading(true);
    setError('');
    try {
      const saved = await submitResponsableSstAdvanced(token);
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setDirty(false);
      notify('📤 Solicitud enviada a aprobación. Contenido bloqueado y Gerencia notificada.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo enviar a aprobación.');
    } finally {
      setLoading(false);
    }
  };

  const approveModule = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const saved = await approveResponsableSstAdvanced(token);
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setDirty(false);
      notify('✅ Documento aprobado. Contenido bloqueado.');
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'No se pudo aprobar el documento.');
    } finally {
      setLoading(false);
    }
  };

  const rejectModule = async (reason: string) => {
    if (!token || !reason.trim()) return;
    setLoading(true);
    setError('');
    try {
      const saved = await rejectResponsableSstAdvanced(token, reason);
      setRecord(saved);
      onComplianceChange(saved.complianceStatus);
      setDirty(false);
      setShowRejectModal(false);
      setRejectReasonInput('');
      notify('❌ Documento rechazado. Edición habilitada para correcciones.');
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : 'No se pudo rechazar el documento.');
    } finally {
      setLoading(false);
    }
  };

  const badge = complianceBadge(record?.complianceStatus);
  const latestOcrEntry = record?.licenseOcrEntries?.[ocrIndex];

  if (loading && !record) return <p className="muted">Cargando gestión del responsable SG-SST...</p>;
  if (!record) return <div className="advanced-management"><p className="muted">{error || 'No hay datos disponibles.'}</p></div>;

  // Estado del ciclo de aprobación derivado directamente del registro (el
  // backend es la fuente de verdad tras submit/approve/reject).
  const approvalStatus = (record.approvalStatus ?? 'DRAFT') as PanelApprovalStatus;
  const locked = record.locked === true;
  const approvalBadgeInfo = approvalBadge(approvalStatus);

  const requiresLicenseDoc = ['Tecnólogo SST', 'Profesional SST', 'Especialista SST'].includes(record.licenseType);
  const hasLicenseDoc = record.documents.some((doc) => doc.type === 'SST_LICENSE_PDF' || doc.type === 'SST_LICENSE_SCANNED');
  // NOTA normativa (1.1.1): la licencia SST NO tiene vencimiento obligatorio.
  // licenseStatus es un estado DOCUMENTAL que proviene del backend (Pendiente
  // cuando no existe fecha) y nunca se deriva del paso del tiempo en el
  // frontend. La fecha de vigencia es opcional y solo informativa.
  const licenseStatus = record.licenseStatus || 'Pendiente';
  const hasDocumentExpiryDate = Boolean(record.licenseExpiresAt);
  // Fase 8.3.C — gate de aprobación: el frontend refleja el estado entregado
  // por el backend (fuente de verdad). Un estándar no-COMPLIES no puede
  // enviarse a aprobación ni aprobarse.
  const complianceIsComplete = record.complianceStatus === 'COMPLIES';

  // Convierte el complianceReason del backend en una lista de requisitos pendientes.
  const pendingRequirements = String(record.complianceReason || '')
    .split(/[.;]\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.endsWith('.') ? part : `${part}.`));

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
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void exportPdf()}>
            📄 Exportar PDF
          </Button>
          <span className={badge.className}>{badge.label}</span>
          <span
            className="badge badge--secondary"
            title="La licencia SST no exige fecha de vencimiento. La vigencia es solo un dato documental si el documento la indica; no constituye incumplimiento del estándar."
          >
            📄 Licencia: {licenseDocLabel(licenseStatus)}
          </span>
        </div>
      </section>

      {/* Review mode banner (ruta /advanced-management/1.1.1?mode=review) */}
      {reviewMode && approvalStatus === 'PENDING_APPROVAL' ? (
        <div className="advanced-page__banner advanced-page__banner--warning" style={{ border: '2px solid #d97706', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
            <div>
              <strong style={{ fontSize: '1rem' }}>📋 Documento pendiente de aprobación</strong>
              <div style={{ marginTop: '.35rem', fontSize: '.85rem', color: '#92400e' }}>
                {record.submittedAt ? <span><strong>📅 Enviado:</strong> {new Date(record.submittedAt).toLocaleString()} | </span> : null}
                <span><strong>🔖 Módulo:</strong> 1.1.1 — Responsable SG-SST | </span>
                <span><strong>🔢 Versión:</strong> v{record.currentVersion ?? '1.0'}</span>
              </div>
            </div>
            {canApprove ? (
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <Button type="button" onClick={() => void approveModule()} disabled={loading || !complianceIsComplete}>
                  ✅ Aprobar módulo
                </Button>
                <Button type="button" variant="danger" onClick={() => setShowRejectModal(true)} disabled={loading}>
                  ❌ Rechazar
                </Button>
                {!complianceIsComplete ? (
                  <span className="advanced-management__audit-warning" style={{ flexBasis: '100%', display: 'block' }}>
                    ⚠️ No se puede aprobar: el estándar no cumple todos los requisitos. {record.complianceReason}
                  </span>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: '.85rem', color: '#dc2626' }}>
                ⚠️ Solo usuarios con rol Gerente pueden aprobar o rechazar.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Ciclo de aprobación: estado, versión, fecha envío y motivo de rechazo */}
      <section className="advanced-management__section" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: '1 1 300px', minWidth: 260 }}>
            <h3 style={{ margin: 0 }}>✍ Ciclo de aprobación</h3>
            <div style={{ marginTop: '.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span className={approvalBadgeInfo.className}>{approvalBadgeInfo.label}</span>
              <span className="muted" style={{ fontSize: '.9rem' }}><strong>Versión:</strong> v{record.currentVersion ?? '1.0'}</span>
              {record.submittedAt ? (
                <span className="muted" style={{ fontSize: '.9rem' }}><strong>Enviado:</strong> {new Date(record.submittedAt).toLocaleString()}</span>
              ) : null}
              {locked ? <span className="badge badge--danger">🔒 Edición bloqueada</span> : null}
            </div>
            {approvalStatus === 'REJECTED' && record.rejectionReason ? (
              <div style={{ marginTop: '.5rem', padding: '.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                <strong>💬 Motivo del rechazo:</strong>
                <p style={{ margin: '.25rem 0 0', fontSize: '.9rem', color: '#991b1b' }}>{record.rejectionReason}</p>
              </div>
            ) : null}
            {approvalStatus === 'DRAFT' ? (
              <p className="muted" style={{ margin: '.5rem 0 0' }}>📝 Borrador. Completa la información y envía a aprobación cuando esté lista.</p>
            ) : null}
            {approvalStatus === 'PENDING_APPROVAL' ? (
              <p className="muted" style={{ margin: '.5rem 0 0' }}>⏳ Pendiente de aprobación por Gerencia. El contenido está bloqueado hasta que se revise.</p>
            ) : null}
            {approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' ? (
              <p className="muted" style={{ margin: '.5rem 0 0' }}>✅ Documento aprobado. El contenido queda bloqueado y el documento formal se genera y publica automáticamente.</p>
            ) : null}
          </div>
          <div className="actions" style={{ gap: 8, flexWrap: 'wrap' }}>
            {(approvalStatus === 'DRAFT' || approvalStatus === 'REJECTED') && !readOnly && !locked ? (
              <>
                <Button type="button" disabled={loading || !complianceIsComplete} onClick={() => void submitForApproval()}>
                  {approvalStatus === 'REJECTED' ? '📤 Enviar nuevamente' : '📤 Enviar a aprobación'}
                </Button>
                {!complianceIsComplete ? (
                  <div className="advanced-management__audit-warning" style={{ maxWidth: 480, flexBasis: '100%' }}>
                    <strong>⚠️ No se puede enviar a aprobación — requisitos pendientes:</strong>
                    <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.15rem', fontSize: '.85rem' }}>
                      {pendingRequirements.map((requirement) => (
                        <li key={requirement}>{requirement}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
            {approvalStatus === 'PENDING_APPROVAL' && canApprove ? (
              <>
                <Button type="button" disabled={loading || !complianceIsComplete} onClick={() => void approveModule()}>✅ Aprobar</Button>
                <Button type="button" variant="danger" disabled={loading} onClick={() => setShowRejectModal(true)}>❌ Rechazar</Button>
              </>
            ) : null}
            {approvalStatus === 'PENDING_APPROVAL' && !canApprove ? (
              <Button type="button" variant="secondary" disabled>⏳ Pendiente de aprobación</Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="advanced-tabs" role="tablist" style={{ marginBottom: '1rem' }}>
        {tabs.map((name) => (
          <Button
            key={name}
            type="button"
            variant={tab === name ? 'primary' : 'secondary'}
            onClick={() => {
              // Fase 8.3.E — el archivo pendiente pertenece a la pestaña donde
              // fue seleccionado; al cambiar de pestaña se descarta para evitar
              // subirlo con un documentType equivocado en otra pestaña.
              if (name !== tab) setSelectedFile(null);
              setTab(name);
            }}
          >
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
              <input className="input" disabled={readOnly || locked} value={record.fullName} onChange={(e) => updateField('fullName', e.target.value)} placeholder="Nombre del responsable SST" />
            </label>
            <label className="field"><span className="label">Número documento *</span>
              <input className="input" disabled={readOnly || locked} value={record.documentNumber} onChange={(e) => updateField('documentNumber', e.target.value)} placeholder="CC / NIT" />
            </label>
            <label className="field"><span className="label">Cargo *</span>
              <input className="input" disabled={readOnly || locked} value={record.position} onChange={(e) => updateField('position', e.target.value)} placeholder="Ej: Coordinador SST" />
            </label>
            <label className="field"><span className="label">Profesión *</span>
              <input className="input" disabled={readOnly || locked} value={record.profession} onChange={(e) => updateField('profession', e.target.value)} placeholder="Ej: Ingeniero Industrial" />
            </label>
            <label className="field"><span className="label">Tipo profesional SST *</span>
              <select className="input" disabled={readOnly || locked} value={record.sstProfessionalType} onChange={(e) => updateField('sstProfessionalType', e.target.value)}>
                <option value="">Seleccionar...</option>
                {SST_PROFESSIONAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Centro de trabajo / Sede</span>
              <select className="input" disabled={readOnly || locked} value={workCenters.length > 0 ? record.department : 'Sede Principal'} onChange={(e) => updateField('department', e.target.value)}>
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
              <textarea className="input" disabled={readOnly || locked} value={record.observations} onChange={(e) => updateField('observations', e.target.value)} rows={3} placeholder="Observaciones adicionales" />
            </label>
          </div>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <Button type="button" disabled={readOnly || locked || loading} onClick={() => void saveForm()}>Guardar información</Button>
          </div>
        </section>
      ) : null}

      {/* ===================== TAB 2: FORMACIÓN ===================== */}
      {tab === 'Formación' ? (
        <section className="advanced-management__section">
          <h3>Cursos y Formación SST</h3>
          <div className="form-grid">
            <label className="field"><span className="label">Fecha curso 50 horas *</span>
              <input type="date" className="input" disabled={readOnly || locked} value={toDateInputValue(record.course50HoursDate)} onChange={(e) => { updateField('course50HoursDate', e.target.value); }} />
            </label>
            <label className="field"><span className="label">Fecha detectada (OCR)</span>
              <input type="date" className="input" value={toDateInputValue(record.course50HoursDetectedDate)} disabled readOnly />
              <small className="muted">Detectada automáticamente del certificado cargado</small>
            </label>
            {record.requires20HourUpdate ? (
              <label className="field"><span className="label">Fecha curso 20 horas (requerido) *</span>
                <input type="date" className="input" disabled={readOnly || locked} value={toDateInputValue(record.course20HoursDate)} onChange={(e) => updateField('course20HoursDate', e.target.value)} />
                <small className="advanced-management__audit-warning">Curso de 50 horas supera 3 años, requiere actualización de 20 horas</small>
              </label>
            ) : (
              <label className="field"><span className="label">Fecha curso 20 horas</span>
                <input type="date" className="input" disabled={readOnly || locked} value={toDateInputValue(record.course20HoursDate)} onChange={(e) => updateField('course20HoursDate', e.target.value)} />
              </label>
            )}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            <Button type="button" variant="secondary" disabled={readOnly || locked || loading} onClick={() => void saveForm()}>
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
          <AdvancedKpiGrid style={{ marginBottom: '1rem' }}>
            <article className="advanced-doc-card">
              <strong>Estado documental</strong>
              <span className="badge badge--secondary" style={{ display: 'inline-block', marginTop: 4 }}>
                {licenseDocLabel(licenseStatus)}
              </span>
            </article>
            <article className="advanced-doc-card">
              <strong>Vigencia documental</strong>
              <span>{hasDocumentExpiryDate ? toDateInputValue(record.licenseExpiresAt) : 'No aplica (sin vencimiento normativo)'}</span>
            </article>
            <article className="advanced-doc-card">
              <strong>Tipo licencia</strong>
              <span>{record.licenseType || 'No definido'}</span>
            </article>
            <article className="advanced-doc-card">
              <strong>Documento requerido</strong>
              <span>{requiresLicenseDoc ? (hasLicenseDoc ? '✅ Cargado' : '❌ Pendiente') : 'No requerido'}</span>
            </article>
          </AdvancedKpiGrid>

          {/* License Form */}
          <div className="form-grid">
            <label className="field"><span className="label">Número de licencia *</span>
              <input className="input" disabled={readOnly || locked} value={record.sstLicenseNumber} onChange={(e) => updateField('sstLicenseNumber', e.target.value)} placeholder="Número de licencia SST" />
            </label>
            <label className="field"><span className="label">Tipo de licencia *</span>
              <select className="input" disabled={readOnly || locked} value={record.licenseType} onChange={(e) => updateField('licenseType', e.target.value)}>
                <option value="">Seleccionar tipo...</option>
                {SST_LICENSE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Autoridad emisora</span>
              <input className="input" disabled={readOnly || locked} value={record.issuingAuthority} onChange={(e) => updateField('issuingAuthority', e.target.value)} placeholder="Ej: Ministerio de Trabajo" />
            </label>
            <label className="field"><span className="label">Fecha de expedición *</span>
              <input type="date" className="input" disabled={readOnly || locked} value={toDateInputValue(record.licenseIssueDate)} onChange={(e) => updateField('licenseIssueDate', e.target.value)} />
            </label>
            <label className="field"><span className="label">Fecha de vigencia indicada en el documento (opcional)</span>
              <input type="date" className="input" disabled={readOnly || locked} value={toDateInputValue(record.licenseExpiresAt)} onChange={(e) => updateField('licenseExpiresAt', e.target.value)} />
              <small className="muted">Solo si el documento/acto indica una vigencia concreta. La licencia SST no requiere vencimiento.</small>
            </label>
            <label className="field"><span className="label">Observaciones</span>
              <textarea className="input" disabled={readOnly || locked} value={record.observations} onChange={(e) => updateField('observations', e.target.value)} rows={2} placeholder="Observaciones de la licencia" />
            </label>
          </div>

          {/* Document Upload — el guardado principal integra la subida (Fase 8.3.E) */}
          <h4 style={{ marginTop: '1.5rem' }}>Documentos de la Licencia SST</h4>
          <p className="muted">Cargue los documentos de soporte de la licencia. Los documentos PDF e imágenes serán procesados por OCR.</p>
          <div className="form-grid" style={{ marginTop: '0.5rem' }}>
            <label className="field">
              <span className="label">Tipo de documento</span>
              <select className="input" disabled={readOnly || locked} value={selectedDocumentType} onChange={(e) => setSelectedDocumentType(e.target.value as ResponsableSstDocumentType)}>
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
                disabled={readOnly || locked}
                accept={DOCUMENT_TYPES.find((dt) => dt.type === selectedDocumentType)?.accept || '.pdf,image/*'}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              {selectedFile ? <small className="muted">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</small> : null}
              <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                Seleccionar un archivo no lo sube todavía. Use «Guardar licencia y subir documento» para guardar los datos y cargar el archivo en un solo paso.
              </small>
            </label>
          </div>

          <div className="actions" style={{ marginTop: '1rem' }}>
            <Button type="button" disabled={readOnly || locked || loading} onClick={() => void saveForm()}>
              {loading
                ? selectedFile ? 'Guardando licencia y subiendo documento...' : 'Guardando licencia...'
                : selectedFile ? 'Guardar licencia y subir documento' : 'Guardar licencia'}
            </Button>
          </div>

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
                  <select className="input" disabled={readOnly || locked} value={ocrIndex} onChange={(e) => setOcrIndex(Number(e.target.value))}>
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
                        <td><input className="input" size={12} disabled={readOnly || locked} value={ocrOverride.licenseNumber} onChange={(e) => setOcrOverride({ ...ocrOverride, licenseNumber: e.target.value })} placeholder="Nuevo valor" /></td>
                      </tr>
                      <tr>
                        <td>Fecha expedición</td>
                        <td>{toDateInputValue(latestOcrEntry.detectedIssueDate) || '—'}</td>
                        <td>{toDateInputValue(latestOcrEntry.modifiedIssueDate) || '—'}</td>
                        <td><input type="date" className="input" disabled={readOnly || locked} value={ocrOverride.issueDate} onChange={(e) => setOcrOverride({ ...ocrOverride, issueDate: e.target.value })} /></td>
                      </tr>
                      <tr>
                        <td>Fecha vencimiento</td>
                        <td>{toDateInputValue(latestOcrEntry.detectedExpirationDate) || '—'}</td>
                        <td>{toDateInputValue(latestOcrEntry.modifiedExpirationDate) || '—'}</td>
                        <td><input type="date" className="input" disabled={readOnly || locked} value={ocrOverride.expirationDate} onChange={(e) => setOcrOverride({ ...ocrOverride, expirationDate: e.target.value })} /></td>
                      </tr>
                      <tr>
                        <td>Autoridad emisora</td>
                        <td>{latestOcrEntry.detectedIssuingAuthority || '—'}</td>
                        <td>{latestOcrEntry.modifiedIssuingAuthority || '—'}</td>
                        <td><input className="input" size={16} disabled={readOnly || locked} value={ocrOverride.issuingAuthority} onChange={(e) => setOcrOverride({ ...ocrOverride, issuingAuthority: e.target.value })} placeholder="Nueva autoridad" /></td>
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
                <Button type="button" variant="secondary" disabled={readOnly || locked || loading || !Object.values(ocrOverride).some(Boolean)} onClick={() => void handleOcrModify()}>
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
          <h3>📜 Designación del Responsable SST</h3>
          <p className="muted">
            Datos del acto administrativo/documento mediante el cual se designa al responsable del SG-SST.
            La evidencia de designación es obligatoria para el cumplimiento.
          </p>

          {/* Designation form */}
          <div className="form-grid">
            <label className="field"><span className="label">Designado</span>
              <input className="input" disabled readOnly value={record.fullName || '—'} />
            </label>
            <label className="field"><span className="label">Cargo del designado</span>
              <input className="input" disabled readOnly value={record.position || '—'} />
            </label>
            <label className="field"><span className="label">Fecha de designación *</span>
              <input type="date" className="input" disabled={readOnly || locked} value={toDateInputValue(record.designationDate)} onChange={(e) => updateField('designationDate', e.target.value)} />
            </label>
            <label className="field"><span className="label">Número de designación</span>
              <input className="input" disabled={readOnly || locked} value={record.designationNumber} onChange={(e) => updateField('designationNumber', e.target.value)} placeholder="Nº del acto/documento (si existe)" />
            </label>
            <label className="field"><span className="label">Nombre de quien designa *</span>
              <input className="input" disabled={readOnly || locked} value={record.designationIssuerName} onChange={(e) => updateField('designationIssuerName', e.target.value)} placeholder="Ej: Representante legal / Gerente" />
            </label>
            <label className="field"><span className="label">Cargo de quien designa *</span>
              <input className="input" disabled={readOnly || locked} value={record.designationIssuerPosition} onChange={(e) => updateField('designationIssuerPosition', e.target.value)} placeholder="Ej: Gerente General" />
            </label>
          </div>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <Button type="button" disabled={readOnly || locked || loading} onClick={() => void saveForm()}>
              {loading
                ? selectedFile ? 'Guardando designación y subiendo documento...' : 'Guardando designación...'
                : selectedFile ? 'Guardar designación y subir documento' : 'Guardar designación'}
            </Button>
          </div>

          {/* Designation evidence */}
          <h4 style={{ marginTop: '1.5rem' }}>Evidencia de designación *</h4>
          <p className="muted">Cargue el documento/acto en el que consta la designación del responsable del SG-SST.</p>
          <div className="form-grid" style={{ marginTop: '0.5rem' }}>
            <label className="field">
              <span className="label">Archivo</span>
              <input
                type="file"
                className="input"
                disabled={readOnly || locked}
                accept=".pdf,image/*,.doc,.docx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              {selectedFile ? <small className="muted">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</small> : null}
              <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                Seleccionar un archivo no lo sube todavía. Use «Guardar designación y subir documento» para guardar los datos y cargar el archivo.
              </small>
            </label>
          </div>
          <Button type="button" disabled={readOnly || locked || loading || !selectedFile} onClick={() => void uploadDocument('DESIGNATION')}>
            {loading ? 'Cargando...' : 'Subir documento de designación'}
          </Button>

          {/* Current designation document */}
          {record.documents.filter((doc) => doc.type === 'DESIGNATION').length > 0 ? (
            <div className="advanced-doc-grid" style={{ marginTop: '1rem' }}>
              {record.documents.filter((doc) => doc.type === 'DESIGNATION').map((doc) => (
                <article key={`${doc.type}-${doc.fileName}`} className="advanced-doc-card">
                  <strong>📜 Documento de designación</strong>
                  <p className="muted">{doc.fileName} · {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : ''}</p>
                  <span className="badge badge--success">✅ Cargado</span>
                  <div className="actions" style={{ marginTop: 4 }}>
                    <a className="btn btn-secondary btn-sm" href={doc.fileUrl} target="_blank" rel="noreferrer">Previsualizar</a>
                    <a className="btn btn-ghost btn-sm" href={doc.fileUrl} download={doc.fileName}>Descargar</a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state" style={{ marginTop: '1rem' }}>No hay documento de designación cargado.</p>
          )}
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

      {/* Rejection reason modal (referencia visual 1.1.2) */}
      {showRejectModal ? (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>❌ Rechazar solicitud</h3>
            <p>Indica el motivo del rechazo:</p>
            <textarea
              className="input"
              rows={3}
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder="Motivo del rechazo..."
              style={{ width: '100%', marginBottom: '.5rem' }}
            />
            <div className="actions">
              <Button type="button" disabled={!rejectReasonInput.trim() || loading} onClick={() => void rejectModule(rejectReasonInput)}>
                {loading ? 'Rechazando...' : 'Confirmar rechazo'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setShowRejectModal(false); setRejectReasonInput(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="advanced-management__footer">
        <span className={dirty ? 'advanced-management__dirty' : 'muted'}>
          {dirty ? '💾 Cambios sin guardar' : '✓ Sin cambios pendientes'}
        </span>
        <div className="actions">
          <Button type="button" disabled={readOnly || locked || loading} onClick={() => void saveForm()}>
            {loading ? 'Guardando...' : 'Guardar todos los cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ResponsableSstPanel;
