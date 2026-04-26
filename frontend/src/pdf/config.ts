import { AbsenteeismModel, AbsenteeismStats, DashboardEvaluationModel, InspectionActivityModel } from '../api';
import { PdfDocumentPayload, PdfDocumentType } from './types';

interface BuildPayloadParams {
  type: PdfDocumentType;
  title: string;
  date: string;
  companyName: string;
  nit: string;
  logoUrl?: string;
  objective?: string;
  scope?: string;
  commitments?: string[];
  period?: string;
  activities?: Array<{
    activity: string;
    responsible: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
  evaluations?: DashboardEvaluationModel[];
  inspections?: InspectionActivityModel[];
  absenteeismStats?: AbsenteeismStats;
  absenteeismRecords?: AbsenteeismModel[];
}

export const PDF_DOCUMENT_OPTIONS: Array<{ value: PdfDocumentType; label: string; defaultTitle: string }> = [
  { value: 'POLITICA_SST', label: 'Política SST', defaultTitle: 'Política de Seguridad y Salud en el Trabajo' },
  { value: 'PLAN_ANUAL_TRABAJO', label: 'Plan anual de trabajo', defaultTitle: 'Plan anual de trabajo SG-SST' },
  { value: 'AUTOEVALUACION_SG_SST', label: 'Autoevaluación SG-SST', defaultTitle: 'Autoevaluación SG-SST' },
  { value: 'PLAN_MEJORAMIENTO', label: 'Plan de mejoramiento', defaultTitle: 'Plan de mejoramiento SG-SST' },
  { value: 'REPORTE_INSPECCIONES', label: 'Reporte de inspecciones', defaultTitle: 'Reporte de inspecciones' },
  { value: 'REPORTE_AUSENTISMO', label: 'Reporte de ausentismo', defaultTitle: 'Reporte de ausentismo' },
];

export function buildPdfPayload(params: BuildPayloadParams): PdfDocumentPayload {
  const base = {
    title: params.title,
    date: params.date,
    company: {
      name: params.companyName,
      nit: params.nit,
      logoUrl: params.logoUrl,
    },
  };

  switch (params.type) {
    case 'POLITICA_SST':
      return {
        ...base,
        objective: params.objective ?? '',
        scope: params.scope ?? '',
        commitments: params.commitments?.filter(Boolean) ?? [],
      };
    case 'PLAN_ANUAL_TRABAJO':
      return {
        ...base,
        period: params.period ?? '',
        activities: params.activities ?? [],
      };
    case 'AUTOEVALUACION_SG_SST': {
      const evaluations = params.evaluations ?? [];
      return {
        ...base,
        summary: {
          total: evaluations.length,
          cumple: evaluations.filter((evaluation) => evaluation.status === 'CUMPLE').length,
          noCumple: evaluations.filter((evaluation) => evaluation.status === 'NO_CUMPLE').length,
          noAplica: evaluations.filter((evaluation) => evaluation.status === 'NO_APLICA').length,
        },
        evaluations,
      };
    }
    case 'PLAN_MEJORAMIENTO':
      return {
        ...base,
        actions: (params.evaluations ?? [])
          .filter((evaluation) => Boolean(evaluation.improvementPlan?.activity))
          .map((evaluation) => ({
            standardCode: evaluation.code,
            activity: evaluation.improvementPlan?.activity ?? '',
            responsible: evaluation.improvementPlan?.responsible ?? '-',
            startDate: evaluation.improvementPlan?.startDate ?? '-',
            endDate: evaluation.improvementPlan?.endDate ?? '-',
            observations: evaluation.improvementPlan?.observations ?? '-',
          })),
      };
    case 'REPORTE_INSPECCIONES':
      return {
        ...base,
        inspections: params.inspections ?? [],
      };
    case 'REPORTE_AUSENTISMO':
      return {
        ...base,
        stats: params.absenteeismStats ?? {
          totalDiasPerdidos: 0,
          totalCasos: 0,
          promedioDias: 0,
        },
        records: params.absenteeismRecords ?? [],
      };
    default:
      throw new Error('Tipo de documento no soportado');
  }
}
