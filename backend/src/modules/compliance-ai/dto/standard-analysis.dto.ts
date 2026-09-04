/**
 * Contrato de respuesta del análisis inteligente de un estándar PHVA.
 *
 * NO recalcula compliance: el percentage/status/level provienen exclusivamente
 * del ComplianceEngine. La capa de análisis solo INTERPRETA los datos reales.
 *
 * Preparado para reutilizarse con futuros estándares:
 * 2.9.1 Adquisiciones, 2.7.1 Matriz legal, 2.5.1 Documentos, etc.
 */

import { StandardEvidenceContext } from '../standard-analysis/adapters/standard-evidence.adapter';

/** Prioridad de un problema detectado. */
export type IssuePriority = 'HIGH' | 'MEDIUM' | 'LOW';

/** Problema clave detectado por el analizador. */
export interface StandardAnalysisKeyIssue {
  /** ID estable (coincide con finding.id del ComplianceEngine cuando aplica). */
  id: string;
  /** Título legible del problema. */
  title: string;
  /** Prioridad del problema. */
  priority: IssuePriority;
  /** Descripción cualitativa del impacto (sin puntos numéricos falsos). */
  impact: string;
  /** Recomendación concreta y accionable. */
  recommendation: string;
}

/** Análisis interpretativo de un estándar. */
export interface StandardAnalysisInterpretation {
  /** Resumen textual del estado actual. */
  summary: string;
  /** Problemas principales detectados (máximo 5). */
  keyIssues: StandardAnalysisKeyIssue[];
  /** Acciones rápidas recomendadas (máximo 3). */
  quickWins: string[];
  /** Siguientes pasos priorizados (máximo 3). */
  nextSteps: string[];
}

/** Métricas agregadas del dominio del estándar. */
export interface StandardAnalysisMetrics {
  [key: string]: number;
}

/** Respuesta completa del análisis de un estándar. */
export interface StandardAnalysisResponse {
  /** Código del estándar (ej: '2.9.1'). */
  standardCode: string;
  /** Título del estándar. */
  standardTitle: string;
  /** Módulo del ComplianceEngine (ej: 'acquisitions'). */
  module: string;

  /** Porcentaje de cumplimiento (del ComplianceEngine, NO recalculado). */
  compliancePercentage: number;
  /** Estado de cumplimiento (del ComplianceEngine). */
  complianceStatus: string;
  /** Nivel de cumplimiento (del ComplianceEngine). */
  level: string;

  /** Análisis interpretativo. */
  analysis: StandardAnalysisInterpretation;

  /** Métricas agregadas del dominio (sin PII). */
  metrics: StandardAnalysisMetrics;

  /** Timestamp de evaluación. */
  evaluatedAt: string;

  /** true si existen datos suficientes para analizar. */
  dataAvailable: boolean;

  /** Contexto de evidencia documental (retrocompatible: undefined si no hay adapter). */
  evidence?: StandardEvidenceContext;
}

/** Contexto que se pasa a cada analyzer. */
export interface StandardAnalysisContext {
  /** Empresa evaluada. */
  companyId: string;
  /** Resultado del ComplianceEngine para este módulo. */
  moduleCompliance: {
    module: string;
    compliance: number;
    level: string;
    lastUpdated: string;
  };
  /** Hallazgos del ComplianceEngine para este módulo. */
  findings: Array<{
    id: string;
    module: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    responsible: string;
    dueDate: string;
    createdAt: string;
  }>;
  /** Overview completo del ComplianceEngine. */
  overview: {
    overallCompliance: number;
    phaseCompliance: { plan: number; do: number; check: number; act: number };
    moduleCompliance: Array<{
      module: string;
      compliance: number;
      level: string;
      lastUpdated: string;
    }>;
  };

  /** Contexto de evidencia documental (opcional, solo si el estándar tiene adapter). */
  evidence?: StandardEvidenceContext;
}

/** Interfaz de un analizador de estándar específico. */
export interface StandardAnalyzer {
  /** Código del estándar que soporta este analyzer (ej: '2.9.1'). */
  supports(standardCode: string): boolean;
  /** Módulo del ComplianceEngine que analiza. */
  getModule(): string;
  /** Genera el análisis interpretativo. */
  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation;
  /** Genera las métricas del dominio. */
  getMetrics(context: StandardAnalysisContext): StandardAnalysisMetrics;
}
