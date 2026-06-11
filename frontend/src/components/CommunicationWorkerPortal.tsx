import { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/Button';
import {
  CommunicationModel,
  CommunicationCampaignModel,
  CommunicationSurveyModel,
  CommunicationMailboxModel,
  fetchCommunications,
  fetchCommunicationCampaigns,
  fetchSurveys,
  fetchMailbox,
  createMailboxEntry,
  registerCommunicationRead,
  signCommunication,
  submitSurveyResponse,
  MailboxType,
} from '../api';
import {
  Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

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

function commTypeLabel(t: string) {
  const labels: Record<string, string> = {
    ANNOUNCEMENT: 'Anuncio', CIRCULAR: 'Circular', BULLETIN: 'Boletín',
    CAMPAIGN: 'Campaña', EMERGENCY_NOTICE: 'Aviso Emergencia',
    POLICY_COMMUNICATION: 'Comunicación Política', PROCEDURE_COMMUNICATION: 'Comunicación Procedimiento',
    TRAINING_COMMUNICATION: 'Comunicación Capacitación',
  };
  return labels[t] ?? t;
}

function mailboxTypeLabel(t: string) {
  const labels: Record<string, string> = {
    SUGGESTION: 'Sugerencia', COMPLAINT: 'Queja', UNSAFE_ACT: 'Acto Inseguro',
    UNSAFE_CONDITION: 'Condición Insegura', IMPROVEMENT_IDEA: 'Idea de Mejora', REPORT: 'Reporte',
  };
  return labels[t] ?? t;
}

function statusBadgeClass(status: string) {
  if (status === 'PUBLISHED' || status === 'ACTIVE' || status === 'READ') return 'advanced-management__badge advanced-management__badge--success';
  if (status === 'DRAFT' || status === 'PENDING') return 'advanced-management__badge advanced-management__badge--warning';
  return 'advanced-management__badge advanced-management__badge--danger';
}

export default function CommunicationWorkerPortal({ token, employeeId, employeeName }: { token: string; employeeId: string; employeeName: string }) {
  const [comms, setComms] = useState<CommunicationModel[]>([]);
  const [campaigns, setCampaigns] = useState<CommunicationCampaignModel[]>([]);
  const [surveys, setSurveys] = useState<CommunicationSurveyModel[]>([]);
  const [mailbox, setMailbox] = useState<CommunicationMailboxModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState('dashboard');

  // Survey answer state
  const [answeringSurvey, setAnsweringSurvey] = useState('');
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string | string[]>>({});

  // Mailbox form
  const [showMailbox, setShowMailbox] = useState(false);
  const [mbForm, setMbForm] = useState({ mailboxType: 'SUGGESTION' as MailboxType, subject: '', message: '' });

  const notify = (msg: string) => { setSuccess(msg); window.setTimeout(() => setSuccess(''), 2800); };
  const showError = (msg: string) => { setError(msg); window.setTimeout(() => setError(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allComms, allCampaigns, allSurveys, allMailbox] = await Promise.all([
        fetchCommunications(token).catch(() => [] as CommunicationModel[]),
        fetchCommunicationCampaigns(token).catch(() => [] as CommunicationCampaignModel[]),
        fetchSurveys(token).catch(() => [] as CommunicationSurveyModel[]),
        fetchMailbox(token).catch(() => [] as CommunicationMailboxModel[]),
      ]);
      setComms(allComms);
      setCampaigns(allCampaigns);
      setSurveys(allSurveys);
      setMailbox(allMailbox);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al cargar');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(() => { void load(); }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const publishedComms = comms.filter((c) => c.status === 'PUBLISHED');
  const pendingSurveys = surveys.filter((s) => s.status === 'ACTIVE');
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
  const myMailbox = mailbox.filter((m) => m.submittedBy === employeeId || !m.isAnonymous);

  const handleRead = async (commId: string) => {
    try {
      await registerCommunicationRead(token, commId, employeeId, employeeName);
      notify('Lectura registrada');
      await load();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleSign = async (commId: string) => {
    try {
      await signCommunication(token, commId, { employeeId, employeeName, employeeEmail: '' });
      notify('Firma registrada');
      await load();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleSurveyAnswer = async (surveyId: string) => {
    const survey = surveys.find((s) => s._id === surveyId);
    if (!survey) return;
    const answers = survey.questions.map((q) => {
      const answer = surveyAnswers[`${surveyId}-${q.questionId}`];
      return {
        questionId: q.questionId,
        answer: q.questionType === 'OPEN_TEXT' ? (typeof answer === 'string' ? answer : '') : undefined,
        selectedOptions: q.questionType !== 'OPEN_TEXT' ? (Array.isArray(answer) ? answer : answer ? [answer] : []) : [],
      };
    });
    try {
      await submitSurveyResponse(token, surveyId, { employeeId, employeeName, answers });
      setAnsweringSurvey('');
      setSurveyAnswers({});
      notify('Encuesta respondida');
      await load();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const handleSubmitMailbox = async () => {
    if (!mbForm.subject.trim() || !mbForm.message.trim()) { showError('Completa todos los campos'); return; }
    try {
      await createMailboxEntry(token, { ...mbForm, isAnonymous: false, employeeId });
      setShowMailbox(false);
      setMbForm({ mailboxType: 'SUGGESTION', subject: '', message: '' });
      notify('Reporte enviado');
      await load();
    } catch (err) { showError(err instanceof Error ? err.message : 'Error'); }
  };

  const counts = {
    unread: publishedComms.length,
    pendingSignatures: publishedComms.filter((c) => c.requiresSignature).length,
    pendingSurveys: pendingSurveys.length,
    activeCampaigns: activeCampaigns.length,
  };

  return (
    <section className="grid" style={{ gap: 16, padding: 16 }}>
      <div>
        <h2 style={{ marginBottom: '.3rem' }}>Portal del Trabajador · Comunicaciones SG-SST</h2>
        <p className="muted">Bienvenido, {employeeName}. Aquí están tus comunicaciones, firmas y encuestas pendientes.</p>
      </div>

      {loading ? <p className="muted">Cargando...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="advanced-management__success">{success}</p> : null}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <article className="card kpi-card">
          <h3 className="kpi-title">Comunicaciones</h3>
          <p className="kpi-value" style={{ color: '#2563eb' }}>{counts.unread}</p>
          <span className="muted">Pendientes por leer</span>
        </article>
        <article className="card kpi-card">
          <h3 className="kpi-title">Firmas</h3>
          <p className="kpi-value" style={{ color: '#8b5cf6' }}>{counts.pendingSignatures}</p>
          <span className="muted">Pendientes por firmar</span>
        </article>
        <article className="card kpi-card">
          <h3 className="kpi-title">Encuestas</h3>
          <p className="kpi-value" style={{ color: '#10b981' }}>{counts.pendingSurveys}</p>
          <span className="muted">Pendientes por responder</span>
        </article>
        <article className="card kpi-card">
          <h3 className="kpi-title">Campañas</h3>
          <p className="kpi-value" style={{ color: '#f59e0b' }}>{counts.activeCampaigns}</p>
          <span className="muted">Campañas activas</span>
        </article>
      </div>

      {/* Chart - pending items breakdown */}
      {publishedComms.length > 0 && (
        <article className="card" style={{ minHeight: 240 }}>
          <h3 className="card-title">Comunicaciones Publicadas</h3>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={[
                { name: 'Leer', value: publishedComms.length },
                { name: 'Firmar', value: publishedComms.filter((c) => c.requiresSignature).length },
              ]}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}

      {/* Quick Actions Tabs */}
      <div className="advanced-tabs" role="tablist">
        <Button type="button" variant={tab === 'dashboard' ? 'primary' : 'secondary'} onClick={() => setTab('dashboard')}>Panel</Button>
        <Button type="button" variant={tab === 'comms' ? 'primary' : 'secondary'} onClick={() => setTab('comms')}>Comunicaciones ({counts.unread})</Button>
        <Button type="button" variant={tab === 'surveys' ? 'primary' : 'secondary'} onClick={() => setTab('surveys')}>Encuestas ({counts.pendingSurveys})</Button>
        <Button type="button" variant={tab === 'mailbox' ? 'primary' : 'secondary'} onClick={() => setTab('mailbox')}>Buzón SST</Button>
      </div>

      {/* Tab: Dashboard Summary */}
      {tab === 'dashboard' && (
        <div className="grid grid-2" style={{ gap: 16 }}>
          <article className="card">
            <h3 className="card-title">Comunicaciones Pendientes</h3>
            {publishedComms.length === 0 && <p className="empty-state">No hay comunicaciones pendientes.</p>}
            {publishedComms.slice(0, 3).map((c) => (
              <div key={c._id} className="advanced-list__item">
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <strong>{c.title}</strong>
                  <div className="actions">
                    <Button type="button" variant="secondary" onClick={() => void handleRead(c._id)}>Leer</Button>
                    {c.requiresSignature && <Button type="button" onClick={() => void handleSign(c._id)}>Firmar</Button>}
                  </div>
                </div>
                <p className="muted">{c.communicationType} · {c.priority}</p>
              </div>
            ))}
          </article>
          <article className="card">
            <h3 className="card-title">Encuestas Activas</h3>
            {pendingSurveys.length === 0 && <p className="empty-state">No hay encuestas activas.</p>}
            {pendingSurveys.slice(0, 3).map((s) => (
              <div key={s._id} className="advanced-list__item">
                <strong>{s.title}</strong>
                <p className="muted">{s.questions?.length || 0} preguntas</p>
                <Button type="button" variant="secondary" onClick={() => setAnsweringSurvey(s._id)}>Responder</Button>
              </div>
            ))}
          </article>
        </div>
      )}

      {/* Tab: Communications */}
      {tab === 'comms' && (
        <section>
          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Título</th><th>Tipo</th><th>Prioridad</th><th>Publicado</th><th>Firma</th><th>Acciones</th></tr></thead>
              <tbody>
                {publishedComms.map((c) => (
                  <tr key={c._id}>
                    <td><strong>{c.title}</strong></td>
                    <td>{commTypeLabel(c.communicationType)}</td>
                    <td><span className={statusBadgeClass(c.priority)}>{priorityLabel(c.priority)}</span></td>
                    <td>{c.publishedAt ? new Date(c.publishedAt).toLocaleDateString() : '—'}</td>
                    <td>{c.requiresSignature ? '🔴 Requerida' : '—'}</td>
                    <td>
                      <div className="actions">
                        <Button type="button" variant="secondary" onClick={() => void handleRead(c._id)}>Leer</Button>
                        {c.requiresSignature && <Button type="button" onClick={() => void handleSign(c._id)}>Firmar</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!publishedComms.length && <p className="empty-state">No hay comunicaciones publicadas.</p>}
        </section>
      )}

      {/* Tab: Surveys */}
      {tab === 'surveys' && (
        <section>
          {pendingSurveys.map((s) => (
            <article key={s._id} className="advanced-doc-card" style={{ marginBottom: 12 }}>
              <strong>{s.title}</strong>
              <p className="muted">{s.description || 'Sin descripción'} · {s.questions?.length || 0} preguntas</p>

              {answeringSurvey === s._id ? (
                <div className="form-grid" style={{ marginTop: 8 }}>
                  {s.questions.map((q) => (
                    <fieldset key={q.questionId} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                      <strong>{q.questionText}{q.required ? ' *' : ''}</strong>
                      {q.questionType === 'OPEN_TEXT' ? (
                        <textarea className="input" rows={3} value={(surveyAnswers[`${s._id}-${q.questionId}`] as string) || ''} onChange={(e) => setSurveyAnswers({ ...surveyAnswers, [`${s._id}-${q.questionId}`]: e.target.value })} />
                      ) : q.questionType === 'MULTIPLE_CHOICE' ? (
                        <div>{q.options.map((opt) => {
                          const current = (surveyAnswers[`${s._id}-${q.questionId}`] as string[]) || [];
                          const checked = current.includes(opt);
                          return <label key={opt} style={{ display: 'block', padding: 4 }}><input type="checkbox" checked={checked} onChange={() => setSurveyAnswers({ ...surveyAnswers, [`${s._id}-${q.questionId}`]: checked ? current.filter((o) => o !== opt) : [...current, opt] })} /> {opt}</label>;
                        })}</div>
                      ) : (
                        <div>{q.options.map((opt) => (
                          <label key={opt} style={{ display: 'block', padding: 4 }}><input type="radio" name={`q-${s._id}-${q.questionId}`} checked={(surveyAnswers[`${s._id}-${q.questionId}`] as string) === opt} onChange={() => setSurveyAnswers({ ...surveyAnswers, [`${s._id}-${q.questionId}`]: opt })} /> {opt}</label>
                        ))}</div>
                      )}
                    </fieldset>
                  ))}
                  <div className="actions">
                    <Button type="button" onClick={() => void handleSurveyAnswer(s._id)}>Enviar respuestas</Button>
                    <Button type="button" variant="secondary" onClick={() => { setAnsweringSurvey(''); setSurveyAnswers({}); }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setAnsweringSurvey(s._id)}>Responder encuesta</Button>
              )}
            </article>
          ))}
          {!pendingSurveys.length && <p className="empty-state">No hay encuestas activas para responder.</p>}
        </section>
      )}

      {/* Tab: SST Mailbox */}
      {tab === 'mailbox' && (
        <section>
          <div className="actions"><Button type="button" onClick={() => setShowMailbox(!showMailbox)}>{showMailbox ? 'Cancelar' : '+ Nuevo Reporte'}</Button></div>

          {showMailbox && (
            <div className="form-grid" style={{ border: '2px solid #2563eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <h3>Reportar al Buzón SST</h3>
              <label className="field"><span className="label">Tipo</span>
                <select className="input" value={mbForm.mailboxType} onChange={(e) => setMbForm({ ...mbForm, mailboxType: e.target.value as MailboxType })}>
                  <option value="SUGGESTION">Sugerencia</option>
                  <option value="COMPLAINT">Queja</option>
                  <option value="UNSAFE_ACT">Acto Inseguro</option>
                  <option value="UNSAFE_CONDITION">Condición Insegura</option>
                  <option value="IMPROVEMENT_IDEA">Idea de Mejora</option>
                  <option value="REPORT">Reporte</option>
                </select>
              </label>
              <label className="field"><span className="label">Asunto</span><input className="input" value={mbForm.subject} onChange={(e) => setMbForm({ ...mbForm, subject: e.target.value })} /></label>
              <label className="field"><span className="label">Mensaje</span><textarea className="input" rows={4} value={mbForm.message} onChange={(e) => setMbForm({ ...mbForm, message: e.target.value })} /></label>
              <Button type="button" onClick={() => void handleSubmitMailbox()}>Enviar Reporte</Button>
            </div>
          )}

          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Tipo</th><th>Asunto</th><th>Estado</th><th>Fecha</th><th>Respuesta</th></tr></thead>
              <tbody>
                {myMailbox.map((m) => (
                  <tr key={m._id}>
                    <td>{mailboxTypeLabel(m.mailboxType)}</td>
                    <td><strong>{m.subject}</strong></td>
                    <td><span className={statusBadgeClass(m.status)}>{statusLabel(m.status)}</span></td>
                    <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.response || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!myMailbox.length && <p className="empty-state">No has enviado reportes al buzón SST.</p>}
        </section>
      )}
    </section>
  );
}
