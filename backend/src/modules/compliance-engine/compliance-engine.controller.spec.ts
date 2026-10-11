import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { ComplianceEngineController } from './compliance-engine.controller';
import { ComplianceEngineService } from './compliance-engine.service';

/**
 * F2 — Endurecimiento company-bound: sin request.companyId →
 * ForbiddenException('Missing active company context'); nunca `new ObjectId('')`.
 */

const COMPANY_ID = '64b0000000000000000000a1';

function buildService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    service: {
      getOverview: async (companyId: string) => {
        calls.push({ method: 'getOverview', args: [companyId] });
        return { companyId } as never;
      },
    } as unknown as ComplianceEngineService,
  };
}

function buildRequest(companyId?: Types.ObjectId): RequestWithUser {
  return {
    headers: {},
    user: { uid: 'uid-1', _id: 'user-1' },
    ...(companyId ? { companyId } : {}),
  } as RequestWithUser;
}

describe('ComplianceEngineController — F2 endurecimiento company-bound', () => {
  it('request.companyId existente → getOverview con el contexto recibido', async () => {
    const { calls, service } = buildService();
    const controller = new ComplianceEngineController(service);
    await controller.getOverview(buildRequest(new Types.ObjectId(COMPANY_ID)));
    assert.equal(calls[0].args[0], COMPANY_ID);
  });

  it('request.companyId inexistente → ForbiddenException (nunca ObjectId(\'\'))', async () => {
    const { calls, service } = buildService();
    const controller = new ComplianceEngineController(service);
    await assert.rejects(
      () => controller.getOverview(buildRequest()),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error as ForbiddenException).message === 'Missing active company context',
    );
    assert.equal(calls.length, 0, 'ningún provider debe recibir un id inválido');
  });
});
