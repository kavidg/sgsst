import { ComplianceLevel } from '../enums/compliance-level.enum';

/**
 * Cumplimiento de un módulo fuente del SG-SST dentro del motor.
 *
 * Extensión ADITIVA (4.2.6 — transporte de resultados V2): los campos
 * opcionales transportan sin transformación lo que el provider ya produce.
 * Providers sin metadata no envían estos campos (quedan `undefined` en JSON),
 * y ningún consumidor existente cambia de comportamiento.
 */
export class ModuleComplianceDto {
  module!: string;
  compliance!: number;
  level!: ComplianceLevel;
  lastUpdated!: string;

  /** Estado textual del módulo (p. ej. 'TARGET_MET' | 'NO_DATA'). Opcional. */
  status?: string;
  /** Cantidad de ítems pendientes (semántica del provider). Opcional. */
  pending?: number;
  /** Cantidad de ítems completados (semántica del provider). Opcional. */
  completed?: number;
  /** Cantidad de ítems vencidos (semántica del provider). Opcional. */
  overdue?: number;
  /** Cumplimiento por fase PHVA (en el provider). Opcional — NO recalculado. */
  phases?: Record<string, number>;
  /**
   * Metadata estadística del provider, transportada SIN transformación
   * (para 4.2.6: formula 'dimensions:v2', weights, dimensions, counters).
   * Ya es JSON-serializable al salir de epp-scoring.ts; el engine no la
   * persiste (los snapshots del timeline mapean explícitamente 4 campos).
   */
  metadata?: Record<string, unknown>;
}
