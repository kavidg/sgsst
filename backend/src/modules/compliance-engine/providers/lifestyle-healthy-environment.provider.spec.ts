import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';
import { Types } from 'mongoose';

import { LifestyleHealthyEnvironmentProvider } from './lifestyle-healthy-environment.provider';
import { HealthPromotionProvider } from './health-promotion.provider';
import {
  HealthPromotionActivityStatus,
  HealthPromotionComplianceStandard,
} from '../../health-promotion/schemas/health-promotion-activity.schema';

const companyA = new Types.ObjectId('64b00000000000000000a001');
const companyB = new Types.ObjectId('64b00000000000000000a002');

function emp(id: number): Types.ObjectId {
  return new Types.ObjectId(`64b0000000000000${String(id).padStart(8, '0')}`);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDaysAhead(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Mock de Model que filtra por el query (igualdad simple) y devuelve exec().
 * Fiel al comportamiento Mongoose real: un query con
 * `complianceStandard: 'STANDARD_3_1_7'` NO matchea documentos sin el campo.
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
    code: 'EST-001',
    title: 'Jornada de estilos de vida saludable',
    description: '',
    category: 'HEALTH_WELLNESS',
    complianceStandard: HealthPromotionComplianceStandard.STANDARD_3_1_7,
    objective: 'Control de tabaquismo',
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

describe('LifestyleHealthyEnvironmentProvider (3.1.7 EXACT)', () => {
  let provider: LifestyleHealthyEnvironmentProvider;
  let activityModel: ReturnType<typeof createFilterModelMock>;
  let employeeModel: ReturnType<typeof createFilterModelMock>;

  beforeEach(() => {
    activityModel = createFilterModelMock();
    employeeModel = createFilterModelMock();
    provider = new LifestyleHealthyEnvironmentProvider(
      activityModel.model as never,
      employeeModel.model as never,
    );
  });

  it('NO_DATA: sin trabajadores → percentage 0 con finding específico', async () => {
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.module, 'lifestyle-healthy-environment');
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'lifestyle-healthy-environment-no-workers'));
  });

  it('C1 existencia: una actividad planificada 3.1.7 → 25 (existe, aún sin ejecución)', async () => {
    employeeModel.docs.push({ _id: emp(1), companyId: companyA });
    activityModel.docs.push(
      makeActivity({ status: HealthPromotionActivityStatus.PLANNED }),
    );
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.percentage, 25);
    assert.ok(result.findings.some((f) => f.id === 'lifestyle-healthy-environment-execution-pending'));
  });

  it('C2 cobertura: participantes reales de actividades ejecutadas (2 de 4 → cobertura parcial)', async () => {
    const workers = [emp(1), emp(2), emp(3), emp(4)];
    for (const id of workers) employeeModel.docs.push({ _id: id, companyId: companyA });
    activityModel.docs.push(
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(10),
        participantEmployeeIds: [emp(1), emp(2)],
      }),
    );
    const result = await provider.getCompliance(String(companyA));
    // C1=1, C2=0.5, C3=1 (completa), C4=0 → 25 + 12.5 + 25 + 0 = 62.5 → 63
    assert.equal(result.percentage, 63);
  });

  it('C2 cobertura: nunca cuenta la población objetivo (target) como alcanzada', async () => {
    const workers = [emp(1), emp(2)];
    for (const id of workers) employeeModel.docs.push({ _id: id, companyId: companyA });
    activityModel.docs.push(
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(10),
        targetEmployeeIds: [emp(1), emp(2)],
        participantEmployeeIds: [],
      }),
    );
    const result = await provider.getCompliance(String(companyA));
    // C1=1, C2=0, C3=2/3 (sin participantes), C4=0 → 25 + 0 + 16.67 ≈ 42
    assert.equal(result.percentage, 42);
  });

  it('C3 ejecución: COMPLETED sin fecha, o con fecha futura, NO demuestra ejecución', async () => {
    employeeModel.docs.push({ _id: emp(1), companyId: companyA });
    activityModel.docs.push(
      makeActivity({ status: HealthPromotionActivityStatus.COMPLETED, activityDate: undefined }),
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAhead(7),
        code: 'EST-002',
      }),
    );
    const result = await provider.getCompliance(String(companyA));
    // Ninguna ejecutada: C1=1, C2=0, C3=0, C4=0 → 25
    assert.equal(result.percentage, 25);
    assert.equal(result.completed, 0);
  });

  it('C3: actividad CANCELLED no es evidencia (excluida de relevantes)', async () => {
    employeeModel.docs.push({ _id: emp(1), companyId: companyA });
    activityModel.docs.push(
      makeActivity({ status: HealthPromotionActivityStatus.CANCELLED }),
    );
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'lifestyle-healthy-environment-no-activities'));
  });

  it('C4 continuidad: ejecución en 3 meses distintos → C4 completo', async () => {
    for (let i = 1; i <= 2; i++) employeeModel.docs.push({ _id: emp(i), companyId: companyA });
    const d = (year: number, month: number, day: number) =>
      new Date(Date.UTC(year, month, day)).toISOString();
    activityModel.docs.push(
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: d(2026, 0, 10),
        participantEmployeeIds: [emp(1)],
        code: 'EST-001',
      }),
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: d(2026, 1, 10),
        participantEmployeeIds: [emp(2)],
        code: 'EST-002',
      }),
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: d(2026, 2, 10),
        participantEmployeeIds: [emp(1), emp(2)],
        code: 'EST-003',
      }),
    );
    const result = await provider.getCompliance(String(companyA));
    // C1=1, C2=1, C3=1, C4=1 → 100
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
  });

  it('frontera normativa: el query filtra companyId + complianceStandard=STANDARD_3_1_7', async () => {
    employeeModel.docs.push({ _id: emp(1), companyId: companyA });
    await provider.getCompliance(String(companyA));
    const query = activityModel.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(String(query.companyId), String(companyA));
    assert.equal(
      query.complianceStandard,
      HealthPromotionComplianceStandard.STANDARD_3_1_7,
      'el provider 3.1.7 SOLO consume evidencia clasificada 3.1.7',
    );
  });

  it('frontera: actividades clasificadas 3.1.2 o sin clasificación NUNCA entran (mock filtra)', async () => {
    employeeModel.docs.push({ _id: emp(1), companyId: companyA });
    activityModel.docs.push(
      // En el tenant existen actividades 3.1.2 y legacy, pero el query del
      // provider 3.1.7 no las matchea (igual que Mongoose real).
      makeActivity({
        complianceStandard: HealthPromotionComplianceStandard.STANDARD_3_1_2,
        code: 'PYP-001',
      }),
      makeActivity({ complianceStandard: undefined, code: 'LEG-001' }),
    );
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'lifestyle-healthy-environment-no-activities'));
  });

  it('cross-tenant: actividades de otra empresa no son consumidas', async () => {
    employeeModel.docs.push({ _id: emp(1), companyId: companyA });
    activityModel.docs.push(
      makeActivity({
        companyId: companyB,
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(5),
        participantEmployeeIds: [emp(1)],
      }),
    );
    const result = await provider.getCompliance(String(companyA));
    assert.equal(result.percentage, 0);
  });

  it('referencias inválidas: participantes de otra empresa no cuentan para cobertura', async () => {
    employeeModel.docs.push({ _id: emp(1), companyId: companyA });
    activityModel.docs.push(
      makeActivity({
        status: HealthPromotionActivityStatus.COMPLETED,
        activityDate: isoDaysAgo(5),
        participantEmployeeIds: [emp(99)], // empleado de companyB, no registrado en A
      }),
    );
    const result = await provider.getCompliance(String(companyA));
    // C1=1, C2=0 (el participante no pertenece al tenant → cobertura 0),
    // C3=1 (completa formalmente), C4=0 → 50. La cobertura NUNCA se infla
    // con referencias cross-tenant y el finding de cobertura lo señala.
    assert.equal(result.percentage, 50);
    assert.ok(
      result.findings.some((f) => f.id === 'lifestyle-healthy-environment-coverage-pending'),
      'participantes cross-tenant no cuentan: cobertura real = 0',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 32 — Suite ANTI-DOUBLE-SCORING (3.1.2 ↔ 3.1.7)
// Una evidencia = un estándar de scoring.
// ═══════════════════════════════════════════════════════════════════════════
describe('FASE 32 — Anti-double-scoring 3.1.2 ↔ 3.1.7', () => {
  function buildProviders(docs: Record<string, unknown>[], employees: Record<string, unknown>[]) {
    const activityModel = createFilterModelMock(docs);
    const employeeModel = createFilterModelMock(employees);
    const hp = new HealthPromotionProvider(activityModel.model as never, employeeModel.model as never);
    const lifestyle = new LifestyleHealthyEnvironmentProvider(
      activityModel.model as never,
      employeeModel.model as never,
    );
    return { activityModel, employeeModel, hp, lifestyle };
  }

  it('CASO A: evidencia exclusivamente 3.1.2 → 3.1.2 puntúa, 3.1.7 NO', async () => {
    const employees = [{ _id: emp(1), companyId: companyA }];
    const { hp, lifestyle } = buildProviders(
      [
        makeActivity({
          complianceStandard: HealthPromotionComplianceStandard.STANDARD_3_1_2,
          status: HealthPromotionActivityStatus.COMPLETED,
          activityDate: isoDaysAgo(5),
          participantEmployeeIds: [emp(1)],
        }),
      ],
      employees,
    );
    const hpResult = await hp.getCompliance(String(companyA));
    const lifestyleResult = await lifestyle.getCompliance(String(companyA));
    assert.equal(hpResult.module, 'health-promotion');
    assert.ok(hpResult.percentage > 0, '3.1.2 recibe su evidencia');
    assert.equal(lifestyleResult.percentage, 0, '3.1.7 NO recibe evidencia 3.1.2');
    assert.equal(lifestyleResult.status, 'TARGET_NOT_MET');
  });

  it('CASO B: evidencia exclusivamente 3.1.7 → 3.1.7 puntúa, 3.1.2 NO', async () => {
    const employees = [{ _id: emp(1), companyId: companyA }];
    const { hp, lifestyle } = buildProviders(
      [
        makeActivity({
          complianceStandard: HealthPromotionComplianceStandard.STANDARD_3_1_7,
          status: HealthPromotionActivityStatus.COMPLETED,
          activityDate: isoDaysAgo(5),
          participantEmployeeIds: [emp(1)],
        }),
      ],
      employees,
    );
    const hpResult = await hp.getCompliance(String(companyA));
    const lifestyleResult = await lifestyle.getCompliance(String(companyA));
    assert.equal(lifestyleResult.module, 'lifestyle-healthy-environment');
    assert.ok(lifestyleResult.percentage > 0, '3.1.7 recibe su evidencia');
    assert.equal(hpResult.percentage, 0, '3.1.2 NO recibe evidencia 3.1.7');
  });

  it('CASO C: evidencia legacy sin clasificación → interpretada 3.1.2 (política de compatibilidad), NUNCA 3.1.7', async () => {
    // Política documentada en FASE 32: los registros previos a la
    // discriminación se interpretan como 3.1.2 para no perder evidencia
    // histórica (regla de no-regresión). El lado 3.1.7 siempre exige
    // clasificación explícita.
    const employees = [{ _id: emp(1), companyId: companyA }];
    const { hp, lifestyle } = buildProviders(
      [
        makeActivity({
          complianceStandard: undefined,
          status: HealthPromotionActivityStatus.COMPLETED,
          activityDate: isoDaysAgo(5),
          participantEmployeeIds: [emp(1)],
        }),
      ],
      employees,
    );
    const hpResult = await hp.getCompliance(String(companyA));
    const lifestyleResult = await lifestyle.getCompliance(String(companyA));
    assert.ok(hpResult.percentage > 0, 'legacy se conserva en 3.1.2 (no-regresión)');
    assert.equal(lifestyleResult.percentage, 0, '3.1.7 exige clasificación explícita');
  });

  it('CASO D: doble clasificación es estructuralmente imposible (un campo enum tipado)', async () => {
    const employees = [{ _id: emp(1), companyId: companyA }];
    const { activityModel, hp, lifestyle } = buildProviders(
      [
        makeActivity({
          status: HealthPromotionActivityStatus.COMPLETED,
          activityDate: isoDaysAgo(5),
          participantEmployeeIds: [emp(1)],
        }),
      ],
      employees,
    );
    await Promise.all([
      hp.getCompliance(String(companyA)),
      lifestyle.getCompliance(String(companyA)),
    ]);
    // Cada provider filtra por EXACTAMENTE un valor del enum (nunca ambos).
    const hpQuery = activityModel.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
    const lifestyleQuery = activityModel.model.find.mock.calls[1].arguments[0] as Record<
      string,
      unknown
    >;
    // health-promotion consulta todo el tenant y aplica la frontera en memoria
    // (legacy/3.1.2 → suyo; 3.1.7 excluido); lifestyle-healthy-environment
    // filtra exclusivamente STANDARD_3_1_7.
    assert.equal(lifestyleQuery.complianceStandard, HealthPromotionComplianceStandard.STANDARD_3_1_7);
    assert.ok(!('complianceStandard' in hpQuery));
    // La misma actividad jamás puede cumplir ambas condiciones: el campo es
    // único y tipado (enum), por lo que el doble scoring es imposible.
  });
});
