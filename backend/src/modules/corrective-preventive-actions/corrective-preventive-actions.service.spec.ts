import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import 'reflect-metadata';
import { Types, Model } from 'mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import {
  CorrectivePreventiveActionsService,
  CpaActor,
} from './corrective-preventive-actions.service';
import { CorrectivePreventiveActionsController } from './corrective-preventive-actions.controller';
import {
  ActionItemType,
  ActionOrigin,
  ActionPriority,
  ActionStatus,
  CorrectivePreventiveAction,
  CorrectivePreventiveActionDocument,
  EffectivenessResult,
} from './schemas/corrective-preventive-action.schema';
import {
  CorrectivePreventiveActionHistory,
  CorrectivePreventiveActionHistoryDocument,
} from './schemas/corrective-preventive-action-history.schema';
import {
  CreateCorrectivePreventiveActionDto,
  UpdateCorrectivePreventiveActionDto,
} from './dto/corrective-preventive-action.dto';
import type { UserDocument } from '../users/schemas/user.schema';
import type { DocumentMaster } from '../document-management/schemas/document-master.schema';

/**
 * E1 (7.1.1) — Tests del dominio corrective-preventive-actions.
 *
 * Cobertura: CRUD + máquina de estados + evidencia + verificación de eficacia,
 * historial append-only, responsable tenant-safe, roles (guard REAL) y
 * aislamiento multi-tenant (404 cross-tenant). SIN SCORING por diseño
 * (frontera 7.1.1; el scorer/provider llegan en E2).
 *
 * Estilo: node:test + fakes manuales (patrón copasst-audit-planning.spec.ts).
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();
const USER_A = new Types.ObjectId();
const USER_B = new Types.ObjectId();

const actor: CpaActor = { userId: USER_A, userEmail: 'actor@test.com' };
const actorB: CpaActor = { userId: USER_B, userEmail: 'actor@b.com' };

const DUE = '2026-06-30';
const PLANNED = '2026-03-01';
const EXECUTED = '2026-04-15';

function buildActionDoc(overrides: Partial<CorrectivePreventiveAction> = {}): CorrectivePreventiveAction {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    type: ActionItemType.CORRECTIVE,
    title: 'Acción correctiva por hallazgo de auditoría',
    description: 'Cerrar la no conformidad detectada en la auditoría interna',
    origin: ActionOrigin.AUDIT_6_1_2,
    priority: ActionPriority.MEDIUM,
    responsibleUserId: USER_A,
    dueDate: new Date(DUE),
    status: ActionStatus.PENDING,
    ...overrides,
  } as CorrectivePreventiveAction;
}

function buildFakeModel(initialDocs: CorrectivePreventiveAction[] = []) {
  const docs: Map<string, CorrectivePreventiveAction> = new Map();
  for (const d of initialDocs) {
    docs.set(String(d._id), d);
  }

  // save() persistente para emular Mongoose (los cambios quedan).
  const withSave = (doc: CorrectivePreventiveAction) => {
    (doc as unknown as { save: () => Promise<CorrectivePreventiveAction> }).save = async () => {
      docs.set(String(doc._id), doc);
      return doc;
    };
    return doc;
  };

  const model = {
    async create(payload: Record<string, unknown>) {
      const doc = buildActionDoc(payload as Partial<CorrectivePreventiveAction>);
      doc._id = new Types.ObjectId();
      // Simular el índice único {companyId, actionCode}.
      for (const existing of docs.values()) {
        if (
          String(existing.companyId) === String(doc.companyId) &&
          doc.actionCode &&
          existing.actionCode === doc.actionCode
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
        if (query.type && d.type !== query.type) return false;
        if (query.priority && d.priority !== query.priority) return false;
        if (query.origin && d.origin !== query.origin) return false;
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
  } as unknown as Model<CorrectivePreventiveActionDocument>;

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
    } as unknown as Model<CorrectivePreventiveActionHistoryDocument>,
  };
}

function buildFakeUserModel(users: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId; firstName?: string; lastName?: string; email?: string }>) {
  return {
    countDocuments: (query: { _id: Types.ObjectId | { $in: Types.ObjectId[] }; companyId: Types.ObjectId }) => ({
      exec: async () => {
        // Soporta ambas formas reales de Mongo: {_id: ObjectId} directo y
        // {_id: {$in: [...]}} (bulk tenant-safe del service).
        const ids = query._id && typeof query._id === 'object' && '$in' in query._id
          ? (query._id as { $in: Types.ObjectId[] }).$in
          : [query._id as Types.ObjectId];
        return users.filter(
          (u) =>
            ids.some((id) => String(id) === String(u._id)) &&
            String(u.companyId) === String(query.companyId),
        ).length;
      },
    }),
    findOne: (query: { _id: Types.ObjectId; companyId: Types.ObjectId }) => ({
      select: () => ({
        exec: async () =>
          users.find(
            (u) => String(u._id) === String(query._id) && String(u.companyId) === String(query.companyId),
          ) ?? null,
      }),
    }),
  } as unknown as Model<UserDocument>;
}

function buildFakeDocumentModel(docs: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId; code?: string; name?: string }> = []) {
  return {
    findOne: (query: { _id: Types.ObjectId; companyId: Types.ObjectId }) => ({
      select: () => ({
        exec: async () =>
          docs.find(
            (d) => String(d._id) === String(query._id) && String(d.companyId) === String(query.companyId),
          ) ?? null,
      }),
    }),
  } as never;
}

function buildService(
  initialDocs: CorrectivePreventiveAction[] = [],
  opts: {
    users?: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId; firstName?: string; lastName?: string; email?: string }>;
    documents?: Array<{ _id: Types.ObjectId; companyId: Types.ObjectId; code?: string; name?: string }>;
  } = {},
) {
  const actions = buildFakeModel(initialDocs);
  const history = buildFakeHistoryModel();
  const users = opts.users ?? [
    { _id: USER_A, companyId: COMPANY_A, firstName: 'Ana', lastName: 'Gómez', email: 'ana@a.com' },
    { _id: USER_B, companyId: COMPANY_B, firstName: 'Beto', lastName: 'Ruiz', email: 'beto@b.com' },
  ];
  const service = new CorrectivePreventiveActionsService(
    actions.model,
    history.model,
    buildFakeUserModel(users),
    buildFakeDocumentModel(opts.documents ?? [
      { _id: new Types.ObjectId(), companyId: COMPANY_A, code: 'DOC-01', name: 'Acta de auditoría' },
    ]),
  );
  return { service, actions, history };
}

function buildValidCreateDto(overrides: Partial<CreateCorrectivePreventiveActionDto> = {}): CreateCorrectivePreventiveActionDto {
  return {
    type: ActionItemType.CORRECTIVE,
    title: 'Acción correctiva por hallazgo de auditoría',
    description: 'Cerrar la no conformidad detectada en la auditoría interna',
    origin: ActionOrigin.AUDIT_6_1_2,
    priority: ActionPriority.MEDIUM,
    responsibleUserId: String(USER_A),
    dueDate: DUE,
    ...overrides,
  } as CreateCorrectivePreventiveActionDto;
}

// ─── Tenant ──────────────────────────────────────────────────────────────────

describe('CPA: TENANT', () => {
  it('1. crea acción para tenant A con companyId server-side e historial CREATE', async () => {
    const { service, history } = buildService();
    const created = await service.create(COMPANY_A, buildValidCreateDto(), actor);
    assert.equal(String(created.companyId), String(COMPANY_A));
    assert.equal(created.status, ActionStatus.PENDING);
    assert.equal(String(created.createdBy), String(USER_A));
    assert.equal(created.createdBySnapshot, actor.userEmail);
    assert.equal(history.created[0]?.action, 'CREATE');
    assert.equal(String(history.created[0]?.companyId), String(COMPANY_A));
  });

  it('2. tenant B NO puede leer una acción de A (findOne {_id, companyId} → 404)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const action = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.findById(COMPANY_B, String(action[0]._id)),
      NotFoundException,
    );
  });

  it('3. tenant B NO puede modificar una acción de A', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.update(COMPANY_B, String(action._id), { title: 'hack' } as UpdateCorrectivePreventiveActionDto, actorB),
      NotFoundException,
    );
  });

  it('4. tenant B NO puede cambiar estado', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.changeStatus(COMPANY_B, String(action._id), { status: ActionStatus.IN_PROGRESS }, actorB),
      NotFoundException,
    );
  });

  it('5. tenant B NO puede agregar evidencia', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.addEvidence(COMPANY_B, String(action._id), { evidenceUrl: 'https://x.com/e.pdf' }, actorB),
      NotFoundException,
    );
  });

  it('6. tenant B NO puede verificar eficacia', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.verifyEffectiveness(COMPANY_B, String(action._id), { result: EffectivenessResult.EFECTIVA }, actorB),
      NotFoundException,
    );
  });

  it('7. tenant B NO puede consultar historial', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(() => service.getHistory(COMPANY_B, String(action._id)), NotFoundException);
  });
});

// ─── Estados ─────────────────────────────────────────────────────────────────

describe('CPA: ESTADOS', () => {
  it('8. PENDING → IN_PROGRESS permitido', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.IN_PROGRESS }, actor);
    assert.equal(saved.status, ActionStatus.IN_PROGRESS);
  });

  it('9. IN_PROGRESS → COMPLETED exige executionDate y sella cierre', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.IN_PROGRESS }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.COMPLETED }, actor),
      BadRequestException,
    );
    await service.update(COMPANY_A, String(action._id), { executionDate: EXECUTED } as UpdateCorrectivePreventiveActionDto, actor);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.COMPLETED }, actor);
    assert.equal(saved.status, ActionStatus.COMPLETED);
    assert.ok(saved.closureDate);
    assert.equal(String(saved.closedByUserId), String(USER_A));
  });

  it('10. PENDING → CANCELLED permitido (sin exigir ejecución)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.CANCELLED }, actor);
    assert.equal(saved.status, ActionStatus.CANCELLED);
  });

  it('11. IN_PROGRESS → CANCELLED permitido', async () => {
    const { service } = buildService([buildActionDoc({ status: ActionStatus.IN_PROGRESS })]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.CANCELLED }, actor);
    assert.equal(saved.status, ActionStatus.CANCELLED);
  });

  it('12. COMPLETED → IN_PROGRESS impedido (terminal)', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED), closureDate: new Date() }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.IN_PROGRESS }, actor),
      BadRequestException,
    );
  });

  it('13. CANCELLED → IN_PROGRESS impedido (terminal)', async () => {
    const { service } = buildService([buildActionDoc({ status: ActionStatus.CANCELLED })]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.IN_PROGRESS }, actor),
      BadRequestException,
    );
  });
});

// ─── Responsable ─────────────────────────────────────────────────────────────

describe('CPA: RESPONSABLE', () => {
  it('14. responsable del mismo tenant permitido (snapshot server-side)', async () => {
    const { service } = buildService();
    const created = await service.create(COMPANY_A, buildValidCreateDto(), actor);
    assert.equal(String(created.responsibleUserId), String(USER_A));
    assert.equal(created.responsibleSnapshot, 'Ana Gómez');
  });

  it('15. responsable de otro tenant rechazado', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.create(COMPANY_A, buildValidCreateDto({ responsibleUserId: String(USER_B) }), actor),
      BadRequestException,
    );
  });
});

// ─── Fechas ──────────────────────────────────────────────────────────────────

describe('CPA: FECHAS', () => {
  it('16. dueDate inválida rechazada', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.create(COMPANY_A, buildValidCreateDto({ dueDate: 'no-es-fecha' }), actor),
      BadRequestException,
    );
  });

  it('17. plannedDate posterior a dueDate rechazada', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.create(COMPANY_A, buildValidCreateDto({ plannedDate: '2026-12-31' }), actor),
      BadRequestException,
    );
  });

  it('18. executionDate anterior a plannedDate rechazada', async () => {
    const { service } = buildService([buildActionDoc({ status: ActionStatus.IN_PROGRESS, plannedDate: new Date(PLANNED) })]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.update(COMPANY_A, String(action._id), { executionDate: '2026-01-01' } as UpdateCorrectivePreventiveActionDto, actor),
      BadRequestException,
    );
  });

  it('19. verificationDate futura rechazada', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await assert.rejects(
      () => service.verifyEffectiveness(COMPANY_A, String(action._id), { result: EffectivenessResult.EFECTIVA, verificationDate: future }, actor),
      BadRequestException,
    );
  });
});

// ─── Eficacia ────────────────────────────────────────────────────────────────

describe('CPA: EFICACIA', () => {
  it('20. NO permite verificación antes de COMPLETED', async () => {
    const { service } = buildService([buildActionDoc({ status: ActionStatus.PENDING })]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.verifyEffectiveness(COMPANY_A, String(action._id), { result: EffectivenessResult.EFECTIVA }, actor),
      BadRequestException,
    );
  });

  it('21. permite EFECTIVA sobre COMPLETED', async () => {
    const { service, history } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.verifyEffectiveness(COMPANY_A, String(action._id), { result: EffectivenessResult.EFECTIVA }, actor);
    assert.equal(saved.effectivenessVerification?.verified, true);
    assert.equal(saved.effectivenessVerification?.result, EffectivenessResult.EFECTIVA);
    assert.equal(history.created.at(-1)?.action, 'EFFECTIVENESS');
  });

  it('22. permite NO_EFECTIVA', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.verifyEffectiveness(COMPANY_A, String(action._id), { result: EffectivenessResult.NO_EFECTIVA }, actor);
    assert.equal(saved.effectivenessVerification?.result, EffectivenessResult.NO_EFECTIVA);
  });

  it('23. permite REQUIERE_NUEVA_ACCION (trazabilidad; no crea otra acción)', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.verifyEffectiveness(COMPANY_A, String(action._id), { result: EffectivenessResult.REQUIERE_NUEVA_ACCION }, actor);
    assert.equal(saved.effectivenessVerification?.result, EffectivenessResult.REQUIERE_NUEVA_ACCION);
  });

  it('24. verificador cross-tenant rechazado (actor de B no puede verificar en A)', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.verifyEffectiveness(COMPANY_A, String(action._id), { result: EffectivenessResult.EFECTIVA }, actorB),
      ForbiddenException,
    );
  });
});

// ─── Historial ───────────────────────────────────────────────────────────────

describe('CPA: HISTORIAL', () => {
  it('25. CREATE genera historial', async () => {
    const { service, history } = buildService();
    const created = await service.create(COMPANY_A, buildValidCreateDto(), actor);
    assert.equal(history.created[0]?.action, 'CREATE');
    assert.equal(String(history.created[0]?.actionId), String(created._id));
  });

  it('26. UPDATE genera historial', async () => {
    const { service, history } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await service.update(COMPANY_A, String(action._id), { title: 'Título actualizado' } as UpdateCorrectivePreventiveActionDto, actor);
    assert.equal(history.created.at(-1)?.action, 'UPDATE');
  });

  it('27. STATUS_CHANGE genera historial', async () => {
    const { service, history } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await service.changeStatus(COMPANY_A, String(action._id), { status: ActionStatus.IN_PROGRESS }, actor);
    assert.equal(history.created.at(-1)?.action, 'STATUS_CHANGE');
  });

  it('28. EVIDENCE genera historial', async () => {
    const { service, history } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await service.addEvidence(COMPANY_A, String(action._id), { evidenceUrl: 'https://x.com/soporte.pdf' }, actor);
    assert.equal(history.created.at(-1)?.action, 'EVIDENCE');
  });

  it('29. EFFECTIVENESS genera historial', async () => {
    const { service, history } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    await service.verifyEffectiveness(COMPANY_A, String(action._id), { result: EffectivenessResult.EFECTIVA }, actor);
    assert.equal(history.created.at(-1)?.action, 'EFFECTIVENESS');
  });
});

// ─── DTO / seguridad ─────────────────────────────────────────────────────────

describe('CPA: DTO / SEGURIDAD', () => {
  it('30. companyId enviado desde cliente NO modifica el tenant (server-side)', async () => {
    const { service } = buildService();
    const dto = buildValidCreateDto({ companyId: COMPANY_B } as never);
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(String(created.companyId), String(COMPANY_A));
  });

  it('31. createdBy/updatedBy enviados desde cliente NO modifican el actor', async () => {
    const { service } = buildService();
    const dto = buildValidCreateDto({
      createdBy: USER_B,
      createdBySnapshot: 'intruso@b.com',
    } as never);
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(String(created.createdBy), String(USER_A));
    assert.equal(created.createdBySnapshot, actor.userEmail);
  });

  it('32. status enviado por update general NO cambia el estado (solo /status)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.update(
      COMPANY_A,
      String(action._id),
      { status: ActionStatus.COMPLETED } as never,
      actor,
    );
    assert.equal(saved.status, ActionStatus.PENDING);
  });

  it('33. acción COMPLETED no permite editar campos operativos (terminal)', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ActionStatus.COMPLETED, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.update(COMPANY_A, String(action._id), { title: 'cambio' } as UpdateCorrectivePreventiveActionDto, actor),
      BadRequestException,
    );
  });

  it('34. acción CANCELLED no puede reactivarse (terminal, sin endpoints de reapertura)', async () => {
    const { service } = buildService([buildActionDoc({ status: ActionStatus.CANCELLED })]);
    const [action] = await service.findAll(COMPANY_A);
    for (const next of [ActionStatus.PENDING, ActionStatus.IN_PROGRESS, ActionStatus.COMPLETED]) {
      await assert.rejects(
        () => service.changeStatus(COMPANY_A, String(action._id), { status: next }, actor),
        BadRequestException,
      );
    }
  });
});

// ─── Evidencia (complemento) ─────────────────────────────────────────────────

describe('CPA: EVIDENCIA (declarativa tenant-safe)', () => {
  it('valida documentId contra DocumentMaster del tenant (cross-tenant → 404)', async () => {
    const { service } = buildService([buildActionDoc()], {
      documents: [{ _id: new Types.ObjectId(), companyId: COMPANY_B, code: 'DOC-B', name: 'Doc de B' }],
    });
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.addEvidence(COMPANY_A, String(action._id), { documentId: String(USER_B) }, actor),
      NotFoundException,
    );
  });

  it('exige documentId o evidenceUrl', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.addEvidence(COMPANY_A, String(action._id), {}, actor),
      BadRequestException,
    );
  });
});

// ─── Roles (guard REAL) ──────────────────────────────────────────────────────

describe('CPA: ROLES (RolesGuard real)', () => {
  it('owner/admin escriben; manager y member NO (write endpoints)', async () => {
    const { service } = buildService();
    const usersService = {
      findByFirebaseUid: async () => ({ _id: USER_A, companyId: COMPANY_A, email: 'u@a.com' }),
    } as unknown as UsersService;
    const controller = new CorrectivePreventiveActionsController(service, usersService);
    const request = { user: { uid: 'uid-x' } } as never;

    const writeRoles = ['owner', 'admin'];
    const guardOwner = new RolesGuard(
      { getAllAndOverride: () => writeRoles } as never,
      { findOne: () => ({ lean: () => ({ exec: async () => ({ role: 'owner' }) }) }) } as never,
    );
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => CorrectivePreventiveActionsController,
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
});
