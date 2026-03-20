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

  @IsIn(['owner', 'admin', 'member', 'manager'])
  role!: 'owner' | 'admin' | 'member' | 'manager';

  @IsOptional()
  @IsMongoId()
  companyId?: string;
}
