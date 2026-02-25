import { IsEmail, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsIn(['owner', 'admin', 'member'])
  role!: 'owner' | 'admin' | 'member';

  @IsOptional()
  @IsMongoId()
  companyId?: string;
}
