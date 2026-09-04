import { useCallback, useEffect, useState } from 'react';

import {
  fetchEppAdvanced,
  fetchEppCoverage,
  updateEppAdvanced,
  submitEppAdvanced,
  approveEppAdvanced,
  rejectEppAdvanced,
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
  AdvancedProgressBar,
} from '../components/advanced-layout';

// ============================================================
// TYPES
// ============================================================

type SstEppModel = {
  _id: string; companyId: string; itemCode: string; year: number;
  complianceStatus: string; complianceReason: string;
  catalog: Array<{ eppId: string; name: string; category: string; standard: string; requiredFor: string; expectedLifespanMonths: number; active: boolean }>;
  assignments: Array<{ assignmentId: string; employeeId: string; employeeName: string; eppItemId: string; eppName: string; deliveryDate: string; expectedReplacementDate?: string; condition: string; quantity: number; serialNumber: string; status: string }>;
  inspections: Array<{ inspectionId: string; date: string; inspector: string; area: string; findings: string; status: string; correctiveActions: string[] }>;
  history: Array<{ action: string; userId: string; userName: string; timestamp: string; details: string }>;
};

type EppCoverageModel = {
  totalCatalog: number; totalAssignments: number; activeAssignments: number;
  coveragePercentage: number; pending: number;
};

// ============================================================
// SIDEBAR TABS
// ============================================================

const SIDEBAR_ITEMS: SidebarTabItem[] = [
  { id: 'resumen', label: '📋 Resumen' },
  { id: 'catalogo', label: '📦 Catálogo EPP' },
  { id: 'asignaciones', label: '👷 Asignaciones' },
  { id: 'inspecciones', label: '🔍 Inspecciones' },
  { id: 'historial', label: '🕓 Historial' },
  { id: 'aprobacion', label: '✍ Aprobación' },
];

// ============================================================
// STATUS HELPERS
// ============================================================

const complianceBadge = (status: string) => {
  switch (status) {
    case 'COMPLIES': return <span className="badge badge--success">✅ Cumple</span>;
    case 'NON_COMPLIANT': return <span className="badge badge--danger">❌ No cumple</span>;
    default: return <span className="badge badge--warning">⏳ Pendiente</span>;
  }
};

const assignmentStatusBadge = (status: string) => {
  switch (status) {
    case 'ACTIVE': return <span className="badge badge--success">Activo</span>;
    case 'EXPIRED': return <span className="badge badge--danger">Vencido</span>;
    case 'REPLACED': return <span className="badge badge--info">Reemplazado</span>;
    case 'RETURNED': return <span className="badge badge--warning">Devuelto</span>;
    case 'DAMAGED': return <span className="badge badge--danger">Dañado</span>;
    default: return <span className="badge">{status}</span>;
  }
};

const conditionBadge = (condition: string) => {
  switch (condition) {
    case 'GOOD': return <span className="badge badge--success">Excelente</span>;
    case 'FAIR': return <span className="badge badge--warning">Bueno</span>;
    case 'POOR': return <span className="badge badge--danger">Regular</span>;
    case 'DAMAGED': return <span className="badge badge--danger">Malo</span>;
    default: return <span className="badge">{condition}</span>;
  }
};

// ============================================================
// PAGE COMPONENT
// ============================================================

interface EppManagementPageProps {
  token: string;
  role?: string;
}

export function EppManagementPage({ token, role }: EppManagementPageProps) {
  const { companyId } = useCompanyContext();

  const [epp, setEpp] = useState<SstEppModel | null>(null);
  const [coverage, setCoverage] = useState<EppCoverageModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('resumen');
  const [lastSync, setLastSync] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [eppData, coverageData] = await Promise.all([
        fetchEppAdvanced(token),
        fetchEppCoverage(token),
      ]);
      setEpp(eppData as unknown as SstEppModel);
      setCoverage(coverageData as unknown as EppCoverageModel);
      setLastSync(new Date().toLocaleString('es-CO'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos de EPP');
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
    if (!epp) return;
    await handleAction(() => updateEppAdvanced(token, epp as unknown as Record<string, unknown>));
  };

  const handleSubmit = () => handleAction(() => submitEppAdvanced(token));
  const handleApprove = () => handleAction(() => approveEppAdvanced(token));
  const handleReject = () => {
    const reason = window.prompt('Motivo del rechazo:');
    if (reason) handleAction(() => rejectEppAdvanced(token, reason));
  };

  if (loading && !epp) {
    return (
      <AdvancedPageLayout>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Cargando información de EPP...</p>
        </div>
      </AdvancedPageLayout>
    );
  }

  if (error && !epp) {
    return (
      <AdvancedPageLayout>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#e53e3e' }}>
          <p>{error}</p>
          <Button onClick={() => void loadData()}>Reintentar</Button>
        </div>
      </AdvancedPageLayout>
    );
  }

  const catalog = epp?.catalog ?? [];
  const assignments = epp?.assignments ?? [];
  const inspections = epp?.inspections ?? [];
  const history = epp?.history ?? [];
  const activeCatalog = catalog.filter(c => c.active);
  const activeAssignments = assignments.filter(a => a.status === 'ACTIVE');
  const expiredAssignments = assignments.filter(a => a.status === 'EXPIRED');
  const pendingInspections = inspections.filter(i => i.status === 'OPEN' || i.status === 'Pendiente');

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
        moduleCode="1.2.3"
        moduleTitle="Gestión de EPP"
        description="Elementos de Protección Personal — Estándar 1.2.3"
        statusBadge={complianceBadge(epp?.complianceStatus ?? 'PENDING')}
        actions={actions}
        lastSaved={lastSync ? `Última actualización: ${lastSync}` : undefined}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Catálogo activo', value: activeCatalog.length, variant: 'info' },
          { label: 'Asignaciones activas', value: activeAssignments.length, variant: 'success' },
          { label: 'Cobertura', value: `${coverage?.coveragePercentage ?? 0}%`, variant: (coverage?.coveragePercentage ?? 0) >= 80 ? 'success' : 'warning' },
          { label: 'Vencidos', value: expiredAssignments.length, variant: expiredAssignments.length > 0 ? 'danger' : 'info' },
          { label: 'Inspecciones pendientes', value: pendingInspections.length, variant: pendingInspections.length > 0 ? 'warning' : 'info' },
          { label: 'Pendientes por asignar', value: coverage?.pending ?? 0, variant: 'warning' },
        ]}
        columns={3}
      />

      {error && (
        <Card style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: '#fff5f5', border: '1px solid #fc8181', color: '#c53030' }}>
          {error}
        </Card>
      )}

      <div className="flex gap-6" style={{ marginTop: '1.5rem' }}>
        <AdvancedTabsSidebar items={SIDEBAR_ITEMS} activeId={activeTab} onSelect={setActiveTab} />
        <AdvancedTabsContent>
          {/* RESUMEN */}
          {activeTab === 'resumen' && (
            <AdvancedSection title="Resumen de EPP" description="Estado general de la gestión de elementos de protección personal">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Cobertura General</h4>
                  <AdvancedProgressBar value={coverage?.coveragePercentage ?? 0} showPercentage />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#718096' }}>
                    {activeAssignments.length} de {activeCatalog.length} elementos asignados
                  </p>
                </Card>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Estado del EPP</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                    <strong>Catálogo:</strong> {catalog.length} elementos ({activeCatalog.length} activos)
                  </p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                    <strong>Asignaciones:</strong> {assignments.length} totales ({activeAssignments.length} activas)
                  </p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                    <strong>Inspecciones:</strong> {inspections.length} realizadas ({pendingInspections.length} pendientes)
                  </p>
                </Card>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Cumplimiento</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                    <strong>Estado:</strong> {complianceBadge(epp?.complianceStatus ?? 'PENDING')}
                  </p>
                  {epp?.complianceReason && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#718096' }}>
                      {epp.complianceReason}
                    </p>
                  )}
                </Card>
              </div>
            </AdvancedSection>
          )}

          {/* CATÁLOGO */}
          {activeTab === 'catalogo' && (
            <AdvancedSection title="Catálogo de EPP" description="Elementos de protección personal disponibles">
              {catalog.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay elementos en el catálogo todavía.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Categoría</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Estándar</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Requerido para</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.map((item) => (
                        <tr key={item.eppId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{item.name}</td>
                          <td style={{ padding: '0.75rem' }}>{item.category}</td>
                          <td style={{ padding: '0.75rem' }}>{item.standard || '—'}</td>
                          <td style={{ padding: '0.75rem' }}>{item.requiredFor || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span className={`badge ${item.active ? 'badge--success' : 'badge--warning'}`}>
                              {item.active ? 'Activo' : 'Inactivo'}
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

          {/* ASIGNACIONES */}
          {activeTab === 'asignaciones' && (
            <AdvancedSection title="Asignaciones de EPP" description="EPP asignado a trabajadores">
              {assignments.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay asignaciones de EPP registradas.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Empleado</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>EPP</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Cantidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Fecha entrega</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Condición</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a.assignmentId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{a.employeeName}</td>
                          <td style={{ padding: '0.75rem' }}>{a.eppName}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{a.quantity}</td>
                          <td style={{ padding: '0.75rem' }}>{new Date(a.deliveryDate).toLocaleDateString('es-CO')}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{conditionBadge(a.condition)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{assignmentStatusBadge(a.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* INSPECCIONES */}
          {activeTab === 'inspecciones' && (
            <AdvancedSection title="Inspecciones de EPP" description="Inspecciones realizadas y pendientes">
              {inspections.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay inspecciones de EPP registradas.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Inspector</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Área</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Hallazgos</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspections.map((insp) => (
                        <tr key={insp.inspectionId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{new Date(insp.date).toLocaleDateString('es-CO')}</td>
                          <td style={{ padding: '0.75rem' }}>{insp.inspector}</td>
                          <td style={{ padding: '0.75rem' }}>{insp.area}</td>
                          <td style={{ padding: '0.75rem' }}>{insp.findings || 'Sin observaciones'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span className={`badge ${insp.status === 'OPEN' ? 'badge--warning' : 'badge--success'}`}>
                              {insp.status === 'OPEN' ? 'Pendiente' : 'Cerrada'}
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

          {/* HISTORIAL */}
          {activeTab === 'historial' && (
            <AdvancedSection title="Historial de Cambios" description="Registro de acciones realizadas en el módulo EPP">
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
            <AdvancedSection title="Aprobación del EPP" description="Enviar a aprobación o gestionar el estado actual">
              <Card style={{ padding: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem' }}>Estado Actual</h4>
                <p style={{ margin: '0 0 0.5rem' }}>
                  <strong>Estado:</strong> {complianceBadge(epp?.complianceStatus ?? 'PENDING')}
                </p>
                {epp?.complianceReason && (
                  <p style={{ margin: '0 0 1rem', color: '#718096' }}>{epp.complianceReason}</p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {(role === 'owner' || role === 'admin') && (
                    <>
                      <Button onClick={() => void handleSubmit()} disabled={actionLoading}>
                        📤 Enviar a Aprobación
                      </Button>
                      <Button onClick={() => void handleSave()} variant="secondary" disabled={actionLoading}>
                        💾 Guardar Cambios
                      </Button>
                    </>
                  )}
                  {role === 'owner' && (
                    <>
                      <Button onClick={() => void handleApprove()} variant="primary" disabled={actionLoading}>
                        ✅ Aprobar
                      </Button>
                      <Button onClick={() => void handleReject()} variant="secondary" disabled={actionLoading} style={{ color: '#e53e3e' }}>
                        ❌ Rechazar
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: '2rem', padding: '1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.75rem' }}>
        Módulo 1.2.3 — Elementos de Protección Personal | Estándar SG-SST
      </div>
    </AdvancedPageLayout>
  );
}

export default EppManagementPage;
