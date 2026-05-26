export type CommitteeType = 'COPASST' | 'CONVIVENCIA' | 'BRIGADA' | 'OTHER';

export class UpsertCommitteePeriodDto { periodName!: string; startDate!: string; committeeType!: CommitteeType; }
export class UpsertCommitteeMemberDto {
  userId!: string; userName!: string;
  committeeRole!: 'PRESIDENTE' | 'SECRETARIO' | 'PRINCIPAL' | 'SUPLENTE';
  representationType!: 'EMPLEADOR' | 'TRABAJADOR';
  principalType!: 'PRINCIPAL' | 'SUPLENTE';
  startDate!: string;
}
export class RegisterCommitteeCandidateDto { name!: string; document!: string; phone!: string; area!: string; position!: string; motivation!: string; accepted!: boolean; photoUrl?: string; }
export class SendCommitteeOtpDto { electionId!: string; document!: string; phone!: string; }
export class VoteCommitteeDto { electionId!: string; document!: string; phone!: string; otpCode!: string; candidateDocument!: string; }
