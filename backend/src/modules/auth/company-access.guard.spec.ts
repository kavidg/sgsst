import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CompanyAccessGuard } from './company-access.guard';

/** Stub del modelo Company para la rama owner (vinculación por ownerId). */
const companyModelStub = {
  findOne: (filter: { _id?: unknown; ownerId?: unknown }) => {
    const resolve = async () => {
      const isOwned = String(filter.ownerId) === 'user-1' && String(filter._id) === OWNED_COMPANY_ID;
      return isOwned ? { _id: new Types.ObjectId(OWNED_COMPANY_ID) } : null;
    };
    return {
      select: () => ({ exec: resolve }),
      exec: resolve,
    };
  },
};

const OWNED_COMPANY_ID = '64b0000000000000000000c1';
const FOREIGN_COMPANY_ID = '64b0000000000000000000d1';

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-01: Auto-derive companyId from user profile
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-01: Sin x-company-id header, auto-derive companyId', () => {
  it('resuelve companyId desde user.companyId cuando no hay header', async () => {
    const companyId = '64b0000000000000000000a1';
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role: 'admin',
          companyId,
        }),
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => ({ companyId }),
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-1' },
      headers: {}, // NO x-company-id header
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    const allowed = await guard.canActivate(context);
    assert.equal(allowed, true);
    assert.equal((request as Record<string, unknown>).companyId, companyId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-02: Con x-company-id header, backward compatible
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-02: Con x-company-id header, backward compatible', () => {
  it('valida membresía usando el header cuando se proporciona', async () => {
    const companyId = '64b0000000000000000000a1';
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role: 'admin',
          companyId,
        }),
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => ({ companyId }),
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-1' },
      headers: { 'x-company-id': companyId },
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    const allowed = await guard.canActivate(context);
    assert.equal(allowed, true);
    assert.equal((request as Record<string, unknown>).companyId, companyId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-03: Tenant isolation — Company A ≠ Company B
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-03: Tenant isolation — Company A ≠ Company B', () => {
  it('rechaza si el usuario no tiene membresía en su propia empresa', async () => {
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role: 'admin',
          companyId: '64b0000000000000000000a1',
        }),
      }),
    } as never;
    // CompanyUser membership NOT found → rechaza
    const companyUserModel = {
      findOne: () => ({
        exec: async () => null,
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-1' },
      headers: {}, // No header → auto-derive from user.companyId
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('do not belong'),
    );
  });

  it('rechaza x-company-id header que no coincide con membresía', async () => {
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role: 'admin',
          companyId: '64b0000000000000000000a1',
        }),
      }),
    } as never;
    // User is member of Company A, but header says Company B → rechaza
    const companyUserModel = {
      findOne: () => ({
        exec: async () => null, // No membership for Company B
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-1' },
      headers: { 'x-company-id': '64b0000000000000000000b1' }, // Company B
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('do not belong'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-04: User without companyId
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-04: User sin companyId', () => {
  it('rechaza si el usuario no tiene companyId asociado', async () => {
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role: 'member',
          companyId: null, // No company associated
        }),
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => null,
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-1' },
      headers: {}, // No header, and user has no companyId
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('no associated company'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-05: Invalid x-company-id header
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-05: x-company-id inválido', () => {
  it('rechaza header con ObjectId inválido', async () => {
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role: 'admin',
          companyId: '64b0000000000000000000a1',
        }),
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => ({ companyId: '64b0000000000000000000a1' }),
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-1' },
      headers: { 'x-company-id': 'invalid-id' },
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('Invalid x-company-id header'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-06: Unregistered user
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-06: Usuario no registrado', () => {
  it('rechaza si el usuario no existe en la base de datos', async () => {
    const userModel = {
      findOne: () => ({
        exec: async () => null, // User not found
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => null,
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-unknown' },
      headers: { 'x-company-id': '64b0000000000000000000a1' },
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('not registered'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-07: Missing authenticated user
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-07: Usuario no autenticado', () => {
  it('rechaza si no hay usuario autenticado', async () => {
    const userModel = {
      findOne: () => ({
        exec: async () => null,
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => null,
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: undefined, // No authenticated user
      headers: {},
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('Missing authenticated user'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-08: request.user enriched correctly
// ═══════════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-08: request.user enrichido correctamente', () => {
  it('enriquece request.user con _id, email y role del usuario', async () => {
    const companyId = '64b0000000000000000000a1';
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-mongo-id',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role: 'manager',
          companyId,
        }),
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => ({ companyId }),
      }),
    } as never;

    const guard = new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
    const request = {
      user: { uid: 'uid-1' },
      headers: {},
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    const allowed = await guard.canActivate(context);
    assert.equal(allowed, true);

    const enrichedUser = (request as Record<string, unknown>).user as Record<string, unknown>;
    assert.equal(enrichedUser._id, 'user-mongo-id');
    assert.equal(enrichedUser.email, 'user@test.com');
    assert.equal(enrichedUser.role, 'manager');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-09: Owner (Superadmin GLOBAL) sin companyId — Fase owner
// ═══════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-09: owner global sin companyId (dashboard no explota)', () => {
  /** Guard con owner global (role=owner, companyId null/undefined). */
  function buildOwnerGuard(companyId: string | null | undefined) {
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'owner@test.com',
          role: 'owner',
          companyId,
        }),
      }),
    } as never;
    // Si se llega a consultar CompanyUser con companyId undefined, la query
    // findOne(undefined) no debe romperse; devuelve null (sin membership).
    const companyUserModel = {
      findOne: () => ({ exec: async () => null }),
    } as never;
    return new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
  }

  function buildRequest(headers: Record<string, string> = {}) {
    const request = {
      user: { uid: 'uid-1' },
      headers,
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    return { request, context };
  }

  it('Caso 1: owner + companyId null → NO lanza "User has no associated company"', async () => {
    const guard = buildOwnerGuard(null);
    const { request, context } = buildRequest();
    const allowed = await guard.canActivate(context);
    assert.equal(allowed, true);
    // Sin empresa activa: request.companyId queda indefinido (NO se inventa).
    assert.equal((request as Record<string, unknown>).companyId, undefined);
  });

  it('Caso 2: owner + companyId undefined → NO lanza el error', async () => {
    const guard = buildOwnerGuard(undefined);
    const { request, context } = buildRequest();
    const allowed = await guard.canActivate(context);
    assert.equal(allowed, true);
    assert.equal((request as Record<string, unknown>).companyId, undefined);
  });

  it('owner con header de empresa PROPIA → request.companyId = empresa', async () => {
    const guard = buildOwnerGuard(null);
    const { request, context } = buildRequest({ 'x-company-id': OWNED_COMPANY_ID });
    const allowed = await guard.canActivate(context);
    assert.equal(allowed, true);
    assert.equal(String((request as Record<string, unknown>).companyId), OWNED_COMPANY_ID);
  });

  it('owner con header de empresa ajena → rechaza (no escalar a otras empresas)', async () => {
    const guard = buildOwnerGuard(null);
    const { context } = buildRequest({ 'x-company-id': FOREIGN_COMPANY_ID });
    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('do not belong'),
    );
  });

  it('owner con header inválido → rechaza igual que cualquier rol', async () => {
    const guard = buildOwnerGuard(null);
    const { context } = buildRequest({ 'x-company-id': 'invalid-id' });
    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('Invalid x-company-id header'),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// COMPANY-ACCESS-10: admin/manager/member conservan su validación
// ═══════════════════════════════════════════════════════════════════════

describe('COMPANY-ACCESS-10: roles de empresa no cambian', () => {
  function buildGuard(role: string, userCompanyId: string | null, membershipCompanyId: string | null) {
    const userModel = {
      findOne: () => ({
        exec: async () => ({
          _id: 'user-1',
          firebaseUid: 'uid-1',
          email: 'user@test.com',
          role,
          companyId: userCompanyId,
        }),
      }),
    } as never;
    const companyUserModel = {
      findOne: () => ({
        exec: async () => (membershipCompanyId ? { companyId: membershipCompanyId } : null),
      }),
    } as never;
    return new CompanyAccessGuard(userModel, companyUserModel, companyModelStub as never);
  }

  function buildContext() {
    const request = { user: { uid: 'uid-1' }, headers: {} } as never;
    return { switchToHttp: () => ({ getRequest: () => request }) } as never;
  }

  it('Caso 4: admin + companyId ausente → conserva "User has no associated company"', async () => {
    const guard = buildGuard('admin', null, null);
    await assert.rejects(
      () => guard.canActivate(buildContext()),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('no associated company'),
    );
  });

  it('Caso 3: admin + companyId válido → funciona', async () => {
    const companyId = '64b0000000000000000000a1';
    const guard = buildGuard('admin', companyId, companyId);
    const request = { user: { uid: 'uid-1' }, headers: {} } as never;
    const allowed = await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
    assert.equal(allowed, true);
    assert.equal((request as Record<string, unknown>).companyId, companyId);
  });

  it('Caso 5: manager + companyId válido → funciona', async () => {
    const companyId = '64b0000000000000000000a1';
    const guard = buildGuard('manager', companyId, companyId);
    const request = { user: { uid: 'uid-1' }, headers: {} } as never;
    const allowed = await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
    assert.equal(allowed, true);
    assert.equal((request as Record<string, unknown>).companyId, companyId);
  });

  it('Caso 6: member + companyId válido → funciona', async () => {
    const companyId = '64b0000000000000000000a1';
    const guard = buildGuard('member', companyId, companyId);
    const request = { user: { uid: 'uid-1' }, headers: {} } as never;
    const allowed = await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
    assert.equal(allowed, true);
    assert.equal((request as Record<string, unknown>).companyId, companyId);
  });

  it('admin con membership faltante → sigue rechazando (aislamiento intacto)', async () => {
    const guard = buildGuard('admin', '64b0000000000000000000a1', null);
    await assert.rejects(
      () => guard.canActivate(buildContext()),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('do not belong'),
    );
  });
});
