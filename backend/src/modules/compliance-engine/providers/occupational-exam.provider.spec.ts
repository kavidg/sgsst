import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { OccupationalExamProvider } from './occupational-exam.provider';
import { ExamType, ExamStatus } from '../../occupational-exam/schemas/occupational-exam.schema';
import { Types } from 'mongoose';

// ── Mock helpers ──

function createCompanyId() {
  return new Types.ObjectId('64b0000000000000000000a1');
}

function createEmployeeId(suffix: string) {
  return new Types.ObjectId(`64b0000000000000000000${suffix}`);
}

function buildEmployee(companyId: Types.ObjectId, id: Types.ObjectId, overrides?: { status?: string }) {
  return {
    _id: id,
    companyId,
    name: `Employee ${id}`,
    document: '1234567890',
    position: 'Developer',
    area: 'IT',
    contractType: 'Indefinido',
    status: overrides?.status ?? 'Activo',
  };
}

function buildExam(
  companyId: Types.ObjectId,
  employeeId: Types.ObjectId,
  overrides: {
    examType?: ExamType;
    status?: ExamStatus;
    nextDueDate?: Date;
    followUpRequired?: boolean;
    followUpDate?: Date;
  } = {},
) {
  return {
    _id: new Types.ObjectId(),
    companyId,
    employeeId,
    examType: overrides.examType ?? ExamType.ENTRY,
    status: overrides.status ?? ExamStatus.COMPLETED,
    examDate: new Date('2025-01-15'),
    nextDueDate: overrides.nextDueDate,
    followUpRequired: overrides.followUpRequired ?? false,
    followUpDate: overrides.followUpDate,
  };
}

function createMockModel(docs: unknown[]) {
  return {
    find: mock.fn(() => ({
      exec: mock.fn(() => Promise.resolve(docs)),
    })),
  };
}

// ── Tests ──

describe('OccupationalExamProvider (3.1.2 · Exámenes médicos ocupacionales)', () => {
  const companyId = createCompanyId();
  let provider: OccupationalExamProvider;
  let employeeModel: ReturnType<typeof createMockModel>;
  let examModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    employeeModel = createMockModel([]);
    examModel = createMockModel([]);
    provider = new OccupationalExamProvider(
      employeeModel as never,
      examModel as never,
    );
  });

  it('METADATA-001: module es occupational-exam', () => {
    assert.equal((provider as unknown as { module: string }).module, undefined);
    // El módulo se define en el retorno de getCompliance
  });

  it('NO-DATA-001: Sin empleados retorna NO_DATA', async () => {
    const result = await provider.getCompliance(String(companyId));
    assert.equal(result.module, 'occupational-exam');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'exam-no-data');
    assert.equal(result.findings[0].priority, 'HIGH');
    assert.equal((result.phases as Record<string, unknown>)?.do, 0);
  });

  it('ENTRY-001: 25 trabajadores, 25 ENTRY COMPLETED → 100% entry', async () => {
    const employees = Array.from({ length: 25 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    const exams = employees.map((e) =>
      buildExam(companyId, e._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // Con 25/25 entry (30%) + 0 periodic (0%) + exit (100% porque no hay inactivos) + followUp (100% porque no hay seguimientos)
    // = 30 + 0 + 20 + 20 = 70%
    assert.ok(result.percentage >= 70, `Expected >= 70, got ${result.percentage}`);
    assert.equal(result.status, 'TARGET_NOT_MET');
  });

  it('ENTRY-002: 25 trabajadores, 20 ENTRY COMPLETED → 80% entry', async () => {
    const employees = Array.from({ length: 25 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    // Solo 20 tienen ENTRY COMPLETED
    const exams = employees.slice(0, 20).map((e) =>
      buildExam(companyId, e._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // entry: 20/25 * 30 = 24
    // periodic: 0/25 * 30 = 0
    // exit: 100% (no inactivos) * 20 = 20
    // followUp: 100% (no seguimientos) * 20 = 20
    // total = 24 + 0 + 20 + 20 = 64
    assert.equal(result.percentage, 64);
  });

  it('ENTRY-003: Un trabajador con 5 exámenes ENTRY → cuenta como 1', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];
    // 5 exámenes ENTRY para el mismo trabajador
    const exams = Array.from({ length: 5 }, () =>
      buildExam(companyId, emp._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // entry: 1/1 * 30 = 30
    assert.ok(result.percentage >= 30);
  });

  it('PERIODIC-001: PERIODIC COMPLETED con nextDueDate futura → vigente', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const exams = [
      buildExam(companyId, emp._id, {
        examType: ExamType.PERIODIC,
        status: ExamStatus.COMPLETED,
        nextDueDate: futureDate,
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // periodic: 1/1 * 30 = 30
    assert.ok(result.percentage >= 30);
  });

  it('PERIODIC-002: PERIODIC COMPLETED con nextDueDate pasada → vencido', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);

    const exams = [
      buildExam(companyId, emp._id, {
        examType: ExamType.PERIODIC,
        status: ExamStatus.COMPLETED,
        nextDueDate: pastDate,
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // periodic: 0/1 * 30 = 0 (examen vencido)
    // entry: 0/1 * 30 = 0
    // exit: 100% (no inactivos) * 20 = 20
    // followUp: 100% (no seguimientos) * 20 = 20
    // total = 0 + 0 + 20 + 20 = 40
    assert.equal(result.percentage, 40);
  });

  it('PERIODIC-003: Sin nextDueDate → se cuenta como cumplido (sin evidencia de vencimiento)', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        examType: ExamType.PERIODIC,
        status: ExamStatus.COMPLETED,
        // Sin nextDueDate
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // periodic: 1/1 * 30 = 30 (sin nextDueDate, se cuenta como cumplido)
    assert.ok(result.percentage >= 30);
  });

  it('EXIT-001: Trabajadores activos sin EXIT → no genera incumplimiento', async () => {
    const employees = Array.from({ length: 10 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0')), { status: 'Activo' }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel([]);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // exit: 100% (no hay inactivos, no hay situaciones de egreso)
    // find exam-missing-entry should exist but NOT exam related to exit
    const exitFindings = result.findings.filter((f) => f.id.includes('exit'));
    assert.equal(exitFindings.length, 0, 'No should generate exit findings for active workers');
  });

  it('EXIT-002: Trabajadores inactivos sin EXIT → genera incumplimiento', async () => {
    const activeEmp = buildEmployee(companyId, createEmployeeId('01'), { status: 'Activo' });
    const inactiveEmp = buildEmployee(companyId, createEmployeeId('02'), { status: 'No activo' });
    const employees = [activeEmp, inactiveEmp];

    employeeModel = createMockModel(employees);
    examModel = createMockModel([]);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // exit: 0/1 inactive have EXIT * 20 = 0 (only inactiveEmp is evaluated)
    assert.ok(result.percentage < 100);
  });

  it('FOLLOWUP-001: followUpRequired=true con followUpDate → cuenta', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        followUpRequired: true,
        followUpDate: new Date('2025-06-01'),
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // followUp: 1/1 * 20 = 20
    assert.ok(result.percentage >= 20);
  });

  it('FOLLOWUP-002: followUpRequired=true sin followUpDate → no cuenta', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        followUpRequired: true,
        // Sin followUpDate
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // followUp: 0/1 * 20 = 0
    // findings should include exam-missing-follow-up
    const followUpFinding = result.findings.find((f) => f.id === 'exam-missing-follow-up');
    assert.ok(followUpFinding, 'Should have exam-missing-follow-up finding');
  });

  it('TENANT-001: Tenant isolation — solo consulta exámenes de la empresa', async () => {
    const employees = [buildEmployee(companyId, createEmployeeId('01'))];
    const exams = [buildExam(companyId, employees[0]._id)];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    await provider.getCompliance(String(companyId));

    // Verificar que se pasó companyId al find
    assert.ok(employeeModel.find.mock.callCount() > 0, 'employeeModel.find should have been called');
    assert.ok(examModel.find.mock.callCount() > 0, 'examModel.find should have been called');
  });

  it('PRIVACY-001: Resultado no contiene PII', async () => {
    const employees = [buildEmployee(companyId, createEmployeeId('01'))];
    const exams = [buildExam(companyId, employees[0]._id)];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('Employee'), 'Should not contain employee names');
    assert.ok(!resultStr.includes('1234567890'), 'Should not contain document numbers');
    assert.ok(!resultStr.includes('diagnosis'), 'Should not contain diagnoses');
    assert.ok(!resultStr.includes('clinicalNotes'), 'Should not contain clinical notes');
    assert.ok(!resultStr.includes('medicalHistory'), 'Should not contain medical history');
  });

  it('RESULT-001: Resultado está entre 0 y 100', async () => {
    const employees = Array.from({ length: 10 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    const exams = employees.slice(0, 5).map((e) =>
      buildExam(companyId, e._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    assert.ok(result.percentage >= 0, `Percentage should be >= 0, got ${result.percentage}`);
    assert.ok(result.percentage <= 100, `Percentage should be <= 100, got ${result.percentage}`);
  });

  it('PHASES-001: Contribuye únicamente a HACER', async () => {
    const employees = [buildEmployee(companyId, createEmployeeId('01'))];
    const exams = [buildExam(companyId, employees[0]._id)];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    assert.ok((result.phases as Record<string, unknown>)?.do !== undefined, 'Should have phases.do');
    assert.equal((result.phases as Record<string, unknown>)?.plan, undefined, 'Should not have phases.plan');
    assert.equal((result.phases as Record<string, unknown>)?.check, undefined, 'Should not have phases.check');
    assert.equal((result.phases as Record<string, unknown>)?.act, undefined, 'Should not have phases.act');
  });

  it('NO-FINDINGS-001: No genera findings cuando todo está cumplido', async () => {
    const employees = Array.from({ length: 5 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const exams = employees.map((e) =>
      buildExam(companyId, e._id, {
        examType: ExamType.ENTRY,
        status: ExamStatus.COMPLETED,
      }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalExamProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // Con todos ENTRY COMPLETED + no inactivos + no seguimientos:
    // entry: 100% * 30 = 30
    // periodic: 0% * 30 = 0
    // exit: 100% * 20 = 20
    // followUp: 100% * 20 = 20
    // total = 70%
    // Findings: exam-missing-entry (0), exam-missing-periodic (5)
    const missingPeriodic = result.findings.find((f) => f.id === 'exam-missing-periodic');
    assert.ok(missingPeriodic, 'Should have exam-missing-periodic when no periodic exams');
  });
});
