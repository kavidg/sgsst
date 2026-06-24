import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsableSstComplianceStatus,
  fetchEmployees,
  EmployeeModel,
  fetchTrainingManagementAdvanced,
  updateTrainingManagementAdvanced,
  approveTrainingManagementAdvanced,
  TrainingManagementAdvancedModel,
} from '../api';
import { Button } from './ui/Button';

// ============================================================
// SIDEBAR ITEMS (12 tabs)
// ============================================================
const SIDEBAR_ITEMS = [
  { id: 'resumen', label: '📋 Resumen' },
  { id: 'programa-anual', label: '📅 Programa Anual' },
  { id: 'capacitaciones', label: '🎓 Capacitaciones' },
  { id: 'asistencias', label: '👥 Asistencias' },
  { id: 'evaluaciones', label: '📝 Evaluaciones' },
  { id: 'certificados', label: '🏆 Certificados' },
  { id: 'evidencias', label: '📄 Evidencias' },
  { id: 'indicadores', label: '📊 Indicadores' },
  { id: 'alertas', label: '🔔 Alertas' },
  { id: 'aprobaciones', label: '✍ Aprobaciones' },
  { id: 'versiones', label: '📂 Versiones' },
  { id: 'historial', label: '🕓 Historial' },
] as const;

type SidebarId = (typeof SIDEBAR_ITEMS)[number]['id'];

// ============================================================
// TRAINING TYPES
// ============================================================
const TRAINING_TYPES = [
  'Inducción',
  'Reinducción',
  'Capacitación SST',
  'Emergencias',
  'Brigada',
  'COPASST',
  'Comité de Convivencia',
  'Riesgos',
  'EPP',
  'Custom',
] as const;

// Program states
const PROGRAM_STATES = [
  'Programada',
  'En ejecución',
  'Ejecutada',
  'Reprogramada',
  'Vencida',
  'Cancelada',
] as const;

// ============================================================
// TYPES
// ============================================================
interface ProgramItem {
  id: string;
  year: number;
  trainingName: string;
  objective: string;
  targetAudience: string;
  area: string;
  responsible: string;
  scheduledDate: string;
  trainingType: string;
  duration: string;
  status: string;
  comments: string;
}

interface TrainingRecord {
  id: string;
  title: string;
  description: string;
  instructor: string;
  date: string;
  duration: string;
  location: string;
  modality: string;
  targetGroup: string;
  status: string;
  trainingType: string;
}

interface AttendanceRecord {
  id: string;
  trainingId: string;
  trainingTitle: string;
  method: 'PHYSICAL' | 'DIGITAL';
  fileUrl?: string;
  employeeName?: string;
  employeeId?: string;
  signedAt?: string;
}

interface EvaluationRecord {
  id: string;
  trainingId: string;
  questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SINGLE_ANSWER';
  question: string;
  options: string[];
  correctAnswer: string;
  passingScore: number;
  attempts: Array<{
    employeeId: string;
    employeeName: string;
    score: number;
    passed: boolean;
    percentage: number;
    date: string;
  }>;
}

interface CertificateRecord {
  id: string;
  trainingId: string;
  trainingTitle: string;
  employeeName: string;
  employeeId: string;
  date: string;
  hours: number;
  score: number;
  verificationCode: string;
  issuedAt: string;
}

interface EvidenceRecord {
  id: string;
  trainingId: string;
  trainingTitle: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  version: number;
  uploadedAt: string;
  uploadedBy: string;
}

interface AlertRecord {
  id: string;
  type: string;
  message: string;
  daysBefore: number;
  dueDate: string;
  recipients: string[];
  resolved: boolean;
  createdAt: string;
}

interface VersionEntry {
  version: string;
  createdAt: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
}

interface AuditEntry {
  action: string;
  user: string;
  date: string;
  field?: string;
  previousValue?: string;
  newValue?: string;
}

type ApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ARCHIVED';

// ============================================================
// AUTO-SAVE HOOK
// ============================================================
function useAutoSave(callback: () => Promise<void>, intervalMs: number, active: boolean) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void callbackRef.current(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
}

// ============================================================
// COMPLIANCE BADGE
// ============================================================
function complianceBadge(status?: ResponsableSstComplianceStatus) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'badge badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'badge badge--danger' };
  return { label: '⚠ Pendiente', className: 'badge badge--warning' };
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function TrainingProgramModule({ token }: { token: string }) {
  const navigate = useNavigate();
  const [sidebarTab, setSidebarTab] = useState<SidebarId>('resumen');
  const [record, setRecord] = useState<TrainingManagementAdvancedModel | null>(null);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  // State for all 12 tabs
  const [programItems, setProgramItems] = useState<ProgramItem[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [evaluationRecords, setEvaluationRecords] = useState<EvaluationRecord[]>([]);
  const [certificateRecords, setCertificateRecords] = useState<CertificateRecord[]>([]);
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [alertRecords, setAlertRecords] = useState<AlertRecord[]>([]);
  const [alertLog, setAlertLog] = useState<AlertRecord[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [versions, setVersions] = useState<VersionEntry[]>([
    { version: '1.0', createdAt: new Date().toISOString(), createdBy: 'Sistema' },
  ]);
  const [currentVersion, setCurrentVersion] = useState('1.0');
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('DRAFT');
  const [locked, setLocked] = useState(false);

  // Form states
  const [programForm, setProgramForm] = useState<ProgramItem>({
    id: '', year: new Date().getFullYear(), trainingName: '', objective: '',
    targetAudience: '', area: '', responsible: '', scheduledDate: '', trainingType: 'Capacitación SST',
    duration: '', status: 'Programada', comments: '',
  });
  const [trainingForm, setTrainingForm] = useState<TrainingRecord>({
    id: '', title: '', description: '', instructor: '', date: '',
    duration: '', location: '', modality: 'Presencial', targetGroup: '', status: 'Programada', trainingType: 'Capacitación SST',
  });
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [evaluationForm, setEvaluationForm] = useState({
    trainingId: '', questionType: 'MULTIPLE_CHOICE' as const, question: '',
    options: '', correctAnswer: '', passingScore: 70,
  });
  const [evalAttemptForm, setEvalAttemptForm] = useState({
    employeeId: '', employeeName: '', score: 0, passed: false, percentage: 0,
  });
  const [justificationForm, setJustificationForm] = useState({
    trainingId: '', reason: '', newDate: '', responsible: '',
  });
  const [showJustification, setShowJustification] = useState(false);
  const [pendingEvidences, setPendingEvidences] = useState<{ fileName: string; fileUrl: string }[]>([]);
  const [selectedProgramTab, setSelectedProgramTab] = useState<'general' | 'kpis' | 'charts'>('general');
  const [customTrainingType, setCustomTrainingType] = useState('');

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const addAudit = (entry: AuditEntry) => {
    setAuditHistory((prev) => [entry, ...prev]);
  };

  const markDirty = () => setDirty(true);

  // Load data
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [data, employeeData] = await Promise.all([
        fetchTrainingManagementAdvanced(token),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
      ]);
      setRecord(data);
      setEmployees(employeeData);
      // Restore state from data if available
      if (data.trainings?.length) {
        setTrainingRecords(data.trainings as any);
      }
      if (data.annualProgram?.length) {
        setProgramItems(data.annualProgram as any);
      }
      setDirty(false);
      initialLoadDone.current = true;
    } catch {
      notify('No se pudieron cargar los datos de capacitación.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // Save
  const save = useCallback(async () => {
    if (!token || !dirty) return;
    setLoading(true);
    try {
      await updateTrainingManagementAdvanced(token, {
        annualProgram: programItems as any,
        trainings: trainingRecords as any,
      });
      setDirty(false);
      setLastSaved(new Date().toLocaleString());
      notify('Cambios guardados.');
    } catch {
      notify('Error al guardar.');
    } finally {
      setLoading(false);
    }
  }, [token, dirty, programItems, trainingRecords]);

  useAutoSave(save, 60000, dirty);

  // Unsaved warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleNavigate = (path: string) => {
    if (dirty) { setPendingNavigation(path); setShowUnsavedModal(true); }
    else navigate(path);
  };

  const confirmNavigation = () => {
    setShowUnsavedModal(false);
    if (pendingNavigation) { navigate(pendingNavigation); setPendingNavigation(null); }
  };

  const saveAndNavigate = async () => {
    await save();
    setShowUnsavedModal(false);
    if (pendingNavigation) { navigate(pendingNavigation); setPendingNavigation(null); }
  };

  const cancelNavigation = () => {
    setShowUnsavedModal(false);
    setPendingNavigation(null);
  };

  // Computed KPIs
  const totalProgrammed = programItems.length;
  const totalExecuted = trainingRecords.filter((t) => t.status === 'Ejecutada').length;
  const totalPending = trainingRecords.filter((t) => t.status === 'Programada').length;
  const totalOverdue = trainingRecords.filter((t) => t.status === 'Vencida').length;
  const totalRescheduled = trainingRecords.filter((t) => t.status === 'Reprogramada').length;
  const compliancePct = totalProgrammed > 0 ? Math.round((totalExecuted / totalProgrammed) * 100) : 0;

  const upcomingTrainings = trainingRecords
    .filter((t) => t.status === 'Programada' && t.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Alert generation
  const generateAlerts = () => {
    const newAlerts: AlertRecord[] = [];
    const today = new Date();
    trainingRecords.forEach((t) => {
      if (!t.date) return;
      const trainingDate = new Date(t.date);
      const diffDays = Math.round((trainingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 30) newAlerts.push({ id: `alert-${Date.now()}-30`, type: 'RECORDATORIO', message: `Capacitación "${t.title}" en 30 días`, daysBefore: 30, dueDate: t.date, recipients: ['ADMIN', 'MANAGER'], resolved: false, createdAt: new Date().toISOString() });
      if (diffDays === 10) newAlerts.push({ id: `alert-${Date.now()}-10`, type: 'RECORDATORIO', message: `Capacitación "${t.title}" en 10 días`, daysBefore: 10, dueDate: t.date, recipients: ['ADMIN', 'MANAGER'], resolved: false, createdAt: new Date().toISOString() });
      if (diffDays === 5 && diffDays > 0) newAlerts.push({ id: `alert-${Date.now()}-5`, type: 'RECORDATORIO', message: `Capacitación "${t.title}" en 5 días`, daysBefore: 5, dueDate: t.date, recipients: ['ADMIN', 'MANAGER'], resolved: false, createdAt: new Date().toISOString() });
      if (diffDays === 2) newAlerts.push({ id: `alert-${Date.now()}-2`, type: 'RECORDATORIO', message: `Capacitación "${t.title}" en 2 días`, daysBefore: 2, dueDate: t.date, recipients: ['ADMIN', 'MANAGER'], resolved: false, createdAt: new Date().toISOString() });
      if (diffDays < 0 && t.status === 'Programada') newAlerts.push({ id: `alert-${Date.now()}-exp`, type: 'VENCIDA', message: `Capacitación "${t.title}" vencida`, daysBefore: diffDays, dueDate: t.date, recipients: ['ADMIN', 'MANAGER'], resolved: false, createdAt: new Date().toISOString() });
    });
    setAlertLog(newAlerts);
    if (newAlerts.length) notify(`${newAlerts.length} alerta(s) generada(s).`);
  };

  const badge = complianceBadge(record?.complianceStatus);

  // ============================================================
  // TAB RENDERERS
  // ============================================================

  const renderKpiHeader = () => (
    <div className="training-page__kpi-grid">
      <article className="training-page__kpi-card training-page__kpi-card--info">
        <span className="training-page__kpi-label">Programa Anual</span>
        <span className="training-page__kpi-value">{totalProgrammed}</span>
      </article>
      <article className="training-page__kpi-card training-page__kpi-card--success">
        <span className="training-page__kpi-label">Capacitaciones Programadas</span>
        <span className="training-page__kpi-value">{totalPending}</span>
      </article>
      <article className="training-page__kpi-card training-page__kpi-card--executed">
        <span className="training-page__kpi-label">Capacitaciones Ejecutadas</span>
        <span className="training-page__kpi-value">{totalExecuted}</span>
      </article>
      <article className="training-page__kpi-card training-page__kpi-card--warning">
        <span className="training-page__kpi-label">Cumplimiento %</span>
        <span className="training-page__kpi-value">{compliancePct}%</span>
      </article>
      <article className={`training-page__kpi-card ${totalOverdue > 0 ? 'training-page__kpi-card--danger' : 'training-page__kpi-card--success'}`}>
        <span className="training-page__kpi-label">Próximos Vencimientos</span>
        <span className="training-page__kpi-value">{totalOverdue}</span>
      </article>
      <article className="training-page__kpi-card">
        <span className="training-page__kpi-label">Última Actualización</span>
        <span className="training-page__kpi-value" style={{ fontSize: '1rem' }}>{lastSaved || '—'}</span>
      </article>
    </div>
  );

  const renderResumen = () => (
    <div className="training-page__section">
      <h3>📋 Resumen del Programa de Capacitación PyP</h3>
      <p className="muted">Gestiona el programa anual de capacitación en promoción y prevención (PyP).</p>
      {renderKpiHeader()}
      <div className="training-page__stats-row">
        <div className="training-page__stat-badge"><strong>Programadas:</strong> {totalPending}</div>
        <div className="training-page__stat-badge"><strong>Ejecutadas:</strong> {totalExecuted}</div>
        <div className="training-page__stat-badge"><strong>Pendientes:</strong> {totalPending - totalExecuted}</div>
        <div className="training-page__stat-badge"><strong>Vencidas:</strong> {totalOverdue}</div>
        <div className="training-page__stat-badge"><strong>Reprogramadas:</strong> {totalRescheduled}</div>
      </div>
      <div className="training-page__compliance-bar">
        <span className="training-page__compliance-label">Indicador de cumplimiento</span>
        <div className="training-page__progress-container">
          <div className="training-page__progress-bar">
            <div className={`training-page__progress-fill ${compliancePct <= 30 ? 'training-page__progress-fill--low' : compliancePct <= 70 ? 'training-page__progress-fill--medium' : 'training-page__progress-fill--high'}`} 
                 style={{ width: `${Math.min(100, compliancePct)}%` }} />
          </div>
          <span className="training-page__progress-pct">{compliancePct}%</span>
        </div>
      </div>
      {upcomingTrainings.length > 0 && (
        <div>
          <h4>Próximas Capacitaciones</h4>
          {upcomingTrainings.map((t) => (
            <div key={t.id} className="training-page__upcoming-item">
              <strong>{t.title}</strong> — {t.date} · {t.instructor}
            </div>
          ))}
        </div>
      )}
      <div className="training-page__group-summary">
        {SIDEBAR_ITEMS.filter((item) => item.id !== 'resumen').map((item) => (
          <button key={item.id} className="training-page__group-card" onClick={() => setSidebarTab(item.id as SidebarId)}>
            <strong style={{ fontSize: '.9rem' }}>{item.label}</strong>
          </button>
        ))}
      </div>
    </div>
  );

  const renderProgramaAnual = () => (
    <div className="training-page__section">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>📅 Programa Anual de Capacitación</h3>
        {!locked && <Button type="button" onClick={() => { setProgramForm({ id: '', year: new Date().getFullYear(), trainingName: '', objective: '', targetAudience: '', area: '', responsible: '', scheduledDate: '', trainingType: 'Capacitación SST', duration: '', status: 'Programada', comments: '' }); setShowProgramForm(true); }}>+ Agregar programa</Button>}
      </div>
      {showProgramForm && (
        <div className="training-page__form-card">
          <h4>{programForm.id ? 'Editar' : 'Nuevo'} Programa Anual</h4>
          <div className="grid grid-2">
            <label className="field"><span className="label">Año</span><input className="input" type="number" disabled={locked} value={programForm.year} onChange={(e) => setProgramForm({ ...programForm, year: Number(e.target.value) })} /></label>
            <label className="field"><span className="label">Nombre Capacitación</span><input className="input" disabled={locked} value={programForm.trainingName} onChange={(e) => setProgramForm({ ...programForm, trainingName: e.target.value })} /></label>
            <label className="field"><span className="label">Objetivo</span><input className="input" disabled={locked} value={programForm.objective} onChange={(e) => setProgramForm({ ...programForm, objective: e.target.value })} /></label>
            <label className="field"><span className="label">Audiencia Objetivo</span><input className="input" disabled={locked} value={programForm.targetAudience} onChange={(e) => setProgramForm({ ...programForm, targetAudience: e.target.value })} /></label>
            <label className="field"><span className="label">Área</span><input className="input" disabled={locked} value={programForm.area} onChange={(e) => setProgramForm({ ...programForm, area: e.target.value })} /></label>
            <label className="field"><span className="label">Responsable</span>
              <select className="input" disabled={locked} value={programForm.responsible} onChange={(e) => setProgramForm({ ...programForm, responsible: e.target.value })}>
                <option value="">Seleccionar...</option>
                {employees.map((emp) => <option key={emp._id} value={emp.name}>{emp.name}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Fecha Programada</span><input className="input" type="date" disabled={locked} value={programForm.scheduledDate} onChange={(e) => setProgramForm({ ...programForm, scheduledDate: e.target.value })} /></label>
            <label className="field"><span className="label">Tipo Capacitación</span>
              <div className="actions">
                <select className="input" disabled={locked} value={programForm.trainingType} onChange={(e) => setProgramForm({ ...programForm, trainingType: e.target.value })}>
                  {TRAINING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="input" placeholder="Otra..." disabled={locked} value={customTrainingType} onChange={(e) => setCustomTrainingType(e.target.value)} style={{ maxWidth: 120 }} />
                {customTrainingType && <Button type="button" variant="ghost" onClick={() => { setProgramForm({ ...programForm, trainingType: customTrainingType }); setCustomTrainingType(''); }}>Usar</Button>}
              </div>
            </label>
            <label className="field"><span className="label">Duración</span><input className="input" disabled={locked} value={programForm.duration} placeholder="Ej: 4 horas" onChange={(e) => setProgramForm({ ...programForm, duration: e.target.value })} /></label>
            <label className="field"><span className="label">Estado</span>
              <select className="input" disabled={locked} value={programForm.status} onChange={(e) => setProgramForm({ ...programForm, status: e.target.value })}>
                {PROGRAM_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Comentarios</span><textarea className="input" rows={2} disabled={locked} value={programForm.comments} onChange={(e) => setProgramForm({ ...programForm, comments: e.target.value })} /></label>
          </div>
          <div className="actions" style={{ marginTop: '.5rem' }}>
            <Button type="button" disabled={locked || !programForm.trainingName} onClick={() => {
              if (programForm.id) {
                setProgramItems(programItems.map((p) => p.id === programForm.id ? { ...programForm } : p));
                addAudit({ action: 'Modificar programa anual', user: 'Usuario actual', date: new Date().toLocaleString(), field: programForm.trainingName, previousValue: '', newValue: JSON.stringify(programForm) });
              } else {
                const newItem = { ...programForm, id: `prog-${Date.now()}` };
                setProgramItems([...programItems, newItem]);
                addAudit({ action: 'Crear programa anual', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'trainingName', previousValue: '', newValue: newItem.trainingName });
              }
              setShowProgramForm(false);
              markDirty();
            }}>
              {programForm.id ? 'Guardar cambios' : 'Crear programa'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowProgramForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Año</th>
              <th>Capacitación</th>
              <th>Objetivo</th>
              <th>Audiencia</th>
              <th>Responsable</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Estado</th>
              {!locked && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {programItems.map((p) => (
              <tr key={p.id}>
                <td>{p.year}</td>
                <td><strong>{p.trainingName}</strong></td>
                <td style={{ maxWidth: 200, fontSize: '.85rem' }}>{p.objective}</td>
                <td>{p.targetAudience}</td>
                <td>{p.responsible}</td>
                <td>{p.scheduledDate}</td>
                <td><span className="training-page__type-badge">{p.trainingType}</span></td>
                <td><span className={`training-page__status-dot training-page__status-dot--${p.status.toLowerCase().replace(/\s+/g, '_')}`}>{p.status}</span></td>
                {!locked && (
                  <td>
                    <div className="actions">
                      <Button type="button" variant="ghost" onClick={() => { setProgramForm(p); setShowProgramForm(true); }}>✏️</Button>
                      <Button type="button" variant="danger" onClick={() => { setProgramItems(programItems.filter((x) => x.id !== p.id)); addAudit({ action: 'Eliminar programa', user: 'Usuario actual', date: new Date().toLocaleString(), field: p.trainingName, previousValue: '', newValue: '' }); markDirty(); }}>🗑️</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {programItems.length === 0 && !showProgramForm && <p className="empty-state">No hay programas anuales definidos. Crea el primer programa.</p>}
    </div>
  );

  const renderCapacitaciones = () => (
    <div className="training-page__section">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>🎓 Capacitaciones</h3>
        {!locked && <Button type="button" onClick={() => { setTrainingForm({ id: '', title: '', description: '', instructor: '', date: '', duration: '', location: '', modality: 'Presencial', targetGroup: '', status: 'Programada', trainingType: 'Capacitación SST' }); setShowTrainingForm(true); }}>+ Registrar capacitación</Button>}
      </div>
      {showTrainingForm && (
        <div className="training-page__form-card">
          <h4>{trainingForm.id ? 'Editar' : 'Nueva'} Capacitación</h4>
          <div className="grid grid-2">
            <label className="field"><span className="label">Título</span><input className="input" disabled={locked} value={trainingForm.title} onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })} /></label>
            <label className="field"><span className="label">Instructor</span><input className="input" disabled={locked} value={trainingForm.instructor} onChange={(e) => setTrainingForm({ ...trainingForm, instructor: e.target.value })} /></label>
            <label className="field"><span className="label">Fecha</span><input className="input" type="date" disabled={locked} value={trainingForm.date} onChange={(e) => setTrainingForm({ ...trainingForm, date: e.target.value })} /></label>
            <label className="field"><span className="label">Duración</span><input className="input" disabled={locked} value={trainingForm.duration} placeholder="Ej: 4 horas" onChange={(e) => setTrainingForm({ ...trainingForm, duration: e.target.value })} /></label>
            <label className="field"><span className="label">Lugar</span><input className="input" disabled={locked} value={trainingForm.location} onChange={(e) => setTrainingForm({ ...trainingForm, location: e.target.value })} /></label>
            <label className="field"><span className="label">Modalidad</span>
              <select className="input" disabled={locked} value={trainingForm.modality} onChange={(e) => setTrainingForm({ ...trainingForm, modality: e.target.value })}>
                <option>Presencial</option><option>Virtual</option><option>Mixta</option>
              </select>
            </label>
            <label className="field"><span className="label">Grupo Objetivo</span><input className="input" disabled={locked} value={trainingForm.targetGroup} onChange={(e) => setTrainingForm({ ...trainingForm, targetGroup: e.target.value })} /></label>
            <label className="field"><span className="label">Tipo</span>
              <select className="input" disabled={locked} value={trainingForm.trainingType} onChange={(e) => setTrainingForm({ ...trainingForm, trainingType: e.target.value })}>
                {TRAINING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Estado</span>
              <select className="input" disabled={locked} value={trainingForm.status} onChange={(e) => setTrainingForm({ ...trainingForm, status: e.target.value })}>
                {PROGRAM_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="field"><span className="label">Descripción</span><textarea className="input" rows={2} disabled={locked} value={trainingForm.description} onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })} /></label>
          <div className="actions" style={{ marginTop: '.5rem' }}>
            <Button type="button" disabled={locked || !trainingForm.title} onClick={() => {
              if (trainingForm.id) {
                setTrainingRecords(trainingRecords.map((t) => t.id === trainingForm.id ? { ...trainingForm } : t));
                addAudit({ action: 'Modificar capacitación', user: 'Usuario actual', date: new Date().toLocaleString(), field: trainingForm.title, previousValue: '', newValue: JSON.stringify(trainingForm) });
              } else {
                const newItem = { ...trainingForm, id: `train-${Date.now()}` };
                setTrainingRecords([...trainingRecords, newItem]);
                addAudit({ action: 'Crear capacitación', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'title', previousValue: '', newValue: newItem.title });
              }
              setShowTrainingForm(false);
              markDirty();
            }}>
              {trainingForm.id ? 'Guardar cambios' : 'Registrar capacitación'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowTrainingForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Instructor</th>
              <th>Fecha</th>
              <th>Duración</th>
              <th>Modalidad</th>
              <th>Grupo</th>
              <th>Tipo</th>
              <th>Estado</th>
              {!locked && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {trainingRecords.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.title}</strong><br /><span className="muted" style={{ fontSize: '.8rem' }}>{t.description?.slice(0, 60)}</span></td>
                <td>{t.instructor}</td>
                <td>{t.date}</td>
                <td>{t.duration}</td>
                <td>{t.modality}</td>
                <td>{t.targetGroup}</td>
                <td><span className="training-page__type-badge">{t.trainingType}</span></td>
                <td><span className={`training-page__status-dot training-page__status-dot--${t.status.toLowerCase().replace(/\s+/g, '_')}`}>{t.status}</span></td>
                {!locked && (
                  <td>
                    <div className="actions">
                      <Button type="button" variant="ghost" onClick={() => { setTrainingForm(t); setShowTrainingForm(true); }}>✏️</Button>
                      <Button type="button" variant="danger" onClick={() => { setTrainingRecords(trainingRecords.filter((x) => x.id !== t.id)); addAudit({ action: 'Eliminar capacitación', user: 'Usuario actual', date: new Date().toLocaleString(), field: t.title, previousValue: '', newValue: '' }); markDirty(); }}>🗑️</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trainingRecords.length === 0 && !showTrainingForm && <p className="empty-state">No hay capacitaciones registradas.</p>}
      {/* Missed training workflow */}
      {!locked && (
        <div className="training-page__section" style={{ marginTop: '.5rem' }}>
          <h4>⚡ Capacitación no ejecutada</h4>
          {showJustification ? (
            <div className="grid grid-2">
              <select className="input" value={justificationForm.trainingId} onChange={(e) => setJustificationForm({ ...justificationForm, trainingId: e.target.value })}>
                <option value="">Seleccionar capacitación...</option>
                {trainingRecords.filter((t) => t.status !== 'Ejecutada').map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <input className="input" placeholder="Razón" value={justificationForm.reason} onChange={(e) => setJustificationForm({ ...justificationForm, reason: e.target.value })} />
              <input className="input" type="date" value={justificationForm.newDate} onChange={(e) => setJustificationForm({ ...justificationForm, newDate: e.target.value })} />
              <input className="input" placeholder="Nuevo responsable" value={justificationForm.responsible} onChange={(e) => setJustificationForm({ ...justificationForm, responsible: e.target.value })} />
              <div className="actions" style={{ gridColumn: '1 / -1' }}>
                <Button type="button" disabled={!justificationForm.trainingId || !justificationForm.reason} onClick={() => {
                  setTrainingRecords(trainingRecords.map((t) => t.id === justificationForm.trainingId ? { ...t, status: 'Reprogramada', date: justificationForm.newDate || t.date } : t));
                  addAudit({ action: 'Reprogramar capacitación', user: 'Usuario actual', date: new Date().toLocaleString(), field: justificationForm.trainingId, previousValue: '', newValue: `${justificationForm.reason} · Nueva fecha: ${justificationForm.newDate}` });
                  notify('Capacitación reprogramada. Se notificó al MANAGER automáticamente.');
                  setShowJustification(false);
                  setJustificationForm({ trainingId: '', reason: '', newDate: '', responsible: '' });
                  markDirty();
                }}>✅ Reprogramar y notificar MANAGER</Button>
                <Button type="button" variant="secondary" onClick={() => setShowJustification(false)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setShowJustification(true)}>⚡ Reportar capacitación no ejecutada</Button>
          )}
        </div>
      )}
    </div>
  );

  const renderAsistencias = () => (
    <div className="training-page__section">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>👥 Asistencias</h3>
        {!locked && <Button type="button" onClick={() => setShowAttendanceForm(!showAttendanceForm)}>+ Registrar asistencia</Button>}
      </div>
      {showAttendanceForm && (
        <div className="training-page__form-card">
          <h4>Registro de Asistencia</h4>
          <div className="grid grid-2">
            <label className="field"><span className="label">Capacitación</span>
              <select className="input" onChange={(e) => {/* select training */}}>
                <option value="">Seleccionar...</option>
                {trainingRecords.map((t) => <option key={t.id} value={t.id}>{t.title} - {t.date}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Método</span>
              <select className="input">
                <option value="PHYSICAL">📄 Subir lista escaneada (PDF/Imagen)</option>
                <option value="DIGITAL">✍️ Firmas digitales</option>
              </select>
            </label>
          </div>
          <div className="training-page__upload-zone">
            <span className="training-page__upload-text">📎 Arrastra o selecciona archivo (PDF, imagen)</span>
            <input type="file" accept=".pdf,image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) notify(`Archivo seleccionado: ${file.name}`);
            }} />
          </div>
          <p className="muted" style={{ fontSize: '.85rem' }}>Método 1: Carga lista de asistencia escaneada (PDF / Imagen). Método 2: Reutiliza WorkerSignatureCampaignEngine para firmas digitales.</p>
        </div>
      )}
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Capacitación</th>
              <th>Método</th>
              <th>Empleado</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {attendanceRecords.length === 0 && <tr><td colSpan={5}><p className="empty-state">No hay registros de asistencia.</p></td></tr>}
            {attendanceRecords.map((a) => (
              <tr key={a.id}>
                <td>{a.trainingTitle}</td>
                <td>{a.method === 'PHYSICAL' ? '📄 Física' : '✍️ Digital'}</td>
                <td>{a.employeeName || '—'}</td>
                <td><span className="training-badge training-badge--success">{a.signedAt ? '✅ Firmado' : '⏳ Pendiente'}</span></td>
                <td>{a.signedAt ? new Date(a.signedAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderEvaluaciones = () => (
    <div className="training-page__section">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>📝 Evaluaciones (estilo Moodle)</h3>
        {!locked && <Button type="button" onClick={() => { setEvaluationForm({ trainingId: '', questionType: 'MULTIPLE_CHOICE', question: '', options: '', correctAnswer: '', passingScore: 70 }); setShowEvaluationForm(true); }}>+ Crear evaluación</Button>}
      </div>
      {showEvaluationForm && (
        <div className="training-page__form-card">
          <h4>Nueva Evaluación</h4>
          <div className="grid grid-2">
            <label className="field"><span className="label">Capacitación</span>
              <select className="input" value={evaluationForm.trainingId} onChange={(e) => setEvaluationForm({ ...evaluationForm, trainingId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {trainingRecords.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Tipo de pregunta</span>
              <select className="input" value={evaluationForm.questionType} onChange={(e) => setEvaluationForm({ ...evaluationForm, questionType: e.target.value as any })}>
                <option value="MULTIPLE_CHOICE">Selección múltiple</option>
                <option value="TRUE_FALSE">Verdadero / Falso</option>
                <option value="SINGLE_ANSWER">Respuesta única</option>
              </select>
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}><span className="label">Pregunta</span><textarea className="input" rows={2} value={evaluationForm.question} onChange={(e) => setEvaluationForm({ ...evaluationForm, question: e.target.value })} /></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}><span className="label">Opciones (separadas por comas)</span><input className="input" value={evaluationForm.options} onChange={(e) => setEvaluationForm({ ...evaluationForm, options: e.target.value })} placeholder="Opción A, Opción B, Opción C" /></label>
            <label className="field"><span className="label">Respuesta correcta</span><input className="input" value={evaluationForm.correctAnswer} onChange={(e) => setEvaluationForm({ ...evaluationForm, correctAnswer: e.target.value })} /></label>
            <label className="field"><span className="label">Nota de aprobación (%)</span><input className="input" type="number" value={evaluationForm.passingScore} onChange={(e) => setEvaluationForm({ ...evaluationForm, passingScore: Number(e.target.value) })} /></label>
          </div>
          <div className="actions" style={{ marginTop: '.5rem' }}>
            <Button type="button" disabled={!evaluationForm.question || !evaluationForm.trainingId} onClick={() => {
              const newEval: EvaluationRecord = {
                id: `eval-${Date.now()}`,
                ...evaluationForm,
                options: evaluationForm.options.split(',').map((o) => o.trim()),
                attempts: [],
              };
              setEvaluationRecords([...evaluationRecords, newEval]);
              setShowEvaluationForm(false);
              addAudit({ action: 'Crear evaluación', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'question', previousValue: '', newValue: evaluationForm.question });
              markDirty();
            }}>Crear evaluación</Button>
            <Button type="button" variant="secondary" onClick={() => setShowEvaluationForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {evaluationRecords.map((ev) => (
        <div key={ev.id} className="training-page__eval-card">
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <strong>{ev.question}</strong>
            <span className="training-page__type-badge">{ev.questionType === 'MULTIPLE_CHOICE' ? 'Selección múltiple' : ev.questionType === 'TRUE_FALSE' ? 'V/F' : 'Respuesta única'}</span>
          </div>
          <p className="muted">Opciones: {ev.options.join(', ')} · Correcta: {ev.correctAnswer} · Aprobación: {ev.passingScore}%</p>
          {ev.attempts.length > 0 && (
            <div>
              <h4>Intentos ({ev.attempts.length})</h4>
              {ev.attempts.map((att, i) => (
                <div key={i} className="training-page__attempt-item">
                  <strong>{att.employeeName}</strong> — Puntaje: {att.score}/{ev.options.length} ({att.percentage}%) — {att.passed ? '✅ Aprobó' : '❌ Reprobó'}
                </div>
              ))}
            </div>
          )}
          {!locked && (
            <div className="actions">
              <Button type="button" variant="ghost" onClick={() => {
                setEvalAttemptForm({ employeeId: '', employeeName: '', score: 0, passed: false, percentage: 0 });
                const emp = prompt('Nombre del empleado:');
                const score = parseInt(prompt('Puntaje obtenido:') || '0', 10);
                if (emp) {
                  const pct = ev.options.length > 0 ? Math.round((score / ev.options.length) * 100) : 0;
                  setEvaluationRecords(evaluationRecords.map((e) => e.id === ev.id ? { ...e, attempts: [...e.attempts, { employeeId: '', employeeName: emp, score, passed: pct >= ev.passingScore, percentage: pct, date: new Date().toISOString() }] } : e));
                  markDirty();
                }
              }}>➕ Agregar intento</Button>
            </div>
          )}
        </div>
      ))}
      {evaluationRecords.length === 0 && !showEvaluationForm && <p className="empty-state">No hay evaluaciones creadas.</p>}
    </div>
  );

  const renderCertificados = () => (
    <div className="training-page__section">
      <h3>🏆 Certificados</h3>
      <p className="muted">Generación automática de certificados con: logo empresa, nombre trabajador, capacitación, fecha, horas, puntaje, firma digital y código de verificación.</p>
      {!locked && (
        <div className="actions">
          <Button type="button" variant="secondary" onClick={() => {
            const employee = prompt('Nombre del empleado:');
            const training = prompt('Capacitación:');
            const hours = parseInt(prompt('Horas:') || '0', 10);
            const score = parseInt(prompt('Puntaje (0-100):') || '0', 10);
            if (employee && training && hours > 0) {
              const newCert: CertificateRecord = {
                id: `cert-${Date.now()}`,
                trainingId: '',
                trainingTitle: training,
                employeeName: employee,
                employeeId: '',
                date: new Date().toISOString().slice(0, 10),
                hours,
                score,
                verificationCode: `CERT-${Date.now().toString(36).toUpperCase()}`,
                issuedAt: new Date().toISOString(),
              };
              setCertificateRecords([...certificateRecords, newCert]);
              addAudit({ action: 'Generar certificado', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'employeeName', previousValue: '', newValue: employee });
              markDirty();
              notify(`✅ Certificado generado: ${newCert.verificationCode}`);
            }
          }}>🎓 Generar certificado</Button>
        </div>
      )}
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Capacitación</th>
              <th>Fecha</th>
              <th>Horas</th>
              <th>Puntaje</th>
              <th>Código Verificación</th>
            </tr>
          </thead>
          <tbody>
            {certificateRecords.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.employeeName}</strong></td>
                <td>{c.trainingTitle}</td>
                <td>{c.date}</td>
                <td>{c.hours}h</td>
                <td><span className={c.score >= 70 ? 'badge badge--success' : 'badge badge--danger'}>{c.score}%</span></td>
                <td><code style={{ fontSize: '.8rem', color: '#2563eb' }}>{c.verificationCode}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {certificateRecords.length === 0 && <p className="empty-state">No hay certificados generados.</p>}
    </div>
  );

  const renderEvidencias = () => (
    <div className="training-page__section">
      <h3>📄 Evidencias</h3>
      <p className="muted">Formatos aceptados: PDF, imágenes, PowerPoint, videos, Word, ZIP. Se almacena historial de versiones.</p>
      {!locked && (
        <div className="training-page__upload-zone">
          <span className="training-page__upload-text">📎 Arrastra o selecciona archivos de evidencia</span>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.ppt,.pptx,.mp4,.avi,.mov,.doc,.docx,.zip" onChange={(e) => {
            const files = Array.from(e.target.files || []);
            const newEvs = files.map((f) => ({ id: `ev-${Date.now()}-${f.name}`, trainingId: '', trainingTitle: '', fileName: f.name, fileUrl: URL.createObjectURL(f), fileType: f.type || f.name.split('.').pop() || 'document', version: 1, uploadedAt: new Date().toISOString(), uploadedBy: 'Usuario actual' }));
            setEvidenceRecords([...evidenceRecords, ...newEvs]);
            addAudit({ action: 'Subir evidencias', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'evidence', previousValue: '', newValue: `${newEvs.length} archivo(s)` });
            notify(`${newEvs.length} evidencia(s) cargada(s).`);
            markDirty();
          }} />
        </div>
      )}
      <div className="training-page__evidence-grid">
        {evidenceRecords.map((ev) => (
          <div key={ev.id} className="training-page__evidence-card">
            <strong>{ev.fileName}</strong>
            <span className="muted" style={{ fontSize: '.8rem' }}>v{ev.version} · {new Date(ev.uploadedAt).toLocaleString()}</span>
            {ev.fileUrl && <a className="btn btn-ghost" href={ev.fileUrl} target="_blank" rel="noreferrer">Ver</a>}
          </div>
        ))}
      </div>
      {evidenceRecords.length === 0 && <p className="empty-state">No hay evidencias cargadas.</p>}
    </div>
  );

  const renderIndicadores = () => {
    const totalEvaluations = evaluationRecords.length;
    const totalAttempts = evaluationRecords.reduce((s, e) => s + e.attempts.length, 0);
    const approvedAttempts = evaluationRecords.reduce((s, e) => s + e.attempts.filter((a) => a.passed).length, 0);
    const failedAttempts = totalAttempts - approvedAttempts;
    const avgScore = totalAttempts > 0 ? Math.round(evaluationRecords.reduce((s, e) => s + e.attempts.reduce((s2, a) => s2 + a.percentage, 0), 0) / totalAttempts) : 0;
    const attendancePct = totalProgrammed > 0 ? Math.round((attendanceRecords.length / totalProgrammed) * 100) : 0;

    return (
      <div className="training-page__section">
        <h3>📊 Indicadores</h3>
        <div className="training-page__kpi-grid">
          <article className="training-page__kpi-card">
            <span className="training-page__kpi-label">Cumplimiento Capacitación</span>
            <span className="training-page__kpi-value">{compliancePct}%</span>
          </article>
          <article className="training-page__kpi-card">
            <span className="training-page__kpi-label">Asistencia %</span>
            <span className="training-page__kpi-value">{attendancePct}%</span>
          </article>
          <article className="training-page__kpi-card">
            <span className="training-page__kpi-label">Promedio Evaluación</span>
            <span className="training-page__kpi-value">{avgScore}%</span>
          </article>
          <article className="training-page__kpi-card training-page__kpi-card--success">
            <span className="training-page__kpi-label">Aprobados</span>
            <span className="training-page__kpi-value">{approvedAttempts}</span>
          </article>
          <article className="training-page__kpi-card training-page__kpi-card--danger">
            <span className="training-page__kpi-label">Reprobados</span>
            <span className="training-page__kpi-value">{failedAttempts}</span>
          </article>
          <article className="training-page__kpi-card">
            <span className="training-page__kpi-label">Certificados Emitidos</span>
            <span className="training-page__kpi-value">{certificateRecords.length}</span>
          </article>
        </div>
        {/* Charts section */}
        <h4>Dashboard Charts</h4>
        <div className="training-page__chart-grid">
          {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => {
            const monthTrainings = trainingRecords.filter((t) => parseInt(t.date?.split('-')[1] || '0', 10) === i + 1);
            const executed = monthTrainings.filter((t) => t.status === 'Ejecutada').length;
            const planned = monthTrainings.length;
            return (
              <div key={m} className="training-page__chart-bar-item">
                <div className="training-page__chart-bar-container">
                  <div className="training-page__chart-bar training-page__chart-bar--executed" style={{ height: `${executed > 0 ? (executed / Math.max(planned, 1)) * 100 : 5}%` }} />
                  <div className="training-page__chart-bar training-page__chart-bar--planned" style={{ height: `${planned > 0 ? 100 : 5}%`, opacity: 0.5 }} />
                </div>
                <span className="training-page__chart-label">{m}</span>
                <span className="muted" style={{ fontSize: '.65rem' }}>{executed}/{planned}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAlertas = () => (
    <div className="training-page__section">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>🔔 Alertas</h3>
        <Button type="button" variant="secondary" onClick={generateAlerts}>🔍 Generar alertas automáticas</Button>
      </div>
      <p className="muted">Recordatorios automáticos: 30, 10, 5, 2 días antes. Destinatarios: ADMIN, MANAGER. Capacitaciones vencidas se marcan automáticamente.</p>
      {alertLog.length === 0 ? (
        <p className="empty-state">No hay alertas generadas. Haz clic en "Generar alertas".</p>
      ) : (
        <div className="training-page__alert-list">
          {alertLog.map((a) => (
            <div key={a.id} className={`training-page__alert-item ${a.type === 'VENCIDA' ? 'training-page__alert-item--danger' : 'training-page__alert-item--warning'}`}>
              <span className="training-page__alert-icon">{a.type === 'VENCIDA' ? '⛔' : '🔔'}</span>
              <div>
                <strong>{a.message}</strong>
                <p className="muted" style={{ fontSize: '.8rem' }}>Vence: {a.dueDate} · Destinatarios: {a.recipients.join(', ')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderAprobaciones = () => (
    <div className="training-page__section">
      <h3>✍ Aprobaciones</h3>
      <p className="muted">El MANAGER debe aprobar el programa anual y las modificaciones mayores. Se requiere firma digital.</p>
      <div className="training-page__approval-steps">
        <div className={`training-page__approval-step ${approvalStatus === 'DRAFT' ? 'training-page__approval-step--active' : ''}`}>
          <span className="training-page__approval-icon">📝</span>
          <strong>Borrador</strong>
        </div>
        <div className="training-page__approval-connector" />
        <div className={`training-page__approval-step ${approvalStatus === 'PENDING_APPROVAL' ? 'training-page__approval-step--active' : approvalStatus === 'APPROVED' ? 'training-page__approval-step--done' : ''}`}>
          <span className="training-page__approval-icon">⏳</span>
          <strong>Pendiente</strong>
        </div>
        <div className="training-page__approval-connector" />
        <div className={`training-page__approval-step ${approvalStatus === 'APPROVED' ? 'training-page__approval-step--active' : ''}`}>
          <span className="training-page__approval-icon">✅</span>
          <strong>Aprobado</strong>
        </div>
        <div className="training-page__approval-connector" />
        <div className={`training-page__approval-step ${approvalStatus === 'ARCHIVED' ? 'training-page__approval-step--active' : ''}`}>
          <span className="training-page__approval-icon">📦</span>
          <strong>Archivado</strong>
        </div>
      </div>
      <div className="actions" style={{ marginTop: '.5rem' }}>
        {approvalStatus === 'DRAFT' && <Button type="button" onClick={() => { setApprovalStatus('PENDING_APPROVAL'); addAudit({ action: 'Enviar a aprobación', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'DRAFT', newValue: 'PENDING_APPROVAL' }); markDirty(); notify('Enviado a aprobación.'); }}>📤 Enviar a aprobación</Button>}
        {approvalStatus === 'PENDING_APPROVAL' && <Button type="button" onClick={async () => { try { const saved = await approveTrainingManagementAdvanced(token, { status: 'APPROVED', comments: 'Aprobado por Manager' }); if (saved) { setApprovalStatus('APPROVED'); setLocked(true); const newVer = (parseFloat(currentVersion) + 0.1).toFixed(1); setCurrentVersion(newVer); setVersions([{ version: newVer, createdAt: new Date().toISOString(), createdBy: 'Sistema', approvedBy: 'Manager', approvedAt: new Date().toISOString() }, ...versions]); addAudit({ action: 'Aprobar programa', user: 'Manager', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'PENDING_APPROVAL', newValue: 'APPROVED' }); setRecord(saved); markDirty(); notify('Programa aprobado y persistido en backend.'); } } catch { notify('Error al aprobar en backend.'); } }}>✅ Aprobar (Manager)</Button>}
        {approvalStatus === 'PENDING_APPROVAL' && <Button type="button" variant="secondary" onClick={() => { setApprovalStatus('DRAFT'); addAudit({ action: 'Rechazar aprobación', user: 'Manager', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'PENDING_APPROVAL', newValue: 'DRAFT' }); markDirty(); notify('Devuelto a borrador.'); }}>↩️ Rechazar / Devolver</Button>}
        {approvalStatus === 'APPROVED' && <Button type="button" variant="ghost" onClick={() => { setApprovalStatus('ARCHIVED'); addAudit({ action: 'Archivar programa', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'APPROVED', newValue: 'ARCHIVED' }); markDirty(); notify('Programa archivado.'); }}>📦 Archivar</Button>}
      </div>
    </div>
  );

  const renderVersiones = () => (
    <div className="training-page__section">
      <h3>📂 Versiones</h3>
      <p className="muted">Historial de versiones del programa de capacitación.</p>
      {versions.length === 0 ? <p className="empty-state">Aún no hay versiones.</p> : (
        <div className="training-page__versions-list">
          {versions.map((v) => (
            <div key={v.version} className={`training-page__version-card ${v.version === currentVersion ? 'training-page__version-card--current' : ''}`}>
              <div className="training-page__version-header">
                <span className="training-page__version-badge">v{v.version}</span>
                {v.version === currentVersion && <span className="training-page__version-current-badge">Actual</span>}
                <span className="muted">{new Date(v.createdAt).toLocaleString()}</span>
              </div>
              <p><strong>Creado por:</strong> {v.createdBy}</p>
              {v.approvedBy && <p><strong>Aprobado por:</strong> {v.approvedBy} {v.approvedAt ? `el ${new Date(v.approvedAt).toLocaleString()}` : ''}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderHistorial = () => (
    <div className="training-page__section">
      <h3>🕓 Historial de Auditoría</h3>
      <p className="muted">Seguimiento de todas las acciones: creado, modificado, eliminado, reprogramado, ejecutado, aprobado, firmado, certificado.</p>
      {auditHistory.length === 0 ? <p className="empty-state">No hay movimientos registrados.</p> : (
        <div className="responsive-table">
          <table className="table">
            <thead>
              <tr>
                <th>Acción</th>
                <th>Usuario</th>
                <th>Fecha / Hora</th>
                <th>Campo</th>
                <th>Valor anterior</th>
                <th>Valor nuevo</th>
              </tr>
            </thead>
            <tbody>
              {auditHistory.map((entry, i) => (
                <tr key={i}>
                  <td><span className="training-page__audit-action">{entry.action}</span></td>
                  <td>{entry.user}</td>
                  <td>{entry.date}</td>
                  <td>{entry.field ?? '—'}</td>
                  <td style={{ color: '#b91c1c', fontSize: '.85rem' }}>{entry.previousValue ?? '—'}</td>
                  <td style={{ color: '#15803d', fontSize: '.85rem' }}>{entry.newValue ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <div className="training-page">
      {showUnsavedModal && (
        <div className="modal-overlay" onClick={cancelNavigation}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Cambios sin guardar</h3>
            <p>Hay cambios sin guardar. ¿Qué deseas hacer?</p>
            <div className="actions">
              <Button type="button" onClick={saveAndNavigate}>Guardar y salir</Button>
              <Button type="button" variant="secondary" onClick={confirmNavigation}>Salir sin guardar</Button>
              <Button type="button" variant="ghost" onClick={cancelNavigation}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      <header className="training-page__header">
        <div className="training-page__header-left">
          <button className="training-page__back" onClick={() => handleNavigate('/documents/plan')} title="Volver al plan">← Volver</button>
          <div>
            <p className="muted">Estándar 1.2.1</p>
            <h2>Programa de Capacitación PyP</h2>
          </div>
        </div>
        <div className="training-page__header-actions">
          <span className={badge.className}>{badge.label}</span>
          <Button type="button" disabled={loading || !dirty} onClick={() => void save()}>{loading ? 'Guardando...' : '💾 Guardar'}</Button>
          <Button type="button" variant="ghost" onClick={() => {
            const lines = ['=== PROGRAMA DE CAPACITACIÓN PyP ===', `Versión: v${currentVersion}`, `Estado: ${approvalStatus}`, `Generado: ${new Date().toLocaleString()}`, '', `Programas: ${totalProgrammed}`, `Capacitaciones: ${trainingRecords.length}`, `Ejecutadas: ${totalExecuted}`, `Cumplimiento: ${compliancePct}%`, `Certificados: ${certificateRecords.length}`, '', '=== FIN ==='];
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `capacitacion-pyp-v${currentVersion}.txt`; a.click(); URL.revokeObjectURL(url);
            notify('📄 Reporte exportado.');
          }}>📄 Exportar</Button>
        </div>
        {lastSaved && <div className="training-page__last-saved">Último guardado: {lastSaved}</div>}
      </header>

      {toast && <div className="toast-alert" style={{ margin: '0 1rem' }}><p>{toast}</p></div>}

      {approvalStatus === 'APPROVED' && <div className="training-page__banner training-page__banner--success">✅ Programa aprobado (v{currentVersion}). Contenido bloqueado.</div>}
      {approvalStatus === 'ARCHIVED' && <div className="training-page__banner training-page__banner--archived">📦 Programa archivado.</div>}
      {approvalStatus === 'PENDING_APPROVAL' && <div className="training-page__banner training-page__banner--warning">⏳ Pendiente de aprobación por Manager.</div>}

      <div className="training-page__body">
        <nav className="training-page__sidebar">
          {SIDEBAR_ITEMS.map((item) => (
            <button key={item.id} className={`training-page__sidebar-item ${sidebarTab === item.id ? 'training-page__sidebar-item--active' : ''}`} onClick={() => setSidebarTab(item.id as SidebarId)}>
              {item.label}
            </button>
          ))}
        </nav>

        <main className="training-page__content">
          {loading && !initialLoadDone.current && <p className="muted">Cargando...</p>}
          {sidebarTab === 'resumen' && renderResumen()}
          {sidebarTab === 'programa-anual' && renderProgramaAnual()}
          {sidebarTab === 'capacitaciones' && renderCapacitaciones()}
          {sidebarTab === 'asistencias' && renderAsistencias()}
          {sidebarTab === 'evaluaciones' && renderEvaluaciones()}
          {sidebarTab === 'certificados' && renderCertificados()}
          {sidebarTab === 'evidencias' && renderEvidencias()}
          {sidebarTab === 'indicadores' && renderIndicadores()}
          {sidebarTab === 'alertas' && renderAlertas()}
          {sidebarTab === 'aprobaciones' && renderAprobaciones()}
          {sidebarTab === 'versiones' && renderVersiones()}
          {sidebarTab === 'historial' && renderHistorial()}
          {dirty && <div className="training-page__dirty-bar">⚠ Hay cambios sin guardar {lastSaved && <span style={{ marginLeft: '1rem', fontSize: '.85rem' }}>Último guardado: {lastSaved}</span>}</div>}
        </main>
      </div>
    </div>
  );
}
