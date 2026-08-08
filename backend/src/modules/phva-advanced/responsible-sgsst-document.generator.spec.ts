import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { ApprovalDocumentContext } from '../approval-workflow/document-generation/approval-document-generator.interface';
import { ResponsibleSgsstDocumentGenerator } from './responsible-sgsst-document.generator';
import { PhvaAdvancedService } from './phva-advanced.service';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const ENTITY_ID = '64b000000000000000000002';
const REQUEST_ID = '64b00000000000000000000a';
const EVENT_ID = '64b00000000000000000000c';
const USER_ID = '64b000000000000000000003';

function buildActor(overrides?: Partial<ApprovalActor>): ApprovalActor {
  return {
    userId: USER_ID,
    email: 'manager@test.com',
    role: 'manager',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildContext(overrides?: Partial<ApprovalDocumentContext>): ApprovalDocumentContext {
  return {
    companyId: COMPANY_ID,
    module: ApprovalEntity.PHVA_ADVANCED,
    entityType: 'RESPONSIBLE_SG_SST',
    entityId: ENTITY_ID,
    requestId: REQUEST_ID,
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    approvalEventId: new Types.ObjectId(EVENT_ID),
    approvedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function buildGenerator(overrides?: {
  generateError?: unknown;
}): {
  generator: ResponsibleSgsstDocumentGenerator;
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];
  const phvaAdvancedService = {
    generateResponsibleSgsstDocument: async (...args: unknown[]) => {
      calls.push(args[0] as Record<string, unknown>);
      if (overrides?.generateError) {
        throw overrides.generateError;
      }
      return {
        instanceId: new Types.ObjectId(),
        fileUrl: 'https://storage.googleapis.com/bucket/doc.docx',
        storagePath: 'document-generation/company/doc.docx',
        version: 1,
      };
    },
  } as unknown as PhvaAdvancedService;

  return {
    generator: new ResponsibleSgsstDocumentGenerator(phvaAdvancedService),
    calls,
  };
}

describe('ResponsibleSgsstDocumentGenerator', () => {
  it('implementa el contrato ApprovalDocumentGenerator (module + entityType)', () => {
    const { generator } = buildGenerator();

    assert.equal(generator.module, ApprovalEntity.PHVA_ADVANCED);
    assert.equal(generator.entityType, 'RESPONSIBLE_SG_SST');
  });

  it('delega en PhvaAdvancedService.generateResponsibleSgsstDocument con el contexto APPROVED', async () => {
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
    assert.equal(params.sourceEntityId.toString(), ENTITY_ID);
    assert.equal(params.approval.status, 'APPROVED');
    assert.equal(params.approval.approvedBy.toString(), USER_ID);
    assert.equal(params.approval.approvalEventId.toString(), EVENT_ID);
    assert.equal(params.approval.approvalRequestId.toString(), REQUEST_ID);
  });

  it('usa la fecha del ApprovalEvent como approvedAt', async () => {
    const { generator, calls } = buildGenerator();

    await generator.generate(buildContext());

    const params = calls[0] as { approval: { approvedAt: Date } };
    assert.equal(params.approval.approvedAt.toISOString(), '2026-01-02T00:00:00.000Z');
  });

  it('deja approvedBy undefined cuando el actor solo trae un Firebase UID', async () => {
    const { generator, calls } = buildGenerator();

    await generator.generate(
      buildContext({
        actor: buildActor({ userId: 'firebase-uid-not-objectid', firebaseUid: 'firebase-uid-not-objectid' }),
      }),
    );

    const params = calls[0] as { approval: { approvedBy?: Types.ObjectId } };
    assert.equal(params.approval.approvedBy, undefined);
  });

  it('usa la fecha actual cuando el evento no trae approvedAt', async () => {
    const { generator, calls } = buildGenerator();

    const before = new Date();
    await generator.generate(buildContext({ approvedAt: undefined }));
    const after = new Date();

    const params = calls[0] as { approval: { approvedAt: Date } };
    assert.ok(params.approval.approvedAt instanceof Date);
    assert.ok(params.approval.approvedAt >= before);
    assert.ok(params.approval.approvedAt <= after);
  });

  it('propaga los errores del servicio de negocio', async () => {
    const { generator } = buildGenerator({ generateError: new Error('record not complete') });

    await assert.rejects(
      () => generator.generate(buildContext()),
      /record not complete/,
    );
  });

  it('falla (no genera) cuando el companyId no corresponde al registro (seguridad)', async () => {
    // El servicio de negocio rechaza registros de otra empresa con
    // NotFoundException. El generador delega tal cual: no genera documento
    // para companyId ajeno.
    const foreignError = new Error('Responsable SST not found');
    const { generator, calls } = buildGenerator({ generateError: foreignError });

    await assert.rejects(
      () => generator.generate(buildContext({ companyId: '64b0000000000000000000ff' })),
      /Responsable SST not found/,
    );
    // Se intentó delegar con el companyId ajeno (nunca se reemplaza por el del
    // registro): la validación de pertenencia vive en el servicio de negocio.
    assert.equal(calls.length, 1);
    assert.equal(
      (calls[0] as { companyId: Types.ObjectId }).companyId.toString(),
      '64b0000000000000000000ff',
    );
  });
});
