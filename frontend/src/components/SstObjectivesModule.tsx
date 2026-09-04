import { useCallback, useEffect, useState } from 'react';
import {
  fetchSstObjectivesAdvanced,
  submitSstObjectivesAdvanced,
  approveSstObjectivesAdvanced,
  rejectSstObjectivesAdvanced,
} from '../api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { AdvancedSection, AdvancedProgressBar } from './advanced-layout';

// ============================================================
// TYPES
// ============================================================

type ObjectiveItem = {
  objectiveId: string; name: string; description: string; standard?: string;
  responsible: string; status: string; currentProgress: number; targetProgress: number;
  measurementMethod: string; indicator?: string;
  activities: Array<{
    activityId: string; name: string; status: string;
    tasks: Array<{ taskId: string; name: string; status: string; subtasks: Array<{ subtaskId: string; name: string; status: string }> }>;
  }>;
};

type SstObjectivesData = {
  _id: string; companyId: string; itemCode: string; year: number;
  complianceStatus: string; complianceReason: string;
  objectives: ObjectiveItem[];
  history: Array<{ action: string; userId: string; userName: string; timestamp: string; details: string }>;
};

// ============================================================
// COMPONENT
// ============================================================

interface SstObjectivesModuleProps {
  token: string;
  role?: string;
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'COMPLIES': return <span className="badge badge--success">✅ Cumple</span>;
    case 'NON_COMPLIANT': return <span className="badge badge--danger">❌ No cumple</span>;
    default: return <span className="badge badge--warning">⏳ Pendiente</span>;
  }
};

const objectiveStatusBadge = (status: string) => {
  switch (status) {
    case 'COMPLETADO': return <span className="badge badge--success">Completado</span>;
    case 'EN_PROGRESO': return <span className="badge badge--info">En progreso</span>;
    case 'RETRASADO': return <span className="badge badge--danger">Retrasado</span>;
    default: return <span className="badge badge--warning">Pendiente</span>;
  }
};

export function SstObjectivesModule({ token, role }: SstObjectivesModuleProps) {
  const [data, setData] = useState<SstObjectivesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedObjective, setExpandedObjective] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchSstObjectivesAdvanced(token);
      setData(result as unknown as SstObjectivesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar objetivos SST');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleAction = async (action: () => Promise<unknown>) => {
    setActionLoading(true);
    try {
      await action();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la acción');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = () => handleAction(() => submitSstObjectivesAdvanced(token));
  const handleApprove = () => handleAction(() => approveSstObjectivesAdvanced(token));
  const handleReject = () => {
    const reason = window.prompt('Motivo del rechazo:');
    if (reason) handleAction(() => rejectSstObjectivesAdvanced(token, reason));
  };

  if (loading && !data) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}><p>Cargando objetivos SST...</p></div>;
  }

  if (error && !data) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#e53e3e' }}><p>{error}</p></div>;
  }

  const objectives = data?.objectives ?? [];

  const avgProgress = objectives.length > 0
    ? Math.round(objectives.reduce((sum, o) => sum + (o.currentProgress / Math.max(o.targetProgress, 1)) * 100, 0) / objectives.length)
    : 0;

  return (
    <>
      <AdvancedSection title="Resumen Objetivos SST" description="Estado general de los objetivos de seguridad y salud en el trabajo (2.2.1)">
        <div style={{ marginBottom: '1rem' }}>
          <p><strong>Estado:</strong> {statusBadge(data?.complianceStatus ?? 'PENDING')}</p>
          {data?.complianceReason && <p style={{ color: '#718096', fontSize: '0.875rem' }}>{data.complianceReason}</p>}
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', color: '#4a5568' }}>Progreso general</p>
          <AdvancedProgressBar value={avgProgress} showPercentage />
        </div>
      </AdvancedSection>

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', color: '#2d3748' }}>Objetivos</h3>
        {objectives.length === 0 ? (
          <Card style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
            No hay objetivos SST configurados. El responsable SST debe definir los objetivos desde la gestión avanzada.
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {objectives.map(obj => {
              const progress = obj.targetProgress > 0 ? Math.round((obj.currentProgress / obj.targetProgress) * 100) : 0;
              const isExpanded = expandedObjective === obj.objectiveId;
              const totalTasks = obj.activities.reduce((sum, a) => sum + a.tasks.length, 0);
              const completedTasks = obj.activities.reduce((sum, a) => sum + a.tasks.filter(t => t.status === 'COMPLETADO' || t.status === 'completada').length, 0);

              return (
                <Card key={obj.objectiveId} style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedObjective(isExpanded ? null : obj.objectiveId)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong>{obj.name}</strong>
                        {objectiveStatusBadge(obj.status)}
                      </div>
                      {obj.description && <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#718096' }}>{obj.description}</p>}
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#4a5568' }}>
                        <strong>Responsable:</strong> {obj.responsible || '—'} | <strong>Tareas:</strong> {completedTasks}/{totalTasks}
                      </p>
                    </div>
                    <div style={{ minWidth: '120px', textAlign: 'right' }}>
                      <AdvancedProgressBar value={progress} showPercentage={false} />
                      <span style={{ fontSize: '0.75rem', color: '#718096' }}>{progress}%</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                      {obj.activities.map(activity => (
                        <div key={activity.activityId} style={{ marginBottom: '0.75rem', paddingLeft: '1rem' }}>
                          <p style={{ margin: '0 0 0.25rem', fontWeight: 500 }}>{activity.name}</p>
                          {activity.tasks.map(task => (
                            <div key={task.taskId} style={{ paddingLeft: '1rem', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#4a5568' }}>
                              <span>{task.name}</span>
                              {task.subtasks.length > 0 && (
                                <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.5rem' }}>
                                  {task.subtasks.map(st => (
                                    <li key={st.subtaskId}>{st.name}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* APPROVAL */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', color: '#2d3748' }}>Aprobación</h3>
        <Card style={{ padding: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem' }}><strong>Estado:</strong> {statusBadge(data?.complianceStatus ?? 'PENDING')}</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {(role === 'owner' || role === 'admin') && (
              <>
                <Button onClick={() => void handleSubmit()} disabled={actionLoading}>📤 Enviar a Aprobación</Button>
              </>
            )}
            {role === 'owner' && (
              <>
                <Button onClick={() => void handleApprove()} variant="primary" disabled={actionLoading}>✅ Aprobar</Button>
                <Button onClick={() => void handleReject()} variant="secondary" disabled={actionLoading} style={{ color: '#e53e3e' }}>❌ Rechazar</Button>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* HISTORY */}
      {data?.history && data.history.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem', color: '#2d3748' }}>Historial</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[...data.history].reverse().slice(0, 10).map((entry, i) => (
              <Card key={i} style={{ padding: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>{entry.action}</strong> por {entry.userName || entry.userId}</span>
                <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{new Date(entry.timestamp).toLocaleString('es-CO')}</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fff5f5', border: '1px solid #fc8181', borderRadius: '0.5rem', color: '#c53030' }}>
          {error}
        </div>
      )}
    </>
  );
}

export default SstObjectivesModule;
