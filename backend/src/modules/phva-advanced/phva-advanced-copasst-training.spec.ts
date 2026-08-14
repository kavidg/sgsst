import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { CopasstPeriodDocument, CopasstMember } from '../copasst/schemas/copasst.schema';
import { UserDocument } from '../users/schemas/user.schema';
import {
  COPASST_TRAINING_ITEM_CODE,
  PhvaAdvancedCopasstTrainingService,
} from './phva-advanced-copasst-training.service';
import {
  CopasstTrainingSession,
  PhvaAdvancedCopasstTraining,
  PhvaAdvancedCopasstTrainingDocument,
  PhvaAdvancedCopasstTrainingSchema,
} from './schemas/phva-advanced-copasst-training.schema';

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';

/** ObjectId válido (24 hex) derivado de un índice numérico. */
function oid(n: number | string): Types.ObjectId {
  return new Types.ObjectId(`64b00000000000000000${String(n).padStart(4, '0')}`);
}

/** Miembro COPASST de prueba. */
function member(
  id: number,
  status: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
  name = 'Miembro',
  committeeRole = 'PRINCIPAL',
  representationType = 'TRABAJADOR',
): CopasstMember {
  return {
    userId: oid(id),
    userName: name,
    committeeRole,
    representationType,
    principalType: 'PRINCIPAL',
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    status,
  } as unknown as CopasstMember;
}

/**
 * Periodo COPASST con N miembros (los primeros `active` activos). Permite
 * especificar la empresa propietaria para pruebas de multi-tenancy.
 */
function buildPeriod(
  memberCount: number,
  active = memberCount,
  companyId: string = COMPANY_A,
  periodId = '64b0000000000000000000aa',
  memberStart = 1,
): CopasstPeriodDocument {
  return {
    _id: new Types.ObjectId(periodId),
    companyId: new Types.ObjectId(companyId),
    periodName: 'Periodo 2024-2026',
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    status: 'ACTIVO',
    members: Array.from({ length: memberCount }, (_, index) =>
      member(memberStart + index, index < active ? 'ACTIVO' : 'INACTIVO', `Miembro ${memberStart + index}`),
    ),
  } as unknown as CopasstPeriodDocument;
}

/** Sesión COPASST ejecutada con participantes snapshot. */
function executedSession(participantIds: number[], completionDate = '2025-06-01T00:00:00.000Z'): CopasstTrainingSession {
  return {
    title: 'Capacitación funciones COPASST',
    status: 'Ejecutada',
    completionDate: new Date(completionDate),
    copasstParticipants: participantIds.map((id, index) => ({
      userId: oid(id),
      name: `Miembro ${index + 1}`,
      committeeRole: 'PRINCIPAL',
      representationType: 'TRABAJADOR',
    })),
  } as unknown as CopasstTrainingSession;
}

/** Sesión PROGRAMADA (no ejecutada): no cuenta para cobertura. */
function programmedSession(participantIds: number[]): CopasstTrainingSession {
  return {
    title: 'Capacitación pendiente',
    status: 'Programada',
    copasstParticipants: participantIds.map((id, index) => ({
      userId: oid(id),
      name: `Miembro ${index + 1}`,
      committeeRole: 'PRINCIPAL',
      representationType: 'TRABAJADOR',
    })),
  } as unknown as CopasstTrainingSession;
}

/**
 * Sesión con status Programada pero completionDate registrado: cumple la
 * condición de ejecutada según la regla de dominio (status 'Ejecutada' OR
 * completionDate existe).
 */
function completedWithProgrammedStatus(participantIds: number[]): CopasstTrainingSession {
  return {
    title: 'Capacitación ejecutada sin actualizar estado',
    status: 'Programada',
    completionDate: new Date('2025-07-01T00:00:00.000Z'),
    copasstParticipants: participantIds.map((id, index) => ({
      userId: oid(id),
      name: `Miembro ${index + 1}`,
      committeeRole: 'PRINCIPAL',
      representationType: 'TRABAJADOR',
    })),
  } as unknown as CopasstTrainingSession;
}

/**
 * Modelo Mongoose en memoria con soporte para findOne/findById/create.
 * Las consultas filtran por companyId + itemCode (+ year) igual que el
 * service real; findById devuelve el documento sin filtrar por empresa
 * (como MongoDB) para que el service valide pertenencia.
 */
function buildModel(seed: PhvaAdvancedCopasstTrainingDocument[] = []) {
  const store = new Map<string, PhvaAdvancedCopasstTrainingDocument>();
  for (const doc of seed) store.set((doc._id as Types.ObjectId).toString(), doc);

  return {
    store,
    findOne: (filter: Record<string, unknown>) => {
      const { companyId, itemCode, year } = filter as {
        companyId: Types.ObjectId;
        itemCode?: string;
        year?: number;
      };
      const found = [...store.values()].find((doc) => {
        if (doc.companyId.toString() !== companyId.toString()) return false;
        if (itemCode !== undefined && doc.itemCode !== itemCode) return false;
        if (year !== undefined && doc.year !== year) return false;
        return true;
      });
      // Chainable mínimo: el service usa tanto findOne(...).exec() como
      // findOne(...).sort(...).exec().
      const chainable = { exec: async () => found ?? null };
      return { exec: chainable.exec, sort: () => chainable };
    },
    findById: (id: Types.ObjectId) => ({
      exec: async () => store.get(id.toString()) ?? null,
    }),
    create: async (data: Partial<PhvaAdvancedCopasstTraining>) => {
      const id = new Types.ObjectId();
      const doc = {
        _id: id,
        itemCode: COPASST_TRAINING_ITEM_CODE,
        year: new Date().getFullYear(),
        annualProgram: [],
        sessions: [],
        memberCoverage: [],
        checklistTemplate: [],
        evaluationAttempts: [],
        signatures: [],
        certificates: [],
        evidenceFiles: [],
        attendanceEvidence: [],
        signatureEvidence: [],
        alerts: [],
        history: [],
        approval: { version: 1, status: 'PENDING' },
        complianceStatus: 'PENDING',
        complianceReason: '',
        // Los documentos reales de Mongoose exponen save(): los tests de update
        // lo invocan para persistir.
        save: async function () {
          return this as unknown as PhvaAdvancedCopasstTrainingDocument;
        },
        ...data,
      } as unknown as PhvaAdvancedCopasstTrainingDocument;
      store.set(id.toString(), doc);
      return doc;
    },
  };
}

describe('PhvaAdvancedCopasstTrainingService (1.1.7)', () => {
  function buildService(options: {
    period?: CopasstPeriodDocument | null;
    periodError?: boolean;
    seed?: PhvaAdvancedCopasstTrainingDocument[];
    /** Periodo devuelto por copasstService.findById (validación de periodId). */
    findByIdPeriod?: CopasstPeriodDocument | null;
  }) {
    const model = buildModel(options.seed ?? []);
    const copasstService = {
      findCurrent: async (companyId: Types.ObjectId) => {
        if (options.periodError) throw new NotFoundException('No existe periodo');
        if (options.period === null) throw new NotFoundException('No existe periodo');
        if (options.period && options.period.companyId.toString() !== companyId.toString()) {
          throw new NotFoundException('No existe periodo');
        }
        return options.period ?? buildPeriod(0, 0);
      },
      findById: async (id: Types.ObjectId) => {
        const period = options.findByIdPeriod;
        if (!period) throw new NotFoundException('Periodo no encontrado');
        if (period._id.toString() !== id.toString()) throw new NotFoundException('Periodo no encontrado');
        return period;
      },
    };
    const service = new PhvaAdvancedCopasstTrainingService(
      model as never,
      copasstService as never,
    );
    return { service, model };
  }

  // ═════════════════════════════════════════════
  // SCHEMA
  // ═════════════════════════════════════════════
  describe('Schema', () => {
    it('usa la colección independiente phva_advanced_copasst_training', () => {
      assert.equal(
        PhvaAdvancedCopasstTrainingSchema.get('collection'),
        'phva_advanced_copasst_training',
      );
    });

    it('companyId es obligatorio y tiene índice', () => {
      const path = PhvaAdvancedCopasstTrainingSchema.path('companyId');
      assert.equal(path.isRequired, true);
      assert.ok((path.options as { index?: boolean }).index);
    });

    it('itemCode por defecto es 1.1.7 (discriminador estable)', () => {
      const path = PhvaAdvancedCopasstTrainingSchema.path('itemCode');
      assert.equal((path.options as { default?: string }).default, '1.1.7');
      assert.equal(COPASST_TRAINING_ITEM_CODE, '1.1.7');
    });

    it('year por defecto es el año actual y periodId es opcional', () => {
      const yearPath = PhvaAdvancedCopasstTrainingSchema.path('year');
      // El default se evalúa al cargar el módulo: es un número fijo.
      assert.equal(
        (yearPath.options as { default?: number }).default,
        new Date().getFullYear(),
      );
      const periodPath = PhvaAdvancedCopasstTrainingSchema.path('periodId');
      assert.ok(!periodPath.isRequired, 'periodId debe ser opcional');
    });

    it('registra índice único {companyId, year, itemCode} y {companyId, periodId}', () => {
      const indexes = PhvaAdvancedCopasstTrainingSchema.indexes();
      const specs = indexes.map(([spec]) => spec);
      assert.ok(
        specs.some((spec) => {
          const s = spec as Record<string, unknown>;
          return s.companyId === 1 && s.year === 1 && s.itemCode === 1;
        }),
        'debe existir índice compuesto companyId+year+itemCode',
      );
      assert.ok(
        specs.some((spec) => {
          const s = spec as Record<string, unknown>;
          return s.companyId === 1 && s.periodId === 1;
        }),
        'debe existir índice companyId+periodId',
      );
      const uniqueIndex = indexes.find(
        ([, options]) => (options as { unique?: boolean }).unique === true,
      );
      assert.ok(uniqueIndex, 'el índice compuesto debe ser único');
    });

    it('memberCoverage expone status, totalHours, lastEvaluationScore y lastEvaluationDate', () => {
      const schema = PhvaAdvancedCopasstTrainingSchema;
      const coverageType = (schema.path('memberCoverage') as unknown as {
        schema?: { paths?: Record<string, { options?: { default?: unknown }; isRequired?: boolean }> };
      }).schema;
      assert.ok(coverageType?.paths?.status, 'memberCoverage.status debe existir');
      assert.equal((coverageType.paths.status.options as { default?: string }).default, 'ACTIVO');
      assert.equal((coverageType.paths.totalHours.options as { default?: number }).default, 0);
      assert.ok(coverageType.paths.lastEvaluationScore, 'memberCoverage.lastEvaluationScore debe existir');
      assert.ok(coverageType.paths.lastEvaluationDate, 'memberCoverage.lastEvaluationDate debe existir');
    });
  });

  // ═════════════════════════════════════════════
  // CREACIÓN / findOrCreate
  // ═════════════════════════════════════════════
  describe('findOrCreate', () => {
    it('crea la entidad con itemCode 1.1.7, checklist por defecto e historial CREATED', async () => {
      const { service, model } = buildService({
        period: buildPeriod(2, 2),
      });
      const companyId = new Types.ObjectId(COMPANY_A);

      const record = await service.findOrCreate(companyId, 2025);

      assert.equal(record.itemCode, '1.1.7');
      assert.equal(record.year, 2025);
      assert.equal(record.companyId.toString(), COMPANY_A);
      assert.ok(record.periodId);
      assert.ok(record.checklistTemplate.length > 0);
      assert.equal(record.history[0].action, 'CREATED');
      assert.equal(model.store.size, 1);
    });

    it('NO permite crear accidentalmente una entidad de otro estándar', async () => {
      const { service } = buildService({});
      const record = await service.findOrCreate(new Types.ObjectId(COMPANY_A), 2025);
      assert.equal(record.itemCode, '1.1.7');
      assert.notEqual(record.itemCode, '1.2.1');
    });

    it('crea la entidad sin periodo vigente (periodId undefined)', async () => {
      const { service } = buildService({ periodError: true });
      const record = await service.findOrCreate(new Types.ObjectId(COMPANY_A), 2025);
      assert.equal(record.itemCode, '1.1.7');
      assert.equal(record.periodId, undefined);
    });

    it('reutiliza la entidad existente (no duplica)', async () => {
      const { service, model } = buildService({});
      const companyId = new Types.ObjectId(COMPANY_A);
      await service.findOrCreate(companyId, 2025);
      await service.findOrCreate(companyId, 2025);
      assert.equal(model.store.size, 1);
    });
  });

  // ═════════════════════════════════════════════
  // MULTI-TENANCY (entidad 1.1.7)
  // ═════════════════════════════════════════════
  describe('Multi-tenancy (entidad)', () => {
    it('findById de la empresa B NO puede recuperar una entidad de la empresa A', async () => {
      const doc = {
        _id: new Types.ObjectId('64b0000000000000000000c1'),
        companyId: new Types.ObjectId(COMPANY_A),
        itemCode: '1.1.7',
        year: 2025,
      } as unknown as PhvaAdvancedCopasstTrainingDocument;
      const { service } = buildService({ seed: [doc] });

      await assert.rejects(
        () => service.findById(new Types.ObjectId(COMPANY_B), doc._id),
        NotFoundException,
      );
    });

    it('findById lanza NotFound si el documento no existe', async () => {
      const { service } = buildService({});
      await assert.rejects(
        () =>
          service.findById(
            new Types.ObjectId(COMPANY_A),
            new Types.ObjectId('64b0000000000000000000ff'),
          ),
        NotFoundException,
      );
    });

    it('findById de la misma empresa devuelve el documento', async () => {
      const doc = {
        _id: new Types.ObjectId('64b0000000000000000000c2'),
        companyId: new Types.ObjectId(COMPANY_A),
        itemCode: '1.1.7',
        year: 2025,
      } as unknown as PhvaAdvancedCopasstTrainingDocument;
      const { service } = buildService({ seed: [doc] });
      const found = await service.findById(new Types.ObjectId(COMPANY_A), doc._id);
      assert.equal(found._id.toString(), doc._id.toString());
    });

    it('findByCompany de la empresa B no ve entidades de la empresa A', async () => {
      const doc = {
        _id: new Types.ObjectId('64b0000000000000000000c3'),
        companyId: new Types.ObjectId(COMPANY_A),
        itemCode: '1.1.7',
        year: 2025,
      } as unknown as PhvaAdvancedCopasstTrainingDocument;
      const { service } = buildService({ seed: [doc] });
      const found = await service.findByCompany(new Types.ObjectId(COMPANY_B), 2025);
      assert.equal(found, null);
    });
  });

  // ═════════════════════════════════════════════
  // PERIODO COPASST VIGENTE
  // ═════════════════════════════════════════════
  describe('Periodo COPASST', () => {
    it('obtiene el periodo COPASST vigente (reutiliza CopasstService.findCurrent)', async () => {
      const { service } = buildService({ period: buildPeriod(5, 5) });
      const period = await service.getCurrentCopasstPeriod(new Types.ObjectId(COMPANY_A));
      assert.ok(period);
      assert.equal(period.status, 'ACTIVO');
    });

    it('devuelve null si no existe periodo vigente', async () => {
      const { service } = buildService({ periodError: true });
      const period = await service.getCurrentCopasstPeriod(new Types.ObjectId(COMPANY_A));
      assert.equal(period, null);
    });

    it('filtra únicamente miembros ACTIVO', async () => {
      const { service } = buildService({ period: buildPeriod(10, 8) });
      const members = await service.getActiveCopasstMembers(new Types.ObjectId(COMPANY_A));
      assert.equal(members.length, 8);
      assert.ok(members.every((m) => m.status === 'ACTIVO'));
    });

    it('no mezcla periodos de distintas empresas', async () => {
      // El periodo pertenece a la empresa A; la empresa B no puede verlo.
      const { service } = buildService({ period: buildPeriod(5, 5, COMPANY_A) });
      const members = await service.getActiveCopasstMembers(new Types.ObjectId(COMPANY_B));
      assert.deepEqual(members, []);
    });
  });

  // ═════════════════════════════════════════════
  // MEMBERS AVAILABLE
  // ═════════════════════════════════════════════
  describe('getAvailableMembers', () => {
    it('devuelve solo miembros ACTIVOS con el shape mínimo consumible', async () => {
      const { service } = buildService({ period: buildPeriod(3, 3) });
      const available = await service.getAvailableMembers(new Types.ObjectId(COMPANY_A));
      assert.equal(available.length, 3);
      for (const member of available) {
        assert.ok(member.userId);
        assert.ok(member.name);
        assert.ok(member.committeeRole);
        assert.ok(member.representationType);
        assert.equal(member.status, 'ACTIVO');
      }
    });

    it('excluye miembros INACTIVOS', async () => {
      const { service } = buildService({ period: buildPeriod(5, 2) });
      const available = await service.getAvailableMembers(new Types.ObjectId(COMPANY_A));
      assert.equal(available.length, 2);
    });

    it('no expone los miembros de otra empresa (multi-tenancy)', async () => {
      const { service } = buildService({ period: buildPeriod(5, 5, COMPANY_A) });
      const available = await service.getAvailableMembers(new Types.ObjectId(COMPANY_B));
      assert.deepEqual(available, []);
    });
  });

  // ═════════════════════════════════════════════
  // PARTICIPANTES DE SESIÓN
  // ═════════════════════════════════════════════
  describe('Participantes de sesión', () => {
    const user = { email: 'admin@empresa.com' } as unknown as UserDocument;

    it('permite un miembro activo y construye el snapshot desde la fuente maestra', async () => {
      const { service } = buildService({ period: buildPeriod(5, 5) });
      const companyId = new Types.ObjectId(COMPANY_A);

      // Sesión nueva (Programada) con solo userId: el service debe rellenar el
      // snapshot desde CopasstPeriod.members.
      const record = await service.update(companyId, user, {
        year: 2025,
        sessions: [
          {
            title: 'Capacitación peligros',
            status: 'Programada',
            scheduledDate: '2025-03-01T00:00:00.000Z',
            copasstParticipants: [{ userId: oid(2).toString() }],
          },
        ] as never,
      });

      const participant = record.sessions[0].copasstParticipants[0];
      assert.equal(participant.userId.toString(), oid(2).toString());
      assert.equal(participant.name, 'Miembro 2');
      assert.equal(participant.committeeRole, 'PRINCIPAL');
      assert.equal(participant.representationType, 'TRABAJADOR');
    });

    it('rechaza un usuario que no pertenece al COPASST', async () => {
      const { service } = buildService({ period: buildPeriod(5, 5) });
      const companyId = new Types.ObjectId(COMPANY_A);

      await assert.rejects(
        () =>
          service.update(companyId, user, {
            year: 2025,
            sessions: [
              {
                title: 'Capacitación con intruso',
                status: 'Programada',
                copasstParticipants: [{ userId: oid(99).toString() }],
              },
            ] as never,
          }),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no es un miembro activo del COPASST'),
      );
    });

    it('rechaza un miembro INACTIVO para una nueva sesión', async () => {
      const { service } = buildService({ period: buildPeriod(5, 3) });
      const companyId = new Types.ObjectId(COMPANY_A);

      // El miembro 5 está INACTIVO: no puede agregarse a una sesión nueva.
      await assert.rejects(
        () =>
          service.update(companyId, user, {
            year: 2025,
            sessions: [
              {
                title: 'Sesión con inactivo',
                status: 'Programada',
                copasstParticipants: [{ userId: oid(5).toString() }],
              },
            ] as never,
          }),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no es un miembro activo del COPASST'),
      );
    });

    it('deduplica participantes repetidos dentro de la misma sesión', async () => {
      const { service } = buildService({ period: buildPeriod(5, 5) });
      const companyId = new Types.ObjectId(COMPANY_A);

      const record = await service.update(companyId, user, {
        year: 2025,
        sessions: [
          {
            title: 'Sesión con duplicados',
            status: 'Programada',
            copasstParticipants: [
              { userId: oid(1).toString() },
              { userId: oid(1).toString() },
              { userId: oid(2).toString() },
            ],
          },
        ] as never,
      });

      assert.equal(record.sessions[0].copasstParticipants.length, 2);
    });

    it('conserva el snapshot histórico de una sesión ejecutada aunque el miembro cambie de estado', async () => {
      const { service } = buildService({
        period: buildPeriod(2, 2),
      });
      const record = {
        _id: new Types.ObjectId('64b0000000000000000000dd'),
        companyId: new Types.ObjectId(COMPANY_A),
        itemCode: '1.1.7',
        year: 2025,
        sessions: [executedSession([1, 2])],
        memberCoverage: [],
        annualProgram: [],
        history: [],
        save: async function () {
          return this as unknown as PhvaAdvancedCopasstTrainingDocument;
        },
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      // El miembro cambia de estado después de la sesión (simula salida del comité).
      const period = buildPeriod(2, 0) as CopasstPeriodDocument;
      period.members = period.members.map((m) => ({ ...m, status: 'INACTIVO' })) as never;

      const refreshed = await service.refreshMemberCoverage(
        new Types.ObjectId(COMPANY_A),
        record,
      );

      const participant = refreshed.sessions[0].copasstParticipants[0];
      assert.equal(participant.name, 'Miembro 1');
      assert.equal(participant.committeeRole, 'PRINCIPAL');
      assert.equal(participant.representationType, 'TRABAJADOR');
      assert.ok(participant.userId);
    });
  });

  // ═════════════════════════════════════════════
  // COBERTURA
  // ═════════════════════════════════════════════
  describe('calculateCoverage', () => {
    it('10 miembros activos, 8 capacitados => 80%', async () => {
      const { service } = buildService({
        period: buildPeriod(10, 10),
      });
      const record = {
        sessions: [
          executedSession([1, 2]),
          executedSession([3, 4, 5, 6]),
          executedSession([7, 8]),
        ],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.totalMembers, 10);
      assert.equal(coverage.trainedMembers, 8);
      assert.equal(coverage.coveragePercentage, 80);
    });

    it('5 miembros activos, 0 capacitados => 0%', async () => {
      const { service } = buildService({
        period: buildPeriod(5, 5),
      });
      const record = {
        sessions: [programmedSession([1, 2])],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.totalMembers, 5);
      assert.equal(coverage.trainedMembers, 0);
      assert.equal(coverage.coveragePercentage, 0);
    });

    it('5 miembros activos, 3 capacitados => 60%', async () => {
      const { service } = buildService({
        period: buildPeriod(5, 5),
      });
      const record = {
        sessions: [executedSession([1, 2, 3])],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.totalMembers, 5);
      assert.equal(coverage.trainedMembers, 3);
      assert.equal(coverage.coveragePercentage, 60);
    });

    it('10 miembros activos, 10 capacitados => 100%', async () => {
      const { service } = buildService({
        period: buildPeriod(10, 10),
      });
      const record = {
        sessions: [
          executedSession([1, 2]),
          executedSession([3, 4, 5, 6]),
          executedSession([7, 8, 9, 10]),
        ],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.trainedMembers, 10);
      assert.equal(coverage.coveragePercentage, 100);
    });

    it('mismo miembro en 3 sesiones => cuenta UNA sola vez para cobertura', async () => {
      const { service } = buildService({
        period: buildPeriod(10, 10),
      });
      const record = {
        sessions: [
          executedSession([1]),
          executedSession([1]),
          executedSession([1]),
          executedSession([2, 3, 4, 5, 6, 7, 8, 9]),
        ],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      // 1 (miembro 1) + 8 (miembros 2-9) = 9 distintos de 10
      assert.equal(coverage.trainedMembers, 9);
      assert.equal(coverage.coveragePercentage, 90);
    });

    it('sesión programada pero NO ejecutada => no cuenta como capacitado', async () => {
      const { service } = buildService({
        period: buildPeriod(5, 5),
      });
      const record = {
        sessions: [programmedSession([1, 2, 3, 4, 5])],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.executedSessions, 0);
      assert.equal(coverage.trainedMembers, 0);
      assert.equal(coverage.coveragePercentage, 0);
    });

    it('sesión ejecutada (status Ejecutada) cuenta', async () => {
      const { service } = buildService({ period: buildPeriod(3, 3) });
      const record = {
        sessions: [executedSession([1, 2, 3])],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.executedSessions, 1);
      assert.equal(coverage.trainedMembers, 3);
      assert.equal(coverage.coveragePercentage, 100);
    });

    it('completionDate permite considerar ejecutada aunque status sea Programada', async () => {
      const { service } = buildService({ period: buildPeriod(3, 3) });
      const record = {
        sessions: [completedWithProgrammedStatus([1, 2, 3])],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.executedSessions, 1);
      assert.equal(coverage.trainedMembers, 3);
      assert.equal(coverage.coveragePercentage, 100);
    });

    it('miembro INACTIVO no forma parte del denominador', async () => {
      const { service } = buildService({
        period: buildPeriod(10, 8),
      });
      const record = {
        sessions: [executedSession([1, 2, 3, 4, 5, 6, 7, 8])],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A), record);
      assert.equal(coverage.totalMembers, 8);
      assert.equal(coverage.trainedMembers, 8);
      assert.equal(coverage.coveragePercentage, 100);
    });

    it('0% cuando no hay miembros activos (evita división por cero)', async () => {
      const { service } = buildService({ period: buildPeriod(0, 0) });
      const coverage = await service.calculateCoverage(new Types.ObjectId(COMPANY_A));
      assert.equal(coverage.totalMembers, 0);
      assert.equal(coverage.coveragePercentage, 0);
    });
  });

  // ═════════════════════════════════════════════
  // MÉTRICAS POR MIEMBRO (recalculateCoverage)
  // ═════════════════════════════════════════════
  describe('recalculateCoverage (métricas por miembro)', () => {
    it('executedSessions cuenta las sesiones ejecutadas de cada miembro', async () => {
      const { service } = buildService({ period: buildPeriod(3, 3) });
      const record = {
        sessions: [
          executedSession([1, 2]),
          executedSession([1]),
          executedSession([1, 2, 3]),
        ],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      await service.recalculateCoverage(new Types.ObjectId(COMPANY_A), record);

      const byUser = new Map(
        record.memberCoverage.map((entry) => [entry.userId.toString(), entry]),
      );
      assert.equal(byUser.get(oid(1).toString())?.executedSessions, 3);
      assert.equal(byUser.get(oid(2).toString())?.executedSessions, 2);
      assert.equal(byUser.get(oid(3).toString())?.executedSessions, 1);
    });

    it('trainedAt es la PRIMERA fecha relevante de capacitación ejecutada (determinista)', async () => {
      const { service } = buildService({ period: buildPeriod(1, 1) });
      const record = {
        sessions: [
          executedSession([1], '2025-08-01T00:00:00.000Z'),
          executedSession([1], '2025-03-15T00:00:00.000Z'),
          executedSession([1], '2025-01-10T00:00:00.000Z'),
        ],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      await service.recalculateCoverage(new Types.ObjectId(COMPANY_A), record);

      const entry = record.memberCoverage[0];
      assert.equal(entry.trained, true);
      assert.equal(entry.trainedAt?.toISOString(), '2025-01-10T00:00:00.000Z');
    });

    it('trainedAt usa scheduledDate si no hay completionDate pero la sesión cumple la condición de ejecutada', async () => {
      const { service } = buildService({ period: buildPeriod(1, 1) });
      const record = {
        sessions: [
          {
            title: 'Ejecutada sin completionDate',
            status: 'Ejecutada',
            scheduledDate: new Date('2025-02-20T00:00:00.000Z'),
            copasstParticipants: [{ userId: oid(1) }],
          },
        ],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      await service.recalculateCoverage(new Types.ObjectId(COMPANY_A), record);

      const entry = record.memberCoverage[0];
      assert.equal(entry.trained, true);
      assert.equal(entry.trainedAt?.toISOString(), '2025-02-20T00:00:00.000Z');
    });

    it('totalHours queda en 0 porque duration es texto libre (limitación documentada)', async () => {
      const { service } = buildService({ period: buildPeriod(1, 1) });
      const record = {
        sessions: [
          {
            title: 'Capacitación con duración textual',
            status: 'Ejecutada',
            duration: '4 horas',
            completionDate: new Date('2025-06-01T00:00:00.000Z'),
            copasstParticipants: [{ userId: oid(1) }],
          },
        ],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      await service.recalculateCoverage(new Types.ObjectId(COMPANY_A), record);

      assert.equal(record.memberCoverage[0].totalHours, 0);
      assert.equal(record.memberCoverage[0].lastEvaluationScore, undefined);
      assert.equal(record.memberCoverage[0].lastEvaluationDate, undefined);
    });

    it('memberCoverage conserva status, trained, trainedAt y executedSessions por miembro activo', async () => {
      const { service } = buildService({ period: buildPeriod(4, 4) });
      const record = {
        sessions: [executedSession([1, 2])],
      } as unknown as PhvaAdvancedCopasstTrainingDocument;

      const summary = await service.recalculateCoverage(new Types.ObjectId(COMPANY_A), record);

      assert.equal(record.memberCoverage.length, 4);
      assert.ok(record.memberCoverage.every((entry) => entry.status === 'ACTIVO'));
      assert.equal(record.memberCoverage.filter((entry) => entry.trained).length, 2);
      assert.equal(summary.totalMembers, 4);
      assert.equal(summary.trainedMembers, 2);
      assert.equal(summary.coveragePercentage, 50);
    });
  });

  // ═════════════════════════════════════════════
  // CAMBIO DE PERIODO
  // ═════════════════════════════════════════════
  describe('Cambio de periodo', () => {
    it('el denominador usa el periodo vigente y las sesiones históricas permanecen intactas', async () => {
      const options = { period: buildPeriod(5, 5) };
      const { service } = buildService(options);
      const companyId = new Types.ObjectId(COMPANY_A);
      const user = { email: 'admin@empresa.com' } as unknown as UserDocument;

      // Periodo A: 5 miembros activos, 3 capacitados => 60%.
      const recordA = await service.update(companyId, user, {
        year: 2025,
        sessions: [executedSession([1, 2, 3])],
      });
      const coverageA = await service.calculateCoverage(companyId, recordA);
      assert.equal(coverageA.totalMembers, 5);
      assert.equal(coverageA.coveragePercentage, 60);

      // Aparece el Periodo B como vigente: 8 miembros activos DISTINTOS (aún
      // sin capacitar), por lo que el denominador cambia y la cobertura baja.
      options.period = buildPeriod(8, 8, COMPANY_A, '64b0000000000000000000bb', 100);
      const coverageB = await service.calculateCoverage(companyId, recordA);

      assert.equal(coverageB.totalMembers, 8);
      assert.equal(coverageB.trainedMembers, 0);
      assert.equal(coverageB.coveragePercentage, 0);
      // Las sesiones históricas del Periodo A no se modificaron.
      assert.equal(recordA.sessions.length, 1);
      assert.equal(recordA.sessions[0].copasstParticipants.length, 3);
    });
  });

  // ═════════════════════════════════════════════
  // MULTI-TENANCY DE PERIODO Y PARTICIPANTES
  // ═════════════════════════════════════════════
  describe('Multi-tenancy de periodo y participantes', () => {
    const user = { email: 'admin@empresa.com' } as unknown as UserDocument;

    it('rechaza un periodId que pertenece a otra empresa', async () => {
      // findById devuelve un periodo de la empresa B.
      const { service } = buildService({
        period: buildPeriod(2, 2, COMPANY_A),
        findByIdPeriod: buildPeriod(2, 2, COMPANY_B, '64b0000000000000000000cc'),
      });
      const companyId = new Types.ObjectId(COMPANY_A);

      await assert.rejects(
        () =>
          service.update(companyId, user, {
            year: 2025,
            periodId: '64b0000000000000000000cc',
          }),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no pertenece a esta empresa'),
      );
    });

    it('acepta un periodId de la misma empresa', async () => {
      const periodA = buildPeriod(2, 2, COMPANY_A, '64b0000000000000000000dd');
      const { service } = buildService({
        period: periodA,
        findByIdPeriod: periodA,
      });
      const companyId = new Types.ObjectId(COMPANY_A);

      const record = await service.update(companyId, user, {
        year: 2025,
        periodId: periodA._id.toString(),
      });

      assert.equal(record.periodId?.toString(), periodA._id.toString());
    });

    it('no permite asociar participantes de otra empresa (no pertenecen al COPASST activo)', async () => {
      const { service } = buildService({ period: buildPeriod(3, 3, COMPANY_A) });
      const companyId = new Types.ObjectId(COMPANY_A);

      // Un userId de la empresa B no figura en los miembros activos de A.
      await assert.rejects(
        () =>
          service.update(companyId, user, {
            year: 2025,
            sessions: [
              {
                title: 'Sesión con participante ajeno',
                status: 'Programada',
                copasstParticipants: [{ userId: oid(42).toString() }],
              },
            ] as never,
          }),
        BadRequestException,
      );
    });
  });

  // ═════════════════════════════════════════════
  // UPDATE + COMPLIANCE BÁSICO
  // ═════════════════════════════════════════════
  describe('update', () => {
    it('recalcula memberCoverage y complianceStatus COMPLIES con programa + ejecución + cobertura + asistencia', async () => {
      const { service, model } = buildService({
        period: buildPeriod(10, 10),
      });
      const user = { email: 'admin@empresa.com' } as unknown as UserDocument;
      const companyId = new Types.ObjectId(COMPANY_A);

      const record = await service.update(companyId, user, {
        year: 2025,
        annualProgram: [{ title: 'Programa anual COPASST' }] as never,
        sessions: [executedSession([1, 2, 3, 4, 5, 6, 7, 8])],
        attendanceEvidence: ['https://storage/lista-asistencia.pdf'],
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
      assert.equal(record.memberCoverage.length, 10);
      assert.equal(record.memberCoverage.filter((c) => c.trained).length, 8);
      assert.ok(record.history.some((h) => h.action === 'UPDATED'));
      assert.equal(model.store.size, 1);
    });

    it('rechaza un año inválido (< 2000)', async () => {
      const { service } = buildService({});
      const user = { email: 'admin@empresa.com' } as unknown as UserDocument;
      await assert.rejects(
        () => service.update(new Types.ObjectId(COMPANY_A), user, { year: 1999 }),
        /Año inválido/,
      );
    });

    it('nunca permite sobrescribir itemCode', async () => {
      const { service } = buildService({});
      const user = { email: 'admin@empresa.com' } as unknown as UserDocument;
      const record = await service.update(new Types.ObjectId(COMPANY_A), user, {
        year: 2025,
        itemCode: '1.2.1',
      } as never);
      assert.equal(record.itemCode, '1.1.7');
    });
  });

  // ═════════════════════════════════════════════
  // FUENTES DE EVIDENCIA DE ASISTENCIA (Fase 9, A1)
  // ═════════════════════════════════════════════
  describe('resolveCompliance — fuentes de evidencia de asistencia (Fase 9, A1)', () => {
    const user = { email: 'admin@empresa.com' } as unknown as UserDocument;
    const companyId = new Types.ObjectId(COMPANY_A);

    it('A1.1: evidencia legacy de asistencia → COMPLIES', async () => {
      const { service } = buildService({ period: buildPeriod(3, 3) });

      const record = await service.update(companyId, user, {
        year: 2025,
        annualProgram: [{ title: 'Programa anual COPASST' }] as never,
        sessions: [executedSession([1, 2, 3])],
        attendanceEvidence: ['https://storage/lista-asistencia.pdf'],
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
    });

    it('A1.1b: solo signatureEvidence legacy → COMPLIES', async () => {
      const { service } = buildService({ period: buildPeriod(3, 3) });

      const record = await service.update(companyId, user, {
        year: 2025,
        annualProgram: [{ title: 'Programa anual COPASST' }] as never,
        sessions: [executedSession([1, 2, 3])],
        signatureEvidence: ['https://storage/firmas.pdf'],
      });

      assert.equal(record.complianceStatus, 'COMPLIES');
    });

    it('A1.7: sin ninguna evidencia → PENDING (resto de condiciones cumplidas)', async () => {
      // Entidad con programa + sesión ejecutada + cobertura, pero SIN ninguna
      // evidencia de asistencia (ni legacy ni estructurada): PENDING.
      const { service } = buildService({ period: buildPeriod(3, 3) });

      const record = await service.update(companyId, user, {
        year: 2025,
        annualProgram: [{ title: 'Programa anual COPASST' }] as never,
        sessions: [executedSession([1, 2, 3])],
      });

      assert.equal(record.complianceStatus, 'PENDING');
    });
  });
});
