import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

// AUDIT-USERS — Tests del flujo de creación de usuarios por rol.
// Reglas documentadas (NO cambiadas):
//   Owner → Admin (solo empresas propias, Company.ownerId)
//   Admin → Member / Manager (empresa DERIVADA de admin.companyId; body ignorado/rechazado)
//   Manager → ninguno. Member → ninguno.
// Protecciones que DEBEN permanecer:
//   'Admins cannot assign companyId when creating users'
//   'Admins can only create member or manager users'
//   'Admin user is not linked to the target company'

const ADMIN_COMPANY_ID = new Types.ObjectId('64b0000000000000000000a1');
const OWNED_COMPANY_ID = new Types.ObjectId('64b0000000000000000000c1');
const OTHER_OWNED_COMPANY_ID = new Types.ObjectId('64b0000000000000000000c2');
const FOREIGN_COMPANY_ID = new Types.ObjectId('64b0000000000000000000d1');
const FOREIGN_OWNER_ID = new Types.ObjectId('64b0000000000000000000f1');
const OWNER_ID = new Types.ObjectId('64b0000000000000000000e1');
const ADMIN_USER_ID = new Types.ObjectId('64b0000000000000000000e2');

type CompanyRecord = { _id: Types.ObjectId; ownerId?: Types.ObjectId };
type UserRecord = {
  _id: Types.ObjectId;
  firebaseUid: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'manager';
  companyId?: Types.ObjectId;
};
type CompanyUserRecord = { userId: Types.ObjectId; companyId: Types.ObjectId };

type UserServiceHarness = {
  service: UsersService;
  users: UserRecord[];
  companies: CompanyRecord[];
  companyUsers: CompanyUserRecord[];
  createdUsers: Array<{ firebaseUid: string; email: string; role: string; companyId: Types.ObjectId }>;
  companyUserUpserts: Array<{ companyId: Types.ObjectId; userId: Types.ObjectId }>;
  firebaseCreated: Array<{ email: string }>;
  userFindCalls: Array<{ filter: Record<string, unknown>; sort?: Record<string, number>; select?: string }>;
};

/** Última llamada find() capturada del userModel stub (array compartido por referencia). */
function lastFind(harness: UserServiceHarness) {
  return harness.userFindCalls[harness.userFindCalls.length - 1];
}

/** Evaluador de filtros mongoose usados por los métodos de listado del service. */
function matchUserFilter(user: UserRecord, filter: Record<string, unknown>): boolean {
  const roleFilter = filter.role;
  if (roleFilter !== undefined) {
    if (typeof roleFilter === 'string') {
      if (user.role !== roleFilter) {
        return false;
      }
    } else if (Array.isArray((roleFilter as { $in?: string[] }).$in)) {
      if (!(roleFilter as { $in: string[] }).$in.includes(user.role)) {
        return false;
      }
    }
  }
  const companyFilter = filter.companyId;
  if (companyFilter !== undefined) {
    const inList = (companyFilter as { $in?: unknown[] }).$in;
    if (Array.isArray(inList)) {
      if (!inList.some((id) => String(id) === String(user.companyId))) {
        return false;
      }
    } else if (String(companyFilter) !== String(user.companyId)) {
      return false;
    }
  }
  return true;
}

function buildHarness(initial: {
  users: UserRecord[];
  companies: CompanyRecord[];
  companyUsers: CompanyUserRecord[];
}): UserServiceHarness {
  const state = {
    users: initial.users,
    companies: initial.companies,
    companyUsers: initial.companyUsers,
    createdUsers: [] as Array<{ firebaseUid: string; email: string; role: string; companyId: Types.ObjectId }>,
    companyUserUpserts: [] as Array<{ companyId: Types.ObjectId; userId: Types.ObjectId }>,
    firebaseCreated: [] as Array<{ email: string }>,
    userFindCalls: [] as Array<{ filter: Record<string, unknown>; sort?: Record<string, number>; select?: string }>,
  };

  const userModel = {
    // Cadena find().sort().select().exec() (soporta también find().sort().exec())
    find: (filter: Record<string, unknown>) => {
      const chain = (sortArg?: Record<string, number>, selectArg?: string) => ({
        sort: (next: Record<string, number>) => chain(next, selectArg),
        select: (sel: string) => chain(sortArg, sel),
        exec: async () => {
          state.userFindCalls.push({ filter, sort: sortArg, select: selectArg });
          return state.users.filter((user) => matchUserFilter(user, filter));
        },
      });
      return chain();
    },
    findOne: (filter: { firebaseUid?: string; email?: string }) => ({
      exec: async () =>
        state.users.find((user) =>
          filter.firebaseUid ? user.firebaseUid === filter.firebaseUid : user.email === filter.email,
        ) ?? null,
    }),
    create: async (doc: { firebaseUid: string; email: string; role: string; companyId: Types.ObjectId }) => {
      state.createdUsers.push(doc);
      return { ...doc, _id: new Types.ObjectId() };
    },
  };

  const companyModel = {
    find: (filter: { ownerId?: unknown }) => ({
      exec: async () =>
        state.companies.filter((company) =>
          filter.ownerId ? String(company.ownerId) === String(filter.ownerId) : true,
        ),
    }),
    findOne: (filter: { _id?: unknown; ownerId?: unknown }) => ({
      exec: async () =>
        state.companies.find(
          (company) =>
            (!filter._id || String(company._id) === String(filter._id)) &&
            (!filter.ownerId || String(company.ownerId) === String(filter.ownerId)),
        ) ?? null,
    }),
  };

  const companyUserModel = {
    findOne: (filter: { userId?: unknown; companyId?: unknown }) => ({
      exec: async () =>
        state.companyUsers.find(
          (membership) =>
            String(membership.userId) === String(filter.userId) &&
            String(membership.companyId) === String(filter.companyId),
        ) ?? null,
    }),
    // El service hace: await companyUserModel.updateOne(filter, {$setOnInsert}, {upsert:true})
    updateOne: async (filter: { userId: Types.ObjectId; companyId: Types.ObjectId }) => {
      const exists = state.companyUsers.some(
        (membership) =>
          String(membership.userId) === String(filter.userId) &&
          String(membership.companyId) === String(filter.companyId),
      );
      if (!exists) {
        state.companyUsers.push({ userId: filter.userId, companyId: filter.companyId });
      }
      state.companyUserUpserts.push({ userId: filter.userId, companyId: filter.companyId });
      return {};
    },
  };

  const firebaseAdminService = {
    createUser: async (input: { email: string }) => {
      state.firebaseCreated.push({ email: input.email });
      return { uid: `fb-${state.firebaseCreated.length}` };
    },
  };

  const service = new UsersService(
    userModel as never,
    companyModel as never,
    companyUserModel as never,
    firebaseAdminService as never,
  );

  return { service, ...state };
}

function makeOwner(): UserRecord {
  return { _id: OWNER_ID, firebaseUid: 'owner-uid', email: 'owner@test.com', role: 'owner' };
}

function makeAdmin(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    _id: ADMIN_USER_ID,
    firebaseUid: 'admin-uid',
    email: 'admin@test.com',
    role: 'admin',
    companyId: ADMIN_COMPANY_ID,
    ...overrides,
  };
}

function baseCompanies(): CompanyRecord[] {
  return [
    { _id: ADMIN_COMPANY_ID, ownerId: OWNER_ID },
    { _id: OWNED_COMPANY_ID, ownerId: OWNER_ID },
    { _id: OTHER_OWNED_COMPANY_ID, ownerId: OWNER_ID },
    { _id: FOREIGN_COMPANY_ID, ownerId: FOREIGN_OWNER_ID },
  ];
}

function baseState(): { users: UserRecord[]; companies: CompanyRecord[]; companyUsers: CompanyUserRecord[] } {
  return {
    users: [makeAdmin()],
    companies: baseCompanies(),
    companyUsers: [{ userId: ADMIN_USER_ID, companyId: ADMIN_COMPANY_ID }],
  };
}

async function expectForbidden(promise: Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ForbiddenException);
    assert.equal(error.message, message);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-USERS · ADMIN', () => {
  let harness: UserServiceHarness;

  beforeEach(() => {
    harness = buildHarness(baseState());
  });

  it('1. crea manager SIN companyId usando la empresa derivada del admin', async () => {
    const dto: CreateUserDto = { email: 'manager@test.com', password: 'secret123', role: 'manager' };

    const created = await harness.service.createUserByRole('admin-uid', dto);

    assert.ok(created);
    assert.equal(harness.createdUsers.length, 1);
    assert.equal(harness.createdUsers[0].role, 'manager');
    // Empresa destino = admin.companyId (derivada del actor, no del body).
    assert.equal(String(harness.createdUsers[0].companyId), String(ADMIN_COMPANY_ID));
    assert.notEqual(String(harness.createdUsers[0].companyId), String(FOREIGN_COMPANY_ID));
    // Vinculación CompanyUser creada con el par (empresa del admin, nuevo usuario).
    assert.equal(harness.companyUserUpserts.length, 1);
    assert.equal(String(harness.companyUserUpserts[0].companyId), String(ADMIN_COMPANY_ID));
    assert.equal(harness.companyUsers.length, 2);
  });

  it('2. rechaza manager con companyId explícito (protección intacta)', async () => {
    const dto: CreateUserDto = {
      email: 'manager@test.com',
      password: 'secret123',
      role: 'manager',
      companyId: FOREIGN_COMPANY_ID.toString(),
    };

    await expectForbidden(harness.service.createUserByRole('admin-uid', dto), 'Admins cannot assign companyId when creating users');
    assert.equal(harness.createdUsers.length, 0);
    assert.equal(harness.firebaseCreated.length, 0);
  });

  it('3. rechaza crear rol admin', async () => {
    const dto: CreateUserDto = { email: 'x@test.com', password: 'secret123', role: 'admin' };

    await expectForbidden(harness.service.createUserByRole('admin-uid', dto), 'Admins can only create member or manager users');
    assert.equal(harness.createdUsers.length, 0);
  });

  it('4. rechaza cuando el admin no tiene membership CompanyUser', async () => {
    harness = buildHarness({ users: [makeAdmin()], companies: baseCompanies(), companyUsers: [] });

    const dto: CreateUserDto = { email: 'manager@test.com', password: 'secret123', role: 'manager' };

    await expectForbidden(harness.service.createUserByRole('admin-uid', dto), 'Admin user is not linked to the target company');
    assert.equal(harness.createdUsers.length, 0);
  });

  it('4b. rechaza cuando el usuario solicitante no existe en MongoDB', async () => {
    const dto: CreateUserDto = { email: 'manager@test.com', password: 'secret123', role: 'manager' };

    await assert.rejects(
      () => harness.service.createUserByRole('ghost-uid', dto),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        assert.equal(error.message, 'Requesting user with firebase uid ghost-uid not found');
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OWNER
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-USERS · OWNER', () => {
  it('5. crea admin en empresa propia (POST /users, createUserByRole)', async () => {
    const harness = buildHarness({
      users: [makeOwner(), makeAdmin()],
      companies: baseCompanies(),
      companyUsers: [],
    });

    const dto: CreateUserDto = {
      email: 'new-admin@test.com',
      password: 'secret123',
      role: 'admin',
      companyId: OWNED_COMPANY_ID.toString(),
    };

    const created = await harness.service.createUserByRole('owner-uid', dto);

    assert.ok(created);
    assert.equal(harness.createdUsers[0].role, 'admin');
    assert.equal(String(harness.createdUsers[0].companyId), String(OWNED_COMPANY_ID));
    assert.equal(harness.companyUserUpserts.length, 1);
    assert.equal(String(harness.companyUserUpserts[0].companyId), String(OWNED_COMPANY_ID));
  });

  it('6. rechaza empresa que NO le pertenece (consulta con ownerId)', async () => {
    const harness = buildHarness({
      users: [makeOwner(), makeAdmin()],
      companies: baseCompanies(),
      companyUsers: [],
    });

    const dto: CreateUserDto = {
      email: 'new-admin@test.com',
      password: 'secret123',
      role: 'admin',
      companyId: FOREIGN_COMPANY_ID.toString(),
    };

    await assert.rejects(
      () => harness.service.createUserByRole('owner-uid', dto),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        assert.equal(error.message, `Company with id ${FOREIGN_COMPANY_ID.toString()} not found`);
        return true;
      },
    );
    assert.equal(harness.createdUsers.length, 0);
    assert.equal(harness.firebaseCreated.length, 0);
  });

  it('6b. POST /users/admins: crea admin en empresa propia', async () => {
    const harness = buildHarness({ users: [makeOwner()], companies: baseCompanies(), companyUsers: [] });

    const dto: CreateUserDto = {
      email: 'new-admin@test.com',
      password: 'secret123',
      role: 'admin',
      companyId: OTHER_OWNED_COMPANY_ID.toString(),
    };

    const created = await harness.service.createUserForOwner('owner-uid', 'admin', dto);

    assert.ok(created);
    assert.equal(String(harness.createdUsers[0].companyId), String(OTHER_OWNED_COMPANY_ID));
  });

  it('6c. POST /users/admins: rechaza empresa ajena ("not found for owner")', async () => {
    const harness = buildHarness({ users: [makeOwner()], companies: baseCompanies(), companyUsers: [] });

    const dto: CreateUserDto = {
      email: 'new-admin@test.com',
      password: 'secret123',
      role: 'admin',
      companyId: FOREIGN_COMPANY_ID.toString(),
    };

    await assert.rejects(
      () => harness.service.createUserForOwner('owner-uid', 'admin', dto),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundException);
        assert.equal(error.message, `Company with id ${FOREIGN_COMPANY_ID.toString()} not found for owner`);
        return true;
      },
    );
    assert.equal(harness.createdUsers.length, 0);
  });

  it('6d. owner no puede crear manager (regla actual NO cambiada)', async () => {
    const harness = buildHarness({
      users: [makeOwner(), makeAdmin()],
      companies: baseCompanies(),
      companyUsers: [],
    });

    const dto: CreateUserDto = {
      email: 'manager@test.com',
      password: 'secret123',
      role: 'manager',
      companyId: OWNED_COMPANY_ID.toString(),
    };

    await expectForbidden(harness.service.createUserByRole('owner-uid', dto), 'Owners can only create admin users');
    assert.equal(harness.createdUsers.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO REGRESIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-USERS · NO REGRESIÓN', () => {
  it('7. manager no puede crear usuarios', async () => {
    const manager: UserRecord = {
      _id: new Types.ObjectId(),
      firebaseUid: 'manager-uid',
      email: 'manager-actor@test.com',
      role: 'manager',
      companyId: ADMIN_COMPANY_ID,
    };
    const harness = buildHarness({ users: [manager], companies: baseCompanies(), companyUsers: [] });

    const dto: CreateUserDto = { email: 'x@test.com', password: 'secret123', role: 'member' };

    await expectForbidden(
      harness.service.createUserByRole('manager-uid', dto),
      'Members and managers are not allowed to create users',
    );
    assert.equal(harness.createdUsers.length, 0);
  });

  it('8. member no puede crear usuarios', async () => {
    const member: UserRecord = {
      _id: new Types.ObjectId(),
      firebaseUid: 'member-uid',
      email: 'member-actor@test.com',
      role: 'member',
      companyId: ADMIN_COMPANY_ID,
    };
    const harness = buildHarness({ users: [member], companies: baseCompanies(), companyUsers: [] });

    const dto: CreateUserDto = { email: 'x@test.com', password: 'secret123', role: 'member' };

    await expectForbidden(
      harness.service.createUserByRole('member-uid', dto),
      'Members and managers are not allowed to create users',
    );
    assert.equal(harness.createdUsers.length, 0);
  });

  it('9. companyId inválido (no MongoId) → 400 por validación de DTO', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');

    const dto = plainToInstance(CreateUserDto, {
      email: 'manager@test.com',
      password: 'secret123',
      role: 'manager',
      companyId: 'not-an-objectid',
    });

    const errors = await validate(dto);
    const companyIdError = errors.find((e) => e.property === 'companyId');

    assert.ok(companyIdError, 'companyId debe fallar IsMongoId');
    assert.equal(companyIdError.constraints?.isMongoId, 'companyId must be a mongodb id');
  });

  it('10. email duplicado conserva comportamiento (400)', async () => {
    const harness = buildHarness(baseState());

    const dto: CreateUserDto = { email: 'admin@test.com', password: 'secret123', role: 'manager' };

    await assert.rejects(
      () => harness.service.createUserByRole('admin-uid', dto),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.equal(error.message, 'A user with this email already exists in MongoDB');
        return true;
      },
    );
    assert.equal(harness.firebaseCreated.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// AUDIT-USERS-LIST — GET /users/company (listado "Usuarios de mi empresa")
// ═════════════════════════════════════════════════════════════════════════

const MEMBER_A1_ID = new Types.ObjectId('64b0000000000000000000b1');
const MANAGER_A1_ID = new Types.ObjectId('64b0000000000000000000b2');
const MEMBER_B1_ID = new Types.ObjectId('64b0000000000000000000b3');

function listState(): { users: UserRecord[]; companies: CompanyRecord[]; companyUsers: CompanyUserRecord[] } {
  return {
    users: [
      makeAdmin(), // admin actor (role 'admin' en Empresa A: NO debe aparecer)
      { _id: MEMBER_A1_ID, firebaseUid: 'fb-ma1', email: 'member-a1@test.com', role: 'member', companyId: ADMIN_COMPANY_ID },
      { _id: MANAGER_A1_ID, firebaseUid: 'fb-mg1', email: 'manager-a1@test.com', role: 'manager', companyId: ADMIN_COMPANY_ID },
      { _id: MEMBER_B1_ID, firebaseUid: 'fb-mb1', email: 'member-b1@test.com', role: 'member', companyId: FOREIGN_COMPANY_ID },
      { _id: new Types.ObjectId('64b0000000000000000000b4'), firebaseUid: 'fb-mgb1', email: 'manager-b1@test.com', role: 'manager', companyId: FOREIGN_COMPANY_ID },
      { _id: OWNER_ID, firebaseUid: 'owner-uid', email: 'owner@test.com', role: 'owner' },
    ],
    companies: baseCompanies(),
    companyUsers: baseState().companyUsers,
  };
}

describe('AUDIT-USERS-LIST · listCompanyUsersForAdmin', () => {
  it('1. devuelve member+manager de la empresa del contexto con filtro y orden correctos', async () => {
    const harness = buildHarness(listState());

    const result = await harness.service.listCompanyUsersForAdmin('admin-uid', ADMIN_COMPANY_ID);

    assert.deepEqual(
      result.map((user) => String(user.email)).sort(),
      ['manager-a1@test.com', 'member-a1@test.com'],
    );
    // Filtro equivalente a { companyId: 'A', role: { $in: ['member','manager'] } }
    assert.equal(String(lastFind(harness).filter.companyId), String(ADMIN_COMPANY_ID));
    const roleFilter = lastFind(harness).filter.role as { $in: string[] };
    assert.deepEqual(roleFilter.$in, ['member', 'manager']);
    // Orden { createdAt: -1 }
    assert.deepEqual(lastFind(harness).sort, { createdAt: -1 });
    // Proyección sin firebaseUid (no va a la UI)
    assert.ok(!lastFind(harness).select?.includes('firebaseUid'));
  });

  it('2. usuarios de Empresa B NO aparecen cuando el contexto es Empresa A', async () => {
    const harness = buildHarness(listState());

    const result = await harness.service.listCompanyUsersForAdmin('admin-uid', ADMIN_COMPANY_ID);

    const emails = result.map((user) => String(user.email));
    assert.ok(!emails.includes('member-b1@test.com'));
    assert.ok(!emails.includes('manager-b1@test.com'));
  });

  it('3. el manager de la empresa aparece', async () => {
    const harness = buildHarness(listState());

    const result = await harness.service.listCompanyUsersForAdmin('admin-uid', ADMIN_COMPANY_ID);

    assert.ok(result.some((user) => String(user.email) === 'manager-a1@test.com'));
  });

  it('4. el member de la empresa aparece', async () => {
    const harness = buildHarness(listState());

    const result = await harness.service.listCompanyUsersForAdmin('admin-uid', ADMIN_COMPANY_ID);

    assert.ok(result.some((user) => String(user.email) === 'member-a1@test.com'));
  });

  it('5. roles admin/owner no aparecen en el listado', async () => {
    const harness = buildHarness(listState());

    const result = await harness.service.listCompanyUsersForAdmin('admin-uid', ADMIN_COMPANY_ID);

    const roles = result.map((user) => String(user.role));
    assert.ok(!roles.includes('admin'));
    assert.ok(!roles.includes('owner'));
  });

  it('6. NO REGRESIÓN: listMembersForManager sigue devolviendo SOLO members', async () => {
    const harness = buildHarness(listState());

    const result = await harness.service.listMembersForManager('admin-uid', ADMIN_COMPANY_ID);

    const emails = result.map((user) => String(user.email));
    assert.deepEqual(emails, ['member-a1@test.com']);
    assert.equal(lastFind(harness).filter.role, 'member');
    assert.equal(String(lastFind(harness).filter.companyId), String(ADMIN_COMPANY_ID));
  });

  it('6b. NO REGRESIÓN: listUsersByRoleForOwner solo ve admins de sus empresas', async () => {
    const harness = buildHarness(listState());

    const result = await harness.service.listUsersByRoleForOwner('owner-uid', 'admin');

    // El owner posee ADMIN_COMPANY_ID, OWNED_COMPANY_ID y OTHER_OWNED_COMPANY_ID;
    // el admin de la Empresa A está en su universo. Nadie de Empresa B aparece.
    assert.deepEqual(result.map((user) => String(user.email)), ['admin@test.com']);
    const companyFilter = lastFind(harness).filter.companyId as { $in: string[] };
    assert.deepEqual(
      companyFilter.$in.map((id) => String(id)).sort(),
      [String(ADMIN_COMPANY_ID), String(OWNED_COMPANY_ID), String(OTHER_OWNED_COMPANY_ID)].sort(),
    );
  });
});
