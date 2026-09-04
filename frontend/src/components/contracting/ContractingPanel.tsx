import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ContractModel,
  ContractingStatsModel,
  ContractApprovalStatus,
  ContractApprovalResponse,
  ContractApprovalHistoryResponse,
  SupplierModel,
  ContractInductionModel,
  ContractInductionStatus,
  fetchContracts,
  fetchContractingStats,
  createContract,
  updateContract,
  deleteContract,
  fetchSuppliers,
  fetchContractApproval,
  submitContractForApproval,
  approveContract,
  rejectContract,
  fetchContractApprovalHistory,
  requestContractAdjustments,
  fetchContractInductions,
  createContractInduction,
  updateContractInduction,
  deleteContractInduction,
  ContractEvaluationModel,
  fetchContractEvaluations,
  createContractEvaluation,
  updateContractEvaluation,
  deleteContractEvaluation,
  fetchContractEvaluationStats,
  ContractEvaluationStatsModel,
  fetchMyProfile,
  UserModel,
} from '../../api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ApprovalStatusBadge } from '../ui/ApprovalStatusBadge';
import { ApprovalRejectModal } from '../ui/ApprovalRejectModal';
import { ApprovalAdjustmentsModal } from '../ui/ApprovalAdjustmentsModal';

type Props = {
  token: string;
  onComplianceChange?: (status: string) => void;
};

type TabId = 'dashboard' | 'contracts' | 'contractors' | 'inductions' | 'evaluations';

/* ==================== LOCALIZATION MAPS ==================== */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  ACTIVE: '#16a34a',
  CLOSED: '#d97706',
  CANCELLED: '#dc2626',
};

const INDUCTION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  COMPLETED: 'Completada',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
};

const INDUCTION_STATUS_COLORS: Record<string, string> = {
  PENDING: '#d97706',
  COMPLETED: '#16a34a',
  EXPIRED: '#ea580c',
  CANCELLED: '#dc2626',
};

/* ==================== HELPER COMPONENTS ==================== */

function Badge({ value, map, colors }: { value: string; map: Record<string, string>; colors: Record<string, string> }) {
  return (
    <span className="acq-badge" style={{ backgroundColor: colors[value] ?? '#94a3b8' }}>
      {map[value] ?? value}
    </span>
  );
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* Inline dropdown menu */
function RowActions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="acq-more-btn"
        onClick={() => setOpen(!open)}
        aria-label="Más acciones"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="acq-dropdown" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function SkeletonRows({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="acq-skeleton-row">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}><div className="acq-skeleton-line" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ==================== EMPTY PLACEHOLDER TABS ==================== */

function ComingSoonTab({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontSize: '1.5rem', marginBottom: '.5rem' }}>🚧</p>
      <h3 style={{ margin: '0 0 .25rem' }}>{title}</h3>
      <p className="muted">{description}</p>
    </div>
  );
}

/* ==================== CONTRACT FORM ==================== */

type ContractFormState = {
  contractNumber: string;
  title: string;
  description: string;
  contractorId: string;
  contractStart: string;
  contractEnd: string;
  sstRequirements: string;
  observations: string;
};

const emptyForm: ContractFormState = {
  contractNumber: '',
  title: '',
  description: '',
  contractorId: '',
  contractStart: '',
  contractEnd: '',
  sstRequirements: '',
  observations: '',
};

/* ==================== MAIN COMPONENT ==================== */

export function ContractingPanel({ token }: Props) {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [stats, setStats] = useState<ContractingStatsModel | null>(null);
  const [contracts, setContracts] = useState<ContractModel[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // User role
  const [userProfile, setUserProfile] = useState<UserModel | null>(null);
  const role = userProfile?.role ?? 'member';
  const canCreate = role === 'owner' || role === 'admin' || role === 'manager';
  const canDelete = role === 'owner';
  const canDecide = role === 'owner' || role === 'manager';

  // Search & filters
  const [contractSearch, setContractSearch] = useState('');
  const [contractStatusFilter, setContractStatusFilter] = useState('');
  const [contractorSearch, setContractorSearch] = useState('');

  // Modals
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [showEditContract, setShowEditContract] = useState<ContractModel | null>(null);
  const [contractForm, setContractForm] = useState<ContractFormState>(emptyForm);

  // Approval state
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState<ContractModel | null>(null);
  const [showAdjustmentsModal, setShowAdjustmentsModal] = useState<ContractModel | null>(null);
  const [approvalDetail, setApprovalDetail] = useState<ContractApprovalResponse | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<ContractApprovalHistoryResponse | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractModel | null>(null);

  // Inductions state
  const [inductions, setInductions] = useState<ContractInductionModel[]>([]);
  const [inductionSearch, setInductionSearch] = useState('');
  const [inductionStatusFilter, setInductionStatusFilter] = useState('');
  const [showCreateInduction, setShowCreateInduction] = useState(false);
  const [showEditInduction, setShowEditInduction] = useState<ContractInductionModel | null>(null);
  const [inductionForm, setInductionForm] = useState({
    contractId: '',
    contractorId: '',
    workerName: '',
    workerId: '',
    inductionDate: '',
    expirationDate: '',
    score: '',
  });

  // Evaluations state
  const [evaluations, setEvaluations] = useState<ContractEvaluationModel[]>([]);
  const [evaluationStats, setEvaluationStats] = useState<ContractEvaluationStatsModel | null>(null);
  const [evalContractFilter, setEvalContractFilter] = useState('');
  const [evalContractorFilter, setEvalContractorFilter] = useState('');
  const [showCreateEvaluation, setShowCreateEvaluation] = useState(false);
  const [showEditEvaluation, setShowEditEvaluation] = useState<ContractEvaluationModel | null>(null);
  const [evaluationForm, setEvaluationForm] = useState({
    contractId: '',
    contractorId: '',
    evaluationDate: '',
    score: '',
    criteria: '',
    observations: '',
  });

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  /* ==================== DATA LOADING ==================== */

  const loadStats = useCallback(async () => {
    try { setStats(await fetchContractingStats(token)); } catch { /* ignore */ }
  }, [token]);

  const loadContracts = useCallback(async () => {
    try { setContracts(await fetchContracts(token)); } catch { /* ignore */ }
  }, [token]);

  const loadSuppliers = useCallback(async () => {
    try {
      const all = await fetchSuppliers(token);
      setSuppliers(all);
    } catch { /* ignore */ }
  }, [token]);

  const loadInductions = useCallback(async () => {
    try { setInductions(await fetchContractInductions(token)); } catch { /* ignore */ }
  }, [token]);

  const loadEvaluations = useCallback(async () => {
    try { setEvaluations(await fetchContractEvaluations(token)); } catch { /* ignore */ }
  }, [token]);

  const loadEvaluationStats = useCallback(async () => {
    try { setEvaluationStats(await fetchContractEvaluationStats(token)); } catch { /* ignore */ }
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const profile = await fetchMyProfile(token).catch(() => null);
      setUserProfile(profile);
      await Promise.all([loadStats(), loadContracts(), loadSuppliers(), loadInductions(), loadEvaluations(), loadEvaluationStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [token, loadStats, loadContracts, loadSuppliers, loadInductions, loadEvaluations, loadEvaluationStats]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* ==================== FILTERED DATA ==================== */

  const contractors = useMemo(() => suppliers.filter((s) => s.type === 'CONTRACTOR'), [suppliers]);

  const filteredContracts = useMemo(() => {
    let result = contracts;
    if (contractSearch) {
      const q = contractSearch.toLowerCase();
      result = result.filter((c) =>
        c.contractNumber.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
      );
    }
    if (contractStatusFilter) result = result.filter((c) => c.status === contractStatusFilter);
    return result;
  }, [contracts, contractSearch, contractStatusFilter]);

  const filteredContractors = useMemo(() => {
    if (!contractorSearch) return contractors;
    const q = contractorSearch.toLowerCase();
    return contractors.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.legalName && c.legalName.toLowerCase().includes(q)) ||
      (c.taxId && c.taxId.toLowerCase().includes(q))
    );
  }, [contractors, contractorSearch]);

  const filteredInductions = useMemo(() => {
    let result = inductions;
    if (inductionSearch) {
      const q = inductionSearch.toLowerCase();
      result = result.filter((i) => i.workerName.toLowerCase().includes(q));
    }
    if (inductionStatusFilter) result = result.filter((i) => i.status === inductionStatusFilter);
    return result;
  }, [inductions, inductionSearch, inductionStatusFilter]);

  const filteredEvaluations = useMemo(() => {
    let result = evaluations;
    if (evalContractFilter) {
      result = result.filter((e) => {
        const cid = typeof e.contractId === 'object' ? e.contractId._id : e.contractId;
        return cid === evalContractFilter;
      });
    }
    if (evalContractorFilter) {
      result = result.filter((e) => {
        const cid = typeof e.contractorId === 'object' ? e.contractorId._id : e.contractorId;
        return cid === evalContractorFilter;
      });
    }
    return result;
  }, [evaluations, evalContractFilter, evalContractorFilter]);

  /* ==================== CONTRACT CRUD HANDLERS ==================== */

  const handleCreateContract = async () => {
    setSubmitting(true);
    try {
      await createContract(token, {
        contractNumber: contractForm.contractNumber,
        title: contractForm.title,
        description: contractForm.description || undefined,
        contractorId: contractForm.contractorId,
        contractStart: contractForm.contractStart || undefined,
        contractEnd: contractForm.contractEnd || undefined,
        sstRequirements: contractForm.sstRequirements || undefined,
        observations: contractForm.observations || undefined,
      });
      setShowCreateContract(false);
      setContractForm(emptyForm);
      notify('Contrato creado exitosamente');
      await Promise.all([loadContracts(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleUpdateContract = async () => {
    if (!showEditContract) return;
    setSubmitting(true);
    try {
      await updateContract(token, showEditContract._id, {
        contractNumber: contractForm.contractNumber,
        title: contractForm.title,
        description: contractForm.description || undefined,
        contractorId: contractForm.contractorId,
        contractStart: contractForm.contractStart || undefined,
        contractEnd: contractForm.contractEnd || undefined,
        sstRequirements: contractForm.sstRequirements || undefined,
        observations: contractForm.observations || undefined,
      });
      setShowEditContract(null);
      setContractForm(emptyForm);
      notify('Contrato actualizado');
      await Promise.all([loadContracts(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteContract = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este contrato? Esta acción no se puede deshacer.')) return;
    try {
      await deleteContract(token, id);
      notify('Contrato eliminado');
      await Promise.all([loadContracts(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  /* ==================== INDUCTION CRUD HANDLERS ==================== */

  const handleCreateInduction = async () => {
    setSubmitting(true);
    try {
      await createContractInduction(token, {
        contractId: inductionForm.contractId,
        contractorId: inductionForm.contractorId,
        workerName: inductionForm.workerName,
        workerId: inductionForm.workerId || undefined,
        inductionDate: inductionForm.inductionDate || undefined,
        expirationDate: inductionForm.expirationDate || undefined,
        score: inductionForm.score ? Number(inductionForm.score) : undefined,
      });
      setShowCreateInduction(false);
      setInductionForm({ contractId: '', contractorId: '', workerName: '', workerId: '', inductionDate: '', expirationDate: '', score: '' });
      notify('Inducción creada exitosamente');
      await loadInductions();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleUpdateInduction = async () => {
    if (!showEditInduction) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      if (inductionForm.contractId) payload.contractId = inductionForm.contractId;
      if (inductionForm.contractorId) payload.contractorId = inductionForm.contractorId;
      if (inductionForm.workerName) payload.workerName = inductionForm.workerName;
      payload.workerId = inductionForm.workerId || null;
      payload.inductionDate = inductionForm.inductionDate || null;
      payload.expirationDate = inductionForm.expirationDate || null;
      payload.score = inductionForm.score ? Number(inductionForm.score) : null;
      await updateContractInduction(token, showEditInduction._id, payload);
      setShowEditInduction(null);
      setInductionForm({ contractId: '', contractorId: '', workerName: '', workerId: '', inductionDate: '', expirationDate: '', score: '' });
      notify('Inducción actualizada');
      await loadInductions();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteInduction = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta inducción?')) return;
    try {
      await deleteContractInduction(token, id);
      notify('Inducción eliminada');
      await loadInductions();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleMarkCompleted = async (induction: ContractInductionModel) => {
    try {
      await updateContractInduction(token, induction._id, { status: 'COMPLETED', inductionDate: new Date().toISOString() });
      notify(`Inducción de "${induction.workerName}" marcada como completada`);
      await loadInductions();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  const openEditInductionForm = (induction: ContractInductionModel) => {
    setShowEditInduction(induction);
    const contractId = typeof induction.contractId === 'object' ? induction.contractId._id : induction.contractId;
    const contractorId = typeof induction.contractorId === 'object' ? induction.contractorId._id : induction.contractorId;
    setInductionForm({
      contractId: contractId ?? '',
      contractorId: contractorId ?? '',
      workerName: induction.workerName,
      workerId: induction.workerId ?? '',
      inductionDate: induction.inductionDate ? induction.inductionDate.slice(0, 10) : '',
      expirationDate: induction.expirationDate ? induction.expirationDate.slice(0, 10) : '',
      score: induction.score?.toString() ?? '',
    });
  };

  const activeContracts = useMemo(() => contracts.filter((c) => c.status === 'DRAFT' || c.status === 'ACTIVE'), [contracts]);

  /* ==================== EVALUATION HANDLERS ==================== */

  const handleCreateEvaluation = async () => {
    if (!evaluationForm.contractId || !evaluationForm.contractorId || !evaluationForm.evaluationDate || !evaluationForm.score) {
      setError('Contrato, contratista, fecha y score son obligatorios');
      return;
    }
    const scoreNum = Number(evaluationForm.score);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      setError('El score debe ser un número entre 0 y 100');
      return;
    }
    setSubmitting(true);
    try {
      const criteriaArr = evaluationForm.criteria ? evaluationForm.criteria.split(',').map((c) => c.trim()).filter(Boolean) : undefined;
      await createContractEvaluation(token, {
        contractId: evaluationForm.contractId,
        contractorId: evaluationForm.contractorId,
        evaluationDate: evaluationForm.evaluationDate,
        score: scoreNum,
        criteria: criteriaArr,
        observations: evaluationForm.observations || undefined,
      });
      notify('Evaluación creada correctamente');
      setShowCreateEvaluation(false);
      await Promise.all([loadEvaluations(), loadEvaluationStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error creating evaluation'); }
    finally { setSubmitting(false); }
  };

  const handleUpdateEvaluation = async () => {
    if (!showEditEvaluation) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      if (evaluationForm.evaluationDate) payload.evaluationDate = evaluationForm.evaluationDate;
      if (evaluationForm.score !== '') payload.score = Number(evaluationForm.score);
      if (evaluationForm.criteria) payload.criteria = evaluationForm.criteria.split(',').map((c) => c.trim()).filter(Boolean);
      payload.observations = evaluationForm.observations || null;
      await updateContractEvaluation(token, showEditEvaluation._id, payload);
      notify('Evaluación actualizada');
      setShowEditEvaluation(null);
      await Promise.all([loadEvaluations(), loadEvaluationStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error updating evaluation'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteEvaluation = async (id: string) => {
    if (!window.confirm('¿Eliminar esta evaluación?')) return;
    try {
      await deleteContractEvaluation(token, id);
      notify('Evaluación eliminada');
      await Promise.all([loadEvaluations(), loadEvaluationStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error deleting evaluation'); }
  };

  const openEditEvaluationForm = (evaluation: ContractEvaluationModel) => {
    setShowEditEvaluation(evaluation);
    setEvaluationForm({
      contractId: typeof evaluation.contractId === 'object' ? evaluation.contractId._id : evaluation.contractId,
      contractorId: typeof evaluation.contractorId === 'object' ? evaluation.contractorId._id : evaluation.contractorId,
      evaluationDate: evaluation.evaluationDate ? evaluation.evaluationDate.slice(0, 10) : '',
      score: evaluation.score?.toString() ?? '',
      criteria: evaluation.criteria?.join(', ') ?? '',
      observations: evaluation.observations ?? '',
    });
  };

  const SCORE_BADGE: { label: string; color: string }[] = [
    { label: 'Crítico', color: '#dc2626' },
    { label: 'Crítico', color: '#dc2626' },
    { label: 'Crítico', color: '#dc2626' },
    { label: 'Crítico', color: '#dc2626' },
    { label: 'Crítico', color: '#dc2626' },
    { label: 'Requiere atención', color: '#d97706' },
    { label: 'Requiere atención', color: '#d97706' },
    { label: 'Bueno', color: '#2563eb' },
    { label: 'Bueno', color: '#2563eb' },
    { label: 'Excelente', color: '#16a34a' },
    { label: 'Excelente', color: '#16a34a' },
  ];

  const getScoreBadge = (score: number) => {
    const idx = Math.floor(score / 10);
    return SCORE_BADGE[Math.min(idx, 10)];
  };

  /* ==================== APPROVAL HANDLERS ==================== */

  const resolveContractorName = (contract: ContractModel) => {
    if (typeof contract.contractorId === 'object' && contract.contractorId !== null) {
      return (contract.contractorId as SupplierModel).name;
    }
    const supplier = suppliers.find((s) => s._id === String(contract.contractorId));
    return supplier?.name ?? '—';
  };

  const openEditForm = (contract: ContractModel) => {
    setShowEditContract(contract);
    setContractForm({
      contractNumber: contract.contractNumber,
      title: contract.title,
      description: contract.description ?? '',
      contractorId: typeof contract.contractorId === 'object'
        ? (contract.contractorId as SupplierModel)._id
        : (contract.contractorId ?? ''),
      contractStart: contract.contractStart ? contract.contractStart.slice(0, 10) : '',
      contractEnd: contract.contractEnd ? contract.contractEnd.slice(0, 10) : '',
      sstRequirements: contract.sstRequirements ?? '',
      observations: contract.observations ?? '',
    });
  };

  const canSubmitApproval = (contract: ContractModel) => {
    if (!canDecide && role !== 'admin') return false;
    return contract.status === 'DRAFT' && (!contract.approvalStatus || contract.approvalStatus === 'DRAFT' || contract.approvalStatus === 'REJECTED' || contract.approvalStatus === 'ADJUSTMENTS_REQUESTED');
  };

  const canDecideOnContract = (contract: ContractModel) => {
    return canDecide && contract.approvalStatus === 'PENDING_APPROVAL';
  };

  const handleSubmitForApproval = async (contract: ContractModel) => {
    setApprovalLoading(true);
    try {
      await submitContractForApproval(token, contract._id);
      notify(`Contrato ${contract.contractNumber} enviado a aprobación`);
      await Promise.all([loadContracts(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setApprovalLoading(false); }
  };

  const handleApprove = async (contract: ContractModel) => {
    setApprovalLoading(true);
    try {
      await approveContract(token, contract._id);
      notify(`Contrato ${contract.contractNumber} aprobado`);
      setShowRejectModal(null);
      setSelectedContract(null);
      await Promise.all([loadContracts(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setApprovalLoading(false); }
  };

  const handleReject = async (contract: ContractModel, reason: string) => {
    setApprovalLoading(true);
    try {
      await rejectContract(token, contract._id, reason);
      notify(`Contrato ${contract.contractNumber} rechazado`);
      setShowRejectModal(null);
      setSelectedContract(null);
      await Promise.all([loadContracts(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setApprovalLoading(false); }
  };

  const handleRequestAdjustments = async (contract: ContractModel, reason: string) => {
    setApprovalLoading(true);
    try {
      await requestContractAdjustments(token, contract._id, reason);
      notify(`Ajustes solicitados para contrato ${contract.contractNumber}`);
      setShowAdjustmentsModal(null);
      setSelectedContract(null);
      await Promise.all([loadContracts(), loadStats()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setApprovalLoading(false); }
  };

  const loadApprovalDetail = async (contract: ContractModel) => {
    setSelectedContract(contract);
    setApprovalDetail(null);
    setApprovalHistory(null);
    try {
      const [detail, history] = await Promise.all([
        fetchContractApproval(token, contract._id),
        fetchContractApprovalHistory(token, contract._id),
      ]);
      setApprovalDetail(detail);
      setApprovalHistory(history);
    } catch { /* ignore */ }
  };

  /* ==================== RENDER — DASHBOARD ==================== */

  const renderDashboard = () => (
    <div className="acq-dashboard">
      <div className="acq-dashboard__grid">
        <div className="acq-dashboard__card">
          <span className="acq-dashboard__number">{stats?.total ?? 0}</span>
          <span className="acq-dashboard__label">Total contratos</span>
        </div>
        <div className="acq-dashboard__card">
          <span className="acq-dashboard__number" style={{ color: '#16a34a' }}>{stats?.active ?? 0}</span>
          <span className="acq-dashboard__label">Activos</span>
        </div>
        <div className="acq-dashboard__card">
          <span className="acq-dashboard__number" style={{ color: '#94a3b8' }}>{stats?.draft ?? 0}</span>
          <span className="acq-dashboard__label">Borradores</span>
        </div>
        <div className="acq-dashboard__card">
          <span className="acq-dashboard__number" style={{ color: '#d97706' }}>{stats?.closed ?? 0}</span>
          <span className="acq-dashboard__label">Cerrados</span>
        </div>
        <div className="acq-dashboard__card">
          <span className="acq-dashboard__number" style={{ color: '#dc2626' }}>{stats?.cancelled ?? 0}</span>
          <span className="acq-dashboard__label">Cancelados</span>
        </div>
      </div>
    </div>
  );

  /* ==================== RENDER — CONTRACTS TABLE ==================== */

  const renderContracts = () => (
    <div>
      <div className="acq-toolbar">
        <input
          className="acq-search"
          type="search"
          placeholder="Buscar contrato..."
          value={contractSearch}
          onChange={(e) => setContractSearch(e.target.value)}
        />
        <select
          className="acq-filter"
          value={contractStatusFilter}
          onChange={(e) => setContractStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="ACTIVE">Activo</option>
          <option value="CLOSED">Cerrado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        {canCreate && (
          <Button type="button" onClick={() => { setContractForm(emptyForm); setShowCreateContract(true); }}>
            + Nuevo contrato
          </Button>
        )}
      </div>
      {loading ? (
        <table className="table"><tbody><SkeletonRows cols={5} /></tbody></table>
      ) : filteredContracts.length === 0 ? (
        <div className="acq-empty">
          <p>No hay contratos registrados.</p>
          {canCreate && (
            <Button type="button" onClick={() => { setContractForm(emptyForm); setShowCreateContract(true); }}>
              Crear primer contrato
            </Button>
          )}
        </div>
      ) : (
        <div className="responsive-table">
          <table className="table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Título</th>
                <th>Contratista</th>
                <th>Estado</th>
                <th>Aprobación</th>
                <th>Vigencia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.map((contract) => (
                <tr key={contract._id}>
                  <td><strong>{contract.contractNumber}</strong></td>
                  <td>{contract.title}</td>
                  <td>{resolveContractorName(contract)}</td>
                  <td><Badge value={contract.status} map={STATUS_LABELS} colors={STATUS_COLORS} /></td>
                  <td><ApprovalStatusBadge status={contract.approvalStatus} /></td>
                  <td>{formatDate(contract.contractStart)} — {formatDate(contract.contractEnd)}</td>
                  <td>
                    <RowActions>
                      {canSubmitApproval(contract) && (
                        <button
                          type="button"
                          className="acq-dropdown__item"
                          onClick={() => void handleSubmitForApproval(contract)}
                          disabled={approvalLoading}
                        >
                          📤 Enviar a aprobación
                        </button>
                      )}
                      {canDecideOnContract(contract) && (
                        <>
                          <button
                            type="button"
                            className="acq-dropdown__item"
                            onClick={() => { loadApprovalDetail(contract); }}
                          >
                            🔍 Ver detalle
                          </button>
                          <button
                            type="button"
                            className="acq-dropdown__item"
                            onClick={() => void handleApprove(contract)}
                            disabled={approvalLoading}
                          >
                            ✅ Aprobar
                          </button>
                          <button
                            type="button"
                            className="acq-dropdown__item"
                            onClick={() => setShowRejectModal(contract)}
                          >
                            ❌ Rechazar
                          </button>
                          <button
                            type="button"
                            className="acq-dropdown__item"
                            onClick={() => setShowAdjustmentsModal(contract)}
                          >
                            🔧 Solicitar ajustes
                          </button>
                        </>
                      )}
                      {canCreate && contract.status !== 'ACTIVE' && (
                        <button type="button" className="acq-dropdown__item" onClick={() => openEditForm(contract)}>
                          ✏️ Editar
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="acq-dropdown__item acq-dropdown__item--danger" onClick={() => void handleDeleteContract(contract._id)}>
                          🗑 Eliminar
                        </button>
                      )}
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  /* ==================== RENDER — CONTRACTORS ==================== */

  const renderContractors = () => (
    <div>
      <div className="acq-toolbar">
        <input
          className="acq-search"
          type="search"
          placeholder="Buscar contratista..."
          value={contractorSearch}
          onChange={(e) => setContractorSearch(e.target.value)}
        />
      </div>
      {filteredContractors.length === 0 ? (
        <div className="acq-empty">
          <p>No hay contratistas registrados como proveedores de tipo CONTRACTOR.</p>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
            Los contratistas se gestionan desde el módulo de Adquisiciones como proveedores de tipo CONTRACTOR.
          </p>
        </div>
      ) : (
        <div className="responsive-table">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Razón social</th>
                <th>NIT</th>
                <th>Contacto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredContractors.map((supplier) => (
                <tr key={supplier._id}>
                  <td><strong>{supplier.name}</strong></td>
                  <td>{supplier.legalName ?? '—'}</td>
                  <td>{supplier.taxId ?? '—'}</td>
                  <td>{supplier.contactName ?? '—'}{supplier.email ? ` · ${supplier.email}` : ''}</td>
                  <td><Badge value={supplier.status} map={{ ACTIVE: 'Activo', INACTIVE: 'Inactivo' }} colors={{ ACTIVE: '#16a34a', INACTIVE: '#94a3b8' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  /* ==================== RENDER ==================== */

  return (
    <div className="acquisitions-advanced-panel">
      <h2 style={{ margin: '0 0 .25rem' }}>Contratación</h2>
      <p className="muted" style={{ margin: '0 0 1rem' }}>
        Gestión de contratos, contratistas, inducciones y evaluaciones — Estándar 2.10.1
      </p>

      {error && <div className="acq-error" style={{ marginBottom: '.75rem' }}>{error}</div>}
      {success && <div className="acq-success" style={{ marginBottom: '.75rem' }}>{success}</div>}

      {/* Tabs */}
      <div className="acq-tabs" role="tablist">
        {([
          ['dashboard', '📊 Dashboard'],
          ['contracts', '📋 Contratos'],
          ['contractors', '👥 Contratistas'],
          ['inductions', '🎓 Inducciones'],
          ['evaluations', '📈 Evaluaciones'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`acq-tab ${tab === id ? 'acq-tab--active' : ''}`}
            onClick={() => setTab(id)}
            role="tab"
            aria-selected={tab === id}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="acq-tab-content">
        {tab === 'dashboard' && renderDashboard()}
        {tab === 'contracts' && renderContracts()}
        {tab === 'contractors' && renderContractors()}
        {tab === 'inductions' && (
          <div>
            <div className="acq-toolbar">
              <input
                className="acq-search"
                type="search"
                placeholder="Buscar trabajador..."
                value={inductionSearch}
                onChange={(e) => setInductionSearch(e.target.value)}
              />
              <select
                className="acq-filter"
                value={inductionStatusFilter}
                onChange={(e) => setInductionStatusFilter(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="PENDING">Pendiente</option>
                <option value="COMPLETED">Completada</option>
                <option value="EXPIRED">Vencida</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
              {canCreate && (
                <Button type="button" onClick={() => {
                  setInductionForm({ contractId: '', contractorId: '', workerName: '', workerId: '', inductionDate: '', expirationDate: '', score: '' });
                  setShowCreateInduction(true);
                }}>
                  + Nueva inducción
                </Button>
              )}
            </div>
            {loading ? (
              <table className="table"><tbody><SkeletonRows cols={7} /></tbody></table>
            ) : filteredInductions.length === 0 ? (
              <div className="acq-empty">
                <p>No hay inducciones registradas.</p>
                {canCreate && (
                  <Button type="button" onClick={() => {
                    setInductionForm({ contractId: '', contractorId: '', workerName: '', workerId: '', inductionDate: '', expirationDate: '', score: '' });
                    setShowCreateInduction(true);
                  }}>
                    Crear primera inducción
                  </Button>
                )}
              </div>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Trabajador</th>
                      <th>Identificación</th>
                      <th>Contrato</th>
                      <th>Estado</th>
                      <th>Fecha inducción</th>
                      <th>Vencimiento</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInductions.map((induction) => {
                      const contractLabel = typeof induction.contractId === 'object'
                        ? `${(induction.contractId as ContractModel).contractNumber}`
                        : '—';
                      return (
                        <tr key={induction._id}>
                          <td><strong>{induction.workerName}</strong></td>
                          <td>{induction.workerId ?? '—'}</td>
                          <td>{contractLabel}</td>
                          <td><Badge value={induction.status} map={INDUCTION_STATUS_LABELS} colors={INDUCTION_STATUS_COLORS} /></td>
                          <td>{formatDate(induction.inductionDate)}</td>
                          <td>{formatDate(induction.expirationDate)}</td>
                          <td>
                            <RowActions>
                              {canCreate && induction.status === 'PENDING' && (
                                <button type="button" className="acq-dropdown__item" onClick={() => void handleMarkCompleted(induction)}>
                                  ✅ Marcar completada
                                </button>
                              )}
                              {canCreate && (
                                <button type="button" className="acq-dropdown__item" onClick={() => openEditInductionForm(induction)}>
                                  ✏️ Editar
                                </button>
                              )}
                              {canDelete && (
                                <button type="button" className="acq-dropdown__item acq-dropdown__item--danger" onClick={() => void handleDeleteInduction(induction._id)}>
                                  🗑 Eliminar
                                </button>
                              )}
                            </RowActions>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === 'evaluations' && (
          <div>
            {/* Stats */}
            {evaluationStats && (
              <div className="acq-stats" style={{ marginBottom: 16 }}>
                <div className="acq-stat"><span className="acq-stat__label">Total</span><span className="acq-stat__value">{evaluationStats.total}</span></div>
                <div className="acq-stat"><span className="acq-stat__label">Con score</span><span className="acq-stat__value">{evaluationStats.withScore}</span></div>
                <div className="acq-stat"><span className="acq-stat__label">Promedio</span><span className="acq-stat__value">{evaluationStats.averageScore}</span></div>
              </div>
            )}
            <div className="acq-toolbar">
              <select className="acq-filter" value={evalContractFilter} onChange={(e) => setEvalContractFilter(e.target.value)}>
                <option value="">Todos los contratos</option>
                {contracts.map((c) => <option key={c._id} value={c._id}>{c.contractNumber} — {c.title}</option>)}
              </select>
              <select className="acq-filter" value={evalContractorFilter} onChange={(e) => setEvalContractorFilter(e.target.value)}>
                <option value="">Todos los contratistas</option>
                {contractors.map((ct) => <option key={ct._id} value={ct._id}>{ct.name}</option>)}
              </select>
              {(evalContractFilter || evalContractorFilter) && (
                <button type="button" className="acq-clear" onClick={() => { setEvalContractFilter(''); setEvalContractorFilter(''); }}>✕ Limpiar</button>
              )}
              {canCreate && (
                <Button type="button" onClick={() => {
                  setEvaluationForm({ contractId: '', contractorId: '', evaluationDate: '', score: '', criteria: '', observations: '' });
                  setShowCreateEvaluation(true);
                }}>
                  + Nueva evaluación
                </Button>
              )}
            </div>
            {loading ? (
              <table className="table"><tbody><SkeletonRows cols={7} /></tbody></table>
            ) : filteredEvaluations.length === 0 ? (
              <div className="acq-empty">
                <p>No hay evaluaciones registradas{evalContractFilter || evalContractorFilter ? ' para los filtros seleccionados' : ''}.</p>
                {canCreate && (
                  <Button type="button" onClick={() => {
                    setEvaluationForm({ contractId: '', contractorId: '', evaluationDate: '', score: '', criteria: '', observations: '' });
                    setShowCreateEvaluation(true);
                  }}>
                    Crear primera evaluación
                  </Button>
                )}
              </div>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Contrato</th>
                      <th>Contratista</th>
                      <th>Score</th>
                      <th>Criterios</th>
                      <th>Observaciones</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvaluations.map((evaluation) => {
                      const contractLabel = typeof evaluation.contractId === 'object'
                        ? (evaluation.contractId as ContractModel).contractNumber
                        : contracts.find((c) => c._id === evaluation.contractId)?.contractNumber ?? '—';
                      const contractorLabel = typeof evaluation.contractorId === 'object'
                        ? (evaluation.contractorId as SupplierModel).name
                        : contractors.find((ct) => ct._id === evaluation.contractorId)?.name ?? '—';
                      const badge = getScoreBadge(evaluation.score);
                      return (
                        <tr key={evaluation._id}>
                          <td>{formatDate(evaluation.evaluationDate)}</td>
                          <td>{contractLabel}</td>
                          <td>{contractorLabel}</td>
                          <td>
                            <span className="acq-badge" style={{ backgroundColor: badge.color }}>
                              {evaluation.score} — {badge.label}
                            </span>
                          </td>
                          <td>{evaluation.criteria && evaluation.criteria.length > 0 ? evaluation.criteria.slice(0, 3).join(', ') + (evaluation.criteria.length > 3 ? '…' : '') : '—'}</td>
                          <td>{evaluation.observations ? (evaluation.observations.length > 40 ? evaluation.observations.slice(0, 40) + '…' : evaluation.observations) : '—'}</td>
                          <td>
                            <RowActions>
                              {canCreate && (
                                <button type="button" className="acq-dropdown__item" onClick={() => openEditEvaluationForm(evaluation)}>
                                  ✏️ Editar
                                </button>
                              )}
                              {canDelete && (
                                <button type="button" className="acq-dropdown__item acq-dropdown__item--danger" onClick={() => void handleDeleteEvaluation(evaluation._id)}>
                                  🗑 Eliminar
                                </button>
                              )}
                            </RowActions>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== CREATE CONTRACT MODAL ===== */}
      <Modal isOpen={showCreateContract} title="Nuevo contrato" onClose={() => setShowCreateContract(false)}>
        <div className="acq-form">
          <label className="field">
            <span className="label">Número de contrato *</span>
            <input className="input" value={contractForm.contractNumber} onChange={(e) => setContractForm({ ...contractForm, contractNumber: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Título *</span>
            <input className="input" value={contractForm.title} onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Contratista *</span>
            <select className="input" value={contractForm.contractorId} onChange={(e) => setContractForm({ ...contractForm, contractorId: e.target.value })} disabled={submitting} required>
              <option value="">Seleccionar contratista</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>{c.name}{c.taxId ? ` (${c.taxId})` : ''}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Descripción</span>
            <textarea className="input" rows={2} value={contractForm.description} onChange={(e) => setContractForm({ ...contractForm, description: e.target.value })} disabled={submitting} />
          </label>
          <div className="acq-form__row">
            <label className="field">
              <span className="label">Fecha inicio</span>
              <input type="date" className="input" value={contractForm.contractStart} onChange={(e) => setContractForm({ ...contractForm, contractStart: e.target.value })} disabled={submitting} />
            </label>
            <label className="field">
              <span className="label">Fecha fin</span>
              <input type="date" className="input" value={contractForm.contractEnd} onChange={(e) => setContractForm({ ...contractForm, contractEnd: e.target.value })} disabled={submitting} />
            </label>
          </div>
          <label className="field">
            <span className="label">Requisitos SST</span>
            <textarea className="input" rows={2} value={contractForm.sstRequirements} onChange={(e) => setContractForm({ ...contractForm, sstRequirements: e.target.value })} disabled={submitting} placeholder="Requisitos de SST establecidos para el contrato" />
          </label>
          <label className="field">
            <span className="label">Observaciones</span>
            <textarea className="input" rows={2} value={contractForm.observations} onChange={(e) => setContractForm({ ...contractForm, observations: e.target.value })} disabled={submitting} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => setShowCreateContract(false)} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={() => void handleCreateContract()} disabled={submitting || !contractForm.contractNumber || !contractForm.title || !contractForm.contractorId}>
              {submitting ? 'Creando...' : 'Crear contrato'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===== EDIT CONTRACT MODAL ===== */}
      <Modal isOpen={!!showEditContract} title="Editar contrato" onClose={() => { setShowEditContract(null); setContractForm(emptyForm); }}>
        <div className="acq-form">
          <label className="field">
            <span className="label">Número de contrato *</span>
            <input className="input" value={contractForm.contractNumber} onChange={(e) => setContractForm({ ...contractForm, contractNumber: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Título *</span>
            <input className="input" value={contractForm.title} onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Contratista *</span>
            <select className="input" value={contractForm.contractorId} onChange={(e) => setContractForm({ ...contractForm, contractorId: e.target.value })} disabled={submitting} required>
              <option value="">Seleccionar contratista</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>{c.name}{c.taxId ? ` (${c.taxId})` : ''}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Descripción</span>
            <textarea className="input" rows={2} value={contractForm.description} onChange={(e) => setContractForm({ ...contractForm, description: e.target.value })} disabled={submitting} />
          </label>
          <div className="acq-form__row">
            <label className="field">
              <span className="label">Fecha inicio</span>
              <input type="date" className="input" value={contractForm.contractStart} onChange={(e) => setContractForm({ ...contractForm, contractStart: e.target.value })} disabled={submitting} />
            </label>
            <label className="field">
              <span className="label">Fecha fin</span>
              <input type="date" className="input" value={contractForm.contractEnd} onChange={(e) => setContractForm({ ...contractForm, contractEnd: e.target.value })} disabled={submitting} />
            </label>
          </div>
          <label className="field">
            <span className="label">Requisitos SST</span>
            <textarea className="input" rows={2} value={contractForm.sstRequirements} onChange={(e) => setContractForm({ ...contractForm, sstRequirements: e.target.value })} disabled={submitting} />
          </label>
          <label className="field">
            <span className="label">Observaciones</span>
            <textarea className="input" rows={2} value={contractForm.observations} onChange={(e) => setContractForm({ ...contractForm, observations: e.target.value })} disabled={submitting} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => { setShowEditContract(null); setContractForm(emptyForm); }} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={() => void handleUpdateContract()} disabled={submitting || !contractForm.contractNumber || !contractForm.title || !contractForm.contractorId}>
              {submitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===== CREATE INDUCTION MODAL ===== */}
      <Modal isOpen={showCreateInduction} title="Nueva inducción" onClose={() => setShowCreateInduction(false)}>
        <div className="acq-form">
          <label className="field">
            <span className="label">Contrato *</span>
            <select className="input" value={inductionForm.contractId} onChange={(e) => setInductionForm({ ...inductionForm, contractId: e.target.value })} disabled={submitting} required>
              <option value="">Seleccionar contrato</option>
              {activeContracts.map((c) => (
                <option key={c._id} value={c._id}>{c.contractNumber} — {c.title}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Contratista *</span>
            <select className="input" value={inductionForm.contractorId} onChange={(e) => setInductionForm({ ...inductionForm, contractorId: e.target.value })} disabled={submitting} required>
              <option value="">Seleccionar contratista</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Nombre del trabajador *</span>
            <input className="input" value={inductionForm.workerName} onChange={(e) => setInductionForm({ ...inductionForm, workerName: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Identificación</span>
            <input className="input" value={inductionForm.workerId} onChange={(e) => setInductionForm({ ...inductionForm, workerId: e.target.value })} disabled={submitting} placeholder="Cédula o documento" />
          </label>
          <div className="acq-form__row">
            <label className="field">
              <span className="label">Fecha de inducción</span>
              <input type="date" className="input" value={inductionForm.inductionDate} onChange={(e) => setInductionForm({ ...inductionForm, inductionDate: e.target.value })} disabled={submitting} />
            </label>
            <label className="field">
              <span className="label">Fecha de vencimiento</span>
              <input type="date" className="input" value={inductionForm.expirationDate} onChange={(e) => setInductionForm({ ...inductionForm, expirationDate: e.target.value })} disabled={submitting} />
            </label>
          </div>
          <label className="field">
            <span className="label">Calificación (0-100)</span>
            <input type="number" className="input" min={0} max={100} value={inductionForm.score} onChange={(e) => setInductionForm({ ...inductionForm, score: e.target.value })} disabled={submitting} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => setShowCreateInduction(false)} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={() => void handleCreateInduction()} disabled={submitting || !inductionForm.contractId || !inductionForm.contractorId || !inductionForm.workerName}>
              {submitting ? 'Creando...' : 'Crear inducción'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===== EDIT INDUCTION MODAL ===== */}
      <Modal isOpen={!!showEditInduction} title="Editar inducción" onClose={() => { setShowEditInduction(null); setInductionForm({ contractId: '', contractorId: '', workerName: '', workerId: '', inductionDate: '', expirationDate: '', score: '' }); }}>
        <div className="acq-form">
          <label className="field">
            <span className="label">Contrato *</span>
            <select className="input" value={inductionForm.contractId} onChange={(e) => setInductionForm({ ...inductionForm, contractId: e.target.value })} disabled={submitting} required>
              <option value="">Seleccionar contrato</option>
              {activeContracts.map((c) => (
                <option key={c._id} value={c._id}>{c.contractNumber} — {c.title}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Contratista *</span>
            <select className="input" value={inductionForm.contractorId} onChange={(e) => setInductionForm({ ...inductionForm, contractorId: e.target.value })} disabled={submitting} required>
              <option value="">Seleccionar contratista</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Nombre del trabajador *</span>
            <input className="input" value={inductionForm.workerName} onChange={(e) => setInductionForm({ ...inductionForm, workerName: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Identificación</span>
            <input className="input" value={inductionForm.workerId} onChange={(e) => setInductionForm({ ...inductionForm, workerId: e.target.value })} disabled={submitting} />
          </label>
          {showEditInduction && (
            <label className="field">
              <span className="label">Estado</span>
              <select className="input" value={inductionForm.score === '' ? showEditInduction.status : inductionForm.score} onChange={() => undefined} disabled>
                <option value={showEditInduction.status}>{INDUCTION_STATUS_LABELS[showEditInduction.status] ?? showEditInduction.status}</option>
              </select>
              <p className="muted" style={{ fontSize: '.8rem', marginTop: '.25rem' }}>Use "Marcar completada" para cambiar el estado.</p>
            </label>
          )}
          <div className="acq-form__row">
            <label className="field">
              <span className="label">Fecha de inducción</span>
              <input type="date" className="input" value={inductionForm.inductionDate} onChange={(e) => setInductionForm({ ...inductionForm, inductionDate: e.target.value })} disabled={submitting} />
            </label>
            <label className="field">
              <span className="label">Fecha de vencimiento</span>
              <input type="date" className="input" value={inductionForm.expirationDate} onChange={(e) => setInductionForm({ ...inductionForm, expirationDate: e.target.value })} disabled={submitting} />
            </label>
          </div>
          <label className="field">
            <span className="label">Calificación (0-100)</span>
            <input type="number" className="input" min={0} max={100} value={inductionForm.score} onChange={(e) => setInductionForm({ ...inductionForm, score: e.target.value })} disabled={submitting} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" variant="secondary" onClick={() => { setShowEditInduction(null); setInductionForm({ contractId: '', contractorId: '', workerName: '', workerId: '', inductionDate: '', expirationDate: '', score: '' }); }} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={() => void handleUpdateInduction()} disabled={submitting || !inductionForm.contractId || !inductionForm.contractorId || !inductionForm.workerName}>
              {submitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===== CREATE EVALUATION MODAL ===== */}
      <Modal isOpen={showCreateEvaluation} title="Nueva evaluación" onClose={() => setShowCreateEvaluation(false)}>
        <div className="acq-form">
          <label className="field">
            <span className="label">Contrato *</span>
            <select className="input" value={evaluationForm.contractId} onChange={(e) => {
              const cid = e.target.value;
              const contract = contracts.find((c) => c._id === cid);
              const ctId = contract ? (typeof contract.contractorId === 'object' ? contract.contractorId._id : contract.contractorId) : '';
              setEvaluationForm({ ...evaluationForm, contractId: cid, contractorId: ctId });
            }} disabled={submitting}>
              <option value="">Seleccionar contrato</option>
              {activeContracts.map((c) => <option key={c._id} value={c._id}>{c.contractNumber} — {c.title}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">Contratista *</span>
            <input className="input" value={contractors.find((ct) => ct._id === evaluationForm.contractorId)?.name ?? '—'} disabled />
          </label>
          <label className="field">
            <span className="label">Fecha de evaluación *</span>
            <input className="input" type="date" value={evaluationForm.evaluationDate} onChange={(e) => setEvaluationForm({ ...evaluationForm, evaluationDate: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Score (0-100) *</span>
            <input className="input" type="number" min={0} max={100} value={evaluationForm.score} onChange={(e) => setEvaluationForm({ ...evaluationForm, score: e.target.value })} disabled={submitting} required />
          </label>
          <label className="field">
            <span className="label">Criterios (separados por coma)</span>
            <input className="input" value={evaluationForm.criteria} onChange={(e) => setEvaluationForm({ ...evaluationForm, criteria: e.target.value })} disabled={submitting} placeholder="Seguridad, Calidad, Tiempo" />
          </label>
          <label className="field">
            <span className="label">Observaciones</span>
            <textarea className="input" value={evaluationForm.observations} onChange={(e) => setEvaluationForm({ ...evaluationForm, observations: e.target.value })} disabled={submitting} rows={3} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" onClick={() => setShowCreateEvaluation(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void handleCreateEvaluation()} disabled={submitting}>{submitting ? 'Guardando…' : 'Crear evaluación'}</Button>
          </div>
        </div>
      </Modal>

      {/* ===== EDIT EVALUATION MODAL ===== */}
      <Modal isOpen={!!showEditEvaluation} title="Editar evaluación" onClose={() => setShowEditEvaluation(null)}>
        <div className="acq-form">
          <label className="field">
            <span className="label">Fecha de evaluación</span>
            <input className="input" type="date" value={evaluationForm.evaluationDate} onChange={(e) => setEvaluationForm({ ...evaluationForm, evaluationDate: e.target.value })} disabled={submitting} />
          </label>
          <label className="field">
            <span className="label">Score (0-100)</span>
            <input className="input" type="number" min={0} max={100} value={evaluationForm.score} onChange={(e) => setEvaluationForm({ ...evaluationForm, score: e.target.value })} disabled={submitting} />
          </label>
          <label className="field">
            <span className="label">Criterios (separados por coma)</span>
            <input className="input" value={evaluationForm.criteria} onChange={(e) => setEvaluationForm({ ...evaluationForm, criteria: e.target.value })} disabled={submitting} />
          </label>
          <label className="field">
            <span className="label">Observaciones</span>
            <textarea className="input" value={evaluationForm.observations} onChange={(e) => setEvaluationForm({ ...evaluationForm, observations: e.target.value })} disabled={submitting} rows={3} />
          </label>
          <div className="acq-form__actions">
            <Button type="button" onClick={() => setShowEditEvaluation(null)}>Cancelar</Button>
            <Button type="button" onClick={() => void handleUpdateEvaluation()} disabled={submitting}>{submitting ? 'Guardando…' : 'Guardar cambios'}</Button>
          </div>
        </div>
      </Modal>

      {/* ===== APPROVAL DETAIL MODAL ===== */}
      <Modal isOpen={!!selectedContract} title={`Aprobación — ${selectedContract?.contractNumber ?? ''}`} onClose={() => { setSelectedContract(null); setApprovalDetail(null); setApprovalHistory(null); }}>
        {selectedContract && (
          <div>
            <p style={{ margin: '0 0 .5rem' }}>
              <strong>{selectedContract.title}</strong>
            </p>
            <p className="muted" style={{ margin: '0 0 .75rem' }}>
              Estado: <ApprovalStatusBadge status={selectedContract.approvalStatus} />
            </p>
            {approvalDetail && (
              <div style={{ marginBottom: '.75rem' }}>
                <p style={{ margin: 0 }}>Puede enviar a aprobación: <strong>{approvalDetail.canSubmit ? 'Sí' : 'No'}</strong></p>
              </div>
            )}
            {approvalHistory && approvalHistory.history.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 .5rem' }}>Historial de aprobación</h4>
                <div className="timeline">
                  {approvalHistory.history.map((event) => (
                    <article key={event._id} className="timeline__item">
                      <strong>{event.action}</strong>
                      <p style={{ margin: '.25rem 0' }}>
                        {event.actor.name ?? event.actor.email ?? '—'} · {event.previousStatus} → {event.newStatus}
                      </p>
                      {event.reason && <p style={{ margin: '.25rem 0', color: '#64748b' }}>{event.reason}</p>}
                      <small>{formatDateTime(event.createdAt)}</small>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {approvalHistory && approvalHistory.history.length === 0 && (
              <p className="muted">No hay eventos de aprobación registrados.</p>
            )}
          </div>
        )}
      </Modal>

      {/* ===== REJECT MODAL ===== */}
      <ApprovalRejectModal
        isOpen={!!showRejectModal}
        entityLabel={showRejectModal ? `${showRejectModal.contractNumber} — ${showRejectModal.title}` : undefined}
        loading={approvalLoading}
        onSubmit={(reason) => { if (showRejectModal) void handleReject(showRejectModal, reason); }}
        onClose={() => setShowRejectModal(null)}
      />

      {/* ===== ADJUSTMENTS MODAL ===== */}
      <ApprovalAdjustmentsModal
        isOpen={!!showAdjustmentsModal}
        entityLabel={showAdjustmentsModal ? `${showAdjustmentsModal.contractNumber} — ${showAdjustmentsModal.title}` : undefined}
        loading={approvalLoading}
        onSubmit={(reason) => { if (showAdjustmentsModal) void handleRequestAdjustments(showAdjustmentsModal, reason); }}
        onClose={() => setShowAdjustmentsModal(null)}
      />
    </div>
  );
}
