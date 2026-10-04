import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CompanyPeriodWorkDataService } from './company-period-work-data.service';
import { CompanyPeriodWorkDataController } from '../indicators/company-period-work-data.controller';
import { IndicatorsService } from '../indicators/indicators.service';

/**
 * E3-B (6.1.1) — Tests de administración de CompanyPeriodWorkData.
 *
 * Cubre: seguridad (tenant server-side, roles), validación (YYYY-MM estricto,
 * horas finitas >= 0), cierre de períodos (escritura rechazada en CLOSED,
 * lectura permitida, recálculo automático prohibido) y tenant isolation.
 */

const COMPANY_A = new Types.ObjectId('64a0000000000000000000a1');
const COMPANY_B = new Types.ObjectId('64a0000000000000000000b2');
const USER_ID = '64a0000000000000000000c3';

// ─── Fakes ──────────────────────────────────────────────────────────────────

type WorkDoc = {
  companyId: Types.ObjectId;
  period: string;
  hoursWorked: number;
  save: () => Promise<WorkDoc>;
};

function buildWorkDataModel(store: WorkDoc[]) {
  const matchesFilter = (doc: WorkDoc, filter: Record<string, unknown>) => {
    if ((filter.companyId as Types.ObjectId).toString() !== doc.companyId.toString()) {
      return false;
    }
    if (typeof filter.period === 'string') {
      return doc.period === filter.period;
    }
    if (filter.period && typeof filter.period === 'object') {
      const p = filter.period as Record<string, string>;
      if (p.$gte !== undefined && !(doc.period >= p.$gte)) return false;
      if (p.$lte !== undefined && !(doc.period <= p.$lte)) return false;
    }
    return true;
  };

  const buildQuery = (single: boolean, filter: Record<string, unknown>) => {
    const exec = async () => {
      const rows = store.filter((d) => matchesFilter(d, filter));
      return single ? (rows[0] ?? null) : rows;
    };
    return { lean: () => ({ exec }), exec, sort: () => ({ exec }) };
  };

  // Constructor invocable (el service hace `new model({...}).save()`)
  // con métodos de query adjuntos.
  function Model(doc: { companyId: Types.ObjectId; period: string; hoursWorked: number }) {
    const created: WorkDoc = {
      ...doc,
      save: async () => {
        const idx = store.findIndex(
          (d) =>
            d.companyId.toString() === created.companyId.toString() &&
            d.period === created.period,
        );
        if (idx < 0) store.push(created);
        return created;
      },
    };
    return created;
  }

  (Model as unknown as Record<string, unknown>).findOne = (filter: Record<string, unknown>) =>
    buildQuery(true, filter);
  (Model as unknown as Record<string, unknown>).find = (filter: Record<string, unknown>) =>
    buildQuery(false, filter);
  (Model as unknown as Record<string, unknown>).deleteOne = async (filter: Record<string, unknown>) => {
    const idx = store.findIndex((d) => matchesFilter(d, filter));
    if (idx >= 0) store.splice(idx, 1);
    return { deletedCount: idx >= 0 ? 1 : 0 };
  };

  return Model as never;
}

function buildPeriodModel(
  statuses: Record<string, 'OPEN' | 'CLOSED' | undefined>,
) {
  return {
    findOne: (filter: Record<string, unknown>) => ({
      lean: () => ({
        exec: async () => {
          const status = statuses[filter.period as string];
          if (status === undefined) return null;
          return {
            companyId: filter.companyId,
            period: filter.period,
            status,
          };
        },
      }),
      exec: async () => {
        const status = statuses[filter.period as string];
        if (status === undefined) return null;
        return {
          companyId: filter.companyId,
          period: filter.period,
          status,
        };
      },
    }),
  } as never;
}

function buildService(opts: {
  docs?: Array<{ companyId: Types.ObjectId; period: string; hoursWorked: number }>;
  periodStatuses?: Record<string, 'OPEN' | 'CLOSED' | undefined>;
} = {}) {
  // Los docs sembrados reciben save() (el service muta y guarda el existente).
  const store: WorkDoc[] = (opts.docs ?? []).map((d) => {
    const seeded = { ...d } as WorkDoc;
    seeded.save = async () => seeded;
    return seeded;
  });
  const workDataModel = buildWorkDataModel(store);
  const periodModel = buildPeriodModel(opts.periodStatuses ?? {});
  const service = new CompanyPeriodWorkDataService(
    workDataModel,
    periodModel as never,
  );
  return { service, store };
}

function buildController(service: CompanyPeriodWorkDataService) {
  const usersService = {
    findByFirebaseUid: async () => ({ companyId: COMPANY_A }),
  } as never;
  const controller = new CompanyPeriodWorkDataController(
    service as never,
    usersService,
  );
  const request = { user: { uid: 'firebase-uid', _id: USER_ID } } as never;
  return { controller, request };
}

function buildIndicatorsService(opts: {
  periodStatus: 'OPEN' | 'CLOSED' | undefined;
  measurements?: Map<string, Record<string, unknown>>;
}) {
  const measurements = opts.measurements ?? new Map<string, Record<string, unknown>>();
  const definitionModel = { find: () => ({ exec: async () => [] }) } as never;
  const measurementModel = {
    findOne: (f: Record<string, unknown>) => ({
      exec: async () => measurements.get(`${f.indicatorId}|${f.period}`) ?? null,
    }),
  } as never;
  const periodModel = {
    findOne: (f: Record<string, unknown>) => ({
      exec: async () =>
        opts.periodStatus === undefined
          ? null
          : { companyId: f.companyId, period: f.period, status: opts.periodStatus },
    }),
  } as never;
  const service = new IndicatorsService(
    definitionModel,
    measurementModel,
    periodModel,
    undefined,
  );
  return { service, measurements };
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGURIDAD Y ROLES
// ═══════════════════════════════════════════════════════════════════════════

describe('E3B WORK-DATA — Seguridad y roles', () => {
  it('WD-C01: PUT sin usuario autenticado → ForbiddenException', async () => {
    const { service } = buildService();
    const controller = new CompanyPeriodWorkDataController(
      service as never,
      { findByFirebaseUid: async () => null } as never,
    );
    const req = { user: { uid: 'firebase-uid', _id: USER_ID } } as never;
    await assert.rejects(
      () =>
        controller.upsert(req, '2026-01', {
          period: '2026-01',
          hoursWorked: 1600,
        }),
      ForbiddenException,
    );
  });

  it('WD-C02: PUT usa el tenant resuelto server-side (companyId nunca del payload)', async () => {
    const { service, store } = buildService();
    const { controller, request } = buildController(service);
    // El DTO NO acepta companyId: no hay forma de que el cliente lo envíe.
    await controller.upsert(request, '2026-01', {
      period: '2026-01',
      hoursWorked: 1600,
    });
    assert.equal(store.length, 1);
    assert.equal(store[0].companyId.toString(), COMPANY_A.toString());
  });

  it('WD-C03: GET lista filtra por tenant y rango from/to', async () => {
    const { service } = buildService({
      docs: [
        { companyId: COMPANY_A, period: '2026-01', hoursWorked: 100 } as WorkDoc,
        { companyId: COMPANY_A, period: '2026-03', hoursWorked: 300 } as WorkDoc,
        { companyId: COMPANY_B, period: '2026-02', hoursWorked: 999 } as WorkDoc,
      ],
    });
    const { controller, request } = buildController(service);
    const rows = (await controller.findAll(request, '2026-01', '2026-03')) as WorkDoc[];
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.companyId.toString() === COMPANY_A.toString()));
  });

  it('WD-C04: GET :period devuelve solo el registro del tenant autenticado', async () => {
    const { service } = buildService({
      docs: [
        { companyId: COMPANY_B, period: '2026-01', hoursWorked: 999 } as WorkDoc,
      ],
    });
    const { controller, request } = buildController(service);
    const doc = await controller.findByPeriod(request, '2026-01');
    assert.equal(doc, null);
  });

  it('WD-C05: roles — WRITE owner/admin, READ incluye manager y member', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../src/modules/indicators/company-period-work-data.controller.ts'),
      'utf-8',
    );
    const putIdx = src.indexOf("@Put(':period')");
    assert.ok(src.slice(putIdx, putIdx + 80).includes("@Roles('owner', 'admin')"));
    assert.ok(!src.slice(putIdx, putIdx + 80).includes('member'));
    const getIdx = src.indexOf('@Get()');
    assert.ok(
      src.slice(getIdx, getIdx + 100).includes("@Roles('owner', 'admin', 'manager', 'member')"),
    );
  });

  it('WD-C06: period de la URL ≠ period del cuerpo → BadRequestException', async () => {
    const { service } = buildService();
    const { controller, request } = buildController(service);
    await assert.rejects(
      () =>
        controller.upsert(request, '2026-01', {
          period: '2026-02',
          hoursWorked: 1600,
        }),
      BadRequestException,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('E3B WORK-DATA — Validación de período y horas', () => {
  it('WD-V01: período válido 2026-01 se guarda', async () => {
    const { service, store } = buildService();
    await service.upsertForCompany(COMPANY_A, '2026-01', 1600);
    assert.equal(store.length, 1);
    assert.equal(store[0].period, '2026-01');
  });

  it('WD-V02: período inválido 2026-1 rechazado', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.upsertForCompany(COMPANY_A, '2026-1', 1600),
      BadRequestException,
    );
  });

  it('WD-V03: período inválido 2026-13 rechazado', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.upsertForCompany(COMPANY_A, '2026-13', 1600),
      BadRequestException,
    );
  });

  it('WD-V04: período inválido 01-2026 rechazado', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.upsertForCompany(COMPANY_A, '01-2026', 1600),
      BadRequestException,
    );
  });

  it('WD-V05: horas 0 aceptadas', async () => {
    const { service, store } = buildService();
    await service.upsertForCompany(COMPANY_A, '2026-01', 0);
    assert.equal(store[0].hoursWorked, 0);
  });

  it('WD-V06: horas positivas aceptadas', async () => {
    const { service, store } = buildService();
    await service.upsertForCompany(COMPANY_A, '2026-01', 3200.5);
    assert.equal(store[0].hoursWorked, 3200.5);
  });

  it('WD-V07: horas negativas rechazadas', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.upsertForCompany(COMPANY_A, '2026-01', -1),
      BadRequestException,
    );
  });

  it('WD-V08: NaN e Infinity rechazados', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.upsertForCompany(COMPANY_A, '2026-01', Number.NaN),
      BadRequestException,
    );
    await assert.rejects(
      () => service.upsertForCompany(COMPANY_A, '2026-01', Number.POSITIVE_INFINITY),
      BadRequestException,
    );
  });

  it('WD-V09: horas como string rechazadas', async () => {
    const { service } = buildService();
    await assert.rejects(
      () =>
        service.upsertForCompany(
          COMPANY_A,
          '2026-01',
          '3200' as unknown as number,
        ),
      BadRequestException,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CIERRE DE PERÍODOS
// ═══════════════════════════════════════════════════════════════════════════

describe('E3B WORK-DATA — Períodos CLOSED', () => {
  it('WD-P01: crear en período OPEN permitido', async () => {
    const { service, store } = buildService({ periodStatuses: { '2026-01': 'OPEN' } });
    await service.upsertForCompany(COMPANY_A, '2026-01', 1600);
    assert.equal(store.length, 1);
  });

  it('WD-P02: actualizar en período OPEN permitido', async () => {
    const { service, store } = buildService({
      docs: [{ companyId: COMPANY_A, period: '2026-01', hoursWorked: 100 } as WorkDoc],
      periodStatuses: { '2026-01': 'OPEN' },
    });
    await service.upsertForCompany(COMPANY_A, '2026-01', 3500);
    assert.equal(store[0].hoursWorked, 3500);
  });

  it('WD-P03: modificar con período CLOSED rechazado (sin mutar datos)', async () => {
    const { service, store } = buildService({
      docs: [{ companyId: COMPANY_A, period: '2026-01', hoursWorked: 3200 } as WorkDoc],
      periodStatuses: { '2026-01': 'CLOSED' },
    });
    await assert.rejects(
      () => service.upsertForCompany(COMPANY_A, '2026-01', 999),
      BadRequestException,
    );
    assert.equal(store[0].hoursWorked, 3200);
  });

  it('WD-P04: consultar CLOSED permitido (GET no bloqueado)', async () => {
    const { service } = buildService({
      docs: [{ companyId: COMPANY_A, period: '2026-01', hoursWorked: 3200 } as WorkDoc],
      periodStatuses: { '2026-01': 'CLOSED' },
    });
    const doc = await service.findByCompanyAndPeriod(COMPANY_A, '2026-01');
    assert.ok(doc);
    assert.equal(doc!.hoursWorked, 3200);
  });

  it('WD-P05: sin IndicatorPeriod se permiten registrar horas (no crea período)', async () => {
    const { service, store } = buildService({ periodStatuses: {} });
    await service.upsertForCompany(COMPANY_A, '2026-01', 1600);
    assert.equal(store.length, 1);
  });

  it('WD-P06: calculateAllAutomatic sobre CLOSED rechazado y no modifica mediciones', async () => {
    const existing = {
      indicatorId: 'd1',
      period: '2026-01',
      status: 'TARGET_MET',
      calculatedValue: 5,
    };
    const measurements = new Map([['d1|2026-01', existing]]);
    const { service } = buildIndicatorsService({
      periodStatus: 'CLOSED',
      measurements,
    });
    await assert.rejects(
      () => service.calculateAllAutomatic(COMPANY_A, '2026-01'),
      BadRequestException,
    );
    // La medición histórica permanece intacta.
    assert.deepEqual(existing, {
      indicatorId: 'd1',
      period: '2026-01',
      status: 'TARGET_MET',
      calculatedValue: 5,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TENANT ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('E3B WORK-DATA — Tenant isolation', () => {
  it('WD-T01: registro de otra compañía nunca aparece en consultas', async () => {
    const { service } = buildService({
      docs: [
        { companyId: COMPANY_B, period: '2026-01', hoursWorked: 8888 } as WorkDoc,
        { companyId: COMPANY_B, period: '2026-02', hoursWorked: 9999 } as WorkDoc,
      ],
    });
    const rows = await service.findByCompanyAndRange(COMPANY_A);
    assert.equal(rows.length, 0);
    const doc = await service.findByCompanyAndPeriod(COMPANY_A, '2026-01');
    assert.equal(doc, null);
  });

  it('WD-T02: modificar el registro de otra compañía crea bajo el tenant propio (nunca muta cross-tenant)', async () => {
    const otherDoc = {
      companyId: COMPANY_B,
      period: '2026-01',
      hoursWorked: 8888,
    } as WorkDoc;
    const { service, store } = buildService({ docs: [otherDoc] });
    await service.upsertForCompany(COMPANY_A, '2026-01', 1600);
    // El registro de COMPANY_B permanece intacto; COMPANY_A tiene el suyo.
    assert.equal(otherDoc.hoursWorked, 8888);
    assert.equal(store.length, 2);
    const own = store.find(
      (d) => d.companyId.toString() === COMPANY_A.toString(),
    );
    assert.ok(own);
    assert.equal(own!.hoursWorked, 1600);
  });
});
