import { Types } from 'mongoose';
import { ActionRecommendationDto } from '../../compliance-action-engine/dto/action-recommendation.dto';
import { AcceptRecommendationDto } from '../dto/accept-recommendation.dto';

/**
 * Resultado de una validación pura.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Roles con permiso para aceptar recomendaciones (además de los guards). */
const ACCEPTED_ROLES = ['owner', 'admin', 'manager'] as const;

/**
 * Valida los campos obligatorios de la petición y el formato de empresa.
 */
export function validateAcceptRequest(dto: AcceptRecommendationDto): ValidationResult {
  const errors: string[] = [];

  if (!dto.recommendationId?.trim()) {
    errors.push('recommendationId es obligatorio');
  }

  if (!Types.ObjectId.isValid(dto.companyId)) {
    errors.push('companyId debe ser un ObjectId válido');
  }

  if (!dto.acceptedBy?.trim()) {
    errors.push('acceptedBy es obligatorio');
  }

  if (!dto.acceptDate || Number.isNaN(new Date(dto.acceptDate).getTime())) {
    errors.push('acceptDate debe ser una fecha válida (ISO 8601)');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Valida el estado de la recomendación: debe existir y no estar aceptada.
 */
export function validateRecommendationState(
  recommendation: ActionRecommendationDto | null,
): ValidationResult {
  if (!recommendation) {
    return { valid: false, errors: ['La recomendación no existe para la empresa indicada'] };
  }

  if (recommendation.accepted === true) {
    return { valid: false, errors: ['La recomendación ya fue aceptada'] };
  }

  return { valid: true, errors: [] };
}

/**
 * Type guard: una recomendación es aceptable si existe y no fue aceptada.
 * Permite estrechar el tipo en el servicio sin aserciones no nulas.
 */
export function isAcceptableRecommendation(
  recommendation: ActionRecommendationDto | null,
): recommendation is ActionRecommendationDto {
  return recommendation !== null && recommendation.accepted !== true;
}

/**
 * Valida el rol del usuario.
 *
 * Los guards (FirebaseAuthGuard + RolesGuard) son la primera línea de
 * defensa; este helper permite validar el rol de forma declarativa cuando
 * el rol esté disponible en el contexto de la petición.
 */
export function validateRole(role: string | undefined): ValidationResult {
  if (!role) {
    return { valid: false, errors: ['Rol no informado'] };
  }

  if (!(ACCEPTED_ROLES as readonly string[]).includes(role)) {
    return { valid: false, errors: ['Rol no autorizado para aceptar recomendaciones'] };
  }

  return { valid: true, errors: [] };
}
