import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsString()
  nit!: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
