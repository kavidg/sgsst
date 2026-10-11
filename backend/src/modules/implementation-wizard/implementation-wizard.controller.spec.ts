import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { ImplementationWizardController } from './implementation-wizard.controller';
import { ImplementationWizardService } from './implementation-wizard.service';

/**
 * F2 — parseCompanyId ya NO lanza `Error('Company ID no encontrado')`: ahora
 * responde ForbiddenException('Missing active company context'). Con contexto
 * el flujo del wizard es normal.
 */

const COMPANY_ID = '64b0000000000000000000a1';

function buildService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    service: {
      getWizard: async (companyId: Types.ObjectId) => {
        calls.push({ method: 'getWizard', args: [companyId] });
        return {};
      },
      getDashboardMetrics: async (companyId: Types.ObjectId) => {
        calls.push({ method: 'getDashboardMetrics', args: [companyId] });
        return {};
      },
    } as unknown as ImplementationWizardService,
  };
}

function buildRequest(companyId?: Types.ObjectId): RequestWithUser {
  return {
    headers: {},
    user: { uid: 'uid-1', _id: 'user-1' },
    ...(companyId ? { companyId } : {}),
  } as RequestWithUser;
}

describe('ImplementationWizardController — F2 (parseCompanyId)', () => {
  it('request.companyId existente → flujo normal (getDashboard)', async () => {
    const { calls, service } = buildService();
    const controller = new ImplementationWizardController(service);
    await controller.getDashboard(buildRequest(new Types.ObjectId(COMPANY_ID)));
    assert.equal(calls[0].method, 'getDashboardMetrics');
    assert.equal(String(calls[0].args[0]), COMPANY_ID);
  });

  it('request.companyId inexistente → ForbiddenException (no Error genérico)', async () => {
    const { service } = buildService();
    const controller = new ImplementationWizardController(service);
    await assert.rejects(
      () => controller.getDashboard(buildRequest()),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error as ForbiddenException).message === 'Missing active company context',
    );
  });

  it('getWizard sin contexto → ForbiddenException', async () => {
    const { service } = buildService();
    const controller = new ImplementationWizardController(service);
    await assert.rejects(
      () => controller.getWizard(buildRequest()),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error as ForbiddenException).message === 'Missing active company context',
    );
  });
});
