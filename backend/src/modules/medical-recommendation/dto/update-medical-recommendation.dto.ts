import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RecommendationType,
  RecommendationStatus,
  ActionStatus,
} from '../schemas/medical-recommendation.schema';

/**
 * DTO para actualizar una acción derivada de una recomendación.
 */
export class UpdateActionDto {
  /** Descripción de la acción administrativa. */
  @IsOptional()
  @IsString()
  action?: string;

  /** Fecha en que se registró la acción. */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** Responsable de ejecutar la acción. */
  @IsOptional()
  @IsString()
  responsible?: string;

  /** Estado administrativo de la acción. */
  @IsOptional()
  @IsEnum(ActionStatus)
  status?: ActionStatus;

  /** Fecha límite para completar la acción (opcional). */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Fecha en que se completó la acción (opcional). */
  @IsOptional()
  @IsDateString()
  completedDate?: string;
}

/**
 * DTO para actualizar una recomendación médica ocupacional.
 *
 * Todos los campos son opcionales.
 * NO permite modificar companyId.
 */
export class UpdateMedicalRecommendationDto {
  /** ID del empleado asociado a la recomendación. */
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  /** ID del examen ocupacional relacionado (opcional). */
  @IsOptional()
  @IsMongoId()
  examId?: string;

  /** Tipo de recomendación (categoría administrativa). */
  @IsOptional()
  @IsEnum(RecommendationType)
  recommendationType?: RecommendationType;

  /** Descripción administrativa de la recomendación. */
  @IsOptional()
  @IsString()
  description?: string;

  /** Estado administrativo de la recomendación. */
  @IsOptional()
  @IsEnum(RecommendationStatus)
  status?: RecommendationStatus;

  /** Fecha en que se asignó la recomendación. */
  @IsOptional()
  @IsDateString()
  assignedDate?: string;

  /** Fecha límite para completar la recomendación. */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Fecha en que se completó la recomendación (opcional). */
  @IsOptional()
  @IsDateString()
  completedDate?: string;

  /** Indica si se verificó administrativamente la efectividad. */
  @IsOptional()
  @IsBoolean()
  effectivenessVerified?: boolean;

  /** Fecha de verificación de efectividad (opcional). */
  @IsOptional()
  @IsDateString()
  effectivenessVerifiedDate?: string;

  /** Acciones administrativas derivadas de la recomendación. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateActionDto)
  actions?: UpdateActionDto[];
}
