import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from './ui/Button';
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  CommunicationModel,
  CommunicationDashboardModel,
  CommunicationAutoComplianceModel,
  CommunicationRecipientModel,
  CommunicationReadReceiptModel,
  CommunicationSignatureModel,
  CommunicationCampaignModel,
  CommunicationSurveyModel,
  CommunicationSurveyResponseModel,
  CommunicationMailboxModel,
  CommunicationType,
  CommunicationPriority,
  CommunicationStatus,
  TargetAudienceType,
  CommunicationCampaignStatus,
  SurveyQuestionType,
  SurveyStatus,
  MailboxType,
  MailboxStatus,
  ResponsableSstComplianceStatus,
  EmployeeModel,
  fetchCommunicationDashboard,
  fetchCommunicationAutoCompliance,
  fetchCommunications,
  createCommunication,
  updateCommunication,
  publishCommunication,
  archiveCommunication,
  deleteCommunication,
  fetchCommunicationRecipients,
  addCommunicationRecipients,
  registerCommunicationRead,
  fetchCommunicationReadReceipts,
  signCommunication,
  fetchCommunicationSignatures,
  fetchCommunicationCampaigns,
  createCommunicationCampaign,
  updateCommunicationCampaign,
  deleteCommunicationCampaign,
  fetchSurveys,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  submitSurveyResponse,
  fetchSurveyResults,
  fetchMailbox,
  createMailboxEntry,
  respondMailbox,
  deleteMailboxEntry,
  fetchCommunicationHistory,
  triggerCommunicationAlerts,
  fetchEmployees,
} from '../api';

function toDateInputValue(value?: string | Date) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function statusBadgeClass(status: string) {
  if (status === 'PUBLISHED' || status === 'ACTIVE' || status === 'RESOLVED') return 'advanced-management__badge advanced-management__badge--success';
  if (status === 'DRAFT' || status === 'PENDING') return 'advanced-management__badge advanced-management__badge--warning';
  if (status === 'ARCHIVED' || status === 'CANCELLED' || status === 'CLOSED') return 'advanced-management__badge advanced-management__badge--danger';
  return 'advanced-management__badge';
}

function typeLabel(t: CommunicationType) {
  const labels: Record<string, string> = {
    ANNOUNCEMENT: 'Anuncio', CIRCULAR: 'Circular', BULLETIN: 'Boletín',
    CAMPAIGN: 'Campaña', EMERGENCY_NOTICE: 'Aviso Emergencia',
    POLICY_COMMUNICATION: 'Comunicación Política', PROCEDURE_COMMUNICATION: 'Comunicación Procedimiento',
    TRAINING_COMMUNICATION: 'Comunicación Capacitación',
  };
  return labels[t] ?? t;
}

function statusLabel(s: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Borrador', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado',
    PENDING: 'Pendiente', UNDER_REVIEW: 'En revisión', RESOLVED: 'Resuelto',
    CLOSED: 'Cerrado', ACTIVE: 'Activa', COMPLETED: 'Completada',
    CANCELLED: 'Cancelada', READ: 'Leído',
  };
  return labels[s] ?? s;
}

function priorityLabel(p: string) {
  const labels: Record<string, string> = {
    INFORMATIVE: 'Informativa', IMPORTANT: 'Importante', URGENT: 'Urgente', CRITICAL: 'Crítica',
  };
  return labels[p] ?? p;
}

function audienceLabel(a: string) {
  const labels: Record<string, string> = {
    ALL_COMPANY: 'Toda la empresa', AREA: 'Área', POSITION: 'Cargo',
    INDIVIDUAL: 'Individual', COPASST: 'COPASST', COMMITTEE: 'Comité',
    BRIGADE: 'Brigada', MANAGERS: 'Gerentes', SST_TEAM: 'Equipo SST',
  };
  return labels[a] ?? a;
}

function typeBadge(t: CommunicationType) {
  const colors: Record<string, string> = {
    ANNOUNCEMENT: 'doc-type-badge--policy', CIRCULAR: 'doc-type-badge--procedure',
    BULLETIN: 'doc-type-badge--format', CAMPAIGN: 'doc-type-badge--campaign',
    EMERGENCY_NOTICE: 'doc-type-badge--inspection', POLICY_COMMUNICATION: 'doc-type-badge--policy',
    PROCEDURE_COMMUNICATION: 'doc-type-badge--procedure', TRAINING_COMMUNICATION: 'doc-type-badge--training',
  };
  return `doc-type-badge ${colors[t] ?? 'doc-type-badge--default'}`;
}

function priorityBadge(p: CommunicationPriority) {
  const cls = p === 'CRITICAL' ? 'doc-type-badge--inspection' : p === 'URGENT' ? 'doc-type-badge--audit' : p === 'IMPORTANT' ? 'doc-type-badge--policy' : 'doc-type-badge--default';
  return `doc-type-badge ${cls}`;
}

const mailboxTypeLabels: Record<string, string> = {
  SUGGESTION: 'Sugerencia', COMPLAINT: 'Queja', UNSAFE_ACT: 'Acto Inseguro',
  UNSAFE_CONDITION: 'Condición Insegura', IMPROVEMENT_IDEA: 'Idea de Mejora', REPORT: 'Reporte',
};

const commTypeOptions: CommunicationType[] = ['ANNOUNCEMENT', 'CIRCULAR', 'BULLETIN', 'CAMPAIGN', 'EMERGENCY_NOTICE', 'POLICY_COMMUNICATION', 'PROCEDURE_COMMUNICATION', 'TRAINING_COMMUNICATION'];
const priorityOptions: CommunicationPriority[] = ['INFORMATIVE', 'IMPORTANT', 'URGENT', 'CRITICAL'];
const audienceOptions: TargetAudienceType[] = ['ALL_COMPANY', 'AREA', 'POSITION', 'INDIVIDUAL', 'COPASST', 'COMMITTEE', 'BRIGADE', 'MANAGERS', 'SST_TEAM'];
const mailboxTypeOptions: MailboxType[] = ['SUGGESTION', 'COMPLAINT', 'UNSAFE_ACT', 'UNSAFE_CONDITION', 'IMPROVEMENT_IDEA', 'REPORT'];

function SurveyQuestionEditor({ questions, onChange, readOnly }: { questions: Array<{ questionId: string; questionText: string; questionType: SurveyQuestionType; options: string[]; required: boolean }>; onChange: (qs: typeof questions) => void; readOnly?: boolean }) {
  const addQuestion = () => {
    onChange([...questions, { questionId: `q-${Date.now()}`, questionText: '', questionType: 'SINGLE_CHOICE' as SurveyQuestionType, options: [''], required: true }]);
  };
  const updateQuestion = (idx: number, patch: Partial<typeof questions[0]>) => {
    const next = [...questions];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const removeQuestion = (idx: number) => {
    onChange(questions.filter((_, i) => i !== idx));
  };
  return <div className="form-grid">{questions.map((q, idx) => <fieldset key={q.questionId} className="advanced-management__section" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
    <div className="actions" style={{ justifyContent: 'space-between' }}><strong>Pregunta {idx + 1}</strong>{!readOnly ? <Button type="button" variant="danger" onClick={() => removeQuestion(idx)}>Eliminar</Button> : null}</div>
    <label className="field"><span className="label">Texto</span><input className="input" disabled={readOnly} value={q.questionText} onChange={(e) => updateQuestion(idx, { questionText: e.target.value })} /></label>
    <label className="field"><span className="label">Tipo</span><select className="input" disabled={readOnly} value={q.questionType} onChange={(e) => updateQuestion(idx, { questionType: e.target.value as SurveyQuestionType })}><option value="SINGLE_CHOICE">Selección única</option><option value="MULTIPLE_CHOICE">Selección múltiple</option><option value="OPEN_TEXT">Texto abierto</option></select></label>
    {q.questionType !== 'OPEN_TEXT' ? <label className="field"><span className="label">Opciones (una por línea)</span><textarea className="input" rows={3} disabled={readOnly} value={q.options.join('\n')} onChange={(e) => updateQuestion(idx, { options: e.target.value.split('\n').filter((o) => o.trim()) })} /></label> : null}
    <label className="field"><label><input type="checkbox" disabled={readOnly} checked={q.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} /> Obligatoria</label></label>
  </fieldset>)}<Button type="button" disabled={readOnly} onClick={addQuestion}>+ Agregar pregunta</Button></div>;
}

function CommunicationReadSheet({ token, comm, onClose }: { token: string; comm: CommunicationModel; onClose: () => void }) {
  const [recipients, setRecipients] = useState<CommunicationRecipientModel[]>([]);
  const [receipts, setReceipts] = useState<CommunicationReadReceiptModel[]>([]);
  const [signatures, setSignatures] = useState<CommunicationSignatureModel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!comm) return;
    setLoading(true);
    Promise.all([
      fetchCommunicationRecipients(token, comm._id).catch(() => []),
      fetchCommunicationReadReceipts(token, comm._id).catch(() => []),
      fetchCommunicationSignatures(token, comm._id).catch(() => []),
    ]).then(([r, rc, s]) => { setRecipients(r); setReceipts(rc); setSignatures(s); }).finally(() => setLoading(false));
  }, [comm, token]);

  const readCount = receipts.length;
  const totalCount = recipients.length;
  const signedCount = signatures.length;

  return <div className="advanced-management" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
    <section className="advanced-management__hero"><div><h3>{comm.title}</h3><p className="muted">{typeLabel(comm.communicationType)} · {comm.priority}</p></div><span className={statusBadgeClass(comm.status)}>{statusLabel(comm.status)}</span></section>
    {loading ? <p className="muted">Cargando detalles...</p> : null}
    {comm.body ? <section className="advanced-management__section"><h3>Contenido</h3><p>{comm.body}</p></section> : null}
    {comm.attachmentUrls?.length ? <section className="advanced-management__section"><h3>Adjuntos</h3><div className="actions">{comm.attachmentUrls.map((url, i) => <a key={i} className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">Adjunto {i + 1}</a>)}</div></section> : null}

    <section className="advanced-management__section"><h3>Analíticas de Lectura</h3>
      <div className="advanced-doc-grid">
        <article className="doc-stat-card doc-stat-card--info"><span className="doc-stat-card__label">Total Destinatarios</span><span className="doc-stat-card__value">{totalCount}</span></article>
        <article className="doc-stat-card doc-stat-card--good"><span className="doc-stat-card__label">Leído</span><span className="doc-stat-card__value">{readCount}</span></article>
        <article className={`doc-stat-card ${readCount < totalCount ? 'doc-stat-card--danger' : 'doc-stat-card--info'}`}><span className="doc-stat-card__label">Sin Leer</span><span className="doc-stat-card__value">{totalCount - readCount}</span></article>
        <article className="doc-stat-card doc-stat-card--info"><span className="doc-stat-card__label">% Lectura</span><span className="doc-stat-card__value">{totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0}%</span></article>
        <article className="doc-stat-card doc-stat-card--good"><span className="doc-stat-card__label">Firmas</span><span className="doc-stat-card__value">{signedCount}</span></article>
      </div>
    </section>

    {recipients.length ? <section className="advanced-management__section"><h3>Destinatarios ({recipients.length})</h3>
      <div className="responsive-table"><table className="table"><thead><tr><th>Empleado</th><th>Estado</th><th>Entregado</th><th>Leído</th><th>Firmado</th></tr></thead>
        <tbody>{recipients.map((r) => <tr key={r._id}><td>{r.employeeName || r.employeeId}</td><td><span className={statusBadgeClass(r.status)}>{r.status}</span></td><td>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : '—'}</td><td>{r.readAt ? new Date(r.readAt).toLocaleString() : '—'}</td><td>{r.signedAt ? new Date(r.signedAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div>
    </section> : null}

    {receipts.length ? <section className="advanced-management__section"><h3>Comprobantes de Lectura</h3>
      <div className="responsive-table"><table className="table"><thead><tr><th>Empleado</th><th>Fecha</th><th>Hora</th></tr></thead>
        <tbody>{receipts.map((r) => <tr key={r._id}><td>{r.employeeName}</td><td>{r.readDate}</td><td>{r.readTime}</td></tr>)}</tbody></table></div>
    </section> : null}

    {signatures.length ? <section className="advanced-management__section"><h3>Firmas ({signatures.length})</h3>
      <div className="responsive-table"><table className="table"><thead><tr><th>Empleado</th><th>Email</th><th>Fecha</th><th>Comentarios</th></tr></thead>
        <tbody>{signatures.map((s) => <tr key={s._id}><td>{s.employeeName}</td><td>{s.employeeEmail || '—'}</td><td>{new Date(s.signatureDate).toLocaleString()}</td><td>{s.comments || '—'}</td></tr>)}</tbody></table></div>
    </section> : null}

    <div className="advanced-management__footer"><Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button></div>
  </div>;
}

export default function CommunicationAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; onSaved: () => void }) {
  const [tab, setTab] = useState('Panel');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dirty, setDirty] = useState(false);

  // Data states
  const [dashboard, setDashboard] = useState<CommunicationDashboardModel | null>(null);
  const [autoCompliance, setAutoCompliance] = useState<CommunicationAutoComplianceModel | null>(null);
  const [comms, setComms] = useState<CommunicationModel[]>([]);
  const [campaigns, setCampaigns] = useState<CommunicationCampaignModel[]>([]);
  const [surveys, setSurveys] = useState<CommunicationSurveyModel[]>([]);
  const [mailbox, setMailbox] = useState<CommunicationMailboxModel[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);

  // Filters
  const [commFilter, setCommFilter] = useState({ type: '', priority: '', audience: '', status: '' });
  const [mailboxFilter, setMailboxFilter] = useState('');

  // Detail sheet
  const [selectedComm, setSelectedComm] = useState<CommunicationModel | null>(null);

  // Form: Create communication
  const [showCommForm, setShowCommForm] = useState(false);
  const [commForm, setCommForm] = useState<Partial<CommunicationModel>>({ title: '', body: '', communicationType: 'ANNOUNCEMENT', priority: 'INFORMATIVE', targetAudience: 'ALL_COMPANY', targetIds: [], requiresSignature: false });
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);

  // Form: Create campaign
  const [showCampForm, setShowCampForm] = useState(false);
  const [campForm, setCampForm] = useState<Partial<CommunicationCampaignModel>>({ name: '', description: '', status: 'DRAFT' as CommunicationCampaignStatus, tags: [] });
  const [campTags, setCampTags] = useState('');

  // Form: Create survey
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [surveyForm, setSurveyForm] = useState<Partial<CommunicationSurveyModel>>({ title: '', description: '', status: 'DRAFT' as SurveyStatus });
  const [surveyQuestions, setSurveyQuestions] = useState<Array<{ questionId: string; questionText: string; questionType: SurveyQuestionType; options: string[]; required: boolean }>>([]);

  // Survey results
  const [surveyResults, setSurveyResults] = useState<{ survey: CommunicationSurveyModel; totalResponses: number; stats: any[] } | null>(null);
  const [selectedSurveyId, setSelectedSurveyId] = useState('');

  // Mailbox response
  const [respondModalId, setRespondModalId] = useState('');
  const [respondText, setRespondText] = useState('');

  // Form: Mailbox
  const [showMailboxForm, setShowMailboxForm] = useState(false);
  const [mailboxForm, setMailboxForm] = useState({ mailboxType: 'SUGGESTION' as MailboxType, subject: '', message: '', isAnonymous: false });

  const notify = (msg: string) => { setSuccess(msg); window.setTimeout(() => setSuccess(''), 2800); };
  const showError = (msg: string) => { setError(msg); window.setTimeout(() => setError(''), 4000); };

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  // ========== LOAD DATA ==========
  const loadAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [d, ac, c, ca, s, m, e, h] = await Promise.all([
        fetchCommunicationDashboard(token).catch(() => null),
        fetchCommunicationAutoCompliance(token).catch(() => null),
        fetchCommunications(token).catch(() => [] as CommunicationModel[]),
        fetchCommunicationCampaigns(token).catch(() => [] as CommunicationCampaignModel[]),
        fetchSurveys(token).catch(() => [] as CommunicationSurveyModel[]),
        fetchMailbox(token).catch(() => [] as CommunicationMailboxModel[]),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
        fetchCommunicationHistory(token).catch(() => []),
      ]);
      if (d) setDashboard(d);
      if (ac) setAutoCompliance(ac);
      setComms(c);
      setCampaigns(ca);
      setSurveys(s);
      setMailbox(m);
      setEmployees(e);
      setHistory(h);
      if (ac) onComplianceChange(ac.complies ? 'COMPLIES' : ac.score >= 2 ? 'PENDING' : 'NON_COMPLIANT');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally { setLoading(false); }
  }, [token, onComplianceChange]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    const interval = setInterval(() => { void loadAll(); }, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // ========== COMPUTED ==========
  const filteredComms = useMemo(() => {
    return comms.filter((c) => {
      if (commFilter.type && c.communicationType !== commFilter.type) return false;
      if (commFilter.priority && c.priority !== commFilter.priority) return false;
      if (commFilter.audience && c.targetAudience !== commFilter.audience) return false;
      if (commFilter.status && c.status !== commFilter.status) return false;
      return true;
    });
  }, [comms, commFilter]);

  const filteredMailbox = useMemo(() => {
    return mailboxFilter ? mailbox.filter((m) => m.status === mailboxFilter) : mailbox;
  }, [mailbox, mailboxFilter]);

  const complianceUi = useMemo(() => {
    if (!autoCompliance) return { label: '⚠ Pendiente', className: 'advanced-management__badge advanced-management__badge--warning' };
    if (autoCompliance.complies) return { label: '✅ Cumple', className: 'advanced-management__badge advanced-management__badge--success' };
    if (autoCompliance.score >= 2) return { label: '⚠ Pendiente', className: 'advanced-management__badge advanced-management__badge--warning' };
    return { label: '❌ No cumple', className: 'advanced-management__badge advanced-management__badge--danger' };
  }, [autoCompliance]);

  const markDirty = () => { setDirty(true); setError(''); };

  // ========== COMMUNICATIONS CRUD ==========
  const handleCreateComm = async () => {
    if (!commForm.title?.trim()) { showError('El título es obligatorio'); return; }
    setLoading(true);
    try {
      const created = await createCommunication(token, commForm);
      if (selectedRecipientIds.length > 0) {
        await addCommunicationRecipients(token, created._id, selectedRecipientIds);
      }
      setShowCommForm(false);
      setCommForm({ title: '', body: '', communicationType: 'ANNOUNCEMENT', priority: 'INFORMATIVE', targetAudience: 'ALL_COMPANY', targetIds: [], requiresSignature: false });
      setSelectedRecipientIds([]);
      notify('Comunicación creada exitosamente');
      onSaved();
      await loadAll();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error al crear'); }
    finally { setLoading(false); }
  };

  const handlePublishComm = async (id: string) => {
    try { await publishCommunication(token, id); notify('Comunicación publicada'); await loadAll(); onSaved(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error al publicar'); }
  };

  const handleArchiveComm = async (id: string) => {
    try { await archiveCommunication(token, id); notify('Comunicación archivada'); await loadAll(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error al archivar'); }
  };

  const handleDeleteComm = async (id: string) => {
    if (!confirm('¿Eliminar esta comunicación?')) return;
    try { await deleteCommunication(token, id); notify('Comunicación eliminada'); await loadAll(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error al eliminar'); }
  };

  // ========== CAMPAIGNS CRUD ==========
  const handleCreateCamp = async () => {
    if (!campForm.name?.trim()) { showError('El nombre es obligatorio'); return; }
    setLoading(true);
    try {
      await createCommunicationCampaign(token, { ...campForm, tags: campTags.split(',').map((t) => t.trim()).filter(Boolean) });
      setShowCampForm(false);
      setCampForm({ name: '', description: '', status: 'DRAFT' as CommunicationCampaignStatus, tags: [] });
      setCampTags('');
      notify('Campaña creada');
      await loadAll();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  };

  const handleUpdateCampStatus = async (id: string, status: CommunicationCampaignStatus) => {
    try { await updateCommunicationCampaign(token, id, { status }); notify('Campaña actualizada'); await loadAll(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleDeleteCamp = async (id: string) => {
    if (!confirm('¿Eliminar campaña?')) return;
    try { await deleteCommunicationCampaign(token, id); notify('Campaña eliminada'); await loadAll(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  // ========== SURVEYS CRUD ==========
  const handleCreateSurvey = async () => {
    if (!surveyForm.title?.trim()) { showError('El título es obligatorio'); return; }
    if (!surveyQuestions.length) { showError('Agrega al menos una pregunta'); return; }
    setLoading(true);
    try {
      await createSurvey(token, { ...surveyForm, questions: surveyQuestions });
      setShowSurveyForm(false);
      setSurveyForm({ title: '', description: '', status: 'DRAFT' as SurveyStatus });
      setSurveyQuestions([]);
      notify('Encuesta creada');
      await loadAll();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  };

  const handleViewSurveyResults = async (surveyId: string) => {
    setSelectedSurveyId(surveyId);
    try {
      const results = await fetchSurveyResults(token, surveyId);
      setSurveyResults(results);
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleToggleSurveyStatus = async (id: string, status: SurveyStatus) => {
    try { await updateSurvey(token, id, { status }); notify('Encuesta actualizada'); await loadAll(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleDeleteSurvey = async (id: string) => {
    if (!confirm('¿Eliminar encuesta?')) return;
    try { await deleteSurvey(token, id); notify('Encuesta eliminada'); await loadAll(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  // ========== MAILBOX ==========
  const handleCreateMailbox = async () => {
    if (!mailboxForm.subject.trim() || !mailboxForm.message.trim()) { showError('Asunto y mensaje obligatorios'); return; }
    setLoading(true);
    try {
      await createMailboxEntry(token, mailboxForm);
      setShowMailboxForm(false);
      setMailboxForm({ mailboxType: 'SUGGESTION', subject: '', message: '', isAnonymous: false });
      notify('Reporte enviado');
      await loadAll();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  };

  const handleRespondMailbox = async () => {
    if (!respondText.trim()) { showError('La respuesta es obligatoria'); return; }
    try {
      await respondMailbox(token, respondModalId, respondText, 'Manager');
      setRespondModalId('');
      setRespondText('');
      notify('Respuesta enviada');
      await loadAll();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleDeleteMailbox = async (id: string) => {
    if (!confirm('¿Eliminar entrada de bandeja?')) return;
    try { await deleteMailboxEntry(token, id); notify('Eliminado'); await loadAll(); }
    catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  // ========== SIGNATURES ==========
  const handleSignComm = async (commId: string, employeeId: string, employeeName: string) => {
    try {
      await signCommunication(token, commId, { employeeId, employeeName, employeeEmail: '' });
      notify('Firma registrada');
      await loadAll();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  // ========== ALERTS ==========
  const handleTriggerAlerts = async () => {
    try {
      const alerts = await triggerCommunicationAlerts(token);
      notify(`Alertas generadas: ${alerts.length ? alerts.join(', ') : 'Ninguna'}`);
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  // ========== RENDER: TAB HEADERS ==========
  const tabs = ['Panel', 'Comunicaciones', 'Campañas', 'Encuestas', 'Buzón SST', 'Firmas', 'Historial'];

  return (
    <div className="advanced-management advanced-management--comm">
      <section className="advanced-management__hero">
        <div>
          <p className="muted">Módulo 2.8.1</p>
          <h3>Comunicación SG-SST</h3>
          <p className="muted">{autoCompliance?.reasons?.join(' · ') || 'Centro de comunicaciones del SG-SST'}</p>
        </div>
        <span className={complianceUi.className}>{complianceUi.label}</span>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="advanced-management__success">{success}</p> : null}
      {loading ? <p className="muted">Cargando...</p> : null}

      <div className="advanced-tabs" role="tablist">
        {tabs.map((name) => (
          <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>{name}</Button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* TAB 1: DASHBOARD */}
      {/* ================================================================== */}
      {tab === 'Panel' && (
        <section className="advanced-management__section">
          <div className="actions"><Button type="button" variant="secondary" onClick={() => void loadAll()}>Recargar</Button><Button type="button" variant="ghost" onClick={() => void handleTriggerAlerts()}>Generar alertas</Button></div>

          <div className="advanced-doc-grid">
            <article className="doc-stat-card doc-stat-card--info"><span className="doc-stat-card__label">Enviadas</span><span className="doc-stat-card__value">{dashboard?.published ?? 0}</span></article>
            <article className="doc-stat-card doc-stat-card--good"><span className="doc-stat-card__label">Leídas</span><span className="doc-stat-card__value">{dashboard?.totalRead ?? 0}</span></article>
            <article className="doc-stat-card doc-stat-card--danger"><span className="doc-stat-card__label">Sin Leer</span><span className="doc-stat-card__value">{dashboard?.unread ?? 0}</span></article>
            <article className="doc-stat-card doc-stat-card--warning"><span className="doc-stat-card__label">Firmas Pend.</span><span className="doc-stat-card__value">{dashboard?.pendingSignatures ?? 0}</span></article>
            <article className="doc-stat-card doc-stat-card--good"><span className="doc-stat-card__label">Campañas Act.</span><span className="doc-stat-card__value">{dashboard?.campaignsActive ?? 0}</span></article>
            <article className="doc-stat-card doc-stat-card--info"><span className="doc-stat-card__label">% Lectura</span><span className="doc-stat-card__value">{dashboard?.readRate ?? 0}%</span></article>
            <article className={`doc-stat-card ${(dashboard?.mailboxPending ?? 0) > 0 ? 'doc-stat-card--warning' : 'doc-stat-card--good'}`}><span className="doc-stat-card__label">Buzón Pend.</span><span className="doc-stat-card__value">{dashboard?.mailboxPending ?? 0}</span></article>
            <article className="doc-stat-card doc-stat-card--info"><span className="doc-stat-card__label">Borradores</span><span className="doc-stat-card__value">{dashboard?.drafts ?? 0}</span></article>
          </div>

          {/* Charts row */}
          {dashboard && (
            <div className="grid grid-2" style={{ gap: 16, margin: '16px 0' }}>
              <article className="card" style={{ minHeight: 260 }}>
                <h3 className="card-title">Lectura vs No Leído</h3>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={[
                        { name: 'Leído', value: dashboard.totalRead },
                        { name: 'Sin Leer', value: Math.max(0, (dashboard.totalRecipients || dashboard.published * 5) - dashboard.totalRead) },
                      ]} dataKey="value" nameKey="name" outerRadius={75} label>
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="card" style={{ minHeight: 260 }}>
                <h3 className="card-title">Comunicaciones por Estado</h3>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={[
                      { name: 'Publicadas', total: dashboard.published },
                      { name: 'Borradores', total: dashboard.drafts },
                      { name: 'Pend. Firma', total: dashboard.pendingSignatures },
                    ]}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                        <Cell fill="#2563eb" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#8b5cf6" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>
          )}

          {autoCompliance && (
            <section className="advanced-management__section">
              <h3>Auto-Cumplimiento</h3>
              <div className="objective-progress"><div className="objective-progress__track"><span className={`objective-progress__bar ${autoCompliance.score >= 3 ? 'objective-progress__bar--high' : autoCompliance.score >= 2 ? 'objective-progress__bar--medium' : 'objective-progress__bar--low'}`} style={{ width: `${(autoCompliance.score / 3) * 100}%` }} /></div><strong>{autoCompliance.score}/3</strong></div>
              <ul>{autoCompliance.reasons.map((r, i) => <li key={i} className="muted">{r}</li>)}</ul>
            </section>
          )}

          <section className="advanced-management__section">
            <h3>Últimas Comunicaciones</h3>
            {comms.slice(0, 5).map((c) => (
              <article key={c._id} className="advanced-list__item">
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <div><strong>{c.title}</strong><p className="muted"><span className={typeBadge(c.communicationType)}>{typeLabel(c.communicationType)}</span> · <span className={priorityBadge(c.priority)}>{c.priority}</span></p></div>
                  <span className={statusBadgeClass(c.status)}>{statusLabel(c.status)}</span>
                </div>
                <p className="muted">{new Date(c.createdAt).toLocaleDateString()} · {c.targetAudience}</p>
              </article>
            ))}
            {!comms.length && <p className="empty-state">No hay comunicaciones aún. Crea la primera desde la pestaña Comunicaciones.</p>}
          </section>
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 2: COMUNICACIONES */}
      {/* ================================================================== */}
      {tab === 'Comunicaciones' && (
        <section className="advanced-management__section">
          <div className="actions">
            <Button type="button" disabled={readOnly} onClick={() => setShowCommForm(true)}>+ Nueva Comunicación</Button>
            <Button type="button" variant="ghost" onClick={() => void loadAll()}>Recargar</Button>
          </div>

          {/* Filters */}
          <div className="filters-row">
            <select className="input" value={commFilter.type} onChange={(e) => setCommFilter({ ...commFilter, type: e.target.value })}>
              <option value="">Todos los tipos</option>
              {commTypeOptions.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <select className="input" value={commFilter.priority} onChange={(e) => setCommFilter({ ...commFilter, priority: e.target.value })}>
              <option value="">Todas las prioridades</option>
              {priorityOptions.map((p) => <option key={p} value={p}>{priorityLabel(p)}</option>)}
            </select>
            <select className="input" value={commFilter.audience} onChange={(e) => setCommFilter({ ...commFilter, audience: e.target.value })}>
              <option value="">Todas las audiencias</option>
              {audienceOptions.map((a) => <option key={a} value={a}>{audienceLabel(a)}</option>)}
            </select>
            <select className="input" value={commFilter.status} onChange={(e) => setCommFilter({ ...commFilter, status: e.target.value })}>
              <option value="">Todos los estados</option>
              <option value="DRAFT">Borrador</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="ARCHIVED">Archivado</option>
            </select>
          </div>

          {/* Table */}
          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Título</th><th>Tipo</th><th>Prioridad</th><th>Audiencia</th><th>Creado</th><th>Estado</th><th>Firma</th><th>Acciones</th></tr></thead>
              <tbody>
                {filteredComms.map((c) => (
                  <tr key={c._id}>
                    <td><strong>{c.title}</strong></td>
                    <td><span className={typeBadge(c.communicationType)}>{typeLabel(c.communicationType)}</span></td>
                    <td><span className={priorityBadge(c.priority)}>{priorityLabel(c.priority)}</span></td>
                    <td>{audienceLabel(c.targetAudience)}</td>
                    <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td><span className={statusBadgeClass(c.status)}>{statusLabel(c.status)}</span></td>
                    <td>{c.requiresSignature ? '🔴 Sí' : '—'}</td>
                    <td>
                      <div className="actions">
                        <Button type="button" variant="secondary" onClick={() => setSelectedComm(c)}>Ver</Button>
                        {c.status === 'DRAFT' && <Button type="button" disabled={readOnly} onClick={() => void handlePublishComm(c._id)}>Publicar</Button>}
                        {c.status === 'PUBLISHED' && <Button type="button" variant="ghost" disabled={readOnly} onClick={() => void handleArchiveComm(c._id)}>Archivar</Button>}
                        {c.status !== 'PUBLISHED' && <Button type="button" variant="danger" disabled={readOnly} onClick={() => void handleDeleteComm(c._id)}>Eliminar</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredComms.length && <p className="empty-state">No se encontraron comunicaciones con los filtros actuales.</p>}

          {/* Create form sheet */}
          {showCommForm && (
            <div className="advanced-management__section" style={{ border: '2px solid #2563eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
              <h3>Nueva Comunicación</h3>
              <div className="form-grid">
                <div className="grid grid-2">
                  <label className="field"><span className="label">Título *</span><input className="input" value={commForm.title || ''} onChange={(e) => setCommForm({ ...commForm, title: e.target.value })} /></label>
                  <label className="field"><span className="label">Tipo</span><select className="input" value={commForm.communicationType || 'ANNOUNCEMENT'} onChange={(e) => setCommForm({ ...commForm, communicationType: e.target.value as CommunicationType })}>{commTypeOptions.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</select></label>
                </div>
                <div className="grid grid-3">
                  <label className="field"><span className="label">Prioridad</span><select className="input" value={commForm.priority || 'INFORMATIVE'} onChange={(e) => setCommForm({ ...commForm, priority: e.target.value as CommunicationPriority })}>{priorityOptions.map((p) => <option key={p} value={p}>{priorityLabel(p)}</option>)}</select></label>
                  <label className="field"><span className="label">Audiencia</span><select className="input" value={commForm.targetAudience || 'ALL_COMPANY'} onChange={(e) => setCommForm({ ...commForm, targetAudience: e.target.value as TargetAudienceType })}>{audienceOptions.map((a) => <option key={a} value={a}>{audienceLabel(a)}</option>)}</select></label>
                  <label className="field"><span className="label">¿Requiere firma?</span><select className="input" value={commForm.requiresSignature ? 'yes' : 'no'} onChange={(e) => setCommForm({ ...commForm, requiresSignature: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Sí</option></select></label>
                </div>
                <label className="field"><span className="label">Cuerpo / Mensaje</span><textarea className="input" rows={4} value={commForm.body || ''} onChange={(e) => setCommForm({ ...commForm, body: e.target.value })} /></label>
                {!readOnly && employees.length > 0 && (
                  <label className="field"><span className="label">Destinatarios específicos (opcional)</span>
                    <select className="input" multiple value={selectedRecipientIds} onChange={(e) => setSelectedRecipientIds(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ minHeight: 100 }}>
                      {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} · {emp.area}</option>)}
                    </select>
                    <span className="muted">Selecciona destinatarios específicos. Si no seleccionas ninguno, se usará la audiencia definida.</span>
                  </label>
                )}
                <div className="actions">
                  <Button type="button" disabled={readOnly || loading} onClick={() => void handleCreateComm()}>Crear Comunicación</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCommForm(false)}>Cancelar</Button>
                </div>
              </div>
            </div>
          )}

          {/* Detail sheet */}
          {selectedComm && (
            <CommunicationReadSheet token={token} comm={selectedComm} onClose={() => setSelectedComm(null)} />
          )}
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 3: CAMPAÑAS */}
      {/* ================================================================== */}
      {tab === 'Campañas' && (
        <section className="advanced-management__section">
          <div className="actions"><Button type="button" disabled={readOnly} onClick={() => setShowCampForm(true)}>+ Nueva Campaña</Button></div>

          {showCampForm && (
            <div className="form-grid" style={{ border: '2px solid #2563eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3>Nueva Campaña</h3>
              <div className="grid grid-2">
                <label className="field"><span className="label">Nombre *</span><input className="input" value={campForm.name || ''} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} /></label>
                <label className="field"><span className="label">Estado</span><select className="input" value={campForm.status || 'DRAFT'} onChange={(e) => setCampForm({ ...campForm, status: e.target.value as CommunicationCampaignStatus })}><option value="DRAFT">Borrador</option><option value="ACTIVE">Activa</option><option value="COMPLETED">Completada</option><option value="CANCELLED">Cancelada</option></select></label>
              </div>
              <label className="field"><span className="label">Descripción</span><textarea className="input" rows={3} value={campForm.description || ''} onChange={(e) => setCampForm({ ...campForm, description: e.target.value })} /></label>
              <label className="field"><span className="label">Tags (separados por coma)</span><input className="input" value={campTags} onChange={(e) => setCampTags(e.target.value)} /></label>
              <div className="actions">
                <Button type="button" disabled={readOnly} onClick={() => void handleCreateCamp()}>Crear</Button>
                <Button type="button" variant="secondary" onClick={() => setShowCampForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          <div className="advanced-doc-grid">
            {campaigns.map((c) => (
              <article key={c._id} className="advanced-doc-card">
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <strong>{c.name}</strong>
                  <span className={statusBadgeClass(c.status)}>{statusLabel(c.status)}</span>
                </div>
                <p className="muted">{c.description || 'Sin descripción'}</p>
                <div className="actions" style={{ flexWrap: 'wrap', gap: 4 }}>
                  <small>Alcance: {c.totalReached} · Leído: {c.totalRead} · Firmas: {c.totalSigned}</small>
                </div>
                {c.tags?.length ? <div className="actions" style={{ flexWrap: 'wrap', gap: 4 }}>{c.tags.map((t, i) => <span key={i} className="doc-type-badge doc-type-badge--default">{t}</span>)}</div> : null}
                <div className="actions">
                  {c.status === 'DRAFT' && <Button type="button" disabled={readOnly} onClick={() => void handleUpdateCampStatus(c._id, 'ACTIVE')}>Activar</Button>}
                  {c.status === 'ACTIVE' && <Button type="button" disabled={readOnly} onClick={() => void handleUpdateCampStatus(c._id, 'COMPLETED')}>Completar</Button>}
                  <Button type="button" variant="danger" disabled={readOnly} onClick={() => void handleDeleteCamp(c._id)}>Eliminar</Button>
                </div>
              </article>
            ))}
          </div>
          {!campaigns.length && <p className="empty-state">No hay campañas de comunicación aún.</p>}
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 4: ENCUESTAS */}
      {/* ================================================================== */}
      {tab === 'Encuestas' && (
        <section className="advanced-management__section">
          <div className="actions"><Button type="button" disabled={readOnly} onClick={() => setShowSurveyForm(true)}>+ Nueva Encuesta</Button></div>

          {showSurveyForm && (
            <div className="form-grid" style={{ border: '2px solid #2563eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3>Nueva Encuesta</h3>
              <div className="grid grid-2">
                <label className="field"><span className="label">Título *</span><input className="input" value={surveyForm.title || ''} onChange={(e) => setSurveyForm({ ...surveyForm, title: e.target.value })} /></label>
                <label className="field"><span className="label">Estado</span><select className="input" value={surveyForm.status || 'DRAFT'} onChange={(e) => setSurveyForm({ ...surveyForm, status: e.target.value as SurveyStatus })}><option value="DRAFT">Borrador</option><option value="ACTIVE">Activa</option><option value="CLOSED">Cerrada</option></select></label>
              </div>
              <label className="field"><span className="label">Descripción</span><textarea className="input" rows={2} value={surveyForm.description || ''} onChange={(e) => setSurveyForm({ ...surveyForm, description: e.target.value })} /></label>
              <SurveyQuestionEditor questions={surveyQuestions} onChange={(qs) => { setSurveyQuestions(qs); markDirty(); }} readOnly={readOnly} />
              <div className="actions">
                <Button type="button" disabled={readOnly || loading} onClick={() => void handleCreateSurvey()}>Crear Encuesta</Button>
                <Button type="button" variant="secondary" onClick={() => setShowSurveyForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Survey list */}
          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Título</th><th>Preguntas</th><th>Respuestas</th><th>Estado</th><th>Creada</th><th>Acciones</th></tr></thead>
              <tbody>
                {surveys.map((s) => (
                  <tr key={s._id}>
                    <td><strong>{s.title}</strong></td>
                    <td>{s.questions?.length || 0}</td>
                    <td>{s.totalResponses ?? 0}</td>
                    <td><span className={statusBadgeClass(s.status)}>{statusLabel(s.status)}</span></td>
                    <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="actions">
                        <Button type="button" variant="secondary" onClick={() => void handleViewSurveyResults(s._id)}>Resultados</Button>
                        {s.status === 'DRAFT' && <Button type="button" disabled={readOnly} onClick={() => void handleToggleSurveyStatus(s._id, 'ACTIVE')}>Activar</Button>}
                        {s.status === 'ACTIVE' && <Button type="button" disabled={readOnly} onClick={() => void handleToggleSurveyStatus(s._id, 'CLOSED')}>Cerrar</Button>}
                        <Button type="button" variant="danger" disabled={readOnly} onClick={() => void handleDeleteSurvey(s._id)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!surveys.length && <p className="empty-state">No hay encuestas aún.</p>}

          {/* Survey results sheet with charts */}
          {surveyResults && selectedSurveyId && (
            <div className="advanced-management__section" style={{ border: '2px solid #7c3aed', borderRadius: 12, padding: 16, marginTop: 16 }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h3>Resultados: {surveyResults.survey.title}</h3>
                <Button type="button" variant="secondary" onClick={() => { setSurveyResults(null); setSelectedSurveyId(''); }}>Cerrar</Button>
              </div>
              <p className="muted">Total respuestas: {surveyResults.totalResponses} · Participación: {surveyResults.survey.totalInvited > 0 ? Math.round((surveyResults.totalResponses / surveyResults.survey.totalInvited) * 100) : 0}%</p>

              {surveyResults.totalResponses > 0 && (
                <article className="card" style={{ minHeight: 220, marginBottom: 16 }}>
                  <h4 className="card-title">Participación General</h4>
                  <div style={{ width: '100%', height: 180 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={[
                          { name: 'Respondieron', value: surveyResults.totalResponses },
                          { name: 'Sin responder', value: Math.max(0, (surveyResults.survey.totalInvited || surveyResults.totalResponses * 2) - surveyResults.totalResponses) },
                        ]} dataKey="value" nameKey="name" outerRadius={65} label>
                          <Cell fill="#8b5cf6" />
                          <Cell fill="#e2e8f0" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              )}

              {surveyResults.stats.map((stat: any) => (
                <fieldset key={stat.questionId} className="advanced-management__section" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <strong>{stat.questionText}</strong>
                  {stat.type === 'OPEN_TEXT' ? (
                    <div>{stat.answers?.map((a: string, i: number) => <p key={i} className="muted" style={{ paddingLeft: 12 }}>— {a}</p>)}</div>
                  ) : (
                    <>
                      {/* Bar chart for option counts */}
                      {stat.total > 0 && (
                        <div style={{ width: '100%', height: Math.max(60, Object.keys(stat.optionCounts || {}).length * 40) }}>
                          <ResponsiveContainer>
                            <BarChart data={Object.entries(stat.optionCounts || {}).map(([opt, count]: [string, any]) => ({ name: opt, value: count }))} layout="vertical">
                              <XAxis type="number" />
                              <YAxis dataKey="name" type="category" width={120} />
                              <Tooltip />
                              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#8b5cf6" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      <div className="objective-progress" style={{ flexDirection: 'column', gap: 4, marginTop: 8 }}>
                        {Object.entries(stat.optionCounts || {}).map(([opt, count]: [string, any]) => (
                          <div key={opt} className="actions" style={{ gap: 8 }}>
                            <span style={{ minWidth: 100, fontSize: '0.85rem' }}>{opt}</span>
                            <div className="objective-progress__track" style={{ flex: 1, height: 20 }}>
                              <span className="objective-progress__bar objective-progress__bar--high" style={{ width: `${stat.total > 0 ? (count / stat.total) * 100 : 0}%` }} />
                            </div>
                            <strong style={{ fontSize: '0.85rem', minWidth: 30 }}>{count}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </fieldset>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 5: BUZÓN SST */}
      {/* ================================================================== */}
      {tab === 'Buzón SST' && (
        <section className="advanced-management__section">
          <div className="actions">
            <Button type="button" disabled={readOnly} onClick={() => setShowMailboxForm(true)}>+ Nuevo Reporte</Button>
            <select className="input" value={mailboxFilter} onChange={(e) => setMailboxFilter(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="">Todos los estados</option>
              <option value="PENDING">Pendiente</option>
              <option value="UNDER_REVIEW">En revisión</option>
              <option value="RESOLVED">Resuelto</option>
              <option value="CLOSED">Cerrado</option>
            </select>
          </div>

          {showMailboxForm && (
            <div className="form-grid" style={{ border: '2px solid #2563eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3>Nuevo Reporte en Buzón SST</h3>
              <div className="grid grid-2">
                <label className="field"><span className="label">Tipo</span><select className="input" value={mailboxForm.mailboxType} onChange={(e) => setMailboxForm({ ...mailboxForm, mailboxType: e.target.value as MailboxType })}>{mailboxTypeOptions.map((t) => <option key={t} value={t}>{mailboxTypeLabels[t]}</option>)}</select></label>
                <label className="field"><span className="label">Anónimo</span><select className="input" value={mailboxForm.isAnonymous ? 'yes' : 'no'} onChange={(e) => setMailboxForm({ ...mailboxForm, isAnonymous: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Sí</option></select></label>
              </div>
              <label className="field"><span className="label">Asunto *</span><input className="input" value={mailboxForm.subject} onChange={(e) => setMailboxForm({ ...mailboxForm, subject: e.target.value })} /></label>
              <label className="field"><span className="label">Mensaje *</span><textarea className="input" rows={4} value={mailboxForm.message} onChange={(e) => setMailboxForm({ ...mailboxForm, message: e.target.value })} /></label>
              <div className="actions">
                <Button type="button" disabled={readOnly || loading} onClick={() => void handleCreateMailbox()}>Enviar</Button>
                <Button type="button" variant="secondary" onClick={() => setShowMailboxForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Tipo</th><th>Asunto</th><th>Anónimo</th><th>Estado</th><th>Creado</th><th>Respuesta</th><th>Acciones</th></tr></thead>
              <tbody>
                {filteredMailbox.map((m) => (
                  <tr key={m._id}>
                    <td><span className="doc-type-badge doc-type-badge--default">{mailboxTypeLabels[m.mailboxType] || m.mailboxType}</span></td>
                    <td><strong>{m.subject}</strong></td>
                    <td>{m.isAnonymous ? 'Sí' : 'No'}</td>
                    <td><span className={statusBadgeClass(m.status)}>{statusLabel(m.status)}</span></td>
                    <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.response || '—'}</td>
                    <td>
                      <div className="actions">
                        {m.status !== 'RESOLVED' && m.status !== 'CLOSED' && (
                          <Button type="button" variant="secondary" disabled={readOnly} onClick={() => { setRespondModalId(m._id); setRespondText(m.response || ''); }}>Responder</Button>
                        )}
                        <Button type="button" variant="danger" disabled={readOnly} onClick={() => void handleDeleteMailbox(m._id)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredMailbox.length && <p className="empty-state">No hay reportes en la bandeja SST.</p>}

          {/* Respond modal */}
          {respondModalId && (
            <div className="advanced-management__section" style={{ border: '2px solid #ca8a04', borderRadius: 12, padding: 16, marginTop: 16 }}>
              <h3>Responder Reporte</h3>
              <label className="field"><span className="label">Respuesta</span><textarea className="input" rows={4} value={respondText} onChange={(e) => setRespondText(e.target.value)} /></label>
              <div className="actions">
                <Button type="button" disabled={readOnly} onClick={() => void handleRespondMailbox()}>Enviar respuesta</Button>
                <Button type="button" variant="secondary" onClick={() => { setRespondModalId(''); setRespondText(''); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 6: FIRMAS */}
      {/* ================================================================== */}
      {tab === 'Firmas' && (
        <section className="advanced-management__section">
          <h3>Centro de Firmas</h3>
          <p className="muted">Comunicaciones que requieren firma digital de los destinatarios.</p>

          {comms.filter((c) => c.requiresSignature).length === 0 && (
            <p className="empty-state">No hay comunicaciones que requieran firma.</p>
          )}

          {comms.filter((c) => c.requiresSignature).map((c) => (
            <article key={c._id} className="advanced-doc-card" style={{ marginBottom: 12 }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <div><strong>{c.title}</strong><p className="muted">{typeLabel(c.communicationType)} · {new Date(c.createdAt).toLocaleDateString()}</p></div>
                <span className={statusBadgeClass(c.status)}>{statusLabel(c.status)}</span>
              </div>
              <div className="actions">
                <Button type="button" variant="secondary" onClick={() => setSelectedComm(c)}>Ver detalles</Button>
                {c.status === 'PUBLISHED' && employees.length > 0 && (
                  <Button type="button" disabled={readOnly} onClick={() => {
                    const emp = employees[0];
                    void handleSignComm(c._id, emp._id, emp.name);
                  }}>Firmar como {employees[0]?.name}</Button>
                )}
              </div>
            </article>
          ))}

          {selectedComm && (
            <CommunicationReadSheet token={token} comm={selectedComm} onClose={() => setSelectedComm(null)} />
          )}
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 7: HISTORIAL */}
      {/* ================================================================== */}
      {tab === 'Historial' && (
        <section className="advanced-management__section">
          <h3>Historial de Actividades</h3>
          <div className="timeline">
            {history.map((entry: any, idx: number) => (
              <article key={entry._id || idx} className="timeline__item">
                <strong>{entry.action || entry.actionName || 'Acción'}</strong>
                <p>{entry.description || entry.entityType ? `${entry.entityType}: ${entry.entityId}` : ''}</p>
                <div className="actions" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <small className="muted">{entry.userEmail || 'Sistema'} · {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</small>
                  {entry.previousValue && <small className="advanced-management__audit-warning">Anterior: {JSON.stringify(entry.previousValue)}</small>}
                  {entry.newValue && <small className="advanced-management__success">Nuevo: {JSON.stringify(entry.newValue)}</small>}
                </div>
              </article>
            ))}
          </div>
          {!history.length && <p className="empty-state">No hay actividad registrada aún.</p>}
        </section>
      )}

      <div className="advanced-management__footer">
        <span className={dirty ? 'advanced-management__dirty' : 'muted'}>{dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}</span>
        <Button type="button" variant="ghost" onClick={() => void handleTriggerAlerts()}>Verificar alertas</Button>
      </div>
    </div>
  );
}
