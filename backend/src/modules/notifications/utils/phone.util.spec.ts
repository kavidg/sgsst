import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizePhoneForWhatsApp, maskPhoneForAudit } from './phone.util';

/**
 * Fase 3B-1 — Utilidad pura de normalización de teléfonos para WhatsApp.
 * Carga histórica heterogénea (regla 13): NO se asume formato internacional.
 */

const CO = { defaultCountryCode: '57' };

describe('normalizePhoneForWhatsApp — Fase 3B-1', () => {
  it('nacional colombiano 10 dígitos → antepone 57', () => {
    assert.equal(normalizePhoneForWhatsApp('3001112233', CO), '573001112233');
    assert.equal(normalizePhoneForWhatsApp('(300) 111-2233', CO), '573001112233');
  });

  it('internacional +57… NO se duplica', () => {
    assert.equal(normalizePhoneForWhatsApp('+573001112233', CO), '573001112233');
    assert.equal(normalizePhoneForWhatsApp('+57 300 111 2233', CO), '573001112233');
  });

  it('internacional sin + (57…) NO se duplica', () => {
    assert.equal(normalizePhoneForWhatsApp('573001112233', CO), '573001112233');
  });

  it('internacional de otro país se conserva (+1…)', () => {
    assert.equal(normalizePhoneForWhatsApp('+14155552671', CO), '14155552671');
  });

  it('nacional fijo colombiano (no empieza con 3) NO recibe 57 automáticamente', () => {
    // Regla conservadora: solo móviles (inician en 3) reciben el prefijo.
    assert.equal(normalizePhoneForWhatsApp('6012345678', CO), '6012345678');
  });

  it('sin código por defecto: nacional queda tal cual si es E.164 válido', () => {
    assert.equal(normalizePhoneForWhatsApp('3001112233'), '3001112233');
  });

  it('vacío/inválido → null', () => {
    assert.equal(normalizePhoneForWhatsApp(undefined, CO), null);
    assert.equal(normalizePhoneForWhatsApp('', CO), null);
    assert.equal(normalizePhoneForWhatsApp('   ', CO), null);
    assert.equal(normalizePhoneForWhatsApp('abc', CO), null);
    assert.equal(normalizePhoneForWhatsApp('+57123', CO), null, 'demasiado corto');
  });

  it('no muta el valor de entrada', () => {
    const raw = '+57 300 111 2233';
    normalizePhoneForWhatsApp(raw, CO);
    assert.equal(raw, '+57 300 111 2233');
  });
});

describe('maskPhoneForAudit — Fase 3B-1', () => {
  it('máscara con últimos 2 dígitos (PII mínima)', () => {
    assert.equal(maskPhoneForAudit('573001112233'), '•••33');
    assert.equal(maskPhoneForAudit(undefined), 'n/d');
    assert.equal(maskPhoneForAudit(null), 'n/d');
  });
});
