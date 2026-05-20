import { ArlAffiliationStatus } from '../schemas/phva-advanced-arl-affiliations.schema';

export type ArlEmployeeAffiliationDto = {
  employeeId: string;
  employeeName: string;
  document?: string;
  position?: string;
  arlName?: string;
  riskClass?: string;
  affiliationStatus?: ArlAffiliationStatus;
  affiliationDate?: string;
  retirementDate?: string;
  socialSecurityActive?: boolean;
  evidences?: string[];
  workCenter?: string;
  contractType?: string;
};

export type CompanySocialSecurityDocumentDto = {
  type: string;
  fileName: string;
  fileUrl: string;
  uploadedAt?: string;
};

export type SocialSecurityPeriodDto = {
  period: string;
  paymentDate?: string;
  status?: string;
  supportDocument?: string;
  observations?: string;
};

export class UpdateArlAffiliationsDto {
  employees?: ArlEmployeeAffiliationDto[];
  companyDocuments?: CompanySocialSecurityDocumentDto[];
  socialSecurityPeriods?: SocialSecurityPeriodDto[];
}
