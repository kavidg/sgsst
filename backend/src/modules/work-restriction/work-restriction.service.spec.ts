import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { Types } from 'mongoose';
import { WorkRestrictionService } from './work-restriction.service';
import {
  RestrictionStatus,
  RestrictionType,
} from './schemas/work-restriction.schema';

/**
 * FASE 33 — Tests del servicio WorkRestriction (3.1.6).
 *
 * Framework REAL del proyecto: node:test + node:assert/strict (mismo patrón
 * que occupational-medical-record-custody.service.spec.ts). Mocks por
 * contrato: queries Mongoose thenable + chainable (.lean()), EmployeesService
 * y modelo User inyectados.
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
    employeeFound?: boolean;
    userFound?: boolean;
    existing?: Record<string, unknown> | null;
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

  const restrictionModel = {
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
              lean: async () => [] as unknown[],
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

  const employeesService = {
    findOne: mock.fn(async () =>
      options.employeeFound === false ? null : { _id: new Types.ObjectId() },
    ),
  };

  const userModel = {
    findOne: mock.fn((_filter: Record<string, unknown>) =>
      thenableQuery(
        options.userFound === false ? null : { _id: new Types.ObjectId() },
      ),
    ),
  };

  const service = new WorkRestrictionService(
    restrictionModel as never,
    employeesService as never,
    userModel as never,
  );

  return { service, restrictionModel, employeesService, userModel, state };
}

/** Documento existente completo (para update/deactivate). */
function buildExisting(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(),
    companyId: companyIdA,
    employeeId: new Types.ObjectId(),
    restrictionType: RestrictionType.TEMPORARY_RESTRICTION,
    status: RestrictionStatus.ACTIVE,
    receivedAt: new Date('2026-01-10T10:00:00Z'),
    effectiveFrom: new Date('2026-01-12T00:00:00Z'),
    effectiveUntil: new Date('2026-03-12T00:00:00Z'),
    responsibleUserId: new Types.ObjectId(),
    actions: 'Adaptación temporal de tarea.',
    followUpDate: new Date('2026-02-10T00:00:00Z'),
    followUpStatus: 'En seguimiento.',
    evidence: 'Ref. ADMIN-2026-014',
    active: true,
    ...overrides,
  };
}

function validCreateDto() {
  return {
    employeeId: new Types.ObjectId().toHexString(),
    restrictionType: RestrictionType.TEMPORARY_RESTRICTION,
    receivedAt: '2026-01-10T10:00:00.000Z',
    effectiveFrom: '2026-01-12T00:00:00.000Z',
    effectiveUntil: '2026-03-12T00:00:00.000Z',
    responsibleUserId: new Types.ObjectId().toHexString(),
    actions: 'Cambio temporal de actividad a trabajo administrativo.',
    followUpDate: '2026-02-10T00:00:00.000Z',
    evidence: 'Concepto médico-laboral ref. ADMIN-2026-014',
  };
}

describe('WorkRestrictionService — 3.1.6 (FASE 33)', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────────────────
  it('CRUD-001: create ok → documento tenant-scoped con companyId derivado de sesión', async () => {
    const { service, state } = buildService();
    const dto = validCreateDto();

    const created = await service.create(companyIdA.toHexString(), dto, 'uid-owner');

    assert.ok(created);
    assert.equal(state.created.length, 1);
    const doc = state.created[0];
    assert.equal(
      (doc.companyId as Types.ObjectId).toHexString(),
      companyIdA.toHexString(),
    );
    assert.equal(doc.createdBy, 'uid-owner');
    // Estado por defecto ACTIVE.
    assert.equal(doc.status, RestrictionStatus.ACTIVE);
  });

  it('CRUD-002: findAll filtra por companyId del tenant (+ filtros opcionales)', async () => {
    const { service, state } = buildService();

    await service.findAll(companyIdA.toHexString(), {
      employeeId: new Types.ObjectId().toHexString(),
      status: 'ACTIVE',
    });

    assert.equal(state.findFilters.length, 1);
    const filter = state.findFilters[0];
    assert.equal(
      (filter.companyId as Types.ObjectId).toHexString(),
      companyIdA.toHexString(),
    );
    assert.ok(filter.employeeId);
    assert.equal(filter.status, 'ACTIVE');
  });

  it('CRUD-003: findOne con id inválido → null (sin tocar el modelo)', async () => {
    const { service, restrictionModel } = buildService();

    const result = await service.findOne(companyIdA.toHexString(), 'not-an-id');

    assert.equal(result, null);
    assert.equal(restrictionModel.findOne.mock.calls.length, 0);
  });

  it('CRUD-004: findOne con id válido → filtro _id + companyId', async () => {
    const { service, state } = buildService({ existing: buildExisting() });
    const id = new Types.ObjectId().toHexString();

    await service.findOne(companyIdA.toHexString(), id);

    const filter = state.findOneFilters[0];
    assert.equal((filter._id as Types.ObjectId).toHexString(), id);
    assert.equal(
      (filter.companyId as Types.ObjectId).toHexString(),
      companyIdA.toHexString(),
    );
  });

  it('CRUD-005: update ok → findByIdAndUpdate con campos y updatedBy', async () => {
    const { service, state } = buildService({ existing: buildExisting() });
    const id = new Types.ObjectId().toHexString();

    const updated = await service.update(
      companyIdA.toHexString(),
      id,
      { actions: 'Ajuste de jornada.', status: RestrictionStatus.FOLLOW_UP },
      'uid-admin',
    );

    assert.ok(updated);
    const update = state.updates[0];
    assert.equal(update.actions, 'Ajuste de jornada.');
    assert.equal(update.status, RestrictionStatus.FOLLOW_UP);
    assert.equal(update.updatedBy, 'uid-admin');
  });

  it('CRUD-006: update de registro inexistente → null', async () => {
    const { service } = buildService({ existing: null });

    const result = await service.update(
      companyIdA.toHexString(),
      new Types.ObjectId().toHexString(),
      { actions: 'x' },
    );

    assert.equal(result, null);
  });

  it('CRUD-007: deactivate → borrado lógico scoped por companyId', async () => {
    const { service, state } = buildService({ existing: buildExisting() });
    const id = new Types.ObjectId().toHexString();

    const result = await service.deactivate(
      companyIdA.toHexString(),
      id,
      'uid-owner',
    );

    assert.ok(result);
    const filter = state.findOneAndUpdateFilters[0];
    assert.equal(
      (filter.companyId as Types.ObjectId).toHexString(),
      companyIdA.toHexString(),
    );
    const update = state.updates[0];
    assert.equal(update.active, false);
    assert.equal(update.updatedBy, 'uid-owner');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TENANT ISOLATION
  // ─────────────────────────────────────────────────────────────────────────
  it('TENANT-001: create con employee de otro tenant → rechazado', async () => {
    const { service } = buildService({ employeeFound: false });

    await assert.rejects(
      () => service.create(companyIdA.toHexString(), validCreateDto()),
      /no existe o no pertenece a la empresa/,
    );
  });

  it('TENANT-002: create con responsibleUser de otro tenant → rechazado', async () => {
    const { service } = buildService({ userFound: false });

    await assert.rejects(
      () => service.create(companyIdA.toHexString(), validCreateDto()),
      /no existe o no pertenece a la empresa/,
    );
  });

  it('TENANT-003: update con employeeId de otro tenant → rechazado', async () => {
    const { service } = buildService({
      existing: buildExisting(),
      employeeFound: false,
    });

    await assert.rejects(
      () =>
        service.update(companyIdA.toHexString(), new Types.ObjectId().toHexString(), {
          employeeId: new Types.ObjectId().toHexString(),
        }),
      /no existe o no pertenece a la empresa/,
    );
  });

  it('TENANT-004: el filtro de lectura SIEMPRE incluye companyId del usuario', async () => {
    const { service, state } = buildService({ existing: null });

    await service.findOne(companyIdB.toHexString(), new Types.ObjectId().toHexString());

    const filter = state.findOneFilters[0];
    assert.equal(
      (filter.companyId as Types.ObjectId).toHexString(),
      companyIdB.toHexString(),
    );
    assert.notEqual(
      (filter.companyId as Types.ObjectId).toHexString(),
      companyIdA.toHexString(),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FECHAS
  // ─────────────────────────────────────────────────────────────────────────
  it('DATE-001: create con effectiveUntil < effectiveFrom → rechazado', async () => {
    const { service } = buildService();
    const dto = {
      ...validCreateDto(),
      effectiveFrom: '2026-03-12T00:00:00.000Z',
      effectiveUntil: '2026-01-12T00:00:00.000Z',
    };

    await assert.rejects(
      () => service.create(companyIdA.toHexString(), dto),
      /effectiveUntil.*no puede ser anterior a effectiveFrom/,
    );
  });

  it('DATE-002: create con fecha inválida → rechazado', async () => {
    const { service } = buildService();
    const dto = { ...validCreateDto(), receivedAt: 'not-a-date' };

    await assert.rejects(
      () => service.create(companyIdA.toHexString(), dto),
      /Fecha inválida en receivedAt/,
    );
  });

  it('DATE-003: update con effectiveUntil < effectiveFrom existente → rechazado', async () => {
    const { service } = buildService({ existing: buildExisting() });

    await assert.rejects(
      () =>
        service.update(companyIdA.toHexString(), new Types.ObjectId().toHexString(), {
          effectiveUntil: '2026-01-01T00:00:00.000Z',
        }),
      /no puede ser anterior/,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ESTADOS
  // ─────────────────────────────────────────────────────────────────────────
  it('STATUS-001: create con FOLLOW_UP sin followUpDate → rechazado', async () => {
    const { service } = buildService();
    const dto = {
      ...validCreateDto(),
      status: RestrictionStatus.FOLLOW_UP,
      followUpDate: undefined,
    };

    await assert.rejects(
      () => service.create(companyIdA.toHexString(), dto),
      /FOLLOW_UP exige followUpDate/,
    );
  });

  it('STATUS-002: transición ilegal CLOSED → ACTIVE → rechazada', async () => {
    const { service } = buildService({
      existing: buildExisting({ status: RestrictionStatus.CLOSED }),
    });

    await assert.rejects(
      () =>
        service.update(companyIdA.toHexString(), new Types.ObjectId().toHexString(), {
          status: RestrictionStatus.ACTIVE,
        }),
      /Estado terminal/,
    );
  });

  it('STATUS-003: transición legal ACTIVE → FOLLOW_UP permitida (followUpDate existente)', async () => {
    const { service, state } = buildService({ existing: buildExisting() });

    const result = await service.update(
      companyIdA.toHexString(),
      new Types.ObjectId().toHexString(),
      { status: RestrictionStatus.FOLLOW_UP },
    );

    assert.ok(result);
    assert.equal(state.updates[0].status, RestrictionStatus.FOLLOW_UP);
  });

  it('STATUS-004: FOLLOW_UP sin followUpDate previo ni nuevo → rechazado en update', async () => {
    const { service } = buildService({
      existing: buildExisting({ followUpDate: undefined }),
    });

    await assert.rejects(
      () =>
        service.update(companyIdA.toHexString(), new Types.ObjectId().toHexString(), {
          status: RestrictionStatus.FOLLOW_UP,
        }),
      /FOLLOW_UP exige followUpDate/,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REFERENCIAS Y PRIVACIDAD
  // ─────────────────────────────────────────────────────────────────────────
  it('REF-001: employeeId con formato inválido → rechazado', async () => {
    const { service } = buildService();
    const dto = { ...validCreateDto(), employeeId: 'not-a-mongo-id' };

    await assert.rejects(
      () => service.create(companyIdA.toHexString(), dto),
      /employeeId inválido/,
    );
  });

  it('PRIVACY-001: el documento creado NO contiene campos clínicos', async () => {
    const { service, state } = buildService();

    await service.create(companyIdA.toHexString(), validCreateDto(), 'uid-owner');

    const doc = state.created[0];
    const clinicalFields = [
      'diagnosis',
      'diagnostico',
      'cie',
      'icdCode',
      'clinicalHistory',
      'historiaClinica',
      'treatment',
      'tratamiento',
      'medication',
      'medicamento',
      'symptoms',
      'sintomas',
      'examResults',
      'medicalNotes',
    ];
    for (const field of clinicalFields) {
      assert.ok(!(field in doc), `campo clínico prohibido presente: ${field}`);
    }
  });
});
