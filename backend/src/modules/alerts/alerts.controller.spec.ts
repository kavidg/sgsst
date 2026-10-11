import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

/**
 * F2 — Endurecimiento de endpoints company-bound: ausencia de contexto de
 * empresa → ForbiddenException('Missing active company context'), NUNCA
 * `new ObjectId('')` (BSONError). Con contexto → flujo normal.
 */

const COMPANY_ID = '64b0000000000000000000a1';

function buildService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    service: {
      create: async (dto: unknown) => {
        calls.push({ method: 'create', args: [dto] });
        return dto;
      },
      findByCompany: async (companyId: string) => {
        calls.push({ method: 'findByCompany', args: [companyId] });
        return [];
      },
      findByCompanyAndUser: async (companyId: string, userId: string) => {
        calls.push({ method: 'findByCompanyAndUser', args: [companyId, userId] });
        return [];
      },
    } as unknown as AlertsService,
  };
}

function buildRequest(companyId?: Types.ObjectId): RequestWithUser {
  return {
    headers: {},
    user: { uid: 'uid-1', _id: 'user-1' },
    ...(companyId ? { companyId } : {}),
  } as RequestWithUser;
}

describe('AlertsController — F2 endurecimiento company-bound', () => {
  it('request.companyId existente → flujo normal con el contexto recibido', async () => {
    const { calls, service } = buildService();
    const controller = new AlertsController(service);
    await controller.findByCompany(buildRequest(new Types.ObjectId(COMPANY_ID)));
    assert.equal(calls[0].method, 'findByCompany');
    assert.equal(calls[0].args[0], COMPANY_ID);
  });

  it('GET con userId → ruta findByCompanyAndUser con el contexto recibido', async () => {
    const { calls, service } = buildService();
    const controller = new AlertsController(service);
    await controller.findByCompany(buildRequest(new Types.ObjectId(COMPANY_ID)), '64b0000000000000000000b1');
    assert.equal(calls[0].method, 'findByCompanyAndUser');
    assert.equal(calls[0].args[0], COMPANY_ID);
  });

  it('request.companyId inexistente → ForbiddenException (nunca ObjectId(\'\'))', () => {
    const { calls, service } = buildService();
    const controller = new AlertsController(service);
    assert.throws(
      () => controller.findByCompany(buildRequest()),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error as ForbiddenException).message === 'Missing active company context',
    );
    assert.equal(calls.length, 0, 'el service nunca debe invocarse sin contexto');
  });

  it('POST sin contexto → ForbiddenException', () => {
    const { service } = buildService();
    const controller = new AlertsController(service);
    assert.throws(
      () => controller.create(buildRequest(), { title: 'x' } as never),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error as ForbiddenException).message === 'Missing active company context',
    );
  });
});
