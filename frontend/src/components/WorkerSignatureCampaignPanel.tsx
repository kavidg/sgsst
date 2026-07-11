import { useCallback, useEffect, useState } from 'react';
import {
  SignatureCampaignModel,
  CampaignWorkerModel,
  SignatureEvidenceModel,
  CampaignStatsModel,
  fetchSignatureCampaigns,
  fetchSignatureCampaignStats,
  createSignatureCampaign,
  updateSignatureCampaignStatus,
  fetchCampaignWorkers,
  addCampaignWorkers,
  removeCampaignWorker,
  generateWorkerLink,
  sendCampaignReminders,
  fetchCampaignEvidence,
  fetchCampaignAudit,
  fetchEmployees,
  EmployeeModel,
} from '../api';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

export function WorkerSignatureCampaignPanel({ token }: { token?: string }) {
  const [campaigns, setCampaigns] = useState<SignatureCampaignModel[]>([]);
  const [stats, setStats] = useState<CampaignStatsModel | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<SignatureCampaignModel | null>(null);
  const [workers, setWorkers] = useState<CampaignWorkerModel[]>([]);
  const [evidence, setEvidence] = useState<SignatureEvidenceModel[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddWorkersModal, setShowAddWorkersModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [toast, setToast] = useState('');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [form, setForm] = useState({
    name: '', description: '', documentType: 'RESPONSIBILITIES', documentVersion: '1.0',
    documentContent: '', requireOtp: false, requireSignature: true, expiresAt: '',
  });
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState('');

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const loadCampaigns = useCallback(async () => {
    if (!token) return;
    try {
      const [data, statsData, empData] = await Promise.all([
        fetchSignatureCampaigns(token),
        fetchSignatureCampaignStats(token),
        fetchEmployees(token).catch(() => []),
      ]);
      setCampaigns(data.campaigns);
      setStats(statsData);
      setEmployees(empData);
    } catch { notify('Error al cargar campañas.'); }
  }, [token]);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  const loadCampaignDetail = useCallback(async (id: string) => {
    if (!token) return;
    try {
      const [wrk, evd, aud] = await Promise.all([
        fetchCampaignWorkers(token, id),
        fetchCampaignEvidence(token, id).catch(() => []),
        fetchCampaignAudit(token, id),
      ]);
      setWorkers(wrk);
      setEvidence(evd);
      setAudit(aud);
    } catch { /* silent */ }
  }, [token]);

  const handleCreate = async () => {
    if (!token || !form.name) return;
    try {
      const created = await createSignatureCampaign(token, form as any);
      setCampaigns((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setForm({ name: '', description: '', documentType: 'RESPONSIBILITIES', documentVersion: '1.0', documentContent: '', requireOtp: false, requireSignature: true, expiresAt: '' });
      notify('Campaña creada como borrador.');
    } catch { notify('Error al crear.'); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    if (!token) return;
    try {
      const updated = await updateSignatureCampaignStatus(token, id, status);
      setCampaigns((prev) => prev.map((c) => c._id === id ? { ...updated, stats: c.stats } : c));
      if (selectedCampaign?._id === id) setSelectedCampaign(updated);
      notify(`Estado actualizado a: ${status}`);
    } catch { notify('Error al actualizar estado.'); }
  };

  const handleSelectCampaign = async (campaign: SignatureCampaignModel) => {
    setSelectedCampaign(campaign);
    setView('detail');
    await loadCampaignDetail(campaign._id);
  };

  const handleAddWorkers = async () => {
    if (!token || !selectedCampaign || selectedWorkerIds.length === 0) return;
    const workersToAdd = selectedWorkerIds.map((id) => {
      const emp = employees.find((e) => e._id === id);
      return emp ? { name: emp.name, identification: emp.document, position: emp.position, area: emp.area } : null;
    }).filter(Boolean) as Array<{ name: string; identification: string; position?: string; area?: string }>;
    try {
      await addCampaignWorkers(token, selectedCampaign._id, workersToAdd);
      setSelectedWorkerIds([]);
      setShowAddWorkersModal(false);
      notify(`${workersToAdd.length} trabajador(es) agregados.`);
      await loadCampaignDetail(selectedCampaign._id);
    } catch { notify('Error al agregar.'); }
  };

  const handleGenerateLink = async (workerId: string) => {
    if (!token || !selectedCampaign) return;
    try {
      const result = await generateWorkerLink(token, selectedCampaign._id, workerId);
      setLinkUrl(`${window.location.origin}/sign/${result.token}`);
      notify('Link generado. Copia el enlace del campo mostrado.');
    } catch { notify('Error al generar link.'); }
  };

  const handleRemoveWorker = async (workerId: string) => {
    if (!token || !selectedCampaign || !confirm('¿Eliminar este trabajador?')) return;
    try {
      await removeCampaignWorker(token, selectedCampaign._id, workerId);
      notify('Trabajador eliminado.');
      await loadCampaignDetail(selectedCampaign._id);
    } catch { notify('Error al eliminar.'); }
  };

  const handleSendReminders = async () => {
    if (!token || !selectedCampaign) return;
    try {
      const result = await sendCampaignReminders(token, selectedCampaign._id);
      notify(`${result.sent} recordatorio(s) enviados.`);
    } catch { notify('Error al enviar.'); }
  };

  const workerStatusBadge = (status?: string) => {
    if (status === 'SIGNED') return { label: '✅ Firmado', className: 'badge badge--success' };
    if (status === 'REJECTED') return { label: '❌ Rechazado', className: 'badge badge--danger' };
    if (status === 'EXPIRED') return { label: '⏰ Expirado', className: 'badge badge--warning' };
    return { label: '⏳ Pendiente', className: 'badge badge--pending' };
  };

  const campaignStatusBadge = (status?: string) => {
    if (status === 'ACTIVE') return { label: '🟢 Activa', className: 'badge badge--success' };
    if (status === 'COMPLETED') return { label: '✅ Completada', className: 'badge badge--success' };
    if (status === 'EXPIRED') return { label: '⏰ Expirada', className: 'badge badge--warning' };
    if (status === 'ARCHIVED') return { label: '📦 Archivada', className: 'badge badge--info' };
    return { label: '📝 Borrador', className: 'badge badge--pending' };
  };

  if (!token) return <p className="muted">Inicia sesión para gestionar campañas.</p>;

  if (view === 'detail' && selectedCampaign) {
    const stats = selectedCampaign.stats;
    return (
      <div className="advanced-page__content">
        {toast ? <div className="toast-alert"><strong>{toast}</strong></div> : null}

        <div className="actions" style={{ marginBottom: '1rem' }}>
          <Button type="button" variant="ghost" onClick={() => { setView('list'); setSelectedCampaign(null); }}>← Volver</Button>
        </div>

        <section className="advanced-management__hero" style={{ marginBottom: '1rem' }}>
          <div>
            <p className="muted">{selectedCampaign.documentType} · v{selectedCampaign.documentVersion}</p>
            <h3>{selectedCampaign.name}</h3>
            {selectedCampaign.description && <p className="muted">{selectedCampaign.description}</p>}
          </div>
          <span className={campaignStatusBadge(selectedCampaign.status).className}>{campaignStatusBadge(selectedCampaign.status).label}</span>
        </section>

        <div className="advanced-doc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: '1rem' }}>
          <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
            <strong style={{ fontSize: '1.5rem' }}>{stats?.totalWorkers ?? 0}</strong>
            <span className="muted">Trabajadores</span>
          </article>
          <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderTop: '3px solid #22c55e' }}>
            <strong style={{ fontSize: '1.5rem', color: '#22c55e' }}>{stats?.signed ?? 0}</strong>
            <span className="muted">Firmados</span>
          </article>
          <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderTop: '3px solid #f59e0b' }}>
            <strong style={{ fontSize: '1.5rem', color: '#f59e0b' }}>{stats?.pending ?? 0}</strong>
            <span className="muted">Pendientes</span>
          </article>
          <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center', borderTop: '3px solid #ef4444' }}>
            <strong style={{ fontSize: '1.5rem', color: '#ef4444' }}>{stats?.rejected ?? 0}</strong>
            <span className="muted">Rechazados</span>
          </article>
        </div>

        {stats && stats.totalWorkers > 0 && (
          <div className="objective-progress" style={{ marginBottom: '1rem' }}>
            <div className="objective-progress__track">
              <span className="objective-progress__fill" style={{ width: `${stats.completionPercent}%`, background: '#22c55e' }} />
            </div>
            <span>{stats.completionPercent}% completado</span>
          </div>
        )}

        <div className="actions" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          {selectedCampaign.status === 'DRAFT' && (
            <>
              <Button type="button" variant="primary" onClick={() => handleStatusChange(selectedCampaign._id, 'ACTIVE')}>
                🚀 Activar campaña
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddWorkersModal(true)}>
                + Agregar trabajadores
              </Button>
            </>
          )}
          {selectedCampaign.status === 'ACTIVE' && (
            <>
              <Button type="button" variant="secondary" onClick={() => handleStatusChange(selectedCampaign._id, 'COMPLETED')}>
                ✅ Marcar como completada
              </Button>
              <Button type="button" variant="ghost" onClick={handleSendReminders}>
                🔔 Enviar recordatorios
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" onClick={() => setShowEvidenceModal(true)}>
            📄 Evidencias ({evidence.length})
          </Button>
        </div>

        {linkUrl && (
          <div className="advanced-management__alert" style={{ marginBottom: '1rem' }}>
            <label className="field">
              <span className="label">Link de firma (copiar y compartir)</span>
              <input className="input" value={linkUrl} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
            </label>
          </div>
        )}

        <section className="advanced-management__section">
          <h3>👥 Trabajadores ({workers.length})</h3>
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Identificación</th>
                  <th>Cargo</th>
                  <th>Área</th>
                  <th>Estado</th>
                  <th>Teléfono</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {workers.length === 0 ? (
                  <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin trabajadores. Agrega empleados desde el módulo.</td></tr>
                ) : (
                  workers.map((w) => {
                    const badge = workerStatusBadge(w.status);
                    return (
                      <tr key={w._id}>
                        <td>{w.name}</td>
                        <td>{w.identification}</td>
                        <td>{w.position ?? '—'}</td>
                        <td>{w.area ?? '—'}</td>
                        <td><span className={badge.className}>{badge.label}</span></td>
                        <td>{w.phone ?? '—'}</td>
                        <td>
                          <div className="actions" style={{ gap: '.25rem' }}>
                            <Button type="button" variant="ghost" onClick={() => handleGenerateLink(w._id)}>Link</Button>
                            {w.status === 'SIGNED' && w.verificationCode && (
                              <span className="badge badge--info">Código: {w.verificationCode}</span>
                            )}
                            {w.status !== 'SIGNED' && (
                              <Button type="button" variant="danger" onClick={() => handleRemoveWorker(w._id)}>Eliminar</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {audit.length > 0 && (
          <section className="advanced-management__section">
            <h3>🕓 Auditoría</h3>
            <div className="timeline">
              {audit.slice(0, 20).map((entry, i) => (
                <article key={i} className="timeline__item">
                  <div className="actions" style={{ justifyContent: 'space-between' }}>
                    <strong>{entry.action}</strong>
                    <small className="muted">{new Date(entry.timestamp).toLocaleString()}</small>
                  </div>
                  {entry.workerName && <small className="muted">Trabajador: {entry.workerName}</small>}
                  {entry.userEmail && <small className="muted">Usuario: {entry.userEmail}</small>}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Add Workers Modal */}
        <Modal isOpen={showAddWorkersModal} title="Agregar trabajadores" onClose={() => setShowAddWorkersModal(false)}>
          <div className="form-grid">
            <h4>Seleccionar empleados</h4>
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '.5rem' }}>
              {employees.filter((e) => !workers.find((w) => w.identification === e.document)).map((emp) => (
                <label key={emp._id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.25rem 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedWorkerIds.includes(emp._id)} onChange={(e) => {
                    if (e.target.checked) setSelectedWorkerIds([...selectedWorkerIds, emp._id]);
                    else setSelectedWorkerIds(selectedWorkerIds.filter((id) => id !== emp._id));
                  }} />
                  <span>{emp.name} · {emp.document} · {emp.position}</span>
                </label>
              ))}
            </div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <Button type="button" variant="primary" disabled={selectedWorkerIds.length === 0} onClick={handleAddWorkers}>
                Agregar ({selectedWorkerIds.length})
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowAddWorkersModal(false)}>Cancelar</Button>
            </div>
          </div>
        </Modal>

        {/* Evidence Modal */}
        <Modal isOpen={showEvidenceModal} title="Evidencias de firma" onClose={() => setShowEvidenceModal(false)}>
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Identificación</th>
                  <th>Método</th>
                  <th>Fecha firma</th>
                  <th>OTP</th>
                  <th>Código verificación</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {evidence.length === 0 ? (
                  <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin evidencias</td></tr>
                ) : (
                  evidence.map((e) => (
                    <tr key={e._id}>
                      <td>{e.workerName}</td>
                      <td>{e.workerIdentification}</td>
                      <td>{e.signatureMethod ?? '—'}</td>
                      <td>{new Date(e.signedAt).toLocaleString()}</td>
                      <td>{e.otpValidated ? '✅' : '❌'}</td>
                      <td><code>{e.verificationCode}</code></td>
                      <td><code style={{ fontSize: '.75rem' }}>{e.signatureHash.slice(0, 12)}...</code></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      </div>
    );
  }

  // ==================== LIST VIEW ====================
  return (
    <div className="advanced-page__content">
      {toast ? <div className="toast-alert" style={{ marginBottom: '1rem' }}><strong>{toast}</strong></div> : null}

      <section className="advanced-management__hero">
        <div>
          <h3>📋 Campañas de Firma</h3>
          <p className="muted">Motor reutilizable de firmas digitales para trabajadores sin cuenta de plataforma.</p>
        </div>
      </section>

      {stats && (
        <div className="advanced-doc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: '1rem' }}>
          <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
            <strong style={{ fontSize: '1.5rem' }}>{stats.total}</strong>
            <span className="muted">Total campañas</span>
          </article>
          <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
            <strong style={{ fontSize: '1.5rem' }}>{stats.active}</strong>
            <span className="muted">Activas</span>
          </article>
          <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
            <strong style={{ fontSize: '1.5rem' }}>{stats.totalSigned}</strong>
            <span className="muted">Firmas totales</span>
          </article>
        </div>
      )}

      <div className="actions" style={{ marginBottom: '1rem' }}>
        <Button type="button" variant="primary" onClick={() => setShowCreateModal(true)}>
          + Nueva campaña
        </Button>
      </div>

      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo documento</th>
              <th>Versión</th>
              <th>Estado</th>
              <th>Trabajadores</th>
              <th>Firmas</th>
              <th>%</th>
              <th>Vence</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>Crea tu primera campaña de firma</td></tr>
            ) : (
              campaigns.map((c) => {
                const s = c.stats;
                const badge = campaignStatusBadge(c.status);
                return (
                  <tr key={c._id} style={{ cursor: 'pointer' }} onClick={() => handleSelectCampaign(c)}>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.documentType}</td>
                    <td>v{c.documentVersion}</td>
                    <td><span className={badge.className}>{badge.label}</span></td>
                    <td>{s?.totalWorkers ?? 0}</td>
                    <td>{s?.signed ?? 0}</td>
                    <td>{s?.completionPercent ?? 0}%</td>
                    <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="actions" style={{ gap: '.25rem' }}>
                        {c.status === 'DRAFT' && (
                          <Button type="button" variant="ghost" onClick={(e) => { e.stopPropagation(); handleStatusChange(c._id, 'ACTIVE'); }}>
                            Activar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} title="Nueva campaña de firma" onClose={() => setShowCreateModal(false)}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Nombre de la campaña</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Responsabilidades SG-SST 2026" />
          </label>
          <label className="field">
            <span className="label">Descripción</span>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Propósito de la campaña" />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Tipo de documento</span>
              <select className="input" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
                <option value="RESPONSIBILITIES">Responsabilidades SG-SST</option>
                <option value="POLICY">Política SST</option>
                <option value="TRAINING">Capacitación SST</option>
                <option value="INDUCTION">Inducción</option>
                <option value="REINDUCTION">Reinducción</option>
                <option value="COPASST">COPASST</option>
                <option value="COMMITTEE">Comité de Convivencia</option>
                <option value="BRIGADE">Brigada de Emergencias</option>
                <option value="COMMUNICATION">Comunicación interna</option>
                <option value="OTHER">Otro</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Versión</span>
              <input className="input" value={form.documentVersion} onChange={(e) => setForm({ ...form, documentVersion: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span className="label">Contenido del documento (opcional)</span>
            <textarea className="input" rows={5} value={form.documentContent} onChange={(e) => setForm({ ...form, documentContent: e.target.value })} placeholder="Texto del documento que los trabajadores leerán..." />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Vence el</span>
              <input className="input" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Requerir OTP</span>
              <select className="input" value={form.requireOtp ? 'true' : 'false'} onChange={(e) => setForm({ ...form, requireOtp: e.target.value === 'true' })}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="primary" disabled={!form.name} onClick={handleCreate}>Crear campaña</Button>
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default WorkerSignatureCampaignPanel;
