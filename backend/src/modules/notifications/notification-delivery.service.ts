import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';

import { OtpRateLimitService } from '../otp-rate-limit/otp-rate-limit.service';
import { DeliveryMethod, WorkerStatus } from '../worker-signature-campaign/schemas/worker-signature-campaign.schema';
import {
  NotificationDelivery,
  NotificationDeliveryDocument,
  DeliveryChannel,
  DeliveryProvider,
  NotificationDeliveryStatus,
  NotificationEventType,
} from './schemas/notification-delivery.schema';
import { EmailDeliveryProvider } from './interfaces/notification-delivery.interface';
import { WhatsAppDeliveryProvider } from './interfaces/whatsapp-delivery.interface';
import { EMAIL_PROVIDER_TOKEN, WHATSAPP_PROVIDER_TOKEN } from './notifications.constants';
import { normalizePhoneForWhatsApp } from './utils/phone.util';
import {
  buildAcceptanceEmailHtml,
  buildAcceptanceEmailSubject,
  buildAcceptanceEmailText,
} from './email/acceptance-email.template';

/** Tipo de entrega: envío inicial vs reenvío manual (misma campaña/worker/token). */
export enum EmailDeliveryKind {
  SEND_INITIAL = 'SEND_INITIAL',
  RESEND = 'RESEND',
}

/** Datos mínimos para enviar el correo de aceptación (1.1.2). */
export interface AcceptanceEmailDeliveryInput {
  companyId: Types.ObjectId;
  campaignId: Types.ObjectId;
  campaignWorkerId: Types.ObjectId;
  /** Empleado fuente (string _id del módulo Employees), si aplica. */
  employeeId?: string;
  recipientEmail: string;
  workerName: string;
  companyName?: string;
  /** Mismo token del worker → misma URL /sign/:token (NUNCA otro token). */
  signToken: string;
  /** Base pública del frontend, p. ej. https://app.dominio.com */
  frontendBaseUrl: string;
  expiresAt?: Date;
  kind?: EmailDeliveryKind;
}

/** Resultado del intento de entrega (para respuestas UI y auditoría). */
export interface AcceptanceEmailDeliveryResult {
  attempted: boolean;
  success: boolean;
  status: NotificationDeliveryStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  deliveryId?: string;
}

/** Rate-limit del envío por worker (anti doble-click): 3 por hora. */
const EMAIL_SEND_RATE_LIMIT_MAX = 3;
const EMAIL_SEND_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
/** Rate-limit del envío WhatsApp por worker (misma filosofía anti doble-click). */
const WHATSAPP_SEND_RATE_LIMIT_MAX = 3;
const WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Fase 3B-1 — Datos para enviar el WhatsApp de aceptación (1.1.2).
 * Mismo campaign/worker/token que email: el enlace es EXACTAMENTE el mismo
 * /sign/:token; WhatsApp es solo OTRO CANAL de entrega del mismo proceso.
 */
export interface AcceptanceWhatsAppDeliveryInput {
  companyId: Types.ObjectId;
  campaignId: Types.ObjectId;
  campaignWorkerId: Types.ObjectId;
  employeeId?: string;
  /** Employee.mobilePhone / SignatureCampaignWorker.phone (única fuente). */
  recipientPhone?: string;
  workerName: string;
  /** Mismo token del worker → misma URL /sign/:token (NUNCA otro token). */
  signToken: string;
  /** Base pública del frontend (igual que email). */
  frontendBaseUrl: string;
  /** Código de país para normalización (p. ej. '57'); vacío = no inferir. */
  defaultCountryCode?: string;
  kind?: EmailDeliveryKind;
}

/** Resultado del intento WhatsApp (misma forma que el de email). */
export interface AcceptanceWhatsAppDeliveryResult {
  attempted: boolean;
  success: boolean;
  status: NotificationDeliveryStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  deliveryId?: string;
}

/**
 * Fase 3A — Infraestructura de entrega de notificaciones.
 *
 * - Único punto donde el dominio habla con un proveedor de email (vía la
 *   interfaz EmailDeliveryProvider; implementación actual: Resend).
 * - Registra CADA intento en NotificationDelivery (canal EMAIL, provider
 *   RESEND). Estados reales: PENDING → SENT | FAILED (sin fingir DELIVERED
 *   hasta tener webhooks).
 * - Idempotencia del envío inicial: reclamación atómica por clave
 *   `SEND_INITIAL:{workerId}` (índice único sparse) + rate-limit + header
 *   Idempotency-Key del proveedor. El reenvío manual usa su propia clave
 *   `{kind}:{workerId}:{uuid}` (siempre permitido, no bloqueado).
 * - Un fallo del proveedor NO lanza hacia el flujo de campaña: devuelve
 *   success:false para que "Enviar a aceptación" nunca se invalide.
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectModel(NotificationDelivery.name)
    private readonly deliveryModel: Model<NotificationDeliveryDocument>,
    /** Rate-limit distribuido existente del repo (mismo mecanismo OTP/COPASST). */
    private readonly rateLimitService: OtpRateLimitService,
    /** Interfaz del proveedor; Resend se inyecta vía factory del módulo. */
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly emailProvider: EmailDeliveryProvider,
    /** Fase 3B-1 — proveedor WhatsApp (Meta | mock | sin configurar). */
    @Inject(WHATSAPP_PROVIDER_TOKEN) private readonly whatsAppProvider: WhatsAppDeliveryProvider,
  ) {}

  /**
   * Envío inicial del correo de aceptación (1.1.2). Idempotente por worker:
   * dos requests simultáneos solo materializan UN registro/envío.
   */
  async sendInitialAcceptanceEmail(input: AcceptanceEmailDeliveryInput): Promise<AcceptanceEmailDeliveryResult> {
    return this.deliverAcceptanceEmail(input, EmailDeliveryKind.SEND_INITIAL);
  }

  /**
   * Reenvío manual del correo de aceptación: reutiliza campaña/worker/token/URL
   * (NO crea campaña nueva) y queda separado del envío inicial.
   */
  async resendAcceptanceEmail(input: AcceptanceEmailDeliveryInput): Promise<AcceptanceEmailDeliveryResult> {
    return this.deliverAcceptanceEmail(input, EmailDeliveryKind.RESEND);
  }

  /**
   * Fase 3B-1 — Envío inicial del WhatsApp de aceptación (1.1.2).
   * Misma filosofía que email: idempotente por worker, sin bloquear campaña.
   */
  async sendInitialAcceptanceWhatsApp(
    input: AcceptanceWhatsAppDeliveryInput,
  ): Promise<AcceptanceWhatsAppDeliveryResult> {
    return this.deliverAcceptanceWhatsApp(input, EmailDeliveryKind.SEND_INITIAL);
  }

  /**
   * Fase 3B-1 — Reenvío manual de WhatsApp: mismo campaign/worker/token/URL
   * (NUNCA campaña nueva). Preparado para fase posterior (UI de reenvío).
   */
  async resendAcceptanceWhatsApp(
    input: AcceptanceWhatsAppDeliveryInput,
  ): Promise<AcceptanceWhatsAppDeliveryResult> {
    return this.deliverAcceptanceWhatsApp(input, EmailDeliveryKind.RESEND);
  }

  /** Historial de entregas de un worker (UI 1.1.2, más reciente primero). */
  async listDeliveriesByWorker(
    companyId: Types.ObjectId,
    campaignWorkerId: Types.ObjectId,
    limit = 5,
  ): Promise<NotificationDeliveryDocument[]> {
    return this.deliveryModel
      .find({ companyId, campaignWorkerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /** Última entrega de un canal dado (UI 1.1.2: email o WhatsApp). */
  async listDeliveriesByWorkerAndChannel(
    companyId: Types.ObjectId,
    campaignWorkerId: Types.ObjectId,
    channel: DeliveryChannel,
    limit = 1,
  ): Promise<NotificationDeliveryDocument[]> {
    return this.deliveryModel
      .find({ companyId, campaignWorkerId, channel })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  private async deliverAcceptanceWhatsApp(
    input: AcceptanceWhatsAppDeliveryInput,
    kind: EmailDeliveryKind,
  ): Promise<AcceptanceWhatsAppDeliveryResult> {
    // Normalización del teléfono (pura): Colombia por defecto configurable.
    const recipient = normalizePhoneForWhatsApp(input.recipientPhone, {
      defaultCountryCode: input.defaultCountryCode,
    });
    if (!recipient) {
      // Sin teléfono utilizable: condición CONTROLADA (no lanza, no bloquea,
      // no crea delivery). El enlace manual y email siguen disponibles.
      return {
        attempted: false,
        success: false,
        status: NotificationDeliveryStatus.PENDING,
        errorCode: 'WHATSAPP_RECIPIENT_MISSING',
      };
    }

    // Idempotencia: clave determinística por worker+canal para el inicial.
    const claimKey = kind === EmailDeliveryKind.SEND_INITIAL
      ? `${EmailDeliveryKind.SEND_INITIAL}:${input.campaignWorkerId.toString()}:WHATSAPP`
      : `${EmailDeliveryKind.RESEND}:${input.campaignWorkerId.toString()}:WHATSAPP:${randomUUID()}`;
    const claimed = await this.claimDelivery({
      companyId: input.companyId,
      campaignId: input.campaignId,
      campaignWorkerId: input.campaignWorkerId,
      employeeId: input.employeeId,
      channel: DeliveryChannel.WHATSAPP,
      provider: DeliveryProvider.WHATSAPP_META,
      eventType: NotificationEventType.ACCEPTANCE_LINK_WHATSAPP,
      recipient,
      claimKey,
      kind,
    });
    if (!claimed) {
      return { attempted: false, success: false, status: NotificationDeliveryStatus.PENDING };
    }

    // Rate-limit anti doble-click (solo el envío inicial).
    if (kind === EmailDeliveryKind.SEND_INITIAL) {
      try {
        await this.rateLimitService.assertRateLimit(
          `acceptance_whatsapp:${input.campaignWorkerId.toString()}`,
          WHATSAPP_SEND_RATE_LIMIT_MAX,
          WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS,
          'Demasiados intentos de envío para este trabajador. Intente más tarde.',
        );
      } catch {
        await this.markDeliveryFailed(claimed._id, 'RATE_LIMITED', 'Envío bloqueado temporalmente por intentos repetidos.');
        return {
          attempted: true,
          success: false,
          status: NotificationDeliveryStatus.FAILED,
          errorCode: 'RATE_LIMITED',
          errorMessage: 'Envío bloqueado temporalmente por intentos repetidos.',
          deliveryId: claimed._id.toString(),
        };
      }
    }

    let acceptanceUrl: string;
    try {
      acceptanceUrl = this.buildSignUrl(input.frontendBaseUrl, input.signToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'URL pública ausente.';
      await this.markDeliveryFailed(claimed._id, 'WHATSAPP_URL_MISSING', message);
      return {
        attempted: true,
        success: false,
        status: NotificationDeliveryStatus.FAILED,
        errorCode: 'WHATSAPP_URL_MISSING',
        errorMessage: message,
        deliveryId: claimed._id.toString(),
      };
    }

    const result = await this.whatsAppProvider.send({
      recipientPhone: recipient,
      employeeDisplayName: input.workerName,
      acceptanceUrl,
      campaignId: input.campaignId.toString(),
      campaignWorkerId: input.campaignWorkerId.toString(),
      employeeId: input.employeeId,
    });

    if (result.success) {
      await this.deliveryModel
        .updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: NotificationDeliveryStatus.SENT,
              providerMessageId: result.providerMessageId,
              sentAt: result.timestamp,
            },
          },
        )
        .exec();
      return {
        attempted: true,
        success: true,
        status: NotificationDeliveryStatus.SENT,
        providerMessageId: result.providerMessageId,
        deliveryId: claimed._id.toString(),
      };
    }

    const safeErrorCode = result.errorCode;
    const safeErrorMessage = this.sanitize(result.errorMessage);
    await this.markDeliveryFailed(claimed._id, safeErrorCode, safeErrorMessage);
    return {
      attempted: true,
      success: false,
      status: NotificationDeliveryStatus.FAILED,
      errorCode: safeErrorCode,
      errorMessage: safeErrorMessage,
      deliveryId: claimed._id.toString(),
    };
  }

  private async deliverAcceptanceEmail(
    input: AcceptanceEmailDeliveryInput,
    kind: EmailDeliveryKind,
  ): Promise<AcceptanceEmailDeliveryResult> {
    const recipient = input.recipientEmail?.trim().toLowerCase();
    // Sin email no hay intento (ni email vacío): la campaña sigue normal.
    if (!recipient) {
      return { attempted: false, success: false, status: NotificationDeliveryStatus.PENDING };
    }

    // Idempotencia: SOLO el envío inicial reclama una clave determinística.
    const claimKey = kind === EmailDeliveryKind.SEND_INITIAL
      ? `${EmailDeliveryKind.SEND_INITIAL}:${input.campaignWorkerId.toString()}`
      : `${EmailDeliveryKind.RESEND}:${input.campaignWorkerId.toString()}:${randomUUID()}`;
    const claimed = await this.claimDelivery({
      companyId: input.companyId,
      campaignId: input.campaignId,
      campaignWorkerId: input.campaignWorkerId,
      employeeId: input.employeeId,
      channel: DeliveryChannel.EMAIL,
      provider: DeliveryProvider.RESEND,
      eventType: NotificationEventType.ACCEPTANCE_LINK_EMAIL,
      recipient,
      claimKey,
      kind,
    });
    if (!claimed) {
      // Envío inicial ya reclamado por otra request en curso o previa.
      return { attempted: false, success: false, status: NotificationDeliveryStatus.PENDING };
    }

    // Rate-limit anti doble-click (solo el envío inicial; el reenvío manual
    // legítimo no se bloquea permanentemente).
    if (kind === EmailDeliveryKind.SEND_INITIAL) {
      try {
        await this.rateLimitService.assertRateLimit(
          `acceptance_email:${input.campaignWorkerId.toString()}`,
          EMAIL_SEND_RATE_LIMIT_MAX,
          EMAIL_SEND_RATE_LIMIT_WINDOW_MS,
          'Demasiados intentos de envío para este trabajador. Intente más tarde.',
        );
      } catch {
        await this.markDeliveryFailed(claimed._id, 'RATE_LIMITED', 'Envío bloqueado temporalmente por intentos repetidos.');
        return {
          attempted: true,
          success: false,
          status: NotificationDeliveryStatus.FAILED,
          errorCode: 'RATE_LIMITED',
          errorMessage: 'Envío bloqueado temporalmente por intentos repetidos.',
          deliveryId: claimed._id.toString(),
        };
      }
    }

    const signUrl = this.buildSignUrl(input.frontendBaseUrl, input.signToken);
    const idempotencyKey = `${claimKey}:${claimed._id.toString()}`;
    const result = await this.emailProvider.send({
      to: recipient,
      subject: buildAcceptanceEmailSubject(input.companyName),
      html: buildAcceptanceEmailHtml({
        workerName: input.workerName,
        companyName: input.companyName,
        signUrl,
        expiresAt: input.expiresAt,
      }),
      text: buildAcceptanceEmailText({
        workerName: input.workerName,
        companyName: input.companyName,
        signUrl,
        expiresAt: input.expiresAt,
      }),
      idempotencyKey,
    });

    if (result.success) {
      await this.deliveryModel
        .updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: NotificationDeliveryStatus.SENT,
              providerMessageId: result.providerMessageId,
              sentAt: result.timestamp,
              idempotencyKey,
            },
          },
        )
        .exec();
      return {
        attempted: true,
        success: true,
        status: NotificationDeliveryStatus.SENT,
        providerMessageId: result.providerMessageId,
        deliveryId: claimed._id.toString(),
      };
    }

    const safeErrorCode = result.errorCode;
    const safeErrorMessage = this.sanitize(result.errorMessage);
    await this.markDeliveryFailed(claimed._id, safeErrorCode, safeErrorMessage);
    return {
      attempted: true,
      success: false,
      status: NotificationDeliveryStatus.FAILED,
      errorCode: safeErrorCode,
      errorMessage: safeErrorMessage,
      deliveryId: claimed._id.toString(),
    };
  }

  /**
   * Reclama atómicamente el registro de entrega INSERTANDO con la clave dada
   * (multi-canal desde Fase 3B-1: channel/provider/eventType parametrizados).
   * Con el índice único en `deliveryKey`, dos requests simultáneas compiten
   * por el insert: la ganadora materializa el documento, la perdedora recibe
   * E11000 y NO envía. (No se usa findOneAndUpdate+upsert: sobre una clave
   * ya existente devolvería el documento y dispararía un segundo envío.)
   */
  private async claimDelivery(params: {
    companyId: Types.ObjectId;
    campaignId: Types.ObjectId;
    campaignWorkerId: Types.ObjectId;
    employeeId?: string;
    channel: DeliveryChannel;
    provider: DeliveryProvider;
    eventType: NotificationEventType;
    recipient: string;
    claimKey: string;
    kind: EmailDeliveryKind;
  }): Promise<NotificationDeliveryDocument | null> {
    try {
      const doc = await this.deliveryModel.create({
        companyId: params.companyId,
        campaignId: params.campaignId,
        campaignWorkerId: params.campaignWorkerId,
        employeeId: params.employeeId,
        channel: params.channel,
        eventType: params.eventType,
        recipient: params.recipient,
        provider: params.provider,
        status: NotificationDeliveryStatus.PENDING,
        attempts: 1,
        deliveryKind: params.kind,
        deliveryKey: params.claimKey,
      });
      return doc as NotificationDeliveryDocument;
    } catch (error) {
      if (NotificationDeliveryService.isDuplicateKeyError(error)) {
        // Envío inicial ya reclamado por otra request (en curso o previa).
        return null;
      }
      throw error; // otros errores los maneja el blindaje del llamador
    }
  }

  /** Detecta el error E11000 (clave duplicada) de MongoDB. */
  private static isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    );
  }

  private async markDeliveryFailed(deliveryId: Types.ObjectId, errorCode?: string, errorMessage?: string): Promise<void> {
    // Saneo defensivo: nunca persistir secretos en los mensajes de error.
    const safeMessage = this.sanitize(errorMessage);
    await this.deliveryModel
      .updateOne(
        { _id: deliveryId },
        {
          $set: {
            status: NotificationDeliveryStatus.FAILED,
            failedAt: new Date(),
            errorCode: errorCode ?? 'EMAIL_SEND_FAILED',
            errorMessage: safeMessage,
          },
        },
      )
      .exec();
  }

  /** URL pública de aceptación: mismo token, dominio desde configuración. */
  private buildSignUrl(frontendBaseUrl: string, token: string): string {
    const base = (frontendBaseUrl || '').trim().replace(/\/+$/, '');
    if (!base) {
      // Config incompleta: error controlado (no localhost silencioso).
      throw new ServiceUnavailableException('Configuración de URL pública del frontend ausente (FRONTEND_URL).');
    }
    return `${base}/sign/${token}`;
  }

  /** Quita patrones de secretos por si un mensaje del proveedor los arrastra. */
  private sanitize(message?: string): string | undefined {
    if (!message) return message;
    return message
      .replace(/re_[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/Bearer\s+\S+/gi, '[REDACTED]');
  }
}
