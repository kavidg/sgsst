import { useCallback, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import type { UserRole } from '../../api';
import type {
  ControlMeasureModel,
  ControlVerificationModel,
  ControlVerificationResult,
  CreateControlVerificationPayload,
  FollowUpStatus,
  RiskModel,
  UpdateControlVerificationFollowUpPayload,
} from '../../api';
import {
  createControlVerification,
  fetchControlVerifications,
  updateControlVerificationFollowUp,
} from '../../api';

/** Etiquetas en español; al backend siempre viaja el enum original. */
export const CONTROL_VERIFICATION_RESULT_LABELS: Record<ControlVerificationResult, string> = {
  COMPLIANT: 'Conforme',
  PARTIAL: 'Parcial',
  NON_COMPLIANT: 'No conforme',
};

const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  OPEN: 'Abierto',
  CLOSED: 'Cerrado',
};

/** Clase de badge por resultado (sistema existente: badge--success/warning/danger/info). */
function resultBadgeClass(result: ControlVerificationResult): string {
  switch (result) {
    case 'COMPLIANT':
      return 'badge badge--success';
    case 'PARTIAL':
      return 'badge badge--warning';
    case 'NON_COMPLIANT':
      return 'badge badge--danger';
  }
}

function followUpBadgeClass(status: FollowUpStatus): string {
  return status === 'OPEN' ? 'badge badge--warning' : 'badge badge--info';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Agrupa verificaciones por controlId conservando el orden descendente que devuelve el backend. */
function groupByControl(list: ControlVerificationModel[]): Record<string, ControlVerificationModel[]> {
  return list.reduce<Record<string, ControlVerificationModel[]>>((acc, v) => {
    (acc[v.controlId] ??= []).push(v);
    return acc;
  }, {});
}

interface ControlVerificationsPanelProps {
  risk: RiskModel;
  token: string;
  role?: UserRole;
}

type ModalMode =
  | { kind: 'create'; control: ControlMeasureModel }
  | { kind: 'followUp'; verification: ControlVerificationModel };

/**
 * Etapa 4 (PHVA 4.2.2) — Sección "Controles estructurados" de un riesgo con su
 * historial de verificaciones. El backend es la autoridad de permisos, snapshot y estado;
 * aquí solo se ocultan acciones según el rol del usuario autenticado.
 */
export default function ControlVerificationsPanel({ risk, token, role }: ControlVerificationsPanelProps) {
  const canManage = role === 'owner' || role === 'admin';
  const controls = useMemo(() => risk.controls ?? [], [risk]);

  const [openControlId, setOpenControlId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, ControlVerificationModel[]>>({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const list = await fetchControlVerifications(token, risk._id);
      setHistory(groupByControl(list));
    } catch {
      setHistoryError('No se pudieron cargar las verificaciones.');
    } finally {
      setLoadingHistory(false);
    }
  }, [risk._id, token]);

  const toggleHistory = useCallback(
    (controlId: string) => {
      if (openControlId === controlId) {
        setOpenControlId(null);
        return;
      }
      setOpenControlId(controlId);
      if (!history[controlId]) void loadHistory(); // evitar llamadas repetidas si ya está cargado
    },
    [history, loadHistory, openControlId],
  );

  if (controls.length === 0) {
    return (
      <Card title="Controles estructurados">
        <p className="muted">
          Este riesgo no tiene controles estructurados. El texto legacy de “Medidas de control” se conserva y no se
          divide automáticamente.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Controles estructurados">
      {toast && (
        <div className="toast-alert" style={{ marginBottom: '1rem' }}>
          <strong>{toast}</strong>
        </div>
      )}
      {historyError && <div className="toast-alert" style={{ marginBottom: '1rem' }}>{historyError}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Control</th>
            <th>Estado</th>
            <th>Última verificación</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {controls.map((control) => {
            const verifications = history[control.id] ?? [];
            const latest = verifications[0];
            const isOpen = openControlId === control.id;
            return (
              <tr key={control.id}>
                <td>{control.description}</td>
                <td>
                  <span className={control.isActive ? 'badge badge--success' : 'badge badge--muted'}>
                    {control.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  {latest ? (
                    <span>
                      <span className={resultBadgeClass(latest.result)}>
                        {CONTROL_VERIFICATION_RESULT_LABELS[latest.result]}
                      </span>{' '}
                      {formatDate(latest.verificationDate)} · {latest.verifiedBy}
                      {latest.requiresFollowUp && (
                        <>
                          {' '}
                          <span className={followUpBadgeClass(latest.followUpStatus)}>
                            Seguimiento {FOLLOW_UP_STATUS_LABELS[latest.followUpStatus].toLowerCase()}
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="muted">Sin verificaciones</span>
                  )}
                </td>
                <td>
                  <div className="actions">
                    <Button type="button" variant="secondary" onClick={() => toggleHistory(control.id)}>
                      {isOpen ? 'Ocultar historial' : 'Ver verificaciones'}
                    </Button>
                    {canManage && control.isActive && (
                      <Button type="button" onClick={() => setModal({ kind: 'create', control })}>
                        Registrar verificación
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openControlId && (
        <ControlHistory
          control={controls.find((c) => c.id === openControlId)}
          verifications={history[openControlId] ?? []}
          loading={loadingHistory}
          canManage={canManage}
          onFollowUp={(verification) => setModal({ kind: 'followUp', verification })}
        />
      )}

      {modal?.kind === 'create' && (
        <CreateVerificationModal
          riskId={risk._id}
          control={modal.control}
          token={token}
          onClose={() => setModal(null)}
          onCreated={(created) => {
            setModal(null);
            setToast('Verificación registrada.');
            setHistory((prev) => ({
              ...prev,
              [created.controlId]: [created, ...(prev[created.controlId] ?? [])],
            }));
            void loadHistory(); // refrescar con datos del backend
          }}
          onError={(message) => setToast(message)}
        />
      )}

      {modal?.kind === 'followUp' && (
        <FollowUpModal
          riskId={risk._id}
          verification={modal.verification}
          token={token}
          onClose={() => setModal(null)}
          onUpdated={(updated) => {
            setModal(null);
            setToast('Seguimiento actualizado.');
            setHistory((prev) => ({
              ...prev,
              [updated.controlId]: (prev[updated.controlId] ?? []).map((v) => (v._id === updated._id ? updated : v)),
            }));
          }}
          onError={(message) => setToast(message)}
        />
      )}
    </Card>
  );
}

interface ControlHistoryProps {
  control?: ControlMeasureModel;
  verifications: ControlVerificationModel[];
  loading: boolean;
  canManage: boolean;
  onFollowUp: (verification: ControlVerificationModel) => void;
}

function ControlHistory({ control, verifications, loading, canManage, onFollowUp }: ControlHistoryProps) {
  if (!control) return null;
  return (
    <section style={{ marginTop: '1rem' }}>
      <h4>Historial — {control.description}</h4>
      {loading ? (
        <p className="muted">Cargando historial…</p>
      ) : verifications.length === 0 ? (
        <p className="muted">Sin verificaciones registradas para este control.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Resultado</th>
              <th>Verificado por</th>
              <th>Observaciones</th>
              <th>Seguimiento</th>
              {canManage && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {verifications.map((v) => (
              <tr key={v._id}>
                <td>{formatDate(v.verificationDate)}</td>
                <td>
                  <span className={resultBadgeClass(v.result)}>{CONTROL_VERIFICATION_RESULT_LABELS[v.result]}</span>
                </td>
                <td>{v.verifiedBy}</td>
                <td>{v.observations || <span className="muted">—</span>}</td>
                <td>
                  {v.requiresFollowUp ? (
                    <span>
                      <span className={followUpBadgeClass(v.followUpStatus)}>
                        {FOLLOW_UP_STATUS_LABELS[v.followUpStatus]}
                      </span>
                      {v.followUpDueDate && <div className="muted">Límite: {formatDate(v.followUpDueDate)}</div>}
                    </span>
                  ) : (
                    <span className="muted">No requiere</span>
                  )}
                </td>
                {canManage && (
                  <td>
                    {v.requiresFollowUp && v.followUpStatus === 'OPEN' && (
                      <Button type="button" variant="secondary" onClick={() => onFollowUp(v)}>
                        Actualizar seguimiento
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">Registro histórico: no editable.</p>
    </section>
  );
}

interface CreateVerificationModalProps {
  riskId: string;
  control: ControlMeasureModel;
  token: string;
  onClose: () => void;
  onCreated: (verification: ControlVerificationModel) => void;
  onError: (message: string) => void;
}

function CreateVerificationModal({ riskId, control, token, onClose, onCreated, onError }: CreateVerificationModalProps) {
  const [verificationDate, setVerificationDate] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [result, setResult] = useState<ControlVerificationResult>('COMPLIANT');
  const [observations, setObservations] = useState('');
  const [requiresFollowUp, setRequiresFollowUp] = useState(false);
  const [followUpDueDate, setFollowUpDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const canSubmit =
    verificationDate !== '' && verifiedBy.trim() !== '' && (!requiresFollowUp || followUpDueDate !== '');

  const handleSubmit = async () => {
    setFieldError(null);
    if (!canSubmit) {
      setFieldError('Completa los campos obligatorios.');
      return;
    }
    setSaving(true);
    const payload: CreateControlVerificationPayload = {
      controlId: control.id,
      verificationDate,
      verifiedBy: verifiedBy.trim(),
      result,
      ...(observations.trim() ? { observations: observations.trim() } : {}),
      requiresFollowUp,
      ...(requiresFollowUp ? { followUpDueDate } : {}),
    };
    try {
      const created = await createControlVerification(token, riskId, payload);
      onCreated(created);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo registrar la verificación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title="Registrar verificación" onClose={onClose}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Control</span>
          <input className="input" type="text" value={control.description} readOnly disabled />
        </label>
        <label className="field">
          <span className="label">Fecha de verificación *</span>
          <input
            className="input"
            type="date"
            value={verificationDate}
            onChange={(e) => setVerificationDate(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="label">Verificado por *</span>
          <input
            className="input"
            type="text"
            value={verifiedBy}
            onChange={(e) => setVerifiedBy(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="label">Resultado</span>
          <select
            className="input"
            value={result}
            onChange={(e) => setResult(e.target.value as ControlVerificationResult)}
          >
            {(Object.keys(CONTROL_VERIFICATION_RESULT_LABELS) as ControlVerificationResult[]).map((value) => (
              <option key={value} value={value}>
                {CONTROL_VERIFICATION_RESULT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Observaciones</span>
          <textarea className="input" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} />
        </label>
        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={requiresFollowUp} onChange={(e) => setRequiresFollowUp(e.target.checked)} />
          <span>Requiere seguimiento</span>
        </label>
        {requiresFollowUp && (
          <label className="field">
            <span className="label">Fecha límite de seguimiento *</span>
            <input
              className="input"
              type="date"
              value={followUpDueDate}
              onChange={(e) => setFollowUpDueDate(e.target.value)}
              required
            />
          </label>
        )}
      </div>
      {fieldError && <div className="toast-alert" style={{ marginTop: '.75rem' }}>{fieldError}</div>}
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !canSubmit}>
          {saving ? 'Guardando…' : 'Guardar verificación'}
        </Button>
      </div>
    </Modal>
  );
}

interface FollowUpModalProps {
  riskId: string;
  verification: ControlVerificationModel;
  token: string;
  onClose: () => void;
  onUpdated: (verification: ControlVerificationModel) => void;
  onError: (message: string) => void;
}

function FollowUpModal({ riskId, verification, token, onClose, onUpdated, onError }: FollowUpModalProps) {
  const [requiresFollowUp, setRequiresFollowUp] = useState(verification.requiresFollowUp);
  const [followUpDueDate, setFollowUpDueDate] = useState(verification.followUpDueDate ?? '');
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>(verification.followUpStatus);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const canSubmit = !requiresFollowUp || followUpDueDate !== '';

  const handleSubmit = async () => {
    setFieldError(null);
    if (!canSubmit) {
      setFieldError('Si requiere seguimiento, indica la fecha límite.');
      return;
    }
    setSaving(true);
    const payload: UpdateControlVerificationFollowUpPayload = {
      requiresFollowUp,
      ...(requiresFollowUp ? { followUpDueDate } : {}),
      followUpStatus: requiresFollowUp ? followUpStatus : 'CLOSED',
    };
    try {
      const updated = await updateControlVerificationFollowUp(token, riskId, verification._id, payload);
      onUpdated(updated);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo actualizar el seguimiento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title="Actualizar seguimiento" onClose={onClose}>
      <p className="muted">
        {verification.controlDescriptionSnapshot} · {formatDate(verification.verificationDate)} ·{' '}
        {CONTROL_VERIFICATION_RESULT_LABELS[verification.result]}
      </p>
      <div className="form-grid">
        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={requiresFollowUp}
            onChange={(e) => setRequiresFollowUp(e.target.checked)}
          />
          <span>Requiere seguimiento</span>
        </label>
        {requiresFollowUp && (
          <label className="field">
            <span className="label">Fecha límite de seguimiento *</span>
            <input
              className="input"
              type="date"
              value={followUpDueDate}
              onChange={(e) => setFollowUpDueDate(e.target.value)}
              required
            />
          </label>
        )}
        {requiresFollowUp && (
          <label className="field">
            <span className="label">Estado del seguimiento</span>
            <select
              className="input"
              value={followUpStatus}
              onChange={(e) => setFollowUpStatus(e.target.value as FollowUpStatus)}
            >
              {(Object.keys(FOLLOW_UP_STATUS_LABELS) as FollowUpStatus[]).map((value) => (
                <option key={value} value={value}>
                  {FOLLOW_UP_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {fieldError && <div className="toast-alert" style={{ marginTop: '.75rem' }}>{fieldError}</div>}
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !canSubmit}>
          {saving ? 'Guardando…' : 'Guardar seguimiento'}
        </Button>
      </div>
    </Modal>
  );
}
