import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { AbsenteeismType } from '../schemas/absenteeism.schema';

export class CreateAbsenteeismDto {
  @IsMongoId()
  companyId!: string;

  @IsMongoId()
  userId!: string;

  @IsEnum(AbsenteeismType)
  tipo!: AbsenteeismType;

  @Type(() => Date)
  @IsDate()
  fechaInicio!: Date;

  @Type(() => Date)
  @IsDate()
  fechaFin!: Date;

  /**
   * FASE 35E-2 (3.3.6): declara si la ausencia corresponde a incapacidad
   * médica (laboral o común). Opcional y compatible con registros históricos
   * (ausente = señal no disponible). Metadata estadística: NO es contenido
   * clínico.
   */
  @IsOptional()
  @IsBoolean()
  medicalIncapacity?: boolean;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  soporte?: string;
}
