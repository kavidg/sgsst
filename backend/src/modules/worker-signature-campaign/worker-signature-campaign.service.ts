import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import {
  CampaignStatus, DeliveryMethod, SignatureAudit, SignatureAuditDocument,
  SignatureCampaign, SignatureCampaignDocument,
  SignatureCampaignWorker, SignatureCampaignWorkerDocument,
  SignatureEvidence, SignatureEvidenceDocument,
  SignatureReminder, SignatureReminderDocument,
  SignatureToken, SignatureTokenDocument,
  WorkerStatus,
} from './schemas/worker-signature-campaign.schema';
import {
  AddWorkersDto, CampaignQueryDto, CampaignStatusDto, CreateCampaignDto,
  ResendLinkDto, SendOtpDto, SendReminderDto, SignDocumentDto,
  UpdateCampaignDto, ValidateIdentityDto, ValidateOtpDto,
} from './dto/worker-signature-campaign.dto';

@Injectable()
export class WorkerSignatureCampaignService {
  constructor(
    @InjectModel(SignatureCampaign.name)
    private readonly campaignModel: Model<SignatureCampaignDocument>,
    @InjectModel(SignatureCampaignWorker.name)
    private readonly workerModel: Model<SignatureCampaignWorkerDocument>,
    @InjectModel(SignatureToken.name)
    private readonly tokenModel: Model<SignatureTokenDocument>,
    @InjectModel(SignatureEvidence.name)
    private readonly evidenceModel: Model<SignatureEvidenceDocument>,
    @InjectModel(SignatureAudit.name)
    private readonly auditModel: Model<SignatureAuditDocument>,
    @InjectModel(SignatureReminder.name)
    private readonly reminderModel: Model<SignatureReminderDocument>,
  ) {}

  private async addAudit(
    companyId: Types.ObjectId,
    action: string,
    opts?: { campaignId?: Types.ObjectId; workerId?: Types.ObjectId; userEmail?: string; workerName?: string; workerIdentification?: string; ipAddress?: string; userAgent?: string; metadata?: Record<string, unknown> },
  ) {
    return this.auditModel.create({ companyId, action, timestamp: new Date(), ...opts });
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private generateVerificationCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateSignatureHash(workerId: string, name: string, identification: string, timestamp: Date): string {
    return createHash('sha256')
      .update(`${workerId}:${name}:${identification}:${timestamp.toISOString()}:${randomBytes(8).toString('hex')}`)
      .digest('hex');
  }

  // ==================== CAMPAIGN CRUD ====================

  async create(companyId: Types.ObjectId, dto: CreateCampaignDto, userEmail: string): Promise<SignatureCampaignDocument> {
    const campaign = await this.campaignModel.create({
      companyId,
      ...dto,
      reminderDays: dto.reminderDays ?? [7, 5, 3, 1],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdByEmail: userEmail,
      status: CampaignStatus.DRAFT,
    });
    const audit = await this.addAudit(companyId, 'CAMPAIGN_CREATED', { campaignId: campaign._id as Types.ObjectId, userEmail });
    campaign.auditHistory.push(audit._id as Types.ObjectId);
    return campaign.save();
  }

  async findAll(companyId: Types.ObjectId, query: CampaignQueryDto) {
    const filter: Record<string, unknown> = { companyId };
    if (query.status) filter.status = query.status;
    if (query.documentType) filter.documentType = query.documentType;
    if (query.search) filter.name = { $regex: query.search, $options: 'i' } as any;

    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      this.campaignModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.campaignModel.countDocuments(filter).exec(),
    ]);

    // Enrich with worker stats
    const enriched = await Promise.all(campaigns.map(async (c) => {
      const stats = await this.getCampaignStats(c._id as Types.ObjectId);
      return { ...c.toObject(), stats };
    }));

    return { campaigns: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(companyId: Types.ObjectId, id: string) {
    const campaign = await this.campaignModel.findOne({ _id: id, companyId }).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    const stats = await this.getCampaignStats(campaign._id as Types.ObjectId);
    return { ...campaign.toObject(), stats };
  }

  async update(companyId: Types.ObjectId, id: string, dto: UpdateCampaignDto, userEmail: string) {
    const campaign = await this.campaignModel.findOne({ _id: id, companyId }).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.status !== CampaignStatus.DRAFT) throw new BadRequestException('Solo se pueden editar campañas en borrador.');

    Object.assign(campaign, dto);
    if (dto.expiresAt) campaign.expiresAt = new Date(dto.expiresAt);
    const audit = await this.addAudit(companyId, 'CAMPAIGN_UPDATED', { campaignId: campaign._id as Types.ObjectId, userEmail });
    campaign.auditHistory.push(audit._id as Types.ObjectId);
    return campaign.save();
  }

  async updateStatus(companyId: Types.ObjectId, id: string, dto: CampaignStatusDto, userEmail: string) {
    const campaign = await this.campaignModel.findOne({ _id: id, companyId }).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    campaign.status = dto.status;

    // If activating, generate tokens for all pending workers
    if (dto.status === CampaignStatus.ACTIVE) {
      const workers = await this.workerModel.find({ campaignId: campaign._id, status: WorkerStatus.PENDING }).exec();
      for (const worker of workers) {
        const token = this.generateToken();
        worker.token = token;
        worker.tokenExpiresAt = campaign.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        worker.status = WorkerStatus.PENDING;
        await worker.save();
        await this.tokenModel.create({
          token, companyId, workerId: worker._id, campaignId: campaign._id,
          expiresAt: worker.tokenExpiresAt,
        });
        await this.addAudit(companyId, 'LINK_GENERATED', {
          campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
          workerName: worker.name, workerIdentification: worker.identification, userEmail,
        });
      }
    }

    const audit = await this.addAudit(companyId, `CAMPAIGN_${dto.status}`, { campaignId: campaign._id as Types.ObjectId, userEmail });
    campaign.auditHistory.push(audit._id as Types.ObjectId);
    return campaign.save();
  }

  async getStats(companyId: Types.ObjectId) {
    const total = await this.campaignModel.countDocuments({ companyId }).exec();
    const active = await this.campaignModel.countDocuments({ companyId, status: CampaignStatus.ACTIVE }).exec();
    const completed = await this.campaignModel.countDocuments({ companyId, status: CampaignStatus.COMPLETED }).exec();
    const draft = await this.campaignModel.countDocuments({ companyId, status: CampaignStatus.DRAFT }).exec();
    const totalWorkers = await this.workerModel.countDocuments({ companyId }).exec();
    const totalSigned = await this.workerModel.countDocuments({ companyId, status: WorkerStatus.SIGNED }).exec();
    return { total, active, completed, draft, totalWorkers, totalSigned };
  }

  async getCampaignStats(campaignId: Types.ObjectId) {
    const totalWorkers = await this.workerModel.countDocuments({ campaignId }).exec();
    const signed = await this.workerModel.countDocuments({ campaignId, status: WorkerStatus.SIGNED }).exec();
    const pending = await this.workerModel.countDocuments({ campaignId, status: { $in: [WorkerStatus.PENDING, WorkerStatus.LINK_SENT, WorkerStatus.LINK_OPENED, WorkerStatus.OTP_SENT, WorkerStatus.OTP_VALIDATED, WorkerStatus.DOCUMENT_VIEWED, WorkerStatus.ACCEPTED] } }).exec();
    const rejected = await this.workerModel.countDocuments({ campaignId, status: WorkerStatus.REJECTED }).exec();
    const expired = await this.workerModel.countDocuments({ campaignId, status: WorkerStatus.EXPIRED }).exec();
    const completionPercent = totalWorkers > 0 ? Math.round((signed / totalWorkers) * 100) : 0;
    return { totalWorkers, signed, pending, rejected, expired, completionPercent };
  }

  // ==================== WORKERS ====================

  async addWorkers(companyId: Types.ObjectId, campaignId: string, dto: AddWorkersDto, userEmail: string) {
    const campaign = await this.campaignModel.findOne({ _id: campaignId, companyId }).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.status !== CampaignStatus.DRAFT) throw new BadRequestException('Solo se pueden agregar trabajadores a campañas en borrador.');

    const created: SignatureCampaignWorkerDocument[] = [];
    for (const w of dto.workers) {
      const existing = await this.workerModel.findOne({ companyId, campaignId: campaign._id, identification: w.identification }).exec();
      if (existing) continue; // Skip duplicates
      const worker = await this.workerModel.create({
        companyId, campaignId: campaign._id, ...w,
        status: WorkerStatus.PENDING,
        verificationCode: this.generateVerificationCode(),
      });
      campaign.workers.push(worker._id as Types.ObjectId);
      created.push(worker);
      await this.addAudit(companyId, 'WORKER_ADDED', {
        campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
        workerName: worker.name, workerIdentification: worker.identification, userEmail,
      });
    }
    await campaign.save();
    return created;
  }

  async getWorkers(companyId: Types.ObjectId, campaignId: string) {
    const campaign = await this.campaignModel.findOne({ _id: campaignId, companyId }).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    return this.workerModel.find({ campaignId: campaign._id }).sort({ createdAt: 1 }).exec();
  }

  async removeWorker(companyId: Types.ObjectId, campaignId: string, workerId: string, userEmail: string) {
    const worker = await this.workerModel.findOne({ _id: workerId, campaignId, companyId }).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    if (worker.status === WorkerStatus.SIGNED) throw new BadRequestException('No se puede eliminar un trabajador que ya firmó.');
    await this.workerModel.deleteOne({ _id: workerId }).exec();
    await this.campaignModel.updateOne({ _id: campaignId }, { $pull: { workers: worker._id } }).exec();
    await this.addAudit(companyId, 'WORKER_REMOVED', {
      campaignId: new Types.ObjectId(campaignId), workerName: worker.name, userEmail,
    });
    return { removed: true };
  }

  // ==================== TOKEN & LINK ====================

  async getWorkerByToken(token: string) {
    const tokenDoc = await this.tokenModel.findOne({ token, used: false }).exec();
    if (!tokenDoc) throw new BadRequestException('Token inválido o ya utilizado.');
    if (tokenDoc.expiresAt < new Date()) throw new BadRequestException('Token expirado.');

    const worker = await this.workerModel.findById(tokenDoc.workerId).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');

    return { worker, token: tokenDoc };
  }

  async generateLink(companyId: Types.ObjectId, workerId: string, userEmail: string) {
    const worker = await this.workerModel.findOne({ _id: workerId, companyId }).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');

    // Generate new token if none exists
    if (!worker.token || (worker.tokenExpiresAt && worker.tokenExpiresAt < new Date())) {
      const token = this.generateToken();
      worker.token = token;
      worker.tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      worker.status = WorkerStatus.PENDING;
      await worker.save();
      await this.tokenModel.create({
        token, companyId, workerId: worker._id, campaignId: worker.campaignId,
        expiresAt: worker.tokenExpiresAt,
      });
    }

    await this.addAudit(companyId, 'LINK_GENERATED', {
      campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification, userEmail,
    });

    return { token: worker.token, url: `/sign/${worker.token}` };
  }

  async resendLink(companyId: Types.ObjectId, dto: ResendLinkDto, userEmail: string) {
    const worker = await this.workerModel.findOne({ _id: dto.workerId, companyId }).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');

    worker.linkSentAt = new Date();
    worker.deliveryMethod = dto.deliveryMethod;
    await worker.save();

    await this.addAudit(companyId, 'LINK_RESENT', {
      campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification, userEmail,
      metadata: { deliveryMethod: dto.deliveryMethod },
    });

    return { sent: true, token: worker.token };
  }

  // ==================== PUBLIC WORKER FLOW ====================

  async validateIdentity(token: string, dto: ValidateIdentityDto) {
    const { worker } = await this.getWorkerByToken(token);

    // Validate identification
    if (worker.identification !== dto.identification) {
      throw new BadRequestException('Número de identificación no coincide.');
    }

    // Validate phone if provided
    if (dto.phone && worker.phone && worker.phone !== dto.phone) {
      throw new BadRequestException('Número de teléfono no coincide.');
    }

    worker.status = WorkerStatus.LINK_OPENED;
    worker.openedAt = new Date();
    await worker.save();

    const audit = await this.addAudit(worker.companyId, 'IDENTITY_VALIDATED', {
      campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
    });

    return { valid: true, worker: { name: worker.name, identification: worker.identification, position: worker.position, area: worker.area } };
  }

  async sendOtp(token: string, dto: SendOtpDto) {
    const { worker } = await this.getWorkerByToken(token);
    const campaign = await this.campaignModel.findById(worker.campaignId).exec();

    if (!campaign?.requireOtp) {
      return { required: false, message: 'OTP no requerido para esta campaña.' };
    }

    const otp = this.generateOtp();
    worker.otpCode = otp;
    worker.otpSentAt = new Date();
    worker.status = WorkerStatus.OTP_SENT;
    worker.deliveryMethod = dto.deliveryMethod;
    await worker.save();

    await this.addAudit(worker.companyId, 'OTP_SENT', {
      campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
      metadata: { deliveryMethod: dto.deliveryMethod },
    });

    return { required: true, sent: true, message: `OTP enviado por ${dto.deliveryMethod || 'email'}. En producción se enviaría por SMS/WhatsApp/Email.` };
  }

  async validateOtp(token: string, dto: ValidateOtpDto) {
    const { worker } = await this.getWorkerByToken(token);

    if (worker.otpCode !== dto.code) {
      throw new BadRequestException('Código OTP inválido.');
    }

    worker.otpValidatedAt = new Date();
    worker.status = WorkerStatus.OTP_VALIDATED;
    await worker.save();

    await this.addAudit(worker.companyId, 'OTP_VALIDATED', {
      campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
    });

    return { valid: true };
  }

  async getDocumentForWorker(token: string) {
    const { worker } = await this.getWorkerByToken(token);
    const campaign = await this.campaignModel.findById(worker.campaignId).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    worker.status = WorkerStatus.DOCUMENT_VIEWED;
    worker.documentViewedAt = new Date();
    worker.ipAddress = worker.ipAddress;
    await worker.save();

    await this.addAudit(worker.companyId, 'DOCUMENT_VIEWED', {
      campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
    });

    return {
      company: { name: 'Empresa' },
      document: {
        type: campaign.documentType,
        version: campaign.documentVersion,
        name: campaign.name,
        description: campaign.description,
        content: campaign.documentContent,
        url: campaign.documentUrl,
      },
      requireOtp: campaign.requireOtp,
      requireSignature: campaign.requireSignature,
      requirePdfAcceptance: campaign.requirePdfAcceptance,
    };
  }

  async signDocument(token: string, dto: SignDocumentDto) {
    const tokenDoc = await this.tokenModel.findOne({ token }).exec();
    if (!tokenDoc) throw new BadRequestException('Token inválido.');
    if (tokenDoc.used) throw new BadRequestException('Este token ya fue utilizado.');
    if (tokenDoc.expiresAt < new Date()) throw new BadRequestException('Token expirado.');

    const worker = await this.workerModel.findById(tokenDoc.workerId).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');

    const campaign = await this.campaignModel.findById(worker.campaignId).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    if (dto.rejectionReason) {
      worker.status = WorkerStatus.REJECTED;
      worker.rejectionReason = dto.rejectionReason;
      await worker.save();
      tokenDoc.used = true;
      tokenDoc.usedAt = new Date();
      tokenDoc.ipAddress = dto.ipAddress;
      tokenDoc.userAgent = dto.userAgent;
      await tokenDoc.save();

      await this.addAudit(worker.companyId, 'DOCUMENT_REJECTED', {
        campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
        workerName: worker.name, workerIdentification: worker.identification,
        ipAddress: dto.ipAddress, userAgent: dto.userAgent,
        metadata: { reason: dto.rejectionReason },
      });

      return { signed: false, rejected: true, message: 'Has rechazado el documento.' };
    }

    if (!dto.hasRead) {
      throw new BadRequestException('Debes leer y comprender el documento antes de firmar.');
    }

    const signedAt = new Date();
    const signatureHash = this.generateSignatureHash(worker._id.toString(), worker.name, worker.identification, signedAt);
    const verificationCode = this.generateVerificationCode();

    worker.hasRead = dto.hasRead;
    worker.status = WorkerStatus.SIGNED;
    worker.signedAt = signedAt;
    worker.signatureMethod = dto.signatureMethod;
    worker.signatureData = dto.signatureData;
    worker.signatureHash = signatureHash;
    worker.signatureUrl = dto.signatureUrl;
    worker.ipAddress = dto.ipAddress;
    worker.browser = dto.browser;
    worker.os = dto.os;
    worker.userAgent = dto.userAgent;
    worker.verificationCode = verificationCode;
    await worker.save();

    // Mark token as used
    tokenDoc.used = true;
    tokenDoc.usedAt = signedAt;
    tokenDoc.ipAddress = dto.ipAddress;
    tokenDoc.userAgent = dto.userAgent;
    await tokenDoc.save();

    // Create evidence record
    const evidence = await this.evidenceModel.create({
      companyId: worker.companyId,
      workerId: worker._id,
      campaignId: campaign._id,
      workerName: worker.name,
      workerIdentification: worker.identification,
      workerPhone: worker.phone,
      documentType: campaign.documentType,
      documentVersion: campaign.documentVersion,
      signedAt,
      signatureHash,
      signatureMethod: dto.signatureMethod,
      signatureData: dto.signatureData,
      ipAddress: dto.ipAddress,
      browser: dto.browser,
      os: dto.os,
      otpValidated: !!worker.otpValidatedAt,
      verificationCode,
    });

    await this.addAudit(worker.companyId, 'DOCUMENT_SIGNED', {
      campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
      ipAddress: dto.ipAddress, userAgent: dto.userAgent,
      metadata: { signatureMethod: dto.signatureMethod, verificationCode },
    });

    return {
      signed: true,
      message: '✅ Documento firmado exitosamente.',
      evidence: {
        workerName: worker.name,
        workerIdentification: worker.identification,
        documentType: campaign.documentType,
        signedAt,
        signatureHash,
        verificationCode,
      },
    };
  }

  // ==================== REMINDERS ====================

  async sendReminders(companyId: Types.ObjectId, campaignId: string, dto: SendReminderDto, userEmail: string) {
    const campaign = await this.campaignModel.findOne({ _id: campaignId, companyId }).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    const filter: Record<string, unknown> = { campaignId: campaign._id, status: { $in: [WorkerStatus.PENDING, WorkerStatus.LINK_SENT, WorkerStatus.LINK_OPENED] } };
    if (dto.workerIds?.length) filter._id = { $in: dto.workerIds.map((id) => new Types.ObjectId(id)) };

    const workers = await this.workerModel.find(filter).exec();
    const now = new Date();
    const results: Array<{ workerId: string; name: string; sent: boolean }> = [];

    for (const worker of workers) {
      worker.lastReminderSentAt = now;
      worker.reminderCount = (worker.reminderCount ?? 0) + 1;
      await worker.save();

      await this.reminderModel.create({
        companyId, campaignId: campaign._id, workerId: worker._id,
        daysBeforeExpiration: campaign.expiresAt ? Math.ceil((campaign.expiresAt.getTime() - now.getTime()) / 86_400_000) : 7,
        sentAt: now, deliveryMethod: dto.deliveryMethod, sent: true,
      });

      results.push({ workerId: worker._id.toString(), name: worker.name, sent: true });
      await this.addAudit(companyId, 'REMINDER_SENT', {
        campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
        workerName: worker.name, workerIdentification: worker.identification, userEmail,
        metadata: { deliveryMethod: dto.deliveryMethod },
      });
    }

    return { sent: results.length, workers: results };
  }

  async getPendingReminders(companyId: Types.ObjectId) {
    const now = new Date();
    const campaigns = await this.campaignModel.find({
      companyId, status: CampaignStatus.ACTIVE, expiresAt: { $gte: now },
    }).exec();

    const reminders: Array<{ campaign: SignatureCampaignDocument; workers: SignatureCampaignWorkerDocument[] }> = [];
    for (const campaign of campaigns) {
      if (!campaign.expiresAt) continue;
      const daysUntilExpiry = Math.ceil((campaign.expiresAt.getTime() - now.getTime()) / 86_400_000);
      if (campaign.reminderDays.includes(daysUntilExpiry)) {
        const workers = await this.workerModel.find({
          campaignId: campaign._id,
          status: { $in: [WorkerStatus.PENDING, WorkerStatus.LINK_SENT, WorkerStatus.LINK_OPENED] },
          $or: [
            { lastReminderSentAt: null },
            { lastReminderSentAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
          ],
        }).exec();
        if (workers.length > 0) reminders.push({ campaign, workers });
      }
    }
    return reminders;
  }

  // ==================== EVIDENCE & EXPORT ====================

  async getEvidence(companyId: Types.ObjectId, campaignId: string) {
    return this.evidenceModel.find({ companyId, campaignId }).sort({ signedAt: -1 }).exec();
  }

  async getAllEvidence(companyId: Types.ObjectId) {
    return this.evidenceModel.find({ companyId }).sort({ signedAt: -1 }).limit(100).exec();
  }

  async getCampaignReport(companyId: Types.ObjectId, campaignId: string) {
    const campaign = await this.findById(companyId, campaignId);
    const workers = await this.getWorkers(companyId, campaignId);
    const evidence = await this.getEvidence(companyId, campaignId);
    const audits = await this.auditModel.find({ companyId, campaignId: new Types.ObjectId(campaignId) }).sort({ timestamp: -1 }).limit(50).exec();

    return { campaign, workers, evidence, audits };
  }

  async getAuditHistory(companyId: Types.ObjectId, campaignId?: string, limit = 100) {
    const filter: Record<string, unknown> = { companyId };
    if (campaignId) filter.campaignId = new Types.ObjectId(campaignId);
    return this.auditModel.find(filter).sort({ timestamp: -1 }).limit(limit).exec();
  }

  // ==================== EXPIRATION ====================

  async processExpiredTokens() {
    const now = new Date();
    const expiredTokens = await this.tokenModel.find({ used: false, expiresAt: { $lte: now } }).exec();
    for (const t of expiredTokens) {
      t.used = true;
      t.usedAt = now;
      await t.save();
      await this.workerModel.updateOne({ _id: t.workerId }, { status: WorkerStatus.EXPIRED }).exec();
    }
    return { expired: expiredTokens.length };
  }
}
