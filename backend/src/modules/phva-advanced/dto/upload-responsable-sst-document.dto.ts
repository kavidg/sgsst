import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ResponsableSstDocumentType } from '../schemas/phva-advanced-responsable-sst.schema';

export class UploadResponsableSstDocumentDto {
  @IsEnum(ResponsableSstDocumentType)
  type!: ResponsableSstDocumentType;

  @IsOptional()
  @IsString()
  finalUserDate?: string;
}
