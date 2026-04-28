import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import {
  fetchTemplateVariables,
  fetchTemplatesByCompany,
  DashboardEvaluationModel,
  DocumentModel,
  AbsenteeismModel,
  AbsenteeismStats,
  createDocument,
  deleteDocument,
  fetchAbsenteeismByCompany,
  fetchAbsenteeismStatsByCompany,
  fetchDashboardEvaluations,
  fetchDocuments,
  fetchInspectionScheduleByCompany,
  fetchMyCompanies,
  generateTemplate,
  InspectionActivityModel,
  TemplateModel,
  TemplateVariableModel,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table } from '../components/ui/Table';
import { useCompanyContext } from '../context/CompanyContext';
import { buildPdfPayload, PDF_DOCUMENT_OPTIONS } from '../pdf/config';
import { createPdfTemplate } from '../pdf/templates';
import { PdfDocumentType } from '../pdf/types';

interface DocumentsPageProps {
  token: string;
}

export function DocumentsPage({ token }: DocumentsPageProps) {
  const { companyId } = useCompanyContext();
  const [documents, setDocuments] = useState<DocumentModel[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [documentType, setDocumentType] = useState<PdfDocumentType>('POLITICA_SST');
  const [title, setTitle] = useState(PDF_DOCUMENT_OPTIONS[0].defaultTitle);
  const [logoUrl, setLogoUrl] = useState('');
  const [objective, setObjective] = useState('');
  const [scope, setScope] = useState('');
  const [commitments, setCommitments] = useState('');
  const [period, setPeriod] = useState(new Date().getFullYear().toString());
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateModel[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateVariables, setTemplateVariables] = useState<TemplateVariableModel[]>([]);
  const [templateFormData, setTemplateFormData] = useState<Record<string, string>>({});
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  const [companyName, setCompanyName] = useState('Empresa no definida');
  const [companyNit, setCompanyNit] = useState('N/A');
  const [evaluations, setEvaluations] = useState<DashboardEvaluationModel[]>([]);
  const [inspections, setInspections] = useState<InspectionActivityModel[]>([]);
  const [absenteeismRecords, setAbsenteeismRecords] = useState<AbsenteeismModel[]>([]);
  const [absenteeismStats, setAbsenteeismStats] = useState<AbsenteeismStats>({
    totalCasos: 0,
    totalDiasPerdidos: 0,
    promedioDias: 0,
  });

  const loadDocuments = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await fetchDocuments(token);
      setDocuments(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar documentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, [token]);

  useEffect(() => {
    const option = PDF_DOCUMENT_OPTIONS.find((item) => item.value === documentType);
    if (option) {
      setTitle(option.defaultTitle);
    }
  }, [documentType]);

  useEffect(() => {
    const loadPdfData = async () => {
      if (!companyId) {
        return;
      }

      try {
        const [companies, evaluationData, inspectionData, absenteeismData, absenteeismStatsData] = await Promise.all([
          fetchMyCompanies(token),
          fetchDashboardEvaluations(token, companyId),
          fetchInspectionScheduleByCompany(token, companyId),
          fetchAbsenteeismByCompany(token, companyId),
          fetchAbsenteeismStatsByCompany(token, companyId),
        ]);

        const currentCompany = companies.find((company) => company.id === companyId);
        if (currentCompany) {
          setCompanyName(currentCompany.name);
          setCompanyNit(currentCompany.nit);
        }

        setEvaluations(evaluationData);
        setInspections(inspectionData);
        setAbsenteeismRecords(absenteeismData);
        setAbsenteeismStats(absenteeismStatsData);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar datos para los PDF.');
      }
    };

    void loadPdfData();
  }, [companyId, token]);

  useEffect(() => {
    const loadTemplates = async () => {
      if (!companyId) {
        setTemplates([]);
        setSelectedTemplateId('');
        setTemplateVariables([]);
        setTemplateFormData({});
        return;
      }

      try {
        const data = await fetchTemplatesByCompany(token, companyId);
        setTemplates(data);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar plantillas.');
      }
    };

    void loadTemplates();
  }, [companyId, token]);

  useEffect(() => {
    const loadTemplateVariables = async () => {
      if (!selectedTemplateId) {
        setTemplateVariables([]);
        setTemplateFormData({});
        return;
      }

      try {
        const variables = await fetchTemplateVariables(token, selectedTemplateId);
        setTemplateVariables(variables);
        setTemplateFormData(
          variables.reduce<Record<string, string>>((accumulator, variable) => {
            accumulator[variable.name] = '';
            return accumulator;
          }, {}),
        );
      } catch {
        const selectedTemplate = templates.find((template) => template._id === selectedTemplateId);
        const fallbackVariables = (selectedTemplate?.variables ?? []).map((variableName) => ({
          name: variableName,
          label: variableName,
        }));

        setTemplateVariables(fallbackVariables);
        setTemplateFormData(
          fallbackVariables.reduce<Record<string, string>>((accumulator, variable) => {
            accumulator[variable.name] = '';
            return accumulator;
          }, {}),
        );
      }
    };

    void loadTemplateVariables();
  }, [selectedTemplateId, templates, token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError('Debes seleccionar un archivo.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await createDocument(token, { name, type, file });
      setName('');
      setType('');
      setFile(null);
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible subir el documento.');
      setLoading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    setLoading(true);
    setError('');

    try {
      await deleteDocument(token, documentId);
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar el documento.');
      setLoading(false);
    }
  };

  const handleTemplateFieldChange = (name: string, value: string) => {
    setTemplateFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleGenerateTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTemplateId) {
      setError('Debes seleccionar una plantilla.');
      return;
    }

    setIsGeneratingTemplate(true);
    setError('');

    try {
      const { blob, fileName } = await generateTemplate(token, selectedTemplateId, { data: templateFormData });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible generar el documento.');
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const payload = useMemo(
    () =>
      buildPdfPayload({
        type: documentType,
        title,
        date: new Date().toLocaleDateString('es-CO'),
        companyName,
        nit: companyNit,
        logoUrl,
        objective,
        scope,
        commitments: commitments.split('\n').map((item) => item.trim()),
        period,
        evaluations,
        inspections,
        absenteeismRecords,
        absenteeismStats,
      }),
    [
      absenteeismRecords,
      absenteeismStats,
      commitments,
      companyName,
      companyNit,
      documentType,
      evaluations,
      inspections,
      logoUrl,
      objective,
      period,
      scope,
      title,
    ],
  );

  const pdfDocument = useMemo(() => createPdfTemplate(documentType, payload), [documentType, payload]);

  return (
    <section className="grid">
      <Card title="Gestión documental">
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="grid grid-2">
            <label className="field"><span className="label">Nombre del documento</span><Input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label className="field"><span className="label">Tipo</span><Input value={type} onChange={(event) => setType(event.target.value)} /></label>
          </div>
          <label className="field"><span className="label">Archivo</span><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
          <div className="actions"><Button type="submit" disabled={loading}>Subir documento</Button></div>
        </form>
      </Card>

      <Card title="Generador PDF SG-SST">
        <div className="form-grid">
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Documento</span>
              <select className="input" value={documentType} onChange={(event) => setDocumentType(event.target.value as PdfDocumentType)}>
                {PDF_DOCUMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field"><span className="label">Título</span><Input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          </div>
          <div className="grid grid-2">
            <label className="field"><span className="label">Nombre empresa</span><Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
            <label className="field"><span className="label">NIT</span><Input value={companyNit} onChange={(event) => setCompanyNit(event.target.value)} /></label>
          </div>
          <label className="field"><span className="label">URL logo</span><Input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://..." /></label>

          {documentType === 'POLITICA_SST' ? (
            <>
              <label className="field"><span className="label">Objetivo</span><textarea className="input" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
              <label className="field"><span className="label">Alcance</span><textarea className="input" rows={3} value={scope} onChange={(event) => setScope(event.target.value)} /></label>
              <label className="field"><span className="label">Compromisos (uno por línea)</span><textarea className="input" rows={4} value={commitments} onChange={(event) => setCommitments(event.target.value)} /></label>
            </>
          ) : null}

          {documentType === 'PLAN_ANUAL_TRABAJO' ? (
            <label className="field"><span className="label">Periodo</span><Input value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
          ) : null}

          <div className="actions">
            <Button type="button" variant="secondary" onClick={() => setIsPreviewOpen(true)}>Previsualizar PDF</Button>
            {pdfDocument ? (
              <PDFDownloadLink document={pdfDocument} fileName={`${documentType.toLowerCase()}.pdf`} className="btn">
                {({ loading: pdfLoading }) => (pdfLoading ? 'Generando...' : 'Descargar PDF')}
              </PDFDownloadLink>
            ) : null}
          </div>
        </div>
      </Card>

      <Card title="Generador dinámico de documentos">
        <form className="form-grid" onSubmit={handleGenerateTemplate}>
          <label className="field">
            <span className="label">Plantilla</span>
            <select
              className="input"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              required
            >
              <option value="">Selecciona una plantilla</option>
              {templates.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          {templateVariables.map((variable) => (
            <label className="field" key={variable.name}>
              <span className="label">{variable.label}</span>
              <Input
                value={templateFormData[variable.name] ?? ''}
                onChange={(event) => handleTemplateFieldChange(variable.name, event.target.value)}
                placeholder={`Ingresa ${variable.label.toLowerCase()}`}
                required
              />
            </label>
          ))}

          {selectedTemplateId && !templateVariables.length ? (
            <p className="text-sm text-gray-600">Esta plantilla no tiene variables configuradas.</p>
          ) : null}

          <div className="actions">
            <Button type="submit" disabled={isGeneratingTemplate || !selectedTemplateId}>
              {isGeneratingTemplate ? 'Generando...' : 'Generar documento'}
            </Button>
          </div>
        </form>
      </Card>

      {isPreviewOpen && pdfDocument ? (
        <div className="sidebar-backdrop" style={{ display: 'block', zIndex: 80 }} onClick={() => setIsPreviewOpen(false)}>
          <div className="card" style={{ width: '90vw', maxWidth: '1100px', height: '85vh', margin: '5vh auto' }} onClick={(event) => event.stopPropagation()}>
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Vista previa</h3>
              <Button type="button" variant="ghost" onClick={() => setIsPreviewOpen(false)}>Cerrar</Button>
            </div>
            <PDFViewer style={{ width: '100%', height: 'calc(100% - 40px)' }}>{pdfDocument}</PDFViewer>
          </div>
        </div>
      ) : null}

      <Table>
        <thead><tr><th className="border border-black p-3">Nombre</th><th className="border border-black p-3">Tipo</th><th className="border border-black p-3">Subido por</th><th className="border border-black p-3">Fecha</th><th className="border border-black p-3">Acciones</th></tr></thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document._id}>
              <td className="border border-black p-3">{document.name}</td><td className="border border-black p-3">{document.type}</td><td className="border border-black p-3">{document.uploadedBy.email}</td><td className="border border-black p-3">{new Date(document.createdAt).toLocaleString()}</td>
              <td className="border border-black p-3">
                <div className="actions">
                  <a className="btn btn-secondary" href={document.fileUrl} target="_blank" rel="noreferrer">Descargar</a>
                  <Button type="button" variant="danger" onClick={() => handleDelete(document._id)}>Eliminar</Button>
                </div>
              </td>
            </tr>
          ))}
          {!documents.length ? <tr><td className="border border-black p-3" colSpan={5}>No hay documentos cargados.</td></tr> : null}
        </tbody>
      </Table>

      {error ? <pre className="error">{error}</pre> : null}
    </section>
  );
}
