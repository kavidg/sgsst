import { useCallback, useEffect, useState } from 'react';
import {
  fetchEmergenciesAdvanced,
  updateEmergenciesAdvanced,
  submitEmergenciesAdvanced,
  approveEmergenciesAdvanced,
  rejectEmergenciesAdvanced,
} from '../api';
import { useCompanyContext } from '../context/CompanyContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  type HeaderAction,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
} from '../components/advanced-layout';

// ============================================================
// TYPES
// ============================================================

type SstEmergenciesModel = {
  _id: string; companyId: string; itemCode: string; year: number;
  complianceStatus: string; complianceReason: string;
  plan: { planName: string; version: string; effectiveDate?: string; expirationDate?: string; approvedBy: string; approvedAt?: string; documentUrl: string };
  brigades: Array<{ brigadeId: string; name: string; type: string; leader: string; members: string[]; meetingFrequency: string; lastMeetingDate?: string }>;
  meetingPoints: Array<{ pointId: string; name: string; location: string; capacity: number; active: boolean }>;
  evacuationRoutes: Array<{ routeId: string; name: string; description: string; floor: string; estimatedTimeMinutes: number; active: boolean }>;
  equipment: Array<{ equipmentId: string; name: string; type: string; location: string; quantity: number; lastInspectionDate?: string; nextInspectionDate?: string; status: string }>;
  drills: Array<{ drillId: string; name: string; type: string; date: string; participants: number; expectedParticipants: number; durationMinutes: number; results: string; findings: string; status: string }>;
  history: Array<{ action: string; userId: string; userName: string; timestamp: string; details: string }>;
};

// ============================================================
// SIDEBAR TABS
// ============================================================

const SIDEBAR_ITEMS: SidebarTabItem[] = [
  { id: 'resumen', label: '📋 Resumen' },
  { id: 'plan', label: '📄 Plan de Emergencias' },
  { id: 'brigadas', label: '🚒 Brigadas' },
  { id: 'puntos', label: '📍 Puntos de Encuentro' },
  { id: 'rutas', label: '🚶 Rutas de Evacuación' },
  { id: 'equipos', label: '🧯 Equipos' },
  { id: 'simulacros', label: '🚨 Simulacros' },
  { id: 'historial', label: '🕓 Historial' },
  { id: 'aprobacion', label: '✍ Aprobación' },
];

// ============================================================
// HELPERS
// ============================================================

const complianceBadge = (status: string) => {
  switch (status) {
    case 'COMPLIES': return <span className="badge badge--success">✅ Cumple</span>;
    case 'NON_COMPLIANT': return <span className="badge badge--danger">❌ No cumple</span>;
    default: return <span className="badge badge--warning">⏳ Pendiente</span>;
  }
};

const drillStatusBadge = (status: string) => {
  switch (status) {
    case 'Ejecutado': case 'Completado': return <span className="badge badge--success">Ejecutado</span>;
    case 'Planificado': case 'Programado': return <span className="badge badge--info">Planificado</span>;
    case 'Cancelado': return <span className="badge badge--danger">Cancelado</span>;
    default: return <span className="badge">{status}</span>;
  }
};

const equipmentStatusBadge = (status: string) => {
  switch (status) {
    case 'OPERATIVO': return <span className="badge badge--success">Operativo</span>;
    case 'MANTENIMIENTO': return <span className="badge badge--warning">Mantenimiento</span>;
    case 'VENCIDO': return <span className="badge badge--danger">Vencido</span>;
    default: return <span className="badge">{status}</span>;
  }
};

// ============================================================
// PAGE COMPONENT
// ============================================================

interface EmergenciesPageProps {
  token: string;
  role?: string;
}

export function EmergenciesPage({ token, role }: EmergenciesPageProps) {
  const { companyId } = useCompanyContext();
  const [data, setData] = useState<SstEmergenciesModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('resumen');
  const [lastSync, setLastSync] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchEmergenciesAdvanced(token);
      setData(result as unknown as SstEmergenciesModel);
      setLastSync(new Date().toLocaleString('es-CO'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos de emergencias');
    } finally {
      setLoading(false);
    }
  }, [token, companyId]);

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

  const handleSave = async () => {
    if (!data) return;
    await handleAction(() => updateEmergenciesAdvanced(token, data as unknown as Record<string, unknown>));
  };

  const handleSubmit = () => handleAction(() => submitEmergenciesAdvanced(token));
  const handleApprove = () => handleAction(() => approveEmergenciesAdvanced(token));
  const handleReject = () => {
    const reason = window.prompt('Motivo del rechazo:');
    if (reason) handleAction(() => rejectEmergenciesAdvanced(token, reason));
  };

  if (loading && !data) {
    return (
      <AdvancedPageLayout>
        <div style={{ padding: '2rem', textAlign: 'center' }}><p>Cargando información de emergencias...</p></div>
      </AdvancedPageLayout>
    );
  }

  if (error && !data) {
    return (
      <AdvancedPageLayout>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#e53e3e' }}>
          <p>{error}</p>
          <Button onClick={() => void loadData()}>Reintentar</Button>
        </div>
      </AdvancedPageLayout>
    );
  }

  const plan = data?.plan ?? { planName: '', version: '', approvedBy: '', documentUrl: '' };
  const brigades = data?.brigades ?? [];
  const meetingPoints = data?.meetingPoints ?? [];
  const routes = data?.evacuationRoutes ?? [];
  const equipment = data?.equipment ?? [];
  const drills = data?.drills ?? [];
  const history = data?.history ?? [];
  const executedDrills = drills.filter(d => d.status === 'Ejecutado' || d.status === 'Completado');
  const expiredEquipment = equipment.filter(e => e.nextInspectionDate && new Date(e.nextInspectionDate).getTime() < Date.now());
  const totalBrigadistas = brigades.reduce((sum, b) => sum + (b.members?.length ?? 0), 0);
  const operationalEquipment = equipment.filter(e => e.status === 'OPERATIVO');

  const actions: HeaderAction[] = [
    { label: '📄 Exportar PDF', onClick: () => {}, variant: 'secondary' },
  ];
  if (role === 'owner' || role === 'admin') {
    actions.push({ label: '💾 Guardar', onClick: handleSave, variant: 'primary' });
  }

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/do"
        backLabel="← Volver a Hacer"
        moduleCode="1.1.10"
        moduleTitle="Gestión de Emergencias"
        description="Plan de emergencias y evacuación — Estándar 1.1.10"
        statusBadge={complianceBadge(data?.complianceStatus ?? 'PENDING')}
        actions={actions}
        lastSaved={lastSync ? `Última actualización: ${lastSync}` : undefined}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Brigadas', value: brigades.length, variant: 'info' },
          { label: 'Brigadistas', value: totalBrigadistas, variant: 'info' },
          { label: 'Equipos operativos', value: `${operationalEquipment.length}/${equipment.length}`, variant: operationalEquipment.length === equipment.length ? 'success' : 'warning' },
          { label: 'Simulacros ejecutados', value: executedDrills.length, variant: 'success' },
          { label: 'Equipos vencidos', value: expiredEquipment.length, variant: expiredEquipment.length > 0 ? 'danger' : 'info' },
          { label: 'Rutas configuradas', value: routes.length, variant: 'info' },
        ]}
        columns={3}
      />

      {error && (
        <Card style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: '#fff5f5', border: '1px solid #fc8181', color: '#c53030' }}>{error}</Card>
      )}

      <div className="flex gap-6" style={{ marginTop: '1.5rem' }}>
        <AdvancedTabsSidebar items={SIDEBAR_ITEMS} activeId={activeTab} onSelect={setActiveTab} />
        <AdvancedTabsContent>
          {/* RESUMEN */}
          {activeTab === 'resumen' && (
            <AdvancedSection title="Resumen de Emergencias" description="Estado general del plan de emergencias">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Plan de Emergencias</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Nombre:</strong> {plan.planName || 'No configurado'}</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Versión:</strong> {plan.version || '—'}</p>
                  {plan.approvedBy && <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Aprobado por:</strong> {plan.approvedBy}</p>}
                </Card>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Cobertura</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Brigadas:</strong> {brigades.length} ({totalBrigadistas} brigadistas)</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Puntos de encuentro:</strong> {meetingPoints.length}</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Rutas de evacuación:</strong> {routes.length}</p>
                </Card>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Estado</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                    <strong>Cumplimiento:</strong> {complianceBadge(data?.complianceStatus ?? 'PENDING')}
                  </p>
                  {data?.complianceReason && <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#718096' }}>{data.complianceReason}</p>}
                </Card>
              </div>
            </AdvancedSection>
          )}

          {/* PLAN */}
          {activeTab === 'plan' && (
            <AdvancedSection title="Plan de Emergencias" description="Configuración del plan de emergencias">
              <Card style={{ padding: '1rem' }}>
                <p><strong>Nombre:</strong> {plan.planName || 'No configurado'}</p>
                <p><strong>Versión:</strong> {plan.version || '—'}</p>
                {plan.effectiveDate && <p><strong>Fecha de vigencia:</strong> {new Date(plan.effectiveDate).toLocaleDateString('es-CO')}</p>}
                {plan.expirationDate && <p><strong>Fecha de vencimiento:</strong> {new Date(plan.expirationDate).toLocaleDateString('es-CO')}</p>}
                {plan.approvedBy && <p><strong>Aprobado por:</strong> {plan.approvedBy}</p>}
                {plan.approvedAt && <p><strong>Fecha de aprobación:</strong> {new Date(plan.approvedAt).toLocaleDateString('es-CO')}</p>}
              </Card>
            </AdvancedSection>
          )}

          {/* BRIGADAS */}
          {activeTab === 'brigadas' && (
            <AdvancedSection title="Brigadas de Emergencias" description="Brigadas y miembros asignados">
              {brigades.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay brigadas configuradas.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                  {brigades.map(b => (
                    <Card key={b.brigadeId} style={{ padding: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem' }}>{b.name}</h4>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Tipo:</strong> {b.type}</p>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Líder:</strong> {b.leader || '—'}</p>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Miembros:</strong> {b.members?.length ?? 0}</p>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Frecuencia reuniones:</strong> {b.meetingFrequency}</p>
                      {b.lastMeetingDate && <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Última reunión:</strong> {new Date(b.lastMeetingDate).toLocaleDateString('es-CO')}</p>}
                    </Card>
                  ))}
                </div>
              )}
            </AdvancedSection>
          )}

          {/* PUNTOS DE ENCUENTRO */}
          {activeTab === 'puntos' && (
            <AdvancedSection title="Puntos de Encuentro" description="Puntos de reunión designados">
              {meetingPoints.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay puntos de encuentro configurados.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ubicación</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Capacidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meetingPoints.map(p => (
                        <tr key={p.pointId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{p.name}</td>
                          <td style={{ padding: '0.75rem' }}>{p.location || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{p.capacity}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span className={`badge ${p.active ? 'badge--success' : 'badge--warning'}`}>
                              {p.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* RUTAS */}
          {activeTab === 'rutas' && (
            <AdvancedSection title="Rutas de Evacuación" description="Rutas y tiempos estimados de evacuación">
              {routes.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay rutas de evacuación configuradas.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Descripción</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Piso</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Tiempo estimado</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map(r => (
                        <tr key={r.routeId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{r.name}</td>
                          <td style={{ padding: '0.75rem' }}>{r.description || '—'}</td>
                          <td style={{ padding: '0.75rem' }}>{r.floor || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.estimatedTimeMinutes} min</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span className={`badge ${r.active ? 'badge--success' : 'badge--warning'}`}>
                              {r.active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* EQUIPOS */}
          {activeTab === 'equipos' && (
            <AdvancedSection title="Equipos de Emergencia" description="Extintores, botiquines y demás equipos">
              {equipment.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay equipos registrados.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ubicación</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Cantidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Próx. inspección</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipment.map(e => {
                        const isExpired = e.nextInspectionDate && new Date(e.nextInspectionDate).getTime() < Date.now();
                        return (
                          <tr key={e.equipmentId} style={{ borderBottom: '1px solid #e2e8f0', background: isExpired ? '#fff5f5' : undefined }}>
                            <td style={{ padding: '0.75rem' }}>{e.name}</td>
                            <td style={{ padding: '0.75rem' }}>{e.type}</td>
                            <td style={{ padding: '0.75rem' }}>{e.location || '—'}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>{e.quantity}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              {e.nextInspectionDate ? new Date(e.nextInspectionDate).toLocaleDateString('es-CO') : '—'}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>{equipmentStatusBadge(e.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* SIMULACROS */}
          {activeTab === 'simulacros' && (
            <AdvancedSection title="Simulacros de Evacuación" description="Historial de simulacros realizados">
              {drills.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay simulacros registrados.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Participantes</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Duración</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drills.map(d => (
                        <tr key={d.drillId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{d.name}</td>
                          <td style={{ padding: '0.75rem' }}>{d.type}</td>
                          <td style={{ padding: '0.75rem' }}>{new Date(d.date).toLocaleDateString('es-CO')}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{d.participants}/{d.expectedParticipants}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{d.durationMinutes} min</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{drillStatusBadge(d.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* HISTORIAL */}
          {activeTab === 'historial' && (
            <AdvancedSection title="Historial de Cambios" description="Registro de acciones en el módulo de emergencias">
              {history.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay historial registrado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[...history].reverse().map((entry, i) => (
                    <Card key={i} style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{entry.action}</strong>
                        <span style={{ color: '#718096', marginLeft: '0.5rem' }}>por {entry.userName || entry.userId}</span>
                        {entry.details && <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#4a5568' }}>{entry.details}</p>}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{new Date(entry.timestamp).toLocaleString('es-CO')}</span>
                    </Card>
                  ))}
                </div>
              )}
            </AdvancedSection>
          )}

          {/* APROBACIÓN */}
          {activeTab === 'aprobacion' && (
            <AdvancedSection title="Aprobación del Plan de Emergencias" description="Enviar a aprobación o gestionar el estado actual">
              <Card style={{ padding: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem' }}>Estado Actual</h4>
                <p style={{ margin: '0 0 0.5rem' }}><strong>Estado:</strong> {complianceBadge(data?.complianceStatus ?? 'PENDING')}</p>
                {data?.complianceReason && <p style={{ margin: '0 0 1rem', color: '#718096' }}>{data.complianceReason}</p>}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {(role === 'owner' || role === 'admin') && (
                    <>
                      <Button onClick={() => void handleSubmit()} disabled={actionLoading}>📤 Enviar a Aprobación</Button>
                      <Button onClick={() => void handleSave()} variant="secondary" disabled={actionLoading}>💾 Guardar Cambios</Button>
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
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.75rem' }}>
        Módulo 1.1.10 — Plan de Emergencias y Evacuación | Estándar SG-SST
      </div>
    </AdvancedPageLayout>
  );
}

export default EmergenciesPage;
