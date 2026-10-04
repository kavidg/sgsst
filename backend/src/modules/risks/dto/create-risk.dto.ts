import { Type } from 'class-transformer';
import { IsArray, IsMongoId, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ControlMeasureDto } from './control-measure.dto';

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

  /**
   * ETAPA 1 (PHVA 4.2.2) — Opcional. Controles estructurados; convive
   * con `controlMeasures` legacy. Si se omite, el flujo existente no cambia.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ControlMeasureDto)
  controls?: ControlMeasureDto[];
}
