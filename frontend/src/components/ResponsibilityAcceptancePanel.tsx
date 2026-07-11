import { useCallback, useEffect, useState } from 'react';
import {
  ResponsibilityMatrixItemModel,
  ResponsibilityAcceptanceModel,
  EmployeeModel,
  fetchEmployees,
  fetchMyAcceptances,
  fetchPendingAcceptances,
  fetchAcceptanceStats,
  assignResponsibilitiesBatch,
  acceptResponsibilities,
  rejectResponsibilities,
  requestCorrection,
  resolveCorrection,
  createAcceptanceCycle,
  fetchAcceptanceReminders,
  fetchComplianceWithAcceptance,
  processRenewals,
} from '../api';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

function statusBadge(status?: string) {
  if (status === 'ACCEPTED') return { label: '✅ Aceptado', className: 'badge badge--success' };
  if (status === 'REJECTED') return { label: '❌ Rechazado', className: 'badge badge--danger' };
  if (status === 'REVIEWED') return { label: '👁 Revisado', className: 'badge badge--info' };
  if (status === 'EXPIRED') return { label: '⏰ Vencido', className: 'badge badge--warning' };
  return { label: '⏳ Pendiente', className: 'badge badge--pending' };
}

export function ResponsibilityAcceptancePanel({
  token,
  matrix,
  items,
  isLocked,
  defaultTab = 'dashboard',
}: {
  token?: string;
  matrix?: { _id?: string; approvalStatus?: string; approvedByEmail?: string; approvedAt?: string; currentVersionNumber?: number } | null;
  items?: ResponsibilityMatrixItemModel[];
  isLocked?: boolean;
  defaultTab?: 'dashboard' | 'assign' | 'my-acceptances' | 'stats';
}) {
  const [tab, setTab] = useState<'dashboard' | 'assign' | 'my-acceptances' | 'stats'>(defaultTab);
  const [acceptances, setAcceptances] = useState<ResponsibilityAcceptanceModel[]>([]);
  const [myAcceptances, setMyAcceptances] = useState<ResponsibilityAcceptanceModel[]>([]);
  const [stats, setStats] = useState<{ total: number; pending: number; accepted: number; rejected: number; reviewed: number; expired: number } | null>(null);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [compliance, setCompliance] = useState<{ status: string; reason: string; stats: any } | null>(null);
  const [reminders, setReminders] = useState<Array<{ acceptance: ResponsibilityAcceptanceModel; daysOverdue: number }>>([]);
  const [toast, setToast] = useState('');

  // Assignment state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRequestCorrectionModal, setShowRequestCorrectionModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionComment, setCorrectionComment] = useState('');
  const [hasReadCheck, setHasReadCheck] = useState(false);
  const [currentAcceptance, setCurrentAcceptance] = useState<ResponsibilityAcceptanceModel | null>(null);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const [_loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [accs, statsData, empData, complianceData, remindersData] = await Promise.all([
        fetchPendingAcceptances(token).catch(() => []),
        fetchAcceptanceStats(token).catch(() => null),
        fetchEmployees(token).catch(() => []),
        fetchComplianceWithAcceptance(token).catch(() => null),
        fetchAcceptanceReminders(token).catch(() => []),
      ]);
      setAcceptances(accs);
      setStats(statsData);
      setEmployees(empData);
      setCompliance(complianceData);
      setReminders(remindersData);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [token]);

  const loadMyAcceptances = useCallback(async () => {
    if (!token) return;
    try {
      setMyAcceptances(await fetchMyAcceptances(token));
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { if (tab === 'my-acceptances') void loadMyAcceptances(); }, [tab, loadMyAcceptances]);

  const handleAssign = async () => {
    if (!token || !selectedUserId) return;
    const emp = employees.find((e) => e._id === selectedUserId);
    if (!emp) return;
    try {
      await assignResponsibilitiesBatch(token, [{
        userId: selectedUserId,
        userEmail: emp.name.toLowerCase().replace(/\s+/g, '.') + '@empresa.com',
        userName: emp.name,
        assignedItemIds: selectedItemIds.length > 0 ? selectedItemIds : (items ?? []).map((i) => i._id!).filter(Boolean),
      }]);
      notify('Responsabilidades asignadas correctamente.');
      setSelectedUserId('');
      setSelectedItemIds([]);
      void loadData();
    } catch { notify('Error al asignar.'); }
  };

  const handleAccept = async () => {
    if (!token || !currentAcceptance || !hasReadCheck) return;
    try {
      await acceptResponsibilities(token, {
        userId: currentAcceptance.userId,
        userEmail: currentAcceptance.userEmail,
        userName: currentAcceptance.userName,
        assignedItemIds: currentAcceptance.assignedItemIds,
        hasRead: true,
        signatureHash: `sig_${Date.now()}`,
        signatureUrl: '',
      });
      setShowAcceptModal(false);
      setHasReadCheck(false);
      setCurrentAcceptance(null);
      notify('✅ Responsabilidades aceptadas y firmadas digitalmente.');
      void loadData();
      void loadMyAcceptances();
    } catch { notify('Error al aceptar.'); }
  };

  const handleReject = async () => {
    if (!token || !currentAcceptance || !rejectReason) return;
    try {
      await rejectResponsibilities(token, {
        userId: currentAcceptance.userId,
        userEmail: currentAcceptance.userEmail,
        reason: rejectReason,
      });
      setShowRejectModal(false);
      setRejectReason('');
      setCurrentAcceptance(null);
      notify('Responsabilidades rechazadas.');
      void loadData();
      void loadMyAcceptances();
    } catch { notify('Error al rechazar.'); }
  };

  const handleRequestCorrection = async () => {
    if (!token || !currentAcceptance || !correctionComment) return;
    try {
      await requestCorrection(token, {
        userId: currentAcceptance.userId,
        userEmail: currentAcceptance.userEmail,
        comment: correctionComment,
      });
      setShowRequestCorrectionModal(false);
      setCorrectionComment('');
      setCurrentAcceptance(null);
      notify('Solicitud de corrección enviada. El ADMIN podrá revisarla.');
      void loadData();
      void loadMyAcceptances();
    } catch { notify('Error al solicitar corrección.'); }
  };

  const handleResolveCorrection = async (userId: string) => {
    if (!token) return;
    try {
      await resolveCorrection(token, userId);
      notify('Corrección resuelta. El usuario puede volver a revisar.');
      void loadData();
    } catch { notify('Error al resolver.'); }
  };

  const handleCreateCycle = async () => {
    if (!token) return;
    try {
      const result = await createAcceptanceCycle(token);
      notify(`Nuevo ciclo creado. Versión: ${result.version}. Renovación: ${new Date(result.renewalDate).toLocaleDateString()}`);
      void loadData();
    } catch { notify('Error al crear ciclo.'); }
  };

  const handleProcessRenewals = async () => {
    if (!token) return;
    try {
      const result = await processRenewals(token);
      notify(`${result.renewed} registros marcados para renovación.`);
      void loadData();
    } catch { notify('Error al procesar.'); }
  };


  const myPendingCount = myAcceptances.filter((a) => a.acceptanceStatus === 'PENDING').length;

  // Dashboard Alert Banner
  const AlertBanner = () => {
    if (myPendingCount === 0) return null;
    return (
      <div className="advanced-management__alert" style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '8px', background: '#fef3c7', border: '1px solid #f59e0b' }}>
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>📋 Tiene {myPendingCount} responsabilidad(es) pendiente(s) por revisar y firmar.</strong>
            <p className="muted" style={{ margin: 0 }}>Complete la revisión para cumplir con el estándar 1.1.2</p>
          </div>
          <Button type="button" variant="primary" onClick={() => setTab('my-acceptances')}>
            Revisar responsabilidades
          </Button>
        </div>
      </div>
    );
  };

  if (!token) return <p className="muted">Inicia sesión para gestionar aceptaciones.</p>;

  return (
    <div className="advanced-page__content">
      {toast ? <div className="toast-alert" style={{ marginBottom: '1rem' }}><strong>Notificación</strong><p>{toast}</p></div> : null}

      <AlertBanner />

      {/* Tab Navigation */}
      <div className="advanced-tabs" role="tablist" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'dashboard', label: '📊 Panel' },
          { id: 'assign', label: '👥 Asignar' },
          { id: 'my-acceptances', label: '✅ Mis aceptaciones' },
          { id: 'stats', label: '📈 Estadísticas' },
        ].map((t) => (
          <Button key={t.id} type="button" variant={tab === t.id ? 'primary' : 'secondary'} onClick={() => setTab(t.id as any)}>
            {t.label} {t.id === 'my-acceptances' && myPendingCount > 0 ? `(${myPendingCount})` : ''}
          </Button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && (
        <div className="advanced-management">
          <section className="advanced-management__section">
            <h3>📊 Panel de Aceptaciones</h3>
            <p className="muted">Monitoreo de aceptaciones de responsabilidades por usuarios.</p>

            <div className="advanced-doc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
                <strong style={{ fontSize: '1.5rem' }}>{stats?.total ?? 0}</strong>
                <span className="muted">Total asignaciones</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderColor: '#f59e0b' }}>
                <strong style={{ fontSize: '1.5rem', color: '#f59e0b' }}>{stats?.pending ?? 0}</strong>
                <span className="muted">Pendientes</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderColor: '#22c55e' }}>
                <strong style={{ fontSize: '1.5rem', color: '#22c55e' }}>{stats?.accepted ?? 0}</strong>
                <span className="muted">Aceptadas</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderColor: '#ef4444' }}>
                <strong style={{ fontSize: '1.5rem', color: '#ef4444' }}>{stats?.rejected ?? 0}</strong>
                <span className="muted">Rechazadas</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
                <strong style={{ fontSize: '1.5rem' }}>{stats?.expired ?? 0}</strong>
                <span className="muted">Vencidas</span>
              </article>
            </div>

            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <Button type="button" variant="primary" disabled={!matrix?.approvalStatus || matrix?.approvalStatus !== 'APPROVED'} onClick={handleCreateCycle}>
                🔄 Iniciar nuevo ciclo de aceptación
              </Button>
              <Button type="button" variant="secondary" onClick={handleProcessRenewals}>
                ⏰ Procesar renovaciones
              </Button>
            </div>

            {compliance && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Cumplimiento PHVA 1.1.2</h4>
                <span className={compliance.status === 'COMPLIES' ? 'badge badge--success' : 'badge badge--warning'}>
                  {compliance.status === 'COMPLIES' ? '✅ Cumple' : '⚠ Pendiente'}
                </span>
                <p className="muted">{compliance.reason}</p>
              </div>
            )}
          </section>

          {/* Reminders */}
          {reminders.length > 0 && (
            <section className="advanced-management__section">
              <h3>🔔 Recordatorios pendientes</h3>
              <table className="table">
                <thead>
                  <tr><th>Usuario</th><th>Días sin firmar</th><th>Estado</th><th>Asignado</th></tr>
                </thead>
                <tbody>
                  {reminders.map((r, i) => (
                    <tr key={i}>
                      <td>{r.acceptance.userName}</td>
                      <td>{r.daysOverdue} días</td>
                      <td><span className="badge badge--warning">Pendiente</span></td>
                      <td>{new Date((r.acceptance as any).createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      {/* Assign */}
      {tab === 'assign' && (
        <div className="advanced-management">
          <section className="advanced-management__section">
            <h3>👥 Asignar responsabilidades</h3>
            <p className="muted">Selecciona un usuario y las responsabilidades que debe aceptar.</p>

            {!isLocked && (
              <div className="form-grid" style={{ maxWidth: '500px' }}>
                <label className="field">
                  <span className="label">Usuario</span>
                  <select className="input" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                    <option value="">Seleccionar empleado...</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>{emp.name} · {emp.position}</option>
                    ))}
                  </select>
                </label>

                {items && items.length > 0 && (
                  <label className="field">
                    <span className="label">Responsabilidades a asignar ({selectedItemIds.length} seleccionadas)</span>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '.5rem' }}>
                      {items.map((item) => (
                        <label key={item._id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.25rem 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedItemIds.includes(item._id!)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedItemIds([...selectedItemIds, item._id!]);
                              else setSelectedItemIds(selectedItemIds.filter((id) => id !== item._id!));
                            }}
                          />
                          <span>{item.title}</span>
                        </label>
                      ))}
                    </div>
                  </label>
                )}

                <div className="actions">
                  <Button type="button" variant="primary" disabled={!selectedUserId} onClick={handleAssign}>
                    Asignar responsabilidades
                  </Button>
                </div>
              </div>
            )}

            <hr style={{ margin: '1.5rem 0' }} />

            <h3>Asignaciones actuales</h3>
            <div className="responsive-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Items asignados</th>
                    <th>Versión matriz</th>
                    <th>Fecha asignación</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptances.length === 0 ? (
                    <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin asignaciones</td></tr>
                  ) : (
                    acceptances.map((acc) => (
                      <tr key={acc._id}>
                        <td>{acc.userName}</td>
                        <td>{acc.userRole ?? '—'}</td>
                        <td><span className={statusBadge(acc.acceptanceStatus).className}>{statusBadge(acc.acceptanceStatus).label}</span></td>
                        <td>{acc.assignedItemIds.length}</td>
                        <td>{acc.matrixVersion}</td>
                        <td>{new Date((acc as any).createdAt).toLocaleDateString()}</td>
                        <td>
                          {acc.acceptanceStatus === 'REJECTED' && acc.rejectedReason?.startsWith('Solicita corrección') && (
                            <Button type="button" variant="ghost" onClick={() => handleResolveCorrection(acc.userId)}>
                              Resolver corrección
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* My Acceptances */}
      {tab === 'my-acceptances' && (
        <div className="advanced-management">
          <section className="advanced-management__section">
            <h3>✅ Mis responsabilidades</h3>
            <p className="muted">Revisa, acepta o solicita corrección de tus responsabilidades asignadas.</p>

            {myAcceptances.length === 0 ? (
              <p className="empty-state">No tienes responsabilidades asignadas pendientes.</p>
            ) : (
              myAcceptances.map((acc) => {
                const badge = statusBadge(acc.acceptanceStatus);
                const assignedItems = items?.filter((item) => acc.assignedItemIds.includes(item._id!)) ?? [];
                return (
                  <article key={acc._id} className="advanced-doc-card" style={{ marginBottom: '1rem', flexDirection: 'column' }}>
                    <div className="actions" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>Versión matriz: {acc.matrixVersion}</strong>
                        {matrix?.approvedByEmail && <p className="muted" style={{ margin: 0 }}>Aprobado por: {matrix.approvedByEmail}</p>}
                        {matrix?.approvedAt && <p className="muted" style={{ margin: 0 }}>Fecha aprobación: {new Date(matrix.approvedAt).toLocaleDateString()}</p>}
                      </div>
                      <span className={badge.className}>{badge.label}</span>
                    </div>

                    <h4>Responsabilidades asignadas:</h4>
                    <ul style={{ margin: '.5rem 0' }}>
                      {assignedItems.map((item) => (
                        <li key={item._id}><strong>{item.title}</strong>{item.description ? ` — ${item.description}` : ''}</li>
                      ))}
                    </ul>

                    {acc.acceptanceStatus === 'PENDING' && (
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        <Button type="button" variant="primary" onClick={() => { setCurrentAcceptance(acc); setShowAcceptModal(true); }}>
                          ✅ Aceptar y firmar
                        </Button>
                        <Button type="button" variant="danger" onClick={() => { setCurrentAcceptance(acc); setShowRejectModal(true); }}>
                          ❌ Rechazar
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => { setCurrentAcceptance(acc); setShowRequestCorrectionModal(true); }}>
                          📝 Solicitar corrección
                        </Button>
                      </div>
                    )}

                    {acc.acceptanceStatus === 'ACCEPTED' && acc.signature && (
                      <div style={{ marginTop: '.5rem', padding: '.5rem', background: '#f0fdf4', borderRadius: '6px' }}>
                        <p style={{ margin: 0 }}><strong>Firma digital:</strong> {acc.signature.signedBy}</p>
                        <p style={{ margin: 0 }} className="muted">Fecha: {new Date(acc.signature.signedAt).toLocaleString()} · Hash: {acc.signature.signatureHash.slice(0, 16)}...</p>
                        {acc.renewalRequiredAt && <p className="muted" style={{ margin: 0 }}>Renovación requerida: {new Date(acc.renewalRequiredAt).toLocaleDateString()}</p>}
                      </div>
                    )}

                    {acc.acceptanceStatus === 'REJECTED' && acc.rejectedReason && (
                      <div style={{ marginTop: '.5rem', padding: '.5rem', background: '#fef2f2', borderRadius: '6px' }}>
                        <p style={{ margin: 0 }}><strong>Motivo:</strong> {acc.rejectedReason}</p>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </div>
      )}

      {/* Stats */}
      {tab === 'stats' && (
        <div className="advanced-management">
          <section className="advanced-management__section">
            <h3>📈 Estadísticas de aceptación</h3>
            <div className="advanced-doc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
                <strong style={{ fontSize: '2rem' }}>{stats?.total ?? 0}</strong>
                <span className="muted">Total</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderTop: '3px solid #f59e0b' }}>
                <strong style={{ fontSize: '2rem', color: '#f59e0b' }}>{stats?.pending ?? 0}</strong>
                <span className="muted">Pendientes</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderTop: '3px solid #22c55e' }}>
                <strong style={{ fontSize: '2rem', color: '#22c55e' }}>{stats?.accepted ?? 0}</strong>
                <span className="muted">Aceptadas</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderTop: '3px solid #ef4444' }}>
                <strong style={{ fontSize: '2rem', color: '#ef4444' }}>{stats?.rejected ?? 0}</strong>
                <span className="muted">Rechazadas</span>
              </article>
            </div>

            {stats && stats.total > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Progreso de aceptación</h4>
                <div className="objective-progress">
                  <div className="objective-progress__track">
                    <span
                      className="objective-progress__fill"
                      style={{ width: `${Math.round((stats.accepted / stats.total) * 100)}%`, background: '#22c55e' }}
                    />
                  </div>
                  <span>{Math.round((stats.accepted / stats.total) * 100)}% completado</span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Accept Modal */}
      <Modal isOpen={showAcceptModal} title="Aceptar responsabilidades" onClose={() => { setShowAcceptModal(false); setHasReadCheck(false); }}>
        <div className="form-grid">
          <h4>Responsabilidades SG-SST</h4>
          <p>Al aceptar, confirmas que has leído, comprendido y asumido las responsabilidades asignadas.</p>

          <div style={{ padding: '.75rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hasReadCheck}
                onChange={(e) => setHasReadCheck(e.target.checked)}
                style={{ marginTop: '.2rem' }}
              />
              <span>☑ He leído y comprendido mis responsabilidades asignadas en el SG-SST.</span>
            </label>
          </div>

          <p className="muted" style={{ fontSize: '.85rem' }}>
            Al firmar digitalmente, aceptas los términos y condiciones del SG-SST.
            Tu firma quedará registrada con hash de seguridad y fecha/hora exacta.
          </p>

          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="primary" disabled={!hasReadCheck} onClick={handleAccept}>
              ✅ Aceptar y firmar digitalmente
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowAcceptModal(false); setHasReadCheck(false); }}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={showRejectModal} title="Rechazar responsabilidades" onClose={() => { setShowRejectModal(false); setRejectReason(''); }}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Motivo del rechazo</span>
            <textarea className="input" rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Describe por qué no puedes aceptar estas responsabilidades..." />
          </label>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="danger" disabled={!rejectReason} onClick={handleReject}>
              ❌ Confirmar rechazo
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowRejectModal(false); setRejectReason(''); }}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Request Correction Modal */}
      <Modal isOpen={showRequestCorrectionModal} title="Solicitar corrección" onClose={() => { setShowRequestCorrectionModal(false); setCorrectionComment(''); }}>
        <div className="form-grid">
          <label className="field">
            <span className="label">¿Qué debe corregirse?</span>
            <textarea className="input" rows={4} value={correctionComment} onChange={(e) => setCorrectionComment(e.target.value)} placeholder="Describe qué responsabilidades deben ajustarse y por qué..." />
          </label>
          <p className="muted">El ADMIN recibirá tu solicitud y podrá realizar los ajustes necesarios.</p>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="primary" disabled={!correctionComment} onClick={handleRequestCorrection}>
              Enviar solicitud
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowRequestCorrectionModal(false); setCorrectionComment(''); }}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ResponsibilityAcceptancePanel;
