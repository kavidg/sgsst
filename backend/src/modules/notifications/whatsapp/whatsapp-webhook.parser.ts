import { Logger } from '@nestjs/common';

/**
 * Fase 3B-2A — Parser aislado del webhook de WhatsApp Cloud API (Meta).
 *
 * Responsabilidad ÚNICA: transformar el payload HTTP crudo de Meta en eventos
 * normalizados `WhatsAppWebhookEvent`. NO toca MongoDB (el service decide la
 * transición); el dominio NUNCA recibe el payload completo de Meta.
 *
 * Estructura real del payload de estados (documentación Meta Cloud API):
 * { object: 'whatsapp_business_account',
 *   entry: [{ id, changes: [{ field: 'messages',
 *     value: { messaging_product, metadata, contacts?, statuses: [{
 *       id, status, timestamp, recipient_id, errors?: [{ code, title, message }]
 *     }] } }] }] }
 */

/** Evento normalizado: lo ÚNICO que el resto del dominio conoce de Meta. */
export type WhatsAppWebhookEvent = {
  /** message.id de Meta → NotificationDelivery.providerMessageId. */
  providerMessageId: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  /** Epoch (segundos) reportado por Meta, si viene. */
  timestamp?: Date;
  /** Número destino enmascarable; NO se usa para buscar el delivery. */
  recipientPhone?: string;
  errorCode?: string;
  /** Mensaje de error recortado y saneado (sin secretos/payload crudo). */
  errorMessage?: string;
  /** Estado original de Meta (para registrar eventos no mapeados). */
  rawStatus?: string;
};

/** Resultado de parsear un POST completo. */
export type WhatsAppWebhookParseResult = {
  events: WhatsAppWebhookEvent[];
  /** Eventos con status no mapeado (se registran y se ignoran; nunca rompen). */
  ignoredRawStatuses: string[];
  /** Bloques entry/change con forma inesperada (se ignoran de forma segura). */
  ignoredBlocks: number;
};

const STATUS_MAP: Record<string, WhatsAppWebhookEvent['status']> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

/** Longitud máxima del mensaje de error almacenado (diagnóstico mínimo). */
const MAX_ERROR_MESSAGE_LENGTH = 300;

export class WhatsAppWebhookParser {
  private readonly logger = new Logger(WhatsAppWebhookParser.name);

  /**
   * Normaliza el body crudo del webhook. Un body inválido/desconocido NUNCA
   * lanza: devuelve resultado vacío para que el service responda 200 a Meta
   * (reintentos innecesarios por formas no soportadas no aportan nada).
   */
  parse(rawBody: unknown): WhatsAppWebhookParseResult {
    const result: WhatsAppWebhookParseResult = { events: [], ignoredRawStatuses: [], ignoredBlocks: 0 };
    if (!rawBody || typeof rawBody !== 'object') return result;

    const body = rawBody as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id?: unknown;
              status?: unknown;
              timestamp?: unknown;
              recipient_id?: unknown;
              errors?: Array<{ code?: unknown; message?: unknown; title?: unknown; error_data?: { details?: unknown } }>;
            }>;
          };
        }>;
      }>;
    };
    if (!Array.isArray(body.entry)) return result;

    for (const entry of body.entry) {
      if (!entry || !Array.isArray(entry.changes)) {
        result.ignoredBlocks += 1;
        continue;
      }
      for (const change of entry.changes) {
        const statuses = change?.value?.statuses;
        if (!Array.isArray(statuses)) {
          // P. ej. field distinto de 'messages' o value de mensajes ENTRANTE:
          // fuera de alcance (Fase 3B-2A solo estados de salida). Se ignora.
          result.ignoredBlocks += 1;
          continue;
        }
        for (const rawStatus of statuses) {
          const id = typeof rawStatus?.id === 'string' ? rawStatus.id.trim() : '';
          const statusName = typeof rawStatus?.status === 'string' ? rawStatus.status.trim().toLowerCase() : '';
          if (!id || !statusName) {
            result.ignoredBlocks += 1;
            continue;
          }
          const mapped = STATUS_MAP[statusName];
          if (!mapped) {
            // Status futuro/desconocido: se registra y se ignora sin romper.
            result.ignoredRawStatuses.push(statusName);
            continue;
          }
          const event: WhatsAppWebhookEvent = {
            providerMessageId: id,
            status: mapped,
            rawStatus: statusName,
          };
          const ts = Number(rawStatus.timestamp);
          if (Number.isFinite(ts) && ts > 0) event.timestamp = new Date(ts * 1000);
          const recipientId = typeof rawStatus?.recipient_id === 'string' ? rawStatus.recipient_id.trim() : '';
          if (recipientId) event.recipientPhone = recipientId;
          if (mapped === 'FAILED') {
            const firstError = Array.isArray(rawStatus.errors) ? rawStatus.errors[0] : undefined;
            const code = firstError?.code;
            if (code !== undefined && code !== null) event.errorCode = String(code);
            const message =
              (typeof firstError?.error_data?.details === 'string' && firstError.error_data.details) ||
              (typeof firstError?.message === 'string' && firstError.message) ||
              (typeof firstError?.title === 'string' && firstError.title) ||
              '';
            // Saneo: solo texto, recortado. NUNCA se guarda el payload crudo.
            if (message) event.errorMessage = String(message).slice(0, MAX_ERROR_MESSAGE_LENGTH);
          }
          result.events.push(event);
        }
      }
    }
    if (result.ignoredRawStatuses.length > 0) {
      this.logger.log(`Webhook WhatsApp: statuses ignorados (no mapeados): ${result.ignoredRawStatuses.join(', ')}`);
    }
    return result;
  }
}
