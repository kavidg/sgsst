import { Type } from 'class-transformer';
import { IsArray, IsMongoId, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ControlMeasureDto } from './control-measure.dto';

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

  @IsOptional()
  @IsMongoId()
  methodologyId?: string;

  @IsOptional()
  @IsString()
  methodologyVersion?: string;

  /**
   * ETAPA 1 (PHVA 4.2.2) — Opcional. Reemplazo atómico del array de
   * controles estructurados. Si se omite, no se toca el campo.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ControlMeasureDto)
  controls?: ControlMeasureDto[];
}
