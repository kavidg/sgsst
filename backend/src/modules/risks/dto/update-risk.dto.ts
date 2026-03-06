import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRiskDto {
  @IsOptional()
  @IsString()
  process?: string;

  @IsOptional()
  @IsString()
  activity?: string;

  @IsOptional()
  @IsString()
  hazard?: string;

  @IsOptional()
  @IsString()
  risk?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  probability?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consequence?: number;

  @IsOptional()
  @IsString()
  controlMeasures?: string;
}
