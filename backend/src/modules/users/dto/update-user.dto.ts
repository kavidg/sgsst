import { IsEmail, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firebaseUid?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsMongoId()
  companyId?: string;

  @IsOptional()
  @IsIn(['owner', 'admin', 'member'])
  role?: 'owner' | 'admin' | 'member';
}
