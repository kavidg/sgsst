/**
 * Modal de generación documental del DocumentGenerationEngine (SPRINT FRONT-6).
 *
 * Permite al usuario seleccionar una plantilla, rellenar sus variables y
 * generar un documento mediante POST /document-generation/generate (motor).
 * El resultado se descarga como archivo DOCX y queda registrado como
 * DocumentInstance en el catálogo.
 *
 * SIN generación PDF client-side.
 * SIN any, TypeScript estricto.
 */
import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { AvailableTemplate } from '../../services/document-generation.service';
import { getAvailableTemplates, generateDocument } from '../../services/document-generation.service';

type Props = {
  open: boolean;
  token: string;
  companyId: string;
  onClose: () => void;
  /** Callback tras generación exitosa, para que el padre refresque el catálogo. */
  onGenerated: () => void;
};

export function DocumentGenerateModal({ open, token, companyId, onClose, onGenerated }: Props) {
  const [templates, setTemplates] = useState<AvailableTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Carga la lista de plantillas al abrir el modal.
  useEffect(() => {
    if (!open) return;
    setTemplatesLoading(true);
    setError('');
    setSuccess('');
    setSelectedTemplateId('');
    setVariableValues({});
    getAvailableTemplates(token, companyId)
      .then((list) => {
        setTemplates(list);
        if (list.length > 0) {
          setSelectedTemplateId(list[0].id);
          setVariableValues(list[0].variables.reduce<Record<string, string>>((acc, v) => {
            acc[v] = '';
            return acc;
          }, {}));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error cargando plantillas'))
      .finally(() => setTemplatesLoading(false));
  }, [open, token, companyId]);

  // Actualiza las variables al cambiar de plantilla.
  useEffect(() => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl) {
      setVariableValues(tpl.variables.reduce<Record<string, string>>((acc, v) => {
        if (!(v in acc)) acc[v] = '';
        return acc;
      }, {}));
    }
  }, [selectedTemplateId, templates]);

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplateId) { setError('Selecciona una plantilla'); return; }
    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      // Las variables vacías se envían como null (el motor las resuelve a null).
      const context = Object.fromEntries(
        Object.entries(variableValues).map(([k, v]) => [k, v === '' ? null : v]),
      );
      const { blob, fileName } = await generateDocument(token, selectedTemplateId, context);

      // Descarga directa del archivo generado.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`Documento generado: ${fileName}`);
      onGenerated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando documento');
    } finally {
      setGenerating(false);
    }
  }, [selectedTemplateId, token, variableValues, onGenerated]);

  const handleClose = useCallback(() => {
    setTemplates([]);
    setSelectedTemplateId('');
    setVariableValues({});
    setError('');
    setSuccess('');
    onClose();
  }, [onClose]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <Modal isOpen={open} title="Generar Documento (DocumentGenerationEngine)" onClose={handleClose}>
      <div className="form-grid" style={{ display: 'grid', gap: '1rem' }}>

        {templatesLoading ? <p className="muted">Cargando plantillas...</p> : null}

        {!templatesLoading && templates.length === 0 ? (
          <p className="muted">No hay plantillas disponibles. Sube una plantilla DOCX desde el módulo de plantillas.</p>
        ) : null}

        {!templatesLoading && templates.length > 0 ? (
          <>
            <label className="label">Plantilla</label>
            <Select
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                setError('');
                setSuccess('');
              }}
              aria-label="Seleccionar plantilla"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </Select>

            {selectedTemplate && selectedTemplate.variables.length > 0 ? (
              <div style={{ display: 'grid', gap: '.75rem' }}>
                <label className="label">Variables de la plantilla</label>
                {selectedTemplate.variables.map((varName) => (
                  <Input
                    key={varName}
                    placeholder={varName}
                    value={variableValues[varName] ?? ''}
                    onChange={(e) =>
                      setVariableValues((prev) => ({ ...prev, [varName]: e.target.value }))
                    }
                    aria-label={`Valor para ${varName}`}
                  />
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '.85rem' }}>
                Esta plantilla no requiere variables adicionales.
              </p>
            )}

            {error ? <div className="advanced-management__alert" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>{error}</div> : null}
            {success ? <div className="advanced-management__alert" style={{ borderColor: '#bbf7d0', background: '#f0fdf4', color: '#166534' }}>{success}</div> : null}

            <div className="actions">
              <Button type="button" onClick={handleGenerate} disabled={generating}>
                {generating ? 'Generando...' : 'Generar Documento'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
            </div>
          </>
        ) : null}

        {!templatesLoading && templates.length === 0 && (
          <div className="actions">
            <Button type="button" variant="secondary" onClick={handleClose}>Cerrar</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}