import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model } from 'mongoose';

import { OtpChallengeService } from './otp-challenge.service';
import {
  CopasstOtpChallenge,
  CopasstOtpChallengeDocument,
  CopasstOtpChallengeSchema,
} from './otp-challenge.schema';

const KEY_A = 'electionA:doc1:phone1';
const KEY_B = 'electionB:doc2:phone2';
const HASH_1 = 'a'.repeat(64);
const HASH_2 = 'b'.repeat(64);

interface Stored {
  key: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
}

/**
 * Fake del modelo Mongoose que emula las operaciones atómicas del servicio
 * (updateOne upsert, findOneAndUpdate $inc, findOneAndDelete) sobre un store
 * en memoria, más el escenario E11000 (carrera de upsert de clave nueva) y un
 * modo "MongoDB caído" para verificar fail-closed.
 */
function buildModel(overrides?: {
  /** Si true, el primer updateOne con upsert de una clave nueva lanza E11000. */
  e11000OnFirst?: boolean;
  /** Si true, toda operación lanza un error genérico (MongoDB no disponible). */
  dbDown?: boolean;
  /** Si true, expira lógicamente los desafíos con expiresAt pasado. */
  logicalExpiry?: boolean;
}): {
  model: Model<CopasstOtpChallengeDocument>;
  store: Map<string, Stored>;
  updateOneCalls: number;
  findOneAndDeleteCalls: number;
  e11000Thrown: number;
} {
  const store = new Map<string, Stored>();
  let updateOneCalls = 0;
  let findOneAndDeleteCalls = 0;
  let e11000Thrown = 0;
  // Claves que ya tuvieron su upsert inicial (para lanzar E11000 solo una vez).
  const upsertAttempted = new Set<string>();

  const model = {
    updateOne: (filter: { key: string }, update: Record<string, unknown>, options: { upsert?: boolean }) => {
      updateOneCalls += 1;
      const key = (filter as { key: string }).key;
      const set = (update.$set ?? {}) as Partial<Stored>;
      return {
        exec: async () => {
          if (overrides?.dbDown) throw new Error('MongoDB connection lost');
          const existing = store.get(key);
          if (
            !existing &&
            overrides?.e11000OnFirst &&
            options.upsert &&
            !upsertAttempted.has(key)
          ) {
            upsertAttempted.add(key);
            e11000Thrown += 1;
            const err = new Error('E11000 duplicate key') as Error & { code?: number };
            err.code = 11000;
            throw err;
          }
          if (existing) {
            existing.otpHash = set.otpHash ?? existing.otpHash;
            existing.expiresAt = set.expiresAt ?? existing.expiresAt;
            existing.attempts = (set.attempts as number) ?? existing.attempts;
          } else {
            store.set(key, {
              key,
              otpHash: set.otpHash ?? '',
              expiresAt: set.expiresAt ?? new Date(),
              attempts: (set.attempts as number) ?? 0,
            });
          }
          return { acknowledged: true };
        },
      };
    },
    findOne: (filter: { key: string }) => ({
      exec: async () => {
        if (overrides?.dbDown) throw new Error('MongoDB connection lost');
        const entry = store.get((filter as { key: string }).key) ?? null;
        if (entry && overrides?.logicalExpiry && entry.expiresAt.getTime() < Date.now()) {
          return null;
        }
        return entry;
      },
    }),
    findOneAndUpdate: (
      filter: { key: string; otpHash: string },
      update: Record<string, unknown>,
      _options: { new?: boolean },
    ) => ({
      exec: async () => {
        if (overrides?.dbDown) throw new Error('MongoDB connection lost');
        const entry = store.get((filter as { key: string }).key);
        if (!entry || entry.otpHash !== (filter as { otpHash: string }).otpHash) return null;
        const inc = (update.$inc as { attempts?: number })?.attempts ?? 0;
        entry.attempts += inc;
        return { ...entry };
      },
    }),
    findOneAndDelete: (filter: { key: string; otpHash: string }) => {
      findOneAndDeleteCalls += 1;
      return {
        exec: async () => {
          if (overrides?.dbDown) throw new Error('MongoDB connection lost');
          const entry = store.get((filter as { key: string }).key);
          if (!entry || entry.otpHash !== (filter as { otpHash: string }).otpHash) return null;
          store.delete((filter as { key: string }).key);
          return { ...entry };
        },
      };
    },
    deleteOne: (filter: { key: string }) => ({
      exec: async () => {
        if (overrides?.dbDown) throw new Error('MongoDB connection lost');
        store.delete((filter as { key: string }).key);
        return { deletedCount: 1 };
      },
    }),
  } as unknown as Model<CopasstOtpChallengeDocument>;

  return {
    model,
    store,
    // Getters: las variables let se incrementan dentro de los closures del
    // fake; los getters evitan capturar el snapshot inicial.
    get updateOneCalls() {
      return updateOneCalls;
    },
    get findOneAndDeleteCalls() {
      return findOneAndDeleteCalls;
    },
    get e11000Thrown() {
      return e11000Thrown;
    },
  };
}

describe('OtpChallengeService (store OTP compartido en MongoDB — F7B-10.6-D)', () => {
  it('OTP-DIST-01: setChallenge crea el desafío con otpHash, expiresAt y attempts 0', async () => {
    const { model, store } = buildModel();
    const service = new OtpChallengeService(model);

    await service.setChallenge(KEY_A, HASH_1, 5 * 60 * 1000);

    const entry = store.get(KEY_A);
    assert.ok(entry);
    assert.equal(entry.otpHash, HASH_1);
    assert.equal(entry.attempts, 0);
    assert.ok(entry.expiresAt.getTime() > Date.now());
  });

  it('OTP-DIST-02: regenerar en B reemplaza el hash y reinicia attempts (invalida el anterior)', async () => {
    const { model, store } = buildModel();
    const service = new OtpChallengeService(model);

    await service.setChallenge(KEY_A, HASH_1, 5 * 60 * 1000);
    await service.incrementAttempts(KEY_A, HASH_1);
    assert.equal(store.get(KEY_A)?.attempts, 1);

    // "Instancia B" regenera el OTP de la misma identidad.
    await service.setChallenge(KEY_A, HASH_2, 5 * 60 * 1000);

    assert.equal(store.get(KEY_A)?.otpHash, HASH_2);
    assert.equal(store.get(KEY_A)?.attempts, 0);
  });

  it('OTP-DIST-03: consumeIfMatches elimina el desafío; un segundo consumo devuelve false', async () => {
    const { model, store } = buildModel();
    const service = new OtpChallengeService(model);

    await service.setChallenge(KEY_A, HASH_1, 5 * 60 * 1000);
    assert.equal(await service.consumeIfMatches(KEY_A, HASH_1), true);
    assert.equal(store.has(KEY_A), false);
    assert.equal(await service.consumeIfMatches(KEY_A, HASH_1), false);
  });

  it('OTP-DIST-04: incrementAttempts comparte intentos (segunda "instancia" ve el conteo)', async () => {
    const { model } = buildModel();
    const service = new OtpChallengeService(model);

    await service.setChallenge(KEY_A, HASH_1, 5 * 60 * 1000);
    // Instancia A falla 2 veces, instancia B 1 vez → conteo compartido 3.
    assert.equal(await service.incrementAttempts(KEY_A, HASH_1), 1);
    assert.equal(await service.incrementAttempts(KEY_A, HASH_1), 2);
    assert.equal(await service.incrementAttempts(KEY_A, HASH_1), 3);
  });

  it('OTP-DIST-05: getChallenge devuelve null para un desafío expirado (expiración lógica)', async () => {
    const { model, store } = buildModel({ logicalExpiry: true });
    const service = new OtpChallengeService(model);

    await service.setChallenge(KEY_A, HASH_1, -1000); // ya vencido
    assert.equal(await service.getChallenge(KEY_A), null);
    // Con expiración normal el desafío existe.
    store.delete(KEY_A);
    await service.setChallenge(KEY_A, HASH_1, 5 * 60 * 1000);
    assert.ok(await service.getChallenge(KEY_A));
  });

  it('OTP-DIST-06: incrementAttempts con hash inválido devuelve null (no cuenta contra el desafío vigente)', async () => {
    const { model } = buildModel();
    const service = new OtpChallengeService(model);

    await service.setChallenge(KEY_A, HASH_1, 5 * 60 * 1000);
    assert.equal(await service.incrementAttempts(KEY_A, 'wrong-hash'), null);
  });

  it('OTP-DIST-07: error de MongoDB se propaga (fail-closed, sin fallback a memoria)', async () => {
    const { model } = buildModel({ dbDown: true });
    const service = new OtpChallengeService(model);

    await assert.rejects(() => service.setChallenge(KEY_A, HASH_1, 60_000));
    await assert.rejects(() => service.consumeIfMatches(KEY_A, HASH_1));
    await assert.rejects(() => service.incrementAttempts(KEY_A, HASH_1));
  });

  it('OTP-DIST-08/09: el documento solo contiene key/otpHash/expiresAt/attempts — sin OTP plano ni otpPreview', async () => {
    const schema = CopasstOtpChallengeSchema;
    const paths = Object.keys(schema.paths).sort();
    // NUNCA se almacena el OTP en texto plano ni otpPreview.
    assert.equal(paths.includes('otp'), false);
    assert.equal(paths.includes('otpPreview'), false);
    assert.equal(paths.includes('otpCode'), false);
    assert.equal(paths.includes('companyId'), false);
    assert.equal(paths.includes('phone'), false);
    assert.equal(paths.includes('document'), false);
    // Campos esperados: _id, key, otpHash, expiresAt, attempts, createdAt, __v.
    assert.ok(paths.includes('key'));
    assert.ok(paths.includes('otpHash'));
    assert.ok(paths.includes('expiresAt'));
    assert.ok(paths.includes('attempts'));
  });

  it('OTP-DIST-10: índices — único sobre key y TTL sobre expiresAt con expireAfterSeconds 0', async () => {
    const indexes = CopasstOtpChallengeSchema.indexes().map(([def, opts]) => ({ def, opts }));
    const uniqueKey = indexes.find((i) => i.def.key === 1);
    const ttl = indexes.find((i) => i.def.expiresAt === 1);

    assert.ok(uniqueKey, 'debe existir índice sobre key');
    assert.equal(uniqueKey.opts.unique, true);
    assert.ok(ttl, 'debe existir índice TTL sobre expiresAt');
    assert.equal(ttl.opts.expireAfterSeconds, 0);
  });

  it('OTP-DIST-11: dos consumos concurrentes del mismo OTP — exactamente uno gana (findOneAndDelete atómico)', async () => {
    const { model } = buildModel();
    const service = new OtpChallengeService(model);

    await service.setChallenge(KEY_A, HASH_1, 5 * 60 * 1000);

    // Emulación de la serialización atómica de findOneAndDelete: dos llamadas
    // "simultáneas"; la primera elimina el documento y la segunda recibe null.
    const [r1, r2] = await Promise.all([
      service.consumeIfMatches(KEY_A, HASH_1),
      service.consumeIfMatches(KEY_A, HASH_1),
    ]);

    const wins = [r1, r2].filter(Boolean).length;
    assert.equal(wins, 1);
  });

  it('E11000: el primer upsert concurrente de una clave nueva se reintenta UNA vez y tiene éxito', async () => {
    const built = buildModel({ e11000OnFirst: true });
    const service = new OtpChallengeService(built.model);

    await service.setChallenge(KEY_B, HASH_1, 5 * 60 * 1000);

    // Los getters se leen DESPUÉS de la operación (no se destructura antes).
    assert.equal(built.e11000Thrown, 1);
    assert.equal(built.updateOneCalls, 2); // primer intento (E11000) + retry único
    assert.equal(await service.consumeIfMatches(KEY_B, HASH_1), true);
  });

  it('E11000 sin retry infinito: un segundo E11000 se propaga como error controlado', async () => {
    // Modo: SIEMPRE E11000 (carrera persistente). El retry único falla y el
    // error se propaga — nunca un loop.
    const alwaysE11000 = {
      updateOne: (filter: { key: string }, update: Record<string, unknown>, options: { upsert?: boolean }) => ({
        exec: async () => {
          void filter; void update; void options;
          const err = new Error('E11000 duplicate key') as Error & { code?: number };
          err.code = 11000;
          throw err;
        },
      }),
    } as unknown as Model<CopasstOtpChallengeDocument>;

    const service = new OtpChallengeService(alwaysE11000);
    await assert.rejects(() => service.setChallenge(KEY_A, HASH_1, 60_000), /E11000/);
  });
});
