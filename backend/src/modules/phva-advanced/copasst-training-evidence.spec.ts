import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { UserDocument } from '../users/schemas/user.schema';
import {
  PhvaAdvancedCopasstTrainingService,
} from './phva-advanced-copasst-training.service';
import {
  CopasstTrainingEvidenceType,
  PhvaAdvancedCopasstTraining,
  PhvaAdvancedCopasstTrainingDocument,
} from './schemas/phva-advanced-copasst-training.schema';

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';
const USER_ID = '64b0000000000000000000c1';

const user = {
  _id: new Types.ObjectId(USER_ID),
  email: 'admin@empresa.com',
} as unknown as UserDocument;

/** Entidad 1.1.7 base con una sesión programada. */
function buildRecord(companyId = COMPANY_A): PhvaAdvancedCopasstTrainingDocument {
  return {
    _id: new Types.ObjectId('64b0000000000000000000dd'),
    companyId: new Types.ObjectId(companyId),
    itemCode: '1.1.7',
    year: 2025,
    sessions: [
      {
        title: 'Capacitación funciones COPASST',
        status: 'Programada',
        scheduledDate: new Date('2025-03-01T00:00:00.000Z'),
        copasstParticipants: [],
      },
    ],
    evidences: [],
    history: [],
    complianceStatus: 'PENDING',
    complianceReason: '',
    save: async function () {
      return this as unknown as PhvaAdvancedCopasstTrainingDocument;
    },
  } as unknown as PhvaAdvancedCopasstTrainingDocument;
}

/**
 * Entidad 1.1.7 lista para COMPLIES salvo la evidencia de asistencia
 * (programa + sesión ejecutada + cobertura; Fase 9, A1). Permite aislar la
 * contribución de las evidencias estructuradas a la regla de compliance.
 */
function compliantRecord(companyId = COMPANY_A): PhvaAdvancedCopasstTrainingDocument {
  return {
    _id: new Types.ObjectId('64b0000000000000000000fe'),
    companyId: new Types.ObjectId(companyId),
    itemCode: '1.1.7',
    year: 2025,
    annualProgram: [{ title: 'Programa anual COPASST' }],
    sessions: [
      {
        title: 'Capacitación funciones COPASST',
        status: 'Ejecutada',
        completionDate: new Date('2025-03-01T00:00:00.000Z'),
        copasstParticipants: [
          { userId: new Types.ObjectId('64b0000000000000000000f1'), name: 'Miembro 1' },
          { userId: new Types.ObjectId('64b0000000000000000000f2'), name: 'Miembro 2' },
        ],
      },
    ],
    memberCoverage: [
      {
        userId: new Types.ObjectId('64b0000000000000000000f1'),
        name: 'Miembro 1',
        status: 'ACTIVO',
        trained: true,
      },
      {
        userId: new Types.ObjectId('64b0000000000000000000f2'),
        name: 'Miembro 2',
        status: 'ACTIVO',
        trained: true,
      },
    ],
    evidences: [],
    attendanceEvidence: [],
    signatureEvidence: [],
    history: [],
    complianceStatus: 'PENDING',
    complianceReason: '',
    save: async function () {
      return this as unknown as PhvaAdvancedCopasstTrainingDocument;
    },
  } as unknown as PhvaAdvancedCopasstTrainingDocument;
}

/** Evidencia estructurada mínima para los tests de compliance (A1). */
function structuredEvidence(type: CopasstTrainingEvidenceType) {
  return {
    type,
    fileName: 'soporte.pdf',
    fileUrl: 'https://storage.googleapis.com/bucket/soporte.pdf',
    uploadedAt: new Date(),
  } as never;
}

/**
 * Modelo en memoria: findOne filtra por companyId+itemCode (+year) como el
 * service real; create y save persisten en un store compartido.
 */
function buildModel(seed: PhvaAdvancedCopasstTrainingDocument[] = []) {
  const store = new Map<string, PhvaAdvancedCopasstTrainingDocument>();
  for (const doc of seed) store.set((doc._id as Types.ObjectId).toString(), doc);

  return {
    store,
    findOne: (filter: Record<string, unknown>) => {
      const { companyId, itemCode } = filter as {
        companyId: Types.ObjectId;
        itemCode?: string;
      };
      const found = [...store.values()].find(
        (doc) =>
          doc.companyId.toString() === companyId.toString() &&
          (itemCode === undefined || doc.itemCode === itemCode),
      );
      const chainable = { exec: async () => found ?? null };
      return { exec: chainable.exec, sort: () => chainable };
    },
    findById: (id: Types.ObjectId) => ({
      exec: async () => store.get(id.toString()) ?? null,
    }),
    create: async (data: Partial<PhvaAdvancedCopasstTraining>) => {
      const doc = {
        _id: new Types.ObjectId(),
        itemCode: '1.1.7',
        year: new Date().getFullYear(),
        sessions: [],
        evidences: [],
        history: [],
        complianceStatus: 'PENDING',
        complianceReason: '',
        save: async function () {
          return this as unknown as PhvaAdvancedCopasstTrainingDocument;
        },
        ...data,
      } as unknown as PhvaAdvancedCopasstTrainingDocument;
      store.set((doc._id as Types.ObjectId).toString(), doc);
      return doc;
    },
  };
}

function buildService(options: {
  seed?: PhvaAdvancedCopasstTrainingDocument[];
}) {
  const model = buildModel(options.seed ?? []);
  const copasstService = {
    findCurrent: async () => null,
    findById: async () => {
      throw new BadRequestException('Periodo no encontrado');
    },
  };
  const service = new PhvaAdvancedCopasstTrainingService(
    model as never,
    copasstService as never,
  );
  return { service, model };
}

describe('PhvaAdvancedCopasstTrainingService — Evidencias (1.1.7, Fase 4)', () => {
  describe('addEvidence', () => {
    it('persiste una evidencia válida con metadata completa (tipo, archivo, sesión, usuario, fecha)', async () => {
      const record = buildRecord();
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      const updated = await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.GENERAL,
        fileName: 'presentacion-peligros.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/phva/presentacion.pdf',
        storagePath: 'phva-advanced/company/copasst-training/2025/general/GENERAL/x.pdf',
        sessionIndex: 0,
        metadata: { source: 'ui' },
      });

      assert.equal(updated.evidences.length, 1);
      const evidence = updated.evidences[0];
      assert.equal(evidence.type, 'GENERAL');
      assert.equal(evidence.fileName, 'presentacion-peligros.pdf');
      assert.equal(evidence.sessionIndex, 0);
      assert.equal(evidence.sessionTitle, 'Capacitación funciones COPASST');
      assert.equal(evidence.uploadedBy?.toString(), USER_ID);
      assert.ok(evidence.uploadedAt);
      assert.deepEqual(evidence.metadata, { source: 'ui' });
      // Historial append-only.
      assert.ok(updated.history.some((h) => h.action === 'EVIDENCE_ADDED'));
    });

    it('rechaza un tipo de evidencia inválido', async () => {
      const record = buildRecord();
      const { service } = buildService({ seed: [record] });

      await assert.rejects(
        () =>
          service.addEvidence(new Types.ObjectId(COMPANY_A), user, {
            type: 'FAKE_TYPE' as never,
            fileName: 'x.pdf',
            fileUrl: 'https://storage.googleapis.com/bucket/x.pdf',
          }),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('Tipo de evidencia inválido'),
      );
    });

    it('rechaza una sesión inexistente (índice fuera de rango)', async () => {
      const record = buildRecord();
      const { service } = buildService({ seed: [record] });

      await assert.rejects(
        () =>
          service.addEvidence(new Types.ObjectId(COMPANY_A), user, {
            type: CopasstTrainingEvidenceType.ATTENDANCE,
            fileName: 'lista.pdf',
            fileUrl: 'https://storage.googleapis.com/bucket/lista.pdf',
            sessionIndex: 5,
          }),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no existe en la capacitación COPASST'),
      );
    });

    it('no persiste evidencias en la entidad de otra empresa (multi-tenancy)', async () => {
      const record = buildRecord(COMPANY_A);
      const { service, model } = buildService({ seed: [record] });

      // La empresa B no tiene entidad propia: findOrCreate(B) crea una vacía.
      const updated = await service.addEvidence(new Types.ObjectId(COMPANY_B), user, {
        type: CopasstTrainingEvidenceType.GENERAL,
        fileName: 'x.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/x.pdf',
      });

      // La entidad de A permanece intacta (sin evidencias de B).
      assert.equal(record.evidences.length, 0);
      // B persiste SOLO en su propia entidad.
      assert.equal(updated.evidences.length, 1);
      assert.equal(updated.companyId.toString(), COMPANY_B);
      assert.equal(model.store.size, 2);
    });
  });

  describe('findEvidence / findEvidenceBy', () => {
    it('recupera una evidencia por índice de la empresa propietaria', async () => {
      const record = buildRecord();
      record.evidences.push({
        type: CopasstTrainingEvidenceType.SIGNATURE,
        fileName: 'firmas.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/firmas.pdf',
        uploadedAt: new Date(),
      } as never);
      const { service } = buildService({ seed: [record] });

      const evidence = await service.findEvidence(new Types.ObjectId(COMPANY_A), 0);
      assert.ok(evidence);
      assert.equal(evidence?.fileName, 'firmas.pdf');
    });

    it('devuelve null si el índice no existe', async () => {
      const record = buildRecord();
      const { service } = buildService({ seed: [record] });

      const evidence = await service.findEvidence(new Types.ObjectId(COMPANY_A), 3);
      assert.equal(evidence, null);
    });

    it('devuelve null para una empresa sin entidad (no lee la de otra empresa)', async () => {
      const record = buildRecord(COMPANY_A);
      const { service } = buildService({ seed: [record] });

      const evidence = await service.findEvidence(new Types.ObjectId(COMPANY_B), 0);
      assert.equal(evidence, null);
    });

    it('findEvidenceBy filtra por predicado (certificado de participante+sesión)', async () => {
      const record = buildRecord();
      record.evidences.push({
        type: CopasstTrainingEvidenceType.CERTIFICATE,
        fileName: 'certificado.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/certificado.pdf',
        sessionIndex: 0,
        metadata: { participantUserId: '64b00000000000000000000001' },
        uploadedAt: new Date(),
      } as never);
      const { service } = buildService({ seed: [record] });

      const found = await service.findEvidenceBy(
        new Types.ObjectId(COMPANY_A),
        (evidence) =>
          evidence.type === 'CERTIFICATE' &&
          evidence.sessionIndex === 0 &&
          evidence.metadata?.participantUserId === '64b00000000000000000000001',
      );
      assert.ok(found);
      assert.equal(found?.fileName, 'certificado.pdf');
    });
  });

  // ═════════════════════════════════════════════
  // RESOLVE COMPLIANCE + EVIDENCIAS ESTRUCTURADAS (Fase 9, A1)
  // ═════════════════════════════════════════════
  describe('resolveCompliance — evidencias estructuradas (Fase 9, A1)', () => {
    it('A1.2: solo evidences[] con ATTENDANCE → COMPLIES', async () => {
      const record = compliantRecord();
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.ATTENDANCE,
        fileName: 'lista-asistencia.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/lista.pdf',
        sessionIndex: 0,
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
    });

    it('A1.3: solo evidences[] con SIGNATURE → COMPLIES', async () => {
      const record = compliantRecord();
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.SIGNATURE,
        fileName: 'firmas.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/firmas.pdf',
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
    });

    it('A1.4: solo evidences[] con CERTIFICATE → COMPLIES', async () => {
      const record = compliantRecord();
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.CERTIFICATE,
        fileName: 'certificado.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/certificado.pdf',
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
    });

    it('A1.5: solo evidences[] con GENERAL → NO cuenta como asistencia (PENDING)', async () => {
      const record = compliantRecord();
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.GENERAL,
        fileName: 'material.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/material.pdf',
      });

      assert.equal(record.complianceStatus, 'PENDING');
    });

    it('A1.6: solo evidences[] con REPORT → NO cuenta como asistencia (PENDING)', async () => {
      const record = compliantRecord();
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.REPORT,
        fileName: 'informe.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/informe.pdf',
      });

      assert.equal(record.complianceStatus, 'PENDING');
    });

    it('A1.7b: solo evidences[] con COMPLIANCE_REPORT → NO cuenta como asistencia (PENDING)', async () => {
      const record = compliantRecord();
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.COMPLIANCE_REPORT,
        fileName: 'reporte-cumplimiento.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/reporte.pdf',
      });

      assert.equal(record.complianceStatus, 'PENDING');
    });

    it('A1.8: legacy + structured evidence → COMPLIES sin alterar métricas', async () => {
      const record = compliantRecord();
      record.attendanceEvidence = ['https://storage/lista-asistencia.pdf'];
      const coverageBefore = JSON.stringify(record.memberCoverage);
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.SIGNATURE,
        fileName: 'firmas.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/firmas.pdf',
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
      // addEvidence no recalcula ni altera memberCoverage.
      assert.equal(JSON.stringify(record.memberCoverage), coverageBefore);
    });

    it('A1.9: addEvidence con evidencia estructurada válida recalcula compliance (PENDING → COMPLIES)', async () => {
      const record = compliantRecord();
      assert.equal(record.complianceStatus, 'PENDING');
      const { service } = buildService({ seed: [record] });
      const companyId = new Types.ObjectId(COMPANY_A);

      await service.addEvidence(companyId, user, {
        type: CopasstTrainingEvidenceType.ATTENDANCE,
        fileName: 'lista-asistencia.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/lista.pdf',
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
    });
  });
});
