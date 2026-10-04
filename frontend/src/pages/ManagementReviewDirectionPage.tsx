import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type UserModel,
  type DocumentMasterItem,
  fetchAdmins,
  fetchMembers,
  fetchDocumentManagementList,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type { DashboardFinding, DashboardModuleCompliance } from '../types/compliance-dashboard';
import {
  listManagementReviews,
  createManagementReview,
  updateManagementReview,
  changeManagementReviewStatus,
  createManagementReviewInput,
  updateManagementReviewInput,
  createManagementReviewDecision,
  updateManagementReviewDecision,
  updateManagementReviewEvidence,
  getManagementReviewHistory,
} from '../services/management-review-direction.service';
import type {
  ManagementReviewDirectionModel,
  ManagementReviewDirectionStatus,
  ManagementReviewDirectionHistoryModel,
  ManagementReviewDirectionInputModel,
  ManagementReviewDirectionDecisionModel,
  ManagementReviewType,
  ManagementReviewInputType,
  ManagementReviewInputStatus,
  ManagementReviewDecisionCategory,
  ManagementReviewDecisionStatus,
  ManagementReviewAttendance,
  CreateManagementReviewPayload,
  CreateManagementReviewInputPayload,
  CreateManagementReviewDecisionPayload,
} from '../types/management-review-direction';
import {
  MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS,
  MANAGEMENT_REVIEW_TYPE_LABELS,
  MANAGEMENT_REVIEW_INPUT_TYPE_LABELS,
  MANAGEMENT_REVIEW_INPUT_STATUS_LABELS,
  MANAGEMENT_REVIEW_DECISION_CATEGORY_LABELS,
  MANAGEMENT_REVIEW_DECISION_STATUS_LABELS,
  MANAGEMENT_REVIEW_ATTENDANCE_LABELS,
  MANAGEMENT_REVIEW_HISTORY_ACTION_LABELS,
  MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS,
  MANAGEMENT_REVIEW_DIMENSION_KEYS,
  MANAGEMENT_REVIEW_DIMENSION_LABELS,
  MANAGEMENT_REVIEW_DIMENSION_WEIGHT_FALLBACK,
  isManagementReviewDirectionMetadata,
  isManagementReviewDecisionOverdue,
  managementReviewRatioToPercent,
  type ManagementReviewDirectionComplianceMetadataV1,
} from '../types/management-review-direction';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
} from '../components/advanced-layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Table } from '../components/ui/Table';

/**
 * E3 (6.1.3) — Gestión Avanzada de la REVISIÓN POR LA DIRECCIÓN SG-SST.
 *
 * REGLA DE SCORE: el frontend NO calcula el cumplimiento. Porcentaje, estado y
 * metadata dimensional provienen exclusivamente de GET /compliance-engine/
 * overview (module === 'management-review-direction', dimensions:v1).
 * `managementReviewRatioToPercent` es solo presentación visual.
 *
 * Roles (E1): lectura owner/admin/manager/member; escritura owner/admin
 * (el backend es la autoridad — aquí solo se ocultan acciones).
 * Transiciones de estado: el backend valida
 * (MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS + integridad de fechas/acta);
 * el frontend solo ofrece las opciones válidas por estado y pide las fechas
 * que el backend exige ANTES de la transición (plannedDate, actualStartDate,
 * actualEndDate).
 *
 * NO_DATA ≠ 0%: la semántica del backend se respeta exactamente (§14 del
 * diseño) — 'no-reviews'/'no-evaluable-reviews' muestran "Sin datos
 * evaluables"; un score real 0% se muestra como 0%.
 */

interface ManagementReviewDirectionPageProps {
  token: string;
  role?: string;
}

const TABS: SidebarTabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: '📋' },
  { id: 'revisiones', label: 'Revisiones', icon: '🗂️' },
  { id: 'entradas', label: 'Entradas', icon: '📥' },
  { id: 'analisis', label: 'Análisis', icon: '🧭' },
  { id: 'decisiones', label: 'Decisiones', icon: '✅' },
  { id: 'evidencia', label: 'Evidencia e historial', icon: '📎' },
];

const STATUS_VARIANTS: Record<ManagementReviewDirectionStatus, string> = {
  DRAFT: 'badge--info',
  PLANNED: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

const INPUT_STATUS_VARIANTS: Record<ManagementReviewInputStatus, string> = {
  PENDING: 'badge--warning',
  REVIEWED: 'badge--success',
};

const DECISION_STATUS_VARIANTS: Record<ManagementReviewDecisionStatus, string> = {
  PENDING: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

/** Transición → etiqueta del botón (espejo del patrón 6.1.2). */
const TRANSITION_LABELS: Partial<Record<ManagementReviewDirectionStatus, string>> = {
  PLANNED: 'Planificar',
  IN_PROGRESS: 'Iniciar',
  COMPLETED: 'Completar',
  CANCELLED: 'Cancelar',
};

/** Acción mínima por finding oficial (IDs de management-review-direction-scoring.ts). */
const FINDING_ACTION: Record<string, { tab: string; label: string }> = {
  'management-review-direction-no-data': { tab: 'revisiones', label: 'Registrar revisión' },
  'management-review-direction-no-evaluable-reviews': { tab: 'revisiones', label: 'Ir a Revisiones' },
  'management-review-direction-planning-incomplete': { tab: 'revisiones', label: 'Completar planificación' },
  'management-review-direction-inputs-incomplete': { tab: 'entradas', label: 'Gestionar entradas' },
  'management-review-direction-analysis-incomplete': { tab: 'analisis', label: 'Completar análisis' },
  'management-review-direction-decisions-incomplete': { tab: 'decisiones', label: 'Gestionar decisiones' },
  'management-review-direction-evidence-incomplete': { tab: 'evidencia', label: 'Adjuntar evidencia' },
  'management-review-direction-not-completed': { tab: 'revisiones', label: 'Ir a Revisiones' },
  'management-review-direction-overdue-decisions': { tab: 'decisiones', label: 'Ver decisiones vencidas' },
  'management-review-direction-history-incomplete': { tab: 'evidencia', label: 'Ver historial' },
};

/** Estados con contenido editable (COMPLETED/CANCELLED son solo lectura). */
const CONTENT_EDITABLE: readonly ManagementReviewDirectionStatus[] = ['DRAFT', 'PLANNED', 'IN_PROGRESS'];

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Solo lectura de fecha (input date emite YYYY-MM-DD, aceptado por IsDateString). */
function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function dateOrUndefined(value: string): string | undefined {
  return isISODate(value) ? value : undefined;
}

function canWrite(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** Orden útil: más reciente primero (fin real → planificada → creación). */
function sortReviewsDesc(reviews: ManagementReviewDirectionModel[]): ManagementReviewDirectionModel[] {
  return [...reviews].sort((a, b) => {
    const ta = new Date(a.actualEndDate ?? a.plannedDate ?? a.createdAt ?? 0).getTime() || 0;
    const tb = new Date(b.actualEndDate ?? b.plannedDate ?? b.createdAt ?? 0).getTime() || 0;
    return tb - ta;
  });
}

/** Lista de texto: una línea por ítem (Fortalezas/Brechas/Prioridades). */
function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function listToLines(value?: string[]): string {
  return (value ?? []).join('\n');
}

// ─── Estados de formularios ─────────────────────────────────────────────────

interface ParticipantFormRow {
  userId: string;
  nameSnapshot: string;
  role: string;
  attendance: ManagementReviewAttendance;
}

interface ReviewFormState {
  reviewCode: string;
  title: string;
  reviewType: ManagementReviewType;
  plannedDate: string;
  location: string;
  scope: string;
  objectives: string;
  responsibleUserId: string;
  responsibleNameSnapshot: string;
  participants: ParticipantFormRow[];
}

const EMPTY_REVIEW_FORM: ReviewFormState = {
  reviewCode: '',
  title: '',
  reviewType: 'ORDINARY',
  plannedDate: '',
  location: '',
  scope: '',
  objectives: '',
  responsibleUserId: '',
  responsibleNameSnapshot: '',
  participants: [],
};

interface InputFormState {
  type: ManagementReviewInputType;
  title: string;
  description: string;
  sourceModule: string;
  sourceEntityId: string;
  referencePeriod: string;
  status: ManagementReviewInputStatus;
  evidenceDocumentId: string;
  evidenceUrl: string;
  observations: string;
}

const EMPTY_INPUT_FORM: InputFormState = {
  type: 'AUDIT_RESULTS',
  title: '',
  description: '',
  sourceModule: '',
  sourceEntityId: '',
  referencePeriod: '',
  status: 'PENDING',
  evidenceDocumentId: '',
  evidenceUrl: '',
  observations: '',
};

interface DecisionFormState {
  description: string;
  category: ManagementReviewDecisionCategory;
  status: ManagementReviewDecisionStatus;
  responsibleUserId: string;
  responsibleNameSnapshot: string;
  dueDate: string;
  resourcesRequired: string;
  evidenceUrl: string;
  observations: string;
}

const EMPTY_DECISION_FORM: DecisionFormState = {
  description: '',
  category: 'IMPROVEMENT',
  status: 'PENDING',
  responsibleUserId: '',
  responsibleNameSnapshot: '',
  dueDate: '',
  resourcesRequired: '',
  evidenceUrl: '',
  observations: '',
};

function userName(users: UserModel[], userId?: string): string {
  if (!userId) return '—';
  const u = users.find((x) => x._id === userId);
  return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : userId;
}

export function ManagementReviewDirectionPage({ token, role }: ManagementReviewDirectionPageProps) {
  const writable = canWrite(role);
  const [activeTab, setActiveTab] = useState<string>('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Datos
  const [reviews, setReviews] = useState<ManagementReviewDirectionModel[]>([]);
  const [users, setUsers] = useState<UserModel[]>([]);
  const [documents, setDocuments] = useState<DocumentMasterItem[]>([]);
  const [compliance, setCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [findings, setFindings] = useState<DashboardFinding[]>([]);
  const [metadata, setMetadata] = useState<ManagementReviewDirectionComplianceMetadataV1 | null>(null);

  // Revisión seleccionada (tabs Entradas/Análisis/Decisiones/Evidencia)
  const [selectedReviewId, setSelectedReviewId] = useState<string>('');

  // Historial (se carga solo para el tab evidencia)
  const [history, setHistory] = useState<ManagementReviewDirectionHistoryModel[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);

  // Filtros del tab Revisiones
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Estado de guardado
  const [saving, setSaving] = useState(false);

  // Modales
  const [formModal, setFormModal] = useState<
    { mode: 'create' } | { mode: 'edit'; review: ManagementReviewDirectionModel } | null
  >(null);
  const [form, setForm] = useState<ReviewFormState>(EMPTY_REVIEW_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [detailReview, setDetailReview] = useState<ManagementReviewDirectionModel | null>(null);

  const [statusModal, setStatusModal] = useState<
    { review: ManagementReviewDirectionModel; next: ManagementReviewDirectionStatus } | null
  >(null);
  const [statusComment, setStatusComment] = useState('');
  const [statusPlannedDate, setStatusPlannedDate] = useState('');
  const [statusResponsibleUserId, setStatusResponsibleUserId] = useState('');
  const [statusActualStartDate, setStatusActualStartDate] = useState('');
  const [statusActualEndDate, setStatusActualEndDate] = useState('');

  const [inputModal, setInputModal] = useState<
    | { reviewId: string; mode: 'create' }
    | { reviewId: string; mode: 'edit'; input: ManagementReviewDirectionInputModel }
    | null
  >(null);
  const [inputForm, setInputForm] = useState<InputFormState>(EMPTY_INPUT_FORM);

  const [analysisModal, setAnalysisModal] = useState<ManagementReviewDirectionModel | null>(null);
  const [analysisForm, setAnalysisForm] = useState({ summary: '', strengths: '', gaps: '', priorities: '', managementObservations: '' });

  const [decisionModal, setDecisionModal] = useState<
    | { reviewId: string; mode: 'create' }
    | { reviewId: string; mode: 'edit'; decision: ManagementReviewDirectionDecisionModel }
    | null
  >(null);
  const [decisionForm, setDecisionForm] = useState<DecisionFormState>(EMPTY_DECISION_FORM);

  const [minutesModal, setMinutesModal] = useState<ManagementReviewDirectionModel | null>(null);
  const [minutesDocumentId, setMinutesDocumentId] = useState('');

  const [evidenceUrlModal, setEvidenceUrlModal] = useState<ManagementReviewDirectionModel | null>(null);
  const [evidenceUrlForm, setEvidenceUrlForm] = useState({ minutesEvidenceUrl: '', reportTitle: '' });

  // ─── Carga (tolerante: compliance falla ≠ romper la gestión) ────────────
  const loadCompliance = useCallback(async () => {
    const overview = await getOverview(token, '').catch(() => null);
    const moduleCompliance =
      overview?.moduleCompliance?.find((m) => m.module === 'management-review-direction') ?? null;
    setCompliance(moduleCompliance);
    setMetadata(
      moduleCompliance && isManagementReviewDirectionMetadata(moduleCompliance.metadata)
        ? moduleCompliance.metadata
        : null,
    );
    setFindings((overview?.findings ?? []).filter((f) => f.module === 'management-review-direction'));
  }, [token]);

  const loadReviews = useCallback(async () => {
    setReviews(await listManagementReviews(token).catch(() => []));
  }, [token]);

  const loadUsers = useCallback(async () => {
    const [admins, members] = await Promise.all([
      fetchAdmins(token).catch(() => [] as UserModel[]),
      fetchMembers(token).catch(() => [] as UserModel[]),
    ]);
    setUsers([...admins, ...members]);
  }, [token]);

  const loadDocuments = useCallback(async () => {
    setDocuments(await fetchDocumentManagementList(token).catch(() => []));
  }, [token]);

  const refresh = useCallback(async () => {
    await Promise.all([loadReviews(), loadCompliance()]);
  }, [loadReviews, loadCompliance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list, overview] = await Promise.all([
          listManagementReviews(token),
          getOverview(token, '').catch(() => null),
        ]);
        if (cancelled) return;
        setReviews(list);
        const moduleCompliance =
          overview?.moduleCompliance?.find((m) => m.module === 'management-review-direction') ?? null;
        setCompliance(moduleCompliance);
        setMetadata(
          moduleCompliance && isManagementReviewDirectionMetadata(moduleCompliance.metadata)
            ? moduleCompliance.metadata
            : null,
        );
        setFindings((overview?.findings ?? []).filter((f) => f.module === 'management-review-direction'));
        // Cargas secundarias (su fallo no rompe la página).
        void loadUsers();
        void loadDocuments();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadUsers, loadDocuments]);

  // Historial: SOLO cuando el tab evidencia está activo y hay revisión elegida.
  useEffect(() => {
    if (activeTab !== 'evidencia' || !selectedReviewId) return;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const items = await getManagementReviewHistory(token, selectedReviewId);
        if (!cancelled) setHistory(items);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeTab, selectedReviewId, historyRevision]);

  // ─── Derivados de presentación ──────────────────────────────────────────
  const percentage = compliance?.compliance ?? null;
  const status = compliance?.status ?? null;
  const counters = metadata?.counters ?? null;

  const sortedReviews = useMemo(() => sortReviewsDesc(reviews), [reviews]);

  const selectedReview = useMemo(
    () => sortedReviews.find((r) => r._id === selectedReviewId) ?? null,
    [sortedReviews, selectedReviewId],
  );

  const filteredReviews = useMemo(() => {
    return sortedReviews.filter((r) => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterType && r.reviewType !== filterType) return false;
      if (filterFrom || filterTo) {
        const ref = r.actualEndDate ?? r.plannedDate ?? '';
        if (!ref) return false;
        const t = new Date(ref).getTime();
        if (Number.isNaN(t)) return false;
        if (filterFrom && t < new Date(filterFrom).getTime()) return false;
        if (filterTo && t > new Date(`${filterTo}T23:59:59`).getTime()) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const code = (r.reviewCode ?? '').toLowerCase();
        const title = r.title.toLowerCase();
        if (!code.includes(q) && !title.includes(q)) return false;
      }
      return true;
    });
  }, [sortedReviews, filterStatus, filterType, filterFrom, filterTo, search]);

  /** Contadores de respaldo (presentación) cuando la metadata no está disponible. */
  const fallbackPendingDecisions = useMemo(
    () =>
      reviews.reduce(
        (sum, r) =>
          sum +
          r.decisions.filter(
            (d) => (d.status === 'PENDING' || d.status === 'IN_PROGRESS') && !isManagementReviewDecisionOverdue(d),
          ).length,
        0,
      ),
    [reviews],
  );
  const fallbackOverdueDecisions = useMemo(
    () => reviews.reduce((sum, r) => sum + r.decisions.filter((d) => isManagementReviewDecisionOverdue(d)).length, 0),
    [reviews],
  );
  const fallbackEvaluable = useMemo(
    () => reviews.filter((r) => r.status === 'COMPLETED' && r.actualEndDate).length,
    [reviews],
  );

  const statusBadge = loading
    ? <span className="badge badge--info">⏳ Cargando…</span>
    : compliance === null
      ? <span className="badge badge--warning">Cumplimiento no disponible</span>
      : status === 'NO_DATA'
        ? <span className="badge badge--warning">Sin datos evaluables</span>
        : status === 'TARGET_MET'
          ? <span className="badge badge--success">✅ Meta alcanzada</span>
          : <span className="badge badge--danger">Meta no alcanzada</span>;

  // ─── Formulario de revisión (crear/editar) ──────────────────────────────
  const openCreateForm = () => {
    setForm(EMPTY_REVIEW_FORM);
    setFormError(null);
    setFormModal({ mode: 'create' });
  };

  const openEditForm = (review: ManagementReviewDirectionModel) => {
    setForm({
      reviewCode: review.reviewCode ?? '',
      title: review.title,
      reviewType: review.reviewType,
      plannedDate: review.plannedDate ? review.plannedDate.slice(0, 10) : '',
      location: review.location ?? '',
      scope: review.scope ?? '',
      objectives: review.objectives ?? '',
      responsibleUserId: review.responsibleUserId ?? '',
      responsibleNameSnapshot: review.responsibleNameSnapshot ?? '',
      participants: review.participants.map((p) => ({
        userId: p.userId ?? '',
        nameSnapshot: p.nameSnapshot,
        role: p.role ?? '',
        attendance: p.attendance,
      })),
    });
    setFormError(null);
    setFormModal({ mode: 'edit', review });
  };

  const handleParticipantUserChange = (index: number, userId: string) => {
    setForm((prev) => {
      const participants = [...prev.participants];
      const u = users.find((x) => x._id === userId);
      participants[index] = {
        ...participants[index],
        userId,
        nameSnapshot: u ? `${u.firstName} ${u.lastName}`.trim() || u.email : participants[index].nameSnapshot,
        role: u?.jobTitle || participants[index].role,
      };
      return { ...prev, participants };
    });
  };

  const handleFormResponsibleChange = (userId: string) => {
    setForm((prev) => {
      const u = users.find((x) => x._id === userId);
      return {
        ...prev,
        responsibleUserId: userId,
        responsibleNameSnapshot: u ? `${u.firstName} ${u.lastName}`.trim() || u.email : prev.responsibleNameSnapshot,
      };
    });
  };

  const buildReviewPayload = (): CreateManagementReviewPayload | null => {
    if (!form.title.trim()) return null;
    const participants = form.participants
      .filter((p) => p.nameSnapshot.trim().length > 0)
      .map((p) => ({
        ...(p.userId ? { userId: p.userId } : {}),
        nameSnapshot: p.nameSnapshot.trim(),
        ...(p.role.trim() ? { role: p.role.trim() } : {}),
        attendance: p.attendance,
      }));
    return {
      ...(form.reviewCode.trim() ? { reviewCode: form.reviewCode.trim() } : {}),
      title: form.title.trim(),
      reviewType: form.reviewType,
      ...(dateOrUndefined(form.plannedDate) ? { plannedDate: dateOrUndefined(form.plannedDate) } : {}),
      ...(form.location.trim() ? { location: form.location.trim() } : {}),
      ...(form.scope.trim() ? { scope: form.scope.trim() } : {}),
      ...(form.objectives.trim() ? { objectives: form.objectives.trim() } : {}),
      ...(form.responsibleUserId ? { responsibleUserId: form.responsibleUserId } : {}),
      ...(form.responsibleNameSnapshot.trim() ? { responsibleNameSnapshot: form.responsibleNameSnapshot.trim() } : {}),
      ...(participants.length > 0 ? { participants } : {}),
    };
  };

  const handleSaveReview = async () => {
    if (!formModal) return;
    const payload = buildReviewPayload();
    if (!payload) {
      setFormError('El título es obligatorio.');
      return;
    }
    if (formModal.mode === 'create' && !payload.plannedDate) {
      setFormError('La fecha planificada es obligatoria para crear la revisión (el flujo DRAFT → PLANNED la exige).');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (formModal.mode === 'create') {
        await createManagementReview(token, payload);
      } else {
        await updateManagementReview(token, formModal.review._id, payload);
      }
      setFormModal(null);
      await refresh();
      setBanner(formModal.mode === 'create' ? 'Revisión creada.' : 'Revisión actualizada.');
    } catch (err) {
      // El formulario se conserva para corregir (§29: no perder el estado).
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ─── Transición de estado (con requisitos del backend) ──────────────────
  const openStatusModal = (review: ManagementReviewDirectionModel, next: ManagementReviewDirectionStatus) => {
    setStatusComment('');
    setStatusPlannedDate(review.plannedDate ? review.plannedDate.slice(0, 10) : '');
    setStatusResponsibleUserId(review.responsibleUserId ?? '');
    setStatusActualStartDate(review.actualStartDate ? review.actualStartDate.slice(0, 10) : '');
    setStatusActualEndDate(review.actualEndDate ? review.actualEndDate.slice(0, 10) : '');
    setStatusModal({ review, next });
  };

  const handleStatusChange = async () => {
    if (!statusModal) return;
    const { review, next } = statusModal;
    setSaving(true);
    try {
      // El backend exige campos ANTES de la transición (assertDatesCoherentWithStatus).
      const patch: Record<string, string> = {};
      if (next === 'PLANNED') {
        if (!isISODate(statusPlannedDate)) {
          setBanner('Error: la fecha planificada es obligatoria para pasar a PLANNED.');
          return;
        }
        if (!statusResponsibleUserId) {
          setBanner('Error: el responsable es obligatorio para pasar a PLANNED.');
          return;
        }
        patch.plannedDate = statusPlannedDate;
        patch.responsibleUserId = statusResponsibleUserId;
      }
      if (next === 'IN_PROGRESS') {
        if (!isISODate(statusActualStartDate)) {
          setBanner('Error: la fecha real de inicio es obligatoria para iniciar la ejecución.');
          return;
        }
        patch.actualStartDate = statusActualStartDate;
      }
      if (next === 'COMPLETED') {
        if (!isISODate(statusActualEndDate)) {
          setBanner('Error: la fecha real de fin es obligatoria para completar la revisión.');
          return;
        }
        patch.actualEndDate = statusActualEndDate;
      }
      if (Object.keys(patch).length > 0) {
        await updateManagementReview(token, review._id, patch);
      }
      await changeManagementReviewStatus(token, review._id, {
        status: next,
        ...(statusComment.trim() ? { comment: statusComment.trim() } : {}),
      });
      setStatusModal(null);
      await refresh();
      setBanner(`Estado actualizado a ${MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[next]}.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Entradas ───────────────────────────────────────────────────────────
  const openCreateInput = (reviewId: string) => {
    setInputForm(EMPTY_INPUT_FORM);
    setInputModal({ reviewId, mode: 'create' });
  };

  const openEditInput = (reviewId: string, input: ManagementReviewDirectionInputModel) => {
    setInputForm({
      type: input.type,
      title: input.title,
      description: input.description ?? '',
      sourceModule: input.sourceModule ?? '',
      sourceEntityId: input.sourceEntityId ?? '',
      referencePeriod: input.referencePeriod ?? '',
      status: input.status,
      evidenceDocumentId: input.evidenceDocumentId ?? '',
      evidenceUrl: input.evidenceUrl ?? '',
      observations: input.observations ?? '',
    });
    setInputModal({ reviewId, mode: 'edit', input });
  };

  const handleSaveInput = async () => {
    if (!inputModal) return;
    if (!inputForm.title.trim()) {
      setBanner('Error: el título de la entrada es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateManagementReviewInputPayload = {
        type: inputForm.type,
        title: inputForm.title.trim(),
        ...(inputForm.description.trim() ? { description: inputForm.description.trim() } : {}),
        ...(inputForm.sourceModule.trim() ? { sourceModule: inputForm.sourceModule.trim() } : {}),
        ...(inputForm.sourceEntityId.trim() ? { sourceEntityId: inputForm.sourceEntityId.trim() } : {}),
        ...(inputForm.referencePeriod.trim() ? { referencePeriod: inputForm.referencePeriod.trim() } : {}),
        status: inputForm.status,
        ...(inputForm.evidenceDocumentId ? { evidenceDocumentId: inputForm.evidenceDocumentId } : {}),
        ...(inputForm.evidenceUrl.trim() ? { evidenceUrl: inputForm.evidenceUrl.trim() } : {}),
        ...(inputForm.observations.trim() ? { observations: inputForm.observations.trim() } : {}),
      };
      if (inputModal.mode === 'create') {
        await createManagementReviewInput(token, inputModal.reviewId, payload);
      } else {
        await updateManagementReviewInput(token, inputModal.reviewId, inputModal.input._id, payload);
      }
      setInputModal(null);
      await refresh();
      setBanner('Entrada guardada.');
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkInputReviewed = async (reviewId: string, input: ManagementReviewDirectionInputModel) => {
    setSaving(true);
    try {
      await updateManagementReviewInput(token, reviewId, input._id, { status: 'REVIEWED' });
      await refresh();
      setBanner(`Entrada «${input.title}» marcada como revisada.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Análisis ───────────────────────────────────────────────────────────
  const openAnalysisModal = (review: ManagementReviewDirectionModel) => {
    setAnalysisForm({
      summary: review.analysis?.summary ?? '',
      strengths: listToLines(review.analysis?.strengths),
      gaps: listToLines(review.analysis?.gaps),
      priorities: listToLines(review.analysis?.priorities),
      managementObservations: review.analysis?.managementObservations ?? '',
    });
    setAnalysisModal(review);
  };

  const handleSaveAnalysis = async () => {
    if (!analysisModal) return;
    setSaving(true);
    try {
      await updateManagementReview(token, analysisModal._id, {
        analysis: {
          ...(analysisForm.summary.trim() ? { summary: analysisForm.summary.trim() } : { summary: '' }),
          strengths: linesToList(analysisForm.strengths),
          gaps: linesToList(analysisForm.gaps),
          priorities: linesToList(analysisForm.priorities),
          ...(analysisForm.managementObservations.trim()
            ? { managementObservations: analysisForm.managementObservations.trim() }
            : { managementObservations: '' }),
        },
      });
      setAnalysisModal(null);
      await refresh();
      setBanner('Análisis guardado.');
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Decisiones ─────────────────────────────────────────────────────────
  const openCreateDecision = (reviewId: string) => {
    setDecisionForm(EMPTY_DECISION_FORM);
    setDecisionModal({ reviewId, mode: 'create' });
  };

  const openEditDecision = (reviewId: string, decision: ManagementReviewDirectionDecisionModel) => {
    setDecisionForm({
      description: decision.description,
      category: decision.category,
      status: decision.status,
      responsibleUserId: decision.responsibleUserId ?? '',
      responsibleNameSnapshot: decision.responsibleNameSnapshot ?? '',
      dueDate: decision.dueDate ? decision.dueDate.slice(0, 10) : '',
      resourcesRequired: decision.resourcesRequired ?? '',
      evidenceUrl: decision.evidenceUrl ?? '',
      observations: decision.observations ?? '',
    });
    setDecisionModal({ reviewId, mode: 'edit', decision });
  };

  const handleDecisionUserChange = (userId: string) => {
    setDecisionForm((prev) => {
      const u = users.find((x) => x._id === userId);
      return {
        ...prev,
        responsibleUserId: userId,
        responsibleNameSnapshot: u ? `${u.firstName} ${u.lastName}`.trim() || u.email : prev.responsibleNameSnapshot,
      };
    });
  };

  const handleSaveDecision = async () => {
    if (!decisionModal) return;
    if (!decisionForm.description.trim()) {
      setBanner('Error: la descripción de la decisión es obligatoria.');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateManagementReviewDecisionPayload = {
        description: decisionForm.description.trim(),
        category: decisionForm.category,
        status: decisionForm.status,
        ...(decisionForm.responsibleUserId ? { responsibleUserId: decisionForm.responsibleUserId } : {}),
        ...(decisionForm.responsibleNameSnapshot.trim()
          ? { responsibleNameSnapshot: decisionForm.responsibleNameSnapshot.trim() }
          : {}),
        ...(dateOrUndefined(decisionForm.dueDate) ? { dueDate: dateOrUndefined(decisionForm.dueDate) } : {}),
        ...(decisionForm.resourcesRequired.trim()
          ? { resourcesRequired: decisionForm.resourcesRequired.trim() }
          : {}),
        ...(decisionForm.evidenceUrl.trim() ? { evidenceUrl: decisionForm.evidenceUrl.trim() } : {}),
        ...(decisionForm.observations.trim() ? { observations: decisionForm.observations.trim() } : {}),
      };
      if (decisionModal.mode === 'create') {
        await createManagementReviewDecision(token, decisionModal.reviewId, payload);
      } else {
        await updateManagementReviewDecision(token, decisionModal.reviewId, decisionModal.decision._id, payload);
      }
      setDecisionModal(null);
      await refresh();
      setBanner('Decisión guardada.');
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickDecisionStatus = async (reviewId: string, decision: ManagementReviewDirectionDecisionModel, next: ManagementReviewDecisionStatus) => {
    setSaving(true);
    try {
      await updateManagementReviewDecision(token, reviewId, decision._id, { status: next });
      await refresh();
      setBanner(`Decisión actualizada a ${MANAGEMENT_REVIEW_DECISION_STATUS_LABELS[next]}.`);
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Evidencia ──────────────────────────────────────────────────────────
  const openMinutesModal = (review: ManagementReviewDirectionModel) => {
    setMinutesDocumentId(review.minutesDocumentId ?? '');
    setMinutesModal(review);
  };

  const handleAttachMinutes = async () => {
    if (!minutesModal) return;
    if (!minutesDocumentId) {
      setBanner('Error: selecciona el documento del acta.');
      return;
    }
    setSaving(true);
    try {
      await updateManagementReviewEvidence(token, minutesModal._id, { documentId: minutesDocumentId });
      setMinutesModal(null);
      setHistoryRevision((v) => v + 1);
      await refresh();
      setBanner('Acta adjuntada.');
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const openEvidenceUrlModal = (review: ManagementReviewDirectionModel) => {
    setEvidenceUrlForm({
      minutesEvidenceUrl: review.minutesEvidenceUrl ?? '',
      reportTitle: review.reportTitle ?? '',
    });
    setEvidenceUrlModal(review);
  };

  const handleSaveEvidenceUrl = async () => {
    if (!evidenceUrlModal) return;
    setSaving(true);
    try {
      await updateManagementReview(token, evidenceUrlModal._id, {
        ...(evidenceUrlForm.minutesEvidenceUrl.trim()
          ? { minutesEvidenceUrl: evidenceUrlForm.minutesEvidenceUrl.trim() }
          : { minutesEvidenceUrl: '' }),
        ...(evidenceUrlForm.reportTitle.trim()
          ? { reportTitle: evidenceUrlForm.reportTitle.trim() }
          : { reportTitle: '' }),
      });
      setEvidenceUrlModal(null);
      await refresh();
      setBanner('Evidencia guardada.');
    } catch (err) {
      setBanner(`Error: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const goToFindingAction = (findingId: string) => {
    const action = FINDING_ACTION[findingId];
    if (action) setActiveTab(action.tab);
  };

  const documentLabel = (documents: DocumentMasterItem[], documentId?: string): string => {
    if (!documentId) return '—';
    const d = documents.find((x) => x._id === documentId);
    return d ? `${d.code} — ${d.name}` : documentId;
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/check"
        backLabel="← Volver a Verificación"
        moduleCode="6.1.3"
        moduleTitle="Revisión por la dirección"
        description="Revisión estructurada del SG-SST por la alta dirección: entradas de información, análisis, decisiones y evidencia."
        statusBadge={statusBadge}
        actions={writable
          ? [{ label: '🔄 Recargar', onClick: () => { void refresh(); }, variant: 'secondary' as const }]
          : []}
        lastSaved={compliance ? `Porcentaje oficial: ${percentage ?? 0}%` : undefined}
      />

      {banner ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <span>{banner}</span>{' '}
          <Button variant="ghost" onClick={() => setBanner(null)}>✕</Button>
        </div>
      ) : null}

      <AdvancedKpiGrid
        items={[
          {
            label: 'Cumplimiento oficial 6.1.3',
            value: loading ? '…' : status === 'NO_DATA' ? 'Sin datos' : percentage === null ? 'N/D' : `${percentage}%`,
            variant: status === 'TARGET_MET' ? 'success' : status === 'NO_DATA' || compliance === null ? 'warning' : 'danger',
          },
          {
            label: 'Revisiones evaluables',
            value: counters ? counters.reviewsEvaluable : loading ? '…' : fallbackEvaluable,
            variant: 'info',
          },
          {
            label: 'Decisiones abiertas',
            value: counters ? counters.decisionsPending + counters.decisionsInProgress : loading ? '…' : fallbackPendingDecisions,
            variant: 'warning',
          },
          {
            label: 'Decisiones vencidas',
            value: counters ? counters.decisionsOverdue : loading ? '…' : fallbackOverdueDecisions,
            variant: 'danger',
          },
        ]}
        columns={4}
      />

      <div className="flex gap-6">
        <AdvancedTabsSidebar items={TABS} activeId={activeTab} onSelect={setActiveTab} />
        <AdvancedTabsContent>
          {error ? <p>⚠️ {error}</p> : null}

          {/* ══════════════ RESUMEN ══════════════ */}
          {activeTab === 'resumen' && (
            <AdvancedSection
              title="Cumplimiento oficial — 6.1.3"
              description="Fuente única: ComplianceEngine (dimensions:v1). El frontend no recalcula."
            >
              {loading ? (
                <p>Cargando…</p>
              ) : compliance === null ? (
                <p>El resultado de cumplimiento no está disponible en este momento.</p>
              ) : (
                <>
                  <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div className="card">
                      <strong>
                        {status === 'NO_DATA'
                          ? metadata?.noDataReason === 'no-reviews'
                            ? 'Sin datos evaluables — todavía no existen revisiones registradas.'
                            : 'Sin revisiones evaluables — existen registros, pero ninguno cumple las condiciones mínimas (COMPLETED + fechas reales + acta/evidencia + contenido de análisis o decisiones).'
                          : `${percentage ?? 0}%`}
                      </strong>
                      <p style={{ margin: 0 }}>
                        Estado: {status ?? '—'} · Nivel: {compliance.level} ·{' '}
                        Período evaluado: {metadata?.evaluatedPeriod ?? '—'}
                      </p>
                    </div>
                    {metadata?.latestReview ? (
                      <div className="card">
                        <strong>
                          {metadata.latestReview.reviewCode ? `${metadata.latestReview.reviewCode} — ` : ''}
                          {metadata.latestReview.title ?? 'Última revisión evaluable'}
                        </strong>
                        <p style={{ margin: 0 }}>
                          Última revisión evaluable · Estado: {metadata.latestReview.status ?? '—'} ·{' '}
                          Fin: {formatDate(metadata.latestReview.actualEndDate)}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {metadata ? (
                    <>
                      <h4>Dimensiones oficiales</h4>
                      <Table>
                        <thead>
                          <tr>
                            <th>Dimensión</th><th>%</th><th>Peso</th><th>Numerador</th><th>Denominador</th><th>Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MANAGEMENT_REVIEW_DIMENSION_KEYS.map((key) => {
                            const dim = metadata.dimensions[key];
                            const pct = managementReviewRatioToPercent(dim?.ratio);
                            const details = dim && typeof dim === 'object' ? (dim as Record<string, unknown>) : null;
                            const detailText = details
                              ? Object.entries(details)
                                  .filter(([k, v]) => !['ratio', 'numerator', 'denominator', 'weight'].includes(k) && v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && typeof v !== 'object')
                                  .map(([k, v]) => `${k}: ${String(v)}`)
                                  .join(' · ')
                              : '';
                            return (
                              <tr key={key}>
                                <td>{MANAGEMENT_REVIEW_DIMENSION_LABELS[key]}</td>
                                <td>{pct === null ? 'No evaluable' : `${pct}%`}</td>
                                <td>{dim?.weight ?? MANAGEMENT_REVIEW_DIMENSION_WEIGHT_FALLBACK[key]}%</td>
                                <td>{dim?.numerator ?? '—'}</td>
                                <td>{dim?.denominator ?? '—'}</td>
                                <td>{detailText || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </>
                  ) : (
                    <p className="muted">⚠️ El detalle de dimensiones no está disponible; el porcentaje oficial se mantiene.</p>
                  )}

                  <h4>Hallazgos ({findings.length})</h4>
                  {findings.length === 0 ? (
                    <p>Sin hallazgos para este módulo.</p>
                  ) : (
                    <ul>
                      {findings.map((f) => {
                        const action = FINDING_ACTION[f.id];
                        return (
                          <li key={f.id} style={{ marginBottom: '.5rem' }}>
                            <strong>{f.title}</strong>{' '}
                            <span className={`badge ${f.priority === 'HIGH' ? 'badge--danger' : f.priority === 'MEDIUM' ? 'badge--warning' : 'badge--info'}`}>
                              {f.priority}
                            </span>
                            <div>{f.description}</div>
                            {action ? (
                              <Button variant="secondary" onClick={() => goToFindingAction(f.id)}>{action.label}</Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ REVISIONES ══════════════ */}
          {activeTab === 'revisiones' && (
            <AdvancedSection
              title="Revisiones"
              description={`Registradas: ${reviews.length} · Mostradas: ${filteredReviews.length}`}
            >
              {writable ? (
                <div style={{ marginBottom: '.75rem' }}>
                  <Button onClick={openCreateForm}>+ Nueva revisión</Button>
                </div>
              ) : null}

              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Estado">
                  <option value="">Todos los estados</option>
                  {(Object.keys(MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS) as ManagementReviewDirectionStatus[]).map((s) => (
                    <option key={s} value={s}>{MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Tipo">
                  <option value="">Todos los tipos</option>
                  {(Object.keys(MANAGEMENT_REVIEW_TYPE_LABELS) as ManagementReviewType[]).map((t) => (
                    <option key={t} value={t}>{MANAGEMENT_REVIEW_TYPE_LABELS[t]}</option>
                  ))}
                </Select>
                <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} aria-label="Desde" />
                <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} aria-label="Hasta" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código o título…"
                  aria-label="Búsqueda"
                />
              </div>

              <Table>
                <thead>
                  <tr>
                    <th>Código</th><th>Título</th><th>Tipo</th><th>Planificada</th><th>Responsable</th><th>Estado</th>
                    <th>Fecha real</th><th>Decisiones</th><th>Evidencia</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReviews.length === 0 ? (
                    <tr><td colSpan={10}>{reviews.length === 0 ? 'Sin revisiones registradas.' : 'Sin resultados para los filtros aplicados.'}</td></tr>
                  ) : (
                    filteredReviews.map((r) => {
                      const overdue = r.decisions.filter((d) => isManagementReviewDecisionOverdue(d)).length;
                      const hasMinutes = Boolean(r.minutesDocumentId || r.minutesEvidenceUrl || r.reportTitle);
                      return (
                        <tr key={r._id}>
                          <td>{r.reviewCode || '—'}</td>
                          <td>{r.title}</td>
                          <td>{MANAGEMENT_REVIEW_TYPE_LABELS[r.reviewType]}</td>
                          <td>{formatDate(r.plannedDate)}</td>
                          <td>{r.responsibleNameSnapshot || userName(users, r.responsibleUserId)}</td>
                          <td><span className={`badge ${STATUS_VARIANTS[r.status]}`}>{MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[r.status]}</span></td>
                          <td>{formatDate(r.actualStartDate)} → {formatDate(r.actualEndDate)}</td>
                          <td>
                            {r.decisions.length}
                            {overdue > 0 ? <span className="badge badge--danger" style={{ marginLeft: 4 }}>{overdue} venc.</span> : null}
                          </td>
                          <td>{hasMinutes ? <span className="badge badge--success">✓ acta</span> : <span className="badge badge--warning">sin acta</span>}</td>
                          <td>
                            <div className="actions">
                              <Button variant="ghost" onClick={() => setDetailReview(r)}>Ver</Button>
                              {writable && CONTENT_EDITABLE.includes(r.status) ? (
                                <Button variant="secondary" onClick={() => openEditForm(r)}>Editar</Button>
                              ) : null}
                              {writable && MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS[r.status].map((next) => (
                                <Button
                                  key={next}
                                  variant={next === 'CANCELLED' ? 'danger' : 'secondary'}
                                  onClick={() => openStatusModal(r, next)}
                                >
                                  {TRANSITION_LABELS[next] ?? MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[next]}
                                </Button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </AdvancedSection>
          )}

          {/* ══════════════ ENTRADAS ══════════════ */}
          {activeTab === 'entradas' && (
            <AdvancedSection
              title="Entradas de la revisión"
              description="Información que recibió y revisó la alta dirección (referencias declarativas a otros dominios; sin recálculo)."
            >
              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={selectedReviewId} onChange={(e) => setSelectedReviewId(e.target.value)} aria-label="Revisión">
                  <option value="">— Selecciona una revisión —</option>
                  {sortedReviews.map((r) => (
                    <option key={r._id} value={r._id}>
                      {(r.reviewCode ? `${r.reviewCode} — ` : '') + r.title} ({MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[r.status]})
                    </option>
                  ))}
                </Select>
                {writable && selectedReview && CONTENT_EDITABLE.includes(selectedReview.status) ? (
                  <Button onClick={() => openCreateInput(selectedReview._id)}>+ Nueva entrada</Button>
                ) : null}
              </div>

              {!selectedReview ? (
                <p className="muted">Selecciona una revisión para gestionar sus entradas.</p>
              ) : selectedReview.inputs.length === 0 ? (
                <p>Sin entradas registradas para esta revisión.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Tipo</th><th>Título</th><th>Descripción</th><th>Origen</th><th>Período</th>
                      <th>Estado</th><th>Evidencia</th><th>Observaciones</th>{writable ? <th>Acciones</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReview.inputs.map((input) => (
                      <tr key={input._id}>
                        <td>{MANAGEMENT_REVIEW_INPUT_TYPE_LABELS[input.type]}</td>
                        <td>{input.title}</td>
                        <td>{input.description || '—'}</td>
                        <td>
                          {input.sourceModule
                            ? `${input.sourceModule}${input.sourceEntityId ? ` · ${input.sourceEntityId}` : ''}`
                            : '—'}
                        </td>
                        <td>{input.referencePeriod || '—'}</td>
                        <td><span className={`badge ${INPUT_STATUS_VARIANTS[input.status]}`}>{MANAGEMENT_REVIEW_INPUT_STATUS_LABELS[input.status]}</span></td>
                        <td>
                          {input.evidenceDocumentId
                            ? `📄 ${documentLabel(documents, input.evidenceDocumentId)}`
                            : input.evidenceUrl
                              ? <a href={input.evidenceUrl} target="_blank" rel="noreferrer">🔗 Enlace</a>
                              : '—'}
                        </td>
                        <td>{input.observations || '—'}</td>
                        {writable ? (
                          <td>
                            <div className="actions">
                              {CONTENT_EDITABLE.includes(selectedReview.status) ? (
                                <>
                                  <Button variant="ghost" onClick={() => openEditInput(selectedReview._id, input)}>Editar</Button>
                                  {input.status === 'PENDING' ? (
                                    <Button variant="secondary" disabled={saving} onClick={() => void handleMarkInputReviewed(selectedReview._id, input)}>
                                      Marcar revisada
                                    </Button>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ ANÁLISIS ══════════════ */}
          {activeTab === 'analisis' && (
            <AdvancedSection
              title="Análisis de la dirección"
              description="Interpretación y conclusiones de la alta dirección (no genera hallazgos ni score local)."
            >
              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={selectedReviewId} onChange={(e) => setSelectedReviewId(e.target.value)} aria-label="Revisión">
                  <option value="">— Selecciona una revisión —</option>
                  {sortedReviews.map((r) => (
                    <option key={r._id} value={r._id}>
                      {(r.reviewCode ? `${r.reviewCode} — ` : '') + r.title} ({MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[r.status]})
                    </option>
                  ))}
                </Select>
                {writable && selectedReview && CONTENT_EDITABLE.includes(selectedReview.status) ? (
                  <Button onClick={() => openAnalysisModal(selectedReview)}>Editar análisis</Button>
                ) : null}
              </div>

              {!selectedReview ? (
                <p className="muted">Selecciona una revisión para ver su análisis.</p>
              ) : (
                <div className="card">
                  <h4 style={{ marginTop: 0 }}>Resumen</h4>
                  <p>{selectedReview.analysis?.summary || '—'}</p>
                  <h4>Fortalezas</h4>
                  {(selectedReview.analysis?.strengths?.length ?? 0) === 0 ? (
                    <p className="muted">Sin registros.</p>
                  ) : (
                    <ul>{selectedReview.analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  )}
                  <h4>Brechas</h4>
                  {(selectedReview.analysis?.gaps?.length ?? 0) === 0 ? (
                    <p className="muted">Sin registros.</p>
                  ) : (
                    <ul>{selectedReview.analysis.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  )}
                  <h4>Prioridades</h4>
                  {(selectedReview.analysis?.priorities?.length ?? 0) === 0 ? (
                    <p className="muted">Sin registros.</p>
                  ) : (
                    <ul>{selectedReview.analysis.priorities.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  )}
                  <h4>Observaciones de la dirección</h4>
                  <p>{selectedReview.analysis?.managementObservations || '—'}</p>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ DECISIONES ══════════════ */}
          {activeTab === 'decisiones' && (
            <AdvancedSection
              title="Decisiones y acciones de dirección"
              description="Decisiones propias de la revisión (no son compromisos de rendición de cuentas). El vencimiento se deriva solo para presentación."
            >
              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={selectedReviewId} onChange={(e) => setSelectedReviewId(e.target.value)} aria-label="Revisión">
                  <option value="">— Selecciona una revisión —</option>
                  {sortedReviews.map((r) => (
                    <option key={r._id} value={r._id}>
                      {(r.reviewCode ? `${r.reviewCode} — ` : '') + r.title} ({MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[r.status]})
                    </option>
                  ))}
                </Select>
                {writable && selectedReview && CONTENT_EDITABLE.includes(selectedReview.status) ? (
                  <Button onClick={() => openCreateDecision(selectedReview._id)}>+ Nueva decisión</Button>
                ) : null}
              </div>

              {!selectedReview ? (
                <p className="muted">Selecciona una revisión para gestionar sus decisiones.</p>
              ) : selectedReview.decisions.length === 0 ? (
                <p>Sin decisiones registradas para esta revisión.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Descripción</th><th>Categoría</th><th>Responsable</th><th>Fecha límite</th>
                      <th>Estado</th><th>Recursos</th><th>Evidencia</th>{writable ? <th>Acciones</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReview.decisions.map((decision) => {
                      const overdue = isManagementReviewDecisionOverdue(decision);
                      return (
                        <tr key={decision._id}>
                          <td>{decision.description}</td>
                          <td>{MANAGEMENT_REVIEW_DECISION_CATEGORY_LABELS[decision.category]}</td>
                          <td>{decision.responsibleNameSnapshot || userName(users, decision.responsibleUserId)}</td>
                          <td>
                            {formatDate(decision.dueDate)}
                            {overdue ? <span className="badge badge--danger" style={{ marginLeft: 4 }}>Vencida</span> : null}
                          </td>
                          <td>
                            <span className={`badge ${DECISION_STATUS_VARIANTS[decision.status]}`}>
                              {MANAGEMENT_REVIEW_DECISION_STATUS_LABELS[decision.status]}
                            </span>
                          </td>
                          <td>{decision.resourcesRequired || '—'}</td>
                          <td>
                            {decision.evidenceUrl ? <a href={decision.evidenceUrl} target="_blank" rel="noreferrer">🔗 Enlace</a> : '—'}
                            {decision.observations ? <div className="muted">{decision.observations}</div> : null}
                          </td>
                          {writable ? (
                            <td>
                              <div className="actions">
                                {CONTENT_EDITABLE.includes(selectedReview.status) ? (
                                  <>
                                    <Button variant="ghost" onClick={() => openEditDecision(selectedReview._id, decision)}>Editar</Button>
                                    {decision.status === 'PENDING' ? (
                                      <Button variant="secondary" disabled={saving} onClick={() => void handleQuickDecisionStatus(selectedReview._id, decision, 'IN_PROGRESS')}>
                                        En progreso
                                      </Button>
                                    ) : null}
                                    {decision.status === 'PENDING' || decision.status === 'IN_PROGRESS' ? (
                                      <Button variant="secondary" disabled={saving} onClick={() => void handleQuickDecisionStatus(selectedReview._id, decision, 'COMPLETED')}>
                                        Completar
                                      </Button>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </AdvancedSection>
          )}

          {/* ══════════════ EVIDENCIA E HISTORIAL ══════════════ */}
          {activeTab === 'evidencia' && (
            <AdvancedSection
              title="Evidencia e historial"
              description="Acta/informe de la revisión (DocumentMaster es evidencia, no una segunda fuente de score) e historial append-only."
            >
              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '.75rem' }}>
                <Select value={selectedReviewId} onChange={(e) => setSelectedReviewId(e.target.value)} aria-label="Revisión">
                  <option value="">— Selecciona una revisión —</option>
                  {sortedReviews.map((r) => (
                    <option key={r._id} value={r._id}>
                      {(r.reviewCode ? `${r.reviewCode} — ` : '') + r.title} ({MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[r.status]})
                    </option>
                  ))}
                </Select>
                {writable && selectedReview && CONTENT_EDITABLE.includes(selectedReview.status) ? (
                  <>
                    <Button onClick={() => openMinutesModal(selectedReview)}>Adjuntar acta (documento)</Button>
                    <Button variant="secondary" onClick={() => openEvidenceUrlModal(selectedReview)}>URL / título del informe</Button>
                  </>
                ) : null}
              </div>

              {!selectedReview ? (
                <p className="muted">Selecciona una revisión para ver su evidencia e historial.</p>
              ) : (
                <>
                  <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div className="card">
                      <strong>Documento del acta</strong>
                      <p style={{ margin: 0 }}>
                        {selectedReview.minutesDocumentId
                          ? `📄 ${documentLabel(documents, selectedReview.minutesDocumentId)}`
                          : '— sin documento adjunto —'}
                      </p>
                    </div>
                    <div className="card">
                      <strong>URL de evidencia</strong>
                      <p style={{ margin: 0 }}>
                        {selectedReview.minutesEvidenceUrl
                          ? <a href={selectedReview.minutesEvidenceUrl} target="_blank" rel="noreferrer">🔗 {selectedReview.minutesEvidenceUrl}</a>
                          : '—'}
                      </p>
                    </div>
                    <div className="card">
                      <strong>Título del informe/acta</strong>
                      <p style={{ margin: 0 }}>{selectedReview.reportTitle || '—'}</p>
                    </div>
                  </div>

                  <h4>Historial (append-only, solo lectura)</h4>
                  {historyLoading ? (
                    <p>Cargando historial…</p>
                  ) : history.length === 0 ? (
                    <p>Sin eventos de historial para esta revisión.</p>
                  ) : (
                    <Table>
                      <thead>
                        <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Comentario</th></tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h._id}>
                            <td>{formatDate(h.createdAt)}</td>
                            <td>{h.userEmail}</td>
                            <td>
                              <span className="badge badge--info">
                                {MANAGEMENT_REVIEW_HISTORY_ACTION_LABELS[h.action] ?? h.action}
                              </span>
                            </td>
                            <td>{h.comment || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </>
              )}
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* ══════════════ MODAL: CREAR/EDITAR REVISIÓN ══════════════ */}
      {formModal ? (
        <Modal
          isOpen
          title={formModal.mode === 'create' ? 'Nueva revisión por la dirección' : 'Editar revisión'}
          onClose={() => setFormModal(null)}
        >
          {formError ? <p style={{ color: '#b91c1c' }}>⚠️ {formError}</p> : null}
          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            <label>Código (opcional)<Input value={form.reviewCode} onChange={(e) => setForm({ ...form, reviewCode: e.target.value })} maxLength={100} /></label>
            <label>Título *<Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={300} /></label>
            <label>Tipo
              <Select value={form.reviewType} onChange={(e) => setForm({ ...form, reviewType: e.target.value as ManagementReviewType })}>
                {(Object.keys(MANAGEMENT_REVIEW_TYPE_LABELS) as ManagementReviewType[]).map((t) => (
                  <option key={t} value={t}>{MANAGEMENT_REVIEW_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </label>
            <label>Fecha planificada *<Input type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} /></label>
            <label>Lugar<Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={300} /></label>
            <label>Responsable
              <Select value={form.responsibleUserId} onChange={(e) => handleFormResponsibleChange(e.target.value)}>
                <option value="">— Sin responsable —</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>
                ))}
              </Select>
            </label>
          </div>
          <label>Alcance<textarea className="input" rows={2} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} maxLength={2000} /></label>
          <label>Objetivos<textarea className="input" rows={2} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} maxLength={2000} /></label>

          <h4>Participantes</h4>
          {form.participants.length === 0 ? (
            <p className="muted">Sin participantes registrados.</p>
          ) : (
            form.participants.map((p, index) => (
              <div key={index} className="flex gap-6" style={{ flexWrap: 'wrap', alignItems: 'end', marginBottom: '.5rem' }}>
                <label>Usuario
                  <Select value={p.userId} onChange={(e) => handleParticipantUserChange(index, e.target.value)}>
                    <option value="">— Solo nombre manual —</option>
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>
                    ))}
                  </Select>
                </label>
                <label>Nombre
                  <Input
                    value={p.nameSnapshot}
                    onChange={(e) => {
                      const participants = [...form.participants];
                      participants[index] = { ...p, nameSnapshot: e.target.value };
                      setForm({ ...form, participants });
                    }}
                    maxLength={300}
                  />
                </label>
                <label>Rol
                  <Input
                    value={p.role}
                    onChange={(e) => {
                      const participants = [...form.participants];
                      participants[index] = { ...p, role: e.target.value };
                      setForm({ ...form, participants });
                    }}
                    maxLength={300}
                  />
                </label>
                <label>Asistencia
                  <Select
                    value={p.attendance}
                    onChange={(e) => {
                      const participants = [...form.participants];
                      participants[index] = { ...p, attendance: e.target.value as ManagementReviewAttendance };
                      setForm({ ...form, participants });
                    }}
                  >
                    {(Object.keys(MANAGEMENT_REVIEW_ATTENDANCE_LABELS) as ManagementReviewAttendance[]).map((a) => (
                      <option key={a} value={a}>{MANAGEMENT_REVIEW_ATTENDANCE_LABELS[a]}</option>
                    ))}
                  </Select>
                </label>
                <Button variant="danger" onClick={() => setForm({ ...form, participants: form.participants.filter((_, i) => i !== index) })}>
                  Quitar
                </Button>
              </div>
            ))
          )}
          <Button variant="secondary" onClick={() => setForm({ ...form, participants: [...form.participants, { userId: '', nameSnapshot: '', role: '', attendance: 'ATTENDED' }] })}>
            + Agregar participante
          </Button>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <Button disabled={saving} onClick={() => void handleSaveReview()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setFormModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {/* ══════════════ MODAL: DETALLE ══════════════ */}
      {detailReview ? (
        <Modal isOpen title={`Revisión ${detailReview.reviewCode || ''}`.trim()} onClose={() => setDetailReview(null)}>
          <p><strong>{detailReview.title}</strong></p>
          <p>
            Estado: {MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[detailReview.status]} · Tipo: {MANAGEMENT_REVIEW_TYPE_LABELS[detailReview.reviewType]}<br />
            Planificada: {formatDate(detailReview.plannedDate)} · Lugar: {detailReview.location || '—'}<br />
            Ejecución: {formatDate(detailReview.actualStartDate)} → {formatDate(detailReview.actualEndDate)}<br />
            Responsable: {detailReview.responsibleNameSnapshot || userName(users, detailReview.responsibleUserId)}<br />
            Alcance: {detailReview.scope || '—'}<br />
            Objetivos: {detailReview.objectives || '—'}<br />
            Entradas: {detailReview.inputs.length} · Decisiones: {detailReview.decisions.length}<br />
            Acta: {detailReview.minutesDocumentId ? documentLabel(documents, detailReview.minutesDocumentId) : detailReview.minutesEvidenceUrl || detailReview.reportTitle || '—'}
          </p>
          <h4>Participantes ({detailReview.participants.length})</h4>
          {detailReview.participants.length === 0 ? (
            <p className="muted">Sin participantes registrados.</p>
          ) : (
            <ul>
              {detailReview.participants.map((p) => (
                <li key={p._id}>
                  {p.nameSnapshot}
                  {p.role ? ` — ${p.role}` : ''} · {MANAGEMENT_REVIEW_ATTENDANCE_LABELS[p.attendance]}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}

      {/* ══════════════ MODAL: TRANSICIÓN DE ESTADO ══════════════ */}
      {statusModal ? (
        <Modal
          isOpen
          title={`${TRANSITION_LABELS[statusModal.next] ?? 'Cambiar estado'} → ${MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[statusModal.next]}`}
          onClose={() => setStatusModal(null)}
        >
          <p className="muted">
            Revisión: {statusModal.review.reviewCode ? `${statusModal.review.reviewCode} — ` : ''}
            {statusModal.review.title} · Estado actual: {MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS[statusModal.review.status]}
          </p>
          {statusModal.next === 'COMPLETED' ? (
            <p className="muted">⚠️ El backend exige: fechas reales de inicio y fin, acta/evidencia y contenido mínimo de análisis o decisiones.</p>
          ) : null}
          {statusModal.next === 'PLANNED' ? (
            <>
              <label>Fecha planificada *<Input type="date" value={statusPlannedDate} onChange={(e) => setStatusPlannedDate(e.target.value)} /></label>
              <label>Responsable *
                <Select value={statusResponsibleUserId} onChange={(e) => setStatusResponsibleUserId(e.target.value)}>
                  <option value="">— Sin responsable —</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>
                  ))}
                </Select>
              </label>
            </>
          ) : null}
          {statusModal.next === 'IN_PROGRESS' ? (
            <label>Fecha real de inicio *<Input type="date" value={statusActualStartDate} onChange={(e) => setStatusActualStartDate(e.target.value)} /></label>
          ) : null}
          {statusModal.next === 'COMPLETED' ? (
            <label>Fecha real de fin *<Input type="date" value={statusActualEndDate} onChange={(e) => setStatusActualEndDate(e.target.value)} /></label>
          ) : null}
          <label>Comentario (opcional)<Input value={statusComment} onChange={(e) => setStatusComment(e.target.value)} maxLength={500} /></label>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <Button
              variant={statusModal.next === 'CANCELLED' ? 'danger' : 'primary'}
              disabled={saving}
              onClick={() => void handleStatusChange()}
            >
              {saving ? 'Aplicando…' : 'Confirmar'}
            </Button>
            <Button variant="ghost" onClick={() => setStatusModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {/* ══════════════ MODAL: ENTRADA ══════════════ */}
      {inputModal ? (
        <Modal
          isOpen
          title={inputModal.mode === 'create' ? 'Nueva entrada de información' : 'Editar entrada'}
          onClose={() => setInputModal(null)}
        >
          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            <label>Tipo
              <Select value={inputForm.type} onChange={(e) => setInputForm({ ...inputForm, type: e.target.value as ManagementReviewInputType })}>
                {(Object.keys(MANAGEMENT_REVIEW_INPUT_TYPE_LABELS) as ManagementReviewInputType[]).map((t) => (
                  <option key={t} value={t}>{MANAGEMENT_REVIEW_INPUT_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </label>
            <label>Título *<Input value={inputForm.title} onChange={(e) => setInputForm({ ...inputForm, title: e.target.value })} maxLength={300} /></label>
            <label>Estado
              <Select value={inputForm.status} onChange={(e) => setInputForm({ ...inputForm, status: e.target.value as ManagementReviewInputStatus })}>
                {(Object.keys(MANAGEMENT_REVIEW_INPUT_STATUS_LABELS) as ManagementReviewInputStatus[]).map((s) => (
                  <option key={s} value={s}>{MANAGEMENT_REVIEW_INPUT_STATUS_LABELS[s]}</option>
                ))}
              </Select>
            </label>
            <label>Período de referencia<Input value={inputForm.referencePeriod} onChange={(e) => setInputForm({ ...inputForm, referencePeriod: e.target.value })} placeholder="p. ej. 2026-T1" maxLength={100} /></label>
          </div>
          <label>Descripción<textarea className="input" rows={2} value={inputForm.description} onChange={(e) => setInputForm({ ...inputForm, description: e.target.value })} maxLength={2000} /></label>
          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            <label>Módulo origen (trazabilidad declarativa)<Input value={inputForm.sourceModule} onChange={(e) => setInputForm({ ...inputForm, sourceModule: e.target.value })} placeholder="p. ej. annual-audit" maxLength={100} /></label>
            <label>Id de la entidad origen<Input value={inputForm.sourceEntityId} onChange={(e) => setInputForm({ ...inputForm, sourceEntityId: e.target.value })} maxLength={100} /></label>
          </div>
          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            <label>Documento de evidencia
              <Select value={inputForm.evidenceDocumentId} onChange={(e) => setInputForm({ ...inputForm, evidenceDocumentId: e.target.value })}>
                <option value="">— Sin documento —</option>
                {documents.map((d) => (
                  <option key={d._id} value={d._id}>{d.code} — {d.name}</option>
                ))}
              </Select>
            </label>
            <label>URL de evidencia<Input value={inputForm.evidenceUrl} onChange={(e) => setInputForm({ ...inputForm, evidenceUrl: e.target.value })} maxLength={500} /></label>
          </div>
          <label>Observaciones<textarea className="input" rows={2} value={inputForm.observations} onChange={(e) => setInputForm({ ...inputForm, observations: e.target.value })} maxLength={2000} /></label>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <Button disabled={saving} onClick={() => void handleSaveInput()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setInputModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {/* ══════════════ MODAL: ANÁLISIS ══════════════ */}
      {analysisModal ? (
        <Modal isOpen title="Análisis de la dirección" onClose={() => setAnalysisModal(null)}>
          <p className="muted">Las listas se registran con una línea por elemento.</p>
          <label>Resumen<textarea className="input" rows={3} value={analysisForm.summary} onChange={(e) => setAnalysisForm({ ...analysisForm, summary: e.target.value })} maxLength={2000} /></label>
          <label>Fortalezas<textarea className="input" rows={3} value={analysisForm.strengths} onChange={(e) => setAnalysisForm({ ...analysisForm, strengths: e.target.value })} maxLength={2000} /></label>
          <label>Brechas<textarea className="input" rows={3} value={analysisForm.gaps} onChange={(e) => setAnalysisForm({ ...analysisForm, gaps: e.target.value })} maxLength={2000} /></label>
          <label>Prioridades<textarea className="input" rows={3} value={analysisForm.priorities} onChange={(e) => setAnalysisForm({ ...analysisForm, priorities: e.target.value })} maxLength={2000} /></label>
          <label>Observaciones de la dirección<textarea className="input" rows={3} value={analysisForm.managementObservations} onChange={(e) => setAnalysisForm({ ...analysisForm, managementObservations: e.target.value })} maxLength={2000} /></label>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <Button disabled={saving} onClick={() => void handleSaveAnalysis()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setAnalysisModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {/* ══════════════ MODAL: DECISIÓN ══════════════ */}
      {decisionModal ? (
        <Modal
          isOpen
          title={decisionModal.mode === 'create' ? 'Nueva decisión de dirección' : 'Editar decisión'}
          onClose={() => setDecisionModal(null)}
        >
          <label>Descripción *<textarea className="input" rows={2} value={decisionForm.description} onChange={(e) => setDecisionForm({ ...decisionForm, description: e.target.value })} maxLength={2000} /></label>
          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            <label>Categoría
              <Select value={decisionForm.category} onChange={(e) => setDecisionForm({ ...decisionForm, category: e.target.value as ManagementReviewDecisionCategory })}>
                {(Object.keys(MANAGEMENT_REVIEW_DECISION_CATEGORY_LABELS) as ManagementReviewDecisionCategory[]).map((c) => (
                  <option key={c} value={c}>{MANAGEMENT_REVIEW_DECISION_CATEGORY_LABELS[c]}</option>
                ))}
              </Select>
            </label>
            <label>Estado
              <Select value={decisionForm.status} onChange={(e) => setDecisionForm({ ...decisionForm, status: e.target.value as ManagementReviewDecisionStatus })}>
                {(Object.keys(MANAGEMENT_REVIEW_DECISION_STATUS_LABELS) as ManagementReviewDecisionStatus[]).map((s) => (
                  <option key={s} value={s}>{MANAGEMENT_REVIEW_DECISION_STATUS_LABELS[s]}</option>
                ))}
              </Select>
            </label>
            <label>Fecha límite<Input type="date" value={decisionForm.dueDate} onChange={(e) => setDecisionForm({ ...decisionForm, dueDate: e.target.value })} /></label>
          </div>
          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            <label>Responsable
              <Select value={decisionForm.responsibleUserId} onChange={(e) => handleDecisionUserChange(e.target.value)}>
                <option value="">— Sin responsable —</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</option>
                ))}
              </Select>
            </label>
            <label>Nombre del responsable
              <Input value={decisionForm.responsibleNameSnapshot} onChange={(e) => setDecisionForm({ ...decisionForm, responsibleNameSnapshot: e.target.value })} maxLength={300} />
            </label>
          </div>
          <label>Recursos requeridos<textarea className="input" rows={2} value={decisionForm.resourcesRequired} onChange={(e) => setDecisionForm({ ...decisionForm, resourcesRequired: e.target.value })} maxLength={2000} /></label>
          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            <label>URL de evidencia<Input value={decisionForm.evidenceUrl} onChange={(e) => setDecisionForm({ ...decisionForm, evidenceUrl: e.target.value })} maxLength={500} /></label>
            <label>Observaciones<Input value={decisionForm.observations} onChange={(e) => setDecisionForm({ ...decisionForm, observations: e.target.value })} maxLength={2000} /></label>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <Button disabled={saving} onClick={() => void handleSaveDecision()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setDecisionModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {/* ══════════════ MODAL: ADJUNTAR ACTA ══════════════ */}
      {minutesModal ? (
        <Modal isOpen title="Adjuntar acta (documento)" onClose={() => setMinutesModal(null)}>
          <p className="muted">
            Revisión: {minutesModal.reviewCode ? `${minutesModal.reviewCode} — ` : ''}{minutesModal.title}
          </p>
          <label>Documento del acta *
            <Select value={minutesDocumentId} onChange={(e) => setMinutesDocumentId(e.target.value)}>
              <option value="">— Selecciona un documento —</option>
              {documents.map((d) => (
                <option key={d._id} value={d._id}>{d.code} — {d.name}</option>
              ))}
            </Select>
          </label>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <Button disabled={saving} onClick={() => void handleAttachMinutes()}>{saving ? 'Adjuntando…' : 'Adjuntar'}</Button>
            <Button variant="ghost" onClick={() => setMinutesModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {/* ══════════════ MODAL: URL / TÍTULO DE INFORME ══════════════ */}
      {evidenceUrlModal ? (
        <Modal isOpen title="Evidencia: URL y título del informe" onClose={() => setEvidenceUrlModal(null)}>
          <label>URL de evidencia<Input value={evidenceUrlForm.minutesEvidenceUrl} onChange={(e) => setEvidenceUrlForm({ ...evidenceUrlForm, minutesEvidenceUrl: e.target.value })} maxLength={500} /></label>
          <label>Título del informe/acta<Input value={evidenceUrlForm.reportTitle} onChange={(e) => setEvidenceUrlForm({ ...evidenceUrlForm, reportTitle: e.target.value })} maxLength={300} /></label>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <Button disabled={saving} onClick={() => void handleSaveEvidenceUrl()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setEvidenceUrlModal(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}
    </AdvancedPageLayout>
  );
}
