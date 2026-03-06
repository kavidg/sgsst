import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

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
}
