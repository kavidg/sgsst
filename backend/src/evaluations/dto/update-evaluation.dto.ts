import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateEvaluationDto {
  @IsOptional()
  @IsBoolean()
  complies?: boolean;

  @IsOptional()
  @IsString()
  observation?: string;
}
