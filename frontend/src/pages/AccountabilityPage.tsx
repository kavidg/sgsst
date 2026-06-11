import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccountabilityReportModel,
  AccountabilityMeetingModel,
  AccountabilityCommitmentModel,
  AccountabilityDashboardModel,
  AutoComplianceModel,
  AccountabilityReportType,
  AccountabilityMeetingType,
  AccountabilityCommitmentPriority,
  fetchAccountabilityDashboard,
  fetchAutoCompliance,
  fetchAccountabilityReports,
  fetchAccountabilityReportStats,
  createAccountabilityReport,
  signAccountabilityReport,
  archiveAccountabilityReport,
  fetchAccountabilityMeetings,
  createAccountabilityMeeting,
  completeAccountabilityMeeting,
  deleteAccountabilityMeeting,
  fetchAccountabilityCommitments,
  fetchCommitmentStats,
  createAccountabilityCommitment,
  completeAccountabilityCommitment,
  submitCommitmentJustification,
  approveCommitmentJustification,
  fetchAccountabilityHistory,
  fetchAccountabilityEntityHistory,
  fetchMyCommitments,
  createIndividualReport,
  checkAccountabilityAlerts,
  checkAccountabilityOverdue,
  fetchEmployees,
  EmployeeModel,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

type AccountabilityPageProps = {
  token: string;
};

function dateInput(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function statusBadge(status?: string) {
  const styles: Record<string, string> = {
    COMPLETED: 'badge badge--success',
    APPROVED: 'badge badge--success',
    ACTIVE: 'badge badge--success',
    SIGNED: 'badge badge--success',
    DRAFT: 'badge badge--pending',
    PENDING: 'badge badge--pending',
    IN_PROGRESS: 'badge badge--pending',
    OPEN: 'badge badge--pending',
    OVERDUE: 'badge badge--danger',
    ARCHIVED: 'badge badge--archived',
    SCHEDULED: 'badge badge--info',
    CANCELLED: 'badge badge--ghost',
  };
  const className = styles[status ?? ''] || 'badge badge--pending';
  return <span className={className}>{status ?? 'Unknown'}</span>;
}

export function AccountabilityPage({ token }: AccountabilityPageProps) {
  const [tab, setTab] = useState('Dashboard Ejecutivo');
  const [dashboard, setDashboard] = useState<AccountabilityDashboardModel | null>(null);
  const [autoCompliance, setAutoCompliance] = useState<AutoComplianceModel | null>(null);
  const [reports, setReports] = useState<AccountabilityReportModel[]>([]);
  const [reportStats, setReportStats] = useState<{ total: number; byType: Record<string, number>; signed: number; draft: number } | null>(null);
  const [meetings, setMeetings] = useState<AccountabilityMeetingModel[]>([]);
  const [commitments, setCommitments] = useState<AccountabilityCommitmentModel[]>([]);
  const [commitmentStats, setCommitmentStats] = useState<{ total: number; open: number; overdue: number; completed: number } | null>(null);
  const [myCommitments, setMyCommitments] = useState<AccountabilityCommitmentModel[]>([]);
  const [history, setHistory] = useState<AccountabilityHistoryModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [showCreateMeeting, setShowCreateMeeting] = useState(false);
  const [showCreateCommitment, setShowCreateCommitment] = useState(false);
  const [showIndividualReport, setShowIndividualReport] = useState(false);
  const [showJustify, setShowJustify] = useState<string | null>(null);
  const [showDetailCommitment, setShowDetailCommitment] = useState<AccountabilityCommitmentModel | null>(null);
  const [showDetailReport, setShowDetailReport] = useState<AccountabilityReportModel | null>(null);

  // Form states
  const [reportForm, setReportForm] = useState({
    reportType: 'MONTHLY' as AccountabilityReportType,
    periodStart: '',
    periodEnd: '',
    executiveSummary: '',
    achievements: '',
    pendingActions: '',
    riskAreas: '',
    compliancePercentage: 0,
    criticalFindings: '',
    recommendations: '',
    nextActions: '',
  });
  const [meetingForm, setMeetingForm] = useState({
    title: '',
    date: '',
    time: '',
    location: '',
    meetingType: 'MONTHLY' as AccountabilityMeetingType,
    participants: [] as string[],
  });
  const [commitmentForm, setCommitmentForm] = useState({
    title: '',
    description: '',
    responsibleUser: '',
    dueDate: '',
    priority: 'MEDIUM' as AccountabilityCommitmentPriority,
    meetingId: '',
  });
  const [individualReportForm, setIndividualReportForm] = useState({
    activitiesPerformed: '',
    activitiesPending: '',
    difficulties: '',
    correctiveActions: '',
    recommendations: '',
    observations: '',
  });
  const [justifyForm, setJustifyForm] = useState({ reason: '', correctiveAction: '', newProposedDate: '' });

  const tabs = [
    'Dashboard Ejecutivo',
    'Informes de Gestión',
    'Rendición Individual',
    'Reuniones',
    'Compromisos',
    'Indicadores',
    'Historial',
  ];

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [
        dashResult,
        complianceResult,
        reportsResult,
        statsResult,
        meetingsResult,
        commitmentsResult,
        cStatsResult,
        myCResult,
        historyResult,
        employeesResult,
      ] = await Promise.all([
        fetchAccountabilityDashboard(token),
        fetchAutoCompliance(token),
        fetchAccountabilityReports(token),
        fetchAccountabilityReportStats(token),
        fetchAccountabilityMeetings(token),
        fetchAccountabilityCommitments(token),
        fetchCommitmentStats(token),
        fetchMyCommitments(token),
        fetchAccountabilityHistory(token, 50, 0),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
      ]);
      setDashboard(dashResult);
      setAutoCompliance(complianceResult);
      setReports(reportsResult);
      setReportStats(statsResult);
      setMeetings(meetingsResult);
      setCommitments(commitmentsResult);
      setCommitmentStats(cStatsResult);
      setMyCommitments(myCResult);
      setHistory(historyResult);
      setEmployees(employeesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading accountability data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const complianceColor = (pct: number) => {
    if (pct >= 80) return '#15803d';
    if (pct >= 50) return '#a16207';
    return '#b91c1c';
  };

  // Reports handlers
  const handleCreateReport = async () => {
    try {
      await createAccountabilityReport(token, reportForm);
      setShowCreateReport(false);
      setReportForm({ reportType: 'MONTHLY', periodStart: '', periodEnd: '', executiveSummary: '', achievements: '', pendingActions: '', riskAreas: '', compliancePercentage: 0, criticalFindings: '', recommendations: '', nextActions: '' });
      notify('Report generated successfully and registered in Document Management System');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating report');
    }
  };

  const handleSignReport = async (id: string) => {
    try {
      await signAccountabilityReport(token, id, { signedBy: '', signatureHash: 'auto-sign' });
      notify('Report signed successfully');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error signing report');
    }
  };

  const handleArchiveReport = async (id: string) => {
    try {
      await archiveAccountabilityReport(token, id);
      notify('Report archived');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error archiving report');
    }
  };

  // Meeting handlers
  const handleCreateMeeting = async () => {
    try {
      await createAccountabilityMeeting(token, meetingForm);
      setShowCreateMeeting(false);
      setMeetingForm({ title: '', date: '', time: '', location: '', meetingType: 'MONTHLY', participants: [] });
      notify('Meeting created');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating meeting');
    }
  };

  const handleCompleteMeeting = async (id: string) => {
    try {
      await completeAccountabilityMeeting(token, id, { topicsDiscussed: 'Completed', decisions: 'Meeting finalized', minutesContent: 'Minutes auto-generated' });
      notify('Meeting completed, minutes registered in Document Management System');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error completing meeting');
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm('Delete this meeting?')) return;
    try {
      await deleteAccountabilityMeeting(token, id);
      notify('Meeting deleted');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting meeting');
    }
  };

  // Commitment handlers
  const handleCreateCommitment = async () => {
    try {
      await createAccountabilityCommitment(token, commitmentForm);
      setShowCreateCommitment(false);
      setCommitmentForm({ title: '', description: '', responsibleUser: '', dueDate: '', priority: 'MEDIUM', meetingId: '' });
      notify('Commitment created and synced with Annual Work Plan');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating commitment');
    }
  };

  const handleCompleteCommitment = async (id: string) => {
    try {
      await completeAccountabilityCommitment(token, id);
      notify('Commitment completed');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error completing commitment');
    }
  };

  const handleSubmitJustification = async (id: string) => {
    try {
      await submitCommitmentJustification(token, id, justifyForm);
      setShowJustify(null);
      setJustifyForm({ reason: '', correctiveAction: '', newProposedDate: '' });
      notify('Justification submitted for manager approval');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting justification');
    }
  };

  const handleApproveJustification = async (id: string, approved: boolean) => {
    try {
      await approveCommitmentJustification(token, id, { approved, rejectionReason: approved ? undefined : 'Rejected' });
      notify(`Justification ${approved ? 'approved' : 'rejected'}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error approving justification');
    }
  };

  // Individual report
  const handleCreateIndividualReport = async () => {
    try {
      await createIndividualReport(token, individualReportForm);
      setShowIndividualReport(false);
      setIndividualReportForm({ activitiesPerformed: '', activitiesPending: '', difficulties: '', correctiveActions: '', recommendations: '', observations: '' });
      notify('Individual accountability report submitted');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting individual report');
    }
  };

  // Alert checks
  const handleCheckAlerts = async () => {
    try {
      await checkAccountabilityAlerts(token);
      await checkAccountabilityOverdue(token);
      await loadAll();
      notify('Alerts checked and generated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error checking alerts');
    }
  };

  const pendingJustifications = useMemo(() =>
    commitments.filter((c) => c.justificationStatus === 'PENDING'),
    [commitments],
  );

  return (
    <section className="acc-mgmt">
      <div className="acc-mgmt__header">
        <div>
          <h2>Rendición de Cuentas SG-SST</h2>
          <p className="muted">Centro de gestión de rendición de cuentas, informes, reuniones y compromisos</p>
        </div>
        <div className="actions">
          <Button type="button" variant="secondary" onClick={handleCheckAlerts}>🔔 Check Alerts</Button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {success ? <div className="toast-alert"><strong>Success</strong><p>{success}</p></div> : null}
      {loading ? <p className="muted">Cargando...</p> : null}

      {autoCompliance && (
        <div className={`acc-mgmt__compliance ${autoCompliance.complies ? 'acc-mgmt__compliance--good' : 'acc-mgmt__compliance--bad'}`}>
          <strong>Auto-Compliance: {autoCompliance.complies ? '✅ Cumple' : '⚠ No cumple totalmente'} ({autoCompliance.score}/100)</strong>
          <div className="acc-mgmt__compliance-reasons">
            {autoCompliance.reasons.map((r, i) => <span key={i}>{r}</span>)}
          </div>
        </div>
      )}

      <div className="tabs">
        {tabs.map((name) => (
          <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>
            {name}
          </Button>
        ))}
      </div>

      {/* TAB 1: DASHBOARD EJECUTIVO */}
      {tab === 'Dashboard Ejecutivo' && dashboard && (
        <div className="acc-mgmt__dashboard">
          <div className="acc-mgmt__kpi-grid">
            <article className="acc-mgmt__kpi" style={{ borderColor: complianceColor(dashboard.compliancePercentage) }}>
              <span className="acc-mgmt__kpi-label">Global SG-SST Compliance</span>
              <span className="acc-mgmt__kpi-value" style={{ color: complianceColor(dashboard.compliancePercentage) }}>{dashboard.compliancePercentage}%</span>
            </article>
            <article className="acc-mgmt__kpi">
              <span className="acc-mgmt__kpi-label">Total Reportes</span>
              <span className="acc-mgmt__kpi-value">{dashboard.totalReports}</span>
              <small>{dashboard.signedReports} signed · {dashboard.draftReports} draft</small>
            </article>
            <article className="acc-mgmt__kpi">
              <span className="acc-mgmt__kpi-label">Meetings</span>
              <span className="acc-mgmt__kpi-value">{dashboard.totalMeetings}</span>
              <small>{dashboard.completedMeetings} completed · {dashboard.scheduledMeetings} scheduled</small>
            </article>
            <article className="acc-mgmt__kpi">
              <span className="acc-mgmt__kpi-label">Commitments</span>
              <span className="acc-mgmt__kpi-value">{dashboard.totalCommitments}</span>
              <small>{dashboard.completedCommitments} done · {dashboard.overdueCommitments} overdue</small>
            </article>
            <article className="acc-mgmt__kpi acc-mgmt__kpi--warning">
              <span className="acc-mgmt__kpi-label">Open Commitments</span>
              <span className="acc-mgmt__kpi-value">{dashboard.openCommitments}</span>
            </article>
            <article className="acc-mgmt__kpi acc-mgmt__kpi--danger">
              <span className="acc-mgmt__kpi-label">Overdue Commitments</span>
              <span className="acc-mgmt__kpi-value">{dashboard.overdueCommitments}</span>
            </article>
          </div>

          {autoCompliance && (
            <Card title="Auto-Compliance Check">
              <div className="acc-mgmt__reasons">
                {autoCompliance.reasons.map((r, i) => (
                  <p key={i}>{r}</p>
                ))}
              </div>
            </Card>
          )}

          <div className="acc-mgmt__quick-actions">
            <h3>Quick Actions</h3>
            <div className="actions">
              <Button type="button" onClick={() => setShowCreateReport(true)}>📊 Generate Report</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreateMeeting(true)}>📅 Schedule Meeting</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreateCommitment(true)}>📋 New Commitment</Button>
              <Button type="button" variant="secondary" onClick={() => setShowIndividualReport(true)}>👤 Individual Report</Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INFORMES DE GESTIÓN */}
      {tab === 'Informes de Gestión' && (
        <div className="acc-mgmt__section">
          <div className="acc-mgmt__section-header">
            <h3>Management Reports</h3>
            <Button type="button" onClick={() => setShowCreateReport(true)}>+ Generate Report</Button>
          </div>
          {reportStats && (
            <div className="acc-mgmt__stats-grid">
              <article className="acc-mgmt__stat"><strong>Total</strong><span>{reportStats.total}</span></article>
              <article className="acc-mgmt__stat"><strong>Signed</strong><span>{reportStats.signed}</span></article>
              <article className="acc-mgmt__stat"><strong>Draft</strong><span>{reportStats.draft}</span></article>
            </div>
          )}
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Report #</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Compliance</th>
                  <th>Status</th>
                  <th>Generated By</th>
                  <th>Signed By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r._id}>
                    <td><button className="link-btn" onClick={() => setShowDetailReport(r)}>{r.reportNumber}</button></td>
                    <td>{r.reportType}</td>
                    <td>{formatDate(r.periodStart)} - {formatDate(r.periodEnd)}</td>
                    <td>{r.compliancePercentage}%</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{r.generatedBy?.name || r.generatedBy?.email || '—'}</td>
                    <td>{r.signedBy?.name || r.signedBy?.email || '—'}</td>
                    <td>
                      <div className="actions">
                        {r.status === 'DRAFT' && <Button type="button" variant="secondary" onClick={() => handleSignReport(r._id)}>Sign</Button>}
                        {r.status !== 'ARCHIVED' && <Button type="button" variant="ghost" onClick={() => handleArchiveReport(r._id)}>Archive</Button>}
                        <Button type="button" variant="ghost" onClick={() => setShowDetailReport(r)}>View</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr><td colSpan={8}><p className="empty-state">No reports generated yet</p></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RENDICIÓN INDIVIDUAL */}
      {tab === 'Rendición Individual' && (
        <div className="acc-mgmt__section">
          <div className="acc-mgmt__section-header">
            <h3>Individual Accountability Reports</h3>
            <Button type="button" onClick={() => setShowIndividualReport(true)}>+ Submit Report</Button>
          </div>
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Report #</th>
                  <th>Date</th>
                  <th>Resumen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.filter((r) => r.executiveSummary).map((r) => (
                  <tr key={r._id}>
                    <td>{r.reportNumber}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>{r.executiveSummary?.substring(0, 100)}...</td>
                    <td>{statusBadge(r.status)}</td>
                  </tr>
                ))}
                {reports.filter((r) => r.executiveSummary).length === 0 && (
                  <tr><td colSpan={4}><p className="empty-state">No individual reports submitted</p></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: REUNIONES */}
      {tab === 'Reuniones' && (
        <div className="acc-mgmt__section">
          <div className="acc-mgmt__section-header">
            <h3>Accountability Meetings</h3>
            <Button type="button" onClick={() => setShowCreateMeeting(true)}>+ Schedule Meeting</Button>
          </div>
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Participants</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m._id}>
                    <td><strong>{m.title}</strong></td>
                    <td>{formatDate(m.date)}</td>
                    <td>{m.time || '—'}</td>
                    <td>{m.meetingType}</td>
                    <td>{statusBadge(m.status)}</td>
                    <td>{m.participants?.length || 0}</td>
                    <td>
                      <div className="actions">
                        {m.status === 'SCHEDULED' && (
                          <Button type="button" variant="secondary" onClick={() => handleCompleteMeeting(m._id)}>Complete & Generate Minutes</Button>
                        )}
                        <Button type="button" variant="ghost" onClick={() => handleDeleteMeeting(m._id)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {meetings.length === 0 && (
                  <tr><td colSpan={7}><p className="empty-state">No meetings scheduled</p></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: COMPROMISOS */}
      {tab === 'Compromisos' && (
        <div className="acc-mgmt__section">
          <div className="acc-mgmt__section-header">
            <h3>Commitments & Follow-up</h3>
            <div className="actions">
              <Button type="button" onClick={() => setShowCreateCommitment(true)}>+ New Commitment</Button>
            </div>
          </div>

          {pendingJustifications.length > 0 && (
            <Card title={`⚠ ${pendingJustifications.length} Justification(s) Pending Approval`}>
              {pendingJustifications.map((c) => (
                <div key={c._id} className="acc-mgmt__justification-card">
                  <p><strong>{c.title}</strong> - {c.justificationReason}</p>
                  <p className="muted">Proposed new date: {formatDate(c.justificationNewDate)}</p>
                  <div className="actions">
                    <Button type="button" variant="secondary" onClick={() => handleApproveJustification(c._id, true)}>✅ Approve</Button>
                    <Button type="button" variant="danger" onClick={() => handleApproveJustification(c._id, false)}>❌ Reject</Button>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Responsible</th>
                  <th>Due Date</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Meeting</th>
                  <th>Justification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {commitments.map((c) => (
                  <tr key={c._id}>
                    <td><button className="link-btn" onClick={() => setShowDetailCommitment(c)}>{c.title}</button></td>
                    <td>{c.responsibleUser?.name || c.responsibleUser?.email || '—'}</td>
                    <td>{formatDate(c.dueDate)}</td>
                    <td><span className={`badge badge--${c.priority === 'CRITICAL' ? 'danger' : c.priority === 'HIGH' ? 'warning' : 'info'}`}>{c.priority}</span></td>
                    <td>{statusBadge(c.status)}</td>
                    <td>{c.meetingId?.title || '—'}</td>
                    <td>
                      {c.justificationStatus === 'PENDING' && <span className="badge badge--warning">Pending Approval</span>}
                      {c.justificationStatus === 'APPROVED' && <span className="badge badge--success">Approved</span>}
                      {c.justificationStatus === 'REJECTED' && <span className="badge badge--danger">Rejected</span>}
                      {!c.justificationStatus && c.status === 'OVERDUE' && (
                        <Button type="button" variant="secondary" onClick={() => { setShowJustify(c._id); setJustifyForm({ reason: '', correctiveAction: '', newProposedDate: '' }); }}>Justify</Button>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        {c.status !== 'COMPLETED' && c.status !== 'CANCELLED' && (
                          <Button type="button" variant="secondary" onClick={() => handleCompleteCommitment(c._id)}>Complete</Button>
                        )}
                        <Button type="button" variant="ghost" onClick={() => setShowDetailCommitment(c)}>View</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {commitments.length === 0 && (
                  <tr><td colSpan={8}><p className="empty-state">No commitments registered</p></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {commitmentStats && (
            <div className="acc-mgmt__stats-grid">
              <article className="acc-mgmt__stat"><strong>Total</strong><span>{commitmentStats.total}</span></article>
              <article className="acc-mgmt__stat"><strong>Open</strong><span>{commitmentStats.open}</span></article>
              <article className="acc-mgmt__stat"><strong>Completadas</strong><span>{commitmentStats.completed}</span></article>
              <article className="acc-mgmt__stat acc-mgmt__stat--danger"><strong>Overdue</strong><span>{commitmentStats.overdue}</span></article>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: INDICADORES */}
      {tab === 'Indicadores' && dashboard && (
        <div className="acc-mgmt__section">
          <h3>SG-SST Accountability Indicators</h3>
          <div className="acc-mgmt__indicators-grid">
            <div className="acc-mgmt__indicator">
              <span className="acc-mgmt__indicator-label">Compliance %</span>
              <div className="acc-mgmt__progress-track">
                <div className="acc-mgmt__progress-fill" style={{ width: `${dashboard.compliancePercentage}%`, backgroundColor: complianceColor(dashboard.compliancePercentage) }} />
              </div>
              <span className="acc-mgmt__indicator-value">{dashboard.compliancePercentage}%</span>
            </div>
            <div className="acc-mgmt__indicator">
              <span className="acc-mgmt__indicator-label">Meeting Completion</span>
              <div className="acc-mgmt__progress-track">
                <div className="acc-mgmt__progress-fill" style={{ width: `${dashboard.totalMeetings > 0 ? (dashboard.completedMeetings / dashboard.totalMeetings) * 100 : 0}%`, backgroundColor: '#2563eb' }} />
              </div>
              <span className="acc-mgmt__indicator-value">{dashboard.totalMeetings > 0 ? Math.round((dashboard.completedMeetings / dashboard.totalMeetings) * 100) : 0}%</span>
            </div>
            <div className="acc-mgmt__indicator">
              <span className="acc-mgmt__indicator-label">Commitment Completion</span>
              <div className="acc-mgmt__progress-track">
                <div className="acc-mgmt__progress-fill" style={{ width: `${dashboard.totalCommitments > 0 ? (dashboard.completedCommitments / dashboard.totalCommitments) * 100 : 0}%`, backgroundColor: '#16a34a' }} />
              </div>
              <span className="acc-mgmt__indicator-value">{dashboard.totalCommitments > 0 ? Math.round((dashboard.completedCommitments / dashboard.totalCommitments) * 100) : 0}%</span>
            </div>
            <div className="acc-mgmt__indicator">
              <span className="acc-mgmt__indicator-label">Report Status</span>
              <div className="acc-mgmt__progress-track">
                <div className="acc-mgmt__progress-fill" style={{ width: `${dashboard.totalReports > 0 ? (dashboard.signedReports / dashboard.totalReports) * 100 : 0}%`, backgroundColor: '#8b5cf6' }} />
              </div>
              <span className="acc-mgmt__indicator-value">{dashboard.totalReports > 0 ? Math.round((dashboard.signedReports / dashboard.totalReports) * 100) : 0}%</span>
            </div>
            <div className="acc-mgmt__indicator">
              <span className="acc-mgmt__indicator-label">Open Findings (Overdue)</span>
              <div className="acc-mgmt__progress-track">
                <div className="acc-mgmt__progress-fill" style={{ width: `${Math.min(100, dashboard.overdueCommitments * 20)}%`, backgroundColor: '#dc2626' }} />
              </div>
              <span className="acc-mgmt__indicator-value">{dashboard.overdueCommitments}</span>
            </div>
            <div className="acc-mgmt__indicator">
              <span className="acc-mgmt__indicator-label">Closed Findings (Completed)</span>
              <div className="acc-mgmt__progress-track">
                <div className="acc-mgmt__progress-fill" style={{ width: `${dashboard.totalCommitments > 0 ? (dashboard.completedCommitments / dashboard.totalCommitments) * 100 : 0}%`, backgroundColor: '#059669' }} />
              </div>
              <span className="acc-mgmt__indicator-value">{dashboard.completedCommitments}</span>
            </div>
          </div>

          {commitmentStats && (
            <div className="acc-mgmt__indicator">
              <span className="acc-mgmt__indicator-label">Near Miss / Accident Indicators</span>
              <p className="muted">Open: {commitmentStats.open} · In Progress: {commitmentStats.inProgress ?? 0} · Completed: {commitmentStats.completed} · Overdue: {commitmentStats.overdue}</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 7: HISTORIAL */}
      {tab === 'Historial' && (
        <div className="acc-mgmt__section">
          <h3>Complete Audit Trail</h3>
          <div className="acc-mgmt__history-feed">
            {history.map((entry) => (
              <article key={entry._id} className="acc-mgmt__history-item">
                <div className="acc-mgmt__history-header">
                  <span className={`acc-mgmt__history-action acc-mgmt__history-action--${entry.action.toLowerCase().replace(/_/g, '-')}`}>{entry.action.replace(/_/g, ' ')}</span>
                  <span className="muted">{formatDateTime(entry.createdAt)}</span>
                  <span className="muted">by {entry.userEmail}</span>
                </div>
                <p className="acc-mgmt__history-desc">{entry.description}</p>
                {entry.previousValue && entry.newValue && (
                  <div className="acc-mgmt__history-diff">
                    <span className="acc-mgmt__diff-old">Prev: {JSON.stringify(entry.previousValue)}</span>
                    <span className="acc-mgmt__diff-new">New: {JSON.stringify(entry.newValue)}</span>
                  </div>
                )}
              </article>
            ))}
            {history.length === 0 && <p className="empty-state">No history recorded yet</p>}
          </div>
        </div>
      )}

      {/* MODALS */}

      {/* Create Report Modal */}
      <Modal open={showCreateReport} title="Generate Management Report" onOpenChange={setShowCreateReport}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Report Type</span>
            <select className="input" value={reportForm.reportType} onChange={(e) => setReportForm({ ...reportForm, reportType: e.target.value as AccountabilityReportType })}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="SEMIANNUAL">Semiannual</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Period Start</span>
              <input type="date" className="input" value={reportForm.periodStart} onChange={(e) => setReportForm({ ...reportForm, periodStart: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Period End</span>
              <input type="date" className="input" value={reportForm.periodEnd} onChange={(e) => setReportForm({ ...reportForm, periodEnd: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span className="label">Executive Summary</span>
            <textarea className="input" rows={3} value={reportForm.executiveSummary} onChange={(e) => setReportForm({ ...reportForm, executiveSummary: e.target.value })} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Achievements</span>
              <textarea className="input" rows={3} value={reportForm.achievements} onChange={(e) => setReportForm({ ...reportForm, achievements: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Pending Actions</span>
              <textarea className="input" rows={3} value={reportForm.pendingActions} onChange={(e) => setReportForm({ ...reportForm, pendingActions: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Risk Areas</span>
              <textarea className="input" rows={3} value={reportForm.riskAreas} onChange={(e) => setReportForm({ ...reportForm, riskAreas: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Critical Findings</span>
              <textarea className="input" rows={3} value={reportForm.criticalFindings} onChange={(e) => setReportForm({ ...reportForm, criticalFindings: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Compliance %</span>
              <input type="number" min={0} max={100} className="input" value={reportForm.compliancePercentage} onChange={(e) => setReportForm({ ...reportForm, compliancePercentage: Number(e.target.value) })} />
            </label>
          </div>
          <label className="field">
            <span className="label">Recommendations</span>
            <textarea className="input" rows={3} value={reportForm.recommendations} onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Next Actions</span>
            <textarea className="input" rows={3} value={reportForm.nextActions} onChange={(e) => setReportForm({ ...reportForm, nextActions: e.target.value })} />
          </label>
          <div className="actions">
            <Button type="button" onClick={() => void handleCreateReport()}>Generate Report</Button>
            <Button type="button" variant="secondary" onClick={() => setShowCreateReport(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Create Meeting Modal */}
      <Modal open={showCreateMeeting} title="Schedule Accountability Meeting" onOpenChange={setShowCreateMeeting}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Title</span>
            <input className="input" value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Date</span>
              <input type="date" className="input" value={meetingForm.date} onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Time</span>
              <input type="time" className="input" value={meetingForm.time} onChange={(e) => setMeetingForm({ ...meetingForm, time: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Location</span>
              <input className="input" value={meetingForm.location} onChange={(e) => setMeetingForm({ ...meetingForm, location: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Type</span>
              <select className="input" value={meetingForm.meetingType} onChange={(e) => setMeetingForm({ ...meetingForm, meetingType: e.target.value as AccountabilityMeetingType })}>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="EXTRAORDINARY">Extraordinary</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <Button type="button" onClick={() => void handleCreateMeeting()}>Schedule Meeting</Button>
            <Button type="button" variant="secondary" onClick={() => setShowCreateMeeting(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Create Commitment Modal */}
      <Modal open={showCreateCommitment} title="New Commitment" onOpenChange={setShowCreateCommitment}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Title</span>
            <input className="input" value={commitmentForm.title} onChange={(e) => setCommitmentForm({ ...commitmentForm, title: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Description</span>
            <textarea className="input" rows={2} value={commitmentForm.description} onChange={(e) => setCommitmentForm({ ...commitmentForm, description: e.target.value })} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Responsible User</span>
              <select className="input" value={commitmentForm.responsibleUser} onChange={(e) => setCommitmentForm({ ...commitmentForm, responsibleUser: e.target.value })}>
                <option value="">Select user...</option>
                {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} · {emp.position}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="label">Due Date</span>
              <input type="date" className="input" value={commitmentForm.dueDate} onChange={(e) => setCommitmentForm({ ...commitmentForm, dueDate: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Priority</span>
              <select className="input" value={commitmentForm.priority} onChange={(e) => setCommitmentForm({ ...commitmentForm, priority: e.target.value as AccountabilityCommitmentPriority })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Meeting (optional)</span>
              <select className="input" value={commitmentForm.meetingId} onChange={(e) => setCommitmentForm({ ...commitmentForm, meetingId: e.target.value })}>
                <option value="">No meeting</option>
                {meetings.map((m) => <option key={m._id} value={m._id}>{m.title}</option>)}
              </select>
            </label>
          </div>
          <div className="actions">
            <Button type="button" onClick={() => void handleCreateCommitment()}>Crear Compromiso</Button>
            <Button type="button" variant="secondary" onClick={() => setShowCreateCommitment(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Individual Report Modal */}
      <Modal open={showIndividualReport} title="Individual Accountability Report" onOpenChange={setShowIndividualReport}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Activities Performed</span>
            <textarea className="input" rows={3} value={individualReportForm.activitiesPerformed} onChange={(e) => setIndividualReportForm({ ...individualReportForm, activitiesPerformed: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Activities Pending</span>
            <textarea className="input" rows={3} value={individualReportForm.activitiesPending} onChange={(e) => setIndividualReportForm({ ...individualReportForm, activitiesPending: e.target.value })} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Difficulties</span>
              <textarea className="input" rows={2} value={individualReportForm.difficulties} onChange={(e) => setIndividualReportForm({ ...individualReportForm, difficulties: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Corrective Actions</span>
              <textarea className="input" rows={2} value={individualReportForm.correctiveActions} onChange={(e) => setIndividualReportForm({ ...individualReportForm, correctiveActions: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Recommendations</span>
              <textarea className="input" rows={2} value={individualReportForm.recommendations} onChange={(e) => setIndividualReportForm({ ...individualReportForm, recommendations: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Observations</span>
              <textarea className="input" rows={2} value={individualReportForm.observations} onChange={(e) => setIndividualReportForm({ ...individualReportForm, observations: e.target.value })} />
            </label>
          </div>
          <div className="actions">
            <Button type="button" onClick={() => void handleCreateIndividualReport()}>Submit Report</Button>
            <Button type="button" variant="secondary" onClick={() => setShowIndividualReport(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Justify Commitment Modal */}
      <Modal open={!!showJustify} title="Submit Justification" onOpenChange={(open) => { if (!open) setShowJustify(null); }}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Reason for Delay</span>
            <textarea className="input" rows={3} value={justifyForm.reason} onChange={(e) => setJustifyForm({ ...justifyForm, reason: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Corrective Action</span>
            <textarea className="input" rows={2} value={justifyForm.correctiveAction} onChange={(e) => setJustifyForm({ ...justifyForm, correctiveAction: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">New Proposed Date</span>
            <input type="date" className="input" value={justifyForm.newProposedDate} onChange={(e) => setJustifyForm({ ...justifyForm, newProposedDate: e.target.value })} />
          </label>
          <div className="actions">
            <Button type="button" onClick={() => showJustify && void handleSubmitJustification(showJustify)}>Enviar</Button>
            <Button type="button" variant="secondary" onClick={() => setShowJustify(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Detail Report Modal */}
      <Modal open={!!showDetailReport} title={showDetailReport ? `Report: ${showDetailReport.reportNumber}` : ''} onOpenChange={(open) => { if (!open) setShowDetailReport(null); }}>
        {showDetailReport && (
          <div className="acc-mgmt__detail">
            <div className="acc-mgmt__detail-grid">
              <div><strong>Type:</strong> {showDetailReport.reportType}</div>
              <div><strong>Period:</strong> {formatDate(showDetailReport.periodStart)} - {formatDate(showDetailReport.periodEnd)}</div>
              <div><strong>Status:</strong> {statusBadge(showDetailReport.status)}</div>
              <div><strong>Compliance:</strong> {showDetailReport.compliancePercentage}%</div>
            </div>
            <h4>Executive Summary</h4>
            <p>{showDetailReport.executiveSummary || '—'}</p>
            <h4>Achievements</h4>
            <p>{showDetailReport.achievements || '—'}</p>
            <h4>Pending Actions</h4>
            <p>{showDetailReport.pendingActions || '—'}</p>
            <h4>Risk Areas</h4>
            <p>{showDetailReport.riskAreas || '—'}</p>
            <h4>Critical Findings</h4>
            <p>{showDetailReport.criticalFindings || '—'}</p>
            <h4>Recommendations</h4>
            <p>{showDetailReport.recommendations || '—'}</p>
            <h4>Next Actions</h4>
            <p>{showDetailReport.nextActions || '—'}</p>
            <div className="actions">
              {showDetailReport.status === 'DRAFT' && <Button type="button" variant="secondary" onClick={() => { handleSignReport(showDetailReport._id); setShowDetailReport(null); }}>Sign Report</Button>}
              {showDetailReport.status !== 'ARCHIVED' && <Button type="button" variant="ghost" onClick={() => { handleArchiveReport(showDetailReport._id); setShowDetailReport(null); }}>Archive</Button>}
            </div>
          </div>
        )}
      </Modal>

      {/* Detail Commitment Modal */}
      <Modal open={!!showDetailCommitment} title={showDetailCommitment ? `Commitment: ${showDetailCommitment.title}` : ''} onOpenChange={(open) => { if (!open) setShowDetailCommitment(null); }}>
        {showDetailCommitment && (
          <div className="acc-mgmt__detail">
            <div className="acc-mgmt__detail-grid">
              <div><strong>Status:</strong> {statusBadge(showDetailCommitment.status)}</div>
              <div><strong>Priority:</strong> {showDetailCommitment.priority}</div>
              <div><strong>Due Date:</strong> {formatDate(showDetailCommitment.dueDate)}</div>
              <div><strong>Responsible:</strong> {showDetailCommitment.responsibleUser?.name || showDetailCommitment.responsibleUser?.email || '—'}</div>
            </div>
            <p>{showDetailCommitment.description || 'No description'}</p>
            {showDetailCommitment.justificationReason && (
              <>
                <h4>Justification</h4>
                <p>{showDetailCommitment.justificationReason}</p>
                {showDetailCommitment.justificationCorrectiveAction && <p>Corrective: {showDetailCommitment.justificationCorrectiveAction}</p>}
                {showDetailCommitment.justificationNewDate && <p>New date: {formatDate(showDetailCommitment.justificationNewDate)}</p>}
              </>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
