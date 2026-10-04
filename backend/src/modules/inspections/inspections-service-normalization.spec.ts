import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { InspectionsService } from './inspections.service';

/**
 * Tests de NORMALIZACIÓN del InspectionsService (create/update).
 * Verifican:
 * - create persiste el estado CANÓNICO ('COMPLETED'/'PENDING') ante variantes
 *   históricas ('completed', 'completada', 'pendiente', ausente);
 * - update COMPLETED → PENDING limpia completedDate ($unset), evitando el
 *   estado huérfano detectado en la auditoría;
 * - update PENDING → COMPLETED respeta el completedDate enviado por el
 *   cliente (comportamiento previo, sin inventar fechas).
 *
 * El modelo Mongoose se mockea capturando los objetos pasados a
 * constructor/findOneAndUpdate para inspeccionarlos sin MongoDB.
 */

const COMPANY_ID = new Types.ObjectId('507f1f77bcf86cd799439011');

function buildService() {
  let lastConstructorArg: any;
  let lastUpdateArg: any;
  const savedDoc = {
    _id: new Types.ObjectId(),
    companyId: COMPANY_ID,
    title: 'Inspección',
    description: 'desc',
    plannedDate: new Date('2020-01-01'),
    status: 'PENDING',
    toObject: () => ({ ...lastConstructorArg }),
  };

  const model: any = function (arg: any) {
    lastConstructorArg = arg;
    return { ...arg, ...savedDoc, save: async () => ({ ...savedDoc, status: arg.status }) };
  };
  (model as any).prototype = { save: async () => savedDoc };
  model.findOneAndUpdate = (_q: any, update: any) => ({
    exec: async () => {
      lastUpdateArg = update;
      return { ...savedDoc, status: 'PENDING' };
    },
  });

  const service = new InspectionsService(
    model,
    { createUnique: async () => ({}) } as never,
    { generateCommunication: async () => ({}) } as never,
  );

  return {
    service,
    getConstructorArg: () => lastConstructorArg,
    getUpdateArg: () => lastUpdateArg,
  };
}

describe('InspectionsService — normalización de status (create)', () => {
  it("status 'completed' persiste 'COMPLETED'", async () => {
    const { service, getConstructorArg } = buildService();
    await service.create(COMPANY_ID, {
      title: 'A', description: 'd', plannedDate: new Date(), status: 'completed',
    });
    assert.equal(getConstructorArg().status, 'COMPLETED');
  });

  it("status 'completada' persiste 'COMPLETED'", async () => {
    const { service, getConstructorArg } = buildService();
    await service.create(COMPANY_ID, {
      title: 'A', description: 'd', plannedDate: new Date(), status: 'completada',
    });
    assert.equal(getConstructorArg().status, 'COMPLETED');
  });

  it("status 'pendiente' persiste 'PENDING'", async () => {
    const { service, getConstructorArg } = buildService();
    await service.create(COMPANY_ID, {
      title: 'A', description: 'd', plannedDate: new Date(), status: 'pendiente',
    });
    assert.equal(getConstructorArg().status, 'PENDING');
  });

  it('status ausente persiste PENDING', async () => {
    const { service, getConstructorArg } = buildService();
    await service.create(COMPANY_ID, {
      title: 'A', description: 'd', plannedDate: new Date(),
    });
    assert.equal(getConstructorArg().status, 'PENDING');
  });
});

describe('InspectionsService — normalización de status (update)', () => {
  /** El service pasa el payload directo (sin $set) o {$set, $unset} si hay unset. */
  function parts(update: any) {
    return { set: update.$set ?? update, unset: update.$unset };
  }

  it('variante completada → persiste COMPLETED sin $unset', async () => {
    const { service, getUpdateArg } = buildService();
    await service.update('x', COMPANY_ID, { status: 'ejecutada' });
    const { set, unset } = parts(getUpdateArg());
    assert.equal(set.status, 'COMPLETED');
    assert.equal(unset, undefined);
  });

  it('COMPLETED → PENDING limpia completedDate ($unset) y persiste PENDING', async () => {
    const { service, getUpdateArg } = buildService();
    await service.update('x', COMPANY_ID, { status: 'pendiente', completedDate: new Date('2024-01-01') });
    const { set, unset } = parts(getUpdateArg());
    assert.equal(set.status, 'PENDING');
    assert.deepEqual(unset, { completedDate: 1 });
    // completedDate recibido NO debe persistirse al revertir
    assert.equal(set.completedDate, undefined);
  });

  it('PENDING → COMPLETED respeta completedDate del cliente (sin inventar fechas)', async () => {
    const { service, getUpdateArg } = buildService();
    const fecha = new Date('2024-05-05');
    await service.update('x', COMPANY_ID, { status: 'completada', completedDate: fecha });
    const { set, unset } = parts(getUpdateArg());
    assert.equal(set.status, 'COMPLETED');
    assert.equal(set.completedDate, fecha);
    assert.equal(unset, undefined);
  });
});
