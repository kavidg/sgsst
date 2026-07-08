import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { AlertSeverity } from '../schemas/alert.schema';

export class CreateAlertDto {
  @IsMongoId()
  companyId!: string;

  @IsString()
  type!: string;

  @IsString()
  message!: string;

  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @IsOptional()
  @IsMongoId()
  targetUserId?: string;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsOptional()
  @IsString()
  moduleCode?: string;

  @IsOptional()
  @IsString()
  moduleName?: string;

  @IsOptional()
  @IsString()
  submittedBy?: string;

  @IsOptional()
  @IsString()
  submittedAt?: string;

  @IsOptional()
  @IsString()
  documentId?: string;
}
