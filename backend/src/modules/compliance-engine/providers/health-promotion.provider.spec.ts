import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { HealthPromotionProvider } from './health-promotion.provider';
import { Types } from 'mongoose';
import { HealthPromotionActivityStatus } from '../../health-promotion/schemas/health-promotion-activity.schema';

const companyA = new Types.ObjectId('64b00000000000000000a001');
const companyB = new Types.ObjectId('64b00000000000000000a002');

function emp(id: number): Types.ObjectId {
  return new Types.ObjectId(`64b0000000000000${String(id).padStart(8, '0')}`);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Mock de Model que filtra por el query (igualdad simple) y devuelve exec().
 * Suficiente para los queries del provider ({ companyId }).
 */
function createFilterModelMock(initial: Record<string, unknown>[] = []) {
  const model: any = {
    find: mock.fn((query: Record<string, unknown>) => {
      const matched = initial.filter((doc) =>
        Object.entries(query).every(([key, value]) => String(doc[key]) === String(value)),
      );
      return { exec: mock.fn(() => Promise.resolve(matched)) };
    }),
  };
  return { model, docs: initial };
}

function makeActivity(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(),
    companyId: companyA,
    code: 'ACT-001',
    title: 'Actividad de salud',
    description: '',
    category: 'HEALTH_PROMOTION',
    objective: 'Promover hábitos saludables',
    activityDate: undefined,
    responsible: 'Dra. Gómez',
    targetPopulation: 'Personal operativo',
    targetEmployeeIds: [],
    participantEmployeeIds: [],
    relatedRiskIds: [],
    evidence: 'Registro de ejecución',
    status: HealthPromotionActivityStatus.PLANNED,
    active: true,
    ...overrides,
  };
}

describe('HealthPromotionProvider (3.1.2 EXACT)', () => {
  let provider: HealthPromotionProvider;
  let activityModel: ReturnType<typeof createFilterModelMock>;
  let employeeModel: ReturnType<typeof createFilterModelMock>;

  function build(employees: Types.ObjectId[], activities: Record<string, unknown>[]) {
    employeeModel = createFilterModelMock(
      employees.map((id) => ({ _id: id, companyId: companyA })),
    );
    activityModel = createFilterModelMock(activities);
    provider = new HealthPromotionProvider(activityModel.model as never, employeeModel.model as never);
  }

  beforeEach(() => {
    employeeModel = createFilterModelMock();
    activityModel = createFilterModelMock();
    provider = new HealthPromotionProvider(activityModel.model as never, employeeModel.model as never);
  });

  it('METADATA-001: module es health-promotion y participa en phases.do', async () => {
    build([emp(1), emp(2)], []);
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.module, 'health-promotion');
    assert.equal(typeof result.phases?.do, 'number');
  });

  it('CASE-001: sin actividades → percentage 0 (C1=0) con hallazgo', async () => {
    build([emp(1), emp(2)], []);
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'TARGET_NOT_MET');
    assert.ok(result.findings.some((f) => f.id === 'health-promotion-no-activities'));
  });

  it('CASE-000: sin trabajadores → NO_DATA', async () => {
    build([], [makeActivity({})]);
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });

  it('CASE-002: solo actividades planificadas (sin ejecución) → 25 (solo C1)', async () => {
    build([emp(1), emp(2)], [
      makeActivity({ status: HealthPromotionActivityStatus.PLANNED, activityDate: isoDaysAgo(1) }),
      makeActivity({ status: HealthPromotionActivityStatus.PLANNED }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.percentage, 25);
    assert.ok(result.findings.some((f) => f.id === 'health-promotion-execution-pending'));
  });

  it('CASE-003: actividad completa ejecutada (1 trabajador de 5) → cobertura parcial', async () => {
    build([emp(1), emp(2), emp(3), emp(4), emp(5)], [
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(20),
        responsible: 'Dra. Gómez',
        evidence: 'Acta #1',
        participantEmployeeIds: [emp(1)],
      }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    // C1=25 + C2=25*(1/5)=5 + C3=25 + C4=0 → 55
    assert.equal(result.percentage, 55);
    assert.equal(result.completed, 1);
  });

  it('CASE-004: ejecutada sin responsable → C3 parcial (no 100)', async () => {
    build([emp(1)], [
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(20),
        responsible: '',
        evidence: 'Acta #1',
        participantEmployeeIds: [emp(1)],
      }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    // C1=25 + C2=25 + C3=25*(2/3)=16.67 → 66.67 → 67
    assert.equal(result.percentage, 67);
    assert.ok(result.findings.some((f) => f.id === 'health-promotion-execution-incomplete'));
  });

  it('CASE-005: ejecutada sin evidencia → C3 parcial', async () => {
    build([emp(1)], [
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(20),
        responsible: 'Dra. Gómez',
        evidence: '',
        participantEmployeeIds: [emp(1)],
      }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.percentage, 67);
  });

  it('CASE-006: ejecutada sin participantes → C2=0 y C3 parcial', async () => {
    build([emp(1), emp(2)], [
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(20),
        responsible: 'Dra. Gómez',
        evidence: 'Acta #1',
        participantEmployeeIds: [],
      }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    // C1=25 + C2=0 + C3=25*(2/3)=16.67 → 41.67 → 42
    assert.equal(result.percentage, 42);
  });

  it('CASE-007: población objetivo ≠ participantes reales (los objetivos no cuentan como cobertura)', async () => {
    build([emp(1), emp(2), emp(3), emp(4), emp(5)], [
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(20),
        responsible: 'Dra. Gómez',
        evidence: 'Acta #1',
        targetEmployeeIds: [emp(1), emp(2), emp(3), emp(4), emp(5)],
        participantEmployeeIds: [emp(1)],
      }),
      makeActivity({
        status: HealthPromotionActivityStatus.PLANNED,
        activityDate: isoDaysAgo(40),
        targetEmployeeIds: [emp(2)],
      }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    // relevant=2, executed=1 → C1=25, C2=25*(1/5)=5, C3=25*(1/2*1)=12.5, C4=0 → 43
    assert.equal(result.percentage, 43);
    assert.equal(result.pending, 1);
  });

  it('CASE-008: actividad futura no demuestra ejecución histórica', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    build([emp(1), emp(2)], [
      makeActivity({ status: HealthPromotionActivityStatus.COMPLETED, activityDate: future, participantEmployeeIds: [emp(1)] }),
      makeActivity({ status: HealthPromotionActivityStatus.PLANNED, activityDate: future }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    // Nada ejecutado → solo C1 (25)
    assert.equal(result.percentage, 25);
    assert.equal(result.completed, 0);
  });

  it('CASE-009: múltiples actividades ejecutadas en períodos distintos → continuidad (C4)', async () => {
    build([emp(1), emp(2), emp(3), emp(4), emp(5), emp(6), emp(7), emp(8), emp(9), emp(10)], [
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(105),
        responsible: 'A',
        evidence: 'E1',
        participantEmployeeIds: [emp(1), emp(2)],
      }),
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(74),
        responsible: 'B',
        evidence: 'E2',
        participantEmployeeIds: [emp(3), emp(4)],
      }),
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(43),
        responsible: 'C',
        evidence: 'E3',
        participantEmployeeIds: [emp(5), emp(6)],
      }),
    ]);
    const result = await provider.getCompliance(String(companyA));
    // C1=25 + C2=25*(6/10)=15 + C3=25 + C4=25 → 90 TARGET_MET
    assert.equal(result.percentage, 90);
    assert.equal(result.status, 'TARGET_MET');
  });

  it('CASE-010: tenant isolation — solo cuenta la empresa consultada', async () => {
    const activityA = makeActivity({
      companyId: companyA,
      status: HealthPromotionActivityStatus.COMPLETED,
      activityDate: isoDaysAgo(20),
      participantEmployeeIds: [emp(1)],
    });
    const activityB = makeActivity({
      companyId: companyB,
      status: HealthPromotionActivityStatus.COMPLETED,
      activityDate: isoDaysAgo(20),
      participantEmployeeIds: [emp(9)],
    });
    // El mock filtra por companyId: companyB NO ve la actividad/empleados de A.
    const employeeModelA = createFilterModelMock([
      { _id: emp(1), companyId: companyA },
      { _id: emp(9), companyId: companyB },
    ]);
    const activityModelA = createFilterModelMock([activityA, activityB]);
    const providerA = new HealthPromotionProvider(
      activityModelA.model as never,
      employeeModelA.model as never,
    );
    const result = await providerA.getCompliance(String(companyA));
    // Solo cuenta la actividad de A y sus trabajadores de A (emp1): 1 trabajador,
    // 1 participante → C1=25 + C2=25*(1/1)=25 + C3=25 + C4=0 = 75. El empleado
    // emp9 (empresa B) y su actividad NUNCA se mezclan.
    assert.equal(result.percentage, 75);
    const queryArg = activityModelA.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(String(queryArg.companyId), String(companyA));
  });
});
