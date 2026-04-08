import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';

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
  @IsMongoId()
  ownerId?: string;
}
