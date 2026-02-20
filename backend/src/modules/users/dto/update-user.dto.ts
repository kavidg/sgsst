import { IsBoolean, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firebaseUid?: string;

  @IsOptional()
  @IsMongoId()
  companyId?: string;

  @IsOptional()
  @IsIn(['admin', 'employee'])
  role?: 'admin' | 'employee';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
