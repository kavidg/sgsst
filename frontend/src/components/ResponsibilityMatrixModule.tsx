import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsibilityMatrixItemModel,
  ResponsibilityMatrixModel,
  MatrixAuditEntryModel,
  MatrixVersionModel,
  fetchResponsibilityMatrix,
  generateResponsibilityMatrix,
  addResponsibilityMatrixItem,
  updateResponsibilityMatrixItem,
  deleteResponsibilityMatrixItem,
  duplicateResponsibilityMatrixItem,
  reorderResponsibilityMatrixItems,
  submitResponsibilityMatrixApproval,
  approveResponsibilityMatrix,
  archiveResponsibilityMatrix,
  createResponsibilityMatrixVersion,
  fetchResponsibilityMatrixHistory,
  fetchResponsibilityMatrixCampaignInfo,
} from '../api';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { ResponsibilityAcceptancePanel } from './ResponsibilityAcceptancePanel';

// Group labels and icons
const GROUP_META: Record<string, { label: string; icon: string; color: string }> = {
  GERENCIA: { label: '👨‍💼 Gerencia', icon: '👨‍💼', color: '#1e40af' },
  RESPONSABLE_SST: { label: '🦺 Responsable SST', icon: '🦺', color: '#15803d' },
  TRABAJADORES: { label: '👷 Trabajadores', icon: '👷', color: '#854d0e' },
  COPASST: { label: '🤝 COPASST', icon: '🤝', color: '#7c3aed' },
  COMITE_CONVIVENCIA: { label: '❤️ Comité de Convivencia', icon: '❤️', color: '#be185d' },
  BRIGADA_EMERGENCIAS: { label: '🚨 Brigada de Emergencias', icon: '🚨', color: '#c2410c' },
};

const GROUP_ORDER = ['GERENCIA', 'RESPONSABLE_SST', 'TRABAJADORES', 'COPASST', 'COMITE_CONVIVENCIA', 'BRIGADA_EMERGENCIAS'];

const SIDEBAR_SECTIONS = [
  { id: 'resumen', label: '📋 Resumen', icon: '📋' },
  { id: 'gerencia', label: '👨‍💼 Gerencia', icon: '👨‍💼', group: 'GERENCIA' },
  { id: 'responsable-sst', label: '🦺 Responsable SST', icon: '🦺', group: 'RESPONSABLE_SST' },
  { id: 'trabajadores', label: '👷 Trabajadores', icon: '👷', group: 'TRABAJADORES' },
  { id: 'copasst', label: '🤝 COPASST', icon: '🤝', group: 'COPASST' },
  { id: 'convivencia', label: '❤️ Comité de Convivencia', icon: '❤️', group: 'COMITE_CONVIVENCIA' },
  { id: 'brigada', label: '🚨 Brigada de Emergencias', icon: '🚨', group: 'BRIGADA_EMERGENCIAS' },
  { id: 'aprobaciones', label: '✍ Aprobaciones', icon: '✍' },
  { id: 'asignaciones', label: '👥 Asignaciones', icon: '👥' },
  { id: 'versiones', label: '📂 Versiones', icon: '📂' },
  { id: 'aceptaciones', label: '✅ Aceptaciones', icon: '✅' },
  { id: 'historial', label: '🕓 Historial', icon: '🕓' },
];

function complianceBadge(status?: string) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'badge badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'badge badge--danger' };
  return { label: '⚠ Pendiente', className: 'badge badge--warning' };
}

function approvalBadge(status?: string) {
  if (status === 'APPROVED') return { label: '✅ Aprobado', className: 'badge badge--success' };
  if (status === 'PENDING_APPROVAL') return { label: '⏳ Pendiente aprobación', className: 'badge badge--warning' };
  if (status === 'ARCHIVED') return { label: '📦 Archivado', className: 'badge badge--info' };
  return { label: '📝 Borrador', className: 'badge badge--pending' };
}

export function ResponsibilityMatrixModule({ token }: { token?: string }) {
  const [sidebarSection, setSidebarSection] = useState('resumen');
  const [matrix, setMatrix] = useState<ResponsibilityMatrixModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [editItem, setEditItem] = useState<ResponsibilityMatrixItemModel | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveEmail, setApproveEmail] = useState('');
  const [campaignInfo, setCampaignInfo] = useState<{ hasCampaign: boolean; stats?: any; campaign?: any; workers?: any[]; message?: string } | null>(null);
  const [toast, setToast] = useState('');
  const [history, setHistory] = useState<MatrixAuditEntryModel[]>([]);
  const [newItem, setNewItem] = useState({ title: '', description: '', group: 'GERENCIA', mandatory: false, active: true });

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const loadMatrix = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchResponsibilityMatrix(token);
      setMatrix(data);
    } catch (err) {
      notify('Error al cargar la matriz de responsabilidades.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadCampaignInfo = useCallback(async () => {
    if (!token) return;
    try {
      setCampaignInfo(await fetchResponsibilityMatrixCampaignInfo(token));
    } catch { /* ignore */ }
  }, [token]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    try {
      setHistory(await fetchResponsibilityMatrixHistory(token));
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { void loadMatrix(); }, [loadMatrix]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => { void loadCampaignInfo(); }, [loadCampaignInfo]);

  const itemsByGroup = useMemo(() => {
    if (!matrix) return new Map<string, ResponsibilityMatrixItemModel[]>();
    const map = new Map<string, ResponsibilityMatrixItemModel[]>();
    for (const group of GROUP_ORDER) {
      map.set(group, (matrix.items ?? []).filter((item) => item.group === group && item.active).sort((a, b) => a.order - b.order));
    }
    return map;
  }, [matrix]);

  const allItems = matrix?.items ?? [];
  const totalActive = allItems.filter((item) => item.active).length;
  const totalMandatory = allItems.filter((item) => item.mandatory).length;
  const badge = complianceBadge(matrix?.complianceStatus);
  const approval = approvalBadge(matrix?.approvalStatus);
  const isLocked = matrix?.approvalStatus === 'APPROVED' || matrix?.approvalStatus === 'ARCHIVED';

  const handleGenerate = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await generateResponsibilityMatrix(token);
      setMatrix(result);
      notify('🚀 Responsabilidades generadas automáticamente.');
    } catch (err) {
      notify('Error al generar responsabilidades.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!token || !editItem?._id) return;
    try {
      const result = await updateResponsibilityMatrixItem(token, editItem._id, {
        title: editItem.title,
        description: editItem.description,
        active: editItem.active,
        mandatory: editItem.mandatory,
      });
      setMatrix(result);
      setShowEditModal(false);
      setEditItem(null);
      notify('Responsabilidad actualizada.');
    } catch { notify('Error al actualizar.'); }
  };

  const handleAdd = async () => {
    if (!token || !newItem.title) return;
    try {
      const result = await addResponsibilityMatrixItem(token, { ...newItem, status: 'PENDING' });
      setMatrix(result);
      setShowAddModal(false);
      setNewItem({ title: '', description: '', group: 'GERENCIA', mandatory: false, active: true });
      notify('Responsabilidad agregada.');
    } catch { notify('Error al agregar.'); }
  };

  const handleDelete = async (itemId: string) => {
    if (!token || !confirm('¿Eliminar esta responsabilidad?')) return;
    try {
      const result = await deleteResponsibilityMatrixItem(token, itemId);
      setMatrix(result);
      notify('Responsabilidad eliminada.');
    } catch { notify('Error al eliminar.'); }
  };

  const handleDuplicate = async (itemId: string) => {
    if (!token) return;
    try {
      const result = await duplicateResponsibilityMatrixItem(token, itemId);
      setMatrix(result);
      notify('Responsabilidad duplicada.');
    } catch { notify('Error al duplicar.'); }
  };

  const handleReorder = async (itemId: string, direction: 'up' | 'down') => {
    if (!token || !matrix) return;
    const items = [...matrix.items].sort((a, b) => a.order - b.order);
    const idx = items.findIndex((i) => i._id === itemId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const order = items.map((item, i) => ({
      _id: item._id ?? '',
      order: i === idx ? items[swapIdx].order : i === swapIdx ? items[idx].order : item.order,
    }));
    try {
      const result = await reorderResponsibilityMatrixItems(token, order);
      setMatrix(result);
    } catch { notify('Error al reordenar.'); }
  };

  const handleSubmitApproval = async () => {
    if (!token) return;
    try {
      const result = await submitResponsibilityMatrixApproval(token);
      setMatrix(result);
      notify('Matriz enviada para aprobación.');
    } catch (err: any) { notify(err.message || 'Error al enviar.'); }
  };

  const handleApprove = async () => {
    if (!token || !approveEmail) return;
    try {
      const result = await approveResponsibilityMatrix(token, { approvedByEmail: approveEmail });
      setMatrix(result);
      setShowApproveModal(false);
      setApproveEmail('');
      notify('✅ Matriz aprobada exitosamente.');
    } catch { notify('Error al aprobar.'); }
  };

  const handleArchive = async () => {
    if (!token) return;
    try {
      const result = await archiveResponsibilityMatrix(token);
      setMatrix(result);
      notify('Matriz archivada.');
    } catch { notify('Error al archivar.'); }
  };

  const handleCreateVersion = async () => {
    if (!token) return;
    try {
      const result = await createResponsibilityMatrixVersion(token);
      setMatrix(result);
      notify('Nueva versión creada.');
    } catch { notify('Error al crear versión.'); }
  };

  const renderItemEditor = (item: ResponsibilityMatrixItemModel) => (
    <tr key={item._id}>
      <td>
        <div className="actions" style={{ gap: '.25rem' }}>
          <button type="button" className="btn btn-ghost" style={{ padding: '.3rem' }} disabled={isLocked} onClick={() => handleReorder(item._id!, 'up')}>↑</button>
          <button type="button" className="btn btn-ghost" style={{ padding: '.3rem' }} disabled={isLocked} onClick={() => handleReorder(item._id!, 'down')}>↓</button>
        </div>
      </td>
      <td><strong>{item.title}</strong>{item.description ? <p className="muted" style={{ fontSize: '.82rem' }}>{item.description}</p> : null}</td>
      <td>{item.mandatory ? <span className="badge badge--priority">Obligatorio</span> : <span className="badge badge--status">Opcional</span>}</td>
      <td>
        <div className="actions" style={{ gap: '.25rem' }}>
          <Button type="button" variant="ghost" disabled={isLocked} onClick={() => { setEditItem({ ...item }); setShowEditModal(true); }}>Editar</Button>
          <Button type="button" variant="ghost" disabled={isLocked} onClick={() => handleDuplicate(item._id!)}>Duplicar</Button>
          <Button type="button" variant="danger" disabled={isLocked} onClick={() => handleDelete(item._id!)}>Eliminar</Button>
        </div>
      </td>
    </tr>
  );

  const renderGroupSection = (groupId: string) => {
    const meta = GROUP_META[groupId];
    const items = itemsByGroup.get(groupId) ?? [];
    return (
      <section className="advanced-management__section">
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
          <div className="actions" style={{ gap: '.5rem', alignItems: 'center' }}>
            <Button type="button" variant="ghost" onClick={() => setSidebarSection('resumen')} style={{ padding: '.3rem .6rem' }}>
              ← Volver
            </Button>
            <h3 style={{ margin: 0 }}>{meta?.label}</h3>
          </div>
          {!isLocked && (
            <Button type="button" variant="ghost" onClick={() => { setNewItem({ ...newItem, group: groupId }); setShowAddModal(true); }}>
              + Agregar
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="empty-state">No hay responsabilidades para este grupo. Genera la matriz automáticamente.</p>
        ) : (
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Orden</th>
                  <th>Responsabilidad</th>
                  <th style={{ width: '120px' }}>Tipo</th>
                  <th style={{ width: '220px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>{items.map(renderItemEditor)}</tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  if (!token) return <p className="muted">Inicia sesión para gestionar la matriz de responsabilidades.</p>;

  return (
    <div className="advanced-page__content">
      {toast ? <div className="toast-alert" style={{ marginBottom: '1rem' }}><strong>Notificación</strong><p>{toast}</p></div> : null}

      {/* Resumen */}
      {sidebarSection === 'resumen' && (
        <div className="advanced-management">
          <section className="advanced-management__hero">
            <div>
              <p className="muted">Módulo 1.1.2</p>
              <h3>Responsabilidades en SG-SST</h3>
              <p className="muted">{matrix?.complianceReason ?? 'Cargando...'}</p>
            </div>
            <span className={badge.className}>{badge.label}</span>
          </section>

          <div className="advanced-doc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
              <strong style={{ fontSize: '1.8rem' }}>{totalActive}</strong>
              <span className="muted">Responsabilidades activas</span>
            </article>
            <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
              <strong style={{ fontSize: '1.8rem' }}>{totalMandatory}</strong>
              <span className="muted">Obligatorias</span>
            </article>
            <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
              <strong style={{ fontSize: '1.8rem' }}>{matrix?.versions?.length ?? 0}</strong>
              <span className="muted">Versiones</span>
            </article>
            <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
              <span className={approval.className} style={{ fontSize: '.85rem' }}>{approval.label}</span>
              <span className="muted">Estado</span>
            </article>
          </div>

          <div className="advanced-doc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {GROUP_ORDER.map((group) => {
              const count = itemsByGroup.get(group)?.length ?? 0;
              const meta = GROUP_META[group];
              return (
                <article key={group} className="advanced-doc-card" style={{ flexDirection: 'column', cursor: 'pointer' }}
                  onClick={() => setSidebarSection(SIDEBAR_SECTIONS.find((s) => s.group === group)?.id ?? 'resumen')}>
                  <strong style={{ fontSize: '1.1rem' }}>{meta?.label}</strong>
                  <span className="muted">{count} responsabilidades</span>
                </article>
              );
            })}
          </div>

          {/* Campaign Progress Section */}
          {campaignInfo?.hasCampaign && campaignInfo?.campaign && (
            <section className="advanced-management__section">
              <h3>📢 Campaña de Firmas: {campaignInfo.campaign.name}</h3>
              <div className="advanced-doc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
                  <strong style={{ fontSize: '1.8rem', color: '#16a34a' }}>{campaignInfo.stats?.signed ?? 0}</strong>
                  <span className="muted">Firmados</span>
                </article>
                <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
                  <strong style={{ fontSize: '1.8rem', color: '#ca8a04' }}>{campaignInfo.stats?.pending ?? 0}</strong>
                  <span className="muted">Pendientes</span>
                </article>
                <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
                  <strong style={{ fontSize: '1.8rem', color: '#dc2626' }}>{campaignInfo.stats?.expired ?? 0}</strong>
                  <span className="muted">Expirados</span>
                </article>
                <article className="advanced-doc-card" style={{ flexDirection: 'column', textAlign: 'center' }}>
                  <strong style={{ fontSize: '1.8rem' }}>{campaignInfo.stats?.completionPercent ?? 0}%</strong>
                  <span className="muted">Completado</span>
                </article>
              </div>
              {campaignInfo.stats && campaignInfo.stats.totalWorkers > 0 && (
                <div style={{ marginTop: '.75rem' }}>
                  <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${campaignInfo.stats.completionPercent}%`,
                      height: '100%',
                      background: campaignInfo.stats.completionPercent === 100 ? '#16a34a' : '#3b82f6',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <p className="muted" style={{ textAlign: 'center', marginTop: '.25rem', fontSize: '.85rem' }}>
                    {campaignInfo.stats.signed} de {campaignInfo.stats.totalWorkers} trabajadores han firmado
                    {campaignInfo.campaign.status === 'ACTIVE' ? ' · Campaña activa' : campaignInfo.campaign.status === 'COMPLETED' ? ' · ✅ Campaña completada' : ''}
                  </p>
                </div>
              )}
            </section>
          )}

          <div className="actions" style={{ justifyContent: 'center' }}>
            <Button type="button" variant="primary" disabled={isLocked || loading} onClick={handleGenerate}>
              🚀 Generar responsabilidades automáticamente
            </Button>
            {matrix?.approvalStatus === 'DRAFT' && matrix?.items && matrix.items.length > 0 && (
              <Button type="button" variant="secondary" disabled={loading} onClick={handleSubmitApproval}>
                Enviar para aprobación
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Group sections */}
      {SIDEBAR_SECTIONS.filter((s) => s.group).map((section) => (
        sidebarSection === section.id ? renderGroupSection(section.group!) : null
      ))}

      {/* Asignaciones - Admin assignment view */}
      {sidebarSection === 'asignaciones' && (
        <ResponsibilityAcceptancePanel token={token} matrix={matrix} items={matrix?.items ?? []} isLocked={isLocked} defaultTab="assign" />
      )}
      {/* Aceptaciones - User acceptance view */}
      {sidebarSection === 'aceptaciones' && (
        <ResponsibilityAcceptancePanel token={token} matrix={matrix} items={matrix?.items ?? []} isLocked={isLocked} defaultTab="my-acceptances" />
      )}

      {/* Aprobaciones */}
      {sidebarSection === 'aprobaciones' && (
        <div className="advanced-management">
          <section className="advanced-management__hero">
            <div>
              <h3>✍ Aprobaciones</h3>
              <p className="muted">Flujo de aprobación de la matriz de responsabilidades</p>
            </div>
            <span className={approval.className}>{approval.label}</span>
          </section>

          <section className="advanced-management__section">
            <h3>Estado actual</h3>
            <div className="advanced-doc-grid">
              <article className="advanced-doc-card">
                <strong>Estado</strong>
                <span>{approval.label}</span>
              </article>
              <article className="advanced-doc-card">
                <strong>Aprobado por</strong>
                <span>{matrix?.approvedByEmail ?? '—'}</span>
              </article>
              <article className="advanced-doc-card">
                <strong>Fecha aprobación</strong>
                <span>{matrix?.approvedAt ? new Date(matrix.approvedAt).toLocaleString() : '—'}</span>
              </article>
            </div>

            {matrix?.approvalStatus === 'DRAFT' && !isLocked && (
              <div className="actions">
                <Button type="button" variant="primary" disabled={!matrix?.items?.length} onClick={handleSubmitApproval}>
                  Enviar para aprobación gerencial
                </Button>
              </div>
            )}

            {matrix?.approvalStatus === 'PENDING_APPROVAL' && !isLocked && (
              <div className="form-grid" style={{ maxWidth: '400px' }}>
                <label className="field">
                  <span className="label">Correo del aprobador (Gerente/Admin)</span>
                  <input className="input" type="email" value={approveEmail} onChange={(e) => setApproveEmail(e.target.value)} placeholder="gerente@empresa.com" />
                </label>
                <div className="actions">
                  <Button type="button" variant="primary" disabled={!approveEmail} onClick={() => setShowApproveModal(true)}>
                    Aprobar matriz
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleArchive}>
                    Archivar
                  </Button>
                </div>
              </div>
            )}

            {matrix?.approvalStatus === 'APPROVED' && (
              <div className="advanced-management__success">
                Matriz aprobada y bloqueada. Crea una nueva versión para realizar cambios.
              </div>
            )}
          </section>
        </div>
      )}

      {/* Versiones */}
      {sidebarSection === 'versiones' && (
        <div className="advanced-management">
          <section className="advanced-management__hero">
            <div>
              <h3>📂 Versiones</h3>
              <p className="muted">Historial de versiones de la matriz de responsabilidades</p>
            </div>
          </section>

          <section className="advanced-management__section">
            <div className="actions">
              <Button type="button" variant="secondary" disabled={isLocked} onClick={handleCreateVersion}>
                + Nueva versión
              </Button>
            </div>
            <div className="responsive-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Versión</th>
                    <th>Estado</th>
                    <th>Creada por</th>
                    <th>Aprobada por</th>
                    <th>Fecha creación</th>
                    <th>Fecha aprobación</th>
                  </tr>
                </thead>
                <tbody>
                  {(!matrix?.versions || matrix.versions.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Sin versiones registradas</td>
                    </tr>
                  ) : (
                    matrix.versions.map((v: MatrixVersionModel, i: number) => (
                      <tr key={i}>
                        <td><strong>v{v.version}</strong></td>
                        <td>{v.status === 'APPROVED' ? <span className="badge badge--success">Aprobada</span> : <span className="badge badge--pending">Borrador</span>}</td>
                        <td>{v.createdByEmail ?? '—'}</td>
                        <td>{v.approvedByEmail ?? '—'}</td>
                        <td>{v.createdAt ? new Date(v.createdAt).toLocaleString() : '—'}</td>
                        <td>{v.approvedAt ? new Date(v.approvedAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Historial */}
      {sidebarSection === 'historial' && (
        <div className="advanced-management">
          <section className="advanced-management__hero">
            <div>
              <h3>🕓 Historial de auditoría</h3>
              <p className="muted">Trazabilidad de todos los cambios realizados en la matriz</p>
            </div>
          </section>

          <section className="advanced-management__section">
            <div className="timeline">
              {history.length === 0 ? (
                <p className="empty-state">Sin historial disponible</p>
              ) : (
                history.map((entry, i) => (
                  <article key={i} className="timeline__item">
                    <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{entry.action}</strong>
                      <small className="muted">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</small>
                    </div>
                    {entry.userEmail && <small className="muted">Usuario: {entry.userEmail}</small>}
                    {entry.field && (
                      <p style={{ fontSize: '.85rem', margin: '.25rem 0' }}>
                        Campo: {entry.field} · {entry.oldValue ?? '—'} → {entry.newValue ?? '—'}
                      </p>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} title="Editar responsabilidad" onClose={() => setShowEditModal(false)}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Título</span>
            <input className="input" value={editItem?.title ?? ''} onChange={(e) => setEditItem((prev) => prev ? { ...prev, title: e.target.value } : null)} />
          </label>
          <label className="field">
            <span className="label">Descripción</span>
            <textarea className="input" rows={3} value={editItem?.description ?? ''} onChange={(e) => setEditItem((prev) => prev ? { ...prev, description: e.target.value } : null)} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Obligatorio</span>
              <select className="input" value={editItem?.mandatory ? 'true' : 'false'} onChange={(e) => setEditItem((prev) => prev ? { ...prev, mandatory: e.target.value === 'true' } : null)}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Activo</span>
              <select className="input" value={editItem?.active ? 'true' : 'false'} onChange={(e) => setEditItem((prev) => prev ? { ...prev, active: e.target.value === 'true' } : null)}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={handleSaveEdit}>Guardar</Button>
            <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} title="Agregar responsabilidad" onClose={() => setShowAddModal(false)}>
        <div className="form-grid">
          <label className="field">
            <span className="label">Grupo</span>
            <select className="input" value={newItem.group} onChange={(e) => setNewItem({ ...newItem, group: e.target.value })}>
              {GROUP_ORDER.map((g) => <option key={g} value={g}>{GROUP_META[g]?.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">Título</span>
            <input className="input" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} placeholder="Ej: Supervisar cumplimiento normativo" />
          </label>
          <label className="field">
            <span className="label">Descripción</span>
            <textarea className="input" rows={3} value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="Descripción detallada de la responsabilidad" />
          </label>
          <label className="field">
            <span className="label">Obligatorio</span>
            <select className="input" value={newItem.mandatory ? 'true' : 'false'} onChange={(e) => setNewItem({ ...newItem, mandatory: e.target.value === 'true' })}>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </label>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" disabled={!newItem.title} onClick={handleAdd}>Agregar</Button>
            <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Approve Confirmation Modal */}
      <Modal isOpen={showApproveModal} title="Confirmar aprobación" onClose={() => setShowApproveModal(false)}>
        <div className="form-grid">
          <p>¿Estás seguro de aprobar la matriz de responsabilidades?</p>
          <p className="muted">Una vez aprobada, el contenido quedará bloqueado. Solo el ADMIN/MANAGER puede realizar esta acción.</p>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={handleApprove}>Confirmar aprobación</Button>
            <Button type="button" variant="secondary" onClick={() => setShowApproveModal(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ResponsibilityMatrixModule;
