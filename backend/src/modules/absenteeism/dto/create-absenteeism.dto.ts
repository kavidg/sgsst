import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
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

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  soporte?: string;
}
