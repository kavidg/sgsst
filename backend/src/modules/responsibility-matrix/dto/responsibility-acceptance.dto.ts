import { IsArray, IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class AcceptResponsibilityDto {
  @IsString() userId!: string;
  @IsEmail() userEmail!: string;
  @IsString() userName!: string;
  @IsOptional() @IsString() userRole?: string;
  @IsArray() assignedItemIds!: string[];
  @IsBoolean() hasRead!: boolean;
  @IsOptional() @IsString() signatureHash?: string;
  @IsOptional() @IsString() signatureUrl?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() device?: string;
  @IsOptional() @IsString() comments?: string;
}

export class RejectResponsibilityDto {
  @IsString() userId!: string;
  @IsEmail() userEmail!: string;
  @IsString() reason!: string;
  @IsOptional() @IsString() comments?: string;
}

export class RequestCorrectionDto {
  @IsString() userId!: string;
  @IsEmail() userEmail!: string;
  @IsString() comment!: string;
}

export class AssignResponsibilityBatchDto {
  @IsArray()
  assignments!: Array<{
    userId: string;
    userEmail: string;
    userName: string;
    userRole?: string;
    assignedItemIds: string[];
  }>;
  @IsOptional() @IsString() matrixVersion?: string;
}

export class SendReminderDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsArray() userIds?: string[];
}

export class CreateAcceptanceCycleDto {
  @IsOptional() @IsString() matrixVersion?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ResolveCorrectionDto {
  @IsString() userId!: string;
  @IsOptional() @IsString() resolution?: string;
}
