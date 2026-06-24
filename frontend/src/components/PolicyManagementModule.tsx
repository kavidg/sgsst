import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EmployeeModel,
  SstPolicyAdvancedModel,
  PolicyVersionModel,
  PolicySignatureModel,
  PolicySocializationModel,
  PolicyAlertModel,
  PolicyHistoryModel,
  PolicyMasterListRowModel,
  ResponsableSstComplianceStatus,
  fetchSstPolicyAdvanced,
  generateSstPolicyAdvanced,
  updateSstPolicyAdvanced,
  createSstPolicyVersionAdvanced,
  archiveSstPolicyVersionAdvanced,
  updateSstPolicySignatureAdvanced,
  approveSstPolicyAdvanced,
  assignSstPolicySocializationAdvanced,
  updateSstPolicySocializationAdvanced,
  fetchSstPolicyMasterListAdvanced,
  fetchEmployees,
  createSignatureCampaign,
  addCampaignWorkers,
} from '../api';
import { Button } from './ui/Button';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
} from './advanced-layout';
import { Modal } from './ui/Modal';
import TemplateAdminPanel from './TemplateAdminPanel';

// ============================================================
// HELPERS
// ============================================================

function toDateInputValue(value?: string | Date) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function complianceBadge(status?: ResponsableSstComplianceStatus) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'badge badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'badge badge--danger' };
  return { label: '⚠ Pendiente', className: 'badge badge--warning' };
}

function sstStatusBadge(status?: string) {
  if (status === 'Aprobado') return { label: '✅ Aprobado', className: 'badge badge--success' };
  if (status === 'Borrador') return { label: '📝 Borrador', className: 'badge badge--draft' };
  if (status === 'Vencido') return { label: '⚠ Vencido', className: 'badge badge--danger' };
  if (status === 'Archivado') return { label: '📦 Archivado', className: 'badge badge--archived' };
  return { label: status ?? '—', className: 'badge badge--draft' };
}

function signatureStatusBadge(status?: string) {
  if (status === 'Firmado') return { label: '✅ Firmado', className: 'badge badge--success' };
  if (status === 'Rechazado') return { label: '❌ Rechazado', className: 'badge badge--danger' };
  return { label: '⏳ Pendiente', className: 'badge badge--warning' };
}

function socialStatusBadge(status?: string) {
  if (status === 'Firmado digitalmente') return { label: '✅ Firmado', className: 'badge badge--success' };
  if (status === 'Leído') return { label: '👁 Leído', className: 'badge badge--info' };
  return { label: '⏳ Pendiente', className: 'badge badge--warning' };
}

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
// SIDEBAR ITEMS
// ============================================================

const SIDEBAR_ITEMS = [
  { id: 'resumen', label: '📋 Resumen' },
  { id: 'politica', label: '📄 Política SST' },
  { id: 'editor', label: '✏️ Editor de Contenido' },
  { id: 'firmas', label: '✍ Firmas' },
  { id: 'aprobacion', label: '✅ Aprobación' },
  { id: 'socializacion', label: '👥 Socialización' },
  { id: 'listado-maestro', label: '📚 Listado Maestro' },
  { id: 'versiones', label: '📂 Versiones' },
  { id: 'alertas', label: '🔔 Alertas' },
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'historial', label: '🕓 Historial' },
  { id: 'configuracion', label: '⚙️ Configuración' },
  { id: 'plantillas', label: '📦 Plantillas' },
] as const;

type SidebarId = (typeof SIDEBAR_ITEMS)[number]['id'];

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PolicyManagementModule({ token }: { token: string }) {
  const navigate = useNavigate();

  // --- Core state ---
  const [record, setRecord] = useState<SstPolicyAdvancedModel | null>(null);
  const [masterList, setMasterList] = useState<PolicyMasterListRowModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [sidebarTab, setSidebarTab] = useState<SidebarId>('resumen');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // --- Socialization state ---
  const [area, setArea] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  // --- Signature modal ---
  const [signatureModalRole, setSignatureModalRole] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');

  // --- Campaign modal ---
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignWorkers, setCampaignWorkers] = useState<string[]>([]);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  };

  const markDirty = () => setDirty(true);

  // --- Data loading ---
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [policy, list, emps] = await Promise.all([
        fetchSstPolicyAdvanced(token),
        fetchSstPolicyMasterListAdvanced(token),
        fetchEmployees(token),
      ]);
      setRecord(policy);
      setMasterList(list);
      setEmployees(emps);
      setDirty(false);
    } catch (e: any) {
      notify('Error al cargar política SST: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // --- Save ---
  const save = useCallback(async () => {
    if (!token || !record || !dirty) return;
    try {
      const saved = await updateSstPolicyAdvanced(token, {
        documentCode: record.documentCode,
        documentName: record.documentName,
        currentVersion: record.currentVersion,
        status: record.status,
        content: record.content,
      });
      setRecord(saved);
      setMasterList(await fetchSstPolicyMasterListAdvanced(token));
      setDirty(false);
      setLastSaved(new Date().toLocaleString());
    } catch (e: any) {
      notify('Error al guardar: ' + (e.message || ''));
    }
  }, [token, record, dirty]);

  useAutoSave(save, 60000, dirty);

  // --- Unsaved changes ---
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

  // --- Patch record ---
  const patchRecord = (patch: Partial<SstPolicyAdvancedModel>) => {
    setRecord((prev) => prev ? { ...prev, ...patch } : prev);
    markDirty();
  };

  const currentVersion = useMemo(
    () => record?.versions.find((v) => v.version === record.currentVersion),
    [record]
  );

  const badge = complianceBadge(record?.complianceStatus);

  // --- Generate ---
  const handleGenerate = async () => {
    if (!token) return;
    try {
      const generated = await generateSstPolicyAdvanced(token);
      setRecord(generated);
      setDirty(false);
      notify('✅ Política SST generada con datos de la empresa.');
    } catch (e: any) {
      notify('Error al generar: ' + (e.message || ''));
    }
  };

  // --- Generate new version ---
  const handleNewVersion = async () => {
    if (!token) return;
    try {
      const updated = await createSstPolicyVersionAdvanced(token);
      setRecord(updated);
      notify('Nueva versión creada.');
    } catch (e: any) {
      notify('Error: ' + (e.message || ''));
    }
  };

  // --- Archive version ---
  const handleArchiveVersion = async (version: string) => {
    if (!token) return;
    try {
      const updated = await archiveSstPolicyVersionAdvanced(token, version);
      setRecord(updated);
      notify('Versión archivada.');
    } catch (e: any) {
      notify('Error: ' + (e.message || ''));
    }
  };

  // --- Signature ---
  const handleSign = async (role: string) => {
    if (!token || !signerName) return;
    try {
      const updated = await updateSstPolicySignatureAdvanced(token, {
        role,
        signerName,
        signerEmail: signerEmail || undefined,
        status: 'Firmado',
        evidence: 'Firma digital desde el módulo de gestión',
      });
      setRecord(updated);
      setSignatureModalRole(null);
      setSignerName('');
      setSignerEmail('');
      notify(`✅ Firma registrada para ${role}`);
    } catch (e: any) {
      notify('Error al firmar: ' + (e.message || ''));
    }
  };

  // --- Approve ---
  const handleApprove = async () => {
    if (!token) return;
    try {
      const updated = await approveSstPolicyAdvanced(token);
      setRecord(updated);
      notify('✅ Política SST aprobada exitosamente.');
    } catch (e: any) {
      notify('Error al aprobar: ' + (e.message || ''));
    }
  };

  // --- Socialization ---
  const handleAssignAll = async () => {
    if (!token) return;
    try {
      const updated = await assignSstPolicySocializationAdvanced(token, { mode: 'all' });
      setRecord(updated);
      notify('Todos los trabajadores asignados a socialización.');
    } catch (e: any) { notify('Error: ' + (e.message || '')); }
  };

  const handleAssignArea = async () => {
    if (!token || !area) return;
    try {
      const updated = await assignSstPolicySocializationAdvanced(token, { mode: 'area', area });
      setRecord(updated);
      notify(`Trabajadores del área "${area}" asignados.`);
    } catch (e: any) { notify('Error: ' + (e.message || '')); }
  };

  const handleAssignSelected = async () => {
    if (!token || !selectedEmployees.length) return;
    try {
      const updated = await assignSstPolicySocializationAdvanced(token, { mode: 'selected', employeeIds: selectedEmployees });
      setRecord(updated);
      setSelectedEmployees([]);
      notify(`${selectedEmployees.length} trabajador(es) asignados.`);
    } catch (e: any) { notify('Error: ' + (e.message || '')); }
  };

  const handleUpdateSocialization = async (employeeId: string, status: 'Leído' | 'Firmado digitalmente') => {
    if (!token) return;
    try {
      const updated = await updateSstPolicySocializationAdvanced(token, {
        employeeId,
        status,
        evidence: status === 'Firmado digitalmente' ? 'Firma digital' : 'Lectura registrada',
      });
      setRecord(updated);
      notify(`Estado actualizado a: ${status}`);
    } catch (e: any) { notify('Error: ' + (e.message || '')); }
  };

  // --- Create Signature Campaign (socialization via WorkerSignatureCampaign) ---
  const handleCreateCampaign = async () => {
    if (!token || !record) return;
    try {
      const campaign = await createSignatureCampaign(token, {
        name: `Socialización Política SST v${record.currentVersion}`,
        description: `Socialización obligatoria de la Política de Seguridad y Salud en el Trabajo versión ${record.currentVersion}. Aprobada el ${currentVersion?.approvedAt ? new Date(currentVersion.approvedAt).toLocaleDateString() : '—'}.`,
        documentType: 'POLICY',
        documentVersion: record.currentVersion,
        documentContent: record.content || '',
        sourceModule: 'POLICY_SOCIALIZATION',
        sourceEntityId: record._id,
        requireOtp: false,
        requireSignature: true,
        expiresAt: currentVersion?.expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      // Add workers
      const pendingWorkers = record.socializations
        .filter((s) => s.status !== 'Firmado digitalmente')
        .map((s) => ({
          name: s.employeeName,
          identification: s.employeeId || '',
          area: s.area || undefined,
        }))
        .filter((w) => w.identification);
      if (pendingWorkers.length > 0) {
        await addCampaignWorkers(token, campaign._id, pendingWorkers);
      }
      setShowCampaignModal(false);
      notify(`✅ Campaña de socialización creada: "${campaign.name}"`);
    } catch (e: any) {
      notify('Error al crear campaña: ' + (e.message || ''));
    }
  };

  // --- Export ---
  const exportDocument = (type: 'pdf' | 'word') => {
    if (!record) return;
    const body = [
      `${record.documentCode} · ${record.documentName}`,
      `Versión ${record.currentVersion}`,
      `Estado: ${record.status}`,
      '',
      record.content ?? '',
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.documentCode || 'POL-SST'}.${type === 'pdf' ? 'txt' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Socialization stats ---
  const socialStats = useMemo(() => {
    if (!record) return { total: 0, read: 0, signed: 0, pending: 0, pct: 0 };
    const total = record.socializations.length;
    const signed = record.socializations.filter((s) => s.status === 'Firmado digitalmente').length;
    const read = record.socializations.filter((s) => s.status === 'Leído').length;
    const pending = total - signed - read;
    return { total, read, signed, pending, pct: total ? Math.round((signed / total) * 100) : 0 };
  }, [record]);

  // --- Compliance check ---
  const complianceCheck = useMemo(() => {
    if (!record) return { checks: [] as { label: string; ok: boolean }[], overall: false };
    const checks = [
      { label: 'Política generada o cargada', ok: Boolean(record.content) },
      { label: 'Versión activa registrada', ok: record.versions.length > 0 },
      { label: 'Código documental asignado', ok: Boolean(record.documentCode) },
      { label: 'Aprobada por Manager', ok: record.status === 'Aprobado' },
      { label: 'Firmas obligatorias completadas', ok: record.signatures.filter((s) => s.required).every((s) => s.status === 'Firmado') },
      { label: 'Campaña de socialización existe', ok: record.socializations.length > 0 },
      { label: `Mínimo 80% de socialización (${socialStats.pct}%)`, ok: socialStats.pct >= 80 },
    ];
    return { checks, overall: checks.every((c) => c.ok) };
  }, [record, socialStats]);

  // ============================================================
  // RENDER
  // ============================================================

  if (loading && !record) {
    return (
      <div className="policy-page">
        <div className="policy-page__loading">
          <p className="muted">Cargando módulo de Política SST...</p>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="policy-page">
        <div className="policy-page__loading">
          <p className="muted">No se pudo cargar la política SST.</p>
          <Button type="button" onClick={() => void load()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  const areas = Array.from(new Set(employees.map((e) => e.area).filter(Boolean)));
  const filteredMaster = masterList.filter(
    (row) => `${row.code} ${row.document} ${row.status}`.toLowerCase().includes(filter.toLowerCase())
  );
  const pendingSignatures = record.signatures.filter((s) => s.required && s.status !== 'Firmado').length;
  const pendingSocialization = record.socializations.filter((s) => s.status !== 'Firmado digitalmente').length;

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
        moduleCode={`2.1.1 · ${record.documentCode}`}
        moduleTitle={record.documentName}
        description="Gestión de la Política de Seguridad y Salud en el Trabajo"
        statusBadge={<span className={badge.className}>{badge.label}</span>}
        actions={[
          { label: '📄 Exportar PDF', variant: 'secondary' as const, onClick: () => exportDocument('pdf') },
          { label: '📊 Exportar Excel', variant: 'secondary' as const, onClick: () => exportDocument('word') },
          { label: loading ? 'Guardando...' : '💾 Guardar cambios', onClick: () => void save(), disabled: loading || !dirty },
        ]}
        lastSaved={lastSaved}
      />

      {/* Toast */}
      {toast && <div className="toast-alert" style={{ margin: '0 1rem' }}><p>{toast}</p></div>}

      {/* Banner */}
      {record.status === 'Aprobado' && (
        <div className="policy-page__banner policy-page__banner--success">
          ✅ Política aprobada (v{record.currentVersion}). Contenido bloqueado.
        </div>
      )}
      {record.status === 'Vencido' && (
        <div className="policy-page__banner policy-page__banner--danger">
          ⚠ Política vencida. Debe generar una nueva versión y actualizarla.
        </div>
      )}

      <div className="policy-page__body">
        {/* Sidebar */}
        <nav className="policy-page__sidebar">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`policy-page__sidebar-item ${sidebarTab === item.id ? 'policy-page__sidebar-item--active' : ''}`}
              onClick={() => setSidebarTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="policy-page__content">
          {/* ======== RESUMEN ======== */}
          {sidebarTab === 'resumen' && (
            <div className="policy-page__section">
              <h3>📋 Resumen de la Política SST</h3>
              <p className="muted">
                Sistema inteligente de gestión de la Política de Seguridad y Salud en el Trabajo.
                Genera, edita, aprueba, firma y socializa la política con datos adaptados al sector económico de la empresa.
              </p>

              <AdvancedKpiGrid
                items={[
                  { label: 'Versión Actual', value: `v${record.currentVersion}` },
                  { label: 'Estado', value: sstStatusBadge(record.status).label },
                  { label: 'Firmas', value: pendingSignatures === 0 ? '✅ Completadas' : `${pendingSignatures} pendiente(s)`, variant: pendingSignatures === 0 ? 'success' : 'warning' },
                  { label: 'Socialización', value: `${socialStats.pct}% (${socialStats.signed}/${socialStats.total})`, variant: socialStats.pct >= 80 ? 'success' : 'warning' },
                  { label: 'Documento', value: record.documentCode },
                  { label: 'Cumplimiento PHVA', value: badge.label, variant: record.complianceStatus === 'COMPLIES' ? 'success' : record.complianceStatus === 'NON_COMPLIANT' ? 'danger' : 'warning' },
                ]}
                columns={6}
              />

              {/* Quick actions */}
              <div className="policy-page__quick-actions">
                <Button type="button" onClick={handleGenerate}>
                  🚀 Generar Política SST (Inteligente)
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSidebarTab('editor')}>
                  ✏️ Editar contenido
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSidebarTab('firmas')}>
                  ✍ Gestionar firmas
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSidebarTab('socializacion')}>
                  👥 Socializar
                </Button>
              </div>

              {/* Compliance check */}
              <div className="policy-page__section">
                <h4>✅ Verificación de cumplimiento (2.1.1)</h4>
                <div className="policy-page__compliance-list">
                  {complianceCheck.checks.map((check) => (
                    <div key={check.label} className={`policy-page__compliance-item ${check.ok ? 'policy-page__compliance-item--ok' : 'policy-page__compliance-item--pending'}`}>
                      <span>{check.ok ? '✅' : '❌'}</span>
                      <span>{check.label}</span>
                    </div>
                  ))}
                </div>
                <div className={`policy-page__compliance-result ${complianceCheck.overall ? 'policy-page__compliance-result--ok' : 'policy-page__compliance-result--pending'}`}>
                  {complianceCheck.overall ? '✅ 2.1.1 Cumple — todas las condiciones satisfechas' : '⚠ 2.1.1 Pendiente — complete las condiciones pendientes'}
                </div>
              </div>
            </div>
          )}

          {/* ======== POLÍTICA SST ======== */}
          {sidebarTab === 'politica' && (
            <div className="policy-page__section">
              <h3>📄 Documento de Política SST</h3>
              <div className="actions">
                <Button type="button" onClick={handleGenerate}>🚀 Generar Política SST</Button>
                <Button type="button" variant="secondary" onClick={handleNewVersion}>📂 Nueva versión</Button>
                <Button type="button" variant="ghost" onClick={() => exportDocument('pdf')}>📄 Exportar</Button>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span className="label">Código documental</span>
                  <input className="input" value={record.documentCode} disabled={record.status === 'Aprobado'}
                    onChange={(e) => patchRecord({ documentCode: e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Nombre del documento</span>
                  <input className="input" value={record.documentName} disabled={record.status === 'Aprobado'}
                    onChange={(e) => patchRecord({ documentName: e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Versión</span>
                  <input className="input" value={record.currentVersion} disabled={record.status === 'Aprobado'}
                    onChange={(e) => patchRecord({ currentVersion: e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Estado</span>
                  <select className="input" value={record.status} disabled={record.status === 'Aprobado'}
                    onChange={(e) => patchRecord({ status: e.target.value as never })}>
                    {['Borrador', 'Pendiente aprobación', 'Aprobado', 'Vencido', 'Archivado'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="policy-page__version-info">
                <h4>Versión actual: v{record.currentVersion}</h4>
                <div className="policy-page__version-meta">
                  {currentVersion?.issuedAt && <span>Emisión: {toDateInputValue(currentVersion.issuedAt)}</span>}
                  {currentVersion?.approvedAt && <span>Aprobación: {toDateInputValue(currentVersion.approvedAt)}</span>}
                  {currentVersion?.expiresAt && <span>Vence: {toDateInputValue(currentVersion.expiresAt)}</span>}
                </div>
              </div>

              {/* Content preview */}
              <div className="policy-page__content-preview">
                <h4>Vista previa del contenido</h4>
                <pre className="policy-page__content-text">
                  {record.content || '— Sin contenido. Haz clic en "Generar Política SST" para crear el borrador.'}
                </pre>
              </div>
            </div>
          )}

          {/* ======== EDITOR DE CONTENIDO ======== */}
          {sidebarTab === 'editor' && (
            <div className="policy-page__section">
              <h3>✏️ Editor de Contenido</h3>
              <p className="muted">
                Edita el contenido de la política SST. Puedes agregar, modificar o eliminar secciones según las necesidades de la empresa.
                Se recomienda mantener la estructura de 10 secciones.
              </p>
              <div className="actions">
                <Button type="button" disabled={record.status === 'Aprobado'} onClick={() => void save()}>
                  💾 Guardar cambios
                </Button>
                <Button type="button" variant="ghost" onClick={handleGenerate}>
                  🔄 Regenerar desde datos de empresa
                </Button>
              </div>
              <label className="field">
                <span className="label">Contenido de la política (texto completo)</span>
                <textarea
                  className="input policy-page__editor"
                  rows={24}
                  value={record.content ?? ''}
                  disabled={record.status === 'Aprobado'}
                  onChange={(e) => patchRecord({ content: e.target.value })}
                  placeholder="Edita el contenido de la política SST aquí..."
                />
              </label>
              <p className="muted" style={{ fontSize: '.85rem' }}>
                La política generada automáticamente incluye: Introducción, Alcance, Compromiso de la Dirección,
                Cumplimiento Legal, Identificación de Riesgos del Sector, Prevención, Participación, Mejora Continua,
                Responsabilidades, y Revisión/Actualización.
              </p>
            </div>
          )}

          {/* ======== FIRMAS ======== */}
          {sidebarTab === 'firmas' && (
            <div className="policy-page__section">
              <h3>✍ Firmas de la Política SST</h3>
              <p className="muted">
                La política requiere firmas obligatorias de Manager y Representante Legal antes de ser aprobada.
                Las firmas opcionales son de Líder SST y Coordinador SST.
              </p>

              <table className="table">
                <thead>
                  <tr>
                    <th>Rol</th>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Obligatoria</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {record.signatures.map((sig) => (
                    <tr key={sig.role}>
                      <td><strong>{sig.role}</strong></td>
                      <td>
                        <input className="input" value={sig.signerName}
                          disabled={sig.status === 'Firmado'}
                          onChange={(e) => {
                            setRecord({
                              ...record,
                              signatures: record.signatures.map((s) =>
                                s.role === sig.role ? { ...s, signerName: e.target.value } : s
                              ),
                            });
                            markDirty();
                          }}
                        />
                      </td>
                      <td>
                        <input className="input" value={sig.signerEmail}
                          disabled={sig.status === 'Firmado'}
                          onChange={(e) => {
                            setRecord({
                              ...record,
                              signatures: record.signatures.map((s) =>
                                s.role === sig.role ? { ...s, signerEmail: e.target.value } : s
                              ),
                            });
                            markDirty();
                          }}
                        />
                      </td>
                      <td>{sig.required ? '✅ Sí' : '—'}</td>
                      <td><span className={signatureStatusBadge(sig.status).className}>{sig.status}</span></td>
                      <td>{sig.signedAt ? new Date(sig.signedAt).toLocaleString() : '—'}</td>
                      <td>
                        {sig.status !== 'Firmado' && (
                          <Button type="button"
                            onClick={() => { setSignatureModalRole(sig.role); setSignerName(sig.signerName); setSignerEmail(sig.signerEmail); }}>
                            ✍ Firmar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="actions">
                <Button type="button" disabled={pendingSignatures > 0} onClick={handleApprove}>
                  ✅ Aprobar política
                </Button>
              </div>

              {pendingSignatures > 0 && (
                <div className="policy-page__alert">
                  ⚠ No se puede aprobar la política hasta que todas las firmas obligatorias estén completadas ({pendingSignatures} pendiente(s)).
                </div>
              )}
            </div>
          )}

          {/* Signature Modal */}
          <Modal isOpen={Boolean(signatureModalRole)} title={`Firmar como: ${signatureModalRole || ''}`}
            onClose={() => setSignatureModalRole(null)}>
            <div className="form-grid">
              <label className="field">
                <span className="label">Nombre del firmante</span>
                <input className="input" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Email (opcional)</span>
                <input className="input" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
              </label>
              <p className="muted" style={{ fontSize: '.85rem' }}>
                Al firmar digitalmente, confirmas que has leído y aprobado la política SST.
                La firma quedará registrada con fecha, hora y hash de seguridad.
              </p>
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                <Button type="button" disabled={!signerName}
                  onClick={() => signatureModalRole && handleSign(signatureModalRole)}>
                  ✅ Confirmar firma digital
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSignatureModalRole(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </Modal>

          {/* ======== APROBACIÓN ======== */}
          {sidebarTab === 'aprobacion' && (
            <div className="policy-page__section">
              <h3>✅ Flujo de Aprobación</h3>
              <p className="muted">
                La política SST sigue un flujo: Borrador → Firmas obligatorias → Aprobación por Manager → Vigente.
              </p>

              <div className="policy-page__approval-steps">
                <div className={`policy-page__approval-step ${record.status !== 'Borrador' ? 'policy-page__approval-step--done' : 'policy-page__approval-step--active'}`}>
                  <span>📝</span><strong>Borrador</strong>
                </div>
                <div className="policy-page__approval-connector" />
                <div className={`policy-page__approval-step ${record.status === 'Aprobado' || record.status === 'Vencido' ? 'policy-page__approval-step--done' : record.status === 'Pendiente aprobación' || pendingSignatures === 0 ? 'policy-page__approval-step--active' : ''}`}>
                  <span>✍</span><strong>Firmas</strong>
                </div>
                <div className="policy-page__approval-connector" />
                <div className={`policy-page__approval-step ${record.status === 'Aprobado' ? 'policy-page__approval-step--active' : record.status === 'Vencido' ? 'policy-page__approval-step--done' : ''}`}>
                  <span>✅</span><strong>Aprobada</strong>
                </div>
                <div className="policy-page__approval-connector" />
                <div className={`policy-page__approval-step ${record.status === 'Vencido' ? 'policy-page__approval-step--active' : ''}`}>
                  <span>🔄</span><strong>Vigente/Revisión</strong>
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <span className="label">Estado actual</span>
                  <span className={sstStatusBadge(record.status).className}>{record.status}</span>
                </div>
                <div className="field">
                  <span className="label">Versión</span>
                  <span>v{record.currentVersion}</span>
                </div>
                <div className="field">
                  <span className="label">Firmas obligatorias</span>
                  <span>{pendingSignatures === 0 ? '✅ Completadas' : `⚠ ${pendingSignatures} pendiente(s)`}</span>
                </div>
              </div>

              <div className="actions">
                <Button type="button" disabled={pendingSignatures > 0 || record.status === 'Aprobado'} onClick={handleApprove}>
                  ✅ Aprobar política
                </Button>
                {(record.status === 'Aprobado' || record.status === 'Vencido') && (
                  <Button type="button" variant="secondary" onClick={handleNewVersion}>
                    📂 Crear nueva versión
                  </Button>
                )}
              </div>

              {record.status === 'Aprobado' && currentVersion?.expiresAt && (
                <div className="policy-page__info">
                  📅 Próxima revisión: {toDateInputValue(currentVersion.expiresAt)} (12 meses desde aprobación)
                </div>
              )}
            </div>
          )}

          {/* ======== SOCIALIZACIÓN ======== */}
          {sidebarTab === 'socializacion' && (
            <div className="policy-page__section">
              <h3>👥 Socialización de la Política SST</h3>
              <p className="muted">
                Una vez aprobada, la política debe ser socializada a todos los trabajadores.
                Los trabajadores deben leer, comprender y firmar digitalmente.
              </p>

              {/* Socialization stats */}
              <AdvancedKpiGrid
                items={[
                  { label: 'Firmados', value: socialStats.signed, variant: 'success' },
                  { label: 'Leídos', value: socialStats.read, variant: 'info' },
                  { label: 'Pendientes', value: socialStats.pending, variant: 'warning' },
                  { label: 'Total', value: socialStats.total },
                ]}
                columns={4}
              />

              {/* Progress bar */}
              <div className="policy-page__progress-container">
                <span className="policy-page__progress-label">Progreso de socialización: {socialStats.pct}%</span>
                <div className="policy-page__progress-bar">
                  <div
                    className={`policy-page__progress-fill ${socialStats.pct >= 80 ? 'policy-page__progress-fill--high' : socialStats.pct >= 40 ? 'policy-page__progress-fill--medium' : 'policy-page__progress-fill--low'}`}
                    style={{ width: `${socialStats.pct}%` }}
                  />
                </div>
              </div>

              {/* Assign controls */}
              {record.status === 'Aprobado' && (
                <div className="policy-page__assign-actions">
                  <h4>Asignar trabajadores</h4>
                  <div className="actions">
                    <Button type="button" onClick={handleAssignAll}>📋 Asignar todos</Button>
                    <select className="input" value={area} onChange={(e) => setArea(e.target.value)} style={{ maxWidth: 180 }}>
                      <option value="">Área...</option>
                      {areas.map((a) => <option key={a}>{a}</option>)}
                    </select>
                    <Button type="button" variant="secondary" disabled={!area} onClick={handleAssignArea}>
                      Asignar por área
                    </Button>
                    <select className="input" multiple value={selectedEmployees}
                      onChange={(e) => setSelectedEmployees(Array.from(e.target.selectedOptions).map((o) => o.value))}
                      style={{ maxWidth: 250, minHeight: 60 }}>
                      {employees.filter((e) => e.status === 'Activo').map((e) => (
                        <option key={e._id} value={e._id}>{e.name} · {e.area}</option>
                      ))}
                    </select>
                    <Button type="button" variant="secondary" disabled={!selectedEmployees.length} onClick={handleAssignSelected}>
                      Asignar seleccionados
                    </Button>
                  </div>

                  <div className="actions" style={{ marginTop: '.5rem' }}>
                    <Button type="button" onClick={() => setShowCampaignModal(true)}>
                      🚀 Crear campaña de socialización
                    </Button>
                  </div>
                </div>
              )}

              {/* Workers table */}
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Trabajador</th>
                      <th>Área</th>
                      <th>Estado</th>
                      <th>Fecha/Hora</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.socializations.length === 0 ? (
                      <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin trabajadores asignados. Usa los botones para asignar.</td></tr>
                    ) : (
                      record.socializations.map((item) => (
                        <tr key={item.employeeId ?? item.employeeName}>
                          <td>{item.employeeName}</td>
                          <td>{item.area ?? '—'}</td>
                          <td><span className={socialStatusBadge(item.status).className}>{item.status}</span></td>
                          <td>
                            {item.signedAt ? new Date(item.signedAt).toLocaleString() :
                             item.readAt ? new Date(item.readAt).toLocaleString() : '—'}
                          </td>
                          <td>
                            <div className="actions">
                              <Button type="button" variant="ghost"
                                disabled={!item.employeeId || item.status === 'Firmado digitalmente'}
                                onClick={() => item.employeeId && handleUpdateSocialization(item.employeeId, 'Leído')}>
                                👁 Leído
                              </Button>
                              <Button type="button"
                                disabled={!item.employeeId || item.status === 'Firmado digitalmente'}
                                onClick={() => item.employeeId && handleUpdateSocialization(item.employeeId, 'Firmado digitalmente')}>
                                ✍ Firmar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Campaign Modal */}
          <Modal isOpen={showCampaignModal} title="Crear Campaña de Socialización"
            onClose={() => setShowCampaignModal(false)}>
            <div className="form-grid">
              <p>Se creará una campaña de firma digital usando el motor WorkerSignatureCampaignEngine.</p>
              <p className="muted">
                {socialStats.pending} trabajador(es) pendiente(s) serán incluidos automáticamente.
                Cada trabajador recibirá un enlace único para leer y firmar la política SST.
              </p>
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                <Button type="button" onClick={handleCreateCampaign}>
                  🚀 Crear campaña
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowCampaignModal(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </Modal>

          {/* ======== LISTADO MAESTRO ======== */}
          {sidebarTab === 'listado-maestro' && (
            <div className="policy-page__section">
              <h3>📚 Listado Maestro de Documentos</h3>
              <p className="muted">Registro automático de la política SST en el listado maestro de documentos.</p>
              <div className="actions">
                <input className="input" placeholder="Filtrar..." value={filter}
                  onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 250 }} />
              </div>
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Documento</th>
                      <th>Versión</th>
                      <th>Estado</th>
                      <th>Emisión</th>
                      <th>Vencimiento</th>
                      <th>Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaster.length === 0 ? (
                      <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin registros</td></tr>
                    ) : (
                      filteredMaster.map((row) => (
                        <tr key={`${row.code}-${row.version}`}>
                          <td><strong>{row.code}</strong></td>
                          <td>{row.document}</td>
                          <td>{row.version}</td>
                          <td><span className={sstStatusBadge(row.status).className}>{row.status}</span></td>
                          <td>{toDateInputValue(row.issuedAt) || '—'}</td>
                          <td>{toDateInputValue(row.expiresAt) || '—'}</td>
                          <td>{row.responsible}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======== VERSIONES ======== */}
          {sidebarTab === 'versiones' && (
            <div className="policy-page__section">
              <h3>📂 Versiones de la Política</h3>
              <p className="muted">Historial completo de versiones con trazabilidad de cambios, aprobaciones y archivado.</p>
              <div className="actions">
                <Button type="button" onClick={handleNewVersion}>📂 Nueva versión</Button>
              </div>
              <div className="policy-page__versions-list">
                {record.versions.length === 0 ? (
                  <p className="muted">Sin versiones registradas.</p>
                ) : (
                  [...record.versions].reverse().map((v) => (
                    <div key={v.version} className={`policy-page__version-card ${v.version === record.currentVersion ? 'policy-page__version-card--current' : ''}`}>
                      <div className="policy-page__version-header">
                        <span className="policy-page__version-badge">v{v.version}</span>
                        {v.version === record.currentVersion && <span className="policy-page__version-current-badge">Actual</span>}
                        <span className="muted">
                          {v.issuedAt ? toDateInputValue(v.issuedAt) : ''}
                          {v.approvedAt ? ` · Aprobada: ${toDateInputValue(v.approvedAt)}` : ''}
                        </span>
                        <span className={sstStatusBadge(v.status).className} style={{ fontSize: '.75rem' }}>{v.status}</span>
                      </div>
                      <div className="policy-page__version-details">
                        {v.expiresAt && <span>Vence: {toDateInputValue(v.expiresAt)}</span>}
                        <span>Archivada: {v.archived ? 'Sí' : 'No'}</span>
                      </div>
                      <div className="actions">
                        <Button type="button" variant="ghost"
                          disabled={v.archived || v.status === 'Archivado'}
                          onClick={() => handleArchiveVersion(v.version)}>
                          📦 Archivar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ======== ALERTAS ======== */}
          {sidebarTab === 'alertas' && (
            <div className="policy-page__section">
              <h3>🔔 Alertas Programadas</h3>
              <p className="muted">
                Alertas automáticas de revisión de la política SST: 30, 15, 5 y 1 día antes del vencimiento.
                Destinatarios: ADMIN, MANAGER, OWNER.
              </p>
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Mensaje</th>
                      <th>Vence</th>
                      <th>Destinatarios</th>
                      <th>Generada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.alerts.length === 0 ? (
                      <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin alertas. La política debe tener fecha de vencimiento.</td></tr>
                    ) : (
                      record.alerts.map((alert) => (
                        <tr key={`${alert.type}-${alert.dueAt}`}>
                          <td><code>{alert.type}</code></td>
                          <td>{alert.message}</td>
                          <td>{new Date(alert.dueAt).toLocaleDateString()}</td>
                          <td>{alert.recipients.join(', ')}</td>
                          <td>{alert.generated ? '✅' : '⏳'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======== DASHBOARD ======== */}
          {sidebarTab === 'dashboard' && (
            <div className="policy-page__section">
              <h3>📊 Dashboard de Política SST</h3>

              <div className="policy-page__stats-grid">
                <article className="policy-page__stat-card">
                  <strong>Estado</strong>
                  <span>{sstStatusBadge(record.status).label}</span>
                </article>
                <article className="policy-page__stat-card">
                  <strong>Versión</strong>
                  <span>v{record.currentVersion}</span>
                </article>
                <article className="policy-page__stat-card policy-page__stat-card--success">
                  <strong>Firmas</strong>
                  <span>{record.signatures.filter((s) => s.status === 'Firmado').length}/{record.signatures.length}</span>
                </article>
                <article className="policy-page__stat-card policy-page__stat-card--success">
                  <strong>Socialización</strong>
                  <span>{socialStats.pct}%</span>
                </article>
                <article className="policy-page__stat-card">
                  <strong>Próxima revisión</strong>
                  <span>{currentVersion?.expiresAt ? toDateInputValue(currentVersion.expiresAt) : '—'}</span>
                </article>
                <article className="policy-page__stat-card">
                  <strong>Cumplimiento PHVA</strong>
                  <span className={badge.className} style={{ fontSize: '.8rem' }}>{badge.label}</span>
                </article>
              </div>

              {/* Progress bars */}
              <h4>Indicadores Clave</h4>
              <div className="policy-page__indicators">
                <div className="policy-page__indicator">
                  <span className="policy-page__indicator-label">Firmas completadas</span>
                  <div className="policy-page__progress-container">
                    <div className="policy-page__progress-bar">
                      <div className="policy-page__progress-fill policy-page__progress-fill--high"
                        style={{ width: `${record.signatures.length ? Math.round((record.signatures.filter((s) => s.status === 'Firmado').length / record.signatures.length) * 100) : 0}%` }} />
                    </div>
                    <span className="policy-page__progress-pct">
                      {record.signatures.length ? Math.round((record.signatures.filter((s) => s.status === 'Firmado').length / record.signatures.length) * 100) : 0}%
                    </span>
                  </div>
                </div>
                <div className="policy-page__indicator">
                  <span className="policy-page__indicator-label">Socialización (mín. 80%)</span>
                  <div className="policy-page__progress-container">
                    <div className="policy-page__progress-bar">
                      <div className={`policy-page__progress-fill ${socialStats.pct >= 80 ? 'policy-page__progress-fill--high' : 'policy-page__progress-fill--medium'}`}
                        style={{ width: `${socialStats.pct}%` }} />
                    </div>
                    <span className="policy-page__progress-pct">{socialStats.pct}%</span>
                  </div>
                </div>
                <div className="policy-page__indicator">
                  <span className="policy-page__indicator-label">Versiones registradas</span>
                  <div className="policy-page__progress-container">
                    <div className="policy-page__progress-bar">
                      <div className="policy-page__progress-fill policy-page__progress-fill--high"
                        style={{ width: `${Math.min(100, record.versions.length * 20)}%` }} />
                    </div>
                    <span className="policy-page__progress-pct">{record.versions.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======== HISTORIAL ======== */}
          {sidebarTab === 'historial' && (
            <div className="policy-page__section">
              <h3>🕓 Historial de Auditoría</h3>
              <p className="muted">Registro completo de todas las acciones realizadas sobre la política SST.</p>
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Acción</th>
                      <th>Usuario</th>
                      <th>Fecha/Hora</th>
                      <th>Valor anterior</th>
                      <th>Valor nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.history.length === 0 ? (
                      <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin historial registrado.</td></tr>
                    ) : (
                      [...record.history].reverse().map((entry, i) => (
                        <tr key={`${entry.action}-${i}`}>
                          <td><span className="policy-page__audit-action">{entry.action}</span></td>
                          <td>{entry.userEmail ?? 'Sistema'}</td>
                          <td>{new Date(entry.date).toLocaleString()}</td>
                          <td style={{ color: '#b91c1c', fontSize: '.85rem' }}>{entry.previousValue ?? '—'}</td>
                          <td style={{ color: '#15803d', fontSize: '.85rem' }}>{entry.newValue ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: '.85rem' }}>Total: {record.history.length} entrada(s)</div>
            </div>
          )}

          {/* ======== CONFIGURACIÓN ======== */}
          {sidebarTab === 'configuracion' && (
            <div className="policy-page__section">
              <h3>⚙️ Configuración de la Política SST</h3>

              <div className="form-grid">
                <label className="field">
                  <span className="label">Código documental</span>
                  <input className="input" value={record.documentCode}
                    onChange={(e) => patchRecord({ documentCode: e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Nombre del documento</span>
                  <input className="input" value={record.documentName}
                    onChange={(e) => patchRecord({ documentName: e.target.value })} />
                </label>
              </div>

              <div className="policy-page__section">
                <h4>Reglas de cumplimiento (2.1.1)</h4>
                <div className="policy-page__compliance-rules">
                  <p><strong>✅ Cumple</strong> solo si:</p>
                  <ol>
                    <li>Política existe (generada o cargada) {record.content ? '✅' : '❌'}</li>
                    <li>Registrada en Listado Maestro {masterList.length > 0 ? '✅' : '❌'}</li>
                    <li>Aprobada por Manager {record.status === 'Aprobado' ? '✅' : '❌'}</li>
                    <li>Firmas obligatorias completadas {pendingSignatures === 0 ? '✅' : `❌ (${pendingSignatures} pendiente(s))`}</li>
                    <li>Campaña de socialización existe {socialStats.total > 0 ? '✅' : '❌'}</li>
                    <li>Mínimo 80% de socialización {socialStats.pct >= 80 ? '✅' : `❌ (${socialStats.pct}%)`}</li>
                  </ol>
                </div>
              </div>

              <div className="policy-page__section">
                <h4>Ciclo de revisión</h4>
                <p className="muted">Período predeterminado: 12 meses desde la aprobación. Configurable.</p>
                <div className="field">
                  <span className="label">Fecha de vencimiento actual</span>
                  <input className="input" type="date"
                    value={toDateInputValue(currentVersion?.expiresAt)}
                    onChange={(e) => {
                      if (!record) return;
                      setRecord({
                        ...record,
                        versions: record.versions.map((v) =>
                          v.version === record.currentVersion ? { ...v, expiresAt: e.target.value } : v
                        ),
                      });
                      markDirty();
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ======== PLANTILLAS (ADMIN) ======== */}
          {sidebarTab === 'plantillas' && (
            <TemplateAdminPanel token={token} />
          )}

          {/* Dirty indicator */}
          {dirty && (
            <div className="policy-page__dirty-bar">
              ⚠ Hay cambios sin guardar
              {lastSaved && <span style={{ marginLeft: '1rem', fontSize: '.85rem' }}>Último guardado: {lastSaved}</span>}
            </div>
          )}
        </main>
      </div>
    </AdvancedPageLayout>
  );
}
