import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCompanyContext } from '../context/CompanyContext';
import {
  MaintenanceItemType,
  MaintenanceModel,
  MaintenanceStatusModel,
  MaintenanceType,
  createMaintenance,
  deleteMaintenance,
  fetchMaintenances,
  updateMaintenanceStatus,
} from '../api';
import { AdvancedPageLayout } from '../components/advanced-layout/AdvancedPageLayout';
import { AdvancedHeader, type HeaderAction } from '../components/advanced-layout/AdvancedHeader';
import { AdvancedKpiGrid } from '../components/advanced-layout/AdvancedKpiGrid';
import { AdvancedSection } from '../components/advanced-layout/AdvancedSection';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';

interface MaintenancePageProps {
  token: string;
  role?: string;
}

const ITEM_TYPE_LABELS: Record<MaintenanceItemType, string> = {
  EQUIPMENT: 'Equipo',
  MACHINE: 'Máquina',
  TOOL: 'Herramienta',
  INSTALLATION: 'Instalación',
  INFRASTRUCTURE: 'Infraestructura',
  OTHER: 'Otro',
};

const TYPE_LABELS: Record<MaintenanceType, string> = {
  PREVENTIVE: 'Preventivo',
  CORRECTIVE: 'Correctivo',
};

function statusBadge(status: MaintenanceStatusModel, isOverdue: boolean) {
  if (isOverdue) return <span className="badge badge--danger">Vencido</span>;
  switch (status) {
    case 'PROGRAMMED': return <span className="badge badge--info">Programado</span>;
    case 'IN_PROGRESS': return <span className="badge badge--warning">En proceso</span>;
    case 'COMPLETED': return <span className="badge badge--success">Completado</span>;
    case 'CANCELLED': return <span className="badge">Cancelado</span>;
    default: return <span className="badge">{status}</span>;
  }
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('es-CO') : '—');

type FormState = {
  itemName: string;
  itemType: MaintenanceItemType;
  maintenanceType: MaintenanceType;
  description: string;
  plannedDate: string;
  responsible: string;
  provider: string;
  frequency: string;
  nextMaintenanceDate: string;
};

const emptyForm: FormState = {
  itemName: '',
  itemType: 'EQUIPMENT',
  maintenanceType: 'PREVENTIVE',
  description: '',
  plannedDate: '',
  responsible: '',
  provider: '',
  frequency: '',
  nextMaintenanceDate: '',
};

export function MaintenancePage({ token, role }: MaintenancePageProps) {
  const { companyId } = useCompanyContext();
  const canWrite = role === 'owner' || role === 'admin';

  const [data, setData] = useState<MaintenanceModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastSync, setLastSync] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeForm, setCompleteForm] = useState({ completedDate: '', evidenceUrl: '', observations: '' });

  const loadData = useCallback(async () => {
    if (!token || !companyId) return;
    setLoading(true);
    setError('');
    try {
      const maintenances = await fetchMaintenances(token);
      setData(maintenances);
      setLastSync(new Date().toLocaleString('es-CO'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar el programa de mantenimiento.');
    } finally {
      setLoading(false);
    }
  }, [token, companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const now = Date.now();
  const isOverdue = (item: MaintenanceModel) =>
    (item.status === 'PROGRAMMED' || item.status === 'IN_PROGRESS') && new Date(item.plannedDate).getTime() < now;

  const active = useMemo(() => data.filter((item) => item.status !== 'CANCELLED'), [data]);
  const overdue = useMemo(() => active.filter(isOverdue), [active]);
  const programmed = useMemo(() => active.filter((item) => item.status === 'PROGRAMMED' && !isOverdue(item)), [active]);
  const inProgress = useMemo(() => active.filter((item) => item.status === 'IN_PROGRESS' && !isOverdue(item)), [active]);
  const completed = useMemo(() => data.filter((item) => item.status === 'COMPLETED'), [data]);
  const upcoming = useMemo(() => {
    const pending = [...programmed, ...inProgress];
    return pending.sort((a, b) => new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime()).slice(0, 8);
  }, [programmed, inProgress]);
  const history = useMemo(
    () => [...data].sort((a, b) => new Date(b.updatedAt ?? b.plannedDate).getTime() - new Date(a.updatedAt ?? a.plannedDate).getTime()).slice(0, 12),
    [data],
  );
  const compliance = active.length > 0 ? Math.round((completed.length / (completed.length + overdue.length + programmed.length + inProgress.length)) * 100) : 0;

  const headerActions: HeaderAction[] = [
    { label: '🔄 Recargar', onClick: loadData, variant: 'secondary' },
    ...(canWrite ? [{ label: '+ Registrar mantenimiento', onClick: () => { setForm(emptyForm); setFormErrors({}); setModalOpen(true); }, variant: 'primary' as const }] : []),
  ];

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.itemName.trim()) errors.itemName = 'El elemento mantenible es obligatorio.';
    if (!form.description.trim()) errors.description = 'La descripción es obligatoria.';
    if (form.maintenanceType === 'CORRECTIVE' && form.description.trim().length < 10) {
      errors.description = 'Describe la falla o problema detectado (mínimo 10 caracteres).';
    }
    if (!form.plannedDate) errors.plannedDate = 'La fecha programada es obligatoria.';
    if (!form.responsible.trim()) errors.responsible = 'El responsable es obligatorio.';
    if (form.nextMaintenanceDate && form.plannedDate && new Date(form.nextMaintenanceDate) < new Date(form.plannedDate)) {
      errors.nextMaintenanceDate = 'La próxima fecha debe ser posterior a la fecha programada.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    setActionError('');
    if (!validateForm()) return;
    setSaving(true);
    try {
      await createMaintenance(token, {
        itemName: form.itemName.trim(),
        itemType: form.itemType,
        maintenanceType: form.maintenanceType,
        description: form.description.trim(),
        plannedDate: form.plannedDate,
        responsible: form.responsible.trim(),
        provider: form.provider.trim() || undefined,
        frequency: form.frequency.trim() || undefined,
        nextMaintenanceDate: form.nextMaintenanceDate || undefined,
      });
      setModalOpen(false);
      setForm(emptyForm);
      await loadData();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'No fue posible registrar el mantenimiento.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (item: MaintenanceModel, status: MaintenanceStatusModel) => {
    setActionError('');
    try {
      if (status === 'COMPLETED') {
        setCompletingId(item._id);
        setCompleteForm({ completedDate: new Date().toISOString().slice(0, 10), evidenceUrl: item.evidenceUrl ?? '', observations: item.observations ?? '' });
        return;
      }
      await updateMaintenanceStatus(token, item._id, { status });
      await loadData();
    } catch (statusError) {
      setActionError(statusError instanceof Error ? statusError.message : 'No fue posible cambiar el estado.');
    }
  };

  const handleConfirmComplete = async () => {
    if (!completingId) return;
    setActionError('');
    if (!completeForm.completedDate) { setActionError('La fecha de ejecución es obligatoria.'); return; }
    if (!completeForm.evidenceUrl.trim()) { setActionError('La evidencia es obligatoria para completar el mantenimiento (trazabilidad documental).'); return; }
    try {
      await updateMaintenanceStatus(token, completingId, {
        status: 'COMPLETED',
        completedDate: completeForm.completedDate,
        evidenceUrl: completeForm.evidenceUrl.trim(),
        observations: completeForm.observations.trim() || undefined,
      });
      setCompletingId(null);
      await loadData();
    } catch (completeError) {
      setActionError(completeError instanceof Error ? completeError.message : 'No fue posible completar el mantenimiento.');
    }
  };

  const handleCancel = async (item: MaintenanceModel) => {
    setActionError('');
    const reason = window.prompt('Motivo de la cancelación (queda registrado en el historial):');
    if (reason === null) return;
    try {
      await updateMaintenanceStatus(token, item._id, { status: 'CANCELLED', comment: reason || undefined });
      await loadData();
    } catch (cancelError) {
      setActionError(cancelError instanceof Error ? cancelError.message : 'No fue posible cancelar el mantenimiento.');
    }
  };

  const handleDelete = async (item: MaintenanceModel) => {
    setActionError('');
    if (!window.confirm(`¿Eliminar el mantenimiento de "${item.itemName}" programado para ${formatDate(item.plannedDate)}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteMaintenance(token, item._id);
      await loadData();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'No fue posible eliminar el mantenimiento.');
    }
  };

  const renderRow = (item: MaintenanceModel, showHistoryActions = false) => (
    <tr key={item._id}>
      <td>
        <strong>{item.itemName}</strong>
        <br />
        <span className="muted" style={{ fontSize: '0.78rem' }}>{ITEM_TYPE_LABELS[item.itemType] ?? item.itemType} · {TYPE_LABELS[item.maintenanceType] ?? item.maintenanceType}</span>
      </td>
      <td style={{ maxWidth: 260 }}>{item.description}</td>
      <td>{formatDate(item.plannedDate)}</td>
      <td>{item.responsible}{item.provider ? <><br /><span className="muted" style={{ fontSize: '0.78rem' }}>Prov.: {item.provider}</span></> : null}</td>
      <td>{statusBadge(item.status, isOverdue(item))}</td>
      <td>
        {canWrite && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' ? (
          <div className="actions" style={{ gap: '.25rem', flexWrap: 'wrap' }}>
            {item.status === 'PROGRAMMED' && !isOverdue(item) && (
              <Button type="button" variant="secondary" onClick={() => handleStatus(item, 'IN_PROGRESS')}>Iniciar</Button>
            )}
            <Button type="button" variant="primary" onClick={() => handleStatus(item, 'COMPLETED')}>Completar</Button>
            <Button type="button" variant="danger" onClick={() => handleCancel(item)}>Cancelar</Button>
          </div>
        ) : canWrite && showHistoryActions && item.status === 'CANCELLED' ? (
          <Button type="button" variant="secondary" onClick={() => handleStatus(item, 'PROGRAMMED')}>Reabrir</Button>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {canWrite ? <Button type="button" variant="danger" onClick={() => handleDelete(item)}>🗑</Button> : <span className="muted">—</span>}
      </td>
    </tr>
  );

  const tableHeader = (
    <thead>
      <tr>
        <th>Elemento</th>
        <th>Descripción</th>
        <th>Fecha programada</th>
        <th>Responsable</th>
        <th>Estado</th>
        <th>Acciones</th>
        <th />
      </tr>
    </thead>
  );

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        moduleCode="SST-MT-001"
        moduleTitle="Mantenimiento"
        description="Programa de mantenimiento preventivo y correctivo de equipos, instalaciones y herramientas (PHVA 4.2.5)"
        statusBadge={<span className="badge badge--success">🟢 Activo</span>}
        actions={headerActions}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Programados', value: programmed.length, variant: programmed.length > 0 ? 'info' : 'default' },
          { label: 'En proceso', value: inProgress.length, variant: inProgress.length > 0 ? 'warning' : 'default' },
          { label: 'Completados', value: completed.length, variant: 'success' },
          { label: 'Vencidos', value: overdue.length, variant: overdue.length > 0 ? 'danger' : 'default' },
          { label: 'Cumplimiento del programa', value: `${compliance}%`, variant: compliance >= 80 ? 'success' : compliance >= 50 ? 'warning' : 'default' },
        ]}
      />

      {error && !loading ? <pre className="error">{error}</pre> : null}
      {loading ? <p className="muted">Cargando programa de mantenimiento...</p> : null}
      {actionError ? <pre className="error">{actionError}</pre> : null}

      <AdvancedSection
        title="Próximos mantenimientos"
        description="Actividades programadas y en proceso, ordenadas por fecha."
        accent={overdue.length > 0 ? 'warning' : 'default'}
      >
        {upcoming.length === 0 ? (
          <p className="empty-state">No hay mantenimientos programados. {canWrite ? 'Usa «+ Registrar mantenimiento» para programar el primero.' : ''}</p>
        ) : (
          <div className="responsive-table">
            <table className="table">{tableHeader}<tbody>{upcoming.map((item) => renderRow(item))}</tbody></table>
          </div>
        )}
      </AdvancedSection>

      <AdvancedSection
        title="Mantenimientos vencidos"
        description="Programados o en proceso con fecha vencida sin completar. Requieren acción inmediata."
        accent={overdue.length > 0 ? 'danger' : 'success'}
      >
        {overdue.length === 0 ? (
          <p className="empty-state">Sin mantenimientos vencidos. El programa está al día. ✅</p>
        ) : (
          <div className="responsive-table">
            <table className="table">{tableHeader}<tbody>{overdue.map((item) => renderRow(item))}</tbody></table>
          </div>
        )}
      </AdvancedSection>

      <AdvancedSection
        title="Historial de mantenimientos"
        description="Últimos movimientos del programa (el detalle de cambios de estado queda registrado con usuario y fecha)."
      >
        {history.length === 0 ? (
          <p className="empty-state">Aún no hay movimientos registrados.</p>
        ) : (
          <div className="responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Elemento</th>
                  <th>Tipo</th>
                  <th>Programado</th>
                  <th>Ejecutado</th>
                  <th>Estado</th>
                  <th>Evidencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item._id}>
                    <td><strong>{item.itemName}</strong><br /><span className="muted" style={{ fontSize: '0.78rem' }}>{ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}</span></td>
                    <td>{TYPE_LABELS[item.maintenanceType] ?? item.maintenanceType}</td>
                    <td>{formatDate(item.plannedDate)}</td>
                    <td>{formatDate(item.completedDate)}</td>
                    <td>{statusBadge(item.status, isOverdue(item))}</td>
                    <td>{item.evidenceUrl ? <a href={item.evidenceUrl} target="_blank" rel="noreferrer">Ver soporte</a> : <span className="muted">—</span>}</td>
                    <td>{canWrite && item.status === 'CANCELLED' ? <Button type="button" variant="secondary" onClick={() => handleStatus(item, 'PROGRAMMED')}>Reabrir</Button> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdvancedSection>

      <p className="muted" style={{ fontSize: '0.82rem', textAlign: 'right' }}>
        Última actualización: {lastSync || '—'}
      </p>

      <Modal isOpen={modalOpen} title="Registrar mantenimiento" onClose={() => setModalOpen(false)}>
        <div className="grid" style={{ gap: '.75rem' }}>
          <div>
            <label className="label" htmlFor="mt-item-name">Elemento mantenible *</label>
            <Input id="mt-item-name" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="Ej: Compresor del taller" />
            {formErrors.itemName && <p className="error">{formErrors.itemName}</p>}
          </div>
          <div className="grid grid-2" style={{ gap: '.75rem' }}>
            <div>
              <label className="label" htmlFor="mt-item-type">Tipo de elemento *</label>
              <Select id="mt-item-type" value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value as MaintenanceItemType })}>
                {(Object.keys(ITEM_TYPE_LABELS) as MaintenanceItemType[]).map((type) => (
                  <option key={type} value={type}>{ITEM_TYPE_LABELS[type]}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor="mt-type">Tipo de mantenimiento *</label>
              <Select id="mt-type" value={form.maintenanceType} onChange={(e) => setForm({ ...form, maintenanceType: e.target.value as MaintenanceType })}>
                {(Object.keys(TYPE_LABELS) as MaintenanceType[]).map((type) => (
                  <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mt-description">{form.maintenanceType === 'CORRECTIVE' ? 'Descripción de la falla o problema *' : 'Descripción del alcance *'}</label>
            <textarea id="mt-description" className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={form.maintenanceType === 'CORRECTIVE' ? 'Describe la falla detectada y su impacto…' : 'Actividades a realizar…'} />
            {formErrors.description && <p className="error">{formErrors.description}</p>}
          </div>
          <div className="grid grid-2" style={{ gap: '.75rem' }}>
            <div>
              <label className="label" htmlFor="mt-responsible">Responsable *</label>
              <Input id="mt-responsible" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} placeholder="Ej: Técnico de mantenimiento" />
              {formErrors.responsible && <p className="error">{formErrors.responsible}</p>}
            </div>
            <div>
              <label className="label" htmlFor="mt-provider">Proveedor (opcional)</label>
              <Input id="mt-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Ej: Tecnoservicios Ltda." />
            </div>
          </div>
          <div className="grid grid-3" style={{ gap: '.75rem' }}>
            <div>
              <label className="label" htmlFor="mt-planned">Fecha programada *</label>
              <Input id="mt-planned" type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} />
              {formErrors.plannedDate && <p className="error">{formErrors.plannedDate}</p>}
            </div>
            <div>
              <label className="label" htmlFor="mt-frequency">Frecuencia (opcional)</label>
              <Input id="mt-frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="Ej: Mensual" />
            </div>
            <div>
              <label className="label" htmlFor="mt-next">Próxima fecha (opcional)</label>
              <Input id="mt-next" type="date" value={form.nextMaintenanceDate} onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })} />
              {formErrors.nextMaintenanceDate && <p className="error">{formErrors.nextMaintenanceDate}</p>}
            </div>
          </div>
          <div className="actions" style={{ justifyContent: 'flex-end', gap: '.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Registrar mantenimiento'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={completingId !== null} title="Completar mantenimiento" onClose={() => setCompletingId(null)}>
        <div className="grid" style={{ gap: '.75rem' }}>
          <p className="muted" style={{ margin: 0 }}>Registra la ejecución real. La evidencia es obligatoria para mantener la trazabilidad documental del programa (4.2.5).</p>
          <div>
            <label className="label" htmlFor="mt-complete-date">Fecha de ejecución *</label>
            <Input id="mt-complete-date" type="date" value={completeForm.completedDate} onChange={(e) => setCompleteForm({ ...completeForm, completedDate: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="mt-complete-evidence">Evidencia / soporte * (URL o referencia)</label>
            <Input id="mt-complete-evidence" value={completeForm.evidenceUrl} onChange={(e) => setCompleteForm({ ...completeForm, evidenceUrl: e.target.value })} placeholder="Ej: https://…/orden-mantenimiento.pdf" />
          </div>
          <div>
            <label className="label" htmlFor="mt-complete-obs">Observaciones</label>
            <textarea id="mt-complete-obs" className="input" rows={3} value={completeForm.observations} onChange={(e) => setCompleteForm({ ...completeForm, observations: e.target.value })} placeholder="Hallazgos, repuestos, pendientes…" />
          </div>
          {actionError && !modalOpen ? <p className="error">{actionError}</p> : null}
          <div className="actions" style={{ justifyContent: 'flex-end', gap: '.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setCompletingId(null)}>Cancelar</Button>
            <Button type="button" onClick={handleConfirmComplete}>Confirmar completado</Button>
          </div>
        </div>
      </Modal>
    </AdvancedPageLayout>
  );
}
