import { Injectable, Logger } from '@nestjs/common';

import {
  WhatsAppDeliveryProvider,
  WhatsAppDeliveryResult,
  WhatsAppMessage,
  WhatsAppTemplateParameter,
} from '../interfaces/whatsapp-delivery.interface';

/** Opciones de construcción del adapter de Meta (inyectadas por el módulo). */
export interface MetaWhatsAppAdapterOptions {
  /** Phone Number ID de Meta Cloud API (WHATSAPP_PHONE_NUMBER_ID). */
  phoneNumberId: string;
  /** Token de sistema/usuario permanente (WHATSAPP_ACCESS_TOKEN). */
  accessToken: string;
  /** Nombre de la plantilla business-initiated (WHATSAPP_TEMPLATE_NAME). */
  templateName: string;
  /** Idioma de la plantilla (WHATSAPP_TEMPLATE_LANGUAGE), p. ej. 'es'. */
  templateLanguage: string;
  /** Override del endpoint (default graph.facebook.com); útil para tests. */
  graphBaseUrl?: string;
  /** Versión de la Graph API (default v21.0). */
  graphApiVersion?: string;
}

/** Códigos de error INTERNOS controlados (nunca el payload crudo de Meta). */
export const WHATSAPP_ERROR_CODES = {
  NOT_CONFIGURED: 'WHATSAPP_NOT_CONFIGURED',
  PROVIDER_ERROR: 'WHATSAPP_PROVIDER_ERROR',
  RECIPIENT_INVALID: 'WHATSAPP_RECIPIENT_INVALID',
  TEMPLATE_ERROR: 'WHATSAPP_TEMPLATE_ERROR',
  AUTH_ERROR: 'WHATSAPP_AUTH_ERROR',
  RATE_LIMITED: 'WHATSAPP_RATE_LIMITED',
} as const;

/** Errores de Meta que mapean a códigos internos específicos. */
const AUTH_HTTP_STATUS = [401, 403];
const TEMPLATE_META_ERRORS = new Set([132000, 132001, 132005, 132007, 132012, 470]);

/**
 * Fase 3B-1 — ÚNICO lugar donde se conocen los detalles de Meta Cloud API:
 * endpoint HTTP (`POST {graph}/{version}/{phoneNumberId}/messages`), headers
 * (Authorization: Bearer, Content-Type), formato del payload de plantilla y
 * forma de la respuesta. No se agregó ninguna librería HTTP: se usa el
 * `fetch` global de Node 20 (cero dependencias nuevas, regla 4).
 *
 * - Errores externos → resultados controlados (nunca lanza hacia el dominio).
 * - NUNCA imprime el access token ni headers de autorización en logs.
 * - Propaga idempotencyKey en el nombre de la plantilla? NO: Meta Cloud API
 *   no soporta Idempotency-Key; la idempotencia real vive en el
 *   NotificationDeliveryService (deliveryKey + E11000) — el adapter es
 *   stateless respecto a esto.
 */
@Injectable()
export class MetaWhatsAppAdapter implements WhatsAppDeliveryProvider {
  private readonly logger = new Logger(MetaWhatsAppAdapter.name);
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(private readonly options: MetaWhatsAppAdapterOptions) {
    this.baseUrl = (options.graphBaseUrl ?? 'https://graph.facebook.com').replace(/\/+$/, '');
    this.apiVersion = options.graphApiVersion ?? 'v21.0';
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppDeliveryResult> {
    const timestamp = new Date();

    // Validación defensiva del destinatario (E.164 sin '+', solo dígitos).
    if (!/^\d{8,15}$/.test(message.recipientPhone)) {
      return {
        success: false,
        errorCode: WHATSAPP_ERROR_CODES.RECIPIENT_INVALID,
        errorMessage: 'Número de destino inválido para WhatsApp (se esperaba E.164 sin +).',
        timestamp,
      };
    }

    // Parámetros: los explícitos del mensaje, o los mínimos estándar
    // ({{1}} nombre del trabajador, {{2}} enlace de aceptación).
    const parameters: WhatsAppTemplateParameter[] =
      message.templateParameters && message.templateParameters.length
        ? message.templateParameters
        : [
            { type: 'text', text: message.employeeDisplayName },
            { type: 'text', text: message.acceptanceUrl },
          ];

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.recipientPhone,
      type: 'template',
      template: {
        name: message.templateName ?? this.options.templateName,
        language: { code: message.templateLanguage ?? this.options.templateLanguage },
        components: [
          {
            type: 'body',
            parameters,
          },
        ],
      },
    };

    const url = `${this.baseUrl}/${this.apiVersion}/${this.options.phoneNumberId}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          // Secretos SOLO aquí; jamás en logs (regla 5/19).
          Authorization: `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text();

      if (!response.ok) {
        const mapped = this.mapMetaError(response.status, bodyText);
        // Log seguro: código HTTP + errorCode interno; NUNCA el body crudo
        // (podría contener información sensible) ni headers.
        this.logger.warn(
          `Meta rechazó el envío WhatsApp: HTTP ${response.status} → ${mapped.errorCode}.`,
        );
        return { success: false, ...mapped, timestamp };
      }

      // Respuesta Meta 200: { messaging_product, contacts, messages:[{id}] }.
      let providerMessageId: string | undefined;
      try {
        const parsed = JSON.parse(bodyText) as { messages?: Array<{ id?: string }> };
        providerMessageId = parsed.messages?.[0]?.id;
      } catch {
        providerMessageId = undefined;
      }
      return { success: true, providerMessageId, timestamp };
    } catch (error) {
      // Fallo de red/DNS/excepción: controlado, sin stack ni secretos.
      const detail = error instanceof Error ? error.message : 'red no disponible';
      this.logger.error(`Fallo de red hacia Meta Cloud API: ${detail}`);
      return {
        success: false,
        errorCode: WHATSAPP_ERROR_CODES.PROVIDER_ERROR,
        errorMessage: 'No fue posible contactar el proveedor de WhatsApp.',
        timestamp,
      };
    }
  }

  /**
   * Mapea el error de Meta a un código INTERNO controlado. Extrae del body
   * SOLO {error:{code,message}} de forma defensiva y SANEADA (sin secretos).
   */
  private mapMetaError(httpStatus: number, bodyText: string): { errorCode: string; errorMessage: string } {
    let metaCode: number | undefined;
    let metaMessage = '';
    try {
      const parsed = JSON.parse(bodyText) as {
        error?: { code?: number; message?: string; error_subcode?: number };
      };
      metaCode = parsed.error?.code;
      metaMessage = (parsed.error?.message ?? '').slice(0, 200);
    } catch {
      metaMessage = '';
    }

    if (AUTH_HTTP_STATUS.includes(httpStatus) || metaCode === 190) {
      return {
        errorCode: WHATSAPP_ERROR_CODES.AUTH_ERROR,
        errorMessage: 'Credenciales de WhatsApp rechazadas por el proveedor.',
      };
    }
    if (metaCode !== undefined && TEMPLATE_META_ERRORS.has(metaCode)) {
      return {
        errorCode: WHATSAPP_ERROR_CODES.TEMPLATE_ERROR,
        errorMessage: 'La plantilla de WhatsApp fue rechazada o no existe para el idioma configurado.',
      };
    }
    if (httpStatus === 429 || metaCode === 80007 || metaCode === 130429) {
      return {
        errorCode: WHATSAPP_ERROR_CODES.RATE_LIMITED,
        errorMessage: 'Límite de envío de WhatsApp alcanzado temporalmente.',
      };
    }
    return {
      errorCode: WHATSAPP_ERROR_CODES.PROVIDER_ERROR,
      errorMessage: metaMessage || 'El proveedor de WhatsApp rechazó el envío.',
    };
  }
}

/**
 * Provider sin configuración de WhatsApp (equivalente a
 * UnconfiguredEmailAdapter de Fase 3A): la app arranca igual y el envío
 * devuelve un fallo CONTROLADO sin contactar a Meta.
 */
export class UnconfiguredWhatsAppAdapter implements WhatsAppDeliveryProvider {
  private readonly logger = new Logger(UnconfiguredWhatsAppAdapter.name);

  async send(_message: WhatsAppMessage): Promise<WhatsAppDeliveryResult> {
    this.logger.warn('Envío de WhatsApp omitido: configuración de Meta Cloud API no presente.');
    return {
      success: false,
      errorCode: WHATSAPP_ERROR_CODES.NOT_CONFIGURED,
      errorMessage: 'El envío por WhatsApp no está configurado en este entorno (WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN).',
      timestamp: new Date(),
    };
  }
}

/**
 * Provider MOCK para tests/desarrollo EXPLÍCITO (WHATSAPP_PROVIDER=mock):
 * simula éxito con un ID claramente ficticio y NUNCA contacta servicios
 * externos. No se usa silenciosamente como si fuera Meta en producción: la
 * selección depende de configuración explícita (regla 7).
 */
export class MockWhatsAppProvider implements WhatsAppDeliveryProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);
  private counter = 0;

  async send(message: WhatsAppMessage): Promise<WhatsAppDeliveryResult> {
    this.counter += 1;
    this.logger.log(
      `[MOCK] WhatsApp simulado → ${message.recipientPhone.slice(0, 4)}•••  template=${message.templateName ?? '(default)'}`,
    );
    return {
      success: true,
      providerMessageId: `mock_wamid.${Date.now()}.${this.counter}`,
      timestamp: new Date(),
    };
  }
}
