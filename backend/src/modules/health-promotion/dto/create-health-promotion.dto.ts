import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  HealthPromotionActivityStatus,
  HealthPromotionCategory,
  HealthPromotionComplianceStandard,
  LifestyleTopic,
} from '../schemas/health-promotion-activity.schema';

/**
 * Creación de una actividad de promoción y prevención en salud (3.1.2).
 *
 * La empresa (companyId) SIEMPRE se deriva de la sesión autenticada en el
 * controller; nunca se acepta del cuerpo de la petición. La validación de
 * referencias de trabajadores (targetEmployeeIds/participantEmployeeIds) y de
 * riesgos (relatedRiskIds) contra el MISMO tenant se realiza en
 * HealthPromotionService.
 */
export class CreateHealthPromotionActivityDto {
  @IsString()
  @MaxLength(60)
  code!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(HealthPromotionCategory)
  category?: HealthPromotionCategory;

  /**
   * FASE 32 — frontera normativa anti-double-scoring: a qué estándar puntúa
   * esta actividad (3.1.2 promoción/prevención ó 3.1.7 estilos de vida y
   * entornos saludables). Una evidencia = un estándar de scoring. Omitido
   * → STANDARD_3_1_2 (compatibilidad con 3.1.2).
   */
  @IsOptional()
  @IsEnum(HealthPromotionComplianceStandard)
  complianceStandard?: HealthPromotionComplianceStandard;

  /**
   * FASE 32 — tipificación explícita del tema 3.1.7 (no búsqueda libre de
   * texto): controles de tabaquismo/alcoholismo/farmacodependencia y otros,
   * estilos de vida y entornos saludables. Metadata de gestión SST.
   */
  @IsOptional()
  @IsEnum(LifestyleTopic)
  lifestyleTopic?: LifestyleTopic;

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
