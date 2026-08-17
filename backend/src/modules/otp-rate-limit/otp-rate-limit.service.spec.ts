import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { OtpRateLimitCounterSchema } from './otp-rate-limit.schema';
import {
  OTP_RATE_LIMIT_MAX,
  OTP_RATE_LIMIT_WINDOW_MS,
  OtpRateLimitService,
} from './otp-rate-limit.service';

const KEY_A = 'electionA:doc1:phone1';
const KEY_B = 'electionB:doc1:phone1';
const KEY_C = 'electionA:doc2:phone2';

const RATE_LIMIT_MESSAGE = 'Demasiadas solicitudes de OTP. Intente nuevamente más tarde.';

/**
 * Modelo Mongoose en memoria que emula fielmente findOneAndUpdate con
 * filtros ($lt/$gt/$lte), $inc, $setOnInsert, $set, upsert y el error E11000
 * del índice único sobre key. NO requiere MongoDB real.
 *
 * - filter.key: igualdad.
 * - filter.count.$lt / filter.expiresAt.$gt / $lte: operadores soportados.
 * - upsert:true: si no hay documento, inserta aplicando $inc y $setOnInsert;
 *   si hay documento pero el filtro no matchea, lanza E11000 (duplicado).
 */
class FakeCounterModel {
  store = new Map<string, { key: string; count: number; expiresAt: Date }>();
  calls: Array<{ filter: unknown; update: unknown; options: unknown }> = [];
  /** Falla la PRÓXIMA operación con E11000 (simula carrera del primer upsert). */
  failNextWithDuplicate = false;
  /** Falla la PRÓXIMA operación con un error genérico de MongoDB. */
  failNextWithError: Error | null = null;

  private dupError(): Error {
    const error = new Error('E11000 duplicate key error');
    (error as { code?: number }).code = 11000;
    return error;
  }

  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, options: Record<string, unknown>) {
    this.calls.push({ filter, update, options });
    return {
      exec: async () => {
        if (this.failNextWithError) {
          const error = this.failNextWithError;
          this.failNextWithError = null;
          throw error;
        }
        const key = filter.key as string;
        const existing = this.store.get(key);
        const countLt = (filter.count as { $lt?: number } | undefined)?.$lt;
        const expiresGt = (filter.expiresAt as { $gt?: Date } | undefined)?.$gt;
        const expiresLte = (filter.expiresAt as { $lte?: Date } | undefined)?.$lte;
        const upsert = Boolean(options?.upsert);

        if (!existing) {
          if (!upsert) return null;
          if (this.failNextWithDuplicate) {
            this.failNextWithDuplicate = false;
            throw this.dupError();
          }
          const created = {
            key,
            count: 0,
            expiresAt: new Date(),
          };
          if (update.$setOnInsert) {
            const setOnInsert = update.$setOnInsert as Record<string, unknown>;
            if (setOnInsert.expiresAt) created.expiresAt = setOnInsert.expiresAt as Date;
          }
          if (update.$inc) {
            const inc = update.$inc as Record<string, number>;
            created.count += inc.count ?? 0;
          }
          if (update.$set) {
            const set = update.$set as Record<string, unknown>;
            if (typeof set.count === 'number') created.count = set.count;
            if (set.expiresAt) created.expiresAt = set.expiresAt as Date;
          }
          this.store.set(key, created);
          return created;
        }

        const matches =
          (countLt === undefined || existing.count < countLt) &&
          (expiresGt === undefined || existing.expiresAt > expiresGt) &&
          (expiresLte === undefined || existing.expiresAt <= expiresLte);

        if (matches) {
          if (update.$inc) {
            const inc = update.$inc as Record<string, number>;
            existing.count += inc.count ?? 0;
          }
          if (update.$set) {
            const set = update.$set as Record<string, unknown>;
            if (typeof set.count === 'number') existing.count = set.count;
            if (set.expiresAt) existing.expiresAt = set.expiresAt as Date;
          }
          this.store.set(key, existing);
          return existing;
        }

        // Existe documento pero el filtro no matchea: con upsert Mongo intenta
        // insertar la clave duplicada → E11000.
        if (upsert) throw this.dupError();
        return null;
      },
    };
  }
}

function buildService() {
  const model = new FakeCounterModel();
  const service = new OtpRateLimitService(model as never);
  return { service, model };
}

describe('F7B-10.5-B (OtpRateLimitService) — rate-limit OTP distribuido en MongoDB', () => {
  it('RL-MONGO-01: la primera solicitud crea el contador con count=1 y expiresAt presente', async () => {
    const { service, model } = buildService();
    await service.assertOtpRateLimit(KEY_A);
    const doc = model.store.get(KEY_A);
    assert.ok(doc, 'el contador debe existir');
    assert.equal(doc.count, 1);
    assert.ok(doc.expiresAt instanceof Date, 'expiresAt debe ser Date');
    assert.ok(doc.expiresAt.getTime() > Date.now(), 'expiresAt debe estar en el futuro');
  });

  it('RL-MONGO-02: la segunda solicitud incrementa a count=2', async () => {
    const { service, model } = buildService();
    await service.assertOtpRateLimit(KEY_A);
    await service.assertOtpRateLimit(KEY_A);
    assert.equal(model.store.get(KEY_A)?.count, 2);
  });

  it('RL-MONGO-03: la tercera solicitud incrementa a count=3', async () => {
    const { service, model } = buildService();
    for (let i = 0; i < 3; i++) await service.assertOtpRateLimit(KEY_A);
    assert.equal(model.store.get(KEY_A)?.count, 3);
  });

  it('RL-MONGO-03b: la ventana NO se extiende con cada solicitud (expiresAt inmutable)', async () => {
    const { service, model } = buildService();
    await service.assertOtpRateLimit(KEY_A);
    const first = model.store.get(KEY_A);
    assert.ok(first);
    const expiresAtInicial = first.expiresAt.getTime();
    // Dos solicitudes más dentro de la ventana: $setOnInsert NO debe refrescar
    // expiresAt en updates posteriores (solo se fija al insertar).
    await service.assertOtpRateLimit(KEY_A);
    await service.assertOtpRateLimit(KEY_A);
    assert.equal(model.store.get(KEY_A)?.expiresAt.getTime(), expiresAtInicial, 'expiresAt no debe cambiar');
  });

  it('RL-MONGO-04: la cuarta solicitud se rechaza y count permanece en 3', async () => {
    const { service, model } = buildService();
    for (let i = 0; i < 3; i++) await service.assertOtpRateLimit(KEY_A);
    await assert.rejects(
      () => service.assertOtpRateLimit(KEY_A),
      (error: Error) =>
        error instanceof BadRequestException && error.message === RATE_LIMIT_MESSAGE,
    );
    assert.equal(model.store.get(KEY_A)?.count, 3, 'count no debe cambiar al rechazar');
  });

  it('RL-MONGO-05: claves independientes no comparten contador', async () => {
    const { service, model } = buildService();
    for (let i = 0; i < 3; i++) await service.assertOtpRateLimit(KEY_A);
    // Otra combinación documento+teléfono (misma elección): sin límite.
    await service.assertOtpRateLimit(KEY_C);
    assert.equal(model.store.get(KEY_C)?.count, 1);
    // La clave A sigue en 3 (no fue afectada).
    assert.equal(model.store.get(KEY_A)?.count, 3);
  });

  it('RL-MONGO-06: elecciones diferentes no comparten contador', async () => {
    const { service, model } = buildService();
    for (let i = 0; i < 3; i++) await service.assertOtpRateLimit(KEY_A);
    // Otra elección, mismo votante: sin límite.
    await service.assertOtpRateLimit(KEY_B);
    assert.equal(model.store.get(KEY_B)?.count, 1);
  });

  it('RL-MONGO-07: ventana expirada → una nueva solicitud inicia una nueva ventana', async () => {
    const { service, model } = buildService();
    for (let i = 0; i < 3; i++) await service.assertOtpRateLimit(KEY_A);
    // Forzar expiración lógica: expiresAt en el pasado (sin esperar 10 min).
    const doc = model.store.get(KEY_A);
    assert.ok(doc);
    doc.expiresAt = new Date(Date.now() - 1000);
    // La siguiente solicitud debe poder abrir una nueva ventana.
    await service.assertOtpRateLimit(KEY_A);
    assert.equal(model.store.get(KEY_A)?.count, 1, 'nueva ventana inicia en count=1');
    assert.ok(
      (model.store.get(KEY_A)?.expiresAt.getTime() ?? 0) > Date.now(),
      'la nueva ventana debe tener expiresAt futuro',
    );
  });

  it('RL-MONGO-08: el documento del contador NO contiene OTP ni otpHash', async () => {
    const { service, model } = buildService();
    await service.assertOtpRateLimit(KEY_A);
    const doc = model.store.get(KEY_A);
    assert.ok(doc);
    const keys = Object.keys(doc).sort();
    assert.deepEqual(keys, ['count', 'expiresAt', 'key'], 'solo key/count/expiresAt');
    assert.ok(!('otp' in doc), 'no debe existir otp');
    assert.ok(!('otpHash' in doc), 'no debe existir otpHash');
    assert.ok(!('email' in doc), 'no debe existir email');
  });

  it('RL-MONGO-09: la implementación usa una única operación atómica (findOneAndUpdate), no find+update separados', async () => {
    const { service, model } = buildService();
    await service.assertOtpRateLimit(KEY_A);
    assert.ok(model.calls.length >= 1, 'debe invocar findOneAndUpdate');
    for (const call of model.calls) {
      assert.ok(call.filter, 'debe haber filtro');
      assert.ok(call.update, 'debe haber update');
      // La operación atómica combina el filtro del límite con el $inc.
      assert.ok(
        (call.update as Record<string, unknown>).$inc,
        'el update debe contener $inc (incremento y chequeo en una sola op)',
      );
      assert.ok(
        (call.update as Record<string, unknown>).$setOnInsert,
        'el update debe contener $setOnInsert (expiresAt solo al insertar)',
      );
    }
  });

  it('RL-MONGO-10: E11000 en el primer upsert → exactamente un retry', async () => {
    const { service, model } = buildService();
    // Simula carrera: el primer upsert de la clave nueva recibe E11000
    // (el "ganador" insertó el contador); el reintento debe triunfar.
    model.failNextWithDuplicate = true;
    await service.assertOtpRateLimit(KEY_A); // no debe lanzar (retry éxito)
    assert.equal(model.calls.length, 2, 'debe haber exactamente 2 llamadas (intento + 1 retry)');
    assert.equal(model.store.get(KEY_A)?.count, 1);
  });

  it('RL-MONGO-11: fallo de MongoDB → fail-closed (error genérico, sin fallback en memoria)', async () => {
    const { service, model } = buildService();
    model.failNextWithError = new Error('MongoDB connection refused');
    await assert.rejects(
      () => service.assertOtpRateLimit(KEY_A),
      (error: Error) =>
        error instanceof BadRequestException && error.message === RATE_LIMIT_MESSAGE,
    );
    assert.equal(model.store.get(KEY_A), undefined, 'no debe crear contador');
    assert.equal(model.calls.length, 1, 'no debe reintentar un error que no es E11000');
    // No existe ningún Map de rate-limit en el servicio (0 fallback en memoria).
    const serviceAny = service as unknown as Record<string, unknown>;
    assert.equal(serviceAny.otpRequestLog, undefined, 'no debe existir otpRequestLog (Map legacy)');
  });

  it('RL-MONGO-12: MAX_OTP_ATTEMPTS=5 continúa siendo independiente del rate-limit (verificado en spec COPASST)', async () => {
    // La garantía funcional vive en copasst.service.spec.ts → RL-MONGO-12
    // (5 intentos fallidos invalidan el OTP sin consumir cuota del rate-limit).
    // La garantía funcional de MAX_OTP_ATTEMPTS=5 e independencia vive en
    // copasst.service.spec.ts (CP10-07 y CP10.2-15). Aquí se verifica que el
    // servicio de rate-limit NO toca intentos de OTP: no tiene noción de ellos.
    const { service } = buildService();
    const serviceAny = service as unknown as Record<string, unknown>;
    assert.equal(serviceAny.maxOtpAttempts, undefined, 'el rate-limit no gestiona intentos');
    assert.equal(serviceAny.otpStore, undefined, 'el rate-limit no gestiona OTP');
  });

  it('constantes: OTP_RATE_LIMIT_MAX=3 y ventana=10min (sin cambios vs F7B-10.2)', () => {
    assert.equal(OTP_RATE_LIMIT_MAX, 3);
    assert.equal(OTP_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
  });
});

describe('F7B-10.5-B (schema) — índices de otp_rate_limit_counters', () => {
  it('existe índice único sobre key', () => {
    const indexes = OtpRateLimitCounterSchema.indexes();
    const keyIndex = indexes.find(([fields]) => (fields as { key?: number }).key === 1);
    assert.ok(keyIndex, 'debe existir índice sobre key');
    const options = keyIndex?.[1] as { unique?: boolean };
    assert.equal(options.unique, true, 'el índice de key debe ser único');
  });

  it('existe índice TTL sobre expiresAt con expireAfterSeconds=0', () => {
    const indexes = OtpRateLimitCounterSchema.indexes();
    const ttlIndex = indexes.find(([fields]) => (fields as { expiresAt?: number }).expiresAt === 1);
    assert.ok(ttlIndex, 'debe existir índice sobre expiresAt');
    const options = ttlIndex?.[1] as { expireAfterSeconds?: number };
    assert.equal(options.expireAfterSeconds, 0, 'TTL debe expirar en expiresAt (0s)');
  });
});
