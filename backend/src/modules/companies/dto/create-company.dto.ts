import { IsEnum, IsString } from 'class-validator';
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
}
