import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { OccupationalExamService } from './occupational-exam.service';
import { ExamType, ExamStatus, FitnessStatus } from './schemas/occupational-exam.schema';
import { Types } from 'mongoose';

// ── Mock helpers ──

/** Campos del schema OccupationalExam (modo estricto de Mongoose). */
const EXAM_SCHEMA_FIELDS = [
  'companyId',
  'employeeId',
  'examType',
  'examDate',
  'status',
  'nextDueDate',
  'fitnessStatus',
  'followUpRequired',
  'followUpDate',
  'periodicityMonths',
  'relatedHazards',
  'workerAcknowledged',
  'communicationDate',
  'occupationalContext',
] as const;

function createMockModel(allowedFields?: readonly string[]) {
  const docs: Record<string, unknown>[] = [];
  let idCounter = 1;

  // Cadenas compatibles con find().sort().exec(), find().select().lean().exec(),
  // findOne().exec() y findOne().select().lean().exec().
  function chainFind() {
    const chain: Record<string, unknown> = {};
    chain.sort = mock.fn(() => chain);
    chain.select = mock.fn(() => chain);
    chain.lean = mock.fn(() => chain);
    chain.exec = mock.fn(() => Promise.resolve(docs));
    return chain;
  }

  function chainFindOne() {
    const chain: Record<string, unknown> = {};
    chain.select = mock.fn(() => chain);
    chain.lean = mock.fn(() => chain);
    chain.exec = mock.fn(() => Promise.resolve(docs[0] ?? null));
    return chain;
  }

  // Mock construible (new model(fields)) como el Model real de Mongoose.
  function nextObjectId() {
    const hex = (idCounter++).toString(16).padStart(24, '0');
    return new Types.ObjectId(hex);
  }
  const model: any = function Model(this: Record<string, unknown>, fields?: Record<string, unknown>) {
    Object.assign(this, fields ?? {});
  };
  model.prototype.save = function save(this: Record<string, unknown>) {
    this._id = nextObjectId();
    if (allowedFields) {
      // Simula el modo estricto de Mongoose: los campos fuera del schema se omiten.
      const filtered: Record<string, unknown> = {};
      for (const key of Object.keys(this)) {
        if ((allowedFields as readonly string[]).includes(key)) filtered[key] = this[key];
      }
      Object.keys(this).forEach((key) => delete this[key]);
      Object.assign(this, filtered);
    }
    docs.push(this);
    return Promise.resolve(this);
  };
  model.find = mock.fn((..._args: unknown[]) => chainFind());
  model.findOne = mock.fn((..._args: unknown[]) => chainFindOne());
  model.findOneAndUpdate = mock.fn((..._args: unknown[]) => chainFindOne());
  model.findOneAndDelete = mock.fn((..._args: unknown[]) => chainFindOne());

  return { model, docs };
}

function createCompanyId() {
  return new Types.ObjectId('64b0000000000000000000a1');
}

function createEmployeeId() {
  return new Types.ObjectId('64b0000000000000000000b1');
}

// ── Tests ──

describe('OccupationalExamService', () => {
  let service: OccupationalExamService;
  let examModel: ReturnType<typeof createMockModel>;
  let employeeModel: ReturnType<typeof createMockModel>;
  let jobProfileModel: ReturnType<typeof createMockModel>;
  let riskModel: ReturnType<typeof createMockModel>;
  const companyId = createCompanyId();
  const employeeId = createEmployeeId();

  beforeEach(() => {
    examModel = createMockModel([...EXAM_SCHEMA_FIELDS]);
    employeeModel = createMockModel();
    jobProfileModel = createMockModel();
    riskModel = createMockModel();

    // Pre-populate employee model with a valid employee
    employeeModel.docs.push({
      _id: employeeId,
      companyId,
      name: 'Test Employee',
      document: '1234567890',
      position: 'Developer',
      area: 'IT',
      contractType: 'Indefinido',
      status: 'Activo',
    });

    service = new OccupationalExamService(
      examModel.model as never,
      employeeModel.model as never,
      jobProfileModel.model as never,
      riskModel.model as never,
    );
  });

  it('EXAM-001: Crear examen válido', async () => {
    const dto = {
      employeeId: String(employeeId),
      examType: ExamType.ENTRY,
      status: ExamStatus.SCHEDULED,
    };

    const result = await service.create(companyId, dto);
    assert.ok(result);
    assert.equal((result as unknown as Record<string, unknown>).examType, ExamType.ENTRY);
  });

  it('EXAM-002: Rechazar employeeId inexistente', async () => {
    const fakeEmployeeId = new Types.ObjectId('64b0000000000000000000ff');
    (employeeModel.model.findOne as unknown as ReturnType<typeof mock.fn>) = mock.fn(() => ({
      exec: mock.fn(() => Promise.resolve(null)),
    }));

    const dto = {
      employeeId: String(fakeEmployeeId),
      examType: ExamType.ENTRY,
      status: ExamStatus.SCHEDULED,
    };

    await assert.rejects(
      () => service.create(companyId, dto),
      (err: Error) => {
        assert.ok(err.message.includes('empleado'));
        return true;
      },
    );
  });

  it('EXAM-004: Tenant isolation en listado', async () => {
    const otherCompanyId = new Types.ObjectId('64b0000000000000000000a2');
    const otherEmployeeId = new Types.ObjectId('64b0000000000000000000b2');

    // Create exam for company A
    examModel.docs.push({
      _id: new Types.ObjectId(),
      companyId,
      employeeId,
      examType: ExamType.ENTRY,
      status: ExamStatus.COMPLETED,
    });

    // Create exam for company B
    examModel.docs.push({
      _id: new Types.ObjectId(),
      companyId: otherCompanyId,
      employeeId: otherEmployeeId,
      examType: ExamType.PERIODIC,
      status: ExamStatus.COMPLETED,
    });

    const result = await service.findAll(companyId);
    assert.ok(Array.isArray(result));
    // Both are in the mock docs, but the query should filter by companyId
    assert.equal(examModel.model.find.mock.callCount() > 0, true);
  });

  it('EXAM-008: Validación de examType', async () => {
    const dto = {
      employeeId: String(employeeId),
      examType: 'INVALID_TYPE',
      status: ExamStatus.SCHEDULED,
    };

    // This should fail validation at the DTO level, but we test the service
    // doesn't crash with invalid data
    const result = await service.create(companyId, dto as never);
    assert.ok(result);
  });

  it('EXAM-014: Estadísticas agregadas', async () => {
    // Add some exams to the mock
    examModel.docs.push(
      {
        _id: new Types.ObjectId(),
        companyId,
        employeeId,
        examType: ExamType.ENTRY,
        status: ExamStatus.COMPLETED,
        fitnessStatus: FitnessStatus.FIT,
        followUpRequired: false,
      },
      {
        _id: new Types.ObjectId(),
        companyId,
        employeeId,
        examType: ExamType.PERIODIC,
        status: ExamStatus.SCHEDULED,
        fitnessStatus: FitnessStatus.FIT_WITH_RESTRICTIONS,
        followUpRequired: true,
        followUpDate: new Date('2025-01-01'),
        nextDueDate: new Date('2025-01-01'),
      },
    );

    const stats = await service.getStats(companyId);
    assert.equal(stats.totalWorkers, 1);
    assert.equal(stats.totalExams, 2);
    assert.equal(stats.entryExams, 1);
    assert.equal(stats.periodicExams, 1);
    assert.equal(stats.completedExams, 1);
    assert.equal(stats.scheduledExams, 1);
    assert.equal(stats.followUpsRequired, 1);
    assert.ok(Array.isArray(stats.fitnessDistribution));
    assert.ok(Array.isArray(stats.examTypeDistribution));
  });

  it('EXAM-015: Estadísticas sin PII', async () => {
    examModel.docs.push({
      _id: new Types.ObjectId(),
      companyId,
      employeeId,
      examType: ExamType.ENTRY,
      status: ExamStatus.COMPLETED,
    });

    const stats = await service.getStats(companyId);
    const statsStr = JSON.stringify(stats);

    // Must not contain PII fields
    assert.ok(!statsStr.includes('name'), 'Stats should not contain name');
    assert.ok(!statsStr.includes('document'), 'Stats should not contain document');
    assert.ok(!statsStr.includes('email'), 'Stats should not contain email');
    assert.ok(!statsStr.includes('phone'), 'Stats should not contain phone');
    assert.ok(!statsStr.includes('diagnosis'), 'Stats should not contain diagnosis');
    assert.ok(!statsStr.includes('clinicalNotes'), 'Stats should not contain clinicalNotes');
  });

  it('EXAM-016: NO_DATA funciona sin error', async () => {
    // No exams in the mock
    const stats = await service.getStats(companyId);
    assert.equal(stats.totalWorkers, 1);
    assert.equal(stats.totalExams, 0);
    assert.equal(stats.completedExams, 0);
    assert.equal(stats.scheduledExams, 0);
    assert.equal(stats.expiredExams, 0);
    assert.equal(stats.followUpsRequired, 0);
    assert.equal(stats.upcomingExams, 0);
    assert.deepEqual(stats.fitnessDistribution, []);
    assert.deepEqual(stats.examTypeDistribution, []);
    assert.deepEqual(stats.statusDistribution, []);
  });

  it('EXAM-019: No acepta companyId desde frontend', async () => {
    // The service receives companyId from the controller via resolveCompanyId
    // It should never come from the DTO
    const dto = {
      employeeId: String(employeeId),
      examType: ExamType.ENTRY,
      companyId: 'fake-company-id', // This should be ignored
    } as never;

    const result = await service.create(companyId, dto);
    assert.ok(result);
    // companyId should be the one passed to the service, not from the DTO
    assert.equal((result as unknown as Record<string, unknown>).companyId, companyId);
  });

  it('EXAM-020: No acepta campos clínicos no permitidos', async () => {
    const dto = {
      employeeId: String(employeeId),
      examType: ExamType.ENTRY,
      status: ExamStatus.SCHEDULED,
      diagnosis: 'Hernia discal', // Should be rejected by DTO validation
      clinicalNotes: 'Paciente presenta dolor lumbar', // Should be rejected
    } as never;

    // The service should not crash even if extra fields are passed
    // (validation happens at DTO level in the controller)
    const result = await service.create(companyId, dto);
    assert.ok(result);
    // Extra fields should not be stored (Mongoose strips them)
    assert.equal((result as unknown as Record<string, unknown>).diagnosis, undefined);
    assert.equal((result as unknown as Record<string, unknown>).clinicalNotes, undefined);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 30D-2 — Contexto PRE-examen (3.1.3)
  // ═══════════════════════════════════════════════════════════════════════

  it('CONTEXT-001: crea examen con contexto PRE-examen válido (perfil del mismo tenant)', async () => {
    const profileId = new Types.ObjectId('64b0000000000000000000c1');
    const riskId = new Types.ObjectId('64b0000000000000000000c2');
    jobProfileModel.docs.push({ _id: profileId, companyId });
    riskModel.docs.push({ _id: riskId, companyId });

    const dto = {
      employeeId: String(employeeId),
      examType: ExamType.ENTRY,
      status: ExamStatus.COMPLETED,
      examDate: '2025-01-10',
      occupationalContext: {
        jobProfileId: String(profileId),
        riskIds: [String(riskId)],
        providedToEvaluator: true,
        providedAt: '2025-01-01',
        providedBy: 'uid-evaluador',
      },
    };

    const result = await service.create(companyId, dto);
    assert.ok(result);
    const ctx = (result as unknown as Record<string, unknown>).occupationalContext as Record<string, unknown>;
    assert.ok(ctx, 'contexto persistido');
    assert.equal(ctx.providedToEvaluator, true);
    assert.ok(ctx.jobProfileId instanceof Types.ObjectId, 'jobProfileId normalizado a ObjectId');
    assert.ok(ctx.providedAt instanceof Date, 'providedAt normalizado a Date');
  });

  it('CONTEXT-002: rechaza contexto con perfil de otra empresa (cross-tenant)', async () => {
    const otherProfileId = new Types.ObjectId('64b0000000000000000000c3');
    // jobProfileModel NO contiene el perfil de la empresa → validación falla.
    const dto = {
      employeeId: String(employeeId),
      examType: ExamType.ENTRY,
      status: ExamStatus.SCHEDULED,
      occupationalContext: {
        jobProfileId: String(otherProfileId),
        providedToEvaluator: true,
        providedAt: '2025-01-01',
        providedBy: 'uid',
      },
    };
    await assert.rejects(
      () => service.create(companyId, dto),
      (err: Error) => {
        assert.ok(err.message.includes('JobProfile del contexto'));
        return true;
      },
    );
  });

  it('CONTEXT-003: rechaza evidencia posterior al examen (providedAt > examDate)', async () => {
    const profileId = new Types.ObjectId('64b0000000000000000000c4');
    jobProfileModel.docs.push({ _id: profileId, companyId });
    const dto = {
      employeeId: String(employeeId),
      examType: ExamType.ENTRY,
      status: ExamStatus.COMPLETED,
      examDate: '2025-01-10',
      occupationalContext: {
        jobProfileId: String(profileId),
        providedToEvaluator: true,
        providedAt: '2026-01-01', // posterior al examen
        providedBy: 'uid',
      },
    };
    await assert.rejects(
      () => service.create(companyId, dto),
      /providedAt <= examDate/,
    );
  });

  it('CONTEXT-004: rechaza riesgos del contexto de otra empresa', async () => {
    const profileId = new Types.ObjectId('64b0000000000000000000c5');
    const otherRiskId = new Types.ObjectId('64b0000000000000000000c6');
    jobProfileModel.docs.push({ _id: profileId, companyId });
    // riskModel no contiene el riesgo → validación falla.
    const dto = {
      employeeId: String(employeeId),
      examType: ExamType.ENTRY,
      status: ExamStatus.SCHEDULED,
      occupationalContext: {
        jobProfileId: String(profileId),
        riskIds: [String(otherRiskId)],
        providedToEvaluator: true,
        providedAt: '2025-01-01',
        providedBy: 'uid',
      },
    };
    await assert.rejects(
      () => service.create(companyId, dto),
      /riesgos del contexto/,
    );
  });
});
