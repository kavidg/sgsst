import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDeliveryDocument = HydratedDocument<NotificationDelivery>;

/**
 * Fase 3A — Canal de entrega de la notificación. La infraestructura se define
 * genérica para Email ahora y WhatsApp después; los valores de los canales de
 * firma ya existen en el dominio worker-signature-campaign (DeliveryMethod),
 * este enum es el propio de la infra de notificaciones.
 */
export enum DeliveryChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

/**
 * Fase 3A — Proveedores de entrega. Solo RESEND existe en esta fase;
 * WHATSAPP_META queda documentado para la fase futura (NO implementado).
 */
export enum DeliveryProvider {
  RESEND = 'RESEND',
  WHATSAPP_META = 'WHATSAPP_META',
}

/**
 * Estados de la entrega (NO del trabajador): no fingir estados que el
 * proveedor no confirmó. Resend sin webhooks solo confirma aceptación del
 * envío, por lo que el ciclo real es PENDING → SENT (o FAILED). DELIVERED,
 * READ y BOUNCED se confirman SOLO vía webhook (Fase 3B-2A para WhatsApp).
 */
export enum NotificationDeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
  BOUNCED = 'BOUNCED',
}

/** Evento/tipo de notificación (aceptación 1.1.2: email y WhatsApp). */
export enum NotificationEventType {
  ACCEPTANCE_LINK_EMAIL = 'ACCEPTANCE_LINK_EMAIL',
  /** Fase 3B-1 — mismo enlace por WhatsApp (otro canal, mismo proceso). */
  ACCEPTANCE_LINK_WHATSAPP = 'ACCEPTANCE_LINK_WHATSAPP',
}

@Schema({ timestamps: true })
export class NotificationDelivery {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  /** Campaña de firma relacionada (worker-signature-campaign), si aplica. */
  @Prop({ type: Types.ObjectId, ref: 'SignatureCampaign' }) campaignId?: Types.ObjectId;
  /** Trabajador de la campaña (SignatureCampaignWorker), si aplica. */
  @Prop({ type: Types.ObjectId, ref: 'SignatureCampaignWorker' }) campaignWorkerId?: Types.ObjectId;
  /** Empleado fuente (Employee), si la entrega nace del módulo Empleados. */
  @Prop({ type: String }) employeeId?: string;

  @Prop({ required: true, enum: Object.values(DeliveryChannel) }) channel!: string;
  @Prop({ required: true }) eventType!: string;
  /** Destinatario (email del trabajador para EMAIL). */
  @Prop({ required: true }) recipient!: string;
  @Prop({ required: true, enum: Object.values(DeliveryProvider) }) provider!: string;
  @Prop() providerMessageId?: string;

  @Prop({ required: true, enum: Object.values(NotificationDeliveryStatus) }) status!: string;
  @Prop() sentAt?: Date;
  /** Webhook: confirmación real de entrega al dispositivo (Meta/Nube). */
  @Prop() deliveredAt?: Date;
  /** Webhook: confirmación de lectura por el destinatario (Meta). */
  @Prop() readAt?: Date;
  @Prop() failedAt?: Date;

  /** Código de error SEGURO del proveedor (p. ej. 'invalid_api_key'). */
  @Prop() errorCode?: string;
  /** Mensaje de error saneado; NUNCA incluye credenciales ni secretos. */
  @Prop() errorMessage?: string;

  /** Número de intentos de envío del registro (reenvío incrementa). */
  @Prop({ default: 0 }) attempts!: number;
  /**
   * Clave de reclamación de idempotencia LOCAL: el envío inicial usa la clave
   * determinística SEND_INITIAL:{workerId} (índice único); el reenvío usa
   * RESEND:{workerId}:{uuid}. Dos requests simultáneas solo materializan una
   * entrega (la perdedora recibe E11000).
   */
  @Prop() deliveryKey?: string;
  /** Envío inicial (SEND_INITIAL) o reenvío manual (RESEND). */
  @Prop() deliveryKind?: string;
  /** Clave de idempotencia del proveedor (Envía: header Idempotency-Key). */
  @Prop() idempotencyKey?: string;

  @Prop({ type: Object }) metadata?: Record<string, unknown>;
}

export const NotificationDeliverySchema = SchemaFactory.createForClass(NotificationDelivery);
NotificationDeliverySchema.index({ companyId: 1, createdAt: -1 });
NotificationDeliverySchema.index({ campaignId: 1 });
NotificationDeliverySchema.index({ campaignWorkerId: 1, createdAt: -1 });
NotificationDeliverySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
NotificationDeliverySchema.index({ deliveryKey: 1 }, { unique: true, sparse: true });
/**
 * Fase 3B-2A — Lookup del webhook por la referencia primaria del mensaje
 * (Meta message.id). Único: un id de proveedor identifica UNA entrega.
 */
NotificationDeliverySchema.index({ providerMessageId: 1 }, { unique: true, sparse: true });
