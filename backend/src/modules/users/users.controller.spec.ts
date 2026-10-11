import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * AUDIT-USERS-LIST — GET /users/company:
 *   A) request.companyId presente → delega al service con ESE companyId.
 *   B) request.companyId ausente → 403 'Missing active company context'
 *      (patrón F2, NUNCA ObjectId vacío).
 *   C) El contrato no acepta companyId externo (query/params/body): el
 *      controller depende exclusivamente de request.companyId, que el
 *      CompanyAccessGuard resuelve/valida.
 */

const COMPANY_ID = '64b0000000000000000000a1';
const FOREIGN_COMPANY_ID = '64b0000000000000000000d1';

function buildHarness() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const service = {
    listCompanyUsersForAdmin: async (uid: string, companyId: Types.ObjectId) => {
      calls.push({ method: 'listCompanyUsersForAdmin', args: [uid, companyId] });
      return [];
    },
    listMembersForManager: async (...args: unknown[]) => {
      calls.push({ method: 'listMembersForManager', args });
      return [];
    },
  } as unknown as UsersService;
  return { calls, controller: new UsersController(service) };
}

function buildRequest(options: { companyId?: Types.ObjectId; queryCompanyId?: string } = {}): RequestWithUser {
  return {
    headers: {},
    user: { uid: 'admin-uid', _id: 'user-1' },
    ...(options.companyId ? { companyId: options.companyId } : {}),
    // Superficie de manipulación simulada: la query existiría en un request
    // real, pero el handler NO la lee (Caso C).
    ...(options.queryCompanyId ? { query: { companyId: options.queryCompanyId } } : {}),
  } as RequestWithUser;
}

describe('AUDIT-USERS-LIST · UsersController GET /users/company', () => {
  it('A. request.companyId presente → delega al service con el contexto recibido', async () => {
    const { calls, controller } = buildHarness();

    await controller.findCompanyUsers(
      { uid: 'admin-uid' } as never,
      buildRequest({ companyId: new Types.ObjectId(COMPANY_ID) }),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'listCompanyUsersForAdmin');
    assert.equal(calls[0].args[0], 'admin-uid');
    assert.equal(String(calls[0].args[1]), COMPANY_ID);
  });

  it('B. sin request.companyId → 403 Missing active company context (sin delegar)', async () => {
    const { calls, controller } = buildHarness();

    await assert.rejects(
      () => controller.findCompanyUsers({ uid: 'admin-uid' } as never, buildRequest()),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.equal(error.message, 'Missing active company context');
        return true;
      },
    );
    assert.equal(calls.length, 0);
  });

  it('C. query companyId ajena es IGNORADA: se delega con request.companyId', async () => {
    const { calls, controller } = buildHarness();

    await controller.findCompanyUsers(
      { uid: 'admin-uid' } as never,
      buildRequest({ companyId: new Types.ObjectId(COMPANY_ID), queryCompanyId: FOREIGN_COMPANY_ID }),
    );

    // La empresa delegada es la del contexto del guard, NO la del query.
    assert.equal(String(calls[0].args[1]), COMPANY_ID);
    assert.notEqual(String(calls[0].args[1]), FOREIGN_COMPANY_ID);
  });

  it('C2. query companyId con contexto ausente → 403 (jamás se usa la query)', async () => {
    const { calls, controller } = buildHarness();

    await assert.rejects(
      () =>
        controller.findCompanyUsers(
          { uid: 'admin-uid' } as never,
          buildRequest({ queryCompanyId: FOREIGN_COMPANY_ID }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.equal(error.message, 'Missing active company context');
        return true;
      },
    );
    assert.equal(calls.length, 0);
  });

  it('sin usuario autenticado → 401 (patrón del controller)', async () => {
    const { calls, controller } = buildHarness();

    await assert.rejects(
      () =>
        controller.findCompanyUsers(
          undefined,
          buildRequest({ companyId: new Types.ObjectId(COMPANY_ID) }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.equal(error.message, 'Missing authenticated user');
        return true;
      },
    );
    assert.equal(calls.length, 0);
  });
});
