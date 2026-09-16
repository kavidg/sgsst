import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO de actualización de JobProfile (3.1.3). Todos los campos opcionales.
 */
export class UpdateJobProfileDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  code?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  functions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workConditions?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  associatedHazardIds?: string[];

  @IsOptional()
  @IsString()
  medicalRelevantInformation?: string;

  /** Desactivación blanda (false) / reactivación (true). */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
