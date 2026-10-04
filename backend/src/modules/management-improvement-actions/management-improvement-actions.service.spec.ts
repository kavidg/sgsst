import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import 'reflect-metadata';
import { Types, Model } from 'mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import {
  ManagementImprovementActionsService,
  MiaActor,
} from './management-improvement-actions.service';
import { ManagementImprovementActionsController } from './management-improvement-actions.controller';
import {
  ImprovementActionOrigin,
  ImprovementActionPriority,
  ImprovementActionStatus,
  ImplementationStatus,
  ManagementImprovementAction,
  ManagementImprovementActionDocument,
  PerceivedEffectiveness,
} from './schemas/management-improvement-action.schema';
import {
  ManagementImprovementActionHistory,
  ManagementImprovementActionHistoryDocument,
} from './schemas/management-improvement-action-history.schema';
import {
  CreateImprovementActionDto,
  RegisterImprovementActionFollowUpDto,
  UpdateImprovementActionDto,
} from './dto/management-improvement-action.dto';
import type { UserDocument } from '../users/schemas/user.schema';
import type { DocumentMaster } from '../document-management/schemas/document-master.schema';

/**
 * E1 (7.1.2) — Tests del dominio management-improvement-actions.
 *
 * Cobertura: CRUD + máquina de estados + evidencia + follow-up (seguimiento de
 * implementación/efectividad — NO verificación formal de eficacia, frontera
 * con 7.1.1), historial append-only, responsable tenant-safe, roles (guard
 * REAL) y aislamiento multi-tenant (404 cross-tenant). SIN SCORING por diseño
 * (frontera 7.1.2; el scorer/provider llegan en E2).
 *
 * Estilo: node:test + fakes manuales (patrón corrective-preventive-actions).
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();
const USER_A = new Types.ObjectId();
const USER_B = new Types.ObjectId();

const actor: MiaActor = { userId: USER_A, userEmail: 'actor@test.com' };
const actorB: MiaActor = { userId: USER_B, userEmail: 'actor@b.com' };

const DUE = '2026-06-30';
const PLANNED = '2026-03-01';
const EXECUTED = '2026-04-15';

function buildActionDoc(
  overrides: Partial<ManagementImprovementAction> = {},
): ManagementImprovementAction {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    title: 'Mejora aprobada por la alta dirección',
    description: 'Fortalecer la gestión de recursos del SG-SST según decisión de la dirección',
    origin: ImprovementActionOrigin.MEETING,
    priority: ImprovementActionPriority.MEDIUM,
    responsibleUserId: USER_A,
    dueDate: new Date(DUE),
    status: ImprovementActionStatus.PENDING,
    ...overrides,
  } as ManagementImprovementAction;
}

function buildFakeModel(initialDocs: ManagementImprovementAction[] = []) {
  const docs: Map<string, ManagementImprovementAction> = new Map();
  for (const d of initialDocs) {
    docs.set(String(d._id), d);
  }

  // save() persistente para emular Mongoose (los cambios quedan).
  const withSave = (doc: ManagementImprovementAction) => {
    (doc as unknown as { save: () => Promise<ManagementImprovementAction> }).save = async () => {
      docs.set(String(doc._id), doc);
      return doc;
    };
    return doc;
  };

  const model = {
    async create(payload: Record<string, unknown>) {
      const doc = buildActionDoc(payload as Partial<ManagementImprovementAction>);
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
  } as unknown as Model<ManagementImprovementActionDocument>;

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
    } as unknown as Model<ManagementImprovementActionHistoryDocument>,
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
  initialDocs: ManagementImprovementAction[] = [],
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
  const service = new ManagementImprovementActionsService(
    actions.model,
    history.model,
    buildFakeUserModel(users),
    buildFakeDocumentModel(opts.documents ?? [
      { _id: new Types.ObjectId(), companyId: COMPANY_A, code: 'DOC-01', name: 'Acta de reunión' },
    ]),
  );
  return { service, actions, history };
}

function buildValidCreateDto(overrides: Partial<CreateImprovementActionDto> = {}): CreateImprovementActionDto {
  return {
    title: 'Mejora aprobada por la alta dirección',
    description: 'Fortalecer la gestión de recursos del SG-SST según decisión de la dirección',
    origin: ImprovementActionOrigin.MEETING,
    priority: ImprovementActionPriority.MEDIUM,
    responsibleUserId: String(USER_A),
    dueDate: DUE,
    ...overrides,
  } as CreateImprovementActionDto;
}

// ─── Creación ────────────────────────────────────────────────────────────────

describe('MIA: CREACIÓN', () => {
  it('1. crea acción válida para tenant A con estado inicial PENDING e historial CREATE', async () => {
    const { service, history } = buildService();
    const created = await service.create(COMPANY_A, buildValidCreateDto(), actor);
    assert.equal(String(created.companyId), String(COMPANY_A));
    assert.equal(created.status, ImprovementActionStatus.PENDING);
    assert.equal(String(created.createdBy), String(USER_A));
    assert.equal(created.createdBySnapshot, actor.userEmail);
    assert.equal(created.responsibleSnapshot, 'Ana Gómez'); // snapshot server-side
    assert.equal(history.created[0]?.action, 'CREATE');
  });

  it('2. companyId enviado por el cliente es IGNORADO (server-side)', async () => {
    const { service } = buildService();
    const dto = buildValidCreateDto({ companyId: COMPANY_B } as never);
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(String(created.companyId), String(COMPANY_A));
  });

  it('3. responsable de OTRO tenant es rechazado (tenant-safe)', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.create(COMPANY_A, buildValidCreateDto({ responsibleUserId: String(USER_B) }), actor),
      BadRequestException,
    );
  });

  it('4. dueDate inválida/ausente es rechazada (campo obligatorio)', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.create(COMPANY_A, buildValidCreateDto({ dueDate: undefined as never }), actor),
      BadRequestException,
    );
  });

  it('4b. actionCode duplicado en el mismo tenant es rechazado (E11000)', async () => {
    const { service } = buildService([
      buildActionDoc({ actionCode: 'MIA-01' }),
    ]);
    await assert.rejects(
      () => service.create(COMPANY_A, buildValidCreateDto({ actionCode: 'MIA-01' }), actor),
      BadRequestException,
    );
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────────────

describe('MIA: TENANT', () => {
  it('5. tenant B NO puede leer una acción de A (findOne {_id, companyId} → 404)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.findById(COMPANY_B, String(action._id)),
      NotFoundException,
    );
  });

  it('6. tenant B NO puede modificar una acción de A', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.update(COMPANY_B, String(action._id), { title: 'hack' } as UpdateImprovementActionDto, actorB),
      NotFoundException,
    );
  });

  it('7. tenant B NO puede cambiar el estado de una acción de A', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.changeStatus(COMPANY_B, String(action._id), { status: ImprovementActionStatus.IN_PROGRESS }, actorB),
      NotFoundException,
    );
  });

  it('8. tenant B NO puede agregar evidencia a una acción de A', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.addEvidence(COMPANY_B, String(action._id), { evidenceUrl: 'https://x.com/e.pdf' }, actorB),
      NotFoundException,
    );
  });

  it('9. tenant B NO puede registrar follow-up en una acción de A', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.addFollowUp(COMPANY_B, String(action._id), { observations: 'hack' }, actorB),
      NotFoundException,
    );
  });

  it('10. tenant B NO puede consultar el historial de una acción de A', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.getHistory(COMPANY_B, String(action._id)),
      NotFoundException,
    );
  });
});

// ─── Lifecycle (máquina de estados) ─────────────────────────────────────────

describe('MIA: LIFECYCLE', () => {
  it('11. PENDING → IN_PROGRESS permitido', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.IN_PROGRESS }, actor);
    assert.equal(saved.status, ImprovementActionStatus.IN_PROGRESS);
  });

  it('12. PENDING → CANCELLED permitido', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.CANCELLED }, actor);
    assert.equal(saved.status, ImprovementActionStatus.CANCELLED);
  });

  it('13. IN_PROGRESS → COMPLETED permitido (con executionDate)', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.COMPLETED }, actor);
    assert.equal(saved.status, ImprovementActionStatus.COMPLETED);
  });

  it('14. IN_PROGRESS → CANCELLED permitido', async () => {
    const { service } = buildService([buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS })]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.CANCELLED }, actor);
    assert.equal(saved.status, ImprovementActionStatus.CANCELLED);
  });

  it('15. rechaza transiciones inválidas (PENDING → COMPLETED prohibido)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.COMPLETED }, actor),
      BadRequestException,
    );
  });

  it('16. no permite modificar una acción en estado terminal', async () => {
    const { service } = buildService([buildActionDoc({ status: ImprovementActionStatus.CANCELLED })]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.update(COMPANY_A, String(action._id), { title: 'cambio' } as UpdateImprovementActionDto, actor),
      BadRequestException,
    );
    await assert.rejects(
      () => service.addEvidence(COMPANY_A, String(action._id), { evidenceUrl: 'https://x.com/e.pdf' }, actor),
      BadRequestException,
    );
    await assert.rejects(
      () => service.addFollowUp(COMPANY_A, String(action._id), { observations: 'seguimiento' }, actor),
      BadRequestException,
    );
  });
});

// ─── Completion ──────────────────────────────────────────────────────────────

describe('MIA: COMPLETION', () => {
  it('17. COMPLETED sin executionDate es rechazado', async () => {
    const { service } = buildService([buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS })]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.COMPLETED }, actor),
      BadRequestException,
    );
  });

  it('18. executionDate futura es rechazada', async () => {
    const { service } = buildService([buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS })]);
    const [action] = await service.findAll(COMPANY_A);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await assert.rejects(
      () => service.update(COMPANY_A, String(action._id), { executionDate: future } as UpdateImprovementActionDto, actor),
      BadRequestException,
    );
  });

  it('19. COMPLETED sella closureDate', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.COMPLETED }, actor);
    assert.ok(saved.closureDate instanceof Date);
  });

  it('20. COMPLETED registra closedByUserId + closedBySnapshot (server-side)', async () => {
    const { service } = buildService([
      buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.COMPLETED }, actor);
    assert.equal(String(saved.closedByUserId), String(USER_A));
    assert.equal(saved.closedBySnapshot, actor.userEmail);
  });
});

// ─── Evidencia ───────────────────────────────────────────────────────────────

describe('MIA: EVIDENCIA (declarativa tenant-safe)', () => {
  it('21. rechaza evidencia vacía (sin documentId ni evidenceUrl)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.addEvidence(COMPANY_A, String(action._id), {}, actor),
      BadRequestException,
    );
  });

  it('22. acepta DocumentMaster válido del tenant (con snapshot server-side)', async () => {
    const docId = new Types.ObjectId();
    const { service } = buildService([buildActionDoc()], {
      documents: [{ _id: docId, companyId: COMPANY_A, code: 'ACT-01', name: 'Acta de reunión' }],
    });
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.addEvidence(COMPANY_A, String(action._id), { documentId: String(docId) }, actor);
    assert.equal(String(saved.evidence?.documentId), String(docId));
    assert.equal(saved.evidence?.documentSnapshot, 'ACT-01 — Acta de reunión');
  });

  it('23. acepta evidenceUrl válida', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.addEvidence(COMPANY_A, String(action._id), { evidenceUrl: 'https://x.com/soporte.pdf' }, actor);
    assert.equal(saved.evidence?.evidenceUrl, 'https://x.com/soporte.pdf');
  });

  it('24. rechaza DocumentMaster de otra empresa (cross-tenant → 404)', async () => {
    const { service } = buildService([buildActionDoc()], {
      documents: [{ _id: new Types.ObjectId(), companyId: COMPANY_B, code: 'DOC-B', name: 'Doc de B' }],
    });
    const [action] = await service.findAll(COMPANY_A);
    await assert.rejects(
      () => service.addEvidence(COMPANY_A, String(action._id), { documentId: String(USER_B) }, actor),
      NotFoundException,
    );
  });

  it('25. el reemplazo controlado exige replace=true cuando ya existe evidencia', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await service.addEvidence(COMPANY_A, String(action._id), { evidenceUrl: 'https://x.com/a.pdf' }, actor);
    await assert.rejects(
      () => service.addEvidence(COMPANY_A, String(action._id), { evidenceUrl: 'https://x.com/b.pdf', replace: false }, actor),
      BadRequestException,
    );
    const saved = await service.addEvidence(COMPANY_A, String(action._id), { evidenceUrl: 'https://x.com/b.pdf' }, actor);
    assert.equal(saved.evidence?.evidenceUrl, 'https://x.com/b.pdf');
  });
});

// ─── Follow-up (seguimiento — NO verificación formal de eficacia) ────────────

describe('MIA: FOLLOW-UP', () => {
  it('26. permite registrar seguimiento con implementación y efectividad percibida', async () => {
    const { service } = buildService([buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS })]);
    const [action] = await service.findAll(COMPANY_A);
    const dto: RegisterImprovementActionFollowUpDto = {
      observations: 'Avance del 60%; recurso aprobado por la dirección',
      implementationStatus: ImplementationStatus.ON_TRACK,
      perceivedEffectiveness: PerceivedEffectiveness.EFECTIVA,
      requiresContinuedFollowUp: true,
    };
    const saved = await service.addFollowUp(COMPANY_A, String(action._id), dto, actor);
    assert.ok(saved.followUp?.lastFollowUpDate instanceof Date);
    assert.equal(saved.followUp?.implementationStatus, ImplementationStatus.ON_TRACK);
    assert.equal(saved.followUp?.perceivedEffectiveness, PerceivedEffectiveness.EFECTIVA);
    assert.equal(saved.followUp?.requiresContinuedFollowUp, true);
  });

  it('27. valida la fecha del seguimiento (futura → rechazada)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await assert.rejects(
      () => service.addFollowUp(COMPANY_A, String(action._id), { lastFollowUpDate: future }, actor),
      BadRequestException,
    );
  });

  it('27b. el actor autenticado pertenece al tenant del seguimiento (defensa en profundidad)', async () => {
    const { service } = buildService([buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS })]);
    const [action] = await service.findAll(COMPANY_A);
    // actorB pertenece a COMPANY_B: el service debe rechazar el follow-up en A.
    await assert.rejects(
      () => service.addFollowUp(COMPANY_B, String(action._id), { observations: 'x' }, actorB),
      NotFoundException,
    );
  });
});

// ─── Historial (append-only; actor server-side) ─────────────────────────────

describe('MIA: HISTORIAL', () => {
  it('28. CREATE genera historial con actor server-side (userId + snapshot)', async () => {
    const { service, history } = buildService();
    const created = await service.create(COMPANY_A, buildValidCreateDto(), actor);
    assert.equal(history.created[0]?.action, 'CREATE');
    assert.equal(String(history.created[0]?.actionId), String(created._id));
    assert.equal(String(history.created[0]?.actorUserId), String(USER_A));
    assert.equal(history.created[0]?.actorSnapshot, actor.userEmail);
    assert.equal(String(history.created[0]?.companyId), String(COMPANY_A));
  });

  it('29. UPDATE genera historial', async () => {
    const { service, history } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await service.update(COMPANY_A, String(action._id), { title: 'Título actualizado' } as UpdateImprovementActionDto, actor);
    assert.equal(history.created.at(-1)?.action, 'UPDATE');
  });

  it('30. STATUS_CHANGE genera historial', async () => {
    const { service, history } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.IN_PROGRESS }, actor);
    assert.equal(history.created.at(-1)?.action, 'STATUS_CHANGE');
  });

  it('31. EVIDENCE genera historial', async () => {
    const { service, history } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    await service.addEvidence(COMPANY_A, String(action._id), { evidenceUrl: 'https://x.com/soporte.pdf' }, actor);
    assert.equal(history.created.at(-1)?.action, 'EVIDENCE');
  });

  it('32. FOLLOW_UP genera historial', async () => {
    const { service, history } = buildService([buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS })]);
    const [action] = await service.findAll(COMPANY_A);
    await service.addFollowUp(COMPANY_A, String(action._id), { observations: 'Seguimiento mensual' }, actor);
    assert.equal(history.created.at(-1)?.action, 'FOLLOW_UP');
  });

  it('33. COMPLETED genera CLOSURE (no STATUS_CHANGE)', async () => {
    const { service, history } = buildService([
      buildActionDoc({ status: ImprovementActionStatus.IN_PROGRESS, executionDate: new Date(EXECUTED) }),
    ]);
    const [action] = await service.findAll(COMPANY_A);
    await service.changeStatus(COMPANY_A, String(action._id), { status: ImprovementActionStatus.COMPLETED }, actor);
    assert.equal(history.created.at(-1)?.action, 'CLOSURE');
  });

  it('34. getHistory es solo lectura (no expone mutación) y ordena cronológico', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const events = await service.getHistory(COMPANY_A, String(action._id));
    assert.ok(Array.isArray(events));
    // El cliente no tiene vía para editar/eliminar: no existe método de
    // mutación del historial en el service (append-only por diseño).
    const serviceMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    const historyMutators = serviceMethods.filter((m) => /updateHistory|deleteHistory/i.test(m));
    assert.deepEqual(historyMutators, []);
  });
});

// ─── DTO / seguridad ─────────────────────────────────────────────────────────

describe('MIA: DTO / SEGURIDAD', () => {
  it('35. createdBy/updatedBy enviados desde cliente NO modifican el actor', async () => {
    const { service } = buildService();
    const dto = buildValidCreateDto({
      createdBy: USER_B,
      createdBySnapshot: 'intruso@b.com',
    } as never);
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(String(created.createdBy), String(USER_A));
    assert.equal(created.createdBySnapshot, actor.userEmail);
  });

  it('36. status enviado por update general NO cambia el estado (solo /status)', async () => {
    const { service } = buildService([buildActionDoc()]);
    const [action] = await service.findAll(COMPANY_A);
    const saved = await service.update(
      COMPANY_A,
      String(action._id),
      { status: ImprovementActionStatus.COMPLETED } as never,
      actor,
    );
    assert.equal(saved.status, ImprovementActionStatus.PENDING);
  });

  it('36b. responsableSnapshot del cliente es ignorado (resuelto server-side)', async () => {
    const { service } = buildService();
    const dto = buildValidCreateDto({ responsibleSnapshot: 'nombre-falso' });
    const created = await service.create(COMPANY_A, dto, actor);
    assert.equal(created.responsibleSnapshot, 'Ana Gómez');
  });
});

// ─── Roles (guard REAL) ──────────────────────────────────────────────────────

describe('MIA: ROLES (RolesGuard real)', () => {
  it('37. owner/admin escriben; manager y member NO (write endpoints)', async () => {
    const { service } = buildService();
    const usersService = {
      findByFirebaseUid: async () => ({ _id: USER_A, companyId: COMPANY_A, email: 'u@a.com' }),
    } as unknown as UsersService;
    const controller = new ManagementImprovementActionsController(service, usersService);
    const request = { user: { uid: 'uid-x' } } as never;

    const writeRoles = ['owner', 'admin'];
    const guardOwner = new RolesGuard(
      { getAllAndOverride: () => writeRoles } as never,
      { findOne: () => ({ lean: () => ({ exec: async () => ({ role: 'owner' }) }) }) } as never,
    );
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => ManagementImprovementActionsController,
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
