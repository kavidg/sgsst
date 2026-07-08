import { IsArray, IsBoolean, IsDateString, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TargetAudienceType } from '../schemas/socialization-session.schema';
import { SignatureMethod } from '../schemas/socialization-participant.schema';

// ==================== ADMIN DTOs ====================

export class StartSocializationDto {
  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  responsibleName?: string;

  @IsOptional()
  @IsEnum(TargetAudienceType)
  targetAudienceType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetDepartments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPositions?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  selectedEmployees?: string[];
}

export class UpdateSocializationDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  responsibleName?: string;
}

export class UploadPresentationDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddParticipantsDto {
  @IsArray()
  participants!: Array<{
    employeeId: string;
    employeeName: string;
    employeeIdentification: string;
    position?: string;
    department?: string;
    phone?: string;
    email?: string;
  }>;
}

export class SendReminderDto {
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  participantIds?: string[];

  @IsOptional()
  @IsString()
  deliveryMethod?: string;
}

// ==================== PUBLIC/EMPLOYEE DTOs ====================

export class ViewSlideDto {
  @IsNumber()
  @Min(0)
  currentSlide!: number;

  @IsOptional()
  @IsNumber()
  viewingTimeSeconds?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  viewedSlides?: number[];
}

export class CompletePresentationDto {
  @IsOptional()
  @IsNumber()
  viewingTimeSeconds?: number;
}

export class SignSocializationDto {
  @IsBoolean()
  hasRead!: boolean;

  @IsOptional()
  @IsEnum(SignatureMethod)
  signatureMethod?: string;

  @IsOptional()
  @IsString()
  signatureData?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  browser?: string;

  @IsOptional()
  @IsString()
  os?: string;
}
