type ResourceEvidenceDto = { fileName: string; fileUrl: string };

export class UpdateResourceAssignmentDto {
  financialResources?: Array<{ concept: string; description?: string; value?: number; status?: string; responsible?: string; evidence?: ResourceEvidenceDto; date?: string }>;
  humanResources?: Array<{ employeeId: string; role: string; responsibilities?: string[]; active?: boolean }>;
  technicalResources?: Array<{ name: string; status?: string; quantity?: number; responsible?: string; maintenanceDate?: string; evidence?: ResourceEvidenceDto }>;
  activities?: Array<{ name: string; frequency?: string; assignedUsers?: string[]; plannedHours?: number; completionStatus?: string }>;
  evidences?: ResourceEvidenceDto[];
  approval?: { approved?: boolean; signatureImage?: string; signedAt?: string; signedBy?: string; version?: number; pdfUrl?: string };
}
