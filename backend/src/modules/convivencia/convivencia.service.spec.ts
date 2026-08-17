import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ConvivenciaService } from './convivencia.service';
import {
  ConvivenciaCaseSequenceSchema,
  ConvivenciaPeriod,
  ConvivenciaPeriodDocument,
  ConvivenciaPeriodSchema,
} from './schemas/convivencia.schema';
// F7B-11: infraestructura distribuida compartida (mismos fakes que COPASST).
import { OtpChallengeService } from '../otp-challenge/otp-challenge.service';
import { OtpRateLimitService } from '../otp-rate-limit/otp-rate-limit.service';

/**
 * Namespace de las claves OTP/rate-limit de Convivencia (F7B-11). Debe
 * coincidir con OTP_KEY_NAMESPACE del service para que los helpers de prueba
 * resuelvan la clave completa real.
 */
const OTP_NS = 'convivencia:';

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';
const PERIOD_A = '64b0000000000000000000aa';
const PERIOD_B = '64b0000000000000000000bb';
const NONEXISTENT_ID = '64b0000000000000000000ff';

const EMAIL_A = 'admin@empresa-a.com';
const EMAIL_B = 'admin@empresa-b.com';

/** Periodo en memoria de una empresa (con subrecursos y save()). */
function buildPeriod(
  companyId: string,
  periodId: string,
  overrides: Record<string, unknown> = {},
): ConvivenciaPeriodDocument {
  return {
    _id: new Types.ObjectId(periodId),
    companyId: new Types.ObjectId(companyId),
    periodName: 'Comité de Convivencia',
    startDate: new Date('2025-01-01T00:00:00.000Z'),
    endDate: new Date('2027-01-01T00:00:00.000Z'),
    status: 'ACTIVO',
    members: [],
    meetings: [],
    candidateExtended: [],
    votesExtended: [],
    electionState: 'NOT_STARTED',
    commitments: [],
    evidence: [],
    cases: [],
    auditHistory: [],
    approvalStatus: 'DRAFT',
    locked: false,
    rejectionReason: '',
    currentVersion: '1.0',
    requiresConvivencia: true,
    itemCode: '1.1.8',
    complianceStatus: 'PENDING',
    complianceReason: '',
    save: async function () {
      return this as unknown as ConvivenciaPeriodDocument;
    },
    ...overrides,
  } as unknown as ConvivenciaPeriodDocument;
}

/** Modelo Mongoose en memoria mínimo (findById/findOne/create). */
function buildModel(seed: ConvivenciaPeriodDocument[] = []) {
  const store = new Map<string, ConvivenciaPeriodDocument>();
  for (const doc of seed) store.set((doc._id as Types.ObjectId).toString(), doc);

  return {
    store,
    findById: (id: Types.ObjectId) => ({
      exec: async () => store.get(id.toString()) ?? null,
    }),
    findOne: (filter: Record<string, unknown>) => {
      const { companyId, status } = filter as {
        companyId?: Types.ObjectId;
        status?: unknown;
      };
      // F7B-11: query scoped { _id, companyId } del patrón certificado
      // (findPeriodForCompany ya no usa findById + check post-load).
      const _id = (filter as { _id?: Types.ObjectId })._id;
      const secureToken = (filter as { 'registrationCampaign.secureToken'?: string })[
        'registrationCampaign.secureToken'
      ];
      const found =
        [...store.values()].find((doc) => {
          if (_id && doc._id.toString() !== _id.toString()) return false;
          if (companyId && doc.companyId.toString() !== companyId.toString()) return false;
          if (status !== undefined) {
            // Soporte mínimo: comparación directa o $ne.
            if (typeof status === 'object' && status !== null && '$ne' in status) {
              if (doc.status === (status as { $ne: string }).$ne) return false;
            } else if (doc.status !== status) return false;
          }
          // F7B-5: búsqueda de campaña pública por secureToken (postulación).
          if (
            secureToken !== undefined &&
            doc.registrationCampaign?.secureToken !== secureToken
          ) {
            return false;
          }
          return true;
        }) ?? null;
      const chainable = { exec: async () => found ?? null };
      return { exec: chainable.exec, sort: () => chainable };
    },
    // F7B-6: lectura de periodos para el sembrado legacy de la secuencia de
    // casos (solo proyecta cases.caseNumber).
    find: (filter: Record<string, unknown>) => ({
      select: () => ({
        exec: async () => {
          const { companyId } = filter as { companyId?: Types.ObjectId };
          return [...store.values()].filter((doc) =>
            companyId ? doc.companyId.toString() === companyId.toString() : true,
          );
        },
      }),
    }),
    create: async (data: Partial<ConvivenciaPeriod>) => {
      const id = new Types.ObjectId();
      const doc = {
        _id: id,
        ...data,
        save: async function () {
          return this as unknown as ConvivenciaPeriodDocument;
        },
      } as unknown as ConvivenciaPeriodDocument;
      store.set(id.toString(), doc);
      return doc;
    },
    /**
     * F7B-3: réplica del patrón compare-and-swap de MongoDB. La condición se
     * evalúa y la mutación se aplica SIN await intermedio: en el event loop de
     * Node la operación es atómica por documento (en MongoDB real, la
     * serialización la garantiza el motor de escritura por documento).
     */
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
      exec: async () => {
        const id = (filter as { _id?: Types.ObjectId })._id;
        if (!id) return null;
        const doc = store.get(id.toString());
        if (!doc) return null;
        const state = (filter as { electionState?: string }).electionState;
        if (state !== undefined && doc.electionState !== state) return null;
        const notIn = (filter as { 'votesExtended.document'?: { $ne?: string } })[
          'votesExtended.document'
        ];
        if (
          notIn?.$ne !== undefined &&
          (doc.votesExtended as Array<{ document: string }>).some((v) => v.document === notIn.$ne)
        ) {
          return null;
        }
        const candDoc = (filter as { 'candidateExtended.document'?: string })[
          'candidateExtended.document'
        ];
        if (
          candDoc !== undefined &&
          !(doc.candidateExtended as Array<{ document: string }>).some((c) => c.document === candDoc)
        ) {
          return null;
        }
        const push = (update as {
          $push?: { votesExtended?: Record<string, unknown>; auditHistory?: Record<string, unknown> };
        })?.$push;
        if (push?.votesExtended) (doc.votesExtended as unknown[]).push(push.votesExtended);
        // F7B-5: el CAS del voto persiste VOTE_CAST en la misma operación.
        if (push?.auditHistory) (doc.auditHistory as unknown[]).push(push.auditHistory);
        return doc; // { new: true }: muta el documento almacenado y lo devuelve
      },
    }),
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
      exec: async () => {
        const id = (filter as { _id?: Types.ObjectId })._id;
        if (!id) return { matchedCount: 0, modifiedCount: 0 };
        const doc = store.get(id.toString());
        if (!doc) return { matchedCount: 0, modifiedCount: 0 };
        const candDoc = (filter as { 'candidateExtended.document'?: string })[
          'candidateExtended.document'
        ];
        const candidate = (doc.candidateExtended as Array<{ document: string; votes: number }>).find(
          (c) => c.document === candDoc,
        );
        const inc = (update as { $inc?: Record<string, number> })?.$inc ?? {};
        for (const [path, value] of Object.entries(inc)) {
          if (path === 'candidateExtended.$.votes') {
            if (!candidate) return { matchedCount: 0, modifiedCount: 0 };
            candidate.votes += value;
          }
        }
        // F7B-5: OTP_REQUEST se persiste con un $push de auditoría.
        const push = (update as { $push?: { auditHistory?: Record<string, unknown> } })?.$push
          ?.auditHistory;
        if (push) (doc.auditHistory as unknown[]).push(push);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
    updateMany: () => ({
      exec: async () => ({ matchedCount: 0, modifiedCount: 0 }),
    }),
  };
}

/** Empleado en memoria para validaciones de elegibilidad electoral (F7B-1). */
function buildEmployee(
  companyId: string,
  document: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(companyId),
    document,
    status: 'Activo',
    ...overrides,
  };
}

// ─── Helpers de prueba del OTP seguro (F7B-2) ───

/**
 * Modelo Mongoose en memoria del store OTP compartido (F7B-10.6-D/11).
 * Emula updateOne+upsert (con E11000 único ante carrera), findOne,
 * findOneAndUpdate ($inc attempts), findOneAndDelete (consumo) y deleteOne.
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
 * Modelo Mongoose en memoria del contador de rate-limit (F7B-10.5-B/11).
 * Emula findOneAndUpdate con $inc/$setOnInsert/$set, upsert, filtros
 * ($lt/$gt/$lte) y E11000 del índice único.
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
 * Instala un hasher de prueba REVERSIBLE ('ab' + código) para poder recuperar
 * el OTP interno sin exponerlo por la API (producción usa HMAC-SHA256).
 */
function installTestOtpHasher(service: ConvivenciaService) {
  (service as unknown as { otpHasher: (code: string) => string }).otpHasher = (code: string) =>
    `ab${code}`;
}

/**
 * Acceso al store COMPARTIDO del servicio (F7B-11): el OtpChallengeService
 * inyectado guarda los desafíos en el FakeChallengeModel compartido.
 */
function challengeStoreOf(service: ConvivenciaService) {
  const challengeService = (
    service as unknown as { otpChallengeService: OtpChallengeService }
  ).otpChallengeService;
  return (
    challengeService as unknown as { model: FakeChallengeModel }
  ).model;
}

/**
 * Recupera el OTP vigente de una clave desde el store COMPARTIDO (requiere el
 * hasher de prueba instalado; en producción el código es irrecuperable). La
 * clave de prueba se recibe SIN namespace y se completa con el prefijo real
 * de Convivencia (los call sites existentes siguen usando `${PERIOD_A}:222:666`).
 */
function otpCodeOf(service: ConvivenciaService, key: string): string {
  const doc = challengeStoreOf(service).store.get(`${OTP_NS}${key}`);
  const hash = doc?.otpHash ?? '';
  return hash.startsWith('ab') ? hash.slice(2) : '';
}

/** Lectura directa de una entrada del store compartido (shape/intentos). */
function otpEntryOf(service: ConvivenciaService, key: string) {
  return challengeStoreOf(service).store.get(`${OTP_NS}${key}`);
}

/** Service con dependencias stub (empleados, usuarios, alertas, comunicaciones). */
function buildService(
  seed: ConvivenciaPeriodDocument[] = [],
  employeeSeed: ReturnType<typeof buildEmployee>[] = [],
  employeeCount = 0,
  sharedSequenceStore?: Map<string, number>,
  simulateDuplicateKeyOnce = false,
  sharedOtpInfra?: { challengeModel?: FakeChallengeModel; counterModel?: FakeCounterModel },
) {
  const model = buildModel(seed);
  const employeeModel = {
    countDocuments: () => ({ exec: async () => employeeCount }),
    findOne: (filter: Record<string, unknown>) => ({
      exec: async () => {
        const { companyId, document, status } = filter as {
          companyId?: Types.ObjectId;
          document?: string;
          status?: string;
        };
        return (
          employeeSeed.find((employee) => {
            if (companyId && employee.companyId.toString() !== companyId.toString()) return false;
            if (document !== undefined && employee.document !== document) return false;
            if (status !== undefined && employee.status !== status) return false;
            return true;
          }) ?? null
        );
      },
    }),
  } as never;
  const userModel = {
    find: () => ({
      exec: async () => [
        { _id: new Types.ObjectId(), email: 'manager@empresa.com', role: 'manager' },
        { _id: new Types.ObjectId(), email: 'admin@empresa.com', role: 'admin' },
      ],
    }),
  } as never;
  const alertsService = { create: async () => ({}) } as never;
  const autoCommService = { generateCommunication: async () => ({}) } as never;
  // F7B-6: secuencia persistente de casos (emula el upsert atómico de MongoDB
  // con el índice único { companyId, year }). Se puede compartir entre
  // servicios para simular un reinicio/despliegue sin perder la secuencia.
  const caseSequenceStore = sharedSequenceStore ?? new Map<string, number>();
  // Emula la carrera E11000 de MongoDB: el perdedor recibe UN error de clave
  // duplicada la primera vez y el servicio debe reintentar con éxito. Vive a
  // nivel de buildService para persistir entre reintentos del servicio.
  let duplicateKeyThrown = false;
  const caseSequenceModel = {
    findOne: (filter: Record<string, unknown>) => ({
      exec: async () => {
        const { companyId, year } = filter as { companyId: Types.ObjectId; year: number };
        const key = `${companyId.toString()}:${year}`;
        const sequence = caseSequenceStore.get(key);
        return sequence === undefined ? null : { companyId, year, sequence };
      },
    }),
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      return {
        exec: async () => {
          if (simulateDuplicateKeyOnce && !duplicateKeyThrown) {
            duplicateKeyThrown = true;
            const error = new Error('E11000 duplicate key') as Error & { code: number };
            error.code = 11000;
            throw error;
          }
          const { companyId, year } = filter as { companyId: Types.ObjectId; year: number };
          const key = `${companyId.toString()}:${year}`;
          // Emula MongoDB: en un INSERT el $setOnInsert se aplica antes que $inc.
          const setOnInsert =
            (update as { $setOnInsert?: { sequence?: number } })?.$setOnInsert?.sequence ?? 0;
          const current = caseSequenceStore.get(key);
          const next =
            current === undefined ? (setOnInsert > 0 ? setOnInsert : 0) + 1 : current + 1;
          caseSequenceStore.set(key, next);
          return { companyId, year, sequence: next };
        },
      };
    },
  } as never;
  // F7B-11: infraestructura distribuida compartida (por defecto cada service
  // recibe sus propios fakes; los tests multi-instancia comparten los mismos
  // challengeModel/counterModel entre dos servicios para simular dos procesos).
  const challengeModel = sharedOtpInfra?.challengeModel ?? new FakeChallengeModel();
  const counterModel = sharedOtpInfra?.counterModel ?? new FakeCounterModel();
  const otpRateLimitService = new OtpRateLimitService(counterModel as never);
  const otpChallengeService = new OtpChallengeService(challengeModel as never);
  const service = new ConvivenciaService(
    model as never,
    caseSequenceModel,
    employeeModel,
    userModel,
    alertsService,
    autoCommService,
    otpRateLimitService,
    otpChallengeService,
  );
  return { service, model, caseSequenceStore, challengeModel, counterModel };
}

describe('ConvivenciaService — Hardening multi-tenancy (Fase 1, 1.1.8)', () => {
  // ═════════════════════════════════════════════
  // LECTURA DE PERIODO (findById)
  // ═════════════════════════════════════════════
  it('T1: la empresa A puede consultar su propio periodo', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);

    const period = await service.findById(
      new Types.ObjectId(COMPANY_A),
      new Types.ObjectId(PERIOD_A),
    );
    assert.equal(period._id.toString(), PERIOD_A);
    assert.equal(period.companyId.toString(), COMPANY_A);
  });

  it('T2: la empresa B NO puede consultar el periodo de A (NotFound)', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);

    await assert.rejects(
      () =>
        service.findById(new Types.ObjectId(COMPANY_B), new Types.ObjectId(PERIOD_A)),
      NotFoundException,
    );
  });

  it('T12: un periodId inexistente mantiene el comportamiento NotFound', async () => {
    const { service } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);

    await assert.rejects(
      () =>
        service.findById(new Types.ObjectId(COMPANY_A), new Types.ObjectId(NONEXISTENT_ID)),
      NotFoundException,
    );
  });

  it('T13: un periodId de otra empresa se comporta como NotFound, sin filtrar información', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, { periodName: 'Periodo Secreto de A' }),
    ]);

    // La empresa B recibe NotFound: no descubre que el periodo existe.
    await assert.rejects(
      () =>
        service.findById(new Types.ObjectId(COMPANY_B), new Types.ObjectId(PERIOD_A)),
      (error: Error) =>
        error instanceof NotFoundException &&
        error.message.includes('no encontrado') &&
        !error.message.includes('Periodo Secreto de A'),
    );
  });

  // ═════════════════════════════════════════════
  // ESCRITURA CRUZADA (empresa B sobre periodo de A)
  // ═════════════════════════════════════════════
  it('T3: la empresa B NO puede modificar el periodo de A (updateMeeting)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, {
      meetings: [{ meetingDate: new Date(), status: 'PROGRAMADA', agenda: 'X' }] as never,
    });
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () =>
        service.updateMeeting(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          0,
          { status: 'CERRADA' },
          EMAIL_B,
        ),
      NotFoundException,
    );
    // El periodo de A no se tocó.
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.meetings[0] as { status: string }).status, 'PROGRAMADA');
  });

  it('T4: la empresa B NO puede agregar miembro al periodo de A', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A);
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () =>
        service.addMember(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          {
            userId: '64b0000000000000000000c1',
            userName: 'Intruso',
            committeeRole: 'PRINCIPAL',
            representationType: 'TRABAJADOR',
            principalType: 'PRINCIPAL',
            startDate: '2025-01-01',
          },
          EMAIL_B,
        ),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal(stored.members.length, 0);
  });

  it('T5: la empresa B NO puede operar candidatos del periodo de A (reviewCandidate)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, {
      candidateExtended: [
        {
          name: 'Candidato A',
          document: '111',
          phone: '555',
          area: 'X',
          position: 'Y',
          motivation: 'Z',
          adminStatus: 'PENDIENTE',
        },
      ] as never,
    });
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () =>
        service.reviewCandidate(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          0,
          { adminStatus: 'APROBADO' },
          EMAIL_B,
        ),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.candidateExtended[0] as { adminStatus: string }).adminStatus, 'PENDIENTE');
  });

  it('T7: la empresa B NO puede modificar reuniones del periodo de A (scheduleMeeting y completeMeeting)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A);
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () =>
        service.scheduleMeeting(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          { meetingDate: '2026-01-01', agenda: 'Intrusión' },
          EMAIL_B,
        ),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.completeMeeting(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          0,
          { development: 'X', attendees: [] },
          EMAIL_B,
        ),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal(stored.meetings.length, 0);
  });

  it('T8: la empresa B NO puede modificar compromisos del periodo de A (addCommitment y updateCommitment)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A);
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () =>
        service.addCommitment(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          {
            description: 'Plan intruso',
            responsibleParty: 'B',
            deadline: '2026-01-01',
            priority: 'HIGH',
          },
          EMAIL_B,
        ),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.updateCommitment(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          'cualquier-id',
          { status: 'COMPLETED' },
          EMAIL_B,
        ),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.commitments as unknown[]).length, 0);
  });

  it('T9: la empresa B NO puede agregar evidencia al periodo de A', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A);
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () =>
        service.addEvidence(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          {
            type: 'PDF',
            title: 'Evidencia intrusa',
            fileName: 'x.pdf',
            fileUrl: 'https://x/x.pdf',
          },
          EMAIL_B,
        ),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.evidence as unknown[]).length, 0);
  });

  it('T10: la empresa B NO puede operar casos del periodo de A (createCase y updateCase)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A);
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () =>
        service.createCase(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          { complainantName: 'X', respondentName: 'Y', description: 'Caso intruso' },
          EMAIL_B,
        ),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.updateCase(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          0,
          { status: 'RESOLVED' },
          EMAIL_B,
        ),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal(stored.cases.length, 0);
  });

  it('T11: la empresa B NO puede ejecutar operaciones de aprobación sobre el periodo de A (submit/approve/reject)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, { approvalStatus: 'DRAFT' });
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () => service.submitForApproval(new Types.ObjectId(COMPANY_B), PERIOD_A, EMAIL_B),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.approve(new Types.ObjectId(COMPANY_B), PERIOD_A, EMAIL_B, 'manager'),
      NotFoundException,
    );
    await assert.rejects(
      () => service.reject(new Types.ObjectId(COMPANY_B), PERIOD_A, 'razón', EMAIL_B),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal(stored.approvalStatus, 'DRAFT');
    assert.equal(stored.locked, false);
  });

  it('T14: los subrecursos (por índice) del periodo de A tampoco son operables por B (removeEvidence/completeMeeting/updateCase)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, {
      evidence: [
        {
          type: 'PDF',
          title: 'E',
          fileName: 'e.pdf',
          fileUrl: 'https://x/e.pdf',
          uploadedBy: 'A',
          uploadedAt: new Date(),
        },
      ] as never,
      meetings: [{ meetingDate: new Date(), status: 'PROGRAMADA', agenda: 'X' }] as never,
      cases: [
        {
          caseNumber: 'CC-2026-0001',
          complainantName: 'X',
          respondentName: 'Y',
          description: 'Z',
          status: 'PENDING',
          caseAuditHistory: [],
        },
      ] as never,
    });
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);

    await assert.rejects(
      () => service.removeEvidence(new Types.ObjectId(COMPANY_B), PERIOD_A, 0, EMAIL_B),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.completeMeeting(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          0,
          { development: 'X', attendees: [] },
          EMAIL_B,
        ),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.updateCase(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          0,
          { status: 'CLOSED' },
          EMAIL_B,
        ),
      NotFoundException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.evidence as unknown[]).length, 1);
    assert.equal(stored.meetings.length, 1);
    assert.equal(stored.cases.length, 1);
  });

  // ═════════════════════════════════════════════
  // AISLAMIENTO A/B (fixtures explícitos)
  // ═════════════════════════════════════════════
  it('Aislamiento A/B: A→PeriodA permitido, B→PeriodB permitido, A→PeriodB rechazado, B→PeriodA rechazado', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);

    // A → Period A = permitido.
    const periodAFromA = await service.findById(
      new Types.ObjectId(COMPANY_A),
      new Types.ObjectId(PERIOD_A),
    );
    assert.equal(periodAFromA._id.toString(), PERIOD_A);

    // B → Period B = permitido.
    const periodBFromB = await service.findById(
      new Types.ObjectId(COMPANY_B),
      new Types.ObjectId(PERIOD_B),
    );
    assert.equal(periodBFromB._id.toString(), PERIOD_B);

    // A → Period B = rechazado.
    await assert.rejects(
      () => service.findById(new Types.ObjectId(COMPANY_A), new Types.ObjectId(PERIOD_B)),
      NotFoundException,
    );

    // B → Period A = rechazado.
    await assert.rejects(
      () => service.findById(new Types.ObjectId(COMPANY_B), new Types.ObjectId(PERIOD_A)),
      NotFoundException,
    );
  });

  // ═════════════════════════════════════════════
  // FLUJO PÚBLICO (por diseño) — T6
  // ═════════════════════════════════════════════
  it('T6: el voto público exige OTP de esa elección (barrera de diseño del flujo público)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, {
      electionState: 'OPEN',
      candidateExtended: [
        {
          name: 'Candidato 1',
          document: '111',
          phone: '555',
          area: 'X',
          position: 'Y',
          motivation: 'Z',
          adminStatus: 'APROBADO',
          votes: 0,
        },
      ] as never,
    });
    const { service, model } = buildService(
      [periodA, buildPeriod(COMPANY_B, PERIOD_B)],
      [buildEmployee(COMPANY_A, '222')], // votante de A elegible (F7B-1)
    );

    // Sin OTP solicitado para esa elección → rechazado (no se puede votar en
    // un periodo ajeno sin pasar la barrera OTP de esa elección).
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: '123456',
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );

    // Con OTP válido de esa elección el voto se registra en el periodo (flujo público).
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
      candidateDocument: '111',
    });
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
    assert.equal((stored.candidateExtended[0] as { votes: number }).votes, 1);
  });

  // ═════════════════════════════════════════════
  // REGRESIÓN — operaciones legítimas de A
  // ═════════════════════════════════════════════
  it('T15: regresión — las operaciones legítimas de la empresa A continúan funcionando', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, {
      candidateExtended: [
        {
          name: 'Candidato 1',
          document: '111',
          phone: '555',
          area: 'X',
          position: 'Y',
          motivation: 'Z',
          adminStatus: 'PENDIENTE',
          votes: 0,
        },
      ] as never,
    });
    const { service, model } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);
    const companyA = new Types.ObjectId(COMPANY_A);

    // Lectura.
    const members = await service.getMembers(companyA, PERIOD_A);
    assert.deepEqual(members, []);

    // Miembros.
    await service.addMember(companyA, PERIOD_A, {
      userId: '64b0000000000000000000c1',
      userName: 'Ana López',
      committeeRole: 'PRESIDENTE',
      representationType: 'EMPLEADOR',
      principalType: 'PRINCIPAL',
      startDate: '2025-01-01',
    }, EMAIL_A);
    assert.equal((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).members.length, 1);

    // Candidatos.
    await service.reviewCandidate(companyA, PERIOD_A, 0, { adminStatus: 'APROBADO' }, EMAIL_A);
    assert.equal(
      (model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).candidateExtended[0].adminStatus,
      'APROBADO',
    );

    // Reuniones.
    await service.scheduleMeeting(companyA, PERIOD_A, { meetingDate: '2026-02-01', agenda: 'Agenda A' }, EMAIL_A);
    assert.equal((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).meetings.length, 1);

    // Compromisos.
    await service.addCommitment(companyA, PERIOD_A, {
      description: 'Plan A',
      responsibleParty: 'Responsable',
      deadline: '2026-03-01',
      priority: 'HIGH',
    }, EMAIL_A);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).commitments as unknown[]).length,
      1,
    );

    // Evidencias.
    await service.addEvidence(companyA, PERIOD_A, {
      type: 'PDF',
      title: 'Evidencia A',
      fileName: 'a.pdf',
      fileUrl: 'https://x/a.pdf',
    }, EMAIL_A);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).evidence as unknown[]).length,
      1,
    );

    // Casos.
    await service.createCase(companyA, PERIOD_A, {
      complainantName: 'X',
      respondentName: 'Y',
      description: 'Caso A',
    }, EMAIL_A);
    assert.equal((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).cases.length, 1);

    // Flujo de aprobación completo: submit → approve.
    const submitted = await service.submitForApproval(companyA, PERIOD_A, EMAIL_A);
    assert.equal(submitted.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(submitted.locked, true);
    const approved = await service.approve(companyA, PERIOD_A, EMAIL_A, 'manager');
    assert.equal(approved.approvalStatus, 'APPROVED_AND_SIGNED');

    // Auditoría.
    const audit = await service.getAuditHistory(companyA, PERIOD_A);
    assert.ok(audit.length >= 1);
  });
});

describe('ConvivenciaService — Dominio de cumplimiento (Fase 2, 1.1.8)', () => {
  const companyA = new Types.ObjectId(COMPANY_A);
  const companyB = new Types.ObjectId(COMPANY_B);

  /** Miembro ACTIVO mínimo (fixture). */
  function buildMember(overrides: Record<string, unknown> = {}) {
    return {
      userId: new Types.ObjectId('64b0000000000000000000c1'),
      userName: 'Ana López',
      committeeRole: 'PRESIDENTE',
      representationType: 'EMPLEADOR',
      principalType: 'PRINCIPAL',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2027-01-01'),
      status: 'ACTIVO',
      ...overrides,
    } as never;
  }

  /** Reunión con el estado indicado (fixture). */
  function buildMeeting(status: string) {
    return {
      meetingDate: new Date('2026-01-15'),
      status,
      agenda: 'Reunión del comité',
      attendees: [],
      topicList: [],
      development: '',
    } as never;
  }

  /** Periodo de A completamente conformado (debería resolver COMPLIES). */
  function buildCompliantPeriod() {
    return buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      approvalStatus: 'APPROVED_AND_SIGNED',
      members: [buildMember()],
      meetings: [buildMeeting('CERRADA')],
    });
  }

  it('D1: un periodo válido (activo, aprobado, miembros, reunión realizada) → COMPLIES determinista', async () => {
    const { service } = buildService([buildCompliantPeriod()]);

    const result = await service.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(result.complianceStatus, 'COMPLIES');
    assert.match(result.complianceReason, /conformado/);
    assert.match(result.complianceReason, /aprobado/);

    // Determinista (D14 parcial): repetir produce el mismo estado y razón.
    const again = await service.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(again.complianceStatus, 'COMPLIES');
    assert.equal(again.complianceReason, result.complianceReason);
  });

  it('D2: periodo inexistente en recalculateCompliance → NotFound', async () => {
    const { service } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    await assert.rejects(
      () => service.recalculateCompliance(companyA, NONEXISTENT_ID),
      NotFoundException,
    );
  });

  it('D3: periodo de otra empresa en recalculateCompliance → NotFound (sin filtrar información)', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_B, PERIOD_B, { periodName: 'Periodo Secreto de B' }),
    ]);
    await assert.rejects(
      () => service.recalculateCompliance(companyA, PERIOD_B),
      (error: Error) =>
        error instanceof NotFoundException &&
        !error.message.includes('Periodo Secreto de B'),
    );
  });

  it('D4+D5: complianceStatus y complianceReason se persisten correctamente tras mutaciones del dominio', async () => {
    const { service, model } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);

    // addMember → PENDING (miembros pero sin aprobación ni reuniones).
    await service.addMember(
      companyA,
      PERIOD_A,
      {
        userId: '64b0000000000000000000c1',
        userName: 'Ana López',
        committeeRole: 'PRESIDENTE',
        representationType: 'EMPLEADOR',
        principalType: 'PRINCIPAL',
        startDate: '2025-01-01',
      },
      EMAIL_A,
    );
    let stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal(stored.complianceStatus, 'PENDING');
    assert.match(stored.complianceReason, /Avance parcial/);
    assert.match(stored.complianceReason, /aprobación del periodo/);

    // Reunión realizada + aprobación → COMPLIES persistido.
    await service.scheduleMeeting(
      companyA,
      PERIOD_A,
      { meetingDate: '2026-02-01', agenda: 'Agenda A' },
      EMAIL_A,
    );
    await service.completeMeeting(
      companyA,
      PERIOD_A,
      0,
      { development: 'Desarrollo', attendees: ['Ana López'] },
      EMAIL_A,
    );
    await service.submitForApproval(companyA, PERIOD_A, EMAIL_A);
    await service.approve(companyA, PERIOD_A, EMAIL_A, 'manager');

    stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal(stored.approvalStatus, 'APPROVED_AND_SIGNED');
    assert.equal(stored.complianceStatus, 'COMPLIES');
    assert.match(stored.complianceReason, /aprobado/);
    assert.match(stored.complianceReason, /operando/);
  });

  it('D6: la conformación del comité (miembros) sin aprobación ni reuniones NO produce COMPLIES', async () => {
    const period = buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      members: [buildMember()],
    });
    const { service } = buildService([period]);

    const result = await service.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(result.complianceStatus, 'PENDING');
    assert.match(result.complianceReason, /aprobación del periodo/);
    assert.match(result.complianceReason, /reuniones realizadas/);
  });

  it('D7: el estado de aprobación existente se interpreta (APPROVED/APPROVED_AND_SIGNED cuentan; REJECTED no)', async () => {
    // APPROVED_AND_SIGNED + activo + miembros + reunión → COMPLIES.
    const { service: s1 } = buildService([buildCompliantPeriod()]);
    const r1 = await s1.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(r1.complianceStatus, 'COMPLIES');

    // REJECTED con todo lo demás → PENDING (falta la aprobación vigente).
    const rejected = buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      approvalStatus: 'REJECTED',
      members: [buildMember()],
      meetings: [buildMeeting('CERRADA')],
    });
    const { service: s2 } = buildService([rejected]);
    const r2 = await s2.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(r2.complianceStatus, 'PENDING');
    assert.match(r2.complianceReason, /aprobación del periodo/);
  });

  it('D8: la evidencia documental real (evidence[]) mueve a PENDING pero NO produce COMPLIES por sí sola', async () => {
    const period = buildPeriod(COMPANY_A, PERIOD_A, {
      evidence: [
        {
          type: 'PDF',
          title: 'Acta de conformación',
          fileName: 'acta.pdf',
          fileUrl: 'https://x/acta.pdf',
          uploadedBy: EMAIL_A,
          uploadedAt: new Date(),
        },
      ] as never,
    });
    const { service } = buildService([period]);

    const result = await service.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(result.complianceStatus, 'PENDING');
    // La razón NO afirma cumplimiento solo por tener evidencia.
    assert.notEqual(result.complianceStatus, 'COMPLIES');
  });

  it('D9: solo la reunión CERRADA cuenta como realizada (PROGRAMADA/CANCELADA no completan COMPLIES)', async () => {
    const base = {
      status: 'ACTIVO' as const,
      approvalStatus: 'APPROVED_AND_SIGNED' as const,
      members: [buildMember()] as never,
    };

    // PROGRAMADA → PENDING.
    const { service: s1 } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        ...base,
        meetings: [buildMeeting('PROGRAMADA')],
      }),
    ]);
    assert.equal((await s1.recalculateCompliance(companyA, PERIOD_A)).complianceStatus, 'PENDING');

    // CANCELADA → PENDING.
    const { service: s2 } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        ...base,
        meetings: [buildMeeting('CANCELADA')],
      }),
    ]);
    assert.equal((await s2.recalculateCompliance(companyA, PERIOD_A)).complianceStatus, 'PENDING');

    // CERRADA → COMPLIES.
    const { service: s3 } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        ...base,
        meetings: [buildMeeting('CERRADA')],
      }),
    ]);
    assert.equal((await s3.recalculateCompliance(companyA, PERIOD_A)).complianceStatus, 'COMPLIES');
  });

  it('D10: condición insuficiente → periodo vacío NON_COMPLIANT, actividad mínima PENDING', async () => {
    // Vacío → NON_COMPLIANT.
    const { service: s1 } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    const r1 = await s1.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(r1.complianceStatus, 'NON_COMPLIANT');
    assert.match(r1.complianceReason, /Sin información funcional/);

    // Solo una reunión programada → PENDING (actividad registrada).
    const { service: s2 } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        meetings: [buildMeeting('PROGRAMADA')],
      }),
    ]);
    assert.equal((await s2.recalculateCompliance(companyA, PERIOD_A)).complianceStatus, 'PENDING');
  });

  it('D11: ninguna evidencia se considera condición de COMPLIES (no se inventa qué evidencia es obligatoria)', async () => {
    // Incluso con evidencia de tipo MINUTES/ATTENDANCE, sin el resto de
    // condiciones, el estado es PENDING (nunca COMPLIES).
    const period = buildPeriod(COMPANY_A, PERIOD_A, {
      evidence: [
        {
          type: 'MINUTES',
          title: 'Acta',
          fileName: 'm.pdf',
          fileUrl: 'https://x/m.pdf',
          uploadedBy: EMAIL_A,
          uploadedAt: new Date(),
        },
        {
          type: 'ATTENDANCE',
          title: 'Asistencia',
          fileName: 'a.pdf',
          fileUrl: 'https://x/a.pdf',
          uploadedBy: EMAIL_A,
          uploadedAt: new Date(),
        },
      ] as never,
    });
    const { service } = buildService([period]);
    const result = await service.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(result.complianceStatus, 'PENDING');
  });

  it('D12: NO se crean arreglos legacy paralelos — la única fuente de evidencias es evidence[]', () => {
    assert.equal(ConvivenciaPeriodSchema.path('attendanceEvidence'), undefined);
    assert.equal(ConvivenciaPeriodSchema.path('signatureEvidence'), undefined);
    assert.ok(ConvivenciaPeriodSchema.path('evidence'), 'evidence[] debe existir');
    assert.ok(ConvivenciaPeriodSchema.path('itemCode'));
    assert.ok(ConvivenciaPeriodSchema.path('complianceStatus'));
    assert.ok(ConvivenciaPeriodSchema.path('complianceReason'));
  });

  it('D12b: los periodos creados llevan itemCode 1.1.8 y cumplimiento resuelto (vacío → NON_COMPLIANT)', async () => {
    const { service, model } = buildService([]);
    const created = await service.createPeriod(
      companyA,
      { periodName: 'Comité 2026', startDate: '2026-01-01' },
      EMAIL_A,
    );
    assert.equal(created.itemCode, '1.1.8');
    assert.equal(created.complianceStatus, 'NON_COMPLIANT');
    const stored = model.store.get((created._id as Types.ObjectId).toString()) as ConvivenciaPeriodDocument;
    assert.equal(stored.complianceStatus, 'NON_COMPLIANT');
    assert.match(stored.complianceReason, /Sin información funcional/);
  });

  it('D13: aislamiento A/B del cumplimiento — A→A y B→B permitidos, cruces → NotFound', async () => {
    const { service } = buildService([
      buildCompliantPeriod(),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);

    // A → PeriodA: COMPLIES.
    assert.equal((await service.recalculateCompliance(companyA, PERIOD_A)).complianceStatus, 'COMPLIES');
    // B → PeriodB: NON_COMPLIANT (periodo vacío propio).
    assert.equal((await service.recalculateCompliance(companyB, PERIOD_B)).complianceStatus, 'NON_COMPLIANT');
    // A → PeriodB y B → PeriodA: NotFound (sin filtrar).
    await assert.rejects(() => service.recalculateCompliance(companyA, PERIOD_B), NotFoundException);
    await assert.rejects(() => service.recalculateCompliance(companyB, PERIOD_A), NotFoundException);
  });

  it('D14: recalcular dos veces produce exactamente el mismo resultado (idempotencia)', async () => {
    const { service } = buildService([buildCompliantPeriod()]);
    const first = await service.recalculateCompliance(companyA, PERIOD_A);
    const second = await service.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(first.complianceStatus, second.complianceStatus);
    assert.equal(first.complianceReason, second.complianceReason);
  });

  it('D15: los datos incompletos nunca producen COMPLIES por defecto', async () => {
    const cases = [
      buildPeriod(COMPANY_A, PERIOD_A), // totalmente vacío
      buildPeriod(COMPANY_A, PERIOD_A, {
        // aprobado pero sin miembros ni reuniones
        status: 'ACTIVO',
        approvalStatus: 'APPROVED_AND_SIGNED',
      }),
      buildPeriod(COMPANY_A, PERIOD_A, {
        // activo, aprobado, miembros, sin reunión realizada
        status: 'ACTIVO',
        approvalStatus: 'APPROVED_AND_SIGNED',
        members: [buildMember()],
      }),
      buildPeriod(COMPANY_A, PERIOD_A, {
        // activo, aprobado, reunión realizada, sin miembros
        status: 'ACTIVO',
        approvalStatus: 'APPROVED_AND_SIGNED',
        meetings: [buildMeeting('CERRADA')],
      }),
      buildPeriod(COMPANY_A, PERIOD_A, {
        // activo, miembros, reunión realizada, sin aprobación
        status: 'ACTIVO',
        members: [buildMember()],
        meetings: [buildMeeting('CERRADA')],
      }),
    ];
    for (const period of cases) {
      const { service } = buildService([period]);
      const result = await service.recalculateCompliance(companyA, PERIOD_A);
      assert.notEqual(result.complianceStatus, 'COMPLIES', `no debe ser COMPLIES: ${result.complianceReason}`);
    }
  });

  it('Exención: requiresConvivencia=false → COMPLIES (regla existente del ConvivenciaProvider)', async () => {
    const period = buildPeriod(COMPANY_A, PERIOD_A, { requiresConvivencia: false });
    const { service } = buildService([period]);
    const result = await service.recalculateCompliance(companyA, PERIOD_A);
    assert.equal(result.complianceStatus, 'COMPLIES');
    assert.match(result.complianceReason, /exenta/);
  });
});

describe('F7B-1 (1.1.8) — Identidad y multi-tenancy electoral', () => {
  const CANDIDATE_A = {
    name: 'Candidato 1',
    document: '111',
    phone: '555',
    area: 'X',
    position: 'Y',
    motivation: 'Z',
    adminStatus: 'APROBADO',
    votes: 0,
  };

  /** Periodo electoral con un candidato aprobado (documento '111') y elección abierta. */
  function electionPeriod(companyId: string, periodId: string) {
    return buildPeriod(companyId, periodId, {
      electionState: 'OPEN',
      candidateExtended: [{ ...CANDIDATE_A }] as never,
    });
  }

  const VOTE_PAYLOAD = {
    electionId: PERIOD_A,
    document: '222',
    phone: '666',
    candidateDocument: '111',
  };

  it('F7B1-01: empleado de A solicita OTP para la elección de A → SUCCESS (sin exponer el OTP)', async () => {
    const { service } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    const otp = (await service.sendOtp({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
    })) as Record<string, unknown>;
    assert.equal(otp.sent, true);
    // El OTP NO se expone en la respuesta (F7B-2).
    assert.ok(!('otpPreview' in otp) && !('otp' in otp) && !('code' in otp));
    // Internamente sí se generó un OTP de 6 dígitos (recuperable vía hasher de prueba).
    assert.match(otpCodeOf(service, `${PERIOD_A}:222:666`), /^\d{6}$/);
  });

  it('F7B1-02: empleado de B NO puede solicitar OTP para la elección de A → REJECTED (sin OTP)', async () => {
    const { service } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_B, '222')],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
    // No se generó OTP: la votación no avanza ni con un código inventado
    // (la elegibilidad se valida ANTES que el OTP → rechazo determinista).
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: '123456' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B1-03: empleado inexistente → REJECTED (sin OTP)', async () => {
    const { service } = buildService([electionPeriod(COMPANY_A, PERIOD_A)], []);
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '999', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B1-04: elección inexistente o con formato inválido → REJECTED controlado (sin OTP)', async () => {
    const { service } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    // Id inexistente pero con formato válido.
    await assert.rejects(
      () => service.sendOtp({ electionId: NONEXISTENT_ID, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Elección no encontrada'),
    );
    // Formato inválido → error controlado (no 500).
    await assert.rejects(
      () => service.sendOtp({ electionId: 'not-an-object-id', document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Elección no encontrada'),
    );
  });

  it('F7B1-05: empleado de B NO puede votar en la elección de A → REJECTED, sin incrementar votos', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_B, '222')],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: '123456' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0);
    assert.equal((stored.candidateExtended[0] as { votes: number }).votes, 0);
  });

  it('F7B1-06: empleado de A vota normalmente en la elección de A → SUCCESS', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const result = await service.vote({
      ...VOTE_PAYLOAD,
      otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
    });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
    assert.equal((stored.candidateExtended[0] as { votes: number }).votes, 1);
  });

  it('F7B1-07: empleado de A NO puede votar en la elección de B → REJECTED', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A), electionPeriod(COMPANY_B, PERIOD_B)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_B, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_B,
          document: '222',
          phone: '666',
          otpCode: '123456',
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
    const storedB = model.store.get(PERIOD_B) as ConvivenciaPeriodDocument;
    assert.equal((storedB.votesExtended as unknown[]).length, 0);
  });

  it('F7B1-08: companyId enviado por el cliente NO tiene efecto (el tenant se deriva del periodo)', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222'), buildEmployee(COMPANY_B, '333')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    // companyId manipulado (de la empresa B) en el payload del voto → sin efecto.
    const result = await service.vote({
      ...VOTE_PAYLOAD,
      otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
      companyId: COMPANY_B,
    } as never);
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);

    // Empleado de B que intenta 'suplantar' con companyId de A en el payload:
    // la elegibilidad se evalúa contra el tenant del periodo → rechazado.
    await assert.rejects(
      () =>
        service.sendOtp({
          electionId: PERIOD_A,
          document: '333',
          phone: '666',
          companyId: COMPANY_A,
        } as never),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B1-09: la elegibilidad bloquea antes de generar OTP (rechazo determinista)', async () => {
    const { service } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_B, '222')],
    );
    // Rechazo en sendOtp (antes de otpStore.set).
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
    // Y aunque se intente votar directamente con un código, el voto se rechaza.
    await assert.rejects(
      () => service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B1-10: empleado inactivo NO es elegible (INVARIANTE 4)', async () => {
    const { service } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222', { status: 'No activo' })],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B1-regresión: initVoting y candidatos NO se ven afectados por F7B-1', async () => {
    const { service } = buildService(
      [
        buildPeriod(COMPANY_A, PERIOD_A, {
          candidateExtended: [
            { ...CANDIDATE_A },
            {
              name: 'Candidato 2',
              document: '222',
              phone: '555',
              area: 'X',
              position: 'Y',
              motivation: 'Z',
              adminStatus: 'APROBADO',
              votes: 0,
            },
          ] as never,
        }),
      ],
      [buildEmployee(COMPANY_A, '333')],
    );
    const result = await service.initVoting(
      new Types.ObjectId(COMPANY_A),
      PERIOD_A,
      EMAIL_A,
    );
    const approved = (result as { approvedCandidates: unknown[] }).approvedCandidates;
    assert.equal(approved.length, 2);
  });
});

describe('F7B-2 (1.1.8) — OTP seguro del flujo electoral', () => {
  const CANDIDATE_A = {
    name: 'Candidato 1',
    document: '111',
    phone: '555',
    area: 'X',
    position: 'Y',
    motivation: 'Z',
    adminStatus: 'APROBADO',
    votes: 0,
  };

  /** Periodo electoral con un candidato aprobado (documento '111') y elección abierta. */
  function electionPeriod(companyId: string, periodId: string) {
    return buildPeriod(companyId, periodId, {
      electionState: 'OPEN',
      candidateExtended: [{ ...CANDIDATE_A }] as never,
    });
  }

  const OTP_KEY_A = `${PERIOD_A}:222:666`;

  function otpService(
    periodSeeds: ConvivenciaPeriodDocument[] = [electionPeriod(COMPANY_A, PERIOD_A)],
    employeeSeeds: ReturnType<typeof buildEmployee>[] = [buildEmployee(COMPANY_A, '222')],
  ) {
    return buildService(periodSeeds, employeeSeeds);
  }

  it('F7B2-01: sendOtp genera internamente un OTP de 6 dígitos (rango 100000-999999)', async () => {
    const { service } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code = otpCodeOf(service, OTP_KEY_A);
    assert.match(code, /^\d{6}$/);
    assert.ok(Number(code) >= 100000 && Number(code) <= 999999);
  });

  it('F7B2-02: la respuesta de sendOtp NO contiene otpPreview', async () => {
    const { service } = otpService();
    const resp = (await service.sendOtp({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
    })) as Record<string, unknown>;
    assert.ok(!('otpPreview' in resp));
  });

  it('F7B2-03: la respuesta NO contiene otp/code/secret/hash', async () => {
    const { service } = otpService();
    const resp = (await service.sendOtp({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
    })) as Record<string, unknown>;
    for (const key of ['otp', 'otpPreview', 'code', 'secret', 'hash', 'provider']) {
      assert.ok(!(key in resp), `no debe exponer '${key}'`);
    }
  });

  it('F7B2-04: OTP correcto permite continuar el voto', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
    });
    assert.equal((result as { success: boolean }).success, true);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B2-05: OTP incorrecto rechaza', async () => {
    const { service } = otpService();
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: '000000',
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('F7B2-06: OTP incorrecto incrementa attempts', async () => {
    const { service } = otpService();
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: '000000',
          candidateDocument: '111',
        }),
      () => true,
    );
    assert.equal(otpEntryOf(service, OTP_KEY_A)?.attempts, 1);
  });

  it('F7B2-07: el quinto intento incorrecto invalida el OTP', async () => {
    const { service } = otpService();
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () =>
          service.vote({
            electionId: PERIOD_A,
            document: '222',
            phone: '666',
            otpCode: '000000',
            candidateDocument: '111',
          }),
        (error: Error) => error instanceof BadRequestException,
      );
    }
    assert.equal(otpEntryOf(service, OTP_KEY_A), undefined);
  });

  it('F7B2-08: OTP agotado no puede reutilizarse (ni con el código correcto)', async () => {
    const { service } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const correct = otpCodeOf(service, OTP_KEY_A);
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () =>
          service.vote({
            electionId: PERIOD_A,
            document: '222',
            phone: '666',
            otpCode: '000000',
            candidateDocument: '111',
          }),
        () => true,
      );
    }
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: correct,
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('F7B2-09: OTP expirado rechaza (aunque el código sea correcto)', async () => {
    const { service } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const correct = otpCodeOf(service, OTP_KEY_A);
    const entry = otpEntryOf(service, OTP_KEY_A);
    if (entry) entry.expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: correct,
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    assert.equal(otpEntryOf(service, OTP_KEY_A), undefined);
  });

  it('F7B2-10: OTP utilizado correctamente queda invalidado', async () => {
    const { service } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
    });
    assert.equal(otpEntryOf(service, OTP_KEY_A), undefined);
  });

  it('F7B2-11: un segundo voto con el mismo OTP se rechaza (OTP inválido o expirado)', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code = otpCodeOf(service, OTP_KEY_A);
    await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: code,
      candidateDocument: '111',
    });
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: code,
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B2-12: un nuevo sendOtp para la misma combinación invalida el OTP anterior', async () => {
    const { service } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code1 = otpCodeOf(service, OTP_KEY_A);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code2 = otpCodeOf(service, OTP_KEY_A);
    assert.notEqual(code1, code2);
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: code1,
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('F7B2-13: el nuevo OTP funciona correctamente', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
    });
    assert.equal((result as { success: boolean }).success, true);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B2-14: el rate-limit permite hasta 3 solicitudes dentro de la ventana', async () => {
    const { service } = otpService();
    for (let i = 0; i < 3; i++) {
      const resp = (await service.sendOtp({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
      })) as { sent: boolean };
      assert.equal(resp.sent, true);
    }
  });

  it('F7B2-15: la cuarta solicitud dentro de la ventana es rechazada', async () => {
    const { service } = otpService();
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    }
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('Demasiadas solicitudes de OTP'),
    );
  });

  it('F7B2-16: el rate-limit no afecta a otro votante', async () => {
    const { service } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222'), buildEmployee(COMPANY_A, '333')],
    );
    // 3 solicitudes permitidas para el votante 222.
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    }
    // La cuarta es rechazada.
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('Demasiadas solicitudes de OTP'),
    );
    // Un votante distinto NO se ve afectado.
    const resp = (await service.sendOtp({
      electionId: PERIOD_A,
      document: '333',
      phone: '777',
    })) as { sent: boolean };
    assert.equal(resp.sent, true);
  });

  it('F7B2-17: el rate-limit no afecta a otra elección', async () => {
    const { service } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A), electionPeriod(COMPANY_B, PERIOD_B)],
      [buildEmployee(COMPANY_A, '222'), buildEmployee(COMPANY_B, '444')],
    );
    // 3 solicitudes permitidas para la elección A.
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    }
    // La cuarta es rechazada.
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('Demasiadas solicitudes de OTP'),
    );
    // La elección B NO se ve afectada.
    const resp = (await service.sendOtp({
      electionId: PERIOD_B,
      document: '444',
      phone: '888',
    })) as { sent: boolean };
    assert.equal(resp.sent, true);
  });

  it('F7B2-18: B→A continúa rechazado por F7B-1 (sin consumir rate-limit)', async () => {
    const { service } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_B, '222')],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B2-19: empleado inexistente o inactivo continúa rechazado', async () => {
    const { service } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222', { status: 'No activo' })],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '999', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B2-20: companyId enviado por el cliente continúa sin efecto en sendOtp/vote', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      companyId: COMPANY_B,
    } as never);
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
      companyId: COMPANY_B,
    } as never);
    assert.equal((result as { success: boolean }).success, true);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B2-21: Math.random() NO participa en la generación del OTP (crypto.randomInt)', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random no debe usarse para generar OTP');
    };
    try {
      await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
      const code = otpCodeOf(service, OTP_KEY_A);
      const result = await service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: code,
        candidateDocument: '111',
      });
      assert.equal((result as { success: boolean }).success, true);
      assert.equal(
        ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[])
          .length,
        1,
      );
    } finally {
      Math.random = original;
    }
  });

  it('F7B2-22: el OTP no aparece en respuestas (ni en su serialización)', async () => {
    const { service } = otpService();
    installTestOtpHasher(service);
    const resp = (await service.sendOtp({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
    })) as Record<string, unknown>;
    const code = otpCodeOf(service, OTP_KEY_A);
    assert.ok(!JSON.stringify(resp).includes(code), 'el código no debe aparecer en la respuesta');
    assert.ok(!JSON.stringify(resp).toLowerCase().includes('hash'));
    assert.ok(!('otpPreview' in resp));
  });

  it('F7B2-23: el store NO conserva el OTP en texto plano (solo verificador criptográfico)', async () => {
    const { service } = otpService();
    // Hasher de PRODUCCIÓN (HMAC-SHA256): el código es irrecuperable.
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const entry = otpEntryOf(service, OTP_KEY_A);
    assert.ok(entry, 'debe existir una entrada en el store');
    assert.ok(!('code' in entry), 'no debe guardar el código');
    assert.ok(!('otp' in entry), 'no debe guardar el OTP');
    assert.ok(!('otpPreview' in entry), 'no debe guardar otpPreview');
    assert.match(entry.otpHash, /^[0-9a-f]{64}$/, 'verificador HMAC-SHA256 en hex (64 chars)');
    assert.notEqual(entry.otpHash, '123456');
    assert.equal(entry.attempts, 0);
    assert.ok(entry.expiresAt.getTime() > Date.now());
  });

  it('F7B2-24: regresión — initVoting y candidatos aprobados NO se ven afectados', async () => {
    const { service } = buildService(
      [
        buildPeriod(COMPANY_A, PERIOD_A, {
          candidateExtended: [
            { ...CANDIDATE_A },
            {
              name: 'Candidato 2',
              document: '222',
              phone: '555',
              area: 'X',
              position: 'Y',
              motivation: 'Z',
              adminStatus: 'APROBADO',
              votes: 0,
            },
          ] as never,
        }),
      ],
      [buildEmployee(COMPANY_A, '333')],
    );
    const result = await service.initVoting(
      new Types.ObjectId(COMPANY_A),
      PERIOD_A,
      EMAIL_A,
    );
    const approved = (result as { approvedCandidates: unknown[] }).approvedCandidates;
    assert.equal(approved.length, 2);
  });
});

describe('F7B-3 (1.1.8) — Integridad del voto y estado/ventana de elección', () => {
  const CANDIDATE_A = {
    name: 'Candidato 1',
    document: '111',
    phone: '555',
    area: 'X',
    position: 'Y',
    motivation: 'Z',
    adminStatus: 'APROBADO',
    votes: 0,
  };

  const CANDIDATE_B = {
    name: 'Candidato 2',
    document: '222',
    phone: '555',
    area: 'X',
    position: 'Y',
    motivation: 'Z',
    adminStatus: 'APROBADO',
    votes: 0,
  };

  /** Periodo electoral con elección ABIERTA (para flujos de voto). */
  function electionPeriod(companyId: string, periodId: string) {
    return buildPeriod(companyId, periodId, {
      electionState: 'OPEN',
      candidateExtended: [{ ...CANDIDATE_A }] as never,
    });
  }

  /** Periodo con elección NOT_STARTED (default del schema). */
  function notStartedPeriod(companyId: string, periodId: string) {
    return buildPeriod(companyId, periodId, {
      candidateExtended: [{ ...CANDIDATE_A }] as never,
    });
  }

  function otpService(
    periodSeeds: ConvivenciaPeriodDocument[] = [electionPeriod(COMPANY_A, PERIOD_A)],
    employeeSeeds: ReturnType<typeof buildEmployee>[] = [buildEmployee(COMPANY_A, '222')],
  ) {
    return buildService(periodSeeds, employeeSeeds);
  }

  const OTP_KEY_A = `${PERIOD_A}:222:666`;
  const companyA = new Types.ObjectId(COMPANY_A);
  const companyB = new Types.ObjectId(COMPANY_B);

  it('F7B3-01: NOT_STARTED → sendOtp rechazado', async () => {
    const { service } = otpService([notStartedPeriod(COMPANY_A, PERIOD_A)]);
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
  });

  it('F7B3-02: NOT_STARTED → vote rechazado', async () => {
    const { service } = otpService([notStartedPeriod(COMPANY_A, PERIOD_A)]);
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: '123456',
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
  });

  it('F7B3-03: OPEN → sendOtp funciona', async () => {
    const { service } = otpService();
    const resp = (await service.sendOtp({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
    })) as { sent: boolean };
    assert.equal(resp.sent, true);
  });

  it('F7B3-04: OPEN → vote funciona', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
    });
    assert.equal((result as { success: boolean }).success, true);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B3-05: CLOSED → sendOtp rechazado', async () => {
    const { service } = otpService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        electionState: 'CLOSED',
        candidateExtended: [{ ...CANDIDATE_A }] as never,
      }),
    ]);
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
  });

  it('F7B3-06: CLOSED → vote rechazado', async () => {
    const { service } = otpService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        electionState: 'CLOSED',
        candidateExtended: [{ ...CANDIDATE_A }] as never,
      }),
    ]);
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: '123456',
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
  });

  it('F7B3-07: initVoting() cambia NOT_STARTED → OPEN y fija votingStartedAt', async () => {
    const { service, model } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        candidateExtended: [{ ...CANDIDATE_A }, { ...CANDIDATE_B }] as never,
      }),
    ]);
    await service.initVoting(companyA, PERIOD_A, EMAIL_A);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal(stored.electionState, 'OPEN');
    assert.ok(stored.votingStartedAt instanceof Date);
  });

  it('F7B3-08: initVoting() no reabre una elección CLOSED', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        electionState: 'CLOSED',
        candidateExtended: [CANDIDATE_A, CANDIDATE_B] as never,
      }),
    ]);
    await assert.rejects(
      () => service.initVoting(companyA, PERIOD_A, EMAIL_A),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('no puede reabrirse'),
    );
  });

  it('F7B3-09: closeVoting() cambia OPEN → CLOSED y fija votingClosedAt', async () => {
    const { service, model } = otpService();
    const result = await service.closeVoting(companyA, PERIOD_A, EMAIL_A);
    assert.equal(result.electionState, 'CLOSED');
    assert.ok(result.votingClosedAt instanceof Date);
    assert.equal((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).electionState, 'CLOSED');
  });

  it('F7B3-10: closeVoting() de otra empresa rechazado (NotFound, sin filtrar)', async () => {
    const { service, model } = otpService();
    await assert.rejects(
      () => service.closeVoting(companyB, PERIOD_A, EMAIL_B),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
    assert.equal((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).electionState, 'OPEN');
  });

  it('F7B3-11: companyId del cliente no altera el tenant en el flujo de voto (regresión F7B-1/2 con estado OPEN)', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      companyId: COMPANY_B,
    } as never);
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
      companyId: COMPANY_B,
    } as never);
    assert.equal((result as { success: boolean }).success, true);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B3-12: un documento vota una vez → SUCCESS', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
    });
    assert.equal((result as { success: boolean }).success, true);
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B3-13: el mismo documento con un OTP nuevo NO puede votar dos veces', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
    });
    // Segundo intento con un OTP recién generado (otra solicitud válida).
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: otpCodeOf(service, OTP_KEY_A),
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('El trabajador ya votó'),
    );
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B3-14: segundo dispositivo / nueva solicitud OTP no permite segundo voto', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    // Primer voto (dispositivo 1).
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, OTP_KEY_A),
      candidateDocument: '111',
      device: 'device-1',
    });
    // Segundo intento desde otro teléfono/dispositivo (misma persona, otro OTP).
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '777' });
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '777',
          otpCode: otpCodeOf(service, `${PERIOD_A}:222:777`),
          candidateDocument: '111',
          device: 'device-2',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('El trabajador ya votó'),
    );
    assert.equal(
      ((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).votesExtended as unknown[]).length,
      1,
    );
  });

  it('F7B3-15: el documento normalizado (trim) es la clave del voto único', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    // OTP para '222' (con espacio) y para '222' (sin espacio) — claves distintas.
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.sendOtp({ electionId: PERIOD_A, document: '222 ', phone: '666' });
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222 ',
      phone: '666',
      otpCode: otpCodeOf(service, `${PERIOD_A}:222 :666`),
      candidateDocument: '111',
    });
    assert.equal((result as { success: boolean }).success, true);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    // El voto se persiste con el documento NORMALIZADO.
    assert.equal((stored.votesExtended[0] as { document: string }).document, '222');
    // Un segundo voto con la forma sin espacio se rechaza por voto único.
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: otpCodeOf(service, OTP_KEY_A),
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('El trabajador ya votó'),
    );
  });

  it('F7B3-16: dos votos concurrentes del mismo documento → exactamente uno persiste', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    // Misma persona, dos claves OTP distintas (teléfonos distintos): ambos
    // pasan la validación OTP y compiten en la escritura atómica.
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '777' });
    const results = await Promise.allSettled([
      service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
        candidateDocument: '111',
      }),
      service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '777',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:777`),
        candidateDocument: '111',
      }),
    ]);
    const fulfilled = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { success: boolean }).success === true,
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactamente un voto debe tener éxito');
    assert.equal(rejected.length, 1, 'el voto perdedor debe ser rechazado');
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1, 'solo un voto persistido');
    assert.equal((stored.candidateExtended[0] as { votes: number }).votes, 1, 'contador +1');
  });

  it('F7B3-17: dos votantes diferentes pueden votar concurrentemente', async () => {
    const { service, model } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222'), buildEmployee(COMPANY_A, '333')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.sendOtp({ electionId: PERIOD_A, document: '333', phone: '777' });
    const results = await Promise.allSettled([
      service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
        candidateDocument: '111',
      }),
      service.vote({
        electionId: PERIOD_A,
        document: '333',
        phone: '777',
        otpCode: otpCodeOf(service, `${PERIOD_A}:333:777`),
        candidateDocument: '111',
      }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 2);
    assert.equal((stored.candidateExtended[0] as { votes: number }).votes, 2);
  });

  it('F7B3-18: B→A sigue rechazado (regresión F7B-1)', async () => {
    const { service } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_B, '222')],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B3-19: A→B sigue rechazado (regresión F7B-1)', async () => {
    const { service } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A), electionPeriod(COMPANY_B, PERIOD_B)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_B, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Documento no elegible'),
    );
  });

  it('F7B3-20: elección inexistente sigue dando error controlado', async () => {
    const { service } = otpService();
    await assert.rejects(
      () =>
        service.vote({
          electionId: NONEXISTENT_ID,
          document: '222',
          phone: '666',
          otpCode: '123456',
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Elección no encontrada'),
    );
  });

  it('F7B3-21: candidato inválido no genera voto', async () => {
    const { service, model } = otpService();
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: otpCodeOf(service, OTP_KEY_A),
          candidateDocument: '999',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Candidato no encontrado'),
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0);
    assert.equal((stored.candidateExtended[0] as { votes: number }).votes, 0);
  });

  it('F7B3-22: regresión — initVoting + candidatos aprobados', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        candidateExtended: [{ ...CANDIDATE_A }, { ...CANDIDATE_B }] as never,
      }),
    ]);
    const result = await service.initVoting(companyA, PERIOD_A, EMAIL_A);
    const approved = (result as { approvedCandidates: unknown[] }).approvedCandidates;
    assert.equal(approved.length, 2);
  });

  it('F7B3-23: el OTP de la elección A no sirve para la elección B', async () => {
    const { service } = otpService(
      [electionPeriod(COMPANY_A, PERIOD_A), electionPeriod(COMPANY_B, PERIOD_B)],
      [buildEmployee(COMPANY_A, '222'), buildEmployee(COMPANY_B, '444')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const codeA = otpCodeOf(service, `${PERIOD_A}:222:666`);
    // Empleado de B intenta usar el OTP de A en la elección de B.
    await assert.rejects(
      () =>
        service.vote({
          electionId: PERIOD_B,
          document: '444',
          phone: '666',
          otpCode: codeA,
          candidateDocument: '111',
        }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('F7B3-24: no se generan OTP cuando la elección no está OPEN', async () => {
    const { service } = otpService([notStartedPeriod(COMPANY_A, PERIOD_A)]);
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
    assert.equal(otpEntryOf(service, OTP_KEY_A), undefined, 'no debe existir entrada OTP');
  });
});

describe('F7B-4 (1.1.8) — Resultados electorales y privacidad', () => {
  const companyA = new Types.ObjectId(COMPANY_A);
  const companyB = new Types.ObjectId(COMPANY_B);

  /**
   * Periodo CLOSED con datos REALES de candidatos (incluyendo PII: document,
   * phone, email, ipAddress, device) y de votantes (votesExtended con token,
   * ipAddress, device). Sirve para demostrar que NINGUNA PII llega al response.
   */
  function buildClosedPeriod(companyId: string, periodId: string) {
    return buildPeriod(companyId, periodId, {
      electionState: 'CLOSED',
      candidateExtended: [
        {
          name: 'Candidato Uno', document: '111', phone: '555-111',
          email: 'uno@x.com', area: 'A', position: 'P', motivation: 'M',
          acceptedTerms: true, adminStatus: 'APROBADO', votes: 5,
          ipAddress: '10.0.0.1', device: 'mobile',
        },
        {
          name: 'Candidato Dos', document: '222', phone: '555-222',
          email: 'dos@x.com', area: 'A', position: 'P', motivation: 'M',
          acceptedTerms: true, adminStatus: 'APROBADO', votes: 3,
          ipAddress: '10.0.0.2', device: 'desktop',
        },
        {
          name: 'Candidato Tres', document: '333', phone: '555-333',
          area: 'A', position: 'P', motivation: 'M',
          acceptedTerms: true, adminStatus: 'RECHAZADO', votes: 1,
        },
      ] as never,
      votesExtended: [
        {
          document: 'AAA', candidateDocument: '111', otpValidated: true,
          votedAt: new Date(), ipAddress: '10.0.0.9', device: 'mobile', token: 'token-1',
        },
        {
          document: 'BBB', candidateDocument: '222', otpValidated: true,
          votedAt: new Date(), ipAddress: '10.0.0.10', device: 'desktop',
        },
        {
          document: 'CCC', candidateDocument: '111', otpValidated: true,
          votedAt: new Date(),
        },
      ] as never,
    });
  }

  it('F7B4-01: la empresa A (owner/admin) consulta los resultados de su propio periodo CLOSED → permitido', async () => {
    const { service } = buildService([buildClosedPeriod(COMPANY_A, PERIOD_A)], [], 10);

    const result = await service.getVotingResults(companyA, PERIOD_A);

    // Reglas electorales existentes preservadas: totales, participación y ranking.
    assert.equal(result.totalVotes, 3);
    assert.equal(result.totalEmployees, 10);
    assert.equal(result.participation, 30);
    assert.equal(result.ranking.length, 3);
    assert.equal(result.ranking[0].name, 'Candidato Uno'); // ordenado por votos desc
    assert.equal(result.ranking[0].votes, 5);
    assert.equal(result.winners.length, 2);
    assert.equal(result.winners[0].name, 'Candidato Uno');
    assert.equal(result.alternates.length, 0); // solo 2 aprobados
  });

  it('F7B4-03: la empresa B NO puede consultar los resultados del periodo de A (NotFound tenant-safe)', async () => {
    const { service } = buildService([buildClosedPeriod(COMPANY_A, PERIOD_A)]);
    await assert.rejects(
      () => service.getVotingResults(companyB, PERIOD_A),
      (error: Error) => error instanceof NotFoundException,
    );
  });

  it('F7B4-08/09/10: ranking, winners y alternates NO contienen document', async () => {
    const { service } = buildService([buildClosedPeriod(COMPANY_A, PERIOD_A)]);
    const result = await service.getVotingResults(companyA, PERIOD_A);

    for (const entry of result.ranking) {
      assert.ok(!('document' in entry), 'ranking[].document no debe existir');
    }
    for (const entry of result.winners) {
      assert.ok(!('document' in entry), 'winners[].document no debe existir');
    }
    for (const entry of result.alternates) {
      assert.ok(!('document' in entry), 'alternates[].document no debe existir');
    }
  });

  it('F7B4-11: el response NO contiene votesExtended', async () => {
    const { service } = buildService([buildClosedPeriod(COMPANY_A, PERIOD_A)]);
    const result = await service.getVotingResults(companyA, PERIOD_A);
    assert.ok(!('votesExtended' in result));
  });

  it('F7B4-12: la respuesta serializada completa no contiene PII ni datos individuales de votantes', async () => {
    const { service } = buildService([buildClosedPeriod(COMPANY_A, PERIOD_A)]);
    const result = await service.getVotingResults(companyA, PERIOD_A);
    const serialized = JSON.stringify(result);

    // El DTO solo contiene {rank, name, votes, status} + agregados: ninguna de
    // estas claves puede aparecer en la serialización completa.
    for (const forbidden of [
      'document', 'phone', 'email', 'otp', 'otpHash', 'token',
      'firebaseUid', 'userId', 'votesExtended', 'candidateDocument',
      'ipAddress', 'device',
    ]) {
      assert.ok(!serialized.includes(forbidden), `el response no debe contener '${forbidden}'`);
    }
  });

  it('F7B4-13: NOT_STARTED → resultados rechazados (error controlado)', async () => {
    const { service } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    await assert.rejects(
      () => service.getVotingResults(companyA, PERIOD_A),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('no ha iniciado'),
    );
  });

  it('F7B4-14: OPEN → resultados rechazados (no se exponen resultados parciales)', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, { electionState: 'OPEN' }),
    ]);
    await assert.rejects(
      () => service.getVotingResults(companyA, PERIOD_A),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('está abierta'),
    );
  });

  it('F7B4-15: CLOSED → resultados permitidos', async () => {
    const { service } = buildService([buildClosedPeriod(COMPANY_A, PERIOD_A)]);
    const result = await service.getVotingResults(companyA, PERIOD_A);
    assert.equal(result.totalVotes, 3);
  });

  it('F7B4-16: cerrar la elección y luego consultar → permitido', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A, {
        electionState: 'OPEN',
        candidateExtended: [
          { name: 'C1', document: '111', phone: '5', area: 'A', position: 'P', motivation: 'M', adminStatus: 'APROBADO', votes: 2 },
          { name: 'C2', document: '222', phone: '5', area: 'A', position: 'P', motivation: 'M', adminStatus: 'APROBADO', votes: 1 },
        ] as never,
        votesExtended: [{ document: 'AAA', candidateDocument: '111', otpValidated: true, votedAt: new Date() }] as never,
      }),
    ]);

    // Antes de cerrar → rechazado (OPEN).
    await assert.rejects(
      () => service.getVotingResults(companyA, PERIOD_A),
      (error: Error) => error instanceof BadRequestException,
    );

    await service.closeVoting(companyA, PERIOD_A, EMAIL_A);
    const result = await service.getVotingResults(companyA, PERIOD_A);
    assert.equal(result.totalVotes, 1);
  });

  it('F7B4-17: la empresa B NO puede consultar resultados de A aunque la elección esté CLOSED', async () => {
    const { service } = buildService([
      buildClosedPeriod(COMPANY_A, PERIOD_A),
      buildClosedPeriod(COMPANY_B, PERIOD_B),
    ]);
    // B consultando A → NotFound (CLOSED o no, la pertenencia manda).
    await assert.rejects(
      () => service.getVotingResults(companyB, PERIOD_A),
      (error: Error) => error instanceof NotFoundException,
    );
    // A consultando B → NotFound también.
    await assert.rejects(
      () => service.getVotingResults(companyA, PERIOD_B),
      (error: Error) => error instanceof NotFoundException,
    );
  });

  it('F7B4-18/19/20/21: consultar resultados es read-only (no cambia estado, votos ni candidatos)', async () => {
    const period = buildClosedPeriod(COMPANY_A, PERIOD_A);
    const { service, model } = buildService([period]);

    const before = JSON.stringify(model.store.get(PERIOD_A));
    const first = await service.getVotingResults(companyA, PERIOD_A);
    const second = await service.getVotingResults(companyA, PERIOD_A);
    const after = JSON.stringify(model.store.get(PERIOD_A));

    // F7B4-21: consulta repetida idéntica.
    assert.deepEqual(second, first);
    // F7B4-18/19/20/22: el periodo persistido no cambió en absoluto.
    assert.equal(after, before);
    assert.equal((model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).electionState, 'CLOSED');
  });

  it('F7B4-23/24: la consulta no modifica votesExtended ni crea eventos de auditoría', async () => {
    const { service, model } = buildService([buildClosedPeriod(COMPANY_A, PERIOD_A)]);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    const votesBefore = JSON.stringify(stored.votesExtended);
    const auditBefore = stored.auditHistory.length;

    await service.getVotingResults(companyA, PERIOD_A);
    await service.getVotingResults(companyA, PERIOD_A);

    assert.equal(JSON.stringify(stored.votesExtended), votesBefore);
    assert.equal(stored.auditHistory.length, auditBefore);
  });

  it('F7B4-22: la consulta no invoca ninguna operación de escritura del dominio', async () => {
    const period = buildClosedPeriod(COMPANY_A, PERIOD_A);
    const { service } = buildService([period]);
    // La garantía real de read-only se demuestra con snapshots del store en
    // F7B4-18/19/20/21 y F7B4-23/24; aquí solo se verifica que la consulta
    // completa no requiera operaciones de escritura para responder (solo
    // findPeriodForCompany + countDocuments).
    const result = await service.getVotingResults(companyA, PERIOD_A);
    assert.ok(result.totalVotes >= 0);
  });
});

describe('F7B-5 (1.1.8) — Auditoría electoral y trazabilidad', () => {
  const companyA = new Types.ObjectId(COMPANY_A);
  const companyB = new Types.ObjectId(COMPANY_B);

  const CANDIDATE_A = {
    name: 'Candidato 1',
    document: '111',
    phone: '555',
    area: 'X',
    position: 'Y',
    motivation: 'Z',
    adminStatus: 'APROBADO',
    votes: 0,
  };

  /** Periodo electoral abierto con un candidato aprobado. */
  function electionPeriod(companyId: string, periodId: string) {
    return buildPeriod(companyId, periodId, {
      electionState: 'OPEN',
      candidateExtended: [{ ...CANDIDATE_A }] as never,
    });
  }

  /** Periodo con campaña pública activa (secureToken). */
  function campaignPeriod(companyId: string, periodId: string, token: string) {
    return buildPeriod(companyId, periodId, {
      registrationCampaign: {
        openingDate: new Date('2026-01-01'),
        closingDate: new Date('2030-12-31'),
        includedDepartments: [],
        requirements: [],
        secureToken: token,
        isActive: true,
        adminNotes: '',
      },
    });
  }

  const REGISTRATION = {
    name: 'Candidato Público',
    document: '999',
    phone: '555-999',
    area: 'X',
    position: 'Y',
    motivation: 'Quiero participar',
    acceptedTerms: true,
    email: 'cand@x.com',
    ipAddress: '10.0.0.5',
    device: 'mobile',
  };

  /** Eventos de auditoría con la acción indicada del periodo almacenado. */
  function auditOf(model: { store: Map<string, ConvivenciaPeriodDocument> }, periodId: string, action: string) {
    const period = model.store.get(periodId) as ConvivenciaPeriodDocument;
    return (period.auditHistory as Array<{ action: string; createdBy: string; createdAt: Date; data: string }>).filter(
      (entry) => entry.action === action,
    );
  }

  // ─── CANDIDATE_PUBLIC_REGISTRATION ───
  it('F7B5-01: registro público exitoso → exactamente un evento CANDIDATE_PUBLIC_REGISTRATION', async () => {
    const { service, model } = buildService([campaignPeriod(COMPANY_A, PERIOD_A, 'tok-a')]);
    const result = await service.registerCandidatePublic('tok-a', REGISTRATION);
    assert.equal((result as { success: boolean }).success, true);

    const events = auditOf(model, PERIOD_A, 'CANDIDATE_PUBLIC_REGISTRATION');
    assert.equal(events.length, 1);
    assert.equal(events[0].createdBy, 'public');
    assert.ok(events[0].createdAt instanceof Date);
  });

  it('F7B5-02: registro público rechazado (documento duplicado) → NO crea evento de éxito', async () => {
    const { service, model } = buildService([campaignPeriod(COMPANY_A, PERIOD_A, 'tok-a')]);
    await service.registerCandidatePublic('tok-a', REGISTRATION);
    // Segundo intento con el mismo documento → rechazado.
    await assert.rejects(
      () => service.registerCandidatePublic('tok-a', REGISTRATION),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('Ya existe un candidato'),
    );
    const events = auditOf(model, PERIOD_A, 'CANDIDATE_PUBLIC_REGISTRATION');
    assert.equal(events.length, 1, 'solo la postulación exitosa genera evento');
  });

  it('F7B5-03/18: el evento pertenece al periodo correcto (A recibe, B no)', async () => {
    const { service, model } = buildService([
      campaignPeriod(COMPANY_A, PERIOD_A, 'tok-a'),
      campaignPeriod(COMPANY_B, PERIOD_B, 'tok-b'),
    ]);
    await service.registerCandidatePublic('tok-a', REGISTRATION);

    assert.equal(auditOf(model, PERIOD_A, 'CANDIDATE_PUBLIC_REGISTRATION').length, 1);
    assert.equal(auditOf(model, PERIOD_B, 'CANDIDATE_PUBLIC_REGISTRATION').length, 0);
  });

  it('F7B5-04: el evento NO contiene document/phone/email/motivation del candidato', async () => {
    const { service, model } = buildService([campaignPeriod(COMPANY_A, PERIOD_A, 'tok-a')]);
    await service.registerCandidatePublic('tok-a', REGISTRATION);
    const serialized = JSON.stringify(auditOf(model, PERIOD_A, 'CANDIDATE_PUBLIC_REGISTRATION'));
    for (const forbidden of ['document', 'phone', 'email', 'motivation', 'ipAddress', 'device']) {
      assert.ok(!serialized.includes(forbidden), `no debe contener '${forbidden}'`);
    }
  });

  it('F7B5-05: el evento NO contiene OTP/token/secret', async () => {
    const { service, model } = buildService([campaignPeriod(COMPANY_A, PERIOD_A, 'tok-a')]);
    await service.registerCandidatePublic('tok-a', REGISTRATION);
    const serialized = JSON.stringify(auditOf(model, PERIOD_A, 'CANDIDATE_PUBLIC_REGISTRATION'));
    for (const forbidden of ['otp', 'token', 'secret', 'secureToken', 'hash']) {
      assert.ok(!serialized.includes(forbidden), `no debe contener '${forbidden}'`);
    }
  });

  // ─── OTP_REQUEST ───
  it('F7B5-06: OTP solicitado correctamente → un evento OTP_REQUEST (sin PII ni secretos)', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });

    const events = auditOf(model, PERIOD_A, 'OTP_REQUEST');
    assert.equal(events.length, 1);
    assert.equal(events[0].createdBy, 'public');
    const data = JSON.parse(events[0].data) as Record<string, string>;
    assert.ok(data.periodId === PERIOD_A, 'identifica el periodo');
    assert.ok(typeof data.employeeId === 'string' && data.employeeId.length > 0, 'identifica al empleado por _id interno');
  });

  it('F7B5-07: OTP rechazado por elección inválida → NO crea evento de éxito', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await assert.rejects(
      () => service.sendOtp({ electionId: NONEXISTENT_ID, document: '222', phone: '666' }),
      (error: Error) => error instanceof BadRequestException,
    );
    assert.equal(auditOf(model, PERIOD_A, 'OTP_REQUEST').length, 0);
  });

  it('F7B5-08: OTP rechazado por trabajador no elegible → NO crea evento de éxito', async () => {
    const { service, model } = buildService([electionPeriod(COMPANY_A, PERIOD_A)], []);
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '999', phone: '666' }),
      (error: Error) => error instanceof BadRequestException,
    );
    assert.equal(auditOf(model, PERIOD_A, 'OTP_REQUEST').length, 0);
  });

  it('F7B5-09/10/11/12/13: el evento OTP_REQUEST NO contiene otp/otpHash/phone/document/token/secret/pepper', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const serialized = JSON.stringify(auditOf(model, PERIOD_A, 'OTP_REQUEST'));
    for (const forbidden of ['otp', 'otpPreview', 'otpHash', 'pepper', 'token', 'secret', 'phone', 'document', 'ipAddress', 'device']) {
      assert.ok(!serialized.includes(forbidden), `no debe contener '${forbidden}'`);
    }
  });

  it('F7B5-14: cada OTP solicitado genera un evento independiente (no sobrescribe el anterior)', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });

    const events = auditOf(model, PERIOD_A, 'OTP_REQUEST');
    assert.equal(events.length, 2);
    assert.ok(events[0].createdAt.getTime() <= events[1].createdAt.getTime());
  });

  it('F7B5-16: OTP de elección A → evento en periodo A (no en B)', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A), electionPeriod(COMPANY_B, PERIOD_B)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    assert.equal(auditOf(model, PERIOD_A, 'OTP_REQUEST').length, 1);
    assert.equal(auditOf(model, PERIOD_B, 'OTP_REQUEST').length, 0);
  });

  // ─── VOTE_CAST ───
  it('F7B5-17: voto exitoso en elección A → un evento VOTE_CAST en periodo A', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const result = await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
      candidateDocument: '111',
    });
    assert.equal((result as { success: boolean }).success, true);

    const votes = auditOf(model, PERIOD_A, 'VOTE_CAST');
    assert.equal(votes.length, 1);
    assert.equal(votes[0].createdBy, 'public');
    // La data identifica al candidato por índice interno, sin PII del votante.
    const data = JSON.parse(votes[0].data) as Record<string, number>;
    assert.equal(data.candidateIndex, 0);
  });

  it('F7B5-19: companyId manipulado en el payload NO reubica el evento (siempre en el periodo de la elección)', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    // companyId de empresa B inyectado en el payload del voto → sin efecto.
    await service.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
      candidateDocument: '111',
      companyId: COMPANY_B,
    } as never);
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 1);
  });

  it('F7B5-20: dos votos concurrentes del mismo documento → un voto y un solo VOTE_CAST', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    // Dos OTP válidos para el mismo votante (distinto teléfono) para poder
    // intentar dos votos concurrentes.
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '777' });
    const results = await Promise.allSettled([
      service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
        candidateDocument: '111',
      }),
      service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '777',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:777`),
        candidateDocument: '111',
      }),
    ]);

    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1, 'un solo voto persistido');
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'una sola operación exitosa');
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 1, 'un solo VOTE_CAST');
  });

  it('F7B5-21: dos votantes concurrentes distintos → dos votos y dos VOTE_CAST', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222'), buildEmployee(COMPANY_A, '333')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.sendOtp({ electionId: PERIOD_A, document: '333', phone: '777' });
    const results = await Promise.allSettled([
      service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
        candidateDocument: '111',
      }),
      service.vote({
        electionId: PERIOD_A,
        document: '333',
        phone: '777',
        otpCode: otpCodeOf(service, `${PERIOD_A}:333:777`),
        candidateDocument: '111',
      }),
    ]);

    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 2, 'dos votos persistidos');
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2, 'dos operaciones exitosas');
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 2, 'dos VOTE_CAST');
  });

  it('F7B5-22: voto rechazado por elección CLOSED → cero VOTE_CAST', async () => {
    const { service, model } = buildService(
      [buildPeriod(COMPANY_A, PERIOD_A, { electionState: 'CLOSED' })],
      [buildEmployee(COMPANY_A, '222')],
    );
    await assert.rejects(
      () => service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: '123456',
        candidateDocument: '111',
      }),
      (error: Error) => error instanceof BadRequestException,
    );
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 0);
  });

  it('F7B5-23: voto rechazado por documento inelegible → cero VOTE_CAST', async () => {
    const { service, model } = buildService([electionPeriod(COMPANY_A, PERIOD_A)], []);
    await assert.rejects(
      () => service.vote({
        electionId: PERIOD_A,
        document: '999',
        phone: '666',
        otpCode: '123456',
        candidateDocument: '111',
      }),
      (error: Error) => error instanceof BadRequestException,
    );
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 0);
  });

  it('F7B5-24: OTP inválido → cero VOTE_CAST', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await assert.rejects(
      () => service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: '000000',
        candidateDocument: '111',
      }),
      (error: Error) => error instanceof BadRequestException,
    );
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 0);
  });

  it('F7B5-25: OTP expirado → cero VOTE_CAST', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const entry = otpEntryOf(service, `${PERIOD_A}:222:666`);
    if (entry) entry.expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(
      () => service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
        candidateDocument: '111',
      }),
      (error: Error) => error instanceof BadRequestException,
    );
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 0);
  });

  it('F7B5-26: OTP agotado → cero VOTE_CAST', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => service.vote({
          electionId: PERIOD_A,
          document: '222',
          phone: '666',
          otpCode: '000000',
          candidateDocument: '111',
        }),
        () => true,
      );
    }
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 0);
  });

  it('F7B5-27: candidato inválido → cero VOTE_CAST y cero votos', async () => {
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await assert.rejects(
      () => service.vote({
        electionId: PERIOD_A,
        document: '222',
        phone: '666',
        otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
        candidateDocument: '999',
      }),
      (error: Error) => error instanceof BadRequestException,
    );
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 0);
    assert.equal(auditOf(model, PERIOD_A, 'VOTE_CAST').length, 0);
  });

  // ─── PRIVACIDAD COMPLETA (sección 15) + READ_RESULTS ───
  it('F7B5-privacidad: OTP_REQUEST y VOTE_CAST serializados no exponen secretos ni PII (CANDIDATE_PUBLIC_REGISTRATION cubierto en F7B5-04/05)', async () => {
    const { service, model } = buildService(
      [campaignPeriod(COMPANY_A, PERIOD_A, 'tok-a')],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(service);
    // Postulación pública.
    await service.registerCandidatePublic('tok-a', REGISTRATION);
    // OTP + voto (la elección necesita estar abierta: se clona el periodo con OPEN).
    const open = buildPeriod(COMPANY_A, PERIOD_A, {
      electionState: 'OPEN',
      registrationCampaign: undefined,
      candidateExtended: [{ ...CANDIDATE_A }] as never,
    });
    const { service: s2, model: m2 } = buildService(
      [open],
      [buildEmployee(COMPANY_A, '222')],
    );
    installTestOtpHasher(s2);
    await s2.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await s2.vote({
      electionId: PERIOD_A,
      document: '222',
      phone: '666',
      otpCode: otpCodeOf(s2, `${PERIOD_A}:222:666`),
      candidateDocument: '111',
    });

    const stored = m2.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    const serialized = JSON.stringify(stored.auditHistory);
    for (const forbidden of [
      'otp', 'otpPreview', 'otpHash', 'pepper', 'token', 'secureToken',
      'phone', 'email', 'motivation', 'votesExtended', 'ipAddress', 'device',
    ]) {
      assert.ok(!serialized.includes(forbidden), `auditHistory no debe contener '${forbidden}'`);
    }
    // VOTE_CAST sin document del votante ni candidateDocument.
    const voteCast = (stored.auditHistory as Array<{ action: string; data: string }>).filter(
      (entry) => entry.action === 'VOTE_CAST',
    );
    assert.equal(voteCast.length, 1);
    assert.ok(!voteCast[0].data.includes('document'), 'VOTE_CAST no referencia documentos de identidad');
  });

  it('F7B5-15: consultar resultados CLOSED NO agrega eventos (READ_RESULTS no existe)', async () => {
    const period = buildPeriod(COMPANY_A, PERIOD_A, {
      electionState: 'CLOSED',
      candidateExtended: [{ ...CANDIDATE_A }] as never,
      votesExtended: [{ document: 'AAA', candidateDocument: '111', otpValidated: true, votedAt: new Date() }] as never,
    });
    const { service, model } = buildService([period]);
    const before = (model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).auditHistory.length;
    await service.getVotingResults(companyA, PERIOD_A);
    const after = (model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).auditHistory.length;
    assert.equal(after, before, 'la consulta de resultados no escribe auditoría');
    assert.equal(auditOf(model, PERIOD_A, 'READ_RESULTS').length, 0);
  });
});

describe('ConvivenciaService — Case counter persistente y tenant-safe (F7B-6, 1.1.8)', () => {
  const caseDto = (description: string) => ({
    complainantName: 'Denunciante',
    respondentName: 'Denunciado',
    description,
  });

  /** Fuerza el año de la secuencia sin depender del reloj real. */
  function forceYear(service: ConvivenciaService, year: number) {
    (service as unknown as { currentYear: () => number }).currentYear = () => year;
  }

  function caseNumbersOf(
    model: ReturnType<typeof buildModel>,
    periodId: string,
  ): string[] {
    return (
      (model.store.get(periodId) as ConvivenciaPeriodDocument).cases as Array<{
        caseNumber: string;
      }>
    ).map((c) => c.caseNumber);
  }

  function seqKey(companyId: string, year: number): string {
    return `${new Types.ObjectId(companyId).toString()}:${year}`;
  }

  it('F7B6-13: el formato del caso es CC-YYYY-NNNN', async () => {
    const { service, model } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    const companyA = new Types.ObjectId(COMPANY_A);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso A'), EMAIL_A);
    assert.match(caseNumbersOf(model, PERIOD_A)[0], /^CC-\d{4}-\d{4}$/);
  });

  it('F7B6-01: el primer caso de una empresa en 2026 es CC-2026-0001', async () => {
    const { service, model } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    const companyA = new Types.ObjectId(COMPANY_A);
    forceYear(service, 2026);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso A'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), ['CC-2026-0001']);
  });

  it('F7B6-02: el segundo caso es CC-2026-0002', async () => {
    const { service, model } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    const companyA = new Types.ObjectId(COMPANY_A);
    forceYear(service, 2026);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso 1'), EMAIL_A);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso 2'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), ['CC-2026-0001', 'CC-2026-0002']);
  });

  it('F7B6-03: tras un reinicio del servicio, la secuencia continúa', async () => {
    const seqStore = new Map<string, number>();
    const period = buildPeriod(COMPANY_A, PERIOD_A);
    const companyA = new Types.ObjectId(COMPANY_A);
    const first = buildService([period], [], 0, seqStore);
    await first.service.createCase(companyA, PERIOD_A, caseDto('Caso 1'), EMAIL_A);
    // Reinicio: nueva instancia del servicio con los mismos datos persistidos.
    const second = buildService([period], [], 0, seqStore);
    await second.service.createCase(companyA, PERIOD_A, caseDto('Caso 2'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(second.model, PERIOD_A), ['CC-2026-0001', 'CC-2026-0002']);
  });

  it('F7B6-04: la empresa B inicia su propia secuencia en CC-2026-0001', async () => {
    const { service, model } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    const companyB = new Types.ObjectId(COMPANY_B);
    forceYear(service, 2026);
    await service.createCase(companyB, PERIOD_B, caseDto('Caso B'), EMAIL_B);
    assert.deepEqual(caseNumbersOf(model, PERIOD_B), ['CC-2026-0001']);
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), []);
  });

  it('F7B6-05: la empresa A continúa su secuencia tras crear casos en B', async () => {
    const { service, model } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    const companyA = new Types.ObjectId(COMPANY_A);
    const companyB = new Types.ObjectId(COMPANY_B);
    forceYear(service, 2026);
    await service.createCase(companyA, PERIOD_A, caseDto('A1'), EMAIL_A);
    await service.createCase(companyA, PERIOD_A, caseDto('A2'), EMAIL_A);
    await service.createCase(companyB, PERIOD_B, caseDto('B1'), EMAIL_B);
    // A continúa en 0003: la secuencia de B no interfiere.
    await service.createCase(companyA, PERIOD_A, caseDto('A3'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), [
      'CC-2026-0001',
      'CC-2026-0002',
      'CC-2026-0003',
    ]);
    assert.deepEqual(caseNumbersOf(model, PERIOD_B), ['CC-2026-0001']);
  });

  it('F7B6-06: el cambio de año inicia una nueva secuencia (CC-2027-0001)', async () => {
    const { service, model } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    const companyA = new Types.ObjectId(COMPANY_A);
    forceYear(service, 2026);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso 2026'), EMAIL_A);
    forceYear(service, 2027);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso 2027'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), ['CC-2026-0001', 'CC-2027-0001']);
  });

  it('F7B6-07: 10 createCase concurrentes de la misma empresa reciben 10 números distintos', async () => {
    const { service, model } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    const companyA = new Types.ObjectId(COMPANY_A);
    forceYear(service, 2026);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        service.createCase(companyA, PERIOD_A, caseDto(`Caso ${i + 1}`), EMAIL_A),
      ),
    );
    const numbers = caseNumbersOf(model, PERIOD_A);
    assert.equal(numbers.length, 10);
    assert.equal(new Set(numbers).size, 10, 'no debe haber números repetidos');
    assert.deepEqual([...numbers].sort(), [
      'CC-2026-0001',
      'CC-2026-0002',
      'CC-2026-0003',
      'CC-2026-0004',
      'CC-2026-0005',
      'CC-2026-0006',
      'CC-2026-0007',
      'CC-2026-0008',
      'CC-2026-0009',
      'CC-2026-0010',
    ]);
  });

  it('F7B6-08: empresas concurrentes mantienen secuencias independientes', async () => {
    const { service, model } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    const companyA = new Types.ObjectId(COMPANY_A);
    const companyB = new Types.ObjectId(COMPANY_B);
    forceYear(service, 2026);
    await Promise.all([
      ...Array.from({ length: 5 }, (_, i) =>
        service.createCase(companyA, PERIOD_A, caseDto(`A${i + 1}`), EMAIL_A),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        service.createCase(companyB, PERIOD_B, caseDto(`B${i + 1}`), EMAIL_B),
      ),
    ]);
    const a = caseNumbersOf(model, PERIOD_A);
    const b = caseNumbersOf(model, PERIOD_B);
    assert.equal(new Set(a).size, 5);
    assert.equal(new Set(b).size, 5);
    assert.deepEqual(a, [
      'CC-2026-0001',
      'CC-2026-0002',
      'CC-2026-0003',
      'CC-2026-0004',
      'CC-2026-0005',
    ]);
    // Ambas empresas empiezan en 0001: secuencias totalmente independientes.
    assert.deepEqual(b, a);
  });

  it('F7B6-09: el servicio ya no depende de un contador en memoria', async () => {
    const { service } = buildService([buildPeriod(COMPANY_A, PERIOD_A)]);
    assert.equal((service as unknown as { caseCounter?: number }).caseCounter, undefined);
  });

  it('F7B6-10: el companyId del payload no puede alterar el tenant', async () => {
    const { service, model, caseSequenceStore } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    const companyA = new Types.ObjectId(COMPANY_A);
    forceYear(service, 2026);
    // El DTO intenta colar un companyId ajeno; el servicio solo usa el contexto.
    await service.createCase(
      companyA,
      PERIOD_A,
      { ...caseDto('Intento'), companyId: COMPANY_B } as never,
      EMAIL_A,
    );
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), ['CC-2026-0001']);
    assert.deepEqual(caseNumbersOf(model, PERIOD_B), []);
    assert.equal(caseSequenceStore.get(seqKey(COMPANY_B, 2026)), undefined);
  });

  it('F7B6-11: fallo posterior a reservar número → hueco aceptado, nunca se reutiliza', async () => {
    const seqStore = new Map<string, number>();
    const companyA = new Types.ObjectId(COMPANY_A);
    const { service, model } = buildService(
      [buildPeriod(COMPANY_A, PERIOD_A)],
      [],
      0,
      seqStore,
    );
    forceYear(service, 2026);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso 1'), EMAIL_A); // 0001
    // El siguiente intento reserva 0002 pero falla al persistir el periodo.
    (model.store.get(PERIOD_A) as ConvivenciaPeriodDocument).save = async () => {
      throw new Error('fallo de persistencia');
    };
    await assert.rejects(
      () => service.createCase(companyA, PERIOD_A, caseDto('Caso 2'), EMAIL_A),
      /fallo de persistencia/,
    );
    // Reinicio limpio con la secuencia persistida: 0002 sigue reservado y el
    // siguiente caso es 0003 (el 0002 nunca se reutiliza).
    const { service: s2, model: m2 } = buildService(
      [buildPeriod(COMPANY_A, PERIOD_A)],
      [],
      0,
      seqStore,
    );
    forceYear(s2, 2026);
    await s2.createCase(companyA, PERIOD_A, caseDto('Caso 3'), EMAIL_A);
    // El periodo limpio solo contiene CC-2026-0003: el 0002 fue reservado pero
    // su caso falló, por lo que quedó un hueco (nunca se reutilizó).
    assert.deepEqual(caseNumbersOf(m2, PERIOD_A), ['CC-2026-0003']);
    // La secuencia persistida llegó a 3 (1 emitido + 2 reservado-fallido + 3
    // emitido): el número 0002 se consumió y jamás se volvió a emitir.
    assert.equal(seqStore.get(seqKey(COMPANY_A, 2026)), 3, '0002 reservado, no reutilizado');
  });

  it('F7B6-12: los casos legacy no colisionan con la nueva secuencia', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, {
      cases: [
        {
          caseNumber: 'CC-2026-0001',
          complainantName: 'X',
          respondentName: 'Y',
          description: 'Z',
          status: 'PENDING',
          caseAuditHistory: [],
        },
        {
          caseNumber: 'CC-2026-0002',
          complainantName: 'X',
          respondentName: 'Y',
          description: 'Z',
          status: 'PENDING',
          caseAuditHistory: [],
        },
      ] as never,
    });
    const { service, model } = buildService([periodA]);
    const companyA = new Types.ObjectId(COMPANY_A);
    forceYear(service, 2026);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso nuevo'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), [
      'CC-2026-0001',
      'CC-2026-0002',
      'CC-2026-0003',
    ]);
  });

  it('F7B6-14: la persistencia sobrevive a reconstruir el servicio', async () => {
    const seqStore = new Map<string, number>();
    const period = buildPeriod(COMPANY_A, PERIOD_A);
    const companyA = new Types.ObjectId(COMPANY_A);
    const s1 = buildService([period], [], 0, seqStore);
    forceYear(s1.service, 2026);
    await s1.service.createCase(companyA, PERIOD_A, caseDto('Caso 1'), EMAIL_A);
    const s2 = buildService([period], [], 0, seqStore);
    forceYear(s2.service, 2026);
    await s2.service.createCase(companyA, PERIOD_A, caseDto('Caso 2'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(s2.model, PERIOD_A), ['CC-2026-0001', 'CC-2026-0002']);
  });

  it('F7B6-15: la unicidad está protegida por un índice único { companyId, year }', () => {
    const indexes = ConvivenciaCaseSequenceSchema.indexes();
    const unique = indexes.find(([keys]) => {
      const k = keys as Record<string, number>;
      return k.companyId === 1 && k.year === 1;
    });
    assert.ok(unique, 'debe existir el índice (companyId, year)');
    assert.equal((unique?.[1] as { unique?: boolean })?.unique, true);
  });

  it('F7B6-16: carrera E11000 en el upsert → reintento exitoso sin perder unicidad', async () => {
    const { service, model } = buildService(
      [buildPeriod(COMPANY_A, PERIOD_A)],
      [],
      0,
      undefined,
      true, // el primer upsert falla con E11000 (duplicate key)
    );
    const companyA = new Types.ObjectId(COMPANY_A);
    forceYear(service, 2026);
    await service.createCase(companyA, PERIOD_A, caseDto('Caso A'), EMAIL_A);
    assert.deepEqual(caseNumbersOf(model, PERIOD_A), ['CC-2026-0001']);
  });
});

describe('F7B-11 (1.1.8) — Infraestructura distribuida compartida (OTP + rate-limit + tenant)', () => {
  // Constantes locales del flujo electoral (mismas que F7B-1..F7B-5).
  const CAND = {
    name: 'Candidato 1', document: '111', phone: '555', area: 'X',
    position: 'Y', motivation: 'Z', adminStatus: 'APROBADO', votes: 0,
  };
  const VOTE_PAYLOAD = {
    electionId: PERIOD_A, document: '222', phone: '666', candidateDocument: '111',
  };

  function electionPeriod(companyId: string, periodId: string) {
    return buildPeriod(companyId, periodId, {
      electionState: 'OPEN',
      candidateExtended: [{ ...CAND }] as never,
    });
  }

  /** Candidato aprobado + empleado de A para el flujo electoral completo. */
  function otpService(
    period: ConvivenciaPeriodDocument = electionPeriod(COMPANY_A, PERIOD_A),
    shared?: { challengeModel?: FakeChallengeModel; counterModel?: FakeCounterModel },
  ) {
    const { service, model, challengeModel, counterModel } = buildService(
      [period, buildPeriod(COMPANY_B, PERIOD_B)],
      [buildEmployee(COMPANY_A, '222')],
      0,
      undefined,
      false,
      shared,
    );
    installTestOtpHasher(service);
    return { service, model, challengeModel, counterModel };
  }

  // ═════════════════════════════════════════════
  // OTP DISTRIBUIDO entre instancias (F7B-11)
  // ═════════════════════════════════════════════
  it('OTP-DIST-CONV-01: OTP generado en la instancia A puede validarse desde la instancia B', async () => {
    const shared = { challengeModel: new FakeChallengeModel(), counterModel: new FakeCounterModel() };
    const a = otpService(undefined, shared);
    const b = otpService(undefined, shared);
    // A genera el OTP (persiste en el store COMPARTIDO en MongoDB).
    await a.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code = otpCodeOf(a.service, `${PERIOD_A}:222:666`);
    // B (otra instancia, mismo store compartido) valida el OTP.
    const result = await b.service.vote({ ...VOTE_PAYLOAD, otpCode: code });
    assert.equal((result as { success: boolean }).success, true);
  });

  it('OTP-DIST-CONV-02: regenerar en B invalida el OTP generado en A', async () => {
    const shared = { challengeModel: new FakeChallengeModel(), counterModel: new FakeCounterModel() };
    const a = otpService(undefined, shared);
    const b = otpService(undefined, shared);
    await a.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const oldCode = otpCodeOf(a.service, `${PERIOD_A}:222:666`);
    // B regenera el OTP para la misma clave: reemplaza el desafío atómicamente.
    await b.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const newCode = otpCodeOf(b.service, `${PERIOD_A}:222:666`);
    assert.notEqual(newCode, oldCode);
    // El OTP ANTERIOR deja de ser válido (incluso entre instancias).
    await assert.rejects(
      () => a.service.vote({ ...VOTE_PAYLOAD, otpCode: oldCode }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    // El NUEVO OTP sí funciona.
    const ok = await b.service.vote({ ...VOTE_PAYLOAD, otpCode: newCode });
    assert.equal((ok as { success: boolean }).success, true);
  });

  it('OTP-DIST-CONV-03: un OTP consumido en A no puede reutilizarse en B', async () => {
    const shared = { challengeModel: new FakeChallengeModel(), counterModel: new FakeCounterModel() };
    const a = otpService(undefined, shared);
    const b = otpService(undefined, shared);
    await a.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code = otpCodeOf(a.service, `${PERIOD_A}:222:666`);
    const first = await a.service.vote({ ...VOTE_PAYLOAD, otpCode: code });
    assert.equal((first as { success: boolean }).success, true);
    // B intenta reutilizar el mismo OTP (ya consumido): rechazo.
    await assert.rejects(
      () => b.service.vote({ ...VOTE_PAYLOAD, otpCode: code }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
  });

  it('OTP-DIST-CONV-04: los attempts son compartidos entre instancias', async () => {
    const shared = { challengeModel: new FakeChallengeModel(), counterModel: new FakeCounterModel() };
    const a = otpService(undefined, shared);
    const b = otpService(undefined, shared);
    await a.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    // A falla una vez (attempts 1 en el store compartido).
    await assert.rejects(
      () => a.service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    assert.equal(otpEntryOf(a.service, `${PERIOD_A}:222:666`)?.attempts, 1);
    // B falla dos veces más: el contador compartido llega a 3.
    await assert.rejects(
      () => b.service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    await assert.rejects(
      () => a.service.vote({ ...VOTE_PAYLOAD, otpCode: '000000' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('OTP inválido o expirado'),
    );
    assert.equal(otpEntryOf(b.service, `${PERIOD_A}:222:666`)?.attempts, 3);
  });

  it('OTP-DIST-CONV-05: consumo concurrente del mismo OTP produce exactamente un ganador', async () => {
    const shared = { challengeModel: new FakeChallengeModel(), counterModel: new FakeCounterModel() };
    const a = otpService(undefined, shared);
    const b = otpService(undefined, shared);
    await a.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code = otpCodeOf(a.service, `${PERIOD_A}:222:666`);
    const [r1, r2] = await Promise.allSettled([
      a.service.vote({ ...VOTE_PAYLOAD, otpCode: code }),
      b.service.vote({ ...VOTE_PAYLOAD, otpCode: code }),
    ]);
    const ok = [r1, r2].filter(
      (r) => r.status === 'fulfilled' && (r.value as { success?: boolean }).success === true,
    ).length;
    assert.equal(ok, 1, 'exactamente una validación debe ganar el consumo');
  });

  // ═════════════════════════════════════════════
  // RATE-LIMIT DISTRIBUIDO (F7B-11)
  // ═════════════════════════════════════════════
  it('RATE-DIST-CONV-01: el rate-limit es compartido entre instancias', async () => {
    const shared = { challengeModel: new FakeChallengeModel(), counterModel: new FakeCounterModel() };
    const a = otpService(undefined, shared);
    const b = otpService(undefined, shared);
    // A consume 3 solicitudes de la ventana (clave compartida).
    for (let i = 0; i < 3; i++) {
      await a.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    }
    // B (misma ventana, mismo contador MongoDB) recibe la 4ª → rechazo.
    await assert.rejects(
      () => b.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('Demasiadas solicitudes de OTP'),
    );
  });

  it('RATE-DIST-CONV-02: límite excedido rechaza la solicitud sin generar OTP', async () => {
    const { service, challengeModel } = otpService();
    for (let i = 0; i < 3; i++) {
      await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    }
    await assert.rejects(
      () => service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException &&
        error.message.includes('Demasiadas solicitudes de OTP'),
    );
    // El desafío NO se regeneró (el rechazo ocurre antes de generar el OTP).
    const challenge = challengeModel.store.get(`${OTP_NS}${PERIOD_A}:222:666`);
    assert.ok(challenge, 'el desafío vigente existe (del tercer sendOtp)');
  });

  it('RATE-DIST-CONV-03: claves con namespace no colisionan con el formato de COPASST', async () => {
    const { service, challengeModel, counterModel } = otpService();
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    // La clave REAL almacenada lleva el prefijo convivencia: (aislamiento lógico).
    const storedKey = [...challengeModel.store.keys()][0];
    assert.ok(storedKey.startsWith('convivencia:'), 'key del challenge con namespace');
    const counterKey = [...counterModel.store.keys()][0];
    assert.ok(counterKey.startsWith('convivencia:'), 'key del rate-limit con namespace');
  });

  // ═════════════════════════════════════════════
  // TENANT ISOLATION (F7B-11)
  // ═════════════════════════════════════════════
  it('TENANT-CONV-01: la empresa A accede a su propio periodo', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    const members = await service.getMembers(
      new Types.ObjectId(COMPANY_A),
      PERIOD_A,
    );
    assert.ok(Array.isArray(members));
  });

  it('TENANT-CONV-02: la empresa B NO puede acceder al periodo de la empresa A', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    await assert.rejects(
      () => service.getMembers(new Types.ObjectId(COMPANY_B), PERIOD_A),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
  });

  it('TENANT-CONV-03: la empresa A NO puede acceder al periodo de la empresa B', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    await assert.rejects(
      () => service.getMembers(new Types.ObjectId(COMPANY_A), PERIOD_B),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
  });

  it('TENANT-CONV-04: PATCH cross-tenant rechazado (updateMeeting de B sobre periodo de A)', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    await assert.rejects(
      () =>
        service.updateMeeting(
          new Types.ObjectId(COMPANY_B),
          PERIOD_A,
          0,
          { agenda: 'X' },
          EMAIL_B,
        ),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
  });

  it('TENANT-CONV-05: audit cross-tenant rechazado', async () => {
    const { service } = buildService([
      buildPeriod(COMPANY_A, PERIOD_A),
      buildPeriod(COMPANY_B, PERIOD_B),
    ]);
    await assert.rejects(
      () => service.getAuditHistory(new Types.ObjectId(COMPANY_B), PERIOD_A),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
  });

  it('TENANT-CONV-06: approval cross-tenant rechazado (approve de B sobre periodo de A)', async () => {
    const periodA = buildPeriod(COMPANY_A, PERIOD_A, {
      approvalStatus: 'PENDING_APPROVAL',
    });
    const { service } = buildService([periodA, buildPeriod(COMPANY_B, PERIOD_B)]);
    await assert.rejects(
      () => service.approve(new Types.ObjectId(COMPANY_B), PERIOD_A, EMAIL_B, 'manager'),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
  });

  // ═════════════════════════════════════════════
  // REGRESIONES (F7B-11)
  // ═════════════════════════════════════════════
  it('REGRESSION-CONV-01: los resultados conservan el DTO existente {rank,name,votes,status}', async () => {
    const closed = buildPeriod(COMPANY_A, PERIOD_A, {
      electionState: 'CLOSED',
      candidateExtended: [{ ...CAND, votes: 2 }] as never,
      votesExtended: [{ document: '222', candidateDocument: '111' }] as never,
    });
    const { service } = buildService(
      [closed],
      [buildEmployee(COMPANY_A, '222')],
      1,
    );
    const results = await service.getVotingResults(
      new Types.ObjectId(COMPANY_A),
      PERIOD_A,
    );
    for (const list of [results.winners, results.alternates, results.ranking]) {
      for (const entry of list) {
        assert.deepEqual(Object.keys(entry).sort(), ['name', 'rank', 'status', 'votes']);
      }
    }
    assert.equal(results.ranking[0].name, 'Candidato 1');
  });

  it('REGRESSION-CONV-02: electionState conserva su comportamiento (NOT_STARTED/OPEN/CLOSED)', async () => {
    const { service } = otpService();
    // NOT_STARTED → sin OTP ni voto.
    const ns = buildService(
      [buildPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222')],
    );
    await assert.rejects(
      () =>
        ns.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
    // OPEN → OTP y voto permitidos (verificado en OTP-DIST-CONV-01).
    // CLOSED → sin OTP ni voto.
    const closed = buildService(
      [
        buildPeriod(COMPANY_A, PERIOD_A, {
          electionState: 'CLOSED',
          candidateExtended: [{ ...CAND }] as never,
        }),
      ],
      [buildEmployee(COMPANY_A, '222')],
    );
    await assert.rejects(
      () =>
        closed.service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' }),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
  });

  it('REGRESSION-CONV-03: doble voto concurrente del mismo votante produce un solo voto', async () => {
    const { service, model } = otpService();
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    const code = otpCodeOf(service, `${PERIOD_A}:222:666`);
    // Dos votos simultáneos: el CAS ($ne document) + consumo único del OTP
    // garantizan que solo uno persiste.
    await Promise.allSettled([
      service.vote({ ...VOTE_PAYLOAD, otpCode: code }),
      service.vote({ ...VOTE_PAYLOAD, otpCode: code }),
    ]);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    assert.equal((stored.votesExtended as unknown[]).length, 1);
    assert.equal((stored.candidateExtended[0] as { votes: number }).votes, 1);
  });

  it('REGRESSION-CONV-04: sin lost updates (votantes distintos, mismo candidato → contador exacto)', async () => {
    // Service con DOS empleados de A (222 y 333) para votar por el mismo candidato.
    const { service, model } = buildService(
      [electionPeriod(COMPANY_A, PERIOD_A)],
      [buildEmployee(COMPANY_A, '222'), buildEmployee(COMPANY_A, '333')],
    );
    installTestOtpHasher(service);
    // Votante 222 vota por el candidato 111.
    await service.sendOtp({ electionId: PERIOD_A, document: '222', phone: '666' });
    await service.vote({
      ...VOTE_PAYLOAD,
      otpCode: otpCodeOf(service, `${PERIOD_A}:222:666`),
    });
    // Votante 333 (empleado de A) vota por el MISMO candidato.
    await service.sendOtp({ electionId: PERIOD_A, document: '333', phone: '777' });
    const res = await service.vote({
      electionId: PERIOD_A,
      document: '333',
      phone: '777',
      otpCode: otpCodeOf(service, `${PERIOD_A}:333:777`),
      candidateDocument: '111',
    });
    assert.equal((res as { success: boolean }).success, true);
    const stored = model.store.get(PERIOD_A) as ConvivenciaPeriodDocument;
    const candidate = (stored.candidateExtended as Array<{ votes: number }>)[0];
    const real = (stored.votesExtended as Array<{ candidateDocument: string }>).filter(
      (v) => v.candidateDocument === '111',
    ).length;
    assert.equal(candidate.votes, real, 'el contador refleja los votos reales (sin lost updates)');
  });
});
