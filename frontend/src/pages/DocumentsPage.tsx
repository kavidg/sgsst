import { FormEvent, useEffect, useState } from 'react';
import {
  DocumentModel,
  createDocument,
  deleteDocument,
  fetchDocuments,
} from '../api';

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
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h2>Gestión documental</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem' }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del documento" required />
        <input value={type} onChange={(event) => setType(event.target.value)} placeholder="Tipo" />
        <input
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
        />
        <button type="submit" disabled={loading}>Subir documento</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Nombre</th>
            <th align="left">Tipo</th>
            <th align="left">Subido por</th>
            <th align="left">Fecha</th>
            <th align="left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document._id}>
              <td>{document.name}</td>
              <td>{document.type}</td>
              <td>{document.uploadedBy.email}</td>
              <td>{new Date(document.createdAt).toLocaleString()}</td>
              <td>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a href={document.fileUrl} target="_blank" rel="noreferrer">Descargar</a>
                  <button type="button" onClick={() => handleDelete(document._id)}>Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
          {!documents.length ? (
            <tr>
              <td colSpan={5}>No hay documentos cargados.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </section>
  );
}
