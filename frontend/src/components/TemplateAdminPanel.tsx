import { useCallback, useEffect, useState } from 'react';
import {
  PolicyTemplateModel,
  CreatePolicyTemplatePayload,
  UpdatePolicyTemplatePayload,
  fetchPolicyTemplates,
  createPolicyTemplate,
  updatePolicyTemplate,
  deletePolicyTemplate,
  seedPolicyTemplates,
} from '../api';
import { Button } from './ui/Button';

const SECTORS = [
  'General', 'Construcción', 'Manufactura', 'Comercio', 'Servicios',
  'Transporte', 'Salud', 'Educación', 'Tecnología', 'Agricultura',
  'Minería', 'Petróleo y Gas', 'Pesca', 'Hoteles', 'Logística', 'Turismo',
];

const EMPTY_TEMPLATE: CreatePolicyTemplatePayload = {
  sector: '',
  sectorRisks: [],
  sectorCommitments: [],
  legalReferences: [],
  recommendedResponsibilities: [],
  suggestedAnnualObjectives: [],
  active: true,
};

export default function TemplateAdminPanel({ token }: { token: string }) {
  const [templates, setTemplates] = useState<PolicyTemplateModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  interface PolicyTemplateDraft extends PolicyTemplateModel {
    _isNew?: boolean;
  }
  const [editingTemplate, setEditingTemplate] = useState<PolicyTemplateDraft | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const notify = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchPolicyTemplates(token);
      setTemplates(data);
    } catch (e: any) {
      notify('Error al cargar plantillas: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const handleSeed = async () => {
    if (!token) return;
    try {
      const result = await seedPolicyTemplates(token);
      notify(`✅ ${result.count} plantillas insertadas por defecto.`);
      await load();
    } catch (e: any) {
      notify('Error: ' + (e.message || ''));
    }
  };

  const handleSave = async () => {
    if (!token || !editingTemplate) return;
    const { _id, _isNew, ...data } = editingTemplate;
    try {
      if (_isNew) {
        const payload: CreatePolicyTemplatePayload = {
          sector: data.sector,
          sectorRisks: data.sectorRisks,
          sectorCommitments: data.sectorCommitments,
          legalReferences: data.legalReferences,
          recommendedResponsibilities: data.recommendedResponsibilities,
          suggestedAnnualObjectives: data.suggestedAnnualObjectives,
          active: data.active,
        };
        await createPolicyTemplate(token, payload);
        notify('✅ Plantilla creada exitosamente.');
      } else if (_id) {
        const payload: UpdatePolicyTemplatePayload = {
          sector: data.sector,
          sectorRisks: data.sectorRisks,
          sectorCommitments: data.sectorCommitments,
          legalReferences: data.legalReferences,
          recommendedResponsibilities: data.recommendedResponsibilities,
          suggestedAnnualObjectives: data.suggestedAnnualObjectives,
          active: data.active,
        };
        await updatePolicyTemplate(token, _id, payload);
        notify('✅ Plantilla actualizada.');
      }
      setEditingTemplate(null);
      await load();
    } catch (e: any) {
      notify('Error: ' + (e.message || ''));
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await deletePolicyTemplate(token, id);
      notify('✅ Plantilla eliminada.');
      setShowDeleteConfirm(null);
      await load();
    } catch (e: any) {
      notify('Error: ' + (e.message || ''));
    }
  };

  // Add new item helper
  const addRisk = () => {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      sectorRisks: [...(editingTemplate.sectorRisks || []), ''],
    });
  };
  const addCommitment = () => {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      sectorCommitments: [...(editingTemplate.sectorCommitments || []), ''],
    });
  };
  const addLegalRef = () => {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      legalReferences: [...(editingTemplate.legalReferences || []), ''],
    });
  };
  const addResponsibility = () => {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      recommendedResponsibilities: [...(editingTemplate.recommendedResponsibilities || []), ''],
    });
  };
  const addObjective = () => {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      suggestedAnnualObjectives: [...(editingTemplate.suggestedAnnualObjectives || []), {
        name: '', indicator: '', targetValue: 100, responsible: '', description: '',
      }],
    });
  };

  if (loading && templates.length === 0) {
    return <div className="policy-page__loading"><p className="muted">Cargando plantillas...</p></div>;
  }

  return (
    <div className="policy-page__section" style={{ maxWidth: 'none' }}>
      {toast && <div className="toast-alert" style={{ marginBottom: '1rem' }}><p>{toast}</p></div>}

      <div className="actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h3>📦 Administración de Plantillas por Sector Económico</h3>
        <div className="actions">
          <Button type="button" onClick={handleSeed}>🌱 Restaurar plantillas por defecto</Button>
          <Button type="button"
            onClick={() => setEditingTemplate({ ...EMPTY_TEMPLATE, _isNew: true } as unknown as PolicyTemplateDraft)}>
            ➕ Nueva plantilla
          </Button>
        </div>
      </div>

      <p className="muted">
        Administra las plantillas de la Política SST para cada sector económico.
        Los cambios aplican automáticamente al generar la política. Puedes añadir nuevos sectores sin modificar código.
      </p>

      {/* Active templates */}
      <div className="policy-page__templates-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {templates.length === 0 && (
          <div className="policy-page__empty">
            <p className="muted">No hay plantillas. Haz clic en "Restaurar plantillas por defecto" o crea una nueva.</p>
          </div>
        )}

        {templates.map((template) => (
          <div key={template._id} className={`policy-page__version-card ${template.active ? '' : 'policy-page__version-card--archived'}`}
            style={{ opacity: template.active ? 1 : 0.6 }}>
            <div className="policy-page__version-header">
              <strong style={{ fontSize: '1.05rem' }}>{template.sector}</strong>
              <span className="muted">v{template.version}</span>
              <span className={`policy-badge ${template.active ? 'policy-badge--success' : 'policy-badge--archived'}`}>
                {template.active ? '✅ Activa' : '📦 Inactiva'}
              </span>
            </div>
            <div className="policy-page__version-details" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <span>⚠ {template.sectorRisks.length} riesgos</span>
              <span>📋 {template.sectorCommitments.length} compromisos</span>
              <span>⚖ {template.legalReferences.length} referencias legales</span>
              <span>👤 {template.recommendedResponsibilities.length} responsabilidades</span>
              <span>🎯 {template.suggestedAnnualObjectives.length} objetivos anuales</span>
            </div>
            <div className="actions" style={{ marginTop: '.5rem' }}>
              <Button type="button" variant="secondary"
                onClick={() => setEditingTemplate({ ...template })}>
                ✏️ Editar
              </Button>
              <Button type="button" variant="ghost"
                onClick={() => setShowDeleteConfirm(template._id)}>
                🗑️ Eliminar
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>🗑️ Eliminar plantilla</h3>
            <p>¿Estás seguro de eliminar esta plantilla? La política SST usará la plantilla genérica como respaldo.</p>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <Button type="button" onClick={() => handleDelete(showDeleteConfirm)}>✅ Sí, eliminar</Button>
              <Button type="button" variant="secondary" onClick={() => setShowDeleteConfirm(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create modal */}
      {editingTemplate && (
        <div className="modal-overlay" onClick={() => setEditingTemplate(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>{editingTemplate._isNew ? '➕ Nueva plantilla' : `✏️ Editar: ${editingTemplate.sector}`}</h3>

            <div className="form-grid">
              <label className="field">
                <span className="label">Sector económico</span>
                {editingTemplate._isNew ? (
                  <select className="input" value={editingTemplate.sector}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, sector: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input className="input" value={editingTemplate.sector} disabled />
                )}
              </label>
              <label className="field">
                <span className="label">Activa</span>
                <select className="input" value={editingTemplate.active ? 'true' : 'false'}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, active: e.target.value === 'true' })}>
                  <option value="true">✅ Activa</option>
                  <option value="false">📦 Inactiva</option>
                </select>
              </label>
            </div>

            {/* Risks */}
            <div className="policy-page__section" style={{ marginTop: '1rem' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h4>⚠ Riesgos del sector</h4>
                <Button type="button" variant="ghost" onClick={addRisk}>+ Añadir riesgo</Button>
              </div>
              {(editingTemplate.sectorRisks || []).map((risk, i) => (
                <div key={i} className="field" style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '.85rem', color: '#6b7280', minWidth: 24 }}>{i + 1}.</span>
                  <textarea className="input" rows={2} value={risk} style={{ flex: 1 }}
                    onChange={(e) => {
                      const risks = [...(editingTemplate.sectorRisks || [])];
                      risks[i] = e.target.value;
                      setEditingTemplate({ ...editingTemplate, sectorRisks: risks });
                    }}
                    placeholder="Describe el riesgo específico del sector..."
                  />
                  <button className="policy-page__back" style={{ color: '#dc2626' }}
                    onClick={() => {
                      setEditingTemplate({
                        ...editingTemplate,
                        sectorRisks: (editingTemplate.sectorRisks || []).filter((_, idx) => idx !== i),
                      });
                    }}>✕</button>
                </div>
              ))}
            </div>

            {/* Commitments */}
            <div className="policy-page__section" style={{ marginTop: '1rem' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h4>📋 Compromisos del sector</h4>
                <Button type="button" variant="ghost" onClick={addCommitment}>+ Añadir compromiso</Button>
              </div>
              {(editingTemplate.sectorCommitments || []).map((commitment, i) => (
                <div key={i} className="field" style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '.85rem', color: '#6b7280', minWidth: 24 }}>{i + 1}.</span>
                  <textarea className="input" rows={2} value={commitment} style={{ flex: 1 }}
                    onChange={(e) => {
                      const list = [...(editingTemplate.sectorCommitments || [])];
                      list[i] = e.target.value;
                      setEditingTemplate({ ...editingTemplate, sectorCommitments: list });
                    }}
                    placeholder="Describe el compromiso específico del sector..."
                  />
                  <button className="policy-page__back" style={{ color: '#dc2626' }}
                    onClick={() => {
                      setEditingTemplate({
                        ...editingTemplate,
                        sectorCommitments: (editingTemplate.sectorCommitments || []).filter((_, idx) => idx !== i),
                      });
                    }}>✕</button>
                </div>
              ))}
            </div>

            {/* Legal references */}
            <div className="policy-page__section" style={{ marginTop: '1rem' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h4>⚖ Referencias legales</h4>
                <Button type="button" variant="ghost" onClick={addLegalRef}>+ Añadir referencia</Button>
              </div>
              {(editingTemplate.legalReferences || []).map((ref, i) => (
                <div key={i} className="field" style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '.85rem', color: '#6b7280', minWidth: 24 }}>{i + 1}.</span>
                  <textarea className="input" rows={2} value={ref} style={{ flex: 1 }}
                    onChange={(e) => {
                      const list = [...(editingTemplate.legalReferences || [])];
                      list[i] = e.target.value;
                      setEditingTemplate({ ...editingTemplate, legalReferences: list });
                    }}
                    placeholder="Ej: Decreto 1072 de 2015 — SST General..."
                  />
                  <button className="policy-page__back" style={{ color: '#dc2626' }}
                    onClick={() => {
                      setEditingTemplate({
                        ...editingTemplate,
                        legalReferences: (editingTemplate.legalReferences || []).filter((_, idx) => idx !== i),
                      });
                    }}>✕</button>
                </div>
              ))}
            </div>

            {/* Responsibilities */}
            <div className="policy-page__section" style={{ marginTop: '1rem' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h4>👤 Responsabilidades recomendadas</h4>
                <Button type="button" variant="ghost" onClick={addResponsibility}>+ Añadir responsabilidad</Button>
              </div>
              {(editingTemplate.recommendedResponsibilities || []).map((resp, i) => (
                <div key={i} className="field" style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '.85rem', color: '#6b7280', minWidth: 24 }}>{i + 1}.</span>
                  <textarea className="input" rows={2} value={resp} style={{ flex: 1 }}
                    onChange={(e) => {
                      const list = [...(editingTemplate.recommendedResponsibilities || [])];
                      list[i] = e.target.value;
                      setEditingTemplate({ ...editingTemplate, recommendedResponsibilities: list });
                    }}
                    placeholder="Ej: GERENCIA: Aprobar estrategia..."
                  />
                  <button className="policy-page__back" style={{ color: '#dc2626' }}
                    onClick={() => {
                      setEditingTemplate({
                        ...editingTemplate,
                        recommendedResponsibilities: (editingTemplate.recommendedResponsibilities || []).filter((_, idx) => idx !== i),
                      });
                    }}>✕</button>
                </div>
              ))}
            </div>

            {/* Annual Objectives */}
            <div className="policy-page__section" style={{ marginTop: '1rem' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h4>🎯 Objetivos anuales sugeridos</h4>
                <Button type="button" variant="ghost" onClick={addObjective}>+ Añadir objetivo</Button>
              </div>
              {(editingTemplate.suggestedAnnualObjectives || []).map((obj, i) => (
                <div key={i} className="policy-page__version-card" style={{ marginBottom: '.5rem' }}>
                  <div className="form-grid grid-2">
                    <label className="field">
                      <span className="label">Nombre del objetivo</span>
                      <input className="input" value={obj.name}
                        onChange={(e) => {
                          const list = [...(editingTemplate.suggestedAnnualObjectives || [])];
                          list[i] = { ...list[i], name: e.target.value };
                          setEditingTemplate({ ...editingTemplate, suggestedAnnualObjectives: list });
                        }}
                        placeholder="Ej: Reducir accidentalidad..."
                      />
                    </label>
                    <label className="field">
                      <span className="label">Indicador</span>
                      <input className="input" value={obj.indicator}
                        onChange={(e) => {
                          const list = [...(editingTemplate.suggestedAnnualObjectives || [])];
                          list[i] = { ...list[i], indicator: e.target.value };
                          setEditingTemplate({ ...editingTemplate, suggestedAnnualObjectives: list });
                        }}
                        placeholder="Ej: % de reducción..."
                      />
                    </label>
                    <label className="field">
                      <span className="label">Meta</span>
                      <input className="input" type="number" value={obj.targetValue}
                        onChange={(e) => {
                          const list = [...(editingTemplate.suggestedAnnualObjectives || [])];
                          list[i] = { ...list[i], targetValue: Number(e.target.value) };
                          setEditingTemplate({ ...editingTemplate, suggestedAnnualObjectives: list });
                        }}
                      />
                    </label>
                    <label className="field">
                      <span className="label">Responsable</span>
                      <input className="input" value={obj.responsible}
                        onChange={(e) => {
                          const list = [...(editingTemplate.suggestedAnnualObjectives || [])];
                          list[i] = { ...list[i], responsible: e.target.value };
                          setEditingTemplate({ ...editingTemplate, suggestedAnnualObjectives: list });
                        }}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span className="label">Descripción (opcional)</span>
                    <input className="input" value={obj.description || ''}
                      onChange={(e) => {
                        const list = [...(editingTemplate.suggestedAnnualObjectives || [])];
                        list[i] = { ...list[i], description: e.target.value };
                        setEditingTemplate({ ...editingTemplate, suggestedAnnualObjectives: list });
                      }}
                    />
                  </label>
                  <button className="policy-page__back" style={{ color: '#dc2626', marginTop: '.25rem' }}
                    onClick={() => {
                      setEditingTemplate({
                        ...editingTemplate,
                        suggestedAnnualObjectives: (editingTemplate.suggestedAnnualObjectives || []).filter((_, idx) => idx !== i),
                      });
                    }}>✕ Eliminar objetivo</button>
                </div>
              ))}
            </div>

            <div className="actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button type="button" onClick={handleSave}>
                💾 Guardar plantilla
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingTemplate(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
