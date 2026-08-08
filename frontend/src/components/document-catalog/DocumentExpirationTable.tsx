import type { DocumentCatalogItem } from '../../types/document-catalog';
import {
  CatalogStatusBadge,
  documentTypeLabel,
  formatDate,
} from './catalog-ui';

/**
 * Tabla de Vencimientos documentales (SPRINT FRONT-5).
 *
 * Componente estrictamente presentacional: recibe los items del catálogo
 * (DocumentInstance) y los muestra en tabla responsive. NO inventa fechas de
 * vencimiento: DocumentInstance aún no expone expirationDate, por lo que la
 * columna muestra "Sin fecha definida" hasta que el backend la provea.
 * Sin any, TypeScript estricto.
 */
export function DocumentExpirationTable({
  documents,
  loading = false,
}: {
  documents: DocumentCatalogItem[];
  loading?: boolean;
}) {
  if (loading) {
    return <p className="muted">Cargando...</p>;
  }

  if (documents.length === 0) {
    return <p className="muted">No hay documentos por vencer o vencidos.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Tipo</th>
            <th>Empresa</th>
            <th>Fecha generación</th>
            <th>Estado</th>
            <th>Expiración</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.title}</strong></td>
              <td>{documentTypeLabel(item.documentType)}</td>
              <td>{item.companyName ?? '—'}</td>
              <td style={{ fontSize: '.85rem' }}>{formatDate(item.generatedAt)}</td>
              <td><CatalogStatusBadge status={item.status} /></td>
              <td style={{ fontSize: '.85rem' }}>{item.expirationDate ? formatDate(item.expirationDate) : 'Sin fecha definida'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
