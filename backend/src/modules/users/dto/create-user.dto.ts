import { IsEmail, IsIn, IsMongoId, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  firebaseUid!: string;

  @IsEmail()
  email!: string;

  @IsMongoId()
  companyId!: string;

  @IsIn(['owner', 'admin', 'member'])
  role!: 'owner' | 'admin' | 'member';
}
