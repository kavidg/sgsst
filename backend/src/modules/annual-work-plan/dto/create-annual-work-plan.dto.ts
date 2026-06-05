import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class CreateAnnualWorkPlanDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class ApproveAnnualWorkPlanDto {
  @IsString()
  approvedByName!: string;

  @IsString()
  approvedByEmail!: string;

  @IsOptional()
  @IsString()
  comments?: string;

  @IsOptional()
  @IsString()
  signatureHash?: string;

  @IsOptional()
  @IsString()
  signatureUrl?: string;
}
