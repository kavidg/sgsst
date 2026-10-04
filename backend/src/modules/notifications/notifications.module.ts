import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { OtpRateLimitModule } from '../otp-rate-limit/otp-rate-limit.module';
// Fase 3B-2A — el webhook audita vía WorkerSignatureCampaignService (exportado;
// ese módulo NO importa NotificationsModule, por lo que no hay ciclo).
import { WorkerSignatureCampaignModule } from '../worker-signature-campaign/worker-signature-campaign.module';
import {
  NotificationDelivery,
  NotificationDeliverySchema,
} from './schemas/notification-delivery.schema';
import { NotificationDeliveryService } from './notification-delivery.service';
import { EmailDeliveryProvider } from './interfaces/notification-delivery.interface';
import { ResendEmailAdapter, UnconfiguredEmailAdapter } from './email/email.adapter';
// Fase 3B-1 — canal WhatsApp (Meta Cloud API | mock | sin configurar).
import {
  MetaWhatsAppAdapter,
  MockWhatsAppProvider,
  UnconfiguredWhatsAppAdapter,
} from './whatsapp/whatsapp.adapter';
import { WhatsAppDeliveryProvider } from './interfaces/whatsapp-delivery.interface';
// Fase 3B-2A — webhook público de Meta (verificación + estados).
import { WhatsAppWebhookController } from './whatsapp/whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp/whatsapp-webhook.service';
import { WhatsAppWebhookParser } from './whatsapp/whatsapp-webhook.parser';

/**
 * Factory del proveedor de email a partir de variables de entorno.
 * Si la config falta (dev local sin credenciales), NO rompe el arranque:
 * registra UnconfiguredEmailAdapter, que produce un fallo CONTROLADO al
 * intentar enviar (nunca intenta con una API key inexistente ni imprime
 * secretos). Con config completa usa el SDK oficial de Resend.
 */
export function createEmailDeliveryProvider(configService: ConfigService): EmailDeliveryProvider {
  const apiKey = configService.get<string>('RESEND_API_KEY')?.trim();
  const fromEmail = configService.get<string>('RESEND_FROM_EMAIL')?.trim();
  const fromName = configService.get<string>('RESEND_FROM_NAME')?.trim();

  if (!apiKey || !fromEmail) {
    return new UnconfiguredEmailAdapter();
  }
  return new ResendEmailAdapter({ apiKey, fromEmail, fromName });
}

// Tokens de inyección (en constants para evitar ciclo service↔module).
import { EMAIL_PROVIDER_TOKEN, WHATSAPP_PROVIDER_TOKEN } from './notifications.constants';

const EMAIL_PROVIDER: Provider = {
  provide: EMAIL_PROVIDER_TOKEN,
  inject: [ConfigService],
  useFactory: createEmailDeliveryProvider,
};

/**
 * Fase 3B-1 — Factory del proveedor WhatsApp según configuración explícita:
 * - WHATSAPP_PROVIDER=mock → MockWhatsAppProvider (tests/dev; NUNCA default).
 * - PHONE_NUMBER_ID + ACCESS_TOKEN + TEMPLATE_NAME completos → Meta real.
 * - En cualquier otro caso → UnconfiguredWhatsAppAdapter (fallo controlado;
 *   el backend SIEMPRE inicia; no se exige config de WhatsApp para bootear).
 * No se inventan valores ni plantillas (regla 5/24).
 */
export function createWhatsAppDeliveryProvider(configService: ConfigService): WhatsAppDeliveryProvider {
  const providerMode = configService.get<string>('WHATSAPP_PROVIDER')?.trim().toLowerCase();
  const phoneNumberId = configService.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim();
  const accessToken = configService.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim();
  const templateName = configService.get<string>('WHATSAPP_TEMPLATE_NAME')?.trim();
  const templateLanguage = configService.get<string>('WHATSAPP_TEMPLATE_LANGUAGE')?.trim() || 'es';

  if (providerMode === 'mock') {
    return new MockWhatsAppProvider();
  }
  if (phoneNumberId && accessToken && templateName) {
    return new MetaWhatsAppAdapter({ phoneNumberId, accessToken, templateName, templateLanguage });
  }
  return new UnconfiguredWhatsAppAdapter();
}

const WHATSAPP_PROVIDER: Provider = {
  provide: WHATSAPP_PROVIDER_TOKEN,
  inject: [ConfigService],
  useFactory: createWhatsAppDeliveryProvider,
};

/**
 * Fase 3A/3B — Infraestructura de notificaciones multi-canal:
 *
 * NotificationDeliveryService
 *        ├── EmailDeliveryProvider → ResendEmailAdapter
 *        └── WhatsAppDeliveryProvider → MetaWhatsAppAdapter | Mock | Unconfigured
 *
 * Fase 3B-2A: webhook público /webhooks/whatsapp (verificación + estados
 * SENT/DELIVERED/READ/FAILED con idempotencia y auditoría sin secretos).
 *
 * Agregar un canal futuro = registrar otro provider aquí sin tocar el flujo
 * principal (la interfaz y el schema ya son multi-canal).
 */
@Module({})
export class NotificationsModule {
  static register(): DynamicModule {
    return {
      module: NotificationsModule,
      imports: [
        MongooseModule.forFeature([
          { name: NotificationDelivery.name, schema: NotificationDeliverySchema },
        ]),
        // Rate-limit distribuido existente del repo (mecanismo OTP/COPASST).
        OtpRateLimitModule,
        // Fase 3B-2A — auditoría WHATSAPP_* del webhook (service exportado).
        WorkerSignatureCampaignModule,
      ],
      // Fase 3B-2A — webhook (parser puro + service + controller público).
      controllers: [WhatsAppWebhookController],
      providers: [
        EMAIL_PROVIDER,
        WHATSAPP_PROVIDER,
        NotificationDeliveryService,
        WhatsAppWebhookParser,
        WhatsAppWebhookService,
      ],
      exports: [NotificationDeliveryService],
    };
  }
}
