import { IsMongoId, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsMongoId()
  ownerId!: string;
}
