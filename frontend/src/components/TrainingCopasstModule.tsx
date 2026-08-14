import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CopasstMemberCoverageEntryModel,
  CopasstTrainingAdvancedModel,
  CopasstTrainingAnnualProgramItemModel,
  CopasstTrainingApprovalModel,
  CopasstTrainingAvailableMemberModel,
  CopasstTrainingComplianceStatus,
  CopasstTrainingCoverageModel,
  CopasstTrainingEvidenceModel,
  CopasstTrainingEvidenceType,
  CopasstTrainingSessionModel,
  decideCopasstTrainingApproval,
  fetchCopasstTrainingAdvanced,
  fetchCopasstTrainingApproval,
  fetchCopasstTrainingCoverage,
  fetchCopasstTrainingMembers,
  generateCopasstTrainingAttendance,
  generateCopasstTrainingCertificate,
  generateCopasstTrainingComplianceReport,
  generateCopasstTrainingReport,
  submitCopasstTrainingApproval,
  updateCopasstTrainingAdvanced,
  uploadCopasstTrainingEvidence,
} from '../api';
import { Button } from './ui/Button';
import {
  AdvancedHeader,
  AdvancedKpiGrid,
  AdvancedPageLayout,
  AdvancedProgressBar,
  AdvancedSection,
  AdvancedTabsContent,
  AdvancedTabsSidebar,
} from './advanced-layout';

// ============================================================
// 1.1.7 — CAPACITACIÓN COPASST · GESTIÓN AVANZADA
//
// Módulo frontend independiente de 1.2.1 (TrainingProgramModule).
// Consume los endpoints de dominio implementados en las Fases
// 1/2 del backend (colección phva_advanced_copasst_training).
// ============================================================

type SidebarId =
  | 'resumen'
  | 'programa-anual'
  | 'capacitaciones'
  | 'cobertura'
  | 'aprobacion'
  | 'evidencias'
  | 'indicadores'
  | 'alertas'
  | 'historial';

const SIDEBAR_ITEMS: Array<{ id: SidebarId; label: string; icon: string }> = [
  { id: 'resumen', label: 'Resumen', icon: '📊' },
  { id: 'programa-anual', label: 'Programa anual', icon: '📅' },
  { id: 'capacitaciones', label: 'Capacitaciones', icon: '🎓' },
  { id: 'cobertura', label: 'Miembros y cobertura', icon: '🛡️' },
  { id: 'aprobacion', label: 'Aprobación', icon: '✅' },
  { id: 'evidencias', label: 'Evidencias', icon: '📎' },
  { id: 'indicadores', label: 'Indicadores', icon: '📈' },
  { id: 'alertas', label: 'Alertas', icon: '🔔' },
  { id: 'historial', label: 'Historial', icon: '🕓' },
];

const SESSION_STATUSES = ['Programada', 'En curso', 'Ejecutada', 'Cancelada'] as const;
const PROGRAM_STATUSES = ['Pendiente', 'Programada', 'Ejecutada', 'Cancelada'] as const;

/** Etiquetas legibles de los tipos de evidencia de 1.1.7 (Fase 4). */
const EVIDENCE_TYPE_LABELS: Record<CopasstTrainingEvidenceType, string> = {
  GENERAL: 'Material / soporte',
  ATTENDANCE: 'Lista de asistencia',
  SIGNATURE: 'Firmas',
  CERTIFICATE: 'Certificado',
  REPORT: 'Informe de capacitación',
  COMPLIANCE_REPORT: 'Reporte de cumplimiento',
};

/** Icono por tipo de evidencia. */
const EVIDENCE_TYPE_ICONS: Record<CopasstTrainingEvidenceType, string> = {
  GENERAL: '📄',
  ATTENDANCE: '📋',
  SIGNATURE: '✍️',
  CERTIFICATE: '🏅',
  REPORT: '📑',
  COMPLIANCE_REPORT: '✅',
};

// ─────────────────────────────────────────────
// HELPERS DE DOMINIO (espejo de las reglas backend)
// ─────────────────────────────────────────────

/**
 * Regla de dominio (Fase 2 backend): una sesión cuenta como EJECUTADA cuando
 * `status === 'Ejecutada'` O existe `completionDate`. El frontend NO crea una
 * lógica diferente: la replica solo para presentación; el backend es la
 * validación definitiva.
 */
function isSessionExecuted(session: CopasstTrainingSessionModel): boolean {
  return session.status === 'Ejecutada' || Boolean(session.completionDate);
}

/** Las sesiones programadas/en curso permiten editar participantes. */
function sessionAllowsEditingParticipants(session: CopasstTrainingSessionModel): boolean {
  return !isSessionExecuted(session) && session.status !== 'Cancelada';
}

function countExecuted(sessions: CopasstTrainingSessionModel[]): number {
  return sessions.filter(isSessionExecuted).length;
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // Formato local (no UTC): evita el desfase de un día para fechas guardadas
  // como medianoche UTC en zonas horarias negativas (LATAM).
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptySession(): CopasstTrainingSessionModel {
  return { title: '', type: 'Capacitación COPASST', status: 'Programada', copasstParticipants: [] };
}

/** Elimina campos opcionales vacíos (el DTO rechaza fechas '' con IsDateString). */
function cleanSession(session: CopasstTrainingSessionModel): CopasstTrainingSessionModel {
  const clean: CopasstTrainingSessionModel = { title: session.title };
  (
    ['type', 'responsible', 'status', 'instructor', 'location', 'duration', 'evaluation'] as const
  ).forEach((key) => {
    const value = session[key];
    if (value) clean[key] = value;
  });
  (['scheduledDate', 'expirationDate', 'completionDate'] as const).forEach((key) => {
    const value = session[key];
    if (value) clean[key] = value;
  });
  if (session.participants?.length) clean.participants = session.participants;
  if (session.evidences?.length) clean.evidences = session.evidences;
  if (session.multimedia?.length) clean.multimedia = session.multimedia;
  if (session.copasstParticipants?.length) clean.copasstParticipants = session.copasstParticipants;
  return clean;
}

function complianceBadge(status: CopasstTrainingComplianceStatus): { label: string; className: string } {
  if (status === 'COMPLIES') {
    return { label: '✅ Cumple', className: 'advanced-management__badge advanced-management__badge--success' };
  }
  if (status === 'NON_COMPLIANT') {
    return { label: '❌ No cumple', className: 'advanced-management__badge advanced-management__badge--danger' };
  }
  return { label: '⚠ Pendiente', className: 'advanced-management__badge advanced-management__badge--warning' };
}

function approvalLabel(status: string): string {
  switch (status) {
    case 'APPROVED':
      return '✅ Aprobado';
    case 'REJECTED':
      return '❌ Rechazado';
    case 'ADJUSTMENTS_REQUESTED':
      return '↩️ Ajustes solicitados';
    case 'DRAFT':
      return '📝 Borrador';
    default:
      return '⏳ Pendiente de aprobación';
  }
}

function statusBadgeClass(status?: string): string {
  if (status === 'Ejecutada') return 'badge badge--success';
  if (status === 'Cancelada') return 'badge badge--danger';
  if (status === 'En curso') return 'badge badge--info';
  return 'badge badge--warning';
}

const memberOptionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '.5rem',
  padding: '.5rem .65rem',
  border: '1px solid #e2e8f0',
  borderRadius: '.75rem',
  cursor: 'pointer',
  background: '#fff',
};

const memberOptionSelectedStyle: CSSProperties = {
  ...memberOptionStyle,
  borderColor: '#bfdbfe',
  background: '#eff6ff',
};

const toastStyle: CSSProperties = {
  position: 'fixed',
  bottom: '1.5rem',
  right: '1.5rem',
  background: '#0f172a',
  color: '#fff',
  padding: '.7rem 1rem',
  borderRadius: '.75rem',
  zIndex: 60,
  boxShadow: '0 8px 24px rgba(0,0,0,.2)',
  fontSize: '.9rem',
  maxWidth: 'min(90vw, 420px)',
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function TrainingCopasstModule({
  token,
  role,
}: {
  token: string;
  /** Rol del usuario autenticado (owner/admin/manager/member) para gating de UI. */
  role?: string;
}) {
  const navigate = useNavigate();

  const [sidebarTab, setSidebarTab] = useState<SidebarId>('resumen');
  const [record, setRecord] = useState<CopasstTrainingAdvancedModel | null>(null);
  const [members, setMembers] = useState<CopasstTrainingAvailableMemberModel[]>([]);
  const [coverage, setCoverage] = useState<CopasstTrainingCoverageModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Formulario de programa anual.
  const [programFormOpen, setProgramFormOpen] = useState(false);
  const [programForm, setProgramForm] = useState<CopasstTrainingAnnualProgramItemModel & { editingIndex?: number }>({
    title: '',
    type: 'Capacitación',
    status: 'Pendiente',
  });

  // Formulario de sesiones.
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [sessionFormIndex, setSessionFormIndex] = useState<number | null>(null);
  const [sessionForm, setSessionForm] = useState<CopasstTrainingSessionModel>(emptySession);
  // La sesión editada ya estaba ejecutada: su estado no puede revertirse (el
  // snapshot histórico no debe re-validarse contra los miembros actuales).
  const [sessionFormWasExecuted, setSessionFormWasExecuted] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  // Fase 4 — evidencias y generación documental.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<CopasstTrainingEvidenceType>('GENERAL');
  const [uploadSessionIndex, setUploadSessionIndex] = useState<string>('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [certSessionIndex, setCertSessionIndex] = useState<number>(0);
  const [certParticipantUserId, setCertParticipantUserId] = useState<string>('');

  // Fase 5 — Approval Workflow de 1.1.7.
  const [approval, setApproval] = useState<CopasstTrainingApprovalModel | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalAction, setApprovalAction] = useState<string | null>(null);
  const [decisionComment, setDecisionComment] = useState('');

  const toastTimer = useRef<number | null>(null);
  const uploadFileRef = useRef<HTMLInputElement | null>(null);
  // Candado síncrono anti doble-click: el estado se actualiza en batch y dos
  // clicks en el mismo tick podrían pasar la guardia de `generatingKey`.
  const generatingRef = useRef(false);
  // Candado síncrono anti doble-click para las acciones de aprobación.
  const approvalRef = useRef(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3500);
  }, []);

  const refreshCoverage = useCallback(async (tkn: string) => {
    try {
      setCoverage(await fetchCopasstTrainingCoverage(tkn));
    } catch {
      // La cobertura es un dato derivado del backend: si falla se conserva la última.
    }
  }, []);

  // Fase 5 — estado de aprobación (solicitud + eventos, scoped por empresa).
  const loadApproval = useCallback(async (tkn: string) => {
    setApprovalLoading(true);
    setApprovalError(null);
    try {
      setApproval(await fetchCopasstTrainingApproval(tkn));
    } catch (e) {
      setApprovalError(
        e instanceof Error ? e.message : 'No se pudo cargar el estado de aprobación.',
      );
    } finally {
      setApprovalLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rec, mems] = await Promise.all([
        fetchCopasstTrainingAdvanced(token),
        fetchCopasstTrainingMembers(token),
      ]);
      setRecord(rec);
      setMembers(mems);
      setDirty(false);
      await Promise.all([refreshCoverage(token), loadApproval(token)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la capacitación COPASST.');
    } finally {
      setLoading(false);
    }
  }, [token, refreshCoverage, loadApproval]);

  useEffect(() => {
    void load();
  }, [load]);

  // Confirmación de salida con cambios sin guardar (navegación in-app).
  const requestNavigation = useCallback(
    (path: string) => {
      if (dirty) {
        setPendingNavigation(path);
        setShowUnsavedModal(true);
        return;
      }
      navigate(path);
    },
    [dirty, navigate],
  );

  const discardAndLeave = useCallback(() => {
    setShowUnsavedModal(false);
    const path = pendingNavigation;
    setPendingNavigation(null);
    if (path) navigate(path);
  }, [navigate, pendingNavigation]);

  // beforeunload: cierre de pestaña / navegación del navegador.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Limpia el temporizador del toast al desmontar.
  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // ─────────────────────────────────────────────
  // GUARDADO CONTROLADO (sin autosave agresivo)
  // ─────────────────────────────────────────────

  const save = useCallback(async () => {
    if (!record || !dirty || saving) return;
    setSaving(true);
    try {
      const payload = {
        year: record.year,
        annualProgram: record.annualProgram,
        sessions: record.sessions.map(cleanSession),
      };
      const updated = await updateCopasstTrainingAdvanced(token, payload);
      setRecord(updated);
      setDirty(false);
      setLastSaved(new Date().toLocaleString());
      notify('✅ Cambios guardados correctamente');
      await refreshCoverage(token);
    } catch (e) {
      notify(`❌ ${e instanceof Error ? e.message : 'Error guardando capacitación COPASST.'}`);
    } finally {
      setSaving(false);
    }
  }, [record, dirty, saving, token, notify, refreshCoverage]);

  const patchRecord = useCallback(
    (updater: (prev: CopasstTrainingAdvancedModel) => CopasstTrainingAdvancedModel) => {
      setRecord((prev) => (prev ? updater(prev) : prev));
      setDirty(true);
    },
    [],
  );

  // ─────────────────────────────────────────────
  // PROGRAMA ANUAL
  // ─────────────────────────────────────────────

  const openNewProgram = () => {
    setProgramForm({ title: '', type: 'Capacitación', status: 'Pendiente' });
    setProgramFormOpen(true);
  };

  const openEditProgram = (index: number) => {
    if (!record) return;
    setProgramForm({ ...record.annualProgram[index], editingIndex: index });
    setProgramFormOpen(true);
  };

  const saveProgramForm = () => {
    if (!record || !programForm.title.trim()) {
      notify('⚠ Indica el nombre de la actividad');
      return;
    }
    const item: CopasstTrainingAnnualProgramItemModel = {
      title: programForm.title.trim(),
      type: programForm.type,
      responsible: programForm.responsible,
      scheduledDate: programForm.scheduledDate || undefined,
      expirationDate: programForm.expirationDate || undefined,
      status: programForm.status ?? 'Pendiente',
    };
    if (programForm.editingIndex !== undefined) {
      patchRecord((prev) => ({
        ...prev,
        annualProgram: prev.annualProgram.map((p, i) => (i === programForm.editingIndex ? item : p)),
      }));
    } else {
      patchRecord((prev) => ({ ...prev, annualProgram: [...prev.annualProgram, item] }));
    }
    setProgramFormOpen(false);
  };

  const deleteProgram = (index: number) => {
    if (!record) return;
    if (!window.confirm('¿Eliminar esta actividad del programa anual?')) return;
    patchRecord((prev) => ({
      ...prev,
      annualProgram: prev.annualProgram.filter((_, i) => i !== index),
    }));
    notify('Actividad eliminada (recuerda guardar)');
  };

  // ─────────────────────────────────────────────
  // CAPACITACIONES (sesiones)
  // ─────────────────────────────────────────────

  const openNewSession = () => {
    setSessionFormIndex(null);
    setSessionForm(emptySession());
    setSessionFormWasExecuted(false);
    setSelectedParticipantIds([]);
    setSessionFormOpen(true);
  };

  const openEditSession = (index: number) => {
    if (!record) return;
    const session = record.sessions[index];
    setSessionFormIndex(index);
    setSessionForm({ ...session, copasstParticipants: session.copasstParticipants ?? [] });
    setSessionFormWasExecuted(isSessionExecuted(session));
    setSelectedParticipantIds((session.copasstParticipants ?? []).map((p) => p.userId.toString()));
    setSessionFormOpen(true);
  };

  const toggleParticipant = (userId: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const saveSessionForm = () => {
    if (!record) return;
    if (!sessionForm.title.trim()) {
      notify('⚠ Indica el título de la capacitación');
      return;
    }

    const executed = isSessionExecuted(sessionForm);
    const session: CopasstTrainingSessionModel = {
      ...sessionForm,
      title: sessionForm.title.trim(),
      scheduledDate: sessionForm.scheduledDate || undefined,
      expirationDate: sessionForm.expirationDate || undefined,
      completionDate: sessionForm.completionDate || undefined,
    };

    if (executed || sessionForm.status === 'Cancelada') {
      // Snapshot histórico inmutable: se conserva tal cual fue registrado.
      session.copasstParticipants = sessionForm.copasstParticipants ?? [];
    } else {
      // Construir snapshot desde los miembros activos (el backend valida de nuevo).
      const memberById = new Map(members.map((m) => [m.userId, m]));
      session.copasstParticipants = selectedParticipantIds
        .map((userId) => memberById.get(userId))
        .filter((member): member is CopasstTrainingAvailableMemberModel => Boolean(member))
        .map((member) => ({
          userId: member.userId,
          name: member.name,
          committeeRole: member.committeeRole,
          representationType: member.representationType,
        }));
    }

    if (sessionFormIndex === null) {
      patchRecord((prev) => ({ ...prev, sessions: [...prev.sessions, session] }));
    } else {
      patchRecord((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s, i) => (i === sessionFormIndex ? session : s)),
      }));
    }
    setSessionFormOpen(false);
  };

  const deleteSession = (index: number) => {
    if (!record) return;
    const session = record.sessions[index];
    const confirmMessage = isSessionExecuted(session)
      ? 'Esta sesión ya fue ejecutada y contiene un snapshot histórico. ¿Eliminar la sesión y su registro?'
      : '¿Eliminar esta capacitación?';
    if (!window.confirm(confirmMessage)) return;
    patchRecord((prev) => ({ ...prev, sessions: prev.sessions.filter((_, i) => i !== index) }));
    notify('Capacitación eliminada (recuerda guardar)');
  };

  // ─────────────────────────────────────────────
  // DATOS DERIVADOS (solo información real del backend)
  // ─────────────────────────────────────────────

  const executedSessions = useMemo(() => (record ? countExecuted(record.sessions) : 0), [record]);
  const plannedSessions = useMemo(
    () => (record ? record.sessions.length - executedSessions : 0),
    [record, executedSessions],
  );
  const coverageEntries: CopasstMemberCoverageEntryModel[] =
    coverage?.memberCoverage ?? record?.memberCoverage ?? [];
  const totalMembers = coverage?.totalMembers ?? coverageEntries.length;
  const trainedMembers = coverage?.trainedMembers ?? coverageEntries.filter((e) => e.trained).length;
  const coveragePercentage =
    coverage?.coveragePercentage ??
    (totalMembers > 0 ? Math.round((trainedMembers / totalMembers) * 100) : 0);
  const pendingMembers = coverageEntries.filter((entry) => !entry.trained);

  /** Alertas client-side (sesiones próximas/vencidas) — separadas de las persistidas. */
  const clientAlerts = useMemo(() => {
    const alerts: Array<{ type: string; message: string }> = [];
    const today = new Date();
    for (const session of record?.sessions ?? []) {
      if (isSessionExecuted(session)) continue;
      if (session.scheduledDate) {
        const days = Math.ceil((new Date(session.scheduledDate).getTime() - today.getTime()) / 86400000);
        if (days >= 0 && days <= 7) {
          alerts.push({
            type: 'Próxima',
            message: `Sesión «${session.title}» programada en ${days === 0 ? 'menos de 1 día' : `${days} día(s)`}.`,
          });
        }
      }
      if (session.expirationDate && new Date(session.expirationDate) < today) {
        alerts.push({
          type: 'Vencida',
          message: `Sesión «${session.title}» vencida (${new Date(session.expirationDate).toLocaleDateString()}) sin ejecutar.`,
        });
      }
    }
    return alerts;
  }, [record]);

  // ─────────────────────────────────────────────
  // RENDERIZADO POR SECCIÓN
  // ─────────────────────────────────────────────

  const renderResumen = () => {
    if (!record) return null;
    const badge = complianceBadge(record.complianceStatus ?? 'PENDING');
    return (
      <>
        <AdvancedKpiGrid
          columns={3}
          items={[
            {
              label: 'Cobertura COPASST',
              value: `${coveragePercentage}%`,
              variant: coveragePercentage >= 75 ? 'success' : coveragePercentage > 0 ? 'warning' : 'danger',
              icon: '🛡️',
            },
            { label: 'Miembros activos', value: totalMembers, icon: '👥' },
            { label: 'Miembros capacitados', value: trainedMembers, icon: '🎓' },
            { label: 'Sesiones ejecutadas', value: executedSessions, icon: '✅' },
            { label: 'Sesiones programadas', value: plannedSessions, icon: '📅' },
            {
              label: 'Cumplimiento',
              value: badge.label,
              variant: record.complianceStatus === 'COMPLIES' ? 'success' : record.complianceStatus === 'NON_COMPLIANT' ? 'danger' : 'warning',
              icon: '📋',
            },
          ]}
        />

        <AdvancedSection
          title="Cobertura de capacitación"
          description="Miembros activos del COPASST con al menos una sesión ejecutada"
        >
          <AdvancedProgressBar
            value={coveragePercentage}
            label={`${trainedMembers} de ${totalMembers} miembros capacitados`}
            variant={coveragePercentage >= 75 ? 'success' : coveragePercentage > 0 ? 'warning' : 'danger'}
          />
        </AdvancedSection>

        <AdvancedSection title="Estado del estándar">
          <p>
            <strong>Año de gestión:</strong> {record.year}
          </p>
          <p>
            <strong>Estado de aprobación:</strong> {approvalLabel(approval?.status ?? 'DRAFT')}
            {record.approval?.approvedBy ? ` · por ${record.approval.approvedBy}` : ''}
            {approval?.submittedAt ? (
              <span className="text-muted-small" style={{ marginLeft: '.5rem' }}>
                · enviada el {new Date(approval.submittedAt).toLocaleString()}
              </span>
            ) : null}
          </p>
          <p className="muted">{record.complianceReason}</p>
        </AdvancedSection>

      </>
    );
  };

  const renderProgramaAnual = () => {
    if (!record) return null;
    return (
      <AdvancedSection
        title="Programa anual de capacitación"
        description="Actividades planificadas de formación para los integrantes del COPASST"
        headerRight={
          <Button type="button" disabled={record.locked} onClick={openNewProgram}>
            + Agregar actividad
          </Button>
        }
      >
        {programFormOpen && (
          <div className="training-page__form-card">
            <div className="training-page__form-grid">
              <label className="field">
                <span className="label">Actividad *</span>
                <input
                  className="input"
                  value={programForm.title}
                  placeholder="Ej: Identificación de peligros"
                  onChange={(e) => setProgramForm({ ...programForm, title: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="label">Tipo</span>
                <select
                  className="input"
                  value={programForm.type ?? ''}
                  onChange={(e) => setProgramForm({ ...programForm, type: e.target.value })}
                >
                  <option value="Capacitación">Capacitación</option>
                  <option value="Inducción">Inducción</option>
                  <option value="Actualización">Actualización</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Responsable</span>
                <input
                  className="input"
                  value={programForm.responsible ?? ''}
                  onChange={(e) => setProgramForm({ ...programForm, responsible: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="label">Fecha programada</span>
                <input
                  type="date"
                  className="input"
                  value={toDateInput(programForm.scheduledDate)}
                  onChange={(e) => setProgramForm({ ...programForm, scheduledDate: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="label">Fecha de vencimiento</span>
                <input
                  type="date"
                  className="input"
                  value={toDateInput(programForm.expirationDate)}
                  onChange={(e) => setProgramForm({ ...programForm, expirationDate: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="label">Estado</span>
                <select
                  className="input"
                  value={programForm.status ?? 'Pendiente'}
                  onChange={(e) => setProgramForm({ ...programForm, status: e.target.value })}
                >
                  {PROGRAM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <Button type="button" onClick={saveProgramForm}>
                {programForm.editingIndex !== undefined ? 'Guardar cambios' : 'Agregar actividad'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setProgramFormOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {record.annualProgram.length === 0 ? (
          <p className="muted">Aún no hay actividades planificadas.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Actividad</th>
                  <th>Tipo</th>
                  <th>Responsable</th>
                  <th>Fecha programada</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {record.annualProgram.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <strong>{item.title}</strong>
                    </td>
                    <td>{item.type || '—'}</td>
                    <td>{item.responsible || '—'}</td>
                    <td>{item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString() : '—'}</td>
                    <td>{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : '—'}</td>
                    <td>
                      <span className="badge">{item.status || 'Pendiente'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '.35rem' }}>
                        <Button type="button" variant="secondary" onClick={() => openEditProgram(index)}>
                          Editar
                        </Button>
                        <Button type="button" variant="danger" onClick={() => deleteProgram(index)}>
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdvancedSection>
    );
  };

  const renderCapacitaciones = () => {
    if (!record) return null;
    return (
      <>
        <AdvancedSection
          title="Capacitaciones a integrantes del COPASST"
          description="Una sesión cuenta como ejecutada cuando su estado es «Ejecutada» o registra fecha de finalización."
          headerRight={
            <Button type="button" disabled={record.locked} onClick={openNewSession}>
              + Registrar capacitación
            </Button>
          }
        >
          {sessionFormOpen && (
            <div className="training-page__form-card">
              <div className="training-page__form-grid">
                <label className="field">
                  <span className="label">Título *</span>
                  <input
                    className="input"
                    value={sessionForm.title}
                    onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Tipo</span>
                  <select
                    className="input"
                    value={sessionForm.type ?? 'Capacitación COPASST'}
                    onChange={(e) => setSessionForm({ ...sessionForm, type: e.target.value })}
                  >
                    <option value="Capacitación COPASST">Capacitación COPASST</option>
                    <option value="Inducción">Inducción</option>
                    <option value="Actualización">Actualización</option>
                  </select>
                </label>
                <label className="field">
                  <span className="label">Responsable</span>
                  <input
                    className="input"
                    value={sessionForm.responsible ?? ''}
                    onChange={(e) => setSessionForm({ ...sessionForm, responsible: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Instructor</span>
                  <input
                    className="input"
                    value={sessionForm.instructor ?? ''}
                    onChange={(e) => setSessionForm({ ...sessionForm, instructor: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Lugar</span>
                  <input
                    className="input"
                    value={sessionForm.location ?? ''}
                    onChange={(e) => setSessionForm({ ...sessionForm, location: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Duración</span>
                  <input
                    className="input"
                    value={sessionForm.duration ?? ''}
                    placeholder="Ej: 4 horas"
                    onChange={(e) => setSessionForm({ ...sessionForm, duration: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Fecha programada</span>
                  <input
                    type="date"
                    className="input"
                    value={toDateInput(sessionForm.scheduledDate)}
                    onChange={(e) => setSessionForm({ ...sessionForm, scheduledDate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Vencimiento</span>
                  <input
                    type="date"
                    className="input"
                    value={toDateInput(sessionForm.expirationDate)}
                    onChange={(e) => setSessionForm({ ...sessionForm, expirationDate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Estado</span>
                  <select
                    className="input"
                    disabled={sessionFormWasExecuted}
                    value={sessionForm.status ?? 'Programada'}
                    onChange={(e) => setSessionForm({ ...sessionForm, status: e.target.value })}
                  >
                    {SESSION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {sessionFormWasExecuted && (
                    <span className="text-muted-small" style={{ fontSize: '.78rem' }}>
                      Sesión ejecutada: el estado no puede revertirse (protege el snapshot histórico).
                    </span>
                  )}
                </label>
                <label className="field">
                  <span className="label">Fecha de finalización</span>
                  <input
                    type="date"
                    className="input"
                    value={toDateInput(sessionForm.completionDate)}
                    onChange={(e) => setSessionForm({ ...sessionForm, completionDate: e.target.value })}
                  />
                  <span className="text-muted-small" style={{ fontSize: '.78rem' }}>
                    Registrar esta fecha marca la sesión como ejecutada.
                  </span>
                </label>
              </div>

              <div>
                <span className="label">Participantes COPASST</span>
                {sessionAllowsEditingParticipants(sessionForm) ? (
                  members.length === 0 ? (
                    <p className="muted" style={{ fontSize: '.82rem' }}>
                      No hay miembros activos disponibles: no existe un periodo COPASST vigente.
                    </p>
                  ) : (
                    <div className="training-page__group-card">
                      {members.map((member) => {
                        const selected = selectedParticipantIds.includes(member.userId);
                        return (
                          <label
                            key={member.userId}
                            style={selected ? memberOptionSelectedStyle : memberOptionStyle}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleParticipant(member.userId)}
                            />
                            <span>
                              <strong>{member.name}</strong>
                              <span className="text-muted-small" style={{ display: 'block' }}>
                                {member.committeeRole || 'Miembro'} · {member.representationType || '—'}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <>
                    <p className="muted" style={{ fontSize: '.82rem' }}>
                      Sesión ejecutada o cancelada: los participantes son un snapshot histórico inmutable
                      y no se pueden modificar.
                    </p>
                    <div className="training-page__group-card">
                      {(sessionForm.copasstParticipants ?? []).map((participant) => (
                        <span key={participant.userId} className="training-page__type-badge">
                          👤 {participant.name}
                          {participant.committeeRole ? ` · ${participant.committeeRole}` : ''}
                        </span>
                      ))}
                      {(sessionForm.copasstParticipants ?? []).length === 0 && (
                        <span className="muted">Sin participantes registrados.</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '.5rem' }}>
                <Button type="button" onClick={saveSessionForm}>
                  {sessionFormIndex === null ? 'Registrar capacitación' : 'Guardar cambios'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSessionFormOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {record.sessions.length === 0 ? (
            <p className="muted">Aún no hay capacitaciones registradas.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Fecha programada</th>
                    <th>Finalización</th>
                    <th>Participantes</th>
                    <th>Responsable</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {record.sessions.map((session, index) => (
                    <tr key={index}>
                      <td>
                        <strong>{session.title}</strong>
                        {session.instructor ? (
                          <div className="text-muted-small">Instructor: {session.instructor}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={statusBadgeClass(session.status)}>{session.status ?? 'Pendiente'}</span>
                      </td>
                      <td>{session.scheduledDate ? new Date(session.scheduledDate).toLocaleDateString() : '—'}</td>
                      <td>{session.completionDate ? new Date(session.completionDate).toLocaleDateString() : '—'}</td>
                      <td>
                        {(session.copasstParticipants ?? []).length > 0
                          ? (session.copasstParticipants ?? []).map((participant) => participant.name).join(', ')
                          : '—'}
                      </td>
                      <td>{session.responsible || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '.35rem' }}>
                          <Button type="button" variant="secondary" onClick={() => openEditSession(index)}>
                            Editar
                          </Button>
                          <Button type="button" variant="danger" onClick={() => deleteSession(index)}>
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdvancedSection>

        <AdvancedSection
          title="Temas normativos de referencia"
          description="Checklist de contenidos que la normatividad exige cubrir en la formación del COPASST (estructura abierta)."
        >
          <div className="training-page__group-card">
            {record.checklistTemplate.map((item) => (
              <span key={item.key} className="training-page__type-badge">
                {item.label}
              </span>
            ))}
          </div>
        </AdvancedSection>
      </>
    );
  };

  const renderCobertura = () => {
    if (!record) return null;
    if (members.length === 0) {
      return (
        <AdvancedSection title="Cobertura de capacitación">
          <p className="muted">
            No existe un periodo COPASST vigente: la cobertura se calculará automáticamente cuando
            exista un periodo activo con miembros.
          </p>
        </AdvancedSection>
      );
    }
    return (
      <>
        <AdvancedKpiGrid
          columns={3}
          items={[
            {
              label: 'Cobertura',
              value: `${coveragePercentage}%`,
              variant: coveragePercentage >= 75 ? 'success' : coveragePercentage > 0 ? 'warning' : 'danger',
              icon: '🛡️',
            },
            { label: 'Miembros activos', value: totalMembers, icon: '👥' },
            {
              label: 'Pendientes de capacitar',
              value: pendingMembers.length,
              variant: pendingMembers.length > 0 ? 'warning' : 'success',
              icon: '⏳',
            },
          ]}
        />

        <AdvancedSection
          title="Cobertura de capacitación"
          description={`${trainedMembers} de ${totalMembers} miembros capacitados`}
        >
          <AdvancedProgressBar
            value={coveragePercentage}
            label="Miembros con al menos una sesión ejecutada"
            variant={coveragePercentage >= 75 ? 'success' : coveragePercentage > 0 ? 'warning' : 'danger'}
          />
        </AdvancedSection>

        <AdvancedSection title="Cobertura por miembro">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Miembro</th>
                  <th>Representación</th>
                  <th>Rol</th>
                  <th>Capacitado</th>
                  <th>Sesiones</th>
                  <th>Última capacitación</th>
                </tr>
              </thead>
              <tbody>
                {coverageEntries.map((entry) => (
                  <tr key={entry.userId}>
                    <td>
                      <strong>{entry.name}</strong>
                    </td>
                    <td>{entry.representationType || '—'}</td>
                    <td>{entry.committeeRole || '—'}</td>
                    <td>
                      {entry.trained ? (
                        <span className="badge badge--success">✅ Capacitado</span>
                      ) : (
                        <span className="badge badge--warning">Pendiente</span>
                      )}
                    </td>
                    <td>{entry.executedSessions}</td>
                    <td>{entry.trainedAt ? new Date(entry.trainedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdvancedSection>
      </>
    );
  };

  // ─────────────────────────────────────────────
  // FASE 4 — EVIDENCIAS Y GENERACIÓN DOCUMENTAL (funcionalidad real)
  // ─────────────────────────────────────────────

  const runGeneration = useCallback(
    async (key: string, fn: () => Promise<{ evidence: CopasstTrainingEvidenceModel; reused: boolean }>) => {
      if (generatingKey || generatingRef.current) return; // Evita doble click.
      generatingRef.current = true;
      setGeneratingKey(key);
      try {
        const result = await fn();
        notify(
          result.reused
            ? '✅ El documento ya existía y fue reutilizado.'
            : '✅ Documento generado correctamente.',
        );
        await load(); // Refresca la información después de generar.
      } catch (e) {
        notify(`❌ ${e instanceof Error ? e.message : 'Error generando el documento.'}`);
      } finally {
        generatingRef.current = false;
        setGeneratingKey(null);
      }
    },
    [generatingKey, notify, load],
  );

  const handleGenerateCertificate = (sessionIndex: number, participantUserId: string) => {
    if (!participantUserId) {
      notify('⚠ Selecciona un participante para generar su certificado');
      return;
    }
    void runGeneration(`cert-${sessionIndex}-${participantUserId}`, () =>
      generateCopasstTrainingCertificate(token, { sessionIndex, participantUserId }),
    );
  };

  const handleGenerateAttendance = (sessionIndex: number) => {
    void runGeneration(`att-${sessionIndex}`, () =>
      generateCopasstTrainingAttendance(token, { sessionIndex }),
    );
  };

  const handleGenerateReport = () => {
    void runGeneration('report', () => generateCopasstTrainingReport(token));
  };

  const handleGenerateComplianceReport = () => {
    void runGeneration('compliance', () => generateCopasstTrainingComplianceReport(token));
  };

  const handleUploadEvidence = async () => {
    const file = uploadFileRef.current?.files?.[0];
    if (!file) {
      notify('⚠ Selecciona un archivo para cargar');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const updated = await uploadCopasstTrainingEvidence(token, {
        type: uploadType,
        sessionIndex: uploadSessionIndex !== '' ? Number(uploadSessionIndex) : undefined,
        file,
      });
      setRecord(updated);
      setUploadFileName('');
      if (uploadFileRef.current) uploadFileRef.current.value = '';
      notify('✅ Evidencia cargada correctamente');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error subiendo la evidencia.';
      setUploadError(message);
      notify(`❌ ${message}`);
    } finally {
      setUploading(false);
    }
  };

  // ─────────────────────────────────────────────
  // FASE 5 — APPROVAL WORKFLOW (acciones reales)
  // ─────────────────────────────────────────────

  /** Ejecuta una acción de aprobación con loading + candado anti doble-click. */
  const runApprovalAction = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      if (approvalAction || approvalRef.current) return;
      approvalRef.current = true;
      setApprovalAction(key);
      try {
        await fn();
        setDecisionComment('');
        notify('✅ Acción de aprobación completada');
        await load(); // Refresca la entidad + el estado de aprobación.
      } catch (e) {
        notify(`❌ ${e instanceof Error ? e.message : 'Error en la acción de aprobación.'}`);
      } finally {
        approvalRef.current = false;
        setApprovalAction(null);
      }
    },
    [approvalAction, notify, load],
  );

  const handleSubmitApproval = () => {
    void runApprovalAction('submit', () => submitCopasstTrainingApproval(token));
  };

  const handleDecide = (decision: 'APPROVED' | 'REJECTED' | 'ADJUSTMENTS_REQUESTED') => {
    // El motivo es obligatorio para el rechazo (regla del backend).
    if (decision === 'REJECTED' && !decisionComment.trim()) {
      notify('⚠ Indica el motivo del rechazo');
      return;
    }
    const comment = decisionComment.trim();
    void runApprovalAction(decision, () =>
      decideCopasstTrainingApproval(token, {
        decision,
        reason: decision === 'REJECTED' ? comment : undefined,
        comments: comment || undefined,
      }),
    );
  };

  const evidenceList: CopasstTrainingEvidenceModel[] = record?.evidences ?? [];

  const renderEvidencias = () => {
    if (!record) return null;
    return (
      <>
        {/* ── Generación documental ── */}
        <AdvancedSection
          title="Documentos de 1.1.7"
          description="Certificado, lista de asistencia, informe de capacitación y reporte de cumplimiento"
        >
          <div className="training-page__form-grid" style={{ alignItems: 'end' }}>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="secondary"
                disabled={generatingKey !== null}
                onClick={handleGenerateReport}
              >
                {generatingKey === 'report' ? 'Generando…' : '📑 Generar informe'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={generatingKey !== null}
                onClick={handleGenerateComplianceReport}
              >
                {generatingKey === 'compliance' ? 'Generando…' : '✅ Generar reporte de cumplimiento'}
              </Button>
            </div>
          </div>

          {record.sessions.length === 0 ? (
            <p className="muted" style={{ fontSize: '.85rem', marginTop: '.75rem' }}>
              No hay sesiones registradas: genera primero una capacitación para poder emitir listas de
              asistencia y certificados.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '.75rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Sesión</th>
                    <th>Lista de asistencia</th>
                    <th>Certificados</th>
                  </tr>
                </thead>
                <tbody>
                  {record.sessions.map((session, index) => {
                    const participants = session.copasstParticipants ?? [];
                    const executed = isSessionExecuted(session);
                    return (
                      <tr key={index}>
                        <td>
                          <strong>{session.title}</strong>
                          <div className="text-muted-small">
                            {session.scheduledDate ? new Date(session.scheduledDate).toLocaleDateString() : '—'}{' '}
                            · <span className={statusBadgeClass(session.status)}>{session.status ?? 'Pendiente'}</span>
                          </div>
                        </td>
                        <td>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={generatingKey !== null}
                            onClick={() => handleGenerateAttendance(index)}
                          >
                            {generatingKey === `att-${index}` ? 'Generando…' : '📋 Generar lista'}
                          </Button>
                        </td>
                        <td>
                          {executed ? (
                            participants.length === 0 ? (
                              <span className="text-muted-small">Sin participantes en el snapshot</span>
                            ) : (
                              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <select
                                  className="input"
                                  style={{ maxWidth: 220, padding: '.35rem .5rem', fontSize: '.82rem' }}
                                  value={certSessionIndex === index ? certParticipantUserId : ''}
                                  onChange={(e) => {
                                    setCertSessionIndex(index);
                                    setCertParticipantUserId(e.target.value);
                                  }}
                                >
                                  <option value="">Seleccionar participante…</option>
                                  {participants.map((participant) => (
                                    <option key={participant.userId} value={participant.userId}>
                                      {participant.name} · {participant.committeeRole || 'Miembro'}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={generatingKey !== null || certSessionIndex !== index || !certParticipantUserId}
                                  onClick={() => handleGenerateCertificate(index, certParticipantUserId)}
                                >
                                  {generatingKey === `cert-${index}-${certParticipantUserId}` ? 'Generando…' : '🏅 Certificado'}
                                </Button>
                              </div>
                            )
                          ) : (
                            <span className="text-muted-small" style={{ fontSize: '.8rem' }}>
                              Solo sesiones ejecutadas emiten certificados.
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
            Los documentos generados se guardan en el sistema (Storage + trazabilidad documental) y quedan
            listados abajo como evidencias. La lista de asistencia usa el snapshot histórico de la sesión.
          </p>
        </AdvancedSection>

        {/* ── Carga de evidencias ── */}
        <AdvancedSection
          title="Cargar evidencia"
          description="Material, presentaciones, firmas o soportes asociados a la capacitación COPASST"
        >
          <div className="training-page__form-grid">
            <label className="field">
              <span className="label">Tipo</span>
              <select
                className="input"
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as CopasstTrainingEvidenceType)}
              >
                {(Object.keys(EVIDENCE_TYPE_LABELS) as CopasstTrainingEvidenceType[]).map((type) => (
                  <option key={type} value={type}>
                    {EVIDENCE_TYPE_ICONS[type]} {EVIDENCE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Sesión (opcional)</span>
              <select
                className="input"
                value={uploadSessionIndex}
                onChange={(e) => setUploadSessionIndex(e.target.value)}
              >
                <option value="">Sin sesión asociada</option>
                {record.sessions.map((session, index) => (
                  <option key={index} value={index}>
                    {session.title || `Sesión ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Archivo</span>
              <input
                ref={uploadFileRef}
                type="file"
                className="input"
                onChange={(e) => setUploadFileName(e.target.files?.[0]?.name ?? '')}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.5rem' }}>
            <Button
              type="button"
              disabled={uploading}
              onClick={() => void handleUploadEvidence()}
            >
              {uploading ? 'Cargando…' : '📎 Cargar evidencia'}
            </Button>
            {uploadFileName && <span className="text-muted-small">{uploadFileName}</span>}
          </div>
          {uploadError && <p style={{ color: '#b91c1c', fontSize: '.85rem', marginTop: '.5rem' }}>⚠ {uploadError}</p>}
        </AdvancedSection>

        {/* ── Listado de evidencias ── */}
        <AdvancedSection
          title="Evidencias registradas"
          description="Evidencias estructuradas persistidas en el sistema (Fase 4)"
        >
          {evidenceList.length === 0 ? (
            <p className="muted">Aún no hay evidencias registradas.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Archivo</th>
                    <th>Sesión</th>
                    <th>Fecha de carga</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceList.map((evidence, index) => (
                    <tr key={index}>
                      <td>
                        <span className="badge">
                          {EVIDENCE_TYPE_ICONS[evidence.type] ?? '📄'} {EVIDENCE_TYPE_LABELS[evidence.type] ?? evidence.type}
                        </span>
                      </td>
                      <td>
                        <strong>{evidence.fileName}</strong>
                        {evidence.metadata?.participantUserId ? (
                          <div className="text-muted-small">Participante: {String(evidence.metadata.participantUserId)}</div>
                        ) : null}
                      </td>
                      <td>{evidence.sessionTitle || (evidence.sessionIndex !== undefined ? `Sesión ${evidence.sessionIndex + 1}` : '—')}</td>
                      <td>{evidence.uploadedAt ? new Date(evidence.uploadedAt).toLocaleString() : '—'}</td>
                      <td>
                        {evidence.fileUrl ? (
                          <a href={evidence.fileUrl} target="_blank" rel="noreferrer">
                            <Button type="button" variant="secondary">Abrir</Button>
                          </a>
                        ) : (
                          <span className="text-muted-small">Sin URL</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdvancedSection>
      </>
    );
  };

  // ─────────────────────────────────────────────
  // FASE 5 — APROBACIÓN (DRAFT → PENDING_APPROVAL → APPROVED/REJECTED/AJUSTES)
  // ─────────────────────────────────────────────

  const renderAprobacion = () => {
    if (!record) return null;
    const canSubmit = role === 'owner' || role === 'admin';
    const canDecide = role === 'owner' || role === 'manager';
    const status = approval?.status ?? 'DRAFT';
    const locked = approval?.locked ?? record.locked;

    return (
      <>
        <AdvancedSection
          title="Flujo de aprobación (1.1.7)"
          description="DRAFT → PENDING_APPROVAL → APPROVED · REJECTED · ADJUSTMENTS_REQUESTED"
        >
          {approvalLoading ? (
            <p className="muted">Cargando estado de aprobación…</p>
          ) : approvalError ? (
            <p style={{ color: '#b91c1c', fontSize: '.85rem' }}>⚠ {approvalError}</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <span className="training-page__type-badge" style={{ padding: '.5rem .9rem' }}>
                  <strong>Estado:</strong> {approvalLabel(status)}
                </span>
                <span className="training-page__type-badge" style={{ padding: '.5rem .9rem' }}>
                  <strong>Versión:</strong> v{approval?.currentVersion ?? record.approval?.version ?? 1}
                </span>
                <span className="training-page__type-badge" style={{ padding: '.5rem .9rem' }}>
                  <strong>Bloqueado:</strong> {locked ? 'Sí (no editable)' : 'No'}
                </span>
              </div>

              {status === 'APPROVED' && (
                <p className="muted" style={{ fontSize: '.88rem' }}>
                  ✅ La capacitación fue aprobada: el informe de capacitación se generó automáticamente tras
                  la aprobación y quedó registrado en Evidencias. La entidad está bloqueada.
                </p>
              )}

              {status === 'DRAFT' && (
                <div>
                  {canSubmit ? (
                    <Button
                      type="button"
                      disabled={approvalAction !== null}
                      onClick={handleSubmitApproval}
                    >
                      {approvalAction === 'submit' ? 'Enviando…' : '📨 Enviar a aprobación'}
                    </Button>
                  ) : (
                    <p className="muted" style={{ fontSize: '.85rem' }}>
                      Solo owner/admin pueden enviar la capacitación a aprobación.
                    </p>
                  )}
                </div>
              )}

              {status === 'PENDING_APPROVAL' && (
                <div>
                  {approval?.requestedBy && (
                    <p className="muted" style={{ fontSize: '.85rem' }}>
                      Solicitada por {approval.requestedBy.email}
                      {approval.submittedAt ? ` · ${new Date(approval.submittedAt).toLocaleString()}` : ''}
                    </p>
                  )}
                  {canDecide ? (
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <label className="field" style={{ flex: '1 1 260px' }}>
                        <span className="label">Comentario / motivo</span>
                        <textarea
                          className="input"
                          rows={2}
                          value={decisionComment}
                          placeholder="Motivo del rechazo o comentario de la decisión"
                          onChange={(e) => setDecisionComment(e.target.value)}
                        />
                      </label>
                      <Button
                        type="button"
                        disabled={approvalAction !== null}
                        onClick={() => handleDecide('APPROVED')}
                      >
                        {approvalAction === 'APPROVED' ? 'Aprobando…' : '✅ Aprobar'}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={approvalAction !== null}
                        onClick={() => handleDecide('REJECTED')}
                      >
                        {approvalAction === 'REJECTED' ? 'Rechazando…' : '❌ Rechazar'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={approvalAction !== null}
                        onClick={() => handleDecide('ADJUSTMENTS_REQUESTED')}
                      >
                        {approvalAction === 'ADJUSTMENTS_REQUESTED' ? 'Solicitando…' : '↩️ Solicitar ajustes'}
                      </Button>
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: '.85rem' }}>
                      Pendiente de decisión por owner/manager.
                    </p>
                  )}
                </div>
              )}

              {(status === 'REJECTED' || status === 'ADJUSTMENTS_REQUESTED') && (
                <div>
                  {approval?.rejectionReason && (
                    <p style={{ fontSize: '.88rem' }}>
                      <strong>Motivo:</strong> {approval.rejectionReason}
                    </p>
                  )}
                  {approval?.comments && (
                    <p className="muted" style={{ fontSize: '.85rem' }}>{approval.comments}</p>
                  )}
                  <p className="muted" style={{ fontSize: '.85rem' }}>
                    La entidad está desbloqueada: corrige los datos y vuelve a enviar.
                  </p>
                  {canSubmit && (
                    <Button
                      type="button"
                      disabled={approvalAction !== null}
                      onClick={handleSubmitApproval}
                    >
                      {approvalAction === 'submit' ? 'Enviando…' : '📨 Volver a enviar a aprobación'}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </AdvancedSection>

        <AdvancedSection
          title="Historial de aprobación"
          description="Eventos del Approval Workflow Core (append-only, scoped por empresa)"
        >
          {!approval || approval.history.length === 0 ? (
            <p className="muted">Sin eventos de aprobación registrados.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acción</th>
                    <th>Transición</th>
                    <th>Motivo</th>
                    <th>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...approval.history].reverse().map((event, index) => (
                    <tr key={index}>
                      <td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</td>
                      <td>
                        <span className="badge">{event.action}</span>
                      </td>
                      <td>
                        {event.previousStatus} → {event.newStatus}
                      </td>
                      <td>{event.reason || '—'}</td>
                      <td>{event.actor?.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdvancedSection>
      </>
    );
  };

  const renderIndicadores = () => {
    if (!record) return null;
    const badge = complianceBadge(record.complianceStatus ?? 'PENDING');
    return (
      <>
        <AdvancedKpiGrid
          columns={3}
          items={[
            {
              label: 'Cobertura',
              value: `${coveragePercentage}%`,
              variant: coveragePercentage >= 75 ? 'success' : coveragePercentage > 0 ? 'warning' : 'danger',
              icon: '🛡️',
            },
            { label: 'Sesiones programadas', value: plannedSessions, icon: '📅' },
            { label: 'Sesiones ejecutadas', value: executedSessions, icon: '✅' },
            {
              label: 'Cumplimiento',
              value: badge.label,
              variant: record.complianceStatus === 'COMPLIES' ? 'success' : record.complianceStatus === 'NON_COMPLIANT' ? 'danger' : 'warning',
              icon: '📋',
            },
            { label: 'Miembros pendientes', value: pendingMembers.length, icon: '⏳' },
          ]}
        />

        <AdvancedSection title="Notas sobre los indicadores">
          <p className="muted" style={{ fontSize: '.85rem' }}>
            • Horas acumuladas y evaluación de efectividad por participante se habilitarán cuando el
            modelo normalice la duración en horas y relacione evaluaciones con participantes (fases
            posteriores). Los indicadores mostrados provienen exclusivamente de datos reales del backend.
          </p>
        </AdvancedSection>

        {pendingMembers.length > 0 && (
          <AdvancedSection
            title="Miembros pendientes de capacitar"
            description="Miembros activos sin ninguna sesión ejecutada"
          >
            <div className="training-page__group-card">
              {pendingMembers.map((entry) => (
                <span key={entry.userId} className="training-page__type-badge">
                  👤 {entry.name}
                </span>
              ))}
            </div>
          </AdvancedSection>
        )}
      </>
    );
  };

  const renderAlertas = () => {
    if (!record) return null;
    return (
      <>
        <AdvancedSection
          title="Alertas del sistema"
          description="Alertas persistidas en la entidad (el backend las generará en fases posteriores)"
        >
          {record.alerts.length === 0 ? (
            <p className="muted">No hay alertas persistidas.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {record.alerts.map((alert, index) => (
                <li key={index}>{alert}</li>
              ))}
            </ul>
          )}
        </AdvancedSection>

        <AdvancedSection
          title="Alertas visuales (generadas localmente)"
          description="Sesiones próximas o vencidas calculadas en el navegador — no son alertas persistidas."
        >
          {clientAlerts.length === 0 ? (
            <p className="muted">Sin sesiones próximas ni vencidas.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {clientAlerts.map((alert, index) => (
                <li key={index}>
                  <span className={alert.type === 'Vencida' ? 'badge badge--danger' : 'badge badge--info'}>
                    {alert.type}
                  </span>{' '}
                  {alert.message}
                </li>
              ))}
            </ul>
          )}
        </AdvancedSection>
      </>
    );
  };

  const renderHistorial = () => {
    if (!record) return null;
    return (
      <AdvancedSection
        title="Historial y trazabilidad"
        description="Registro de acciones sobre la gestión de capacitación COPASST (solo lectura)"
      >
        {record.history.length === 0 ? (
          <p className="muted">Sin eventos registrados.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Usuario</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {[...record.history].reverse().map((entry, index) => (
                  <tr key={index}>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>
                      <span className="badge">{entry.action}</span>
                    </td>
                    <td>{entry.createdBy}</td>
                    <td>{entry.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdvancedSection>
    );
  };

  // ─────────────────────────────────────────────
  // LAYOUT PRINCIPAL
  // ─────────────────────────────────────────────

  const badge = complianceBadge(record?.complianceStatus ?? 'PENDING');

  return (
    <AdvancedPageLayout>
      <div className="training-page">
        <AdvancedHeader
          moduleCode="1.1.7"
          moduleTitle="Capacitación COPASST"
          description="Estándar 1.1.7 — Capacitación de los integrantes del COPASST"
          statusBadge={<span className={badge.className}>{badge.label}</span>}
          actions={[
            { label: '← Volver', variant: 'secondary', onClick: () => requestNavigation('/documents/plan') },
            {
              label: saving ? 'Guardando…' : dirty ? '💾 Guardar cambios' : 'Guardado',
              variant: 'primary',
              disabled: !dirty || saving || Boolean(record?.locked),
              onClick: save,
            },
          ]}
          lastSaved={lastSaved ? `Último guardado: ${lastSaved}` : null}
        />

        {toast && <div style={toastStyle}>{toast}</div>}

        {loading ? (
          <p className="muted">Cargando gestión de capacitación COPASST…</p>
        ) : error ? (
          <div className="advanced-management__section">
            <p style={{ color: '#b91c1c' }}>⚠ {error}</p>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        ) : record ? (
          <>
            {dirty && <div className="training-page__dirty-bar">⚠ Hay cambios sin guardar</div>}

            {record.locked && (
              <div className="training-page__banner training-page__banner--warning">
                🔒 La capacitación COPASST está bloqueada por el flujo de aprobación (pendiente de aprobación o
                aprobada). Para editarla, espera una decisión de rechazo o solicitud de ajustes.
              </div>
            )}

            {!record.periodId && members.length === 0 && (
              <div className="training-page__banner training-page__banner--warning">
                ⚠ No existe un periodo COPASST vigente. Para gestionar las capacitaciones debe existir un
                periodo COPASST activo.
              </div>
            )}

            <div className="training-page__body">
              <AdvancedTabsSidebar
                items={SIDEBAR_ITEMS}
                activeId={sidebarTab}
                onSelect={(id) => setSidebarTab(id as SidebarId)}
              />
              <AdvancedTabsContent>
                {sidebarTab === 'resumen' && renderResumen()}
                {sidebarTab === 'programa-anual' && renderProgramaAnual()}
                {sidebarTab === 'capacitaciones' && renderCapacitaciones()}
                {sidebarTab === 'cobertura' && renderCobertura()}
                {sidebarTab === 'aprobacion' && renderAprobacion()}
                {sidebarTab === 'evidencias' && renderEvidencias()}
                {sidebarTab === 'indicadores' && renderIndicadores()}
                {sidebarTab === 'alertas' && renderAlertas()}
                {sidebarTab === 'historial' && renderHistorial()}
              </AdvancedTabsContent>
            </div>
          </>
        ) : null}

        {showUnsavedModal && (
          <div className="modal-overlay" onClick={() => setShowUnsavedModal(false)}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <h3>Cambios sin guardar</h3>
              <p>Tienes cambios sin guardar en la capacitación COPASST. ¿Deseas descartarlos y salir?</p>
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setShowUnsavedModal(false)}>
                  Seguir editando
                </Button>
                <Button type="button" variant="danger" onClick={discardAndLeave}>
                  Descartar y salir
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdvancedPageLayout>
  );
}
