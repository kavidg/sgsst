import { IsString } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  name!: string;

  @IsString()
  document!: string;

  @IsString()
  position!: string;

  @IsString()
  area!: string;

  @IsString()
  contractType!: string;

  @IsString()
  status!: string;
}
