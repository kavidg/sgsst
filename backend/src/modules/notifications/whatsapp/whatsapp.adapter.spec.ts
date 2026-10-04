import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  MetaWhatsAppAdapter,
  MockWhatsAppProvider,
  UnconfiguredWhatsAppAdapter,
  WHATSAPP_ERROR_CODES,
} from './whatsapp.adapter';

/**
 * Fase 3B-1 — Pruebas del provider WhatsApp (Meta Cloud API).
 * SIN internet y SIN Meta real: se stubbea `fetch` global. Credenciales de
 * prueba claramente ficticias (nunca reales, regla 20/24).
 */

const CONFIG = {
  phoneNumberId: 'TEST_PHONE_NUMBER_ID',
  accessToken: 'TEST_ACCESS_TOKEN_NOT_REAL',
  templateName: 'test_template_name',
  templateLanguage: 'es',
  graphBaseUrl: 'https://graph.example.invalid',
  graphApiVersion: 'v21.0',
};

function buildAdapter(overrides: Partial<typeof CONFIG> = {}) {
  return new MetaWhatsAppAdapter({ ...CONFIG, ...overrides });
}

function baseMessage() {
  return {
    recipientPhone: '573001112233',
    employeeDisplayName: 'Juan Pérez',
    acceptanceUrl: 'https://app.empresa.com/sign/abcd1234',
  };
}

// Stub del fetch global con captura de llamadas.
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];
let fetchResponse: () => { ok: boolean; status: number; text: () => Promise<string> } = () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.TEST' }] }),
});
// Restore del fetch original (por suite).
let restore: (() => void) | undefined;

async function installFetchStub() {
  const original = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = async (url: string | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init: init ?? {} });
    const res = fetchResponse();
    return { ok: res.ok, status: res.status, text: res.text } as unknown as Response;
  };
  return () => {
    globalThis.fetch = original;
    fetchCalls = [];
  };
}

describe('MetaWhatsAppAdapter — Fase 3B-1 (provider)', () => {
  afterEach(() => { restore?.(); });

  it('P1: configuración válida → construye adapter', () => {
    const adapter = buildAdapter();
    assert.ok(adapter instanceof MetaWhatsAppAdapter);
  });

  it('P3/P4/P5/P6: payload correcto → endpoint, recipient, template y parámetros de Meta', async () => {
    restore = await installFetchStub();
    const adapter = buildAdapter();
    const result = await adapter.send(baseMessage());

    assert.equal(result.success, true);
    assert.equal(result.providerMessageId, 'wamid.TEST');
    assert.equal(fetchCalls.length, 1);
    const { url, init } = fetchCalls[0];
    // Endpoint y método específicos de Meta, SOLO conocidos por el adapter.
    assert.equal(url, 'https://graph.example.invalid/v21.0/TEST_PHONE_NUMBER_ID/messages');
    assert.equal(init.method, 'POST');
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
    assert.match(headers.Authorization, /^Bearer TEST_ACCESS_TOKEN_NOT_REAL$/);

    const payload = JSON.parse(String(init.body));
    assert.equal(payload.messaging_product, 'whatsapp');
    assert.equal(payload.to, '573001112233');
    assert.equal(payload.type, 'template');
    assert.equal(payload.template.name, 'test_template_name');
    assert.equal(payload.template.language.code, 'es');
    // Parámetros mínimos: {{1}} nombre, {{2}} enlace (mismo /sign/:token).
    assert.deepEqual(
      payload.template.components[0].parameters.map((p: { text: string }) => p.text),
      ['Juan Pérez', 'https://app.empresa.com/sign/abcd1234'],
    );
  });

  it('P7: respuesta exitosa de Meta → success con providerMessageId', async () => {
    restore = await installFetchStub();
    const result = await buildAdapter().send(baseMessage());
    assert.equal(result.success, true);
    assert.ok(result.providerMessageId);
  });

  it('P8: error externo genérico (HTTP 500) → WHATSAPP_PROVIDER_ERROR controlado', async () => {
    restore = await installFetchStub();
    fetchResponse = () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: { code: 1, message: 'boom' } }) });
    const result = await buildAdapter().send(baseMessage());
    assert.equal(result.success, false);
    assert.equal(result.errorCode, WHATSAPP_ERROR_CODES.PROVIDER_ERROR);
  });

  it('P9: error de autenticación (401 / code 190) → WHATSAPP_AUTH_ERROR, sin exponer token', async () => {
    restore = await installFetchStub();
    fetchResponse = () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { code: 190, message: 'access token invalid TEST_ACCESS_TOKEN_NOT_REAL' } }) });
    const result = await buildAdapter().send(baseMessage());
    assert.equal(result.success, false);
    assert.equal(result.errorCode, WHATSAPP_ERROR_CODES.AUTH_ERROR);
    // El mensaje interno es SANEADO: nunca arrastra el token de prueba.
    assert.ok(!String(result.errorMessage).includes('TEST_ACCESS_TOKEN_NOT_REAL'));
  });

  it('P10: template rechazado (code 132001) → WHATSAPP_TEMPLATE_ERROR', async () => {
    restore = await installFetchStub();
    fetchResponse = () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 132001, message: 'template does not exist' } }) });
    const result = await buildAdapter().send(baseMessage());
    assert.equal(result.errorCode, WHATSAPP_ERROR_CODES.TEMPLATE_ERROR);
  });

  it('P2: recipient inválido → WHATSAPP_RECIPIENT_INVALID sin llamar a Meta', async () => {
    restore = await installFetchStub();
    const result = await buildAdapter().send(baseMessage().valueOf() && { ...baseMessage(), recipientPhone: 'abc' });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, WHATSAPP_ERROR_CODES.RECIPIENT_INVALID);
    assert.equal(fetchCalls.length, 0);
  });

  it('P11: el adapter NUNCA registra secretos en logs (token ficticio ausente en stderr)', async () => {
    restore = await installFetchStub();
    fetchResponse = () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { code: 190, message: 'x' } }) });
    const logs: string[] = [];
    const originalWarn = console.error;
    console.error = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await buildAdapter().send(baseMessage());
    } finally {
      console.error = originalWarn;
    }
    assert.ok(!logs.some((line) => line.includes('TEST_ACCESS_TOKEN_NOT_REAL')));
  });

  it('network error → WHATSAPP_PROVIDER_ERROR sin lanzar', async () => {
    restore = await installFetchStub();
    (globalThis as { fetch: unknown }).fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const result = await buildAdapter().send(baseMessage());
    assert.equal(result.success, false);
    assert.equal(result.errorCode, WHATSAPP_ERROR_CODES.PROVIDER_ERROR);
  });
});

describe('UnconfiguredWhatsAppAdapter — Fase 3B-1', () => {
  it('sin configuración → fallo CONTROLADO WHATSAPP_NOT_CONFIGURED sin red', async () => {
    restore = await installFetchStub();
    const adapter = new UnconfiguredWhatsAppAdapter();
    const result = await adapter.send(baseMessage());
    assert.equal(result.success, false);
    assert.equal(result.errorCode, WHATSAPP_ERROR_CODES.NOT_CONFIGURED);
    assert.equal(fetchCalls.length, 0, 'nunca contacta a Meta');
  });
});

describe('MockWhatsAppProvider — Fase 3B-1', () => {
  it('mock → éxito simulado con ID claramente ficticio, sin red', async () => {
    restore = await installFetchStub();
    const provider = new MockWhatsAppProvider();
    const result = await provider.send(baseMessage());
    assert.equal(result.success, true);
    assert.match(result.providerMessageId ?? '', /^mock_wamid\./);
    assert.equal(fetchCalls.length, 0, 'nunca contacta servicios externos');
  });
});
