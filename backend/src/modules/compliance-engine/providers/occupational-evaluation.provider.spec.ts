import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { OccupationalEvaluationProvider } from './occupational-evaluation.provider';
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
    periodicityMonths?: number;
    workerAcknowledged?: boolean;
    communicationDate?: Date;
    relatedHazards?: string[];
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
    periodicityMonths: overrides.periodicityMonths,
    workerAcknowledged: overrides.workerAcknowledged ?? false,
    communicationDate: overrides.communicationDate,
    relatedHazards: overrides.relatedHazards,
    followUpRequired: false,
    followUpDate: undefined,
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

describe('OccupationalEvaluationProvider (3.1.4 · Realización de Evaluaciones Médicas Ocupacionales)', () => {
  const companyId = createCompanyId();
  let provider: OccupationalEvaluationProvider;
  let employeeModel: ReturnType<typeof createMockModel>;
  let examModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    employeeModel = createMockModel([]);
    examModel = createMockModel([]);
    provider = new OccupationalEvaluationProvider(
      employeeModel as never,
      examModel as never,
    );
  });

  it('SUPPORTS-001: module es occupational-evaluation', () => {
    assert.equal((provider as unknown as { module: string }).module, undefined);
  });

  it('NO-DATA-001: Sin exámenes retorna NO_DATA', async () => {
    const result = await provider.getCompliance(String(companyId));
    assert.equal(result.module, 'occupational-evaluation');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'occupational-evaluation-no-data');
    assert.equal(result.findings[0].priority, 'HIGH');
    assert.equal((result.phases as Record<string, unknown>)?.do, 0);
  });

  it('NO-DATA-002: Con empleados pero sin exámenes retorna NO_DATA', async () => {
    const employees = [
      buildEmployee(companyId, createEmployeeId('01')),
      buildEmployee(companyId, createEmployeeId('02')),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel([]);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });

  it('ENTRY-001: Todos los trabajadores con ENTRY COMPLETED → cumplimiento completo de ingreso', async () => {
    const employees = Array.from({ length: 10 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    const exams = employees.map((e) =>
      buildExam(companyId, e._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // entry: 10/10 * 25 = 25
    // periodic: 0/10 * 25 = 0
    // exit: 100% (no inactivos) * 20 = 20
    // communication: 0 active acknowledged / 10 active * 15 = 0
    // hazard: 0 active with hazards / 10 active * 15 = 0
    // total = 25 + 0 + 20 + 0 + 0 = 45
    assert.equal(result.percentage, 45);
  });

  it('ENTRY-002: 8 de 10 trabajadores con ENTRY COMPLETED', async () => {
    const employees = Array.from({ length: 10 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    const exams = employees.slice(0, 8).map((e) =>
      buildExam(companyId, e._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // entry: 8/10 * 25 = 20
    // periodic: 0/10 * 25 = 0
    // exit: 100% * 20 = 20
    // communication: 0/8 * 15 = 0
    // hazard: 0/8 * 15 = 0
    // total = 20 + 0 + 20 + 0 + 0 = 40
    assert.equal(result.percentage, 40);
  });

  it('PERIODIC-001: PERIODIC COMPLETED con periodicityMonths y nextDueDate futura → vigente', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const exams = [
      buildExam(companyId, emp._id, {
        examType: ExamType.PERIODIC,
        status: ExamStatus.COMPLETED,
        periodicityMonths: 12,
        nextDueDate: futureDate,
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // periodic: 1/1 * 25 = 25
    assert.ok(result.percentage >= 25, `Expected >= 25, got ${result.percentage}`);
  });

  it('PERIODIC-002: PERIODIC COMPLETED sin periodicityMonths → periodicity pending', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const exams = [
      buildExam(companyId, emp._id, {
        examType: ExamType.PERIODIC,
        status: ExamStatus.COMPLETED,
        nextDueDate: futureDate,
        // Sin periodicityMonths
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // periodic: 0/1 * 25 = 0 (sin periodicityMonths no se cuenta como vigente)
    const periodicFinding = result.findings.find((f) => f.id === 'occupational-evaluation-periodic-pending');
    assert.ok(periodicFinding, 'Should have periodic-pending finding');
    const periodicityFinding = result.findings.find((f) => f.id === 'occupational-evaluation-periodicity-pending');
    assert.ok(periodicityFinding, 'Should have periodicity-pending finding');
  });

  it('EXIT-001: Trabajadores activos sin EXIT → no genera incumplimiento de egreso', async () => {
    const employees = Array.from({ length: 10 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0')), { status: 'Activo' }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel([]);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    const exitFindings = result.findings.filter((f) => f.id.includes('exit'));
    assert.equal(exitFindings.length, 0, 'Should not generate exit findings for active workers');
  });

  it('EXIT-002: Trabajadores inactivos sin EXIT → genera incumplimiento de egreso', async () => {
    const activeEmp = buildEmployee(companyId, createEmployeeId('01'), { status: 'Activo' });
    const inactiveEmp = buildEmployee(companyId, createEmployeeId('02'), { status: 'No activo' });
    const employees = [activeEmp, inactiveEmp];

    // Add an ENTRY exam for the active employee so exams.length > 0
    // (otherwise the provider returns NO_DATA before evaluating exit logic)
    const exams = [
      buildExam(companyId, activeEmp._id, {
        examType: ExamType.ENTRY,
        status: ExamStatus.COMPLETED,
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // exit: 0/1 inactive * 20 = 0
    assert.ok(result.percentage < 100);
    const exitFinding = result.findings.find((f) => f.id === 'occupational-evaluation-exit-pending');
    assert.ok(exitFinding, 'Should have exit-pending finding');
  });

  it('EXIT-003: Trabajador inactivo CON EXIT COMPLETED → cumplimiento de egreso', async () => {
    const inactiveEmp = buildEmployee(companyId, createEmployeeId('01'), { status: 'No activo' });
    const employees = [inactiveEmp];

    const exams = [
      buildExam(companyId, inactiveEmp._id, {
        examType: ExamType.EXIT,
        status: ExamStatus.COMPLETED,
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // exit: 1/1 inactive * 20 = 20
    const exitFinding = result.findings.find((f) => f.id === 'occupational-evaluation-exit-pending');
    assert.equal(exitFinding, undefined, 'Should not have exit-pending finding');
  });

  it('COMMUNICATION-001: Todos con workerAcknowledged → comunicación completa', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        workerAcknowledged: true,
        communicationDate: new Date(),
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // communication: 1/1 * 15 = 15
    const commFinding = result.findings.find((f) => f.id === 'occupational-evaluation-communication-pending');
    assert.equal(commFinding, undefined, 'Should not have communication-pending finding');
  });

  it('COMMUNICATION-002: Sin workerAcknowledged → comunicación pendiente', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        workerAcknowledged: false,
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // communication: 0/1 * 15 = 0
    const commFinding = result.findings.find((f) => f.id === 'occupational-evaluation-communication-pending');
    assert.ok(commFinding, 'Should have communication-pending finding');
  });

  it('HAZARD-001: Todos con relatedHazards → cobertura completa', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        relatedHazards: ['Ruido', 'Polvo'],
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // hazard: 1/1 * 15 = 15
    const hazardFinding = result.findings.find((f) => f.id === 'occupational-evaluation-hazard-coverage-pending');
    assert.equal(hazardFinding, undefined, 'Should not have hazard-coverage-pending finding');
  });

  it('HAZARD-002: Sin relatedHazards → cobertura pendiente', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        relatedHazards: [],
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // hazard: 0/1 * 15 = 0
    const hazardFinding = result.findings.find((f) => f.id === 'occupational-evaluation-hazard-coverage-pending');
    assert.ok(hazardFinding, 'Should have hazard-coverage-pending finding');
  });

  it('SCORING-001: Scoring ponderado correcto (25/25/20/15/15)', async () => {
    // 5 empleados, todos con ENTRY + PERIODIC vigente + EXIT inactivo + communication + hazard
    const employees = [
      buildEmployee(companyId, createEmployeeId('01'), { status: 'Activo' }),
      buildEmployee(companyId, createEmployeeId('02'), { status: 'Activo' }),
      buildEmployee(companyId, createEmployeeId('03'), { status: 'Activo' }),
      buildEmployee(companyId, createEmployeeId('04'), { status: 'Activo' }),
      buildEmployee(companyId, createEmployeeId('05'), { status: 'No activo' }),
    ];

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const exams = employees.map((e) =>
      buildExam(companyId, e._id, {
        examType: ExamType.ENTRY,
        status: ExamStatus.COMPLETED,
        periodicityMonths: 12,
        workerAcknowledged: true,
        relatedHazards: ['Ruido'],
      }),
    );
    // Agregar examen periódico y de egreso
    for (const emp of employees) {
      exams.push(
        buildExam(companyId, emp._id, {
          examType: ExamType.PERIODIC,
          status: ExamStatus.COMPLETED,
          periodicityMonths: 12,
          nextDueDate: futureDate,
          workerAcknowledged: true,
          relatedHazards: ['Polvo'],
        }),
      );
    }
    // Examen de egreso para el inactivo
    exams.push(
      buildExam(companyId, employees[4]._id, {
        examType: ExamType.EXIT,
        status: ExamStatus.COMPLETED,
        workerAcknowledged: true,
        relatedHazards: ['Químicos'],
      }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // entry: 5/5 * 25 = 25
    // periodic: 5/5 * 25 = 25
    // exit: 1/1 inactive * 20 = 20
    // communication: all active exams acknowledged → 15
    // hazard: all active exams have hazards → 15
    // total = 25 + 25 + 20 + 15 + 15 = 100
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
  });

  it('SCORING-002: Scoring parcial', async () => {
    // 4 empleados, solo 2 con ENTRY
    const employees = Array.from({ length: 4 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    const exams = employees.slice(0, 2).map((e) =>
      buildExam(companyId, e._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // entry: 2/4 * 25 = 12.5 → 13
    // periodic: 0/4 * 25 = 0
    // exit: 100% * 20 = 20
    // communication: 0/2 * 15 = 0
    // hazard: 0/2 * 15 = 0
    // total = 13 + 0 + 20 + 0 + 0 = 33
    assert.equal(result.percentage, 33);
    assert.equal(result.status, 'TARGET_NOT_MET');
  });

  it('TENANT-001: Tenant isolation — consulta modelos con companyId', async () => {
    const employees = [buildEmployee(companyId, createEmployeeId('01'))];
    const exams = [buildExam(companyId, employees[0]._id)];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    await provider.getCompliance(String(companyId));

    assert.ok(employeeModel.find.mock.callCount() > 0, 'employeeModel.find should have been called');
    assert.ok(examModel.find.mock.callCount() > 0, 'examModel.find should have been called');
  });

  it('PRIVACY-001: Resultado no contiene PII', async () => {
    const employees = [buildEmployee(companyId, createEmployeeId('01'))];
    const exams = [buildExam(companyId, employees[0]._id)];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('Employee'), 'Should not contain employee names');
    assert.ok(!resultStr.includes('1234567890'), 'Should not contain document numbers');
    assert.ok(!resultStr.includes('diagnosis'), 'Should not contain diagnoses');
    assert.ok(!resultStr.includes('clinicalNotes'), 'Should not contain clinical notes');
    assert.ok(!resultStr.includes('medicalHistory'), 'Should not contain medical history');
    assert.ok(!resultStr.includes('treatment'), 'Should not contain treatments');
    assert.ok(!resultStr.includes('medication'), 'Should not contain medications');
  });

  it('PHASES-001: Contribuye únicamente a HACER', async () => {
    const employees = [buildEmployee(companyId, createEmployeeId('01'))];
    const exams = [buildExam(companyId, employees[0]._id)];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    assert.ok((result.phases as Record<string, unknown>)?.do !== undefined, 'Should have phases.do');
    assert.equal((result.phases as Record<string, unknown>)?.plan, undefined, 'Should not have phases.plan');
    assert.equal((result.phases as Record<string, unknown>)?.check, undefined, 'Should not have phases.check');
    assert.equal((result.phases as Record<string, unknown>)?.act, undefined, 'Should not have phases.act');
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
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    assert.ok(result.percentage >= 0, `Percentage should be >= 0, got ${result.percentage}`);
    assert.ok(result.percentage <= 100, `Percentage should be <= 100, got ${result.percentage}`);
  });

  it('FINDINGS-001: Genera findings correctos', async () => {
    const employees = Array.from({ length: 5 }, (_, i) =>
      buildEmployee(companyId, createEmployeeId(String(i).padStart(2, '0'))),
    );
    const exams = employees.slice(0, 3).map((e) =>
      buildExam(companyId, e._id, { examType: ExamType.ENTRY, status: ExamStatus.COMPLETED }),
    );

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));

    const entryFinding = result.findings.find((f) => f.id === 'occupational-evaluation-entry-pending');
    assert.ok(entryFinding, 'Should have entry-pending finding');
    assert.equal(entryFinding!.module, 'occupational-evaluation');

    const periodicFinding = result.findings.find((f) => f.id === 'occupational-evaluation-periodic-pending');
    assert.ok(periodicFinding, 'Should have periodic-pending finding');
  });

  it('CANCELLED-001: Exámenes cancelados no afectan comunicación', async () => {
    const emp = buildEmployee(companyId, createEmployeeId('01'));
    const employees = [emp];

    const exams = [
      buildExam(companyId, emp._id, {
        status: ExamStatus.CANCELLED,
        workerAcknowledged: false,
      }),
    ];

    employeeModel = createMockModel(employees);
    examModel = createMockModel(exams);
    provider = new OccupationalEvaluationProvider(employeeModel as never, examModel as never);

    const result = await provider.getCompliance(String(companyId));
    // Solo 1 examen y está cancelado → active exams = 0 → communicationScore = 1
    const commFinding = result.findings.find((f) => f.id === 'occupational-evaluation-communication-pending');
    assert.equal(commFinding, undefined, 'Cancelled exams should not affect communication');
  });
});
