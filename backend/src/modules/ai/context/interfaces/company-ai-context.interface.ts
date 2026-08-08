import { PhvaAnalysisResult } from '../../../phva/interfaces/phva-analysis.interface';

/**
 * Información operativa de la empresa dentro del contexto IA.
 */
export interface CompanyAIContextCompany {
  /** Identificador de la empresa. */
  id: string;
  /** Nombre de la empresa. */
  name: string;
  /** Tipo de estándares aplicables (7, 21 o 60). Null si no está configurado. */
  standardsType: string | null;
}

/**
 * Estado de cumplimiento agregado del SG-SST dentro del contexto IA.
 */
export interface CompanyAIContextCompliance {
  /** Porcentaje global ponderado (0-100). Reutiliza overallCompliance del Compliance Engine. */
  overallCompliance: number;
  /** Brechas detectadas (títulos de hallazgos reales). */
  gaps: string[];
  /** Recomendaciones de mejora (títulos reales). */
  recommendations: string[];
}

/**
 * Estado documental dentro del contexto IA.
 */
export interface CompanyAIContextDocuments {
  /** Total de documentos registrados. */
  total: number;
  /** Nombres de documentos en estados pendientes (borrador, revisión, aprobación). */
  pending: string[];
  /** Nombres de documentos vencidos (fecha de vencimiento en el pasado y no obsoletos/archivados). */
  expired: string[];
  /** Estado general derivado del conjunto documental. */
  generalStatus: 'SIN_DOCUMENTOS' | 'AL_DIA' | 'CON_PENDIENTES' | 'CON_VENCIDOS';
}

/**
 * Estado de actividades del plan anual dentro del contexto IA.
 */
export interface CompanyAIContextActivities {
  /** Total de actividades del plan anual vigente. */
  total: number;
  /** Títulos de actividades pendientes (Pending). */
  pending: string[];
  /** Títulos de actividades atrasadas (Delayed). */
  delayed: string[];
  /** Títulos de actividades completadas (Completed). */
  completed: string[];
}

/**
 * Contexto operativo central de una empresa para los Engines IA y el futuro Copiloto.
 *
 * Se construye con datos REALES del sistema (sin información ficticia) y queda
 * preparado para que cualquier engine o el Copiloto lo consuman sin volver a
 * consultar MongoDB.
 */
export interface CompanyAIContext {
  company: CompanyAIContextCompany;
  compliance: CompanyAIContextCompliance;
  /** Análisis PHVA real (reutiliza PhvaAnalysisResult del módulo phva). */
  phva: PhvaAnalysisResult;
  documents: CompanyAIContextDocuments;
  activities: CompanyAIContextActivities;
}
