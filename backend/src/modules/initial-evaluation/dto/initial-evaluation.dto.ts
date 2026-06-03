import { FindingSeverity, StandardEvaluationStatus, WorkStatus } from '../schemas/initial-evaluation.schema';

export class UpdateStandardDto {
  status?: StandardEvaluationStatus;
  observations?: string;
  evidence?: string[];
  attachments?: string[];
}

export class UpsertFindingDto {
  id?: string;
  title!: string;
  description?: string;
  severity?: FindingSeverity;
  responsible?: string;
  dueDate?: string;
  status?: WorkStatus;
}

export class UpsertActionDto {
  id?: string;
  source?: string;
  title!: string;
  description?: string;
  responsible?: string;
  dueDate?: string;
  manualProgress?: number;
  automaticProgress?: number;
  activityProgress?: number;
  progress?: number;
  status?: WorkStatus;
  evidence?: string[];
}

export class SubmitApprovalDto {
  comments?: string;
}

export class SignApprovalDto {
  signerName!: string;
  signerEmail?: string;
  signatureUrl?: string;
  comments?: string;
}
