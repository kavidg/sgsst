import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { CredentialCourseType } from '../enums/credential.enums';

export class CreateCredentialDto {
  @IsOptional() @IsMongoId() responsibleUserId?: string;
  @IsEnum(CredentialCourseType) courseType!: CredentialCourseType;
  @IsOptional() @IsString() trainingEntity?: string;
  @IsOptional() @IsString() certificateNumber?: string;
  @IsOptional() @IsDateString() courseDate?: string;
  @IsOptional() @IsDateString() expirationDate?: string;
  @IsOptional() @IsString() comments?: string;
  @IsOptional() @IsMongoId() relatedFiftyHourCredentialId?: string;
}
