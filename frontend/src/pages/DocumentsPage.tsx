import { FormEvent, useEffect, useState } from 'react';
import {
  DocumentModel,
  createDocument,
  deleteDocument,
  fetchDocuments,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table } from '../components/ui/Table';

interface DocumentsPageProps {
  token: string;
}

export function DocumentsPage({ token }: DocumentsPageProps) {
  const [documents, setDocuments] = useState<DocumentModel[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
