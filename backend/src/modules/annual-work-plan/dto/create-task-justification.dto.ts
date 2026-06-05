import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { JustificationApprovalStatus } from '../schemas/task-justification.schema';

export class CreateTaskJustificationDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  correctiveAction?: string;

  @IsOptional()
  @IsDateString()
  newDueDate?: string;
}

export class ApproveJustificationDto {
  @IsEnum(JustificationApprovalStatus)
  approvalStatus!: JustificationApprovalStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
