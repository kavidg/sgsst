import { IsOptional } from 'class-validator';

type ResourceEvidenceDto = { fileName: string; fileUrl: string };

export class UpdateResourceAssignmentDto {
  @IsOptional()
  financialResources?: Array<{ concept: string; description?: string; value?: number; status?: string; responsible?: string; evidence?: ResourceEvidenceDto; date?: string }>;

  @IsOptional()
  humanResources?: Array<{ employeeId: string; role: string; responsibilities?: string[]; active?: boolean }>;

  @IsOptional()
  technicalResources?: Array<{ name: string; status?: string; quantity?: number; responsible?: string; maintenanceDate?: string; evidence?: ResourceEvidenceDto }>;

  @IsOptional()
  activities?: Array<{ name: string; frequency?: string; assignedUsers?: string[]; plannedHours?: number; completionStatus?: string }>;

  @IsOptional()
  evidences?: ResourceEvidenceDto[];

  @IsOptional()
  approval?: { approved?: boolean; signatureImage?: string; signedAt?: string; signedBy?: string; version?: number; pdfUrl?: string };
}
