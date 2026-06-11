import { IsString, IsOptional, IsEnum, IsMongoId, IsDateString, IsNumber } from 'class-validator';
import { DocumentType, DocumentStatus } from '../schemas/document-master.schema';

export class CreateDocumentDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsOptional()
  @IsString()
  process?: string;

  @IsOptional()
  @IsNumber()
  version?: number;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsMongoId()
  ownerUser?: string;

  @IsOptional()
  @IsMongoId()
  approvalUser?: string;

  @IsOptional()
  @IsDateString()
  approvalDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  process?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsMongoId()
  ownerUser?: string;

  @IsOptional()
  @IsMongoId()
  approvalUser?: string;

  @IsOptional()
  @IsDateString()
  approvalDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}

export class UploadDocumentVersionDto {
  @IsString()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  changeDescription?: string;

  @IsOptional()
  @IsNumber()
  versionNumber?: number;
}

export class SubmitForApprovalDto {
  @IsOptional()
  @IsString()
  comments?: string;
}

export class ApproveDocumentDto {
  @IsMongoId()
  approvedBy!: string;

  @IsOptional()
  @IsString()
  comments?: string;

  @IsOptional()
  @IsString()
  signatureHash?: string;

  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @IsOptional()
  @IsString()
  signerName?: string;

  @IsOptional()
  @IsString()
  signerEmail?: string;
}

export class RejectDocumentDto {
  @IsString()
  rejectionReason!: string;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class CreateRetentionRuleDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsNumber()
  retentionYears!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRetentionRuleDto {
  @IsOptional()
  @IsNumber()
  retentionYears?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  isActive?: boolean;
}

export class SearchDocumentDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  process?: string;

  @IsOptional()
  @IsMongoId()
  ownerUser?: string;

  @IsOptional()
  @IsMongoId()
  approvalUser?: string;

  @IsOptional()
  @IsNumber()
  version?: number;

  @IsOptional()
  @IsDateString()
  expirationBefore?: string;

  @IsOptional()
  @IsDateString()
  expirationAfter?: string;

  @IsOptional()
  @IsNumber()
  year?: number;
}

export class ChangeDocumentStatusDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
