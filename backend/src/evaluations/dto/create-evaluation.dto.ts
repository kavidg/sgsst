import { IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateEvaluationDto {
  @IsString()
  standard!: string;

  @IsString()
  description!: string;

  @IsBoolean()
  complies!: boolean;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsMongoId()
  companyId!: string;
}
