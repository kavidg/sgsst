import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import 'reflect-metadata';
import { Types, Model } from 'mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { CopasstAuditPlanningService, PlanningActor } from './copasst-audit-planning.service';
import { CopasstAuditPlanningController } from './copasst-audit-planning.controller';
import {
  CopasstAuditPlanning,
  CopasstAuditPlanningDocument,
  CopasstAuditPlanningStatus,
  PlannedAuditItemStatus,
} from './schemas/copasst-audit-planning.schema';
import {
  CopasstAuditPlanningHistory,
  CopasstAuditPlanningHistoryDocument,
} from './schemas/copasst-audit-planning-history.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  CreateCopasstAuditPlanningDto,
  CreatePlannedAuditDto,
  UpdateCopasstAuditPlanningDto,
} from './dto/copasst-audit-planning.dto';

/**
 * E1 (6.1.4) — Tests del dominio copasst-audit-planning.
 *
 * Cobertura: CRUD + estados + items, historial append-only, referencias
 * declarativas tenant-safe (CopasstPeriod / AnnualAudit / usuarios), roles
 * (guard REAL) y aislamiento multi-tenant (404 cross-tenant, igual que el
 * dominio real). SIN SCORING por diseño (frontera 6.1.4 ↔ 6.1.2).
 *
 * Estilo: node:test + fakes manuales (patrón annual-audit.spec.ts).
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();
const USER_A = new Types.ObjectId();

const actor: PlanningActor = { userId: USER_A, userEmail: 'actor@test.com' };

const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-12-31';

function buildPlanningDoc(overrides: Partial<CopasstAuditPlanning> = {}): CopasstAuditPlanning {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    title: 'Planificación de auditorías COPASST 2026',
    startDate: new Date(PERIOD_START),
    endDate: new Date(PERIOD_END),
    status: CopasstAuditPlanningStatus.DRAFT,
    items: [],
    ...overrides,
  } as CopasstAuditPlanning;
}

function buildItemDoc(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(),
    title: 'Auditoría planificada Q1',
    objective: 'Verificar plan anual',
    status: PlannedAuditItemStatus.PLANNED,
    copasstParticipation: { required: true, participated: false, participants: [] },
    ...overrides,
  };
}

function buildFakeModel(initialDocs: CopasstAuditPlanning[] = []) {
  const docs: Map<string, CopasstAuditPlanning> = new Map();
  for (const d of initialDocs) {
    docs.set(String(d._id), d);
  }

  // save() persistente para emular Mongoose (los cambios quedan).
  const withSave = (doc: CopasstAuditPlanning) => {
    (doc as unknown as { save: () => Promise<CopasstAuditPlanning> }).save = async () => {
      docs.set(String(doc._id), doc);
      return doc;
    };
    return doc;
  };

  const model = {
    async create(payload: Record<string, unknown>) {
      const doc = buildPlanningDoc(payload as Partial<CopasstAuditPlanning>);
      doc._id = new Types.ObjectId();
      // Simular el índice único {companyId, planningCode}.
      for (const existing of docs.values()) {
        if (
          String(existing.companyId) === String(doc.companyId) &&
          doc.planningCode &&
          existing.planningCode === doc.planningCode
        ) {
          const dupErr = { code: 11000 };
          throw dupErr;
        }
      }
      docs.set(String(doc._id), doc);
      return withSave(doc);
    },
    find(query: Record<string, unknown>) {
      const filtered = [...docs.values()].filter((d) => {
        if (String(d.companyId) !== String(query.companyId)) return false;
        if (query.status && d.status !== query.status) return false;
        if (query.responsibleUserId && String(d.responsibleUserId) !== String(query.responsibleUserId)) return false;
        return true;
      });
      return { sort: () => ({ exec: async () => filtered }) };
    },
    findOne(query: Record<string, unknown>) {
      const found = [...docs.values()].find(
        (d) => String(d._id) === String(query._id) && String(d.companyId) === String(query.companyId),
      );
      return { exec: async () => (found ? withSave(found) : null) };
    },
  } as unknown as Model<CopasstAuditPlanningDocument>;

  return { model, docs };
}

function buildFakeHistoryModel() {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    model: {
      create: async (payload: Record<string, unknown>) => {
        created.push(payload);
        return payload;
      },
      find: () => ({
        sort: () => ({ exec: async () => created }),
      }),
    } as unknown as Model<CopasstAuditPlanningHistoryDocument>,
  };
}

function buildFakeUserModel(users: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId }>) {
  return {
    countDocuments: (query: { _id: { $in: Types.ObjectId[] }; companyId: Types.ObjectId }) => ({
      exec: async () =>
        users.filter(
          (u) =>
            query._id.$in.some((id) => String(id) === String(u._id)) &&
            String(u.companyId) === String(query.companyId),
        ).length,
    }),
  } as unknown as Model<UserDocument>;
}

function buildFakeCopasstPeriodModel(periods: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId; periodName?: string }> = []) {
  return {
    findOne: (query: { _id: Types.ObjectId; companyId: Types.ObjectId }) => ({
      select: () => ({
        exec: async () =>
          periods.find(
            (p) => String(p._id) === String(query._id) && String(p.companyId) === String(query.companyId),
          ) ?? null,
      }),
    }),
  } as never;
}

function buildFakeAnnualAuditModel(audits: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId }> = []) {
  return {
    countDocuments: (query: { _id: { $in: Types.ObjectId[] }; companyId: Types.ObjectId }) => ({
      exec: async () =>
        audits.filter(
          (a) =>
            query._id.$in.some((id) => String(id) === String(a._id)) &&
            String(a.companyId) === String(query.companyId),
        ).length,
    }),
  } as never;
}

function buildService(
  initialDocs: CopasstAuditPlanning[] = [],
  opts: {
    users?: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId }>;
    copasstPeriods?: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId; periodName?: string }>;
    annualAudits?: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId }>;
  } = {},
) {
  const planning = buildFakeModel(initialDocs);
  const history = buildFakeHistoryModel();
  const service = new CopasstAuditPlanningService(
    planning.model,
    history.model,
    buildFakeUserModel(opts.users ?? [{ _id: USER_A, companyId: COMPANY_A }]),
    buildFakeCopasstPeriodModel(opts.copasstPeriods ?? []),
    buildFakeAnnualAuditModel(opts.annualAudits ?? []),
  );
  return { service, planning, history };
}

function buildValidCreateDto(overrides: Partial<CreateCopasstAuditPlanningDto> = {}): CreateCopasstAuditPlanningDto {
  return {
    title: 'Planificación COPASST 2026',
    startDate: PERIOD_START,
    endDate: PERIOD_END,
    objectives: 'Verificar el SG-SST con participación del COPASST',
    scope: 'Todas las sedes',
    responsibleUserId: String(USER_A),
    items: [
      {
        title: 'Auditoría planificada Q1',
        objective: 'Verificar plan anual',
        plannedDate: '2026-03-15',
      } as CreatePlannedAuditDto,
    ],
    ...overrides,
  } as CreateCopasstAuditPlanningDto;
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

describe('CAPSST-PLAN: CREATE', () => {
  it('crea en DRAFT con companyId server-side y registra historial CREATE', async () => {
    const { service, history } = buildService();
    const created = await service.create(COMPANY_A, buildValidCreateDto(), actor);
    assert.equal(created.status, CopasstAuditPlanningStatus.DRAFT);
    assert.equal(String(created.companyId), String(COMPANY_A));
    assert.equal(String(created.createdBy), String(USER_A));
    assert.equal(created.createdBySnapshot, actor.userEmail);
    assert.equal(history.created[0]?.action, 'CREATE');
    assert.equal(String(history.created[0]?.companyId), String(COMPANY_A));
    assert.equal(String(history.created[0]?.planningId), String(created._id));
  });

  it('companyId del payload NO sobrescribe el del contexto (server-side)', async () => {
    const { service } = buildService();
    const dto = buildValidCreateDto({ companyId: COMPANY_B } as never);
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(String(created.companyId), String(COMPANY_A));
  });

  it('owner y admin pueden crear (controller); manager y member NO (RolesGuard real)', async () => {
    const { service } = buildService();
    const usersService = {
      findByFirebaseUid: async () => ({ _id: USER_A, companyId: COMPANY_A, email: 'u@a.com' }),
    } as unknown as UsersService;
    const controller = new CopasstAuditPlanningController(service, usersService);
    const request = { user: { uid: 'uid-x' } } as never;

    const writeRoles = ['owner', 'admin'];
    const guardOwner = new RolesGuard(
      { getAllAndOverride: () => writeRoles } as never,
      { findOne: () => ({ lean: () => ({ exec: async () => ({ role: 'owner' }) }) }) } as never,
    );
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => CopasstAuditPlanningController,
      switchToHttp: () => ({ getRequest: () => ({ user: { uid: 'uid-x' } }) }),
    } as never;
    await guardOwner.canActivate(ctx);
    await controller.create(request, buildValidCreateDto());

    const guardMember = new RolesGuard(
      { getAllAndOverride: () => writeRoles } as never,
      { findOne: () => ({ lean: () => ({ exec: async () => ({ role: 'member' }) }) }) } as never,
    );
    await assert.rejects(() => guardMember.canActivate(ctx), ForbiddenException);
    const guardManager = new RolesGuard(
      { getAllAndOverride: () => writeRoles } as never,
      { findOne: () => ({ lean: () => ({ exec: async () => ({ role: 'manager' }) }) }) } as never,
    );
    await assert.rejects(() => guardManager.canActivate(ctx), ForbiddenException);
  });

  it('rechaza startDate > endDate', async () => {
    const { service } = buildService();
    const dto = buildValidCreateDto({ startDate: '2026-12-31', endDate: '2026-01-01' });
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });

  it('rechaza planningCode duplicado en el MISMO tenant (índice {companyId, planningCode})', async () => {
    const { service } = buildService([buildPlanningDoc({ planningCode: 'PLAN-1' })]);
    const dto = buildValidCreateDto({ planningCode: 'PLAN-1' });
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });

  it('rechaza más de MAX_PLANNED_AUDITS_PER_PLANNING items', async () => {
    const { service } = buildService();
    const manyItems = Array.from({ length: 101 }, (_, i) => ({
      title: `Item ${i}`,
      objective: 'x',
    })) as CreatePlannedAuditDto[];
    const dto = buildValidCreateDto({ items: manyItems });
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });
});

// ─── LIST ────────────────────────────────────────────────────────────────────

describe('CAPSST-PLAN: LIST', () => {
  it('siempre scoped por companyId; filtros status/responsibleUserId', async () => {
    const docA1 = buildPlanningDoc({ status: CopasstAuditPlanningStatus.PLANNED, responsibleUserId: USER_A });
    const docA2 = buildPlanningDoc();
    const docB = buildPlanningDoc({ companyId: COMPANY_B });
    const { service } = buildService([docA1, docA2, docB]);

    const all = await service.findAll(COMPANY_A);
    assert.equal(all.length, 2);

    const planned = await service.findAll(COMPANY_A, { status: CopasstAuditPlanningStatus.PLANNED });
    assert.equal(planned.length, 1);
    assert.equal(String(planned[0]._id), String(docA1._id));

    const byResponsible = await service.findAll(COMPANY_A, { responsibleUserId: String(USER_A) });
    assert.equal(byResponsible.length, 1);
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────

describe('CAPSST-PLAN: GET ONE', () => {
  it('mismo tenant → ok; cross-tenant → 404; inexistente → 404; id inválido → 404', async () => {
    const docA = buildPlanningDoc();
    const docB = buildPlanningDoc({ companyId: COMPANY_B });
    const { service } = buildService([docA, docB]);

    const found = await service.findById(COMPANY_A, String(docA._id));
    assert.equal(String(found._id), String(docA._id));

    await assert.rejects(() => service.findById(COMPANY_A, String(docB._id)), NotFoundException);
    await assert.rejects(() => service.findById(COMPANY_A, new Types.ObjectId().toString()), NotFoundException);
    await assert.rejects(() => service.findById(COMPANY_A, 'not-an-id'), NotFoundException);
  });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────

describe('CAPSST-PLAN: UPDATE', () => {
  it('actualiza campos de negocio, sella updatedBy y registra UPDATE', async () => {
    const base = buildPlanningDoc();
    const { service, history } = buildService([base]);
    const dto = { title: 'Nuevo título', objectives: 'Nuevos objetivos' } as UpdateCopasstAuditPlanningDto;
    const saved = await service.update(COMPANY_A, String(base._id), dto, actor);
    assert.equal(saved.title, 'Nuevo título');
    assert.equal(saved.updatedBySnapshot, actor.userEmail);
    const last = history.created[history.created.length - 1];
    assert.equal(last?.action, 'UPDATE');
  });

  it('no permite modificar status vía update genérico (DTO sin status; terminal rechazado)', async () => {
    const done = buildPlanningDoc({ status: CopasstAuditPlanningStatus.COMPLETED });
    const { service } = buildService([done]);
    await assert.rejects(
      () => service.update(COMPANY_A, String(done._id), { title: 'x' } as never, actor),
      BadRequestException,
    );
  });

  it('rechaza rango de fechas inválido al actualizar', async () => {
    const base = buildPlanningDoc({ endDate: new Date('2026-06-30') });
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.update(COMPANY_A, String(base._id), { startDate: '2026-12-01' } as never, actor),
      BadRequestException,
    );
  });

  it('manager NO puede escribir (RolesGuard real); member tampoco', async () => {
    const writeRoles = ['owner', 'admin'];
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => CopasstAuditPlanningController,
      switchToHttp: () => ({ getRequest: () => ({ user: { uid: 'uid-x' } }) }),
    } as never;
    const guardManager = new RolesGuard(
      { getAllAndOverride: () => writeRoles } as never,
      { findOne: () => ({ lean: () => ({ exec: async () => ({ role: 'manager' }) }) }) } as never,
    );
    await assert.rejects(() => guardManager.canActivate(ctx), ForbiddenException);
    const guardMember = new RolesGuard(
      { getAllAndOverride: () => writeRoles } as never,
      { findOne: () => ({ lean: () => ({ exec: async () => ({ role: 'member' }) }) }) } as never,
    );
    await assert.rejects(() => guardMember.canActivate(ctx), ForbiddenException);
  });
});

// ─── STATUS ──────────────────────────────────────────────────────────────────

describe('CAPSST-PLAN: STATUS (máquina de estados)', () => {
  async function planningReadyForPlanned() {
    const base = buildPlanningDoc({
      objectives: 'Objetivos',
      scope: 'Alcance',
      responsibleUserId: USER_A,
      items: [buildItemDoc() as never],
    });
    return base;
  }

  it('DRAFT → PLANNED con contenido mínimo completo', async () => {
    const base = await planningReadyForPlanned();
    const { service, history } = buildService([base]);
    const saved = await service.updateStatus(COMPANY_A, String(base._id), { status: CopasstAuditPlanningStatus.PLANNED } as never, actor);
    assert.equal(saved.status, CopasstAuditPlanningStatus.PLANNED);
    const last = history.created[history.created.length - 1];
    assert.equal(last?.action, 'STATUS_CHANGE');
  });

  it('DRAFT → PLANNED sin requisitos mínimos → rechazado', async () => {
    const base = buildPlanningDoc(); // sin objectives/scope/responsable/items
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.updateStatus(COMPANY_A, String(base._id), { status: CopasstAuditPlanningStatus.PLANNED } as never, actor),
      BadRequestException,
    );
  });

  it('DRAFT → CANCELLED permitido', async () => {
    const base = buildPlanningDoc();
    const { service } = buildService([base]);
    const saved = await service.updateStatus(COMPANY_A, String(base._id), { status: CopasstAuditPlanningStatus.CANCELLED } as never, actor);
    assert.equal(saved.status, CopasstAuditPlanningStatus.CANCELLED);
  });

  it('PLANNED → IN_PROGRESS requiere ≥1 item; DRAFT → IN_PROGRESS es transición inválida', async () => {
    const ready = buildPlanningDoc({
      objectives: 'Objetivos',
      scope: 'Alcance',
      responsibleUserId: USER_A,
      items: [buildItemDoc() as never],
    });
    const { service } = buildService([ready]);
    await service.updateStatus(COMPANY_A, String(ready._id), { status: CopasstAuditPlanningStatus.PLANNED } as never, actor);
    const inProgress = await service.updateStatus(COMPANY_A, String(ready._id), { status: CopasstAuditPlanningStatus.IN_PROGRESS } as never, actor);
    assert.equal(inProgress.status, CopasstAuditPlanningStatus.IN_PROGRESS);

    const draft = buildPlanningDoc({ items: [buildItemDoc() as never] });
    const { service: s2 } = buildService([draft]);
    await assert.rejects(
      () => s2.updateStatus(COMPANY_A, String(draft._id), { status: CopasstAuditPlanningStatus.IN_PROGRESS } as never, actor),
      BadRequestException,
    );
  });

  it('IN_PROGRESS → COMPLETED requiere ≥1 item completado con participación COPASST', async () => {
    const item = buildItemDoc();
    const base = buildPlanningDoc({
      status: CopasstAuditPlanningStatus.IN_PROGRESS,
      items: [item as never],
    });
    const { service } = buildService([base]);
    // Sin item completado → rechazado.
    await assert.rejects(
      () => service.updateStatus(COMPANY_A, String(base._id), { status: CopasstAuditPlanningStatus.COMPLETED } as never, actor),
      BadRequestException,
    );
    // Con item completado + participación → permitido.
    item.status = PlannedAuditItemStatus.COMPLETED;
    (item.copasstParticipation as { participated: boolean }).participated = true;
    const saved = await service.updateStatus(COMPANY_A, String(base._id), { status: CopasstAuditPlanningStatus.COMPLETED } as never, actor);
    assert.equal(saved.status, CopasstAuditPlanningStatus.COMPLETED);
  });

  it('COMPLETED y CANCELLED son terminales', async () => {
    const done = buildPlanningDoc({ status: CopasstAuditPlanningStatus.COMPLETED });
    const { service } = buildService([done]);
    await assert.rejects(
      () => service.updateStatus(COMPANY_A, String(done._id), { status: CopasstAuditPlanningStatus.PLANNED } as never, actor),
      BadRequestException,
    );
    const cancelled = buildPlanningDoc({ status: CopasstAuditPlanningStatus.CANCELLED });
    const { service: s2 } = buildService([cancelled]);
    await assert.rejects(
      () => s2.updateStatus(COMPANY_A, String(cancelled._id), { status: CopasstAuditPlanningStatus.DRAFT } as never, actor),
      BadRequestException,
    );
  });

  it('misma transición a sí mismo rechazada (DRAFT → DRAFT)', async () => {
    const base = buildPlanningDoc();
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.updateStatus(COMPANY_A, String(base._id), { status: CopasstAuditPlanningStatus.DRAFT } as never, actor),
      BadRequestException,
    );
  });

  it('PLANNED → CANCELLED e IN_PROGRESS → CANCELLED permitidos', async () => {
    const planned = buildPlanningDoc({
      status: CopasstAuditPlanningStatus.PLANNED,
      objectives: 'x',
      scope: 'y',
      responsibleUserId: USER_A,
      items: [buildItemDoc() as never],
    });
    const { service } = buildService([planned]);
    const saved = await service.updateStatus(COMPANY_A, String(planned._id), { status: CopasstAuditPlanningStatus.CANCELLED } as never, actor);
    assert.equal(saved.status, CopasstAuditPlanningStatus.CANCELLED);

    const inProgress = buildPlanningDoc({ status: CopasstAuditPlanningStatus.IN_PROGRESS, items: [buildItemDoc() as never] });
    const { service: s2 } = buildService([inProgress]);
    const saved2 = await s2.updateStatus(COMPANY_A, String(inProgress._id), { status: CopasstAuditPlanningStatus.CANCELLED } as never, actor);
    assert.equal(saved2.status, CopasstAuditPlanningStatus.CANCELLED);
  });
});

// ─── ITEMS ───────────────────────────────────────────────────────────────────

describe('CAPSST-PLAN: ITEMS', () => {
  it('addItem: agrega item con _id, sella updatedBy y registra ITEM_CREATED', async () => {
    const base = buildPlanningDoc();
    const { service, history } = buildService([base]);
    const dto = { title: 'Auditoría Q2', objective: 'Verificar' } as CreatePlannedAuditDto;
    const saved = await service.addItem(COMPANY_A, String(base._id), dto, actor);
    assert.equal(saved.items.length, 1);
    assert.ok(saved.items[0]._id);
    assert.equal(saved.items[0].status, PlannedAuditItemStatus.PLANNED);
    const last = history.created[history.created.length - 1];
    assert.equal(last?.action, 'ITEM_CREATED');
    assert.equal(String(last?.itemId), String(saved.items[0]._id));
  });

  it('addItem: plannedDate fuera del período → rechazado', async () => {
    const base = buildPlanningDoc();
    const { service } = buildService([base]);
    const dto = { title: 'X', objective: 'x', plannedDate: '2027-06-01' } as CreatePlannedAuditDto;
    await assert.rejects(
      () => service.addItem(COMPANY_A, String(base._id), dto, actor),
      BadRequestException,
    );
  });

  it('addItem: en planificación terminal (COMPLETED/CANCELLED) → rechazado', async () => {
    const done = buildPlanningDoc({ status: CopasstAuditPlanningStatus.COMPLETED });
    const { service } = buildService([done]);
    await assert.rejects(
      () => service.addItem(COMPANY_A, String(done._id), { title: 'x', objective: 'x' } as never, actor),
      BadRequestException,
    );
    const cancelled = buildPlanningDoc({ status: CopasstAuditPlanningStatus.CANCELLED });
    const { service: s2 } = buildService([cancelled]);
    await assert.rejects(
      () => s2.addItem(COMPANY_A, String(cancelled._id), { title: 'x', objective: 'x' } as never, actor),
      BadRequestException,
    );
  });

  it('updateItem: modifica item y registra ITEM_UPDATED; item inexistente → 404', async () => {
    const item = buildItemDoc();
    const base = buildPlanningDoc({ items: [item as never] });
    const { service, history } = buildService([base]);
    const saved = await service.updateItem(COMPANY_A, String(base._id), String(item._id), { title: 'Título nuevo' } as never, actor);
    assert.equal(saved.items[0].title, 'Título nuevo');
    const last = history.created[history.created.length - 1];
    assert.equal(last?.action, 'ITEM_UPDATED');

    await assert.rejects(
      () => service.updateItem(COMPANY_A, String(base._id), new Types.ObjectId().toString(), { title: 'y' } as never, actor),
      NotFoundException,
    );
  });

  it('updateItemStatus: PLANNED → IN_PROGRESS → COMPLETED; COMPLETED con plannedDate futura → rechazado', async () => {
    const item = buildItemDoc({ plannedDate: new Date(Date.now() - 24 * 60 * 60 * 1000) });
    const base = buildPlanningDoc({ items: [item as never] });
    const { service, history } = buildService([base]);
    await service.updateItemStatus(COMPANY_A, String(base._id), String(item._id), { status: PlannedAuditItemStatus.IN_PROGRESS } as never, actor);
    const saved = await service.updateItemStatus(COMPANY_A, String(base._id), String(item._id), { status: PlannedAuditItemStatus.COMPLETED } as never, actor);
    assert.equal(saved.items[0].status, PlannedAuditItemStatus.COMPLETED);
    const last = history.created[history.created.length - 1];
    assert.equal(last?.action, 'ITEM_STATUS_CHANGE');

    const future = buildItemDoc({ plannedDate: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const base2 = buildPlanningDoc({ items: [future as never] });
    const { service: s2 } = buildService([base2]);
    await assert.rejects(
      () => s2.updateItemStatus(COMPANY_A, String(base2._id), String(future._id), { status: PlannedAuditItemStatus.COMPLETED } as never, actor),
      BadRequestException,
    );
  });

  it('updateItemStatus: transición inválida PLANNED → COMPLETED rechazada (solo vía IN_PROGRESS)', async () => {
    // Regla REAL del dominio: PLANNED → [IN_PROGRESS, CANCELLED].
    const item = buildItemDoc();
    const base = buildPlanningDoc({ items: [item as never] });
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.updateItemStatus(COMPANY_A, String(base._id), String(item._id), { status: PlannedAuditItemStatus.COMPLETED } as never, actor),
      BadRequestException,
    );
  });

  it('updateItemStatus: transición inválida CANCELLED → PLANNED rechazada (terminal)', async () => {
    const item = buildItemDoc({ status: PlannedAuditItemStatus.CANCELLED });
    const base = buildPlanningDoc({ items: [item as never] });
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.updateItemStatus(COMPANY_A, String(base._id), String(item._id), { status: PlannedAuditItemStatus.PLANNED } as never, actor),
      BadRequestException,
    );
  });

  it('items sobre planning inexistente o cross-tenant → 404', async () => {
    const docB = buildPlanningDoc({ companyId: COMPANY_B, items: [buildItemDoc() as never] });
    const { service } = buildService([docB]);
    await assert.rejects(
      () => service.addItem(COMPANY_A, String(docB._id), { title: 'x', objective: 'x' } as never, actor),
      NotFoundException,
    );
    await assert.rejects(
      () => service.updateItem(COMPANY_A, String(docB._id), String((docB.items[0] as unknown as { _id: Types.ObjectId })._id), { title: 'hack' } as never, actor),
      NotFoundException,
    );
  });
});

// ─── Referencias tenant-safe ─────────────────────────────────────────────────

describe('CAPSST-PLAN: Referencias tenant-safe', () => {
  const PERIOD_OK = new Types.ObjectId();
  const AUDIT_OK = new Types.ObjectId();

  it('copasstPeriodId del mismo tenant: ok + snapshot server-side del período', async () => {
    const { service } = buildService([], { copasstPeriods: [{ _id: PERIOD_OK, companyId: COMPANY_A, periodName: 'Vigencia 2026-2027' }] });
    const dto = buildValidCreateDto({ copasstPeriodId: String(PERIOD_OK) });
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(created.copasstPeriodSnapshot, 'Vigencia 2026-2027');
  });

  it('copasstPeriodId de OTRO tenant → 404', async () => {
    const { service } = buildService([], { copasstPeriods: [{ _id: PERIOD_OK, companyId: COMPANY_B, periodName: 'De B' }] });
    const dto = buildValidCreateDto({ copasstPeriodId: String(PERIOD_OK) });
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), NotFoundException);
  });

  it('annualAuditId del mismo tenant: ok; de OTRO tenant → 404; inexistente → 404', async () => {
    const { service } = buildService([], { annualAudits: [{ _id: AUDIT_OK, companyId: COMPANY_A }] });
    const dto = buildValidCreateDto({
      items: [{ title: 'X', objective: 'x', annualAuditId: String(AUDIT_OK) } as CreatePlannedAuditDto],
    });
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(String((created.items[0] as unknown as { annualAuditId: Types.ObjectId }).annualAuditId), String(AUDIT_OK));

    const dtoB = buildValidCreateDto({
      items: [{ title: 'X', objective: 'x', annualAuditId: String(AUDIT_OK) } as CreatePlannedAuditDto],
    });
    const { service: s2 } = buildService([], { annualAudits: [{ _id: AUDIT_OK, companyId: COMPANY_B }] });
    await assert.rejects(() => s2.create(COMPANY_A, dtoB, actor), NotFoundException);
  });

  it('responsibleUserId/auditorUserId cross-tenant → rechazado; mismos tenant → ok', async () => {
    const USER_A2 = new Types.ObjectId();
    const USER_B = new Types.ObjectId();
    const { service } = buildService([], {
      users: [
        { _id: USER_A2, companyId: COMPANY_A },
        { _id: USER_B, companyId: COMPANY_B },
      ],
    });
    const ok = buildValidCreateDto({
      responsibleUserId: String(USER_A2),
      items: [{ title: 'X', objective: 'x', auditorUserId: String(USER_A2) } as CreatePlannedAuditDto],
    });
    const created = await service.create(COMPANY_A, ok, actor);
    assert.ok(created.items.length >= 1);

    const bad = buildValidCreateDto({ responsibleUserId: String(USER_B) });
    await assert.rejects(() => service.create(COMPANY_A, bad, actor), BadRequestException);
  });

  it('participants[].userId cross-tenant → rechazado (hygiene COPASST)', async () => {
    const USER_B = new Types.ObjectId();
    const { service } = buildService([], { users: [{ _id: USER_B, companyId: COMPANY_B }] });
    const dto = buildValidCreateDto({
      items: [
        {
          title: 'X',
          objective: 'x',
          copasstParticipation: {
            participants: [{ userId: String(USER_B), nameSnapshot: 'Intruso' }],
          },
        } as CreatePlannedAuditDto,
      ],
    });
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });
});

// ─── Multi-tenant (service) ──────────────────────────────────────────────────

describe('CAPSST-PLAN: Tenant isolation', () => {
  it('A no puede leer/editar/cambiar estado/agregar items/ver historial de B', async () => {
    const docB = buildPlanningDoc({ companyId: COMPANY_B });
    const { service } = buildService([docB]);
    await assert.rejects(() => service.findById(COMPANY_A, String(docB._id)), NotFoundException);
    await assert.rejects(
      () => service.update(COMPANY_A, String(docB._id), { title: 'hack' } as never, actor),
      NotFoundException,
    );
    await assert.rejects(
      () => service.updateStatus(COMPANY_A, String(docB._id), { status: CopasstAuditPlanningStatus.CANCELLED } as never, actor),
      NotFoundException,
    );
    await assert.rejects(
      () => service.addItem(COMPANY_A, String(docB._id), { title: 'x', objective: 'x' } as never, actor),
      NotFoundException,
    );
    await assert.rejects(() => service.getHistory(COMPANY_A, String(docB._id)), NotFoundException);
  });

  it('updateItem/updateItemStatus sobre planning de B → 404', async () => {
    const docB = buildPlanningDoc({ companyId: COMPANY_B, items: [buildItemDoc() as never] });
    const { service } = buildService([docB]);
    const itemId = String((docB.items[0] as unknown as { _id: Types.ObjectId })._id);
    await assert.rejects(
      () => service.updateItem(COMPANY_A, String(docB._id), itemId, { title: 'hack' } as never, actor),
      NotFoundException,
    );
    await assert.rejects(
      () => service.updateItemStatus(COMPANY_A, String(docB._id), itemId, { status: PlannedAuditItemStatus.COMPLETED } as never, actor),
      NotFoundException,
    );
  });
});

// ─── Historial (server-side, append-only) ────────────────────────────────────

describe('CAPSST-PLAN: Historial (server-side, append-only)', () => {
  it('cada mutación registra evento con usuario y tenant; el DTO no expone history', async () => {
    const item = buildItemDoc();
    const base = buildPlanningDoc({
      objectives: 'x',
      scope: 'y',
      responsibleUserId: USER_A,
      items: [item as never],
    });
    const { service, history } = buildService([base]);
    await service.updateStatus(COMPANY_A, String(base._id), { status: CopasstAuditPlanningStatus.PLANNED } as never, actor);
    await service.update(COMPANY_A, String(base._id), { title: 'T' } as never, actor);
    await service.addItem(COMPANY_A, String(base._id), { title: 'Q3', objective: 'z' } as never, actor);
    await service.updateItem(COMPANY_A, String(base._id), String((base.items[1] as unknown as { _id: Types.ObjectId })._id), { objective: 'z2' } as never, actor);
    const actions = history.created.map((h) => h.action);
    for (const expected of ['STATUS_CHANGE', 'UPDATE', 'ITEM_CREATED', 'ITEM_UPDATED']) {
      assert.ok(actions.includes(expected), `falta evento ${expected}`);
    }
    for (const h of history.created) {
      assert.equal(String(h.companyId), String(COMPANY_A));
      assert.equal(h.userEmail, actor.userEmail);
    }
    // addItem agregó un item (índice 1) — ITEM_STATUS_CHANGE:
    await service.updateItemStatus(COMPANY_A, String(base._id), String((base.items[1] as unknown as { _id: Types.ObjectId })._id), { status: PlannedAuditItemStatus.IN_PROGRESS } as never, actor);
    assert.ok(history.created.map((h) => h.action).includes('ITEM_STATUS_CHANGE'));

    // El DTO no expone history/companyId/createdBy (forbidNonWhitelisted global).
    for (const dtoClass of [CreateCopasstAuditPlanningDto, UpdateCopasstAuditPlanningDto]) {
      const proto = dtoClass.prototype as Record<string, unknown>;
      assert.ok(!('history' in proto), `${dtoClass.name} no debe exponer history`);
      assert.ok(!('companyId' in proto), `${dtoClass.name} no debe exponer companyId`);
      assert.ok(!('createdBy' in proto), `${dtoClass.name} no debe exponer createdBy`);
    }
  });
});
