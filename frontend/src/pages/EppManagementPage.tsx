import { useCallback, useEffect, useState } from 'react';

import {
  fetchEppAdvanced,
  fetchEppCoverage,
  updateEppAdvanced,
  submitEppAdvanced,
  approveEppAdvanced,
  rejectEppAdvanced,
  fetchEppApplicabilityMatrix,
  createEppApplicability,
  updateEppApplicability,
  fetchEmployees,
  type EppApplicabilityMatrixResponse as MatrixData,
  type EmployeeModel,
} from '../api';
import { getOverview } from '../services/compliance-dashboard.service';
import type {
  DashboardFinding,
  DashboardModuleCompliance,
} from '../types/compliance-dashboard';
import {
  fetchEppDeliveries,
} from '../api';
import type { EppDelivery } from '../types/epp';
import { useCompanyContext } from '../context/CompanyContext';
import { EppDeliveriesSection } from '../components/epp/EppDeliveriesSection';
import { EppWorkerCoverageSection } from '../components/epp/EppWorkerCoverageSection';
import { EppResumenSection } from '../components/epp/EppResumenSection';
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
  { id: 'matriz', label: '🧩 Matriz por cargo' },
  // Cobertura M2 por trabajador: vista operativa en memoria (sin endpoints nuevos).
  { id: 'trabajadores', label: '👥 Trabajadores' },
  // Entregas (EppDelivery) es la experiencia operativa principal de 4.2.6;
  // "Asignaciones" queda temporalmente como legacy (SstEpp.assignments[]).
  { id: 'entregas', label: '🚚 Entregas' },
  { id: 'asignaciones', label: 'Asignaciones (legacy)' },
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
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  // Resumen V2: resultado OFICIAL del Compliance Engine (module 'epp-compliance').
  const [eppCompliance, setEppCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [eppFindings, setEppFindings] = useState<DashboardFinding[]>([]);
  // Cobertura M2 por trabajador: entregas completas cargadas UNA vez en el
  // padre (bulk, sin N+1) y compartidas con la pestaña Trabajadores.
  const [allDeliveries, setAllDeliveries] = useState<EppDelivery[]>([]);

  // FUENTE ÚNICA de entregas (conjunto base compartido): UNA llamada bulk que
  // alimenta a Trabajadores y a la vista sin filtros de Entregas. member no
  // ejecuta ninguna petición (backend 403) → conjunto vacío.
  const reloadBaseDeliveries = useCallback(async () => {
    if (role === 'member') return;
    setAllDeliveries(await fetchEppDeliveries(token).catch(() => []));
  }, [token, role]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('resumen');
  const [lastSync, setLastSync] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const canEditMatrix = role === 'owner' || role === 'admin';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [eppData, coverageData, matrixData, employeesData, overviewData] = await Promise.all([
        fetchEppAdvanced(token),
        fetchEppCoverage(token),
        fetchEppApplicabilityMatrix(token).catch(() => null), // la matriz es opcional al cargar
        fetchEmployees(token).catch(() => [] as EmployeeModel[]), // empleados para la pestaña Entregas
        // Resumen V2: overview opcional — su fallo no debe bloquear la página
        getOverview(token, companyId ?? '').catch(() => null),
      ]);
      setEpp(eppData as unknown as SstEppModel);
      setCoverage(coverageData as unknown as EppCoverageModel);
      setMatrix(matrixData);
      setEmployees(employeesData);
      // 'epp-compliance' es el identificador canónico del módulo EPP (Etapa 3).
      setEppCompliance(overviewData?.moduleCompliance.find((m) => m.module === 'epp-compliance') ?? null);
      setEppFindings(overviewData ? overviewData.findings.filter((f) => f.module === 'epp-compliance') : []);
      // Conjunto base compartido de entregas (una sola llamada; sin N+1).
      await reloadBaseDeliveries();
      setLastSync(new Date().toLocaleString('es-CO'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos de EPP');
    } finally {
      setLoading(false);
    }
  }, [token, companyId, reloadBaseDeliveries]);

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
    // 4.2.6: el backend aplica whitelist estricta (UpdateSstEppDto +
    // forbidNonWhitelisted). Se envían SOLO campos de gestión; scoring/identidad
    // (complianceStatus, itemCode, companyId, history, _id) quedan fuera del
    // contrato y los decide el backend/aprobación.
    const { year, complianceReason, catalog, assignments, inspections } = epp;
    await handleAction(() => updateEppAdvanced(token, { year, complianceReason, catalog, assignments, inspections }));
  };

  // ── Matriz de aplicabilidad Cargo → EPP (4.2.6) ──
  // EppApplicability define REQUISITOS; las entregas reales viven en
  // EppDelivery y el módulo operativo. Owner/Admin editan; Manager/Member leen.
  const [matrixModal, setMatrixModal] = useState<{
    jobProfileId: string; eppItemId: string; required: boolean; reason: string; scope: string;
  } | null>(null);

  const reloadMatrix = useCallback(async () => {
    try {
      setMatrix(await fetchEppApplicabilityMatrix(token));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la matriz de aplicabilidad');
    }
  }, [token]);

  const relationFor = (jobProfileId: string, eppItemId: string) =>
    matrix?.assignments.find((a) => a.jobProfileId === jobProfileId && a.eppItemId === eppItemId);

  const toggleRelation = async (jobProfileId: string, eppItemId: string) => {
    if (!canEditMatrix) return;
    const relation = relationFor(jobProfileId, eppItemId);
    if (!relation) {
      // Crear nueva relación (modal con Cargo/EPP preseleccionados).
      setMatrixModal({ jobProfileId, eppItemId, required: true, reason: '', scope: '' });
      return;
    }
    await handleAction(async () => {
      if (relation.active) {
        const ok = window.confirm(`¿Desactivar el requisito "${relation.eppName}" para "${relation.jobProfileName}"? La relación se conserva para auditoría.`);
        if (!ok) return;
        await updateEppApplicability(token, relation.id, { active: false });
      } else {
        const ok = window.confirm(`¿Reactivar el requisito "${relation.eppName}" para "${relation.jobProfileName}"?`);
        if (!ok) return;
        await updateEppApplicability(token, relation.id, { active: true });
      }
    });
    await reloadMatrix();
  };

  const handleSaveRelation = async () => {
    if (!matrixModal) return;
    await handleAction(async () => {
      await createEppApplicability(token, {
        jobProfileId: matrixModal.jobProfileId,
        eppItemId: matrixModal.eppItemId,
        required: matrixModal.required,
        reason: matrixModal.reason || undefined,
        scope: matrixModal.scope || undefined,
      });
      setMatrixModal(null);
    });
    await reloadMatrix();
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
              {/* Resumen V2: resultado OFICIAL del Compliance Engine (Etapa 4) */}
              <EppResumenSection
                compliance={eppCompliance}
                findings={eppFindings}
                loading={loading}
                role={role}
                onOpenTab={(tab) => setActiveTab(tab)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Cobertura General</h4>
                  <AdvancedProgressBar value={coverage?.coveragePercentage ?? 0} showPercentage />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#718096' }}>
                    {activeAssignments.length} de {activeCatalog.length} elementos asignados
                  </p>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#a0aec0' }}>
                    Indicador operativo legacy — el resultado oficial es el Resumen de cumplimiento 4.2.6
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

          {/* MATRIZ POR CARGO (4.2.6 — EppApplicability) */}
          {activeTab === 'matriz' && (
            <AdvancedSection
              title="Matriz de aplicabilidad por cargo"
              description="Qué EPP requiere cada perfil de cargo (requisitos). Las entregas reales se registran en el módulo operativo."
            >
              {matrix === null ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>Cargando matriz de aplicabilidad...</p>
              ) : matrix.jobProfiles.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>
                  No hay perfiles de cargo. Cree los perfiles en “Perfiles de cargo” para definir la matriz.
                </p>
              ) : matrix.eppItems.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>
                  No hay elementos activos en el catálogo EPP. Agregue elementos en la pestaña Catálogo.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Cargo \ EPP</th>
                        {matrix.eppItems.map((item) => (
                          <th key={item.id} style={{ padding: '0.75rem', textAlign: 'center' }} title={item.category}>
                            {item.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.jobProfiles.map((profile) => (
                        <tr key={profile.id} style={{ borderBottom: '1px solid #e2e8f0', opacity: profile.active ? 1 : 0.5 }}>
                          <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                            <strong>{profile.name}</strong>
                            {!profile.active && <span className="badge badge--warning" style={{ marginLeft: '0.5rem' }}>inactivo</span>}
                          </td>
                          {matrix.eppItems.map((item) => {
                            const relation = relationFor(profile.id, item.id);
                            const clickable = canEditMatrix;
                            return (
                              <td key={item.id} style={{ padding: '0.75rem', textAlign: 'center' }}>
                                {relation && relation.required && relation.active ? (
                                  <button
                                    type="button"
                                    disabled={!clickable}
                                    title={relation.reason ? `${relation.reason}${relation.scope ? ` — ${relation.scope}` : ''}` : 'Requerido'}
                                    onClick={() => void toggleRelation(profile.id, item.id)}
                                    style={{ cursor: clickable ? 'pointer' : 'default', border: 'none', background: 'transparent' }}
                                  >
                                    <span className="badge badge--success">✓</span>
                                  </button>
                                ) : relation && !relation.active ? (
                                  <button
                                    type="button"
                                    disabled={!clickable}
                                    title="Relación desactivada (histórico conservado)"
                                    onClick={() => void toggleRelation(profile.id, item.id)}
                                    style={{ cursor: clickable ? 'pointer' : 'default', border: 'none', background: 'transparent' }}
                                  >
                                    <span className="badge badge--warning">◌</span>
                                  </button>
                                ) : relation && relation.required === false ? (
                                  <span title="Explícitamente no requerido" className="badge">✗</span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!clickable}
                                    title={clickable ? 'Definir requisito' : 'Sin requisito'}
                                    onClick={() => void toggleRelation(profile.id, item.id)}
                                    style={{ cursor: clickable ? 'pointer' : 'default', border: 'none', background: 'transparent', color: '#a0aec0' }}
                                  >
                                    —
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: '#718096' }}>
                ✓ requerido · ◌ desactivado (histórico) · ✗ explícitamente no requerido · — sin relación
                {canEditMatrix ? ' · clic para crear/desactivar/reactivar' : ' · solo lectura'}
              </p>
            </AdvancedSection>
          )}

          {/* MODAL CREAR RELACIÓN */}
          {matrixModal && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
              }}
              onClick={() => setMatrixModal(null)}
            >
              <div
                style={{ background: '#fff', borderRadius: 8, padding: '1.5rem', width: '100%', maxWidth: 480 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h4 style={{ margin: '0 0 1rem' }}>Definir requisito Cargo → EPP</h4>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem' }}>
                    Cargo
                    <select
                      value={matrixModal.jobProfileId}
                      onChange={(e) => setMatrixModal({ ...matrixModal, jobProfileId: e.target.value })}
                      style={{ padding: '0.5rem' }}
                    >
                      {matrix?.jobProfiles.filter((p) => p.active).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem' }}>
                    Elemento EPP
                    <select
                      value={matrixModal.eppItemId}
                      onChange={(e) => setMatrixModal({ ...matrixModal, eppItemId: e.target.value })}
                      style={{ padding: '0.5rem' }}
                    >
                      {matrix?.eppItems.map((i) => (
                        <option key={i.id} value={i.id}>{i.name} ({i.category})</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      checked={matrixModal.required}
                      onChange={(e) => setMatrixModal({ ...matrixModal, required: e.target.checked })}
                    />
                    Requerido
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem' }}>
                    Motivo
                    <input
                      type="text"
                      maxLength={250}
                      value={matrixModal.reason}
                      placeholder="Ej.: Trabajo en altura"
                      onChange={(e) => setMatrixModal({ ...matrixModal, reason: e.target.value })}
                      style={{ padding: '0.5rem' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem' }}>
                    Ámbito
                    <input
                      type="text"
                      maxLength={250}
                      value={matrixModal.scope}
                      placeholder="Ej.: Durante soldadura"
                      onChange={(e) => setMatrixModal({ ...matrixModal, scope: e.target.value })}
                      style={{ padding: '0.5rem' }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <Button onClick={() => setMatrixModal(null)} variant="secondary">Cancelar</Button>
                  <Button onClick={() => void handleSaveRelation()} disabled={actionLoading}>Guardar requisito</Button>
                </div>
              </div>
            </div>
          )}

          {/* TRABAJADORES (cobertura M2 por trabajador — vista operativa en memoria) */}
          {activeTab === 'trabajadores' && (
            <EppWorkerCoverageSection
              role={role}
              employees={employees}
              matrix={matrix}
              deliveries={allDeliveries}
              onOpenTab={(tab) => setActiveTab(tab)}
            />
          )}

          {/* ENTREGAS (EppDelivery — experiencia operativa principal 4.2.6) */}
          {activeTab === 'entregas' && (
            <EppDeliveriesSection
              token={token}
              role={role}
              employees={employees}
              eppItems={matrix?.eppItems ?? []}
              baseDeliveries={allDeliveries}
              baseLoading={loading}
              reloadBaseDeliveries={reloadBaseDeliveries}
            />
          )}

          {/* ASIGNACIONES (legacy SstEpp.assignments[] — se retira después de validar Entregas) */}
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
