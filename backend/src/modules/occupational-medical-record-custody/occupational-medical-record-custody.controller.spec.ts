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
import { OccupationalMedicalRecordCustodyController } from './occupational-medical-record-custody.controller';
import { OccupationalMedicalRecordCustodyService } from './occupational-medical-record-custody.service';

/**
 * FASE 30G — Tests de seguridad del controller 3.1.5 (SECURITY-001..006).
 *
 * Patrón del proyecto (ver templates.controller.spec.ts): el controller se
 * instancia con dependencias mockeadas y los GUARDS REALES (FirebaseAuthGuard
 * + RolesGuard) con sus dependencias internas mockeadas, de modo que se
 * ejercita exactamente la misma cadena de autorización que en producción:
 *
 *   FirebaseAuthGuard (token Firebase)
 *   → RolesGuard (rol REAL del usuario en BD vs @Roles del endpoint)
 *   → resolveCompanyId (UsersService.findByFirebaseUid → user.companyId)
 *
 * Matriz de roles 3.1.5:
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

/**
 * ExecutionContext mínimo para los guards reales: expone el request HTTP y
 * los targets (handler/clase) que RolesGuard usa vía Reflector.
 */
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

describe('OccupationalMedicalRecordCustodyController — seguridad 3.1.5 (FASE 30G)', () => {
  let controller: OccupationalMedicalRecordCustodyController;
  let firebaseAuthGuard: FirebaseAuthGuard;
  let firebaseAdminService: { verifyIdToken: (token: string) => Promise<{ uid: string }> };
  let firebaseFail: boolean;
  /** Usuarios registrados en BD por firebaseUid (rol real del usuario). */
  let registeredUsers: Map<string, { role: Role; companyId: Types.ObjectId }>;
  /** companyId que recibió el service en cada llamada (orden de invocación). */
  let receivedCompanyIds: string[];
  let custodyService: {
    create: (companyId: Types.ObjectId | string, dto?: unknown, actorUid?: string) => Promise<unknown>;
    findAll: (companyId: Types.ObjectId | string, options?: unknown) => Promise<unknown[]>;
    findOne: (companyId: Types.ObjectId | string, id: string) => Promise<unknown>;
    update: (companyId: Types.ObjectId | string, id: string, dto?: unknown, actorUid?: string) => Promise<unknown>;
    deactivate: (companyId: Types.ObjectId | string, id: string, actorUid?: string) => Promise<unknown>;
  };
  let custodyCalls: string[];

  beforeEach(async () => {
    firebaseFail = false;
    receivedCompanyIds = [];
    custodyCalls = [];
    registeredUsers = new Map<string, { role: Role; companyId: Types.ObjectId }>();
    registeredUsers.set('uid-owner', { role: 'owner', companyId: companyIdA });
    registeredUsers.set('uid-admin', { role: 'admin', companyId: companyIdA });
    registeredUsers.set('uid-manager', { role: 'manager', companyId: companyIdA });
    // Usuario de la empresa B (cross-tenant).
    registeredUsers.set('uid-owner-b', { role: 'owner', companyId: companyIdB });

    const usersService = {
      findByFirebaseUid: async (uid: string) => {
        const found = registeredUsers.get(uid);
        return found
          ? ({ _id: new Types.ObjectId(), firebaseUid: uid, ...found } as unknown as UserDocument)
          : null;
      },
    } as unknown as UsersService;

    custodyService = {
      create: async (companyId: Types.ObjectId | string) => {
        custodyCalls.push('create');
        receivedCompanyIds.push(String(companyId));
        return { _id: new Types.ObjectId(), companyId };
      },
      findAll: async (companyId: Types.ObjectId | string) => {
        custodyCalls.push('findAll');
        receivedCompanyIds.push(String(companyId));
        return [];
      },
      findOne: async (companyId: Types.ObjectId | string) => {
        custodyCalls.push('findOne');
        receivedCompanyIds.push(String(companyId));
        return null;
      },
      update: async (companyId: Types.ObjectId | string) => {
        custodyCalls.push('update');
        receivedCompanyIds.push(String(companyId));
        return null;
      },
      deactivate: async (companyId: Types.ObjectId | string) => {
        custodyCalls.push('deactivate');
        receivedCompanyIds.push(String(companyId));
        return null;
      },
    };

    firebaseAdminService = {
      verifyIdToken: async (token: string) => {
        if (firebaseFail) {
          throw new Error('token malformed');
        }
        return { uid: token.replace('token-', '') };
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OccupationalMedicalRecordCustodyController],
      providers: [
        { provide: OccupationalMedicalRecordCustodyService, useValue: custodyService },
        { provide: UsersService, useValue: usersService },
        { provide: FirebaseAdminService, useValue: firebaseAdminService },
        { provide: getModelToken(User.name), useValue: {} },
        Reflector,
        FirebaseAuthGuard,
      ],
    }).compile();

    controller = module.get(OccupationalMedicalRecordCustodyController);
    firebaseAuthGuard = module.get(FirebaseAuthGuard);
  });

  /**
   * Helper: ejecuta el FirebaseAuthGuard REAL (como haría Nest antes del
   * handler) y luego el handler del controller.
   */
  async function withAuth<T>(
    request: RequestWithUser,
    handler: () => Promise<T>,
  ): Promise<T> {
    await firebaseAuthGuard.canActivate(
      buildExecutionContext(request) as never,
    );
    return handler();
  }

  /**
   * Helper: construye un RolesGuard REAL con la metadata @Roles indicada
   * (reproduce lo que Nest leería del handler) y un modelo User mockeado
   * que devuelve el rol registrado en BD para el firebaseUid del request.
   */
  function buildRolesGuard(requiredRoles: string[]): RolesGuard {
    const reflector = {
      getAllAndOverride: (key: string, _targets: unknown[]) =>
        key === ROLES_KEY ? requiredRoles : undefined,
    } as unknown as Reflector;
    // RolesGuard real usa: userModel.findOne({ firebaseUid }, { role: 1 }).lean().exec()
    // → el mock debe ser una cadena SÍNCRONA de builders con exec() async final.
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

  /** Ejecuta RolesGuard real + handler; replica el orden de guards de Nest. */
  async function withRoles<T>(
    requiredRoles: string[],
    request: RequestWithUser,
    handler: () => Promise<T>,
  ): Promise<T> {
    const guard = buildRolesGuard(requiredRoles);
    await guard.canActivate(buildExecutionContext(request) as never);
    return handler();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY-001: usuario no autenticado → rechazado
  // ───────────────────────────────────────────────────────────────────────────
  it('SECURITY-001: sin token de autenticación la petición es rechazada por FirebaseAuthGuard', async () => {
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

  it('SECURITY-001b: token Firebase inválido es rechazado por FirebaseAuthGuard', async () => {
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

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY-002: rol sin permisos de escritura → rechazado (RolesGuard real)
  // ───────────────────────────────────────────────────────────────────────────
  it('SECURITY-002: manager es rechazado por RolesGuard en endpoint de escritura (@Roles owner/admin)', async () => {
    const request = buildRequest('uid-manager');

    await assert.rejects(
      () =>
        withRoles(['owner', 'admin'], request, async () => undefined),
      (err: Error) => {
        assert.match(err.message, /Insufficient role permissions|Forbidden/);
        return true;
      },
    );
  });

  it('SECURITY-002b: member también es rechazado en endpoint de escritura', async () => {
    registeredUsers.set('uid-member', { role: 'member', companyId: companyIdA });
    const request = buildRequest('uid-member');

    await assert.rejects(
      () => withRoles(['owner', 'admin'], request, async () => undefined),
      /Insufficient role permissions|Forbidden/,
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY-003: manager puede consultar información permitida
  // ───────────────────────────────────────────────────────────────────────────
  it('SECURITY-003: manager pasa RolesGuard (read) y el listado queda scoped a su tenant', async () => {
    const request = buildRequest('uid-manager');

    const result = await withRoles(['owner', 'admin', 'manager'], request, () =>
      controller.findAll(request),
    );

    assert.ok(result);
    assert.deepEqual(custodyCalls, ['findAll']);
    assert.equal(receivedCompanyIds.length, 1);
    assert.equal(receivedCompanyIds[0], companyIdA.toHexString());
  });

  it('SECURITY-003b: manager puede consultar un registro por ID (read, scoped a su tenant)', async () => {
    const request = buildRequest('uid-manager');

    await withRoles(['owner', 'admin', 'manager'], request, () =>
      controller.findOne(request, new Types.ObjectId().toHexString()),
    );

    assert.equal(receivedCompanyIds[0], companyIdA.toHexString());
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY-004: manager NO puede crear/editar/desactivar (RolesGuard real)
  // ───────────────────────────────────────────────────────────────────────────
  it('SECURITY-004: manager no puede crear, editar ni desactivar (los 3 endpoints WRITE)', async () => {
    const request = buildRequest('uid-manager');

    for (const required of [
      ['owner', 'admin'], // POST
      ['owner', 'admin'], // PATCH :id
      ['owner', 'admin'], // PATCH :id/deactivate
    ]) {
      await assert.rejects(
        () => withRoles(required, request, async () => undefined),
        /Insufficient role permissions|Forbidden/,
        `RolesGuard debió rechazar al manager con @Roles(${required.join(', ')})`,
      );
    }
    // Ningún handler de escritura debió ejecutarse.
    assert.deepEqual(custodyCalls, []);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY-005: usuario de empresa A NO puede consultar registros de empresa B
  // ───────────────────────────────────────────────────────────────────────────
  it('SECURITY-005: el scoping de lectura siempre usa el companyId del usuario autenticado', async () => {
    // El dueño de la empresa B consulta: el service debe recibir B, no A.
    const request = buildRequest('uid-owner-b');

    await withRoles(['owner', 'admin', 'manager'], request, () =>
      controller.findAll(request),
    );

    assert.equal(receivedCompanyIds.length, 1);
    assert.equal(receivedCompanyIds[0], companyIdB.toHexString());
    assert.notEqual(receivedCompanyIds[0], companyIdA.toHexString());
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY-006: companyId de URL/body no puede usarse para escapar del tenant
  // ───────────────────────────────────────────────────────────────────────────
  it('SECURITY-006: un body con companyId foráneo NO cambia el tenant del create', async () => {
    // El dueño de A intenta crear con un companyId de B inyectado en el DTO.
    const request = buildRequest('uid-owner');
    const dto = { companyId: companyIdB.toHexString() } as Record<string, unknown>;

    await withAuth(request, () =>
      (
        controller as unknown as {
          create: (req: RequestWithUser, dto: unknown) => Promise<unknown>;
        }
      ).create(request, dto),
    );

    assert.equal(receivedCompanyIds.length, 1);
    assert.equal(receivedCompanyIds[0], companyIdA.toHexString());
    assert.notEqual(receivedCompanyIds[0], companyIdB.toHexString());
  });

  it('SECURITY-006b: usuario con token válido pero sin registro en BD es rechazado', async () => {
    const request = buildRequest('uid-fantasma');
    await assert.rejects(
      () => withAuth(request, () => controller.findAll(request)),
      (err: Error) => {
        assert.match(err.message, /not registered|Forbidden/);
        return true;
      },
    );
    assert.deepEqual(custodyCalls, []);
  });
});
