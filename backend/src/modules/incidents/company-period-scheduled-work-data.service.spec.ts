import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { Types } from 'mongoose';
import { CompanyPeriodScheduledWorkDataService } from './company-period-scheduled-work-data.service';

/**
 * FASE 35E-2 — Tests del service del denominador de 3.3.6
 * (CompanyPeriodScheduledWorkDataService) con modelo en memoria.
 */

const COMPANY = new Types.ObjectId('64b0000000000000000000a1');
const OTHER = new Types.ObjectId('64b0000000000000000000b2');
const USER = new Types.ObjectId('64b0000000000000000000c3');

interface Entry {
  companyId: Types.ObjectId;
  period: string;
  scheduledWorkDays: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  save: () => Promise<Entry>;
}

/**
 * Modelo en memoria que respeta el índice único { companyId, period }.
 *
 * El service inyecta el MODELO y lo instancia con `new model({...})`: el mock
 * es por tanto una función constructora con findOne/find/deleteOne adjuntos.
 */
function createModel() {
  const docs: Entry[] = [];

  const save = async (doc: Entry): Promise<Entry> => {
    const dup = docs.find(
      (d) => d.companyId.equals(doc.companyId) && d.period === doc.period && d !== doc,
    );
    if (dup) {
      throw new Error('E11000 duplicate key: { companyId, period } must be unique');
    }
    if (!docs.includes(doc)) {
      docs.push(doc);
    }
    return doc;
  };

  const ctor = function (this: Entry, data: Partial<Entry>) {
    Object.assign(this, data, {
      save: () => save(this as Entry),
    });
  } as unknown as {
    new (data: Partial<Entry>): Entry;
    docs: Entry[];
    findOne: (query: { companyId: Types.ObjectId; period: string }) => {
      exec: () => Promise<Entry | null>;
    };
    find: (query: { companyId: Types.ObjectId }) => {
      sort: () => { exec: () => Promise<Entry[]> };
    };
    deleteOne: (query: { companyId: Types.ObjectId; period: string }) => {
      exec: () => Promise<{ deletedCount: number }>;
    };
  };

  const ctorAny = ctor as unknown as {
    docs: Entry[];
    findOne: (query: { companyId: Types.ObjectId; period: string }) => {
      exec: () => Promise<Entry | null>;
    };
    find: (query: { companyId: Types.ObjectId }) => {
      sort: () => { exec: () => Promise<Entry[]> };
    };
    deleteOne: (query: { companyId: Types.ObjectId; period: string }) => {
      exec: () => Promise<{ deletedCount: number }>;
    };
  };

  ctorAny.docs = docs;
  ctorAny.findOne = (query) => ({
    exec: async () =>
      docs.find((d) => d.companyId.equals(query.companyId) && d.period === query.period) ?? null,
  });
  ctorAny.find = (query) => ({
    sort: () => ({
      exec: async () =>
        docs
          .filter((d) => d.companyId.equals(query.companyId))
          .sort((a, b) => b.period.localeCompare(a.period)),
    }),
  });
  ctorAny.deleteOne = (query) => ({
    exec: async () => {
      const idx = docs.findIndex(
        (d) => d.companyId.equals(query.companyId) && d.period === query.period,
      );
      if (idx >= 0) {
        docs.splice(idx, 1);
      }
      return { deletedCount: idx >= 0 ? 1 : 0 };
    },
  });

  return ctor;
}

type ModelLike = ReturnType<typeof createModel>;

function buildService(model: ModelLike): CompanyPeriodScheduledWorkDataService {
  return new CompanyPeriodScheduledWorkDataService(model as never);
}

describe('FASE 35E-2 — CompanyPeriodScheduledWorkDataService', () => {
  let model: ModelLike;
  let service: CompanyPeriodScheduledWorkDataService;

  beforeEach(() => {
    model = createModel();
    service = buildService(model);
  });

  it('SWD-001: upsert crea un registro nuevo', async () => {
    const saved = await service.upsert(COMPANY, '2026-08', 210, USER);
    assert.equal(saved.period, '2026-08');
    assert.equal(saved.scheduledWorkDays, 210);
    assert.equal(saved.createdBy?.toString(), USER.toString());
    assert.equal(model.docs.length, 1);
  });

  it('SWD-002: upsert idempotente — mismo tenant + período actualiza (no duplica)', async () => {
    await service.upsert(COMPANY, '2026-08', 210);
    const updated = await service.upsert(COMPANY, '2026-08', 195, USER);
    assert.equal(model.docs.length, 1);
    assert.equal(updated.scheduledWorkDays, 195);
    assert.equal(updated.updatedBy?.toString(), USER.toString());
  });

  it('SWD-003: upsert distinta empresa + mismo período → registros separados', async () => {
    await service.upsert(COMPANY, '2026-08', 210);
    await service.upsert(OTHER, '2026-08', 100);
    assert.equal(model.docs.length, 2);
  });

  it('SWD-004: rechaza período inválido (formato)', async () => {
    await assert.rejects(() => service.upsert(COMPANY, '2026-8', 200), /YYYY-MM/);
    await assert.rejects(() => service.upsert(COMPANY, 'agosto', 200), /YYYY-MM/);
    await assert.rejects(() => service.upsert(COMPANY, '2026-13', 200), /YYYY-MM/);
    await assert.rejects(() => service.upsert(COMPANY, '2026-00', 200), /YYYY-MM/);
  });

  it('SWD-005: rechaza scheduledWorkDays negativo', async () => {
    await assert.rejects(() => service.upsert(COMPANY, '2026-08', -1), />= 0/);
  });

  it('SWD-006: rechaza scheduledWorkDays decimal', async () => {
    await assert.rejects(() => service.upsert(COMPANY, '2026-08', 2.5), /integer/);
  });

  it('SWD-007: rechaza NaN/Infinity', async () => {
    await assert.rejects(() => service.upsert(COMPANY, '2026-08', NaN), /finite/);
    await assert.rejects(() => service.upsert(COMPANY, '2026-08', Infinity), /finite/);
  });

  it('SWD-008: acepta 0 (el provider lo tratará como NO_DATA, pero es almacenable)', async () => {
    const saved = await service.upsert(COMPANY, '2026-08', 0);
    assert.equal(saved.scheduledWorkDays, 0);
  });

  it('SWD-009: findByPeriod devuelve el registro tenant-scoped', async () => {
    await service.upsert(COMPANY, '2026-08', 210);
    const found = await service.findByPeriod(COMPANY, '2026-08');
    assert.ok(found);
    assert.equal(found.scheduledWorkDays, 210);
  });

  it('SWD-010: findByPeriod con período de otro tenant → null (aislamiento)', async () => {
    await service.upsert(COMPANY, '2026-08', 210);
    const found = await service.findByPeriod(OTHER, '2026-08');
    assert.equal(found, null);
  });

  it('SWD-011: findByPeriod con período inexistente → null (NO_DATA del provider)', async () => {
    const found = await service.findByPeriod(COMPANY, '2026-07');
    assert.equal(found, null);
  });

  it('SWD-012: findByPeriod valida el formato del período', async () => {
    await assert.rejects(() => service.findByPeriod(COMPANY, '2026/08'), /YYYY-MM/);
  });

  it('SWD-013: findAll devuelve solo el histórico del tenant, ordenado desc', async () => {
    await service.upsert(COMPANY, '2026-01', 200);
    await service.upsert(COMPANY, '2026-02', 195);
    await service.upsert(OTHER, '2026-01', 90);
    const all = await service.findAll(COMPANY);
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((d) => d.period), ['2026-02', '2026-01']);
  });

  it('SWD-014: remove elimina solo el registro del tenant + período', async () => {
    await service.upsert(COMPANY, '2026-08', 210);
    await service.upsert(OTHER, '2026-08', 100);
    await service.remove(COMPANY, '2026-08');
    const allCompany = await service.findAll(COMPANY);
    assert.equal(allCompany.length, 0);
    const allOther = await service.findAll(OTHER);
    assert.equal(allOther.length, 1, 'el registro del otro tenant permanece');
  });

  it('SWD-015: períodos históricos se almacenan independientes (historicidad)', async () => {
    await service.upsert(COMPANY, '2026-01', 210);
    await service.upsert(COMPANY, '2026-02', 195);
    const jan = await service.findByPeriod(COMPANY, '2026-01');
    const feb = await service.findByPeriod(COMPANY, '2026-02');
    assert.equal(jan?.scheduledWorkDays, 210, 'el valor de enero no se recalcula');
    assert.equal(feb?.scheduledWorkDays, 195);
  });

  it('SWD-016: upsert sin actor (provider interno) — createdBy/updatedBy opcionales', async () => {
    const saved = await service.upsert(COMPANY, '2026-08', 210);
    assert.equal(saved.createdBy, undefined);
  });
});
