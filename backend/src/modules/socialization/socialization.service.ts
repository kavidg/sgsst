import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes, createHash } from 'crypto';
import { AlertsService } from '../alerts/alerts.service';
import {
  SocializationSession, SocializationSessionDocument,
  SocializationStatus,
} from './schemas/socialization-session.schema';
import {
  SocializationPresentation, SocializationPresentationDocument,
  PresentationFileType, PresentationVersion,
} from './schemas/socialization-presentation.schema';
import {
  SocializationParticipant, SocializationParticipantDocument,
  ParticipantStatus,
} from './schemas/socialization-participant.schema';
import {
  SocializationToken, SocializationTokenDocument,
} from './schemas/socialization-token.schema';
import {
  SocializationEvidence, SocializationEvidenceDocument,
} from './schemas/socialization-evidence.schema';
import {
  SocializationAudit, SocializationAuditDocument,
} from './schemas/socialization-audit.schema';
import {
  StartSocializationDto, UpdateSocializationDto,
  UploadPresentationDto, AddParticipantsDto, SendReminderDto,
  ViewSlideDto, CompletePresentationDto, SignSocializationDto,
} from './dto/socialization.dto';

@Injectable()
export class SocializationService {
  constructor(
    @InjectModel(SocializationSession.name)
    private readonly sessionModel: Model<SocializationSessionDocument>,
    @InjectModel(SocializationPresentation.name)
    private readonly presentationModel: Model<SocializationPresentationDocument>,
    @InjectModel(SocializationParticipant.name)
    private readonly participantModel: Model<SocializationParticipantDocument>,
    @InjectModel(SocializationToken.name)
    private readonly tokenModel: Model<SocializationTokenDocument>,
    @InjectModel(SocializationEvidence.name)
    private readonly evidenceModel: Model<SocializationEvidenceDocument>,
    @InjectModel(SocializationAudit.name)
    private readonly auditModel: Model<SocializationAuditDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private generateVerificationCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  private generateSignatureHash(participantId: string, name: string, identification: string, timestamp: Date): string {
    return createHash('sha256')
      .update(`${participantId}:${name}:${identification}:${timestamp.toISOString()}:${randomBytes(8).toString('hex')}`)
      .digest('hex');
  }

  private async addAudit(
    companyId: Types.ObjectId,
    action: string,
    opts?: {
      sessionId?: Types.ObjectId;
      participantId?: Types.ObjectId;
      userEmail?: string;
      userName?: string;
      employeeName?: string;
      employeeIdentification?: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.auditModel.create({ companyId, action, timestamp: new Date(), ...opts });
  }

  // ==================== SESSION MANAGEMENT ====================

  async getOrCreateSession(companyId: Types.ObjectId, responsibilitiesDocId: Types.ObjectId, documentVersion: string) {
    let session = await this.sessionModel.findOne({ companyId, responsibilitiesDocId }).exec();
    if (!session) {
      session = await this.sessionModel.create({
        companyId,
        responsibilitiesDocId,
        itemCode: '1.1.2',
        documentVersion,
        status: SocializationStatus.PENDING,
      });
      await this.addAudit(companyId, 'SESSION_CREATED', { sessionId: session._id as Types.ObjectId });
    }
    return session;
  }

  async getSession(companyId: Types.ObjectId, sessionId: string) {
    const session = await this.sessionModel.findOne({ _id: sessionId, companyId }).exec();
    if (!session) throw new NotFoundException('Sesión de socialización no encontrada');
    return session;
  }

  async getSessionByItemCode(companyId: Types.ObjectId, itemCode: string) {
    return this.sessionModel.findOne({ companyId, itemCode }).exec();
  }

  async startSocialization(companyId: Types.ObjectId, itemCode: string, dto: StartSocializationDto, userEmail: string, userName: string) {
    let session = await this.sessionModel.findOne({ companyId, itemCode }).exec();
    if (!session) {
      session = await this.sessionModel.create({
        companyId,
        itemCode,
        documentVersion: '1.0',
        status: SocializationStatus.IN_PROGRESS,
        startDate: new Date(dto.startDate),
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        responsibleName: dto.responsibleName,
        targetAudienceType: dto.targetAudienceType || 'ALL_EMPLOYEES',
        targetDepartments: dto.targetDepartments || [],
        targetPositions: dto.targetPositions || [],
        selectedEmployees: dto.selectedEmployees ? dto.selectedEmployees.map((id) => new Types.ObjectId(id)) : [],
      });
    } else {
      session.status = SocializationStatus.IN_PROGRESS;
      session.startDate = new Date(dto.startDate);
      if (dto.deadline) session.deadline = new Date(dto.deadline);
      if (dto.responsibleName) session.responsibleName = dto.responsibleName;
      if (dto.targetAudienceType) session.targetAudienceType = dto.targetAudienceType;
      if (dto.targetDepartments) session.targetDepartments = dto.targetDepartments;
      if (dto.targetPositions) session.targetPositions = dto.targetPositions;
      if (dto.selectedEmployees) session.selectedEmployees = dto.selectedEmployees.map((id) => new Types.ObjectId(id));
      await session.save();
    }

    await this.addAudit(companyId, 'SOCIALIZATION_STARTED', {
      sessionId: session._id as Types.ObjectId,
      userEmail, userName,
      metadata: { startDate: dto.startDate, deadline: dto.deadline, responsible: dto.responsibleName },
    });

    return session.save();
  }

  async updateSocialization(companyId: Types.ObjectId, sessionId: string, dto: UpdateSocializationDto, userEmail: string) {
    const session = await this.getSession(companyId, sessionId);
    if (dto.startDate) session.startDate = new Date(dto.startDate);
    if (dto.deadline) session.deadline = new Date(dto.deadline);
    if (dto.responsibleName) session.responsibleName = dto.responsibleName;

    await this.addAudit(companyId, 'SOCIALIZATION_UPDATED', {
      sessionId: session._id as Types.ObjectId, userEmail,
      metadata: { startDate: dto.startDate, deadline: dto.deadline },
    });

    return session.save();
  }

  async completeSocialization(companyId: Types.ObjectId, sessionId: string, userEmail: string) {
    const session = await this.getSession(companyId, sessionId);
    session.status = SocializationStatus.SOCIALIZED;
    session.socializedAt = new Date();

    // Check compliance
    if (session.presentationUploaded && session.signedParticipants >= session.totalParticipants) {
      session.isCompliant = true;
      session.status = SocializationStatus.COMPLIANT;
      session.completedAt = new Date();
    }

    await this.addAudit(companyId, 'SOCIALIZATION_COMPLETED', {
      sessionId: session._id as Types.ObjectId, userEmail,
      metadata: { isCompliant: session.isCompliant },
    });

    return session.save();
  }

  async getSessionStats(companyId: Types.ObjectId, sessionId: string) {
    const session = await this.getSession(companyId, sessionId);
    const participants = await this.participantModel.find({ sessionId: session._id }).exec();
    const total = participants.length;
    const completed = participants.filter((p) => p.status === ParticipantStatus.PRESENTATION_COMPLETED || p.status === ParticipantStatus.ACKNOWLEDGED || p.status === ParticipantStatus.SIGNED).length;
    const signed = participants.filter((p) => p.status === ParticipantStatus.SIGNED).length;
    const pending = participants.filter((p) => p.status === ParticipantStatus.PENDING || p.status === ParticipantStatus.LINK_SENT || p.status === ParticipantStatus.LINK_OPENED).length;
    const expired = participants.filter((p) => p.status === ParticipantStatus.EXPIRED).length;
    const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const signingPercent = total > 0 ? Math.round((signed / total) * 100) : 0;

    return {
      total,
      completed,
      signed,
      pending,
      expired,
      completionPercent,
      signingPercent,
      sessionStatus: session.status,
      presentationUploaded: session.presentationUploaded,
      startDate: session.startDate,
      deadline: session.deadline,
      responsibleName: session.responsibleName,
      socializedAt: session.socializedAt,
    };
  }

  // ==================== PARTICIPANTS & TOKENS ====================

  async addParticipants(companyId: Types.ObjectId, sessionId: string, dto: AddParticipantsDto, userEmail: string) {
    const session = await this.getSession(companyId, sessionId);
    const created: SocializationParticipantDocument[] = [];

    // Use bulkWrite with upsert to avoid race conditions (duplicate key errors)
    // $setOnInsert ensures existing participants are NOT modified
    const operations = dto.participants.map((p) => ({
      updateOne: {
        filter: {
          sessionId: session._id,
          employeeId: new Types.ObjectId(p.employeeId),
        },
        update: {
          $setOnInsert: {
            sessionId: session._id,
            companyId,
            employeeId: new Types.ObjectId(p.employeeId),
            employeeName: p.employeeName,
            employeeIdentification: p.employeeIdentification,
            position: p.position,
            department: p.department,
            phone: p.phone,
            email: p.email,
            status: ParticipantStatus.PENDING,
          },
        },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      const bulkResult = await this.participantModel.bulkWrite(operations);
      const upsertedCount = bulkResult.upsertedCount;

      if (upsertedCount > 0) {
        // Single audit entry for the batch instead of per-participant (avoids needing upsertedIds)
        await this.addAudit(companyId, 'PARTICIPANTS_BULK_ADDED', {
          sessionId: session._id as Types.ObjectId,
          userEmail,
          metadata: { count: upsertedCount, total: dto.participants.length },
        });
      }
    }

    // Update session totals
    session.totalParticipants = await this.participantModel.countDocuments({ sessionId: session._id }).exec();
    await session.save();

    return created;
  }

  async getParticipants(companyId: Types.ObjectId, sessionId: string) {
    const session = await this.getSession(companyId, sessionId);
    return this.participantModel.find({ sessionId: session._id }).sort({ createdAt: 1 }).exec();
  }

  async removeParticipant(companyId: Types.ObjectId, sessionId: string, participantId: string, userEmail: string) {
    const participant = await this.participantModel.findOne({ _id: participantId, sessionId, companyId }).exec();
    if (!participant) throw new NotFoundException('Participante no encontrado');
    if (participant.status === ParticipantStatus.SIGNED) throw new BadRequestException('No se puede eliminar un participante que ya firmó.');

    await this.participantModel.deleteOne({ _id: participantId }).exec();
    await this.addAudit(companyId, 'PARTICIPANT_REMOVED', {
      sessionId: new Types.ObjectId(sessionId), employeeName: participant.employeeName, userEmail,
    });

    // Update session totals
    const session = await this.getSession(companyId, sessionId);
    session.totalParticipants = await this.participantModel.countDocuments({ sessionId: session._id }).exec();
    await session.save();

    return { removed: true };
  }

  async generateTokens(companyId: Types.ObjectId, sessionId: string, userEmail: string) {
    const session = await this.getSession(companyId, sessionId);
    const participants = await this.participantModel.find({
      sessionId: session._id,
      status: { $in: [ParticipantStatus.PENDING, ParticipantStatus.LINK_SENT] },
    }).exec();

    const tokens: Array<{ participantId: string; token: string; url: string }> = [];

    for (const participant of participants) {
      if (participant.token && participant.tokenExpiresAt && participant.tokenExpiresAt > new Date()) {
        tokens.push({ participantId: participant._id.toString(), token: participant.token, url: `/socialize/${participant.token}` });
        continue;
      }

      const token = this.generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      participant.token = token;
      participant.tokenExpiresAt = expiresAt;
      participant.status = ParticipantStatus.PENDING;
      await participant.save();

      await this.tokenModel.create({
        token, companyId, participantId: participant._id, sessionId: session._id, expiresAt,
      });

      await this.addAudit(companyId, 'TOKEN_GENERATED', {
        sessionId: session._id as Types.ObjectId, participantId: participant._id as Types.ObjectId,
        employeeName: participant.employeeName, userEmail,
      });

      tokens.push({ participantId: participant._id.toString(), token, url: `/socialize/${token}` });
    }

    return tokens;
  }

  // ==================== PRESENTATION ====================

  async uploadPresentation(
    companyId: Types.ObjectId,
    sessionId: string,
    file: Express.Multer.File,
    dto: UploadPresentationDto,
    userEmail: string,
    userName: string,
  ) {
    const session = await this.getSession(companyId, sessionId);

    let fileType: string;
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') fileType = PresentationFileType.PDF;
    else if (ext === 'pptx') fileType = PresentationFileType.POWERPOINT;
    else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) fileType = PresentationFileType.IMAGE;
    else throw new BadRequestException('Formato no soportado. Use PDF, PPTX o imágenes.');

    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    let presentation = await this.presentationModel.findOne({ sessionId: session._id }).exec();

    const newVersion: PresentationVersion = {
      version: presentation ? `${parseFloat(presentation.currentVersion) + 0.1}` : '1.0',
      fileName: file.originalname,
      fileUrl: dataUrl,
      fileType,
      totalSlides: fileType === PresentationFileType.PDF ? 1 : 1, // Simplified; real PDF parsing needs external lib
      pageThumbnailUrls: [],
      uploadedByEmail: userEmail,
      uploadedByName: userName,
      uploadedAt: new Date(),
    };

    if (!presentation) {
      presentation = await this.presentationModel.create({
        companyId,
        sessionId: session._id,
        title: dto.title,
        description: dto.description,
        versions: [newVersion],
        currentVersion: newVersion.version,
      });
    } else {
      presentation.versions.push(newVersion as never);
      presentation.currentVersion = newVersion.version;
      if (dto.title) presentation.title = dto.title;
      if (dto.description) presentation.description = dto.description;
      await presentation.save();
    }

    session.presentationUploaded = true;
    session.currentPresentationId = presentation._id as Types.ObjectId;
    await session.save();

    await this.addAudit(companyId, 'PRESENTATION_UPLOADED', {
      sessionId: session._id as Types.ObjectId, userEmail, userName,
      metadata: { version: newVersion.version, fileName: file.originalname, fileType },
    });

    return presentation;
  }

  async getPresentation(companyId: Types.ObjectId, sessionId: string) {
    const presentation = await this.presentationModel.findOne({ sessionId: new Types.ObjectId(sessionId) }).exec();
    if (!presentation) throw new NotFoundException('No hay presentación cargada para esta socialización');
    return presentation;
  }

  // ==================== PUBLIC EMPLOYEE FLOW ====================

  async getParticipantByToken(token: string) {
    const participant = await this.participantModel.findOne({ token, tokenExpiresAt: { $gte: new Date() } }).exec();
    if (!participant) throw new BadRequestException('Enlace inválido o expirado.');
    if (participant.status === ParticipantStatus.SIGNED) throw new BadRequestException('Ya has completado el proceso de socialización.');
    if (participant.tokenUsedAt) throw new BadRequestException('Este enlace ya fue utilizado.');

    const session = await this.sessionModel.findById(participant.sessionId).exec();
    if (!session) throw new NotFoundException('Sesión de socialización no encontrada');

    const presentation = session.currentPresentationId
      ? await this.presentationModel.findById(session.currentPresentationId).exec()
      : null;

    return {
      participant: {
        name: participant.employeeName,
        identification: participant.employeeIdentification,
        position: participant.position,
        department: participant.department,
        status: participant.status,
        viewingProgress: participant.viewingProgress,
      },
      session: {
        documentVersion: session.documentVersion,
        startDate: session.startDate,
        responsibleName: session.responsibleName,
      },
      presentation: presentation ? {
        title: presentation.title,
        description: presentation.description,
        currentVersion: presentation.currentVersion,
        versions: presentation.versions,
        fileType: presentation.versions[presentation.versions.length - 1]?.fileType,
        fileUrl: presentation.versions[presentation.versions.length - 1]?.fileUrl,
        totalSlides: presentation.versions[presentation.versions.length - 1]?.totalSlides || 1,
      } : null,
    };
  }

  async openLink(token: string, ipAddress?: string, userAgent?: string) {
    const participant = await this.participantModel.findOne({ token }).exec();
    if (!participant) throw new BadRequestException('Enlace inválido.');

    if (participant.status === ParticipantStatus.PENDING) {
      participant.status = ParticipantStatus.LINK_OPENED;
      participant.ipAddress = ipAddress;
      participant.userAgent = userAgent;
      participant.viewingProgress = {
        currentSlide: 0,
        viewedSlides: [],
        viewingTimeSeconds: 0,
        completionPercent: 0,
        startedAt: new Date(),
      };
      await participant.save();

      await this.addAudit(participant.companyId, 'LINK_OPENED', {
        sessionId: participant.sessionId as Types.ObjectId,
        participantId: participant._id as Types.ObjectId,
        employeeName: participant.employeeName,
        ipAddress, userAgent,
      });
    }

    return { success: true };
  }

  async trackSlideView(token: string, dto: ViewSlideDto) {
    const participant = await this.participantModel.findOne({ token }).exec();
    if (!participant) throw new BadRequestException('Enlace inválido.');

    participant.status = ParticipantStatus.PRESENTATION_VIEWING;
    participant.viewingProgress.currentSlide = dto.currentSlide;
    if (dto.viewingTimeSeconds) {
      participant.viewingProgress.viewingTimeSeconds += dto.viewingTimeSeconds;
    }
    if (dto.viewedSlides) {
      participant.viewingProgress.viewedSlides = [...new Set([...participant.viewingProgress.viewedSlides, ...dto.viewedSlides])];
    }

    // Calculate completion based on total slides (we'll estimate based on viewed slides)
    // In a full implementation, this would come from the presentation's totalSlides
    const estimatedTotalSlides = Math.max(1, dto.viewedSlides?.length || 1);
    participant.viewingProgress.completionPercent = Math.min(100, Math.round((participant.viewingProgress.viewedSlides.length / estimatedTotalSlides) * 100));

    await participant.save();
    return { completionPercent: participant.viewingProgress.completionPercent };
  }

  async completePresentation(token: string, dto: CompletePresentationDto) {
    const participant = await this.participantModel.findOne({ token }).exec();
    if (!participant) throw new BadRequestException('Enlace inválido.');

    participant.status = ParticipantStatus.PRESENTATION_COMPLETED;
    participant.viewingProgress.completionPercent = 100;
    participant.viewingProgress.completedAt = new Date();
    if (dto.viewingTimeSeconds) {
      participant.viewingProgress.viewingTimeSeconds += dto.viewingTimeSeconds;
    }
    await participant.save();

    await this.addAudit(participant.companyId, 'PRESENTATION_COMPLETED', {
      sessionId: participant.sessionId as Types.ObjectId,
      participantId: participant._id as Types.ObjectId,
      employeeName: participant.employeeName,
      metadata: { viewingTimeSeconds: participant.viewingProgress.viewingTimeSeconds },
    });

    return { success: true };
  }

  async signSocialization(token: string, dto: SignSocializationDto) {
    const participant = await this.participantModel.findOne({ token }).exec();
    if (!participant) throw new BadRequestException('Enlace inválido.');
    if (participant.status === ParticipantStatus.SIGNED) throw new BadRequestException('Ya has firmado.');
    if (participant.viewingProgress.completionPercent < 100) throw new BadRequestException('Debes completar la visualización de la presentación antes de firmar.');
    if (!dto.hasRead) throw new BadRequestException('Debes confirmar que has leído y comprendido la información.');

    const session = await this.sessionModel.findById(participant.sessionId).exec();
    if (!session) throw new NotFoundException('Sesión no encontrada');

    const signedAt = new Date();
    const signatureHash = this.generateSignatureHash(participant._id.toString(), participant.employeeName, participant.employeeIdentification, signedAt);
    const verificationCode = this.generateVerificationCode();

    participant.hasRead = dto.hasRead;
    participant.acknowledgedAt = new Date();
    participant.status = ParticipantStatus.SIGNED;
    participant.signedAt = signedAt;
    participant.signatureMethod = dto.signatureMethod;
    participant.signatureData = dto.signatureData;
    participant.signatureHash = signatureHash;
    participant.ipAddress = dto.ipAddress;
    participant.browser = dto.browser;
    participant.os = dto.os;
    participant.userAgent = dto.userAgent;
    participant.tokenUsedAt = new Date();
    await participant.save();

    // Update session stats
    session.signedParticipants = await this.participantModel.countDocuments({ sessionId: session._id, status: ParticipantStatus.SIGNED }).exec();
    session.completedParticipants = await this.participantModel.countDocuments({
      sessionId: session._id,
      status: { $in: [ParticipantStatus.PRESENTATION_COMPLETED, ParticipantStatus.ACKNOWLEDGED, ParticipantStatus.SIGNED] },
    }).exec();
    await session.save();

    // Create evidence record
    const evidence = await this.evidenceModel.create({
      companyId: participant.companyId,
      sessionId: session._id,
      participantId: participant._id,
      employeeName: participant.employeeName,
      employeeIdentification: participant.employeeIdentification,
      employeePhone: participant.phone,
      documentVersion: session.documentVersion,
      presentationTitle: session.currentPresentationId ? (await this.presentationModel.findById(session.currentPresentationId).exec())?.title || 'Presentación SG-SST' : 'Presentación SG-SST',
      slideCompletionPercent: participant.viewingProgress.completionPercent,
      totalViewingTimeSeconds: participant.viewingProgress.viewingTimeSeconds,
      hasRead: participant.hasRead,
      acknowledgedAt: participant.acknowledgedAt,
      signedAt,
      signatureHash,
      signatureMethod: dto.signatureMethod,
      signatureData: dto.signatureData,
      ipAddress: dto.ipAddress,
      browser: dto.browser,
      os: dto.os,
      verificationCode,
    });

    participant.evidenceId = evidence._id as Types.ObjectId;
    await participant.save();

    await this.addAudit(participant.companyId, 'SOCIALIZATION_SIGNED', {
      sessionId: session._id as Types.ObjectId,
      participantId: participant._id as Types.ObjectId,
      employeeName: participant.employeeName,
      employeeIdentification: participant.employeeIdentification,
      ipAddress: dto.ipAddress, userAgent: dto.userAgent,
      metadata: { signatureMethod: dto.signatureMethod, verificationCode, viewingTimeSeconds: participant.viewingProgress.viewingTimeSeconds },
    });

    return {
      signed: true,
      message: '✅ Tu participación ha sido registrada exitosamente.',
      evidence: {
        employeeName: participant.employeeName,
        employeeIdentification: participant.employeeIdentification,
        documentVersion: session.documentVersion,
        signedAt,
        signatureHash: signatureHash.slice(0, 20) + '...',
        verificationCode,
        slideCompletionPercent: participant.viewingProgress.completionPercent,
        totalViewingTimeSeconds: participant.viewingProgress.viewingTimeSeconds,
      },
    };
  }

  // ==================== EVIDENCE & REPORTS ====================

  async getEvidence(companyId: Types.ObjectId, sessionId: string) {
    return this.evidenceModel.find({ companyId, sessionId: new Types.ObjectId(sessionId) }).sort({ signedAt: -1 }).exec();
  }

  async getAuditHistory(companyId: Types.ObjectId, sessionId?: string, limit = 100) {
    const filter: Record<string, unknown> = { companyId };
    if (sessionId) filter.sessionId = new Types.ObjectId(sessionId);
    return this.auditModel.find(filter).sort({ timestamp: -1 }).limit(limit).exec();
  }

  async generateReport(companyId: Types.ObjectId, sessionId: string) {
    const session = await this.getSession(companyId, sessionId);
    const participants = await this.getParticipants(companyId, sessionId);
    const evidence = await this.getEvidence(companyId, sessionId);
    const audits = await this.getAuditHistory(companyId, sessionId, 50);
    let presentation = null;
    if (session.currentPresentationId) {
      presentation = await this.presentationModel.findById(session.currentPresentationId).exec();
    }

    return { session, participants, evidence, audits, presentation };
  }

  // ==================== REMINDERS ====================

  async sendReminders(companyId: Types.ObjectId, sessionId: string, dto: SendReminderDto, userEmail: string) {
    const session = await this.getSession(companyId, sessionId);
    const filter: Record<string, unknown> = {
      sessionId: session._id,
      status: { $in: [ParticipantStatus.PENDING, ParticipantStatus.LINK_SENT, ParticipantStatus.LINK_OPENED, ParticipantStatus.PRESENTATION_VIEWING] },
    };
    if (dto.participantIds?.length) {
      filter._id = { $in: dto.participantIds.map((id) => new Types.ObjectId(id)) };
    }

    const participants = await this.participantModel.find(filter).exec();
    const results: Array<{ participantId: string; name: string; sent: boolean }> = [];

    for (const p of participants) {
      p.lastReminderSentAt = new Date();
      p.reminderCount = (p.reminderCount || 0) + 1;
      await p.save();

      results.push({ participantId: p._id.toString(), name: p.employeeName, sent: true });

      await this.addAudit(companyId, 'REMINDER_SENT', {
        sessionId: session._id as Types.ObjectId,
        participantId: p._id as Types.ObjectId,
        employeeName: p.employeeName, userEmail,
        metadata: { reminderCount: p.reminderCount },
      });
    }

    // Create alert via existing notification engine
    if (results.length > 0) {
      await this.alertsService.create({
        companyId: companyId.toString(),
        type: 'REMINDER',
        message: `📬 Recordatorio enviado a ${results.length} empleado(s) para completar la socialización de responsabilidades SG-SST.`,
        severity: 'MEDIUM' as any,
      }).catch(() => {});
    }

    return { sent: results.length, participants: results };
  }

  async getPendingReminders(companyId: Types.ObjectId) {
    const sessions = await this.sessionModel.find({
      companyId,
      status: { $in: [SocializationStatus.IN_PROGRESS, SocializationStatus.PENDING] },
    }).exec();

    const reminders: Array<{ session: SocializationSessionDocument; participants: SocializationParticipantDocument[] }> = [];

    for (const session of sessions) {
      const participants = await this.participantModel.find({
        sessionId: session._id,
        status: { $in: [ParticipantStatus.PENDING, ParticipantStatus.LINK_SENT, ParticipantStatus.LINK_OPENED, ParticipantStatus.PRESENTATION_VIEWING] },
        $or: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } }, // 3 days since last reminder
        ],
      }).exec();
      if (participants.length > 0) reminders.push({ session, participants });
    }

    return reminders;
  }

  async processAutoReminders(companyId: Types.ObjectId) {
    const pending = await this.getPendingReminders(companyId);
    let totalSent = 0;

    for (const { session, participants } of pending) {
      for (const p of participants) {
        p.lastReminderSentAt = new Date();
        p.reminderCount = (p.reminderCount || 0) + 1;
        await p.save();
        totalSent++;

        await this.addAudit(companyId, 'AUTO_REMINDER_SENT', {
          sessionId: session._id as Types.ObjectId,
          participantId: p._id as Types.ObjectId,
          employeeName: p.employeeName,
          metadata: { reminderCount: p.reminderCount },
        });
      }
    }

    return { sent: totalSent };
  }

  // ==================== COMPLIANCE ====================

  async checkCompliance(companyId: Types.ObjectId, itemCode: string) {
    const session = await this.sessionModel.findOne({ companyId, itemCode }).exec();
    if (!session) return { isCompliant: false, reason: 'No se ha iniciado la socialización' };

    if (!session.presentationUploaded) return { isCompliant: false, reason: 'Falta cargar la presentación de socialización' };
    if (session.status === SocializationStatus.PENDING || session.status === SocializationStatus.IN_PROGRESS) {
      return { isCompliant: false, reason: `Socialización en progreso: ${session.completedParticipants}/${session.totalParticipants} completados` };
    }
    if (session.status === SocializationStatus.SOCIALIZED && !session.isCompliant) {
      return { isCompliant: false, reason: 'Faltan firmas de participantes' };
    }
    if (session.isCompliant) return { isCompliant: true, reason: 'Socialización completada y conforme' };

    return { isCompliant: false, reason: 'Estado desconocido' };
  }
}
