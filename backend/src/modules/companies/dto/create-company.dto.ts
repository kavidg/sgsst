import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { EconomicSectors } from '../schemas/company.schema';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsString()
  nit!: string;

  @IsEnum(['7', '21', '60'])
  standardsType!: string;

  @IsEnum(EconomicSectors)
  economicSector!: string;

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
}
