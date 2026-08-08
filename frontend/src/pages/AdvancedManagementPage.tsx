import { useCallback, useEffect, useRef, useState, Fragment } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ResourceAssignmentModule from '../components/ResourceAssignmentModule';
import TrainingProgramModule from '../components/TrainingProgramModule';
import PolicyManagementModule from '../components/PolicyManagementModule';
import ResponsableSstPanel from '../components/ResponsableSstPanel';
import CopasstManagementPage from './CopasstManagementPage';
import ConvivenciaManagementPage from './ConvivenciaManagementPage';
import { AnnualWorkPlanPage } from './AnnualWorkPlanPage';
import {
  EmployeeModel,
  ResponsableSstComplianceStatus,
  ResponsibilityRowModel,
  fetchResponsibilitiesAdvanced,
  updateResponsibilitiesAdvanced,
  submitResponsibilitiesAdvanced,
  approveResponsibilitiesAdvanced,
  rejectResponsibilitiesAdvanced,
  fetchEmployees,
  fetchPendingAcceptances,
  fetchMyAcceptances,
  fetchAcceptanceStats,
  assignResponsibilitiesBatch,
  acceptResponsibilities,
  requestCorrection,
  createAcceptanceCycle,
  fetchAcceptanceReminders,
  fetchComplianceWithAcceptance,
  processRenewals,
  fetchAcceptanceHistory,

  ResponsibilityAcceptanceModel,
  AcceptanceStatsModel,
  ComplianceWithAcceptanceModel,
} from '../api';
import SocializationDashboard from '../components/SocializationDashboard';
import { Button } from '../components/ui/Button';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
} from '../components/advanced-layout';
import { AdvancedModuleReportTemplate } from '../pdf/templates/AdvancedModuleReportTemplate';
import { exportAdvancedPdf } from '../pdf/utils/exportAdvancedPdf';

// ============================================================
// CONSTANTS & DEFAULT DATA
// ============================================================

const SIDEBAR_ITEMS = [
  { id: 'resumen', label: '📋 Resumen' },
  { id: 'gerencia', label: '👨‍💼 Gerencia' },
  { id: 'responsable-sst', label: '🦺 Responsable SST' },
  { id: 'trabajadores', label: '👷 Trabajadores' },
  { id: 'copasst', label: '🤝 COPASST' },
  { id: 'convivencia', label: '❤️ Comité de Convivencia' },
  { id: 'brigada', label: '🚨 Brigada de Emergencias' },
  { id: 'aprobaciones', label: '✍ Aprobaciones' },
  { id: 'versiones', label: '📂 Versiones' },
  { id: 'historial', label: '🕓 Historial' },
  { id: 'aceptaciones', label: '✍ Aceptaciones' },
  { id: 'pendientes', label: '⏳ Pendientes por firmar' },
  { id: 'renovaciones', label: '🔄 Renovaciones' },
  { id: 'socializacion', label: '📢 Socialización' },
] as const;

const ACCEPTANCE_STEPS = [
  { label: 'Manager aprueba', icon: '✅' },
  { label: 'Asignación', icon: '👥' },
  { label: 'Revisión', icon: '📖' },
  { label: 'Firma digital', icon: '✍' },
  { label: 'Aceptación', icon: '📋' },
];

type SidebarId = (typeof SIDEBAR_ITEMS)[number]['id'];

const STANDARD_LABELS: Record<string, { title: string; code: string }> = {
  '1.1.1': { title: 'Responsable SG-SST', code: '1.1.1' },
  '1.1.2': { title: 'Responsabilidades en SG-SST', code: '1.1.2' },
  '1.1.3': { title: 'Asignación de Recursos SG-SST', code: '1.1.3' },
  '1.2.1': { title: 'Programa de Capacitación PyP', code: '1.2.1' },
  '2.1.1': { title: 'Política de Seguridad y Salud en el Trabajo', code: '2.1.1' },
};

// Default responsibilities by category/group
const DEFAULT_RESPONSIBILITIES_BY_GROUP: Record<string, ResponsibilityRowModel[]> = {
  Gerencia: [
    { category: 'Gerencia', role: 'MANAGER', title: 'Aprobar política SST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Aprobar presupuesto SST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Garantizar recursos para el SG-SST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Designar responsable SST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Revisar resultados del SG-SST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Participar en rendición de cuentas', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Aprobar planes de mejoramiento', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Garantizar cumplimiento legal SST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
  ],
  'Responsable SST': [
    { category: 'Responsable SST', role: 'ADMIN', title: 'Implementar SG-SST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Mantener documentación SST', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Coordinar capacitaciones SST', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Actualizar matriz legal', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Gestionar indicadores SST', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Gestionar auditorías', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Coordinar COPASST', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Coordinar Comité de Convivencia', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Gestionar acciones correctivas', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
  ],
  Trabajadores: [
    { category: 'Trabajadores', role: 'MEMBER', title: 'Cumplir normas SST', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Trabajadores', role: 'MEMBER', title: 'Usar EPP correctamente', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Trabajadores', role: 'MEMBER', title: 'Participar en capacitaciones SST', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Trabajadores', role: 'MEMBER', title: 'Reportar condiciones inseguras', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Trabajadores', role: 'MEMBER', title: 'Reportar incidentes de trabajo', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Trabajadores', role: 'MEMBER', title: 'Participar en simulacros', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
  ],
  COPASST: [
    { category: 'COPASST', role: 'MEMBER', title: 'Participar en reuniones COPASST', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'COPASST', role: 'MEMBER', title: 'Realizar inspecciones de seguridad', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'COPASST', role: 'MEMBER', title: 'Investigar incidentes y accidentes', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'COPASST', role: 'MEMBER', title: 'Promover SST en la organización', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'COPASST', role: 'MEMBER', title: 'Hacer seguimiento a acciones correctivas', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
  ],
  'Comité de Convivencia': [
    { category: 'Comité de Convivencia', role: 'MEMBER', title: 'Gestionar casos de convivencia laboral', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Comité de Convivencia', role: 'MEMBER', title: 'Promover ambiente laboral sano', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Comité de Convivencia', role: 'MEMBER', title: 'Mantener confidencialidad de casos', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Comité de Convivencia', role: 'MEMBER', title: 'Realizar seguimiento a casos', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
  ],
  'Brigada de Emergencias': [
    { category: 'Brigada de Emergencias', role: 'MEMBER', title: 'Participar en simulacros de emergencia', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Brigada de Emergencias', role: 'MEMBER', title: 'Atender emergencias', employeeId: '', active: true, requiresSignature: true, status: 'PENDIENTE', signature: {} },
    { category: 'Brigada de Emergencias', role: 'MEMBER', title: 'Apoyar evacuaciones', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Brigada de Emergencias', role: 'MEMBER', title: 'Revisar equipos de emergencia', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
    { category: 'Brigada de Emergencias', role: 'MEMBER', title: 'Participar en entrenamientos', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} },
  ],
};

const GROUP_CATEGORIES = Object.keys(DEFAULT_RESPONSIBILITIES_BY_GROUP);

// UI helpers
function complianceBadge(status?: ResponsableSstComplianceStatus) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'advanced-management__badge advanced-management__badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'advanced-management__badge advanced-management__badge--danger' };
  return { label: '⚠ Pendiente', className: 'advanced-management__badge advanced-management__badge--warning' };
}

function statusBadgeClass(status?: string) {
  if (status === 'FIRMADO') return 'advanced-management__badge advanced-management__badge--success';
  if (status === 'PENDIENTE') return 'advanced-management__badge advanced-management__badge--warning';
  return 'advanced-management__badge advanced-management__badge--danger';
}

const GROUP_ICONS: Record<string, string> = {
  Gerencia: '👨‍💼',
  'Responsable SST': '🦺',
  Trabajadores: '👷',
  COPASST: '🤝',
  'Comité de Convivencia': '❤️',
  'Brigada de Emergencias': '🚨',
};

// ============================================================
// INTERFACES FOR VERSIONING, APPROVAL & AUDIT
// ============================================================

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

type ApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'REJECTED' | 'APPROVED' | 'APPROVED_AND_SIGNED' | 'SOCIALIZED' | 'ARCHIVED';

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
// RESPONSABLE SG-SST (PHVA 1.1.1)
// ============================================================

/**
 * Página dedicada al módulo PHVA 1.1.1 (Responsable del SG-SST).
 *
 * Reutiliza el layout estándar del Advanced Management (AdvancedPageLayout +
 * AdvancedHeader) y delega al panel ResponsableSstPanel todo el ciclo de
 * aprobación (submit/approve/reject), los banners de estado y el bloqueo de
 * edición cuando el documento está aprobado. Soporta modo normal y modo
 * review (/advanced-management/1.1.1?mode=review).
 */
function ResponsableSstAdvancedPage({ token, role }: { token: string; role?: string }) {
  const [searchParams] = useSearchParams();
  const isReviewMode = searchParams.get('mode') === 'review';

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/plan"
        backLabel="← Volver a Implementación"
        moduleCode="1.1.1"
        moduleTitle="Responsable SG-SST"
        description="Gestión del responsable del SG-SST: información, formación, licencia y designación"
        statusBadge={<span className="badge badge--warning">🦺 Responsable SG-SST</span>}
      />
      <ResponsableSstPanel
        token={token}
        canApprove={role === 'owner' || role === 'manager'}
        reviewMode={isReviewMode}
        onComplianceChange={() => undefined}
        onDirtyChange={() => undefined}
        saveRequest={0}
        discardRequest={0}
        onSaved={() => undefined}
      />
    </AdvancedPageLayout>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function AdvancedManagementPage({ token, role }: { token: string; role?: string }) {
  const { standardCode } = useParams<{ standardCode: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReviewMode = searchParams.get('mode') === 'review';
  const standard = STANDARD_LABELS[standardCode ?? ''] ?? { title: `Estándar ${standardCode}`, code: standardCode ?? '' };

  // Route to dedicated full-page modules
  if (standardCode === '1.1.1') {
    return <ResponsableSstAdvancedPage token={token} role={role} />;
  }
  if (standardCode === '1.1.6') {
    return <CopasstManagementPage token={token} role={role} />;
  }
  if (standardCode === '1.1.8') {
    return <ConvivenciaManagementPage token={token} role={role} />;
  }
  if (standardCode === '1.1.3') {
    return <ResourceAssignmentModule token={token} />;
  }
  if (standardCode === '1.2.1') {
    return <TrainingProgramModule token={token} />;
  }
  if (standardCode === '2.1.1') {
    return <PolicyManagementModule token={token} />;
  }
  if (standardCode === '2.4.1') {
    return <AnnualWorkPlanPage token={token} />;
  }

  // -- Core state --
  const [sidebarTab, setSidebarTab] = useState<SidebarId>('resumen');
  const [rows, setRows] = useState<ResponsibilityRowModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<ResponsableSstComplianceStatus>('PENDING');
  const [complianceReason, setComplianceReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  // -- Approval state --
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('DRAFT');
  const [versions, setVersions] = useState<VersionEntry[]>([
    { version: '1.0', createdAt: new Date().toISOString(), createdBy: 'Sistema' },
  ]);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [currentVersion, setCurrentVersion] = useState('1.0');

  // -- Locked state for approved --
  const [locked, setLocked] = useState(false);

  // -- Approval workflow new state --
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [assignedReviewer, setAssignedReviewer] = useState('Manager');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectCommentInput, setRejectCommentInput] = useState('');
  const [socializedAt, setSocializedAt] = useState<string | null>(null);

  // -- Legal Representative Configuration --
  // Fetch company profile setting removed (managerActsAsLegalRepresentative state was unused)

  // -- Acceptance state --
  const [pendingAcceptances, setPendingAcceptances] = useState<ResponsibilityAcceptanceModel[]>([]);
  const [myAcceptances, setMyAcceptances] = useState<ResponsibilityAcceptanceModel[]>([]);
  const [acceptanceStats, setAcceptanceStats] = useState<AcceptanceStatsModel | null>(null);
  const [complianceWithAcceptance, setComplianceWithAcceptance] = useState<ComplianceWithAcceptanceModel | null>(null);
  const [acceptanceReminders, setAcceptanceReminders] = useState<Array<{ acceptance: ResponsibilityAcceptanceModel; daysOverdue: number }>>([]);
  const [acceptanceHistory, setAcceptanceHistory] = useState<any[]>([]);
  const [signatureInput, setSignatureInput] = useState('');
  const [signatureMethod, setSignatureMethod] = useState<'TYPED' | 'DRAWN'>('TYPED');
  const [hasRead, setHasRead] = useState(false);
  const [reviewingAcceptance, setReviewingAcceptance] = useState<ResponsibilityAcceptanceModel | null>(null);
  const [correctionComment, setCorrectionComment] = useState('');
  const [showCorrection, setShowCorrection] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const addAudit = (entry: AuditEntry) => {
    setAuditHistory((prev) => [entry, ...prev]);
  };

  // -- Load acceptance data --
  const loadAcceptanceData = useCallback(async () => {
    if (!token) return;
    try {
      const [pending, mine, stats, compliance, reminders, history] = await Promise.all([
        fetchPendingAcceptances(token).catch(() => []),
        fetchMyAcceptances(token).catch(() => []),
        fetchAcceptanceStats(token).catch(() => null),
        fetchComplianceWithAcceptance(token).catch(() => null),
        fetchAcceptanceReminders(token).catch(() => []),
        fetchAcceptanceHistory(token).catch(() => []),
      ]);
      setPendingAcceptances(pending);
      setMyAcceptances(mine);
      setAcceptanceStats(stats);
      setComplianceWithAcceptance(compliance);
      setAcceptanceReminders(reminders);
      setAcceptanceHistory(history);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { void loadAcceptanceData(); }, [loadAcceptanceData]);

  // Review mode: auto-switch to approval tab
  useEffect(() => {
    if (isReviewMode) {
      setSidebarTab('aprobaciones');
    }
  }, [isReviewMode]);

  // -- Data loading --
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [data, employeeData] = await Promise.all([
        fetchResponsibilitiesAdvanced(token),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
      ]);
      if (data.responsibilities.length) {
        // Try to restore approval/version state from stored metadata
        const metaRow = data.responsibilities.find((r) => r.title === '__META__');
        if (metaRow) {
          try {
            const meta = JSON.parse(metaRow.category);
            if (meta.approvalStatus) setApprovalStatus(meta.approvalStatus);
            if (meta.currentVersion) setCurrentVersion(meta.currentVersion);
            if (meta.versions) setVersions(meta.versions);
            if (meta.auditHistory) setAuditHistory(meta.auditHistory);
            if (meta.locked !== undefined) setLocked(meta.locked);
            if (meta.rejectionReason) setRejectionReason(meta.rejectionReason);
            if (meta.submittedAt) setSubmittedAt(meta.submittedAt);
            if (meta.assignedReviewer) setAssignedReviewer(meta.assignedReviewer);
            if (meta.socializedAt) setSocializedAt(meta.socializedAt);
          } catch { /* ignore */ }
          setRows(data.responsibilities.filter((r) => r.title !== '__META__'));
        } else {
          setRows(data.responsibilities);
        }
      } else {
        // Default with all groups
        setRows(Object.values(DEFAULT_RESPONSIBILITIES_BY_GROUP).flat());
        setApprovalStatus('DRAFT');
        setCurrentVersion('1.0');
        setVersions([{ version: '1.0', createdAt: new Date().toISOString(), createdBy: 'Sistema' }]);
        setAuditHistory([]);
        setLocked(false);
      }
      setStatus(data.complianceStatus);
      setComplianceReason(data.complianceReason);
      // setAlerts removed (alerts state not available)
      // data.alerts has alerts info
      console.log('alerts:', data.alerts);
      setEmployees(employeeData);
      setDirty(false);
      initialLoadDone.current = true;
    } catch {
      notify('No se pudieron cargar las responsabilidades.');
      // Also load acceptance stats after load
      void loadAcceptanceData();
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // -- Save to backend --
  const persistMetadata = (newRows: ResponsibilityRowModel[]) => {
    const meta = { approvalStatus, currentVersion, versions, auditHistory: auditHistory.slice(0, 200), locked, rejectionReason, submittedAt, assignedReviewer, socializedAt };
    const metaRow: ResponsibilityRowModel = {
      title: '__META__',
      category: JSON.stringify(meta),
      role: 'SYSTEM',
      active: false,
      requiresSignature: false,
      status: 'PENDIENTE',
      signature: {},
    };
    return [...newRows, metaRow];
  };

  const save = useCallback(async () => {
    if (!token || !dirty) return;
    setLoading(true);
    try {
      const payload = persistMetadata(rows);
      const saved = await updateResponsibilitiesAdvanced(token, payload);
      setStatus(saved.complianceStatus);
      setComplianceReason(saved.complianceReason);

      setDirty(false);
      setLastSaved(new Date().toLocaleString());
      notify('Cambios guardados.');
    } catch {
      notify('Error al guardar.');
    } finally {
      setLoading(false);
    }
  }, [token, dirty, rows, approvalStatus, currentVersion, versions, auditHistory, locked]);

  // Auto-save every 60 seconds
  useAutoSave(save, 60000, dirty);

  // Unsaved changes warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const markDirty = () => setDirty(true);

  // -- Navigation helpers --
  // handleNavigate removed (unused)

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

  const badge = complianceBadge(status);

  // -- Filter rows by category --
  const rowsByCategory = (category: string) => rows.filter((r) => r.category === category && r.active !== false);
  const filteredGerencia = rowsByCategory('Gerencia');
  const filteredRespSst = rowsByCategory('Responsable SST');
  const filteredTrabajadores = rowsByCategory('Trabajadores');
  const filteredCopasst = rowsByCategory('COPASST');
  const filteredConvivencia = rowsByCategory('Comité de Convivencia');
  const filteredBrigada = rowsByCategory('Brigada de Emergencias');

  const allActiveRows = rows.filter((r) => r.active !== false);
  const totalSigned = allActiveRows.filter((r) => r.status === 'FIRMADO').length;
  const totalPending = allActiveRows.length - totalSigned;

  // -- Can current user approve/reject? --
  const canApprove = role === 'owner' || role === 'manager';

  // -- Approval actions --
  const submitForApproval = async () => {
    if (allActiveRows.length === 0) { notify('Agrega responsabilidades antes de solicitar aprobación.'); return; }
    if (!token) return;
    setLoading(true);
    try {
      // 1. Persist current data first so backend has latest state
      if (dirty) {
        const payload = persistMetadata(rows);
        await updateResponsibilitiesAdvanced(token, payload);
      }
      // 2. Call backend submit endpoint to create version snapshot, change status, and notify MANAGER
      await submitResponsibilitiesAdvanced(token);
      // 3. Reload to get fresh state from backend
      const data = await fetchResponsibilitiesAdvanced(token);
      const metaRow = data.responsibilities.find((r) => r.title === '__META__');
      if (metaRow) {
        try {
          const meta = JSON.parse(metaRow.category);
          setApprovalStatus(meta.approvalStatus || 'PENDING_APPROVAL');
          setLocked(meta.locked || true);
          setSubmittedAt(meta.submittedAt ? new Date(meta.submittedAt).toLocaleString() : new Date().toLocaleString());
          if (meta.currentVersion) setCurrentVersion(meta.currentVersion);
          if (meta.versions) setVersions(meta.versions);
          if (meta.auditHistory) setAuditHistory(meta.auditHistory);
          if (meta.assignedReviewer) setAssignedReviewer(meta.assignedReviewer);
        } catch { /* ignore */ }
        setRows(data.responsibilities.filter((r) => r.title !== '__META__'));
      }
      setStatus(data.complianceStatus);
      setComplianceReason(data.complianceReason);
      // setAlerts removed (alerts state not available)
      // data.alerts has alerts info
      console.log('alerts:', data.alerts);
      setDirty(false);
      setLastSaved(new Date().toLocaleString());
      notify(`📤 Solicitud enviada a ${assignedReviewer}. Contenido bloqueado. Se ha notificado a Gerencia.`);
    } catch (e: any) {
      notify('Error al enviar: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const approveModule = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Save current data first so backend has the latest state
      if (dirty) {
        const payload = persistMetadata(rows);
        await updateResponsibilitiesAdvanced(token, payload);
      }
      // 2. Call backend approval endpoint (validates MANAGER/OWNER role server-side)
      const result = await approveResponsibilitiesAdvanced(token);
      // 3. Read the updated status from the result
      const metaRow = result.responsibilities.find((r) => r.title === '__META__');
      let newApprovalStatus = 'APPROVED';
      if (metaRow) {
        try {
          const meta = JSON.parse(metaRow.category);
          newApprovalStatus = meta.approvalStatus || 'APPROVED';
        } catch { /* ignore */ }
      }
      // 4. Update local state based on whether approval and signature were merged
      const isMerged = newApprovalStatus === 'APPROVED_AND_SIGNED';
      setApprovalStatus(isMerged ? 'APPROVED_AND_SIGNED' : 'APPROVED');
      setLocked(true);
      setSubmittedAt(null);
      setDirty(false);

      if (isMerged) {
        addAudit({ action: 'Aprobado y firmado por Representante Legal', user: role === 'manager' ? 'Manager' : 'Owner', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'PENDING_APPROVAL', newValue: 'APPROVED_AND_SIGNED' });
        notify('✅ Módulo aprobado y firmado. El MANAGER actúa como Representante Legal. Siguiente etapa: Socialización.');
      } else {
        setApprovalStatus('APPROVED');
        addAudit({ action: 'Aprobado por MANAGER', user: role === 'manager' ? 'Manager' : 'Owner', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'PENDING_APPROVAL', newValue: 'APPROVED' });
        notify('✅ Módulo aprobado. Contenido bloqueado. Siguiente etapa: firma representante legal y socialización.');
      }
      // 5. Reload fresh data
      const data = await fetchResponsibilitiesAdvanced(token);
      const loadedMeta = data.responsibilities.find((r) => r.title === '__META__');
      if (loadedMeta) {
        try {
          const meta = JSON.parse(loadedMeta.category);
          if (meta.versions) setVersions(meta.versions);
          if (meta.auditHistory) setAuditHistory(meta.auditHistory);
        } catch { /* ignore */ }
      }
      setRows(data.responsibilities.filter((r) => r.title !== '__META__'));
      setStatus(data.complianceStatus);
      setComplianceReason(data.complianceReason);
    } catch (e: any) {
      notify('Error al aprobar: ' + (e.message || 'Permiso denegado'));
    } finally {
      setLoading(false);
    }
  };

  const rejectModule = async (reason: string) => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Save current data first
      if (dirty) {
        const payload = persistMetadata(rows);
        await updateResponsibilitiesAdvanced(token, payload);
      }
      // 2. Call backend rejection endpoint (validates MANAGER/OWNER role server-side)
      await rejectResponsibilitiesAdvanced(token, reason);
      // 3. Update local state
      setApprovalStatus('REJECTED');
      setLocked(false);
      setRejectionReason(reason);
      setSubmittedAt(null);
      setShowRejectModal(false);
      setRejectCommentInput('');
      setDirty(false);
      addAudit({ action: 'Rechazado por MANAGER', user: 'Manager', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'PENDING_APPROVAL', newValue: 'REJECTED' });
      addAudit({ action: 'Comentario de rechazo', user: 'Manager', date: new Date().toLocaleString(), field: 'rejectionReason', previousValue: '', newValue: reason });
      notify('❌ Módulo rechazado. Edición habilitada nuevamente para ADMIN.');
    } catch (e: any) {
      notify('Error al rechazar: ' + (e.message || 'Permiso denegado'));
    } finally {
      setLoading(false);
    }
  };


  const archiveModule = () => {
    setApprovalStatus('ARCHIVED');
    setLocked(true);
    addAudit({ action: 'Archivado', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: approvalStatus, newValue: 'ARCHIVED' });
    markDirty();
    notify('📦 Módulo archivado.');
  };

  // -- Generate default responsibilities --
  const generateDefaults = () => {
    const all = Object.values(DEFAULT_RESPONSIBILITIES_BY_GROUP).flat();
    setRows(all);
    addAudit({ action: 'Responsabilidades generadas', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'rows', previousValue: `${rows.length} items`, newValue: `${all.length} items` });
    markDirty();
    notify('Responsabilidades generadas automáticamente para todos los grupos.');
  };

  // -- CRUD helpers --
  const updateRow = (index: number, patch: Partial<ResponsibilityRowModel>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    setRows(next);
    markDirty();
  };

  const deleteRow = (index: number) => {
    const row = rows[index];
    setRows(rows.filter((_, i) => i !== index));
    addAudit({ action: 'Eliminado', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'title', previousValue: row.title, newValue: '' });
    markDirty();
  };

  const duplicateRow = (index: number) => {
    const row = { ...rows[index], title: `${rows[index].title} (copia)` };
    const next = [...rows];
    next.splice(index + 1, 0, row);
    setRows(next);
    addAudit({ action: 'Duplicado', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'title', previousValue: '', newValue: row.title });
    markDirty();
  };

  const addRowToCategory = (category: string) => {
    const role = category === 'Gerencia' ? 'MANAGER' : 'ADMIN';
    setRows([...rows, { category, role, title: '', employeeId: '', active: true, requiresSignature: false, status: 'PENDIENTE', signature: {} }]);
    addAudit({ action: 'Creado', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'category', previousValue: '', newValue: category });
    markDirty();
  };

  const moveRow = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setRows(next);
    markDirty();
  };

  const signRow = (index: number) => {
    const next = [...rows];
    next[index] = {
      ...next[index],
      status: 'FIRMADO',
      signature: { ...next[index].signature, signedAt: new Date().toISOString(), signedBy: 'Usuario', accepted: true },
    };
    setRows(next);
    addAudit({ action: 'Firmado', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'title', previousValue: '', newValue: rows[index].title });
    markDirty();
    notify(`Firma registrada: ${rows[index].title}`);
  };

  // -- Render table for a group --
  const renderGroupTable = (groupRows: ResponsibilityRowModel[], groupCategory: string) => {
    // Find the actual indices in the full rows array
    const indices = groupRows.map((gr) => rows.findIndex((r) => r === gr)).filter((i) => i >= 0);
    return (
      <section className="advanced-page__section">
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
          <h3 style={{ margin: 0 }}>{GROUP_ICONS[groupCategory] ?? ''} {groupCategory}</h3>
          {!locked && <Button type="button" onClick={() => addRowToCategory(groupCategory)}>+ Agregar</Button>}
        </div>
        {groupRows.length === 0 ? (
          <p className="empty-state">No hay responsabilidades en este grupo. Haz clic en "Agregar" o genera desde Resumen.</p>
        ) : (
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Responsabilidad</th>
                  <th>Rol</th>
                  <th>Asignado a</th>
                  <th>Firma</th>
                  <th>Estado</th>
                  <th>Fecha firma</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row, idx) => {
                  const realIdx = indices[idx];
                  return (
                    <tr key={realIdx}>
                      <td>{idx + 1}</td>
                      <td className="advanced-page__cell-title">
                        <textarea
                          className="advanced-page__textarea"
                          value={row.title}
                          disabled={locked}
                          onChange={(e) => updateRow(realIdx, { title: e.target.value })}
                          placeholder="Nombre de la responsabilidad"
                          rows={Math.max(2, Math.ceil((row.title?.length || 1) / 18))}
                        />
                      </td>
                      <td className="advanced-page__cell-role">
                        <select
                          className="input"
                          value={row.role}
                          disabled={locked}
                          onChange={(e) => updateRow(realIdx, { role: e.target.value })}
                        >
                          <option value="MANAGER">👨‍💼 Manager</option>
                          <option value="ADMIN">🦺 Admin</option>
                          <option value="MEMBER">👷 Member</option>
                          <option value="CONTRACTOR">📄 Contractor</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="input"
                          value={row.employeeId ?? ''}
                          disabled={locked}
                          onChange={(e) => updateRow(realIdx, { employeeId: e.target.value })}
                        >
                          <option value="">Sin asignar</option>
                          {employees.map((emp) => (
                            <option key={emp._id} value={emp._id}>{emp.name} · {emp.position}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: locked ? 'not-allowed' : 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={row.requiresSignature}
                            disabled={locked}
                            onChange={(e) => updateRow(realIdx, { requiresSignature: e.target.checked })}
                          />
                          Firma
                        </label>
                      </td>
                      <td>
                        <span className={statusBadgeClass(row.status)}>{row.status}</span>
                      </td>
                      <td>
                        {row.signature?.signedAt ? new Date(row.signature.signedAt).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <div className="actions" style={{ flexWrap: 'nowrap' }}>
                          {row.requiresSignature && row.status !== 'FIRMADO' && !locked && (
                            <Button type="button" variant="secondary" onClick={() => signRow(realIdx)}>✍</Button>
                          )}
                          {!locked && (
                            <>
                              <Button type="button" variant="ghost" onClick={() => duplicateRow(realIdx)} title="Duplicar">📋</Button>
                              <Button type="button" variant="ghost" onClick={() => moveRow(realIdx, 'up')} disabled={idx === 0} title="Subir">↑</Button>
                              <Button type="button" variant="ghost" onClick={() => moveRow(realIdx, 'down')} disabled={idx === groupRows.length - 1} title="Bajar">↓</Button>
                              <Button type="button" variant="danger" onClick={() => deleteRow(realIdx)}>🗑</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <AdvancedPageLayout>
      {/* Unsaved changes modal */}
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

      {/* Header */}
      <AdvancedHeader
        backPath="/documents/plan"
        backLabel="← Volver a Implementación"
        moduleCode={standard.code}
        moduleTitle={standard.title}
        description="Gestión de responsabilidades en SST para todos los niveles de la organización"
        statusBadge={
          <>
            <span className={badge.className}>{badge.label}</span>
            {complianceReason && <span className="text-muted-small">{complianceReason}</span>}
          </>
        }
        actions={[
          {
            label: '📄 Exportar PDF',
            variant: 'secondary' as const,
            onClick: () => {
              void exportAdvancedPdf({
                filename: `responsabilidades-sst-v${currentVersion}.pdf`,
                document: (
                  <AdvancedModuleReportTemplate
                    data={{
                      title: 'Matriz de Responsabilidades SG-SST',
                      companyName: standard.title,
                      version: `v${currentVersion}`,
                      status: approvalStatus === 'APPROVED_AND_SIGNED' ? 'Aprobado y firmado' : approvalStatus === 'APPROVED' ? 'Aprobado' : approvalStatus === 'PENDING_APPROVAL' ? 'Pendiente' : approvalStatus === 'ARCHIVED' ? 'Archivado' : 'Borrador',
                      generatedAt: new Date().toLocaleString(),
                      sections: [
                        {
                          title: 'Resumen',
                          rows: [
                            { label: 'Código', value: standard.code },
                            { label: 'Total responsabilidades', value: String(allActiveRows.length) },
                            { label: 'Firmadas', value: String(totalSigned) },
                            { label: 'Pendientes', value: String(totalPending) },
                          ],
                        },
                        {
                          title: 'Responsabilidades',
                          rows: allActiveRows.map((r, i) => ({
                            label: `${i + 1}. [${r.category}] ${r.title}`,
                            value: `Rol: ${r.role} | Estado: ${r.status}${r.signature?.signedAt ? ` | Firmada: ${new Date(r.signature.signedAt).toLocaleDateString()}` : ''}`,
                          })),
                        },
                        {
                          title: 'Firmas',
                          rows: allActiveRows
                            .filter((r) => r.status === 'FIRMADO')
                            .map((r) => ({
                              label: r.title,
                              value: `Firmado por: ${r.signature?.signedBy || 'Usuario'} el ${r.signature?.signedAt ? new Date(r.signature.signedAt).toLocaleString() : 'N/A'}`,
                            })),
                        },
                        {
                          title: 'Aceptaciones',
                          rows: [
                            { label: 'Total', value: String(acceptanceStats?.total || 0) },
                            { label: 'Aceptadas', value: String(acceptanceStats?.accepted || 0) },
                            { label: 'Pendientes', value: String(acceptanceStats?.pending || 0) },
                          ],
                        },
                      ],
                    }}
                  />
                ),
              });
              notify('📄 Reporte exportado correctamente.');
            },
          },
          {
            label: '📊 Exportar Excel',
            variant: 'secondary' as const,
            onClick: () => {
              const headers = ['#','Categoría','Responsabilidad','Rol','Estado','Fecha Firma','Firmado Por'];
              const csvRows = allActiveRows.map((r, i) => [
                i + 1,
                r.category,
                `"${r.title}"`,
                r.role,
                r.status,
                r.signature?.signedAt ? new Date(r.signature.signedAt).toLocaleDateString() : '',
                r.signature?.signedBy || '',
              ].join(','));
              const csv = [headers.join(','), ...csvRows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `responsabilidades-sst-${standard.code}-v${currentVersion}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              notify('📊 CSV exportado correctamente.');
            },
          },
          // Only show save button for users who can edit (not MANAGER when PENDING)
          ...(approvalStatus === 'PENDING_APPROVAL' && !canApprove
            ? []
            : [{ label: loading ? 'Guardando...' : '💾 Guardar cambios', onClick: () => void save(), disabled: loading || !dirty }]),
        ]}
        lastSaved={lastSaved}
      />

      {/* Toast */}
      {toast && <div className="toast-alert" style={{ margin: '0 1rem' }}><p>{toast}</p></div>}

      {/* Review mode banner (shown from notification click) */}
      {isReviewMode && (
        <div className="advanced-page__banner advanced-page__banner--warning" style={{ border: '2px solid #d97706', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
            <div>
              <strong style={{ fontSize: '1rem' }}>📋 Documento pendiente de aprobación</strong>
              <div style={{ marginTop: '.35rem', fontSize: '.85rem', color: '#92400e' }}>
                {submittedAt && <span><strong>📅 Enviado:</strong> {submittedAt} | </span>}
                <span><strong>🔖 Módulo:</strong> {standardCode} — {standard.title} | </span>
                <span><strong>🔢 Versión:</strong> v{currentVersion}</span>
              </div>
            </div>
            {canApprove && approvalStatus === 'PENDING_APPROVAL' && (
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <Button type="button" onClick={approveModule} disabled={loading}>
                  ✅ Aprobar módulo
                </Button>
                <Button type="button" variant="danger" onClick={() => setShowRejectModal(true)} disabled={loading}>
                  ❌ Rechazar
                </Button>
              </div>
            )}
            {!canApprove && (
              <div style={{ fontSize: '.85rem', color: '#dc2626' }}>
                ⚠️ Solo usuarios con rol Gerente pueden aprobar o rechazar.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval banner */}
      {(approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED') && (
        <div className="advanced-page__banner advanced-page__banner--success">
          {approvalStatus === 'APPROVED_AND_SIGNED' ? (
            <>🟢 Aprobado y firmado (v{currentVersion}). Contenido bloqueado. Siguiente etapa: Socialización.</>
          ) : (
            <>✅ Módulo aprobado (v{currentVersion}). Contenido bloqueado. Siguiente etapa: firma representante legal y socialización.</>
          )}
        </div>
      )}
      {approvalStatus === 'SOCIALIZED' && (
        <div className="advanced-page__banner advanced-page__banner--success">
          ✅ Módulo socializado. Ciclo de aprobación completado (v{currentVersion}).
        </div>
      )}
      {approvalStatus === 'REJECTED' && (
        <div className="advanced-page__banner advanced-page__banner--danger">
          ❌ Módulo rechazado. Revisa el comentario del revisor y corrige antes de reenviar.
        </div>
      )}
      {approvalStatus === 'ARCHIVED' && (
        <div className="advanced-page__banner advanced-page__banner--archived">
          📦 Módulo archivado. Solo lectura.
        </div>
      )}
      {approvalStatus === 'PENDING_APPROVAL' && canApprove && (
        <div className="advanced-page__banner advanced-page__banner--warning">
          📋 Documento pendiente de revisión por Gerencia. Revisa el contenido y decide aprobar o rechazar.
        </div>
      )}
      {approvalStatus === 'PENDING_APPROVAL' && !canApprove && (
        <div className="advanced-page__banner advanced-page__banner--warning">
          ⏳ Pendiente de aprobación por {assignedReviewer}. Enviado el {submittedAt || '—'}. Contenido bloqueado hasta que Gerencia revise.
        </div>
      )}

      <div className="advanced-page__body">
        {/* Sidebar */}
        <nav className="advanced-page__sidebar">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`advanced-page__sidebar-item ${sidebarTab === item.id ? 'advanced-page__sidebar-item--active' : ''}`}
              onClick={() => setSidebarTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="advanced-page__content">
          {loading && !initialLoadDone.current && <p className="muted">Cargando...</p>}

          {/* ======== RESUMEN ======== */}
          {sidebarTab === 'resumen' && (
            <div className="advanced-page__section">
              <h3>📋 Resumen de la Matriz de Responsabilidades</h3>
              <p className="muted">
                Gestiona las responsabilidades en SST para todos los niveles de la organización.
                Usa los botones de navegación lateral para ver y editar cada grupo.
              </p>

              <AdvancedKpiGrid
                items={[
                  { label: 'Total Responsabilidades', value: allActiveRows.length },
                  { label: 'Firmadas', value: totalSigned, variant: 'success' },
                  { label: 'Pendientes', value: totalPending, variant: 'warning' },
                  { label: 'Versión Actual', value: `v${currentVersion}` },
                  { label: 'Estado', value: approvalStatus === 'DRAFT' ? '📝 Borrador' : approvalStatus === 'PENDING_APPROVAL' ? '⏳ Pendiente' : approvalStatus === 'REJECTED' ? '❌ Rechazado' : approvalStatus === 'APPROVED_AND_SIGNED' ? '🟢 Aprobado y firmado' : approvalStatus === 'APPROVED' ? '✅ Aprobado' : approvalStatus === 'SOCIALIZED' ? '✅ Socializado' : '📦 Archivado' },
                  { label: 'Cumplimiento PHVA', value: badge.label, variant: status === 'COMPLIES' ? 'success' : status === 'NON_COMPLIANT' ? 'danger' : 'warning' },
                ]}
                columns={6}
              />

              {/* Group summary */}
              <div className="advanced-page__group-summary">
                {GROUP_CATEGORIES.map((cat) => {
                  const count = rowsByCategory(cat).length;
                  const signed = rowsByCategory(cat).filter((r) => r.status === 'FIRMADO').length;
                  return (
                    <button
                      key={cat}
                      className="advanced-page__group-card"
                      onClick={() => {
                        const tabMap: Record<string, SidebarId> = {
                          Gerencia: 'gerencia',
                          'Responsable SST': 'responsable-sst',
                          Trabajadores: 'trabajadores',
                          COPASST: 'copasst',
                          'Comité de Convivencia': 'convivencia',
                          'Brigada de Emergencias': 'brigada',
                        };
                        setSidebarTab(tabMap[cat] ?? 'gerencia');
                      }}
                    >
                      <span className="advanced-page__group-icon">{GROUP_ICONS[cat]}</span>
                      <strong>{cat}</strong>
                      <span className="muted">{count} responsabilidades · {signed} firmadas</span>
                    </button>
                  );
                })}
              </div>

              {!locked && (
                <div className="actions" style={{ marginTop: '.5rem' }}>
                  <Button type="button" onClick={generateDefaults}>
                    🚀 Generar responsabilidades automáticamente
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { setRows(Object.values(DEFAULT_RESPONSIBILITIES_BY_GROUP).flat()); markDirty(); notify('Responsabilidades restauradas a valores predeterminados.'); }}>
                    Restaurar predeterminados
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ======== GROUP TABS ======== */}
          {sidebarTab === 'gerencia' && renderGroupTable(filteredGerencia, 'Gerencia')}
          {sidebarTab === 'responsable-sst' && renderGroupTable(filteredRespSst, 'Responsable SST')}
          {sidebarTab === 'trabajadores' && renderGroupTable(filteredTrabajadores, 'Trabajadores')}
          {sidebarTab === 'copasst' && renderGroupTable(filteredCopasst, 'COPASST')}
          {sidebarTab === 'convivencia' && renderGroupTable(filteredConvivencia, 'Comité de Convivencia')}
          {sidebarTab === 'brigada' && renderGroupTable(filteredBrigada, 'Brigada de Emergencias')}

          {/* ======== APROBACIONES ======== */}
          {sidebarTab === 'aprobaciones' && (
            <div className="advanced-page__section">
              <h3>✍ Flujo de Aprobación</h3>
              <p className="muted">
                El módulo de responsabilidades SG-SST sigue un flujo de aprobación en 5 etapas.
                ADMIN prepara el borrador → Envía a MANAGER → MANAGER aprueba o rechaza → Firma representante legal → Socialización.
              </p>

              {/* Status timeline - 5 steps */}
              <div className="advanced-page__approval-steps">
                {/* Step 1: DRAFT */}
                <div className={`advanced-page__approval-step ${approvalStatus === 'DRAFT' ? 'advanced-page__approval-step--active' : 'advanced-page__approval-step--done'}`}>
                  <div className="advanced-page__approval-step-icon">{approvalStatus === 'DRAFT' ? '📝' : '✅'}</div>
                  <strong>Borrador</strong>
                </div>
                <div className="advanced-page__approval-connector" />

                {/* Step 2: PENDING_APPROVAL / REJECTED (fork) */}
                <div className={`advanced-page__approval-step ${approvalStatus === 'PENDING_APPROVAL' ? 'advanced-page__approval-step--active' : approvalStatus === 'REJECTED' ? 'advanced-page__approval-step--danger' : approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' || approvalStatus === 'SOCIALIZED' || approvalStatus === 'ARCHIVED' ? 'advanced-page__approval-step--done' : ''}`}>
                  <div className="advanced-page__approval-step-icon">
                    {approvalStatus === 'PENDING_APPROVAL' ? '⏳' : approvalStatus === 'REJECTED' ? '❌' : approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' || approvalStatus === 'SOCIALIZED' ? '✅' : '⏸️'}
                  </div>
                  <strong>
                    {approvalStatus === 'REJECTED' ? 'Rechazado' : 'Pendiente aprobación'}
                  </strong>
                  {approvalStatus === 'REJECTED' && <span style={{ fontSize: '.75rem', color: '#dc2626' }}>Devolver a edición</span>}
                </div>
                <div className="advanced-page__approval-connector" />

                {/* Step 3: APPROVED / APPROVED_AND_SIGNED (merged) */}
                <div className={`advanced-page__approval-step ${approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' ? 'advanced-page__approval-step--active' : approvalStatus === 'SOCIALIZED' || approvalStatus === 'ARCHIVED' ? 'advanced-page__approval-step--done' : ''}`}>
                  <div className="advanced-page__approval-step-icon">
                    {approvalStatus === 'APPROVED_AND_SIGNED' ? '🟢' : approvalStatus === 'APPROVED' ? '✅' : approvalStatus === 'SOCIALIZED' ? '✅' : '⏸️'}
                  </div>
                  <strong>
                    {approvalStatus === 'APPROVED_AND_SIGNED' ? 'Aprobado y firmado' : 'Aprobado'}
                  </strong>
                  {approvalStatus === 'APPROVED_AND_SIGNED' && <span style={{ fontSize: '.75rem', color: '#16a34a' }}>Incluye firma del Representante Legal</span>}
                </div>
                <div className="advanced-page__approval-connector" />

                {/* Step 4: SOCIALIZED */}
                <div className={`advanced-page__approval-step ${approvalStatus === 'SOCIALIZED' ? 'advanced-page__approval-step--active' : approvalStatus === 'ARCHIVED' ? 'advanced-page__approval-step--done' : ''}`}>
                  <div className="advanced-page__approval-step-icon">{approvalStatus === 'SOCIALIZED' ? '✅' : '⏸️'}</div>
                  <strong>Socializado</strong>
                </div>
                <div className="advanced-page__approval-connector" />

                {/* Step 5: ARCHIVED */}
                <div className={`advanced-page__approval-step ${approvalStatus === 'ARCHIVED' ? 'advanced-page__approval-step--active' : ''}`}>
                  <div className="advanced-page__approval-step-icon">📦</div>
                  <strong>Archivado</strong>
                </div>
              </div>

              {/* Current status */}
              <div className="advanced-page__section" style={{ marginTop: '1rem' }}>
                <h4>
                  Estado actual:{' '}
                  {approvalStatus === 'DRAFT' && '📝 Borrador'}
                  {approvalStatus === 'PENDING_APPROVAL' && `⏳ Pendiente de aprobación por ${assignedReviewer}`}
                  {approvalStatus === 'REJECTED' && `❌ Rechazado por ${assignedReviewer}`}
                  {approvalStatus === 'APPROVED' && `✅ Aprobado (v${currentVersion})`}
                  {approvalStatus === 'SOCIALIZED' && `✅ Socializado (v${currentVersion})`}
                  {approvalStatus === 'ARCHIVED' && '📦 Archivado'}
                </h4>

                {/* DRAFT info */}
                {approvalStatus === 'DRAFT' && (
                  <p className="muted">El módulo está en edición. Envíalo a aprobación cuando esté listo.</p>
                )}

                {/* PENDING_APPROVAL info */}
                {approvalStatus === 'PENDING_APPROVAL' && (
                  <div>
                    <p className="muted">Pendiente de revisión por {assignedReviewer}. El contenido está bloqueado.</p>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '.5rem', fontSize: '.9rem' }}>
                      <span><strong>📅 Enviado:</strong> {submittedAt || '—'}</span>
                      <span><strong>👤 Revisor:</strong> {assignedReviewer}</span>
                      <span><strong>🔖 Versión:</strong> v{currentVersion}</span>
                    </div>
                  </div>
                )}

                {/* REJECTED info */}
                {approvalStatus === 'REJECTED' && (
                  <div>
                    <p className="muted">El módulo fue rechazado. Edición habilitada para correcciones.</p>
                    {rejectionReason && (
                      <div style={{ marginTop: '.5rem', padding: '.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px' }}>
                        <strong>💬 Comentario del revisor:</strong>
                        <p style={{ margin: '.25rem 0 0', fontSize: '.9rem', color: '#991b1b' }}>{rejectionReason}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* APPROVED info */}
                {approvalStatus === 'APPROVED' && (
                  <p className="muted">El contenido está aprobado y bloqueado. Procede a firmar como representante legal y socializar.</p>
                )}

                {/* APPROVED_AND_SIGNED info */}
                {approvalStatus === 'APPROVED_AND_SIGNED' && (
                  <div>
                    <p className="muted">El contenido está aprobado y firmado por el Representante Legal. Procede a socializar.</p>
                    <div className="advanced-page__version-card" style={{ marginTop: '.5rem', padding: '1rem', background: '#f0fdf4', border: '1px solid #86efac' }}>
                      <h4 style={{ margin: '0 0 .5rem' }}>📋 Próximo paso requerido</h4>
                      <p style={{ margin: '0 0 .25rem', fontWeight: 600 }}>Socialización de responsabilidades SG-SST</p>
                      <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
                        Programa la socialización con los trabajadores para completar el ciclo de aprobación.
                      </p>
                      <div className="actions" style={{ marginTop: '.75rem' }}>
                        <Button type="button" onClick={() => setSidebarTab('socializacion')}>
                          📢 Ir a Socialización
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SOCIALIZED info */}
                {approvalStatus === 'SOCIALIZED' && (
                  <p className="muted">Ciclo de aprobación completado. Módulo socializado exitosamente.</p>
                )}
              </div>

              {/* Actions */}
              <div className="actions" style={{ marginTop: '.5rem' }}>
                {approvalStatus === 'DRAFT' && (
                  <Button type="button" onClick={submitForApproval}>
                    📤 Enviar a aprobación
                  </Button>
                )}
                {approvalStatus === 'PENDING_APPROVAL' && (
                  <>
                    {/* MANAGER/OWNER: show Approve/Reject buttons */}
                    {canApprove && (
                      <>
                        <Button type="button" onClick={approveModule} disabled={loading}>
                          ✅ Aprobar módulo
                        </Button>
                        <Button type="button" variant="danger" onClick={() => setShowRejectModal(true)} disabled={loading}>
                          ❌ Rechazar
                        </Button>
                      </>
                    )}
                    {/* ADMIN/MEMBER: show pending status badge */}
                    {!canApprove && (
                      <Button type="button" variant="secondary" disabled>
                        ⏳ Pendiente de revisión por Gerencia
                      </Button>
                    )}
                  </>
                )}
                {approvalStatus === 'REJECTED' && (
                  <>
                    <Button type="button" onClick={submitForApproval}>
                      📤 Reenviar a aprobación
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => { setRejectionReason(''); notify('Comentario de rechazo limpiado.'); }}>
                      🗑️ Limpiar comentario
                    </Button>
                  </>
                )}
                {approvalStatus === 'APPROVED' && (
                  <>
                    <Button type="button" onClick={() => setSidebarTab('socializacion')}>
                      ✍ Firmar y socializar (representante legal)
                    </Button>
                    <Button type="button" variant="ghost" onClick={archiveModule}>
                      📦 Archivar módulo
                    </Button>
                  </>
                )}
                {approvalStatus === 'APPROVED_AND_SIGNED' && (
                  <>
                    <Button type="button" onClick={() => setSidebarTab('socializacion')}>
                      📢 Ir a Socialización
                    </Button>
                    <Button type="button" variant="ghost" onClick={archiveModule}>
                      📦 Archivar módulo
                    </Button>
                  </>
                )}
                {approvalStatus === 'SOCIALIZED' && (
                  <Button type="button" variant="ghost" onClick={archiveModule}>
                    📦 Archivar módulo
                  </Button>
                )}
                {approvalStatus === 'ARCHIVED' && (
                  <Button type="button" variant="secondary" onClick={() => { setApprovalStatus('DRAFT'); setLocked(false); addAudit({ action: 'Reabierto', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'ARCHIVED', newValue: 'DRAFT' }); markDirty(); notify('Módulo reabierto.'); }}>
                    🔄 Reabrir módulo
                  </Button>
                )}
              </div>

              {/* Rejection modal */}
              {showRejectModal && (
                <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <h3>❌ Rechazar módulo</h3>
                    <p>Indica el motivo del rechazo para que ADMIN pueda corregir:</p>
                    <textarea
                      className="input"
                      rows={4}
                      value={rejectCommentInput}
                      onChange={(e) => setRejectCommentInput(e.target.value)}
                      placeholder="Describe qué necesita corrección... (obligatorio)"
                      style={{ width: '100%', minHeight: '80px', marginTop: '.5rem' }}
                    />
                    <div className="actions" style={{ marginTop: '1rem' }}>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={!rejectCommentInput.trim()}
                        onClick={() => rejectModule(rejectCommentInput.trim())}
                      >
                        ❌ Rechazar y devolver a ADMIN
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => { setShowRejectModal(false); setRejectCommentInput(''); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Auto compliance info */}
              <div className="advanced-page__section">
                <h4>Cumplimiento automático PHVA</h4>
                <p className="muted">
                  El estándar 1.1.2 en el PHVA permanecerá como <strong>⚠ Pendiente</strong> hasta que el módulo sea aprobado.
                  Una vez aprobado, el sistema validará el cumplimiento automáticamente.
                </p>
                <span className={badge.className}>{badge.label}</span>
                {complianceReason && <p className="muted" style={{ fontSize: '.85rem' }}>Razón: {complianceReason}</p>}
              </div>
            </div>
          )}

          {/* ======== VERSIONES ======== */}
          {sidebarTab === 'versiones' && (
            <div className="advanced-page__section">
              <h3>📂 Versiones</h3>
              <p className="muted">
                Cada vez que el módulo es aprobado se genera automáticamente un snapshot de la versión actual.
                Las versiones permiten mantener trazabilidad de los cambios en la matriz de responsabilidades.
              </p>

              {versions.length === 0 ? (
                <p className="empty-state">Aún no hay versiones registradas. Al aprobar el módulo se generará la primera versión.</p>
              ) : (
                <div className="advanced-page__versions-list">
                  {versions.map((ver, _i) => (
                    <article key={ver.version} className={`advanced-page__version-card ${ver.version === currentVersion ? 'advanced-page__version-card--current' : ''}`}>
                      <div className="advanced-page__version-header">
                        <span className="advanced-page__version-badge">v{ver.version}</span>
                        {ver.version === currentVersion && <span className="advanced-page__version-current-badge">Actual</span>}
                        <span className="muted">{new Date(ver.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="advanced-page__version-details">
                        <p><strong>Creado por:</strong> {ver.createdBy}</p>
                        {ver.approvedBy && <p><strong>Aprobado por:</strong> {ver.approvedBy}</p>}
                        {ver.approvedAt && <p><strong>Aprobado el:</strong> {new Date(ver.approvedAt).toLocaleString()}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {!locked && approvalStatus === 'APPROVED' && (
                <div className="actions" style={{ marginTop: '.5rem' }}>
                  <Button type="button" variant="secondary" onClick={() => { setLocked(false); setApprovalStatus('DRAFT'); notify('Módulo desbloqueado para nueva versión.'); }}>
                    🔓 Iniciar nueva versión
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ======== HISTORIAL ======== */}
          {sidebarTab === 'historial' && (
            <div className="advanced-page__section">
              <h3>🕓 Historial de auditoría</h3>
              <p className="muted">
                Registro completo de todas las acciones realizadas en la matriz de responsabilidades:
                creación, edición, eliminación, aprobación y archivado.
              </p>

              {auditHistory.length === 0 ? (
                <p className="empty-state">Aún no hay movimientos registrados. Las acciones comenzarán a registrarse al editar la matriz.</p>
              ) : (
                <div className="advanced-page__audit-table-wrap">
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
                        <tr key={`audit-${i}`}>
                          <td><span className="advanced-page__audit-action">{entry.action}</span></td>
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

              <div className="muted" style={{ fontSize: '.85rem' }}>
                Total de entradas: {auditHistory.length}
              </div>
            </div>
          )}

          {/* ======== ACEPTACIONES ======== */}
          {sidebarTab === 'aceptaciones' && (
            <div className="advanced-page__section">
              <h3>✍ Sistema de Aceptación y Firma</h3>
              <p className="muted">
                Después de aprobar la matriz, los usuarios asignados deben revisar, aceptar y firmar digitalmente sus responsabilidades.
                El flujo es: Manager aprueba → Asignación → Revisión → Firma digital → Aceptación completada.
              </p>

              {/* Acceptance flow steps */}
              <div className="advanced-page__approval-steps" style={{ margin: '1rem 0' }}>
                {ACCEPTANCE_STEPS.map((step, i) => (
                  <Fragment key={step.label}>
                    <div className={`advanced-page__approval-step ${
                      (approvalStatus === 'APPROVED' || i <= 0) ? 'advanced-page__approval-step--done' : ''
                    } ${i === 0 ? 'advanced-page__approval-step--active' : ''}`}>
                      <div className="advanced-page__approval-step-icon">{step.icon}</div>
                      <strong>{step.label}</strong>
                    </div>
                    {i < ACCEPTANCE_STEPS.length - 1 && <div className="advanced-page__approval-connector" />}
                  </Fragment>
                ))}
              </div>

              {/* Stats grid */}
              <AdvancedKpiGrid
                items={[
                  { label: 'Total Aceptaciones', value: acceptanceStats?.total ?? 0 },
                  { label: 'Aceptadas', value: acceptanceStats?.accepted ?? 0, variant: 'success' },
                  { label: 'Pendientes', value: acceptanceStats?.pending ?? 0, variant: 'warning' },
                  { label: 'Rechazadas', value: acceptanceStats?.rejected ?? 0, variant: 'danger' },
                ]}
                columns={4}
              />

              {/* Approval-dependent content */}
              {(approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED') && acceptanceStats && acceptanceStats.total === 0 && (
                <div className="advanced-page__section">
                  <h4>📋 Asignar responsabilidades</h4>
                  <p className="muted">
                    La matriz está aprobada (v{currentVersion}). Asigna empleados con responsabilidades
                    marcadas como &quot;Firma&quot; para iniciar el ciclo de aceptación.
                  </p>
                  <div className="actions">
                    <Button type="button" onClick={async () => {
                      if (!token) return;
                      try {
                        const batchAssignments = rows
                          .filter((r) => r.employeeId && r.active !== false && r.requiresSignature)
                          .map((r) => ({
                            userId: r.employeeId!,
                            userEmail: '',
                            userName: employees.find((e) => e._id === r.employeeId)?.name || 'Usuario',
                            userRole: r.role,
                            assignedItemIds: [],
                          }));
                        const uniqueBatch = batchAssignments.filter(
                          (a, i, arr) => arr.findIndex((x) => x.userId === a.userId) === i
                        );
                        if (uniqueBatch.length === 0) {
                          notify('Asigna empleados a las responsabilidades con firma requerida primero.');
                          return;
                        }
                        await assignResponsibilitiesBatch(token, uniqueBatch);
                        notify(`${uniqueBatch.length} usuario(s) asignados.`);
                        void loadAcceptanceData();
                      } catch (e: any) {
                        notify('Error al asignar: ' + (e.message || ''));
                      }
                    }}>
                      👥 Asignar usuarios automáticamente
                    </Button>
                    <Button type="button" variant="secondary" onClick={async () => {
                      if (!token) return;
                      try {
                        await createAcceptanceCycle(token, currentVersion);
                        notify('Nuevo ciclo de aceptación creado.');
                        void loadAcceptanceData();
                      } catch (e: any) {
                        notify('Error: ' + (e.message || ''));
                      }
                    }}>
                      🔄 Crear nuevo ciclo
                    </Button>
                  </div>
                </div>
              )}

              {approvalStatus !== 'APPROVED' && approvalStatus !== 'APPROVED_AND_SIGNED' && (
                <div className="advanced-page__banner advanced-page__banner--warning">
                  ⏳ La matriz debe estar aprobada para iniciar el flujo de aceptación y firma.
                  Ve a la sección &quot;✍ Aprobaciones&quot; para aprobarla.
                </div>
              )}

              {/* Master document list */}
              <div className="advanced-page__section">
                <h4>📋 Lista Maestra de Documentos</h4>
                <div className="advanced-page__version-card">
                  <div className="advanced-page__version-header">
                    <span className="advanced-page__version-badge">RESP-SST-001</span>
                    <span className="advanced-page__version-current-badge">Actual</span>
                  </div>
                  <div className="advanced-page__version-details">
                    <p><strong>Documento:</strong> Matriz de Responsabilidades SG-SST</p>
                    <p><strong>Versión:</strong> v{currentVersion}</p>
                    <p><strong>Estado:</strong> {approvalStatus === 'APPROVED' ? '✅ Aprobado' : approvalStatus === 'ARCHIVED' ? '📦 Archivado' : '📝 Borrador'}</p>
                    {approvalStatus === 'APPROVED' && <p><strong>Aprobado el:</strong> {new Date().toLocaleDateString()}</p>}
                  </div>
                </div>
              </div>

              {/* Active acceptances table */}
              <div className="advanced-page__section">
                <h4>📋 Aceptaciones activas</h4>
                {pendingAcceptances.length === 0 ? (
                  <p className="empty-state">No hay aceptaciones pendientes. Asigna usuarios para iniciar el proceso.</p>
                ) : (
                  <div className="advanced-page__audit-table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Usuario</th>
                          <th>Email</th>
                          <th>Rol</th>
                          <th>Estado</th>
                          <th>Items</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingAcceptances.map((acc, _i) => (                            <tr key={acc._id || _i}>
                            <td>{acc.userName}</td>
                            <td>{acc.userEmail}</td>
                            <td>{acc.userRole || '—'}</td>
                            <td><span className={statusBadgeClass(acc.acceptanceStatus)}>{acc.acceptanceStatus}</span></td>
                            <td>{acc.assignedItemIds?.length || 0}</td>
                            <td>
                              <Button type="button" variant="ghost" onClick={() => {
                                setReviewingAcceptance(acc);
                                setSignatureInput('');
                                setHasRead(false);
                                setCorrectionComment('');
                              }}>
                                Ver
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Compliance rules */}
              <div className="advanced-page__section">
                <h4>✅ Regla de Cumplimiento</h4>
                <div className="advanced-page__banner advanced-page__banner--success" style={{ padding: '.75rem' }}>
                  <p style={{ margin: 0 }}>
                    <strong>✅ Cumple</strong> solo si:<br />
                    1. Matriz aprobada ✓{approvalStatus === 'APPROVED' ? '✅' : '❌'}<br />
                    2. Todos los usuarios asignados firmaron ✓
                    <span> {acceptanceStats && acceptanceStats.total > 0 ? (acceptanceStats.pending === 0 ? '✅' : `⏳ ${acceptanceStats.pending} pendientes`) : '⏸️ Sin asignaciones'}</span><br />
                    3. Versión activa ✓
                    <br />
                    <span className={badge.className} style={{ marginTop: '.5rem', display: 'inline-block' }}>{badge.label}</span>
                  </p>
                </div>
                {complianceWithAcceptance && (
                  <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
                    {(complianceWithAcceptance as any)?.complianceStatus === 'COMPLIES' ? '✅ Todas las condiciones cumplidas.' : (complianceWithAcceptance as any)?.reason || 'Pendiente de completar condiciones.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ======== PENDIENTES POR FIRMAR ======== */}
          {sidebarTab === 'pendientes' && (
            <div className="advanced-page__section">
              <h3>⏳ Responsabilidades Pendientes por Firmar</h3>
              <p className="muted">
                Revisa y firma digitalmente las responsabilidades que te han sido asignadas.
                Debes leer y aceptar cada responsabilidad antes de firmar.
              </p>

              {reviewingAcceptance ? (
                <div>
                  <div className="actions" style={{ marginBottom: '1rem' }}>
                    <Button type="button" variant="ghost" onClick={() => setReviewingAcceptance(null)}>
                      ← Volver a lista
                    </Button>
                  </div>

                  <div className="advanced-page__version-card">
                    <div className="advanced-page__version-header">
                      <span className="advanced-page__version-badge">v{reviewingAcceptance.matrixVersion || currentVersion}</span>
                      <span className="muted">Aprobado por: Manager</span>
                      <span className="muted">{new Date().toLocaleDateString()}</span>
                    </div>
                  </div>

                  <h4>Tus responsabilidades asignadas:</h4>
                  {rows.filter((r) => r.employeeId === reviewingAcceptance.userId || r.role === reviewingAcceptance.userRole).length === 0 ? (
                    <p className="empty-state">No hay responsabilidades asignadas específicamente.</p>
                  ) : (
                    <div className="advanced-page__audit-table-wrap" style={{ margin: '1rem 0' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Responsabilidad</th>
                            <th>Grupo</th>
                            <th>Obligatoria</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.filter((r) => r.employeeId === reviewingAcceptance.userId || r.role === reviewingAcceptance.userRole).map((r, _i) => (
                            <tr key={_i}>
                              <td>{_i + 1}</td>
                              <td>{r.title}</td>
                              <td>{r.category}</td>
                              <td>{r.requiresSignature ? '✅ Sí' : '—'}</td>
                              <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Acceptance checkbox */}
                  <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasRead}
                        onChange={(e) => setHasRead(e.target.checked)}
                        style={{ marginTop: '.25rem', transform: 'scale(1.2)' }}
                      />
                      <span><strong>☑ He leído y comprendido mis responsabilidades asignadas.</strong></span>
                    </label>
                  </div>

                  {/* Digital signature */}
                  <div className="advanced-page__section">
                    <h4>✍ Firma digital</h4>
                    <div className="actions" style={{ marginBottom: '1rem' }}>
                      <Button
                        type="button"
                        variant={signatureMethod === 'TYPED' ? 'primary' : 'secondary'}
                        onClick={() => setSignatureMethod('TYPED')}
                      >
                        ⌨️ Escribir nombre
                      </Button>
                      <Button
                        type="button"
                        variant={signatureMethod === 'DRAWN' ? 'primary' : 'secondary'}
                        onClick={() => setSignatureMethod('DRAWN')}
                      >
                        ✍️ Dibujar firma
                      </Button>
                    </div>

                    {signatureMethod === 'TYPED' && (
                      <input
                        className="input"
                        value={signatureInput}
                        onChange={(e) => setSignatureInput(e.target.value)}
                        placeholder="Escribe tu nombre completo"
                      />
                    )}

                    {signatureMethod === 'DRAWN' && (
                      <div>
                        <p className="muted">Dibuja tu firma en el recuadro</p>
                        <canvas
                          ref={canvasRef}
                          width={500}
                          height={120}
                          style={{ width: '100%', height: '100px', border: '2px dashed #d1d5db', borderRadius: '6px', cursor: 'crosshair', touchAction: 'none' }}
                          onMouseDown={(e) => {
                            const canvas = canvasRef.current;
                            if (!canvas) return;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;
                            setIsDrawing(true);
                            const rect = canvas.getBoundingClientRect();
                            ctx.beginPath();
                            ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                          }}
                          onMouseMove={(e) => {
                            if (!isDrawing) return;
                            const canvas = canvasRef.current;
                            if (!canvas) return;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;
                            const rect = canvas.getBoundingClientRect();
                            ctx.lineWidth = 2;
                            ctx.lineCap = 'round';
                            ctx.strokeStyle = '#000';
                            ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                          }}
                          onMouseUp={() => setIsDrawing(false)}
                          onMouseLeave={() => setIsDrawing(false)}
                          onTouchStart={(e) => {
                            const canvas = canvasRef.current;
                            if (!canvas) return;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;
                            setIsDrawing(true);
                            const rect = canvas.getBoundingClientRect();
                            const touch = e.touches[0];
                            ctx.beginPath();
                            ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
                          }}
                          onTouchMove={(e) => {
                            if (!isDrawing) return;
                            const canvas = canvasRef.current;
                            if (!canvas) return;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;
                            const rect = canvas.getBoundingClientRect();
                            const touch = e.touches[0];
                            ctx.lineWidth = 2;
                            ctx.lineCap = 'round';
                            ctx.strokeStyle = '#000';
                            ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
                          }}
                          onTouchEnd={() => setIsDrawing(false)}
                        />
                        <Button type="button" variant="ghost" onClick={() => {
                          const canvas = canvasRef.current;
                          if (!canvas) return;
                          const ctx = canvas.getContext('2d');
                          if (!ctx) return;
                          ctx.clearRect(0, 0, canvas.width, canvas.height);
                        }}>
                          Limpiar
                        </Button>
                      </div>
                    )}

                    <div className="actions" style={{ marginTop: '1rem' }}>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!hasRead || (signatureMethod === 'TYPED' && !signatureInput)}
                        onClick={async () => {
                          if (!token || !reviewingAcceptance) return;
                          let sigValue = signatureInput;
                          if (signatureMethod === 'DRAWN' && canvasRef.current) {
                            sigValue = canvasRef.current.toDataURL();
                          }
                          if (!sigValue) { notify('Debes proporcionar una firma.'); return; }
                          try {
                            const sigHash = btoa(sigValue.slice(0, 32)).replace(/=/g, '');
                            await acceptResponsibilities(token, {
                              userId: reviewingAcceptance.userId || '',
                              userEmail: '',
                              userName: sigValue,
                              userRole: 'MEMBER',
                              assignedItemIds: [],
                              hasRead: true,
                              signatureHash: sigHash,
                              ipAddress: '',
                              device: navigator.userAgent,
                            });
                            notify('✅ Responsabilidades aceptadas y firmadas exitosamente.');
                            setReviewingAcceptance(null);
                            void loadAcceptanceData();
                          } catch (e: any) {
                            notify('Error al firmar: ' + (e.message || ''));
                          }
                        }}
                      >
                        ✅ Aceptar y firmar
                      </Button>
                      {!showCorrection && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setShowCorrection(true)}
                        >
                          ↩️ Solicitar corrección
                        </Button>
                      )}
                    </div>

                    {showCorrection && (
                      <div style={{ marginTop: '.5rem' }}>
                        <textarea
                          className="input"
                          rows={3}
                          value={correctionComment}
                          onChange={(e) => setCorrectionComment(e.target.value)}
                          placeholder="Describe qué necesita corrección..."
                          style={{ width: '100%', minHeight: '60px' }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={!correctionComment}
                          onClick={async () => {
                            if (!token || !reviewingAcceptance) return;
                            try {
                              await requestCorrection(token, {
                                userId: reviewingAcceptance.userId || '',
                                userEmail: reviewingAcceptance.userEmail || '',
                                comment: correctionComment,
                              });
                              notify('Solicitud de corrección enviada.');
                              setReviewingAcceptance(null);
                              setShowCorrection(false);
                              void loadAcceptanceData();
                            } catch (e: any) {
                              notify('Error: ' + (e.message || ''));
                            }
                          }}
                        >
                          Enviar solicitud
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setShowCorrection(false)}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Reminders banner */}
                  {acceptanceReminders.length > 0 && (
                    <div className="advanced-page__banner advanced-page__banner--warning" style={{ marginBottom: '1rem' }}>
                      <strong>⏰ Recordatorios pendientes:</strong>
                      <ul style={{ margin: '.5rem 0 0', fontSize: '.9rem' }}>
                        {acceptanceReminders.slice(0, 5).map((r, i) => (
                          <li key={i}>{r.acceptance.userName} — {r.daysOverdue} día(s) sin firmar</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {myAcceptances.length === 0 ? (
                    <p className="empty-state">
                      No tienes responsabilidades pendientes por firmar.
                      Cuando el administrador te asigne responsabilidades, aparecerán aquí.
                    </p>
                  ) : (
                    <div className="advanced-page__audit-table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Usuario</th>
                            <th>Versión</th>
                            <th>Estado</th>
                            <th>Items</th>
                            <th>Asignado</th>
                            <th>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myAcceptances.filter((a) => a.acceptanceStatus === 'PENDING').map((acc, _i) => (
                            <tr key={acc._id || _i}>
                              <td>{acc.userName}</td>
                              <td>v{acc.matrixVersion || currentVersion}</td>
                              <td><span className={statusBadgeClass(acc.acceptanceStatus)}>{acc.acceptanceStatus}</span></td>
                              <td>{acc.assignedItemIds?.length || 0}</td>
                              <td>{(acc as any).createdAt ? new Date((acc as any).createdAt).toLocaleDateString() : '—'}</td>
                              <td>
                                <Button type="button" onClick={() => {
                                  setReviewingAcceptance(acc);
                                  setSignatureInput('');
                                  setHasRead(false);
                                  setCorrectionComment('');
                                }}>
                                  ✍ Revisar y firmar
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Already signed */}
                  {myAcceptances.filter((a) => a.acceptanceStatus === 'ACCEPTED').length > 0 && (
                    <div className="advanced-page__section">
                      <h4>✅ Ya firmadas</h4>
                      {myAcceptances.filter((a) => a.acceptanceStatus === 'ACCEPTED').map((acc, i) => (
                        <div key={i} className="advanced-page__version-card" style={{ marginBottom: '.5rem' }}>
                          <div className="advanced-page__version-header">
                            <span className="advanced-page__version-badge">✅ Aceptado</span>
                            <span className="muted">
                              {acc.acceptedAt ? new Date(acc.acceptedAt).toLocaleString() : ''}
                            </span>
                          </div>
                          <div className="advanced-page__version-details">
                            <p>
                              <strong>Firmado por:</strong> {acc.signature?.signedBy || acc.userName}
                              {acc.signature?.signatureHash && (
                                <code style={{ marginLeft: '1rem', fontSize: '.75rem', color: '#6b7280' }}>
                                  Hash: {acc.signature.signatureHash.slice(0, 12)}...
                                </code>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Acceptance history */}
              <div className="advanced-page__section">
                <h4>🕓 Historial de aceptaciones</h4>
                {acceptanceHistory.length === 0 ? (
                  <p className="empty-state">No hay historial de aceptaciones aún.</p>
                ) : (
                  <div className="advanced-page__audit-table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Usuario</th>
                          <th>Acción</th>
                          <th>Fecha</th>
                          <th>Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acceptanceHistory.slice(0, 20).map((entry: any, i: number) => (
                          <tr key={i}>
                            <td>{entry.userName || entry.userEmail || entry.userId || '—'}</td>
                            <td><span className="advanced-page__audit-action">{entry.action || entry.acceptanceStatus || '—'}</span></td>
                            <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : entry.date || '—'}</td>
                            <td style={{ fontSize: '.85rem' }}>{entry.acceptanceStatus === 'ACCEPTED' ? '✅ Firmó' : entry.acceptanceStatus === 'REJECTED' ? `❌ Rechazó: ${entry.rejectedReason || ''}` : entry.acceptanceStatus === 'EXPIRED' ? '⏰ Venció' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======== RENOVACIONES ======== */}
          {sidebarTab === 'renovaciones' && (
            <div className="advanced-page__section">
              <h3>🔄 Ciclo de Renovación Anual</h3>
              <p className="muted">
                Cada 12 meses, los usuarios deben renovar su aceptación de responsabilidades.
                El sistema puede procesar renovaciones automáticamente.
              </p>

              <AdvancedKpiGrid
                items={[
                  { label: 'Aceptaciones Activas', value: acceptanceStats?.accepted ?? 0 },
                  { label: 'Requieren Renovación', value: acceptanceStats?.expired ?? 0, variant: 'warning' },
                  { label: 'Ciclo Actual', value: currentVersion },
                  { label: 'Próxima Renovación', value: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString() },
                ]}
                columns={4}
              />

              <div className="advanced-page__section">
                <h4>⏰ Recordatorios programados</h4>
                <p className="muted">
                  Los recordatorios se envían automáticamente a los 30, 15, 5 y 1 día(s) antes del vencimiento.
                  Usa el botón para procesar renovaciones vencidas.
                </p>
                <div className="actions" style={{ marginTop: '.5rem' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      if (!token) return;
                      try {
                        const result = await processRenewals(token);
                        notify(`Renovaciones procesadas: ${result?.renewed || 0} usuario(s).`);
                        void loadAcceptanceData();
                      } catch (e: any) {
                        notify('Error: ' + (e.message || ''));
                      }
                    }}
                  >
                    🔄 Procesar renovaciones
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      if (!token) return;
                      try {
                        await createAcceptanceCycle(token, currentVersion);
                        notify('Nuevo ciclo de aceptación iniciado.');
                        void loadAcceptanceData();
                      } catch (e: any) {
                        notify('Error: ' + (e.message || ''));
                      }
                    }}
                  >
                    🚀 Iniciar nuevo ciclo
                  </Button>
                </div>
              </div>

              {/* Reminders list */}
              <div className="advanced-page__section">
                <h4>📋 Recordatorios pendientes</h4>
                {acceptanceReminders.length === 0 ? (
                  <p className="empty-state">No hay recordatorios pendientes.</p>
                ) : (
                  <div className="advanced-page__audit-table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Usuario</th>
                          <th>Email</th>
                          <th>Días sin firmar</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acceptanceReminders.map((r, i) => (
                          <tr key={i}>
                            <td>{r.acceptance.userName}</td>
                            <td>{r.acceptance.userEmail}</td>
                            <td><strong>{r.daysOverdue}</strong></td>
                            <td><span className={statusBadgeClass(r.acceptance.acceptanceStatus)}>{r.acceptance.acceptanceStatus}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======== SOCIALIZACIÓN ======== */}
          {sidebarTab === 'socializacion' && (
            <SocializationDashboard
              token={token}
              responsibilitiesDocId={standardCode || '1.1.2'}
              documentVersion={currentVersion}
              onComplete={() => {
                setApprovalStatus('SOCIALIZED');
                setSocializedAt(new Date().toLocaleString());
                addAudit({ action: 'Socialización completada', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: approvalStatus, newValue: 'SOCIALIZED' });
                markDirty();
              }}
            />
          )}

          {/* ======== DEFAULT FALLBACK ======== */}
          {sidebarTab !== 'resumen' && sidebarTab !== 'gerencia' && sidebarTab !== 'responsable-sst' && sidebarTab !== 'trabajadores' && sidebarTab !== 'copasst' && sidebarTab !== 'convivencia' && sidebarTab !== 'brigada' && sidebarTab !== 'aprobaciones' && sidebarTab !== 'versiones' && sidebarTab !== 'historial' && sidebarTab !== 'aceptaciones' && sidebarTab !== 'pendientes' && sidebarTab !== 'renovaciones' && sidebarTab !== 'socializacion' && (
            <div className="advanced-page__section">
              <h3>Sección en desarrollo</h3>
              <p className="muted">Contenido adicional próximamente.</p>
            </div>
          )}

          {/* Dirty indicator */}
          {dirty && (
            <div className="advanced-page__dirty-bar">
              ⚠ Hay cambios sin guardar
              {lastSaved && <span style={{ marginLeft: '1rem', fontSize: '.85rem' }}>Último guardado: {lastSaved}</span>}
            </div>
          )}
        </main>
      </div>
    </AdvancedPageLayout>
  );
}
