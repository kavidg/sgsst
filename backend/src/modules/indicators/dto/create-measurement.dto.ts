import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMeasurementDto {
  @IsMongoId()
  indicatorId!: string;

  @IsString()
  @MaxLength(20)
  period!: string;

  @Type(() => Date)
  @IsDate()
  periodStart!: Date;

  @Type(() => Date)
  @IsDate()
  periodEnd!: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  numerator?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  denominator?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  calculatedValue?: number;

  @IsOptional()
  @IsString()
  evidence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
