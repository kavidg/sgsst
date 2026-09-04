import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentStatus } from '../schemas/document.schema';

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  type?: string;

  /** Optional expiration date (ISO 8601 string). */
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  /** Optional document status. Defaults to ACTIVE. */
  @IsOptional()
  @IsEnum(DocumentStatus)
  documentStatus?: DocumentStatus;
}
