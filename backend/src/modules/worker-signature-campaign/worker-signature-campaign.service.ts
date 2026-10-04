import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { OtpChallengeService } from '../otp-challenge/otp-challenge.service';
import { OtpRateLimitService } from '../otp-rate-limit/otp-rate-limit.service';
// Fase 3B-1 — máscara de teléfono para auditoría (utils puros del módulo).
import { maskPhoneForAudit } from '../notifications/utils/phone.util';
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

// ══════════ Fase 2: seguridad y robustez del flujo público ══════════
// OTP: 6 dígitos cripto-aleatorios, hash HMAC-SHA256 con pepper (OTP_PEPPER o
// pepper por proceso), TTL corto independiente del token de campaña, máximo
// 5 intentos, consumo único. Reproduce el patrón COPASST (F7B-10) sobre el
// store compartido OtpChallengeService — NO es una segunda implementación.
const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_HASH_PEPPER = process.env.OTP_PEPPER ?? randomBytes(32).toString('hex');
const otpHasher = (code: string): string =>
  createHmac('sha256', OTP_HASH_PEPPER).update(code).digest('hex');

// Rate-limits del flujo público (distribuidos vía OtpRateLimitService).
// Claves por token (no por IP: NAT/proxy) + límites diferenciados por riesgo.
const RL_IDENTITY_MAX = 5;
const RL_IDENTITY_WINDOW_MS = 15 * 60 * 1000;
const RL_OTP_REQUEST_MAX = 3;
const RL_OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
// La VALIDACIÓN de OTP tiene bucket propio (no comparte con solicitudes):
// debe permitir agotar los 5 intentos del challenge con margen.
const RL_OTP_VALIDATE_MAX = 10;
const RL_OTP_VALIDATE_WINDOW_MS = 15 * 60 * 1000;
const RL_SIGN_MAX = 5;
const RL_SIGN_WINDOW_MS = 15 * 60 * 1000;

/** Representación segura/truncada de un token para auditoría (nunca completo). */
function shortToken(token?: string | null): string {
  if (!token) return 'n/d';
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

/** Enlace ya completado (firmado/rechazado): estado controlado, no error genérico. */
export class AlreadySignedLinkException extends BadRequestException {
  constructor() { super('Este documento ya fue firmado. El enlace ha finalizado.'); }
}

/** Enlace expirado/no disponible: estado controlado, no error genérico. */
export class ExpiredLinkException extends BadRequestException {
  constructor() { super('Este enlace ha expirado o ya no está disponible. Solicite uno nuevo al área de SST.'); }
}

/**
 * Payload canónico de evidencia (Fase 2, integridad): hash determinístico que
 * vincula la firma con campaignId, workerId, versión, contenido congelado,
 * identificación y timestamp. Se construye al momento de firmar y se guarda en
 * el campo NUEVO opcional `evidencePayloadHash` de SignatureEvidence (las
 * evidencias históricas no se recalculan ni modifican).
 */
export function buildEvidencePayload(parts: {
  campaignId: string;
  workerId: string;
  documentVersion: string;
  documentContent: string;
  identification: string;
  signedAt: Date;
}): string {
  const normalize = (value: string): string => value.replace(/\r\n/g, '\n');
  return [
    `v1`,
    `campaign:${parts.campaignId}`,
    `worker:${parts.workerId}`,
    `version:${parts.documentVersion}`,
    `identification:${parts.identification}`,
    `signedAt:${parts.signedAt.toISOString()}`,
    `content:\n${normalize(parts.documentContent)}`,
  ].join('\n');
}

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
    /** Fase 2 — store compartido de desafíos OTP (patrón COPASST F7B-10). */
    private readonly otpChallengeService: OtpChallengeService,
    /** Fase 2 — rate-limit distribuido de los endpoints públicos. */
    private readonly otpRateLimitService: OtpRateLimitService,
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

  /** Fase 2: OTP cripto-aleatorio (reemplaza Math.random()). */
  private generateOtp(): string {
    const min = 10 ** (OTP_LENGTH - 1);
    return String(randomInt(min, min * 10)).padStart(OTP_LENGTH, '0');
  }

  /** Hash de firma (mecanismo existente, sin cambios para compatibilidad). */
  private generateSignatureHash(workerId: string, name: string, identification: string, timestamp: Date): string {
    return createHash('sha256')
      .update(`${workerId}:${name}:${identification}:${timestamp.toISOString()}:${randomBytes(8).toString('hex')}`)
      .digest('hex');
  }

  /** El token de acceso ya fue consumido (firma/rechazo) o el worker está SIGNED. */
  private isTokenUsedState(tokenDoc: { used?: boolean }, worker: { status?: string }): boolean {
    return !!tokenDoc.used || worker.status === WorkerStatus.SIGNED;
  }

  /** Enlace no utilizable: expirado lógicamente o campaign EXPIRED/ARCHIVED. */
  private isLinkUnavailableState(
    tokenDoc: { expiresAt: Date },
    worker: { status?: string },
    campaign: { status?: string; expiresAt?: Date | null } | null,
  ): boolean {
    if (tokenDoc.expiresAt < new Date()) return true;
    if (worker.status === WorkerStatus.EXPIRED) return true;
    if (campaign && (campaign.status === CampaignStatus.EXPIRED || campaign.status === CampaignStatus.ARCHIVED)) return true;
    return false;
  }

  /** Rate-limit por token para un endpoint público (distribuido, fail-closed). */
  private async assertPublicRateLimit(kind: 'IDENTITY' | 'OTP' | 'OTP_VALIDATE' | 'SIGN', token: string): Promise<void> {
    const config = {
      IDENTITY: { max: RL_IDENTITY_MAX, window: RL_IDENTITY_WINDOW_MS },
      OTP: { max: RL_OTP_REQUEST_MAX, window: RL_OTP_REQUEST_WINDOW_MS },
      OTP_VALIDATE: { max: RL_OTP_VALIDATE_MAX, window: RL_OTP_VALIDATE_WINDOW_MS },
      SIGN: { max: RL_SIGN_MAX, window: RL_SIGN_WINDOW_MS },
    }[kind];
    await this.otpRateLimitService.assertRateLimit(`wsc:pub:${kind}:${token}`, config.max, config.window);
  }

  /** Comparación en tiempo constante de hashes OTP (patrón COPASST). */
  private otpHashesEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
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

  /**
   * Fase 1 (1.1.2) — Workers vigentes de las campañas de un sourceModule
   * (opcionalmente filtradas por versión), indexados por identificación
   * (documento del Employee) para deduplicación. Solo campañas DRAFT/ACTIVE y
   * workers no expirados/rechazados cuentan como "ya enviado".
   */
  async getWorkersBySource(
    companyId: Types.ObjectId,
    sourceModule: string,
    documentVersion?: string,
  ): Promise<Map<string, SignatureCampaignWorkerDocument>> {
    const filter: Record<string, unknown> = {
      companyId,
      sourceModule,
      status: { $in: [CampaignStatus.DRAFT, CampaignStatus.ACTIVE] },
    };
    if (documentVersion) filter.documentVersion = documentVersion;
    const campaigns = await this.campaignModel.find(filter).exec();
    if (!campaigns.length) return new Map();
    const workers = await this.workerModel
      .find({
        companyId,
        campaignId: { $in: campaigns.map((campaign) => campaign._id) },
        status: { $nin: [WorkerStatus.EXPIRED, WorkerStatus.REJECTED] },
      })
      .sort({ createdAt: -1 })
      .exec();
    const byIdentification = new Map<string, SignatureCampaignWorkerDocument>();
    for (const worker of workers) {
      if (worker.identification && !byIdentification.has(worker.identification)) {
        byIdentification.set(worker.identification, worker);
      }
    }
    return byIdentification;
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
    const tokenDoc = await this.tokenModel.findOne({ token }).exec();
    if (!tokenDoc) throw new BadRequestException('Token inválido o ya utilizado.');

    const worker = await this.workerModel.findById(tokenDoc.workerId).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');

    // Fase 2 — el token ya fue consumido (firma/rechazo) o el worker está
    // SIGNED: estado explícito, sin renovar tokens ni revelar PII.
    if (this.isTokenUsedState(tokenDoc, worker)) {
      throw new AlreadySignedLinkException();
    }

    const campaign = await this.campaignModel.findById(worker.campaignId).exec();
    // Fase 2 — enlace no disponible: token vencido, worker EXPIRED o campaign
    // EXPIRED/ARCHIVED. Estado explícito; la evidencia histórica no se toca.
    if (this.isLinkUnavailableState(tokenDoc, worker, campaign)) {
      throw new ExpiredLinkException();
    }

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

  /**
   * Marca el worker como LINK_SENT con el canal de la entrega exitosa
   * (EMAIL desde Fase 3A; WHATSAPP desde Fase 3B-1). Aditivo: el paso a
   * LINK_SENT existe conceptualmente en el enum desde el inicio; antes de la
   * entrega automática nunca se ejecutaba (los workers quedaban PENDING).
   * FALLO de entrega: NO se marca (worker sigue PENDING → enlace manual OK).
   */
  async markWorkerLinkSent(
    companyId: Types.ObjectId,
    workerId: string,
    deliveryMethod: DeliveryMethod = DeliveryMethod.EMAIL,
  ): Promise<void> {
    const worker = await this.workerModel.findOne({ _id: workerId, companyId }).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    if (worker.status === WorkerStatus.PENDING) {
      worker.status = WorkerStatus.LINK_SENT;
      worker.deliveryMethod = deliveryMethod;
      worker.linkSentAt = new Date();
      await worker.save();
    }
  }

  /** Historial de auditoría de entregas EMAIL de un worker (sin secretos). */
  async getWorkerEmailAudit(
    companyId: Types.ObjectId,
    workerId: string,
    limit = 3,
  ): Promise<Array<{ action: string; timestamp: Date }>> {
    const rows = await this.auditModel
      .find({ companyId, workerId, action: { $in: ['EMAIL_SEND_REQUESTED', 'EMAIL_SENT', 'EMAIL_FAILED'] } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
    return rows.map((row) => ({ action: row.action, timestamp: (row as unknown as { timestamp: Date }).timestamp }));
  }

  /**
   * Fase 3A — Auditoría de la entrega de email (aditivo, sin secretos).
   * Registra el hecho en SignatureAudit (patrón existente); el detalle
   * técnico de la entrega vive en NotificationDelivery (módulo notifications).
   * Token SOLO truncado (mismo criterio de shortToken).
   */
  async addEmailDeliveryAudit(
    companyId: Types.ObjectId,
    workerId: string,
    action: 'EMAIL_SEND_REQUESTED' | 'EMAIL_SENT' | 'EMAIL_FAILED',
    details: { campaignId: Types.ObjectId; token?: string; recipientEmail?: string; errorCode?: string; errorMessage?: string },
  ): Promise<void> {
    // Nunca registrar API key, OTP ni token completo.
    const safeError = details.errorMessage ? String(details.errorMessage).slice(0, 300) : undefined;
    await this.addAudit(companyId, action, {
      campaignId: details.campaignId,
      workerId: new Types.ObjectId(workerId),
      metadata: {
        channel: 'EMAIL',
        token: shortToken(details.token),
        recipientEmail: details.recipientEmail,
        errorCode: details.errorCode,
        errorMessage: safeError,
      },
    });
  }

  /**
   * Fase 3B-1 — Auditoría de la entrega WhatsApp (consistente con EMAIL_*).
   * Sin access token, sin OTP, sin URL completa: teléfono enmascarado y
   * token truncado (mismo criterio shortToken).
   */
  async addWhatsAppDeliveryAudit(
    companyId: Types.ObjectId,
    workerId: string,
    action: 'WHATSAPP_SEND_REQUESTED' | 'WHATSAPP_SENT' | 'WHATSAPP_FAILED'
      | 'WHATSAPP_DELIVERED' | 'WHATSAPP_READ',
    details: { campaignId: Types.ObjectId; token?: string; recipientPhone?: string; errorCode?: string; errorMessage?: string },
  ): Promise<void> {
    const safeError = details.errorMessage ? String(details.errorMessage).slice(0, 300) : undefined;
    await this.addAudit(companyId, action, {
      campaignId: details.campaignId,
      workerId: new Types.ObjectId(workerId),
      metadata: {
        channel: 'WHATSAPP',
        token: shortToken(details.token),
        recipientPhone: maskPhoneForAudit(details.recipientPhone),
        errorCode: details.errorCode,
        errorMessage: safeError,
      },
    });
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
    // Fase 2 — rate limit por token (anti brute-force de documento).
    await this.assertPublicRateLimit('IDENTITY', token);

    const { worker } = await this.getWorkerByToken(token);

    // Fase 2 — mensaje genérico: no revela si el documento existe o cuál falló.
    const identificationMatches = !!dto.identification && worker.identification === dto.identification;
    const phoneMatches = !dto.phone || !worker.phone || worker.phone === dto.phone;
    if (!identificationMatches || !phoneMatches) {
      await this.addAudit(worker.companyId, 'IDENTITY_VALIDATION_FAILED', {
        campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
        metadata: { reason: !identificationMatches ? 'identification' : 'phone' },
      });
      throw new BadRequestException('Los datos ingresados no coinciden con este proceso. Verifique e intente de nuevo.');
    }

    worker.status = WorkerStatus.LINK_OPENED;
    worker.openedAt = new Date();
    await worker.save();

    await this.addAudit(worker.companyId, 'IDENTITY_VALIDATED', {
      campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
    });

    // Fase 2 — PII solo tras validar identidad (antes solo displayName parcial).
    const nameParts = worker.name.trim().split(/\s+/);
    return {
      valid: true,
      worker: {
        displayName: nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}` : worker.name,
        identification: worker.identification,
      },
    };
  }

  async sendOtp(token: string, dto: SendOtpDto) {
    const { worker } = await this.getWorkerByToken(token);
    const campaign = await this.campaignModel.findById(worker.campaignId).exec();

    if (!campaign?.requireOtp) {
      return { required: false, message: 'OTP no requerido para esta campaña.' };
    }

    // Fase 2 — anti spam de solicitudes OTP (distribuido por token).
    await this.assertPublicRateLimit('OTP', token);

    // Fase 2 — OTP cripto-aleatorio; SOLO se persiste su hash HMAC (pepper)
    // en el store compartido con TTL corto e independiente del token de
    // campaña. Nada de texto plano en el worker (campo legacy intacto).
    const otp = this.generateOtp();
    const key = `wsc:otp:${worker._id.toString()}`;
    await this.otpChallengeService.setChallenge(key, otpHasher(otp), OTP_TTL_MS);

    worker.otpSentAt = new Date();
    worker.status = WorkerStatus.OTP_SENT;
    worker.deliveryMethod = dto.deliveryMethod;
    await worker.save();

    await this.addAudit(worker.companyId, 'OTP_SENT', {
      campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
      metadata: { deliveryMethod: dto.deliveryMethod },
    });

    // Fase 2 — NOTE: la entrega del código por canal (SMS/WhatsApp/Email)
    // llega en una fase posterior. En desarrollo se devuelve en la respuesta
    // únicamente si NODE_ENV !== 'production' para poder probar el flujo.
    return {
      required: true,
      sent: true,
      message: 'Código de verificación generado. Siga las instrucciones de entrega.',
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  async validateOtp(token: string, dto: ValidateOtpDto) {
    const { worker } = await this.getWorkerByToken(token);
    const campaign = await this.campaignModel.findById(worker.campaignId).exec();
    if (!campaign?.requireOtp) {
      return { valid: true, skipped: true };
    }
    if (!dto.code?.trim()) throw new BadRequestException('Código de verificación requerido.');

    // Fase 2 — rate limit de validaciones OTP por token (anti brute-force;
    // bucket propio, independiente del de solicitudes).
    await this.assertPublicRateLimit('OTP_VALIDATE', token);

    const key = `wsc:otp:${worker._id.toString()}`;
    const codeHash = otpHasher(dto.code.trim());
    const challenge = await this.otpChallengeService.getChallenge(key);

    const invalidCode = 'Código de verificación inválido o vencido. Solicite uno nuevo si persiste.';
    if (!challenge || challenge.expiresAt <= new Date()) {
      await this.addAudit(worker.companyId, 'OTP_FAILED', {
        campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
        metadata: { reason: !challenge ? 'missing' : 'expired' },
      });
      throw new BadRequestException(invalidCode);
    }

    if (!this.otpHashesEqual(challenge.otpHash, codeHash)) {
      // Fase 2 — intento fallido atómico y compartido; al agotar los intentos
      // el challenge se invalida (consumeIfMatches) y queda auditado.
      const attempts = await this.otpChallengeService.incrementAttempts(key, challenge.otpHash);
      if (attempts !== null && attempts >= OTP_MAX_ATTEMPTS) {
        const consumed = await this.otpChallengeService.consumeIfMatches(key, challenge.otpHash);
        if (consumed) {
          await this.addAudit(worker.companyId, 'OTP_BLOCKED', {
            campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
            metadata: { attempts },
          });
        }
      }
      await this.addAudit(worker.companyId, 'OTP_FAILED', {
        campaignId: worker.campaignId as Types.ObjectId, workerId: worker._id as Types.ObjectId,
        metadata: { reason: 'mismatch' },
      });
      throw new BadRequestException(invalidCode);
    }

    // Fase 2 — consumo único atómico: dos validaciones concurrentes del mismo
    // código → solo la primera elimina el challenge y gana.
    const consumed = await this.otpChallengeService.consumeIfMatches(key, challenge.otpHash);
    if (!consumed) {
      throw new BadRequestException(invalidCode);
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
    // Fase 2 — rate limit del endpoint de firma (anti abuso).
    await this.assertPublicRateLimit('SIGN', token);

    const tokenDoc = await this.tokenModel.findOne({ token }).exec();
    if (!tokenDoc) throw new BadRequestException('Token inválido.');
    if (tokenDoc.expiresAt < new Date()) throw new BadRequestException('Token expirado.');

    const worker = await this.workerModel.findById(tokenDoc.workerId).exec();
    if (!worker) throw new NotFoundException('Trabajador no encontrado');

    const campaign = await this.campaignModel.findById(worker.campaignId).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    // Fase 2 — caso C (concurrencia): transición atómica del token. Solo UNA
    // de N requests concurrentes logra marcar used=true (filtro used:false +
    // findAndModify); las demás reciben el estado "ya firmado".
    const claimed = await this.tokenModel
      .findOneAndUpdate({ _id: tokenDoc._id, used: false }, { $set: { used: true, usedAt: new Date(), ipAddress: dto.ipAddress, userAgent: dto.userAgent } }, { new: true })
      .exec();
    if (!claimed) {
      await this.addAudit(worker.companyId, 'DUPLICATE_SIGN_ATTEMPT', {
        campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
        metadata: { token: shortToken(token) },
      });
      throw new AlreadySignedLinkException();
    }

    if (dto.rejectionReason) {
      worker.status = WorkerStatus.REJECTED;
      worker.rejectionReason = dto.rejectionReason;
      await worker.save();

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

    // Fase 2 — integridad: hash canónico que vincula esta firma con la versión
    // y el contenido CONGELADO de esta campaña (nuevo campo opcional; evidencias
    // históricas intactas).
    const evidencePayloadHash = createHash('sha256')
      .update(buildEvidencePayload({
        campaignId: campaign._id.toString(),
        workerId: worker._id.toString(),
        documentVersion: campaign.documentVersion ?? '',
        documentContent: campaign.documentContent ?? '',
        identification: worker.identification,
        signedAt,
      }))
      .digest('hex');

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

    // Fase 2 — el token ya quedó consumido por la transición atómica inicial.

    // Create evidence record (con hash de integridad Fase 2)
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
      evidencePayloadHash,
    } as never);

    await this.addAudit(worker.companyId, 'DOCUMENT_SIGNED', {
      campaignId: campaign._id as Types.ObjectId, workerId: worker._id as Types.ObjectId,
      workerName: worker.name, workerIdentification: worker.identification,
      ipAddress: dto.ipAddress, userAgent: dto.userAgent,
      metadata: { signatureMethod: dto.signatureMethod, verificationCode, evidencePayloadHash },
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
