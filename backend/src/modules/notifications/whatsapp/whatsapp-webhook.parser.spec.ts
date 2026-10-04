import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WhatsAppWebhookParser } from './whatsapp-webhook.parser';

/**
 * Fase 3B-2A — Pruebas del parser del webhook de Meta (PURO, sin Mongo).
 * Payloads con la forma documentada por Meta Cloud API (statuses).
 */

/** Construye un payload de estados con la envolvente real de Meta. */
function buildStatusesPayload(statuses: unknown[]): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'ENTRY_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '573001112233', phone_number_id: 'PNID' },
              statuses,
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsAppWebhookParser (Fase 3B-2A)', () => {
  const parser = new WhatsAppWebhookParser();

  it('9. mapea sent → SENT', () => {
    const r = parser.parse(buildStatusesPayload([{ id: 'wamid.1', status: 'sent', timestamp: '1727700000' }]));
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].status, 'SENT');
    assert.equal(r.events[0].providerMessageId, 'wamid.1');
    assert.ok(r.events[0].timestamp instanceof Date);
  });

  it('10. mapea delivered → DELIVERED', () => {
    const r = parser.parse(buildStatusesPayload([{ id: 'wamid.2', status: 'delivered' }]));
    assert.equal(r.events[0].status, 'DELIVERED');
  });

  it('11. mapea read → READ', () => {
    const r = parser.parse(buildStatusesPayload([{ id: 'wamid.3', status: 'read' }]));
    assert.equal(r.events[0].status, 'READ');
  });

  it('12. mapea failed → FAILED con código y mensaje saneado', () => {
    const r = parser.parse(
      buildStatusesPayload([
        {
          id: 'wamid.4',
          status: 'failed',
          errors: [{ code: 131047, title: 'Re-engagement message', message: 'daily limit', error_data: { details: 'El número no ha iniciado conversación' } }],
        },
      ]),
    );
    assert.equal(r.events[0].status, 'FAILED');
    assert.equal(r.events[0].errorCode, '131047');
    assert.equal(r.events[0].errorMessage, 'El número no ha iniciado conversación');
    // Sin payload crudo en el mensaje saneado:
    assert.ok(!JSON.stringify(r.events[0]).includes('error_data'));
  });

  it('13. evento sin campos opcionales (sin timestamp/recipient_id)', () => {
    const r = parser.parse(buildStatusesPayload([{ id: 'wamid.5', status: 'delivered' }]));
    assert.equal(r.events[0].timestamp, undefined);
    assert.equal(r.events[0].recipientPhone, undefined);
  });

  it('14. status desconocido → ignorado sin romper', () => {
    const r = parser.parse(buildStatusesPayload([{ id: 'wamid.6', status: 'future_status' }]));
    assert.equal(r.events.length, 0);
    assert.deepEqual(r.ignoredRawStatuses, ['future_status']);
  });

  it('recipient_id se captura cuando viene (no se usa para buscar)', () => {
    const r = parser.parse(buildStatusesPayload([{ id: 'wamid.7', status: 'read', recipient_id: '573007777777' }]));
    assert.equal(r.events[0].recipientPhone, '573007777777');
  });

  it('statuses sin id o sin status → bloque ignorado', () => {
    const r = parser.parse(buildStatusesPayload([{ status: 'delivered' }, { id: 'wamid.8' }]));
    assert.equal(r.events.length, 0);
    assert.equal(r.ignoredBlocks, 2);
  });

  it('value sin statuses (mensaje entrante/otro field) → ignorado de forma segura', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'E', changes: [{ field: 'messages', value: { contacts: [] } }] }],
    };
    const r = parser.parse(payload);
    assert.equal(r.events.length, 0);
    assert.equal(r.ignoredBlocks, 1);
  });

  it('body inválido (null, no-objeto, entry no array) → resultado vacío sin lanzar', () => {
    assert.equal(parser.parse(null).events.length, 0);
    assert.equal(parser.parse('texto').events.length, 0);
    assert.equal(parser.parse({ entry: 'no' }).events.length, 0);
    assert.equal(parser.parse({}).events.length, 0);
  });

  it('múltiples eventos en un solo POST se normalizan todos', () => {
    const r = parser.parse(
      buildStatusesPayload([
        { id: 'wamid.a', status: 'sent' },
        { id: 'wamid.b', status: 'delivered' },
        { id: 'wamid.c', status: 'read' },
        { id: 'wamid.d', status: 'failed', errors: [{ code: 1, message: 'x' }] },
      ]),
    );
    assert.deepEqual(
      r.events.map((e) => e.status),
      ['SENT', 'DELIVERED', 'READ', 'FAILED'],
    );
  });
});
