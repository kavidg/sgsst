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
import { InvestigationType } from '../schemas/incident.schema';
import { InvestigationActionDto } from './create-incident.dto';

export class UpdateIncidentDto {
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  status?: string;

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
