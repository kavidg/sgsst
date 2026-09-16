import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  HealthPromotionActivityStatus,
  HealthPromotionCategory,
} from '../schemas/health-promotion-activity.schema';

/**
 * DTO de actualización de actividad de promoción y prevención en salud (3.1.2).
 * Todos los campos son opcionales. La empresa se deriva de la sesión y las
 * referencias (empleados/riesgos) se validan contra el mismo tenant.
 *
 * FASE 32 (anti-double-scoring): `complianceStandard` NO es actualizable.
 * La clasificación normativa (3.1.2 vs 3.1.7) se asigna en la creación y es
 * inmutable: reclasificar evidencia después de crearla rompería la frontera
 * de scoring y permitiría mover cobertura entre estándares retroactivamente.
 */
export class UpdateHealthPromotionActivityDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(HealthPromotionCategory)
  category?: HealthPromotionCategory;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsDateString()
  activityDate?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  targetPopulation?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetEmployeeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  participantEmployeeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  relatedRiskIds?: string[];

  @IsOptional()
  @IsString()
  evidence?: string;

  @IsOptional()
  @IsEnum(HealthPromotionActivityStatus)
  status?: HealthPromotionActivityStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
