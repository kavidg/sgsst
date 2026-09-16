import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../questions/roles.guard';
import { ROLES_KEY } from '../questions/roles.decorator';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { WorkplaceSanitaryConditionsController } from './workplace-sanitary-conditions.controller';
import { WorkplaceSanitaryConditionsService } from './workplace-sanitary-conditions.service';

/**
 * FASE 34B — Tests de seguridad del controller 3.1.8 (SEC-001..008).
 *
 * Patrón 3.1.6 (work-restriction.controller.spec.ts): controller con
 * dependencias mockeadas + GUARDS REALES (FirebaseAuthGuard + RolesGuard) con
 * sus dependencias internas mockeadas.
 *
 * Matriz de roles 3.1.8:
 *   WRITE  (create/update/deactivate) → owner, admin
 *   READ   (findAll/findOne)          → owner, admin, manager
 */

const companyIdA = new Types.ObjectId('507f1f77bcf86cd799439011');
const companyIdB = new Types.ObjectId('507f1f77bcf86cd799439099');

type Role = 'owner' | 'admin' | 'manager' | 'member';

function buildRequest(uid: string | null): RequestWithUser {
  return {
    headers: uid ? { authorization: `Bearer token-${uid}` } : {},
    ...(uid ? { user: { uid } } : {}),
  } as unknown as RequestWithUser;
}

function buildExecutionContext(request: RequestWithUser): {
  switchToHttp: () => { getRequest: () => RequestWithUser };
  getHandler: () => symbol;
  getClass: () => symbol;
} {
  const handler = Symbol('handler');
  const cls = Symbol('class');
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => cls,
  };
}

describe('WorkplaceSanitaryConditionsController — seguridad 3.1.8 (FASE 34B)', () => {
  let controller: WorkplaceSanitaryConditionsController;
  let firebaseAuthGuard: FirebaseAuthGuard;
  let firebaseFail: boolean;
  let registeredUsers: Map<string, { role: Role; companyId: Types.ObjectId }>;
  let receivedCompanyIds: string[];
  let serviceCalls: string[];

  beforeEach(async () => {
    firebaseFail = false;
    receivedCompanyIds = [];
    serviceCalls = [];
    registeredUsers = new Map<string, { role: Role; companyId: Types.ObjectId }>();
    registeredUsers.set('uid-owner', { role: 'owner', companyId: companyIdA });
    registeredUsers.set('uid-admin', { role: 'admin', companyId: companyIdA });
    registeredUsers.set('uid-manager', { role: 'manager', companyId: companyIdA });
    registeredUsers.set('uid-member', { role: 'member', companyId: companyIdA });
    registeredUsers.set('uid-owner-b', { role: 'owner', companyId: companyIdB });

    const usersService = {
      findByFirebaseUid: async (uid: string) => {
        const found = registeredUsers.get(uid);
        return found
          ? ({ _id: new Types.ObjectId(), firebaseUid: uid, ...found } as unknown as UserDocument)
          : null;
      },
    } as unknown as UsersService;

    const sanitaryService = {
      create: async (companyId: Types.ObjectId | string) => {
        serviceCalls.push('create');
        receivedCompanyIds.push(String(companyId));
        return { _id: new Types.ObjectId(), companyId };
      },
      findAll: async (companyId: Types.ObjectId | string) => {
        serviceCalls.push('findAll');
        receivedCompanyIds.push(String(companyId));
        return [];
      },
      findOne: async (companyId: Types.ObjectId | string) => {
        serviceCalls.push('findOne');
        receivedCompanyIds.push(String(companyId));
        return null;
      },
      update: async (companyId: Types.ObjectId | string) => {
        serviceCalls.push('update');
        receivedCompanyIds.push(String(companyId));
        return { _id: new Types.ObjectId(), companyId };
      },
      deactivate: async (companyId: Types.ObjectId | string) => {
        serviceCalls.push('deactivate');
        receivedCompanyIds.push(String(companyId));
        return { _id: new Types.ObjectId(), companyId };
      },
    };

    const firebaseAdminService = {
      verifyIdToken: async (token: string) => {
        if (firebaseFail) {
          throw new Error('token malformed');
        }
        return { uid: token.replace('token-', '') };
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkplaceSanitaryConditionsController],
      providers: [
        { provide: WorkplaceSanitaryConditionsService, useValue: sanitaryService },
        { provide: UsersService, useValue: usersService },
        { provide: FirebaseAdminService, useValue: firebaseAdminService },
        { provide: getModelToken(User.name), useValue: {} },
        Reflector,
        FirebaseAuthGuard,
      ],
    }).compile();

    controller = module.get(WorkplaceSanitaryConditionsController);
    firebaseAuthGuard = module.get(FirebaseAuthGuard);
  });

  async function withAuth<T>(request: RequestWithUser, handler: () => Promise<T>): Promise<T> {
    await firebaseAuthGuard.canActivate(buildExecutionContext(request) as never);
    return handler();
  }

  function buildRolesGuard(requiredRoles: string[]): RolesGuard {
    const reflector = {
      getAllAndOverride: (key: string, _targets: unknown[]) =>
        key === ROLES_KEY ? requiredRoles : undefined,
    } as unknown as Reflector;
    const userModel = {
      findOne: (_filter: { firebaseUid: string }) => ({
        lean: () => ({
          exec: async () => {
            const found = registeredUsers.get(_filter.firebaseUid);
            return found ? { role: found.role } : null;
          },
        }),
        exec: async () => {
          const found = registeredUsers.get(_filter.firebaseUid);
          return found ? { role: found.role } : null;
        },
      }),
    };
    return new RolesGuard(reflector, userModel as never);
  }

  async function withRoles<T>(
    requiredRoles: string[],
    request: RequestWithUser,
    handler: () => Promise<T>,
  ): Promise<T> {
    const guard = buildRolesGuard(requiredRoles);
    await guard.canActivate(buildExecutionContext(request) as never);
    return handler();
  }

  // ─────────────────────────────────────────────────────────────────────────
  it('SEC-001: sin autenticación → rechazado por FirebaseAuthGuard', async () => {
    await assert.rejects(
      () =>
        firebaseAuthGuard.canActivate(
          buildExecutionContext(buildRequest(null)) as never,
        ),
      (err: Error) => {
        assert.match(err.message, /Missing Authorization header|Unauthorized/);
        return true;
      },
    );
  });

  it('SEC-001b: token Firebase inválido → rechazado', async () => {
    firebaseFail = true;
    await assert.rejects(
      () =>
        firebaseAuthGuard.canActivate(
          buildExecutionContext(buildRequest('uid-owner')) as never,
        ),
      (err: Error) => {
        assert.match(err.message, /Invalid Firebase token|Unauthorized/);
        return true;
      },
    );
  });

  it('SEC-002: manager WRITE → rechazado por RolesGuard en los 3 endpoints de escritura', async () => {
    const request = buildRequest('uid-manager');
    for (const required of [['owner', 'admin'], ['owner', 'admin'], ['owner', 'admin']]) {
      await assert.rejects(
        () => withRoles(required, request, async () => undefined),
        /Insufficient role permissions|Forbidden/,
      );
    }
    assert.deepEqual(serviceCalls, []);
  });

  it('SEC-002b: member WRITE → rechazado', async () => {
    const request = buildRequest('uid-member');
    await assert.rejects(
      () => withRoles(['owner', 'admin'], request, async () => undefined),
      /Insufficient role permissions|Forbidden/,
    );
  });

  it('SEC-003: owner WRITE → permitido, companyId resuelto server-side', async () => {
    const request = buildRequest('uid-owner');
    const dto = {
      conditionType: 'POTABLE_WATER',
      code: 'AGUA-001',
      description: 'Verificación de potabilidad',
      location: 'Sede principal',
      lastVerificationDate: '2026-08-01T00:00:00.000Z',
      responsible: 'Coordinadora SST',
    };

    await withRoles(['owner', 'admin'], request, () =>
      (
        controller as unknown as {
          create: (req: RequestWithUser, dto: unknown) => Promise<unknown>;
        }
      ).create(request, dto),
    );

    assert.deepEqual(serviceCalls, ['create']);
    assert.equal(receivedCompanyIds[0], companyIdA.toHexString());
  });

  it('SEC-003b: admin WRITE → permitido', async () => {
    const request = buildRequest('uid-admin');
    await withRoles(['owner', 'admin'], request, async () => undefined);
    // (guard pasa sin error)
  });

  it('SEC-004: manager READ → permitido y scoped a su tenant', async () => {
    const request = buildRequest('uid-manager');

    await withRoles(['owner', 'admin', 'manager'], request, () =>
      controller.findAll(request),
    );

    assert.deepEqual(serviceCalls, ['findAll']);
    assert.equal(receivedCompanyIds[0], companyIdA.toHexString());
  });

  it('SEC-005: usuario de empresa B lee → el service recibe B, nunca A', async () => {
    const request = buildRequest('uid-owner-b');

    await withRoles(['owner', 'admin', 'manager'], request, () =>
      controller.findAll(request),
    );

    assert.equal(receivedCompanyIds[0], companyIdB.toHexString());
    assert.notEqual(receivedCompanyIds[0], companyIdA.toHexString());
  });

  it('SEC-006: companyId spoofing en body → ignorado (tenant del token)', async () => {
    const request = buildRequest('uid-owner');
    const dto = { companyId: companyIdB.toHexString() } as Record<string, unknown>;

    await withAuth(request, () =>
      (
        controller as unknown as {
          create: (req: RequestWithUser, dto: unknown) => Promise<unknown>;
        }
      ).create(request, dto),
    );

    assert.equal(receivedCompanyIds[0], companyIdA.toHexString());
    assert.notEqual(receivedCompanyIds[0], companyIdB.toHexString());
  });

  it('SEC-007: token válido sin registro en BD → rechazado', async () => {
    const request = buildRequest('uid-fantasma');
    await assert.rejects(
      () => withAuth(request, () => controller.findAll(request)),
      (err: Error) => {
        assert.match(err.message, /not registered|Forbidden/);
        return true;
      },
    );
    assert.deepEqual(serviceCalls, []);
  });

  it('SEC-008: update/deactivate también reciben el companyId del token (server-side)', async () => {
    const request = buildRequest('uid-owner');
    const id = new Types.ObjectId().toHexString();

    await withRoles(['owner', 'admin'], request, () =>
      (
        controller as unknown as {
          update: (req: RequestWithUser, id: string, dto: unknown) => Promise<unknown>;
        }
      ).update(request, id, {}),
    );
    await withRoles(['owner', 'admin'], request, () =>
      (
        controller as unknown as {
          deactivate: (req: RequestWithUser, id: string) => Promise<unknown>;
        }
      ).deactivate(request, id),
    );

    assert.deepEqual(serviceCalls, ['update', 'deactivate']);
    assert.equal(receivedCompanyIds[0], companyIdA.toHexString());
    assert.equal(receivedCompanyIds[1], companyIdA.toHexString());
  });
});
