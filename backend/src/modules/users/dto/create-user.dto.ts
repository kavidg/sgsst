import { IsBoolean, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  firebaseUid!: string;

  @IsMongoId()
  companyId!: string;

  @IsIn(['admin', 'employee'])
  role!: 'admin' | 'employee';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
