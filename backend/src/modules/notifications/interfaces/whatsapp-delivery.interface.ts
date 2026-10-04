/**
 * Fase 3B-1 — Contratos del canal WhatsApp.
 *
 * El dominio (NotificationDeliveryService, phva-advanced, controllers) NO
 * conoce Meta Cloud API: solo esta interfaz. Los detalles de Meta (endpoint,
 * headers, Bearer token, Phone Number ID, payload) viven SOLO en
 * MetaWhatsAppAdapter (mismo patrón de ResendEmailAdapter en Fase 3A).
 */

/** Parámetros de plantilla WhatsApp (estructura abstracta {{1}}, {{2}}, ...). */
export interface WhatsAppTemplateParameter {
  type: 'text';
  text: string;
}

/** Mensaje de WhatsApp genérico (sin tipos de Meta). */
export interface WhatsAppMessage {
  /** Teléfono del destinatario en formato E.164 sin '+', p. ej. '573001112233'. */
  recipientPhone: string;
  /** Nombre del trabajador para la plantilla. */
  employeeDisplayName: string;
  /** URL ABSOLUTA de aceptación: misma /sign/:token de la campaña. */
  acceptanceUrl: string;
  /** Idempotency local (Meta no soporta header Idempotency-Key: clave lógica). */
  idempotencyKey?: string;
  /** Contexto trazable (NO se envía a Meta; para logs seguros del adapter). */
  campaignId?: string;
  campaignWorkerId?: string;
  employeeId?: string;
  /** Plantillabusiness-initiated: nombre/idioma configurados (NUNCA hardcode). */
  templateName?: string;
  templateLanguage?: string;
  /** Parámetros extendibles sin tocar el dominio. */
  templateParameters?: WhatsAppTemplateParameter[];
}

/** Resultado normalizado del proveedor de WhatsApp. */
export interface WhatsAppDeliveryResult {
  success: boolean;
  /** ID del mensaje en el proveedor (Meta: messages[0].id). */
  providerMessageId?: string;
  /** Código de error INTERNO controlado (NUNCA el payload crudo de Meta). */
  errorCode?: string;
  /** Mensaje de error saneado (sin access token ni Authorization). */
  errorMessage?: string;
  timestamp: Date;
}

/**
 * Proveedor de entrega de WhatsApp. Implementaciones:
 * - MetaWhatsAppAdapter (producción, Cloud API).
 * - MockWhatsAppProvider (tests/dev explícito; nunca activo en prod).
 * - UnconfiguredWhatsAppAdapter (sin config; fallo controlado).
 */
export interface WhatsAppDeliveryProvider {
  send(message: WhatsAppMessage): Promise<WhatsAppDeliveryResult>;
}
