import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { AbsenteeismController } from './absenteeism.controller';
import { AbsenteeismService } from './absenteeism.service';

/**
 * F2 — Endurecimiento company-bound de absenteeism: sin contexto →
 * ForbiddenException('Missing active company context'); nunca `new ObjectId('')`.
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
      findAllByCompany: async (companyId: string) => {
        calls.push({ method: 'findAllByCompany', args: [companyId] });
        return [];
      },
      getCompanyStats: async (companyId: string) => {
        calls.push({ method: 'getCompanyStats', args: [companyId] });
        return {};
      },
      remove: async (id: string, companyId: string) => {
        calls.push({ method: 'remove', args: [id, companyId] });
        return {};
      },
    } as unknown as AbsenteeismService,
  };
}

function buildRequest(companyId?: Types.ObjectId): RequestWithUser {
  return {
    headers: {},
    user: { uid: 'uid-1', _id: 'user-1' },
    ...(companyId ? { companyId } : {}),
  } as RequestWithUser;
}

describe('AbsenteeismController — F2 endurecimiento company-bound', () => {
  it('request.companyId existente → findAllByCompany con el contexto recibido', () => {
    const { calls, service } = buildService();
    const controller = new AbsenteeismController(service);
    controller.findAll(buildRequest(new Types.ObjectId(COMPANY_ID)));
    assert.equal(calls[0].method, 'findAllByCompany');
    assert.equal(calls[0].args[0], COMPANY_ID);
  });

  it('request.companyId inexistente → ForbiddenException (nunca ObjectId(\'\'))', () => {
    const { calls, service } = buildService();
    const controller = new AbsenteeismController(service);
    assert.throws(
      () => controller.findAll(buildRequest()),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error as ForbiddenException).message === 'Missing active company context',
    );
    assert.equal(calls.length, 0);
  });

  it('POST sin contexto → ForbiddenException', () => {
    const { service } = buildService();
    const controller = new AbsenteeismController(service);
    assert.throws(
      () => controller.create(buildRequest(), {} as never),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error as ForbiddenException).message === 'Missing active company context',
    );
  });

  it('stats y remove sin contexto → ForbiddenException', () => {
    const { service } = buildService();
    const controller = new AbsenteeismController(service);
    assert.throws(() => controller.getCompanyStats(buildRequest()), ForbiddenException);
    assert.throws(
      () => controller.remove(buildRequest(), '64b0000000000000000000c1'),
      ForbiddenException,
    );
  });
});
