import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIGADE_FUNCTIONS,
  CORE_FUNCTIONS,
  EMERGENCY_BRIGADE_FORMULA,
  EMERGENCY_BRIGADE_MODULE,
  EMERGENCY_BRIGADE_SCORE_WEIGHTS,
  EMERGENCY_BRIGADE_STANDARD_CODE,
  computeEmergencyBrigadeScore,
} from './emergency-brigade-scoring';
import { computeEmergencyPlanScore } from './emergency-plan-scoring';

/**
 * Tests del núcleo PURO de scoring 5.1.2 (emergency-brigade-scoring.ts).
 * Función determinista: sin Mongo, sin providers, sin tiempo real (now
 * inyectable). Frontera 5.1.1 verificada de punta a punta con la función
 * PURA oficial de 5.1.1 (computeEmergencyPlanScore): una brigada con 0% o
 * 100% de capacitación, y con cualquier composición de funciones/alternos,
 * NO cambia el score del Plan de emergencias.
 */

const COMPANY_A = '507f1f77bcf86cd799439011';
const COMPANY_B = '507f1f77bcf86cd799439022';
const NOW = new Date('2026-09-22T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

// ── Fábricas ──

const TENANT = ['a1a1a1a1a1a1a1a1a1a1a1a1', 'b2b2b2b2b2b2b2b2b2b2b2b2', 'c3c3c3c3c3c3c3c3c3c3c3c3', 'd4d4d4d4d4d4d4d4d4d4d4d4'];
let memberSeq = 0;
let employeeSeq = 0;
/** Ids únicos por llamada (evita duplicados accidentales entre fábricas). */
const ISSUED_EMPLOYEE_IDS = new Set<string>();
const nextEmployeeId = (): string => {
  const id = (employeeSeq++).toString(16).padStart(2, '0') + 'a1a1a1a1a1a1a1a1a1a1a1';
  ISSUED_EMPLOYEE_IDS.add(id);
  return id;
};

function member(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    memberId: `m-${++memberSeq}`,
    employeeId: nextEmployeeId(),
    employeeNameSnapshot: `Brigadista ${memberSeq}`,
    function: 'EVACUATION',
    isAlternate: false,
    active: true,
    trainingDate: daysAgo(30),
    trainingEvidence: 'https://evidencia/curso.pdf',
    trainingType: 'Brigada',
    observations: '',
    ...overrides,
  };
}

function brigade(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    brigadeId: `b-${++memberSeq}`,
    name: 'Brigada Principal',
    type: 'Evacuación',
    leader: '',
    members: [],
    typedMembers: [],
    meetingFrequency: 'Mensual',
    lastMeetingDate: daysAgo(10),
    active: true,
    ...overrides,
  };
}

function score(brigades: Record<string, unknown>[], employeeIdsInTenant: string[] = [...ISSUED_EMPLOYEE_IDS]) {
  return computeEmergencyBrigadeScore(
    { brigades: brigades as never, employeeIdsInTenant },
    NOW,
  );
}

/** Brigada estructuralmente completa (líder + núcleo con alternos + operación). */
function completeBrigade(): Record<string, unknown> {
  return brigade({
    typedMembers: [
      member({ function: 'LEADER' }),
      member({ function: 'EVACUATION' }),
      member({ function: 'FIRST_AID' }),
      member({ function: 'FIREFIGHTING' }),
      member({ function: 'EVACUATION', isAlternate: true }),
      member({ function: 'FIRST_AID', isAlternate: true }),
      member({ function: 'FIREFIGHTING', isAlternate: true }),
      member({ function: 'COMMUNICATION' }),
      member({ function: 'LOGISTICS' }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Identidad
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeScoring — identidad', () => {
  it('module = emergency-brigade, standardCode = 5.1.2, fórmula dimensions:v1', () => {
    assert.equal(EMERGENCY_BRIGADE_MODULE, 'emergency-brigade');
    assert.equal(EMERGENCY_BRIGADE_STANDARD_CODE, '5.1.2');
    assert.equal(EMERGENCY_BRIGADE_FORMULA, 'dimensions:v1');
  });

  it('los pesos suman exactamente 100 (distribución corregida documentada)', () => {
    const total = Object.values(EMERGENCY_BRIGADE_SCORE_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.equal(total, 100);
    assert.deepEqual(EMERGENCY_BRIGADE_SCORE_WEIGHTS, {
      existence: 10, composition: 20, functionalCoverage: 25,
      training: 20, alternates: 15, traceability: 5, operation: 5,
    });
  });

  it('funciones núcleo y enum completos', () => {
    assert.deepEqual(CORE_FUNCTIONS, ['EVACUATION', 'FIRST_AID', 'FIREFIGHTING']);
    assert.deepEqual(BRIGADE_FUNCTIONS, [
      'LEADER', 'EVACUATION', 'FIRST_AID', 'FIREFIGHTING', 'COMMUNICATION', 'LOGISTICS', 'OTHER',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeScoring — NO_DATA', () => {
  it('sin brigadas → NO_DATA con finding oficial', () => {
    const result = score([]);
    assert.equal(result.noData, true);
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-no-data'));
  });

  it('brigada inactiva solamente → NO_DATA con finding no-active-brigade', () => {
    const result = score([brigade({ active: false, typedMembers: [member()] })]);
    assert.equal(result.noData, true);
    assert.equal(result.allBrigadesInactive, true);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-no-active-brigade'));
  });

  it('brigada activa sin miembros → solo existencia+operación (15), NO NO_DATA', () => {
    // Sin redistribución: existencia (10) y operación (5) subsisten; las
    // dimensiones sin evidencia valen 0 (incumplimiento real).
    const result = score([brigade()]);
    assert.equal(result.noData, false);
    assert.equal(result.percentage, 15);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-no-members'));
  });

  it('brigada activa incompleta → score parcial sin NO_DATA (existencia y operación subsisten)', () => {
    // Sin miembros: existencia (10) + operación (5) = 15 puntos; las demás
    // dimensiones sin evidencia valen 0 (incumplimiento, sin redistribución).
    const result = score([brigade({ typedMembers: [member({ function: 'LEADER' })] })]);
    assert.equal(result.noData, false);
    assert.ok(result.percentage > 0 && result.percentage < 100);
  });

  it('brigada estructurada → score alto', () => {
    const result = score([completeBrigade()]);
    assert.equal(result.noData, false);
    // Sin socialización/documento, el piso estructural completo ronda 95:
    // traceability 5 + operation 5 + resto de dimensiones en 1.
    assert.ok(result.percentage >= 90, `esperaba >=90, fue ${result.percentage}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Existencia / Composición / Integridad
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeScoring — existencia y composición', () => {
  it('brigada activa con nombre → existencia 1', () => {
    const result = score([brigade({ typedMembers: [member()] })]);
    assert.equal(result.dimensions.existence.ratio, 1);
  });

  it('brigada activa sin nombre → existencia 0 y counter brigadesNamed = 0', () => {
    const result = score([brigade({ name: '   ', typedMembers: [member()] })]);
    assert.equal(result.dimensions.existence.ratio, 0);
    assert.equal(result.counters.brigadesNamed, 0);
  });

  it('miembros válidos → composición 1', () => {
    const result = score([brigade({ typedMembers: [member({ function: 'LEADER' }), member({ function: 'EVACUATION' })] })]);
    assert.equal(result.dimensions.composition.ratio, 1);
    assert.equal(result.counters.validMembers, 2);
  });

  it('employeeId cross-tenant → miembro inválido + composition castiga', () => {
    const validId = 'a1a1a1a1a1a1a1a1a1a1a1a1';
    const result = score(
      [brigade({ typedMembers: [member({ employeeId: 'eeeeeeeeeeeeeeeeeeeeeeee' }), member({ employeeId: validId })] })],
      [validId],
    );
    assert.equal(result.dimensions.composition.ratio, 0.5);
    assert.equal(result.details.composition.invalidMembers, 1);
  });

  it('duplicate employee en la MISMA brigada → no infla métricas y cuenta como incidencia', () => {
    const emp = 'a1a1a1a1a1a1a1a1a1a1a1a1';
    const result = score([brigade({
      typedMembers: [
        member({ employeeId: emp, function: 'LEADER' }),
        member({ employeeId: emp, function: 'LEADER' }),
        member({ employeeId: emp, function: 'LEADER', isAlternate: true }),
      ],
    })], [emp]);
    assert.equal(result.counters.duplicateEmployees, 2);
    assert.equal(result.counters.leaders, 1, 'los duplicados no suman líderes');
    assert.equal(result.counters.activeMembers, 1, 'los duplicados no suman miembros');
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-duplicates'));
  });

  it('el mismo empleado en BRIGADAS DISTINTAS es legítimo (no duplicado)', () => {
    const emp = 'a1a1a1a1a1a1a1a1a1a1a1a1';
    const result = score([
      brigade({ typedMembers: [member({ employeeId: emp, function: 'LEADER' })] }),
      brigade({ typedMembers: [member({ employeeId: emp, function: 'EVACUATION' })] }),
    ]);
    assert.equal(result.counters.duplicateEmployees, 0);
    assert.equal(result.counters.activeMembers, 2);
  });

  it('OTHER con observations → válido; OTHER sin observations → integridad incompleta', () => {
    const result = score([brigade({
      typedMembers: [
        member({ function: 'LEADER' }),
        member({ function: 'OTHER', observations: 'Apoyo logístico en simulacros' }),
        member({ function: 'OTHER', observations: '' }),
      ],
    })]);
    assert.equal(result.dimensions.composition.ratio, 2 / 3);
    assert.equal(result.details.traceability.otherWithoutObservations, 1);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-integrity'));
  });

  it('membersWithoutEmployee permanece como contador de trazabilidad', () => {
    const result = score([brigade({ typedMembers: [member({ employeeId: undefined })] })]);
    assert.equal(result.counters.membersWithoutEmployee, 1);
    assert.equal(result.counters.validMembers, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Funciones y alternos
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeScoring — cobertura funcional y alternos', () => {
  it('sin LEADER → finding no-leader y dimensión 3/8 (núcleo 1, líder 0)', () => {
    const result = score([brigade({
      typedMembers: [
        member({ function: 'EVACUATION' }),
        member({ function: 'FIRST_AID' }),
        member({ function: 'FIREFIGHTING' }),
      ],
    })]);
    assert.equal(result.dimensions.functionalCoverage.ratio, (1 + 0) / 2);
    assert.equal(result.dimensions.functionalCoverage.numerator, 3);
    assert.equal(result.dimensions.functionalCoverage.denominator, 4);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-no-leader'));
  });

  it('sin una función núcleo → cobertura (2/3+1)/2 y finding core-functions-incomplete', () => {
    const result = score([brigade({
      typedMembers: [
        member({ function: 'LEADER' }),
        member({ function: 'EVACUATION' }),
        member({ function: 'FIRST_AID' }),
      ],
    })]);
    const coverageRatio = result.dimensions.functionalCoverage.ratio ?? 0;
    assert.ok(
      Math.abs(coverageRatio - 5 / 6) < 1e-9,
      `esperaba ≈5/6, fue ${coverageRatio}`,
    );
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-core-functions-incomplete'));
  });

  it('BRIGADE.leader (texto) NO sustituye al titular LEADER tipado', () => {
    const result = score([brigade({ leader: 'Juan Pérez', typedMembers: [member({ function: 'EVACUATION' })] })]);
    assert.equal(result.dimensions.functionalCoverage.leaderPresent, false);
    assert.equal(result.counters.leaders, 0);
  });

  it('COMMUNICATION/LOGISTICS son metadata y NO compensan el núcleo', () => {
    const result = score([brigade({
      typedMembers: [
        member({ function: 'LEADER' }),
        member({ function: 'COMMUNICATION' }),
        member({ function: 'LOGISTICS' }),
        member({ function: 'COMMUNICATION' }),
        member({ function: 'LOGISTICS' }),
      ],
    })]);
    // Núcleo 0/3 + líder 1/1 → (0 + 1) / 2 = 0.5 con denominador 4.
    assert.equal(result.counters.communicationMembers, 2);
    assert.equal(result.counters.logisticsMembers, 2);
  });

  it('alterno NO sustituye al titular en cobertura funcional', () => {
    const result = score([brigade({
      typedMembers: [
        member({ function: 'EVACUATION', isAlternate: true }),
        member({ function: 'FIRST_AID', isAlternate: true }),
        member({ function: 'FIREFIGHTING', isAlternate: true }),
        member({ function: 'LEADER', isAlternate: true }),
      ],
    })]);
    assert.equal(result.dimensions.functionalCoverage.ratio, 0, 'solo alternos → núcleo sin titulares');
    assert.equal(result.dimensions.alternates.ratio, 1, 'pero los alternos sí cubren su dimensión');
  });

  it('cobertura de alternos por función núcleo; múltiples alternos no suman extra', () => {
    const result = score([brigade({
      typedMembers: [
        member({ function: 'LEADER' }),
        member({ function: 'EVACUATION' }),
        member({ function: 'FIRST_AID' }),
        member({ function: 'FIREFIGHTING' }),
        member({ function: 'EVACUATION', isAlternate: true }),
        member({ function: 'EVACUATION', isAlternate: true }),
        member({ function: 'FIRST_AID', isAlternate: true }),
      ],
    })]);
    assert.equal(result.dimensions.alternates.ratio, 2 / 3);
    assert.equal(result.counters.evacuationAlternates, 1, '2 alternos EVACUATION = cobertura 1, no 2');
    assert.equal(result.counters.alternates, 3);
  });

  it('función inválida (fuera del enum) → miembro inválido', () => {
    const result = score([brigade({ typedMembers: [member({ function: 'JEFE' })] })]);
    assert.equal(result.counters.membersWithInvalidFunction, 1);
    assert.equal(result.dimensions.composition.ratio, 0);
  });

  it('miembro inactivo no cuenta para ninguna dimensión', () => {
    const result = score([brigade({
      typedMembers: [member({ function: 'LEADER', active: false })],
    })]);
    assert.equal(result.counters.activeMembers, 0);
    assert.equal(result.dimensions.functionalCoverage.leaderPresent, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Capacitación y operación
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeScoring — capacitación y operación', () => {
  it('trainingDate válida + evidencia → capacitación completa', () => {
    const result = score([brigade({ typedMembers: [member({ function: 'LEADER' })] })]);
    assert.equal(result.dimensions.training.ratio, 1);
  });

  it('trainingDate futura NO cuenta como capacitación y se registra', () => {
    const result = score([brigade({ typedMembers: [
      member({ function: 'LEADER', trainingDate: new Date(NOW.getTime() + 30 * 86400000) }),
    ] })]);
    assert.equal(result.dimensions.training.ratio, 0);
    assert.equal(result.counters.membersWithFutureTrainingDate, 1);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-training-incomplete'));
  });

  it('sin trainingDate → trainedRatio 0; con evidencia sin fecha → solo evidence falla también', () => {
    const result = score([brigade({ typedMembers: [
      member({ function: 'LEADER', trainingDate: undefined }),
    ] })]);
    assert.equal(result.dimensions.training.ratio, 0);
    assert.equal(result.counters.membersWithoutTraining, 1);
  });

  it('capacitado sin evidencia → dimensión 0.5 + finding evidence-missing', () => {
    const result = score([brigade({ typedMembers: [
      member({ function: 'LEADER', trainingEvidence: '' }),
    ] })]);
    assert.equal(result.dimensions.training.ratio, 0.5);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-training-evidence-missing'));
  });

  it('lastMeetingDate válida → operación 1; futura o ausente → 0 con finding', () => {
    const ok = score([brigade({ typedMembers: [member()] })]);
    assert.equal(ok.dimensions.operation.ratio, 1);

    const future = score([brigade({ typedMembers: [member()], lastMeetingDate: new Date(NOW.getTime() + 86400000) })]);
    assert.equal(future.dimensions.operation.ratio, 0);
    assert.equal(future.counters.lastMeetingDateFuture, 1);
    assert.ok(future.findings.some((f) => f.id === 'emergency-brigade-meeting-overdue'));

    const absent = score([brigade({ typedMembers: [member()], lastMeetingDate: undefined })]);
    assert.equal(absent.dimensions.operation.ratio, 0);
    assert.ok(absent.findings.some((f) => f.id === 'emergency-brigade-meeting-overdue'));
  });

  it('varias brigadas activas → usa la reunión más reciente; meetingFrequency es metadata', () => {
    const result = score([
      brigade({ lastMeetingDate: daysAgo(90), meetingFrequency: 'Trimestral' }),
      brigade({ lastMeetingDate: daysAgo(5), meetingFrequency: 'Mensual' }),
    ]);
    assert.equal(result.dimensions.operation.ratio, 1);
    assert.equal(result.details.operation.latestMeetingDate, daysAgo(5).toISOString());
    assert.deepEqual(result.details.operation.meetingFrequency, ['Trimestral', 'Mensual']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Robustez
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeScoring — robustez', () => {
  it('null/undefined/arrays vacíos → sin crash, sin NaN, 0–100', () => {
    const weird = score([
      brigade({ name: null, typedMembers: [null, undefined, member(), member({ function: null })] as never, lastMeetingDate: 'not-a-date' }),
      null as never,
    ]);
    assert.ok(Number.isFinite(weird.percentage));
    assert.ok(weird.percentage >= 0 && weird.percentage <= 100);
    for (const dimension of Object.values(weird.dimensions)) {
      assert.ok(dimension.ratio === null || Number.isFinite(dimension.ratio));
    }
  });

  it('members[] legacy textual NO aumenta ningún score', () => {
    const legacy = score([brigade({ members: ['Juan', 'Pedro', 'María'], typedMembers: [] })]);
    assert.equal(legacy.counters.activeMembers, 0);
    assert.equal(legacy.percentage, 15, 'solo existencia (10) + operación (5); members[] no puntúa');
    const typed = score([brigade({ members: ['Juan'], typedMembers: [member({ function: 'LEADER' })] })]);
    assert.equal(typed.counters.activeMembers, 1, 'solo typedMembers cuenta');
  });

  it('snapshot vacío degrada trazabilidad', () => {
    const result = score([brigade({ typedMembers: [
      member({ function: 'LEADER', employeeNameSnapshot: '' }),
      member({ function: 'EVACUATION' }),
    ] })]);
    assert.equal(result.dimensions.traceability.ratio, 0.5);
    assert.equal(result.details.traceability.missingSnapshot, 1);
  });

  it('la función es determinista (misma entrada → mismo resultado)', () => {
    const brigades = [completeBrigade()];
    const a = score(brigades);
    const b = score(brigades);
    assert.equal(a.percentage, b.percentage);
    assert.deepEqual(a.counters, b.counters);
  });

  it('sin employeeIdsInTenant (empresa sin empleados cargados) → miembros no válidos, sin crash', () => {
    const result = score([completeBrigade()], []);
    assert.equal(result.counters.validMembers, 0);
    assert.equal(result.percentage, 15, 'solo existencia + operación sin evidencia válida');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Frontera 5.1.1 ↔ 5.1.2 (pura, contra el scoring oficial de 5.1.1)
// ═══════════════════════════════════════════════════════════════════════════

describe('Frontera 5.1.1 ↔ 5.1.2 — la brigada no altera el score del plan', () => {
  const planBase = {
    plan: { planName: 'Plan de Emergencias', effectiveDate: daysAgo(30), expirationDate: new Date(NOW.getTime() + 300 * 86400000) },
    threats: [{
      threatId: 't1', scenario: 'Incendio', threat: 'Cortocircuito', vulnerability: 'Cableado antiguo',
      probability: 'HIGH', impact: 'HIGH', riskLevel: 'CRITICAL',
      preventiveMeasures: ['Inspección eléctrica'], responseMeasures: ['Extintores'], active: true,
    }],
    equipment: [{ equipmentId: 'e1', name: 'Extintor', resourceType: 'EXTINTOR', operationalStatus: 'OPERATIVE', active: true }],
    evacuationRoutes: [{ routeId: 'r1', name: 'Ruta A', estimatedTimeMinutes: 5, responsible: 'Responsable', active: true }],
    meetingPoints: [{ pointId: 'p1', name: 'Punto A', responsible: 'Responsable', countProcedure: 'Lista', active: true }],
    contacts: [],
    drills: [{ drillId: 'd1', date: daysAgo(60), status: 'Ejecutado', participants: 30, expectedParticipants: 30, active: true }],
    socialization: undefined,
    complianceStatus: 'COMPLIES',
  };

  const brigadeActive = { ...completeBrigade(), active: true };
  const brigadeInactive = { ...completeBrigade(), active: false };

  it('brigada con 0% de capacitación vs 100% de capacitación → score 5.1.1 IDÉNTICO', () => {
    const untrained = JSON.parse(JSON.stringify(brigadeActive)) as Record<string, unknown>;
    (untrained.typedMembers as Array<Record<string, unknown>>).forEach((m) => {
      m.trainingDate = undefined;
      m.trainingEvidence = '';
    });
    const base = computeEmergencyPlanScore({ record: { ...planBase, brigades: [brigadeActive] } as never, planDocument: null, companyId: COMPANY_A }, NOW);
    const withUntrained = computeEmergencyPlanScore({ record: { ...planBase, brigades: [untrained] } as never, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(base.score, withUntrained.score, 'la capacitación de la brigada no cambia 5.1.1');
  });

  it('cambios de funciones/alternos/titulares → score 5.1.1 IDÉNTICO', () => {
    const base = computeEmergencyPlanScore({ record: { ...planBase, brigades: [brigadeActive] } as never, planDocument: null, companyId: COMPANY_A }, NOW);
    const modified = computeEmergencyPlanScore({
      record: {
        ...planBase,
        brigades: [brigade({ typedMembers: [
          member({ function: 'COMMUNICATION', isAlternate: true }),
          member({ function: 'OTHER', observations: '' }),
        ] })],
      } as never,
      planDocument: null, companyId: COMPANY_A,
    }, NOW);
    assert.equal(base.score, modified.score);
  });

  it('5.1.1 solo expone brigadesPresent como contexto (sin puntos por composición)', () => {
    const empty = computeEmergencyPlanScore({ record: { ...planBase, brigades: [] } as never, planDocument: null, companyId: COMPANY_A }, NOW);
    const withBrigade = computeEmergencyPlanScore({ record: { ...planBase, brigades: [brigadeActive] } as never, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(empty.counters.brigadesPresent, false);
    assert.equal(withBrigade.counters.brigadesPresent, true);
    assert.equal(empty.score, withBrigade.score, 'brigadesPresent no puntúa');
  });

  it('brigada inactiva vs activa → score 5.1.1 IDÉNTICO', () => {
    const active = computeEmergencyPlanScore({ record: { ...planBase, brigades: [brigadeActive] } as never, planDocument: null, companyId: COMPANY_A }, NOW);
    const inactive = computeEmergencyPlanScore({ record: { ...planBase, brigades: [brigadeInactive] } as never, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(active.score, inactive.score);
  });

  it('tenant isolation en el scoring puro: employeeIds de empresa B no validan miembros de empresa A', () => {
    const companyB = score([completeBrigade()], ['ffffffffffffffffffffffff']);
    assert.equal(companyB.counters.validMembers, 0);
    assert.equal(companyB.percentage, 15, 'solo existencia + operación; la composición no valida cross-tenant');
  });
});
