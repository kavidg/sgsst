import { Types } from 'mongoose';
import { AutomationStatus } from '../../compliance-automation/enums/automation-status.enum';
import { ExecuteAutomationDto } from '../dto/execute-automation.dto';

/**
 * Resultado de una validación pura.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Roles con permiso para ejecutar automatizaciones (además de los guards). */
const ACCEPTED_ROLES = ['owner', 'admin', 'manager'] as const;

/**
 * Valida la petición de ejecución: empresa, AutomationResult en estado READY,
 * campos obligatorios y consistencia interna del AutomationResult.
 */
export function validateExecutionRequest(dto: ExecuteAutomationDto): ValidationResult {
  const errors: string[] = [];

  if (!Types.ObjectId.isValid(dto.companyId)) {
    errors.push('companyId debe ser un ObjectId válido');
  }

  if (!dto.executedBy?.trim()) {
    errors.push('executedBy es obligatorio');
  }

  if (!dto.executionDate || Number.isNaN(new Date(dto.executionDate).getTime())) {
    errors.push('executionDate debe ser una fecha válida (ISO 8601)');
  }

  const result = dto.automationResult;
  if (!result) {
    errors.push('automationResult es obligatorio');
    return { valid: false, errors };
  }

  if (result.automationStatus !== AutomationStatus.READY) {
    errors.push('El AutomationResult debe estar en estado READY para ejecutarse');
  }

  if (result.accepted !== true) {
    errors.push('El AutomationResult debe estar aceptado');
  }

  if (!Array.isArray(result.generatedActions) || result.generatedActions.length === 0) {
    errors.push('automationResult.generatedActions debe contener al menos una acción');
  }

  // Consistencia: conteos no negativos y coherentes con las acciones.
  if (typeof result.generatedActivities !== 'number' || result.generatedActivities < 0) {
    errors.push('generatedActivities debe ser un número no negativo');
  }
  if (typeof result.generatedObjectives !== 'number' || result.generatedObjectives < 0) {
    errors.push('generatedObjectives debe ser un número no negativo');
  }
  if (typeof result.generatedIndicators !== 'number' || result.generatedIndicators < 0) {
    errors.push('generatedIndicators debe ser un número no negativo');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Valida el rol del usuario.
 *
 * Los guards (FirebaseAuthGuard + RolesGuard) son la primera línea de
 * defensa; este helper permite validar el rol de forma declarativa.
 */
export function validateRole(role: string | undefined): ValidationResult {
  if (!role) {
    return { valid: false, errors: ['Rol no informado'] };
  }

  if (!(ACCEPTED_ROLES as readonly string[]).includes(role)) {
    return { valid: false, errors: ['Rol no autorizado para ejecutar automatizaciones'] };
  }

  return { valid: true, errors: [] };
}
