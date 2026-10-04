import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';

import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';
import { NotificationDeliveryStatus, DeliveryChannel, DeliveryProvider } from '../schemas/notification-delivery.schema';

/**
 * Fase 3B-2A — Pruebas del service del webhook:
 * máquina de estados sin regresión, idempotencia, lookup SOLO por
 * providerMessageId y auditoría sin secretos. Sin internet ni Meta real.
 */

const APP_SECRET = 'test_app_secret_ficticio';

/** Modelo stub en memoria con findOne/findOneAndUpdate condicionales (guard). */
function buildDeliveryModel() {
  const docs: Array<Record<string, unknown> & { _id: Types.ObjectId; save?: () => Promise<unknown> }> = [];
  const calls = { guardMisses: 0 };
  /** Simula un webhook concurrente que muta el estado justo antes del update. */
  const hooks = { beforeUpdate: null as null | (() => void) };
  const model: any = {
    docs,
    calls,
    findOne: (filter: Record<string, unknown>) => ({
      exec: async () => {
        const found = docs.find(
          (d) =>
            d.providerMessageId === filter.providerMessageId &&
            (filter.channel === undefined || d.channel === filter.channel) &&
            (filter.provider === undefined || d.provider === filter.provider),
        );
        return found ?? null;
      },
    }),
    findOneAndUpdate: (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => ({
      exec: async () => {
        hooks.beforeUpdate?.();
        const found = docs.find(
          (d) =>
            String(d._id) === String(filter._id) &&
            d.status === filter.status, // guard: estado debe seguir siendo el observado
        );
        if (!found) {
          calls.guardMisses += 1;
          return null;
        }
        Object.assign(found, update.$set);
        return found;
      },
    }),
  };
  return { model, docs, calls, hooks };
}

function buildCampaignStub() {
  const audits: Array<{ companyId: Types.ObjectId; workerId: string; action: string; details: Record<string, unknown> }> = [];
  return {
    audits,
    service: {
      addWhatsAppDeliveryAudit: async (
        companyId: Types.ObjectId,
        workerId: string,
        action: string,
        details: Record<string, unknown>,
      ) => {
        audits.push({ companyId, workerId, action, details });
      },
    } as never,
  };
}

function buildService() {
  const { model, docs, calls, hooks } = buildDeliveryModel();
  const { audits, service: campaignStub } = buildCampaignStub();
  const configValues: Record<string, string> = {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify_token_test',
    WHATSAPP_WEBHOOK_APP_SECRET: APP_SECRET,
  };
  const configStub = { get: (key: string) => configValues[key] } as never;
  const svc = new WhatsAppWebhookService(model, configStub, new WhatsAppWebhookParser(), campaignStub);
  return { svc, docs, audits, configValues, calls, hooks };
}

function seedDelivery(
  docs: ReturnType<typeof buildDeliveryModel>['docs'],
  overrides: Partial<Record<string, unknown>> = {},
) {
  const doc = {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(),
    campaignId: new Types.ObjectId(),
    campaignWorkerId: new Types.ObjectId(),
    channel: DeliveryChannel.WHATSAPP,
    provider: DeliveryProvider.WHATSAPP_META,
    recipient: '573001112233',
    providerMessageId: 'wamid.test1',
    status: NotificationDeliveryStatus.SENT,
    attempts: 1,
    deliveryKey: 'SEND_INITIAL:x:WHATSAPP',
    ...overrides,
  };
  docs.push(doc);
  return doc;
}

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(Buffer.from(body, 'utf8')).digest('hex')}`;
}

function statusBody(id: string, status: string, extra: Record<string, unknown> = {}): { raw: Buffer; payload: unknown } {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{ id: 'E', changes: [{ field: 'messages', value: { statuses: [{ id, status, ...extra }] } }] }],
  };
  return { raw: Buffer.from(JSON.stringify(payload), 'utf8'), payload };
}

describe('WhatsAppWebhookService — GET verify (Fase 3B-2A)', () => {
  it('1. token correcto → devuelve challenge', () => {
    const { svc } = buildService();
    assert.equal(svc.verifySubscribe('subscribe', 'verify_token_test', 'CHALL'), 'CHALL');
  });

  it('2. token incorrecto → null', () => {
    const { svc } = buildService();
    assert.equal(svc.verifySubscribe('subscribe', 'otro_token', 'CHALL'), null);
  });

  it('3. parámetros incompletos / sin config → null', () => {
    const { svc, configValues } = buildService();
    assert.equal(svc.verifySubscribe('subscribe', 'verify_token_test', undefined), null);
    assert.equal(svc.verifySubscribe(undefined, 'verify_token_test', 'CHALL'), null);
    configValues.WHATSAPP_WEBHOOK_VERIFY_TOKEN = '';
    assert.equal(svc.verifySubscribe('subscribe', 'verify_token_test', 'CHALL'), null);
  });
});

describe('WhatsAppWebhookService — POST seguridad (Fase 3B-2A)', () => {
  it('4. firma válida → procesa (processed o notFound, nunca 401)', async () => {
    const { svc, docs } = buildService();
    seedDelivery(docs);
    const { raw, payload } = statusBody('wamid.test1', 'delivered');
    const r = await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    assert.equal(r.processed, 1);
  });

  it('5. firma inválida → rechaza', async () => {
    const { svc } = buildService();
    const { raw, payload } = statusBody('wamid.x', 'delivered');
    await assert.rejects(
      () => svc.processStatusUpdate(payload, raw, 'sha256=deadbeef'),
      (e: unknown) => (e as { status?: number }).status === 401,
    );
  });

  it('6. body alterado en tránsito (firma del body ORIGINAL) → rechaza', async () => {
    const { svc } = buildService();
    const { raw: originalRaw, payload } = statusBody('wamid.x', 'delivered');
    // Atacante reemplaza el body pero reutiliza la firma del body original.
    const tamperedRaw = Buffer.from(JSON.stringify({ tampered: true }), 'utf8');
    await assert.rejects(
      () => svc.processStatusUpdate(payload, tamperedRaw, sign(originalRaw.toString('utf8'))),
      (e: unknown) => (e as { status?: number }).status === 401,
    );
  });

  it('sin secreto configurado → error controlado (nunca acepta writes)', async () => {
    const { svc, configValues } = buildService();
    configValues.WHATSAPP_WEBHOOK_APP_SECRET = '';
    const { raw, payload } = statusBody('wamid.x', 'delivered');
    await assert.rejects(
      () => svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8'))),
      (e: unknown) => (e as { message?: string }).message?.includes('NOT_CONFIGURED'),
    );
  });

  it('8. payload con forma desconocida y firma válida → 200 sin procesar', async () => {
    const { svc } = buildService();
    const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), 'utf8');
    const r = await svc.processStatusUpdate({ object: 'whatsapp_business_account', entry: [] }, raw, sign(raw.toString('utf8')));
    assert.equal(r.processed, 0);
    assert.equal(r.ignored, 0);
  });

  it('seguridad: ni errores ni resultados contienen secretos', async () => {
    const { svc, docs } = buildService();
    seedDelivery(docs);
    const { raw, payload } = statusBody('wamid.test1', 'delivered');
    const r = await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    assert.ok(!JSON.stringify(r).includes(APP_SECRET));
    assert.ok(!JSON.stringify(r).includes('verify_token_test'));
  });
});

describe('WhatsAppWebhookService — transiciones (Fase 3B-2A)', () => {
  let ctx: ReturnType<typeof buildService>;
  beforeEach(() => {
    ctx = buildService();
  });

  const run = (id: string, status: string, extra: Record<string, unknown> = {}) => {
    const { raw, payload } = statusBody(id, status, extra);
    return ctx.svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
  };

  it('15. PENDING → SENT', async () => {
    seedDelivery(ctx.docs, { status: 'PENDING', sentAt: undefined });
    const r = await run('wamid.test1', 'sent');
    assert.equal(r.processed, 1);
    const doc = ctx.docs[0];
    assert.equal(doc.status, 'SENT');
    assert.ok(doc.sentAt instanceof Date);
  });

  it('16. SENT → DELIVERED (deliveredAt)', async () => {
    seedDelivery(ctx.docs);
    await run('wamid.test1', 'delivered');
    assert.equal(ctx.docs[0].status, 'DELIVERED');
    assert.ok(ctx.docs[0].deliveredAt instanceof Date);
  });

  it('17. DELIVERED → READ (readAt)', async () => {
    seedDelivery(ctx.docs, { status: 'DELIVERED', deliveredAt: new Date() });
    await run('wamid.test1', 'read');
    assert.equal(ctx.docs[0].status, 'READ');
    assert.ok(ctx.docs[0].readAt instanceof Date);
  });

  it('18. PENDING → DELIVERED (salto permitido)', async () => {
    seedDelivery(ctx.docs, { status: 'PENDING', sentAt: undefined });
    await run('wamid.test1', 'delivered');
    assert.equal(ctx.docs[0].status, 'DELIVERED');
    assert.ok(ctx.docs[0].sentAt instanceof Date);
  });

  it('19. PENDING → READ (salto permitido)', async () => {
    seedDelivery(ctx.docs, { status: 'PENDING' });
    await run('wamid.test1', 'read');
    assert.equal(ctx.docs[0].status, 'READ');
  });

  it('20. PENDING → FAILED (errorCode/errorMessage saneados, failedAt)', async () => {
    seedDelivery(ctx.docs, { status: 'PENDING' });
    const r = await run('wamid.test1', 'failed', { errors: [{ code: 131047, message: 'sin conversación' }] });
    assert.equal(r.processed, 1);
    const doc = ctx.docs[0];
    assert.equal(doc.status, 'FAILED');
    assert.ok(doc.failedAt instanceof Date);
    assert.equal(doc.errorCode, '131047');
  });

  it('21. SENT → FAILED', async () => {
    seedDelivery(ctx.docs);
    await run('wamid.test1', 'failed', { errors: [{ code: 500, message: 'x' }] });
    assert.equal(ctx.docs[0].status, 'FAILED');
  });

  it('22. evento duplicado → ignorado (sin segunda auditoría)', async () => {
    seedDelivery(ctx.docs, { status: 'DELIVERED', deliveredAt: new Date() });
    const r1 = await run('wamid.test1', 'delivered');
    assert.equal(r1.processed, 0);
    assert.equal(r1.ignored, 1);
  });

  it('23. estado nunca retrocede (READ→DELIVERED, DELIVERED→SENT)', async () => {
    seedDelivery(ctx.docs, { status: 'READ', deliveredAt: new Date(), readAt: new Date() });
    const r = await run('wamid.test1', 'delivered');
    assert.equal(r.ignored, 1);
    assert.equal(ctx.docs[0].status, 'READ');
    await run('wamid.test1', 'sent');
    assert.equal(ctx.docs[0].status, 'READ');
  });

  it('FAILED es terminal: DELIVERED posterior no lo revierte', async () => {
    seedDelivery(ctx.docs, { status: 'FAILED', failedAt: new Date() });
    const r = await run('wamid.test1', 'delivered');
    assert.equal(r.ignored, 1);
    assert.equal(ctx.docs[0].status, 'FAILED');
  });

  it('24. providerMessageId inexistente → notFound (sin error)', async () => {
    const r = await run('wamid.desconocido', 'delivered');
    assert.equal(r.notFound, 1);
  });

  it('25. delivery de OTRO canal con mismo id no se actualiza', async () => {
    seedDelivery(ctx.docs, { channel: DeliveryChannel.EMAIL, provider: DeliveryProvider.RESEND });
    const r = await run('wamid.test1', 'delivered');
    assert.equal(r.notFound, 1);
    assert.equal(ctx.docs[0].status, 'SENT');
  });

  it('guard de estado: escritura concurrente → evento descartado sin romper', async () => {
    seedDelivery(ctx.docs, { status: 'SENT' });
    // Otro webhook avanza el estado DESPUÉS del findOne y ANTES del update.
    ctx.hooks.beforeUpdate = () => {
      ctx.docs[0].status = 'READ';
    };
    const r = await run('wamid.test1', 'delivered');
    ctx.hooks.beforeUpdate = null;
    assert.equal(r.ignored, 1);
    assert.ok(ctx.calls.guardMisses >= 1);
    assert.equal(ctx.docs[0].status, 'READ');
  });
});

describe('WhatsAppWebhookService — auditoría (Fase 3B-2A)', () => {
  it('26. DELIVERED genera evento UNA sola vez', async () => {
    const { svc, docs, audits } = buildService();
    seedDelivery(docs);
    const { raw, payload } = statusBody('wamid.test1', 'delivered');
    await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8'))); // duplicado
    assert.equal(audits.filter((a) => a.action === 'WHATSAPP_DELIVERED').length, 1);
  });

  it('27. READ genera evento UNA sola vez', async () => {
    const { svc, docs, audits } = buildService();
    seedDelivery(docs, { status: 'DELIVERED', deliveredAt: new Date() });
    const { raw, payload } = statusBody('wamid.test1', 'read');
    await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    assert.equal(audits.filter((a) => a.action === 'WHATSAPP_READ').length, 1);
  });

  it('28. FAILED genera evento UNA sola vez, sin secretos ni token completo', async () => {
    const { svc, docs, audits } = buildService();
    seedDelivery(docs, { status: 'PENDING' });
    const { raw, payload } = statusBody('wamid.test1', 'failed', { errors: [{ code: 1, message: 'boom' }] });
    await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    const failed = audits.filter((a) => a.action === 'WHATSAPP_FAILED');
    assert.equal(failed.length, 1);
    assert.ok(!JSON.stringify(audits).includes(APP_SECRET));
    assert.ok(!JSON.stringify(audits).includes('wamid.test1')); // id completo nunca en auditoría
  });

  it('auditoría rota NO rompe el procesamiento del webhook', async () => {
    const { model, docs } = buildDeliveryModel();
    const { service: failingCampaign } = {
      service: {
        addWhatsAppDeliveryAudit: async () => {
          throw new Error('audit down');
        },
      } as never,
    };
    const configStub = { get: (key: string) => (key === 'WHATSAPP_WEBHOOK_APP_SECRET' ? APP_SECRET : undefined) } as never;
    const svc = new WhatsAppWebhookService(model, configStub, new WhatsAppWebhookParser(), failingCampaign);
    seedDelivery(docs);
    const { raw, payload } = statusBody('wamid.test1', 'delivered');
    const r = await svc.processStatusUpdate(payload, raw, sign(raw.toString('utf8')));
    assert.equal(r.processed, 1);
    assert.equal(docs[0].status, 'DELIVERED');
  });
});
