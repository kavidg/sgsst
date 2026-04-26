import { Document, Page, Text, View } from '@react-pdf/renderer';
import { PdfHeader, PdfSection, PdfTable, pdfStyles } from './components';
import {
  AutoevaluacionInput,
  PdfDocumentPayload,
  PdfDocumentType,
  PlanAnualInput,
  PlanMejoramientoInput,
  PoliticaSstInput,
  ReporteAusentismoInput,
  ReporteInspeccionesInput,
} from './types';

function PoliticaSstDocument({ data }: { data: PoliticaSstInput }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader data={data} />
        <PdfSection title="Objetivo"><Text style={pdfStyles.paragraph}>{data.objective}</Text></PdfSection>
        <PdfSection title="Alcance"><Text style={pdfStyles.paragraph}>{data.scope}</Text></PdfSection>
        <PdfSection title="Compromisos">
          {data.commitments.map((commitment) => (
            <Text key={commitment} style={pdfStyles.paragraph}>• {commitment}</Text>
          ))}
        </PdfSection>
      </Page>
    </Document>
  );
}

function PlanAnualDocument({ data }: { data: PlanAnualInput }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader data={data} />
        <PdfSection title="Periodo"><Text>{data.period}</Text></PdfSection>
        <PdfSection title="Actividades programadas">
          <PdfTable
            headers={['Actividad', 'Responsable', 'Inicio', 'Fin', 'Estado']}
            rows={data.activities.map((activity) => [
              activity.activity,
              activity.responsible,
              activity.startDate,
              activity.endDate,
              activity.status,
            ])}
          />
        </PdfSection>
      </Page>
    </Document>
  );
}

function AutoevaluacionDocument({ data }: { data: AutoevaluacionInput }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader data={data} />
        <PdfSection title="Resumen">
          <PdfTable
            headers={['Total', 'Cumple', 'No cumple', 'No aplica']}
            rows={[[
              String(data.summary.total),
              String(data.summary.cumple),
              String(data.summary.noCumple),
              String(data.summary.noAplica),
            ]]}
          />
        </PdfSection>
        <PdfSection title="Detalle de autoevaluación">
          <PdfTable
            headers={['Código', 'Estado', 'Plan de mejora']}
            rows={data.evaluations.map((evaluation) => [
              evaluation.code,
              evaluation.status,
              evaluation.improvementPlan?.activity ?? '-',
            ])}
          />
        </PdfSection>
      </Page>
    </Document>
  );
}

function PlanMejoramientoDocument({ data }: { data: PlanMejoramientoInput }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader data={data} />
        <PdfSection title="Actividades de mejoramiento">
          <PdfTable
            headers={['Estándar', 'Actividad', 'Responsable', 'Inicio', 'Fin', 'Observaciones']}
            rows={data.actions.map((action) => [
              action.standardCode,
              action.activity,
              action.responsible,
              action.startDate,
              action.endDate,
              action.observations,
            ])}
          />
        </PdfSection>
      </Page>
    </Document>
  );
}

function ReporteInspeccionesDocument({ data }: { data: ReporteInspeccionesInput }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader data={data} />
        <PdfSection title="Inspecciones">
          <PdfTable
            headers={['Título', 'Fecha', 'Estado', 'Responsable', 'Frecuencia']}
            rows={data.inspections.map((inspection) => [
              inspection.title,
              inspection.plannedDate,
              inspection.status,
              inspection.responsible ?? '-',
              inspection.frequency ?? '-',
            ])}
          />
        </PdfSection>
      </Page>
    </Document>
  );
}

function ReporteAusentismoDocument({ data }: { data: ReporteAusentismoInput }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader data={data} />
        <PdfSection title="Indicadores">
          <PdfTable
            headers={['Total casos', 'Total días perdidos', 'Promedio días por caso']}
            rows={[[
              String(data.stats.totalCasos),
              String(data.stats.totalDiasPerdidos),
              data.stats.promedioDias.toFixed(2),
            ]]}
          />
        </PdfSection>
        <PdfSection title="Registros">
          <PdfTable
            headers={['Tipo', 'Inicio', 'Fin', 'Días', 'Descripción']}
            rows={data.records.map((record) => [
              record.tipo,
              record.fechaInicio,
              record.fechaFin,
              String(record.dias),
              record.descripcion ?? '-',
            ])}
          />
        </PdfSection>
        <View><Text style={pdfStyles.footer}>Reporte generado automáticamente por SG-SST</Text></View>
      </Page>
    </Document>
  );
}

export function createPdfTemplate(type: PdfDocumentType, payload: PdfDocumentPayload) {
  switch (type) {
    case 'POLITICA_SST':
      return <PoliticaSstDocument data={payload as PoliticaSstInput} />;
    case 'PLAN_ANUAL_TRABAJO':
      return <PlanAnualDocument data={payload as PlanAnualInput} />;
    case 'AUTOEVALUACION_SG_SST':
      return <AutoevaluacionDocument data={payload as AutoevaluacionInput} />;
    case 'PLAN_MEJORAMIENTO':
      return <PlanMejoramientoDocument data={payload as PlanMejoramientoInput} />;
    case 'REPORTE_INSPECCIONES':
      return <ReporteInspeccionesDocument data={payload as ReporteInspeccionesInput} />;
    case 'REPORTE_AUSENTISMO':
      return <ReporteAusentismoDocument data={payload as ReporteAusentismoInput} />;
    default:
      return null;
  }
}
