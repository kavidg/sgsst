import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO de creación de JobProfile (3.1.3).
 * companyId NO viaja en el DTO: lo asigna el servidor desde la sesión.
 */
export class CreateJobProfileDto {
  /** Código interno del perfil dentro de la empresa. */
  @IsNotEmpty()
  @IsString()
  code!: string;

  /** Nombre del cargo. */
  @IsNotEmpty()
  @IsString()
  name!: string;

  /** Descripción del cargo. */
  @IsOptional()
  @IsString()
  description?: string;

  /** Funciones principales del cargo. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  functions?: string[];

  /** Responsabilidades del cargo. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];

  /** Condiciones relevantes del trabajo. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workConditions?: string[];

  /** Referencias (ObjectId) a peligros de la matriz Risk del mismo tenant. */
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  associatedHazardIds?: string[];

  /** Información del cargo relevante para la valoración médica ocupacional. */
  @IsOptional()
  @IsString()
  medicalRelevantInformation?: string;

  /** Estado activo (por defecto true). */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
