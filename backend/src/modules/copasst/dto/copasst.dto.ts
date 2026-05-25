export class UpsertCopasstPeriodDto {
  periodName: string;
  startDate: string;
}

export class UpsertCopasstMemberDto {
  userId: string;
  userName: string;
  committeeRole: 'PRESIDENTE' | 'SECRETARIO' | 'PRINCIPAL' | 'SUPLENTE';
  representationType: 'EMPLEADOR' | 'TRABAJADOR';
  principalType: 'PRINCIPAL' | 'SUPLENTE';
  startDate: string;
}

export class RegisterCandidateDto {
  name: string; document: string; phone: string; area: string; position: string; motivation: string; accepted: boolean; photoUrl?: string;
}

export class SendOtpDto { electionId: string; document: string; phone: string; }
export class VoteDto { electionId: string; document: string; phone: string; otpCode: string; candidateDocument: string; }
