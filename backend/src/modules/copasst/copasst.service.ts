import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { CopasstPeriod, CopasstPeriodDocument } from './schemas/copasst.schema';
import { RegisterCandidateDto, SendOtpDto, UpsertCopasstMemberDto, UpsertCopasstPeriodDto, VoteDto } from './dto/copasst.dto';

@Injectable()
export class CopasstService {
  private readonly otpStore = new Map<string, string>();
  constructor(@InjectModel(CopasstPeriod.name) private readonly periodModel: Model<CopasstPeriodDocument>, private readonly alertsService: AlertsService) {}

  async getCurrent(companyId: Types.ObjectId) {
    const current = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (current) return this.refreshStatus(current);
    return this.createPeriod(companyId, { periodName: 'COPASST Inicial', startDate: new Date().toISOString() }, 'system');
  }

  async createPeriod(companyId: Types.ObjectId, dto: UpsertCopasstPeriodDto, email: string) {
    await this.periodModel.updateMany({ companyId, status: { $ne: 'ARCHIVADO' } }, { $set: { status: 'ARCHIVADO' } }).exec();
    const start = new Date(dto.startDate);
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    const created = await this.periodModel.create({ companyId, periodName: dto.periodName, startDate: start, endDate: end, status: 'ACTIVO', auditHistory: [{ action: 'CREATE_PERIOD', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) }] });
    return created;
  }

  async addMember(periodId: string, dto: UpsertCopasstMemberDto, email: string) {
    const period = await this.periodModel.findById(periodId).exec(); if (!period) throw new BadRequestException('Periodo no encontrado');
    const start = new Date(dto.startDate); const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    period.members.push({ ...dto, userId: new Types.ObjectId(dto.userId), startDate: start, endDate: end, status: 'ACTIVO' } as never);
    period.auditHistory.push({ action: 'ADD_MEMBER', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async registerCandidate(periodId: string, dto: RegisterCandidateDto) { const period = await this.periodModel.findById(periodId).exec(); if (!period) throw new BadRequestException('Periodo no encontrado'); period.candidates.push({ ...dto, votes: 0 } as never); return period.save(); }
  async sendOtp(dto: SendOtpDto) { const code = `${Math.floor(100000 + Math.random() * 900000)}`; this.otpStore.set(`${dto.electionId}:${dto.document}:${dto.phone}`, code); return { sent: true, provider: 'mock', otpPreview: code }; }

  async vote(dto: VoteDto) {
    const key = `${dto.electionId}:${dto.document}:${dto.phone}`;
    if (this.otpStore.get(key) !== dto.otpCode) throw new BadRequestException('OTP inválido');
    const period = await this.periodModel.findById(dto.electionId).exec(); if (!period) throw new BadRequestException('Elección no encontrada');
    if (period.votes.some((vote) => vote.document === dto.document)) throw new BadRequestException('El trabajador ya votó');
    period.votes.push({ ...dto, otpValidated: true, votedAt: new Date() } as never);
    const candidate = period.candidates.find((item) => item.document === dto.candidateDocument); if (!candidate) throw new BadRequestException('Candidato no existe');
    candidate.votes += 1;
    this.otpStore.delete(key);
    return period.save();
  }

  async results(periodId: string) {
    const period = await this.periodModel.findById(periodId).exec(); if (!period) throw new BadRequestException('Periodo no encontrado');
    const sorted = [...period.candidates].sort((a, b) => b.votes - a.votes);
    const totalVotes = period.votes.length;
    return { totalVotes, winners: sorted.slice(0, 2), alternates: sorted.slice(2, 4), participation: totalVotes / Math.max(period.members.length, 1) * 100 };
  }

  private async refreshStatus(period: CopasstPeriodDocument) {
    const now = new Date(); const thirty = new Date(now); thirty.setDate(thirty.getDate() + 30);
    if (period.endDate < now) period.status = 'VENCIDO'; else if (period.endDate < thirty) period.status = 'PROXIMO_A_VENCER'; else period.status = 'ACTIVO';
    if (period.status !== 'ACTIVO') await this.alertsService.create({ companyId: period.companyId, type: 'COPASST_EXPIRATION', message: `COPASST ${period.status.toLowerCase()}`, severity: 'MEDIUM' as never });
    await period.save(); return period;
  }
}
