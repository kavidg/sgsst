import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AnnualWorkPlanModel,
  PlanActivityModel,
  PlanTaskModel,
  PlanSubtaskModel,
  TaskEvidenceModel,
  TaskJustificationModel,
  ComplianceReportModel,
  PlanHistoryModel,
  fetchAnnualWorkPlanCurrent,
  fetchAnnualWorkPlans,
  ensureCurrentAnnualWorkPlan,
  updateAnnualWorkPlanStatus,
  approveAnnualWorkPlan,
  fetchPlanActivities,
  createPlanActivity,
  updatePlanActivity,
  deletePlanActivity,
  fetchPlanTasks,
  createPlanTask,
  updatePlanTask,
  deletePlanTask,
  fetchPlanSubtasks,
  createPlanSubtask,
  updatePlanSubtask,
  deletePlanSubtask,
  fetchTaskEvidence,
  createTaskEvidence,
  deleteTaskEvidence,
  fetchTaskJustifications,
  createTaskJustification,
  approveJustification,
  recalculateCompliance,
  fetchComplianceReport,
  fetchPlanHistory,
  processAutoStatus,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Sheet } from '../components/ui/Sheet';
import { useCompanyContext } from '../context/CompanyContext';
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type AnnualWorkPlanPageProps = {
  token: string;
};

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Borrador',
  Active: 'Activo',
  Completed: 'Completado',
  Archived: 'Archivado',
};

const PRIORITY_LABELS: Record<string, string> = {
  Low: 'Baja',
  Medium: 'Media',
  High: 'Alta',
  Critical: 'Crítica',
};

const STATUS_COLORS: Record<string, string> = {
  Draft: '#f59e0b',
  Active: '#3b82f6',
  Completed: '#10b981',
  Archived: '#6b7280',
};

const ACTIVITY_STATUS_COLORS: Record<string, string> = {
  Pending: '#f59e0b',
  InProgress: '#3b82f6',
  Completed: '#10b981',
  Delayed: '#ef4444',
  Cancelled: '#6b7280',
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function toDateInput(value: string | undefined | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

function progressColor(pct: number): string {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

export function AnnualWorkPlanPage({ token }: AnnualWorkPlanPageProps) {
  const { companyId } = useCompanyContext();
  const [plan, setPlan] = useState<AnnualWorkPlanModel | null>(null);
  const [plans, setPlans] = useState<AnnualWorkPlanModel[]>([]);
  const [activities, setActivities] = useState<PlanActivityModel[]>([]);
  const [tasks, setTasks] = useState<PlanTaskModel[]>([]);
  const [subtasks, setSubtasks] = useState<PlanSubtaskModel[]>([]);
  const [evidence, setEvidence] = useState<TaskEvidenceModel[]>([]);
  const [justifications, setJustifications] = useState<TaskJustificationModel[]>([]);
  const [compliance, setCompliance] = useState<ComplianceReportModel | null>(null);
  const [history, setHistory] = useState<PlanHistoryModel[]>([]);
  const [tab, setTab] = useState('Plan General');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Activity form
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<PlanActivityModel | null>(null);
  const [activityForm, setActivityForm] = useState({ title: '', description: '', startDate: '', endDate: '', responsibleUser: '', priority: 'Medium', estimatedCost: 0 });

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assignedTo: '', startDate: '', dueDate: '', progress: 0 });

  // Subtask form
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');

  // Evidence form
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceType, setEvidenceType] = useState('document');

  // Justification form
  const [showJustificationForm, setShowJustificationForm] = useState(false);
  const [justificationReason, setJustificationReason] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // Approval form
  const [approvalForm, setApprovalForm] = useState({ approvedByName: '', approvedByEmail: '', comments: '' });

  // Detail drawer
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // Year selector
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const notify = (msg: string) => { setSuccess(msg); window.setTimeout(() => setSuccess(''), 3000); };
  const showError = (msg: string) => { setError(msg); window.setTimeout(() => setError(''), 5000); };

  const loadPlan = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [currentPlan, allPlans] = await Promise.all([
        fetchAnnualWorkPlanCurrent(token),
        fetchAnnualWorkPlans(token),
      ]);
      if (currentPlan) {
        setPlan(currentPlan);
        setSelectedYear(currentPlan.year);
      }
      setPlans(allPlans);
    } catch (e) {
      // No plan yet - that's ok
    } finally {
      setLoading(false);
    }
  }, [token]);

  const ensurePlan = async () => {
    setLoading(true);
    try {
      const p = await ensureCurrentAnnualWorkPlan(token);
      setPlan(p);
      setPlans([p, ...plans]);
      setSelectedYear(p.year);
      notify('Plan anual creado/asegurado');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al crear plan');
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = useCallback(async (planId: string) => {
    try {
      const data = await fetchPlanActivities(token, planId);
      setActivities(data);
    } catch { setActivities([]); }
  }, [token]);

  const loadTasks = useCallback(async (planId: string, activityId: string) => {
    if (!activityId) { setTasks([]); return; }
    try {
      const data = await fetchPlanTasks(token, planId, activityId);
      setTasks(data);
    } catch { setTasks([]); }
  }, [token]);

  const loadSubtasks = useCallback(async (planId: string, activityId: string, taskId: string) => {
    if (!taskId) { setSubtasks([]); return; }
    try {
      const data = await fetchPlanSubtasks(token, planId, activityId, taskId);
      setSubtasks(data);
    } catch { setSubtasks([]); }
  }, [token]);

  const loadEvidence = useCallback(async (planId: string, activityId: string, taskId: string) => {
    if (!taskId) { setEvidence([]); return; }
    try {
      const data = await fetchTaskEvidence(token, planId, activityId, taskId);
      setEvidence(data);
    } catch { setEvidence([]); }
  }, [token]);

  const loadJustifications = useCallback(async (planId: string, activityId: string, taskId: string) => {
    if (!taskId) { setJustifications([]); return; }
    try {
      const data = await fetchTaskJustifications(token, planId, activityId, taskId);
      setJustifications(data);
    } catch { setJustifications([]); }
  }, [token]);

  const loadCompliance = useCallback(async (planId: string) => {
    try {
      const data = await fetchComplianceReport(token, planId);
      setCompliance(data);
    } catch { setCompliance(null); }
  }, [token]);

  const loadHistory = useCallback(async (planId: string) => {
    try {
      const data = await fetchPlanHistory(token, planId);
      setHistory(data);
    } catch { setHistory([]); }
  }, [token]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  useEffect(() => {
    if (plan) {
      void loadActivities(plan._id);
      void loadCompliance(plan._id);
      void loadHistory(plan._id);
    }
  }, [plan, loadActivities, loadCompliance, loadHistory]);

  useEffect(() => {
    if (plan && selectedActivityId) {
      void loadTasks(plan._id, selectedActivityId);
    }
  }, [plan, selectedActivityId, loadTasks]);

  // Task detail data
  useEffect(() => {
    if (plan && detailTaskId && selectedActivityId) {
      void loadSubtasks(plan._id, selectedActivityId, detailTaskId);
      void loadEvidence(plan._id, selectedActivityId, detailTaskId);
      void loadJustifications(plan._id, selectedActivityId, detailTaskId);
    }
  }, [plan, detailTaskId, selectedActivityId, loadSubtasks, loadEvidence, loadJustifications]);

  const handleCreateActivity = async () => {
    if (!plan) return;
    try {
      const created = await createPlanActivity(token, plan._id, {
        title: activityForm.title,
        description: activityForm.description,
        startDate: activityForm.startDate,
        endDate: activityForm.endDate,
        responsibleUser: activityForm.responsibleUser,
        priority: activityForm.priority,
        estimatedCost: activityForm.estimatedCost,
      });
      setActivities([...activities, created]);
      setShowActivityForm(false);
      setActivityForm({ title: '', description: '', startDate: '', endDate: '', responsibleUser: '', priority: 'Medium', estimatedCost: 0 });
      notify('Actividad creada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al crear actividad');
    }
  };

  const handleUpdateActivity = async () => {
    if (!plan || !editingActivity) return;
    try {
      const updated = await updatePlanActivity(token, plan._id, editingActivity._id, activityForm as unknown as Record<string, unknown>);
      setActivities(activities.map((a) => (a._id === updated._id ? updated : a)));
      setEditingActivity(null);
      setShowActivityForm(false);
      notify('Actividad actualizada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al actualizar actividad');
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!plan) return;
    if (!window.confirm('¿Eliminar esta actividad y todas sus tareas?')) return;
    try {
      await deletePlanActivity(token, plan._id, id);
      setActivities(activities.filter((a) => a._id !== id));
      notify('Actividad eliminada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al eliminar actividad');
    }
  };

  const handleCreateTask = async () => {
    if (!plan || !selectedActivityId) return;
    try {
      const task = await createPlanTask(token, plan._id, selectedActivityId, {
        title: taskForm.title,
        description: taskForm.description,
        assignedTo: taskForm.assignedTo,
        startDate: taskForm.startDate,
        dueDate: taskForm.dueDate,
        progress: taskForm.progress,
      });
      setTasks([...tasks, task]);
      setShowTaskForm(false);
      setTaskForm({ title: '', description: '', assignedTo: '', startDate: '', dueDate: '', progress: 0 });
      notify('Tarea creada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al crear tarea');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    if (!plan || !selectedActivityId) return;
    try {
      const updated = await updatePlanTask(token, plan._id, selectedActivityId, taskId, { status } as Record<string, unknown>);
      setTasks(tasks.map((t) => (t._id === updated._id ? updated : t)));
      if (status === 'Completed') {
        await updatePlanTask(token, plan._id, selectedActivityId, taskId, { progress: 100 } as Record<string, unknown>);
        setTasks(tasks.map((t) => (t._id === taskId ? { ...t, progress: 100, status: 'Completed' as const } : t)));
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al actualizar tarea');
    }
  };

  const handleUpdateTaskProgress = async (taskId: string, progress: number) => {
    if (!plan || !selectedActivityId) return;
    const newStatus = progress >= 100 ? 'Completed' : progress > 0 ? 'InProgress' : 'Pending';
    try {
      await updatePlanTask(token, plan._id, selectedActivityId, taskId, { progress, status: newStatus } as Record<string, unknown>);
      setTasks(tasks.map((t) => (t._id === taskId ? { ...t, progress, status: newStatus } : t)));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al actualizar progreso');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!plan || !selectedActivityId) return;
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    try {
      await deletePlanTask(token, plan._id, selectedActivityId, taskId);
      setTasks(tasks.filter((t) => t._id !== taskId));
      notify('Tarea eliminada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al eliminar tarea');
    }
  };

  const handleAddSubtask = async () => {
    if (!plan || !detailTaskId || !selectedActivityId || !subtaskTitle) return;
    try {
      const subtask = await createPlanSubtask(token, plan._id, selectedActivityId, detailTaskId, { title: subtaskTitle });
      setSubtasks([...subtasks, subtask]);
      setSubtaskTitle('');
      notify('Subtarea creada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al crear subtarea');
    }
  };

  const handleToggleSubtask = async (subtaskId: string, completed: boolean) => {
    if (!plan || !detailTaskId || !selectedActivityId) return;
    try {
      const updated = await updatePlanSubtask(token, plan._id, selectedActivityId, detailTaskId, subtaskId, { completed });
      setSubtasks(subtasks.map((s) => (s._id === updated._id ? updated : s)));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al actualizar subtarea');
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!plan || !detailTaskId || !selectedActivityId) return;
    try {
      await deletePlanSubtask(token, plan._id, selectedActivityId, detailTaskId, subtaskId);
      setSubtasks(subtasks.filter((s) => s._id !== subtaskId));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al eliminar subtarea');
    }
  };

  const handleAddEvidence = async () => {
    if (!plan || !detailTaskId || !selectedActivityId || !evidenceUrl) return;
    try {
      const ev = await createTaskEvidence(token, plan._id, selectedActivityId, detailTaskId, { fileUrl: evidenceUrl, fileType: evidenceType });
      setEvidence([...evidence, ev]);
      setEvidenceUrl('');
      notify('Evidencia agregada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al agregar evidencia');
    }
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    if (!plan || !detailTaskId || !selectedActivityId) return;
    try {
      await deleteTaskEvidence(token, plan._id, selectedActivityId, detailTaskId, evidenceId);
      setEvidence(evidence.filter((e) => e._id !== evidenceId));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al eliminar evidencia');
    }
  };

  const handleAddJustification = async () => {
    if (!plan || !detailTaskId || !selectedActivityId || !justificationReason) return;
    try {
      const j = await createTaskJustification(token, plan._id, selectedActivityId, detailTaskId, {
        reason: justificationReason,
        correctiveAction,
        newDueDate: newDueDate || undefined,
      });
      setJustifications([...justifications, j]);
      setShowJustificationForm(false);
      setJustificationReason('');
      setCorrectiveAction('');
      setNewDueDate('');
      notify('Justificación enviada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al crear justificación');
    }
  };

  const handleApproveJustification = async (justId: string, approved: boolean) => {
    try {
      const updated = await approveJustification(token, justId, {
        approvalStatus: approved ? 'Approved' : 'Rejected',
        rejectionReason: approved ? undefined : 'Rechazada por el manager',
      });
      setJustifications(justifications.map((j) => (j._id === updated._id ? updated : j)));
      notify(approved ? 'Justificación aprobada' : 'Justificación rechazada');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al aprobar justificación');
    }
  };

  const handleApprovePlan = async () => {
    if (!plan) return;
    try {
      const updated = await approveAnnualWorkPlan(token, plan._id, {
        approvedByName: approvalForm.approvedByName,
        approvedByEmail: approvalForm.approvedByEmail,
        comments: approvalForm.comments,
      });
      setPlan(updated);
      notify('Plan aprobado con firma digital');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al aprobar plan');
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!plan) return;
    try {
      const updated = await updateAnnualWorkPlanStatus(token, plan._id, status);
      setPlan(updated);
      notify(`Estado actualizado a ${STATUS_LABELS[status] || status}`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al actualizar estado');
    }
  };

  const handleRecalculate = async () => {
    if (!plan) return;
    try {
      const pct = await recalculateCompliance(token, plan._id);
      setPlan({ ...plan, compliancePercentage: pct });
      void loadCompliance(plan._id);
      notify(`Cumplimiento recalculado: ${pct}%`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al recalcular');
    }
  };

  const handleProcessAutoStatus = async () => {
    try {
      const result = await processAutoStatus(token);
      notify(result.message);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al procesar auto-estado');
    }
  };

  // Compute KPIs
  const kpis = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
    const delayedTasks = tasks.filter((t) => t.status === 'Delayed' || (t.status !== 'Completed' && new Date(t.dueDate) < new Date())).length;
    const upcomingTasks = tasks.filter((t) => t.status !== 'Completed' && new Date(t.dueDate) >= new Date()).length;
    return { totalTasks, completedTasks, delayedTasks, upcomingTasks };
  }, [tasks]);

  // Kanban columns
  const kanbanColumns = useMemo(() => {
    const cols: Record<string, PlanTaskModel[]> = { Pending: [], InProgress: [], Completed: [], Delayed: [] };
    tasks.forEach((t) => {
      const status = t.status in cols ? t.status : 'Pending';
      cols[status].push(t);
    });
    return cols;
  }, [tasks]);

  // Gantt data
  const ganttData = useMemo(() => {
    return activities.map((activity) => {
      const startMonth = new Date(activity.startDate).getMonth();
      const endMonth = new Date(activity.endDate).getMonth();
      const duration = endMonth - startMonth + 1;
      return {
        id: activity._id,
        title: activity.title,
        startMonth,
        duration: Math.max(1, duration),
        status: activity.status,
        progress: activity.progress,
      };
    });
  }, [activities]);

  // Dashboard chart data
  const chartData = useMemo(() => ({
    statusDistribution: [
      { name: 'Pendientes', value: kpis.totalTasks - kpis.completedTasks - kpis.delayedTasks, color: '#f59e0b' },
      { name: 'En progreso', value: tasks.filter((t) => t.status === 'InProgress').length, color: '#3b82f6' },
      { name: 'Completadas', value: kpis.completedTasks, color: '#10b981' },
      { name: 'Retrasadas', value: kpis.delayedTasks, color: '#ef4444' },
    ],
    monthlyActivities: MONTHS.map((month, i) => ({
      month,
      activities: activities.filter((a) => new Date(a.startDate).getMonth() <= i && new Date(a.endDate).getMonth() >= i).length,
    })),
  }), [tasks, activities, kpis]);

  const detailTask = tasks.find((t) => t._id === detailTaskId);

  const tabs = ['Plan General', 'Actividades', 'Tareas', 'Cronograma', 'Evidencias', 'Alertas', 'Dashboard', 'Firma Gerencial', 'Historial'];

  if (!plan && !loading) {
    return (
      <section className="dashboard">
        <Card>
          <h2>Plan Anual de Trabajo SG-SST 2.4.1</h2>
          <p className="muted">No hay un plan anual de trabajo para el año actual. Crea uno para comenzar.</p>
          <Button type="button" onClick={() => void ensurePlan()}>Crear Plan Anual {new Date().getFullYear()}</Button>
        </Card>
      </section>
    );
  }

  return (
    <section className="dashboard" style={{ maxWidth: 1400 }}>
      {error ? <p className="error">{error}</p> : null}
      {success ? <div className="toast-alert" style={{ position: 'static', marginBottom: '0.5rem' }}><p>{success}</p></div> : null}
      {loading ? <p className="muted">Cargando...</p> : null}

      {/* Header */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Plan Anual de Trabajo SG-SST 2.4.1</h2>
          {plan ? (
            <p className="muted" style={{ marginTop: '0.25rem' }}>
              Año {plan.year} · {STATUS_LABELS[plan.status] || plan.status} · Cumplimiento: {plan.compliancePercentage}%
            </p>
          ) : null}
        </div>
        <div className="actions">
          {plan?.status === 'Draft' ? (
            <Button type="button" onClick={() => handleUpdateStatus('Active')}>Activar Plan</Button>
          ) : null}
          {plan?.status === 'Active' ? (
            <Button type="button" variant="secondary" onClick={() => handleUpdateStatus('Completed')}>Completar Plan</Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => void handleRecalculate()}>Recalcular Cumplimiento</Button>
          <Button type="button" variant="ghost" onClick={() => void handleProcessAutoStatus()}>Procesar Alertas</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="advanced-tabs" style={{ overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {tabs.map((name) => (
          <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>
            {name}
          </Button>
        ))}
      </div>

      {/* TAB 1: Plan General */}
      {tab === 'Plan General' && plan ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Card><h3 className="card-title">Año</h3><p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>{plan.year}</p></Card>
          <Card><h3 className="card-title">Estado</h3><p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: STATUS_COLORS[plan.status] || '#000' }}>{STATUS_LABELS[plan.status] || plan.status}</p></Card>
          <Card><h3 className="card-title">Cumplimiento</h3><p style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: progressColor(plan.compliancePercentage) }}>{plan.compliancePercentage}%</p></Card>
          <Card><h3 className="card-title">Actividades</h3><p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>{activities.length}</p></Card>
          <Card><h3 className="card-title">Tareas</h3><p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>{kpis.totalTasks}</p></Card>
          <Card>
            <h3 className="card-title">Progreso Global</h3>
            <div className="objective-progress">
              <div className="objective-progress__track">
                <span className={`objective-progress__bar ${plan.compliancePercentage >= 70 ? 'objective-progress__bar--high' : plan.compliancePercentage >= 40 ? 'objective-progress__bar--medium' : 'objective-progress__bar--low'}`}
                  style={{ width: `${plan.compliancePercentage}%` }} />
              </div>
              <strong>{plan.compliancePercentage}%</strong>
            </div>
          </Card>
          {plan.approval ? (
            <Card>
              <h3 className="card-title">Aprobación</h3>
              <p className="muted">Aprobado por: {plan.approval.approvedByName}</p>
              <p className="muted">Fecha: {formatDate(plan.approval.approvalDate)}</p>
              {plan.approval.comments ? <p className="muted">Comentarios: {plan.approval.comments}</p> : null}
              {plan.approval.signatureHash ? <p className="muted">✓ Firma digital registrada</p> : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* TAB 2: Actividades */}
      {tab === 'Actividades' ? (
        <div className="grid" style={{ gap: '1rem' }}>
          <div className="actions">
            <Button type="button" onClick={() => { setEditingActivity(null); setActivityForm({ title: '', description: '', startDate: '', endDate: '', responsibleUser: '', priority: 'Medium', estimatedCost: 0 }); setShowActivityForm(true); }}>
              + Nueva Actividad
            </Button>
          </div>

          {showActivityForm ? (
            <Card title={editingActivity ? 'Editar Actividad' : 'Nueva Actividad'}>
              <div className="form-grid">
                <input className="input" placeholder="Título" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
                <textarea className="input" placeholder="Descripción" value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} />
                <div className="grid grid-2">
                  <label className="field"><span className="label">Inicio</span><input className="input" type="date" value={activityForm.startDate} onChange={(e) => setActivityForm({ ...activityForm, startDate: e.target.value })} /></label>
                  <label className="field"><span className="label">Fin</span><input className="input" type="date" value={activityForm.endDate} onChange={(e) => setActivityForm({ ...activityForm, endDate: e.target.value })} /></label>
                </div>
                <div className="grid grid-2">
                  <label className="field"><span className="label">Responsable</span><input className="input" placeholder="ID del usuario" value={activityForm.responsibleUser} onChange={(e) => setActivityForm({ ...activityForm, responsibleUser: e.target.value })} /></label>
                  <label className="field"><span className="label">Prioridad</span>
                    <select className="input" value={activityForm.priority} onChange={(e) => setActivityForm({ ...activityForm, priority: e.target.value })}>
                      <option value="Low">Baja</option><option value="Medium">Media</option><option value="High">Alta</option><option value="Critical">Crítica</option>
                    </select>
                  </label>
                </div>
                <label className="field"><span className="label">Costo estimado</span><input className="input" type="number" value={activityForm.estimatedCost} onChange={(e) => setActivityForm({ ...activityForm, estimatedCost: Number(e.target.value) })} /></label>
                <div className="actions">
                  <Button type="button" disabled={!activityForm.title || !activityForm.startDate || !activityForm.endDate || !activityForm.responsibleUser}
                    onClick={editingActivity ? () => void handleUpdateActivity() : () => void handleCreateActivity()}>
                    {editingActivity ? 'Guardar Cambios' : 'Crear Actividad'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowActivityForm(false)}>Cancelar</Button>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Actividad</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Responsable</th>
                  <th>Prioridad</th>
                  <th>Progreso</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr><td colSpan={8}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin actividades registradas</p></td></tr>
                ) : activities.map((a) => (
                  <tr key={a._id}>
                    <td><strong>{a.title}</strong>{a.description ? <br /> : null}<small className="muted">{a.description}</small></td>
                    <td>{formatDate(a.startDate)}</td>
                    <td>{formatDate(a.endDate)}</td>
                    <td>{a.responsibleUser ? a.responsibleUser.slice(-8) : '—'}</td>
                    <td><span className="badge badge--priority">{PRIORITY_LABELS[a.priority] || a.priority}</span></td>
                    <td>
                      <div className="objective-progress" style={{ minWidth: 120 }}>
                        <div className="objective-progress__track">
                          <span className="objective-progress__bar--medium" style={{ width: `${a.progress}%`, display: 'block', height: '100%', background: progressColor(a.progress) }} />
                        </div>
                        <strong>{a.progress}%</strong>
                      </div>
                    </td>
                    <td><span style={{ color: ACTIVITY_STATUS_COLORS[a.status], fontWeight: 600 }}>{a.status}</span></td>
                    <td>
                      <div className="actions">
                        <Button type="button" variant="secondary" onClick={() => { setEditingActivity(a); setActivityForm({ title: a.title, description: a.description || '', startDate: toDateInput(a.startDate), endDate: toDateInput(a.endDate), responsibleUser: a.responsibleUser, priority: a.priority, estimatedCost: a.estimatedCost }); setShowActivityForm(true); }}>
                          Editar
                        </Button>
                        <Button type="button" variant="danger" onClick={() => void handleDeleteActivity(a._id)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* TAB 3: Tareas - Kanban */}
      {tab === 'Tareas' ? (
        <div className="grid" style={{ gap: '1rem' }}>
          <div className="actions">
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <span className="label">Actividad:</span>
              <select className="input" value={selectedActivityId} onChange={(e) => setSelectedActivityId(e.target.value)} style={{ minWidth: 200 }}>
                <option value="">Seleccionar actividad</option>
                {activities.map((a) => <option key={a._id} value={a._id}>{a.title}</option>)}
              </select>
            </label>
            {selectedActivityId ? (
              <Button type="button" onClick={() => setShowTaskForm(true)}>+ Nueva Tarea</Button>
            ) : null}
          </div>

          {showTaskForm && selectedActivityId ? (
            <Card title="Nueva Tarea">
              <div className="form-grid">
                <input className="input" placeholder="Título" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
                <textarea className="input" placeholder="Descripción" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
                <div className="grid grid-2">
                  <label className="field"><span className="label">Inicio</span><input className="input" type="date" value={taskForm.startDate} onChange={(e) => setTaskForm({ ...taskForm, startDate: e.target.value })} /></label>
                  <label className="field"><span className="label">Vence</span><input className="input" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></label>
                </div>
                <label className="field"><span className="label">Asignado a</span><input className="input" placeholder="ID del usuario" value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })} /></label>
                <div className="actions">
                  <Button type="button" disabled={!taskForm.title || !taskForm.assignedTo || !taskForm.startDate || !taskForm.dueDate} onClick={() => void handleCreateTask()}>Crear Tarea</Button>
                  <Button type="button" variant="ghost" onClick={() => setShowTaskForm(false)}>Cancelar</Button>
                </div>
              </div>
            </Card>
          ) : null}

          {selectedActivityId ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              {['Pending', 'InProgress', 'Completed', 'Delayed'].map((colStatus) => (
                <div key={colStatus} className="card" style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
                  <h3 className="card-title" style={{
                    color: colStatus === 'Pending' ? '#f59e0b' : colStatus === 'InProgress' ? '#3b82f6' : colStatus === 'Completed' ? '#10b981' : '#ef4444',
                    borderBottom: `3px solid ${colStatus === 'Pending' ? '#f59e0b' : colStatus === 'InProgress' ? '#3b82f6' : colStatus === 'Completed' ? '#10b981' : '#ef4444'}`,
                    paddingBottom: '0.5rem',
                  }}>
                    {colStatus === 'Pending' ? 'Pendientes' : colStatus === 'InProgress' ? 'En Progreso' : colStatus === 'Completed' ? 'Completadas' : 'Retrasadas'}
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', opacity: 0.7 }}>({kanbanColumns[colStatus]?.length || 0})</span>
                  </h3>
                  {(kanbanColumns[colStatus] || []).map((task) => (
                    <article key={task._id} className="objective-card" style={{ cursor: 'pointer', padding: '0.75rem' }}
                      onClick={() => setDetailTaskId(task._id)}>
                      <strong>{task.title}</strong>
                      <p className="muted" style={{ fontSize: '0.85rem' }}>Asignado: {task.assignedTo.slice(-8)}</p>
                      <p className="muted" style={{ fontSize: '0.85rem' }}>Vence: {formatDate(task.dueDate)}</p>
                      <div className="objective-progress">
                        <div className="objective-progress__track">
                          <span className="objective-progress__bar--medium" style={{ width: `${task.progress}%`, display: 'block', height: '100%', background: progressColor(task.progress) }} />
                        </div>
                        <strong style={{ fontSize: '0.85rem' }}>{task.progress}%</strong>
                      </div>
                      {colStatus !== 'Completed' ? (
                        <div className="actions" style={{ marginTop: '0.25rem' }}>
                          {colStatus === 'Pending' ? (
                            <Button type="button" variant="secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                              onClick={(e) => { e.stopPropagation(); void handleUpdateTaskStatus(task._id, 'InProgress'); }}>Iniciar</Button>
                          ) : null}
                          {colStatus === 'Delayed' ? (
                            <Button type="button" variant="secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                              onClick={(e) => { e.stopPropagation(); void handleUpdateTaskStatus(task._id, 'InProgress'); }}>Reabrir</Button>
                          ) : null}
                          {colStatus === 'InProgress' ? (
                            <Button type="button" variant="secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                              onClick={(e) => { e.stopPropagation(); void handleUpdateTaskStatus(task._id, 'Completed'); }}>Completar</Button>
                          ) : null}
                          <Button type="button" variant="danger" style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                            onClick={(e) => { e.stopPropagation(); void handleDeleteTask(task._id); }}>×</Button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {(!kanbanColumns[colStatus] || kanbanColumns[colStatus].length === 0) ? (
                    <p className="muted" style={{ textAlign: 'center', padding: '1rem', fontSize: '0.85rem' }}>Sin tareas</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <Card><p className="muted">Selecciona una actividad para ver sus tareas.</p></Card>
          )}
        </div>
      ) : null}

      {/* Task Detail Drawer */}
      {detailTask && plan ? (
        <Sheet open={!!detailTaskId} title={`Tarea: ${detailTask.title}`} description={`Estado: ${detailTask.status} · Progreso: ${detailTask.progress}%`} onOpenChange={() => setDetailTaskId(null)}>
          <div className="advanced-management" style={{ padding: '0.5rem' }}>
            <section className="advanced-management__section">
              <h3>Detalles</h3>
              <p><strong>Descripción:</strong> {detailTask.description || 'Sin descripción'}</p>
              <p><strong>Asignado a:</strong> {detailTask.assignedTo}</p>
              <p><strong>Inicio:</strong> {formatDate(detailTask.startDate)}</p>
              <p><strong>Vence:</strong> {formatDate(detailTask.dueDate)}</p>
              <div className="objective-progress">
                <span className="label">Progreso:</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <button key={pct} type="button"
                      className={`btn ${detailTask.progress === pct ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
                      onClick={() => void handleUpdateTaskProgress(detailTask._id, pct)}>
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="actions">
                {detailTask.status !== 'Completed' ? (
                  <Button type="button" variant="secondary" onClick={() => void handleUpdateTaskStatus(detailTask._id, 'Completed')}>Marcar Completada</Button>
                ) : null}
                {detailTask.status === 'Delayed' ? (
                  <Button type="button" variant="secondary" onClick={() => setShowJustificationForm(true)}>Justificar Retraso</Button>
                ) : null}
              </div>
            </section>

            {/* Subtasks */}
            <section className="advanced-management__section">
              <h3>Subtareas</h3>
              <div className="advanced-management__checklist">
                {subtasks.map((s) => (
                  <div key={s._id} className="advanced-management__check">
                    <input type="checkbox" checked={s.completed} onChange={(e) => void handleToggleSubtask(s._id, e.target.checked)} />
                    <span style={{ textDecoration: s.completed ? 'line-through' : 'none' }}>{s.title}</span>
                    <Button type="button" variant="ghost" style={{ padding: '0.1rem 0.3rem', fontSize: '0.8rem' }}
                      onClick={() => void handleDeleteSubtask(s._id)}>×</Button>
                  </div>
                ))}
                {subtasks.length === 0 ? <p className="muted">Sin subtareas</p> : null}
              </div>
              <div className="actions">
                <input className="input" style={{ flex: 1 }} placeholder="Nueva subtarea" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} />
                <Button type="button" disabled={!subtaskTitle} onClick={() => void handleAddSubtask()}>Agregar</Button>
              </div>
            </section>

            {/* Evidence */}
            <section className="advanced-management__section">
              <h3>Evidencias</h3>
              {evidence.map((ev) => (
                <div key={ev._id} className="advanced-list__item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{ev.fileType}</strong>
                    <p className="muted">{formatDate(ev.uploadDate)}</p>
                  </div>
                  <div className="actions">
                    <a className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }} href={ev.fileUrl} target="_blank" rel="noreferrer">Ver</a>
                    <Button type="button" variant="danger" style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }} onClick={() => void handleDeleteEvidence(ev._id)}>×</Button>
                  </div>
                </div>
              ))}
              {evidence.length === 0 ? <p className="muted">Sin evidencias</p> : null}
              <div className="actions">
                <input className="input" style={{ flex: 1 }} placeholder="URL del archivo" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
                <select className="input" style={{ width: 120 }} value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>
                  <option value="document">Documento</option>
                  <option value="image">Imagen</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                </select>
                <Button type="button" disabled={!evidenceUrl} onClick={() => void handleAddEvidence()}>Agregar</Button>
              </div>
            </section>

            {/* Comments */}
            <section className="advanced-management__section">
              <h3>Comentarios</h3>
              {detailTask.comments?.length > 0 ? detailTask.comments.map((c, i) => (
                <p key={i} className="muted" style={{ borderLeft: '3px solid #2563eb', paddingLeft: '0.5rem' }}>{c}</p>
              )) : <p className="muted">Sin comentarios</p>}
            </section>

            {/* Justifications */}
            <section className="advanced-management__section">
              <h3>Justificaciones</h3>
              {justifications.map((j) => (
                <article key={j._id} className="advanced-list__item">
                  <p><strong>Razón:</strong> {j.reason}</p>
                  {j.correctiveAction ? <p><strong>Acción correctiva:</strong> {j.correctiveAction}</p> : null}
                  {j.newDueDate ? <p><strong>Nueva fecha:</strong> {formatDate(j.newDueDate)}</p> : null}
                  <p><strong>Estado:</strong> <span style={{ color: j.approvalStatus === 'Approved' ? '#10b981' : j.approvalStatus === 'Rejected' ? '#ef4444' : '#f59e0b' }}>{j.approvalStatus}</span></p>
                  {j.approvalStatus === 'Pending' ? (
                    <div className="actions">
                      <Button type="button" variant="secondary" style={{ fontSize: '0.85rem' }} onClick={() => void handleApproveJustification(j._id, true)}>Aprobar</Button>
                      <Button type="button" variant="danger" style={{ fontSize: '0.85rem' }} onClick={() => void handleApproveJustification(j._id, false)}>Rechazar</Button>
                    </div>
                  ) : null}
                </article>
              ))}
              {justifications.length === 0 ? <p className="muted">Sin justificaciones</p> : null}

              {showJustificationForm ? (
                <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                  <textarea className="input" placeholder="Razón del retraso (obligatorio)" value={justificationReason} onChange={(e) => setJustificationReason(e.target.value)} />
                  <input className="input" placeholder="Acción correctiva" value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} />
                  <label className="field"><span className="label">Nueva fecha de vencimiento</span><input className="input" type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} /></label>
                  <div className="actions">
                    <Button type="button" disabled={!justificationReason} onClick={() => void handleAddJustification()}>Enviar Justificación</Button>
                    <Button type="button" variant="ghost" onClick={() => setShowJustificationForm(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </Sheet>
      ) : null}

      {/* TAB 4: Cronograma (Gantt) */}
      {tab === 'Cronograma' ? (
        <Card>
          <h3 className="card-title">Cronograma Anual</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Actividad</th>
                  {MONTHS.map((m) => <th key={m} style={{ textAlign: 'center', fontSize: '0.75rem' }}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {ganttData.length === 0 ? (
                  <tr><td colSpan={13}><p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin actividades para mostrar</p></td></tr>
                ) : ganttData.map((g) => (
                  <tr key={g.id}>
                    <td><strong>{g.title}</strong><br /><small className="muted" style={{ color: ACTIVITY_STATUS_COLORS[g.status] }}>{g.status}</small></td>
                    {MONTHS.map((_, i) => {
                      const isActive = i >= g.startMonth && i < g.startMonth + g.duration;
                      return (
                        <td key={i} style={{
                          textAlign: 'center',
                          background: isActive ? ACTIVITY_STATUS_COLORS[g.status] || '#3b82f6' : '#f8fafc',
                          color: isActive ? '#fff' : 'transparent',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          minWidth: 48,
                          width: 48,
                        }}>
                          {isActive ? '█' : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* TAB 5: Evidencias */}
      {tab === 'Evidencias' ? (
        <div className="grid" style={{ gap: '1rem' }}>
          <Card>
            <h3 className="card-title">Evidencias por Actividad</h3>
            <p className="muted">Selecciona una actividad y tarea para ver las evidencias cargadas.</p>
          </Card>
          {activities.map((a) => (
            <details key={a._id} className="card" style={{ cursor: 'pointer' }}>
              <summary style={{ fontWeight: 600 }}>{a.title} ({tasks.filter((t) => t.activityId === a._id).length} tareas)</summary>
              <div style={{ marginTop: '0.75rem' }}>
                {tasks.filter((t) => t.activityId === a._id).length === 0 ? (
                  <p className="muted">Sin tareas</p>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      ) : null}

      {/* TAB 6: Alertas */}
      {tab === 'Alertas' ? (
        <div className="grid grid-3">
          <Card><h3 className="card-title">Tareas Próximas</h3><p style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6' }}>{kpis.upcomingTasks}</p><p className="muted">Con fecha límite futura</p></Card>
          <Card><h3 className="card-title">Tareas Vencidas</h3><p style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>{kpis.delayedTasks}</p><p className="muted">Requieren atención inmediata</p></Card>
          <Card><h3 className="card-title">Críticas</h3><p style={{ fontSize: '2rem', fontWeight: 800, color: '#dc2626' }}>{activities.filter((a) => a.priority === 'Critical').length}</p><p className="muted">Actividades de prioridad crítica</p></Card>
          <Card>
            <h3 className="card-title">Acciones</h3>
            <div className="actions">
              <Button type="button" onClick={() => void handleProcessAutoStatus()}>Procesar Alertas Automáticas</Button>
              <Button type="button" variant="secondary" onClick={() => void handleRecalculate()}>Recalcular Cumplimiento</Button>
            </div>
          </Card>
          <Card>
            <h3 className="card-title">Tareas Retrasadas</h3>
            {tasks.filter((t) => t.status === 'Delayed' || (t.status !== 'Completed' && new Date(t.dueDate) < new Date())).map((t) => (
              <article key={t._id} className="advanced-list__item" style={{ marginBottom: '0.5rem' }}>
                <strong>{t.title}</strong>
                <p className="muted">Vence: {formatDate(t.dueDate)} · Progreso: {t.progress}%</p>
              </article>
            ))}
            {tasks.filter((t) => t.status === 'Delayed').length === 0 ? <p className="muted">Sin tareas retrasadas</p> : null}
          </Card>
        </div>
      ) : null}

      {/* TAB 7: Dashboard */}
      {tab === 'Dashboard' ? (
        <div className="grid" style={{ gap: '1.1rem' }}>
          <div className="kpi-grid">
            <KpiCard title="Cumplimiento General" value={`${plan?.compliancePercentage ?? 0}%`} />
            <KpiCard title="Tareas Completadas" value={kpis.completedTasks} />
            <KpiCard title="Tareas Retrasadas" value={kpis.delayedTasks} />
            <KpiCard title="Tareas Próximas" value={kpis.upcomingTasks} />
            <KpiCard title="Total Tareas" value={kpis.totalTasks} />
            <KpiCard title="Actividades Críticas" value={activities.filter((a) => a.priority === 'Critical').length} />
          </div>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <Card>
              <h3 className="card-title">Distribución por Estado</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={chartData.statusDistribution.filter((d) => d.value > 0)} dataKey="value" nameKey="name" outerRadius={90} label>
                      {chartData.statusDistribution.filter((d) => d.value > 0).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <h3 className="card-title">Actividades por Mes</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData.monthlyActivities}>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="activities" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <h3 className="card-title">Progreso de Objetivos</h3>
            <div className="grid" style={{ gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="label">Cumplimiento General</span>
                  <strong>{plan?.compliancePercentage ?? 0}%</strong>
                </div>
                <div className="objective-progress__track" style={{ height: '1rem' }}>
                  <span className={`objective-progress__bar ${(plan?.compliancePercentage ?? 0) >= 70 ? 'objective-progress__bar--high' : (plan?.compliancePercentage ?? 0) >= 40 ? 'objective-progress__bar--medium' : 'objective-progress__bar--low'}`}
                    style={{ width: `${plan?.compliancePercentage ?? 0}%`, display: 'block', height: '100%' }} />
                </div>
              </div>
              {activities.map((a) => (
                <div key={a._id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{a.title}</span>
                    <strong>{a.progress}%</strong>
                  </div>
                  <div className="objective-progress__track" style={{ height: '0.65rem' }}>
                    <span className="objective-progress__bar--medium"
                      style={{ width: `${a.progress}%`, display: 'block', height: '100%', background: progressColor(a.progress) }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {/* TAB 8: Firma Gerencial */}
      {tab === 'Firma Gerencial' ? (
        <Card>
          <h3 className="card-title">Aprobación Gerencial con Firma Digital</h3>
          {plan?.approval ? (
            <div className="advanced-management__success">
              <p><strong>Plan aprobado</strong></p>
              <p>Aprobado por: {plan.approval.approvedByName} ({plan.approval.approvedByEmail})</p>
              <p>Fecha: {formatDate(plan.approval.approvalDate)}</p>
              {plan.approval.comments ? <p>Comentarios: {plan.approval.comments}</p> : null}
              {plan.approval.signatureHash ? <p>✓ Firma digital: {plan.approval.signatureHash.slice(0, 20)}...</p> : null}
              {plan.approval.signatureUrl ? <p>URL firma: {plan.approval.signatureUrl}</p> : null}
            </div>
          ) : (
            <div className="form-grid" style={{ maxWidth: 480 }}>
              <p className="muted">El manager debe aprobar el plan anual para activarlo.</p>
              <label className="field"><span className="label">Nombre del firmante</span>
                <input className="input" placeholder="Nombre del gerente" value={approvalForm.approvedByName}
                  onChange={(e) => setApprovalForm({ ...approvalForm, approvedByName: e.target.value })} />
              </label>
              <label className="field"><span className="label">Correo del firmante</span>
                <input className="input" type="email" placeholder="gerente@empresa.com" value={approvalForm.approvedByEmail}
                  onChange={(e) => setApprovalForm({ ...approvalForm, approvedByEmail: e.target.value })} />
              </label>
              <label className="field"><span className="label">Comentarios</span>
                <textarea className="input" placeholder="Comentarios opcionales" value={approvalForm.comments}
                  onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })} />
              </label>
              <div className="actions">
                <Button type="button" disabled={!approvalForm.approvedByName || !approvalForm.approvedByEmail}
                  onClick={() => void handleApprovePlan()}>
                  Firmar Digitalmente y Aprobar
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {/* TAB 9: Historial */}
      {tab === 'Historial' ? (
        <Card>
          <h3 className="card-title">Historial de Cambios</h3>
          <div className="timeline">
            {history.length === 0 ? (
              <p className="muted">Sin cambios registrados</p>
            ) : history.map((h) => (
              <article key={h._id} className="timeline__item">
                <strong>{h.action}</strong>
                <p className="muted">{h.userEmail || 'Sistema'} · {formatDate(h.timestamp)}</p>
                {h.previousValue || h.newValue ? (
                  <p style={{ fontSize: '0.85rem' }}>
                    {h.previousValue ? <span style={{ color: '#ef4444' }}>← {h.previousValue}</span> : null}
                    {h.previousValue && h.newValue ? ' → ' : null}
                    {h.newValue ? <span style={{ color: '#10b981' }}>{h.newValue.length > 100 ? h.newValue.slice(0, 100) + '...' : h.newValue}</span> : null}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function KpiCard({ title, value }: { title: string; value: string | number }) {
  return (
    <article className="card kpi-card">
      <h3 className="kpi-title">{title}</h3>
      <p className="kpi-value">{value}</p>
    </article>
  );
}
