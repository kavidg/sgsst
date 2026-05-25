export class UpdateSpecialPensionDto {
  enabled?: boolean;
  records?: Array<{ employeeId: string; employeeName?: string; position?: string; highRiskType?: string; requiresSpecialContribution?: boolean; contributionStatus?: string; startDate?: string; observations?: string; supportDocument?: string }>;
  documents?: Array<{ type: string; fileName: string; fileUrl: string; uploadedAt?: string }>;
}
