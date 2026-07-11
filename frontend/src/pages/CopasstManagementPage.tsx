import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CopasstPeriodModel,
  fetchCopasstSummary,
  addCopasstMember,
  removeCopasstMember,
  startCopasstCampaign,
  reviewCopasstCandidate,
  initCopasstVoting,
  fetchCopasstResults,
  autoCreateCopasstCommittee,
  scheduleCopasstMeeting,
  autoScheduleCopasstMeetings,
  completeCopasstMeeting,
  addCopasstCommitment,
  updateCopasstCommitment,
  addCopasstEvidence,
  removeCopasstEvidence,
  submitCopasstApproval,
  approveCopasst,
  rejectCopasst,
  fetchCopasstAudit,
  fetchCopasstDashboard,
  fetchEmployees,
  EmployeeModel,
} from '../api';
import { AdvancedPageLayout, AdvancedHeader, AdvancedKpiGrid } from '../components/advanced-layout';
import { Button } from '../components/ui/Button';

type TabId = 'summary' | 'members' | 'candidates' | 'voting' | 'meetings' | 'commitments' | 'evidence' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: '📋 Resumen' },
  { id: 'members', label: '👥 Miembros' },
  { id: 'candidates', label: '📝 Candidatos' },
  { id: 'voting', label: '🗳️ Votación' },
  { id: 'meetings', label: '📅 Reuniones' },
  { id: 'commitments', label: '🎯 Compromisos' },
  { id: 'evidence', label: '📎 Evidencias' },
  { id: 'history', label: '🕓 Historial' },
];

export default function CopasstManagementPage({ token, role }: { token: string; role?: string }) {
  const [searchParams] = useSearchParams();
  const isReviewMode = searchParams.get('mode') === 'review';
  const [activeTab, setActiveTab] = useState<TabId>('summary');

  // State
  const [period, setPeriod] = useState<CopasstPeriodModel | null>(null);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [requiresCopasst, setRequiresCopasst] = useState(true);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);

  // Modal states
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showCommitmentModal, setShowCommitmentModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const canApprove = role === 'owner' || role === 'manager';
  const isAdmin = role === 'owner' || role === 'admin';

  // ─── LOAD ───
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [summary, empData, dash] = await Promise.all([
        fetchCopasstSummary(token),
        fetchEmployees(token).catch(() => [] as EmployeeModel[]),
        fetchCopasstDashboard(token).catch(() => null),
      ]);
      setPeriod(summary.period);
      setTotalEmployees(summary.totalEmployees);
      setRequiresCopasst(summary.requiresCopasst);
      setEmployees(empData);
      setDashboard(dash);
      if (summary.period?._id) {
        const [res, aud] = await Promise.all([
          fetchCopasstResults(summary.period._id).catch(() => null),
          fetchCopasstAudit(token, summary.period._id).catch(() => []),
        ]);
        setResults(res);
        setAudit(aud);
      }
    } catch {
      notify('Error al cargar datos COPASST');
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (isReviewMode) setActiveTab('summary');
  }, [isReviewMode]);

  if (!requiresCopasst) {
    return (
      <AdvancedPageLayout>
        <AdvancedHeader
          backPath="/documents/plan" backLabel="← Volver a Implementación"
          moduleCode="1.1.6" moduleTitle="Gestión COPASST"
          description="Comité Paritario de Seguridad y Salud en el Trabajo"
          statusBadge={<span className="advanced-management__badge">📦 No requerido</span>}
          actions={[]}
        />
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
          <h3>No se requiere COPASST</h3>
          <p className="muted" style={{ maxWidth: '500px', margin: '0 auto' }}>
            Esta empresa tiene menos de 10 empleados activos ({totalEmployees} actualmente).
            Según la normativa colombiana, las empresas con menos de 10 trabajadores no requieren
            conformar un Comité Paritario de Seguridad y Salud en el Trabajo (COPASST).
          </p>
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24', display: 'inline-block' }}>
            <strong>📌 Recomendación:</strong> Esta empresa requiere un Vigía Ocupacional (Safety and Health Officer)
            en lugar de un COPASST.
          </div>
        </div>
      </AdvancedPageLayout>
    );
  }

  const statusBadge = (status?: string) => {
    if (status === 'ACTIVO' || status === 'APROBADO' || status === 'APPROVED_AND_SIGNED') return '✅ Activo';
    if (status === 'PENDING_APPROVAL') return '⏳ Pendiente';
    if (status === 'REJECTED') return '❌ Rechazado';
    if (status === 'ARCHIVADO' || status === 'ARCHIVED') return '📦 Archivado';
    if (status === 'VENCIDO') return '⚠️ Vencido';
    return '📝 Borrador';
  };

  return (
    <AdvancedPageLayout>
      {/* Toast */}
      {toast && <div className="toast-alert" style={{ margin: '0 1rem' }}><p>{toast}</p></div>}

      <AdvancedHeader
        backPath="/documents/plan" backLabel="← Volver a Implementación"
        moduleCode="1.1.6" moduleTitle="Gestión COPASST"
        description={`Comité Paritario de Seguridad y Salud en el Trabajo · ${period?.periodName ?? ''} · ${totalEmployees} empleados`}
        statusBadge={<span className="advanced-management__badge">{statusBadge(period?.status)}</span>}
        actions={[
          ...(isAdmin && period?.approvalStatus === 'DRAFT'
            ? [{ label: '📤 Enviar a aprobación', onClick: async () => {
                if (!period?._id) return;
                setLoading(true);
                try {
                  await submitCopasstApproval(token, period._id);
                  notify('✅ Enviado a aprobación');
                  await loadAll();
                } catch (e: any) { notify('Error: ' + (e.message || '')); }
                setLoading(false);
              }, disabled: loading }
            ] : []),
          ...(canApprove && period?.approvalStatus === 'PENDING_APPROVAL'
            ? [
                { label: '✅ Aprobar', onClick: async () => {
                    if (!period?._id) return;
                    setLoading(true);
                    try {
                      await approveCopasst(token, period._id);
                      notify('✅ COPASST aprobado y firmado');
                      await loadAll();
                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                    setLoading(false);
                  }, disabled: loading },
                { label: '❌ Rechazar', variant: 'danger' as const, onClick: () => setShowRejectModal(true), disabled: loading },
              ]
            : []),
        ]}
      />

      {/* Approval banners */}
      {period?.approvalStatus === 'PENDING_APPROVAL' && (
        <div className="advanced-page__banner advanced-page__banner--warning" style={{ margin: '0 1rem' }}>
          ⏳ Pendiente de aprobación por Gerencia. {canApprove ? 'Revisa y decide.' : 'Contenido bloqueado hasta que Gerencia revise.'}
        </div>
      )}
      {period?.approvalStatus === 'APPROVED_AND_SIGNED' && (
        <div className="advanced-page__banner advanced-page__banner--success" style={{ margin: '0 1rem' }}>
          ✅ COPASST aprobado y firmado. Acta de constitución generada.
        </div>
      )}
      {period?.approvalStatus === 'REJECTED' && (
        <div className="advanced-page__banner advanced-page__banner--danger" style={{ margin: '0 1rem' }}>
          ❌ Rechazado: {period.rejectionReason || 'Sin motivo registrado'}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '.25rem', padding: '1rem', overflowX: 'auto', borderBottom: '1px solid #e5e7eb' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`advanced-page__sidebar-item ${activeTab === tab.id ? 'advanced-page__sidebar-item--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ whiteSpace: 'nowrap', padding: '.5rem 1rem' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '1.5rem' }}>
        {loading && <p className="muted">Cargando...</p>}

        {/* ═══ SUMMARY ═══ */}
        {activeTab === 'summary' && (
          <>
            <h3>📋 Resumen COPASST</h3>
            <AdvancedKpiGrid
              items={[
                { label: 'Estado', value: statusBadge(period?.status) },
                { label: 'Miembros', value: period?.members?.length ?? 0 },
                { label: 'Reuniones', value: period?.meetings?.length ?? 0 },
                { label: 'Votantes', value: results?.totalVotes ?? 0 },
                { label: 'Participación', value: results?.participation ? `${Math.round(results.participation)}%` : '0%' },
                { label: 'Aprobación', value: period?.approvalStatus === 'APPROVED_AND_SIGNED' ? '✅ Completado' : period?.approvalStatus === 'PENDING_APPROVAL' ? '⏳ Pendiente' : '📝 Borrador' },
              ]}
              columns={3}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              <div className="card" style={{ padding: '1rem' }}>
                <h4>🏢 Empresa</h4>
                <p className="muted">{totalEmployees} empleados activos</p>
                <p className="muted">COPASST: {requiresCopasst ? '✅ Requerido' : '❌ No requerido'}</p>
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
                <p className="muted">Compromisos abiertos: {dashboard?.pendingCommitments ?? 0}</p>
                <p className="muted">Compromisos cerrados: {dashboard?.closedCommitments ?? 0}</p>
                {dashboard?.nextMeeting && (
                  <p className="muted">Próxima reunión: {new Date(dashboard.nextMeeting.date).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══ MEMBERS ═══ */}
        {activeTab === 'members' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>👥 Miembros del COPASST</h3>
              {isAdmin && period?.locked !== true && (
                <Button type="button" onClick={() => setShowMemberModal(true)}>+ Agregar miembro</Button>
              )}
            </div>
            {(!period?.members || period.members.length === 0) ? (
              <p className="empty-state">No hay miembros registrados. Selecciona miembros desde el módulo de Empleados.</p>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Rol</th>
                      <th>Departamento</th>
                      <th>Representación</th>
                      <th>Principal/Suplente</th>
                      <th>Estado</th>
                      {isAdmin && <th>Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {period.members.map((m, i) => {
                      const emp = employees.find((e) => e._id === m.userId);
                      return (
                        <tr key={i}>
                          <td>{m.userName}</td>
                          <td>{m.committeeRole}</td>
                          <td>{emp?.area || (m as any).department || '—'}</td>
                          <td>{m.representationType}</td>
                          <td>{m.principalType}</td>
                          <td><span className="advanced-management__badge">{m.status}</span></td>
                          {isAdmin && (
                            <td>
                              <Button type="button" variant="danger" onClick={async () => {
                                if (!period._id) return;
                                try {
                                  await removeCopasstMember(token, period._id, i);
                                  notify('Miembro removido');
                                  await loadAll();
                                } catch (e: any) { notify('Error: ' + (e.message || '')); }
                              }}>🗑</Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add Member Modal — solo selección, sin campo manual */}
            {showMemberModal && (
              <div className="modal-overlay" onClick={() => setShowMemberModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>Agregar Miembro COPASST</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    if (!period?._id) return;
                    const selectedUserId = fd.get('userId') as string;
                    const selectedEmp = employees.find((e) => e._id === selectedUserId);
                    try {
                      await addCopasstMember(token, period._id, {
                        userId: selectedUserId,
                        userName: selectedEmp?.name || 'Miembro',
                        committeeRole: fd.get('committeeRole') as string,
                        representationType: fd.get('representationType') as string,
                        principalType: fd.get('principalType') as string,
                        startDate: fd.get('startDate') as string,
                      });
                      notify('Miembro agregado');
                      setShowMemberModal(false);
                      await loadAll();
                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                  }}>
                    <div className="form-grid">
                      <label>Empleado *</label>
                      <select name="userId" className="input" required>
                        <option value="">Seleccionar empleado</option>
                        {employees.map((emp) => (
                          <option key={emp._id} value={emp._id}>{emp.name} · {emp.position} · {emp.area}</option>
                        ))}
                      </select>
                      <label>Rol en el comité *</label>
                      <select name="committeeRole" className="input" required>
                        <option value="PRESIDENTE">Presidente</option>
                        <option value="SECRETARIO">Secretario</option>
                        <option value="PRINCIPAL">Principal</option>
                        <option value="SUPLENTE">Suplente</option>
                      </select>
                      <label>Representación *</label>
                      <select name="representationType" className="input" required>
                        <option value="EMPLEADOR">Empleador</option>
                        <option value="TRABAJADOR">Trabajador</option>
                      </select>
                      <label>Principal/Suplente *</label>
                      <select name="principalType" className="input" required>
                        <option value="PRINCIPAL">Principal</option>
                        <option value="SUPLENTE">Suplente</option>
                      </select>
                      <label>Fecha de inicio *</label>
                      <input name="startDate" type="date" className="input" required />
                    </div>
                    <div className="actions" style={{ marginTop: '1rem' }}>
                      <Button type="submit">Guardar</Button>
                      <Button type="button" variant="ghost" onClick={() => setShowMemberModal(false)}>Cancelar</Button>
                    </div>
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
              {isAdmin && period?.locked !== true && (
                <Button type="button" onClick={() => setShowCampaignModal(true)}>
                  🚀 Iniciar convocatoria
                </Button>
              )}
            </div>

            {period?.registrationCampaign ? (
              <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h4>📢 Convocatoria activa</h4>
                <p className="muted">Apertura: {new Date(period.registrationCampaign!.openingDate).toLocaleDateString()}</p>
                <p className="muted">Cierre: {new Date(period.registrationCampaign!.closingDate).toLocaleDateString()}</p>
                {period.registrationCampaign?.secureToken && (
                  <div style={{ marginTop: '.5rem' }}>
                    <p><strong>Link de inscripción:</strong></p>
                    <code style={{ display: 'block', padding: '.5rem', background: '#f3f4f6', borderRadius: '4px', fontSize: '.85rem', wordBreak: 'break-all' }}>
                      {`${window.location.origin}/copasst/register/${period.registrationCampaign!.secureToken}`}
                    </code>
                    <div className="actions" style={{ marginTop: '.5rem', flexWrap: 'wrap' }}>
                      <Button type="button" variant="secondary" onClick={() => {
                        const link = `${window.location.origin}/copasst/register/${period.registrationCampaign!.secureToken}`;
                        navigator.clipboard.writeText(link);
                        notify('🔗 Link copiado');
                      }}>📋 Copiar link</Button>
                      <Button type="button" variant="secondary" onClick={() => {
                        const link = `${window.location.origin}/copasst/register/${period.registrationCampaign!.secureToken}`;
                        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
                        window.open(qrUrl, '_blank');
                        notify('📱 QR generado');
                      }}>📱 Generar QR</Button>
                      <Button type="button" variant="secondary" onClick={() => {
                        const link = `${window.location.origin}/copasst/register/${period.registrationCampaign!.secureToken}`;
                        if (navigator.share) {
                          navigator.share({ title: 'Postulación COPASST', url: link });
                        } else {
                          navigator.clipboard.writeText(link);
                          notify('🔗 Link copiado para compartir');
                        }
                      }}>📤 Compartir</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="empty-state">No hay convocatoria activa. Inicia una para recibir postulaciones de empleados.</p>
            )}

            {/* Candidates table */}
            {period?.candidateExtended && period.candidateExtended.length > 0 && (
              <div className="responsive-table" style={{ marginTop: '1rem' }}>
                <h4>Candidatos registrados ({period.candidateExtended.length})</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Documento</th>
                      <th>Área</th>
                      <th>Cargo</th>
                      <th>Estado</th>
                      <th>Votos</th>
                      {isAdmin && <th>Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {period.candidateExtended.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td>{c.document}</td>
                        <td>{c.area}</td>
                        <td>{c.position}</td>
                        <td>
                          <span className={`advanced-management__badge ${
                            c.adminStatus === 'APROBADO' ? 'advanced-management__badge--success' :
                            c.adminStatus === 'RECHAZADO' ? 'advanced-management__badge--danger' :
                            'advanced-management__badge--warning'
                          }`}>{c.adminStatus}</span>
                        </td>
                        <td>{c.votes}</td>
                        {isAdmin && (
                          <td>
                            <div className="actions" style={{ flexWrap: 'nowrap' }}>
                              {c.adminStatus === 'PENDIENTE' && (
                                <>
                                  <Button type="button" variant="secondary" onClick={async () => {
                                    if (!period._id) return;
                                    try {
                                      await reviewCopasstCandidate(token, period._id, i, { adminStatus: 'APROBADO' });
                                      notify('Candidato aprobado');
                                      await loadAll();
                                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                                  }}>✅</Button>
                                  <Button type="button" variant="danger" onClick={async () => {
                                    if (!period._id) return;
                                    try {
                                      await reviewCopasstCandidate(token, period._id, i, { adminStatus: 'RECHAZADO' });
                                      notify('Candidato rechazado');
                                      await loadAll();
                                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                                  }}>❌</Button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Campaign Modal */}
            {showCampaignModal && (
              <div className="modal-overlay" onClick={() => setShowCampaignModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>Iniciar Convocatoria de Candidatos</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    if (!period?._id) return;
                    try {
                      await startCopasstCampaign(token, period._id, {
                        openingDate: fd.get('openingDate') as string,
                        closingDate: fd.get('closingDate') as string,
                        includedDepartments: (fd.get('departments') as string || '').split(',').map((s) => s.trim()).filter(Boolean),
                        requirements: (fd.get('requirements') as string || '').split('\n').filter(Boolean),
                      });
                      notify('Convocatoria iniciada');
                      setShowCampaignModal(false);
                      await loadAll();
                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                  }}>
                    <div className="form-grid">
                      <label>Fecha de apertura</label>
                      <input name="openingDate" type="date" className="input" required />
                      <label>Fecha de cierre</label>
                      <input name="closingDate" type="date" className="input" required />
                      <label>Departamentos incluidos (separados por coma)</label>
                      <input name="departments" className="input" placeholder="Ej: Producción, Ventas, RRHH" />
                      <label>Requisitos (uno por línea)</label>
                      <textarea name="requirements" className="input" rows={3} placeholder="Ej:&#10;Ser trabajador activo&#10;No tener sanciones disciplinarias" />
                    </div>
                    <div className="actions" style={{ marginTop: '1rem' }}>
                      <Button type="submit">Iniciar convocatoria</Button>
                      <Button type="button" variant="ghost" onClick={() => setShowCampaignModal(false)}>Cancelar</Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ VOTING ═══ */}
        {activeTab === 'voting' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>🗳️ Votación</h3>
              {isAdmin && results && results.winners?.length === 0 && (
                <Button type="button" onClick={async () => {
                  if (!period?._id) return;
                  setLoading(true);
                  try {
                    await initCopasstVoting(token, period._id);
                    notify('Votación iniciada');
                    await loadAll();
                  } catch (e: any) { notify('Error: ' + (e.message || '')); }
                  setLoading(false);
                }}>🗳️ Iniciar votación</Button>
              )}
            </div>

            {results && (
              <>
                <AdvancedKpiGrid
                  items={[
                    { label: 'Total Votos', value: results.totalVotes ?? 0 },
                    { label: 'Participación', value: results.participation ? `${Math.round(results.participation)}%` : '0%', variant: results.participation > 50 ? 'success' : 'warning' },
                    { label: 'Candidatos', value: results.ranking?.length ?? 0 },
                    { label: 'Ganadores', value: results.winners?.length ?? 0 },
                  ]}
                  columns={4}
                />
                {results.ranking && results.ranking.length > 0 && (
                  <div className="responsive-table" style={{ marginTop: '1rem' }}>
                    <h4>Resultados</h4>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Candidato</th>
                          <th>Votos</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.ranking.map((c: any, i: number) => (
                          <tr key={i}>
                            <td>{c.rank}</td>
                            <td>{c.name}</td>
                            <td>{c.votes}</td>
                            <td>{c.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {results.winners?.length > 0 && (
                  <div className="actions" style={{ marginTop: '1rem' }}>
                    <Button type="button" onClick={async () => {
                      if (!period?._id) return;
                      try {
                        await autoCreateCopasstCommittee(token, period._id, 2);
                        notify('Comité creado automáticamente');
                        await loadAll();
                      } catch (e: any) { notify('Error: ' + (e.message || '')); }
                    }}>🤝 Crear comité automáticamente</Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ═══ MEETINGS ═══ */}
        {activeTab === 'meetings' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>📅 Reuniones</h3>
              {isAdmin && period?.locked !== true && (
                <>
                  <Button type="button" onClick={() => setShowMeetingModal(true)}>+ Programar reunión</Button>
                  <Button type="button" variant="secondary" onClick={async () => {
                    if (!period?._id) return;
                    setLoading(true);
                    try {
                      await autoScheduleCopasstMeetings(token, period._id);
                      notify('📅 Reuniones mensuales programadas automáticamente');
                      await loadAll();
                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                    setLoading(false);
                  }}>📅 Programar reuniones mensuales</Button>
                </>
              )}
            </div>
            {(!period?.meetings || period.meetings.length === 0) ? (
              <p className="empty-state">No hay reuniones programadas. Agenda la primera reunión mensual o usa el botón para programar automáticamente.</p>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Agenda</th>
                      <th>Asistentes</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.meetings.map((m, i) => (
                      <tr key={i}>
                        <td>{new Date(m.meetingDate).toLocaleDateString()}</td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.agenda}</td>
                        <td>{(m as any).attendees?.length ?? 0}</td>
                        <td>
                          <span className={`advanced-management__badge ${
                            m.status === 'CERRADA' ? 'advanced-management__badge--success' :
                            m.status === 'CANCELADA' ? 'advanced-management__badge--danger' :
                            'advanced-management__badge--warning'
                          }`}>{m.status}</span>
                        </td>
                        <td>
                          {m.status === 'PROGRAMADA' && isAdmin && (
                            <div className="actions" style={{ flexWrap: 'nowrap' }}>
                              <Button type="button" variant="secondary" onClick={async () => {
                                if (!period._id) return;
                                const dev = prompt('Desarrollo de la reunión:') || '';
                                const att = prompt('Asistentes (separados por coma):') || '';
                                try {
                                  await completeCopasstMeeting(token, period._id, i, {
                                    development: dev,
                                    attendees: att.split(',').map((s) => s.trim()).filter(Boolean),
                                  });
                                  notify('Reunión completada');
                                  await loadAll();
                                } catch (e: any) { notify('Error: ' + (e.message || '')); }
                              }}>✅ Cerrar</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showMeetingModal && (
              <div className="modal-overlay" onClick={() => setShowMeetingModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>Programar Reunión</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    if (!period?._id) return;
                    try {
                      await scheduleCopasstMeeting(token, period._id, {
                        meetingDate: fd.get('meetingDate') as string,
                        agenda: fd.get('agenda') as string,
                        topicList: (fd.get('topics') as string || '').split('\n').filter(Boolean),
                      });
                      notify('Reunión programada');
                      setShowMeetingModal(false);
                      await loadAll();
                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                  }}>
                    <div className="form-grid">
                      <label>Fecha</label>
                      <input name="meetingDate" type="date" className="input" required />
                      <label>Agenda</label>
                      <input name="agenda" className="input" placeholder="Agenda de la reunión" required />
                      <label>Temas a tratar (uno por línea)</label>
                      <textarea name="topics" className="input" rows={4} placeholder="Tema 1:&#10;Tema 2:" />
                    </div>
                    <div className="actions" style={{ marginTop: '1rem' }}>
                      <Button type="submit">Programar</Button>
                      <Button type="button" variant="ghost" onClick={() => setShowMeetingModal(false)}>Cancelar</Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ COMMITMENTS ═══ */}
        {activeTab === 'commitments' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>🎯 Compromisos</h3>
              {isAdmin && period?.locked !== true && (
                <Button type="button" onClick={() => setShowCommitmentModal(true)}>+ Nuevo compromiso</Button>
              )}
            </div>
            {/* Alertas de compromisos próximos a vencer */}
            {(period?.commitments as any[])?.filter((c: any) => {
              if (c.status === 'COMPLETED') return false;
              if (!c.deadline) return false;
              const daysLeft = Math.ceil((new Date(c.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return daysLeft >= 0 && daysLeft <= 7;
            }).length > 0 && (
              <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: '#fef3c7', border: '1px solid #fbbf24' }}>
                <h4 style={{ margin: 0 }}>⏰ Compromisos próximos a vencer</h4>
                <div className="responsive-table" style={{ marginTop: '.5rem' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th>Vence</th>
                        <th>Días restantes</th>
                        <th>Prioridad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(period?.commitments as any[])?.filter((c: any) => {
                        if (c.status === 'COMPLETED') return false;
                        if (!c.deadline) return false;
                        const daysLeft = Math.ceil((new Date(c.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return daysLeft >= 0 && daysLeft <= 7;
                      }).map((c: any, i: number) => {
                        const daysLeft = Math.ceil((new Date(c.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return (
                          <tr key={i}>
                            <td style={{ maxWidth: '250px' }}>{c.description}</td>
                            <td>{new Date(c.deadline).toLocaleDateString()}</td>
                            <td style={{ color: daysLeft <= 2 ? '#dc2626' : '#d97706', fontWeight: 600 }}>{daysLeft === 0 ? '⚠️ Hoy' : daysLeft === 1 ? '⚠️ Mañana' : `${daysLeft} días`}</td>
                            <td>
                              <span className={`advanced-management__badge ${
                                c.priority === 'CRITICAL' ? 'advanced-management__badge--danger' :
                                c.priority === 'HIGH' ? 'advanced-management__badge--warning' :
                                'advanced-management__badge--success'
                              }`}>{c.priority}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!period?.commitments || (period.commitments as any[]).length === 0) ? (
              <p className="empty-state">No hay compromisos registrados. Los compromisos se generan desde las reuniones.</p>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Responsable</th>
                      <th>Vence</th>
                      <th>Prioridad</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(period.commitments as any[]).map((c: any, i: number) => (
                      <tr key={c._id || i}>
                        <td style={{ maxWidth: '250px' }}>{c.description}</td>
                        <td>{c.responsibleParty}</td>
                        <td>{c.deadline ? new Date(c.deadline).toLocaleDateString() : '—'}</td>
                        <td>
                          <span className={`advanced-management__badge ${
                            c.priority === 'CRITICAL' ? 'advanced-management__badge--danger' :
                            c.priority === 'HIGH' ? 'advanced-management__badge--warning' :
                            'advanced-management__badge--success'
                          }`}>{c.priority}</span>
                        </td>
                        <td>{c.status}</td>
                        <td>
                          {isAdmin && c.status !== 'COMPLETED' && (
                            <Button type="button" variant="secondary" onClick={async () => {
                              if (!period._id) return;
                              try {
                                await updateCopasstCommitment(token, period._id, c._id, { status: 'COMPLETED' });
                                notify('Compromiso completado');
                                await loadAll();
                              } catch (e: any) { notify('Error: ' + (e.message || '')); }
                            }}>✅ Completar</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showCommitmentModal && (
              <div className="modal-overlay" onClick={() => setShowCommitmentModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>Nuevo Compromiso</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    if (!period?._id) return;
                    try {
                      await addCopasstCommitment(token, period._id, {
                        description: fd.get('description') as string,
                        responsibleParty: fd.get('responsibleParty') as string,
                        deadline: fd.get('deadline') as string,
                        priority: fd.get('priority') as any,
                      });
                      notify('Compromiso creado');
                      setShowCommitmentModal(false);
                      await loadAll();
                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                  }}>
                    <div className="form-grid">
                      <label>Descripción</label>
                      <textarea name="description" className="input" rows={3} required />
                      <label>Responsable</label>
                      <input name="responsibleParty" className="input" required />
                      <label>Fecha límite</label>
                      <input name="deadline" type="date" className="input" required />
                      <label>Prioridad</label>
                      <select name="priority" className="input" required>
                        <option value="LOW">Baja</option>
                        <option value="MEDIUM">Media</option>
                        <option value="HIGH">Alta</option>
                        <option value="CRITICAL">Crítica</option>
                      </select>
                    </div>
                    <div className="actions" style={{ marginTop: '1rem' }}>
                      <Button type="submit">Crear</Button>
                      <Button type="button" variant="ghost" onClick={() => setShowCommitmentModal(false)}>Cancelar</Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ EVIDENCE ═══ */}
        {activeTab === 'evidence' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>📎 Evidencias</h3>
              {isAdmin && (
                <Button type="button" onClick={() => setShowEvidenceModal(true)}>+ Agregar evidencia</Button>
              )}
            </div>
            {(!period?.evidence || (period.evidence as any[]).length === 0) ? (
              <p className="empty-state">No hay evidencias cargadas. Sube actas, listados, fotos o documentos.</p>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Título</th>
                      <th>Archivo</th>
                      <th>Subido por</th>
                      <th>Fecha</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(period.evidence as any[]).map((ev: any, i: number) => (
                      <tr key={ev._id || i}>
                        <td><span className="advanced-management__badge">{ev.type}</span></td>
                        <td>{ev.title}</td>
                        <td><a href={ev.fileUrl} target="_blank" rel="noreferrer">{ev.fileName}</a></td>
                        <td>{ev.uploadedBy}</td>
                        <td>{ev.uploadedAt ? new Date(ev.uploadedAt).toLocaleDateString() : '—'}</td>
                        <td>
                          {isAdmin && (
                            <Button type="button" variant="danger" onClick={async () => {
                              if (!period._id) return;
                              try {
                                await removeCopasstEvidence(token, period._id, i);
                                notify('Evidencia eliminada');
                                await loadAll();
                              } catch (e: any) { notify('Error: ' + (e.message || '')); }
                            }}>🗑</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showEvidenceModal && (
              <div className="modal-overlay" onClick={() => setShowEvidenceModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>Agregar Evidencia</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    if (!period?._id) return;
                    try {
                      await addCopasstEvidence(token, period._id, {
                        type: fd.get('type') as string,
                        title: fd.get('title') as string,
                        fileName: fd.get('fileName') as string,
                        fileUrl: fd.get('fileUrl') as string,
                      });
                      notify('Evidencia agregada');
                      setShowEvidenceModal(false);
                      await loadAll();
                    } catch (e: any) { notify('Error: ' + (e.message || '')); }
                  }}>
                    <div className="form-grid">
                      <select name="type" className="input" required>
                        <option value="MINUTES">Acta</option>
                        <option value="ATTENDANCE">Listado de asistencia</option>
                        <option value="PHOTO">Foto</option>
                        <option value="DOCUMENT">Documento</option>
                        <option value="PDF">PDF</option>
                      </select>
                      <input name="title" className="input" placeholder="Título de la evidencia" required />
                      <input name="fileName" className="input" placeholder="Nombre del archivo" required />
                      <input name="fileUrl" className="input" placeholder="URL del archivo" required />
                    </div>
                    <div className="actions" style={{ marginTop: '1rem' }}>
                      <Button type="submit">Agregar</Button>
                      <Button type="button" variant="ghost" onClick={() => setShowEvidenceModal(false)}>Cancelar</Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ HISTORY ═══ */}
        {activeTab === 'history' && (
          <>
            <h3>🕓 Historial de Auditoría</h3>
            {audit.length === 0 ? (
              <p className="empty-state">No hay movimientos registrados.</p>
            ) : (
              <div className="responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Acción</th>
                      <th>Usuario</th>
                      <th>Fecha</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((entry: any, i: number) => (
                      <tr key={i}>
                        <td><span className="advanced-management__badge">{entry.action}</span></td>
                        <td>{entry.createdBy}</td>
                        <td>{new Date(entry.createdAt).toLocaleString()}</td>
                        <td style={{ fontSize: '.85rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.data}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>❌ Rechazar COPASST</h3>
            <p>Indica el motivo del rechazo:</p>
            <textarea
              className="input" rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo..."
              style={{ width: '100%' }}
            />
            <div className="actions" style={{ marginTop: '1rem' }}>
              <Button type="button" variant="danger" disabled={!rejectReason.trim()} onClick={async () => {
                if (!period?._id) return;
                setLoading(true);
                try {
                  await rejectCopasst(token, period._id, rejectReason);
                  notify('❌ COPASST rechazado');
                  setShowRejectModal(false);
                  setRejectReason('');
                  await loadAll();
                } catch (e: any) { notify('Error: ' + (e.message || '')); }
                setLoading(false);
              }}>Rechazar</Button>
              <Button type="button" variant="ghost" onClick={() => { setShowRejectModal(false); setRejectReason(''); }}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </AdvancedPageLayout>
  );
}
