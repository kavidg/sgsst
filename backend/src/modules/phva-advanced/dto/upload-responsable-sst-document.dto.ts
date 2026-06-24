import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ResponsableSstDocumentType } from '../schemas/phva-advanced-responsable-sst.schema';

export class UploadResponsableSstDocumentDto {
  @IsEnum(ResponsableSstDocumentType)
  type!: ResponsableSstDocumentType;

  @IsOptional()
  @IsString()
  finalUserDate?: string;

  // OCR fields for license documents
  @IsOptional()
  @IsString()
  ocrLicenseNumber?: string;

  @IsOptional()
  @IsString()
  ocrIssueDate?: string;

  @IsOptional()
  @IsString()
  ocrExpirationDate?: string;

  @IsOptional()
  @IsString()
  ocrIssuingAuthority?: string;

  @IsOptional()
  @IsString()
  ocrLicenseHolder?: string;

  @IsOptional()
  @IsString()
  rawOcrText?: string;
}
