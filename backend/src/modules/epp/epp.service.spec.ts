import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EppService } from './epp.service';
import { EppDeliveryStatus } from './schemas/epp-delivery.schema';
import { isEppDeliveryOverdue } from './utils/epp-delivery-status.util';
import { CreateEppDeliveryDto } from './dto/create-epp-delivery.dto';
import { UpdateEppDeliveryDto } from './dto/update-epp-delivery.dto';
import { UpdateEppDeliveryStatusDto } from './dto/update-epp-delivery-status.dto';

/**
 * Tests del EppService (4.2.6 — Alternativa B: EppDelivery).
 *
 * Cubre (Etapa 4.2.6, §15): creación, trabajador real, catálogo de la empresa,
 * fechas, cantidad, evidencia específica, server-side enforcement
 * (companyId/createdBy/history), transiciones, vencimiento dinámico y
 * aislamiento cross-tenant.
 */

const COMPANY_A = new Types.ObjectId('507f1f77bcf86cd799439011');
const COMPANY_B = new Types.ObjectId('507f1f77bcf86cd799439022');
const USER_UID = 'firebase-uid-owner';

type AnyDoc = Record<string, any> & { _id: Types.ObjectId };

function buildMocks() {
  const deliveries: AnyDoc[] = [];
  const employees: AnyDoc[] = [];
  const eppRecords: AnyDoc[] = [];

  const deliveryModel = {
    create: async (dto: Record<string, unknown>) => {
      const doc = { _id: new Types.ObjectId(), ...dto } as AnyDoc;
      deliveries.push(doc);
      return doc;
    },
    find: (query: Record<string, any>) => ({
      sort: () => ({
        exec: async () =>
          deliveries.filter((d) => String(d.companyId) === String(query.companyId)),
      }),
    }),
    findOne: (query: Record<string, any>) => ({
      exec: async () =>
        deliveries.find(
          (d) => String(d._id) === String(query._id) && String(d.companyId) === String(query.companyId),
        ) ?? null,
    }),
    findOneAndUpdate: (query: Record<string, any>, update: { $set?: Record<string, unknown>; $push?: { history?: unknown } }) => ({
      exec: async () => {
        const doc = deliveries.find(
          (d) => String(d._id) === String(query._id) && String(d.companyId) === String(query.companyId),
        );
        if (!doc) return null;
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$push?.history) {
          if (!Array.isArray(doc.history)) doc.history = [];
          doc.history.push(update.$push.history);
        }
        return doc;
      },
    }),
  };

  const employeeModel = {
    findOne: (query: Record<string, any>) => ({
      exec: async () =>
        employees.find(
          (e) => String(e._id) === String(query._id) && String(e.companyId) === String(query.companyId),
        ) ?? null,
    }),
  };

  const eppModel = {
    findOne: (query: Record<string, any>) => ({
      exec: async () =>
        eppRecords.find((r) => String(r.companyId) === String(query.companyId)) ?? null,
    }),
  };

  // Modelos de la matriz de aplicabilidad (no usados por los tests de entregas;
  // cubiertos en epp-applicability.spec.ts).
  const applicabilityModel = {} as Record<string, unknown>;
  const jobProfileModel = {
    findOne: (query: Record<string, any>) => ({
      exec: async () => null,
    }),
  };

  return { deliveryModel, employeeModel, eppModel, applicabilityModel, jobProfileModel, deliveries, employees, eppRecords };
}

function createService(mocks = buildMocks()) {
  const service = new EppService(
    mocks.deliveryModel as never,
    mocks.employeeModel as never,
    mocks.eppModel as never,
    mocks.applicabilityModel as never,
    mocks.jobProfileModel as never,
  );
  return { service, ...mocks };
}

function seedEmployee(employees: AnyDoc[], companyId: Types.ObjectId, name = 'Juan Pérez'): AnyDoc {
  const doc = { _id: new Types.ObjectId(), companyId, name } as AnyDoc;
  employees.push(doc);
  return doc;
}

function seedEpp(eppRecords: AnyDoc[], companyId: Types.ObjectId, catalog: Array<Record<string, unknown>> = [{ eppId: 'EPP-1', name: 'Casco' }]): AnyDoc {
  const doc = { _id: new Types.ObjectId(), companyId, itemCode: '4.2.6', catalog } as AnyDoc;
  eppRecords.push(doc);
  return doc;
}

function validDto(overrides: Partial<Record<string, unknown>> = {}): CreateEppDeliveryDto {
  return {
    employeeId: '000000000000000000000000',
    eppItemId: 'EPP-1',
    deliveryDate: new Date('2026-09-01').toISOString(),
    ...overrides,
  } as CreateEppDeliveryDto;
}

describe('EppService (4.2.6 — EppDelivery)', () => {
  let service: EppService;
  let mocks: ReturnType<typeof buildMocks>;
  let employeeA: AnyDoc;

  beforeEach(() => {
    mocks = buildMocks();
    service = new EppService(
      mocks.deliveryModel as never,
      mocks.employeeModel as never,
      mocks.eppModel as never,
      mocks.applicabilityModel as never,
      mocks.jobProfileModel as never,
    );
    employeeA = seedEmployee(mocks.employees, COMPANY_A);
    seedEpp(mocks.eppRecords, COMPANY_A);
  });

  describe('Creación', () => {
    it('1. crea una entrega válida con snapshot e historial CREATED', async () => {
      const created = await service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id) }), USER_UID);
      assert.equal(created.status, EppDeliveryStatus.ACTIVE);
      assert.equal(created.employeeNameSnapshot, 'Juan Pérez');
      assert.equal(created.eppNameSnapshot, 'Casco');
      assert.equal(created.quantity, 1);
      assert.equal(created.createdBy, USER_UID);
      assert.equal(created.history.length, 1);
      assert.equal(created.history[0].action, 'CREATED');
      assert.equal(created.history[0].performedBy, USER_UID);
    });

    it('2. rechaza employee inexistente (404)', async () => {
      await assert.rejects(
        () => service.create(COMPANY_A, validDto({ employeeId: new Types.ObjectId().toString() }), USER_UID),
        NotFoundException,
      );
    });

    it('3. rechaza employee de otra empresa (cross-tenant → 404)', async () => {
      const employeeB = seedEmployee(mocks.employees, COMPANY_B, 'Trabajador B');
      await assert.rejects(
        () => service.create(COMPANY_A, validDto({ employeeId: String(employeeB._id) }), USER_UID),
        NotFoundException,
      );
    });

    it('4. rechaza EPP inexistente en el catálogo de la empresa (404)', async () => {
      await assert.rejects(
        () => service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id), eppItemId: 'EPP-999' }), USER_UID),
        NotFoundException,
      );
    });

    it('5. rechaza EPP de otra empresa (catálogo cross-tenant → 404)', async () => {
      seedEpp(mocks.eppRecords, COMPANY_B, [{ eppId: 'EPP-B', name: 'Guantes B' }]);
      await assert.rejects(
        () => service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id), eppItemId: 'EPP-B' }), USER_UID),
        NotFoundException,
      );
    });

    it('6. rechaza quantity <= 0', async () => {
      await assert.rejects(
        () => service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id), quantity: 0 }), USER_UID),
        BadRequestException,
      );
    });

    it('7. rechaza deliveryDate futura (la entrega debe estar realizada)', async () => {
      const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      await assert.rejects(
        () => service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id), deliveryDate: future }), USER_UID),
        BadRequestException,
      );
    });

    it('8. rechaza expectedReplacementDate anterior a deliveryDate', async () => {
      await assert.rejects(
        () =>
          service.create(
            COMPANY_A,
            validDto({
              employeeId: String(employeeA._id),
              deliveryDate: new Date('2026-09-01').toISOString(),
              expectedReplacementDate: new Date('2026-08-01').toISOString(),
            }),
            USER_UID,
          ),
        BadRequestException,
      );
    });

    it('9. acepta evidencia específica de la entrega', async () => {
      const created = await service.create(
        COMPANY_A,
        validDto({ employeeId: String(employeeA._id), evidenceUrl: 'https://evidencia/acta-001.pdf' }),
        USER_UID,
      );
      assert.equal(created.evidenceUrl, 'https://evidencia/acta-001.pdf');
    });

    it('10. ignora companyId del cliente (server-side)', async () => {
      const dto = validDto({ employeeId: String(employeeA._id), companyId: COMPANY_B } as Record<string, unknown>);
      const created = await service.create(COMPANY_A, dto, USER_UID);
      assert.equal(String(created.companyId), String(COMPANY_A));
    });

    it('11. ignora createdBy del cliente (server-side)', async () => {
      const dto = validDto({ employeeId: String(employeeA._id), createdBy: 'hacker-uid' } as Record<string, unknown>);
      const created = await service.create(COMPANY_A, dto, USER_UID);
      assert.equal(created.createdBy, USER_UID);
    });

    it('12. el historial es server-side: el historial del cliente se ignora', async () => {
      const dto = validDto({
        employeeId: String(employeeA._id),
        history: [{ action: 'REPLACED', date: new Date(), performedBy: 'hacker-uid' }],
      } as Record<string, unknown>);
      const created = await service.create(COMPANY_A, dto, USER_UID);
      assert.equal(created.history.length, 1);
      assert.equal(created.history[0].action, 'CREATED');
      assert.equal(created.history[0].performedBy, USER_UID);
    });
  });

  describe('Transiciones de estado', () => {
    let deliveryId: string;

    beforeEach(async () => {
      const created = await service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id) }), USER_UID);
      deliveryId = String(created._id);
    });

    it('13. transición válida ACTIVE → REPLACED con fecha y historial', async () => {
      const dto: UpdateEppDeliveryStatusDto = {
        status: 'REPLACED',
        actualReplacementDate: new Date('2026-09-10').toISOString(),
        comment: 'Reemplazo por desgaste',
      };
      const updated = await service.updateStatus(deliveryId, COMPANY_A, dto, USER_UID);
      assert.equal(updated.status, EppDeliveryStatus.REPLACED);
      assert.ok(updated.actualReplacementDate);
      const lastEntry = updated.history[updated.history.length - 1];
      assert.equal(lastEntry.action, 'REPLACED');
      assert.equal(lastEntry.performedBy, USER_UID);
    });

    it('14. rechaza transición inválida REPLACED → RETURNED', async () => {
      await service.updateStatus(deliveryId, COMPANY_A, { status: 'REPLACED' }, USER_UID);
      await assert.rejects(
        () => service.updateStatus(deliveryId, COMPANY_A, { status: 'RETURNED' }, USER_UID),
        BadRequestException,
      );
    });

    it('no permite al manager escribir (roles en service)', async () => {
      assert.throws(() => service.assertCanWrite('manager'), ForbiddenException);
      assert.throws(() => service.assertCanWrite('member'), ForbiddenException);
      assert.doesNotThrow(() => service.assertCanWrite('owner'));
      assert.doesNotThrow(() => service.assertCanWrite('admin'));
    });

    it('update no modifica el historial del cliente ni reasigna trabajador/EPP', async () => {
      const before = await service.findOne(deliveryId, COMPANY_A);
      // Snapshot previo: el mock devuelve referencias vivas, `before` muta con la
      // operación (así trabaja el service con documentos de mongoose reales).
      const historyLengthBefore = before.history.length;
      const employeeIdBefore = String(before.employeeId);
      const dto = {
        observations: 'Ajuste de observaciones',
        employeeId: new Types.ObjectId().toString(),
        history: [{ action: 'DAMAGED' }],
      } as UpdateEppDeliveryDto as Record<string, unknown>;
      const updated = await service.update(deliveryId, COMPANY_A, dto as UpdateEppDeliveryDto, USER_UID);
      assert.equal(String(updated.employeeId), employeeIdBefore);
      assert.equal(updated.history.length, historyLengthBefore + 1); // solo el UPDATED server-side
      assert.equal(updated.history[updated.history.length - 1].action, 'UPDATED');
      assert.equal(updated.observations, 'Ajuste de observaciones');
    });
  });

  describe('Vencimiento dinámico (sin cron)', () => {
    it('15. detecta reposición vencida dinámicamente', () => {
      const past = new Date(Date.now() - 24 * 3600 * 1000);
      const future = new Date(Date.now() + 24 * 3600 * 1000);
      assert.equal(
        isEppDeliveryOverdue({ status: 'ACTIVE', expectedReplacementDate: past }),
        true,
      );
      assert.equal(
        isEppDeliveryOverdue({ status: 'ACTIVE', expectedReplacementDate: future }),
        false,
      );
      assert.equal(
        isEppDeliveryOverdue({ status: 'REPLACED', expectedReplacementDate: past, actualReplacementDate: past }),
        false,
      );
      assert.equal(isEppDeliveryOverdue({ status: 'ACTIVE' }), false);
    });

    it('filtro overdue=true devuelve solo entregas vencidas del tenant', async () => {
      const past = new Date(Date.now() - 48 * 3600 * 1000);
      const employee = employeeA;
      const created = await service.create(COMPANY_A, validDto({ employeeId: String(employee._id) }), USER_UID);
      // Vencida: entrega ACTIVE con expectedReplacementDate en el pasado.
      await mocks.deliveryModel.findOneAndUpdate(
        { _id: created._id, companyId: COMPANY_A },
        { $set: { expectedReplacementDate: past } },
      ).exec();
      // No vencida: otra entrega sin expectedReplacementDate.
      await service.create(COMPANY_A, validDto({ employeeId: String(employee._id), eppItemId: 'EPP-1' }), USER_UID);

      const overdue = await service.findAll(COMPANY_A, { overdue: 'true' });
      assert.equal(overdue.length, 1);
      assert.equal(String(overdue[0]._id), String(created._id));
    });
  });

  describe('Cross-tenant', () => {
    it('16. empresa B no puede LEER una entrega de empresa A (404)', async () => {
      const created = await service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id) }), USER_UID);
      await assert.rejects(
        () => service.findOne(String(created._id), COMPANY_B),
        NotFoundException,
      );
    });

    it('17. empresa B no puede MODIFICAR una entrega de empresa A (404)', async () => {
      const created = await service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id) }), USER_UID);
      await assert.rejects(
        () => service.updateStatus(String(created._id), COMPANY_B, { status: 'RETURNED' }, 'uid-B'),
        NotFoundException,
      );
      await assert.rejects(
        () =>
          service.update(String(created._id), COMPANY_B, { observations: 'hack' } as UpdateEppDeliveryDto, 'uid-B'),
        NotFoundException,
      );
    });

    it('el listado nunca mezcla empresas', async () => {
      await service.create(COMPANY_A, validDto({ employeeId: String(employeeA._id) }), USER_UID);
      const employeeB = seedEmployee(mocks.employees, COMPANY_B, 'Trabajador B');
      seedEpp(mocks.eppRecords, COMPANY_B, [{ eppId: 'EPP-1', name: 'Casco' }]);
      const serviceB = new EppService(
        mocks.deliveryModel as never,
        mocks.employeeModel as never,
        mocks.eppModel as never,
        mocks.applicabilityModel as never,
        mocks.jobProfileModel as never,
      );
      await serviceB.create(COMPANY_B, validDto({ employeeId: String(employeeB._id) }), 'uid-B');
      const listA = await service.findAll(COMPANY_A, {});
      const listB = await serviceB.findAll(COMPANY_B, {});
      assert.equal(listA.length, 1);
      assert.equal(listB.length, 1);
      assert.equal(String(listA[0].companyId), String(COMPANY_A));
      assert.equal(String(listB[0].companyId), String(COMPANY_B));
    });
  });
});
