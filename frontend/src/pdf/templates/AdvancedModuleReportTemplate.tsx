import { Document, Page, Text, View } from '@react-pdf/renderer';
import { PdfHeader, PdfSection, PdfTable, pdfStyles } from '../components';

/**
 * Plantilla PDF genérica para reportes de los módulos Advanced Management.
 *
 * Reutiliza los estilos y componentes existentes de frontend/src/pdf
 * (pdfStyles, PdfHeader, PdfSection, PdfTable) — no duplica estilos.
 *
 * Estructura:
 * - Encabezado profesional (título, empresa, NIT, fecha de generación)
 * - Versión y estado del documento
 * - Secciones con tablas Campo/Valor
 * - Pie de página con numeración
 */
export interface AdvancedModuleReportRow {
  label: string;
  value: string;
}

export interface AdvancedModuleReportSection {
  title: string;
  rows: AdvancedModuleReportRow[];
}

export interface AdvancedModuleReportData {
  title: string;
  companyName?: string;
  nit?: string;
  version?: string;
  status?: string;
  generatedAt?: string;
  sections: AdvancedModuleReportSection[];
}

export function AdvancedModuleReportTemplate({ data }: { data: AdvancedModuleReportData }) {
  const metaLines = [
    data.version ? `Versión: ${data.version}` : null,
    data.status ? `Estado: ${data.status}` : null,
  ].filter(Boolean) as string[];

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          data={{
            title: data.title,
            date: data.generatedAt ?? new Date().toLocaleString(),
            company: {
              name: data.companyName ?? '',
              nit: data.nit ?? '',
            },
          }}
        />

        {metaLines.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.paragraph}>{metaLines.join(' · ')}</Text>
          </View>
        )}

        {data.sections.map((section, index) => (
          <PdfSection key={`${section.title}-${index}`} title={section.title}>
            {section.rows.length > 0 ? (
              <PdfTable
                headers={['Campo', 'Valor']}
                rows={section.rows.map((row) => [row.label, row.value])}
              />
            ) : (
              <Text style={pdfStyles.paragraph}>Sin registros.</Text>
            )}
          </PdfSection>
        ))}

        <Text
          fixed
          style={pdfStyles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
