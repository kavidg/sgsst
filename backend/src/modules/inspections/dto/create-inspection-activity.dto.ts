import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class CreateInspectionActivityDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @Type(() => Date)
  @IsDate()
  plannedDate!: Date;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedDate?: Date;
}
