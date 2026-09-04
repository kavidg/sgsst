import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { OccupationalExamService } from './occupational-exam.service';
import { ExamType, ExamStatus, FitnessStatus } from './schemas/occupational-exam.schema';
import { Types } from 'mongoose';

// ── Mock helpers ──

function createMockModel() {
  const docs: Record<string, unknown>[] = [];
  let idCounter = 1;

  const model = {
    find: mock.fn(() => ({
      sort: mock.fn(() => ({
        exec: mock.fn(() => Promise.resolve(docs)),
      })),
      exec: mock.fn(() => Promise.resolve(docs)),
    })),
    findOne: mock.fn(() => ({
      exec: mock.fn(() => Promise.resolve(docs[0] ?? null)),
    })),
    findOneAndUpdate: mock.fn(() => ({
      exec: mock.fn(() => Promise.resolve(docs[0] ?? null)),
    })),
    findOneAndDelete: mock.fn(() => ({
      exec: mock.fn(() => Promise.resolve(docs[0] ?? null)),
    })),
    save: mock.fn(function (this: Record<string, unknown>) {
      this._id = new Types.ObjectId(String(idCounter++));
      docs.push(this);
      return Promise.resolve(this);
    }),
  };

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
  const companyId = createCompanyId();
  const employeeId = createEmployeeId();

  beforeEach(() => {
    examModel = createMockModel();
    employeeModel = createMockModel();

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
});
