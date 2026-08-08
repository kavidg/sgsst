import { ComplianceAlertDto } from '../dto/compliance-overview.dto';
import { FindingDto } from '../dto/finding.dto';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Resultado estandarizado que todo provider de cumplimiento debe retornar.
 *
 * Cada provider únicamente consulta su propio módulo y llena solo su información.
 * Los campos `percentage`, `status`, `findings`, `pending` y `completed` son obligatorios.
 */
export interface ProviderComplianceResult {
  /** Identificador del módulo fuente (ej: 'evaluations', 'risks'). */
  module: string;
  /** Cumplimiento porcentual del módulo (0-100). */
  percentage: number;
  /** Estado textual del módulo (ej: 'EXCELLENT', 'NO_DATA'). */
  status: string;
  /** Hallazgos detectados en el módulo. */
  findings: FindingDto[];
  /** Cantidad de ítems pendientes. */
  pending: number;
  /** Cantidad de ítems completados. */
  completed: number;
  /** Cumplimiento por etapa PHVA (solo EvaluationsProvider). */
  phases?: Partial<Record<CompliancePhaseKey, number>>;
  /** Alertas operativas (solo AlertsProvider). */
  alerts?: ComplianceAlertDto[];
  /** Cantidad de ítems vencidos (planes anuales e inspecciones). */
  overdue?: number;
}

/**
 * Contrato que todo provider del Compliance Intelligence Engine debe implementar.
 */
export interface ComplianceProvider {
  getCompliance(companyId: string): Promise<ProviderComplianceResult>;
}
