import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CompanyLegalMatrixModel, LegalActionPlanModel, LegalDashboardModel, LegalEvidenceModel,
  LegalFollowUpModel, LegalHistoryModel, LegalMatrixComplianceModel, LegalRegulatoryChangeModel,
  LegalRequirementModel, fetchCompanyLegalMatrix, fetchLegalActionPlans,
  fetchLegalAutoCompliance, fetchLegalDashboard, fetchLegalEvidence, fetchLegalFollowUps,
  fetchLegalHistory, fetchLegalRegulatoryChanges, fetchLegalRequirements, fetchLegalMatrixCompliance,
  fetchSectorRegulations,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Sheet } from '../components/ui/Sheet';
import { Icons } from '../components/Icons';

type Props = { token: string };

type TabId = 'dashboard' | 'regulations' | 'requirements' | 'evidence' | 'followup' | 'changes' | 'actionplan' | 'history';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard Legal' },
  { id: 'regulations', label: 'Normativa Aplicable' },
  { id: 'requirements', label: 'Requisitos Legales' },
  { id: 'evidence', label: 'Evidencias' },
  { id: 'followup', label: 'Seguimiento' },
  { id: 'changes', label: 'Cambios Normativos' },
  { id: 'actionplan', label: 'Plan de Acción' },
  { id: 'history', label: 'Historial' },
];

const STATUS_COLORS: Record<string, string> = {
  CUMPLE: '#22c55e', PARCIAL: '#eab308', NO_CUMPLE: '#ef4444', PENDIENTE: '#6b7280',
  VALID: '#22c55e', PENDING: '#eab308', EXPIRED: '#ef4444', REJECTED: '#6b7280',
  HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#3b82f6',
};

export function LegalMatrixPage({ token }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data states
  const [matrix, setMatrix] = useState<CompanyLegalMatrixModel | null>(null);
  const [compliance, setCompliance] = useState<LegalMatrixComplianceModel | null>(null);
  const [dashboard, setDashboard] = useState<LegalDashboardModel | null>(null);
  const [requirements, setRequirements] = useState<LegalRequirementModel[]>([]);
  const [evidence, setEvidence] = useState<LegalEvidenceModel[]>([]);
  const [followUps, setFollowUps] = useState<LegalFollowUpModel[]>([]);
  const [regChanges, setRegChanges] = useState<LegalRegulatoryChangeModel[]>([]);
  const [actionPlans, setActionPlans] = useState<LegalActionPlanModel[]>([]);
  const [history, setHistory] = useState<LegalHistoryModel[]>([]);
  const [autoCompliance, setAutoCompliance] = useState<{ complies: boolean; reasons: string[]; score: number } | null>(null);
  const [sectorRegs, setSectorRegs] = useState<any[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, c, d, r, e, f, rc, ap, h, ac] = await Promise.all([
        fetchCompanyLegalMatrix(token).catch(() => null),
        fetchLegalMatrixCompliance(token).catch(() => null),
        fetchLegalDashboard(token).catch(() => null),
        fetchLegalRequirements(token).catch(() => []),
        fetchLegalEvidence(token).catch(() => []),
        fetchLegalFollowUps(token).catch(() => []),
        fetchLegalRegulatoryChanges(token).catch(() => []),
        fetchLegalActionPlans(token).catch(() => []),
        fetchLegalHistory(token).catch(() => []),
        fetchLegalAutoCompliance(token).catch(() => null),
      ]);
      setMatrix(m);
      setCompliance(c);
      setDashboard(d);
      setRequirements(r);
      setEvidence(e);
      setFollowUps(f);
      setRegChanges(rc);
      setActionPlans(ap);
      setHistory(h);
      setAutoCompliance(ac);

      if (m?.economicSector) {
        fetchSectorRegulations(token, m.economicSector).then(setSectorRegs).catch(() => undefined);
      }
    } catch (err: any) {
      setError(err.message ?? 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const complianceChartData = useMemo(() => {
    if (!compliance) return [];
    return [
      { name: 'Cumple', value: compliance.cumplen, color: '#22c55e' },
      { name: 'No Cumple', value: compliance.noCumplen, color: '#ef4444' },
      { name: 'No Aplica', value: compliance.noAplica, color: '#3b82f6' },
      { name: 'Pendiente', value: compliance.pendiente, color: '#6b7280' },
    ].filter((d) => d.value > 0);
  }, [compliance]);

  const requirementStatusChart = useMemo(() => {
    if (!requirements.length) return [];
    const cumplen = requirements.filter((r) => r.complianceStatus === 'CUMPLE').length;
    const parcial = requirements.filter((r) => r.complianceStatus === 'PARCIAL').length;
    const noCumplen = requirements.filter((r) => r.complianceStatus === 'NO_CUMPLE').length;
    return [
      { name: 'Cumple', value: cumplen, color: '#22c55e' },
      { name: 'Parcial', value: parcial, color: '#eab308' },
      { name: 'No Cumple', value: noCumplen, color: '#ef4444' },
    ].filter((d) => d.value > 0);
  }, [requirements]);

  if (loading && !matrix) {
    return <div className="legal-matrix"><Card><p className="muted">Cargando matriz legal...</p></Card></div>;
  }

  return (
    <div className="legal-matrix">
      <Card>
        <div className="actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Matriz Legal SG-SST</h2>
            {matrix && <p className="muted" style={{ margin: '.25rem 0 0' }}>Sector: {matrix.economicSector}</p>}
          </div>
          <div className="actions">
            <Button type="button" variant="primary" onClick={() => setAdvancedOpen(true)}>
              ⚡ Entrar a Gestión avanzada
            </Button>
            <Button type="button" variant="secondary" onClick={loadAll}>Recargar</Button>
          </div>
        </div>
      </Card>

      {error && <Card><pre className="error">{error}</pre></Card>}

      {/* Tabs */}
      <div className="legal-matrix__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`legal-matrix__tab ${activeTab === tab.id ? 'legal-matrix__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="legal-matrix__content">
        {activeTab === 'dashboard' && <DashboardTab dashboard={dashboard} compliance={compliance} autoCompliance={autoCompliance} requirements={requirements} />}
        {activeTab === 'regulations' && <RegulationsTab matrix={matrix} sectorRegs={sectorRegs} token={token} onRefresh={loadAll} />}
        {activeTab === 'requirements' && <RequirementsTab requirements={requirements} token={token} onRefresh={loadAll} />}
        {activeTab === 'evidence' && <EvidenceTab evidence={evidence} requirements={requirements} token={token} onRefresh={loadAll} />}
        {activeTab === 'followup' && <FollowUpTab followUps={followUps} requirements={requirements} token={token} onRefresh={loadAll} />}
        {activeTab === 'changes' && <ChangesTab changes={regChanges} token={token} onRefresh={loadAll} />}
        {activeTab === 'actionplan' && <ActionPlanTab plans={actionPlans} requirements={requirements} token={token} onRefresh={loadAll} />}
        {activeTab === 'history' && <HistoryTab history={history} />}
      </div>

      {/* Advanced Management Sheet */}
      <Sheet open={advancedOpen} title="Gestión Avanzada - Matriz Legal" onOpenChange={setAdvancedOpen}>
        <AdvancedPanel matrix={matrix} compliance={compliance} autoCompliance={autoCompliance} token={token} onRefresh={loadAll} />
      </Sheet>
    </div>
  );
}

// ==================== TAB 1: DASHBOARD ====================
function DashboardTab({ dashboard, compliance, autoCompliance, requirements }: {
  dashboard: LegalDashboardModel | null;
  compliance: LegalMatrixComplianceModel | null;
  autoCompliance: { complies: boolean; reasons: string[]; score: number } | null;
  requirements: LegalRequirementModel[];
}) {
  const d = dashboard ?? { totalRequirements: 0, compliant: 0, partial: 0, nonCompliant: 0, expiringReviews: 0, pendingEvidence: 0, regulatoryChanges: 0, overallCompliancePercentage: 0 };

  return (
    <div className="legal-matrix__grid">
      {/* KPI Cards */}
      <div className="legal-matrix__kpis">
        <article className="legal-matrix__kpi legal-matrix__kpi--good">
          <span className="legal-matrix__kpi-label">Cumplimiento Legal</span>
          <span className="legal-matrix__kpi-value">{d.overallCompliancePercentage}%</span>
        </article>
        <article className="legal-matrix__kpi legal-matrix__kpi--info">
          <span className="legal-matrix__kpi-label">Total Requisitos</span>
          <span className="legal-matrix__kpi-value">{d.totalRequirements}</span>
        </article>
        <article className="legal-matrix__kpi legal-matrix__kpi--good">
          <span className="legal-matrix__kpi-label">Cumplen</span>
          <span className="legal-matrix__kpi-value">{d.compliant}</span>
        </article>
        <article className="legal-matrix__kpi legal-matrix__kpi--warning">
          <span className="legal-matrix__kpi-label">Parciales</span>
          <span className="legal-matrix__kpi-value">{d.partial}</span>
        </article>
        <article className="legal-matrix__kpi legal-matrix__kpi--danger">
          <span className="legal-matrix__kpi-label">No Cumplen</span>
          <span className="legal-matrix__kpi-value">{d.nonCompliant}</span>
        </article>
        <article className="legal-matrix__kpi legal-matrix__kpi--warning">
          <span className="legal-matrix__kpi-label">Revisiones por Vencer</span>
          <span className="legal-matrix__kpi-value">{d.expiringReviews}</span>
        </article>
        <article className="legal-matrix__kpi legal-matrix__kpi--danger">
          <span className="legal-matrix__kpi-label">Evidencias Pendientes</span>
          <span className="legal-matrix__kpi-value">{d.pendingEvidence}</span>
        </article>
        <article className="legal-matrix__kpi legal-matrix__kpi--danger">
          <span className="legal-matrix__kpi-label">Cambios Normativos</span>
          <span className="legal-matrix__kpi-value">{d.regulatoryChanges}</span>
        </article>
      </div>

      {/* Charts */}
      <div className="legal-matrix__charts">
        <Card title="Estado de Cumplimiento - Matriz">
          {compliance ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie data={[
                    { name: 'Cumple', value: compliance.cumplen, color: '#22c55e' },
                    { name: 'No Cumple', value: compliance.noCumplen, color: '#ef4444' },
                    { name: 'No Aplica', value: compliance.noAplica, color: '#3b82f6' },
                    { name: 'Pendiente', value: compliance.pendiente, color: '#6b7280' },
                  ].filter((d) => d.value > 0)} dataKey="value" nameKey="name" outerRadius={90} label>
                    {[
                    { name: 'Cumple', value: compliance.cumplen, color: '#22c55e' },
                    { name: 'No Cumple', value: compliance.noCumplen, color: '#ef4444' },
                    { name: 'No Aplica', value: compliance.noAplica, color: '#3b82f6' },
                    { name: 'Pendiente', value: compliance.pendiente, color: '#6b7280' },
                  ].filter((d) => d.value > 0).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div>
                <p className="legal-matrix__stat"><span className="dot" style={{ background: '#22c55e' }} /> Cumple: {compliance.cumplen}</p>
                <p className="legal-matrix__stat"><span className="dot" style={{ background: '#ef4444' }} /> No Cumple: {compliance.noCumplen}</p>
                <p className="legal-matrix__stat"><span className="dot" style={{ background: '#3b82f6' }} /> No Aplica: {compliance.noAplica}</p>
                <p className="legal-matrix__stat"><span className="dot" style={{ background: '#6b7280' }} /> Pendiente: {compliance.pendiente}</p>
                <p className="legal-matrix__stat" style={{ fontWeight: 700, marginTop: '.5rem' }}>Total: {compliance.total}</p>
              </div>
            </div>
          ) : <p className="muted">Sin datos de matriz</p>}
        </Card>

        <Card title="Estado de Requisitos Legales">
          {requirements.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <ResponsiveContainer width="50%" height={220}>
                <BarChart data={[
                  { name: 'Cumple', value: requirements.filter((r) => r.complianceStatus === 'CUMPLE').length },
                  { name: 'Parcial', value: requirements.filter((r) => r.complianceStatus === 'PARCIAL').length },
                  { name: 'No Cumple', value: requirements.filter((r) => r.complianceStatus === 'NO_CUMPLE').length },
                ]}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value">
                    <Cell fill="#22c55e" />
                    <Cell fill="#eab308" />
                    <Cell fill="#ef4444" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div>
                <p style={{ fontSize: '.85rem' }}>Requisitos evaluados: {requirements.length}</p>
                {autoCompliance && (
                  <div style={{ marginTop: '.5rem' }}>
                    <p style={{ fontSize: '.85rem', fontWeight: 700 }}>
                      Auto-Cumplimiento: {autoCompliance.score}%
                      {autoCompliance.complies ? ' ✅' : ' ⚠️'}
                    </p>
                    {autoCompliance.reasons.map((r, i) => (
                      <p key={i} className="muted" style={{ fontSize: '.75rem', margin: 0 }}>{r}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : <p className="muted">Sin requisitos registrados</p>}
        </Card>
      </div>
    </div>
  );
}

// ==================== TAB 2: REGULATIONS ====================
function RegulationsTab({ matrix, sectorRegs, token, onRefresh }: {
  matrix: CompanyLegalMatrixModel | null;
  sectorRegs: any[];
  token: string;
  onRefresh: () => void;
}) {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newCode || !newName) return;
    setAdding(true);
    const { addCustomRegulationToCurrent } = await import('../api');
    try {
      await addCustomRegulationToCurrent(token, newCode, newName);
      setNewCode('');
      setNewName('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (code: string) => {
    if (!confirm(`¿Eliminar regulación ${code} de la matriz?`)) return;
    const { removeRegulationFromMatrix } = await import('../api');
    try {
      await removeRegulationFromMatrix(token, code);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const items = matrix?.items ?? [];
  // Merge with sector regulations if available
  const regulatedCodes = new Set(items.map((i) => i.regulationCode));

  return (
    <div className="legal-matrix__tab-content">
      <Card title="Normativa Aplicable por Sector">
        <p className="muted">Sector económico: {matrix?.economicSector ?? 'No asignado'}</p>
        {sectorRegs.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontWeight: 600, fontSize: '.85rem' }}>Plantillas disponibles para este sector:</p>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              {sectorRegs.map((reg) => (
                <span key={reg.regulationCode} className="legal-matrix__badge" style={{ background: regulatedCodes.has(reg.regulationCode) ? '#dcfce7' : '#f1f5f9' }}>
                  {reg.regulationCode} {regulatedCodes.has(reg.regulationCode) ? '✅' : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3>Regulaciones de la Empresa ({items.length})</h3>
        <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table className="table w-full">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.regulationCode}>
                  <td><strong>{item.regulationCode}</strong></td>
                  <td>{item.regulationName}</td>
                  <td>
                    <span className={`legal-matrix__status legal-matrix__status--${item.status.toLowerCase()}`}>
                      {item.status === 'CUMPLE' ? 'Cumple' : item.status === 'NO_CUMPLE' ? 'No Cumple' : item.status === 'NO_APLICA' ? 'N/A' : 'Pendiente'}
                    </span>
                  </td>
                  <td>
                    <Button type="button" variant="danger" onClick={() => handleRemove(item.regulationCode)}>Quitar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="actions" style={{ marginTop: '1rem', gap: '.5rem', flexWrap: 'wrap' }}>
          <input className="input" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Código (ej: RES-1234)" style={{ maxWidth: 150 }} />
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre de la regulación" style={{ maxWidth: 300 }} />
          <Button type="button" disabled={adding || !newCode || !newName} onClick={handleAdd}>Agregar</Button>
        </div>
      </Card>
    </div>
  );
}

// ==================== TAB 3: REQUIREMENTS ====================
function RequirementsTab({ requirements, token, onRefresh }: {
  requirements: LegalRequirementModel[];
  token: string;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [regName, setRegName] = useState('');
  const [article, setArticle] = useState('');
  const [reqText, setReqText] = useState('');
  const [responsibleUser, setResponsibleUser] = useState('');
  const [frequency, setFrequency] = useState('ANUAL');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCode(''); setRegName(''); setArticle(''); setReqText(''); setResponsibleUser(''); setFrequency('ANUAL');
    setEditId(null); setShowForm(false);
  };

  const handleSave = async () => {
    if (!code || !regName || !reqText) return;
    setSaving(true);
    try {
      const { createLegalRequirement, updateLegalRequirement } = await import('../api');
      if (editId) {
        await updateLegalRequirement(token, editId, { requirement: reqText, reviewFrequency: frequency } as any);
      } else {
        await createLegalRequirement(token, { regulationCode: code, regulationName: regName, article: article || undefined, requirement: reqText, responsibleUser: responsibleUser || undefined, reviewFrequency: frequency });
      }
      resetForm();
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este requisito?')) return;
    const { deleteLegalRequirement } = await import('../api');
    try {
      await deleteLegalRequirement(token, id);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEdit = (req: LegalRequirementModel) => {
    setEditId(req._id);
    setCode(req.regulationCode);
    setRegName(req.regulationName);
    setArticle(req.article ?? '');
    setReqText(req.requirement);
    setResponsibleUser(typeof req.responsibleUser === 'object' && req.responsibleUser ? (req.responsibleUser as any)._id ?? '' : '');
    setFrequency(req.reviewFrequency);
    setShowForm(true);
  };

  return (
    <div className="legal-matrix__tab-content">
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Requisitos Legales ({requirements.length})</h3>
        <Button type="button" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Requisito</Button>
      </div>

      {showForm && (
        <Card>
          <h4>{editId ? 'Editar' : 'Nuevo'} Requisito Legal</h4>
          <div className="form-grid">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código regulación" disabled={!!editId} />
            <input className="input" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Nombre regulación" disabled={!!editId} />
            <input className="input" value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Artículo (opcional)" />
            <textarea className="input" value={reqText} onChange={(e) => setReqText(e.target.value)} placeholder="Descripción del requisito" rows={3} />
            <input className="input" value={responsibleUser} onChange={(e) => setResponsibleUser(e.target.value)} placeholder="ID usuario responsable (opcional)" />
            <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="ANUAL">Anual</option>
              <option value="SEMESTRAL">Semestral</option>
              <option value="TRIMESTRAL">Trimestral</option>
              <option value="MENSUAL">Mensual</option>
              <option value="UNICO">Único</option>
            </select>
            <div className="actions">
              <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
              <Button type="button" variant="secondary" onClick={resetForm}>Cancelar</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
        <table className="table w-full">
          <thead>
            <tr>
              <th>Regulación</th>
              <th>Art.</th>
              <th>Requisito</th>
              <th>Frecuencia</th>
              <th>Estado</th>
              <th>Módulos Vinculados</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((req) => (
              <tr key={req._id}>
                <td><strong>{req.regulationCode}</strong></td>
                <td>{req.article ?? '-'}</td>
                <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.requirement}</td>
                <td>{req.reviewFrequency}</td>
                <td>
                  <span className={`legal-matrix__status legal-matrix__status--${req.complianceStatus.toLowerCase()}`}>
                    {req.complianceStatus === 'CUMPLE' ? 'Cumple' : req.complianceStatus === 'PARCIAL' ? 'Parcial' : 'No Cumple'}
                  </span>
                </td>
                <td>{req.linkedModules?.length ?? 0} módulo(s)</td>
                <td>
                  <div className="actions" style={{ gap: '.25rem' }}>
                    <Button type="button" variant="secondary" onClick={() => handleEdit(req)}>Editar</Button>
                    <Button type="button" variant="danger" onClick={() => handleDelete(req._id)}>Eliminar</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== TAB 4: EVIDENCE ====================
function EvidenceTab({ evidence, requirements, token, onRefresh }: {
  evidence: LegalEvidenceModel[];
  requirements: LegalRequirementModel[];
  token: string;
  onRefresh: () => void;
}) {
  const [selectedReq, setSelectedReq] = useState('');
  const [description, setDescription] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = selectedReq ? evidence.filter((e) => e.requirementId === selectedReq) : evidence;

  const handleLink = async () => {
    if (!selectedReq || !description) return;
    setSaving(true);
    const { createLegalEvidence } = await import('../api');
    try {
      await createLegalEvidence(token, { requirementId: selectedReq, description, documentName: documentName || undefined, fileUrl: fileUrl || undefined });
      setDescription(''); setDocumentName(''); setFileUrl('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    const { deleteLegalEvidence } = await import('../api');
    try {
      await deleteLegalEvidence(token, id);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="legal-matrix__tab-content">
      <Card title="Vincular Evidencia">
        <div className="form-grid">
          <select className="select" value={selectedReq} onChange={(e) => setSelectedReq(e.target.value)}>
            <option value="">Seleccionar requisito</option>
            {requirements.map((r) => (
              <option key={r._id} value={r._id}>{r.regulationCode} - {r.requirement.substring(0, 60)}</option>
            ))}
          </select>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción de la evidencia" />
          <input className="input" value={documentName} onChange={(e) => setDocumentName(e.target.value)} placeholder="Nombre del documento (opcional)" />
          <input className="input" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="URL del archivo (opcional)" />
          <Button type="button" disabled={saving || !selectedReq || !description} onClick={handleLink}>
            {saving ? 'Guardando...' : 'Vincular Evidencia'}
          </Button>
        </div>
      </Card>

      <Card title={`Evidencias (${filtered.length})`}>
        {filtered.length === 0 ? <p className="muted">Sin evidencias vinculadas</p> : (
          <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Requisito</th>
                  <th>Documento</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => (
                  <tr key={ev._id}>
                    <td>{ev.requirementId.substring(0, 8)}...</td>
                    <td>{ev.documentName ?? ev.description.substring(0, 50)}</td>
                    <td>
                      <span className={`legal-matrix__status legal-matrix__status--${ev.status.toLowerCase()}`}>
                        {ev.status}
                      </span>
                    </td>
                    <td>{ev.createdAt ? new Date(ev.createdAt).toLocaleDateString() : '-'}</td>
                    <td><Button type="button" variant="danger" onClick={() => handleRemove(ev._id)}>Eliminar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================== TAB 5: FOLLOW-UP ====================
function FollowUpTab({ followUps, requirements, token, onRefresh }: {
  followUps: LegalFollowUpModel[];
  requirements: LegalRequirementModel[];
  token: string;
  onRefresh: () => void;
}) {
  const [selectedReq, setSelectedReq] = useState('');
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().split('T')[0]);
  const [findings, setFindings] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [complianceResult, setComplianceResult] = useState('CUMPLE');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);

  const filtered = selectedReq ? followUps.filter((f) => f.requirementId === selectedReq) : followUps;

  const handleCreate = async () => {
    if (!selectedReq) return;
    setSaving(true);
    const { createLegalFollowUp } = await import('../api');
    try {
      await createLegalFollowUp(token, {
        requirementId: selectedReq, reviewDate, findings, recommendations, complianceResult,
        nextReviewDate: nextReviewDate || undefined,
      });
      setFindings(''); setRecommendations(''); setNextReviewDate('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSign = async (id: string) => {
    const name = prompt('Nombre del firmante:');
    if (!name) return;
    setSigningId(id);
    const { signLegalFollowUp } = await import('../api');
    try {
      await signLegalFollowUp(token, id, { signedByName: name });
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSigningId(null);
    }
  };

  return (
    <div className="legal-matrix__tab-content">
      <Card title="Nuevo Seguimiento">
        <div className="form-grid">
          <select className="select" value={selectedReq} onChange={(e) => setSelectedReq(e.target.value)}>
            <option value="">Seleccionar requisito</option>
            {requirements.map((r) => (
              <option key={r._id} value={r._id}>{r.regulationCode} - {r.requirement.substring(0, 60)}</option>
            ))}
          </select>
          <input className="input" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          <textarea className="input" value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Hallazgos" rows={3} />
          <textarea className="input" value={recommendations} onChange={(e) => setRecommendations(e.target.value)} placeholder="Recomendaciones" rows={3} />
          <select className="select" value={complianceResult} onChange={(e) => setComplianceResult(e.target.value)}>
            <option value="CUMPLE">Cumple</option>
            <option value="PARCIAL">Parcial</option>
            <option value="NO_CUMPLE">No Cumple</option>
            <option value="NO_APLICA">No Aplica</option>
          </select>
          <input className="input" type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} placeholder="Próxima revisión" />
          <Button type="button" disabled={saving || !selectedReq} onClick={handleCreate}>{saving ? 'Guardando...' : 'Registrar Seguimiento'}</Button>
        </div>
      </Card>

      <Card title={`Seguimientos (${filtered.length})`}>
        {filtered.length === 0 ? <p className="muted">Sin seguimientos registrados</p> : (
          <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Revisor</th>
                  <th>Resultado</th>
                  <th>Firmado</th>
                  <th>Próx. Revisión</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f._id}>
                    <td>{new Date(f.reviewDate).toLocaleDateString()}</td>
                    <td>{f.reviewerName ?? 'N/A'}</td>
                    <td>
                      <span className={`legal-matrix__status legal-matrix__status--${f.complianceResult.toLowerCase()}`}>
                        {f.complianceResult}
                      </span>
                    </td>
                    <td>{f.isSigned ? '✅ Sí' : '❌ No'}</td>
                    <td>{f.nextReviewDate ? new Date(f.nextReviewDate).toLocaleDateString() : '-'}</td>
                    <td>
                      {!f.isSigned && (
                        <Button type="button" variant="secondary" disabled={signingId === f._id} onClick={() => handleSign(f._id)}>
                          {signingId === f._id ? 'Firmando...' : 'Firmar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================== TAB 6: REGULATORY CHANGES ====================
function ChangesTab({ changes, token, onRefresh }: {
  changes: LegalRegulatoryChangeModel[];
  token: string;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [changeType, setChangeType] = useState('NEW_REGULATION');
  const [regCode, setRegCode] = useState('');
  const [regName, setRegName] = useState('');
  const [impact, setImpact] = useState('MEDIUM');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!regCode || !regName) return;
    setSaving(true);
    const { createLegalRegulatoryChange } = await import('../api');
    try {
      await createLegalRegulatoryChange(token, { changeType, regulationCode: regCode, regulationName: regName, impact, effectiveDate, description: description || undefined });
      setRegCode(''); setRegName(''); setDescription(''); setShowForm(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (id: string) => {
    const { markRegulatoryChangeReviewed } = await import('../api');
    try {
      await markRegulatoryChangeReviewed(token, id);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const changeLabels: Record<string, string> = { NEW_REGULATION: 'Nueva', AMENDMENT: 'Modificación', REPEAL: 'Derogación', UPDATE: 'Actualización' };

  return (
    <div className="legal-matrix__tab-content">
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Cambios Normativos ({changes.length})</h3>
        <Button type="button" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Registrar Cambio'}</Button>
      </div>

      {showForm && (
        <Card>
          <div className="form-grid">
            <select className="select" value={changeType} onChange={(e) => setChangeType(e.target.value)}>
              <option value="NEW_REGULATION">Nueva Regulación</option>
              <option value="AMENDMENT">Modificación</option>
              <option value="REPEAL">Derogación</option>
              <option value="UPDATE">Actualización</option>
            </select>
            <input className="input" value={regCode} onChange={(e) => setRegCode(e.target.value)} placeholder="Código regulación" />
            <input className="input" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Nombre regulación" />
            <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción del cambio" rows={3} />
            <select className="select" value={impact} onChange={(e) => setImpact(e.target.value)}>
              <option value="HIGH">Alto Impacto</option>
              <option value="MEDIUM">Medio Impacto</option>
              <option value="LOW">Bajo Impacto</option>
            </select>
            <input className="input" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            <Button type="button" disabled={saving} onClick={handleCreate}>{saving ? 'Guardando...' : 'Registrar'}</Button>
          </div>
        </Card>
      )}

      <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
        <table className="table w-full">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Regulación</th>
              <th>Impacto</th>
              <th>Fecha Efectiva</th>
              <th>Revisado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c._id}>
                <td><span className={`legal-matrix__badge legal-matrix__badge--${c.impact.toLowerCase()}`}>{changeLabels[c.changeType] ?? c.changeType}</span></td>
                <td><strong>{c.regulationCode}</strong> - {c.regulationName}</td>
                <td>
                  <span className={`legal-matrix__status legal-matrix__status--${c.impact === 'HIGH' ? 'danger' : c.impact === 'MEDIUM' ? 'warning' : 'info'}`}>
                    {c.impact}
                  </span>
                </td>
                <td>{new Date(c.effectiveDate).toLocaleDateString()}</td>
                <td>{c.isReviewed ? '✅' : '❌'}</td>
                <td>
                  {!c.isReviewed && (
                    <Button type="button" variant="secondary" onClick={() => handleReview(c._id)}>Marcar Revisado</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== TAB 7: ACTION PLAN ====================
function ActionPlanTab({ plans, requirements, token, onRefresh }: {
  plans: LegalActionPlanModel[];
  requirements: LegalRequirementModel[];
  token: string;
  onRefresh: () => void;
}) {
  const [selectedReq, setSelectedReq] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = selectedReq ? plans.filter((p) => p.requirementId === selectedReq) : plans;

  const handleCreate = async () => {
    if (!selectedReq || !title) return;
    setSaving(true);
    const { createLegalActionPlan } = await import('../api');
    try {
      await createLegalActionPlan(token, { requirementId: selectedReq, title, description: description || undefined, dueDate: dueDate || undefined });
      setTitle(''); setDescription(''); setDueDate('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id: string, status: string) => {
    const { updateLegalActionPlan } = await import('../api');
    try {
      await updateLegalActionPlan(token, id, { status } as any);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const statusLabels: Record<string, string> = { PENDING: 'Pendiente', IN_PROGRESS: 'En Progreso', COMPLETED: 'Completado', CANCELLED: 'Cancelado' };

  return (
    <div className="legal-matrix__tab-content">
      <Card title="Crear Plan de Acción">
        <div className="form-grid">
          <select className="select" value={selectedReq} onChange={(e) => setSelectedReq(e.target.value)}>
            <option value="">Seleccionar requisito</option>
            {requirements.filter((r) => r.complianceStatus !== 'CUMPLE').map((r) => (
              <option key={r._id} value={r._id}>{r.regulationCode} - {r.requirement.substring(0, 60)}</option>
            ))}
          </select>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del plan de acción" />
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" rows={3} />
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Button type="button" disabled={saving || !selectedReq || !title} onClick={handleCreate}>{saving ? 'Guardando...' : 'Crear Plan'}</Button>
        </div>
      </Card>

      <Card title={`Planes de Acción (${filtered.length})`}>
        {filtered.length === 0 ? <p className="muted">Sin planes de acción</p> : (
          <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th>Sincronizado AWP</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p._id}>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</td>
                    <td>
                      <span className={`legal-matrix__status legal-matrix__status--${p.status === 'COMPLETED' ? 'good' : p.status === 'IN_PROGRESS' ? 'warning' : p.status === 'CANCELLED' ? 'danger' : ''}`}>
                        {statusLabels[p.status] ?? p.status}
                      </span>
                    </td>
                    <td>{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '-'}</td>
                    <td>{p.syncedToAnnualPlan ? `✅ (${p.activityTitle ?? 'Sí'})` : '❌ No'}</td>
                    <td>
                      <div className="actions" style={{ gap: '.25rem', flexWrap: 'wrap' }}>
                        {p.status === 'PENDING' && <Button type="button" variant="secondary" onClick={() => handleStatus(p._id, 'IN_PROGRESS')}>Iniciar</Button>}
                        {p.status === 'IN_PROGRESS' && <Button type="button" onClick={() => handleStatus(p._id, 'COMPLETED')}>Completar</Button>}
                        {(p.status === 'PENDING' || p.status === 'IN_PROGRESS') && <Button type="button" variant="danger" onClick={() => handleStatus(p._id, 'CANCELLED')}>Cancelar</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================== TAB 8: HISTORY ====================
function HistoryTab({ history }: { history: LegalHistoryModel[] }) {
  return (
    <div className="legal-matrix__tab-content">
      <Card title={`Historial de Actividades (${history.length})`}>
        {history.length === 0 ? <p className="muted">Sin historial registrado</p> : (
          <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h._id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(h.createdAt).toLocaleString()}</td>
                    <td>{h.userEmail ?? h.userName ?? h.userId.substring(0, 8)}</td>
                    <td><code>{h.action}</code></td>
                    <td>{h.entityType}</td>
                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.description ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================== ADVANCED MANAGEMENT SHEET ====================
function AdvancedPanel({ matrix, compliance, autoCompliance, token, onRefresh }: {
  matrix: CompanyLegalMatrixModel | null;
  compliance: LegalMatrixComplianceModel | null;
  autoCompliance: { complies: boolean; reasons: string[]; score: number } | null;
  token: string;
  onRefresh: () => void;
}) {
  const [secRegs, setSecRegs] = useState<any[]>([]);

  useEffect(() => {
    if (matrix?.economicSector) {
      fetchSectorRegulations(token, matrix.economicSector).then(setSecRegs).catch(() => undefined);
    }
  }, [matrix, token]);

  return (
    <div className="legal-matrix__advanced">
      <Card title="Resumen de Cumplimiento">
        <div className="legal-matrix__kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <article className={`legal-matrix__kpi ${(compliance?.compliancePercentage ?? 0) >= 80 ? 'legal-matrix__kpi--good' : 'legal-matrix__kpi--danger'}`}>
            <span className="legal-matrix__kpi-label">% Cumplimiento Matriz</span>
            <span className="legal-matrix__kpi-value">{compliance?.compliancePercentage ?? 0}%</span>
          </article>
          <article className={`legal-matrix__kpi ${autoCompliance?.complies ? 'legal-matrix__kpi--good' : 'legal-matrix__kpi--warning'}`}>
            <span className="legal-matrix__kpi-label">Auto-Cumplimiento</span>
            <span className="legal-matrix__kpi-value">{autoCompliance?.score ?? 0}%</span>
          </article>
        </div>
        {autoCompliance?.reasons.map((r, i) => (
          <p key={i} className="muted" style={{ fontSize: '.8rem' }}>⚠ {r}</p>
        ))}
      </Card>

      <Card title="Biblioteca Legal por Sector">
        {secRegs.length > 0 ? (
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            {secRegs.map((reg) => (
              <span key={reg.regulationCode} className="legal-matrix__badge">{reg.regulationCode}</span>
            ))}
          </div>
        ) : <p className="muted">Selecciona un sector para ver las regulaciones</p>}
      </Card>

      <Card title="Acciones Rápidas">
        <div className="actions" style={{ flexWrap: 'wrap' }}>
          <Button type="button" onClick={() => { import('../api').then((m) => m.triggerLegalAlerts(token)); alert('Alertas generadas'); }}>🔄 Generar Alertas</Button>
          <Button type="button" variant="secondary" onClick={onRefresh}>🔄 Recargar Datos</Button>
        </div>
      </Card>
    </div>
  );
}

