import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
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
  @IsMongoId()
  ownerId?: string;
}
