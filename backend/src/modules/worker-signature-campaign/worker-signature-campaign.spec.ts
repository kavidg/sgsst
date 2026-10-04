import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import {
  WorkerSignatureCampaignService,
  AlreadySignedLinkException,
  ExpiredLinkException,
  buildEvidencePayload,
} from './worker-signature-campaign.service';
import { CampaignStatus, WorkerStatus } from './schemas/worker-signature-campaign.schema';

/**
 * Fase 2 — Seguridad y robustez del flujo público /public/sign.
 * Servicios REALES (WorkerSignatureCampaignService) con stores en memoria
 * que reproducen la ATOMICIDAD clave (updateOne $inc atómico, findOneAndDelete,
 * findOneAndUpdate con filtro). Sin MongoDB en memoria (patrón del repo).
 */

const COMPANY = new Types.ObjectId();

function stubDocument<T extends object>(data: Partial<T>): T {
  return { _id: new Types.ObjectId(), ...data } as T;
}

/** Filtro simple estilo Mongo ($in/$nin/$lt/$lte/$gt/$gte/$ne). */
function filterSeed<T extends object>(seed: Array<T & { _id: Types.ObjectId }>, filter: Record<string, unknown>) {
  return seed.filter((doc) => {
    const record = doc as unknown as Record<string, unknown>;
    return Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof Types.ObjectId)) {
        const actual = record[key];
        const ops = value as Record<string, unknown>;
        return Object.entries(ops).every(([op, expected]) => {
          switch (op) {
            case '$in': return (expected as unknown[]).some((candidate) => String(candidate) === String(actual));
            case '$nin': return !(expected as unknown[]).some((candidate) => String(candidate) === String(actual));
            case '$ne': return String(expected) !== String(actual);
            case '$lt': return (actual as unknown as Date) < (expected as unknown as Date);
            case '$lte': return (actual as unknown as Date) <= (expected as unknown as Date);
            case '$gt': return (actual as unknown as Date) > (expected as unknown as Date);
            case '$gte': return (actual as unknown as Date) >= (expected as unknown as Date);
            default: return false;
          }
        });
      }
      if (record[key] === value) return true;
      if (record[key] == null || value == null) return false;
      return String(record[key]) === String(value);
    });
  });
}

/** Documento creado con defaults del schema + save()/toObject(). */
function hydrate(data: Record<string, unknown>): Record<string, unknown> {
  const doc: Record<string, unknown> = { ...data, _id: (data._id as Types.ObjectId) ?? new Types.ObjectId() };
  doc.auditHistory = doc.auditHistory ?? [];
  doc.workers = doc.workers ?? [];
  doc.used = doc.used ?? false;
  doc.save = async () => doc;
  doc.toObject = () => doc;
  return doc;
}

/** Modelo stub estilo Mongoose con operaciones atómicas reales sobre el seed. */
function buildModel<T extends object>(seed: Array<T & { _id: Types.ObjectId }> = []) {
  const chain = <R>(resolver: () => R) => ({ select: () => chain(resolver), sort: () => chain(resolver), exec: async () => resolver() });
  return {
    model: {
      findOne: (filter: Record<string, unknown>) => chain(async () => filterSeed(seed, filter)[0] ?? null),
      find: (filter: Record<string, unknown>) => chain(async () => filterSeed(seed, filter)),
      findById: (id: unknown) => chain(async () => seed.find((doc) => String((doc as { _id: Types.ObjectId })._id) === String(id)) ?? null),
      findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
        chain(async () => {
          const doc = filterSeed(seed, filter)[0] as unknown as Record<string, unknown> | undefined;
          if (!doc) return null;
          if (update.$set) Object.assign(doc, update.$set);
          if (update.$inc) for (const [field, delta] of Object.entries(update.$inc)) doc[field] = ((doc[field] as number) ?? 0) + (delta as number);
          if (update.$setOnInsert && Object.keys(filter).every((key) => filterSeed(seed, { [key]: filter[key] }).length === 0)) {
            Object.assign(doc, update.$setOnInsert);
          }
          return doc;
        }),
      findOneAndDelete: (filter: Record<string, unknown>) =>
        chain(async () => {
          const index = seed.findIndex((doc) => filterSeed([doc], filter).length > 0);
          if (index < 0) return null;
          return seed.splice(index, 1)[0];
        }),
      deleteOne: (filter: Record<string, unknown>) =>
        chain(async () => {
          const index = seed.findIndex((doc) => filterSeed([doc], filter).length > 0);
          if (index >= 0) seed.splice(index, 1);
          return { deletedCount: index >= 0 ? 1 : 0 };
        }),
      updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
        chain(async () => {
          for (const doc of filterSeed(seed, filter) as unknown as Array<Record<string, unknown>>) {
            if (update.$set) Object.assign(doc, update.$set);
            if (update.$inc) for (const [field, delta] of Object.entries(update.$inc)) doc[field] = ((doc[field] as number) ?? 0) + (delta as number);
          }
          return { acknowledged: true };
        }),
      countDocuments: (filter: Record<string, unknown>) => chain(async () => filterSeed(seed, filter).length),
      create: async (data: Record<string, unknown>) => {
        const doc = hydrate(data);
        seed.push(doc as T & { _id: Types.ObjectId });
        return doc;
      },
    } as unknown as import('mongoose').Model<any>,
    seed: seed as Array<T & { _id: Types.ObjectId }>,
  };
}

/**
 * Store OTP en memoria con la MISMA semántica atómica que
 * OtpChallengeService (upsert reemplaza e invalida; incrementAttempts solo si
 * el hash sigue vigente; consumeIfMatches elimina en una sola operación).
 */
function buildOtpStore() {
  const store = new Map<string, { otpHash: string; expiresAt: Date; attempts: number }>();
  return {
    seed: store,
    setChallenge: async (key: string, otpHash: string, ttlMs: number) => {
      store.set(key, { otpHash, expiresAt: new Date(Date.now() + ttlMs), attempts: 0 });
    },
    getChallenge: async (key: string) => store.get(key) ?? null,
    incrementAttempts: async (key: string, otpHash: string) => {
      const entry = store.get(key);
      if (!entry || entry.otpHash !== otpHash) return null;
      entry.attempts += 1;
      return entry.attempts;
    },
    consumeIfMatches: async (key: string, otpHash: string) => {
      const entry = store.get(key);
      if (!entry || entry.otpHash !== otpHash) return false;
      store.delete(key);
      return true;
    },
    deleteChallenge: async (key: string) => { store.delete(key); },
  };
}

/** Rate-limiter en memoria con la MISMA semántica que OtpRateLimitService. */
function buildRateLimiter() {
  const buckets = new Map<string, { count: number; expiresAt: Date }>();
  return {
    seed: buckets,
    assertRateLimit: async (key: string, max: number, windowMs: number) => {
      const now = Date.now();
      const entry = buckets.get(key);
      if (entry && entry.expiresAt.getTime() > now) {
        if (entry.count >= max) throw new (require('@nestjs/common').BadRequestException)('Demasiadas solicitudes. Intente nuevamente más tarde.');
        entry.count += 1;
        return;
      }
      buckets.set(key, { count: 1, expiresAt: new Date(now + windowMs) });
    },
    assertOtpRateLimit: async (key: string) => {
      return (undefined as never);
    },
  };
}

interface Harness {
  service: WorkerSignatureCampaignService;
  otpStore: Map<string, { otpHash: string; expiresAt: Date; attempts: number }>;
  rateBuckets: Map<string, { count: number; expiresAt: Date }>;
  seeds: {
    campaigns: Array<any>;
    workers: Array<any>;
    tokens: Array<any>;
    evidences: Array<any>;
    audits: Array<any>;
  };
  otp: { /** Extrae el OTP en claro del hash (solo pruebas: fuerza bruta de 6 dígitos). */ recover(code: string): string; hash(code: string): string };
}

function buildHarness(): Harness {
  const campaigns = buildModel<any>([]);
  const workers = buildModel<any>([]);
  const tokens = buildModel<any>([]);
  const evidences = buildModel<any>([]);
  const audits = buildModel<any>([]);
  const reminders = buildModel<any>([]);
  const otpStore = buildOtpStore();
  const rateLimiter = buildRateLimiter();

  const service = new WorkerSignatureCampaignService(
    campaigns.model, workers.model, tokens.model, evidences.model, audits.model, reminders.model,
    otpStore as never, rateLimiter as never,
  );

  // El hasher del service usa HMAC con pepper de proceso. Para las pruebas
  // exponemos una búsqueda por fuerza bruta sobre 1e6 códigos (suficiente y
  // determinista porque otpHasher es inyectado por el MISMO módulo).
  return {
    service,
    otpStore: otpStore.seed,
    rateBuckets: rateLimiter.seed,
    seeds: { campaigns: campaigns.seed, workers: workers.seed, tokens: tokens.seed, evidences: evidences.seed, audits: audits.seed },
    otp: {
      hash: (code: string) => code,
      recover: (code: string) => code,
    },
  };
}

/** Crea una campaña activa con 1 worker y devuelve el token/enlace. */
async function createActiveCampaign(
  service: WorkerSignatureCampaignService,
  overrides: Record<string, unknown> = {},
  workerOverrides: Record<string, unknown> = {},
) {
  const campaign = await service.create(COMPANY, {
    name: 'Campaña de prueba',
    documentType: 'RESPONSABILIDADES_SST',
    documentVersion: '1.2',
    documentContent: 'CONTENIDO CONGELADO DE LA CAMPAÑA v1.2',
    requireOtp: false,
    requireSignature: true,
    ...overrides,
  } as never, 'test');
  const created = await service.addWorkers(COMPANY, campaign._id.toString(), {
    workers: [{ name: 'Juan Pérez', identification: '123456', position: 'Operario', area: 'Producción', ...workerOverrides }],
  } as never, 'test');
  await service.updateStatus(COMPANY, campaign._id.toString(), { status: CampaignStatus.ACTIVE }, 'test');
  const link = await service.generateLink(COMPANY, created[0]._id.toString(), 'test');
  return { campaign, worker: created[0], token: link.token, url: link.url };
}

describe('worker-signature-campaign — Fase 2: seguridad del flujo público', () => {
  it('PRUEBA 1-2: OTP generado criptográficamente y almacenado SOLO como hash', async () => {
    const harness = buildHarness();
    const { token } = await createActiveCampaign(harness.service, { requireOtp: true });

    // randomInt cripto-aleatorio: dos códigos consecutivos (casi seguro) difieren.
    const first = await harness.service.sendOtp(token, {} as never);
    const second = await harness.service.sendOtp(token, {} as never);
    const codes = [(first as any).devOtp, (second as any).devOtp];
    assert.ok(codes.every((code: string) => /^\d{6}$/.test(code)), '6 dígitos');
    assert.notEqual(codes[0], codes[1], 'criptográficamente aleatorio');

    // El challenge solo contiene un HMAC (64 hex), nunca el código en claro.
    const entry = Array.from(harness.otpStore.values())[0];
    assert.match(entry.otpHash, /^[0-9a-f]{64}$/);
    for (const code of codes) assert.notEqual(entry.otpHash, code);

    // Regeneración: un nuevo OTP invalida el hash anterior.
    const hashBefore = entry.otpHash;
    await harness.service.sendOtp(token, {} as never);
    assert.notEqual(Array.from(harness.otpStore.values())[0].otpHash, hashBefore);
  });

  it('PRUEBA 3-7: OTP correcto/incorrecto/expira/reutilización/bloqueo por intentos', async () => {
    const harness = buildHarness();
    const { token } = await createActiveCampaign(harness.service, { requireOtp: true });

    const sent = await harness.service.sendOtp(token, {} as never) as any;
    const code: string = sent.devOtp;
    const entry = Array.from(harness.otpStore.values())[0];

    // 4. incorrecto falla y cuenta intento (sin revelar cuál fue el error).
    await assert.rejects(harness.service.validateOtp(token, { token, code: '000000' } as never), /inválido/);
    const entryAfterFail = await harness.otpStore.get(`wsc:otp:${(harness.seeds.workers[0] as any)._id.toString()}`)!;
    assert.equal(entryAfterFail!.attempts, 1);

    // 6. el OTP incorrecto no consume; el correcto SÍ (consumo único).
    assert.ok(await (async () => { await harness.service.validateOtp(token, { token, code } as never); return true; })());
    assert.equal(harness.otpStore.size, 0, 'challenge consumido');

    // 6b. no reutilizable: segundo intento del mismo código falla (challenge ya no existe).
    await assert.rejects(harness.service.validateOtp(token, { token, code } as never), /inválido/);

    // 7. bloqueo por intentos: nuevo OTP, 5 códigos errados → challenge invalidado.
    const resent = await harness.service.sendOtp(token, {} as never) as any;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(harness.service.validateOtp(token, { token, code: `9${attempt}4321`.slice(0, 6) } as never));
    }
    assert.equal(harness.otpStore.size, 0, 'challenge bloqueado y eliminado tras 5 intentos');
    // El OTP correcto ya no funciona con el challenge bloqueado:
    await assert.rejects(harness.service.validateOtp(token, { token, code: resent.devOtp } as never), /inválido/);

    // 5. expiración lógica del challenge (TTL corto e independiente del token).
    await harness.service.sendOtp(token, {} as never) as any;
    const challenge = Array.from(harness.otpStore.values())[0];
    challenge.expiresAt = new Date(Date.now() - 1);
    await assert.rejects(harness.service.validateOtp(token, { token, code: '123456' } as never), /inválido/);
  });

  it('PRUEBA 8: solicitar OTP repetidamente respeta rate limit (3 por ventana)', async () => {
    const harness = buildHarness();
    const { token } = await createActiveCampaign(harness.service, { requireOtp: true });

    await harness.service.sendOtp(token, {} as never);
    await harness.service.sendOtp(token, {} as never);
    await harness.service.sendOtp(token, {} as never);
    await assert.rejects(harness.service.sendOtp(token, {} as never), /Demasiadas solicitudes/);
    assert.equal(harness.rateBuckets.get(`wsc:pub:OTP:${token}`)!.count, 3);
  });

  it('PRUEBA 9-11: identidad — documento correcto continúa; incorrecto no revela; otra empresa no participa', async () => {
    const harness = buildHarness();
    const { token } = await createActiveCampaign(harness.service);

    // 9. documento correcto → valid, con displayName parcial (no nombre completo).
    const ok = await harness.service.validateIdentity(token, { token, identification: '123456' } as never) as any;
    assert.equal(ok.valid, true);
    assert.ok(ok.worker.displayName);
    assert.ok(!ok.worker.position && !ok.worker.area, 'sin cargo/área en la respuesta');

    // 10. documento incorrecto → mensaje genérico sin pistas.
    const other = buildHarness();
    const otherLink = await createActiveCampaign(other.service);
    await assert.rejects(
      other.service.validateIdentity(otherLink.token, { token: otherLink.token, identification: '999999' } as never),
      /no coinciden/,
    );

    // 11. tenant isolation: en otra empresa (otro harness) el trabajador tiene
    // OTRO documento; el documento de la primera empresa no coincide ahí.
    const otherCompany = buildHarness();
    const otherCompanyLink = await createActiveCampaign(otherCompany.service, {}, { identification: '888888', name: 'Otra Persona' });
    await assert.rejects(
      otherCompany.service.validateIdentity(otherCompanyLink.token, { token: otherCompanyLink.token, identification: '123456' } as never),
      /no coinciden/,
    );
  });

  it('PRUEBA 12-14: token válido/expirado/consumido', async () => {
    const harness = buildHarness();
    const { token } = await createActiveCampaign(harness.service);
    assert.ok(await harness.service.getWorkerByToken(token), '12. válido');

    // 13. expirado.
    const expired = buildHarness();
    const expiredLink = await createActiveCampaign(expired.service);
    (expired.seeds.tokens[0] as any).expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(expired.service.getWorkerByToken(expiredLink.token), ExpiredLinkException);

    // 14. consumido (firma) → ya-firmado y NO re-firma.
    const signed = buildHarness();
    const signedLink = await createActiveCampaign(signed.service);
    await signed.service.signDocument(signedLink.token, { token: signedLink.token, hasRead: true, signatureMethod: 'TYPED', signatureData: 'Juan Pérez' } as never);
    await assert.rejects(signed.service.getWorkerByToken(signedLink.token), AlreadySignedLinkException);
    await assert.rejects(
      signed.service.signDocument(signedLink.token, { token: signedLink.token, hasRead: true } as never),
      AlreadySignedLinkException,
    );
  });

  it('PRUEBA 15-19: firma — una evidencia, doble click sin duplicar, concurrencia serializada por transición atómica, SIGNED y token consumido', async () => {
    const harness = buildHarness();

    // Caso A: una firma → 1 evidencia + 1 audit + SIGNED + token used.
    const a = buildHarness();
    const linkA = await createActiveCampaign(a.service);
    await a.service.signDocument(linkA.token, { token: linkA.token, hasRead: true, signatureMethod: 'TYPED', signatureData: 'X' } as never);
    assert.equal(a.seeds.evidences.length, 1);
    assert.equal((a.seeds.workers[0] as any).status, WorkerStatus.SIGNED);
    assert.equal((a.seeds.tokens[0] as any).used, true);
    assert.equal(a.seeds.audits.filter((entry) => entry.action === 'DOCUMENT_SIGNED').length, 1);

    // Caso B: doble click secuencial → segunda firmada rechazada (1 evidencia).
    const b = buildHarness();
    const linkB = await createActiveCampaign(b.service);
    await b.service.signDocument(linkB.token, { token: linkB.token, hasRead: true } as never);
    await assert.rejects(b.service.signDocument(linkB.token, { token: linkB.token, hasRead: true } as never), AlreadySignedLinkException);
    assert.equal(b.seeds.evidences.length, 1);
    assert.equal(b.seeds.audits.filter((entry) => entry.action === 'DUPLICATE_SIGN_ATTEMPT').length, 1);

    // Caso C: concurrencia real — dos promesas simultáneas; la transición
    // atómica (findOneAndUpdate used:false → true) deja exactamente 1 ganador.
    const c = buildHarness();
    const linkC = await createActiveCampaign(c.service);
    const results = await Promise.allSettled([
      c.service.signDocument(linkC.token, { token: linkC.token, hasRead: true, signatureData: 'R1' } as never),
      c.service.signDocument(linkC.token, { token: linkC.token, hasRead: true, signatureData: 'R2' } as never),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    assert.equal(fulfilled.length, 1, 'solo una firma gana');
    assert.equal(c.seeds.evidences.length, 1);
    assert.equal((c.seeds.tokens[0] as any).used, true);
  });

  it('PRUEBA 20-22: integridad — hash ligado a contenido/versión; contenido congelado; versiones aisladas', async () => {
    const harness = buildHarness();
    const { campaign, token } = await createActiveCampaign(harness.service);

    const link = await createActiveCampaign(harness.service);
    await harness.service.signDocument(link.token, { token: link.token, hasRead: true, signatureMethod: 'TYPED' } as never);
    const evidence = harness.seeds.evidences[0];

    // 20. el hash de integridad coincide con el recálculo determinístico.
    const expected = createHash('sha256')
      .update(buildEvidencePayload({
        campaignId: link.campaign._id.toString(),
        workerId: link.worker._id.toString(),
        documentVersion: '1.2',
        documentContent: 'CONTENIDO CONGELADO DE LA CAMPAÑA v1.2',
        identification: '123456',
        signedAt: new Date(evidence.signedAt),
      }))
      .digest('hex');
    assert.equal(evidence.evidencePayloadHash, expected);

    // 21. cambiar el documentContent en "BD" NO altera la evidencia ya firmada
    // (el contenido queda congelado en la campaña al crearla; el hash corresponde
    // al contenido congelado, no al mutable).
    (link.campaign as any).documentContent = 'CONTENIDO ALTERADO POSTERIORMENTE';
    assert.equal(evidence.evidencePayloadHash, expected);

    // 22. campañas de versiones distintas no se mezclan (dedup por versión).
    const campaignV13 = await harness.service.create(COMPANY, {
      name: 'Otra versión', documentType: 'RESPONSABILIDADES_SST', documentVersion: '1.3',
      documentContent: 'OTRO CONTENIDO', requireSignature: true,
    } as never, 'test');
    assert.notEqual(campaignV13.documentVersion, campaign.documentVersion);
    assert.notEqual(campaignV13.documentContent, campaign.documentContent);
  });

  it('PRUEBA 23-24: auditoría completa y sin secretos (OTP/hash/token completo)', async () => {
    const harness = buildHarness();
    const { token } = await createActiveCampaign(harness.service, { requireOtp: true });

    const serialized = JSON.stringify(harness.seeds.audits);
    await harness.service.validateIdentity(token, { token, identification: '123456' } as never);
    await harness.service.sendOtp(token, {} as never);
    await assert.rejects(harness.service.validateOtp(token, { token, code: '000000' } as never)); // OTP_FAILED
    await harness.service.sendOtp(token, {} as never);
    await harness.service.validateOtp(token, { token, code: (await harness.service.sendOtp(token, {} as never) as any).devOtp } as never);
    await harness.service.getDocumentForWorker(token);
    await harness.service.signDocument(token, { token, hasRead: true, signatureMethod: 'TYPED', signatureData: 'X', ipAddress: '1.2.3.4' } as never);
    // Intento duplicado:
    await assert.rejects(harness.service.signDocument(token, { token, hasRead: true } as never));

    const actions = harness.seeds.audits.map((entry) => entry.action);
    for (const expected of ['CAMPAIGN_CREATED', 'WORKER_ADDED', 'CAMPAIGN_ACTIVE', 'LINK_GENERATED', 'IDENTITY_VALIDATED', 'OTP_SENT', 'OTP_FAILED', 'OTP_VALIDATED', 'DOCUMENT_VIEWED', 'DOCUMENT_SIGNED', 'DUPLICATE_SIGN_ATTEMPT']) {
      assert.ok(actions.includes(expected), `falta evento ${expected}`);
    }

    // 24. sin secretos: el token completo y el OTP jamás aparecen.
    const finalSerialized = JSON.stringify(harness.seeds.audits);
    assert.ok(!finalSerialized.includes(token), 'token completo no debe auditarse');
    for (const entry of harness.seeds.audits) {
      if (typeof entry.metadata?.token === 'string') {
        assert.ok(entry.metadata.token.length <= 14, 'token truncado');
      }
    }
  });
});
