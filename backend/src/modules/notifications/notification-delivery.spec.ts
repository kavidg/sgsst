import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { ServiceUnavailableException } from '@nestjs/common';

import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationDeliveryStatus } from './schemas/notification-delivery.schema';
import { UnconfiguredEmailAdapter } from './email/email.adapter';

/**
 * Fase 3A — Pruebas de la infraestructura de notificaciones (Email/Resend).
 * Sin MongoDB en memoria (patrón del repo): modelos stub en memoria,
 * NotificationDeliveryService REAL y provider de email MOCK (regla 7:
 * preferir mocks; la prueba real con Resend queda pendiente de API key).
 */

const COMPANY = new Types.ObjectId();
const CAMPAIGN = new Types.ObjectId();
const WORKER = new Types.ObjectId();

/** Stub del proveedor que registra las llamadas (mock de Resend). */
function buildProviderStub(response: Record<string, unknown> = { success: true, providerMessageId: 're_msg_1', timestamp: new Date() }) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    send: async (input: Record<string, unknown>) => {
      calls.push(input);
      return response;
    },
  };
}

/** Stub del modelo NotificationDelivery con semántica E11000 del índice único. */
function buildDeliveryModel() {
  const seed: Array<Record<string, unknown> & { _id: Types.ObjectId }> = [];
  const model = {
    create: async (data: Record<string, unknown>) => {
      if (seed.some((doc) => doc.deliveryKey === data.deliveryKey)) {
        const err = new Error('E11000 duplicate key') as Error & { code?: number };
        err.code = 11000;
        throw err;
      }
      const doc = { ...data, _id: new Types.ObjectId() };
      seed.push(doc);
      return doc;
    },
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      const chain = {
        exec: async () => {
          const doc = seed.find((d) => String(d._id) === String(filter._id));
          if (doc && update.$set) Object.assign(doc, update.$set);
          return { modifiedCount: doc ? 1 : 0 };
        },
      };
      return chain;
    },
    find: (filter: Record<string, unknown>) => {
      const chain = {
        sort: () => chain,
        limit: () => chain,
        exec: async () =>
          seed.filter((doc) =>
            Object.entries(filter).every(([key, value]) => {
              const actual = (doc as Record<string, unknown>)[key];
              return String(actual) === String(value);
            }),
          ),
      };
      return chain;
    },
  };
  return { model: model as never, seed };
}

function buildService(
  providerResponse?: Record<string, unknown>,
  frontendBaseUrl = 'https://app.empresa.com',
  whatsappProviderOverride?: { send: (input: unknown) => Promise<unknown> },
) {
  const provider = buildProviderStub(providerResponse);
  const rateLimitCalls: Array<Record<string, unknown>> = [];
  const rateLimitStub = {
    assertRateLimit: async (...args: unknown[]) => {
      rateLimitCalls.push({ args });
      return undefined;
    },
    assertOtpRateLimit: async () => undefined,
  };
  const deliveries = buildDeliveryModel();
  // Fase 3B-1 — provider WhatsApp mock inyectado (debe ser configurable por prueba).
  const whatsappProvider = whatsappProviderOverride ?? {
    send: async () => ({ success: true, providerMessageId: 'mock_wamid.1', timestamp: new Date() }),
  };
  const service = new NotificationDeliveryService(
    deliveries.model, rateLimitStub as never, provider as never, whatsappProvider as never,
  );
  return { service, provider, deliveries: deliveries.seed, rateLimitCalls, whatsappProvider };
}

function baseInput(overrides: Record<string, unknown> = {}, frontendBaseUrl = 'https://app.empresa.com') {
  return {
    companyId: COMPANY,
    campaignId: CAMPAIGN,
    campaignWorkerId: WORKER,
    employeeId: new Types.ObjectId().toString(),
    recipientEmail: 'juan@empresa.com',
    workerName: 'Juan Pérez',
    companyName: 'Empresa Demo SAS',
    signToken: 'a'.repeat(64),
    frontendBaseUrl,
    // Fase 3B-1 — código país para WhatsApp (igual que el ConfigService real).
    defaultCountryCode: '57',
    kind: undefined,
    ...overrides,
  };
}

describe('NotificationDeliveryService — Fase 3A (Email/Resend)', () => {
  it('Prueba 1: email válido → el proveedor es llamado una vez', async () => {
    const { service, provider } = buildService();
    const result = await service.sendInitialAcceptanceEmail(baseInput());
    assert.equal(provider.calls.length, 1);
    assert.equal(result.attempted, true);
  });

  it('Prueba 2: email ausente → NO intenta enviar (ni email vacío)', async () => {
    const { service, provider } = buildService();
    const sinEmail = await service.sendInitialAcceptanceEmail(baseInput({ recipientEmail: undefined }));
    const vacio = await service.sendInitialAcceptanceEmail(baseInput({ recipientEmail: '   ' }));
    assert.equal(sinEmail.attempted, false);
    assert.equal(vacio.attempted, false);
    assert.equal(provider.calls.length, 0);
  });

  it('Prueba 3: proveedor éxito → estado SENT', async () => {
    const { service } = buildService();
    const result = await service.sendInitialAcceptanceEmail(baseInput());
    assert.equal(result.success, true);
    assert.equal(result.status, NotificationDeliveryStatus.SENT);
  });

  it('Prueba 4: providerMessageId del proveedor queda guardado en la entrega', async () => {
    const { service, deliveries } = buildService({ success: true, providerMessageId: 're_msg_abc', timestamp: new Date() });
    await service.sendInitialAcceptanceEmail(baseInput());
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].providerMessageId, 're_msg_abc');
    assert.equal(deliveries[0].status, NotificationDeliveryStatus.SENT);
    assert.ok(deliveries[0].sentAt instanceof Date);
  });

  it('Prueba 5: proveedor falla → estado FAILED con errorCode seguro', async () => {
    const { service, deliveries } = buildService({ success: false, errorCode: 'invalid_api_key', errorMessage: 'API key inválida', timestamp: new Date() });
    const result = await service.sendInitialAcceptanceEmail(baseInput());
    assert.equal(result.success, false);
    assert.equal(result.status, NotificationDeliveryStatus.FAILED);
    assert.equal(result.errorCode, 'invalid_api_key');
    const delivery = deliveries[0];
    assert.equal(delivery.status, NotificationDeliveryStatus.FAILED);
    assert.equal(delivery.errorCode, 'invalid_api_key');
    assert.ok(delivery.failedAt instanceof Date);
  });

  it('Prueba 9: el email contiene el enlace correcto /sign/:token (mismo token)', async () => {
    const { service, provider } = buildService();
    const token = 'f'.repeat(64);
    await service.sendInitialAcceptanceEmail(baseInput({ signToken: token }));
    const sent = provider.calls[0] as { html: string; text: string; to: string };
    assert.match(String(sent.html), new RegExp(`https://app\\.empresa\\.com/sign/${token}`));
    assert.match(String(sent.text), new RegExp(`https://app\\.empresa\\.com/sign/${token}`));
    assert.equal(String(sent.to), 'juan@empresa.com');
  });

  it('Prueba 8/14: el email NO contiene OTP ni secretos', async () => {
    const { service, provider } = buildService();
    await service.sendInitialAcceptanceEmail(baseInput());
    const html = String(provider.calls[0].html);
    const text = String(provider.calls[0].text);
    for (const body of [html, text]) {
      assert.ok(!/otp/i.test(body), 'sin OTP');
      assert.ok(!/re_[A-Za-z0-9_-]{8,}/.test(body), 'sin API key');
      assert.ok(!/password|contrase/i.test(body), 'sin credenciales');
    }
  });

  it('Prueba 10: doble request simultánea del envío inicial → UN solo envío', async () => {
    const { service, provider } = buildService();
    const [first, second] = await Promise.all([
      service.sendInitialAcceptanceEmail(baseInput()),
      service.sendInitialAcceptanceEmail(baseInput()),
    ]);
    const attempted = [first, second].filter((r) => r.attempted);
    assert.equal(attempted.length, 1, 'solo una request materializa el envío');
    assert.equal(provider.calls.length, 1, 'el proveedor recibe un único correo');
  });

  it('Prueba 10b: rate-limit del envío inicial es consultado por worker', async () => {
    const { service, rateLimitCalls } = buildService();
    await service.sendInitialAcceptanceEmail(baseInput());
    assert.equal(rateLimitCalls.length, 1);
    assert.match(String((rateLimitCalls[0] as { args: unknown[] }).args[0]), /acceptance_email:/);
  });

  it('Prueba 7/8/9: reenvío usa MISMO token y NO crea campaña/entregas nuevas del envío inicial', async () => {
    const { service, provider, deliveries } = buildService();
    const token = 'b'.repeat(64);
    await service.sendInitialAcceptanceEmail(baseInput({ signToken: token }));
    const reenvio = await service.resendAcceptanceEmail(baseInput({ signToken: token }));
    assert.equal(reenvio.attempted, true);
    assert.equal(reenvio.success, true);
    // Dos entregas: SEND_INITIAL + RESEND (historial), pero MISMA URL/token.
    assert.equal(deliveries.length, 2);
    const resent = provider.calls[1] as { html: string };
    assert.match(String(resent.html), new RegExp(`/sign/${token}`));
    assert.ok(!String(resent.html).includes('/sign/' + 'c'.repeat(64)));
    // El envío inicial NO se duplica aunque se llame de nuevo.
    const again = await service.sendInitialAcceptanceEmail(baseInput({ signToken: token }));
    assert.equal(again.attempted, false);
    assert.equal(provider.calls.length, 2);
  });

  it('Config ausente del frontend → error controlado (no localhost silencioso)', async () => {
    const { service, provider } = buildService(undefined, '');
    await assert.rejects(
      service.sendInitialAcceptanceEmail(baseInput({}, '')),
      ServiceUnavailableException,
    );
    assert.equal(provider.calls.length, 0);
  });

  it('UnconfiguredEmailAdapter: fallo CONTROLADO sin llamar a la red', async () => {
    const adapter = new UnconfiguredEmailAdapter();
    const result = await adapter.send({ to: 'x@y.z', subject: 's', html: '<p/>', text: 't' });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'EMAIL_NOT_CONFIGURED');
  });

  it('Listado por worker: historial de entregas (más reciente primero)', async () => {
    const { service } = buildService();
    await service.sendInitialAcceptanceEmail(baseInput());
    const rows = await service.listDeliveriesByWorker(COMPANY, WORKER);
    assert.equal(rows.length, 1);
  });

  // ══════════ Fase 3B-1 — Canal WhatsApp ══════════

  it('WA S1: sin teléfono → WHATSAPP_RECIPIENT_MISSING sin intento ni delivery', async () => {
    const waCalls: Array<any> = [];
    const waProvider = { send: async (input: unknown) => { waCalls.push(input); return { success: true, providerMessageId: 'x', timestamp: new Date() }; } };
    const { service, deliveries } = buildService(undefined, 'https://app.empresa.com', waProvider);
    const result = await service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: undefined }));
    assert.equal(result.attempted, false);
    assert.equal(result.errorCode, 'WHATSAPP_RECIPIENT_MISSING');
    assert.equal(waCalls.length, 0, 'nunca intenta enviar sin número');
    assert.equal(deliveries.length, 0, 'no crea registro sin destinatario');
  });

  it('WA S2: éxito → SENT, channel WHATSAPP, provider WHATSAPP_META, teléfono normalizado 57', async () => {
    const waCalls: Array<any> = [];
    const waProvider = { send: async (input: unknown) => { waCalls.push(input); return { success: true, providerMessageId: 'wamid.TEST1', timestamp: new Date() }; } };
    const { service, deliveries } = buildService(undefined, 'https://app.empresa.com', waProvider);
    const result = await service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233', signToken: 'c'.repeat(64) }));

    assert.equal(result.success, true);
    assert.equal(result.status, NotificationDeliveryStatus.SENT);
    assert.equal(deliveries.length, 1);
    const delivery = deliveries[0];
    assert.equal(delivery.channel, 'WHATSAPP');
    assert.equal(delivery.provider, 'WHATSAPP_META');
    assert.equal(delivery.recipient, '573001112233', 'normalizado con código país 57');
    assert.equal(delivery.providerMessageId, 'wamid.TEST1');
    // El enlace enviado es el MISMO /sign/:token del worker.
    assert.equal(String(waCalls[0].acceptanceUrl), `https://app.empresa.com/sign/${'c'.repeat(64)}`);
    // Nunca se envía OTP en el mensaje.
    assert.ok(!JSON.stringify(waCalls[0]).match(/otp/i));
  });

  it('WA S3: proveedor falla (no configurado) → FAILED con WHATSAPP_NOT_CONFIGURED', async () => {
    const waProvider = { send: async () => ({ success: false, errorCode: 'WHATSAPP_NOT_CONFIGURED', errorMessage: 'no configurado', timestamp: new Date() }) };
    const { service, deliveries } = buildService(undefined, 'https://app.empresa.com', waProvider);
    const result = await service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233' }));
    assert.equal(result.success, false);
    assert.equal(result.status, NotificationDeliveryStatus.FAILED);
    assert.equal(result.errorCode, 'WHATSAPP_NOT_CONFIGURED');
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, NotificationDeliveryStatus.FAILED);
  });

  it('WA S4: idempotencia — doble envío inicial → UN solo mensaje WhatsApp', async () => {
    const waCalls: Array<any> = [];
    const waProvider = { send: async (input: unknown) => { waCalls.push(input); return { success: true, providerMessageId: 'wamid.X', timestamp: new Date() }; } };
    const { service } = buildService(undefined, 'https://app.empresa.com', waProvider);
    const [first, second] = await Promise.all([
      service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233' })),
      service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233' })),
    ]);
    const attempted = [first, second].filter((r) => r.attempted);
    assert.equal(attempted.length, 1, 'solo una request materializa el envío');
    assert.equal(waCalls.length, 1);
  });

  it('WA S5: reenvío WhatsApp usa mismo campaign/worker/token/URL', async () => {
    const waCalls: Array<any> = [];
    const waProvider = { send: async (input: unknown) => { waCalls.push(input); return { success: true, providerMessageId: 'wamid.R', timestamp: new Date() }; } };
    const { service } = buildService(undefined, 'https://app.empresa.com', waProvider);
    const token = 'd'.repeat(64);
    await service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233', signToken: token }));
    const reenvio = await service.resendAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233', signToken: token }));
    assert.equal(reenvio.attempted, true);
    assert.equal(reenvio.success, true);
    assert.equal(waCalls.length, 2);
    assert.equal(String(waCalls[1].acceptanceUrl), `https://app.empresa.com/sign/${token}`, 'misma URL/token');
    // El envío inicial no se duplica aunque se llame de nuevo.
    const again = await service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233', signToken: token }));
    assert.equal(again.attempted, false);
    assert.equal(waCalls.length, 2);
  });

  it('WA S6: listado por canal filtra WHATSAPP independiente de EMAIL', async () => {
    const waProvider = { send: async () => ({ success: true, providerMessageId: 'wamid.L', timestamp: new Date() }) };
    const { service } = buildService(undefined, 'https://app.empresa.com', waProvider);
    await service.sendInitialAcceptanceEmail(baseInput());
    await service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '3001112233' }));
    const waRows = await service.listDeliveriesByWorkerAndChannel(COMPANY, WORKER, 'WHATSAPP' as never);
    assert.equal(waRows.length, 1);
    assert.equal((waRows[0] as unknown as { channel: string }).channel, 'WHATSAPP');
  });

  it('WA S7: número ya internacional (+57…) NO se duplica el prefijo', async () => {
    const waCalls: Array<any> = [];
    const waProvider = { send: async (input: unknown) => { waCalls.push(input); return { success: true, providerMessageId: 'wamid.I', timestamp: new Date() }; } };
    const { service, deliveries } = buildService(undefined, 'https://app.empresa.com', waProvider);
    await service.sendInitialAcceptanceWhatsApp(baseInput({ recipientPhone: '+57 300 111 2233' }));
    assert.equal(deliveries[0].recipient, '573001112233');
  });
});
