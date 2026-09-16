import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Types } from 'mongoose';
import { JobProfileMedicalInformationProvider } from './job-profile-medical-information.provider';

const companyId = new Types.ObjectId('64b00000000000000000a001');
const companyIdString = companyId.toString();
const employeeId1 = new Types.ObjectId('64b00000000000000000b001');
const employeeId2 = new Types.ObjectId('64b00000000000000000b002');
const profileId1 = new Types.ObjectId('64b00000000000000000d001');
const profileId2 = new Types.ObjectId('64b00000000000000000d002');
const hazardId = new Types.ObjectId('64b00000000000000000c001');

function createMockModel(docs: any[] = []) {
  return {
    find: mock.fn(() => ({
      exec: mock.fn(() => Promise.resolve(docs)),
    })),
  } as any;
}

function makeProfile(overrides: Record<string, unknown> = {}): any {
  return {
    _id: profileId1,
    companyId,
    code: 'OP-01',
    name: 'Operario',
    description: 'Cargo de producción',
    functions: ['Operar máquina'],
    responsibilities: ['Cumplir normas'],
    workConditions: ['Turno rotativo'],
    associatedHazardIds: [hazardId],
    medicalRelevantInformation: 'Exige levantamiento de carga',
    active: true,
    ...overrides,
  };
}

function makeEmployee(overrides: Record<string, unknown> = {}): any {
  return {
    _id: employeeId1,
    companyId,
    position: 'Operario',
    jobProfileId: profileId1,
    ...overrides,
  };
}

function makeExam(overrides: Record<string, unknown> = {}): any {
  return {
    _id: new Types.ObjectId(),
    companyId,
    employeeId: employeeId1,
    status: 'COMPLETED',
    examDate: new Date('2025-01-10'),
    occupationalContext: {
      jobProfileId: profileId1,
      riskIds: [hazardId],
      providedToEvaluator: true,
      providedAt: new Date('2025-01-01'),
      providedBy: 'uid-evaluador',
    },
    ...overrides,
  };
}

function buildProvider(
  employees: any[],
  profiles: any[],
  exams: any[],
): JobProfileMedicalInformationProvider {
  return new JobProfileMedicalInformationProvider(
    createMockModel(profiles),
    createMockModel(employees),
    createMockModel(exams),
  );
}

describe('JobProfileMedicalInformationProvider (3.1.3 · EXACT)', () => {
  it('METADATA-001: module es job-profile-medical-information', async () => {
    const provider = buildProvider([], [], []);
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.module, 'job-profile-medical-information');
  });

  it('CASE-000: sin trabajadores → NO_DATA con score 0', async () => {
    const provider = buildProvider([], [], []);
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.phases?.do, 0);
    assert.equal(result.findings[0].id, 'job-profile-no-workers');
  });

  it('CASE-100: perfil completo + trabajador asociado + evidencia PRE-examen válida → 100', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile()],
      [makeExam()],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.completed, 1);
    assert.equal(result.pending, 0);
  });

  it('CASE-075a: evidencia con providedToEvaluator=false → C4 no cumple (75)', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile()],
      [makeExam({ occupationalContext: { ...makeExam().occupationalContext, providedToEvaluator: false } })],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 75);
    const evidenceFinding = result.findings.find((f) => f.id === 'job-profile-pre-exam-evidence-pending');
    assert.ok(evidenceFinding);
  });

  it('CASE-075b: evidencia con providedAt > examDate → C4 no cumple (75)', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile()],
      [makeExam({ occupationalContext: { ...makeExam().occupationalContext, providedAt: new Date('2026-01-01') } })],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 75);
  });

  it('CASE-075c: evidencia sin actor (providedBy vacío) → C4 no cumple (75)', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile()],
      [makeExam({ occupationalContext: { ...makeExam().occupationalContext, providedBy: '' } })],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 75);
  });

  it('CASE-075d: evidencia sin jobProfileId → C4 no cumple (75)', async () => {
    const ctx = makeExam().occupationalContext;
    delete ctx.jobProfileId;
    const provider = buildProvider([makeEmployee()], [makeProfile()], [makeExam({ occupationalContext: ctx })]);
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 75);
  });

  it('CASE-075e: examen histórico sin contexto PRE-examen → C4=0 (75, anti-falsificación)', async () => {
    // workerAcknowledged/communicationDate NO son evidencia de C4.
    const exam = makeExam();
    delete exam.occupationalContext;
    exam.workerAcknowledged = true;
    exam.communicationDate = new Date('2025-01-15');
    const provider = buildProvider([makeEmployee()], [makeProfile()], [exam]);
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 75);
  });

  it('CASE-TENANT: contexto con perfil de otra empresa → C4 no cumple (75)', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile()],
      [makeExam({ occupationalContext: { ...makeExam().occupationalContext, jobProfileId: profileId2 } })],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 75);
  });

  it('CASE-083: perfil sin información funcional completa → C2 parcial', async () => {
    // Solo description (sin functions ni responsibilities): C2 = 1/3.
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile({ description: 'desc', functions: [], responsibilities: [] })],
      [makeExam()],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, Math.round(25 + 25 / 3 + 25 + 25)); // 83
  });

  it('CASE-075f: perfil sin información médica relevante → C3 = 0', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile({ workConditions: [], associatedHazardIds: [], medicalRelevantInformation: '' })],
      [makeExam()],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 75);
  });

  it('CASE-000b: sin perfiles ni exámenes (con trabajador) → score 0 + findings', async () => {
    const provider = buildProvider([makeEmployee({ jobProfileId: undefined })], [], []);
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'job-profile-coverage-pending'));
  });

  it('CASE-COVERAGE: trabajador con perfil inactivo no cuenta en C1', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile({ active: false })],
      [],
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 0);
  });

  it('CASE-MULTI: 2 trabajadores, 1 asociado, 1 de 2 exámenes con evidencia → 75', async () => {
    const provider = buildProvider(
      [
        makeEmployee(),
        makeEmployee({ _id: employeeId2, jobProfileId: undefined }),
      ],
      [makeProfile()],
      [
        makeExam(),
        // Examen sin contexto PRE-examen (empleado sin perfil): C4 no cuenta.
        makeExam({ _id: new Types.ObjectId(), employeeId: employeeId2, occupationalContext: undefined }),
      ],
    );
    const result = await provider.getCompliance(companyIdString);
    // C1=0.5 (12.5) + C2=25 + C3=25 + C4=0.5 (12.5) = 75
    assert.equal(result.percentage, 75);
  });

  it('CASE-CAMBIO: perfil desactivado tras la evaluación conserva la evidencia en C4 pero no cubre C1', async () => {
    const provider = buildProvider(
      [makeEmployee()],
      [makeProfile({ active: false })],
      [makeExam()],
    );
    const result = await provider.getCompliance(companyIdString);
    // C1=0 + C2=0 + C3=0 (sin activos) + C4=25 → 25
    assert.equal(result.percentage, 25);
    assert.equal(result.completed, 1);
  });

  it('TENANT-QUERY: todas las consultas se filtran por companyId', async () => {
    const profileModel = createMockModel([makeProfile()]);
    const employeeModel = createMockModel([makeEmployee()]);
    const examModel = createMockModel([makeExam()]);
    const provider = new JobProfileMedicalInformationProvider(
      profileModel, employeeModel, examModel,
    );
    await provider.getCompliance(companyIdString);
    for (const model of [profileModel, employeeModel, examModel]) {
      assert.equal(model.find.mock.callCount(), 1);
      const arg = model.find.mock.calls[0].arguments[0];
      assert.equal(String(arg.companyId), companyIdString);
    }
  });

  it('ANTI-FALSIFY: el provider NO consulta MedicalRecommendation', async () => {
    const profileModel = createMockModel([makeProfile()]);
    const employeeModel = createMockModel([makeEmployee()]);
    const examModel = createMockModel([makeExam()]);
    const provider = new JobProfileMedicalInformationProvider(
      profileModel, employeeModel, examModel,
    );
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.percentage, 100);
    assert.equal(profileModel.find.mock.callCount(), 1);
    assert.equal(employeeModel.find.mock.callCount(), 1);
    assert.equal(examModel.find.mock.callCount(), 1);
  });
});
