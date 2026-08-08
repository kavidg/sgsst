import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { ApprovalDocumentContext } from '../approval-workflow/document-generation/approval-document-generator.interface';
import { ApprovalDocumentRegistryService } from '../approval-workflow/document-generation/approval-document-registry.service';
import { PHVA_SOURCE_ENTITY_COPASST } from '../document-generation/types/document-generation.types';
import { CopasstDocumentGenerator } from './copasst-document.generator';
import { PhvaAdvancedService } from './phva-advanced.service';

const COMPANY_ID = '64b000000000000000000001';
const PERIOD_ID = '64b000000000000000000002';
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

function buildContext(overrides?: {
  actor?: ApprovalActor;
  approvedAt?: Date;
}): ApprovalDocumentContext {
  return {
    companyId: COMPANY_ID,
    module: ApprovalEntity.COPASST,
    entityType: 'CopasstPeriod',
    entityId: PERIOD_ID,
    requestId: REQUEST_ID,
    decision: ApprovalDecision.APPROVED,
    actor: overrides?.actor ?? buildActor(),
    approvalEventId: new Types.ObjectId(EVENT_ID),
    approvedAt: overrides?.approvedAt ?? new Date('2026-01-02T00:00:00.000Z'),
  };
}

/** Stub de PhvaAdvancedService: registra las llamadas a generateCopasstDocument. */
function buildGenerator(overrides?: { generateError?: Error }): {
  generator: CopasstDocumentGenerator;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const phvaAdvancedService = {
    generateCopasstDocument: async (...args: unknown[]) => {
      calls.push(args[0]);
      if (overrides?.generateError) {
        throw overrides.generateError;
      }
      return {
        instanceId: new Types.ObjectId(),
        fileUrl: 'https://storage.googleapis.com/bucket/copasst.docx',
        storagePath: 'document-generation/company/copasst.docx',
        version: 1,
      };
    },
  } as unknown as PhvaAdvancedService;

  return {
    generator: new CopasstDocumentGenerator(phvaAdvancedService),
    calls,
  };
}

describe('CopasstDocumentGenerator', () => {
  it('implementa el contrato ApprovalDocumentGenerator con la clave real del flujo', () => {
    const { generator } = buildGenerator();

    assert.equal(generator.module, ApprovalEntity.COPASST);
    assert.equal(generator.entityType, 'CopasstPeriod');
  });

  it('declara el alias normalizado PHVA_ADVANCED:COPASST', () => {
    const { generator } = buildGenerator();

    assert.ok(generator.aliases);
    assert.equal(generator.aliases?.length, 1);
    assert.equal(generator.aliases?.[0].module, ApprovalEntity.PHVA_ADVANCED);
    assert.equal(generator.aliases?.[0].entityType, PHVA_SOURCE_ENTITY_COPASST);
  });

  it('delega en PhvaAdvancedService.generateCopasstDocument con el contexto traducido', async () => {
    const { generator, calls } = buildGenerator();

    const result = await generator.generate(buildContext());

    assert.ok(result);
    assert.equal(calls.length, 1);
    const params = calls[0] as {
      companyId: Types.ObjectId;
      sourceEntityId: Types.ObjectId;
      approval: {
        status: string;
        approvedBy: Types.ObjectId;
        approvedAt: Date;
        approvalEventId: Types.ObjectId;
        approvalRequestId: Types.ObjectId;
      };
    };
    assert.equal(params.companyId.toString(), COMPANY_ID);
    assert.equal(params.sourceEntityId.toString(), PERIOD_ID);
    assert.equal(params.approval.status, 'APPROVED');
    assert.equal(params.approval.approvedBy.toString(), USER_ID);
    assert.equal(params.approval.approvalEventId.toString(), EVENT_ID);
    assert.equal(params.approval.approvalRequestId.toString(), REQUEST_ID);
  });

  it('deja approvedBy undefined cuando el actor solo trae un Firebase UID', async () => {
    const { generator, calls } = buildGenerator();

    await generator.generate(
      buildContext({
        actor: buildActor({ userId: 'firebase-uid-not-objectid' }),
      }),
    );

    const params = calls[0] as { approval: { approvedBy?: Types.ObjectId } };
    assert.equal(params.approval.approvedBy, undefined);
  });

  it('usa la fecha del ApprovalEvent como approvedAt', async () => {
    const { generator, calls } = buildGenerator();

    await generator.generate(buildContext());

    const params = calls[0] as { approval: { approvedAt: Date } };
    assert.equal(params.approval.approvedAt.toISOString(), '2026-01-02T00:00:00.000Z');
  });

  it('propaga el error del servicio de negocio sin transformarlo', async () => {
    const { generator } = buildGenerator({
      generateError: new Error('COPASST period not found'),
    });

    await assert.rejects(
      () => generator.generate(buildContext()),
      /COPASST period not found/,
    );
  });
});

describe('ApprovalDocumentRegistryService con CopasstDocumentGenerator', () => {
  it('resuelve el mismo generador bajo la clave real COPASST:CopasstPeriod y el alias PHVA_ADVANCED:COPASST', () => {
    const { generator } = buildGenerator();
    const registry = new ApprovalDocumentRegistryService([generator]);

    const viaRealKey = registry.findGenerator(
      ApprovalEntity.COPASST,
      'CopasstPeriod',
    );
    const viaAlias = registry.findGenerator(
      ApprovalEntity.PHVA_ADVANCED,
      PHVA_SOURCE_ENTITY_COPASST,
    );

    assert.equal(viaRealKey, generator);
    assert.equal(viaAlias, generator);
    // Ambas claves apuntan al mismo generador (no se duplica generación).
    assert.equal(viaRealKey, viaAlias);
  });

  it('no resuelve generador para entidades sin documento registrado', () => {
    const { generator } = buildGenerator();
    const registry = new ApprovalDocumentRegistryService([generator]);

    const viaUnknown = registry.findGenerator(
      ApprovalEntity.PHVA_ADVANCED,
      'CONVIVENCIA',
    );

    assert.equal(viaUnknown, undefined);
  });
});
