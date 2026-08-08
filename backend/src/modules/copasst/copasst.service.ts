import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { CopasstPeriod, CopasstPeriodDocument } from './schemas/copasst.schema';

@Injectable()
export class CopasstService {
  private readonly otpStore = new Map<string, { code: string; expiresAt: Date }>();
  constructor(
    @InjectModel(CopasstPeriod.name) private readonly periodModel: Model<CopasstPeriodDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly alertsService: AlertsService,
    private readonly autoCommService: AutoCommunicationService,
  ) {}

  // ─────────────────────────────────────────────
  // GLOBAL / SUMMARY
  // ─────────────────────────────────────────────
  async getSummary(companyId: Types.ObjectId) {
    const totalEmployees = await this.employeeModel.countDocuments({ companyId, status: 'Activo' }).exec();
    const requiresCopasst = totalEmployees >= 10;
    const current = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (!current) {
      // Create default period if none exists
      const start = new Date();
      const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
      const created = await this.periodModel.create({
        companyId, periodName: 'COPASST Inicial', startDate: start, endDate: end,
        status: requiresCopasst ? 'ACTIVO' : 'ARCHIVADO',
        totalEmployees, requiresCopasst,
      });
      return { period: created, totalEmployees, requiresCopasst };
    }
    current.totalEmployees = totalEmployees;
    current.requiresCopasst = requiresCopasst;
    if (!requiresCopasst) {
      current.status = 'ARCHIVADO';
    }
    await current.save();
    return { period: current, totalEmployees, requiresCopasst };
  }

  // ─────────────────────────────────────────────
  // PERIOD MANAGEMENT
  // ─────────────────────────────────────────────
  /**
   * Getter de lectura por identificador (sin crear registros ni refrescar
   * estado). Usado por el CopasstAdapter del Approval Workflow Core.
   */
  async findById(id: Types.ObjectId): Promise<CopasstPeriodDocument> {
    const period = await this.periodModel.findById(id).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    return period;
  }

  /**
   * Getter de lectura del periodo activo vigente de la empresa (sin crear un
   * periodo por defecto como hace getCurrent). Usado por el adapter cuando
   * getEntity llega sin periodId.
   */
  async findCurrent(companyId: Types.ObjectId): Promise<CopasstPeriodDocument> {
    const period = await this.periodModel
      .findOne({ companyId, status: { $ne: 'ARCHIVADO' } })
      .sort({ createdAt: -1 })
      .exec();
    if (!period) throw new NotFoundException('No existe un periodo activo para esta empresa');
    return period;
  }

  async getCurrent(companyId: Types.ObjectId) {
    const current = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (current) return this.refreshStatus(current);
    const totalEmployees = await this.employeeModel.countDocuments({ companyId, status: 'Activo' }).exec();
    const start = new Date();
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    return this.periodModel.create({
      companyId, periodName: 'COPASST Inicial', startDate: start, endDate: end,
      status: totalEmployees >= 10 ? 'ACTIVO' : 'ARCHIVADO',
      totalEmployees, requiresCopasst: totalEmployees >= 10,
    });
  }

  async createPeriod(companyId: Types.ObjectId, dto: { periodName: string; startDate: string }, email: string) {
    await this.periodModel.updateMany({ companyId, status: { $ne: 'ARCHIVADO' } }, { $set: { status: 'ARCHIVADO' } }).exec();
    const start = new Date(dto.startDate);
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    const totalEmployees = await this.employeeModel.countDocuments({ companyId, status: 'Activo' }).exec();
    const created = await this.periodModel.create({
      companyId, periodName: dto.periodName, startDate: start, endDate: end,
      status: totalEmployees >= 10 ? 'ACTIVO' : 'ARCHIVADO',
      totalEmployees, requiresCopasst: totalEmployees >= 10,
      auditHistory: [{ action: 'CREATE_PERIOD', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) }],
    });
    await this.autoCommService.generateCommunication({
      companyId, title: `Elección COPASST: ${created.periodName}`,
      body: `Se ha iniciado el proceso de elección del COPASST para el periodo "${created.periodName}". Fecha inicio: ${start.toISOString().slice(0, 10)}.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false, sourceModule: 'COPASST_ELECTION', sourceEntityId: created._id.toString(),
    }).catch(() => {});
    return created;
  }

  async updatePeriod(periodId: string, dto: Partial<{ periodName: string; startDate: string; endDate: string; status: string }>) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    if (dto.periodName) period.periodName = dto.periodName;
    if (dto.startDate) period.startDate = new Date(dto.startDate);
    if (dto.endDate) period.endDate = new Date(dto.endDate);
    if (dto.status) period.status = dto.status;
    await period.save();
    return period;
  }

  // ─────────────────────────────────────────────
  // MEMBERS
  // ─────────────────────────────────────────────
  async getMembers(periodId: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    return period.members;
  }

  async addMember(periodId: string, dto: {
    userId: string; userName: string; committeeRole: string;
    representationType: string; principalType: string; startDate: string;
  }, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new BadRequestException('Periodo no encontrado');
    const start = new Date(dto.startDate);
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    period.members.push({
      userId: new Types.ObjectId(dto.userId), userName: dto.userName,
      committeeRole: dto.committeeRole as any,
      representationType: dto.representationType as any,
      principalType: dto.principalType as any,
      startDate: start, endDate: end, status: 'ACTIVO',
    } as never);
    period.auditHistory.push({ action: 'ADD_MEMBER', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async removeMember(periodId: string, memberIndex: number, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const member = period.members[memberIndex];
    if (!member) throw new NotFoundException('Miembro no encontrado');
    period.members.splice(memberIndex, 1);
    period.auditHistory.push({ action: 'REMOVE_MEMBER', createdBy: email, createdAt: new Date(), data: JSON.stringify(member) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // CANDIDATE REGISTRATION CAMPAIGN
  // ─────────────────────────────────────────────
  async startRegistrationCampaign(periodId: string, dto: {
    openingDate: string; closingDate: string;
    includedDepartments?: string[]; requirements?: string[];
  }, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const secureToken = `${new Types.ObjectId().toString()}-${Date.now().toString(36)}`;
    period.registrationCampaign = {
      openingDate: new Date(dto.openingDate),
      closingDate: new Date(dto.closingDate),
      includedDepartments: dto.includedDepartments ?? [],
      requirements: dto.requirements ?? [],
      secureToken, isActive: true, adminNotes: '',
    };
    period.auditHistory.push({ action: 'START_CAMPAIGN', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    await period.save();
    // Generate auto-communication
    await this.autoCommService.generateCommunication({
      companyId: period.companyId,
      title: `Inscripción COPASST: ${period.periodName}`,
      body: `Se ha abierto la convocatoria para candidatos al COPASST. Periodo de inscripción: ${new Date(dto.openingDate).toISOString().slice(0, 10)} al ${new Date(dto.closingDate).toISOString().slice(0, 10)}. Los empleados pueden postularse a través del enlace seguro.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false,      sourceModule: 'COPASST_CAMPAIGN' as any, sourceEntityId: period._id.toString(),
    }).catch(() => {});
    return { period, secureToken, registrationUrl: `/copasst/register/${secureToken}` };
  }

  async getCampaignInfo(token: string) {
    const period = await this.periodModel.findOne({ 'registrationCampaign.secureToken': token }).exec();
    if (!period || !period.registrationCampaign) throw new NotFoundException('Campaña no encontrada');
    if (!period.registrationCampaign.isActive) throw new BadRequestException('La campaña de inscripción ya no está activa');
    if (new Date() > period.registrationCampaign.closingDate) throw new BadRequestException('El periodo de inscripción ha finalizado');
    return {
      periodName: period.periodName,
      openingDate: period.registrationCampaign.openingDate,
      closingDate: period.registrationCampaign.closingDate,
      includedDepartments: period.registrationCampaign.includedDepartments,
      requirements: period.registrationCampaign.requirements,
      companyId: period.companyId,
    };
  }

  async registerCandidatePublic(token: string, dto: {
    name: string; document: string; phone: string; area: string;
    position: string; motivation: string; acceptedTerms: boolean;
    email?: string; ipAddress?: string; device?: string;
  }) {
    const period = await this.periodModel.findOne({ 'registrationCampaign.secureToken': token }).exec();
    if (!period || !period.registrationCampaign) throw new NotFoundException('Campaña no encontrada');
    if (!period.registrationCampaign.isActive) throw new BadRequestException('La campaña ya no está activa');
    if (new Date() > period.registrationCampaign.closingDate) throw new BadRequestException('El periodo de inscripción ha finalizado');
    if (period.candidateExtended.some((c) => c.document === dto.document)) {
      throw new BadRequestException('Ya existe un candidato registrado con este documento');
    }
    if (!dto.acceptedTerms) throw new BadRequestException('Debe aceptar los términos de la postulación');
    period.candidateExtended.push({
      ...dto, adminStatus: 'PENDIENTE', adminComment: '', votes: 0,
      registeredAt: new Date(),
    });
    await period.save();
    return { success: true, message: 'Candidatura registrada exitosamente' };
  }

  async reviewCandidate(periodId: string, candidateIndex: number, dto: {
    adminStatus: 'APROBADO' | 'RECHAZADO' | 'INFO_REQUESTED';
    adminComment?: string;
  }, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const candidate = period.candidateExtended[candidateIndex];
    if (!candidate) throw new NotFoundException('Candidato no encontrado');
    candidate.adminStatus = dto.adminStatus;
    if (dto.adminComment) candidate.adminComment = dto.adminComment;
    period.auditHistory.push({
      action: `CANDIDATE_${dto.adminStatus}`,
      createdBy: email, createdAt: new Date(), data: JSON.stringify({ candidate: candidate.name, status: dto.adminStatus, comment: dto.adminComment }),
    });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // VOTING
  // ─────────────────────────────────────────────
  async initVoting(periodId: string, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const approved = period.candidateExtended.filter((c) => c.adminStatus === 'APROBADO');
    if (approved.length < 2) throw new BadRequestException('Se requieren al menos 2 candidatos aprobados para iniciar la votación');
    period.auditHistory.push({ action: 'START_VOTING', createdBy: email, createdAt: new Date(), data: JSON.stringify({ candidates: approved.length }) });
    await period.save();
    // Generate auto-communication
    await this.autoCommService.generateCommunication({
      companyId: period.companyId, title: `Votación COPASST: ${period.periodName}`,
      body: `Se ha iniciado la votación para la elección de representantes al COPASST. Los empleados pueden votar a través del enlace seguro.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false,      sourceModule: 'COPASST_VOTING' as any, sourceEntityId: period._id.toString(),
    }).catch(() => {});
    return { period, approvedCandidates: approved };
  }

  async sendOtp(dto: { electionId: string; document: string; phone: string }) {
    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    this.otpStore.set(`${dto.electionId}:${dto.document}:${dto.phone}`, { code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    return { sent: true, provider: 'mock', otpPreview: code };
  }

  async vote(dto: {
    electionId: string; document: string; phone: string;
    otpCode: string; candidateDocument: string;
    ipAddress?: string; device?: string;
  }) {
    const key = `${dto.electionId}:${dto.document}:${dto.phone}`;
    const stored = this.otpStore.get(key);
    if (!stored) throw new BadRequestException('OTP no solicitado');
    if (stored.expiresAt < new Date()) {
      this.otpStore.delete(key);
      throw new BadRequestException('OTP expirado');
    }
    if (stored.code !== dto.otpCode) throw new BadRequestException('OTP inválido');
    const period = await this.periodModel.findById(dto.electionId).exec();
    if (!period) throw new BadRequestException('Elección no encontrada');
    if (period.votesExtended.some((v) => v.document === dto.document)) {
      throw new BadRequestException('El trabajador ya votó');
    }
    const candidate = period.candidateExtended.find((c) => c.document === dto.candidateDocument);
    if (!candidate) throw new BadRequestException('Candidato no encontrado');
    period.votesExtended.push({
      document: dto.document, candidateDocument: dto.candidateDocument,
      otpValidated: true, votedAt: new Date(),
      ipAddress: dto.ipAddress, device: dto.device,
      token: key,
    });
    candidate.votes += 1;
    this.otpStore.delete(key);
    await period.save();
    return { success: true, message: 'Voto registrado exitosamente' };
  }

  async getVotingResults(periodId: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const sorted = [...period.candidateExtended].sort((a, b) => b.votes - a.votes);
    const totalVotes = period.votesExtended.length;
    const totalEmployees = await this.employeeModel.countDocuments({ companyId: period.companyId, status: 'Activo' }).exec();
    return {
      totalVotes, totalEmployees,
      participation: totalEmployees > 0 ? (totalVotes / totalEmployees) * 100 : 0,
      winners: sorted.filter((c) => c.adminStatus === 'APROBADO').slice(0, 2),
      alternates: sorted.filter((c) => c.adminStatus === 'APROBADO').slice(2, 4),
      ranking: sorted.map((c, i) => ({ rank: i + 1, name: c.name, document: c.document, votes: c.votes, status: c.adminStatus })),
    };
  }

  async autoCreateCommittee(periodId: string, numPositions: number, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const sorted = [...period.candidateExtended].filter((c) => c.adminStatus === 'APROBADO').sort((a, b) => b.votes - a.votes);
    const primaryCount = Math.min(numPositions, sorted.length);
    const alternates = sorted.slice(primaryCount, primaryCount + numPositions);
    // Clear existing members and assign new ones
    period.members = [];
    for (let i = 0; i < primaryCount; i++) {
      const candidate = sorted[i];
      period.members.push({
        userId: new Types.ObjectId(), // Generic - no direct user link for external candidates
        userName: candidate.name,
        committeeRole: i === 0 ? 'PRESIDENTE' : i === 1 ? 'SECRETARIO' : 'PRINCIPAL',
        representationType: 'TRABAJADOR',
        principalType: i < primaryCount ? 'PRINCIPAL' : 'SUPLENTE',
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
        status: 'ACTIVO',
      } as never);
    }
    for (const alt of alternates) {
      period.members.push({
        userId: new Types.ObjectId(),
        userName: alt.name,
        committeeRole: 'SUPLENTE',
        representationType: 'TRABAJADOR',
        principalType: 'SUPLENTE',
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
        status: 'ACTIVO',
      } as never);
    }
    period.auditHistory.push({ action: 'AUTO_CREATE_COMMITTEE', createdBy: email, createdAt: new Date(), data: JSON.stringify({ primary: primaryCount, alternates: alternates.length }) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // MEETINGS
  // ─────────────────────────────────────────────
  async scheduleMeeting(periodId: string, dto: {
    meetingDate: string; agenda: string; topicList?: string[];
  }, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    period.meetings.push({
      meetingDate: new Date(dto.meetingDate), status: 'PROGRAMADA',
      agenda: dto.agenda, attendees: [], topicList: dto.topicList ?? [],
      development: '',
    } as never);
    period.auditHistory.push({ action: 'SCHEDULE_MEETING', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async autoScheduleMonthlyMeetings(periodId: string, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const now = new Date();
    let count = 0;
    for (let i = 1; i <= 12; i++) {
      const meetingDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (meetingDate > period.endDate) break;
      const exists = period.meetings.some((m) =>
        m.meetingDate.getFullYear() === meetingDate.getFullYear() &&
        m.meetingDate.getMonth() === meetingDate.getMonth(),
      );
      if (!exists) {
        period.meetings.push({
          meetingDate, status: 'PROGRAMADA',
          agenda: `Reunión mensual COPASST - ${meetingDate.toLocaleString('es', { month: 'long', year: 'numeric' })}`,
          attendees: [], topicList: [],
          development: '',
        } as never);
        count++;
      }
    }
    period.auditHistory.push({ action: 'AUTO_SCHEDULE_MEETINGS', createdBy: email, createdAt: new Date(), data: `${count} reuniones programadas` });
    return period.save();
  }

  async completeMeeting(periodId: string, meetingIndex: number, dto: {
    development: string; attendees: string[]; topicList?: string[];
  }, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const meeting = period.meetings[meetingIndex];
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    meeting.development = dto.development;
    meeting.attendees = dto.attendees;
    meeting.status = 'CERRADA';
    if (dto.topicList) meeting.topicList = dto.topicList;
    period.auditHistory.push({ action: 'COMPLETE_MEETING', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async updateMeeting(periodId: string, meetingIndex: number, dto: Partial<{
    meetingDate: string; agenda: string; development: string; status: string;
    attendees: string[]; topicList: string[];
  }>, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const meeting = period.meetings[meetingIndex];
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (dto.meetingDate) meeting.meetingDate = new Date(dto.meetingDate);
    if (dto.agenda !== undefined) meeting.agenda = dto.agenda;
    if (dto.development !== undefined) meeting.development = dto.development;
    if (dto.status) meeting.status = dto.status;
    if (dto.attendees) meeting.attendees = dto.attendees;
    if (dto.topicList) meeting.topicList = dto.topicList;
    return period.save();
  }

  // ─────────────────────────────────────────────
  // COMMITMENTS
  // ─────────────────────────────────────────────
  async addCommitment(periodId: string, dto: {
    description: string; responsibleParty: string;
    deadline: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    meetingId?: string;
  }, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    period.commitments.push({
      _id: new Types.ObjectId(),
      description: dto.description,
      responsibleParty: dto.responsibleParty,
      deadline: new Date(dto.deadline),
      priority: dto.priority,
      status: 'OPEN',
      meetingId: dto.meetingId,
      createdAt: new Date(),
    } as never);
    period.auditHistory.push({ action: 'ADD_COMMITMENT', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async updateCommitment(periodId: string, commitmentId: string, dto: Partial<{
    description: string; responsibleParty: string;
    deadline: string; priority: string; status: string;
    evidenceUrl: string;
  }>, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const commitment = (period.commitments as any[]).find((c) => c._id?.toString() === commitmentId);
    if (!commitment) throw new NotFoundException('Compromiso no encontrado');
    if (dto.description !== undefined) commitment.description = dto.description;
    if (dto.responsibleParty !== undefined) commitment.responsibleParty = dto.responsibleParty;
    if (dto.deadline !== undefined) commitment.deadline = new Date(dto.deadline);
    if (dto.priority !== undefined) commitment.priority = dto.priority;
    if (dto.status !== undefined) {
      commitment.status = dto.status;
      if (dto.status === 'COMPLETED') commitment.completedAt = new Date();
    }
    if (dto.evidenceUrl !== undefined) commitment.evidenceUrl = dto.evidenceUrl;
    commitment.updatedAt = new Date();
    period.auditHistory.push({ action: 'UPDATE_COMMITMENT', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // EVIDENCE
  // ─────────────────────────────────────────────
  async addEvidence(periodId: string, dto: {
    type: string; title: string; fileName: string; fileUrl: string;
    meetingId?: string;
  }, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    period.evidence.push({
      _id: new Types.ObjectId(),
      type: dto.type as any,
      title: dto.title,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      uploadedBy: email,
      uploadedAt: new Date(),
      meetingId: dto.meetingId,
    } as never);
    period.auditHistory.push({ action: 'ADD_EVIDENCE', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async removeEvidence(periodId: string, evidenceIndex: number, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    const ev = period.evidence[evidenceIndex];
    if (!ev) throw new NotFoundException('Evidencia no encontrada');
    period.evidence.splice(evidenceIndex, 1);
    period.auditHistory.push({ action: 'REMOVE_EVIDENCE', createdBy: email, createdAt: new Date(), data: JSON.stringify(ev) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // APPROVAL WORKFLOW
  // ─────────────────────────────────────────────
  async submitForApproval(periodId: string, email: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    if (period.approvalStatus === 'PENDING_APPROVAL') {
      throw new BadRequestException('El módulo ya está pendiente de aprobación');
    }
    if (period.approvalStatus === 'APPROVED' || period.approvalStatus === 'APPROVED_AND_SIGNED') {
      throw new BadRequestException('El módulo ya está aprobado');
    }
    const currentVer = parseFloat(period.currentVersion || '1.0');
    period.currentVersion = (currentVer + 0.1).toFixed(1);
    period.approvalStatus = 'PENDING_APPROVAL';
    period.locked = true;
    period.submittedAt = new Date();

    // Notify managers
    const managers = await this.userModel.find({ companyId: period.companyId, role: 'manager', isActive: true }).exec();
    if (managers.length === 0) throw new BadRequestException('No existe un MANAGER asignado a esta empresa');
    await Promise.all(managers.map((mgr) =>
      this.alertsService.create({
        companyId: period.companyId.toString(),
        type: 'APPROVAL_REQUEST',
        message: `📋 Nueva solicitud de aprobación — Módulo: COPASST (1.1.6). Enviado por: ${email}. Fecha: ${new Date().toLocaleDateString()}.`,
        severity: AlertSeverity.HIGH,
        targetUserId: mgr._id.toString(),
        actionUrl: '/advanced-management/1.1.6?mode=review',
        moduleCode: '1.1.6',
        moduleName: 'COPASST Management',
        submittedBy: email,
        submittedAt: new Date().toISOString(),
      }).catch(() => {}),
    ));

    period.auditHistory.push({ action: 'SUBMIT_APPROVAL', createdBy: email, createdAt: new Date(), data: `v${period.currentVersion}` });
    return period.save();
  }

  async approve(periodId: string, userEmail: string, role: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    if (period.approvalStatus !== 'PENDING_APPROVAL') throw new BadRequestException('No está pendiente de aprobación');
    period.approvalStatus = 'APPROVED_AND_SIGNED';
    period.locked = true;
    period.approvedBy = { userId: '', email: userEmail, role, timestamp: new Date().toISOString() };
    period.auditHistory.push({ action: 'APPROVE', createdBy: userEmail, createdAt: new Date(), data: 'APPROVED_AND_SIGNED' });
    // Generate constitution minutes PDF (placeholder)
    period.constitutionMinutesPdfUrl = this.generateConstitutionMinutes(period);
    // Notify admins
    const admins = await this.userModel.find({ companyId: period.companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((admin) =>
      this.alertsService.create({
        companyId: period.companyId.toString(), type: 'COPASST_APPROVED',
        message: `✅ COPASST aprobado y firmado. Aprobado por: ${userEmail}.`,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));
    return period.save();
  }

  async reject(periodId: string, reason: string, userEmail: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    if (period.approvalStatus !== 'PENDING_APPROVAL') throw new BadRequestException('No está pendiente de aprobación');
    period.approvalStatus = 'REJECTED';
    period.locked = false;
    period.rejectionReason = reason;
    period.rejectedBy = { userId: '', email: userEmail, role: '', reason, timestamp: new Date().toISOString() };
    period.auditHistory.push({ action: 'REJECT', createdBy: userEmail, createdAt: new Date(), data: reason });
    // Notify admins
    const admins = await this.userModel.find({ companyId: period.companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((admin) =>
      this.alertsService.create({
        companyId: period.companyId.toString(), type: 'COPASST_REJECTED',
        message: `❌ COPASST rechazado. Rechazado por: ${userEmail}. Motivo: ${reason}.`,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));
    return period.save();
  }

  private generateConstitutionMinutes(period: CopasstPeriodDocument): string {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://app.sgsst.com';
    return `${baseUrl}/copasst/${period._id}/minutes.pdf`;
  }

  // ─────────────────────────────────────────────
  // AUDIT HISTORY
  // ─────────────────────────────────────────────
  async getAuditHistory(periodId: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    return (period.auditHistory ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ─────────────────────────────────────────────
  // DASHBOARD / INDICATORS
  // ─────────────────────────────────────────────
  async getDashboard(companyId: Types.ObjectId) {
    const period = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (!period) return null;
    const totalMeetings = period.meetings.length;
    const completedMeetings = period.meetings.filter((m) => m.status === 'CERRADA').length;
    const openCommitments = (period.commitments as any[]).filter((c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length;
    const closedCommitments = (period.commitments as any[]).filter((c) => c.status === 'COMPLETED').length;
    const totalCommitments = period.commitments.length;
    const totalVotes = period.votesExtended.length;
    const totalEmployees = period.totalEmployees;
    const nextMeeting = period.meetings
      .filter((m) => m.status === 'PROGRAMADA')
      .sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime())[0];
    return {
      committeeStatus: period.status,
      approvalStatus: period.approvalStatus,
      meetingCompletion: totalMeetings > 0 ? Math.round((completedMeetings / totalMeetings) * 100) : 0,
      pendingCommitments: openCommitments,
      closedCommitments,
      totalCommitments,
      participationRate: totalEmployees > 0 ? Math.round((totalVotes / totalEmployees) * 100) : 0,
      nextMeeting: nextMeeting ? { date: nextMeeting.meetingDate, agenda: nextMeeting.agenda } : null,
      totalMembers: period.members.length,
      periodName: period.periodName,
    };
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  private async refreshStatus(period: CopasstPeriodDocument) {
    const now = new Date();
    const thirty = new Date(now); thirty.setDate(thirty.getDate() + 30);
    if (period.endDate < now) period.status = 'VENCIDO';
    else if (period.endDate < thirty) period.status = 'PROXIMO_A_VENCER';
    else period.status = 'ACTIVO';
    if (period.status !== 'ACTIVO') {
      await this.alertsService.create({
        companyId: period.companyId.toString(), type: 'COPASST_EXPIRATION',
        message: `COPASST ${period.status.toLowerCase()}`,
        severity: AlertSeverity.MEDIUM,
      }).catch(() => {});
    }
    await period.save();
    return period;
  }
}
