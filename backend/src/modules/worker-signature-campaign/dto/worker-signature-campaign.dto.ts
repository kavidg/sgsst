import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCampaignDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() documentType!: string;
  @IsOptional() @IsString() documentVersion?: string;
  @IsOptional() @IsString() documentUrl?: string;
  @IsOptional() @IsString() documentContent?: string;
  @IsOptional() @IsString() sourceModule?: string;
  @IsOptional() @IsString() sourceEntityId?: string;
  @IsOptional() @IsBoolean() requireOtp?: boolean;
  @IsOptional() @IsBoolean() requireSignature?: boolean;
  @IsOptional() @IsBoolean() requirePdfAcceptance?: boolean;
  @IsOptional() @IsArray() reminderDays?: number[];
  @IsOptional() @IsString() expiresAt?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() documentVersion?: string;
  @IsOptional() @IsString() documentUrl?: string;
  @IsOptional() @IsString() documentContent?: string;
  @IsOptional() @IsBoolean() requireOtp?: boolean;
  @IsOptional() @IsBoolean() requireSignature?: boolean;
  @IsOptional() @IsBoolean() requirePdfAcceptance?: boolean;
  @IsOptional() @IsArray() reminderDays?: number[];
  @IsOptional() @IsString() expiresAt?: string;
}

export class AddWorkersDto {
  @IsArray()
  workers!: Array<{
    employeeId?: string;
    name: string;
    identification: string;
    position?: string;
    area?: string;
    phone?: string;
    email?: string;
  }>;
}

export class CampaignStatusDto {
  @IsString() status!: string;
}

export class ValidateIdentityDto {
  @IsString() token!: string;
  @IsString() identification!: string;
  @IsOptional() @IsString() phone?: string;
}

export class SendOtpDto {
  @IsString() token!: string;
  @IsOptional() @IsString() deliveryMethod?: string;
}

export class ValidateOtpDto {
  @IsString() token!: string;
  @IsString() code!: string;
}

export class SignDocumentDto {
  @IsString() token!: string;
  @IsBoolean() hasRead!: boolean;
  @IsOptional() @IsString() signatureMethod?: string;
  @IsOptional() @IsString() signatureData?: string;
  @IsOptional() @IsString() signatureHash?: string;
  @IsOptional() @IsString() signatureUrl?: string;
  @IsOptional() @IsString() rejectionReason?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() userAgent?: string;
  @IsOptional() @IsString() browser?: string;
  @IsOptional() @IsString() os?: string;
}

export class SendReminderDto {
  @IsOptional() @IsArray() workerIds?: string[];
  @IsOptional() @IsString() deliveryMethod?: string;
}

export class ResendLinkDto {
  @IsString() workerId!: string;
  @IsOptional() @IsString() deliveryMethod?: string;
}

export class CampaignQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() documentType?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}
