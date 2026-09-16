import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { Types } from 'mongoose';
import { WasteManagementService } from './waste-management.service';
import {
  WasteDisposalFrequency,
  WasteManagementStatus,
  WasteType,
} from './schemas/waste-management-record.schema';

/**
 * FASE 34C — Tests del servicio WasteManagement (3.1.9).
 *
 * Framework REAL del proyecto: node:test + node:assert/strict (patrón
 * workplace-sanitary-conditions.service.spec.ts). Mocks por contrato.
 *
 * Cubre: CRUD, ACTIVE exige disposalMethod (§12), declaración de tipos (C1),
 * tenant isolation, cross-tenant bloqueado, deactivate (borrado lógico),
 * coherencia de fechas y enums cerrados.
 */

const companyIdA = new Types.ObjectId('507f1f77bcf86cd799439011');
const companyIdB = new Types.ObjectId('507f1f77bcf86cd799439099');

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
    declaration?: Record<string, unknown> | null;
  } = {},
) {
  const state: {
    created: Record<string, unknown>[];
    updates: Record<string, unknown>[];
    findFilters: Record<string, unknown>[];
    findOneFilters: Record<string, unknown>[];
    findOneAndUpdateFilters: Record<string, unknown>[];
    declarationUpserts: Record<string, unknown>[];
  } = {
    created: [],
    updates: [],
    findFilters: [],
    findOneFilters: [],
    findOneAndUpdateFilters: [],
    declarationUpserts: [],
  };

  const recordModel = {
    create: mock.fn(async (doc: Record<string, unknown>) => {
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
        state.findOneAndUpdateFilters.push(filter);
        state.updates.push(update);
        return { lean: async () => ({ ...(options.existing ?? {}), ...update }) };
      },
    ),
  };

  const declarationModel = {
    findOne: mock.fn((_filter: Record<string, unknown>) =>
      thenableQuery(options.declaration ?? null),
    ),
    findOneAndUpdate: mock.fn(
      (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        state.declarationUpserts.push({ filter, update });
        return { lean: async () => ({ ...update }) };
      },
    ),
  };

  const service = new WasteManagementService(
    recordModel as never,
    declarationModel as never,
  );

  return { service, recordModel, declarationModel, state };
}

/** Documento existente completo (para update/deactivate). */
function buildExisting(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(),
    companyId: companyIdA,
    code: 'RES-SOL-001',
    wasteType: WasteType.SOLID,
    hazardous: false,
    source: 'Talleres',
    generationDescription: 'Aceites usados y trapos contaminados',
    handlingMethod: 'Segregación en contenedores etiquetados',
    disposalMethod: 'Entrega a gestor autorizado',
    disposalDestination: 'Gestor XYZ — RMSD-2026-014',
    disposalFrequency: WasteDisposalFrequency.QUARTERLY,
    lastDisposalDate: new Date('2026-08-01T00:00:00Z'),
    nextDisposalDate: new Date('2026-11-01T00:00:00Z'),
    responsible: 'Coordinadora SST',
    evidenceUrl: 'gestor-xyz.com/manifiesto-2026-014',
    observations: '',
    status: WasteManagementStatus.ACTIVE,
    active: true,
    ...overrides,
  };
}

function validCreateDto(overrides: Record<string, unknown> = {}) {
  return {
    code: 'RES-SOL-001',
    wasteType: WasteType.SOLID,
    hazardous: false,
    source: 'Talleres',
    generationDescription: 'Aceites usados y trapos contaminados',
    handlingMethod: 'Segregación en contenedores etiquetados',
    disposalMethod: 'Entrega a gestor autorizado',
    disposalDestination: 'Gestor XYZ',
    disposalFrequency: WasteDisposalFrequency.QUARTERLY,
    lastDisposalDate: '2026-08-01T00:00:00.000Z',
    nextDisposalDate: '2026-11-01T00:00:00.000Z',
    responsible: 'Coordinadora SST',
    status: WasteManagementStatus.ACTIVE,
    ...overrides,
  };
}

describe('WasteManagementService — 3.1.9 (FASE 34C)', () => {
  describe('CREATE', () => {
    it('SVC-001: crea con companyId derivado de la sesión (nunca del body)', async () => {
      const { service, state } = buildService();
      const dto = validCreateDto();

      const created = await service.create(companyIdA.toHexString(), dto as never, 'uid-owner');

      assert.ok(created);
      const doc = state.created[0];
      assert.equal(String((doc.companyId as Types.ObjectId).toHexString()), companyIdA.toHexString());
      assert.equal(doc.createdBy, 'uid-owner');
      assert.equal(doc.active, true);
      assert.equal(doc.hazardous, false);
      assert.equal(doc.status, WasteManagementStatus.ACTIVE);
    });

    it('SVC-002: ACTIVE sin disposalMethod → rechazado (§12)', async () => {
      const { service } = buildService();
      const dto = validCreateDto({ disposalMethod: undefined });

      await assert.rejects(
        () => service.create(companyIdA.toHexString(), dto as never),
        /ACTIVE exige disposalMethod/,
      );
    });

    it('SVC-003: PLANNED sin disposalMethod → permitido (gestión no ejecutada)', async () => {
      const { service, state } = buildService();
      const dto = validCreateDto({
        status: WasteManagementStatus.PLANNED,
        disposalMethod: undefined,
        lastDisposalDate: undefined,
        nextDisposalDate: undefined,
      });

      await service.create(companyIdA.toHexString(), dto as never);
      assert.equal(state.created[0].status, WasteManagementStatus.PLANNED);
      assert.equal(state.created[0].disposalMethod, undefined);
    });

    it('SVC-004: nextDisposalDate < lastDisposalDate → rechazado', async () => {
      const { service } = buildService();
      const dto = validCreateDto({ nextDisposalDate: '2026-07-01T00:00:00.000Z' });

      await assert.rejects(
        () => service.create(companyIdA.toHexString(), dto as never),
        /no puede ser anterior a/,
      );
    });

    it('SVC-005: fecha inválida → rechazado', async () => {
      const { service } = buildService();
      const dto = validCreateDto({ lastDisposalDate: 'no-es-fecha' });

      await assert.rejects(
        () => service.create(companyIdA.toHexString(), dto as never),
        /Fecha inválida/,
      );
    });

    it('SVC-006: frecuencia por defecto ANNUAL', async () => {
      const { service, state } = buildService();
      const dto = validCreateDto();
      delete (dto as Record<string, unknown>).disposalFrequency;

      await service.create(companyIdA.toHexString(), dto as never);
      assert.equal(state.created[0].disposalFrequency, WasteDisposalFrequency.ANNUAL);
    });
  });

  describe('DECLARACIÓN de tipos generados (C1)', () => {
    it('DEC-001: declareWasteTypes hace upsert con companyId del tenant', async () => {
      const { service, state } = buildService();

      await service.declareWasteTypes(
        companyIdA.toHexString(),
        { declaredWasteTypes: [WasteType.SOLID, WasteType.LIQUID] } as never,
        'uid-owner',
      );

      assert.equal(state.declarationUpserts.length, 1);
      const { filter, update } = state.declarationUpserts[0] as {
        filter: Record<string, unknown>;
        update: Record<string, unknown>;
      };
      assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdA.toHexString());
      assert.deepEqual(update.declaredWasteTypes, [WasteType.SOLID, WasteType.LIQUID]);
      assert.equal(update.updatedBy, 'uid-owner');
    });

    it('DEC-002: getWasteTypeDeclaration consulta tenant-scoped', async () => {
      const { service, declarationModel } = buildService({
        declaration: { companyId: companyIdA, declaredWasteTypes: [WasteType.SOLID] },
      });

      const result = await service.getWasteTypeDeclaration(companyIdA.toHexString());

      assert.ok(result);
      const filter = (declarationModel.findOne.mock.calls[0].arguments[0]) as Record<string, unknown>;
      assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdA.toHexString());
    });
  });

  describe('FIND ALL — tenant isolation', () => {
    it('TEN-001: findAll filtra por companyId del tenant', async () => {
      const { service, state } = buildService();

      await service.findAll(companyIdA.toHexString());

      const filter = state.findFilters[0];
      assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdA.toHexString());
      assert.notEqual(String((filter.companyId as Types.ObjectId).toHexString()), companyIdB.toHexString());
    });

    it('TEN-002: filtros opcionales (wasteType/hazardous/status/active) van en el query', async () => {
      const { service, state } = buildService();

      await service.findAll(companyIdA.toHexString(), {
        wasteType: WasteType.LIQUID,
        hazardous: true,
        status: WasteManagementStatus.ACTIVE,
        active: true,
      });

      const filter = state.findFilters[0];
      assert.equal(filter.wasteType, WasteType.LIQUID);
      assert.equal(filter.hazardous, true);
      assert.equal(filter.status, WasteManagementStatus.ACTIVE);
      assert.equal(filter.active, true);
    });
  });

  describe('FIND ONE', () => {
    it('SVC-007: findOne valida tenant en el query', async () => {
      const { service, state } = buildService({ existing: buildExisting() });

      const record = await service.findOne(companyIdA.toHexString(), new Types.ObjectId().toHexString());

      assert.ok(state.findOneFilters.length >= 1);
      const filter = state.findOneFilters[0];
      assert.equal(String(filter.companyId), companyIdA.toHexString());
      assert.ok(record !== undefined);
    });

    it('SVC-008: ID inválido → null sin consultar', async () => {
      const { service, state } = buildService();

      const record = await service.findOne(companyIdA.toHexString(), 'no-es-objectid');

      assert.equal(record, null);
      assert.equal(state.findOneFilters.length, 0);
    });
  });

  describe('UPDATE', () => {
    it('SVC-009: update existente aplica cambios y updatedBy', async () => {
      const { service, state } = buildService({ existing: buildExisting() });
      const id = new Types.ObjectId().toHexString();

      const updated = await service.update(
        companyIdA.toHexString(),
        id,
        { status: WasteManagementStatus.SUSPENDED } as never,
        'uid-admin',
      );

      assert.ok(updated);
      assert.equal(state.updates[0].status, WasteManagementStatus.SUSPENDED);
      assert.equal(state.updates[0].updatedBy, 'uid-admin');
    });

    it('SVC-010: update a ACTIVE sin disposalMethod (ni previo) → rechazado', async () => {
      const { service } = buildService({
        existing: buildExisting({ status: WasteManagementStatus.PLANNED, disposalMethod: undefined }),
      });
      const id = new Types.ObjectId().toHexString();

      await assert.rejects(
        () =>
          service.update(
            companyIdA.toHexString(),
            id,
            { status: WasteManagementStatus.ACTIVE } as never,
          ),
        /ACTIVE exige disposalMethod/,
      );
    });

    it('SVC-011: update a ACTIVE con disposalMethod previo → permitido', async () => {
      const { service } = buildService({
        existing: buildExisting({ status: WasteManagementStatus.PLANNED }),
      });
      const id = new Types.ObjectId().toHexString();

      const updated = await service.update(
        companyIdA.toHexString(),
        id,
        { status: WasteManagementStatus.ACTIVE } as never,
      );
      assert.ok(updated);
    });

    it('SVC-012: update de registro inexistente → NotFoundException', async () => {
      const { service } = buildService({ existing: null });
      const id = new Types.ObjectId().toHexString();

      await assert.rejects(
        () => service.update(companyIdA.toHexString(), id, {} as never),
        /no existe o no pertenece/,
      );
    });

    it('SVC-013: update cross-tenant → bloqueado (query con tenant B no encuentra registro de A)', async () => {
      const recordA = buildExisting();
      const state2 = { findOneFilters: [] as Record<string, unknown>[] };
      const recordModelTenant = {
        create: mock.fn(async (doc: Record<string, unknown>) => ({ ...doc, _id: new Types.ObjectId(), toObject: () => doc })),
        find: mock.fn((_filter: Record<string, unknown>) => ({
          sort: () => ({ limit: () => ({ skip: () => ({ lean: async () => [] }) }) }),
        })),
        findOne: mock.fn((filter: Record<string, unknown>) => {
          state2.findOneFilters.push(filter);
          const matchesTenantA =
            filter.companyId instanceof Types.ObjectId &&
            filter.companyId.toHexString() === companyIdA.toHexString();
          return thenableQuery(matchesTenantA ? recordA : null);
        }),
        findByIdAndUpdate: mock.fn(async () => ({})),
        findOneAndUpdate: mock.fn(async () => ({})),
      };
      const declarationModelTenant = {
        findOne: mock.fn((_f: Record<string, unknown>) => thenableQuery(null)),
        findOneAndUpdate: mock.fn(async () => ({})),
      };
      const serviceTenant = new WasteManagementService(
        recordModelTenant as never,
        declarationModelTenant as never,
      );
      const id = (recordA._id as Types.ObjectId).toHexString();

      await assert.rejects(
        () => serviceTenant.update(companyIdB.toHexString(), id, {} as never),
        /no existe o no pertenece/,
      );
      const filter = state2.findOneFilters[0];
      assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdB.toHexString());
    });

    it('SVC-014: update con fechas incoherentes (next < last) → rechazado', async () => {
      const { service } = buildService({ existing: buildExisting() });
      const id = new Types.ObjectId().toHexString();

      await assert.rejects(
        () =>
          service.update(
            companyIdA.toHexString(),
            id,
            {
              lastDisposalDate: '2026-09-01T00:00:00.000Z',
              nextDisposalDate: '2026-08-01T00:00:00.000Z',
            } as never,
          ),
        /no puede ser anterior a/,
      );
    });
  });

  describe('DEACTIVATE (borrado lógico)', () => {
    it('SVC-015: deactivate hace active=false, sin borrado físico', async () => {
      const { service, state } = buildService({ existing: buildExisting() });
      const id = new Types.ObjectId().toHexString();

      const result = await service.deactivate(companyIdA.toHexString(), id, 'uid-owner');

      assert.ok(result);
      const update = state.updates[0];
      assert.equal(update.active, false);
      assert.equal(update.updatedBy, 'uid-owner');
    });

    it('SVC-016: deactivate valida tenant (companyId en el filtro)', async () => {
      const { service, state } = buildService({ existing: buildExisting() });

      await service.deactivate(companyIdB.toHexString(), new Types.ObjectId().toHexString());

      const filter = state.findOneAndUpdateFilters[0];
      assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdB.toHexString());
    });
  });

  describe('ENUMS / discriminador', () => {
    it('DOM-001: wasteType es un enum cerrado de 3 valores', () => {
      assert.deepEqual(Object.values(WasteType).sort(), ['GASEOUS', 'LIQUID', 'SOLID']);
    });

    it('DOM-002: los estados son el enum cerrado esperado', () => {
      assert.deepEqual(Object.values(WasteManagementStatus).sort(), [
        'ACTIVE',
        'PLANNED',
        'SUSPENDED',
      ]);
    });

    it('DOM-003: las frecuencias son el enum cerrado esperado', () => {
      assert.deepEqual(Object.values(WasteDisposalFrequency).sort(), [
        'ANNUAL',
        'MONTHLY',
        'QUARTERLY',
        'SEMIANNUAL',
        'WEEKLY',
      ]);
    });
  });
});
