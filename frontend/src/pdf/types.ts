import { AbsenteeismModel, AbsenteeismStats, DashboardEvaluationModel, InspectionActivityModel } from '../api';

export type PdfDocumentType =
  | 'POLITICA_SST'
  | 'PLAN_ANUAL_TRABAJO'
  | 'AUTOEVALUACION_SG_SST'
  | 'PLAN_MEJORAMIENTO'
  | 'REPORTE_INSPECCIONES'
  | 'REPORTE_AUSENTISMO';

export interface PdfCompanyInfo {
  name: string;
  nit: string;
  logoUrl?: string;
}

export interface PdfBaseInput {
  title: string;
  date: string;
  company: PdfCompanyInfo;
}

export interface PoliticaSstInput extends PdfBaseInput {
  objective: string;
  scope: string;
  commitments: string[];
}

export interface PlanAnualInput extends PdfBaseInput {
  period: string;
  activities: Array<{
    activity: string;
    responsible: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
}

export interface AutoevaluacionInput extends PdfBaseInput {
  summary: {
    total: number;
    cumple: number;
    noCumple: number;
    noAplica: number;
  };
  evaluations: DashboardEvaluationModel[];
}

export interface PlanMejoramientoInput extends PdfBaseInput {
  actions: Array<{
    standardCode: string;
    activity: string;
    responsible: string;
    startDate: string;
    endDate: string;
    observations: string;
  }>;
}

export interface ReporteInspeccionesInput extends PdfBaseInput {
  inspections: InspectionActivityModel[];
}

export interface ReporteAusentismoInput extends PdfBaseInput {
  stats: AbsenteeismStats;
  records: AbsenteeismModel[];
}

export type PdfDocumentPayload =
  | PoliticaSstInput
  | PlanAnualInput
  | AutoevaluacionInput
  | PlanMejoramientoInput
  | ReporteInspeccionesInput
  | ReporteAusentismoInput;
