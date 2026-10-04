import { Inject, Injectable, Logger, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { WorkerSignatureCampaignService } from '../../worker-signature-campaign/worker-signature-campaign.service';
import {
  NotificationDelivery,
  NotificationDeliveryDocument,
  NotificationDeliveryStatus,
  DeliveryChannel,
  DeliveryProvider,
} from '../schemas/notification-delivery.schema';
import { WHATSAPP_WEBHOOK_VERIFY_TOKEN_CONFIG_KEY, WHATSAPP_WEBHOOK_APP_SECRET_CONFIG_KEY } from '../notifications.constants';
import { WhatsAppWebhookEvent, WhatsAppWebhookParser } from './whatsapp-webhook.parser';

/** Resumen del procesamiento de un POST (respuesta controlada, sin crudo). */
export interface WhatsAppWebhookProcessResult {
  /** Eventos con transición aplicada. */
  processed: number;
  /** Eventos duplicados o con estado obsoleto (sin escritura, sin error). */
  ignored: number;
  /** Eventos cuyo providerMessageId no corresponde a ninguna entrega propia. */
  notFound: number;
  /** Status de Meta no mapeados (registrados en log, jamás rompen). */
  unknownStatuses: string[];
}

/**
 * Fase 3B-2A — Rango de estados para la máquina: NUNCA retrocede.
 * READ > DELIVERED > SENT > PENDING. FAILED es terminal aparte.
 */
const STATUS_RANK: Record<string, number> = {
  [NotificationDeliveryStatus.PENDING]: 0,
  [NotificationDeliveryStatus.SENT]: 1,
  [NotificationDeliveryStatus.DELIVERED]: 2,
  [NotificationDeliveryStatus.READ]: 3,
};

/**
 * Fase 3B-2A — Servicio del webhook de WhatsApp (Meta Cloud API).
 *
 * Responsabilidades (el controller NO tiene lógica de negocio):
 * 1. GET  verify: challenge de suscripción con comparación timing-safe.
 * 2. POST: validar autenticidad vía X-Hub-Signature-256 (HMAC-SHA256 del body
 *    RAW con WHATSAPP_WEBHOOK_APP_SECRET; NUNCA el access token). Sin secreto
 *    configurado el POST se rechaza de forma controlada (superficie pública:
 *    no se aceptan writes no autenticables).
 * 3. Identificar la entrega SOLO por providerMessageId (channel WHATSAPP +
 *    provider WHATSAPP_META). Jamás por teléfono/employeeId/campaignId del
 *    caller: Meta no define esos vínculos.
 * 4. Aplicar transiciones idempotentes sin regresión (ver STATUS_RANK).
 * 5. Auditoría WHATSAPP_DELIVERED/READ/FAILED una sola vez por transición,
 *    sin secretos ni payload crudo (reutiliza addWhatsAppDeliveryAudit).
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    @InjectModel(NotificationDelivery.name)
    private readonly deliveryModel: Model<NotificationDeliveryDocument>,
    private readonly configService: ConfigService,
    private readonly parser: WhatsAppWebhookParser,
    private readonly campaignService: WorkerSignatureCampaignService,
  ) {}

  // ------------------------------------------------------------------ GET ---
  /**
   * Verificación de suscripción de Meta. Devuelve el challenge SOLO si
   * mode=subscribe y el verify token coincide con la config. Sin token
   * configurado o con token distinto → null (el controller responde 401/403).
   * Nunca se devuelve ni se loggea el token configurado.
   */
  verifySubscribe(mode: string | undefined, token: string | undefined, challenge: string | undefined): string | null {
    const expected = this.configService.get<string>(WHATSAPP_WEBHOOK_VERIFY_TOKEN_CONFIG_KEY)?.trim();
    if (!expected) {
      this.logger.warn('Webhook WhatsApp: verificación rechazada (WHATSAPP_WEBHOOK_VERIFY_TOKEN sin configurar)');
      return null;
    }
    if (mode !== 'subscribe' || !token || !challenge) return null;
    return this.timingSafeEquals(expected, token) ? challenge : null;
  }

  // ----------------------------------------------------------------- POST ---
  /**
   * Procesa un POST de estados. `rawBody` es el body crudo exacto recibido
   * (mismo buffer sobre el que Meta calculó su firma); `payload` su JSON.
   * Lanza Unauthorized/ServiceUnavailable controlados; los eventos con forma
   * inesperada se ignoran sin error (Meta no debe reintentar eternamente).
   */
  async processStatusUpdate(
    payload: unknown,
    rawBody: Buffer,
    hubSignature: string | undefined,
  ): Promise<WhatsAppWebhookProcessResult> {
    const appSecret = this.configService.get<string>(WHATSAPP_WEBHOOK_APP_SECRET_CONFIG_KEY)?.trim();
    if (!appSecret) {
      // Superficie pública: sin secreto no hay forma de autenticar el write.
      throw new ServiceUnavailableException('WHATSAPP_WEBHOOK_NOT_CONFIGURED');
    }
    if (!this.isSignatureValid(rawBody, hubSignature, appSecret)) {
      throw new UnauthorizedException('WHATSAPP_WEBHOOK_INVALID_SIGNATURE');
    }

    const parsed = this.parser.parse(payload);
    const result: WhatsAppWebhookProcessResult = {
      processed: 0,
      ignored: 0,
      notFound: 0,
      unknownStatuses: parsed.ignoredRawStatuses,
    };
    for (const event of parsed.events) {
      const outcome = await this.applyStatusEvent(event);
      if (outcome === 'processed') result.processed += 1;
      else if (outcome === 'not_found') result.notFound += 1;
      else result.ignored += 1;
    }
    return result;
  }

  /** Aplica UN evento normalizado; devuelve el resultado para el resumen. */
  private async applyStatusEvent(event: WhatsAppWebhookEvent): Promise<'processed' | 'ignored' | 'not_found'> {
    // La única asociación válida: id de mensaje almacenado por NOSOTROS.
    const delivery = await this.deliveryModel
      .findOne({
        channel: DeliveryChannel.WHATSAPP,
        provider: DeliveryProvider.WHATSAPP_META,
        providerMessageId: event.providerMessageId,
      })
      .exec();
    if (!delivery) return 'not_found';

    const current = delivery.status as NotificationDeliveryStatus;
    const next = event.status;

    // Duplicado exacto (Meta reintenta el mismo evento): sin escritura.
    if (current === next) return 'ignored';
    // FAILED es terminal: no se sale de FAILED con estados posteriores.
    if (current === NotificationDeliveryStatus.FAILED) return 'ignored';
    // Regresión prohibida (READ→DELIVERED, DELIVERED→SENT, …): sin escritura.
    if (next !== NotificationDeliveryStatus.FAILED && (STATUS_RANK[next] ?? 0) <= (STATUS_RANK[current] ?? 0)) {
      return 'ignored';
    }

    const eventTime = event.timestamp ?? new Date();
    void eventTime;
    const set: Record<string, unknown> = { status: next };
    if (next === NotificationDeliveryStatus.FAILED) {
      set.failedAt = eventTime;
      if (event.errorCode) set.errorCode = event.errorCode;
      if (event.errorMessage) set.errorMessage = event.errorMessage;
    } else {
      if (!delivery.sentAt) set.sentAt = eventTime;
      if (next === NotificationDeliveryStatus.DELIVERED || next === NotificationDeliveryStatus.READ) {
        if (!delivery.deliveredAt) set.deliveredAt = eventTime;
      }
      if (next === NotificationDeliveryStatus.READ) set.readAt = eventTime;
    }

    // Guard status: escritura atómica condicionada al estado observado; si un
    // webhook concurrente ya avanzó el estado, el update no aplica (0 docs).
    const updated = await this.deliveryModel
      .findOneAndUpdate({ _id: delivery._id, status: current }, { $set: set })
      .exec();
    if (!updated) {
      this.logger.warn(
        `Webhook WhatsApp: estado de la entrega cambió concurrentemente (msg=${this.shortId(event.providerMessageId)}); evento descartado`,
      );
      return 'ignored';
    }

    await this.auditTransition(delivery, current, event);
    return 'processed';
  }

  /**
   * Auditoría de la transición (una sola vez por transición real, garantizado
   * por el guard de estado). SIN access token, sin secreto, sin URL con token,
   * sin payload crudo: solo código de error seguro y teléfono enmascarado.
   */
  private async auditTransition(
    delivery: NotificationDeliveryDocument,
    previousStatus: NotificationDeliveryStatus,
    event: WhatsAppWebhookEvent,
  ): Promise<void> {
    const action =
      event.status === NotificationDeliveryStatus.DELIVERED
        ? 'WHATSAPP_DELIVERED'
        : event.status === NotificationDeliveryStatus.READ
          ? 'WHATSAPP_READ'
          : event.status === NotificationDeliveryStatus.FAILED
            ? 'WHATSAPP_FAILED'
            : 'WHATSAPP_SENT';
    // WHATSAPP_SENT ya se audita en el envío inicial (Fase 3B-1): el webhook
    // solo lo audita si encontró la entrega aún PENDING (envío sin cierre).
    if (action === 'WHATSAPP_SENT' && previousStatus !== NotificationDeliveryStatus.PENDING) return;

    try {
      if (!delivery.campaignId || !delivery.campaignWorkerId) return;
      await this.campaignService.addWhatsAppDeliveryAudit(delivery.companyId, String(delivery.campaignWorkerId), action, {
        campaignId: delivery.campaignId as Types.ObjectId,
        recipientPhone: event.recipientPhone ?? delivery.recipient,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
      });
    } catch (error) {
      // La auditoría jamás debe romper la respuesta al webhook de Meta.
      this.logger.warn(`Webhook WhatsApp: no se pudo auditar ${action}: ${this.describeError(error)}`);
    }
  }

  // ------------------------------------------------------------- helpers ---
  /** Valida X-Hub-Signature-256 (formato 'sha256=<hex>') sobre el body RAW. */
  private isSignatureValid(rawBody: Buffer, hubSignature: string | undefined, appSecret: string): boolean {
    if (!hubSignature || !hubSignature.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = hubSignature.slice('sha256='.length).trim();
    return this.timingSafeEquals(expected, received);
  }

  /** Comparación en tiempo constante (no filtra longitud ni prefijo). */
  private timingSafeEquals(expected: string, received: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');
    if (a.length !== b.length) {
      timingSafeEqual(a, a); // mismo coste aunque la longitud difiera
      return false;
    }
    return timingSafeEqual(a, b);
  }

  /** Id de mensaje recortado para logs (no exponer ids completos de Meta). */
  private shortId(id: string): string {
    return id.length <= 12 ? `${id.slice(0, 4)}•••` : `${id.slice(0, 8)}•••`;
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 200) : 'unknown_error';
  }
}
