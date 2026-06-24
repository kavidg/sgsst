import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { EconomicSectors } from '../schemas/company.schema';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nit?: string;

  @IsOptional()
  @IsEnum(['7', '21', '60'])
  standardsType?: string;

  @IsOptional()
  @IsEnum(EconomicSectors)
  economicSector?: string;

  @IsOptional()
  @IsString()
  economicActivity?: string;

  @IsOptional()
  @IsString()
  ciiuCode?: string;

  @IsOptional()
  @IsEnum(['I', 'II', 'III', 'IV', 'V'])
  arlRiskLevel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  employeeCount?: number;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;
}
