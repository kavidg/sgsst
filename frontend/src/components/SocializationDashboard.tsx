import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { AdvancedKpiGrid } from './advanced-layout';
import {
  SocializationSessionModel,
  SessionStatsModel,
  SocializationPresentationModel,
  SocializationParticipantModel,
  SocializationEvidenceModel,
  SocializationAuditModel,
  SocializationTokenResult,
  EmployeeModel,
  fetchEmployees,
  getSocializationSession,
  getSocializationStats,
  startSocialization,
  updateSocialization,
  completeSocialization,
  uploadSocializationPresentation,
  getSocializationPresentation,
  addSocializationParticipants,
  getSocializationParticipants,
  removeSocializationParticipant,
  generateSocializationTokens,
  sendSocializationReminders,
  getSocializationEvidence,
  getSocializationAudit,
  getSocializationReport,
} from '../api';

type Tab = 'resumen' | 'presentacion' | 'participantes' | 'evidencias' | 'historial';

export default function SocializationDashboard({
  token,
  responsibilitiesDocId,
  documentVersion,
  onComplete,
}: {
  token: string;
  responsibilitiesDocId: string;
  documentVersion: string;
  onComplete?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('resumen');
  const [session, setSession] = useState<SocializationSessionModel | null>(null);
  const [stats, setStats] = useState<SessionStatsModel | null>(null);
  const [presentation, setPresentation] = useState<SocializationPresentationModel | null>(null);
  const [participants, setParticipants] = useState<SocializationParticipantModel[]>([]);
  const [evidence, setEvidence] = useState<SocializationEvidenceModel[]>([]);
  const [audits, setAudits] = useState<SocializationAuditModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const sessionData = await getSocializationSession(token, responsibilitiesDocId);
      setSession(sessionData);
      if (sessionData?._id) {
        const [statsData, presData, partsData, evData, audData, empData] = await Promise.all([
          getSocializationStats(token, sessionData._id).catch(() => null),
          getSocializationPresentation(token, sessionData._id).catch(() => null),
          getSocializationParticipants(token, sessionData._id).catch(() => []),
          getSocializationEvidence(token, sessionData._id).catch(() => []),
          getSocializationAudit(token, sessionData._id).catch(() => []),
          fetchEmployees(token).catch(() => []),
        ]);
        setStats(statsData);
        setPresentation(presData);
        setParticipants(partsData);
        setEvidence(evData);
        setAudits(audData);
        setEmployees(empData);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [token, responsibilitiesDocId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const handleStart = async () => {
    const startDate = prompt('Fecha de inicio (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!startDate) return;
    const deadline = prompt('Fecha límite (YYYY-MM-DD, opcional):', '');
    const responsible = prompt('Responsable:', '');
    try {
      const result = await startSocialization(token, responsibilitiesDocId, {
        startDate,
        deadline: deadline || undefined,
        responsibleName: responsible || undefined,
      });
      setSession(result);
      notify('✅ Socialización iniciada correctamente');
      await loadAll();
    } catch (e: any) { notify('Error: ' + (e.message || '')); }
  };

  const handleComplete = async () => {
    if (!session?._id) return;
    if (!confirm('¿Completar la socialización? Esto moverá el estado a SOCIALIZED.')) return;
    try {
      await completeSocialization(token, session._id);
      notify('✅ Socialización completada');
      await loadAll();
      if (onComplete) onComplete();
    } catch (e: any) { notify('Error: ' + (e.message || '')); }
  };

  const handleUploadPresentation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!session?._id || !e.target.files?.length) return;
    const file = e.target.files[0];
    const title = prompt('Título de la presentación:', file.name.replace(/\.[^/.]+$/, ''));
    if (!title) return;
    try {
      await uploadSocializationPresentation(token, session._id, file, title);
      notify('✅ Presentación cargada');
      await loadAll();
    } catch (err: any) { notify('Error: ' + (err.message || '')); }
    e.target.value = '';
  };

  const handleAddParticipants = async () => {
    if (!session?._id) return;
    const selectedIds = employees.map((e) => e._id);
    if (selectedIds.length === 0) { notify('No hay empleados disponibles'); return; }
    try {
      await addSocializationParticipants(token, session._id, {
        participants: employees.map((e) => ({
          employeeId: e._id,
          employeeName: e.name,
          employeeIdentification: e.document,
          position: e.position,
          department: e.area,
        })),
      });
      notify(`✅ ${selectedIds.length} participante(s) agregados`);
      await loadAll();
    } catch (err: any) { notify('Error: ' + (err.message || '')); }
  };

  const handleGenerateTokens = async () => {
    if (!session?._id) return;
    try {
      const tokens = await generateSocializationTokens(token, session._id);
      notify(`✅ ${tokens.length} enlace(s) generados`);
      await loadAll();
    } catch (err: any) { notify('Error: ' + (err.message || '')); }
  };

  const handleSendReminders = async () => {
    if (!session?._id) return;
    try {
      const result = await sendSocializationReminders(token, session._id);
      notify(`✅ ${result.sent} recordatorio(s) enviados`);
    } catch (err: any) { notify('Error: ' + (err.message || '')); }
  };

  const exportReport = async () => {
    if (!session?._id) return;
    try {
      const report = await getSocializationReport(token, session._id);
      const lines = [
        '=== INFORME DE SOCIALIZACIÓN SG-SST ===',
        `Versión documento: ${report.session.documentVersion}`,
        `Estado: ${report.session.status}`,
        `Inicio: ${report.session.startDate ? new Date(report.session.startDate).toLocaleDateString() : 'N/A'}`,
        `Límite: ${report.session.deadline ? new Date(report.session.deadline).toLocaleDateString() : 'N/A'}`,
        `Responsable: ${report.session.responsibleName || 'N/A'}`,
        '',
        `Total participantes: ${report.participants.length}`,
        `Completados: ${report.participants.filter((p) => p.status === 'SIGNED' || p.status === 'PRESENTATION_COMPLETED').length}`,
        `Firmados: ${report.participants.filter((p) => p.status === 'SIGNED').length}`,
        '',
        '--- PARTICIPANTES ---',
        ...report.participants.map((p, i) => `${i + 1}. ${p.employeeName} - ${p.status}${p.signedAt ? ` - Firmó: ${new Date(p.signedAt).toLocaleString()}` : ''}`),
        '',
        '--- EVIDENCIAS ---',
        ...report.evidence.map((e, i) => `${i + 1}. ${e.employeeName} - ${new Date(e.signedAt).toLocaleString()} - Código: ${e.verificationCode || 'N/A'}`),
        '',
        '=== FIN DEL INFORME ===',
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `socializacion-sst-${documentVersion}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      notify('📄 Informe exportado');
    } catch (err: any) { notify('Error: ' + (err.message || '')); }
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'resumen', label: '📊 Resumen' },
    { id: 'presentacion', label: '📽️ Presentación' },
    { id: 'participantes', label: '👥 Participantes' },
    { id: 'evidencias', label: '📋 Evidencias' },
    { id: 'historial', label: '🕓 Historial' },
  ];

  const renderStatusBadge = (status: string) => {
    if (status === 'SOCIALIZATION_PENDING') return <span className="advanced-management__badge advanced-management__badge--warning">⏳ Pendiente</span>;
    if (status === 'SOCIALIZATION_IN_PROGRESS') return <span className="advanced-management__badge advanced-management__badge--info">🔄 En progreso</span>;
    if (status === 'SOCIALIZED') return <span className="advanced-management__badge advanced-management__badge--success">✅ Socializado</span>;
    if (status === 'COMPLIANT') return <span className="advanced-management__badge advanced-management__badge--success">🟢 Conforme</span>;
    return <span className="advanced-management__badge">{status}</span>;
  };

  const renderParticipantBadge = (status: string) => {
    if (status === 'SIGNED') return <span className="advanced-management__badge advanced-management__badge--success">✅ Firmado</span>;
    if (status === 'PRESENTATION_COMPLETED') return <span className="advanced-management__badge advanced-management__badge--success">📖 Completado</span>;
    if (status === 'PRESENTATION_VIEWING') return <span className="advanced-management__badge advanced-management__badge--info">👀 Viendo</span>;
    if (status === 'LINK_OPENED') return <span className="advanced-management__badge advanced-management__badge--info">🔗 Abierto</span>;
    if (status === 'EXPIRED') return <span className="advanced-management__badge advanced-management__badge--danger">⏰ Expirado</span>;
    return <span className="advanced-management__badge advanced-management__badge--warning">⏳ Pendiente</span>;
  };

  return (
    <div className="advanced-page__section">
      {/* Header */}
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>📢 Socialización de Responsabilidades SG-SST</h3>
        <div className="actions" style={{ gap: '.5rem' }}>
          <Button type="button" variant="secondary" onClick={exportReport}>📄 Exportar</Button>
          <Button type="button" variant="ghost" onClick={() => void loadAll()}>🔄 Recargar</Button>
        </div>
      </div>

      {/* Status summary */}
      {session && (
        <div className="actions" style={{ gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {renderStatusBadge(session.status)}
          <span className="muted">📅 Inicio: {session.startDate ? new Date(session.startDate).toLocaleDateString() : 'No iniciado'}</span>
          {session.deadline && <span className="muted">⏰ Límite: {new Date(session.deadline).toLocaleDateString()}</span>}
          {session.responsibleName && <span className="muted">👤 Responsable: {session.responsibleName}</span>}
        </div>
      )}

      {toast && <div className="toast-alert" style={{ marginBottom: '1rem' }}><p>{toast}</p></div>}

      {/* Not started - show start button */}
      {(!session || session.status === 'SOCIALIZATION_PENDING') && (
        <div style={{ textAlign: 'center', padding: '2rem', background: '#f9fafb', borderRadius: '8px', marginBottom: '1rem' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>La socialización de responsabilidades SG-SST está pendiente de inicio.</p>
          <Button type="button" onClick={handleStart}>🚀 Iniciar socialización</Button>
        </div>
      )}

      {/* Tabs */}
      {session && session.status !== 'SOCIALIZATION_PENDING' && (
        <>
          <div className="advanced-tabs" role="tablist" style={{ marginBottom: '1rem' }}>
            {tabs.map((t) => (
              <Button key={t.id} type="button" variant={tab === t.id ? 'primary' : 'secondary'} onClick={() => setTab(t.id)}>
                {t.label}
              </Button>
            ))}
          </div>

          {/* ======== RESUMEN ======== */}
          {tab === 'resumen' && (
            <div>
              <AdvancedKpiGrid
                items={[
                  { label: 'Total Participantes', value: stats?.total ?? 0 },
                  { label: 'Completaron Presentación', value: stats?.completed ?? 0, variant: 'success' },
                  { label: 'Firmaron', value: stats?.signed ?? 0, variant: 'success' },
                  { label: 'Pendientes', value: stats?.pending ?? 0, variant: 'warning' },
                  { label: 'Expirados', value: stats?.expired ?? 0, variant: 'danger' },
                  { label: '% Cumplimiento', value: `${stats?.signingPercent ?? 0}%`, variant: (stats?.signingPercent ?? 0) >= 80 ? 'success' : 'warning' },
                ]}
                columns={6}
              />

              {/* Progress bars */}
              <div style={{ marginTop: '1rem' }}>
                <div className="objective-progress" style={{ marginBottom: '.75rem' }}>
                  <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Presentación completada</span>
                  <div className="objective-progress__track">
                    <span className="objective-progress__bar objective-progress__bar--high" style={{ width: `${stats?.completionPercent ?? 0}%` }} />
                  </div>
                  <strong>{stats?.completionPercent ?? 0}%</strong>
                </div>
                <div className="objective-progress">
                  <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Firmas registradas</span>
                  <div className="objective-progress__track">
                    <span className="objective-progress__bar objective-progress__bar--high" style={{ width: `${stats?.signingPercent ?? 0}%`, background: '#8b5cf6' }} />
                  </div>
                  <strong>{stats?.signingPercent ?? 0}%</strong>
                </div>
              </div>

              {/* Actions */}
              <div className="actions" style={{ marginTop: '1rem', gap: '.5rem' }}>
                {stats && stats.total > 0 && stats.signed < stats.total && (
                  <Button type="button" variant="secondary" onClick={handleSendReminders}>🔔 Enviar recordatorios</Button>
                )}
                {session.status === 'SOCIALIZATION_IN_PROGRESS' && (
                  <Button type="button" onClick={handleComplete}>✅ Completar socialización</Button>
                )}
              </div>
            </div>
          )}

          {/* ======== PRESENTACIÓN ======== */}
          {tab === 'presentacion' && (
            <div>
              {presentation ? (
                <div>
                  <div className="advanced-page__version-card" style={{ marginBottom: '1rem' }}>
                    <div className="advanced-page__version-header">
                      <span className="advanced-page__version-badge">v{presentation.currentVersion}</span>
                      <strong>{presentation.title}</strong>
                      {presentation.description && <span className="muted">{presentation.description}</span>}
                    </div>
                    <div className="advanced-page__version-details">
                      <p><strong>Versiones:</strong> {presentation.versions.length}</p>
                      <p><strong>Última actualización:</strong> {new Date(presentation.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Version history */}
                  <h4>Historial de versiones</h4>
                  <div className="advanced-page__audit-table-wrap" style={{ marginBottom: '1rem' }}>
                    <table className="table">
                      <thead>
                        <tr><th>Versión</th><th>Archivo</th><th>Tipo</th><th>Subido por</th><th>Fecha</th></tr>
                      </thead>
                      <tbody>
                        {presentation.versions.slice().reverse().map((v, i) => (
                          <tr key={i}>
                            <td><span className="advanced-page__version-badge">v{v.version}</span></td>
                            <td>
                              {v.fileUrl ? (
                                <a href={v.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{v.fileName}</a>
                              ) : v.fileName}
                            </td>
                            <td>{v.fileType}</td>
                            <td>{v.uploadedByName || v.uploadedByEmail || '—'}</td>
                            <td>{new Date(v.uploadedAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Replace presentation */}
                  <div className="actions">
                    <Button type="button" variant="secondary" onClick={() => document.getElementById('pres-upload')?.click()}>
                      📤 Reemplazar presentación
                    </Button>
                    <input id="pres-upload" type="file" accept=".pdf,.pptx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleUploadPresentation} />
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
                  <p className="muted" style={{ marginBottom: '1rem' }}>Aún no se ha cargado ninguna presentación.</p>
                  <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>Formatos soportados: PDF, PPTX, JPG, PNG</p>
                  <Button type="button" onClick={() => document.getElementById('pres-upload-first')?.click()}>
                    📤 Cargar presentación
                  </Button>
                  <input id="pres-upload-first" type="file" accept=".pdf,.pptx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleUploadPresentation} />
                </div>
              )}
            </div>
          )}

          {/* ======== PARTICIPANTES ======== */}
          {tab === 'participantes' && (
            <div>
              <div className="actions" style={{ marginBottom: '1rem' }}>
                <Button type="button" onClick={handleAddParticipants}>👥 Agregar todos los empleados</Button>
                <Button type="button" variant="secondary" onClick={handleGenerateTokens}>🔗 Generar enlaces</Button>
                <Button type="button" variant="secondary" onClick={handleSendReminders}>🔔 Enviar recordatorios</Button>
              </div>

              {participants.length === 0 ? (
                <p className="empty-state">No hay participantes agregados. Haz clic en "Agregar todos los empleados" para comenzar.</p>
              ) : (
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Nombre</th>
                        <th>Identificación</th>
                        <th>Cargo</th>
                        <th>Área</th>
                        <th>Estado</th>
                        <th>% Vis.</th>
                        <th>Enlace</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((p, i) => (
                        <tr key={p._id}>
                          <td>{i + 1}</td>
                          <td><strong>{p.employeeName}</strong></td>
                          <td>{p.employeeIdentification}</td>
                          <td>{p.position || '—'}</td>
                          <td>{p.department || '—'}</td>
                          <td>{renderParticipantBadge(p.status)}</td>
                          <td>
                            <div className="objective-progress" style={{ gap: '.25rem' }}>
                              <div className="objective-progress__track" style={{ width: 40, height: 14 }}>
                                <span className="objective-progress__bar" style={{ width: `${p.viewingProgress?.completionPercent || 0}%`, background: '#2563eb', height: 14 }} />
                              </div>
                              <span style={{ fontSize: '.75rem' }}>{p.viewingProgress?.completionPercent || 0}%</span>
                            </div>
                          </td>
                          <td>
                            {p.token ? (
                              <code style={{ fontSize: '.7rem', wordBreak: 'break-all' }}>{p.token.slice(0, 16)}...</code>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {p.status !== 'SIGNED' && (
                              <Button type="button" variant="danger" size="small"
                                onClick={async () => {
                                  if (!confirm(`¿Eliminar a ${p.employeeName}?`)) return;
                                  try {
                                    await removeSocializationParticipant(token, session._id, p._id);
                                    notify('Participante eliminado');
                                    await loadAll();
                                  } catch (err: any) { notify('Error: ' + (err.message || '')); }
                                }}
                              >🗑</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
                Total: {participants.length} participantes · {participants.filter((p) => p.status === 'SIGNED').length} firmados
              </p>
            </div>
          )}

          {/* ======== EVIDENCIAS ======== */}
          {tab === 'evidencias' && (
            <div>
              {evidence.length === 0 ? (
                <p className="empty-state">Aún no hay evidencias generadas. Los participantes deben firmar para generar evidencias.</p>
              ) : (
                <div className="responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Empleado</th>
                        <th>Identificación</th>
                        <th>% Visualización</th>
                        <th>Tiempo visualización</th>
                        <th>Firmó</th>
                        <th>Código verificación</th>
                        <th>Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidence.slice().reverse().map((e, i) => (
                        <tr key={e._id}>
                          <td>{i + 1}</td>
                          <td><strong>{e.employeeName}</strong></td>
                          <td>{e.employeeIdentification}</td>
                          <td>{e.slideCompletionPercent}%</td>
                          <td>{Math.round(e.totalViewingTimeSeconds / 60)} min</td>
                          <td>{new Date(e.signedAt).toLocaleString()}</td>
                          <td><code style={{ fontSize: '.75rem' }}>{e.verificationCode || '—'}</code></td>
                          <td><code style={{ fontSize: '.65rem', color: '#6b7280' }}>{e.signatureHash?.slice(0, 12)}...</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="actions" style={{ marginTop: '1rem' }}>
                <Button type="button" variant="secondary" onClick={exportReport}>📄 Descargar informe completo</Button>
              </div>
            </div>
          )}

          {/* ======== HISTORIAL ======== */}
          {tab === 'historial' && (
            <div>
              {audits.length === 0 ? (
                <p className="empty-state">No hay eventos registrados en el historial.</p>
              ) : (
                <div className="timeline" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {audits.map((a, i) => (
                    <article key={a._id || i} className="timeline__item" style={{ padding: '.5rem .75rem', borderLeft: '3px solid #2563eb', marginBottom: '.5rem', background: '#f9fafb', borderRadius: '0 6px 6px 0' }}>
                      <div className="actions" style={{ justifyContent: 'space-between' }}>
                        <div>
                          <strong style={{ fontSize: '.85rem' }}>{a.action}</strong>
                          {a.employeeName && <span style={{ marginLeft: '.5rem', color: '#6b7280', fontSize: '.8rem' }}>— {a.employeeName}</span>}
                        </div>
                        <span style={{ fontSize: '.75rem', color: '#9ca3af' }}>{new Date(a.timestamp).toLocaleString()}</span>
                      </div>
                      {a.userEmail && <p style={{ margin: '.15rem 0 0', fontSize: '.78rem', color: '#6b7280' }}>{a.userEmail}</p>}
                      {a.ipAddress && <p style={{ margin: 0, fontSize: '.72rem', color: '#9ca3af' }}>IP: {a.ipAddress}</p>}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
