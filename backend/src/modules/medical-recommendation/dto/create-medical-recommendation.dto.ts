import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RecommendationType,
  RecommendationStatus,
  ActionStatus,
} from '../schemas/medical-recommendation.schema';

/**
 * DTO para crear una acción derivada de una recomendación.
 */
export class CreateActionDto {
  /** Descripción de la acción administrativa. */
  @IsString()
  action!: string;

  /** Fecha en que se registró la acción. */
  @IsDateString()
  date!: string;

  /** Responsable de ejecutar la acción. */
  @IsString()
  responsible!: string;

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
 * DTO para crear una recomendación médica ocupacional.
 *
 * NO acepta companyId: se resuelve desde el usuario autenticado.
 */
export class CreateMedicalRecommendationDto {
  /** ID del empleado asociado a la recomendación. */
  @IsMongoId()
  employeeId!: string;

  /** ID del examen ocupacional relacionado (opcional). */
  @IsOptional()
  @IsMongoId()
  examId?: string;

  /** Tipo de recomendación (categoría administrativa). */
  @IsEnum(RecommendationType)
  recommendationType!: RecommendationType;

  /** Descripción administrativa de la recomendación. */
  @IsString()
  description!: string;

  /** Estado administrativo de la recomendación. */
  @IsOptional()
  @IsEnum(RecommendationStatus)
  status?: RecommendationStatus;

  /** Fecha en que se asignó la recomendación. */
  @IsDateString()
  assignedDate!: string;

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
  @Type(() => CreateActionDto)
  actions?: CreateActionDto[];
}
