import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import 'reflect-metadata';
import { Types, Model } from 'mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { validateSync } from 'class-validator';

import { ROLES_KEY } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import { ManagementReviewDirectionService, ReviewActor } from './management-review-direction.service';
import { ManagementReviewDirectionController } from './management-review-direction.controller';
import { isDecisionOverdue } from './schemas/management-review-direction.schema';
import {
  ManagementReviewDecisionStatus,
  ManagementReviewDirection,
  ManagementReviewDirectionDocument,
  ManagementReviewDirectionStatus,
  ManagementReviewInputStatus,
  ManagementReviewInputType,
} from './schemas/management-review-direction.schema';
import {
  ManagementReviewDirectionHistory,
  ManagementReviewDirectionHistoryDocument,
} from './schemas/management-review-direction-history.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  CreateManagementReviewDirectionDto,
  CreateReviewDecisionDto,
  CreateReviewInputDto,
  UpdateManagementReviewDirectionDto,
  UpdateManagementReviewDirectionStatusDto,
} from './dto/management-review-direction.dto';

/**
 * E1 (6.1.3) — Tests del dominio management-review-direction.
 *
 * Cobertura: CRUD + estado + integridad, entradas (inputs), decisiones
 * propias, historial append-only, evidencia DocumentMaster tenant-safe,
 * roles (guard REAL), aislamiento multi-tenant (404 cross-tenant) y DTOs
 * estrictos con validateSync (whitelist + forbidNonWhitelisted, igual que el
 * ValidationPipe global de main.ts). Sin MongoDB en memoria (patrón del repo).
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();
const USER_A = new Types.ObjectId();
const DOC_A = '5f1a2b3c4d5e6f7a8b9c0d11';

const actor: ReviewActor = { userId: USER_A, userEmail: 'actor@test.com' };

function buildReviewDoc(overrides: Partial<ManagementReviewDirection> = {}): ManagementReviewDirection {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    reviewCode: 'MRD-2026-01',
    title: 'Revisión por la dirección',
    status: ManagementReviewDirectionStatus.DRAFT,
    participants: [],
    inputs: [],
    analysis: {},
    decisions: [],
    ...overrides,
  } as unknown as ManagementReviewDirection;
}

function buildFakeModel(initialDocs: ManagementReviewDirection[] = []) {
  const docs: Map<string, ManagementReviewDirection> = new Map();
  for (const d of initialDocs) {
    docs.set(String(d._id), d);
  }

  // save() persistente para emular Mongoose (los cambios quedan).
  const withSave = (doc: ManagementReviewDirection) => {
    (doc as unknown as { save: () => Promise<ManagementReviewDirection> }).save = async () => {
      docs.set(String(doc._id), doc);
      return doc;
    };
    return doc;
  };

  const model = {
    async create(payload: Record<string, unknown>) {
      const doc = buildReviewDoc(payload as Partial<ManagementReviewDirection>);
      // El reviewCode real es el del payload (buildReviewDoc tiene un default
      // solo para documentos de prueba; el índice único no debe verlo si el
      // cliente no envió código).
      doc.reviewCode = (payload as Partial<ManagementReviewDirection>).reviewCode;
      doc._id = new Types.ObjectId();
      // Simular el índice único {companyId, reviewCode} (solo strings:
      // múltiples null/undefined son válidos).
      for (const existing of docs.values()) {
        if (
          String(existing.companyId) === String(doc.companyId) &&
          doc.reviewCode &&
          existing.reviewCode &&
          existing.reviewCode === doc.reviewCode
        ) {
          throw { code: 11000 };
        }
      }
      docs.set(String(doc._id), doc);
      return withSave(doc);
    },
    find(query: Record<string, unknown>) {
      const filtered = [...docs.values()].filter((d) => {
        if (String(d.companyId) !== String(query.companyId)) return false;
        if (query.status && d.status !== query.status) return false;
        if (query.reviewType && d.reviewType !== query.reviewType) return false;
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
  } as unknown as Model<ManagementReviewDirectionDocument>;

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
    } as unknown as Model<ManagementReviewDirectionHistoryDocument>,
  };
}

function buildFakeUserModel(users: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId }>) {
  return {
    countDocuments: (query: { _id: { $in: Types.ObjectId[] }; companyId: Types.ObjectId }) => {
      const count = users.filter(
        (u) =>
          query._id.$in.some((id) => String(id) === String(u._id)) &&
          String(u.companyId) === String(query.companyId),
      ).length;
      return { exec: async () => count };
    },
  } as unknown as Model<UserDocument>;
}

function buildFakeDocumentMasterService(opts: { visibleTo?: Types.ObjectId } = {}) {
  const inner = {
    findById: async (id: Types.ObjectId, companyId?: Types.ObjectId) => {
      // Solo el documento DEMO-DOC existe; pertenece a `visibleTo` (default A).
      if (String(id) !== DOC_A) return null;
      const owner = opts.visibleTo ?? COMPANY_A;
      if (companyId && String(companyId) !== String(owner)) return null;
      return { _id: id, companyId: owner };
    },
  };
  return inner as unknown as DocumentMasterService;
}

function buildService(initialDocs: ManagementReviewDirection[] = [], docOpts: { visibleTo?: Types.ObjectId } = {}) {
  const review = buildFakeModel(initialDocs);
  const history = buildFakeHistoryModel();
  const service = new ManagementReviewDirectionService(
    review.model,
    history.model,
    buildFakeUserModel([{ _id: USER_A, companyId: COMPANY_A }]),
    buildFakeDocumentMasterService(docOpts),
  );
  return { service, review, history };
}

// ─── Creación ───────────────────────────────────────────────────────────────

describe('MRD: Creación', () => {
  it('1. create: crea en DRAFT con createdBy del actor y registra CREATE', async () => {
    const { service, history } = buildService();
    const dto = { title: 'Revisión anual de dirección' } as CreateManagementReviewDirectionDto;
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(created.status, ManagementReviewDirectionStatus.DRAFT);
    assert.equal(String(created.createdBy), String(USER_A));
    assert.equal(history.created[0]?.action, 'CREATE');
    assert.equal(String(history.created[0]?.companyId), String(COMPANY_A));
  });

  it('2. companyId es server-side: nunca proviene del DTO', async () => {
    const { service } = buildService();
    const dto = {
      title: 'R',
      companyId: String(COMPANY_B),
    } as unknown as CreateManagementReviewDirectionDto;
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(String(created.companyId), String(COMPANY_A));
  });

  it('3. reviewCode duplicado en el MISMO tenant → BadRequest (índice {companyId, reviewCode})', async () => {
    const { service } = buildService([buildReviewDoc({ reviewCode: 'MRD-1' })]);
    const dto = { title: 'Otra', reviewCode: 'MRD-1' } as CreateManagementReviewDirectionDto;
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });

  it('4. reviewCode igual en OTRO tenant es válido (unique es tenant-scoped)', async () => {
    const { service } = buildService([buildReviewDoc({ companyId: COMPANY_B, reviewCode: 'MRD-1' })]);
    const dto = { title: 'De A', reviewCode: 'MRD-1' } as CreateManagementReviewDirectionDto;
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(created.reviewCode, 'MRD-1');
  });

  it('5. plannedDate en el pasado → BadRequest', async () => {
    const { service } = buildService();
    const dto = { title: 'R', plannedDate: '2020-01-01' } as CreateManagementReviewDirectionDto;
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });

  it('6. responsable cross-tenant en creación → BadRequest', async () => {
    const { service } = buildService();
    const dto = {
      title: 'R',
      responsibleUserId: new Types.ObjectId().toString(),
    } as CreateManagementReviewDirectionDto;
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });

  it('7. participante cross-tenant en creación → BadRequest', async () => {
    const { service } = buildService();
    const dto = {
      title: 'R',
      participants: [{ nameSnapshot: 'Intruso', userId: new Types.ObjectId().toString() }],
    } as CreateManagementReviewDirectionDto;
    await assert.rejects(() => service.create(COMPANY_A, dto, actor), BadRequestException);
  });

  it('8. listado con filtros (status, reviewType, from/to) queda scoped al tenant', async () => {
    const { service } = buildService([
      buildReviewDoc({ status: ManagementReviewDirectionStatus.PLANNED }),
      buildReviewDoc({ companyId: COMPANY_B, status: ManagementReviewDirectionStatus.PLANNED }),
    ]);
    const all = await service.findAll(COMPANY_A, {});
    assert.equal(all.length, 1);
    const planned = await service.findAll(COMPANY_A, { status: ManagementReviewDirectionStatus.PLANNED });
    assert.equal(planned.length, 1);
    const from = await service.findAll(COMPANY_A, { from: '2020-01-01', to: '2030-01-01' });
    assert.equal(from.length, 1);
  });
});

// ─── Tenant ─────────────────────────────────────────────────────────────────

describe('MRD: Tenant isolation', () => {
  it('9. A no puede leer/modificar/eliminar-estado/historial de B (404)', async () => {
    const reviewB = buildReviewDoc({ companyId: COMPANY_B, reviewCode: 'MRD-B' });
    const { service } = buildService([reviewB]);
    await assert.rejects(() => service.findById(COMPANY_A, String(reviewB._id)), NotFoundException);
    await assert.rejects(
      () => service.update(COMPANY_A, String(reviewB._id), { title: 'hack' } as never, actor),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.updateStatus(
          COMPANY_A,
          String(reviewB._id),
          { status: ManagementReviewDirectionStatus.PLANNED } as never,
          actor,
        ),
      NotFoundException,
    );
    await assert.rejects(
      () => service.addInput(COMPANY_A, String(reviewB._id), { type: 'OTHER', title: 'x' } as never, actor),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.addDecision(COMPANY_A, String(reviewB._id), { description: 'x', category: 'OTHER' } as never, actor),
      NotFoundException,
    );
    await assert.rejects(() => service.getHistory(COMPANY_A, String(reviewB._id)), NotFoundException);
  });

  it('10. id inválido → 404 (no 500)', async () => {
    const { service } = buildService();
    await assert.rejects(() => service.findById(COMPANY_A, 'not-an-id'), NotFoundException);
  });

  it('11. sub-recurso de revisión de B → 404 (invalid parent)', async () => {
    const reviewB = buildReviewDoc({ companyId: COMPANY_B });
    const { service } = buildService([reviewB]);
    await assert.rejects(
      () =>
        service.updateInput(
          COMPANY_A,
          String(reviewB._id),
          new Types.ObjectId().toString(),
          { status: 'REVIEWED' } as never,
          actor,
        ),
      NotFoundException,
    );
  });
});

// ─── Roles (guard REAL) ─────────────────────────────────────────────────────

describe('MRD: Roles (RolesGuard real + matriz del controller)', () => {
  function buildGuard(requiredRoles: string[], role: string | undefined): RolesGuard {
    const mockReflector = {
      getAllAndOverride: (key: unknown) => (key === ROLES_KEY ? requiredRoles : undefined),
    };
    const mockUserModel = {
      findOne: () => ({
        lean: () => ({ exec: async () => ({ role }) }),
        exec: async () => ({ role }),
      }),
    };
    return new RolesGuard(mockReflector as never, mockUserModel as never);
  }

  async function withRole<T>(requiredRoles: string[], role: string | undefined, fn: () => Promise<T>): Promise<T> {
    const guard = buildGuard(requiredRoles, role);
    const context = {
      getHandler: () => () => undefined,
      getClass: () => ManagementReviewDirectionController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { uid: 'uid-x', role, userId: USER_A } }),
      }),
    } as never;
    await guard.canActivate(context);
    return fn();
  }

  function buildController(service: ManagementReviewDirectionService) {
    return new ManagementReviewDirectionController(service, {
      findByFirebaseUid: async () => ({ _id: USER_A, companyId: COMPANY_A, email: 'u@a.com' }),
    } as never);
  }

  it('12-13. owner y admin pueden crear; 14-15. manager y member NO (RolesGuard real)', async () => {
    const { service } = buildService();
    const controller = buildController(service);
    const writeRoles = ['owner', 'admin'];

    await withRole(writeRoles, 'owner', () =>
      controller.create({ user: { uid: 'uid-x' } } as never, { title: 'A' } as never),
    );
    await withRole(writeRoles, 'admin', () =>
      controller.create({ user: { uid: 'uid-x' } } as never, { title: 'B' } as never),
    );
    await assert.rejects(
      withRole(writeRoles, 'manager', () =>
        controller.create({ user: { uid: 'uid-x' } } as never, { title: 'C' } as never),
      ),
      ForbiddenException,
    );
    await assert.rejects(
      withRole(writeRoles, 'member', () =>
        controller.create({ user: { uid: 'uid-x' } } as never, { title: 'D' } as never),
      ),
      ForbiddenException,
    );
  });

  it('16-17. manager y member pueden leer (detalle); READ = 4 roles', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    const controller = buildController(service);
    const readRoles = ['owner', 'admin', 'manager', 'member'];

    await withRole(readRoles, 'member', () =>
      controller.findById({ user: { uid: 'uid-x' } } as never, String(base._id)),
    );
    await withRole(readRoles, 'manager', () =>
      controller.findById({ user: { uid: 'uid-x' } } as never, String(base._id)),
    );
    await withRole(readRoles, 'owner', () =>
      controller.getHistory({ user: { uid: 'uid-x' } } as never, String(base._id)),
    );
    await withRole(readRoles, 'admin', () =>
      controller.getHistory({ user: { uid: 'uid-x' } } as never, String(base._id)),
    );
    assert.ok(true);
  });

  it('18. member no puede escribir sub-recursos (inputs/decisions)', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    const controller = buildController(service);
    const writeRoles = ['owner', 'admin'];

    await assert.rejects(
      withRole(writeRoles, 'member', () =>
        controller.addInput({ user: { uid: 'uid-x' } } as never, String(base._id), { type: 'OTHER', title: 'x' } as never),
      ),
      ForbiddenException,
    );
    await assert.rejects(
      withRole(writeRoles, 'manager', () =>
        controller.addDecision({ user: { uid: 'uid-x' } } as never, String(base._id), {
          description: 'x',
          category: 'OTHER',
        } as never),
      ),
      ForbiddenException,
    );
  });
});

// ─── Estados ────────────────────────────────────────────────────────────────

describe('MRD: Estados y transiciones', () => {
  it('19. DRAFT → PLANNED (con plannedDate y responsable)', async () => {
    const base = buildReviewDoc({ plannedDate: new Date('2030-01-01'), responsibleUserId: USER_A });
    const { service, history } = buildService([base]);
    const saved = await service.updateStatus(
      COMPANY_A,
      String(base._id),
      { status: ManagementReviewDirectionStatus.PLANNED } as never,
      actor,
    );
    assert.equal(saved.status, ManagementReviewDirectionStatus.PLANNED);
    assert.equal(history.created[0]?.action, 'STATUS_CHANGE');
  });

  it('20. DRAFT → CANCELLED', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    const saved = await service.updateStatus(
      COMPANY_A,
      String(base._id),
      { status: ManagementReviewDirectionStatus.CANCELLED } as never,
      actor,
    );
    assert.equal(saved.status, ManagementReviewDirectionStatus.CANCELLED);
  });

  it('21. PLANNED → IN_PROGRESS (requiere actualStartDate)', async () => {
    const base = buildReviewDoc({ status: ManagementReviewDirectionStatus.PLANNED });
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.updateStatus(
          COMPANY_A,
          String(base._id),
          { status: ManagementReviewDirectionStatus.IN_PROGRESS } as never,
          actor,
        ),
      BadRequestException,
    );
    await service.update(COMPANY_A, String(base._id), { actualStartDate: '2026-03-01' } as never, actor);
    const inProgress = await service.updateStatus(
      COMPANY_A,
      String(base._id),
      { status: ManagementReviewDirectionStatus.IN_PROGRESS } as never,
      actor,
    );
    assert.equal(inProgress.status, ManagementReviewDirectionStatus.IN_PROGRESS);
  });

  it('22. PLANNED → CANCELLED', async () => {
    const base = buildReviewDoc({ status: ManagementReviewDirectionStatus.PLANNED });
    const { service } = buildService([base]);
    const saved = await service.updateStatus(
      COMPANY_A,
      String(base._id),
      { status: ManagementReviewDirectionStatus.CANCELLED } as never,
      actor,
    );
    assert.equal(saved.status, ManagementReviewDirectionStatus.CANCELLED);
  });

  it('23. transición inválida DRAFT → COMPLETED rechazada', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.updateStatus(
          COMPANY_A,
          String(base._id),
          { status: ManagementReviewDirectionStatus.COMPLETED } as never,
          actor,
        ),
      BadRequestException,
    );
  });

  it('24-25. COMPLETED y CANCELLED son terminales (no reapertura)', async () => {
    const done = buildReviewDoc({ status: ManagementReviewDirectionStatus.COMPLETED });
    const { service } = buildService([done]);
    await assert.rejects(
      () =>
        service.updateStatus(
          COMPANY_A,
          String(done._id),
          { status: ManagementReviewDirectionStatus.PLANNED } as never,
          actor,
        ),
      BadRequestException,
    );
    const cancelled = buildReviewDoc({ status: ManagementReviewDirectionStatus.CANCELLED });
    const { service: s2 } = buildService([cancelled]);
    await assert.rejects(
      () =>
        s2.updateStatus(
          COMPANY_A,
          String(cancelled._id),
          { status: ManagementReviewDirectionStatus.IN_PROGRESS } as never,
          actor,
        ),
      BadRequestException,
    );
  });
});

// ─── Validaciones de estado/fechas/contenido ────────────────────────────────

describe('MRD: Validaciones (fechas, integridad)', () => {
  it('26. fecha inválida en DTO → rechazada por validateSync (@IsDateString)', () => {
    const dto = Object.assign(new CreateManagementReviewDirectionDto(), { title: 'R', plannedDate: 'no-es-fecha' });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(errors.some((e) => e.property === 'plannedDate'));
  });

  it('27. rango inválido: actualStartDate > actualEndDate → BadRequest (merge con documento)', async () => {
    const base = buildReviewDoc({ status: ManagementReviewDirectionStatus.IN_PROGRESS, actualEndDate: new Date('2026-03-01') });
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.update(COMPANY_A, String(base._id), { actualStartDate: '2026-04-01' } as never, actor),
      BadRequestException,
    );
  });

  it('28. fecha de ejecución en el futuro → BadRequest (la ejecución ya realizada es pasado)', async () => {
    const base = buildReviewDoc({ status: ManagementReviewDirectionStatus.IN_PROGRESS });
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.update(COMPANY_A, String(base._id), { actualStartDate: '2099-01-01' } as never, actor),
      BadRequestException,
    );
  });

  it('29. COMPLETED sin actualEndDate → BadRequest', async () => {
    const base = buildReviewDoc({ status: ManagementReviewDirectionStatus.IN_PROGRESS, actualStartDate: new Date() });
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.updateStatus(
          COMPANY_A,
          String(base._id),
          { status: ManagementReviewDirectionStatus.COMPLETED } as never,
          actor,
        ),
      BadRequestException,
    );
  });

  it('30. COMPLETED sin acta/evidencia → BadRequest', async () => {
    const base = buildReviewDoc({
      status: ManagementReviewDirectionStatus.IN_PROGRESS,
      actualStartDate: new Date(),
      actualEndDate: new Date(),
      analysis: { summary: 'Revisión realizada', strengths: [], gaps: [], priorities: [] },
    });
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.updateStatus(
          COMPANY_A,
          String(base._id),
          { status: ManagementReviewDirectionStatus.COMPLETED } as never,
          actor,
        ),
      BadRequestException,
    );
  });

  it('31. COMPLETED sin contenido mínimo (analysis o decisions) → BadRequest', async () => {
    const base = buildReviewDoc({
      status: ManagementReviewDirectionStatus.IN_PROGRESS,
      actualStartDate: new Date(),
      actualEndDate: new Date(),
      minutesEvidenceUrl: 'https://empresa.com/acta.pdf',
    });
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.updateStatus(
          COMPANY_A,
          String(base._id),
          { status: ManagementReviewDirectionStatus.COMPLETED } as never,
          actor,
        ),
      BadRequestException,
    );
  });

  it('32. ruta completa DRAFT→PLANNED→IN_PROGRESS→COMPLETED con integridad', async () => {
    const base = buildReviewDoc({ plannedDate: new Date('2030-01-01'), responsibleUserId: USER_A });
    const { service } = buildService([base]);
    await service.updateStatus(COMPANY_A, String(base._id), { status: ManagementReviewDirectionStatus.PLANNED } as never, actor);
    await service.update(COMPANY_A, String(base._id), { actualStartDate: '2026-03-01' } as never, actor);
    await service.updateStatus(COMPANY_A, String(base._id), { status: ManagementReviewDirectionStatus.IN_PROGRESS } as never, actor);
    await service.update(
      COMPANY_A,
      String(base._id),
      {
        actualEndDate: '2026-03-20',
        minutesEvidenceUrl: 'https://empresa.com/acta.pdf',
        analysis: { summary: 'La dirección revisó los resultados del SG-SST', strengths: [], gaps: [], priorities: [] },
      } as never,
      actor,
    );
    const completed = await service.updateStatus(
      COMPANY_A,
      String(base._id),
      { status: ManagementReviewDirectionStatus.COMPLETED, comment: 'cierre' } as never,
      actor,
    );
    assert.equal(completed.status, ManagementReviewDirectionStatus.COMPLETED);
  });

  it('33. COMPLETED es inmutable (update bloqueado)', async () => {
    const done = buildReviewDoc({ status: ManagementReviewDirectionStatus.COMPLETED });
    const { service } = buildService([done]);
    await assert.rejects(
      () => service.update(COMPANY_A, String(done._id), { title: 'nuevo' } as never, actor),
      BadRequestException,
    );
  });
});

// ─── Inputs (entradas) ──────────────────────────────────────────────────────

describe('MRD: Entradas (inputs)', () => {
  it('34. crea input con _id, estado default PENDING e historial INPUT_CREATED', async () => {
    const base = buildReviewDoc();
    const { service, history } = buildService([base]);
    const dto = { type: 'AUDIT_RESULTS', title: 'Resultados auditoría anual' } as CreateReviewInputDto;
    const saved = await service.addInput(COMPANY_A, String(base._id), dto, actor);
    assert.equal(saved.inputs.length, 1);
    assert.ok(saved.inputs[0]._id);
    assert.equal(saved.inputs[0].status, ManagementReviewInputStatus.PENDING);
    assert.equal(history.created[0]?.action, 'INPUT_CREATED');
  });

  it('35. actualiza input e historial INPUT_UPDATED', async () => {
    const base = buildReviewDoc();
    const { service, history } = buildService([base]);
    await service.addInput(COMPANY_A, String(base._id), { type: 'OTHER', title: 't' } as never, actor);
    const inputId = String(base.inputs[0]._id);
    const saved = await service.updateInput(COMPANY_A, String(base._id), inputId, { status: 'REVIEWED' } as never, actor);
    assert.equal(saved.inputs[0].status, ManagementReviewInputStatus.REVIEWED);
    assert.equal(history.created[1]?.action, 'INPUT_UPDATED');
  });

  it('36. input en revisión COMPLETED rechazado', async () => {
    const base = buildReviewDoc({ status: ManagementReviewDirectionStatus.COMPLETED });
    const { service } = buildService([base]);
    await assert.rejects(
      () => service.addInput(COMPANY_A, String(base._id), { type: 'OTHER', title: 'x' } as never, actor),
      BadRequestException,
    );
  });

  it('37. input conserva snapshot/referencia declarativa (sourceModule/sourceEntityId)', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    const sourceEntityId = new Types.ObjectId().toString();
    const saved = await service.addInput(
      COMPANY_A,
      String(base._id),
      { type: 'AUDIT_RESULTS', title: 'Auditoría 2026', sourceModule: 'annual-audit', sourceEntityId } as never,
      actor,
    );
    // La referencia es declarativa: se almacena tal cual, sin recálculo.
    assert.equal(saved.inputs[0].sourceModule, 'annual-audit');
    assert.equal(saved.inputs[0].sourceEntityId, sourceEntityId);
  });

  it('38. input inexistente en revisión del tenant → 404', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.updateInput(COMPANY_A, String(base._id), new Types.ObjectId().toString(), { status: 'REVIEWED' } as never, actor),
      NotFoundException,
    );
  });
});

// ─── Decisiones ─────────────────────────────────────────────────────────────

describe('MRD: Decisiones de dirección (dominio propio)', () => {
  it('39. crea decisión con estado default PENDING e historial DECISION_CREATED', async () => {
    const base = buildReviewDoc();
    const { service, history } = buildService([base]);
    const dto = { description: 'Ampliar recursos de capacitación', category: 'RESOURCE' } as CreateReviewDecisionDto;
    const saved = await service.addDecision(COMPANY_A, String(base._id), dto, actor);
    assert.equal(saved.decisions.length, 1);
    assert.equal(saved.decisions[0].status, ManagementReviewDecisionStatus.PENDING);
    assert.equal(history.created[0]?.action, 'DECISION_CREATED');
  });

  it('40. actualiza decisión e historial DECISION_UPDATED', async () => {
    const base = buildReviewDoc();
    const { service, history } = buildService([base]);
    await service.addDecision(COMPANY_A, String(base._id), { description: 'd', category: 'OTHER' } as never, actor);
    const decisionId = String(base.decisions[0]._id);
    const saved = await service.updateDecision(
      COMPANY_A,
      String(base._id),
      decisionId,
      { status: 'IN_PROGRESS' } as never,
      actor,
    );
    assert.equal(saved.decisions[0].status, ManagementReviewDecisionStatus.IN_PROGRESS);
    assert.equal(history.created[1]?.action, 'DECISION_UPDATED');
  });

  it('41. responsable de decisión cross-tenant → BadRequest', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.addDecision(
          COMPANY_A,
          String(base._id),
          { description: 'd', category: 'OTHER', responsibleUserId: new Types.ObjectId().toString() } as never,
          actor,
        ),
      BadRequestException,
    );
  });

  it('42. dueDate inválida → rechazada por validateSync (@IsDateString)', () => {
    const dto = Object.assign(new CreateReviewDecisionDto(), {
      description: 'd',
      category: 'OTHER',
      dueDate: 'no-es-fecha',
    });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(errors.some((e) => e.property === 'dueDate'));
  });

  it('43. estado de decisión fuera del enum → rechazado (no existe OVERDUE persistente)', () => {
    const dto = Object.assign(new CreateReviewDecisionDto(), {
      description: 'd',
      category: 'OTHER',
      status: 'OVERDUE',
    });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(errors.some((e) => e.property === 'status'));
  });

  it('44. vencimiento se DERIVA dinámicamente (isDecisionOverdue), nunca persiste', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Pendiente con dueDate ayer → vencida (derivada).
    assert.equal(isDecisionOverdue({ status: ManagementReviewDecisionStatus.PENDING, dueDate: yesterday }), true);
    // Pendiente con dueDate mañana → no vencida.
    assert.equal(isDecisionOverdue({ status: ManagementReviewDecisionStatus.PENDING, dueDate: tomorrow }), false);
    // Terminal con dueDate ayer → NO vencida (estados terminales no vencen).
    assert.equal(isDecisionOverdue({ status: ManagementReviewDecisionStatus.COMPLETED, dueDate: yesterday }), false);
    assert.equal(isDecisionOverdue({ status: ManagementReviewDecisionStatus.CANCELLED, dueDate: yesterday }), false);
    // Sin dueDate → nunca vencida.
    assert.equal(isDecisionOverdue({ status: ManagementReviewDecisionStatus.PENDING }), false);
  });
});

// ─── Historial ──────────────────────────────────────────────────────────────

describe('MRD: Historial (server-side, append-only)', () => {
  it('45. cada mutación registra un evento con usuario y tenant', async () => {
    const base = buildReviewDoc({ plannedDate: new Date('2030-01-01'), responsibleUserId: USER_A });
    const { service, history } = buildService([base]);
    await service.create(COMPANY_A, { title: 'R2' } as never, actor);
    await service.updateStatus(COMPANY_A, String(base._id), { status: ManagementReviewDirectionStatus.PLANNED } as never, actor);
    await service.update(COMPANY_A, String(base._id), { title: 'Nuevo título' } as never, actor);
    await service.addInput(COMPANY_A, String(base._id), { type: 'OTHER', title: 'in' } as never, actor);
    await service.addDecision(COMPANY_A, String(base._id), { description: 'd', category: 'OTHER' } as never, actor);
    const actions = history.created.map((h) => h.action);
    assert.ok(actions.includes('CREATE'));
    assert.ok(actions.includes('STATUS_CHANGE'));
    assert.ok(actions.includes('UPDATE'));
    assert.ok(actions.includes('INPUT_CREATED'));
    assert.ok(actions.includes('DECISION_CREATED'));
    for (const h of history.created) {
      assert.equal(String(h.companyId), String(COMPANY_A));
      assert.equal(h.userEmail, actor.userEmail);
    }
  });

  it('46. EVIDENCE_ATTACHED se registra al adjuntar acta documental', async () => {
    const base = buildReviewDoc();
    const { service, history } = buildService([base]);
    await service.attachMinutesEvidence(COMPANY_A, String(base._id), { documentId: DOC_A } as never, actor);
    assert.equal(history.created[0]?.action, 'EVIDENCE_ATTACHED');
  });

  it('47. no existe vía de escritura del historial desde el DTO (forbidNonWhitelisted)', () => {
    // companyId/history/timestamps jamás en ningún DTO.
    for (const dtoClass of [
      CreateManagementReviewDirectionDto,
      UpdateManagementReviewDirectionDto,
      UpdateManagementReviewDirectionStatusDto,
    ]) {
      const proto = dtoClass.prototype as Record<string, unknown>;
      assert.ok(!('history' in proto), `${dtoClass.name} no debe exponer history`);
      assert.ok(!('companyId' in proto), `${dtoClass.name} no debe exponer companyId`);
      assert.ok(!('timestamps' in proto), `${dtoClass.name} no debe exponer timestamps`);
    }
    // status solo existe en el DTO del endpoint dedicado (server-controlled
    // en PATCH de contenido).
    for (const dtoClass of [CreateManagementReviewDirectionDto, UpdateManagementReviewDirectionDto]) {
      const proto = dtoClass.prototype as Record<string, unknown>;
      assert.ok(!('status' in proto), `${dtoClass.name} no debe exponer status`);
    }
  });
});

// ─── Evidencia ──────────────────────────────────────────────────────────────

describe('MRD: Evidencia documental (DocumentMaster tenant-safe)', () => {
  it('48. documento del mismo tenant: ok + EVIDENCE_ATTACHED', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    const saved = await service.attachMinutesEvidence(COMPANY_A, String(base._id), { documentId: DOC_A } as never, actor);
    assert.equal(String(saved.minutesDocumentId), DOC_A);
  });

  it('49. documento de OTRO tenant → 404 (cross-tenant document rejected)', async () => {
    const base = buildReviewDoc();
    // El documento demo pertenece a la empresa B.
    const { service } = buildService([base], { visibleTo: COMPANY_B });
    await assert.rejects(
      () => service.attachMinutesEvidence(COMPANY_A, String(base._id), { documentId: DOC_A } as never, actor),
      NotFoundException,
    );
  });

  it('50. documento inexistente → 404', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base]);
    await assert.rejects(
      () =>
        service.attachMinutesEvidence(
          COMPANY_A,
          String(base._id),
          { documentId: new Types.ObjectId().toString() } as never,
          actor,
        ),
      NotFoundException,
    );
  });

  it('51. evidencia con documento cross-tenant en input → rechazada', async () => {
    const base = buildReviewDoc();
    const { service } = buildService([base], { visibleTo: COMPANY_B });
    await assert.rejects(
      () =>
        service.addInput(
          COMPANY_A,
          String(base._id),
          { type: 'OTHER', title: 'x', evidenceDocumentId: DOC_A } as never,
          actor,
        ),
      NotFoundException,
    );
  });
});

// ─── DTOs estrictos (contrato de payload) ───────────────────────────────────

describe('MRD: DTOs estrictos (validateSync = ValidationPipe global)', () => {
  const OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

  it('52. Create DTO no acepta companyId, createdBy, history, timestamps, status', () => {
    const malicious = Object.assign(new CreateManagementReviewDirectionDto(), {
      title: 'R',
      companyId: String(COMPANY_B),
      createdBy: String(USER_A),
      history: [],
      timestamps: true,
      status: 'COMPLETED',
    });
    const errors = validateSync(malicious, OPTIONS);
    const rejected = errors.map((e) => e.property);
    for (const forbidden of ['companyId', 'createdBy', 'history', 'timestamps', 'status']) {
      assert.ok(rejected.includes(forbidden), `campo prohibido rechazado: ${forbidden}`);
    }
  });

  it('53. Update DTO no acepta campos server-controlled', () => {
    const malicious = Object.assign(new UpdateManagementReviewDirectionDto(), {
      companyId: String(COMPANY_B),
      createdBy: String(USER_A),
      history: [],
      status: 'COMPLETED',
    });
    const errors = validateSync(malicious, OPTIONS);
    const rejected = errors.map((e) => e.property);
    for (const forbidden of ['companyId', 'createdBy', 'history', 'status']) {
      assert.ok(rejected.includes(forbidden), `campo prohibido rechazado: ${forbidden}`);
    }
  });

  it('54. DTO válido mínimo pasa sin errores', () => {
    const dto = Object.assign(new CreateManagementReviewDirectionDto(), {
      title: 'Revisión por la dirección 2026',
      reviewType: 'ORDINARY',
      plannedDate: '2030-06-01',
    });
    assert.equal(validateSync(dto, OPTIONS).length, 0);
  });

  it('55. reviewType fuera del enum → rechazado (solo ORDINARY/EXTRAORDINARY)', () => {
    const dto = Object.assign(new CreateManagementReviewDirectionDto(), { title: 'R', reviewType: 'MENSUAL' });
    const errors = validateSync(dto, OPTIONS);
    assert.ok(errors.some((e) => e.property === 'reviewType'));
  });
});
