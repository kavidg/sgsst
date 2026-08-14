import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { CopasstService } from '../copasst/copasst.service';
import { UserDocument } from '../users/schemas/user.schema';
import {
  COPASST_TRAINING_ITEM_CODE,
  PhvaAdvancedCopasstTrainingService,
} from './phva-advanced-copasst-training.service';
import {
  PhvaAdvancedCopasstTraining,
  PhvaAdvancedCopasstTrainingDocument,
} from './schemas/phva-advanced-copasst-training.schema';

const COMPANY_ID = '64b000000000000000000001';
const OTHER_COMPANY_ID = '64b0000000000000000000ff';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000004';

/** Usuario por defecto (user.email alimenta approvedBy / historial). */
function buildUser(): UserDocument {
  return {
    _id: new Types.ObjectId(USER_ID),
    email: 'owner@test.com',
    role: 'owner',
    firebaseUid: 'firebase-uid-owner',
  } as unknown as UserDocument;
}

/**
 * Modelo Mongoose en memoria mínimo (findOne/findById/create) + store. El
 * service de dominio filtra por companyId/itemCode/year en findOne, igual que
 * el modelo real.
 */
function buildModel(seed: PhvaAdvancedCopasstTrainingDocument[] = []) {
  const store = new Map<string, PhvaAdvancedCopasstTrainingDocument>();
  for (const doc of seed) store.set((doc._id as Types.ObjectId).toString(), doc);

  const chainable = (found: PhvaAdvancedCopasstTrainingDocument | null) => {
    const chain = { exec: async () => found, sort: () => chain };
    return chain;
  };

  return {
    store,
    findOne: (filter: Record<string, unknown>) => {
      const { companyId, itemCode, year } = filter as {
        companyId: Types.ObjectId;
        itemCode?: string;
        year?: number;
      };
      const found =
        [...store.values()].find((doc) => {
          if (doc.companyId.toString() !== companyId.toString()) return false;
          if (itemCode !== undefined && doc.itemCode !== itemCode) return false;
          if (year !== undefined && doc.year !== year) return false;
          return true;
        }) ?? null;
      return chainable(found);
    },
    findById: (id: Types.ObjectId) => ({
      exec: async () => store.get(id.toString()) ?? null,
    }),
    create: async (data: Partial<PhvaAdvancedCopasstTraining>) => {
      const id = new Types.ObjectId();
      const doc = {
        _id: id,
        itemCode: COPASST_TRAINING_ITEM_CODE,
        year: new Date().getFullYear(),
        annualProgram: [],
        sessions: [],
        memberCoverage: [],
        checklistTemplate: [],
        evaluationAttempts: [],
        signatures: [],
        certificates: [],
        evidenceFiles: [],
        attendanceEvidence: [],
        signatureEvidence: [],
        alerts: [],
        history: [],
        evidences: [],
        approval: { version: 1, status: 'PENDING' },
        locked: false,
        complianceStatus: 'PENDING',
        complianceReason: '',
        save: async function () {
          return this as unknown as PhvaAdvancedCopasstTrainingDocument;
        },
        ...data,
      } as unknown as PhvaAdvancedCopasstTrainingDocument;
      store.set(id.toString(), doc);
      return doc;
    },
  };
}

/** Registro base de la empresa (no bloqueado, approval PENDING). */
function buildRecord(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: COPASST_TRAINING_ITEM_CODE,
    year: new Date().getFullYear(),
    annualProgram: [],
    sessions: [],
    memberCoverage: [],
    checklistTemplate: [],
    evaluationAttempts: [],
    signatures: [],
    certificates: [],
    evidenceFiles: [],
    attendanceEvidence: [],
    signatureEvidence: [],
    evidences: [],
    alerts: [],
    history: [],
    approval: { status: 'PENDING', version: 1 },
    locked: false,
    complianceStatus: 'PENDING',
    complianceReason: '',
    save: async function () {
      return this as unknown as PhvaAdvancedCopasstTrainingDocument;
    },
    ...overrides,
  } as unknown as PhvaAdvancedCopasstTrainingDocument;
}

function buildService(seed: PhvaAdvancedCopasstTrainingDocument[] = []) {
  const model = buildModel(seed);
  const copasstService = { findCurrent: async () => null } as unknown as CopasstService;
  const service = new PhvaAdvancedCopasstTrainingService(
    model as never,
    copasstService,
  );
  return { service, model };
}

describe('PhvaAdvancedCopasstTrainingService — Approval Workflow (Fase 5)', () => {
  it('submit marca locked + approval PENDING y registra historial SUBMITTED', async () => {
    const { service } = buildService([
      buildRecord({ annualProgram: [{ title: 'Programa anual COPASST' }] as never }),
    ]);

    const result = await service.submitCopasstTraining(
      new Types.ObjectId(COMPANY_ID),
      buildUser(),
    );

    assert.equal(result.locked, true);
    assert.equal(result.approval?.status, 'PENDING');
    const submitted = result.history.find((entry) => entry.action === 'SUBMITTED');
    assert.ok(submitted, 'debe registrar el evento SUBMITTED');
    assert.equal(submitted.createdBy, 'owner@test.com');
  });

  it('submit rechaza cuando la entidad ya está bloqueada (pendiente)', async () => {
    const { service } = buildService([buildRecord({ locked: true })]);

    await assert.rejects(
      () => service.submitCopasstTraining(new Types.ObjectId(COMPANY_ID), buildUser()),
      /ya está pendiente de aprobación o aprobada/,
    );
  });

  it('submit rechaza cuando la entidad ya está aprobada', async () => {
    const { service } = buildService([
      buildRecord({ locked: true, approval: { status: 'APPROVED', version: 2 } }),
    ]);

    await assert.rejects(
      () => service.submitCopasstTraining(new Types.ObjectId(COMPANY_ID), buildUser()),
      /ya está pendiente de aprobación o aprobada/,
    );
  });

  it('APROBADO fija approval APPROVED + locked true y version++', async () => {
    const { service } = buildService([
      buildRecord({
        locked: true,
        annualProgram: [{ title: 'Programa anual COPASST' }] as never,
      }),
    ]);

    const result = await service.approveCopasstTraining(
      new Types.ObjectId(COMPANY_ID),
      buildUser(),
      { status: 'APPROVED', comments: 'Programa aprobado' },
    );

    assert.equal(result.approval?.status, 'APPROVED');
    assert.equal(result.approval?.comments, 'Programa aprobado');
    assert.equal(result.approval?.approvedBy, 'owner@test.com');
    assert.ok(result.approval?.approvedAt, 'debe registrar approvedAt');
    assert.equal(result.approval?.version, 2);
    assert.equal(result.locked, true);
    const entry = result.history.find((e) => e.action === 'APPROVAL_APPROVED');
    assert.ok(entry, 'debe registrar el historial APPROVAL_APPROVED');
  });

  it('RECHAZADO fija approval REJECTED y libera el lock', async () => {
    const { service } = buildService([buildRecord({ locked: true })]);

    const result = await service.approveCopasstTraining(
      new Types.ObjectId(COMPANY_ID),
      buildUser(),
      { status: 'REJECTED', comments: 'Falta programa anual' },
    );

    assert.equal(result.approval?.status, 'REJECTED');
    assert.equal(result.approval?.comments, 'Falta programa anual');
    assert.equal(result.locked, false);
    const entry = result.history.find((e) => e.action === 'APPROVAL_REJECTED');
    assert.ok(entry, 'debe registrar el historial APPROVAL_REJECTED');
  });

  // ═════════════════════════════════════════════
  // REGLA MÍNIMA DE CONTENIDO (Fase 9, M1)
  // ═════════════════════════════════════════════
  describe('Regla mínima de contenido para aprobación (Fase 9, M1)', () => {
    it('M1.1: decide APPROVED sin entidad existente → NotFound y NO crea entidad', async () => {
      const { service, model } = buildService([]);

      await assert.rejects(
        () =>
          service.approveCopasstTraining(new Types.ObjectId(COMPANY_ID), buildUser(), {
            status: 'APPROVED',
          }),
        NotFoundException,
      );
      assert.equal(model.store.size, 0, 'no debe crearse ninguna entidad');
    });

    it('M1.2: entidad vacía + submit → BadRequest con mensaje de contenido mínimo', async () => {
      const { service } = buildService([buildRecord()]);

      await assert.rejects(
        () => service.submitCopasstTraining(new Types.ObjectId(COMPANY_ID), buildUser()),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('al menos un programa anual o una sesión'),
      );
    });

    it('M1.3: entidad vacía + decide APPROVED → rechaza', async () => {
      const { service } = buildService([buildRecord()]);

      await assert.rejects(
        () =>
          service.approveCopasstTraining(new Types.ObjectId(COMPANY_ID), buildUser(), {
            status: 'APPROVED',
          }),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('al menos un programa anual o una sesión'),
      );
    });

    it('M1.4: con annualProgram pero sin sessions → submit permitido', async () => {
      const { service } = buildService([
        buildRecord({ annualProgram: [{ title: 'Programa anual COPASST' }] as never }),
      ]);

      const result = await service.submitCopasstTraining(
        new Types.ObjectId(COMPANY_ID),
        buildUser(),
      );
      assert.equal(result.locked, true);
      assert.equal(result.approval?.status, 'PENDING');
    });

    it('M1.5: sin annualProgram pero con ≥1 sesión → submit permitido', async () => {
      const { service } = buildService([
        buildRecord({ sessions: [{ title: 'Sesión de peligros' }] as never }),
      ]);

      const result = await service.submitCopasstTraining(
        new Types.ObjectId(COMPANY_ID),
        buildUser(),
      );
      assert.equal(result.locked, true);
    });

    it('M1.6: con annualProgram + session → submit permitido', async () => {
      const { service } = buildService([
        buildRecord({
          annualProgram: [{ title: 'Programa anual COPASST' }] as never,
          sessions: [{ title: 'Sesión de peligros' }] as never,
        }),
      ]);

      const result = await service.submitCopasstTraining(
        new Types.ObjectId(COMPANY_ID),
        buildUser(),
      );
      assert.equal(result.locked, true);
    });

    it('M1.7: REJECTED sobre entidad vacía → permitido (no aprueba)', async () => {
      const { service } = buildService([buildRecord()]);

      const result = await service.approveCopasstTraining(
        new Types.ObjectId(COMPANY_ID),
        buildUser(),
        { status: 'REJECTED', comments: 'Entidad incompleta' },
      );
      assert.equal(result.approval?.status, 'REJECTED');
      assert.equal(result.locked, false);
    });

    it('M1.8: ADJUSTMENTS_REQUESTED sobre entidad vacía → permitido', async () => {
      const { service } = buildService([buildRecord()]);

      const result = await service.approveCopasstTraining(
        new Types.ObjectId(COMPANY_ID),
        buildUser(),
        { status: 'ADJUSTMENTS_REQUESTED', comments: 'Ajustar cronograma' },
      );
      assert.equal(result.approval?.status, 'ADJUSTMENTS_REQUESTED');
      assert.equal(result.locked, false);
    });

    it('M1.9: flujo annualProgram → submit → APPROVED sigue funcionando', async () => {
      const { service } = buildService([
        buildRecord({ annualProgram: [{ title: 'Programa anual COPASST' }] as never }),
      ]);
      const companyId = new Types.ObjectId(COMPANY_ID);
      const user = buildUser();

      const submitted = await service.submitCopasstTraining(companyId, user);
      assert.equal(submitted.approval?.status, 'PENDING');
      assert.equal(submitted.locked, true);

      const approved = await service.approveCopasstTraining(companyId, user, {
        status: 'APPROVED',
        comments: 'Programa aprobado',
      });
      assert.equal(approved.approval?.status, 'APPROVED');
      assert.equal(approved.locked, true);
    });

    it('M1.10: flujo session → submit → APPROVED sigue funcionando', async () => {
      const { service } = buildService([
        buildRecord({ sessions: [{ title: 'Sesión de peligros' }] as never }),
      ]);
      const companyId = new Types.ObjectId(COMPANY_ID);
      const user = buildUser();

      const submitted = await service.submitCopasstTraining(companyId, user);
      assert.equal(submitted.approval?.status, 'PENDING');
      const approved = await service.approveCopasstTraining(companyId, user, {
        status: 'APPROVED',
      });
      assert.equal(approved.approval?.status, 'APPROVED');
      assert.equal(approved.locked, true);
    });

    it('M1.11: APPROVED sigue bloqueando el PATCH de entidad', async () => {
      const { service } = buildService([
        buildRecord({ annualProgram: [{ title: 'Programa anual COPASST' }] as never }),
      ]);
      const companyId = new Types.ObjectId(COMPANY_ID);
      const user = buildUser();

      await service.submitCopasstTraining(companyId, user);
      await service.approveCopasstTraining(companyId, user, { status: 'APPROVED' });

      await assert.rejects(
        () =>
          service.update(companyId, user, {
            annualProgram: [{ title: 'Intento de edición' }] as never,
          }),
        /bloqueada/,
      );
    });

    it('M1.12: REJECTED/ADJUSTMENTS siguen permitiendo corrección y reenvío', async () => {
      const { service } = buildService([
        buildRecord({ annualProgram: [{ title: 'Programa anual COPASST' }] as never }),
      ]);
      const companyId = new Types.ObjectId(COMPANY_ID);
      const user = buildUser();

      // Rechazo (libera el lock).
      const rejected = await service.approveCopasstTraining(companyId, user, {
        status: 'REJECTED',
        comments: 'Ajustar programa',
      });
      assert.equal(rejected.locked, false);

      // Corrección permitida tras rechazo.
      const corrected = await service.update(companyId, user, {
        annualProgram: [{ title: 'Programa corregido' }] as never,
      });
      assert.equal(corrected.locked, false);

      // Reenvío → PENDING.
      const resubmitted = await service.submitCopasstTraining(companyId, user);
      assert.equal(resubmitted.approval?.status, 'PENDING');
      assert.equal(resubmitted.locked, true);

      // Aprobación final.
      const approved = await service.approveCopasstTraining(companyId, user, {
        status: 'APPROVED',
      });
      assert.equal(approved.approval?.status, 'APPROVED');
      assert.equal(approved.locked, true);
    });
  });

  it('AJUSTES SOLICITADOS fija approval ADJUSTMENTS_REQUESTED y libera el lock', async () => {
    const { service } = buildService([buildRecord({ locked: true })]);

    const result = await service.approveCopasstTraining(
      new Types.ObjectId(COMPANY_ID),
      buildUser(),
      { status: 'ADJUSTMENTS_REQUESTED', comments: 'Ajustar cronograma' },
    );

    assert.equal(result.approval?.status, 'ADJUSTMENTS_REQUESTED');
    assert.equal(result.locked, false);
  });

  it('update() rechaza modificaciones cuando la entidad está bloqueada', async () => {
    const { service } = buildService([buildRecord({ locked: true })]);

    await assert.rejects(
      () =>
        service.update(new Types.ObjectId(COMPANY_ID), buildUser(), {
          annualProgram: [
            { title: 'X', status: 'Pendiente', participants: [], evidences: [], multimedia: [] },
          ],
        }),
      /bloqueada/,
    );
  });

  it('update() permite correcciones tras RECHAZO (unlocked)', async () => {
    const { service } = buildService([
      buildRecord({ locked: false, approval: { status: 'REJECTED', version: 2 } }),
    ]);

    const result = await service.update(new Types.ObjectId(COMPANY_ID), buildUser(), {
      annualProgram: [
        {
          title: 'Identificación de peligros',
          status: 'Pendiente',
          participants: [],
          evidences: [],
          multimedia: [],
        },
      ],
    });

    assert.ok(result);
    assert.equal(result.annualProgram.length, 1);
    assert.equal(result.locked, false);
  });

  it('multi-tenancy: submit/approve de una empresa sin entidad se rechazan y NO crean entidad (M1)', async () => {
    // La empresa B no tiene registro: submit/decide deben rechazarse (NotFound)
    // y NUNCA crear una entidad implícita (corrección M1: findOrCreate fuera
    // del flujo de aprobación).
    const { service, model } = buildService([buildRecord()]);
    const companyIdB = new Types.ObjectId(OTHER_COMPANY_ID);

    await assert.rejects(
      () => service.submitCopasstTraining(companyIdB, buildUser()),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.approveCopasstTraining(companyIdB, buildUser(), {
          status: 'APPROVED',
        }),
      NotFoundException,
    );

    // La entidad de la empresa A conserva su estado original (locked false).
    const recordA = model.store.get(RECORD_ID) as PhvaAdvancedCopasstTrainingDocument;
    assert.equal(recordA.locked, false);
    assert.equal(recordA.approval?.status, 'PENDING');
    // No se creó ninguna entidad adicional (solo la de A).
    assert.equal(model.store.size, 1);
  });
});
