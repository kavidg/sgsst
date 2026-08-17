import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ConvivenciaPeriodModel,
  ConvivenciaComplianceSnapshotModel,
  ConvivenciaComplianceStatus,
  ConvivenciaDocumentModel,
  fetchConvivenciaSummary,
  fetchConvivenciaCompliance,
  fetchConvivenciaDocuments,
  generateConvivenciaConstitution,
  generateConvivenciaComplianceReport,
  addConvivenciaMember,
  removeConvivenciaMember,
  startConvivenciaCampaign,
  reviewConvivenciaCandidate,
  initConvivenciaVoting,
  fetchConvivenciaResults,
  autoCreateConvivenciaCommittee,
  scheduleConvivenciaMeeting,
  autoScheduleConvivenciaMeetings,
  completeConvivenciaMeeting,
  addConvivenciaCommitment,
  updateConvivenciaCommitment,
  addConvivenciaEvidence,
  removeConvivenciaEvidence,
  submitConvivenciaApproval,
  approveConvivencia,
  rejectConvivencia,
  fetchConvivenciaAudit,
  fetchConvivenciaDashboard,
  createConvivenciaCase,
  updateConvivenciaCase,
  fetchEmployees,
  EmployeeModel,
} from '../api';
import { AdvancedPageLayout, AdvancedHeader, AdvancedKpiGrid, AdvancedProgressBar } from '../components/advanced-layout';
import { Button } from '../components/ui/Button';

type TabId = 'overview' | 'members' | 'candidates' | 'voting' | 'meetings' | 'action-plans' | 'cases' | 'evidence' | 'documents' | 'history';

// F7B-7: códigos documentales canónicos 1.1.8 (mismo contrato del backend, Fase 5).
const DOC_CODE_CONSTITUTION = 'PHVA-1.1.8-ACTA';
const DOC_CODE_COMPLIANCE = 'PHVA-1.1.8-COMP';

/**
 * F7B-7: clasifica un documento 1.1.8 por su documentCode (fuente canónica).
 * El código identifica el TIPO documental de forma estable (independiente de
 * fileUrl/regeneraciones). Para instancias legacy sin código (null) usa un
 * fallback controlado con la URL del acta: no se rompe la clasificación
 * existente y jamás se asume un tipo que el backend no declaró.
 */
const documentKind = (
  doc: ConvivenciaDocumentModel,
  period: ConvivenciaPeriodModel | null,
): 'constitution' | 'compliance' => {
  if (doc.documentCode === DOC_CODE_CONSTITUTION) return 'constitution';
  if (doc.documentCode === DOC_CODE_COMPLIANCE) return 'compliance';
  // Legacy (sin documentCode): el acta es el único documento vinculado al periodo.
  if (period?.constitutionMinutesPdfUrl && doc.fileUrl === period.constitutionMinutesPdfUrl) {
    return 'constitution';
  }
  return 'compliance';
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '📋 Resumen' },
  { id: 'members', label: '👥 Miembros' },
  { id: 'candidates', label: '📝 Candidatos' },
  { id: 'voting', label: '🗳️ Votación' },
  { id: 'meetings', label: '📅 Reuniones' },
  { id: 'action-plans', label: '🎯 Planes de Acción' },
  { id: 'cases', label: '🔒 Casos' },
  { id: 'evidence', label: '📎 Evidencias' },
  { id: 'documents', label: '📄 Documentos' },
  { id: 'history', label: '🕓 Historial' },
];

export default function ConvivenciaManagementPage({ token, role }: { token: string; role?: string }) {
  const [searchParams] = useSearchParams();
  const isReviewMode = searchParams.get('mode') === 'review';
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [period, setPeriod] = useState<ConvivenciaPeriodModel | null>(null);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  // Fase 6 (1.1.8) — estado de cumplimiento entregado por el backend (read-only)
  // y trazabilidad documental (Fase 5). El frontend NO recalcula nada.
  const [compliance, setCompliance] = useState<ConvivenciaComplianceSnapshotModel | null>(null);
  const [documents, setDocuments] = useState<ConvivenciaDocumentModel[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showCommitmentModal, setShowCommitmentModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [showCaseModal, setShowCaseModal] = useState(false);

  const notify = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); }, []);

  const canApprove = role === 'owner' || role === 'manager';
  const isAdmin = role === 'owner' || role === 'admin';
  // Roles autorizados por el backend para generar documentos 1.1.8
  // (owner, admin, manager).
  const canGenerateDocuments = isAdmin || canApprove;

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [summary, empData, dash] = await Promise.all([
        fetchConvivenciaSummary(token),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
        fetchConvivenciaDashboard(token).catch(() => null),
      ]);
      setPeriod(summary.period);
      setTotalEmployees(summary.totalEmployees);
      setEmployees(empData);
      setDashboard(dash);
      if (summary.period?._id) {
        const [res, aud, snap, docs] = await Promise.all([
          fetchConvivenciaResults(summary.period._id, token).catch(() => null),
          fetchConvivenciaAudit(token, summary.period._id).catch(() => []),
          fetchConvivenciaCompliance(token).catch(() => null),
          fetchConvivenciaDocuments(token, summary.period._id).catch(() => ({ documents: [] })),
        ]);
        setResults(res);
        setAudit(aud);
        setCompliance(snap);
        setDocuments(docs?.documents ?? []);
      } else {
        setCompliance(null);
        setDocuments([]);
      }
    } catch { notify('Error al cargar datos'); }
    finally { setLoading(false); }
  }, [token, notify]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { if (isReviewMode) setActiveTab('overview'); }, [isReviewMode]);

  const statusBadge = (status?: string) => {
    if (status === 'ACTIVO' || status === 'APROBADO' || status === 'APPROVED_AND_SIGNED') return '✅ Activo';
    if (status === 'PENDING_APPROVAL') return '⏳ Pendiente';
    if (status === 'REJECTED') return '❌ Rechazado';
    if (status === 'ARCHIVADO' || status === 'ARCHIVED') return '📦 Archivado';
    if (status === 'VENCIDO') return '⚠️ Vencido';
    return '📝 Borrador';
  };

  // Fase 6 (1.1.8): presentación del estado de cumplimiento EXCLUSIVAMENTE
  // como lo entrega el backend (snapshot del dominio). El frontend no infiere
  // COMPLIES/PENDING/NON_COMPLIANT a partir de miembros, reuniones o evidencias.
  const complianceBadge = (status?: ConvivenciaComplianceStatus) => {
    if (status === 'COMPLIES') return { text: '✅ Cumple', cls: 'advanced-management__badge--success' };
    if (status === 'NON_COMPLIANT') return { text: '❌ No cumple', cls: 'advanced-management__badge--danger' };
    return { text: '⏳ Pendiente', cls: 'advanced-management__badge--warning' };
  };
  const complianceVariant = (status?: ConvivenciaComplianceStatus) => {
    if (status === 'COMPLIES') return 'success' as const;
    if (status === 'NON_COMPLIANT') return 'danger' as const;
    return 'warning' as const;
  };

  return (
    <AdvancedPageLayout>
      {toast && <div className="toast-alert" style={{ margin: '0 1rem' }}><p>{toast}</p></div>}

      <AdvancedHeader
        backPath="/documents/plan" backLabel="← Volver a Implementación"
        moduleCode="1.1.8" moduleTitle="Comité de Convivencia Laboral"
        description={`${period?.periodName ?? ''} · ${totalEmployees} empleados`}
        statusBadge={<span className="advanced-management__badge">{statusBadge(period?.status)}</span>}
        actions={[
          ...(isAdmin && period?.approvalStatus === 'DRAFT'
            ? [{ label: '📤 Enviar a aprobación', onClick: async () => {
                if (!period?._id) return;
                setLoading(true);
                try { await submitConvivenciaApproval(token, period._id); notify('✅ Enviado a aprobación'); await loadAll(); }
                catch (e: any) { notify('Error: ' + (e.message || '')); }
                setLoading(false);
              }, disabled: loading }
            ] : []),
          ...(canApprove && period?.approvalStatus === 'PENDING_APPROVAL'
            ? [
                { label: '✅ Aprobar', onClick: async () => {
                    if (!period?._id) return;
                    setLoading(true);
                    try { await approveConvivencia(token, period._id); notify('✅ Comité aprobado'); await loadAll(); }
                    catch (e: any) { notify('Error: ' + (e.message || '')); }
                    setLoading(false);
                  }, disabled: loading },
                { label: '❌ Rechazar', variant: 'danger' as const, onClick: () => setShowRejectModal(true), disabled: loading },
              ]
            : []),
        ]}
      />

      {period?.approvalStatus === 'PENDING_APPROVAL' && (
        <div className="advanced-page__banner advanced-page__banner--warning" style={{ margin: '0 1rem' }}>
          ⏳ Pendiente de aprobación por Gerencia. {canApprove ? 'Revisa y decide.' : 'Contenido bloqueado.'}
        </div>
      )}
      {period?.approvalStatus === 'APPROVED_AND_SIGNED' && (
        <div className="advanced-page__banner advanced-page__banner--success" style={{ margin: '0 1rem' }}>
          ✅ Comité de Convivencia aprobado y firmado.
        </div>
      )}
      {period?.approvalStatus === 'REJECTED' && (
        <div className="advanced-page__banner advanced-page__banner--danger" style={{ margin: '0 1rem' }}>
          ❌ Rechazado: {period.rejectionReason || 'Sin motivo registrado'}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.25rem', padding: '1rem', overflowX: 'auto', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button key={tab.id}
            className={`advanced-page__sidebar-item ${activeTab === tab.id ? 'advanced-page__sidebar-item--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ whiteSpace: 'nowrap', padding: '.5rem 1rem' }}
          >{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: '1.5rem' }}>
        {loading && <p className="muted">Cargando...</p>}

        {/* ═══ OVERVIEW ═══ */}
        {activeTab === 'overview' && (
          <>
            <h3>📋 Resumen Comité de Convivencia</h3>
            <AdvancedKpiGrid
              items={[
                { label: 'Estado', value: statusBadge(period?.status) },
                { label: 'Miembros', value: period?.members?.length ?? 0 },
                { label: 'Reuniones', value: period?.meetings?.length ?? 0 },
                { label: 'Votantes', value: results?.totalVotes ?? 0 },
                { label: 'Participación', value: results?.participation ? `${Math.round(results.participation)}%` : '0%' },
                { label: 'Casos', value: dashboard?.openCases ?? 0 },
              ]}
              columns={3}
            />

            {/* Fase 6 (1.1.8) — Cumplimiento 1.1.8: estado REAL del backend
                (GET /convivencia/compliance). Se muestra tal cual; NO se calcula
                en el frontend. */}
            {compliance && (
              <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
                  <h4 style={{ margin: 0 }}>📈 Cumplimiento 1.1.8 — Comité de Convivencia</h4>
                  <span className={`advanced-management__badge ${complianceBadge(compliance.complianceStatus).cls}`}>
                    {compliance.exempt ? '✅ Exento' : complianceBadge(compliance.complianceStatus).text}
                  </span>
                </div>
                {compliance.complianceReason && (
                  <p className="muted" style={{ marginTop: '.5rem', marginBottom: '.75rem' }}>{compliance.complianceReason}</p>
                )}
                <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.5rem' }}>
                  Periodo: {statusBadge(compliance.periodStatus)} · Aprobación:{' '}
                  {compliance.approvalStatus ? statusBadge(compliance.approvalStatus) : '—'}
                </p>
                <AdvancedProgressBar
                  value={compliance.percentage}
                  label={`Progreso del estándar`}
                  variant={complianceVariant(compliance.complianceStatus)}
                  size="lg"
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: '.35rem', color: '#166534' }}>✅ Criterios cumplidos</p>
                    {compliance.metCriteria.length === 0 ? (
                      <p className="muted">—</p>
                    ) : compliance.metCriteria.map((c) => (
                      <p key={c} className="muted" style={{ margin: '.15rem 0' }}>· {c}</p>
                    ))}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: '.35rem', color: '#92400e' }}>⏳ Criterios pendientes</p>
                    {compliance.missingCriteria.length === 0 ? (
                      <p className="muted">—</p>
                    ) : compliance.missingCriteria.map((c) => (
                      <p key={c} className="muted" style={{ margin: '.15rem 0' }}>· {c}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              <div className="card" style={{ padding: '1rem' }}>
                <h4>🏢 Empresa</h4>
                <p className="muted">{totalEmployees} empleados activos</p>
                <p className="muted">Comité de Convivencia: {'✅ Requerido'}</p>
              </div>
              <div className="card" style={{ padding: '1rem' }}>
                <h4>📅 Periodo Actual</h4>
                <p className="muted">{period?.periodName ?? 'No definido'}</p>
                {period?.startDate && <p className="muted">Inicio: {new Date(period.startDate).toLocaleDateString()}</p>}
                {period?.endDate && <p className="muted">Fin: {new Date(period.endDate).toLocaleDateString()}</p>}
              </div>
              <div className="card" style={{ padding: '1rem' }}>
                <h4>📊 Indicadores</h4>
                <p className="muted">Reuniones completadas: {dashboard?.meetingCompletion ?? 0}%</p>
                <p className="muted">Planes de acción abiertos: {dashboard?.pendingCommitments ?? 0}</p>
                <p className="muted">Planes cerrados: {dashboard?.closedCommitments ?? 0}</p>
                <p className="muted">Casos abiertos: {dashboard?.openCases ?? 0}</p>
                {dashboard?.nextMeeting && <p className="muted">Próxima reunión: {new Date(dashboard.nextMeeting.date).toLocaleDateString()}</p>}
              </div>
            </div>
          </>
        )}

        {/* ═══ MEMBERS ═══ */}
        {activeTab === 'members' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>👥 Miembros del Comité</h3>
              {isAdmin && period?.locked !== true && <Button type="button" onClick={() => setShowMemberModal(true)}>+ Agregar miembro</Button>}
            </div>
            {(!period?.members || period.members.length === 0) ? (
              <p className="empty-state">No hay miembros registrados.</p>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead><tr><th>Nombre</th><th>Rol</th><th>Departamento</th><th>Representación</th><th>Principal/Suplente</th><th>Estado</th>{isAdmin && <th>Acción</th>}</tr></thead>
                  <tbody>
                    {period.members.map((m, i) => {
                      const emp = employees.find((e) => e._id === m.userId);
                      return (
                        <tr key={i}>
                          <td>{m.userName}</td><td>{m.committeeRole}</td>
                          <td>{emp?.area || (m as any).department || '—'}</td>
                          <td>{m.representationType}</td><td>{m.principalType}</td>
                          <td><span className="advanced-management__badge">{m.status}</span></td>
                          {isAdmin && <td><Button type="button" variant="danger" onClick={async () => { if (!period._id) return; try { await removeConvivenciaMember(token, period._id, i); notify('Miembro removido'); await loadAll(); } catch (e: any) { notify('Error'); } }}>🗑</Button></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {showMemberModal && (
              <div className="modal-overlay" onClick={() => setShowMemberModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>Agregar Miembro Comité de Convivencia</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget);
                    if (!period?._id) return;
                    const selUserId = fd.get('userId') as string;
                    const selEmp = employees.find((e) => e._id === selUserId);
                    try { await addConvivenciaMember(token, period._id, { userId: selUserId, userName: selEmp?.name || 'Miembro', committeeRole: fd.get('committeeRole') as string, representationType: fd.get('representationType') as string, principalType: fd.get('principalType') as string, startDate: fd.get('startDate') as string }); notify('Miembro agregado'); setShowMemberModal(false); await loadAll(); } catch (e: any) { notify('Error'); }
                  }}>
                    <div className="form-grid">
                      <label>Empleado *</label><select name="userId" className="input" required><option value="">Seleccionar empleado</option>{employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} · {emp.position} · {emp.area}</option>)}</select>
                      <label>Rol *</label><select name="committeeRole" className="input" required><option value="PRESIDENTE">Presidente</option><option value="SECRETARIO">Secretario</option><option value="PRINCIPAL">Principal</option><option value="SUPLENTE">Suplente</option></select>
                      <label>Representación *</label><select name="representationType" className="input" required><option value="EMPLEADOR">Empleador</option><option value="TRABAJADOR">Trabajador</option></select>
                      <label>Principal/Suplente *</label><select name="principalType" className="input" required><option value="PRINCIPAL">Principal</option><option value="SUPLENTE">Suplente</option></select>
                      <label>Fecha inicio *</label><input name="startDate" type="date" className="input" required />
                    </div>
                    <div className="actions" style={{ marginTop: '1rem' }}><Button type="submit">Guardar</Button><Button type="button" variant="ghost" onClick={() => setShowMemberModal(false)}>Cancelar</Button></div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ CANDIDATES ═══ */}
        {activeTab === 'candidates' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>📝 Registro de Candidatos</h3>
              {isAdmin && period?.locked !== true && <Button type="button" onClick={() => setShowCampaignModal(true)}>🚀 Iniciar convocatoria</Button>}
            </div>
            {period?.registrationCampaign ? (
              <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h4>📢 Convocatoria activa</h4>
                <p className="muted">Apertura: {new Date(period.registrationCampaign!.openingDate).toLocaleDateString()} · Cierre: {new Date(period.registrationCampaign!.closingDate).toLocaleDateString()}</p>
                {period.registrationCampaign.secureToken && (
                  <div style={{ marginTop: '.5rem' }}>
                    <p><strong>Link de inscripción:</strong></p>
                    <code style={{ display: 'block', padding: '.5rem', background: '#f3f4f6', borderRadius: '4px', fontSize: '.85rem', wordBreak: 'break-all' }}>{`${window.location.origin}/convivencia/register/${period.registrationCampaign!.secureToken}`}</code>
                    <div className="actions" style={{ marginTop: '.5rem', flexWrap: 'wrap' }}>
                      <Button type="button" variant="secondary" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/convivencia/register/${period.registrationCampaign!.secureToken}`); notify('🔗 Link copiado'); }}>📋 Copiar link</Button>
                      <Button type="button" variant="secondary" onClick={() => { window.open(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/convivencia/register/${period.registrationCampaign!.secureToken}`)}`, '_blank'); notify('📱 QR generado'); }}>📱 Generar QR</Button>
                      <Button type="button" variant="secondary" onClick={() => { const link = `${window.location.origin}/convivencia/register/${period.registrationCampaign!.secureToken}`; if (navigator.share) { navigator.share({ title: 'Postulación Comité de Convivencia', url: link }); } else { navigator.clipboard.writeText(link); notify('🔗 Link copiado'); } }}>📤 Compartir</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : <p className="empty-state">No hay convocatoria activa.</p>}
            {period?.candidateExtended && period.candidateExtended.length > 0 && (
              <div className="responsive-table" style={{ marginTop: '1rem' }}>
                <h4>Candidatos ({period.candidateExtended.length})</h4>
                <table className="table"><thead><tr><th>Nombre</th><th>Documento</th><th>Área</th><th>Cargo</th><th>Estado</th><th>Votos</th>{isAdmin && <th>Acción</th>}</tr></thead>
                  <tbody>{period.candidateExtended.map((c, i) => (
                    <tr key={i}><td>{c.name}</td><td>{c.document}</td><td>{c.area}</td><td>{c.position}</td>
                      <td><span className={`advanced-management__badge ${c.adminStatus === 'APROBADO' ? 'advanced-management__badge--success' : c.adminStatus === 'RECHAZADO' ? 'advanced-management__badge--danger' : 'advanced-management__badge--warning'}`}>{c.adminStatus}</span></td>
                      <td>{c.votes}</td>
                      {isAdmin && <td>{c.adminStatus === 'PENDIENTE' && <div className="actions" style={{ flexWrap: 'nowrap' }}><Button type="button" variant="secondary" onClick={async () => { if (!period._id) return; try { await reviewConvivenciaCandidate(token, period._id, i, { adminStatus: 'APROBADO' }); notify('Aprobado'); await loadAll(); } catch (e: any) { notify('Error'); } }}>✅</Button><Button type="button" variant="danger" onClick={async () => { if (!period._id) return; try { await reviewConvivenciaCandidate(token, period._id, i, { adminStatus: 'RECHAZADO' }); notify('Rechazado'); await loadAll(); } catch (e: any) { notify('Error'); } }}>❌</Button></div>}</td>}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ═══ VOTING ═══ */}
        {activeTab === 'voting' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>🗳️ Votación</h3>
              {/* F7B-4: los resultados solo se entregan con la elección CLOSED;
                  el botón de iniciar se basa en el electionState real (F7B-3) y
                  ya NO depende de los resultados (nulos hasta el cierre). */}
              {isAdmin && period?.electionState === 'NOT_STARTED' && <Button type="button" onClick={async () => { if (!period?._id) return; setLoading(true); try { await initConvivenciaVoting(token, period._id); notify('Votación iniciada'); await loadAll(); } catch (e: any) { notify('Error'); } setLoading(false); }}>🗳️ Iniciar votación</Button>}
            </div>
            {results && (
              <><AdvancedKpiGrid items={[{ label: 'Votos', value: results.totalVotes ?? 0 }, { label: 'Participación', value: results.participation ? `${Math.round(results.participation)}%` : '0%', variant: results.participation > 50 ? 'success' : 'warning' }, { label: 'Candidatos', value: results.ranking?.length ?? 0 }, { label: 'Ganadores', value: results.winners?.length ?? 0 }]} columns={4} />
                {results.ranking?.length > 0 && <div className="responsive-table" style={{ marginTop: '1rem' }}><h4>Resultados</h4><table className="table"><thead><tr><th>#</th><th>Candidato</th><th>Votos</th><th>Estado</th></tr></thead><tbody>{results.ranking.map((c: any, i: number) => <tr key={i}><td>{c.rank}</td><td>{c.name}</td><td>{c.votes}</td><td>{c.status}</td></tr>)}</tbody></table></div>}
                {results.winners?.length > 0 && <div className="actions" style={{ marginTop: '1rem' }}><Button type="button" onClick={async () => { if (!period?._id) return; try { await autoCreateConvivenciaCommittee(token, period._id, 2); notify('Comité creado'); await loadAll(); } catch (e: any) { notify('Error'); } }}>🤝 Crear comité automáticamente</Button></div>}
              </>
            )}
          </>
        )}

        {/* ═══ MEETINGS ═══ */}
        {activeTab === 'meetings' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
              <h3 style={{ margin: 0 }}>📅 Reuniones</h3>
              <div className="actions" style={{ flexWrap: 'nowrap' }}>
                {isAdmin && period?.locked !== true && <><Button type="button" onClick={() => setShowMeetingModal(true)}>+ Programar</Button><Button type="button" variant="secondary" onClick={async () => { if (!period?._id) return; setLoading(true); try { await autoScheduleConvivenciaMeetings(token, period._id); notify('Reuniones mensuales programadas'); await loadAll(); } catch (e: any) { notify('Error'); } setLoading(false); }}>📅 Programar mensuales</Button></>}
              </div>
            </div>
            {(!period?.meetings || period.meetings.length === 0) ? <p className="empty-state">No hay reuniones programadas.</p> : (
              <div className="responsive-table"><table className="table"><thead><tr><th>Fecha</th><th>Agenda</th><th>Asistentes</th><th>Estado</th><th>Acción</th></tr></thead>
                <tbody>{period.meetings.map((m, i) => (
                  <tr key={i}><td>{new Date(m.meetingDate).toLocaleDateString()}</td><td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.agenda}</td><td>{(m as any).attendees?.length ?? 0}</td>
                    <td><span className={`advanced-management__badge ${m.status === 'CERRADA' ? 'advanced-management__badge--success' : m.status === 'CANCELADA' ? 'advanced-management__badge--danger' : 'advanced-management__badge--warning'}`}>{m.status}</span></td>
                    <td>{m.status === 'PROGRAMADA' && isAdmin && <Button type="button" variant="secondary" onClick={async () => { if (!period._id) return; const dev = prompt('Desarrollo:') || ''; const att = prompt('Asistentes (separados por coma):') || ''; try { await completeConvivenciaMeeting(token, period._id, i, { development: dev, attendees: att.split(',').map((s) => s.trim()).filter(Boolean) }); notify('Reunión completada'); await loadAll(); } catch (e: any) { notify('Error'); } }}>✅ Cerrar</Button>}</td>
                  </tr>
                ))}</tbody></table></div>
            )}
          </>
        )}

        {/* ═══ ACTION PLANS ═══ */}
        {activeTab === 'action-plans' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>🎯 Planes de Acción</h3>
              {isAdmin && period?.locked !== true && <Button type="button" onClick={() => setShowCommitmentModal(true)}>+ Nuevo plan</Button>}
            </div>
            {(!period?.commitments || (period.commitments as any[]).length === 0) ? <p className="empty-state">No hay planes de acción registrados.</p> : (
              <div className="responsive-table"><table className="table"><thead><tr><th>Descripción</th><th>Responsable</th><th>Vence</th><th>Prioridad</th><th>Estado</th><th>Acción</th></tr></thead>
                <tbody>{(period.commitments as any[]).map((c: any, i: number) => (
                  <tr key={c._id || i}><td style={{ maxWidth: '250px' }}>{c.description}</td><td>{c.responsibleParty}</td><td>{c.deadline ? new Date(c.deadline).toLocaleDateString() : '—'}</td>
                    <td><span className={`advanced-management__badge ${c.priority === 'CRITICAL' ? 'advanced-management__badge--danger' : c.priority === 'HIGH' ? 'advanced-management__badge--warning' : 'advanced-management__badge--success'}`}>{c.priority}</span></td>
                    <td>{c.status}</td>
                    <td>{isAdmin && c.status !== 'COMPLETED' && <Button type="button" variant="secondary" onClick={async () => { if (!period._id) return; try { await updateConvivenciaCommitment(token, period._id, c._id, { status: 'COMPLETED' }); notify('Completado'); await loadAll(); } catch (e: any) { notify('Error'); } }}>✅ Completar</Button>}</td>
                  </tr>
                ))}</tbody></table></div>
            )}
          </>
        )}

        {/* ═══ CASES ═══ */}
        {activeTab === 'cases' && (
          <>
            <div className="advanced-page__banner" style={{ marginBottom: '1rem', background: '#fef3c7', border: '1px solid #fbbf24', padding: '.75rem', borderRadius: '6px' }}>
              🔒 Esta sección es confidencial. Solo visible para ADMIN, MANAGER y miembros autorizados del comité.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>🔒 Gestión de Casos</h3>
              {isAdmin && <Button type="button" onClick={() => setShowCaseModal(true)}>+ Nuevo caso</Button>}
            </div>
            {(!period?.cases || period.cases.length === 0) ? <p className="empty-state">No hay casos registrados.</p> : (
              <div className="responsive-table"><table className="table"><thead><tr><th>N° Caso</th><th>Denunciante</th><th>Denunciado</th><th>Estado</th><th>Recomendaciones</th><th>Acción</th></tr></thead>
                <tbody>{period.cases.map((c: any, i: number) => (
                  <tr key={i}><td><strong>{c.caseNumber}</strong></td><td>{c.isAnonymous ? 'Anónimo' : c.complainantName}</td><td>{c.respondentName}</td>
                    <td><span className={`advanced-management__badge ${c.status === 'CLOSED' ? 'advanced-management__badge--success' : c.status === 'RESOLVED' ? 'advanced-management__badge--info' : 'advanced-management__badge--warning'}`}>{c.status}</span></td>
                    <td style={{ maxWidth: '200px', fontSize: '.85rem' }}>{c.recommendations || '—'}</td>
                    <td>{isAdmin && c.status !== 'CLOSED' && <Button type="button" variant="secondary" onClick={async () => { if (!period._id) return; const rec = prompt('Recomendaciones:') || ''; try { await updateConvivenciaCase(token, period._id, i, { status: 'RESOLVED', recommendations: rec }); notify('Caso actualizado'); await loadAll(); } catch (e: any) { notify('Error'); } }}>Resolver</Button>}</td>
                  </tr>
                ))}</tbody></table></div>
            )}
          </>
        )}

        {/* ═══ EVIDENCE ═══ */}
        {activeTab === 'evidence' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>📎 Evidencias</h3>
              {isAdmin && <Button type="button" onClick={() => setShowEvidenceModal(true)}>+ Agregar evidencia</Button>}
            </div>
            {(!period?.evidence || (period.evidence as any[]).length === 0) ? <p className="empty-state">No hay evidencias cargadas.</p> : (
              <div className="responsive-table"><table className="table"><thead><tr><th>Tipo</th><th>Título</th><th>Archivo</th><th>Subido por</th><th>Fecha</th><th>Acción</th></tr></thead>
                <tbody>{(period.evidence as any[]).map((ev: any, i: number) => (
                  <tr key={ev._id || i}><td><span className="advanced-management__badge">{ev.type}</span></td><td>{ev.title}</td><td><a href={ev.fileUrl} target="_blank" rel="noreferrer">{ev.fileName}</a></td><td>{ev.uploadedBy}</td><td>{ev.uploadedAt ? new Date(ev.uploadedAt).toLocaleDateString() : '—'}</td>
                    <td>{isAdmin && <Button type="button" variant="danger" onClick={async () => { if (!period._id) return; try { await removeConvivenciaEvidence(token, period._id, i); notify('Evidencia eliminada'); await loadAll(); } catch (e: any) { notify('Error'); } }}>🗑</Button>}</td>
                  </tr>
                ))}</tbody></table></div>
            )}
          </>
        )}

        {/* ═══ DOCUMENTS (Fase 5/6, 1.1.8) ═══ */}
        {activeTab === 'documents' && (
          <>
            <h3>📄 Documentos — Comité de Convivencia (1.1.8)</h3>
            <p className="muted">
              Documentos generados por el motor documental del sistema. El contenido proviene de los datos
              reales del comité; el reporte de cumplimiento refleja el estado entregado por el backend.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              {/* Acta de conformación */}
              <div className="card" style={{ padding: '1rem' }}>
                <h4>📜 Acta de conformación del Comité</h4>
                {period?.constitutionMinutesPdfUrl ? (
                  <>
                    <span className="advanced-management__badge advanced-management__badge--success">✅ Disponible</span>
                    <p className="muted" style={{ marginTop: '.5rem' }}>Documento generado por el sistema.</p>
                    <div className="actions" style={{ marginTop: '.75rem' }}>
                      <Button type="button" variant="secondary" onClick={() => window.open(period.constitutionMinutesPdfUrl, '_blank')}>👁 Ver acta</Button>
                      <Button type="button" variant="ghost" onClick={() => { const a = document.createElement('a'); a.href = period.constitutionMinutesPdfUrl!; a.download = 'acta-conformacion-comite-convivencia.docx'; a.click(); }}>⬇ Descargar</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="advanced-management__badge advanced-management__badge--warning">⏳ Pendiente de generación</span>
                    <p className="muted" style={{ marginTop: '.5rem' }}>El acta se genera automáticamente al aprobar el comité, o manualmente desde aquí.</p>
                    {canGenerateDocuments && (
                      <div className="actions" style={{ marginTop: '.75rem' }}>
                        <Button
                          type="button"
                          disabled={generating === 'constitution' || !period?._id}
                          onClick={async () => {
                            if (!period?._id) return;
                            setGenerating('constitution');
                            try {
                              await generateConvivenciaConstitution(token, period._id);
                              notify('✅ Acta generada correctamente');
                              await loadAll();
                            } catch (e: any) { notify('Error: ' + (e.message || '')); }
                            setGenerating(null);
                          }}
                        >{generating === 'constitution' ? 'Generando…' : '⚙️ Generar acta'}</Button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Reporte de cumplimiento */}
              <div className="card" style={{ padding: '1rem' }}>
                <h4>📊 Reporte de cumplimiento 1.1.8</h4>
                {/* F7B-7: el reporte se identifica por documentCode canónico
                    (PHVA-1.1.8-COMP); las instancias legacy sin código se
                    clasifican con el fallback controlado. Ya no se depende de
                    comparar fileUrl para identificar el tipo documental. */}
                {(() => {
                  const report = documents
                    .filter((doc) => documentKind(doc, period) !== 'constitution')
                    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
                  return report ? (
                    <>
                      <span className="advanced-management__badge advanced-management__badge--success">✅ Disponible</span>
                      <p className="muted" style={{ marginTop: '.5rem' }}>
                        Generado el {new Date(report.generatedAt).toLocaleString()} · v{report.version}
                      </p>
                      <div className="actions" style={{ marginTop: '.75rem' }}>
                        <Button type="button" variant="secondary" onClick={() => window.open(report.fileUrl, '_blank')}>👁 Ver reporte</Button>
                        <Button type="button" variant="ghost" onClick={() => { const a = document.createElement('a'); a.href = report.fileUrl; a.download = 'reporte-cumplimiento-convivencia.docx'; a.click(); }}>⬇ Descargar</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="advanced-management__badge advanced-management__badge--warning">⏳ Pendiente de generación</span>
                      <p className="muted" style={{ marginTop: '.5rem' }}>El reporte consume el estado de cumplimiento real del comité.</p>
                      {canGenerateDocuments && (
                        <div className="actions" style={{ marginTop: '.75rem' }}>
                          <Button
                            type="button"
                            disabled={generating === 'compliance-report' || !period?._id}
                            onClick={async () => {
                              if (!period?._id) return;
                              setGenerating('compliance-report');
                              try {
                                await generateConvivenciaComplianceReport(token, period._id);
                                notify('✅ Reporte generado correctamente');
                                await loadAll();
                              } catch (e: any) { notify('Error: ' + (e.message || '')); }
                              setGenerating(null);
                            }}
                          >{generating === 'compliance-report' ? 'Generando…' : '⚙️ Generar reporte'}</Button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Trazabilidad documental */}
            {documents.length > 0 && (
              <div className="responsive-table" style={{ marginTop: '1rem' }}>
                <h4>Historial de documentos generados</h4>
                <table className="table">
                  <thead><tr><th>Documento</th><th>Versión</th><th>Estado</th><th>Generado</th><th>Acción</th></tr></thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>{documentKind(doc, period) === 'constitution' ? 'Acta de conformación' : 'Reporte de cumplimiento 1.1.8'}</td>
                        <td>v{doc.version}</td>
                        <td><span className="advanced-management__badge">{doc.status}</span></td>
                        <td>{new Date(doc.generatedAt).toLocaleString()}</td>
                        <td>
                          <div className="actions" style={{ flexWrap: 'nowrap' }}>
                            <Button type="button" variant="secondary" onClick={() => window.open(doc.fileUrl, '_blank')}>👁 Ver</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ═══ HISTORY ═══ */}
        {activeTab === 'history' && (
          <>
            <h3>🕓 Historial de Auditoría</h3>
            {audit.length === 0 ? <p className="empty-state">No hay movimientos registrados.</p> : (
              <div className="responsive-table"><table className="table"><thead><tr><th>Acción</th><th>Usuario</th><th>Fecha</th><th>Detalle</th></tr></thead>
                <tbody>{audit.map((entry: any, i: number) => (
                  <tr key={i}><td><span className="advanced-management__badge">{entry.action}</span></td><td>{entry.createdBy}</td><td>{new Date(entry.createdAt).toLocaleString()}</td><td style={{ fontSize: '.85rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.data}</td></tr>
                ))}</tbody></table></div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showCampaignModal && (
        <div className="modal-overlay" onClick={() => setShowCampaignModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Iniciar Convocatoria</h3><form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (!period?._id) return; try { await startConvivenciaCampaign(token, period._id, { openingDate: fd.get('openingDate') as string, closingDate: fd.get('closingDate') as string, includedDepartments: (fd.get('departments') as string || '').split(',').map((s) => s.trim()).filter(Boolean), requirements: (fd.get('requirements') as string || '').split('\n').filter(Boolean) }); notify('Convocatoria iniciada'); setShowCampaignModal(false); await loadAll(); } catch (e: any) { notify('Error'); } }}>
              <div className="form-grid"><label>Fecha apertura</label><input name="openingDate" type="date" className="input" required /><label>Fecha cierre</label><input name="closingDate" type="date" className="input" required /><label>Departamentos (separados por coma)</label><input name="departments" className="input" placeholder="Producción, Ventas" /><label>Requisitos (uno por línea)</label><textarea name="requirements" className="input" rows={3} placeholder="Ser trabajador activo" /></div>
              <div className="actions" style={{ marginTop: '1rem' }}><Button type="submit">Iniciar</Button><Button type="button" variant="ghost" onClick={() => setShowCampaignModal(false)}>Cancelar</Button></div>
            </form>
          </div>
        </div>
      )}

      {showMeetingModal && (
        <div className="modal-overlay" onClick={() => setShowMeetingModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Programar Reunión</h3><form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (!period?._id) return; try { await scheduleConvivenciaMeeting(token, period._id, { meetingDate: fd.get('meetingDate') as string, agenda: fd.get('agenda') as string, topicList: (fd.get('topics') as string || '').split('\n').filter(Boolean) }); notify('Reunión programada'); setShowMeetingModal(false); await loadAll(); } catch (e: any) { notify('Error'); } }}>
              <div className="form-grid"><label>Fecha</label><input name="meetingDate" type="date" className="input" required /><label>Agenda</label><input name="agenda" className="input" required /><label>Temas</label><textarea name="topics" className="input" rows={4} /></div>
              <div className="actions" style={{ marginTop: '1rem' }}><Button type="submit">Programar</Button><Button type="button" variant="ghost" onClick={() => setShowMeetingModal(false)}>Cancelar</Button></div>
            </form>
          </div>
        </div>
      )}

      {showCommitmentModal && (
        <div className="modal-overlay" onClick={() => setShowCommitmentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Nuevo Plan de Acción</h3><form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (!period?._id) return; try { await addConvivenciaCommitment(token, period._id, { description: fd.get('description') as string, responsibleParty: fd.get('responsibleParty') as string, deadline: fd.get('deadline') as string, priority: fd.get('priority') as any }); notify('Plan creado'); setShowCommitmentModal(false); await loadAll(); } catch (e: any) { notify('Error'); } }}>
              <div className="form-grid"><label>Descripción</label><textarea name="description" className="input" rows={3} required /><label>Responsable</label><input name="responsibleParty" className="input" required /><label>Fecha límite</label><input name="deadline" type="date" className="input" required /><label>Prioridad</label><select name="priority" className="input" required><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></div>
              <div className="actions" style={{ marginTop: '1rem' }}><Button type="submit">Crear</Button><Button type="button" variant="ghost" onClick={() => setShowCommitmentModal(false)}>Cancelar</Button></div>
            </form>
          </div>
        </div>
      )}

      {showCaseModal && (
        <div className="modal-overlay" onClick={() => setShowCaseModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Nuevo Caso</h3>
            <div className="advanced-page__banner" style={{ background: '#fef3c7', border: '1px solid #fbbf24', padding: '.5rem', borderRadius: '4px', marginBottom: '.5rem', fontSize: '.85rem' }}>
              🔒 Esta información es confidencial. Solo personal autorizado puede acceder.
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (!period?._id) return; try { await createConvivenciaCase(token, period._id, { complainantName: fd.get('complainantName') as string, respondentName: fd.get('respondentName') as string, description: fd.get('description') as string, isAnonymous: fd.get('isAnonymous') === 'true' }); notify('Caso creado'); setShowCaseModal(false); await loadAll(); } catch (e: any) { notify('Error'); } }}>
              <div className="form-grid">
                <label>Denunciante</label><input name="complainantName" className="input" placeholder="Nombre completo" required />
                <label><input name="isAnonymous" type="checkbox" value="true" /> Anónimo</label>
                <label>Denunciado</label><input name="respondentName" className="input" placeholder="Nombre del denunciado" required />
                <label>Descripción</label><textarea name="description" className="input" rows={4} required placeholder="Describe la situación..." />
              </div>
              <div className="actions" style={{ marginTop: '1rem' }}><Button type="submit">Crear caso</Button><Button type="button" variant="ghost" onClick={() => setShowCaseModal(false)}>Cancelar</Button></div>
            </form>
          </div>
        </div>
      )}

      {showEvidenceModal && (
        <div className="modal-overlay" onClick={() => setShowEvidenceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Agregar Evidencia</h3><form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (!period?._id) return; try { await addConvivenciaEvidence(token, period._id, { type: fd.get('type') as string, title: fd.get('title') as string, fileName: fd.get('fileName') as string, fileUrl: fd.get('fileUrl') as string }); notify('Evidencia agregada'); setShowEvidenceModal(false); await loadAll(); } catch (e: any) { notify('Error'); } }}>
              <div className="form-grid"><select name="type" className="input" required><option value="MINUTES">Acta</option><option value="ATTENDANCE">Listado asistencia</option><option value="PHOTO">Foto</option><option value="DOCUMENT">Documento</option><option value="PDF">PDF</option></select><input name="title" className="input" placeholder="Título" required /><input name="fileName" className="input" placeholder="Nombre archivo" required /><input name="fileUrl" className="input" placeholder="URL del archivo" required /></div>
              <div className="actions" style={{ marginTop: '1rem' }}><Button type="submit">Agregar</Button><Button type="button" variant="ghost" onClick={() => setShowEvidenceModal(false)}>Cancelar</Button></div>
            </form>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>❌ Rechazar</h3><p>Motivo del rechazo:</p>
            <textarea className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Motivo..." style={{ width: '100%' }} />
            <div className="actions" style={{ marginTop: '1rem' }}>
              <Button type="button" variant="danger" disabled={!rejectReason.trim()} onClick={async () => { if (!period?._id) return; setLoading(true); try { await rejectConvivencia(token, period._id, rejectReason); notify('❌ Rechazado'); setShowRejectModal(false); setRejectReason(''); await loadAll(); } catch (e: any) { notify('Error'); } setLoading(false); }}>Rechazar</Button>
              <Button type="button" variant="ghost" onClick={() => { setShowRejectModal(false); setRejectReason(''); }}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </AdvancedPageLayout>
  );
}
