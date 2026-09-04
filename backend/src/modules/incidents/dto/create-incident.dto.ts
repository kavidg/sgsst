import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvestigationActionStatus, InvestigationType } from '../schemas/incident.schema';

/**
 * DTO para crear una acción de investigación (correctiva o preventiva).
 * NO almacena información clínica.
 */
export class InvestigationActionDto {
  @IsString()
  action!: string;

  @IsString()
  responsible!: string;

  @IsOptional()
  @IsEnum(InvestigationActionStatus)
  status?: InvestigationActionStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedDate?: Date;
}

export class CreateIncidentDto {
  @IsMongoId()
  employeeId!: string;

  @Type(() => Date)
  @IsDate()
  date!: Date;

  @IsString()
  type!: string;

  @IsString()
  description!: string;

  @IsString()
  severity!: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  daysLost?: number;

  @IsOptional()
  @IsString()
  accidentType?: string;

  // ── Campos de investigación (estándar 3.2.2) ──

  @IsOptional()
  @IsEnum(InvestigationType)
  investigationType?: InvestigationType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rootCauses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  immediateCauses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedFactors?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvestigationActionDto)
  correctiveActions?: InvestigationActionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvestigationActionDto)
  preventiveActions?: InvestigationActionDto[];

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  investigationDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closureDate?: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];
}
