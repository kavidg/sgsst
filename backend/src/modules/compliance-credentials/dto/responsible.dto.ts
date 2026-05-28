import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ResponsibleType } from '../enums/credential.enums';

export class CreateResponsibleDto {
  @IsMongoId() employeeId!: string;
  @IsEnum(ResponsibleType) responsibleType!: ResponsibleType;
  @IsOptional() @IsString() comments?: string;
}

export class UpdateResponsibleDto {
  @IsOptional() @IsEnum(ResponsibleType) responsibleType?: ResponsibleType;
  @IsOptional() @IsString() comments?: string;
}
