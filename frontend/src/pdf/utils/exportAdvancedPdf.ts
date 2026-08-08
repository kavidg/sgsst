import { ReactElement } from 'react';
import { pdf } from '@react-pdf/renderer';

/**
 * Helper único de exportación PDF para reportes Advanced Management.
 *
 * Recibe el nombre del archivo y el componente PDF (un <Document> de
 * @react-pdf/renderer), genera el Blob en application/pdf, dispara la
 * descarga como .pdf y libera la URL creada.
 */
export interface ExportAdvancedPdfParams {
  filename: string;
  document: ReactElement;
}

export async function exportAdvancedPdf({ filename, document: pdfDocument }: ExportAdvancedPdfParams): Promise<void> {
  const blob = await pdf(pdfDocument).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
