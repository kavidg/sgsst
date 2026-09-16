import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { HealthPromotionService } from './health-promotion.service';
import { Types } from 'mongoose';
import {
  HealthPromotionActivityStatus,
  HealthPromotionCategory,
} from './schemas/health-promotion-activity.schema';

const companyA = new Types.ObjectId('64b00000000000000000a001');
const companyB = new Types.ObjectId('64b00000000000000000a002');
const empA = new Types.ObjectId('64b00000000000000000b001');
const empB = new Types.ObjectId('64b00000000000000000b002');
const riskA = new Types.ObjectId('64b00000000000000000c001');
const riskB = new Types.ObjectId('64b00000000000000000c002');

/** Mock de Model de Mongoose (mismo patrón que job-profile.service.spec). */
function createModelMock() {
  const docs: Record<string, unknown>[] = [];
  let idCounter = 1;

  function chainFind() {
    const chain: Record<string, unknown> = {};
    chain.sort = mock.fn(() => chain);
    chain.select = mock.fn(() => chain);
    chain.lean = mock.fn(() => chain);
    chain.exec = mock.fn(() => Promise.resolve(docs));
    return chain;
  }

  function chainFindOne() {
    const chain: Record<string, unknown> = {};
    chain.select = mock.fn(() => chain);
    chain.lean = mock.fn(() => chain);
    chain.exec = mock.fn(() => Promise.resolve(docs[0] ?? null));
    return chain;
  }

  function nextObjectId() {
    const hex = (idCounter++).toString(16).padStart(24, '0');
    return new Types.ObjectId(hex);
  }
  const model: any = function Model(this: Record<string, unknown>, fields?: Record<string, unknown>) {
    Object.assign(this, fields ?? {});
  };
  model.prototype.save = function save(this: Record<string, unknown>) {
    this._id = nextObjectId();
    docs.push(this);
    return Promise.resolve(this);
  };
  model.find = mock.fn((..._args: unknown[]) => chainFind());
  model.findOne = mock.fn((..._args: unknown[]) => chainFindOne());
  model.findOneAndUpdate = mock.fn((..._args: unknown[]) => chainFindOne());

  return { model, docs };
}

describe('HealthPromotionService (3.1.2)', () => {
  let service: HealthPromotionService;
  let activityModel: ReturnType<typeof createModelMock>;
  let employeeModel: ReturnType<typeof createModelMock>;
  let riskModel: ReturnType<typeof createModelMock>;

  beforeEach(() => {
    activityModel = createModelMock();
    employeeModel = createModelMock();
    riskModel = createModelMock();
    // Por defecto los empleados/riesgos referenciados pertenecen a la empresa A.
    employeeModel.docs.push({ _id: empA, companyId: companyA }, { _id: empB, companyId: companyA });
    riskModel.docs.push({ _id: riskA, companyId: companyA }, { _id: riskB, companyId: companyA });
    service = new HealthPromotionService(
      activityModel.model as never,
      employeeModel.model as never,
      riskModel.model as never,
    );
  });

  it('CRUD-001: create persiste la actividad con companyId y convierte referencias', async () => {
    const result = await service.create(companyA, {
      code: 'PYP-001',
      title: 'Jornada de vacunación',
      category: HealthPromotionCategory.HEALTH_VACCINATION,
      objective: 'Vacunar contra influenza',
      activityDate: '2026-01-15',
      responsible: 'Dra. Pérez',
      targetPopulation: 'Todo el personal de planta',
      targetEmployeeIds: [String(empA)],
      participantEmployeeIds: [String(empA), String(empB)],
      relatedRiskIds: [String(riskA), String(riskB)],
      evidence: 'Acta de jornada #12',
      status: HealthPromotionActivityStatus.COMPLETED,
    }, 'uid-1');

    assert.ok(result);
    const saved = result as unknown as Record<string, unknown>;
    assert.equal(saved.companyId, companyA);
    assert.equal(saved.createdBy, 'uid-1');
    assert.equal(saved.code, 'PYP-001');
    const participants = saved.participantEmployeeIds as Types.ObjectId[];
    assert.equal(participants.length, 2);
    assert.ok(participants.every((id) => id instanceof Types.ObjectId));
    const risks = saved.relatedRiskIds as Types.ObjectId[];
    assert.equal(risks.length, 2);
    assert.ok(risks.every((id) => id instanceof Types.ObjectId));
  });

  it('CRUD-002: create rechaza referencia cross-tenant de trabajador', async () => {
    // Solo existen empleados de la empresa A; se crea en empresa B.
    employeeModel.docs.length = 0;
    await assert.rejects(
      () =>
        service.create(companyB, {
          code: 'X',
          title: 'X',
          participantEmployeeIds: [String(empA)],
        }),
      (err: Error) => {
        assert.ok(err.message.includes('trabajadores'));
        return true;
      },
    );
  });

  it('TENANT-001: findAll filtra por companyId y estado', async () => {
    activityModel.docs.push({ _id: new Types.ObjectId(), companyId: companyA, status: 'COMPLETED' });
    await service.findAll(companyA, { status: 'COMPLETED' });
    const callArg = activityModel.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(callArg.companyId, companyA);
    assert.equal(callArg.status, 'COMPLETED');
  });

  it('CRUD-003: findOne lanza NotFound si no existe en el tenant', async () => {
    await assert.rejects(
      () => service.findOne(String(new Types.ObjectId()), companyA),
      /no encontrada/,
    );
  });

  it('TENANT-002: findOne filtra por companyId', async () => {
    activityModel.docs.push({ _id: new Types.ObjectId(), companyId: companyA });
    await service.findOne(String(new Types.ObjectId()), companyB);
    const callArg = activityModel.model.findOne.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(callArg.companyId, companyB);
  });

  it('CRUD-004: update rechaza riesgo cross-tenant', async () => {
    riskModel.docs.length = 0;
    await assert.rejects(
      () =>
        service.update(String(new Types.ObjectId()), companyA, {
          relatedRiskIds: [String(riskA)],
        }),
      () => true,
    );
  });

  it('TENANT-003: update filtra por companyId (no permite actualizar actividad de otra empresa)', async () => {
    activityModel.docs.push({ _id: new Types.ObjectId(), companyId: companyA });
    await service.update(String(new Types.ObjectId()), companyB, { title: 'Hack' });
    const callArg = activityModel.model.findOneAndUpdate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(callArg.companyId, companyB);
  });

  it('CRUD-005: deactivate marca active=false con updatedBy', async () => {
    const doc = { _id: new Types.ObjectId(), companyId: companyA, active: true };
    activityModel.docs.push(doc);
    const result = await service.deactivate(String(doc._id), companyA, 'uid-2');
    assert.ok(result);
    const updateArg = activityModel.model.findOneAndUpdate.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.equal(updateArg.active, false);
    assert.equal(updateArg.updatedBy, 'uid-2');
  });

  it('TEMP-001: COMPLETED sin activityDate es rechazado', async () => {
    await assert.rejects(
      () =>
        service.create(companyA, {
          code: 'X',
          title: 'Actividad',
          status: HealthPromotionActivityStatus.COMPLETED,
        }),
      (err: Error) => {
        assert.ok(err.message.includes('activityDate'));
        return true;
      },
    );
  });

  it('TEMP-002: COMPLETED con fecha futura es rechazado', async () => {
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await assert.rejects(
      () =>
        service.create(companyA, {
          code: 'X',
          title: 'Actividad',
          activityDate: future,
          status: HealthPromotionActivityStatus.COMPLETED,
        }),
      (err: Error) => {
        assert.ok(err.message.includes('futura'));
        return true;
      },
    );
  });

  it('TEMP-003: COMPLETED con fecha pasada es aceptado', async () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await service.create(companyA, {
      code: 'PYP-OK',
      title: 'Campaña salud cardiovascular',
      activityDate: past,
      status: HealthPromotionActivityStatus.COMPLETED,
      responsible: 'Dra. Pérez',
      evidence: 'Registro de asistencia',
    });
    assert.ok(result);
  });

  it('VALID-001: update normaliza referencias a ObjectIds', async () => {
    const doc = { _id: new Types.ObjectId(), companyId: companyA, active: true };
    activityModel.docs.push(doc);
    employeeModel.docs.length = 0;
    employeeModel.docs.push({ _id: empA, companyId: companyA });
    await service.update(String(doc._id), companyA, { targetEmployeeIds: [String(empA)] });
    const updateArg = activityModel.model.findOneAndUpdate.mock.calls[0].arguments[1] as Record<string, unknown>;
    const ids = updateArg.targetEmployeeIds as Types.ObjectId[];
    assert.equal(ids.length, 1);
    assert.ok(ids[0] instanceof Types.ObjectId);
  });

  it('VALID-002: sin referencias no consulta Employee ni Risk', async () => {
    const empBefore = employeeModel.model.find.mock.callCount();
    const riskBefore = riskModel.model.find.mock.callCount();
    const result = await service.create(companyA, {
      code: 'PYP-001',
      title: 'Actividad simple',
      status: HealthPromotionActivityStatus.PLANNED,
    });
    assert.ok(result);
    assert.equal(employeeModel.model.find.mock.callCount(), empBefore, 'no consulta Employee');
    assert.equal(riskModel.model.find.mock.callCount(), riskBefore, 'no consulta Risk');
  });
});
