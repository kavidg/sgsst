import { IsDateString, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCredentialDocumentDto {
  @IsMongoId() credentialId!: string;
  @IsString() fileName!: string;
  @IsString() fileUrl!: string;
  @IsOptional() @IsString() storagePath?: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @IsDateString() ocrCourseDate?: string;
  @IsOptional() @IsString() ocrCertificateNumber?: string;
  @IsOptional() @IsString() ocrTrainingEntity?: string;
  @IsOptional() @IsString() @MaxLength(20000) rawOcrText?: string;
}
