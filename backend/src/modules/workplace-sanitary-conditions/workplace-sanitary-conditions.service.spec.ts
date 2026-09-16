import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { Types } from 'mongoose';
import { WorkplaceSanitaryConditionsService } from './workplace-sanitary-conditions.service';
import {
  SanitaryConditionResult,
  SanitaryConditionStatus,
  SanitaryConditionType,
  VerificationFrequency,
} from './schemas/workplace-sanitary-condition.schema';

/**
 * FASE 34B — Tests del servicio WorkplaceSanitaryConditions (3.1.8).
 *
 * Framework REAL del proyecto: node:test + node:assert/strict (patrón
 * work-restriction.service.spec.ts). Mocks por contrato: queries Mongoose
 * thenable + chainable (.lean()).
 *
 * Cubre: CRUD, tenant isolation, cross-tenant bloqueado, deactivate (borrado
 * lógico), validaciones de fechas y enums cerrados (discriminador).
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
  } = {},
) {
  const state: {
    created: Record<string, unknown>[];
    updates: Record<string, unknown>[];
    findFilters: Record<string, unknown>[];
    findOneFilters: Record<string, unknown>[];
    findOneAndUpdateFilters: Record<string, unknown>[];
  } = {
    created: [],
    updates: [],
    findFilters: [],
    findOneFilters: [],
    findOneAndUpdateFilters: [],
  };

  const conditionModel = {
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

  const service = new WorkplaceSanitaryConditionsService(conditionModel as never);

  return { service, conditionModel, state };
}

/** Documento existente completo (para update/deactivate). */
function buildExisting(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(),
    companyId: companyIdA,
    conditionType: SanitaryConditionType.POTABLE_WATER,
    code: 'AGUA-001',
    description: 'Verificación de potabilidad',
    location: 'Sede principal',
    status: SanitaryConditionStatus.OPERATIONAL,
    conditionResult: SanitaryConditionResult.APT,
    lastVerificationDate: new Date('2026-08-01T00:00:00Z'),
    nextVerificationDate: new Date('2027-08-01T00:00:00Z'),
    verificationFrequency: VerificationFrequency.ANNUAL,
    responsible: 'Coordinadora SST',
    evidenceUrl: 'lab.example.com/informe-2026',
    observations: '',
    active: true,
    ...overrides,
  };
}

function validCreateDto() {
  return {
    conditionType: SanitaryConditionType.POTABLE_WATER,
    code: 'AGUA-001',
    description: 'Verificación de potabilidad del agua',
    location: 'Sede principal — cocina',
    lastVerificationDate: '2026-08-01T00:00:00.000Z',
    nextVerificationDate: '2027-08-01T00:00:00.000Z',
    verificationFrequency: VerificationFrequency.ANNUAL,
    responsible: 'Coordinadora SST',
    evidenceUrl: 'lab.example.com/informe-2026',
  };
}

describe('WorkplaceSanitaryConditionsService — 3.1.8 (FASE 34B)', () => {
  describe('CREATE', () => {
    it('SVC-001: crea con companyId derivado de la sesión (nunca del body)', async () => {
      const { service, state } = buildService();
      const dto = validCreateDto();

      const created = await service.create(companyIdA.toHexString(), dto as never, 'uid-owner');

      assert.ok(created);
      assert.equal(state.created.length, 1);
      const doc = state.created[0];
      assert.equal(String((doc.companyId as Types.ObjectId).toHexString()), companyIdA.toHexString());
      assert.equal(doc.createdBy, 'uid-owner');
      assert.equal(doc.updatedBy, 'uid-owner');
      assert.equal(doc.active, true);
      assert.equal(doc.status, SanitaryConditionStatus.OPERATIONAL);
      assert.equal(doc.conditionResult, SanitaryConditionResult.APT);
      assert.equal(doc.verificationFrequency, VerificationFrequency.ANNUAL);
    });

    it('SVC-002: nextVerificationDate < lastVerificationDate → rechazado', async () => {
      const { service } = buildService();
      const dto = {
        ...validCreateDto(),
        nextVerificationDate: '2026-07-01T00:00:00.000Z',
      };

      await assert.rejects(
        () => service.create(companyIdA.toHexString(), dto as never),
        /no puede ser anterior a/,
      );
    });

    it('SVC-003: fecha inválida → rechazado', async () => {
      const { service } = buildService();
      const dto = { ...validCreateDto(), lastVerificationDate: 'no-es-fecha' };

      await assert.rejects(
        () => service.create(companyIdA.toHexString(), dto as never),
        /Fecha inválida/,
      );
    });

    it('SVC-004: valores por defecto correctos (status/result/frequency/active)', async () => {
      const { service, state } = buildService();
      const dto = validCreateDto();
      delete (dto as Record<string, unknown>).nextVerificationDate;
      delete (dto as Record<string, unknown>).verificationFrequency;

      await service.create(companyIdA.toHexString(), dto as never);

      const doc = state.created[0];
      assert.equal(doc.verificationFrequency, VerificationFrequency.ANNUAL);
      assert.equal(doc.nextVerificationDate, undefined);
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

    it('TEN-002: filtros opcionales (conditionType/status/active) van en el query', async () => {
      const { service, state } = buildService();

      await service.findAll(companyIdA.toHexString(), {
        conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT,
        status: SanitaryConditionStatus.DEFICIENT,
        active: true,
      });

      const filter = state.findFilters[0];
      assert.equal(filter.conditionType, SanitaryConditionType.GARBAGE_MANAGEMENT);
      assert.equal(filter.status, SanitaryConditionStatus.DEFICIENT);
      assert.equal(filter.active, true);
    });

    it('TEN-003: Company A no recibe registros de Company B (query tenant-scoped)', async () => {
      const { service, state } = buildService({
        findResults: [buildExisting()] as unknown as Record<string, unknown>[],
      });

      // El mock solo entrega lo que el modelo devolvería para el filtro A;
      // se demuestra que el filtro SIEMPRE incluye companyId de A.
      const records = await service.findAll(companyIdA.toHexString());
      assert.equal(records.length, 1);

      const filter = state.findFilters[0];
      assert.equal(
        String((filter.companyId as Types.ObjectId).toHexString()),
        companyIdA.toHexString(),
      );
    });
  });

  describe('FIND ONE', () => {
    it('SVC-005: findOne valida tenant en el query', async () => {
      const { service, state } = buildService({ existing: buildExisting() });

      const record = await service.findOne(companyIdA.toHexString(), (state as unknown as { x?: string }).x ?? new Types.ObjectId().toHexString());

      // El query incluye _id + companyId (aunque el mock devuelva el registro).
      assert.ok(state.findOneFilters.length >= 1);
      const filter = state.findOneFilters[0];
      assert.equal(String(filter.companyId), companyIdA.toHexString());
      assert.ok(record !== undefined);
    });

    it('SVC-006: ID inválido → null sin consultar', async () => {
      const { service, state } = buildService();

      const record = await service.findOne(companyIdA.toHexString(), 'no-es-objectid');

      assert.equal(record, null);
      assert.equal(state.findOneFilters.length, 0);
    });
  });

  describe('UPDATE', () => {
    it('SVC-007: update existente del tenant aplica cambios y updatedBy', async () => {
      const { service, state } = buildService({ existing: buildExisting() });
      const id = new Types.ObjectId().toHexString();

      const updated = await service.update(
        companyIdA.toHexString(),
        id,
        { status: SanitaryConditionStatus.DEFICIENT, conditionResult: SanitaryConditionResult.NOT_APT } as never,
        'uid-admin',
      );

      assert.ok(updated);
      assert.equal(state.updates[0].status, SanitaryConditionStatus.DEFICIENT);
      assert.equal(state.updates[0].conditionResult, SanitaryConditionResult.NOT_APT);
      assert.equal(state.updates[0].updatedBy, 'uid-admin');
    });

    it('SVC-008: update de registro inexistente → NotFoundException (cross-tenant incluido)', async () => {
      const { service } = buildService({ existing: null });
      const id = new Types.ObjectId().toHexString();

      await assert.rejects(
        () => service.update(companyIdA.toHexString(), id, { status: SanitaryConditionStatus.DEFICIENT } as never),
        (err: Error) => /no existe o no pertenece a la empresa/.test(err.message),
      );
    });

    it('SVC-009: update cross-tenant → bloqueado (query incluye companyId del tenant)', async () => {
      // El registro existente pertenece a A y SOLO es visible con el filtro de
      // A. Un update emitido con el tenant B no lo encuentra → NotFoundException.
      const recordA = buildExisting();
      const state2 = {
        findOneFilters: [] as Record<string, unknown>[],
      };
      const conditionModelTenant = {
        create: mock.fn(async (doc: Record<string, unknown>) => ({ ...doc, _id: new Types.ObjectId(), toObject: () => doc })),
        find: mock.fn((_filter: Record<string, unknown>) => ({
          sort: () => ({ limit: () => ({ skip: () => ({ lean: async () => [] }) }) }),
        })),
        // findOne emula el filtro real: solo responde si el query pide el tenant A.
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
      const serviceTenant = new WorkplaceSanitaryConditionsService(conditionModelTenant as never);
      const id = (recordA._id as Types.ObjectId).toHexString();

      await assert.rejects(
        () => serviceTenant.update(companyIdB.toHexString(), id, {} as never),
        /no existe o no pertenece/,
      );
      const filter = state2.findOneFilters[0];
      assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdB.toHexString());
    });

    it('SVC-010: update con fechas incoherentes (next < last) → rechazado', async () => {
      const { service } = buildService({ existing: buildExisting() });
      const id = new Types.ObjectId().toHexString();

      await assert.rejects(
        () =>
          service.update(
            companyIdA.toHexString(),
            id,
            {
              lastVerificationDate: '2026-09-01T00:00:00.000Z',
              nextVerificationDate: '2026-08-01T00:00:00.000Z',
            } as never,
          ),
        /no puede ser anterior a/,
      );
    });

    it('SVC-011: update conserva nextVerificationDate previa al validar coherencia', async () => {
      // existing.nextVerificationDate = 2027-08-01; si solo se actualiza last
      // a una fecha posterior a next → rechazado (coherencia con valor previo).
      const { service } = buildService({ existing: buildExisting() });
      const id = new Types.ObjectId().toHexString();

      await assert.rejects(
        () =>
          service.update(
            companyIdA.toHexString(),
            id,
            { lastVerificationDate: '2027-12-01T00:00:00.000Z' } as never,
          ),
        /no puede ser anterior a/,
      );
    });
  });

  describe('DEACTIVATE (borrado lógico)', () => {
    it('SVC-012: deactivate hace active=false, sin borrado físico', async () => {
      const { service, state } = buildService({ existing: buildExisting() });
      const id = new Types.ObjectId().toHexString();

      const result = await service.deactivate(companyIdA.toHexString(), id, 'uid-owner');

      assert.ok(result);
      const update = state.updates[0];
      assert.equal(update.active, false);
      assert.equal(update.updatedBy, 'uid-owner');
    });

    it('SVC-013: deactivate valida tenant (companyId en el filtro)', async () => {
      const { service, state } = buildService({ existing: buildExisting() });

      await service.deactivate(companyIdB.toHexString(), new Types.ObjectId().toHexString());

      const filter = state.findOneAndUpdateFilters[0];
      assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdB.toHexString());
    });
  });

  describe('ENUMS / discriminador', () => {
    it('DOM-001: el discriminador conditionType es un enum cerrado de 3 valores', () => {
      assert.deepEqual(Object.values(SanitaryConditionType).sort(), [
        'GARBAGE_MANAGEMENT',
        'POTABLE_WATER',
        'SANITARY_SERVICE',
      ]);
    });

    it('DOM-002: los estados son el enum cerrado esperado', () => {
      assert.deepEqual(Object.values(SanitaryConditionStatus).sort(), [
        'DEFICIENT',
        'OPERATIONAL',
        'OUT_OF_SERVICE',
      ]);
    });

    it('DOM-003: los resultados de verificación son el enum cerrado esperado', () => {
      assert.deepEqual(Object.values(SanitaryConditionResult).sort(), [
        'APT',
        'INCONCLUSIVE',
        'NOT_APT',
      ]);
    });

    it('DOM-004: las frecuencias son el enum cerrado esperado', () => {
      assert.deepEqual(Object.values(VerificationFrequency).sort(), [
        'ANNUAL',
        'MONTHLY',
        'QUARTERLY',
        'SEMIANNUAL',
      ]);
    });
  });
});
