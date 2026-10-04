import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

import {
  EmailDeliveryProvider,
  EmailDeliveryResult,
  EmailMessage,
} from '../interfaces/notification-delivery.interface';

/** Opciones de construcción del adapter (inyectadas por el módulo). */
export interface ResendEmailAdapterOptions {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

/**
 * Fase 3A — Adapter de Resend (única implementación real de EmailDeliveryProvider).
 *
 * - Aísla el SDK oficial de Resend: el dominio solo conoce la interfaz.
 * - Convierte la respuesta { data | error } del SDK al resultado normalizado
 *   (nunca lanza por errores del proveedor: devuelve success:false).
 * - Envía con header `Idempotency-Key` cuando se aporta clave (capa extra
 *   anti-duplicados a nivel de Resend, además del dedup local del servicio).
 * - NUNCA registra la API key en logs (ni siquiera parcialmente).
 */
@Injectable()
export class ResendEmailAdapter implements EmailDeliveryProvider {
  private readonly logger = new Logger(ResendEmailAdapter.name);
  private readonly client: Resend;
  private readonly fromEmail: string;
  private readonly fromName?: string;

  constructor(options: ResendEmailAdapterOptions) {
    this.client = new Resend(options.apiKey);
    this.fromEmail = options.fromEmail;
    this.fromName = options.fromName;
  }

  async send(input: EmailMessage): Promise<EmailDeliveryResult> {
    const timestamp = new Date();
    const from = input.from ?? (this.fromName ? `${this.fromName} <${this.fromEmail}>` : this.fromEmail);
    try {
      const response = await this.client.emails.send(
        {
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );

      if (response.error) {
        // Error controlado del proveedor: mensaje ya saneado por el SDK
        // (no contiene la API key). Se registra sin secretos.
        this.logger.warn(
          `Resend rechazó el envío: ${response.error.name} (HTTP ${response.error.statusCode ?? 'n/d'}).`,
        );
        return {
          success: false,
          errorCode: response.error.name,
          errorMessage: response.error.message,
          timestamp,
        };
      }

      return {
        success: true,
        providerMessageId: response.data?.id,
        timestamp,
      };
    } catch (error) {
      // Fallo de red/excepción del SDK: se registra el mensaje, nunca el stack
      // completo ni posibles secretos del entorno.
      const message = error instanceof Error ? error.message : 'Error desconocido del proveedor de email.';
      this.logger.error(`Fallo del proveedor de email (Resend): ${message}`);
      return {
        success: false,
        errorCode: 'RESEND_UNEXPECTED_ERROR',
        errorMessage: message,
        timestamp,
      };
    }
  }
}

/**
 * Adapter cuando NO hay configuración de Resend (p. ej. desarrollo local sin
 * credenciales). La app arranca normalmente; si alguien intenta enviar,
 * produce un fallo CONTROLADO (nunca intenta con una API key inexistente ni
 * expone secretos). Permite probar todo el flujo con mocks en pruebas.
 */
export class UnconfiguredEmailAdapter implements EmailDeliveryProvider {
  private readonly logger = new Logger(UnconfiguredEmailAdapter.name);

  async send(_input: EmailMessage): Promise<EmailDeliveryResult> {
    this.logger.warn('Envío de correo omitido: RESEND_API_KEY/RESEND_FROM_EMAIL no configurados.');
    return {
      success: false,
      errorCode: 'EMAIL_NOT_CONFIGURED',
      errorMessage: 'El envío de correo no está configurado en este entorno (falta RESEND_API_KEY o RESEND_FROM_EMAIL).',
      timestamp: new Date(),
    };
  }
}
