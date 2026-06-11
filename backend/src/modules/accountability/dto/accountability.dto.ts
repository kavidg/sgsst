import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsArray,
  IsMongoId,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ReportType, ReportStatus } from '../schemas/accountability-report.schema';
import { MeetingType, MeetingStatus } from '../schemas/accountability-meeting.schema';
import { CommitmentPriority, CommitmentStatus } from '../schemas/accountability-commitment.schema';

// ==================== REPORT DTOs ====================

export class CreateReportDto {
  @IsEnum(ReportType)
  reportType!: ReportType;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsString()
  @IsOptional()
  executiveSummary?: string;

  @IsString()
  @IsOptional()
  achievements?: string;

  @IsString()
  @IsOptional()
  pendingActions?: string;

  @IsString()
  @IsOptional()
  riskAreas?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  compliancePercentage?: number;

  @IsString()
  @IsOptional()
  criticalFindings?: string;

  @IsString()
  @IsOptional()
  recommendations?: string;

  @IsString()
  @IsOptional()
  nextActions?: string;
}

export class UpdateReportDto {
  @IsString()
  @IsOptional()
  executiveSummary?: string;

  @IsString()
  @IsOptional()
  achievements?: string;

  @IsString()
  @IsOptional()
  pendingActions?: string;

  @IsString()
  @IsOptional()
  riskAreas?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  compliancePercentage?: number;

  @IsString()
  @IsOptional()
  criticalFindings?: string;

  @IsString()
  @IsOptional()
  recommendations?: string;

  @IsString()
  @IsOptional()
  nextActions?: string;

  @IsEnum(ReportStatus)
  @IsOptional()
  status?: ReportStatus;
}

export class SignReportDto {
  @IsMongoId()
  signedBy!: string;

  @IsString()
  @IsOptional()
  signatureHash?: string;

  @IsString()
  @IsOptional()
  signatureUrl?: string;
}

// ==================== MEETING DTOs ====================

export class CreateMeetingDto {
  @IsString()
  title!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @IsOptional()
  time?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(MeetingType)
  meetingType!: MeetingType;

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  participants?: string[];

  @IsString()
  @IsOptional()
  topicsDiscussed?: string;

  @IsString()
  @IsOptional()
  decisions?: string;
}

export class UpdateMeetingDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  time?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(MeetingType)
  @IsOptional()
  meetingType?: MeetingType;

  @IsEnum(MeetingStatus)
  @IsOptional()
  status?: MeetingStatus;

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  participants?: string[];

  @IsString()
  @IsOptional()
  topicsDiscussed?: string;

  @IsString()
  @IsOptional()
  decisions?: string;

  @IsString()
  @IsOptional()
  minutesContent?: string;
}

export class CompleteMeetingDto {
  @IsString()
  @IsOptional()
  topicsDiscussed?: string;

  @IsString()
  @IsOptional()
  decisions?: string;

  @IsString()
  @IsOptional()
  minutesContent?: string;
}

// ==================== COMMITMENT DTOs ====================

export class CreateCommitmentDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsMongoId()
  responsibleUser!: string;

  @IsDateString()
  dueDate!: string;

  @IsEnum(CommitmentPriority)
  @IsOptional()
  priority?: CommitmentPriority;

  @IsMongoId()
  @IsOptional()
  meetingId?: string;
}

export class UpdateCommitmentDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsMongoId()
  @IsOptional()
  responsibleUser?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsEnum(CommitmentPriority)
  @IsOptional()
  priority?: CommitmentPriority;

  @IsEnum(CommitmentStatus)
  @IsOptional()
  status?: CommitmentStatus;
}

export class SubmitJustificationDto {
  @IsString()
  reason!: string;

  @IsString()
  @IsOptional()
  correctiveAction?: string;

  @IsDateString()
  @IsOptional()
  newProposedDate?: string;
}

export class ApproveJustificationDto {
  @IsBoolean()
  approved!: boolean;

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}

// ==================== DASHBOARD DTO ====================

export class DashboardMetricsDto {
  globalCompliance!: number;
  annualWorkPlanProgress!: number;
  objectivesProgress!: number;
  trainingCompliance!: number;
  copasstCompliance!: number;
  committeeCompliance!: number;
  openTasks!: number;
  overdueTasks!: number;
  openCommitments!: number;
  overdueCommitments!: number;
}
