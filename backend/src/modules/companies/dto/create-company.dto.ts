import { IsEnum, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsString()
  nit!: string;

  @IsEnum(['7', '21', '60'])
  standardsType!: string;
}
