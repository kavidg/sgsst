import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResourceAssignmentAdvancedModel,
  ResponsableSstComplianceStatus,
  fetchResourceAssignmentAdvanced,
  updateResourceAssignmentAdvanced,
  submitResourceAssignmentAdvanced,
  approveResourceAssignmentAdvanced,
  rejectResourceAssignmentAdvanced,
  fetchEmployees,
  EmployeeModel,
  fetchMyProfile,
  UserModel,
} from '../api';
import { Button } from './ui/Button';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
} from './advanced-layout';

// ============================================================
// CONSTANTS
// ============================================================

const SIDEBAR_ITEMS = [
  { id: 'resumen', label: '📋 Resumen' },
  { id: 'presupuesto', label: '💰 Presupuesto SST' },
  { id: 'humanos', label: '👥 Recursos Humanos' },
  { id: 'fisicos', label: '🏢 Recursos Físicos' },
  { id: 'tecnologicos', label: '💻 Recursos Tecnológicos' },
  { id: 'evidencias', label: '📎 Evidencias' },
  { id: 'aprobaciones', label: '✍ Aprobaciones' },
  { id: 'alertas', label: '🔔 Alertas' },
  { id: 'versiones', label: '📂 Versiones' },
  { id: 'historial', label: '🕓 Historial' },
] as const;

type SidebarId = (typeof SIDEBAR_ITEMS)[number]['id'];



// ============================================================
// BUDGET EXECUTION TYPES
// ============================================================

interface BudgetExpense {
  id: string;
  category: string;
  description: string;
  supplier: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  evidence: string[];
  comments: string;
  registeredBy: string;
  registeredAt: string;
}

interface BudgetCategory {
  name: string;
  budgeted: number;
  executed: number;
  isCustom: boolean;
}

interface AnnualBudgetRecord {
  year: number;
  totalBudget: number;
  approvalDate: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ARCHIVED';
  approvedBy: string;
  approvalSignature: string;
  createdAt: string;
}

const DEFAULT_BUDGET_CATEGORIES = [
  'Capacitaciones',
  'Elementos de Protección Personal',
  'Exámenes Médicos',
  'Inspecciones',
  'Emergencias',
  'Brigada',
  'COPASST',
  'Comité de Convivencia',
  'Señalización',
  'Dotaciones',
  'Auditorías',
  'Consultoría SST',
  'Otros',
];

const BUDGET_STATUS_OPTIONS = [
  { value: 'SIN_EJECUCION', label: '🟡 Sin ejecución' },
  { value: 'EN_EJECUCION', label: '🟢 En ejecución' },
  { value: 'CASI_AGOTADO', label: '🟠 Casi agotado' },
  { value: 'AGOTADO', label: '🔴 Agotado' },
  { value: 'EXCEDIDO', label: '⛔ Excedido' },
] as const;

function computeBudgetStatus(executed: number, budgeted: number): string {
  if (!budgeted || budgeted <= 0) return 'SIN_EJECUCION';
  const pct = (executed / budgeted) * 100;
  if (pct > 100) return 'EXCEDIDO';
  if (pct >= 90) return 'AGOTADO';
  if (pct >= 60) return 'CASI_AGOTADO';
  if (pct > 0) return 'EN_EJECUCION';
  return 'SIN_EJECUCION';
}

function getBudgetStatusBadge(status: string) {
  const s = BUDGET_STATUS_OPTIONS.find((o) => o.value === status);
  return s?.label ?? '🟡 Sin ejecución';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

// ============================================================
// TYPES
// ============================================================

interface AuditEntry {
  action: string;
  user: string;
  date: string;
  field?: string;
  previousValue?: string;
  newValue?: string;
}

interface VersionEntry {
  version: string;
  createdAt: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
}

type ApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'APPROVED_AND_SIGNED' | 'REJECTED' | 'ARCHIVED';

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
// COMPLIANCE BADGE HELPER
// ============================================================

function complianceBadge(status?: ResponsableSstComplianceStatus) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'badge badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'badge badge--danger' };
  return { label: '⚠ Pendiente', className: 'badge badge--warning' };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ResourceAssignmentModule({ token }: { token: string }) {
  const navigate = useNavigate();
  const [sidebarTab, setSidebarTab] = useState<SidebarId>('resumen');
  const [record, setRecord] = useState<ResourceAssignmentAdvancedModel | null>(null);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  // User / role
  const [userProfile, setUserProfile] = useState<UserModel | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Approval / version state
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('DRAFT');
  const [versions] = useState<VersionEntry[]>([
    { version: '1.0', createdAt: new Date().toISOString(), createdBy: 'Sistema' },
  ]);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [currentVersion, setCurrentVersion] = useState('1.0');
  const [locked, setLocked] = useState(false);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const addAudit = (entry: AuditEntry) => {
    setAuditHistory((prev) => [entry, ...prev]);
  };

  const markDirty = () => setDirty(true);

  const role = userProfile?.role ?? 'member';
  const canApprove = role === 'owner' || role === 'manager';

  // Load data
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [data, employeeData, profile] = await Promise.all([
        fetchResourceAssignmentAdvanced(token),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
        fetchMyProfile(token).catch(() => null as UserModel | null),
      ]);
      setRecord(data);
      setEmployees(employeeData);
      setUserProfile(profile);
      // Sync approval state from backend
      const recordStatus = (data as unknown as Record<string, string>).approvalStatus as string | undefined;
      const recordLocked = (data as unknown as Record<string, boolean>).locked as boolean | undefined;
      const recordVersion = (data as unknown as Record<string, string>).currentVersion as string | undefined;
      if (recordStatus) setApprovalStatus(recordStatus as ApprovalStatus);
      if (recordLocked) setLocked(recordLocked);
      if (recordVersion) setCurrentVersion(recordVersion);
      setDirty(false);
      initialLoadDone.current = true;
    } catch {
      notify('No se pudieron cargar los datos de asignación de recursos.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // Save
  const save = useCallback(async () => {
    if (!token || !record || !dirty) return;
    setLoading(true);
    try {
      const saved = await updateResourceAssignmentAdvanced(token, {
        financialResources: record.financialResources,
        humanResources: record.humanResources,
        technicalResources: record.technicalResources,
        activities: record.activities,
        evidences: record.evidences,
        approval: record.approval,
      });
      setRecord(saved);
      setDirty(false);
      setLastSaved(new Date().toLocaleString());
      notify('Cambios guardados.');
    } catch {
      notify('Error al guardar.');
    } finally {
      setLoading(false);
    }
  }, [token, dirty, record]);

  // Autosave every 60s
  useAutoSave(save, 60000, dirty);

  // Unsaved changes warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);



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

  // Patch record helper
  const updateRecord = (patch: Partial<ResourceAssignmentAdvancedModel>) => {
    if (!record) return;
    setRecord({ ...record, ...patch });
    markDirty();
  };

  // ======== BUDGET EXECUTION STATE ========
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>(
    DEFAULT_BUDGET_CATEGORIES.map((name) => ({ name, budgeted: 0, executed: 0, isCustom: false }))
  );
  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [annualBudget, setAnnualBudget] = useState<AnnualBudgetRecord>({
    year: new Date().getFullYear(),
    totalBudget: 0,
    approvalDate: '',
    status: 'DRAFT',
    approvedBy: '',
    approvalSignature: '',
    createdAt: new Date().toISOString(),
  });
  const [budgetAuditLog, setBudgetAuditLog] = useState<AuditEntry[]>([]);
  const [previousYearBudget, setPreviousYearBudget] = useState<number>(0);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [pendingExpenseEvidences, setPendingExpenseEvidences] = useState<string[]>([]);
  const [expenseForm, setExpenseForm] = useState({
    category: DEFAULT_BUDGET_CATEGORIES[0],
    description: '',
    supplier: '',
    invoiceNumber: '',
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    comments: '',
  });
  const [budgetTab, setBudgetTab] = useState<'general' | 'categories' | 'expenses' | 'charts' | 'approval' | 'history' | 'alerts'>('general');

  // Computed budget metrics
  const totalBudgeted = budgetCategories.reduce((sum, cat) => sum + cat.budgeted, 0);
  const totalExecuted = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const availableBudget = totalBudgeted - totalExecuted;
  const executionPercent = totalBudgeted > 0 ? Math.round((totalExecuted / totalBudgeted) * 100) : 0;
  const budgetAlerts: string[] = [];

  if (totalBudgeted > 0) {
    if (executionPercent > 100) budgetAlerts.push('⛔ Presupuesto excedido: ejecución > 100%');
    else if (executionPercent > 90) budgetAlerts.push('🔴 Presupuesto casi agotado: ejecución > 90%');
    else if (executionPercent > 80) budgetAlerts.push('🟠 Presupuesto próximo al límite: ejecución > 80%');
    budgetCategories.forEach((cat) => {
      if (cat.budgeted > 0 && cat.executed >= cat.budgeted) budgetAlerts.push(`⛔ Categoría agotada: ${cat.name}`);
    });
  }

  const budgetStatus = computeBudgetStatus(totalExecuted, totalBudgeted);

  // Add budget audit
  const addBudgetAudit = (action: string, field: string, oldVal: string, newVal: string) => {
    setBudgetAuditLog((prev) => [{ action, user: 'Usuario actual', date: new Date().toLocaleString(), field, previousValue: oldVal, newValue: newVal }, ...prev]);
  };

  // Sync financial resources to backend
  const syncFinancialResources = () => {
    if (!record) return;
    const rows = budgetCategories
      .filter((cat) => cat.budgeted > 0 || cat.executed > 0)
      .map((cat) => ({
        concept: cat.name,
        description: `Programado: ${formatCurrency(cat.budgeted)} · Ejecutado: ${formatCurrency(cat.executed)}`,
        value: cat.budgeted,
        status: cat.executed > 0 ? 'EJECUTADO' : cat.budgeted > 0 ? 'APROBADO' : 'PENDIENTE',
        responsible: '',
        date: new Date().toISOString().slice(0, 10),
      }));
    // Add a summary row for total
    rows.unshift({
      concept: `Total Ejecución Presupuestal ${annualBudget.year}`,
      description: `Programado: ${formatCurrency(totalBudgeted)} · Ejecutado: ${formatCurrency(totalExecuted)} · %: ${executionPercent}%`,
      value: totalBudgeted,
      status: budgetStatus === 'EXCEDIDO' ? 'EJECUTADO' : budgetStatus === 'AGOTADO' ? 'EJECUTADO' : 'APROBADO',
      responsible: annualBudget.approvedBy || '',
      date: new Date().toISOString().slice(0, 10),
    });
    updateRecord({ financialResources: rows });
  };

  // Human resources CRUD
  const addHumanRow = () => {
    if (!record) return;
    updateRecord({
      humanResources: [...record.humanResources, { employeeId: '', role: '', responsibilities: [], active: true }],
    });
  };

  const updateHumanRow = (index: number, patch: Partial<ResourceAssignmentAdvancedModel['humanResources'][0]>) => {
    if (!record) return;
    const next = [...record.humanResources];
    next[index] = { ...next[index], ...patch };
    updateRecord({ humanResources: next });
  };

  const removeHumanRow = (index: number) => {
    if (!record) return;
    updateRecord({ humanResources: record.humanResources.filter((_, i) => i !== index) });
  };

  // Technical resources CRUD
  const addTechnicalRow = () => {
    if (!record) return;
    updateRecord({
      technicalResources: [...record.technicalResources, { name: '', status: 'OPERATIVO', quantity: 1, responsible: '' }],
    });
  };

  const updateTechnicalRow = (index: number, patch: Partial<ResourceAssignmentAdvancedModel['technicalResources'][0]>) => {
    if (!record) return;
    const next = [...record.technicalResources];
    next[index] = { ...next[index], ...patch };
    updateRecord({ technicalResources: next });
  };

  const removeTechnicalRow = (index: number) => {
    if (!record) return;
    updateRecord({ technicalResources: record.technicalResources.filter((_, i) => i !== index) });
  };

  // Approval actions
  const submitForApproval = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const saved = await submitResourceAssignmentAdvanced(token);
      setRecord(saved);
      setApprovalStatus('PENDING_APPROVAL');
      setLocked(true);
      addAudit({ action: 'Enviado a aprobación', user: userProfile?.email ?? 'Usuario actual', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'DRAFT', newValue: 'PENDING_APPROVAL' });
      notify('Solicitud de aprobación enviada.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al enviar a aprobación.');
    } finally {
      setLoading(false);
    }
  };

  const approveModule = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const saved = await approveResourceAssignmentAdvanced(token);
      setRecord(saved);
      const newStatus = (saved as unknown as Record<string, string>).approvalStatus as string ?? 'APPROVED';
      setApprovalStatus(newStatus as ApprovalStatus);
      setLocked(true);
      addAudit({ action: newStatus === 'APPROVED_AND_SIGNED' ? 'Aprobado y firmado por Representante Legal' : 'Aprobado por MANAGER', user: userProfile?.email ?? 'Manager', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'PENDING_APPROVAL', newValue: newStatus });
      notify('Módulo aprobado.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al aprobar.');
    } finally {
      setLoading(false);
    }
  };

  const rejectModule = async (reason: string) => {
    if (!token || !reason.trim()) return;
    setLoading(true);
    try {
      const saved = await rejectResourceAssignmentAdvanced(token, reason);
      setRecord(saved);
      setApprovalStatus('REJECTED');
      setLocked(false);
      addAudit({ action: 'Rechazado por MANAGER', user: userProfile?.email ?? 'Manager', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'PENDING_APPROVAL', newValue: 'REJECTED' });
      setShowRejectModal(false);
      setRejectionReason('');
      notify('Módulo rechazado.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al rechazar.');
    } finally {
      setLoading(false);
    }
  };

  const archiveModule = () => {
    setApprovalStatus('ARCHIVED');
    setLocked(true);
    addAudit({ action: 'Archivado', user: 'Usuario actual', date: new Date().toLocaleString(), field: 'approvalStatus', previousValue: 'APPROVED', newValue: 'ARCHIVED' });
    markDirty();
    notify('Módulo archivado.');
  };

  const badge = record ? complianceBadge(record.complianceStatus) : complianceBadge('PENDING');
  const totalFinancial = record?.financialResources.length ?? 0;
  const totalHuman = record?.humanResources.filter((h) => h.active).length ?? 0;
  const totalTechnical = record?.technicalResources.length ?? 0;
  const totalEvidences = record?.evidences.length ?? 0;
  const isApproved = Boolean(record?.approval?.approved);

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
        moduleCode="1.1.3"
        moduleTitle="Asignación de Recursos SG-SST"
        description="Asignación de recursos financieros, humanos y técnicos para el SG-SST"
        statusBadge={
          <>
            <span className={badge.className}>{badge.label}</span>
            {record?.complianceReason && <span className="text-muted-small">{record.complianceReason}</span>}
            <span className="budget-page__status-badge">{isApproved ? '✅ Aprobado' : '⏳ Pendiente'}</span>
          </>
        }
        actions={[
          {
            label: '📄 Exportar PDF',
            variant: 'secondary' as const,
            onClick: () => {
              const reportLines = [
                '=== ASIGNACIÓN DE RECURSOS SG-SST ===',
                `Empresa: Documento REC-SST-001`,
                `Versión: v${currentVersion}`,
                `Estado: ${approvalStatus === 'APPROVED' ? 'Aprobado' : approvalStatus === 'PENDING_APPROVAL' ? 'Pendiente' : approvalStatus === 'ARCHIVED' ? 'Archivado' : 'Borrador'}`,
                `Generado: ${new Date().toLocaleString()}`,
                '',
                `Recursos financieros: ${totalFinancial}`,
                `Recursos humanos: ${totalHuman}`,
                `Recursos técnicos: ${totalTechnical}`,
                `Evidencias: ${totalEvidences}`,
                '',
                '=== FIN DEL REPORTE ===',
              ];
              const blob = new Blob([reportLines.join('\n')], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `asignacion-recursos-sst-v${currentVersion}.txt`;
              a.click();
              URL.revokeObjectURL(url);
              notify('📄 Reporte exportado.');
            },
          },
          { label: '📊 Exportar Excel', variant: 'secondary' as const, onClick: () => notify('Función de exportación Excel próximamente.') },
          { label: loading ? 'Guardando...' : '💾 Guardar cambios', onClick: () => void save(), disabled: loading || !dirty },
        ]}
        lastSaved={lastSaved}
      />

      {/* Toast */}
      {toast && <div className="toast-alert" style={{ margin: '0 1rem' }}><p>{toast}</p></div>}

      {/* Rejection reason modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>❌ Rechazar solicitud</h3>
            <p>Indica el motivo del rechazo:</p>
            <textarea
              className="input"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Motivo del rechazo..."
              style={{ width: '100%', marginBottom: '.5rem' }}
            />
            <div className="actions">
              <Button type="button" disabled={!rejectionReason.trim() || loading} onClick={() => rejectModule(rejectionReason)}>
                {loading ? 'Rechazando...' : '✅ Confirmar rechazo'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setShowRejectModal(false); setRejectionReason(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Approval banners */}
      {(approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED') && (
        <div className="resource-page__banner resource-page__banner--success">
          ✅ Módulo {approvalStatus === 'APPROVED_AND_SIGNED' ? 'aprobado y firmado por Representante Legal' : 'aprobado'} (v{currentVersion}). Contenido bloqueado.
        </div>
      )}
      {approvalStatus === 'REJECTED' && (
        <div className="resource-page__banner resource-page__banner--danger">
          ❌ Módulo rechazado. Edición reabierta para correcciones.
        </div>
      )}
      {approvalStatus === 'ARCHIVED' && (
        <div className="resource-page__banner resource-page__banner--archived">📦 Módulo archivado. Solo lectura.</div>
      )}
      {approvalStatus === 'PENDING_APPROVAL' && (
        <>
          {canApprove ? (
            <div className="resource-page__banner resource-page__banner--warning">⏳ Este documento se encuentra en revisión por Gerencia.</div>
          ) : (
            <div className="resource-page__banner resource-page__banner--warning">⏳ Pendiente de aprobación por Manager.</div>
          )}
        </>
      )}

      <div className="resource-page__body">
        {/* Sidebar */}
        <nav className="resource-page__sidebar">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`resource-page__sidebar-item ${sidebarTab === item.id ? 'resource-page__sidebar-item--active' : ''}`}
              onClick={() => setSidebarTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="resource-page__content">
          {loading && !initialLoadDone.current && <p className="muted">Cargando...</p>}
          {!record && !loading && <p className="muted">No hay datos disponibles.</p>}

          {/* ======== RESUMEN ======== */}
          {sidebarTab === 'resumen' && record && (
            <div className="resource-page__section">
              <h3>📋 Resumen de Asignación de Recursos</h3>
              <p className="muted">
                Gestiona la asignación de recursos financieros, humanos, físicos y tecnológicos para el SG-SST.
              </p>
              <AdvancedKpiGrid
                items={[
                  { label: '💰 Recursos Financieros', value: `${totalFinancial} conceptos`, icon: '💰' },
                  { label: '👥 Recursos Humanos', value: `${totalHuman} activos`, icon: '👥' },
                  { label: '🏢 Recursos Técnicos', value: `${totalTechnical} registros`, icon: '🏢' },
                  { label: '📎 Evidencias', value: `${totalEvidences} archivos`, icon: '📎' },
                  { label: 'Versión Actual', value: `v${currentVersion}` },
                  { label: 'Cumplimiento PHVA', value: badge.label, variant: record.complianceStatus === 'COMPLIES' ? 'success' : record.complianceStatus === 'NON_COMPLIANT' ? 'danger' : 'warning' },
                ]}
                columns={6}
              />
              <div className="resource-page__group-summary">
                {SIDEBAR_ITEMS.filter((item) => item.id !== 'resumen').map((item) => (
                  <button
                    key={item.id}
                    className="resource-page__group-card"
                    onClick={() => setSidebarTab(item.id as SidebarId)}
                  >
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ======== PRESUPUESTO SST ======== */}
          {sidebarTab === 'presupuesto' && record && (
            <div className="resource-page">
              {/* Budget Tab Navigation */}
              <div className="budget-page__tabs">
                {[
                  { id: 'general' as const, label: '📊 General' },
                  { id: 'categories' as const, label: '📂 Categorías' },
                  { id: 'expenses' as const, label: '🧾 Gastos' },
                  { id: 'charts' as const, label: '📈 Gráficos' },
                  { id: 'approval' as const, label: '✍ Aprobación' },
                  { id: 'history' as const, label: '🕓 Historial' },
                  { id: 'alerts' as const, label: '🔔 Alertas' },
                ].map((tab) => (
                  <Button
                    key={tab.id}
                    type="button"
                    variant={budgetTab === tab.id ? 'primary' : 'secondary'}
                    onClick={() => setBudgetTab(tab.id)}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>

              {/* ===== TAB: GENERAL ===== */}
              {budgetTab === 'general' && (
                <>
                  {/* KPI Card Header */}
                  <div className="budget-page__kpi-grid">
                    <article className="budget-page__kpi-card budget-page__kpi-card--primary">
                      <span className="budget-page__kpi-label">Presupuesto Programado</span>
                      <span className="budget-page__kpi-value">{formatCurrency(totalBudgeted)}</span>
                    </article>
                    <article className="budget-page__kpi-card budget-page__kpi-card--executed">
                      <span className="budget-page__kpi-label">Presupuesto Ejecutado</span>
                      <span className="budget-page__kpi-value">{formatCurrency(totalExecuted)}</span>
                    </article>
                    <article className={`budget-page__kpi-card ${availableBudget >= 0 ? 'budget-page__kpi-card--available' : 'budget-page__kpi-card--danger'}`}>
                      <span className="budget-page__kpi-label">Saldo Disponible</span>
                      <span className="budget-page__kpi-value">{formatCurrency(availableBudget)}</span>
                    </article>
                    <article className={`budget-page__kpi-card ${executionPercent <= 60 ? 'budget-page__kpi-card--success' : executionPercent <= 90 ? 'budget-page__kpi-card--warning' : 'budget-page__kpi-card--danger'}`}>
                      <span className="budget-page__kpi-label">% Ejecutado</span>
                      <span className="budget-page__kpi-value">{executionPercent}%</span>
                    </article>
                  </div>

                  {/* Progress Bar */}
                  <div className="resource-page__section">
                    <h3>Progreso de Ejecución Presupuestal</h3>
                    <div className="budget-page__progress-container">
                      <div className="budget-page__progress-bar">
                        <div
                          className={`budget-page__progress-fill ${
                            executionPercent <= 25 ? 'budget-page__progress-fill--low' :
                            executionPercent <= 50 ? 'budget-page__progress-fill--medium' :
                            executionPercent <= 75 ? 'budget-page__progress-fill--high' :
                            'budget-page__progress-fill--critical'
                          }`}
                          style={{ width: `${Math.min(100, executionPercent)}%` }}
                        />
                      </div>
                      <div className="budget-page__progress-labels">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                      </div>
                      <div className="budget-page__progress-marks">
                        {[25, 50, 75, 100].map((pct) => (
                          <div key={pct} className="budget-page__progress-mark" style={{ left: `${pct}%` }}>
                            <div className="budget-page__progress-mark-line" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="budget-page__amount-summary">
                      <div className="budget-page__amount-item">
                        <span className="budget-page__amount-label">💵 Programado</span>
                        <span className="budget-page__amount-value">{formatCurrency(totalBudgeted)}</span>
                      </div>
                      <div className="budget-page__amount-item">
                        <span className="budget-page__amount-label">💸 Ejecutado</span>
                        <span className="budget-page__amount-value">{formatCurrency(totalExecuted)}</span>
                      </div>
                      <div className="budget-page__amount-item">
                        <span className="budget-page__amount-label">💰 Disponible</span>
                        <span className="budget-page__amount-value">{formatCurrency(availableBudget)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Annual Budget */}
                  <div className="resource-page__section">
                    <h3>Presupuesto Anual SG-SST {annualBudget.year}</h3>
                    <div className="budget-page__annual-grid">
                      <label className="field">
                        <span className="label">Año</span>
                        <input className="input" type="number" disabled={locked} value={annualBudget.year} onChange={(e) => {
                          setAnnualBudget({ ...annualBudget, year: Number(e.target.value) });
                          addBudgetAudit('Modificar año', 'year', String(annualBudget.year), e.target.value);
                          markDirty();
                        }} />
                      </label>
                      <label className="field">
                        <span className="label">Presupuesto Total</span>
                        <input className="input" type="number" disabled={locked} value={annualBudget.totalBudget} onChange={(e) => {
                          const val = Number(e.target.value);
                          setAnnualBudget({ ...annualBudget, totalBudget: val });
                          // Auto-distribute among categories
                          const perCategory = DEFAULT_BUDGET_CATEGORIES.length;
                          const baseAmount = Math.round(val / perCategory);
                          setBudgetCategories((prev) => prev.map((cat, i) => ({
                            ...cat,
                            budgeted: i < DEFAULT_BUDGET_CATEGORIES.length ? baseAmount : cat.budgeted,
                          })));
                          addBudgetAudit('Modificar presupuesto total', 'totalBudget', formatCurrency(annualBudget.totalBudget), formatCurrency(val));
                          syncFinancialResources();
                          markDirty();
                        }} />
                      </label>
                      <label className="field">
                        <span className="label">Fecha Aprobación</span>
                        <input className="input" type="date" disabled={locked} value={annualBudget.approvalDate} onChange={(e) => {
                          setAnnualBudget({ ...annualBudget, approvalDate: e.target.value });
                          markDirty();
                        }} />
                      </label>
                      <label className="field">
                        <span className="label">Estado</span>
                        <select className="input" disabled={locked} value={annualBudget.status} onChange={(e) => {
                          setAnnualBudget({ ...annualBudget, status: e.target.value as AnnualBudgetRecord['status'] });
                          addBudgetAudit('Cambiar estado presupuesto', 'status', annualBudget.status, e.target.value);
                          markDirty();
                        }}>
                          <option value="DRAFT">📝 Borrador</option>
                          <option value="PENDING_APPROVAL">⏳ Pendiente aprobación</option>
                          <option value="APPROVED">✅ Aprobado</option>
                          <option value="ARCHIVED">📦 Archivado</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">Aprobado por</span>
                        <input className="input" disabled={locked} value={annualBudget.approvedBy} onChange={(e) => {
                          setAnnualBudget({ ...annualBudget, approvedBy: e.target.value });
                          markDirty();
                        }} />
                      </label>
                      <label className="field">
                        <span className="label">Firma de Aprobación</span>
                        <textarea className="input" disabled={locked} rows={2} value={annualBudget.approvalSignature} onChange={(e) => {
                          setAnnualBudget({ ...annualBudget, approvalSignature: e.target.value });
                          markDirty();
                        }} placeholder="Firma digital (base64 o texto)" />
                      </label>
                    </div>
                    <div className="actions" style={{ marginTop: '.5rem' }}>
                      <Button type="button" variant="secondary" onClick={syncFinancialResources}>
                        🔄 Sincronizar con backend
                      </Button>
                      {annualBudget.status === 'DRAFT' && (
                        <Button type="button" onClick={() => {
                          setAnnualBudget({ ...annualBudget, status: 'PENDING_APPROVAL' });
                          addBudgetAudit('Enviar a aprobación presupuesto anual', 'status', 'DRAFT', 'PENDING_APPROVAL');
                          syncFinancialResources();
                          markDirty();

                        }}>
                          📤 Enviar a aprobación
                        </Button>
                      )}
                      {annualBudget.status === 'PENDING_APPROVAL' && (
                        <Button type="button" onClick={() => {
                          setAnnualBudget({ ...annualBudget, status: 'APPROVED', approvedBy: 'Manager', approvalDate: new Date().toISOString().slice(0, 10) });
                          addBudgetAudit('Aprobar presupuesto anual', 'status', 'PENDING_APPROVAL', 'APPROVED');
                          syncFinancialResources();
                          markDirty();

                        }}>
                          ✅ Aprobar presupuesto (Manager)
                        </Button>
                      )}
                    </div>
                    <div className="budget-page__status-badge-container">
                      Estado del presupuesto: <span className={`budget-page__status-badge budget-page__status-badge--${budgetStatus.toLowerCase()}`}>{getBudgetStatusBadge(budgetStatus)}</span>
                    </div>
                  </div>
                </>
              )}

              {/* ===== TAB: CATEGORÍAS ===== */}
              {budgetTab === 'categories' && (
                <div className="resource-page__section">
                  <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>📂 Categorías Presupuestales</h3>
                    {!locked && (
                      <div className="actions">
                        <input className="input" placeholder="Nueva categoría..." value={customCategoryInput} onChange={(e) => setCustomCategoryInput(e.target.value)} style={{ maxWidth: 200 }} />
                        <Button type="button" variant="secondary" disabled={!customCategoryInput} onClick={() => {
                          if (!customCategoryInput.trim()) return;
                          setBudgetCategories((prev) => [...prev, { name: customCategoryInput.trim(), budgeted: 0, executed: 0, isCustom: true }]);
                          addBudgetAudit('Agregar categoría', 'category', '', customCategoryInput.trim());
                          setCustomCategoryInput('');
                          markDirty();
                        }}>
                          + Agregar
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="responsive-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Categoría</th>
                          <th>Presupuesto Programado</th>
                          <th>Presupuesto Ejecutado</th>
                          <th>Saldo</th>
                          <th>Cumplimiento</th>
                          <th>Estado</th>
                          {!locked && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {budgetCategories.map((cat, i) => {
                          const catExecuted = expenses.filter((e) => e.category === cat.name).reduce((sum, e) => sum + e.amount, 0);
                          const catBalance = cat.budgeted - catExecuted;
                          const catPct = cat.budgeted > 0 ? Math.round((catExecuted / cat.budgeted) * 100) : 0;
                          const catStatus = computeBudgetStatus(catExecuted, cat.budgeted);
                          return (
                            <tr key={cat.name}>
                              <td>
                                <input className="input" disabled={locked} value={cat.name} onChange={(e) => {
                                  const newCat = [...budgetCategories];
                                  newCat[i] = { ...newCat[i], name: e.target.value };
                                  setBudgetCategories(newCat);
                                  markDirty();
                                }} />
                                {cat.isCustom && <span className="budget-page__custom-badge">Personalizado</span>}
                              </td>
                              <td>
                                <input className="input" disabled={locked} type="number" value={cat.budgeted} onChange={(e) => {
                                  const newCat = [...budgetCategories];
                                  newCat[i] = { ...newCat[i], budgeted: Number(e.target.value) };
                                  setBudgetCategories(newCat);
                                  addBudgetAudit('Modificar presupuesto categoría', cat.name, formatCurrency(cat.budgeted), formatCurrency(Number(e.target.value)));
                                  syncFinancialResources();
                                  markDirty();
                                }} />
                              </td>
                              <td><strong>{formatCurrency(catExecuted)}</strong></td>
                              <td className={catBalance < 0 ? 'budget-page__cell--danger' : 'budget-page__cell--success'}>
                                {formatCurrency(catBalance)}
                              </td>
                              <td>
                                <div className="budget-page__mini-progress">
                                  <div className="budget-page__mini-progress-track">
                                    <div
                                      className={`budget-page__mini-progress-fill ${
                                        catPct <= 25 ? 'budget-page__progress-fill--low' :
                                        catPct <= 50 ? 'budget-page__progress-fill--medium' :
                                        catPct <= 75 ? 'budget-page__progress-fill--high' :
                                        'budget-page__progress-fill--critical'
                                      }`}
                                      style={{ width: `${Math.min(100, catPct)}%` }}
                                    />
                                  </div>
                                  <span>{catPct}%</span>
                                </div>
                              </td>
                              <td><span className={`budget-page__status-dot budget-page__status-dot--${catStatus.toLowerCase()}`}>{getBudgetStatusBadge(catStatus)}</span></td>
                              {!locked && (
                                <td>
                                  {cat.isCustom && (
                                    <Button type="button" variant="danger" onClick={() => {
                                      setBudgetCategories(budgetCategories.filter((_, idx) => idx !== i));
                                      addBudgetAudit('Eliminar categoría', 'category', cat.name, '');
                                      markDirty();
                                    }}>🗑</Button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {budgetCategories.length === 0 && <p className="empty-state">No hay categorías presupuestales definidas.</p>}
                </div>
              )}

              {/* ===== TAB: GASTOS ===== */}
              {budgetTab === 'expenses' && (
                <div className="resource-page__section">
                  <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>🧾 Registro de Gastos</h3>
                    {!locked && (
                      <Button type="button" onClick={() => { setShowExpenseForm(true); setPendingExpenseEvidences([]); }}>
                        + Registrar gasto
                      </Button>
                    )}
                  </div>

                  {showExpenseForm && (
                    <div className="budget-page__expense-form">
                      <h4>Nuevo Gasto</h4>
                      <div className="grid grid-2">
                        <label className="field">
                          <span className="label">Categoría</span>
                          <select className="input" disabled={locked} value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                            {budgetCategories.map((c) => <option key={c.name}>{c.name}</option>)}
                          </select>
                        </label>
                        <label className="field">
                          <span className="label">Descripción</span>
                          <input className="input" disabled={locked} value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
                        </label>
                        <label className="field">
                          <span className="label">Proveedor</span>
                          <input className="input" disabled={locked} value={expenseForm.supplier} onChange={(e) => setExpenseForm({ ...expenseForm, supplier: e.target.value })} />
                        </label>
                        <label className="field">
                          <span className="label">N° Factura</span>
                          <input className="input" disabled={locked} value={expenseForm.invoiceNumber} onChange={(e) => setExpenseForm({ ...expenseForm, invoiceNumber: e.target.value })} />
                        </label>
                        <label className="field">
                          <span className="label">Fecha</span>
                          <input className="input" type="date" disabled={locked} value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                        </label>
                        <label className="field">
                          <span className="label">Valor</span>
                          <input className="input" type="number" disabled={locked} value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })} />
                        </label>
                      </div>
                      <label className="field">
                        <span className="label">Comentarios</span>
                        <textarea className="input" disabled={locked} rows={2} value={expenseForm.comments} onChange={(e) => setExpenseForm({ ...expenseForm, comments: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="label">Evidencias (URLs - PDF, imágenes, facturas)</span>
                        <div className="actions">
                          <input className="input" placeholder="URL de evidencia..." onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                              setPendingExpenseEvidences([...(pendingExpenseEvidences ?? []), (e.target as HTMLInputElement).value]);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }} />
                        </div>
                        {pendingExpenseEvidences.length > 0 && (
                          <div className="budget-page__evidence-list">
                            {pendingExpenseEvidences.map((ev, idx) => (
                              <div key={idx} className="budget-page__evidence-item">
                                <a href={ev} target="_blank" rel="noreferrer">{ev.slice(0, 50)}...</a>
                                <Button type="button" variant="ghost" onClick={() => setPendingExpenseEvidences(pendingExpenseEvidences.filter((_, i) => i !== idx))}>✕</Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="muted" style={{ fontSize: '.8rem' }}>Formatos aceptados: PDF, imágenes, facturas, órdenes de compra, contratos, soportes de pago</p>
                      </label>
                      <div className="actions" style={{ marginTop: '.5rem' }}>
                        <Button type="button" disabled={locked || !expenseForm.description || !expenseForm.amount} onClick={() => {
                          const newExpense: BudgetExpense = {
                            id: `exp-${Date.now()}`,
                            ...expenseForm,
                            evidence: pendingExpenseEvidences,
                            registeredBy: 'Usuario actual',
                            registeredAt: new Date().toISOString(),
                          };
                          setExpenses((prev) => [...prev, newExpense]);
                          // Update category executed
                          setBudgetCategories((prev) => prev.map((cat) =>
                            cat.name === expenseForm.category
                              ? { ...cat, executed: cat.executed + expenseForm.amount }
                              : cat
                          ));
                          addBudgetAudit('Registrar gasto', expenseForm.category, '', `${formatCurrency(expenseForm.amount)} - ${expenseForm.description}`);
                          setShowExpenseForm(false);
                          setExpenseForm({
                            category: budgetCategories[0]?.name ?? DEFAULT_BUDGET_CATEGORIES[0],
                            description: '',
                            supplier: '',
                            invoiceNumber: '',
                            date: new Date().toISOString().slice(0, 10),
                            amount: 0,
                            comments: '',
                          });
                          syncFinancialResources();
                          markDirty();
                        }}>
                          ✅ Registrar gasto
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => setShowExpenseForm(false)}>Cancelar</Button>
                      </div>
                    </div>
                  )}

                  <div className="responsive-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Categoría</th>
                          <th>Descripción</th>
                          <th>Proveedor</th>
                          <th>Factura</th>
                          <th>Fecha</th>
                          <th>Valor</th>
                          <th>Evidencias</th>
                          <th>Registrado por</th>
                          {!locked && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.slice().reverse().map((exp) => (
                          <tr key={exp.id}>
                            <td><span className="budget-page__category-tag">{exp.category}</span></td>
                            <td>{exp.description}</td>
                            <td>{exp.supplier || '—'}</td>
                            <td>{exp.invoiceNumber || '—'}</td>
                            <td>{exp.date}</td>
                            <td><strong>{formatCurrency(exp.amount)}</strong></td>
                            <td>
                              {exp.evidence.length > 0 ? (
                                <div className="actions">
                                  {exp.evidence.map((ev, ei) => (
                                    <a key={ei} className="btn btn-secondary" href={ev} target="_blank" rel="noreferrer">📎 {ei + 1}</a>
                                  ))}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="muted" style={{ fontSize: '.85rem' }}>{exp.registeredBy}</td>
                            {!locked && (
                              <td>
                                <Button type="button" variant="danger" onClick={() => {
                                  setExpenses(expenses.filter((e) => e.id !== exp.id));
                                  setBudgetCategories((prev) => prev.map((cat) =>
                                    cat.name === exp.category
                                      ? { ...cat, executed: Math.max(0, cat.executed - exp.amount) }
                                      : cat
                                  ));
                                  addBudgetAudit('Eliminar gasto', exp.category, `${formatCurrency(exp.amount)}`, '');
                                  syncFinancialResources();
                                  markDirty();
                                }}>🗑</Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {expenses.length === 0 && !showExpenseForm && <p className="empty-state">No hay gastos registrados.</p>}
                </div>
              )}

              {/* ===== TAB: GRÁFICOS ===== */}
              {budgetTab === 'charts' && (
                <>
                  <div className="resource-page__section">
                    <h3>📈 Programado vs Ejecutado por Categoría</h3>
                    <div className="budget-page__chart-grid">
                      {budgetCategories.filter((c) => c.budgeted > 0 || c.executed > 0).map((cat) => {
                        const catExecuted = expenses.filter((e) => e.category === cat.name).reduce((sum, e) => sum + e.amount, 0);
                        const barMax = Math.max(cat.budgeted, catExecuted, 1);
                        return (
                          <div key={cat.name} className="budget-page__chart-item">
                            <div className="budget-page__chart-header">
                              <strong>{cat.name}</strong>
                              <span className="muted">{formatCurrency(catExecuted)} / {formatCurrency(cat.budgeted)}</span>
                            </div>
                            <div className="budget-page__chart-bars">
                              <div className="budget-page__chart-bar-row">
                                <span className="budget-page__chart-bar-label">Programado</span>
                                <div className="budget-page__chart-bar-track">
                                  <div className="budget-page__chart-bar budget-page__chart-bar--planned" style={{ width: `${(cat.budgeted / barMax) * 100}%` }} />
                                </div>
                              </div>
                              <div className="budget-page__chart-bar-row">
                                <span className="budget-page__chart-bar-label">Ejecutado</span>
                                <div className="budget-page__chart-bar-track">
                                  <div className="budget-page__chart-bar budget-page__chart-bar--executed" style={{ width: `${(catExecuted / barMax) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="resource-page__section">
                    <h3>Distribución Anual del Presupuesto</h3>
                    <div className="budget-page__chart-pie-container">
                      {budgetCategories.filter((c) => c.budgeted > 0).map((cat) => {
                        const pct = totalBudgeted > 0 ? Math.round((cat.budgeted / totalBudgeted) * 100) : 0;
                        const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#d946ef', '#0ea5e9'];
                        const idx = budgetCategories.indexOf(cat) % colors.length;
                        return (
                          <div key={cat.name} className="budget-page__pie-row">
                            <span className="budget-page__pie-dot" style={{ background: colors[idx] }} />
                            <span className="budget-page__pie-label">{cat.name}</span>
                            <span className="budget-page__pie-value">{formatCurrency(cat.budgeted)}</span>
                            <span className="budget-page__pie-pct">{pct}%</span>
                            <div className="budget-page__pie-bar">
                              <div className="budget-page__pie-bar-fill" style={{ width: `${pct}%`, background: colors[idx] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Historical Comparison */}
                  <div className="resource-page__section">
                    <h3>Comparativo Histórico</h3>
                    <div className="budget-page__historical-grid">
                      <div className="budget-page__historical-card">
                        <span className="budget-page__historical-year">{annualBudget.year - 1}</span>
                        <span className="budget-page__historical-amount">{formatCurrency(previousYearBudget)}</span>
                        <span className="muted">Año anterior</span>
                      </div>
                      <div className="budget-page__historical-card budget-page__historical-card--current">
                        <span className="budget-page__historical-year">{annualBudget.year}</span>
                        <span className="budget-page__historical-amount">{formatCurrency(totalBudgeted)}</span>
                        <span className="muted">Año actual</span>
                      </div>
                      <div className="budget-page__historical-card budget-page__historical-card--diff">
                        <span className="budget-page__historical-year">Diferencia</span>
                        <span className={`budget-page__historical-amount ${totalBudgeted >= previousYearBudget ? 'budget-page__historical-amount--positive' : 'budget-page__historical-amount--negative'}`}>
                          {previousYearBudget > 0 ? `${totalBudgeted >= previousYearBudget ? '+' : ''}${((totalBudgeted - previousYearBudget) / previousYearBudget * 100).toFixed(1)}%` : 'N/A'}
                        </span>
                        <span className="muted">{previousYearBudget > 0 ? `vs ${formatCurrency(previousYearBudget)}` : 'Sin datos año anterior'}</span>
                      </div>
                    </div>
                    <label className="field" style={{ marginTop: '.5rem' }}>
                      <span className="label">Presupuesto año anterior</span>
                      <input className="input" type="number" disabled={locked} value={previousYearBudget} onChange={(e) => {
                        setPreviousYearBudget(Number(e.target.value));
                        markDirty();
                      }} />
                    </label>
                  </div>

                  {/* Monthly Spending (simulated) */}
                  <div className="resource-page__section">
                    <h3>Tendencia Mensual de Gastos</h3>
                    <div className="budget-page__monthly-grid">
                      {Array.from({ length: 12 }, (_, i) => {
                        const month = i + 1;
                        const monthExpenses = expenses.filter((e) => {
                          const expMonth = parseInt(e.date.split('-')[1] || '0', 10);
                          return expMonth === month;
                        });
                        const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
                        const maxMonth = Math.max(...Array.from({ length: 12 }, (_, mi) => {
                          return expenses.filter((e) => parseInt(e.date.split('-')[1] || '0', 10) === mi + 1).reduce((s, e) => s + e.amount, 0);
                        }), 1);
                        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                        return (
                          <div key={month} className="budget-page__month-bar">
                            <div className="budget-page__month-bar-fill" style={{ height: `${(monthTotal / maxMonth) * 100}%`, background: monthTotal > 0 ? '#2563eb' : '#e5e7eb' }} />
                            <span className="budget-page__month-label">{months[i]}</span>
                            <span className="budget-page__month-value">{formatCurrency(monthTotal)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* ===== TAB: APROBACIÓN ===== */}
              {budgetTab === 'approval' && (
                <div className="resource-page__section">
                  <h3>✍ Flujo de Aprobación del Presupuesto</h3>
                  <p className="muted">
                    Solo MANAGER puede aprobar el presupuesto anual. Una vez aprobado, se registra la firma digital y se bloquea la edición.
                  </p>

                  <div className="budget-page__approval-steps">
                    <div className={`budget-page__approval-step ${annualBudget.status === 'DRAFT' ? 'budget-page__approval-step--active' : annualBudget.status === 'APPROVED' || annualBudget.status === 'ARCHIVED' ? 'budget-page__approval-step--done' : ''}`}>
                      <span className="budget-page__approval-icon">📝</span>
                      <strong>Borrador</strong>
                    </div>
                    <div className="budget-page__approval-connector" />
                    <div className={`budget-page__approval-step ${annualBudget.status === 'PENDING_APPROVAL' ? 'budget-page__approval-step--active' : annualBudget.status === 'APPROVED' || annualBudget.status === 'ARCHIVED' ? 'budget-page__approval-step--done' : ''}`}>
                      <span className="budget-page__approval-icon">⏳</span>
                      <strong>Pendiente aprobación</strong>
                    </div>
                    <div className="budget-page__approval-connector" />
                    <div className={`budget-page__approval-step ${annualBudget.status === 'APPROVED' ? 'budget-page__approval-step--active' : ''}`}>
                      <span className="budget-page__approval-icon">✅</span>
                      <strong>Aprobado</strong>
                    </div>
                  </div>

                  <div className="budget-page__approval-info">
                    <p><strong>Estado actual:</strong> {
                      annualBudget.status === 'DRAFT' ? '📝 Borrador - El presupuesto puede editarse' :
                      annualBudget.status === 'PENDING_APPROVAL' ? '⏳ Pendiente de aprobación por Manager' :
                      annualBudget.status === 'APPROVED' ? '✅ Presupuesto aprobado' :
                      '📦 Presupuesto archivado'
                    }</p>
                    {annualBudget.approvedBy && (
                      <p><strong>Aprobado por:</strong> {annualBudget.approvedBy}</p>
                    )}
                    {annualBudget.approvalDate && (
                      <p><strong>Fecha de aprobación:</strong> {annualBudget.approvalDate}</p>
                    )}
                    {annualBudget.approvalSignature && (
                      <div className="budget-page__signature-preview">
                        <strong>Firma:</strong>
                        <div className="budget-page__signature-box">{annualBudget.approvalSignature}</div>
                      </div>
                    )}
                  </div>

                  <div className="actions" style={{ marginTop: '.5rem' }}>
                    {annualBudget.status === 'DRAFT' && (
                      <Button type="button" onClick={() => {
                        setAnnualBudget({ ...annualBudget, status: 'PENDING_APPROVAL' });
                        addBudgetAudit('Enviar a aprobación presupuesto', 'status', 'DRAFT', 'PENDING_APPROVAL');
                        markDirty();
                      }}>
                        📤 Enviar a aprobación
                      </Button>
                    )}
                    {annualBudget.status === 'PENDING_APPROVAL' && (
                      <>
                        <Button type="button" onClick={() => {
                          setAnnualBudget({ ...annualBudget, status: 'APPROVED', approvedBy: 'Manager', approvalDate: new Date().toISOString().slice(0, 10) });
                          addBudgetAudit('Aprobar presupuesto', 'status', 'PENDING_APPROVAL', 'APPROVED');
                          syncFinancialResources();
                          markDirty();
                        }}>
                          ✅ Aprobar presupuesto
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => {
                          setAnnualBudget({ ...annualBudget, status: 'DRAFT' });
                          addBudgetAudit('Rechazar presupuesto', 'status', 'PENDING_APPROVAL', 'DRAFT');
                          markDirty();
                        }}>
                          ↩️ Rechazar / Devolver
                        </Button>
                      </>
                    )}
                    {annualBudget.status === 'APPROVED' && (
                      <Button type="button" variant="ghost" onClick={() => {
                        setAnnualBudget({ ...annualBudget, status: 'ARCHIVED' });
                        addBudgetAudit('Archivar presupuesto', 'status', 'APPROVED', 'ARCHIVED');
                        markDirty();
                      }}>
                        📦 Archivar presupuesto
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ===== TAB: HISTORIAL ===== */}
              {budgetTab === 'history' && (
                <div className="resource-page__section">
                  <h3>🕓 Auditoría de Ejecución Presupuestal</h3>
                  <p className="muted">Registro completo de todas las operaciones presupuestales.</p>
                  {budgetAuditLog.length === 0 ? (
                    <p className="empty-state">Aún no hay movimientos registrados en el presupuesto.</p>
                  ) : (
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
                          {budgetAuditLog.map((entry) => (
                            <tr key={entry.action + entry.date}>
                              <td><span className="budget-page__audit-action">{entry.action}</span></td>
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
              )}

              {/* ===== TAB: ALERTAS ===== */}
              {budgetTab === 'alerts' && (
                <div className="resource-page__section">
                  <h3>🔔 Alertas Presupuestales</h3>
                  <p className="muted">
                    Alertas generadas automáticamente según la ejecución presupuestal.
                    Se generan cuando la ejecución supera el 80%, 90% o 100%, o cuando una categoría se agota.
                  </p>
                  {budgetAlerts.length === 0 ? (
                    <p className="empty-state">No hay alertas presupuestales activas. ✅</p>
                  ) : (
                    <ul className="budget-page__alert-list">
                      {budgetAlerts.map((alert, i) => (
                        <li key={i} className="budget-page__alert-item">
                          <span className="budget-page__alert-icon">⚠️</span>
                          <span>{alert}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="budget-page__status-overview">
                    <h4>Resumen de Estado</h4>
                    <div className="budget-page__status-grid">
                      <div className="budget-page__status-item">
                        <span className="budget-page__status-indicator budget-page__status-indicator--info">🟡</span>
                        <span>Sin ejecución (0%)</span>
                      </div>
                      <div className="budget-page__status-item">
                        <span className="budget-page__status-indicator budget-page__status-indicator--success">🟢</span>
                        <span>En ejecución (1-59%)</span>
                      </div>
                      <div className="budget-page__status-item">
                        <span className="budget-page__status-indicator budget-page__status-indicator--warning">🟠</span>
                        <span>Casi agotado (60-89%)</span>
                      </div>
                      <div className="budget-page__status-item">
                        <span className="budget-page__status-indicator budget-page__status-indicator--danger">🔴</span>
                        <span>Agotado (90-100%)</span>
                      </div>
                      <div className="budget-page__status-item">
                        <span className="budget-page__status-indicator budget-page__status-indicator--critical">⛔</span>
                        <span>Excedido (&gt;100%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======== RECURSOS HUMANOS ======== */}
          {sidebarTab === 'humanos' && record && (
            <div className="resource-page__section">
              <h3>👥 Recursos Humanos</h3>
              <p className="muted">Asigna el personal responsable de la ejecución del SG-SST.</p>
              {!locked && <Button type="button" onClick={addHumanRow}>+ Agregar recurso humano</Button>}
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Rol</th>
                      <th>Responsabilidades</th>
                      <th>Activo</th>
                      {!locked && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {record.humanResources.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <select className="input" disabled={locked} value={row.employeeId} onChange={(e) => updateHumanRow(i, { employeeId: e.target.value })}>
                            <option value="">Seleccionar...</option>
                            {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} · {emp.position}</option>)}
                          </select>
                        </td>
                        <td><input className="input" disabled={locked} value={row.role} onChange={(e) => updateHumanRow(i, { role: e.target.value })} /></td>
                        <td>
                          <input className="input" disabled={locked} value={(row.responsibilities ?? []).join(', ')} onChange={(e) => updateHumanRow(i, { responsibilities: e.target.value.split(',').map((s) => s.trim()) })} />
                        </td>
                        <td>
                          <input type="checkbox" checked={row.active !== false} disabled={locked} onChange={(e) => updateHumanRow(i, { active: e.target.checked })} />
                        </td>
                        {!locked && <td><Button type="button" variant="danger" onClick={() => removeHumanRow(i)}>🗑</Button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {record.humanResources.length === 0 && <p className="empty-state">No hay recursos humanos asignados.</p>}
            </div>
          )}

          {/* ======== RECURSOS FÍSICOS / TECNOLÓGICOS ======== */}
          {sidebarTab === 'fisicos' && record && (
            <div className="resource-page__section">
              <h3>🏢 Recursos Físicos</h3>
              <p className="muted">Gestiona los recursos físicos asignados al SG-SST (equipos, instalaciones, mobiliario).</p>
              {!locked && <Button type="button" onClick={addTechnicalRow}>+ Agregar recurso</Button>}
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Cantidad</th>
                      <th>Estado</th>
                      <th>Responsable</th>
                      <th>Mantenimiento</th>
                      {!locked && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {record.technicalResources.map((row, i) => (
                      <tr key={i}>
                        <td><input className="input" disabled={locked} value={row.name} onChange={(e) => updateTechnicalRow(i, { name: e.target.value })} /></td>
                        <td><input className="input" disabled={locked} type="number" value={row.quantity ?? 1} onChange={(e) => updateTechnicalRow(i, { quantity: Number(e.target.value) })} /></td>
                        <td>
                          <select className="input" disabled={locked} value={row.status ?? 'OPERATIVO'} onChange={(e) => updateTechnicalRow(i, { status: e.target.value })}>
                            <option value="OPERATIVO">Operativo</option>
                            <option value="EN_MANTENIMIENTO">En mantenimiento</option>
                            <option value="FUERA_DE_SERVICIO">Fuera de servicio</option>
                          </select>
                        </td>
                        <td><input className="input" disabled={locked} value={row.responsible ?? ''} onChange={(e) => updateTechnicalRow(i, { responsible: e.target.value })} /></td>
                        <td><input className="input" disabled={locked} type="date" value={row.maintenanceDate?.slice(0, 10) ?? ''} onChange={(e) => updateTechnicalRow(i, { maintenanceDate: e.target.value })} /></td>
                        {!locked && <td><Button type="button" variant="danger" onClick={() => removeTechnicalRow(i)}>🗑</Button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {record.technicalResources.length === 0 && <p className="empty-state">No hay recursos físicos registrados.</p>}
            </div>
          )}

          {/* ======== RECURSOS TECNOLÓGICOS ======== */}
          {sidebarTab === 'tecnologicos' && record && (
            <div className="resource-page__section">
              <h3>💻 Recursos Tecnológicos</h3>
              <p className="muted">Gestiona los recursos tecnológicos como software, licencias, sistemas de información.</p>
              {!locked && <Button type="button" onClick={addTechnicalRow}>+ Agregar recurso tecnológico</Button>}
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre / Software</th>
                      <th>Cantidad</th>
                      <th>Estado</th>
                      <th>Responsable</th>
                      {!locked && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {record.technicalResources.map((row, i) => (
                      <tr key={i}>
                        <td><input className="input" disabled={locked} value={row.name} onChange={(e) => updateTechnicalRow(i, { name: e.target.value })} /></td>
                        <td><input className="input" disabled={locked} type="number" value={row.quantity ?? 1} onChange={(e) => updateTechnicalRow(i, { quantity: Number(e.target.value) })} /></td>
                        <td>
                          <select className="input" disabled={locked} value={row.status ?? 'OPERATIVO'} onChange={(e) => updateTechnicalRow(i, { status: e.target.value })}>
                            <option value="OPERATIVO">Operativo</option>
                            <option value="EN_MANTENIMIENTO">En mantenimiento</option>
                            <option value="FUERA_DE_SERVICIO">Fuera de servicio</option>
                          </select>
                        </td>
                        <td><input className="input" disabled={locked} value={row.responsible ?? ''} onChange={(e) => updateTechnicalRow(i, { responsible: e.target.value })} /></td>
                        {!locked && <td><Button type="button" variant="danger" onClick={() => removeTechnicalRow(i)}>🗑</Button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {record.technicalResources.length === 0 && <p className="empty-state">No hay recursos tecnológicos registrados.</p>}
            </div>
          )}

          {/* ======== EVIDENCIAS ======== */}
          {sidebarTab === 'evidencias' && record && (
            <div className="resource-page__section">
              <h3>📎 Evidencias</h3>
              <p className="muted">Documentos soporte de la asignación de recursos.</p>
              {record.evidences.length === 0 ? (
                <p className="empty-state">No hay evidencias cargadas.</p>
              ) : (
                <div className="resource-page__evidence-grid">
                  {record.evidences.map((evidence, i) => (
                    <article key={i} className="resource-page__evidence-card">
                      <strong>{evidence.fileName}</strong>
                      {evidence.fileUrl && (
                        <div className="actions">
                          <a className="btn btn-secondary" href={evidence.fileUrl} target="_blank" rel="noreferrer">Ver</a>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======== APROBACIONES ======== */}
          {sidebarTab === 'aprobaciones' && record && (
            <div className="resource-page__section">
              <h3>✍ Flujo de Aprobación</h3>
              <p className="muted">
                El módulo de Asignación de Recursos SG-SST sigue un flujo de aprobación. Una vez aprobado, el contenido se bloquea.
              </p>
              <div className="budget-page__approval-steps">
                <div className={`budget-page__approval-step ${approvalStatus === 'DRAFT' ? 'budget-page__approval-step--active' : approvalStatus === 'PENDING_APPROVAL' || approvalStatus === 'REJECTED' || approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' || approvalStatus === 'ARCHIVED' ? 'budget-page__approval-step--done' : ''}`}>
                  <strong>📝 Borrador</strong>
                </div>
                <div className="budget-page__approval-connector" />
                <div className={`budget-page__approval-step ${approvalStatus === 'PENDING_APPROVAL' ? 'budget-page__approval-step--active' : approvalStatus === 'REJECTED' ? 'budget-page__approval-step--danger' : approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' || approvalStatus === 'ARCHIVED' ? 'budget-page__approval-step--done' : ''}`}>
                  <strong>⏳ Pendiente aprobación</strong>
                </div>
                <div className="budget-page__approval-connector" />
                <div className={`budget-page__approval-step ${approvalStatus === 'REJECTED' ? 'budget-page__approval-step--active budget-page__approval-step--danger' : approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' || approvalStatus === 'ARCHIVED' ? 'budget-page__approval-step--done' : ''}`}>
                  <strong>❌ Rechazado</strong>
                </div>
                <div className="budget-page__approval-connector" />
                <div className={`budget-page__approval-step ${approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' ? 'budget-page__approval-step--active' : approvalStatus === 'ARCHIVED' ? 'budget-page__approval-step--done' : ''}`}>
                  <strong>✅ Aprobado</strong>
                </div>
                <div className="budget-page__approval-connector" />
                <div className={`budget-page__approval-step ${approvalStatus === 'ARCHIVED' ? 'budget-page__approval-step--active' : ''}`}>
                  <strong>📦 Archivado</strong>
                </div>
              </div>
              <div className="actions" style={{ marginTop: '1rem' }}>
                {approvalStatus === 'DRAFT' && !locked && (
                  <Button type="button" onClick={submitForApproval} disabled={loading}>
                    {loading ? 'Enviando...' : '📤 Enviar a aprobación'}
                  </Button>
                )}
                {approvalStatus === 'PENDING_APPROVAL' && canApprove && (
                  <>
                    <Button type="button" onClick={approveModule} disabled={loading}>
                      {loading ? 'Aprobando...' : '✅ Aprobar módulo'}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => setShowRejectModal(true)} disabled={loading}>
                      ❌ Rechazar
                    </Button>
                  </>
                )}
                {approvalStatus === 'PENDING_APPROVAL' && !canApprove && (
                  <p className="muted">Este documento se encuentra en revisión por Gerencia.</p>
                )}
                {approvalStatus === 'REJECTED' && (
                  <>
                    <p className="muted" style={{ marginBottom: '.5rem' }}>
                      Motivo del rechazo: <strong>{record.rejectionReason || 'No especificado'}</strong>
                    </p>
                    <Button type="button" onClick={submitForApproval} disabled={loading}>
                      {loading ? 'Enviando...' : '📤 Reenviar a aprobación'}
                    </Button>
                  </>
                )}
                {(approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED') && (
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
              <div className="resource-page__section" style={{ marginTop: '1rem' }}>
                <h4>Estado actual de aprobación</h4>
                {approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED' ? (
                  <div className="resource-page__banner resource-page__banner--success">
                    ✅ {approvalStatus === 'APPROVED_AND_SIGNED' ? 'Aprobado y firmado por Representante Legal' : 'Aprobado'} 
                    {record.approval?.signedBy ? ` por ${record.approval.signedBy}` : ''}
                    {record.approval?.signedAt ? ` el ${new Date(record.approval.signedAt).toLocaleString()}` : ''}
                  </div>
                ) : approvalStatus === 'REJECTED' ? (
                  <div className="resource-page__banner resource-page__banner--danger">
                    ❌ Rechazado. Motivo: {record.rejectionReason || 'No especificado'}
                  </div>
                ) : approvalStatus === 'PENDING_APPROVAL' ? (
                  <div className="resource-page__banner resource-page__banner--warning">
                    ⏳ Pendiente de aprobación gerencial.
                  </div>
                ) : (
                  <p className="muted">Pendiente de aprobación gerencial.</p>
                )}
              </div>
            </div>
          )}

          {/* ======== ALERTAS ======== */}
          {sidebarTab === 'alertas' && record && (
            <div className="resource-page__section">
              <h3>🔔 Alertas</h3>
              {record.alerts.length === 0 ? (
                <p className="empty-state">No hay alertas generadas.</p>
              ) : (
                <ul className="budget-page__alert-list">
                  {record.alerts.map((alert, i) => (
                    <li key={i} className="budget-page__alert-item">
                      <span className="resource-badge resource-badge--warning">⚠</span> {alert}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ======== VERSIONES ======== */}
          {sidebarTab === 'versiones' && (
            <div className="resource-page__section">
              <h3>📂 Versiones</h3>
              <p className="muted">Historial de versiones del módulo de asignación de recursos.</p>
              {versions.length === 0 ? (
                <p className="empty-state">Aún no hay versiones registradas.</p>
              ) : (
                versions.map((ver) => (
                  <article key={ver.version} className={`resource-page__version-card ${ver.version === currentVersion ? 'resource-page__version-card--current' : ''}`}>
                    <div className="resource-page__version-header">
                      <span className="resource-page__version-badge">v{ver.version}</span>
                      {ver.version === currentVersion && <span className="resource-page__version-current-badge">Actual</span>}
                      <span className="muted">{new Date(ver.createdAt).toLocaleString()}</span>
                    </div>
                    <p><strong>Creado por:</strong> {ver.createdBy}</p>
                    {ver.approvedBy && <p><strong>Aprobado por:</strong> {ver.approvedBy} {ver.approvedAt ? `el ${new Date(ver.approvedAt).toLocaleString()}` : ''}</p>}
                  </article>
                ))
              )}
            </div>
          )}

          {/* ======== HISTORIAL ======== */}
          {sidebarTab === 'historial' && (
            <div className="resource-page__section">
              <h3>🕓 Historial de Auditoría</h3>
              <p className="muted">Registro completo de todas las acciones realizadas en el módulo.</p>
              {auditHistory.length === 0 ? (
                <p className="empty-state">Aún no hay movimientos registrados.</p>
              ) : (
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
                          <td><span className="budget-page__audit-action">{entry.action}</span></td>
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
              <div className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>Total de entradas: {auditHistory.length}</div>
            </div>
          )}
        </main>
      </div>

      {/* Dirty indicator */}
      {dirty && (
        <div className="resource-page__dirty-bar">
          ⚠ Hay cambios sin guardar
          {lastSaved && <span style={{ marginLeft: '1rem', fontSize: '.85rem' }}>Último guardado: {lastSaved}</span>}
        </div>
      )}
    </AdvancedPageLayout>
  );
}
