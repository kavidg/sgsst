import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ControlVerificationService } from './control-verification.service';
import { CreateControlVerificationDto } from './dto/create-control-verification.dto';
import { UpdateControlVerificationFollowUpDto } from './dto/update-control-verification-follow-up.dto';
import { FollowUpStatus } from './enums/follow-up-status.enum';
import { ControlVerificationResult } from './enums/control-verification-result.enum';

/**
 * Tests ETAPA 3 (PHVA 4.2.2) — CRUD seguro de ControlVerification.
 *
 * Valida:
 * - creación: snapshot desde el control, companyId del contexto, rechazos
 * - consulta: lista ordenada, acceso cross-tenant/cross-risk bloqueado
 * - actualización: solo seguimiento; evidencia histórica intocable
 * - roles: assertCanWrite (owner/admin escriben; manager/member no)
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();
const RISK_ID = new Types.ObjectId();
const CONTROL_ID = new Types.ObjectId().toHexString();
const OTHER_CONTROL_ID = new Types.ObjectId().toHexString();

function makeRisk(overrides: Record<string, unknown> = {}) {
  return {
    _id: RISK_ID,
    companyId: COMPANY_A,
    controlMeasures: 'Texto legacy intacto',
    controls: [
      { _id: new Types.ObjectId(CONTROL_ID), description: 'Barandas en borde de losa', isActive: true },
      { _id: new Types.ObjectId(OTHER_CONTROL_ID), description: 'Control retirado', isActive: false },
    ],
    ...overrides,
  } as any;
}

function createMocks(risks: any[], verifications: any[] = []) {
  const vStore = verifications;
  const riskModel: any = {
    findOne: (query: any) => ({
      exec: async () =>
        risks.find(
          (r) =>
            (!query._id || String(r._id) === String(query._id)) &&
            (!query.companyId || String(r.companyId) === String(query.companyId)),
        ) ?? null,
    }),
  };
  const verificationModel: any = function (doc: any) {
    return {
      ...doc,
      save: async () => {
        doc._id = doc._id || new Types.ObjectId();
        vStore.push(doc);
        return doc;
      },
    };
  };
  (verificationModel as any).find = (query: any) => ({
    sort: () => ({
      exec: async () =>
        vStore
          .filter(
            (v) =>
              (!query.companyId || String(v.companyId) === String(query.companyId)) &&
              (!query.riskId || String(v.riskId) === String(query.riskId)),
          )
          .sort((a, b) => new Date(b.verificationDate).getTime() - new Date(a.verificationDate).getTime()),
    }),
  });
  (verificationModel as any).findOne = (query: any) => ({
    exec: async () =>
      vStore.find(
        (v) =>
          (!query._id || String(v._id) === String(query._id)) &&
          (!query.riskId || String(v.riskId) === String(query.riskId)) &&
          (!query.companyId || String(v.companyId) === String(query.companyId)),
      ) ?? null,
  });
  (verificationModel as any).findOneAndUpdate = (query: any, update: any) => ({
    exec: async () => {
      const idx = vStore.findIndex(
        (v) =>
          (!query._id || String(v._id) === String(query._id)) &&
          (!query.riskId || String(v.riskId) === String(query.riskId)) &&
          (!query.companyId || String(v.companyId) === String(query.companyId)),
      );
      if (idx === -1) return null;
      vStore[idx] = { ...vStore[idx], ...(update.$set ?? {}) };
      return vStore[idx];
    },
  });
  return { service: new ControlVerificationService(verificationModel as any, riskModel as any), vStore };
}

function validDto(overrides: Partial<CreateControlVerificationDto> = {}): CreateControlVerificationDto {
  return {
    controlId: CONTROL_ID,
    verificationDate: new Date().toISOString(),
    verifiedBy: 'Coordinador SST',
    result: ControlVerificationResult.COMPLIANT,
    ...overrides,
  };
}

describe('ETAPA 3 — Creación', () => {
  it('creación válida persiste la verificación', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const created = await service.create(String(RISK_ID), COMPANY_A, validDto());
    assert.equal(vStore.length, 1);
    assert.equal(created.result, 'COMPLIANT');
  });

  it('snapshot tomado desde el control (no del cliente ni de controlMeasures)', async () => {
    const { service } = createMocks([makeRisk()]);
    const created = await service.create(String(RISK_ID), COMPANY_A, validDto());
    assert.equal((created as any).controlDescriptionSnapshot, 'Barandas en borde de losa');
  });

  it('companyId tomado del contexto autenticado (service recibe el resolved)', async () => {
    const { service } = createMocks([makeRisk()]);
    const created = await service.create(String(RISK_ID), COMPANY_A, validDto());
    assert.equal(String((created as any).companyId), String(COMPANY_A));
  });

  it('rechaza riskId de otra empresa (cross-tenant → 404, sin filtrar datos)', async () => {
    const { service } = createMocks([makeRisk()]);
    await assert.rejects(
      () => service.create(String(RISK_ID), COMPANY_B, validDto()),
      (e: any) => e instanceof NotFoundException,
    );
  });

  it('rechaza controlId inexistente en el riesgo', async () => {
    const { service } = createMocks([makeRisk()]);
    await assert.rejects(
      () =>
        service.create(String(RISK_ID), COMPANY_A, validDto({ controlId: new Types.ObjectId().toHexString() })),
      (e: any) => e instanceof NotFoundException,
    );
  });

  it('rechaza control inactivo (isActive: false)', async () => {
    const { service } = createMocks([makeRisk()]);
    await assert.rejects(
      () => service.create(String(RISK_ID), COMPANY_A, validDto({ controlId: OTHER_CONTROL_ID })),
      (e: any) => e instanceof BadRequestException,
    );
  });

  it('no usa controlMeasures como fallback: sin controls[], todo controlId falla', async () => {
    const risk = makeRisk({ controls: [] });
    const { service } = createMocks([risk]);
    await assert.rejects(
      () => service.create(String(RISK_ID), COMPANY_A, validDto()),
      (e: any) => e instanceof NotFoundException,
    );
  });

  it('seguimiento requerido sin fecha → BadRequest', async () => {
    const { service } = createMocks([makeRisk()]);
    await assert.rejects(
      () => service.create(String(RISK_ID), COMPANY_A, validDto({ requiresFollowUp: true })),
      (e: any) => e instanceof BadRequestException,
    );
  });

  it('creación sin seguimiento → followUpStatus CLOSED (neutro)', async () => {
    const { service } = createMocks([makeRisk()]);
    const created = await service.create(String(RISK_ID), COMPANY_A, validDto());
    assert.equal((created as any).followUpStatus, FollowUpStatus.CLOSED);
    assert.equal((created as any).requiresFollowUp, false);
  });

  it('creación con seguimiento → followUpStatus OPEN', async () => {
    const { service } = createMocks([makeRisk()]);
    const created = await service.create(
      String(RISK_ID),
      COMPANY_A,
      validDto({ requiresFollowUp: true, followUpDueDate: new Date().toISOString() }),
    );
    assert.equal((created as any).followUpStatus, FollowUpStatus.OPEN);
  });

  it('verifiedBy se trimea', async () => {
    const { service } = createMocks([makeRisk()]);
    const created = await service.create(String(RISK_ID), COMPANY_A, validDto({ verifiedBy: '  SST  ' }));
    assert.equal((created as any).verifiedBy, 'SST');
  });
});

describe('ETAPA 3 — Consulta', () => {
  function seedList(service: ControlVerificationService, vStore: any[]) {
    vStore.push(
      { _id: new Types.ObjectId(), companyId: COMPANY_A, riskId: RISK_ID, verificationDate: new Date('2026-01-01'), result: 'COMPLIANT' } as any,
      { _id: new Types.ObjectId(), companyId: COMPANY_A, riskId: RISK_ID, verificationDate: new Date('2026-03-01'), result: 'PARTIAL' } as any,
      { _id: new Types.ObjectId(), companyId: COMPANY_A, riskId: RISK_ID, verificationDate: new Date('2026-02-01'), result: 'COMPLIANT' } as any,
    );
  }

  it('lista las verificaciones del riesgo ordenadas por fecha descendente', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    seedList(service, vStore);
    const list = await service.findAll(String(RISK_ID), COMPANY_A);
    assert.equal(list.length, 3);
    const dates = list.map((v) => new Date((v as any).verificationDate).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  });

  it('no expone verificaciones de otra empresa (filtro companyId genuino)', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    seedList(service, vStore);
    // Huérfana de empresa B bajo el mismo riskId: NO debe aparecer para A.
    vStore.push({ _id: new Types.ObjectId(), companyId: COMPANY_B, riskId: RISK_ID, verificationDate: new Date('2026-05-01') } as any);
    const listA = await service.findAll(String(RISK_ID), COMPANY_A);
    assert.equal(listA.length, 3, 'solo las verificaciones de la empresa A');
    assert.ok(listA.every((v) => String((v as any).companyId) === String(COMPANY_A)));
    // Y la empresa B solo ve la suya (el riesgo de A le responde 404):
    await assert.rejects(
      () => service.findAll(String(RISK_ID), COMPANY_B),
      (e: any) => e instanceof NotFoundException,
    );
  });

  it('consulta una verificación por id', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const id = new Types.ObjectId();
    vStore.push({ _id: id, companyId: COMPANY_A, riskId: RISK_ID, result: 'COMPLIANT' } as any);
    const found = await service.findOne(String(RISK_ID), String(id), COMPANY_A);
    assert.equal(String((found as any)._id), String(id));
  });

  it('impide acceso cruzado usando otro riskId (404)', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const id = new Types.ObjectId();
    vStore.push({ _id: id, companyId: COMPANY_A, riskId: RISK_ID } as any);
    const otherRisk = new Types.ObjectId().toHexString();
    await assert.rejects(
      () => service.findOne(otherRisk, String(id), COMPANY_A),
      (e: any) => e instanceof NotFoundException,
    );
  });

  it('impide acceso cruzado entre empresas (404 estándar, sin detalles)', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const id = new Types.ObjectId();
    vStore.push({ _id: id, companyId: COMPANY_A, riskId: RISK_ID } as any);
    await assert.rejects(
      () => service.findOne(String(RISK_ID), String(id), COMPANY_B),
      (e: any) => e instanceof NotFoundException,
    );
  });
});

describe('ETAPA 3 — Actualización de seguimiento', () => {
  function seedOne(vStore: any[], overrides: Record<string, unknown> = {}) {
    const doc: any = {
      _id: new Types.ObjectId(),
      companyId: COMPANY_A,
      riskId: RISK_ID,
      controlId: CONTROL_ID,
      controlDescriptionSnapshot: 'Barandas en borde de losa',
      verificationDate: new Date('2026-02-01'),
      verifiedBy: 'SST',
      result: 'NON_COMPLIANT',
      observations: 'No se instala baranda',
      requiresFollowUp: true,
      followUpDueDate: new Date('2026-04-01'),
      followUpStatus: FollowUpStatus.OPEN,
      ...overrides,
    };
    vStore.push(doc);
    return doc;
  }

  it('actualiza únicamente seguimiento', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const doc = seedOne(vStore);
    const dto: UpdateControlVerificationFollowUpDto = { followUpStatus: FollowUpStatus.CLOSED };
    const updated: any = await service.updateFollowUp(String(RISK_ID), String(doc._id), COMPANY_A, dto);
    assert.equal(updated.followUpStatus, FollowUpStatus.CLOSED);
    assert.equal(updated.result, 'NON_COMPLIANT', 'evidencia intacta');
  });

  it('impide modificar result/observations/controlId/snapshot/companyId/riskId (fuera del whitelist explícito)', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const doc = seedOne(vStore);
    const before = { ...doc };
    // El DTO no contiene esos campos; el service solo aplica $set de seguimiento.
    const dto: UpdateControlVerificationFollowUpDto = {
      requiresFollowUp: false,
      followUpStatus: FollowUpStatus.CLOSED,
    };
    const updated: any = await service.updateFollowUp(String(RISK_ID), String(doc._id), COMPANY_A, dto);
    assert.equal(updated.result, before.result);
    assert.equal(updated.observations, before.observations);
    assert.equal(updated.controlId, before.controlId);
    assert.equal(updated.controlDescriptionSnapshot, before.controlDescriptionSnapshot);
    assert.equal(String(updated.companyId), String(before.companyId));
    assert.equal(String(updated.riskId), String(before.riskId));
  });

  it('rechaza seguimiento incoherente: requiresFollowUp=true sin fecha', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const doc = seedOne(vStore, { followUpDueDate: undefined, requiresFollowUp: false, followUpStatus: FollowUpStatus.CLOSED });
    const dto: UpdateControlVerificationFollowUpDto = { requiresFollowUp: true };
    await assert.rejects(
      () => service.updateFollowUp(String(RISK_ID), String(doc._id), COMPANY_A, dto),
      (e: any) => e instanceof BadRequestException,
    );
  });

  it('convención: requiresFollowUp=false normaliza followUpStatus a CLOSED', async () => {
    const { service, vStore } = createMocks([makeRisk()]);
    const doc = seedOne(vStore);
    const dto: UpdateControlVerificationFollowUpDto = { requiresFollowUp: false };
    const updated: any = await service.updateFollowUp(String(RISK_ID), String(doc._id), COMPANY_A, dto);
    assert.equal(updated.followUpStatus, FollowUpStatus.CLOSED);
  });

  it('verificación inexistente → 404', async () => {
    const { service } = createMocks([makeRisk()]);
    await assert.rejects(
      () =>
        service.updateFollowUp(String(RISK_ID), new Types.ObjectId().toHexString(), COMPANY_A, {
          followUpStatus: FollowUpStatus.CLOSED,
        }),
      (e: any) => e instanceof NotFoundException,
    );
  });
});

describe('ETAPA 3 — Roles (defensa en profundidad del service)', () => {
  it('owner/admin pueden escribir', () => {
    const { service } = createMocks([makeRisk()]);
    assert.doesNotThrow(() => service.assertCanWrite('owner'));
    assert.doesNotThrow(() => service.assertCanWrite('admin'));
  });

  it('manager y member NO pueden escribir (Forbidden)', () => {
    const { service } = createMocks([makeRisk()]);
    assert.throws(() => service.assertCanWrite('manager'), ForbiddenException);
    assert.throws(() => service.assertCanWrite('member'), ForbiddenException);
  });
});
