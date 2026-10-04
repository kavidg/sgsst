import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EmergencyBrigadeProvider } from './emergency-brigade-compliance.provider';
import {
  EMERGENCY_BRIGADE_FORMULA,
  EMERGENCY_BRIGADE_MODULE,
  EMERGENCY_BRIGADE_SCORE_WEIGHTS,
  EMERGENCY_BRIGADE_STANDARD_CODE,
} from './emergency-brigade-scoring';
import { CATALOG_60 } from '../../standard-catalog/constants/catalog-60';
import {
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
  filterScoringEligible,
} from '../utils/compliance-weights';

/**
 * Tests del EmergencyBrigadeProvider — Estándar 5.1.2 (Brigada de emergencia).
 *
 * El provider se prueba con mocks de PhvaAdvancedService y del modelo Employee
 * (queries capturadas), verificando: identidad, NO_DATA, transporte de
 * metadata V1, tenant isolation de la consulta Employee, ausencia de N+1,
 * ausencia de creación de documentos (read-only) y doble scoring.
 * La matemática del score vive en emergency-brigade-scoring.spec.ts.
 */

const COMPANY_A = '507f1f77bcf86cd799439011';
const EMP_1 = 'a1a1a1a1a1a1a1a1a1a1a1a1';
const EMP_2 = 'b2b2b2b2b2b2b2b2b2b2b2b2';
const NOW = new Date('2026-09-22T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

let memberSeq = 0;
let employeeSeq = 0;
/** Ids ÚNICOS por miembro (el dedup por brigada es correcto: no crear duplicados accidentales). */
function uniqueEmployeeId(): string {
  return (employeeSeq++).toString(16).padStart(2, '0') + 'a1a1a1a1a1a1a1a1a1a1a1';
}
function member(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    memberId: `m-${++memberSeq}`,
    employeeId: uniqueEmployeeId(),
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
    brigadeId: 'b-1',
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

/** Mock de PhvaAdvancedService con queries capturadas (sin Mongo). */
class MockPhvaAdvancedService {
  calls = 0;
  record: Record<string, unknown> | null;
  constructor(record: Record<string, unknown> | null) {
    this.record = record;
  }
  async findEmergenciesByCompany(): Promise<Record<string, unknown> | null> {
    this.calls += 1;
    return this.record;
  }
}

/** Mock del modelo Employee: captura query/proyección y cuenta llamadas. */
class MockEmployeeModel {
  calls = 0;
  lastQuery: Record<string, unknown> | null = null;
  lastProjection: Record<string, unknown> | null = null;
  docs: Array<Record<string, unknown>>;
  constructor(docs: Array<Record<string, unknown>>) {
    this.docs = docs;
  }
  find(query: Record<string, unknown>, projection: Record<string, unknown>) {
    this.calls += 1;
    this.lastQuery = query;
    this.lastProjection = projection;
    return {
      lean: () => ({
        exec: async () => this.docs,
      }),
    };
  }
}

interface BuildOptions {
  record: Record<string, unknown> | null;
  employees?: Array<Record<string, unknown>>;
}

function buildProvider(options: BuildOptions) {
  const service = new MockPhvaAdvancedService(options.record);
  const employeeModel = new MockEmployeeModel(options.employees ?? []);
  const provider = new EmergencyBrigadeProvider(
    service as never,
    employeeModel as never,
  );
  return { provider, service, employeeModel };
}

function emergencyRecord(brigades: Record<string, unknown>[]): Record<string, unknown> {
  return {
    itemCode: '5.1.1',
    companyId: COMPANY_A,
    brigades,
    history: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Identidad y metadata
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeProvider — identidad y metadata', () => {
  it('module = emergency-brigade, standardCode = 5.1.2, semantic EXACT, fórmula dimensions:v1', async () => {
    const { provider } = buildProvider({
      record: emergencyRecord([brigade({ typedMembers: [member({ function: 'LEADER' })] })]),
      employees: [{ _id: EMP_1, status: 'Activo' }],
    });
    const result = await provider.getCompliance(COMPANY_A);
    assert.equal(result.module, EMERGENCY_BRIGADE_MODULE);
    const meta = result.metadata as Record<string, any>;
    assert.equal(meta.standardCode, EMERGENCY_BRIGADE_STANDARD_CODE);
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.formula, EMERGENCY_BRIGADE_FORMULA);
    assert.equal(meta.phase, 'do');
  });

  it('los pesos declarados en metadata suman 100', async () => {
    const total = Object.values(EMERGENCY_BRIGADE_SCORE_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.equal(total, 100);
    const { provider } = buildProvider({ record: null });
    const meta = (await provider.getCompliance(COMPANY_A)).metadata as Record<string, any>;
    assert.deepEqual(meta.weights, EMERGENCY_BRIGADE_SCORE_WEIGHTS);
  });

  it('transporta dimensions + counters completos (explicables sin Mongo)', async () => {
    const typedMembers = [
      member({ function: 'LEADER' }),
      member({ function: 'EVACUATION' }),
      member({ function: 'FIRST_AID' }),
      member({ function: 'FIREFIGHTING' }),
      member({ function: 'EVACUATION', isAlternate: true }),
      member({ function: 'FIRST_AID', isAlternate: true }),
      member({ function: 'FIREFIGHTING', isAlternate: true }),
    ];
    // Los empleados del tenant se derivan de los ids referenciados (mock coherente).
    const employees = typedMembers.map((m) => ({ _id: m.employeeId, status: 'Activo' }));
    const { provider } = buildProvider({
      record: emergencyRecord([brigade({ typedMembers })]),
      employees,
    });
    const result = await provider.getCompliance(COMPANY_A);
    const meta = result.metadata as Record<string, any>;
    for (const dimension of ['existence', 'composition', 'functionalCoverage', 'training', 'alternates', 'traceability', 'operation']) {
      assert.ok(meta.dimensions[dimension], `falta dimensión ${dimension}`);
    }
    assert.equal(meta.counters.brigadesPresent, 1);
    assert.equal(meta.counters.activeMembers, 7);
    assert.equal(meta.counters.leaders, 1);
    assert.equal(meta.counters.alternates, 3);
    assert.ok(meta.counters.trainedMembers >= 4, 'titulares con trainingDate válida');
    assert.ok(meta.employeeStatusContext, 'contexto de Employee.status presente');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO_DATA y estado del provider
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeProvider — NO_DATA y estados', () => {
  it('sin SstEmergencies → status NO_DATA, 0%, finding oficial', async () => {
    const { provider } = buildProvider({ record: null });
    const result = await provider.getCompliance(COMPANY_A);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-no-data'));
    assert.equal((result.metadata as Record<string, any>).noData, true);
  });

  it('registro con brigadas todas inactivas → NO_DATA con finding específico', async () => {
    const { provider } = buildProvider({
      record: emergencyRecord([brigade({ active: false, typedMembers: [member()] })]),
      employees: [{ _id: EMP_1, status: 'Activo' }],
    });
    const result = await provider.getCompliance(COMPANY_A);
    assert.equal(result.status, 'NO_DATA');
    assert.ok(result.findings.some((f) => f.id === 'emergency-brigade-no-active-brigade'));
  });

  it('brigada activa con brigadistas estructurados → TARGET_NOT_MET/TARGET_MET y phases.do', async () => {
    const { provider } = buildProvider({
      record: emergencyRecord([brigade({
        typedMembers: [
          member({ function: 'LEADER' }),
          member({ function: 'EVACUATION' }),
          member({ function: 'FIRST_AID' }),
          member({ function: 'FIREFIGHTING' }),
          member({ function: 'EVACUATION', isAlternate: true }),
          member({ function: 'FIRST_AID', isAlternate: true }),
          member({ function: 'FIREFIGHTING', isAlternate: true }),
          member({ function: 'COMMUNICATION' }),
        ],
      })]),
      employees: [{ _id: EMP_1, status: 'Activo' }, { _id: EMP_2, status: 'Activo' }],
    });
    const result = await provider.getCompliance(COMPANY_A);
    assert.ok(['TARGET_MET', 'TARGET_NOT_MET'].includes(result.status));
    assert.equal(result.phases?.do, result.percentage);
    assert.equal(result.pending, result.findings.length);
    assert.equal(result.completed, result.percentage);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Seguridad, rendimiento y robustez del provider
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeProvider — tenant, rendimiento y robustez', () => {
  it('la consulta Employee es tenant-scoped y bulk ($in con companyId)', async () => {
    const { provider, employeeModel } = buildProvider({
      record: emergencyRecord([brigade({ typedMembers: [member({ employeeId: EMP_1 }), member({ employeeId: EMP_2 })] })]),
      employees: [{ _id: EMP_1, status: 'Activo' }, { _id: EMP_2, status: 'Activo' }],
    });
    await provider.getCompliance(COMPANY_A);
    assert.equal(employeeModel.calls, 1, 'UNA sola consulta (sin N+1)');
    // $in contiene ObjectId reales; se comparan como strings hex.
    const inList = (employeeModel.lastQuery?._id as Record<string, unknown>)?.$in as unknown[];
    assert.deepEqual(inList.map((id) => String(id)).sort(), [EMP_1, EMP_2].sort());
    assert.equal(employeeModel.lastQuery?.companyId, COMPANY_A, 'query tenant-scoped');
    assert.deepEqual(employeeModel.lastProjection, { _id: 1, status: 1 });
  });

  it('ids corruptos (no hex) se filtran antes de la consulta (sin crash)', async () => {
    const { provider, employeeModel } = buildProvider({
      record: emergencyRecord([brigade({
        typedMembers: [member({ employeeId: 'not-an-objectid' }), member({ employeeId: EMP_1 })],
      })]),
      employees: [{ _id: EMP_1, status: 'Activo' }],
    });
    const result = await provider.getCompliance(COMPANY_A);
    assert.equal(employeeModel.calls, 1);
    const inList = (employeeModel.lastQuery?._id as Record<string, unknown>)?.$in as unknown[];
    assert.deepEqual(inList.map((id) => String(id)), [EMP_1], 'el id corrupto no llega a Mongo');
    assert.ok(Number.isFinite(result.percentage));
  });

  it('sin brigadas no consulta Employee (0 queries)', async () => {
    const { provider, employeeModel } = buildProvider({ record: emergencyRecord([]) });
    await provider.getCompliance(COMPANY_A);
    assert.equal(employeeModel.calls, 0);
  });

  it('read-only estricto: NO crea documento (solo lectura legacy-aware, 1 llamada al service)', async () => {
    const { provider, service } = buildProvider({ record: null });
    await provider.getCompliance(COMPANY_A);
    assert.equal(service.calls, 1, 'findEmergenciesByCompany exactamente una vez');
    // El mock no expone save/upsert: la única vía del provider es lectura.
    assert.equal(typeof (service as unknown as Record<string, unknown>).save, 'undefined');
    assert.equal(typeof (service as unknown as Record<string, unknown>).findOrCreateEmergencies, 'undefined');
  });

  it('employeeIds fuera del tenant no validan miembros (tenant isolation de punta a punta)', async () => {
    // La empresa A tiene EMP_1; el brigadista referencía un id que no existe
    // en la empresa (el mock devuelve solo empleados de la empresa).
    const { provider } = buildProvider({
      record: emergencyRecord([brigade({ typedMembers: [member({ employeeId: 'c3c3c3c3c3c3c3c3c3c3c3c3' })] })]),
      employees: [], // empresa sin esos empleados
    });
    const result = await provider.getCompliance(COMPANY_A);
    const meta = result.metadata as Record<string, any>;
    assert.equal(meta.counters.validMembers, 0);
    assert.equal(meta.dimensions.composition.ratio, 0);
  });

  it('el score nunca es NaN/Infinity y siempre 0–100 con datos corruptos', async () => {
    const { provider } = buildProvider({
      record: emergencyRecord([
        null as never,
        brigade({ name: null, typedMembers: [null, member({ function: 'JEFE', trainingDate: 'not-a-date' })] as never }),
      ]),
      employees: [{ _id: EMP_1, status: 'Activo' }],
    });
    const result = await provider.getCompliance(COMPANY_A);
    assert.ok(Number.isFinite(result.percentage));
    assert.ok(result.percentage >= 0 && result.percentage <= 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Double scoring y frontera
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeProvider — double scoring y frontera 5.1.1/5.1.2', () => {
  const brigadeResult = {
    module: EMERGENCY_BRIGADE_MODULE,
    percentage: 80,
    status: 'TARGET_NOT_MET',
    findings: [],
    pending: 1,
    completed: 80,
    phases: { do: 80 },
  };

  it('emergency-brigade es ELEGIBLE para el scoring (filterScoringEligible lo conserva)', () => {
    const filtered = filterScoringEligible([brigadeResult]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].module, 'emergency-brigade');
  });

  it('emergencies, emergency-management, records-doc y procedures-doc NO puntúan brigada', () => {
    const filtered = filterScoringEligible([
      { ...brigadeResult, module: 'emergencies' },
      { ...brigadeResult, module: 'emergency-management' },
      { ...brigadeResult, module: 'records-doc' },
      { ...brigadeResult, module: 'procedures-doc' },
    ]);
    assert.equal(filtered.length, 0, 'ninguna vía legacy/documental puntúa la evidencia de brigada');
    // AWP (cronograma, phases.plan) y trainings (su propio estándar) siguen
    // siendo elegibles para SUS estándares: no puntúan 5.1.2 por diseño.
    const others = filterScoringEligible([
      { ...brigadeResult, module: 'annual-work-plan', phases: { plan: 50 } },
      { ...brigadeResult, module: 'trainings', phases: { do: 60 } },
    ]);
    assert.ok(others.every((r) => r.module !== 'emergency-brigade'));
  });

  it('las exclusiones de los providers legacy siguen intactas', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('emergencies'), true);
    assert.equal(SCORING_EXCLUDED_MODULES.has('emergency-management'), true);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('records-doc'), true, 'records-doc retirado del scoring (wrong-mapping 5.1.2)');
  });

  it('catálogo: 5.1.2 → emergency-brigade.provider con semantic EXACT; 5.1.1 intacto', () => {
    const brigadeEntry = CATALOG_60.find((item) => item.code === '5.1.2');
    assert.equal(brigadeEntry?.validationProvider, 'emergency-brigade.provider');
    assert.equal(brigadeEntry?.semantic, 'EXACT');
    assert.equal(brigadeEntry?.moduleRoute, '/emergencies');
    assert.equal(brigadeEntry?.phva, 'HACER');
    assert.equal(brigadeEntry?.normativeWeight, 5);
    const planEntry = CATALOG_60.find((item) => item.code === '5.1.1');
    assert.equal(planEntry?.validationProvider, 'emergency-plan.provider', '5.1.1 sin cambios');
  });
});
