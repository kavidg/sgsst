/**
 * Fase 3A — Contratos de la infraestructura de notificaciones.
 *
 * El dominio (worker-signature-campaign, phva-advanced) NO conoce Resend:
 * solo conoce esta interfaz. Resend queda aislado detrás del EmailAdapter
 * (patrón adapter/proveedor), de modo que agregar WhatsApp después sea
 * añadir un adapter nuevo sin tocar el flujo principal.
 */

/** Mensaje de email genérico (sin tipos de Resend). */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Remitente "Nombre <correo>"; si se omite usa la config del adapter. */
  from?: string;
  /** Clave de idempotencia para el proveedor (header Idempotency-Key). */
  idempotencyKey?: string;
}

/** Resultado normalizado del proveedor de email. */
export interface EmailDeliveryResult {
  success: boolean;
  /** ID del mensaje en el proveedor (Resend: id del email creado). */
  providerMessageId?: string;
  /** Código de error SEGURO del proveedor, p. ej. 'invalid_api_key'. */
  errorCode?: string;
  /** Mensaje de error saneado (sin credenciales ni secretos). */
  errorMessage?: string;
  timestamp: Date;
}

/**
 * Proveedor de entrega de email. Implementación actual: ResendEmailAdapter.
 * Futura: WhatsAppAdapter NO implementa esta interfaz (canal distinto); el
 * punto común de canales será la capa NotificationDeliveryService.
 */
export interface EmailDeliveryProvider {
  send(input: EmailMessage): Promise<EmailDeliveryResult>;
}
