import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { CopasstService, REGISTRATION_RATE_LIMIT_MAX } from './copasst.service';
import { CopasstPeriodDocument } from './schemas/copasst.schema';
import { OtpRateLimitService } from '../otp-rate-limit/otp-rate-limit.service';
import { OtpChallengeService } from '../otp-challenge/otp-challenge.service';
import { CopasstOtpChallengeSchema } from '../otp-challenge/otp-challenge.schema';

/** Empresa A: tenant del periodo de prueba (companyId de buildPeriod). */
const COMPANY_A = new Types.ObjectId('64b0000000000000000000a1');
/** Empresa B: tenant ajeno para los tests de tenant isolation (F7B-10.6-D). */
const COMPANY_B = new Types.ObjectId('64b0000000000000000000ff');

const ELECTION_A = '64b0000000000000000000aa';
const CANDIDATE_DOC = '111';
const VOTER_DOC = '222';
const PHONE = '666';
const OTP_KEY = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;

/** Periodo electoral COPASST en memoria con un candidato aprobado y save(). */
function buildPeriod(overrides: Record<string, unknown> = {}): CopasstPeriodDocument {
  return {
    _id: new Types.ObjectId(ELECTION_A),
    companyId: new Types.ObjectId('64b0000000000000000000a1'),
    periodName: 'COPASST Inicial',
    startDate: new Date('2025-01-01T00:00:00.000Z'),
    endDate: new Date('2027-01-01T00:00:00.000Z'),
    status: 'ACTIVO',
    // F7B-10.6-C: los tests de flujo electoral asumen elección OPEN por defecto
    // (los tests ESTATE prueban explícitamente NOT_STARTED/CLOSED).
    electionState: 'OPEN',
    candidateExtended: [
      {
        name: 'Candidato 1',
        document: CANDIDATE_DOC,
        phone: '555',
        area: 'X',
        position: 'Y',
        motivation: 'Z',
        adminStatus: 'APROBADO',
        votes: 0,
      },
    ] as never,
    votesExtended: [] as never,
    save: async function () {
      return this as unknown as CopasstPeriodDocument;
    },
    ...overrides,
  } as unknown as CopasstPeriodDocument;
}

/**
 * Modelo Mongoose en memoria mínimo (findById/findOne + CAS del voto).
 *
 * findOneAndUpdate emula el patrón atómico F7B-3: evalúa la condición
 * (`votesExtended.document: {$ne}` + existencia del candidato) y aplica los
 * $push como una sola unidad; si la condición no se cumple devuelve null
 * (mismo observable que MongoDB). updateOne emula el $inc posicional sobre
 * candidateExtended.$.votes.
 */
function buildModel(seed: CopasstPeriodDocument[] = []) {
  const store = new Map<string, CopasstPeriodDocument>();
  for (const doc of seed) store.set((doc._id as Types.ObjectId).toString(), doc);
  const apply = (doc: CopasstPeriodDocument, update: Record<string, unknown>): void => {
    const push = update.$push as Record<string, unknown> | undefined;
    if (!push) return;
    for (const [field, value] of Object.entries(push)) {
      const arr = (doc as unknown as Record<string, unknown[]>)[field];
      if (Array.isArray(arr)) arr.push(value as never);
      else if (arr === undefined) {
        (doc as unknown as Record<string, unknown[]>)[field] = [value as never];
      }
    }
  };
  return {
    store,
    findById: (id: Types.ObjectId) => ({
      exec: async () => store.get(id.toString()) ?? null,
    }),
    // F7B-10.6-D: findOne soporta el matching tenant-scoped {_id, companyId}
    // (findPeriodScoped). Filtros sin _id/companyId (getCurrent/summary)
    // conservan el comportamiento previo (null).
    findOne: (filter: Record<string, unknown>) => ({
      exec: async () => {
        const id = filter._id as Types.ObjectId | undefined;
        const companyId = filter.companyId as Types.ObjectId | undefined;
        if (!id && !companyId) return null;
        for (const doc of store.values()) {
          const idMatch =
            id === undefined ||
            (doc._id as Types.ObjectId).toString() === id.toString();
          const companyMatch =
            companyId === undefined ||
            (doc.companyId as Types.ObjectId).toString() === companyId.toString();
          if (idMatch && companyMatch) return doc;
        }
        return null;
      },
      sort: () => ({ exec: async () => null }),
    }),
    create: async () => {
      throw new Error('no usado en F7B-10.1');
    },
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
      exec: async () => {
        const period = store.get((filter._id as Types.ObjectId).toString());
        if (!period) return null;
        const neDoc = (filter['votesExtended.document'] as { $ne?: string } | undefined)?.$ne;
        const candDoc = filter['candidateExtended.document'] as string | undefined;
        const alreadyVoted = (period.votesExtended ?? []).some((v) => v.document === neDoc);
        const candidateExists = (period.candidateExtended ?? []).some((c) => c.document === candDoc);
        if (alreadyVoted || !candidateExists) return null;
        apply(period, update);
        return period;
      },
    }),
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
      exec: async () => {
        const period = store.get((filter._id as Types.ObjectId).toString());
        if (!period) return { modifiedCount: 0 };
        const candDoc = filter['candidateExtended.document'] as string | undefined;
        const inc = update.$inc as Record<string, number> | undefined;
        const candidate = (period.candidateExtended ?? []).find((c) => c.document === candDoc);
        if (candidate && inc && typeof inc['candidateExtended.$.votes'] === 'number') {
          candidate.votes += inc['candidateExtended.$.votes'];
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },
    }),
  };
}

/**
 * Modelo Mongoose en memoria del store OTP COMPARTIDO (F7B-10.6-D).
 *
 * Emula las operaciones del OtpChallengeService sobre la colección
 * copasst_otp_challenges: findOne, updateOne (upsert + $set con E11000
 * simulable y retry único), findOneAndUpdate ($inc attempts), findOneAndDelete
 * (consumo atómico de un solo uso) y deleteOne. Misma semántica que MongoDB.
 */
class FakeChallengeModel {
  store = new Map<string, {
    key: string; otpHash: string; expiresAt: Date; attempts: number; createdAt: Date;
  }>();
  /** Si es true, el próximo upsert de una clave NUEVA inserta y lanza E11000 (carrera). */
  failNextUpsert = false;
  /** Si está seteado, la próxima operación lanza este error (fail-closed). */
  failNextWithError: Error | null = null;
  /** Número de intentos de escritura upsert (para validar el retry único). */
  upsertCalls = 0;

  private maybeFail(): void {
    if (this.failNextWithError) {
      const error = this.failNextWithError;
      this.failNextWithError = null;
      throw error;
    }
  }

  findOne(filter: { key?: string }) {
    return {
      exec: async () => {
        this.maybeFail();
        return this.store.get(filter.key ?? '') ?? null;
      },
    };
  }

  updateOne(filter: { key?: string }, update: Record<string, unknown>, options?: { upsert?: boolean }) {
    return {
      exec: async () => {
        this.maybeFail();
        this.upsertCalls += 1; // cuenta TODOS los intentos de escritura (retry incluido)
        const key = filter.key ?? '';
        const existing = this.store.get(key);
        const set = update.$set as Record<string, unknown> | undefined;
        if (existing) {
          if (set?.otpHash !== undefined) existing.otpHash = set.otpHash as string;
          if (set?.expiresAt !== undefined) existing.expiresAt = set.expiresAt as Date;
          if (set?.attempts !== undefined) existing.attempts = set.attempts as number;
          return { modifiedCount: 1 };
        }
        if (!options?.upsert) return { modifiedCount: 0 };
        const dup = (): Error => {
          const error = new Error('E11000 duplicate key error');
          (error as { code?: number }).code = 11000;
          return error;
        };
        // Carrera simulada: otro "proceso" insertó la clave en el ínterin.
        if (this.failNextUpsert) {
          this.failNextUpsert = false;
          this.store.set(key, {
            key,
            otpHash: (set?.otpHash as string) ?? '',
            expiresAt: (set?.expiresAt as Date) ?? new Date(),
            attempts: (set?.attempts as number) ?? 0,
            createdAt: new Date(),
          });
          throw dup();
        }
        this.store.set(key, {
          key,
          otpHash: (set?.otpHash as string) ?? '',
          expiresAt: (set?.expiresAt as Date) ?? new Date(),
          attempts: (set?.attempts as number) ?? 0,
          createdAt: new Date(),
        });
        return { modifiedCount: 1, upsertedCount: 1 };
      },
    };
  }

  findOneAndUpdate(filter: { key?: string; otpHash?: string }, update: { $inc?: Record<string, number> }) {
    return {
      exec: async () => {
        this.maybeFail();
        const doc = this.store.get(filter.key ?? '');
        if (!doc) return null;
        if (filter.otpHash !== undefined && doc.otpHash !== filter.otpHash) return null;
        const inc = update.$inc as Record<string, number> | undefined;
        if (inc?.attempts) doc.attempts += inc.attempts;
        return doc;
      },
    };
  }

  findOneAndDelete(filter: { key?: string; otpHash?: string }) {
    return {
      exec: async () => {
        this.maybeFail();
        const doc = this.store.get(filter.key ?? '');
        if (!doc) return null;
        if (filter.otpHash !== undefined && doc.otpHash !== filter.otpHash) return null;
        this.store.delete(filter.key ?? '');
        return doc;
      },
    };
  }

  deleteOne(filter: { key?: string }) {
    return {
      exec: async () => {
        this.maybeFail();
        this.store.delete(filter.key ?? '');
        return { deletedCount: 1 };
      },
    };
  }
}

/**
 * Modelo Mongoose en memoria del contador de rate-limit (F7B-10.5-B).
 * Emula findOneAndUpdate con $inc/$setOnInsert/$set, upsert, filtros
 * ($lt/$gt/$lte) y E11000 del índice único. Mismas reglas que el fake del
 * spec del módulo otp-rate-limit.
 */
class FakeCounterModel {
  store = new Map<string, { key: string; count: number; expiresAt: Date }>();

  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, options: Record<string, unknown>) {
    return {
      exec: async () => {
        const key = filter.key as string;
        const existing = this.store.get(key);
        const countLt = (filter.count as { $lt?: number } | undefined)?.$lt;
        const expiresGt = (filter.expiresAt as { $gt?: Date } | undefined)?.$gt;
        const expiresLte = (filter.expiresAt as { $lte?: Date } | undefined)?.$lte;
        const upsert = Boolean(options?.upsert);
        const dup = (): Error => {
          const error = new Error('E11000 duplicate key error');
          (error as { code?: number }).code = 11000;
          return error;
        };

        if (!existing) {
          if (!upsert) return null;
          const created = { key, count: 0, expiresAt: new Date() };
          const setOnInsert = update.$setOnInsert as Record<string, unknown> | undefined;
          if (setOnInsert?.expiresAt) created.expiresAt = setOnInsert.expiresAt as Date;
          const inc = update.$inc as Record<string, number> | undefined;
          if (inc) created.count += inc.count ?? 0;
          this.store.set(key, created);
          return created;
        }

        const matches =
          (countLt === undefined || existing.count < countLt) &&
          (expiresGt === undefined || existing.expiresAt > expiresGt) &&
          (expiresLte === undefined || existing.expiresAt <= expiresLte);

        if (matches) {
          const inc = update.$inc as Record<string, number> | undefined;
          if (inc) existing.count += inc.count ?? 0;
          const set = update.$set as Record<string, unknown> | undefined;
          if (set && typeof set.count === 'number') existing.count = set.count;
          if (set?.expiresAt) existing.expiresAt = set.expiresAt as Date;
          this.store.set(key, existing);
          return existing;
        }
        if (upsert) throw dup();
        return null;
      },
    };
  }
}

/**
 * Empleado por defecto ELEGIBLE: documento del votante de prueba dentro del
 * tenant del periodo de prueba (F7B-10.6-A). Los tests de elegibilidad lo
 * reemplazan para simular documento inexistente u otra empresa.
 */
const DEFAULT_EMPLOYEES = [
  {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId('64b0000000000000000000a1'),
    document: VOTER_DOC,
    status: 'Activo',
  },
];

/**
 * Modelo Employee stub con MATCHING del filtro real ({companyId, document,
 * status}): devuelve el empleado solo si coincide con la consulta del
 * servicio, lo que permite probar VOTER-01/02/03 de forma fiel.
 */
function buildEmployeeModel(employees: unknown[] = DEFAULT_EMPLOYEES) {
  return {
    countDocuments: () => ({ exec: async () => 0 }),
    findOne: (filter: { companyId?: { toString(): string }; document?: string; status?: string }) => ({
      exec: async () =>
        employees.find(
          (e) =>
            (e as { companyId?: { toString(): string } }).companyId?.toString() ===
              filter.companyId?.toString() &&
            (e as { document?: string }).document === filter.document &&
            (e as { status?: string }).status === filter.status,
        ) ?? null,
    }),
  };
}

/**
 * Service con dependencias stub (F7B-10.6-D).
 *
 * El parámetro options.challengeModel permite COMPARTIR el store OTP entre
 * varias instancias de servicio (simulación multi-instancia del OTP-DIST).
 */
function buildService(
  seed: CopasstPeriodDocument[] = [],
  employees?: unknown[],
  options?: { challengeModel?: FakeChallengeModel },
) {
  const model = buildModel(seed);
  const employeeModel = buildEmployeeModel(employees) as never;
  const userModel = { find: () => ({ exec: async () => [] }) } as never;
  const alertsService = { create: async () => ({}) } as never;
  const autoCommService = { generateCommunication: async () => ({}) } as never;
  const counterModel = new FakeCounterModel();
  const otpRateLimitService = new OtpRateLimitService(counterModel as never);
  const challengeModel = options?.challengeModel ?? new FakeChallengeModel();
  const otpChallengeService = new OtpChallengeService(challengeModel as never);
  const service = new CopasstService(
    model as never,
    employeeModel,
    userModel,
    alertsService,
    autoCommService,
    otpRateLimitService,
    otpChallengeService,
  );
  return { service, model, counterModel, challengeModel };
}

/**
 * Instala un hasher de prueba REVERSIBLE ('ab' + código) para poder recuperar
 * el OTP interno sin exponerlo por la API (producción usa HMAC-SHA256).
 */
function installTestOtpHasher(service: CopasstService) {
  (service as unknown as { otpHasher: (code: string) => string }).otpHasher = (code: string) =>
    `ab${code}`;
}

/**
 * Acceso al store COMPARTIDO del servicio (F7B-10.6-D): el OtpChallengeService
 * inyectado guarda los desafíos en el FakeChallengeModel compartido.
 */
function challengeStoreOf(service: CopasstService) {
  const challengeService = (
    service as unknown as { otpChallengeService: OtpChallengeService }
  ).otpChallengeService;
  return (
    challengeService as unknown as { model: FakeChallengeModel }
  ).model;
}

/** Recupera el OTP vigente de una clave (requiere el hasher de prueba). */
function otpCodeOf(service: CopasstService, key: string): string {
  const doc = challengeStoreOf(service).store.get(key);
  const hash = doc?.otpHash ?? '';
  return hash.startsWith('ab') ? hash.slice(2) : '';
}

/** Lectura directa de un desafío del store compartido (shape/intentos). */
function otpEntryOf(service: CopasstService, key: string) {
  return challengeStoreOf(service).store.get(key);
}

/**
 * Siembra directamente un desafío OTP válido en el store COMPARTIDO
 * (F7B-10.6-C/D). Permite probar escenarios donde el OTP NO puede generarse
 * por el gate de estado (NOT_STARTED/CLOSED) pero debe simularse un OTP
 * generado previamente. Usa el hasher de prueba ('ab'+código).
 */
function seedOtp(service: CopasstService, key: string, code = '123456') {
  challengeStoreOf(service).store.set(key, {
    key,
    otpHash: `ab${code}`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    createdAt: new Date(),
  });
}

const VOTE_PAYLOAD = {
  electionId: ELECTION_A,
  document: VOTER_DOC,
  phone: PHONE,
  candidateDocument: CANDIDATE_DOC,
};

describe('F7B-10.1 (COPASST) — OTP seguro del flujo electoral', () => {
  it('CP10-01: sendOtp genera internamente un OTP de 6 dígitos con crypto (Math.random NO participa)', async () => {
    const { service } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    // Trampa: si sendOtp usara Math.random, esto lanzaría.
    const originalRandom = Math.random;
    Math.random = () => {
      throw new Error('Math.random no debe usarse para generar OTP');
    };
    try {
      await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    } finally {
      Math.random = originalRandom;
    }
    const code = otpCodeOf(service, OTP_KEY);
    assert.match(code, /^\d{6}$/);
    assert.ok(Number(code) >= 100000 && Number(code) <= 999999);
  });

  it('CP10-02: la respuesta de sendOtp NO contiene otpPreview', async () => {
    const { service } = buildService([buildPeriod()]);
    const resp = (await service.sendOtp({
      electionId: ELECTION_A,
      document: VOTER_DOC,
      phone: PHONE,
    })) as Record<string, unknown>;
    assert.equal(resp.sent, true);
    assert.ok(!('otpPreview' in resp));
  });

  it('CP10-03: la respuesta NO contiene otp/code/secret/otpHash (incluida la serialización)', async () => {
    const { service } = buildService([buildPeriod()]);
    const resp = (await service.sendOtp({
      electionId: ELECTION_A,
      document: VOTER_DOC,
      phone: PHONE,
    })) as Record<string, unknown>;
    for (const key of ['otp', 'otpPreview', 'code', 'secret', 'otpHash', 'hash']) {
      assert.ok(!(key in resp), `no debe exponer '${key}'`);
    }
    const serialized = JSON.stringify(resp);
    assert.ok(!serialized.includes('otpPreview'));
    assert.ok(!serialized.includes('otpHash'));
  });

  it('CP10-04: OTP correcto permite continuar el voto', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  it('CP10-05: OTP incorrecto rechaza', async () => {
    const { service } = buildService([buildPeriod()]);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('CP10-06: OTP incorrecto incrementa attempts', async () => {
    const { service } = buildService([buildPeriod()]);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(() => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }), () => true);
    assert.equal(otpEntryOf(service, OTP_KEY)?.attempts, 1);
  });

  it('CP10-07: el quinto intento incorrecto invalida el OTP', async () => {
    const { service } = buildService([buildPeriod()]);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
        (error: Error) => error instanceof BadRequestException,
      );
    }
    assert.equal(otpEntryOf(service, OTP_KEY), undefined);
  });

  it('CP10-08: OTP agotado no puede reutilizarse (ni con el código correcto)', async () => {
    const { service } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const correct = otpCodeOf(service, OTP_KEY);
    for (let i = 0; i < 5; i++) {
      await assert.rejects(() => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }), () => true);
    }
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: correct }),
      (error: Error) => error instanceof BadRequestException,
    );
  });

  it('CP10-09: OTP expirado rechaza', async () => {
    const { service } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const correct = otpCodeOf(service, OTP_KEY);
    const entry = otpEntryOf(service, OTP_KEY);
    assert.ok(entry);
    entry.expiresAt = new Date(Date.now() - 1000); // forzar expiración
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: correct }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    // El OTP expirado se elimina del store.
    assert.equal(otpEntryOf(service, OTP_KEY), undefined);
  });

  it('CP10-10: OTP utilizado correctamente queda invalidado (segundo uso rechazado)', async () => {
    const { service } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const code = otpCodeOf(service, OTP_KEY);
    await service.vote({ ...VOTE_PAYLOAD, otpCode: code });
    assert.equal(otpEntryOf(service, OTP_KEY), undefined);
    // Un segundo voto con el mismo OTP (aunque el documento ya votó) se rechaza
    // en la barrera del OTP (invalidado).
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: code }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('CP10-11: un nuevo sendOtp invalida el OTP anterior', async () => {
    const { service } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const first = otpCodeOf(service, OTP_KEY);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const second = otpCodeOf(service, OTP_KEY);
    assert.notEqual(first, second);
    // El anterior deja de funcionar.
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: first }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('CP10-12: el nuevo OTP funciona correctamente', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const second = otpCodeOf(service, OTP_KEY);
    const result = await service.vote({ ...VOTE_PAYLOAD, otpCode: second });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  it('CP10-13: el store NO conserva el OTP en texto plano (solo verificador HMAC)', async () => {
    const { service } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const entry = otpEntryOf(service, OTP_KEY);
    assert.ok(entry, 'la entrada debe existir');
    assert.ok(!('code' in entry), 'no debe existir el campo code');
    assert.ok(!('otp' in entry), 'no debe existir el campo otp');
    // En producción el hash es HMAC-SHA256 (64 hex); con el hasher de prueba
    // es 'ab'+código, pero NUNCA el código plano por sí solo.
    assert.notEqual(entry.otpHash, otpCodeOf(service, OTP_KEY));
  });

  it('CP10-14: la comparación del OTP usa la comparación timing-safe (otpHashesEqual)', async () => {
    const { service } = buildService([buildPeriod()]);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    // Sombrea el wrapper de comparación del servicio (implementado con
    // crypto.timingSafeEqual) para probar que el flujo de voto pasa por la
    // comparación timing-safe y no por una comparación directa de strings.
    const serviceAny = service as unknown as {
      otpHashesEqual: (a: string, b: string) => boolean;
    };
    const originalCompare = serviceAny.otpHashesEqual;
    let calls = 0;
    serviceAny.otpHashesEqual = (a, b) => {
      calls += 1;
      return originalCompare(a, b);
    };
    try {
      await assert.rejects(
        () => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
        (error: Error) => error instanceof BadRequestException,
      );
      assert.ok(calls > 0, 'otpHashesEqual (timing-safe) debe invocarse');
    } finally {
      serviceAny.otpHashesEqual = originalCompare;
    }
  });

  it('CP10-15: regresión — el flujo existente sendOtp → vote continúa funcionando', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    const otp = (await service.sendOtp({
      electionId: ELECTION_A,
      document: VOTER_DOC,
      phone: PHONE,
    })) as Record<string, unknown>;
    assert.equal(otp.sent, true);
    const result = await service.vote({
      ...VOTE_PAYLOAD,
      otpCode: otpCodeOf(service, OTP_KEY),
    });
    assert.equal((result as { success: boolean }).success, true);
    assert.equal((result as { message: string }).message, 'Voto registrado exitosamente');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    const votes = stored.votesExtended as Array<{
      document: string;
      candidateDocument: string;
      otpValidated: boolean;
    }>;
    assert.equal(votes.length, 1);
    assert.equal(votes[0].document, VOTER_DOC);
    assert.equal(votes[0].candidateDocument, CANDIDATE_DOC);
    assert.equal(votes[0].otpValidated, true);
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 1);
  });
});

describe('F7B-10.2 (COPASST) — Privacidad de resultados y rate-limit OTP', () => {
  /** Periodo con candidatos aprobados + votos para calcular resultados. */
  function resultsPeriod(): CopasstPeriodDocument {
    return buildPeriod({
      // F7B-10.6-C: los resultados solo se publican con la elección CLOSED.
      electionState: 'CLOSED',
      candidateExtended: [
        {
          name: 'Candidato 1',
          document: CANDIDATE_DOC,
          phone: '5551111',
          email: 'c1@empresa.com',
          area: 'Producción',
          position: 'Operario',
          motivation: 'Quiero servir al comité',
          adminStatus: 'APROBADO',
          votes: 2,
        },
        {
          name: 'Candidato 2',
          document: '222',
          phone: '5552222',
          email: 'c2@empresa.com',
          area: 'Ventas',
          position: 'Asesor',
          motivation: 'Participar',
          adminStatus: 'APROBADO',
          votes: 1,
        },
        {
          name: 'Candidato 3',
          document: '333',
          phone: '5553333',
          email: 'c3@empresa.com',
          area: 'RRHH',
          position: 'Analista',
          motivation: 'Sumar',
          adminStatus: 'PENDIENTE',
          votes: 3,
        },
      ] as never,
      votesExtended: [
        { document: '1001', candidateDocument: CANDIDATE_DOC, otpValidated: true, votedAt: new Date() },
        { document: '1002', candidateDocument: CANDIDATE_DOC, otpValidated: true, votedAt: new Date() },
        { document: '1003', candidateDocument: '222', otpValidated: true, votedAt: new Date() },
      ] as never,
    });
  }

  it('CP10.2-01/02/03: el resultado NO contiene document ni phone ni email', async () => {
    const { service } = buildService([resultsPeriod()]);
    const result = (await service.getVotingResults(ELECTION_A)) as Record<string, unknown>;
    const ranking = result.ranking as Array<Record<string, unknown>>;
    assert.ok(ranking.length > 0, 'debe haber ranking');
    for (const entry of ranking) {
      assert.ok(!('document' in entry), 'ranking[] no debe contener document');
      assert.ok(!('phone' in entry), 'ranking[] no debe contener phone');
      assert.ok(!('email' in entry), 'ranking[] no debe contener email');
    }
  });

  it('CP10.2-04/05: el resultado NO contiene candidateDocument ni votesExtended', async () => {
    const { service } = buildService([resultsPeriod()]);
    const result = (await service.getVotingResults(ELECTION_A)) as Record<string, unknown>;
    assert.ok(!('votesExtended' in result), 'response no debe contener votesExtended');
    assert.ok(!('candidateDocument' in result), 'response no debe contener candidateDocument');
    for (const entry of (result.ranking as Array<Record<string, unknown>>)) {
      assert.ok(!('candidateDocument' in entry));
    }
  });

  it('CP10.2-06: el resultado NO contiene otp/otpPreview/otpHash/token', async () => {
    const { service } = buildService([resultsPeriod()]);
    const result = (await service.getVotingResults(ELECTION_A)) as Record<string, unknown>;
    const serialized = JSON.stringify(result);
    for (const forbidden of ['otp', 'otpPreview', 'otpHash', 'token']) {
      assert.ok(!serialized.includes(forbidden), `no debe contener ${forbidden}`);
    }
  });

  it('CP10.2-07: el resultado conserva los campos funcionales necesarios', async () => {
    const { service } = buildService([resultsPeriod()]);
    const result = (await service.getVotingResults(ELECTION_A)) as Record<string, unknown>;
    assert.equal(result.totalVotes, 3);
    assert.equal(result.totalEmployees, 0);
    assert.equal(result.participation, 0);
    const winners = result.winners as Array<Record<string, unknown>>;
    const ranking = result.ranking as Array<Record<string, unknown>>;
    assert.equal(winners.length, 2);
    assert.equal(ranking.length, 3);
    // Cada entrada tiene exactamente rank/name/votes/status. La igualdad
    // estricta a 4 claves es una GUARDIA DE PRIVACIDAD deliberada: si una fase
    // futura agrega un campo público legítimo, este test obliga a revisarlo
    // explícitamente (evita fugas silenciosas de PII por adición).
    for (const entry of ranking) {
      assert.ok('rank' in entry && 'name' in entry && 'votes' in entry && 'status' in entry);
      assert.equal(Object.keys(entry).length, 4, 'solo rank/name/votes/status');
    }
    // Ranking ordenado por votos desc (Candidato 3 con 3 votos primero).
    assert.equal(ranking[0].name, 'Candidato 3');
    assert.equal(ranking[0].status, 'PENDIENTE');
  });

  it('CP10.2-08: la serialización JSON tampoco expone PII de candidatos', async () => {
    const { service } = buildService([resultsPeriod()]);
    const result = await service.getVotingResults(ELECTION_A);
    const serialized = JSON.stringify(result);
    // El documento de candidato usado internamente NO termina en el response.
    assert.ok(!serialized.includes('5551111'), 'no phone');
    assert.ok(!serialized.includes('c1@empresa.com'), 'no email');
    assert.ok(!serialized.includes('Quiero servir al comité'), 'no motivation');
    assert.ok(!serialized.includes('Producción'), 'no area');
    assert.ok(!serialized.includes('Operario'), 'no position');
    assert.ok(!serialized.includes('votesExtended'), 'no votesExtended');
  });

  it('CP10.2-09: periodo inexistente en resultados → NotFound (comportamiento controlado)', async () => {
    const { service } = buildService([resultsPeriod()]);
    await assert.rejects(
      () => service.getVotingResults('64b0000000000000000000ff'),
      (error: Error) => error instanceof BadRequestException || error instanceof NotFoundException,
    );
  });

  it('CP10.2-10: regresión — el flujo completo de resultados funciona con el nuevo DTO', async () => {
    const { service } = buildService([resultsPeriod()]);
    const result = (await service.getVotingResults(ELECTION_A)) as Record<string, unknown>;
    const winners = result.winners as Array<Record<string, unknown>>;
    const alternates = result.alternates as Array<Record<string, unknown>>;
    // Ganadores: los 2 APROBADO con más votos (Candidato 1 con 2, Candidato 2 con 1).
    assert.equal(winners[0].name, 'Candidato 1');
    assert.equal(winners[0].rank, 1);
    assert.equal(winners[1].name, 'Candidato 2');
    assert.equal(alternates.length, 0);
    assert.equal((result.ranking as Array<Record<string, unknown>>).length, 3);
  });

  // ─── RATE-LIMIT (F7B-10.2, mismo patrón que Convivencia F7B-2) ───

  it('CP10.2-11: rate-limit permite hasta 3 solicitudes de OTP dentro de la ventana', async () => {
    const { service } = buildService([buildPeriod()]);
    for (let i = 0; i < 3; i++) {
      const resp = (await service.sendOtp({
        electionId: ELECTION_A,
        document: VOTER_DOC,
        phone: PHONE,
      })) as Record<string, unknown>;
      assert.equal(resp.sent, true);
    }
  });

  it('CP10.2-12: la cuarta solicitud dentro de la ventana es rechazada', async () => {
    const { service } = buildService([buildPeriod()]);
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    }
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('Demasiadas solicitudes de OTP'),
    );
  });

  it('CP10.2-13: el rate-limit NO afecta a otro votante ni a otra elección', async () => {
    const { service } = buildService([buildPeriod()]);
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    }
    // Otra combinación de documento+teléfono (misma elección): sin límite.
    const other = (await service.sendOtp({
      electionId: ELECTION_A,
      document: '333',
      phone: '777',
    })) as Record<string, unknown>;
    assert.equal(other.sent, true);
    // Otra elección (mismo votante): sin límite. F7B-10.6-C: sendOtp exige una
    // elección OPEN existente, por lo que la segunda elección se siembra en el
    // store (misma garantía de aislamiento por clave electionId:document:phone).
    const { service: serviceB } = buildService([
      buildPeriod(),
      buildPeriod({ _id: new Types.ObjectId('64b0000000000000000000bb') }),
    ]);
    const otherElection = (await serviceB.sendOtp({
      electionId: '64b0000000000000000000bb',
      document: VOTER_DOC,
      phone: PHONE,
    })) as Record<string, unknown>;
    assert.equal(otherElection.sent, true);
  });

  it('CP10.2-14: el rate-limit usa clave electionId:document:phone (sin companyId del cliente)', async () => {
    const { service } = buildService([buildPeriod()]);
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    }
    // Un payload con companyId manipulado NO elude el rate-limit (la clave no
    // lo usa) y tampoco lo hace aceptar más solicitudes de la misma clave.
    await assert.rejects(
      () =>
        service.sendOtp({
          electionId: ELECTION_A,
          document: VOTER_DOC,
          phone: PHONE,
          companyId: '64b0000000000000000000b1',
        } as never),
      (error: Error) => error instanceof BadRequestException,
    );
  });

  it('CP10.2-15: el rate-limit es independiente de los intentos del OTP vigente', async () => {
    const { service } = buildService([buildPeriod()]);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    // Intentos fallidos del OTP NO consumen cuota de rate-limit de solicitudes.
    for (let i = 0; i < 3; i++) {
      await assert.rejects(
        () => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
        (error: Error) => error instanceof BadRequestException,
      );
    }
    // Todavía quedan 2 solicitudes disponibles en la ventana (3 - 1 usada).
    const resp = (await service.sendOtp({
      electionId: ELECTION_A,
      document: VOTER_DOC,
      phone: PHONE,
    })) as Record<string, unknown>;
    assert.equal(resp.sent, true);
  });

  it('CP10.2-16: el rate-limit expira de forma lógica (la ventana se reabre)', async () => {
    const { service, counterModel } = buildService([buildPeriod()]);
    // Llenar la ventana (3 solicitudes) → la cuarta dentro de la ventana se rechaza.
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    }
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) => error instanceof BadRequestException,
    );
    // Expirar la ventana de forma lógica: expiresAt del contador en el pasado.
    const counter = counterModel.store.get(OTP_KEY);
    assert.ok(counter, 'el contador distribuido debe existir');
    counter.expiresAt = new Date(Date.now() - 1000);
    // Con la ventana vencida, la siguiente solicitud reabre una ventana nueva.
    const resp = (await service.sendOtp({
      electionId: ELECTION_A,
      document: VOTER_DOC,
      phone: PHONE,
    })) as Record<string, unknown>;
    assert.equal(resp.sent, true);
    // La nueva ventana inició en count=1 (la solicitud actual es la primera).
    assert.equal(counterModel.store.get(OTP_KEY)?.count, 1);
  });

  it('RL-MONGO-12: MAX_OTP_ATTEMPTS=5 continúa intacto e independiente del rate-limit', async () => {
    const { service, counterModel } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    // Una solicitud de OTP: el contador del rate-limit queda en 1.
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    assert.equal(counterModel.store.get(OTP_KEY)?.count, 1);
    // 5 intentos fallidos de validación agotan el OTP (MAX_OTP_ATTEMPTS=5).
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
        (error: Error) => error instanceof BadRequestException,
      );
    }
    assert.equal(otpEntryOf(service, OTP_KEY), undefined, 'el OTP se invalida al agotar intentos');
    // Los intentos de validación NO consumen cuota del rate-limit (mecanismos
    // independientes): el contador sigue en 1 (3 - 1 = 2 solicitudes restantes).
    assert.equal(counterModel.store.get(OTP_KEY)?.count, 1);
    // Y aún quedan solicitudes disponibles en la ventana.
    const resp = (await service.sendOtp({
      electionId: ELECTION_A,
      document: VOTER_DOC,
      phone: PHONE,
    })) as Record<string, unknown>;
    assert.equal(resp.sent, true);
  });
});

describe('F7B-10.6-A (COPASST) — Elegibilidad del votante, candidato y registro público', () => {
  const CAMPAIGN_TOKEN = 'F7B10-6A-campaign-token';

  /** Periodo con campaña de inscripción activa para el registro público. */
  function buildRegistrationPeriod(overrides: Record<string, unknown> = {}): CopasstPeriodDocument {
    return {
      _id: new Types.ObjectId('64b0000000000000000000cc'),
      companyId: new Types.ObjectId('64b0000000000000000000a1'),
      periodName: 'COPASST Campaña',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      status: 'ACTIVO',
      registrationCampaign: {
        openingDate: new Date(Date.now() - 86400000),
        closingDate: new Date(Date.now() + 30 * 86400000),
        includedDepartments: [],
        requirements: [],
        secureToken: CAMPAIGN_TOKEN,
        isActive: true,
        adminNotes: '',
      },
      candidateExtended: [] as never,
      votesExtended: [] as never,
      save: async function () {
        return this as unknown as CopasstPeriodDocument;
      },
      ...overrides,
    } as unknown as CopasstPeriodDocument;
  }

  /** Modelo cuyo findOne(secureToken) devuelve el periodo de campaña. */
  function buildRegistrationModel(period: CopasstPeriodDocument) {
    const id = (period._id as Types.ObjectId).toString();
    const store = new Map<string, CopasstPeriodDocument>([[id, period]]);
    return {
      store,
      findById: (findId: Types.ObjectId) => ({
        exec: async () => store.get(findId.toString()) ?? null,
      }),
      findOne: () => ({ exec: async () => period }),
      create: async () => {
        throw new Error('no usado en F7B-10.6-A');
      },
    };
  }

  function buildRegistrationService(period: CopasstPeriodDocument) {
    const model = buildRegistrationModel(period);
    const employeeModel = buildEmployeeModel() as never;
    const userModel = { find: () => ({ exec: async () => [] }) } as never;
    const alertsService = { create: async () => ({}) } as never;
    const autoCommService = { generateCommunication: async () => ({}) } as never;
    const counterModel = new FakeCounterModel();
    const otpRateLimitService = new OtpRateLimitService(counterModel as never);
    const otpChallengeService = new OtpChallengeService(new FakeChallengeModel() as never);
    const service = new CopasstService(
      model as never,
      employeeModel,
      userModel,
      alertsService,
      autoCommService,
      otpRateLimitService,
      otpChallengeService,
    );
    return { service, model, counterModel };
  }

  const REG_PAYLOAD = {
    name: 'Candidato Público',
    document: '999-REG',
    phone: '555-REG',
    area: 'Producción',
    position: 'Operario',
    motivation: 'Quiero participar',
    acceptedTerms: true,
  };

  // ─── VOTER ELIGIBILITY ───

  it('VOTER-ELIGIBILITY-01: Employee inexistente → voto rechazado sin incrementar nada', async () => {
    const { service, model } = buildService([buildPeriod()], []);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('Documento no elegible para esta elección'),
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0, 'sin votesExtended');
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 0, 'sin incremento de votes');
  });

  it('VOTER-ELIGIBILITY-02: Employee de OTRA empresa → rechazado con mensaje genérico', async () => {
    const otherCompanyEmployee = [
      {
        _id: new Types.ObjectId(),
        companyId: new Types.ObjectId('64b0000000000000000000ff'),
        document: VOTER_DOC,
        status: 'Activo',
      },
    ];
    const { service } = buildService([buildPeriod()], otherCompanyEmployee);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    // El error NO revela que el documento pertenece a otra empresa.
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message === 'Documento no elegible para esta elección',
    );
  });

  it('VOTER-ELIGIBILITY-03: Employee válido del MISMO tenant → el flujo continúa', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  // ─── CANDIDATE ELIGIBILITY ───

  it('CANDIDATE-ELIGIBILITY-01: adminStatus=PENDIENTE → voto rechazado', async () => {
    const period = buildPeriod({
      candidateExtended: [
        {
          name: 'Candidato 1',
          document: CANDIDATE_DOC,
          phone: '555',
          area: 'X',
          position: 'Y',
          motivation: 'Z',
          adminStatus: 'PENDIENTE',
          votes: 0,
        },
      ] as never,
    });
    const { service } = buildService([period]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('El candidato no está habilitado para la votación'),
    );
  });

  it('CANDIDATE-ELIGIBILITY-02: adminStatus=APROBADO → el flujo continúa', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  it('CANDIDATE-ELIGIBILITY-03: candidato rechazado NO incrementa votes', async () => {
    const period = buildPeriod({
      candidateExtended: [
        {
          name: 'Candidato 1',
          document: CANDIDATE_DOC,
          phone: '555',
          area: 'X',
          position: 'Y',
          motivation: 'Z',
          adminStatus: 'PENDIENTE',
          votes: 0,
        },
      ] as never,
    });
    const { service, model } = buildService([period]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      () => true,
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 0, 'votes debe permanecer en 0');
  });

  it('CANDIDATE-ELIGIBILITY-04: candidato INFO_REQUESTED tampoco es votable', async () => {
    const period = buildPeriod({
      candidateExtended: [
        {
          name: 'Candidato 1',
          document: CANDIDATE_DOC,
          phone: '555',
          area: 'X',
          position: 'Y',
          motivation: 'Z',
          adminStatus: 'INFO_REQUESTED',
          votes: 0,
        },
      ] as never,
    });
    const { service, model } = buildService([period]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('El candidato no está habilitado para la votación'),
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0, 'sin votesExtended');
  });

  it('CANDIDATE-ELIGIBILITY-05: candidato RECHAZADO NO agrega votesExtended', async () => {
    const period = buildPeriod({
      candidateExtended: [
        {
          name: 'Candidato 1',
          document: CANDIDATE_DOC,
          phone: '555',
          area: 'X',
          position: 'Y',
          motivation: 'Z',
          adminStatus: 'RECHAZADO',
          votes: 0,
        },
      ] as never,
    });
    const { service, model } = buildService([period]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      () => true,
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0, 'sin votesExtended');
  });

  // ─── REGISTRATION RATE-LIMIT ───

  it('REGISTRATION-RL-01: primera solicitud de registro permitida', async () => {
    const { service } = buildRegistrationService(buildRegistrationPeriod());
    const resp = (await service.registerCandidatePublic(CAMPAIGN_TOKEN, {
      ...REG_PAYLOAD,
    })) as { success: boolean };
    assert.equal(resp.success, true);
  });

  it('REGISTRATION-RL-02: solicitudes dentro del límite NO se rechazan por rate-limit', async () => {
    const { service, counterModel, model } = buildRegistrationService(buildRegistrationPeriod());
    const period = model.store.get('64b0000000000000000000cc') as CopasstPeriodDocument;
    const key = `registration:${period._id.toString()}:${REG_PAYLOAD.document}`;
    // 5 solicitudes de la misma identidad: la 1ª se acepta; las siguientes
    // chocan con la regla de negocio (documento duplicado), NUNCA con el
    // rate-limit (todas están dentro de la cuota).
    let rateLimited = false;
    for (let i = 0; i < REGISTRATION_RATE_LIMIT_MAX; i++) {
      try {
        await service.registerCandidatePublic(CAMPAIGN_TOKEN, { ...REG_PAYLOAD });
      } catch (error) {
        if ((error as Error).message.includes('Demasiadas solicitudes')) rateLimited = true;
      }
    }
    assert.equal(rateLimited, false, 'ninguna solicitud dentro del límite debe ser rate-limitada');
    assert.equal(counterModel.store.get(key)?.count, REGISTRATION_RATE_LIMIT_MAX);
  });

  it('REGISTRATION-RL-03: solicitud excediendo el límite es rechazada y el contador NO se incrementa', async () => {
    const { service, counterModel, model } = buildRegistrationService(buildRegistrationPeriod());
    const period = model.store.get('64b0000000000000000000cc') as CopasstPeriodDocument;
    const key = `registration:${period._id.toString()}:${REG_PAYLOAD.document}`;
    for (let i = 0; i < REGISTRATION_RATE_LIMIT_MAX; i++) {
      try {
        await service.registerCandidatePublic(CAMPAIGN_TOKEN, { ...REG_PAYLOAD });
      } catch {
        // duplicado: esperado dentro del límite
      }
    }
    await assert.rejects(
      () => service.registerCandidatePublic(CAMPAIGN_TOKEN, { ...REG_PAYLOAD }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Demasiadas solicitudes'),
    );
    assert.equal(counterModel.store.get(key)?.count, REGISTRATION_RATE_LIMIT_MAX);
  });

  it('REGISTRATION-RL-04: campañas/identidades diferentes no interfieren', async () => {
    const { service, counterModel, model } = buildRegistrationService(buildRegistrationPeriod());
    const period = model.store.get('64b0000000000000000000cc') as CopasstPeriodDocument;
    const keyA = `registration:${period._id.toString()}:${REG_PAYLOAD.document}`;
    // Agotar la cuota de la identidad A.
    for (let i = 0; i < REGISTRATION_RATE_LIMIT_MAX; i++) {
      try {
        await service.registerCandidatePublic(CAMPAIGN_TOKEN, { ...REG_PAYLOAD });
      } catch {
        // duplicado dentro del límite
      }
    }
    await assert.rejects(
      () => service.registerCandidatePublic(CAMPAIGN_TOKEN, { ...REG_PAYLOAD }),
      () => true,
    );
    // Otro documento en la misma campaña → clave distinta → permitido.
    const otherDoc = (await service.registerCandidatePublic(CAMPAIGN_TOKEN, {
      ...REG_PAYLOAD,
      document: '999-REG-OTHER',
    })) as { success: boolean };
    assert.equal(otherDoc.success, true);
    // Otra campaña (otro periodo _id) con el mismo documento → la clave
    // incluye el periodId, por lo que no comparte contador con la campaña A.
    const periodB = buildRegistrationPeriod({ _id: new Types.ObjectId('64b0000000000000000000dd') });
    const { service: serviceB } = buildRegistrationService(periodB);
    const respB = (await serviceB.registerCandidatePublic(CAMPAIGN_TOKEN, {
      ...REG_PAYLOAD,
    })) as { success: boolean };
    assert.equal(respB.success, true);
    assert.equal(counterModel.store.get(keyA)?.count, REGISTRATION_RATE_LIMIT_MAX);
  });

  it('REGISTRATION-RL-05: no existe Map<string, number[]> para rate-limit en el service', async () => {
    const { service } = buildRegistrationService(buildRegistrationPeriod());
    const anyService = service as unknown as Record<string, unknown>;
    assert.equal(anyService.otpRequestLog, undefined, 'no debe existir otpRequestLog (Map)');
    assert.equal(anyService.registrationRequestLog, undefined);
  });

  // ─── SECURE TOKEN ───

  it('TOKEN-01: el nuevo secureToken se genera con fuente criptográficamente segura (64 hex)', async () => {
    const { service } = buildService([buildPeriod({ auditHistory: [] as never })]);
    const result = (await service.startRegistrationCampaign(
      COMPANY_A,
      ELECTION_A,
      {
        openingDate: new Date().toISOString(),
        closingDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      'test@test.com',
    )) as { secureToken: string };
    assert.match(result.secureToken, /^[0-9a-f]{64}$/);
  });

  it('TOKEN-02: dos secureToken consecutivos son distintos', async () => {
    const { service } = buildService([buildPeriod({ auditHistory: [] as never })]);
    const dto = {
      openingDate: new Date().toISOString(),
      closingDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    };
    const first = (await service.startRegistrationCampaign(COMPANY_A, ELECTION_A, dto, 'test@test.com')) as {
      secureToken: string;
    };
    const second = (await service.startRegistrationCampaign(COMPANY_A, ELECTION_A, dto, 'test@test.com')) as {
      secureToken: string;
    };
    assert.notEqual(first.secureToken, second.secureToken);
  });

  it('TOKEN-03: el secureToken no usa ObjectId/timestamp (sin guiones, 64 hex)', async () => {
    const { service } = buildService([buildPeriod({ auditHistory: [] as never })]);
    const result = (await service.startRegistrationCampaign(
      COMPANY_A,
      ELECTION_A,
      {
        openingDate: new Date().toISOString(),
        closingDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      'test@test.com',
    )) as { secureToken: string };
    // El patrón legacy era `${ObjectId}-${base36}` (siempre contiene '-').
    assert.ok(!result.secureToken.includes('-'), 'no debe contener el separador del patrón legacy');
    assert.equal(result.secureToken.length, 64);
  });
});

describe('F7B-10.6-B (COPASST) — Atomicidad, doble voto y lost updates', () => {
  const VOTER2_DOC = '333';
  const PHONE_ALT = '667'; // segundo teléfono del MISMO votante (clave OTP distinta)
  const PHONE2 = '777'; // teléfono del segundo votante

  /** Dos empleados elegibles del mismo tenant (votante 1 y votante 2). */
  const EMPLOYEES_TWO = [
    {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId('64b0000000000000000000a1'),
      document: VOTER_DOC,
      status: 'Activo',
    },
    {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId('64b0000000000000000000a1'),
      document: VOTER2_DOC,
      status: 'Activo',
    },
  ];

  /** Periodo con dos candidatos APROBADOS (para concurrencia entre candidatos). */
  function dualCandidatePeriod(): CopasstPeriodDocument {
    return buildPeriod({
      candidateExtended: [
        {
          name: 'Candidato 1', document: CANDIDATE_DOC, phone: '555', area: 'X',
          position: 'Y', motivation: 'Z', adminStatus: 'APROBADO', votes: 0,
        },
        {
          name: 'Candidato 2', document: '444', phone: '556', area: 'X',
          position: 'Y', motivation: 'Z', adminStatus: 'APROBADO', votes: 0,
        },
      ] as never,
    });
  }

  const VOTE1 = (otp: string) => ({
    electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE,
    otpCode: otp, candidateDocument: CANDIDATE_DOC,
  });

  it('ATOMIC-01: voto normal exitoso persiste voto + contador', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote(VOTE1(otpCodeOf(service, OTP_KEY)));
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 1);
  });

  it('ATOMIC-02: segundo voto secuencial del mismo documento → rechazado sin incrementar', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.vote(VOTE1(otpCodeOf(service, OTP_KEY)));
    // OTP nuevo con OTRO teléfono (misma identidad document) para superar la
    // barrera OTP y probar la garantía de voto único (no el reuso de OTP).
    const key2 = `${ELECTION_A}:${VOTER_DOC}:${PHONE_ALT}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT });
    await assert.rejects(
      () =>
        service.vote({
          electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT,
          otpCode: otpCodeOf(service, key2), candidateDocument: CANDIDATE_DOC,
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('El trabajador ya votó'),
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1, 'solo un voto persistido');
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 1, 'sin doble incremento');
  });

  it('ATOMIC-03: dos votantes distintos sobre el mismo candidato → +2', async () => {
    const { service, model } = buildService([buildPeriod()], EMPLOYEES_TWO);
    installTestOtpHasher(service);
    const keyA = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;
    const keyB = `${ELECTION_A}:${VOTER2_DOC}:${PHONE2}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2 });
    await service.vote(VOTE1(otpCodeOf(service, keyA)));
    await service.vote({
      electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2,
      otpCode: otpCodeOf(service, keyB), candidateDocument: CANDIDATE_DOC,
    });
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 2);
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 2, 'contador = +2 sin lost update');
  });

  it('ATOMIC-04: dos votos concurrentes del mismo documento → solo uno persiste', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    const keyA = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;
    const keyB = `${ELECTION_A}:${VOTER_DOC}:${PHONE_ALT}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT });
    const results = await Promise.allSettled([
      service.vote(VOTE1(otpCodeOf(service, keyA))),
      service.vote({
        electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT,
        otpCode: otpCodeOf(service, keyB), candidateDocument: CANDIDATE_DOC,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactamente UN voto debe persistir');
    assert.equal(rejected.length, 1, 'el segundo voto simultáneo debe rechazarse');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 1);
  });

  it('ATOMIC-05: dos votos concurrentes de documentos distintos sobre el mismo candidato → +2', async () => {
    const { service, model } = buildService([buildPeriod()], EMPLOYEES_TWO);
    installTestOtpHasher(service);
    const keyA = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;
    const keyB = `${ELECTION_A}:${VOTER2_DOC}:${PHONE2}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2 });
    const results = await Promise.allSettled([
      service.vote(VOTE1(otpCodeOf(service, keyA))),
      service.vote({
        electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2,
        otpCode: otpCodeOf(service, keyB), candidateDocument: CANDIDATE_DOC,
      }),
    ]);
    assert.equal(results.every((r) => r.status === 'fulfilled'), true, 'ambos votos deben persistir');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 2);
    const candidate = (stored.candidateExtended as Array<{ document: string; votes: number }>).find(
      (c) => c.document === CANDIDATE_DOC,
    );
    assert.equal(candidate?.votes, 2, 'contador = +2 sin lost update concurrente');
  });

  it('ATOMIC-06: dos votos concurrentes sobre candidatos diferentes → ambos persisten', async () => {
    const { service, model } = buildService([dualCandidatePeriod()], EMPLOYEES_TWO);
    installTestOtpHasher(service);
    const keyA = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;
    const keyB = `${ELECTION_A}:${VOTER2_DOC}:${PHONE2}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2 });
    const results = await Promise.allSettled([
      service.vote(VOTE1(otpCodeOf(service, keyA))),
      service.vote({
        electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2,
        otpCode: otpCodeOf(service, keyB), candidateDocument: '444',
      }),
    ]);
    assert.equal(results.every((r) => r.status === 'fulfilled'), true, 'ambos votos deben persistir');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 2);
    const candidates = stored.candidateExtended as Array<{ document: string; votes: number }>;
    assert.equal(candidates.find((c) => c.document === CANDIDATE_DOC)?.votes, 1);
    assert.equal(candidates.find((c) => c.document === '444')?.votes, 1);
  });

  for (const status of ['PENDIENTE', 'RECHAZADO', 'INFO_REQUESTED']) {
    const n = { PENDIENTE: '07', RECHAZADO: '08', INFO_REQUESTED: '09' }[status as 'PENDIENTE'];
    it(`ATOMIC-${n}: adminStatus=${status} → rechazo sin voto persistido ni incremento`, async () => {
      const period = buildPeriod({
        candidateExtended: [
          {
            name: 'Candidato 1', document: CANDIDATE_DOC, phone: '555', area: 'X',
            position: 'Y', motivation: 'Z', adminStatus: status, votes: 0,
          },
        ] as never,
      });
      const { service, model } = buildService([period]);
      installTestOtpHasher(service);
      await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
      await assert.rejects(
        () => service.vote(VOTE1(otpCodeOf(service, OTP_KEY))),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('El candidato no está habilitado para la votación'),
      );
      const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
      assert.equal((stored.votesExtended as unknown[]).length, 0, 'sin voto persistido');
      assert.equal(
        (stored.candidateExtended as Array<{ votes: number }>)[0].votes,
        0,
        'sin incremento',
      );
    });
  }

  it('ATOMIC-10: votante inexistente → rechazo sin voto persistido ni incremento', async () => {
    const { service, model } = buildService([buildPeriod()], []);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote(VOTE1(otpCodeOf(service, OTP_KEY))),
      (error: Error) => error instanceof BadRequestException,
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0);
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 0);
  });

  it('ATOMIC-11: votante de otra empresa → rechazo sin voto persistido ni incremento', async () => {
    const otherCompany = [
      {
        _id: new Types.ObjectId(),
        companyId: new Types.ObjectId('64b0000000000000000000ff'),
        document: VOTER_DOC,
        status: 'Activo',
      },
    ];
    const { service, model } = buildService([buildPeriod()], otherCompany);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote(VOTE1(otpCodeOf(service, OTP_KEY))),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message === 'Documento no elegible para esta elección',
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0);
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 0);
  });

  it('ATOMIC-12: la unicidad la garantiza la operación atómica condicional ($ne), patrón certificado F7B-3', async () => {
    const { model } = buildService([buildPeriod()]);
    const period = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    const filter = {
      _id: period._id,
      'votesExtended.document': { $ne: VOTER_DOC },
      'candidateExtended.document': CANDIDATE_DOC,
    };
    const push = {
      $push: {
        votesExtended: { document: VOTER_DOC, candidateDocument: CANDIDATE_DOC, otpValidated: true, votedAt: new Date() },
      },
    };
    const first = await model.findOneAndUpdate(filter, push).exec();
    const second = await model.findOneAndUpdate(filter, push).exec();
    assert.ok(first, 'primer intento aplica el voto');
    assert.equal(second, null, 'el segundo intento (mismo votante) no aplica');
  });

  it('ATOMIC-13: rechazo de voto duplicado sin exponer error interno (mensaje genérico exacto)', async () => {
    const { service } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.vote(VOTE1(otpCodeOf(service, OTP_KEY)));
    const key2 = `${ELECTION_A}:${VOTER_DOC}:${PHONE_ALT}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT });
    await assert.rejects(
      () =>
        service.vote({
          electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT,
          otpCode: otpCodeOf(service, key2), candidateDocument: CANDIDATE_DOC,
        }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message === 'El trabajador ya votó' &&
        !(error as { stack?: string }).stack?.includes('MongoServerError') &&
        !(error as { code?: number }).code,
    );
  });

  it('ATOMIC-14: el voto NO depende de period.save() (secuencia vulnerable eliminada)', async () => {
    const period = buildPeriod({
      save: async function () {
        throw new Error('save() NO debe llamarse en el flujo de voto');
      },
    });
    const { service, model } = buildService([period]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote(VOTE1(otpCodeOf(service, OTP_KEY)));
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 1);
  });

  it('ATOMIC-15: el contador se incrementa con $inc atómico (dos votos → +2 sin save())', async () => {
    const period = buildPeriod({
      save: async function () {
        throw new Error('save() NO debe llamarse en el flujo de voto');
      },
    });
    const { service, model } = buildService([period], EMPLOYEES_TWO);
    installTestOtpHasher(service);
    const keyA = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;
    const keyB = `${ELECTION_A}:${VOTER2_DOC}:${PHONE2}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2 });
    await service.vote(VOTE1(otpCodeOf(service, keyA)));
    await service.vote({
      electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2,
      otpCode: otpCodeOf(service, keyB), candidateDocument: CANDIDATE_DOC,
    });
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 2);
  });

  it('ATOMIC-16: no hay doble incremento cuando la operación falla (duplicado → contador estable)', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.vote(VOTE1(otpCodeOf(service, OTP_KEY)));
    // Mismo votante con OTRO teléfono → voto duplicado rechazado por el CAS.
    const key2 = `${ELECTION_A}:${VOTER_DOC}:${PHONE_ALT}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT });
    await assert.rejects(
      () =>
        service.vote({
          electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT,
          otpCode: otpCodeOf(service, key2), candidateDocument: CANDIDATE_DOC,
        }),
      () => true,
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 1, 'contador NO se incrementa al rechazar');
  });

  it('ATOMIC-17: voto aceptado y contador consistentes (1 voto → 1 incremento)', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.vote(VOTE1(otpCodeOf(service, OTP_KEY)));
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    const votes = stored.votesExtended as Array<{ document: string; candidateDocument: string }>;
    assert.equal(votes.length, 1);
    assert.equal(votes[0].document, VOTER_DOC);
    assert.equal(votes[0].candidateDocument, CANDIDATE_DOC);
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 1);
  });

  it('ATOMIC-18..21: regresiones — privacidad, OTP, rate-limit y elegibilidad continúan verdes', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    // Flujo completo sendOtp → vote.
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const vote = await service.vote(VOTE1(otpCodeOf(service, OTP_KEY)));
    assert.equal((vote as { success: boolean }).success, true);
    // OTP de un solo uso: reuso rechazado (barrera OTP, F7B-10.1).
    await assert.rejects(
      () => service.vote(VOTE1(otpCodeOf(service, OTP_KEY))),
      (error: Error) => error instanceof BadRequestException,
    );
    // Privacidad de resultados sin PII (F7B-10.2). F7B-10.6-C: los resultados
    // requieren estado CLOSED, por lo que la elección se cierra explícitamente
    // (transición OPEN → CLOSED) antes de consultarlos.
    const closedPeriod = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    closedPeriod.electionState = 'CLOSED';
    const results = (await service.getVotingResults(ELECTION_A)) as Record<string, unknown>;
    const serialized = JSON.stringify(results);
    for (const forbidden of ['phone', 'email', 'motivation', 'otpPreview', 'otpHash', 'votesExtended']) {
      assert.ok(!serialized.includes(forbidden), `resultados no deben exponer ${forbidden}`);
    }
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });
});

describe('F7B-10.6-C (COPASST) — Estado electoral y control temporal del flujo', () => {
  const VOTER2_DOC = '333';
  const PHONE_ALT = '667';
  const PHONE2 = '777';
  const VOTING_UNAVAILABLE = 'La votación no está disponible.';
  const RESULTS_UNAVAILABLE = 'Los resultados no están disponibles.';

  const EMPLOYEES_TWO = [
    {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId('64b0000000000000000000a1'),
      document: VOTER_DOC,
      status: 'Activo',
    },
    {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId('64b0000000000000000000a1'),
      document: VOTER2_DOC,
      status: 'Activo',
    },
  ];

  /** Helpers locales del registro público (F7B-10.6-C; no visibles fuera de su describe). */
  const CAMPAIGN_TOKEN = 'F7B10-6C-campaign-token';
  const REG_PAYLOAD = {
    name: 'Candidato Público',
    document: '999-REG-C',
    phone: '555-REG-C',
    area: 'Producción',
    position: 'Operario',
    motivation: 'Quiero participar',
    acceptedTerms: true,
  };
  function buildEstateRegistrationPeriod(overrides: Record<string, unknown> = {}): CopasstPeriodDocument {
    return {
      _id: new Types.ObjectId('64b0000000000000000000cc'),
      companyId: new Types.ObjectId('64b0000000000000000000a1'),
      periodName: 'COPASST Campaña',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      status: 'ACTIVO',
      registrationCampaign: {
        openingDate: new Date(Date.now() - 86400000),
        closingDate: new Date(Date.now() + 30 * 86400000),
        includedDepartments: [],
        requirements: [],
        secureToken: CAMPAIGN_TOKEN,
        isActive: true,
        adminNotes: '',
      },
      candidateExtended: [] as never,
      votesExtended: [] as never,
      save: async function () {
        return this as unknown as CopasstPeriodDocument;
      },
      ...overrides,
    } as unknown as CopasstPeriodDocument;
  }
  function buildEstateRegistrationService(period: CopasstPeriodDocument) {
    const store = new Map<string, CopasstPeriodDocument>([
      [(period._id as Types.ObjectId).toString(), period],
    ]);
    const model = {
      store,
      findById: (findId: Types.ObjectId) => ({
        exec: async () => store.get(findId.toString()) ?? null,
      }),
      findOne: () => ({ exec: async () => period }),
      create: async () => {
        throw new Error('no usado en F7B-10.6-C');
      },
    };
    const employeeModel = buildEmployeeModel() as never;
    const userModel = { find: () => ({ exec: async () => [] }) } as never;
    const alertsService = { create: async () => ({}) } as never;
    const autoCommService = { generateCommunication: async () => ({}) } as never;
    const counterModel = new FakeCounterModel();
    const otpRateLimitService = new OtpRateLimitService(counterModel as never);
    const otpChallengeService = new OtpChallengeService(new FakeChallengeModel() as never);
    const service = new CopasstService(
      model as never,
      employeeModel,
      userModel,
      alertsService,
      autoCommService,
      otpRateLimitService,
      otpChallengeService,
    );
    return { service, model, counterModel };
  }

  /** Periodo CLOSED con un candidato aprobado con votos (resultados). */
  function closedResultsPeriod(): CopasstPeriodDocument {
    return buildPeriod({
      electionState: 'CLOSED',
      candidateExtended: [
        {
          name: 'Candidato 1', document: CANDIDATE_DOC, phone: '555', area: 'X',
          position: 'Y', motivation: 'Z', adminStatus: 'APROBADO', votes: 2,
        },
      ] as never,
      votesExtended: [
        { document: '1001', candidateDocument: CANDIDATE_DOC, otpValidated: true, votedAt: new Date() },
        { document: '1002', candidateDocument: CANDIDATE_DOC, otpValidated: true, votedAt: new Date() },
      ] as never,
    });
  }

  // ─── OTP (sendOtp) ───

  it('ESTATE-01: NOT_STARTED no permite solicitar OTP', async () => {
    const { service } = buildService([buildPeriod({ electionState: 'NOT_STARTED' })]);
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) => error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
  });

  it('ESTATE-02: OPEN permite solicitar OTP', async () => {
    const { service } = buildService([buildPeriod()]); // default OPEN
    const resp = (await service.sendOtp({
      electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE,
    })) as { sent: boolean };
    assert.equal(resp.sent, true);
  });

  it('ESTATE-03: CLOSED no permite solicitar OTP', async () => {
    const { service } = buildService([buildPeriod({ electionState: 'CLOSED' })]);
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) => error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
  });

  // ─── VOTO (vote) ───

  it('ESTATE-04: NOT_STARTED no permite votar (ni con OTP válido sembrado)', async () => {
    const { service, model } = buildService([buildPeriod({ electionState: 'NOT_STARTED' })]);
    installTestOtpHasher(service);
    seedOtp(service, OTP_KEY);
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: '123456' }),
      (error: Error) => error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0, 'sin voto persistido');
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 0);
  });

  it('ESTATE-05: OPEN permite votar (flujo completo)', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  it('ESTATE-06: CLOSED no permite votar (ni con OTP válido sembrado)', async () => {
    const { service, model } = buildService([buildPeriod({ electionState: 'CLOSED' })]);
    installTestOtpHasher(service);
    seedOtp(service, OTP_KEY);
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: '123456' }),
      (error: Error) => error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0);
  });

  it('ESTATE-07: OTP válido generado durante OPEN no permite votar después de CLOSED', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const code = otpCodeOf(service, OTP_KEY);
    // La elección se cierra DESPUÉS de generar el OTP.
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    stored.electionState = 'CLOSED';
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: code }),
      (error: Error) =>
        error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
    assert.equal((stored.votesExtended as unknown[]).length, 0, 'electionState prevalece sobre el OTP');
  });

  // ─── RESULTADOS ───

  it('ESTATE-08: resultados NOT_STARTED rechazados', async () => {
    const { service } = buildService([buildPeriod({ electionState: 'NOT_STARTED' })]);
    await assert.rejects(
      () => service.getVotingResults(ELECTION_A),
      (error: Error) => error instanceof BadRequestException && error.message === RESULTS_UNAVAILABLE,
    );
  });

  it('ESTATE-09: resultados OPEN rechazados', async () => {
    const { service } = buildService([buildPeriod()]); // OPEN
    await assert.rejects(
      () => service.getVotingResults(ELECTION_A),
      (error: Error) => error instanceof BadRequestException && error.message === RESULTS_UNAVAILABLE,
    );
  });

  it('ESTATE-10: resultados CLOSED permitidos', async () => {
    const { service } = buildService([closedResultsPeriod()]);
    const result = (await service.getVotingResults(ELECTION_A)) as {
      totalVotes: number;
      ranking: Array<{ name: string; votes: number }>;
    };
    assert.equal(result.totalVotes, 2);
    assert.equal(result.ranking.length, 1);
    assert.equal(result.ranking[0].name, 'Candidato 1');
    assert.equal(result.ranking[0].votes, 2);
  });

  // ─── REGISTRO PÚBLICO ───

  it('ESTATE-11: registro de candidato CLOSED rechazado', async () => {
    const period = buildEstateRegistrationPeriod({ electionState: 'CLOSED' });
    const { service, model } = buildEstateRegistrationService(period);
    await assert.rejects(
      () => service.registerCandidatePublic(CAMPAIGN_TOKEN, { ...REG_PAYLOAD }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('El periodo de inscripción ha finalizado'),
    );
    const stored = model.store.get((period._id as Types.ObjectId).toString()) as CopasstPeriodDocument;
    assert.equal((stored.candidateExtended as unknown[]).length, 0, 'sin candidato registrado');
  });

  it('ESTATE-12: registro de candidato permitido en fase pre-electoral (NOT_STARTED) con campaña activa', async () => {
    const { service } = buildEstateRegistrationService(buildEstateRegistrationPeriod()); // sin electionState → NOT_STARTED
    const resp = (await service.registerCandidatePublic(CAMPAIGN_TOKEN, {
      ...REG_PAYLOAD,
    })) as { success: boolean };
    assert.equal(resp.success, true);
  });

  // ─── TRANSICIONES ───

  it('ESTATE-13: transición NOT_STARTED → OPEN al llegar votingOpenAt (función determinista)', async () => {
    const period = buildPeriod({
      electionState: 'NOT_STARTED',
      votingOpenAt: new Date(Date.now() - 1000),
    });
    const { service } = buildService([period]);
    const resp = (await service.sendOtp({
      electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE,
    })) as { sent: boolean };
    assert.equal(resp.sent, true, 'la elección debe abrirse automáticamente al llegar la fecha');
  });

  it('ESTATE-14: transición OPEN → CLOSED al vencer votingClosedAt', async () => {
    const period = buildPeriod({
      electionState: 'OPEN',
      votingClosedAt: new Date(Date.now() - 1000),
    });
    const { service } = buildService([period]);
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) => error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
  });

  it('ESTATE-15: CLOSED no vuelve automáticamente a OPEN (cierre explícito gana a las fechas)', async () => {
    const period = buildPeriod({
      electionState: 'CLOSED',
      votingOpenAt: new Date(Date.now() - 1000),
    });
    const { service } = buildService([period]);
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) => error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
  });

  it('ESTATE-16: GET de resultados NO realiza escrituras para determinar el estado', async () => {
    const period = buildPeriod({
      electionState: 'CLOSED',
      save: async function () {
        throw new Error('GET no debe escribir para determinar el estado');
      },
    });
    const { service } = buildService([period]);
    const result = (await service.getVotingResults(ELECTION_A)) as { totalVotes: number };
    assert.ok(result.totalVotes >= 0, 'la consulta funciona sin escrituras');
  });

  // ─── PRIVACIDAD ───

  it('ESTATE-17: privacidad de resultados intacta con la elección CLOSED', async () => {
    const { service } = buildService([closedResultsPeriod()]);
    const result = await service.getVotingResults(ELECTION_A);
    const serialized = JSON.stringify(result);
    for (const forbidden of ['document', 'phone', 'email', 'motivation', 'votesExtended', 'otpPreview']) {
      assert.ok(!serialized.includes(forbidden), `no debe exponer ${forbidden}`);
    }
    const ranking = (
      result as unknown as Record<string, Array<Record<string, unknown>>>
    ).ranking;
    for (const entry of ranking) {
      assert.equal(Object.keys(entry).length, 4, 'solo rank/name/votes/status');
    }
  });

  // ─── REGRESIONES CERTIFICADAS ───

  it('ESTATE-18: F7B-10.1 intacto — sendOtp (OPEN) no expone OTP ni hash', async () => {
    const { service } = buildService([buildPeriod()]);
    const resp = (await service.sendOtp({
      electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE,
    })) as Record<string, unknown>;
    assert.equal(resp.sent, true);
    for (const forbidden of ['otp', 'otpPreview', 'code', 'secret', 'otpHash']) {
      assert.ok(!(forbidden in resp), `no debe exponer ${forbidden}`);
    }
  });

  it('ESTATE-19: F7B-10.5-B/C intacto — rate-limit OTP (3/10 min) opera con la elección OPEN', async () => {
    const { service } = buildService([buildPeriod()]);
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    }
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Demasiadas solicitudes de OTP'),
    );
  });

  it('ESTATE-20: F7B-10.6-A intacto — votante elegible del tenant correcto sigue votando con OPEN', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  it('ESTATE-21: F7B-10.6-B intacto — voto duplicado secuencial rechazado con OPEN', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    // OTP nuevo con otro teléfono (misma identidad) para superar la barrera OTP.
    const key2 = `${ELECTION_A}:${VOTER_DOC}:${PHONE_ALT}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT });
    await assert.rejects(
      () =>
        service.vote({
          electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE_ALT,
          otpCode: otpCodeOf(service, key2), candidateDocument: CANDIDATE_DOC,
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('El trabajador ya votó'),
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1, 'solo un voto persistido');
  });

  it('ESTATE-22: voto concurrente durante OPEN continúa funcionando (+2 sin lost update)', async () => {
    const { service, model } = buildService([buildPeriod()], EMPLOYEES_TWO);
    installTestOtpHasher(service);
    const keyA = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;
    const keyB = `${ELECTION_A}:${VOTER2_DOC}:${PHONE2}`;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2 });
    const results = await Promise.allSettled([
      service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, keyA) }),
      service.vote({
        electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2,
        otpCode: otpCodeOf(service, keyB), candidateDocument: CANDIDATE_DOC,
      }),
    ]);
    assert.equal(results.every((r) => r.status === 'fulfilled'), true, 'ambos votos deben persistir');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 2);
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 2);
  });

  it('ESTATE-23: voto concurrente cuando CLOSED → ningún voto persiste', async () => {
    const { service, model } = buildService([buildPeriod({ electionState: 'CLOSED' })], EMPLOYEES_TWO);
    installTestOtpHasher(service);
    const keyA = `${ELECTION_A}:${VOTER_DOC}:${PHONE}`;
    const keyB = `${ELECTION_A}:${VOTER2_DOC}:${PHONE2}`;
    seedOtp(service, keyA);
    seedOtp(service, keyB);
    const results = await Promise.allSettled([
      service.vote({ ...VOTE_PAYLOAD, otpCode: '123456' }),
      service.vote({
        electionId: ELECTION_A, document: VOTER2_DOC, phone: PHONE2,
        otpCode: '123456', candidateDocument: CANDIDATE_DOC,
      }),
    ]);
    assert.equal(results.every((r) => r.status === 'rejected'), true, 'ambos deben rechazarse por estado');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0, 'ningún voto persistido');
    assert.equal((stored.candidateExtended as Array<{ votes: number }>)[0].votes, 0, 'contador intacto');
  });

  it('ESTATE-24: candidato no aprobado sigue rechazado aunque electionState = OPEN', async () => {
    const period = buildPeriod({
      candidateExtended: [
        {
          name: 'Candidato 1', document: CANDIDATE_DOC, phone: '555', area: 'X',
          position: 'Y', motivation: 'Z', adminStatus: 'PENDIENTE', votes: 0,
        },
      ] as never,
    });
    const { service, model } = buildService([period]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('El candidato no está habilitado para la votación'),
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0, 'sin voto persistido');
  });

  it('ESTATE-25: votante no elegible sigue rechazado aunque electionState = OPEN', async () => {
    const { service, model } = buildService([buildPeriod()], []); // sin empleados
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message === 'Documento no elegible para esta elección',
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0);
  });

  it('ESTATE-26: valor desconocido de electionState se resuelve fail-closed (nunca OPEN por defecto)', async () => {
    // Datos legacy/integridad fuera del enum: sin fechas, no debe permitir OTP.
    const { service } = buildService([buildPeriod({ electionState: 'BOGUS' as never })]);
    await assert.rejects(
      () => service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE }),
      (error: Error) => error instanceof BadRequestException && error.message === VOTING_UNAVAILABLE,
    );
    // Con votingOpenAt ya vencido sí abre (regla temporal sigue aplicando).
    const { service: serviceB } = buildService([
      buildPeriod({ electionState: 'BOGUS' as never, votingOpenAt: new Date(Date.now() - 1000) }),
    ]);
    const resp = (await serviceB.sendOtp({
      electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE,
    })) as { sent: boolean };
    assert.equal(resp.sent, true, 'con la fecha de apertura llegada, la transición temporal sí aplica');
  });
});

describe('F7B-10.6-D (COPASST) — Tenant isolation por periodId', () => {
  const CROSS_MSG = 'Periodo no encontrado';

  /** Verifica que un acceso cross-tenant se rechaza con NotFound genérico. */
  async function expectTenantDenied(promise: Promise<unknown>) {
    await assert.rejects(
      () => promise,
      (error: Error) =>
        error instanceof NotFoundException && error.message === CROSS_MSG,
    );
  }

  it('TENANT-01: la empresa A accede a su propio periodo', async () => {
    const { service } = buildService([buildPeriod({ members: [] as never })]);
    const members = (await service.getMembers(COMPANY_A, ELECTION_A)) as unknown[];
    assert.ok(Array.isArray(members), 'la empresa A debe poder leer sus miembros');
  });

  it('TENANT-02: la empresa B NO puede acceder al periodo de la empresa A', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(service.getMembers(COMPANY_B, ELECTION_A));
  });

  it('TENANT-03: PATCH cross-tenant rechazado (updatePeriod)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(service.updatePeriod(COMPANY_B, ELECTION_A, { status: 'ACTIVO' }));
  });

  it('TENANT-04: members cross-tenant rechazado (addMember/removeMember)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(
      service.addMember(COMPANY_B, ELECTION_A, {
        userId: new Types.ObjectId().toString(), userName: 'X', committeeRole: 'PRINCIPAL',
        representationType: 'TRABAJADOR', principalType: 'PRINCIPAL', startDate: '2025-01-01',
      }, 'e@x.com'),
    );
    await expectTenantDenied(service.removeMember(COMPANY_B, ELECTION_A, 0, 'e@x.com'));
  });

  it('TENANT-05: campaign cross-tenant rechazado (startRegistrationCampaign)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(
      service.startRegistrationCampaign(COMPANY_B, ELECTION_A, {
        openingDate: new Date().toISOString(),
        closingDate: new Date(Date.now() + 86400000).toISOString(),
      }, 'e@x.com'),
    );
  });

  it('TENANT-06: meetings cross-tenant rechazado (schedule/update/complete/auto)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(
      service.scheduleMeeting(COMPANY_B, ELECTION_A, { meetingDate: '2025-02-01', agenda: 'A' }, 'e@x.com'),
    );
    await expectTenantDenied(service.autoScheduleMonthlyMeetings(COMPANY_B, ELECTION_A, 'e@x.com'));
    await expectTenantDenied(
      service.updateMeeting(COMPANY_B, ELECTION_A, 0, { status: 'CANCELADA' }, 'e@x.com'),
    );
    await expectTenantDenied(
      service.completeMeeting(COMPANY_B, ELECTION_A, 0, { development: 'X', attendees: [] }, 'e@x.com'),
    );
  });

  it('TENANT-07: commitments cross-tenant rechazado (add/update)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(
      service.addCommitment(COMPANY_B, ELECTION_A, {
        description: 'C', responsibleParty: 'R', deadline: '2025-02-01', priority: 'HIGH',
      }, 'e@x.com'),
    );
    await expectTenantDenied(
      service.updateCommitment(COMPANY_B, ELECTION_A, new Types.ObjectId().toString(), { status: 'COMPLETED' }, 'e@x.com'),
    );
  });

  it('TENANT-08: evidence cross-tenant rechazado (add/remove)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(
      service.addEvidence(COMPANY_B, ELECTION_A, {
        type: 'PDF', title: 'T', fileName: 'F', fileUrl: 'U',
      }, 'e@x.com'),
    );
    await expectTenantDenied(service.removeEvidence(COMPANY_B, ELECTION_A, 0, 'e@x.com'));
  });

  it('TENANT-09: audit cross-tenant rechazado (getAuditHistory)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(service.getAuditHistory(COMPANY_B, ELECTION_A));
  });

  it('TENANT-10: approval cross-tenant rechazado (submitForApproval/approve/reject)', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(service.submitForApproval(COMPANY_B, ELECTION_A, 'e@x.com'));
    await expectTenantDenied(service.approve(COMPANY_B, ELECTION_A, 'e@x.com', 'manager'));
    await expectTenantDenied(service.reject(COMPANY_B, ELECTION_A, 'razón', 'e@x.com'));
  });

  it('TENANT-11: review-candidate cross-tenant rechazado', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(
      service.reviewCandidate(COMPANY_B, ELECTION_A, 0, { adminStatus: 'APROBADO' }, 'e@x.com'),
    );
  });

  it('TENANT-12: voting/init cross-tenant rechazado', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(service.initVoting(COMPANY_B, ELECTION_A, 'e@x.com'));
  });

  it('TENANT-13: auto-committee cross-tenant rechazado', async () => {
    const { service } = buildService([buildPeriod()]);
    await expectTenantDenied(service.autoCreateCommittee(COMPANY_B, ELECTION_A, 2, 'e@x.com'));
  });

  it('TENANT-14: la empresa A SÍ puede operar su periodo tras el scoping (no regresión)', async () => {
    const { service, model } = buildService([buildPeriod()]);
    const result = (await service.updatePeriod(COMPANY_A, ELECTION_A, { status: 'ACTIVO' })) as {
      periodName: string;
    };
    assert.equal(result.periodName, 'COPASST Inicial');
    assert.equal((model.store.get(ELECTION_A) as CopasstPeriodDocument).status, 'ACTIVO');
  });
});

describe('F7B-10.6-D (COPASST) — OTP distribuido en MongoDB (multi-instancia)', () => {
  const OTHER_VOTER = '444-OTP';
  const OTHER_PHONE = '888';

  /** Dos instancias de servicio que COMPARTEN el mismo store OTP. */
  function dualInstance() {
    const shared = new FakeChallengeModel();
    const { service: instanceA, model: modelA } = buildService([buildPeriod()], undefined, {
      challengeModel: shared,
    });
    const { service: instanceB, model: modelB } = buildService([buildPeriod()], undefined, {
      challengeModel: shared,
    });
    installTestOtpHasher(instanceA);
    installTestOtpHasher(instanceB);
    // El voto se persiste en el model de la instancia que VOTA (B en la
    // mayoría de escenarios); el store OTP es el compartido (shared).
    return { instanceA, instanceB, model: modelB, modelA, shared };
  }

  const SEND = (service: CopasstService) =>
    service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
  const VOTE = (service: CopasstService, code: string) =>
    service.vote({ ...VOTE_PAYLOAD, otpCode: code });
  const WRONG_VOTE = (service: CopasstService) =>
    service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' });

  it('OTP-DIST-01: OTP generado en instancia A puede validarse desde instancia B', async () => {
    const { instanceA, instanceB, model } = dualInstance();
    await SEND(instanceA);
    const code = otpCodeOf(instanceB, OTP_KEY);
    const result = (await VOTE(instanceB, code)) as { success: boolean };
    assert.equal(result.success, true, 'instancia B debe validar el desafío creado por A');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  it('OTP-DIST-02: regenerar en B invalida el OTP generado en A', async () => {
    const { instanceA, instanceB, model } = dualInstance();
    await SEND(instanceA);
    const first = otpCodeOf(instanceA, OTP_KEY);
    await SEND(instanceB); // regenera en B (reemplaza el desafío de A)
    const second = otpCodeOf(instanceB, OTP_KEY);
    assert.notEqual(first, second, 'el desafío debe reemplazarse');
    await assert.rejects(
      () => VOTE(instanceA, first),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    const result = (await VOTE(instanceB, second)) as { success: boolean };
    assert.equal(result.success, true, 'el nuevo OTP (generado en B) sí funciona');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
  });

  it('OTP-DIST-03: OTP consumido en A no puede reutilizarse en B', async () => {
    const { instanceA, instanceB } = dualInstance();
    await SEND(instanceA);
    const code = otpCodeOf(instanceA, OTP_KEY);
    const result = (await VOTE(instanceA, code)) as { success: boolean };
    assert.equal(result.success, true);
    // El desafío fue eliminado atómicamente; B no puede reutilizarlo.
    await assert.rejects(
      () => VOTE(instanceB, code),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('OTP-DIST-04: attempts compartidos entre instancias', async () => {
    const { instanceA, instanceB, shared } = dualInstance();
    await SEND(instanceA);
    await assert.rejects(() => WRONG_VOTE(instanceB), () => true);
    await assert.rejects(() => WRONG_VOTE(instanceB), () => true);
    await assert.rejects(() => WRONG_VOTE(instanceA), () => true);
    // Los 3 intentos fallidos se acumulan en el desafío compartido.
    assert.equal(shared.store.get(OTP_KEY)?.attempts, 3);
    // El OTP sigue vivo (3 < 5).
    const code = otpCodeOf(instanceA, OTP_KEY);
    const result = (await VOTE(instanceB, code)) as { success: boolean };
    assert.equal(result.success, true);
  });

  it('OTP-DIST-05: OTP expirado es rechazado (expiración compartida)', async () => {
    const { instanceA, instanceB, shared } = dualInstance();
    await SEND(instanceA);
    const code = otpCodeOf(instanceA, OTP_KEY);
    const doc = shared.store.get(OTP_KEY);
    assert.ok(doc);
    doc.expiresAt = new Date(Date.now() - 1000); // expirar el desafío compartido
    await assert.rejects(
      () => VOTE(instanceB, code),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    assert.equal(shared.store.get(OTP_KEY), undefined, 'el desafío expirado se elimina');
  });

  it('OTP-DIST-06: OTP inválido incrementa attempts compartidos y al llegar a 5 se invalida', async () => {
    const { instanceA, instanceB, shared } = dualInstance();
    await SEND(instanceA);
    const code = otpCodeOf(instanceA, OTP_KEY);
    for (let i = 0; i < 4; i++) {
      await assert.rejects(() => WRONG_VOTE(instanceB), () => true);
    }
    // 5º intento fallido (desde A): se invalida el desafío.
    await assert.rejects(() => WRONG_VOTE(instanceA), () => true);
    assert.equal(shared.store.get(OTP_KEY), undefined, 'el desafío se elimina al agotar intentos');
    // Ni siquiera el código correcto funciona después.
    await assert.rejects(
      () => VOTE(instanceB, code),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('OTP-DIST-07: fallo de MongoDB → fail-closed sin fallback a Map', async () => {
    const { instanceA, instanceB, shared } = dualInstance();
    const anyA = instanceA as unknown as Record<string, unknown>;
    assert.equal(anyA.otpStore, undefined, 'no debe existir otpStore Map');
    // sendOtp: error de Mongo al persistir → rechazo genérico.
    shared.failNextWithError = new Error('Mongo no disponible');
    await assert.rejects(
      () => SEND(instanceA),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('No se pudo completar la solicitud'),
    );
    // vote: error de Mongo al leer el desafío → 'OTP inválido o expirado'.
    seedOtp(instanceB, OTP_KEY);
    shared.failNextWithError = new Error('Mongo no disponible');
    await assert.rejects(
      () => VOTE(instanceB, '123456'),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('OTP-DIST-08: la respuesta de sendOtp no expone otp/otpPreview/otpHash/code/secret', async () => {
    const { instanceA } = dualInstance();
    const resp = (await SEND(instanceA)) as Record<string, unknown>;
    assert.equal(resp.sent, true);
    for (const forbidden of ['otp', 'otpPreview', 'otpHash', 'code', 'secret']) {
      assert.ok(!(forbidden in resp), `no debe exponer ${forbidden}`);
    }
  });

  it('OTP-DIST-09: nunca se persiste el OTP en texto plano en el store compartido', async () => {
    const { instanceA, shared } = dualInstance();
    await SEND(instanceA);
    const doc = shared.store.get(OTP_KEY);
    assert.ok(doc, 'el desafío debe existir');
    assert.ok(!('otp' in doc), 'no debe existir el campo otp');
    assert.ok(!('code' in doc), 'no debe existir el campo code');
    assert.ok(!('otpPreview' in doc), 'no debe existir el campo otpPreview');
    // El hash nunca es el código en claro.
    const plain = otpCodeOf(instanceA, OTP_KEY);
    assert.notEqual(doc.otpHash, plain);
    assert.match(doc.otpHash, /^ab\d{6}$/, 'solo el verificador (hasher de prueba)');
  });

  it('OTP-DIST-10: el schema declara índice único sobre key y TTL sobre expiresAt (expireAfterSeconds: 0)', () => {
    const indexes = CopasstOtpChallengeSchema.indexes();
    const keyIndex = indexes.find(([pattern]) => JSON.stringify(pattern) === '{"key":1}');
    assert.ok(keyIndex, 'debe existir el índice único sobre key');
    assert.equal(keyIndex?.[1]?.unique, true, 'key debe ser único');
    const ttlIndex = indexes.find(([pattern]) => JSON.stringify(pattern) === '{"expiresAt":1}');
    assert.ok(ttlIndex, 'debe existir el índice TTL sobre expiresAt');
    assert.equal(ttlIndex?.[1]?.expireAfterSeconds, 0, 'TTL expireAfterSeconds = 0');
  });

  it('OTP-DIST-11: dos validaciones concurrentes del mismo OTP → un solo consumo exitoso', async () => {
    const { instanceA, instanceB, model } = dualInstance();
    await SEND(instanceA);
    const code = otpCodeOf(instanceA, OTP_KEY);
    const results = await Promise.allSettled([VOTE(instanceB, code), VOTE(instanceB, code)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactamente UN consumo exitoso');
    assert.equal(rejected.length, 1, 'el segundo consumo concurrente se rechaza');
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1, 'un solo voto persistido');
    assert.equal(
      (stored.candidateExtended as Array<{ votes: number }>)[0].votes,
      1,
      'un solo incremento',
    );
  });

  it('OTP-DIST-12: E11000 en el primer upsert → retry único exitoso (sin loops)', async () => {
    const shared = new FakeChallengeModel();
    const { service } = buildService([buildPeriod()], undefined, { challengeModel: shared });
    installTestOtpHasher(service);
    // Simula la carrera: otro "proceso" insertó la clave; el primer upsert
    // lanza E11000 y el servicio reintenta UNA vez.
    shared.failNextUpsert = true;
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    assert.equal(shared.upsertCalls, 2, 'exactamente un retry');
    const doc = shared.store.get(OTP_KEY);
    assert.ok(doc, 'el desafío quedó registrado tras el retry');
    const code = otpCodeOf(service, OTP_KEY);
    const result = (await service.vote({ ...VOTE_PAYLOAD, otpCode: code })) as { success: boolean };
    assert.equal(result.success, true);
  });

  it('OTP-DIST-13: aislamiento entre identidades/elecciones (claves independientes)', async () => {
    const { instanceA, instanceB, shared } = dualInstance();
    await SEND(instanceA);
    // Otra identidad en la misma elección: no comparte desafío.
    await instanceB.sendOtp({ electionId: ELECTION_A, document: OTHER_VOTER, phone: OTHER_PHONE });
    const otherKey = `${ELECTION_A}:${OTHER_VOTER}:${OTHER_PHONE}`;
    assert.ok(shared.store.get(OTP_KEY), 'desafío del votante 1');
    assert.ok(shared.store.get(otherKey), 'desafío del votante 2 (independiente)');
    assert.notEqual(shared.store.get(OTP_KEY)?.otpHash, shared.store.get(otherKey)?.otpHash);
    // El desafío del votante 1 no se ve afectado por el del votante 2.
    const code1 = otpCodeOf(instanceA, OTP_KEY);
    const result = (await VOTE(instanceB, code1)) as { success: boolean };
    assert.equal(result.success, true);
  });
});

describe('F7B-10.7 (COPASST) — Limpieza de riesgos residuales (PII token + getCampaignInfo)', () => {
  const CAMPAIGN_TOKEN = 'F7B10-7-campaign-token';

  /** Periodo con campaña activa para el contrato público de la campaña. */
  function buildCampaignPeriod(overrides: Record<string, unknown> = {}): CopasstPeriodDocument {
    return {
      _id: new Types.ObjectId('64b0000000000000000000ee'),
      companyId: new Types.ObjectId('64b0000000000000000000a1'),
      periodName: 'COPASST Campaña 10.7',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      status: 'ACTIVO',
      registrationCampaign: {
        openingDate: new Date(Date.now() - 86400000),
        closingDate: new Date(Date.now() + 30 * 86400000),
        includedDepartments: ['Producción'],
        requirements: ['Llevar 1 año'],
        secureToken: CAMPAIGN_TOKEN,
        isActive: true,
        adminNotes: '',
      },
      candidateExtended: [] as never,
      votesExtended: [] as never,
      save: async function () {
        return this as unknown as CopasstPeriodDocument;
      },
      ...overrides,
    } as unknown as CopasstPeriodDocument;
  }

  /** Modelo con findOne(secureToken) que devuelve el periodo de campaña. */
  function buildCampaignModel(period: CopasstPeriodDocument) {
    const store = new Map<string, CopasstPeriodDocument>([
      [(period._id as Types.ObjectId).toString(), period],
    ]);
    return {
      store,
      findById: (findId: Types.ObjectId) => ({
        exec: async () => store.get(findId.toString()) ?? null,
      }),
      // Respeta el token: devuelve null si el token consultado no coincide.
      // (Necesario para CAMPAIGN-INFO-04: token inexistente → NotFound.)
      findOne: (query: { 'registrationCampaign.secureToken'?: string }) => ({
        exec: async () => {
          const wanted = query?.['registrationCampaign.secureToken'];
          if (wanted !== undefined && wanted !== period.registrationCampaign?.secureToken) return null;
          return period;
        },
      }),
      create: async () => {
        throw new Error('no usado en F7B-10.7');
      },
    };
  }

  function buildCampaignService(period: CopasstPeriodDocument) {
    const model = buildCampaignModel(period);
    const employeeModel = buildEmployeeModel() as never;
    const userModel = { find: () => ({ exec: async () => [] }) } as never;
    const alertsService = { create: async () => ({}) } as never;
    const autoCommService = { generateCommunication: async () => ({}) } as never;
    const otpRateLimitService = new OtpRateLimitService(new FakeCounterModel() as never);
    const otpChallengeService = new OtpChallengeService(new FakeChallengeModel() as never);
    const service = new CopasstService(
      model as never,
      employeeModel,
      userModel,
      alertsService,
      autoCommService,
      otpRateLimitService,
      otpChallengeService,
    );
    return { service, model };
  }

  // ─── GATE 1: PII en votesExtended[].token ───

  it('PII-TOKEN-01: un voto exitoso NO persiste token PII en votesExtended', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const result = await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    const vote = (stored.votesExtended as unknown as Array<Record<string, unknown>>)[0];
    assert.ok(vote, 'debe existir el voto');
    assert.ok(!('token' in vote), 'votesExtended[].token NO debe persistirse');
    assert.ok(!('otpHash' in vote), 'no otpHash');
    assert.ok(!('otp' in vote), 'no otp');
    // La unicidad del voto sigue garantizada por document ($ne atómico).
    assert.equal(vote.document, VOTER_DOC);
    assert.equal(vote.candidateDocument, CANDIDATE_DOC);
    assert.equal(vote.otpValidated, true);
    // La clave OTP (electionId:document:phone) NO aparece serializada en el voto.
    const serializedVote = JSON.stringify(vote);
    assert.ok(!serializedVote.includes(OTP_KEY), 'la clave electionId:document:phone no se serializa');
  });

  it('PII-TOKEN-02: el voto NO contiene el teléfono ni el documento en campos token', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    await service.vote({ ...VOTE_PAYLOAD, otpCode: otpCodeOf(service, OTP_KEY) });
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    const serialized = JSON.stringify(stored.votesExtended);
    // El token PII era `${electionId}:${document}:${phone}`. El patrón
    // `:${phone}` concatenado ya no puede aparecer como valor de campo token.
    assert.ok(!serialized.includes(`:${PHONE}`), 'no se persiste el patrón :phone');
  });

  it('PII-TOKEN-03: la garantía de voto único NO depende del token (segundo voto del mismo documento rechazado)', async () => {
    const { service, model } = buildService([buildPeriod()]);
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const first = otpCodeOf(service, OTP_KEY);
    await service.vote({ ...VOTE_PAYLOAD, otpCode: first });
    // Segundo OTP para la misma identidad (regeneración válida).
    await service.sendOtp({ electionId: ELECTION_A, document: VOTER_DOC, phone: PHONE });
    const second = otpCodeOf(service, OTP_KEY);
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: second }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('El trabajador ya votó'),
    );
    const stored = model.store.get(ELECTION_A) as CopasstPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1, 'exactamente un voto');
  });

  // ─── GATE 2: getCampaignInfo sin companyId ───

  it('CAMPAIGN-INFO-01: getCampaignInfo NO devuelve companyId (ni datos internos)', async () => {
    const { service } = buildCampaignService(buildCampaignPeriod());
    const info = (await service.getCampaignInfo(CAMPAIGN_TOKEN)) as Record<string, unknown>;
    assert.equal(info.periodName, 'COPASST Campaña 10.7');
    assert.ok(!('companyId' in info), 'no debe exponer companyId');
    assert.ok(!('_id' in info), 'no debe exponer _id');
    assert.ok(!('secureToken' in info), 'no debe exponer secureToken');
    assert.ok(!('electionState' in info), 'no debe exponer electionState');
    assert.deepEqual(info.includedDepartments, ['Producción']);
    assert.deepEqual(info.requirements, ['Llevar 1 año']);
    assert.ok('openingDate' in info && 'closingDate' in info);
  });

  it('CAMPAIGN-INFO-02: la serialización JSON del contrato tampoco expone companyId', async () => {
    const { service } = buildCampaignService(buildCampaignPeriod());
    const info = await service.getCampaignInfo(CAMPAIGN_TOKEN);
    const serialized = JSON.stringify(info);
    assert.ok(!serialized.includes('companyId'), 'companyId no aparece serializado');
    assert.ok(!serialized.includes('secureToken'), 'secureToken no aparece serializado');
  });

  it('CAMPAIGN-INFO-03: getCampaignInfo conserva la resolución por token (campaña inactiva rechazada)', async () => {
    const period = buildCampaignPeriod({
      registrationCampaign: {
        openingDate: new Date(Date.now() - 86400000),
        closingDate: new Date(Date.now() + 30 * 86400000),
        includedDepartments: [],
        requirements: [],
        secureToken: CAMPAIGN_TOKEN,
        isActive: false,
        adminNotes: '',
      },
    });
    const { service } = buildCampaignService(period);
    await assert.rejects(
      () => service.getCampaignInfo(CAMPAIGN_TOKEN),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('ya no está activa'),
    );
  });

  it('CAMPAIGN-INFO-04: getCampaignInfo conserva la resolución por token (token inexistente → NotFound)', async () => {
    const { service } = buildCampaignService(buildCampaignPeriod());
    await assert.rejects(
      () => service.getCampaignInfo('token-que-no-existe'),
      (error: Error) => error instanceof NotFoundException,
    );
  });
});
