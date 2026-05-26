import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { CommitteeType, RegisterCommitteeCandidateDto, SendCommitteeOtpDto, UpsertCommitteeMemberDto, UpsertCommitteePeriodDto, VoteCommitteeDto } from './dto/committee.dto';
import { CommitteePeriod, CommitteePeriodDocument } from './schemas/committee.schema';

@Injectable()
export class CommitteeEngineService {
  private readonly otpStore = new Map<string, string>();
  constructor(@InjectModel(CommitteePeriod.name) private readonly periodModel: Model<CommitteePeriodDocument>, private readonly alertsService: AlertsService) {}
  async getCurrent(companyId: Types.ObjectId, committeeType: CommitteeType) {
    const current = await this.periodModel.findOne({ companyId, committeeType, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (current) return this.refreshStatus(current);
    return this.createPeriod(companyId, { periodName: `${committeeType} Inicial`, startDate: new Date().toISOString(), committeeType }, 'system');
  }
  async createPeriod(companyId: Types.ObjectId, dto: UpsertCommitteePeriodDto, email: string) {
    await this.periodModel.updateMany({ companyId, committeeType: dto.committeeType, status: { $ne: 'ARCHIVADO' } }, { $set: { status: 'ARCHIVADO' } }).exec();
    const start = new Date(dto.startDate); const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    return this.periodModel.create({ companyId, committeeType: dto.committeeType, periodName: dto.periodName, startDate: start, endDate: end, status: 'ACTIVO', auditHistory: [{ action: 'CREATE_PERIOD', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) }] });
  }
  async addMember(periodId: string, dto: UpsertCommitteeMemberDto, email: string) { const p = await this.periodModel.findById(periodId).exec(); if (!p) throw new BadRequestException('Periodo no encontrado'); const start = new Date(dto.startDate); const end = new Date(start); end.setFullYear(end.getFullYear() + 2); p.members.push({ ...dto, userId: new Types.ObjectId(dto.userId), startDate: start, endDate: end, status: 'ACTIVO' } as never); p.auditHistory.push({ action: 'ADD_MEMBER', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) }); return p.save(); }
  async registerCandidate(periodId: string, dto: RegisterCommitteeCandidateDto) { const p = await this.periodModel.findById(periodId).exec(); if (!p) throw new BadRequestException('Periodo no encontrado'); p.candidates.push({ ...dto, votes: 0 } as never); return p.save(); }
  async sendOtp(dto: SendCommitteeOtpDto) { const code=`${Math.floor(100000+Math.random()*900000)}`; this.otpStore.set(`${dto.electionId}:${dto.document}:${dto.phone}`, code); return { sent: true, provider: 'mock', otpPreview: code }; }
  async vote(dto: VoteCommitteeDto) { const key=`${dto.electionId}:${dto.document}:${dto.phone}`; if(this.otpStore.get(key)!==dto.otpCode) throw new BadRequestException('OTP inválido'); const p=await this.periodModel.findById(dto.electionId).exec(); if(!p) throw new BadRequestException('Elección no encontrada'); if(p.votes.some((v)=>v.document===dto.document)) throw new BadRequestException('El trabajador ya votó'); p.votes.push({ ...dto, otpValidated:true, votedAt:new Date()} as never); const c=p.candidates.find((x)=>x.document===dto.candidateDocument); if(!c) throw new BadRequestException('Candidato no existe'); c.votes += 1; this.otpStore.delete(key); return p.save(); }
  async results(periodId:string){ const p=await this.periodModel.findById(periodId).exec(); if(!p) throw new BadRequestException('Periodo no encontrado'); const sorted=[...p.candidates].sort((a,b)=>b.votes-a.votes); const totalVotes=p.votes.length; return { totalVotes, winners:sorted.slice(0,2), alternates:sorted.slice(2,4), participation: totalVotes/Math.max(p.members.length,1)*100}; }
  private async refreshStatus(period: CommitteePeriodDocument) { const now=new Date(); const thirty=new Date(now); thirty.setDate(thirty.getDate()+30); period.status = period.endDate < now ? 'VENCIDO' : period.endDate < thirty ? 'PROXIMO_A_VENCER' : 'ACTIVO'; if(period.status!=='ACTIVO') await this.alertsService.create({ companyId: period.companyId.toString(), type: `${period.committeeType}_EXPIRATION`, message: `${period.committeeType} ${period.status.toLowerCase()}`, severity: 'MEDIUM' as never }); await period.save(); return period; }
}
