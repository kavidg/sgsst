import { Body, Controller, Get, HttpCode, Post, Query, RawBodyRequest, Req, UnauthorizedException, ForbiddenException, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { WhatsAppWebhookService } from './whatsapp-webhook.service';

/**
 * Fase 3B-2A — Webhook PÚBLICO de Meta WhatsApp Cloud API.
 *
 * SIN FirebaseAuthGuard / CompanyAccessGuard / Roles (Meta no se autentica
 * con la app). Toda la lógica vive en WhatsAppWebhookService; el controller
 * solo traduce HTTP. Respuestas rápidas; sin llamadas externas a Meta.
 *
 * Endpoints:
 *   GET  /webhooks/whatsapp  → challenge de verificación de suscripción.
 *   POST /webhooks/whatsapp  → eventos de estado (SENT/DELIVERED/READ/FAILED).
 *
 * Seguridad: firma X-Hub-Signature-256 sobre body RAW (secreto de webhook
 * separado del access token), body limitado a 64 KB, JSON inválido → 400 sin
 * stack trace, sin secrets en logs ni respuestas.
 */
const WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly webhookService: WhatsAppWebhookService,
    private readonly configService: ConfigService,
  ) {}

  /** Verificación de suscripción: Meta llama con hub.mode/hub.verify_token/hub.challenge. */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.webhookService.verifySubscribe(mode, token, challenge);
    if (result === null) throw new ForbiddenException('WHATSAPP_WEBHOOK_VERIFICATION_FAILED');
    // Meta espera el challenge crudo como cuerpo de la respuesta.
    return result;
  }

  /** Eventos de estado. Meta requiere 200 aunque no se procese nada útil. */
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request> & { rawBody?: Buffer },
    @Body() payload: unknown,
  ) {
    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      // Sin raw body el POST no es verificable: no aceptar writes no firmados.
      throw new ServiceUnavailableException('WHATSAPP_WEBHOOK_RAW_BODY_UNAVAILABLE');
    }
    if (rawBody.length > WEBHOOK_BODY_LIMIT_BYTES) {
      throw new BadRequestException('WHATSAPP_WEBHOOK_PAYLOAD_TOO_LARGE');
    }
    if (payload === undefined || payload === null || typeof payload !== 'object') {
      throw new BadRequestException('WHATSAPP_WEBHOOK_INVALID_JSON');
    }
    const hubSignature = req.header('x-hub-signature-256');
    return this.webhookService.processStatusUpdate(payload, rawBody, hubSignature);
  }
}
