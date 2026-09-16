import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { Types } from 'mongoose';
import { OccupationalDiseaseStatisticalCaseService } from './occupational-disease-statistical-case.service';
import {
  OccupationalDiseaseCaseStatus,
  OccupationalDiseaseQualification,
} from './schemas/occupational-disease-statistical-case.schema';

/**
 * FASE 35B — Tests del servicio de casos estadísticos de enfermedad laboral.
 *
 * Framework REAL del proyecto: node:test + node:assert/strict (patrón
 * waste-management.service.spec.ts). Mocks por contrato.
 *
 * Cubre (§TESTS OBLIGATORIOS — Service): creación, tenant, cross-tenant
 * bloqueado, employee inexistente/de otra compañía, duplicado tenant-scoped,
 * mismo id en otro tenant, fechas inválidas, período derivado (coherente),
 * actualización, cierre, reapertura sin reconteo (Gate 9), desactivación
 * lógica, NOT_QUALIFIED/DISCARDED no válidos (Reglas C/D).
 */

const companyIdA = new Types.ObjectId('507f1f77bcf86cd799439011');
const companyIdB = new Types.ObjectId('507f1f77bcf86cd799439099');
const employeeIdA = new Types.ObjectId('607f1f77bcf86cd799439011');
const employeeIdB = new Types.ObjectId('607f1f77bcf86cd799439099');
const investigationIdA = new Types.ObjectId('707f1f77bcf86cd799439011');

/** Query mock: thenable (await directo) Y chainable (.lean()). */
function thenableQuery(result: unknown) {
  return {
    lean: async () => result,
    then: (
      onFulfilled?: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
}

function buildService(
  options: {
    existing?: Record<string, unknown> | null;
    findResults?: Record<string, unknown>[];
    employee?: Record<string, unknown> | null;
    incident?: Record<string, unknown> | null;
    createError?: { code: number };
  } = {},
) {
  const state: {
    created: Record<string, unknown>[];
    updates: Record<string, unknown>[];
    findFilters: Record<string, unknown>[];
    findOneFilters: Record<string, unknown>[];
    employeeFilters: Record<string, unknown>[];
    incidentFilters: Record<string, unknown>[];
  } = {
    created: [],
    updates: [],
    findFilters: [],
    findOneFilters: [],
    employeeFilters: [],
    incidentFilters: [],
  };

  const caseModel = {
    create: mock.fn(async (doc: Record<string, unknown>) => {
      if (options.createError) {
        const err = new Error('E11000 duplicate key') as Error & { code?: number };
        err.code = options.createError.code;
        throw err;
      }
      state.created.push(doc);
      const _id = new Types.ObjectId();
      return { ...doc, _id, toObject: () => ({ ...doc, _id }) };
    }),
    find: mock.fn((filter: Record<string, unknown>) => {
      state.findFilters.push(filter);
      return {
        sort: () => ({
          limit: () => ({
            skip: () => ({
              lean: async () => options.findResults ?? ([] as unknown[]),
            }),
          }),
        }),
      };
    }),
    findOne: mock.fn((filter: Record<string, unknown>) => {
      state.findOneFilters.push(filter);
      return thenableQuery(options.existing ?? null);
    }),
    findByIdAndUpdate: mock.fn((_id: string, update: Record<string, unknown>) => {
      state.updates.push(update);
      return { lean: async () => ({ ...(options.existing ?? {}), ...update }) };
    }),
    findOneAndUpdate: mock.fn(
      (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        state.findOneFilters.push(filter);
        state.updates.push(update);
        return {
          lean: async () =>
            options.existing ? { ...options.existing, ...update } : null,
        };
      },
    ),
  };

  const employeeModel = {
    findOne: mock.fn((filter: Record<string, unknown>) => {
      state.employeeFilters.push(filter);
      return thenableQuery(options.employee ?? null);
    }),
  };

  const incidentModel = {
    findOne: mock.fn((filter: Record<string, unknown>) => {
      state.incidentFilters.push(filter);
      return thenableQuery(options.incident ?? null);
    }),
  };

  const service = new OccupationalDiseaseStatisticalCaseService(
    caseModel as never,
    employeeModel as never,
    incidentModel as never,
  );

  return { service, caseModel, employeeModel, incidentModel, state };
}

function buildBaseDto(overrides: Record<string, unknown> = {}) {
  return {
    statisticalCaseId: 'EL-2026-001',
    occupationalQualification: OccupationalDiseaseQualification.QUALIFIED,
    recognitionDate: '2026-03-15T00:00:00.000Z',
    ...overrides,
  } as never;
}

let service: OccupationalDiseaseStatisticalCaseService;
let state: ReturnType<typeof buildService>['state'];

beforeEach(() => {
  const built = buildService({ employee: { _id: employeeIdA, companyId: companyIdA } });
  service = built.service;
  state = built.state;
});

describe('OccupationalDiseaseStatisticalCaseService — FASE 35B', () => {
  // ── 1. Creación correcta ──
  it('SVC-01: crea un caso QUALIFIED con período derivado de recognitionDate (Regla F)', async () => {
    const created = await service.create(companyIdA.toHexString(), buildBaseDto(), 'uid-owner');

    assert.equal(state.created.length, 1);
    assert.equal(created.statisticalCaseId, 'EL-2026-001');
    assert.equal(created.occupationalQualification, OccupationalDiseaseQualification.QUALIFIED);
    assert.equal(created.period, '2026-03');
    assert.equal(created.periodYear, 2026);
    assert.equal(created.periodMonth, 3);
    assert.equal(created.caseStatus, OccupationalDiseaseCaseStatus.OPEN);
    assert.equal(created.firstOccurrence, true);
    assert.equal(created.active, true);
    assert.equal(created.createdBy, 'uid-owner');
    // Tenant: companyId del argumento (server-side), nunca del body.
    assert.equal(String(created.companyId), companyIdA.toHexString());
  });

  it('SVC-02: companyId del tenant queda presente en todos los filtros de consulta', async () => {
    await service.findAll(companyIdA.toHexString(), {});
    await service.findOne(companyIdA.toHexString(), new Types.ObjectId().toHexString());

    assert.ok(state.findFilters.every((f) => String((f.companyId as Types.ObjectId)) === companyIdA.toHexString()));
    assert.ok(state.findOneFilters.every((f) => String((f.companyId as Types.ObjectId)) === companyIdA.toHexString()));
  });

  // ── 3. Cross-tenant ──
  it('SVC-03: Company A no puede ver el caso de Company B (findOne tenant-scoped)', async () => {
    const caseIdB = new Types.ObjectId().toHexString();
    // El "registro B" existe pero con companyIdB: findOne con companyIdA no lo encuentra.
    const built = buildService({
      existing: null,
      employee: { _id: employeeIdA, companyId: companyIdA },
    });
    const found = await built.service.findOne(
      companyIdA.toHexString(),
      caseIdB,
    );
    assert.equal(found, null);
  });

  it('SVC-04: Company A no puede actualizar el caso de Company B (update tenant-scoped)', async () => {
    const built = buildService({ existing: null });
    await assert.rejects(
      () =>
        built.service.update(
          companyIdA.toHexString(),
          new Types.ObjectId().toHexString(),
          { occupationalQualification: OccupationalDiseaseQualification.NOT_QUALIFIED } as never,
          'uid-owner',
        ),
      /no existe o no pertenece a la empresa/,
    );
  });

  it('SVC-05: Company A no puede desactivar el caso de Company B (deactivate tenant-scoped)', async () => {
    const built = buildService({ existing: null });
    const result = await built.service.deactivate(
      companyIdA.toHexString(),
      new Types.ObjectId().toHexString(),
      'uid-owner',
    );
    assert.equal(result, null);
  });

  // ── 4/5. Employee inexistente / de otra compañía ──
  it('SVC-06: rechaza employeeId inexistente (Regla A)', async () => {
    const built = buildService({ employee: null });
    await assert.rejects(
      () =>
        built.service.create(
          companyIdA.toHexString(),
          buildBaseDto({ employeeId: employeeIdA.toHexString() }),
          'uid-owner',
        ),
      /no existe o no pertenece a la empresa/,
    );
  });

  it('SVC-07: rechaza employeeId de OTRA compañía (cross-tenant)', async () => {
    const built = buildService({ employee: null });
    // El filtro del employee incluye companyId del tenant: un empleado de la
    // compañía B no coincide con el filtro de la compañía A → rechazo.
    await assert.rejects(
      () =>
        built.service.create(
          companyIdA.toHexString(),
          buildBaseDto({ employeeId: employeeIdB.toHexString() }),
          'uid-owner',
        ),
      /no existe o no pertenece a la empresa/,
    );
    // Verifica que el filtro fue tenant-scoped.
    const filter = built.state.employeeFilters[0];
    assert.equal(String((filter.companyId as Types.ObjectId)), companyIdA.toHexString());
  });

  it('SVC-08: acepta employeeId del MISMO tenant', async () => {
    const built = buildService({ employee: { _id: employeeIdA, companyId: companyIdA } });
    await built.service.create(
      companyIdA.toHexString(),
      buildBaseDto({ employeeId: employeeIdA.toHexString() }),
      'uid-owner',
    );
    assert.equal(
      String(built.state.created[0].employeeId as Types.ObjectId),
      employeeIdA.toHexString(),
    );
  });

  // ── 6/7. Deduplicación tenant-scoped ──
  it('SVC-09: rechaza statisticalCaseId duplicado DENTRO del tenant (índice único 11000)', async () => {
    const built = buildService({
      createError: { code: 11000 },
      employee: { _id: employeeIdA, companyId: companyIdA },
    });
    await assert.rejects(
      () =>
        built.service.create(
          companyIdA.toHexString(),
          buildBaseDto({ firstOccurrence: false }),
          'uid-owner',
        ),
      /Ya existe un caso estadístico/,
    );
  });

  it('SVC-10: el mismo statisticalCaseId es permitido en OTRO tenant (índice compuesto companyId+caseId)', async () => {
    // Sin error 11000, la creación en B con el mismo id debe funcionar.
    const built = buildService({ employee: null });
    const created = await built.service.create(
      companyIdB.toHexString(),
      buildBaseDto(), // mismo statisticalCaseId 'EL-2026-001'
      'uid-owner',
    );
    assert.equal(created.statisticalCaseId, 'EL-2026-001');
    assert.equal(String(created.companyId), companyIdB.toHexString());
  });

  // ── Gate 9: no-reconteo ──
  it('SVC-11: rechaza registrar como firstOccurrence un statisticalCaseId que ya existió (historial)', async () => {
    const built = buildService({
      existing: { _id: new Types.ObjectId(), companyId: companyIdA, statisticalCaseId: 'EL-2026-001' },
      employee: null,
    });
    await assert.rejects(
      () =>
        built.service.create(
          companyIdA.toHexString(),
          buildBaseDto(),
          'uid-owner',
        ),
      /no puede registrarse de nuevo como primera ocurrencia/,
    );
  });

  it('SVC-12: reabrir un caso CLOSED NO lo convierte en caso nuevo (firstOccurrence inmutable)', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      companyId: companyIdA,
      statisticalCaseId: 'EL-2026-001',
      caseStatus: OccupationalDiseaseCaseStatus.CLOSED,
      firstOccurrence: true,
      occupationalQualification: OccupationalDiseaseQualification.QUALIFIED,
      active: true,
    };
    const built = buildService({ existing });
    const updated = await built.service.reopen(companyIdA.toHexString(), (existing._id as Types.ObjectId).toHexString(), 'uid-owner');

    // Solo cambia caseStatus/updatedBy: NUNCA firstOccurrence ni recognitionDate.
    const update = built.state.updates[0];
    assert.equal(update.caseStatus, OccupationalDiseaseCaseStatus.OPEN);
    assert.equal('firstOccurrence' in update, false);
    assert.equal('recognitionDate' in update, false);
    assert.ok(updated);
  });

  it('SVC-13: cerrar un caso es transición explícita OPEN → CLOSED (y viceversa valida estado)', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      companyId: companyIdA,
      caseStatus: OccupationalDiseaseCaseStatus.OPEN,
    };
    const built = buildService({ existing });
    await built.service.close(companyIdA.toHexString(), (existing._id as Types.ObjectId).toHexString(), 'uid');
    assert.equal(built.state.updates[0].caseStatus, OccupationalDiseaseCaseStatus.CLOSED);

    // Cerrar un caso ya cerrado falla.
    const closed = { ...existing, caseStatus: OccupationalDiseaseCaseStatus.CLOSED };
    const built2 = buildService({ existing: closed });
    await assert.rejects(
      () =>
        built2.service.close(companyIdA.toHexString(), (existing._id as Types.ObjectId).toHexString(), 'uid'),
      /ya está en estado/,
    );
  });

  // ── 8. Fechas inválidas / futuras ──
  it('SVC-14: rechaza recognitionDate futura (Regla E)', async () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    await assert.rejects(
      () =>
        service.create(
          companyIdA.toHexString(),
          buildBaseDto({ recognitionDate: future.toISOString() }),
          'uid-owner',
        ),
      /no puede ser futura/,
    );
  });

  it('SVC-15: rechaza recognitionDate inválida', async () => {
    await assert.rejects(
      () =>
        service.create(
          companyIdA.toHexString(),
          buildBaseDto({ recognitionDate: 'no-es-fecha' }),
          'uid-owner',
        ),
      /Fecha inválida/,
    );
  });

  it('SVC-16: rechaza recognitionDate futura en update (Regla E sobre valor final)', async () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const existing = {
      _id: new Types.ObjectId(),
      companyId: companyIdA,
      occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW,
      recognitionDate: null,
    };
    const built = buildService({ existing });
    await assert.rejects(
      () =>
        built.service.update(
          companyIdA.toHexString(),
          (existing._id as Types.ObjectId).toHexString(),
          { recognitionDate: future.toISOString() } as never,
          'uid',
        ),
      /no puede ser futura/,
    );
  });

  // ── 9. Período ──
  it('SVC-17: el período siempre se deriva (no aceptado del frontend) — coherente con recognitionDate', async () => {
    // Marzo 2026 → period 2026-03 (nunca 2025-01 incoherente: Regla F).
    await service.create(
      companyIdA.toHexString(),
      buildBaseDto({ recognitionDate: '2026-03-15T00:00:00.000Z' }),
      'uid-owner',
    );
    const doc = state.created[0];
    assert.equal(doc.period, '2026-03');
    assert.equal(doc.periodYear, 2026);
    assert.equal(doc.periodMonth, 3);
  });

  it('SVC-18: caso sin recognitionDate deriva el período de hoy', async () => {
    await service.create(
      companyIdA.toHexString(),
      buildBaseDto({
        occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW,
        recognitionDate: undefined,
      }),
      'uid-owner',
    );
    const doc = state.created[0];
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    assert.equal(doc.period, expected);
  });

  // ── Regla B ──
  it('SVC-19: QUALIFIED sin recognitionDate es rechazado (Regla B)', async () => {
    await assert.rejects(
      () =>
        service.create(
          companyIdA.toHexString(),
          buildBaseDto({ recognitionDate: undefined }),
          'uid-owner',
        ),
      /QUALIFIED exige recognitionDate/,
    );
  });

  // ── 10. Estados inválidos (enums cerrados) ──
  it('SVC-20: los enums son cerrados (sin valores libres)', () => {
    assert.deepEqual(Object.values(OccupationalDiseaseQualification).sort(), [
      'DISCARDED',
      'NOT_QUALIFIED',
      'QUALIFIED',
      'UNDER_REVIEW',
    ]);
    assert.deepEqual(Object.values(OccupationalDiseaseCaseStatus).sort(), [
      'CLOSED',
      'OPEN',
    ]);
  });

  // ── 14/15. Reglas C/D ──
  it('SVC-21: NOT_QUALIFIED y DISCARDED no son casos válidos para métricas (isValidStatisticalCase)', () => {
    const base = { active: true, recognitionDate: new Date('2026-03-01T00:00:00Z') };
    assert.equal(
      service.isValidStatisticalCase({
        ...base,
        occupationalQualification: OccupationalDiseaseQualification.NOT_QUALIFIED,
      }),
      false,
    );
    assert.equal(
      service.isValidStatisticalCase({
        ...base,
        occupationalQualification: OccupationalDiseaseQualification.DISCARDED,
      }),
      false,
    );
    // UNDER_REVIEW tampoco (Regla C).
    assert.equal(
      service.isValidStatisticalCase({
        ...base,
        occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW,
      }),
      false,
    );
    // QUALIFIED + active + fecha → válido.
    assert.equal(
      service.isValidStatisticalCase({
        ...base,
        occupationalQualification: OccupationalDiseaseQualification.QUALIFIED,
      }),
      true,
    );
    // Inactivo no cuenta.
    assert.equal(
      service.isValidStatisticalCase({
        active: false,
        recognitionDate: new Date('2026-03-01T00:00:00Z'),
        occupationalQualification: OccupationalDiseaseQualification.QUALIFIED,
      }),
      false,
    );
  });

  it('SVC-22: isNewCaseOccurrence solo para QUALIFIED activo con fecha y primera ocurrencia', () => {
    const base = { active: true, recognitionDate: new Date('2026-03-01T00:00:00Z') };
    assert.equal(
      service.isNewCaseOccurrence({
        ...base,
        firstOccurrence: true,
        occupationalQualification: OccupationalDiseaseQualification.QUALIFIED,
      }),
      true,
    );
    assert.equal(
      service.isNewCaseOccurrence({
        ...base,
        firstOccurrence: false,
        occupationalQualification: OccupationalDiseaseQualification.QUALIFIED,
      }),
      false,
    );
  });

  // ── Ciclo de vida de calificación ──
  it('SVC-23: NOT_QUALIFIED/DISCARDED no pueden pasar a QUALIFIED (debe crearse caso nuevo)', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      companyId: companyIdA,
      occupationalQualification: OccupationalDiseaseQualification.NOT_QUALIFIED,
      recognitionDate: new Date('2026-02-01T00:00:00Z'),
    };
    const built = buildService({ existing });
    await assert.rejects(
      () =>
        built.service.update(
          companyIdA.toHexString(),
          (existing._id as Types.ObjectId).toHexString(),
          { occupationalQualification: OccupationalDiseaseQualification.QUALIFIED } as never,
          'uid',
        ),
      /no puede pasar a QUALIFIED/,
    );
  });

  it('SVC-24: UNDER_REVIEW → QUALIFIED es transición válida', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      companyId: companyIdA,
      occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW,
      recognitionDate: new Date('2026-03-01T00:00:00Z'),
    };
    const built = buildService({ existing });
    const updated = await built.service.update(
      companyIdA.toHexString(),
      (existing._id as Types.ObjectId).toHexString(),
      { occupationalQualification: OccupationalDiseaseQualification.QUALIFIED } as never,
      'uid',
    );
    assert.ok(updated);
  });

  // ── 11. Actualización / 13. Desactivación lógica ──
  it('SVC-25: update re-deriva el período cuando cambia recognitionDate (Regla F)', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      companyId: companyIdA,
      occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW,
      recognitionDate: new Date('2026-01-10T00:00:00Z'),
      period: '2026-01',
      periodYear: 2026,
      periodMonth: 1,
    };
    const built = buildService({ existing });
    await built.service.update(
      companyIdA.toHexString(),
      (existing._id as Types.ObjectId).toHexString(),
      { recognitionDate: '2026-05-20T00:00:00.000Z' } as never,
      'uid',
    );
    const update = built.state.updates[0];
    assert.equal(update.period, '2026-05');
    assert.equal(update.periodYear, 2026);
    assert.equal(update.periodMonth, 5);
  });

  it('SVC-26: deactivate/reactivate son borrado/reactivación lógica (active flag)', async () => {
    const existing = { _id: new Types.ObjectId(), companyId: companyIdA, active: true };
    const built = buildService({ existing });
    await built.service.deactivate(companyIdA.toHexString(), (existing._id as Types.ObjectId).toHexString(), 'uid');
    assert.equal(built.state.updates[0].active, false);

    await built.service.reactivate(companyIdA.toHexString(), (existing._id as Types.ObjectId).toHexString(), 'uid');
    assert.equal(built.state.updates[1].active, true);
  });

  // ── investigationRef (vínculo manual, no conversión automática — Gate 4) ──
  it('SVC-27: investigationRef válido (mismo tenant) se acepta como vínculo administrativo', async () => {
    const built = buildService({
      incident: { _id: investigationIdA, companyId: companyIdA },
      employee: null,
    });
    await built.service.create(
      companyIdA.toHexString(),
      buildBaseDto({ investigationRef: investigationIdA.toHexString() }),
      'uid-owner',
    );
    assert.equal(
      String(built.state.created[0].investigationRef),
      investigationIdA.toHexString(),
    );
  });

  it('SVC-28: investigationRef de OTRA compañía es rechazado (Gate 4/tenant)', async () => {
    const built = buildService({ incident: null, employee: null });
    await assert.rejects(
      () =>
        built.service.create(
          companyIdA.toHexString(),
          buildBaseDto({ investigationRef: investigationIdA.toHexString() }),
          'uid-owner',
        ),
      /no existe o no pertenece a la empresa/,
    );
  });
});
