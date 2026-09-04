import { Type } from 'class-transformer';
import { IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRiskDto {
  @IsString()
  process!: string;

  @IsString()
  activity!: string;

  @IsString()
  hazard!: string;

  @IsString()
  risk!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  probability!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consequence!: number;

  @IsString()
  controlMeasures!: string;

  @IsOptional()
  @IsMongoId()
  methodologyId?: string;

  @IsOptional()
  @IsString()
  methodologyVersion?: string;
}
