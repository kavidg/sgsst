import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDocumentGenerationListener } from './approval-document-generation.listener';
import { ApprovalDocumentRegistryService } from './approval-document-registry.service';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
} from './approval-document-generator.interface';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const ENTITY_ID = '64b000000000000000000002';
const REQUEST_ID = '64b00000000000000000000a';
const EVENT_ID = '64b00000000000000000000c';

function buildActor(): ApprovalActor {
  return {
    userId: '64b000000000000000000003',
    email: 'manager@test.com',
    role: 'manager',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
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
  module?: ApprovalEntity;
  entityType?: string;
  generate?: (context: ApprovalDocumentContext) => Promise<unknown>;
}): ApprovalDocumentGenerator & { calls: ApprovalDocumentContext[] } {
  const calls: ApprovalDocumentContext[] = [];
  return {
    module: overrides?.module ?? ApprovalEntity.PHVA_ADVANCED,
    entityType: overrides?.entityType ?? 'RESPONSIBLE_SG_SST',
    generate: async (context) => {
      calls.push(context);
      if (overrides?.generate) {
        return overrides.generate(context);
      }
      return { generated: true };
    },
    calls,
  };
}

describe('ApprovalDocumentRegistryService', () => {
  it('resuelve el generador registrado por module + entity', () => {
    const generator = buildGenerator();
    const registry = new ApprovalDocumentRegistryService([generator]);

    assert.equal(
      registry.findGenerator(ApprovalEntity.PHVA_ADVANCED, 'RESPONSIBLE_SG_SST'),
      generator,
    );
  });

  it('retorna undefined para una entidad sin generador registrado', () => {
    const generator = buildGenerator({ entityType: 'RESPONSIBLE_SG_SST' });
    const registry = new ApprovalDocumentRegistryService([generator]);

    assert.equal(registry.findGenerator(ApprovalEntity.PHVA_ADVANCED, 'COPASST'), undefined);
    assert.equal(registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'RESPONSIBLE_SG_SST'), undefined);
  });
});

describe('ApprovalDocumentGenerationListener', () => {
  it('delega en el generador para una decisión APPROVED con documento registrado', async () => {
    const generator = buildGenerator();
    const registry = new ApprovalDocumentRegistryService([generator]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    const result = await listener.onDecisionApplied(buildContext());

    assert.deepEqual(result, { generated: true });
    assert.equal(generator.calls.length, 1);
    assert.equal(generator.calls[0].decision, ApprovalDecision.APPROVED);
    assert.equal(generator.calls[0].entityType, 'RESPONSIBLE_SG_SST');
    assert.equal(generator.calls[0].approvalEventId?.toString(), EVENT_ID);
  });

  it('no genera nada para decisiones que no son APPROVED', async () => {
    const generator = buildGenerator();
    const registry = new ApprovalDocumentRegistryService([generator]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    const result = await listener.onDecisionApplied(
      buildContext({ decision: ApprovalDecision.REJECTED }),
    );

    assert.equal(result, null);
    assert.equal(generator.calls.length, 0);
  });

  it('no falla cuando la entidad aprobada no tiene documento registrado', async () => {
    const registry = new ApprovalDocumentRegistryService([buildGenerator({ entityType: 'OTHER' })]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    const result = await listener.onDecisionApplied(
      buildContext({ entityType: 'COPASST' }),
    );

    assert.equal(result, null);
  });

  it('propaga el error del generador (no lo silencia)', async () => {
    const generator = buildGenerator({
      generate: async () => {
        throw new Error('generation failed');
      },
    });
    const registry = new ApprovalDocumentRegistryService([generator]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    await assert.rejects(
      () => listener.onDecisionApplied(buildContext()),
      /generation failed/,
    );
  });
});
