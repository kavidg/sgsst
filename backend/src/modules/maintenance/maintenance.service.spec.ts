import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceStatus } from './schemas/maintenance.schema';
import { isMaintenanceOverdue } from './utils/maintenance-status.util';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';

/**
 * Tests del MaintenanceService (4.2.5 — V1).
 *
 * Cubre: creación, consulta, aislamiento por companyId, permisos,
 * transiciones (iniciar/completar/cancelar/reabrir), vencimiento dinámico,
 * validaciones de completado y trazabilidad (historial inmutable).
 */

const COMPANY_A = new Types.ObjectId('507f1f77bcf86cd799439011');
const COMPANY_B = new Types.ObjectId('507f1f77bcf86cd799439022');

type StoredDoc = Record<string, unknown> & { _id: Types.ObjectId; companyId: Types.ObjectId };

function buildModelMock() {
  const store: StoredDoc[] = [];

  const model = {
    // create(): el service hace `new model(dto)` → devuelve objeto guardable
    // que replica el comportamiento findOneAndUpdate del service.
    // (Los tests de creación usan la vía create() real con un stub de save.)
    prototypeSave: null as unknown,
  };

  const ModelCtor = function (this: StoredDoc, dto: Record<string, unknown>) {
    Object.assign(this, dto);
    if (!this._id) this._id = new Types.ObjectId();
    this.createdAt = new Date();
    this.updatedAt = new Date();
  } as unknown as new (dto: Record<string, unknown>) => StoredDoc & { save: () => Promise<StoredDoc> };

  ModelCtor.prototype.save = async function (this: StoredDoc) {
    store.push(this);
    return this;
  };

  const methods = {
    store,
    ModelCtor,
    find: (_query: Record<string, unknown>) => ({
      sort: () => ({
        exec: async () => store.filter((d) => String(d.companyId) === String(_query.companyId)),
      }),
    }),
    findOne: (query: { _id: Types.ObjectId; companyId: Types.ObjectId }) => ({
      exec: async () =>
        store.find((d) => String(d._id) === String(query._id) && String(d.companyId) === String(query.companyId)) ?? null,
    }),
    findOneAndUpdate: (
      query: { _id: Types.ObjectId; companyId: Types.ObjectId },
      update: { $set?: Record<string, unknown>; $push?: { statusHistory?: unknown } },
    ) => ({
      exec: async () => {
        const doc = store.find((d) => String(d._id) === String(query._id) && String(d.companyId) === String(query.companyId));
        if (!doc) return null;
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$push?.statusHistory) {
          if (!Array.isArray(doc.statusHistory)) doc.statusHistory = [];
          (doc.statusHistory as unknown[]).push(update.$push.statusHistory);
        }
        return doc;
      },
    }),
    deleteOne: (query: { _id: Types.ObjectId; companyId: Types.ObjectId }) => ({
      exec: async () => {
        const idx = store.findIndex((d) => String(d._id) === String(query._id) && String(d.companyId) === String(query.companyId));
        if (idx === -1) return { deletedCount: 0 };
        store.splice(idx, 1);
        return { deletedCount: 1 };
      },
    }),
  };

  return Object.assign(model, methods);
}

function createService() {
  const modelMock = buildModelMock();
  const service = new MaintenanceService(modelMock as never);
  return { service, store: modelMock.store, ModelCtor: modelMock.ModelCtor };
}

async function seedMaintenance(
  service: MaintenanceService,
  store: StoredDoc[],
  overrides: Partial<Record<string, unknown>> = {},
): Promise<StoredDoc> {
  const dto: CreateMaintenanceDto = {
    itemName: 'Compresor taller',
    itemType: 'EQUIPMENT' as never,
    maintenanceType: 'PREVENTIVE' as never,
    description: 'Cambio de filtros y aceite',
    plannedDate: new Date('2026-10-01'),
    responsible: 'Técnico A',
  } as CreateMaintenanceDto;

  const record = { ...dto, ...overrides } as Record<string, unknown>;
  const doc = {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    status: 'PROGRAMMED',
    ...record,
  } as StoredDoc;
  store.push(doc);
  void service;
  return doc;
}

describe('MaintenanceService (4.2.5) — V1', () => {
  let service: MaintenanceService;
  let store: StoredDoc[];
  let ModelCtor: new (dto: Record<string, unknown>) => StoredDoc & { save: () => Promise<StoredDoc> };

  beforeEach(() => {
    const ctx = createService();
    service = ctx.service;
    store = ctx.store;
    ModelCtor = ctx.ModelCtor;
  });

  describe('Creación', () => {
    it('crea un mantenimiento preventivo con estado PROGRAMMED y createdBy', async () => {
      const dto: CreateMaintenanceDto = {
        itemName: 'Montacargas 1',
        itemType: 'MACHINE' as never,
        maintenanceType: 'PREVENTIVE' as never,
        description: 'Mantenimiento de 500 horas',
        plannedDate: new Date('2026-11-01'),
        responsible: 'Compras / Mantenimiento',
      } as CreateMaintenanceDto;

      const created = await service.create(COMPANY_A, dto, 'uid-owner-1');
      assert.equal(created.itemName, 'Montacargas 1');
      assert.equal(created.status, MaintenanceStatus.PROGRAMMED);
      assert.equal(created.createdBy, 'uid-owner-1');
      assert.equal(created.companyId.toString(), COMPANY_A.toString());
    });

    it('rechaza estado inicial COMPLETED o CANCELLED (no puede nacer terminado)', async () => {
      const dto = {
        itemName: 'Montacargas 2',
        itemType: 'MACHINE',
        maintenanceType: 'CORRECTIVE',
        description: 'Falla hidráulica',
        plannedDate: new Date('2026-11-02'),
        responsible: 'Técnico B',
        status: 'COMPLETED',
      } as unknown as CreateMaintenanceDto;

      await assert.rejects(
        () => service.create(COMPANY_A, dto, 'uid-owner-1'),
        /no puede nacer/i,
      );
    });
  });

  describe('Consulta y aislamiento por companyId', () => {
    it('findAll solo devuelve registros de la empresa', async () => {
      await seedMaintenance(service, store, { itemName: 'De A' });
      store.push({
        _id: new Types.ObjectId(),
        companyId: COMPANY_B,
        itemName: 'De B',
        status: 'PROGRAMMED',
      } as StoredDoc);

      const list = await service.findAll(COMPANY_A);
      assert.equal(list.length, 1);
      assert.equal(list[0].itemName, 'De A');
    });

    it('findOne cross-tenant lanza NotFoundException', async () => {
      const doc = await seedMaintenance(service, store);
      await assert.rejects(
        () => service.findOne(String(doc._id), COMPANY_B),
        NotFoundException,
      );
    });

    it('findOne de id inexistente lanza NotFoundException', async () => {
      await assert.rejects(
        () => service.findOne(new Types.ObjectId().toString(), COMPANY_A),
        NotFoundException,
      );
    });
  });

  describe('Permisos', () => {
    it('assertCanWrite permite owner/admin y rechaza manager/member', () => {
      assert.doesNotThrow(() => service.assertCanWrite('owner'));
      assert.doesNotThrow(() => service.assertCanWrite('admin'));
      assert.throws(() => service.assertCanWrite('manager'), ForbiddenException);
      assert.throws(() => service.assertCanWrite('member'), ForbiddenException);
      assert.throws(() => service.assertCanWrite(undefined), ForbiddenException);
    });
  });

  describe('Transiciones de estado', () => {
    it('PROGRAMMED → IN_PROGRESS registra historial con changedBy', async () => {
      const doc = await seedMaintenance(service, store);
      const updated = await service.updateStatus(
        String(doc._id), COMPANY_A,
        { status: MaintenanceStatus.IN_PROGRESS } as never,
        'uid-admin-1',
      );
      assert.equal(updated.status, MaintenanceStatus.IN_PROGRESS);
      assert.equal((updated.statusHistory ?? []).length, 1);
      const entry = (updated.statusHistory ?? [])[0];
      assert.equal(entry.from, MaintenanceStatus.PROGRAMMED);
      assert.equal(entry.to, MaintenanceStatus.IN_PROGRESS);
      assert.equal(entry.changedBy, 'uid-admin-1');
    });

    it('completar exige completedDate y evidencia (trazabilidad documental)', async () => {
      const doc = await seedMaintenance(service, store);

      await assert.rejects(
        () => service.updateStatus(String(doc._id), COMPANY_A, { status: MaintenanceStatus.COMPLETED } as never, 'uid'),
        /completedDate es obligatorio/i,
      );

      await assert.rejects(
        () => service.updateStatus(String(doc._id), COMPANY_A, { status: MaintenanceStatus.COMPLETED, completedDate: '2025-12-30' } as never, 'uid'),
        /evidenceUrl es obligatorio/i,
      );

      const completed = await service.updateStatus(
        String(doc._id), COMPANY_A,
        { status: MaintenanceStatus.COMPLETED, completedDate: '2025-12-30', evidenceUrl: 'https://soportes.co/comp.pdf' } as never,
        'uid-owner-2',
      );
      assert.equal(completed.status, MaintenanceStatus.COMPLETED);
      assert.ok(completed.completedDate);
      assert.equal(completed.evidenceUrl, 'https://soportes.co/comp.pdf');
      assert.equal(completed.statusHistory?.at(-1)?.changedBy, 'uid-owner-2');
    });

    it('ETAPA 6C (Caso 9): rechaza completar con completedDate futura — sin cambio de estado ni historial', async () => {
      const doc = await seedMaintenance(service, store);
      const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      await assert.rejects(
        () => service.updateStatus(
          String(doc._id), COMPANY_A,
          { status: MaintenanceStatus.COMPLETED, completedDate: future, evidenceUrl: 'https://soportes.co/x.pdf' } as never,
          'uid',
        ),
        /fecha futura/i,
      );
      assert.equal(doc.status, 'PROGRAMMED', 'no debe cambiar el estado');
      assert.equal((doc.statusHistory as unknown[]).length, 0, 'no debe agregar historial');
    });

    it('ETAPA 6C (Caso 14): la evidencia previa del PROGRAMMED ya no acredita el cierre; la nueva evidencia queda asociada al historial', async () => {
      // Registro con evidenceUrl preexistente (creado en PROGRAMMED).
      const doc = await seedMaintenance(service, store, { evidenceUrl: 'https://docs.co/presupuesto.pdf' });

      // Completar SIN evidencia nueva → rechazado (la URL previa no acredita la ejecución).
      await assert.rejects(
        () => service.updateStatus(
          String(doc._id), COMPANY_A,
          { status: MaintenanceStatus.COMPLETED, completedDate: '2025-12-30' } as never,
          'uid',
        ),
        /evidenceUrl es obligatorio/i,
      );

      // Completar CON evidencia nueva → se reemplaza la URL plana y queda en el historial.
      const done = await service.updateStatus(
        String(doc._id), COMPANY_A,
        { status: MaintenanceStatus.COMPLETED, completedDate: '2025-12-30', evidenceUrl: 'https://soportes.co/cierre.pdf' } as never,
        'uid-owner-3',
      );
      assert.equal(done.evidenceUrl, 'https://soportes.co/cierre.pdf');
      const last = (done.statusHistory as Array<{ to: string; evidenceUrl?: string }>).at(-1);
      assert.equal(last?.to, 'COMPLETED');
      assert.equal(last?.evidenceUrl, 'https://soportes.co/cierre.pdf');
    });

    it('cancela y reabre un mantenimiento cancelado (transición CANCELLED → PROGRAMMED)', async () => {
      const doc = await seedMaintenance(service, store);
      await service.updateStatus(String(doc._id), COMPANY_A, { status: MaintenanceStatus.CANCELLED, comment: 'Fuera de presupuesto' } as never, 'uid');
      const reopened = await service.updateStatus(String(doc._id), COMPANY_A, { status: MaintenanceStatus.PROGRAMMED } as never, 'uid');
      assert.equal(reopened.status, MaintenanceStatus.PROGRAMMED);
      assert.equal((reopened.statusHistory ?? []).length, 2);
    });

    it('rechaza transición no permitida (COMPLETED → PROGRAMMED)', async () => {
      const doc = await seedMaintenance(service, store, {
        status: 'COMPLETED',
        completedDate: new Date('2026-09-01'),
        evidenceUrl: 'https://soportes.co/x.pdf',
      });
      await assert.rejects(
        () => service.updateStatus(String(doc._id), COMPANY_A, { status: MaintenanceStatus.PROGRAMMED } as never, 'uid'),
        /Transición de estado no permitida/i,
      );
    });
  });

  describe('Vencimiento dinámico (OVERDUE sin cron)', () => {
    it('isMaintenanceOverdue marca programados vencidos y excluye terminados', () => {
      const now = new Date('2026-09-18T12:00:00Z');
      assert.equal(isMaintenanceOverdue('PROGRAMMED', '2026-09-01', now), true);
      assert.equal(isMaintenanceOverdue('IN_PROGRESS', '2026-09-01', now), true);
      assert.equal(isMaintenanceOverdue('PROGRAMMED', '2026-12-01', now), false);
      assert.equal(isMaintenanceOverdue('COMPLETED', '2026-09-01', now), false);
      assert.equal(isMaintenanceOverdue('CANCELLED', '2026-09-01', now), false);
    });
  });

  describe('Edición y borrado', () => {
    it('update sobre COMPLETED solo permite evidencia/observaciones', async () => {
      const doc = await seedMaintenance(service, store, {
        status: 'COMPLETED',
        completedDate: new Date('2026-09-01'),
        evidenceUrl: 'https://soportes.co/x.pdf',
      });
      // Solo evidencia → permitido
      const ok = await service.update(String(doc._id), COMPANY_A, { observations: 'Sin novedades' }, 'uid');
      assert.equal(ok.observations, 'Sin novedades');

      // Cambiar itemName sobre COMPLETED → rechazado
      await assert.rejects(
        () => service.update(String(doc._id), COMPANY_A, { itemName: 'Otro nombre' }, 'uid'),
        /COMPLETED/,
      );
    });

    it('remove elimina solo dentro de la empresa (cross-tenant → NotFound)', async () => {
      const doc = await seedMaintenance(service, store);
      await assert.rejects(() => service.remove(String(doc._id), COMPANY_B), NotFoundException);
      await service.remove(String(doc._id), COMPANY_A);
      assert.equal(store.length, 0);
    });
  });

  describe('Trazabilidad', () => {
    it('el historial nunca se recibe del cliente y registra cada cambio', async () => {
      const doc = await seedMaintenance(service, store);
      // Intento de inyectar historial vía DTO de estado (el pipe whitelist lo
      // descarta en runtime; el service tampoco lo consume).
      const updated = await service.updateStatus(
        String(doc._id), COMPANY_A,
        { status: MaintenanceStatus.IN_PROGRESS, statusHistory: [{ from: 'X', to: 'Y', changedBy: 'attacker' }] } as never,
        'uid-trusted',
      );
      const entry = (updated.statusHistory ?? [])[0];
      assert.equal(entry.changedBy, 'uid-trusted');
      assert.equal(entry.from, MaintenanceStatus.PROGRAMMED);
    });
  });
});
