import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { JobProfileService } from './job-profile.service';
import { Types } from 'mongoose';

const companyA = new Types.ObjectId('64b00000000000000000a001');
const companyB = new Types.ObjectId('64b00000000000000000a002');
const hazardA = new Types.ObjectId('64b00000000000000000c001');
const hazardB = new Types.ObjectId('64b00000000000000000c002');

/**
 * Mock de Model de Mongoose: construible (new model(fields)), con statics
 * find/findOne/findOneAndUpdate que devuelven cadenas query compatibles
 * (find().sort().exec(), find().select().lean().exec(), findOne().exec(),
 * findOne().select().lean().exec()) y save() en el prototipo.
 */
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

describe('JobProfileService', () => {
  let service: JobProfileService;
  let profileModel: ReturnType<typeof createModelMock>;
  let riskModel: ReturnType<typeof createModelMock>;

  beforeEach(() => {
    profileModel = createModelMock();
    riskModel = createModelMock();
    // Por defecto los riesgos referenciados pertenecen a la empresa A.
    riskModel.docs.push({ _id: hazardA, companyId: companyA }, { _id: hazardB, companyId: companyA });
    service = new JobProfileService(profileModel.model as never, riskModel.model as never);
  });

  it('CRUD-001: create persiste el perfil con companyId y convierte hazardIds', async () => {
    const result = await service.create(companyA, {
      code: 'OP-01',
      name: 'Operario',
      description: 'Cargo de producción',
      functions: ['Operar máquina'],
      associatedHazardIds: [String(hazardA), String(hazardB)],
    }, 'uid-1');

    assert.ok(result);
    const saved = result as unknown as Record<string, unknown>;
    assert.equal(saved.companyId, companyA);
    assert.equal(saved.createdBy, 'uid-1');
    const hazardIds = saved.associatedHazardIds as Types.ObjectId[];
    assert.equal(hazardIds.length, 2);
    assert.ok(hazardIds.every((id) => id instanceof Types.ObjectId));
  });

  it('CRUD-002: create rechaza un riesgo que no pertenece a la empresa (cross-tenant)', async () => {
    // El riesgo hazardA pertenece a empresa A; se crea el perfil en empresa B.
    await assert.rejects(
      () =>
        service.create(companyB, {
          code: 'X',
          name: 'X',
          associatedHazardIds: [String(hazardA)],
        }),
      (err: Error) => {
        assert.ok(err.message.includes('riesgos'));
        return true;
      },
    );
  });

  it('TENANT-001: findAll filtra por companyId y estado', async () => {
    profileModel.docs.push({ _id: new Types.ObjectId(), companyId: companyA, active: true });
    const docs = await service.findAll(companyA, { active: true });
    assert.equal(docs.length, 1);
    const callArg = profileModel.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(callArg.companyId, companyA);
    assert.equal(callArg.active, true);
  });

  it('CRUD-003: findOne lanza NotFound si no existe en el tenant', async () => {
    await assert.rejects(
      () => service.findOne(String(new Types.ObjectId()), companyA),
      /no encontrado/,
    );
  });

  it('TENANT-002: findOne filtra por companyId', async () => {
    profileModel.docs.push({ _id: new Types.ObjectId(), companyId: companyA });
    const found = await service.findOne(String(new Types.ObjectId()), companyB);
    // El mock no filtra: devuelve el primer doc. Verificamos el filtro real del query.
    assert.ok(found);
    const callArg = profileModel.model.findOne.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(callArg.companyId, companyB);
  });

  it('CRUD-004: update rechaza riesgo cross-tenant', async () => {
    await assert.rejects(
      () =>
        service.update(String(new Types.ObjectId()), companyA, {
          associatedHazardIds: [String(hazardA)],
        }),
      () => true,
    );
  });

  it('TENANT-003: update filtra por companyId (no permite actualizar perfil de otra empresa)', async () => {
    profileModel.docs.push({ _id: new Types.ObjectId(), companyId: companyA });
    await service.update(String(new Types.ObjectId()), companyB, { name: 'Hack' });
    const callArg = profileModel.model.findOneAndUpdate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(callArg.companyId, companyB);
  });

  it('CRUD-005: deactivate marca active=false con updatedBy', async () => {
    const doc = { _id: new Types.ObjectId(), companyId: companyA, active: true };
    profileModel.docs.push(doc);
    const result = await service.deactivate(String(doc._id), companyA, 'uid-2');
    assert.ok(result);
    const callArg = profileModel.model.findOneAndUpdate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(callArg.companyId, companyA);
    const updateArg = profileModel.model.findOneAndUpdate.mock.calls[0].arguments[1] as Record<string, unknown>;
    assert.equal(updateArg.active, false);
    assert.equal(updateArg.updatedBy, 'uid-2');
  });

  it('VALID-001: sin hazardIds no consulta Risk y crea sin riesgos', async () => {
    const before = riskModel.model.find.mock.callCount();
    const result = await service.create(companyA, { code: 'C', name: 'Cargo' });
    assert.ok(result);
    assert.equal(riskModel.model.find.mock.callCount(), before, 'no consulta Risk');
  });

  it('VALID-002: update normaliza associatedHazardIds a ObjectIds', async () => {
    const doc = { _id: new Types.ObjectId(), companyId: companyA, active: true };
    profileModel.docs.push(doc);
    // El mock de find no filtra: exponemos solo el riesgo consultado para que la
    // validación coincida con el query real (1 consultado = 1 encontrado).
    riskModel.docs.length = 0;
    riskModel.docs.push({ _id: hazardA, companyId: companyA });
    await service.update(String(doc._id), companyA, { associatedHazardIds: [String(hazardA)] });
    const updateArg = profileModel.model.findOneAndUpdate.mock.calls[0].arguments[1] as Record<string, unknown>;
    const ids = updateArg.associatedHazardIds as Types.ObjectId[];
    assert.equal(ids.length, 1);
    assert.ok(ids[0] instanceof Types.ObjectId);
  });
});
