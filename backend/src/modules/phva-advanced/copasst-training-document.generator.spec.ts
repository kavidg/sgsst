import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { ApprovalDocumentContext } from '../approval-workflow/document-generation/approval-document-generator.interface';
import { ApprovalDocumentRegistryService } from '../approval-workflow/document-generation/approval-document-registry.service';
import { PHVA_SOURCE_ENTITY_COPASST_TRAINING } from '../document-generation/types/document-generation.types';
import { CopasstTrainingDocumentGenerator } from './copasst-training-document.generator';
import { CopasstTrainingDocumentService } from './copasst-training-document.service';

const COMPANY_ID = '64b000000000000000000001';
const ENTITY_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';
const REQUEST_ID = '64b000000000000000000004';
const EVENT_ID = '64b000000000000000000005';

function buildActor(overrides?: Partial<ApprovalActor>): ApprovalActor {
  return {
    userId: USER_ID,
    email: 'manager@empresa.com',
    role: 'manager',
    timestamp: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function buildContext(): ApprovalDocumentContext {
  return {
    companyId: COMPANY_ID,
    module: ApprovalEntity.PHVA_ADVANCED,
    entityType: 'PhvaAdvancedCopasstTraining',
    entityId: ENTITY_ID,
    requestId: REQUEST_ID,
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    approvalEventId: new Types.ObjectId(EVENT_ID),
    approvedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

/** Stub de CopasstTrainingDocumentService: registra llamadas a generateReport. */
function buildGenerator(overrides?: { generateError?: Error }): {
  generator: CopasstTrainingDocumentGenerator;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const documentService = {
    generateReport: async (...args: unknown[]) => {
      calls.push(args);
      if (overrides?.generateError) throw overrides.generateError;
      return {
        document: {
          instanceId: new Types.ObjectId(),
          fileUrl: 'https://storage.googleapis.com/bucket/informe.docx',
          storagePath: 'document-generation/company/informe.docx',
          version: 1,
        },
        evidence: { type: 'REPORT', fileName: 'informe.docx', fileUrl: 'https://x', uploadedAt: new Date() },
        reused: false,
      };
    },
  } as unknown as CopasstTrainingDocumentService;

  return {
    generator: new CopasstTrainingDocumentGenerator(documentService),
    calls,
  };
}

describe('CopasstTrainingDocumentGenerator (1.1.7, Fase 4)', () => {
  it('implementa el contrato ApprovalDocumentGenerator con la clave real del flujo (Fase 5)', () => {
    const { generator } = buildGenerator();

    assert.equal(generator.module, ApprovalEntity.PHVA_ADVANCED);
    assert.equal(generator.entityType, 'PhvaAdvancedCopasstTraining');
  });

  it('declara el alias normalizado PHVA_ADVANCED:COPASST_TRAINING', () => {
    const { generator } = buildGenerator();

    assert.ok(generator.aliases);
    assert.equal(generator.aliases?.length, 1);
    assert.equal(generator.aliases?.[0].module, ApprovalEntity.PHVA_ADVANCED);
    assert.equal(generator.aliases?.[0].entityType, PHVA_SOURCE_ENTITY_COPASST_TRAINING);
  });

  it('delega en CopasstTrainingDocumentService.generateReport con el companyId traducido', async () => {
    const { generator, calls } = buildGenerator();

    const result = await generator.generate(buildContext());

    assert.ok(result);
    assert.equal(calls.length, 1);
    const params = calls[0] as [Types.ObjectId, undefined];
    assert.equal(params[0].toString(), COMPANY_ID);
    // Generación post-aprobación: sin usuario autenticado (auditoría 'system').
    assert.equal(params[1], undefined);
  });

  it('propaga el error del servicio sin transformarlo', async () => {
    const { generator } = buildGenerator({
      generateError: new Error('COPASST training record not found'),
    });

    await assert.rejects(
      () => generator.generate(buildContext()),
      /COPASST training record not found/,
    );
  });
});

describe('ApprovalDocumentRegistryService con CopasstTrainingDocumentGenerator', () => {
  it('resuelve el mismo generador bajo la clave real y el alias (sin duplicar generación)', () => {
    const { generator } = buildGenerator();
    const registry = new ApprovalDocumentRegistryService([generator]);

    const viaRealKey = registry.findGenerator(
      ApprovalEntity.PHVA_ADVANCED,
      'PhvaAdvancedCopasstTraining',
    );
    const viaAlias = registry.findGenerator(
      ApprovalEntity.PHVA_ADVANCED,
      PHVA_SOURCE_ENTITY_COPASST_TRAINING,
    );

    assert.equal(viaRealKey, generator);
    assert.equal(viaAlias, generator);
    assert.equal(viaRealKey, viaAlias);
  });

  it('queda registrado pero INERTE: no se invoca sin ApprovalEvent de la entidad', () => {
    // El listener solo genera documentos cuando existe un ApprovalEvent
    // APPROVED para la entidad; en Fase 4 no hay ApprovalRequests de 1.1.7,
    // por lo que el generador registrado no produce ninguna generación.
    const { generator, calls } = buildGenerator();
    const registry = new ApprovalDocumentRegistryService([generator]);

    const resolved = registry.findGenerator(
      ApprovalEntity.PHVA_ADVANCED,
      PHVA_SOURCE_ENTITY_COPASST_TRAINING,
    );
    assert.equal(resolved, generator);
    assert.equal(calls.length, 0, 'Fase 4: el generador no debe generar nada automáticamente');
  });
});
