import { StepId, StepStatus } from '../../implementation-wizard/schemas/implementation-wizard.schema';

/**
 * Resultado estandarizado que todo provider del Implementation Validator
 * Engine debe retornar.
 *
 * Cada provider consulta exclusivamente su propio módulo fuente y llena solo
 * su información. Los campos `stepId`, `percentage`, `status` y `details` son
 * obligatorios; `data` es opcional para metadatos del módulo.
 */
export interface ProviderValidationResult {
  /** Paso del wizard que valida este provider. */
  stepId: StepId;
  /** Cumplimiento porcentual real del paso (0-100). */
  percentage: number;
  /** Estado derivado del porcentaje (PENDING / IN_PROGRESS / COMPLETED / BLOCKED). */
  status: StepStatus;
  /** Detalle legible del resultado para el historial. */
  details: string;
  /** Criterios que se validaron para otorgar el porcentaje (opcional). */
  criteria?: string[];
  /** Criterios pendientes de cumplir para completar el paso (opcional). */
  pendingCriteria?: string[];
  /** Metadatos adicionales del módulo fuente (opcional). */
  data?: Record<string, unknown>;
}

/**
 * Contrato que todo provider del Implementation Validator Engine debe
 * implementar. Sigue el patrón arquitectónico de ComplianceProvider:
 * un único método que recibe el companyId y retorna un resultado estándar,
 * con tolerancia a datos incompletos (nunca lanza).
 */
export interface WizardValidationProvider {
  /** Paso del wizard que valida (identificador canónico). */
  stepId: StepId;
  getValidation(companyId: string): Promise<ProviderValidationResult>;
}
