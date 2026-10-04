import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Types } from 'mongoose';
import { EmergencyPlanProvider } from './emergency-plan-compliance.provider';
import { computeEmergencyPlanScore } from './emergency-plan-scoring';
import { CATALOG_60 } from '../../standard-catalog/constants/catalog-60';
import { SCORING_EXCLUDED_MODULES, SCORING_INELIGIBLE_MODULES } from '../utils/compliance-weights';

/**
 * Tests del EmergencyPlanProvider — Estándar 5.1.1 (Plan de prevención,
 * preparación y respuesta ante emergencias). Fórmula dimensions:v1 con 7
 * dimensiones (PLAN 25 / AMENAZAS 20 / RECURSOS 10 / EVACUACIÓN 10 /
 * CONTACTOS 10 / SIMULACROS 15 / SOCIALIZACIÓN 10) sobre SstEmergencias
 * (legacy-aware 5.1.1/1.1.10) + validación del documento oficial
 * (plan.documentId → DocumentMaster EMERGENCY_PLAN).
 *
 * Fronteras verificadas:
 *  - NO_DATA solo con registro inexistente o completamente vacío.
 *  - Brigada NO puntúa (5.1.2): solo metadata brigadesPresent.
 *  - El documento oficial es UNA sola evidencia (sin doble crédito).
 *  - procedures-doc retirado del scoring de 5.1.1 (WRONG_MAPPING).
 *  - Tenant isolation: empresa A no consume evidencia de empresa B.
 */

const COMPANY_A = '507f1f77bcf86cd799439011';
const COMPANY_B = '507f1f77bcf86cd799439022';
const COMPANY_A_OID = new Types.ObjectId(COMPANY_A);

type AnyRecord = Record<string, any>;
const NOW = new Date('2026-09-22T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

// ── Fábricas de datos ──

function threat(overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    threatId: new Types.ObjectId().toString(),
    scenario: 'Incendio en planta',
    threat: 'Sobrecarga eléctrica',
    description: 'd', vulnerability: 'v',
    probability: 'HIGH', impact: 'HIGH', riskLevel: 'CRITICAL',
    preventiveMeasures: ['Inspección eléctrica'], responseMeasures: ['Evacuación'],
    active: true,
    ...overrides,
  };
}

function equipment(overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    equipmentId: new Types.ObjectId().toString(), name: 'Extintor PQS',
    resourceType: 'EXTINTOR', type: 'EXTINTOR', quantity: 2,
    operationalStatus: 'OPERATIVE', status: 'OPERATIVO', active: true,
    ...overrides,
  };
}

function route(overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    routeId: new Types.ObjectId().toString(), name: 'Ruta principal',
    estimatedTimeMinutes: 5, responsible: 'Brigadista 1', active: true,
    signageVerified: true, associatedExit: 'Salida norte', ...overrides,
  };
}

function point(overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    pointId: new Types.ObjectId().toString(), name: 'Punto cancha',
    responsible: 'Brigadista 2', countProcedure: 'Conteo por lista',
    capacity: 100, expectedCount: 40, counts: [], active: true,
    ...overrides,
  };
}

function contact(type: string, overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    contactId: new Types.ObjectId().toString(), type, name: type, phone: '123',
    callOrder: 1, active: true, ...overrides,
  };
}

const FULL_CONTACT_CHAIN = (): AnyRecord[] => [
  contact('ARL'), contact('BOMBEROS'), contact('AMBULANCIA'),
  contact('POLICIA'), contact('HOSPITAL'), contact('INTERNO'),
];

function drill(overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    drillId: new Types.ObjectId().toString(), name: 'Simulacro 2026-I',
    type: 'Evacuación', date: daysAgo(60),
    participants: 40, expectedParticipants: 50,
    status: 'Ejecutado', active: true, ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    _id: new Types.ObjectId(), companyId: COMPANY_A_OID, itemCode: '5.1.1',
    complianceStatus: 'COMPLIES',
    plan: {
      planName: 'Plan de Emergencias 2026', version: '3',
      effectiveDate: daysAgo(30), expirationDate: new Date(NOW.getTime() + 300 * 86400000),
      documentUrl: '', socialization: {
        date: daysAgo(20), coveragePercentage: 90, participants: 'Toda la planta',
        observations: '', evidence: ['https://evidencia/acta.pdf'],
      },
    },
    threats: [threat()],
    equipment: [equipment()],
    evacuationRoutes: [route()],
    meetingPoints: [point()],
    contacts: FULL_CONTACT_CHAIN(),
    drills: [drill()],
    brigades: [],
    ...overrides,
  };
}

function planDocument(companyId: Types.ObjectId = COMPANY_A_OID, documentType = 'EMERGENCY_PLAN'): AnyRecord {
  return { _id: new Types.ObjectId(), companyId, documentType };
}

/**
 * Provider con PhvaAdvancedService simulado (la fuente legacy-aware real) y
 * modelo DocumentMaster mock que captura queries.
 */
function createProvider(data: { record?: AnyRecord | null; document?: AnyRecord | null } = {}) {
  const captured: { emergencies: unknown[]; documents: unknown[] } = { emergencies: [], documents: [] };
  const phvaAdvancedService = {
    findEmergenciesByCompany: (companyId: Types.ObjectId) => {
      captured.emergencies.push({ companyId: companyId.toString() });
      // Tenant-safe: solo la empresa dueña del mock recibe el registro.
      const found = companyId.toString() === COMPANY_A && data.record ? data.record : null;
      return found
        ? Promise.resolve(found)
        : Promise.reject(new Error('Emergencias not found'));
    },
  };
  const documentMasterModel = {
    findById: (id: unknown) => {
      captured.documents.push(id);
      const found = data.document && String(data.document._id) === String(id) ? data.document : null;
      return { exec: () => Promise.resolve(found) };
    },
  };
  const provider = new EmergencyPlanProvider(
    phvaAdvancedService as never,
    documentMasterModel as never,
  );
  return { provider, captured };
}

// ── Identidad ──

describe('EmergencyPlanProvider — identidad y catálogo', () => {
  it('5.1.1: el provider existe en el catálogo con provider y ruta oficiales', () => {
    const std = CATALOG_60.find((s) => s.code === '5.1.1');
    assert.ok(std, '5.1.1 presente en el catálogo');
    assert.equal(std.validationProvider, 'emergency-plan.provider');
    assert.equal(std.moduleRoute, '/emergencies');
    assert.equal(std.phva, 'HACER', 'fase HACER intacta');
    assert.equal(std.normativeWeight, 5, 'peso normativo 5 intacto');
    assert.equal(std.implementationStatus, 'IMPLEMENTED', 'IMPLEMENTED intacto');
  });

  it('5.1.1: emergency-plan es elegible y procedures-doc retirado del scoring', () => {
    assert.ok(!SCORING_EXCLUDED_MODULES.has('emergency-plan'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('emergency-plan'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('procedures-doc'), 'wrong-mapping retirado');
  });
});

// ── NO_DATA ──

describe('EmergencyPlanProvider — NO_DATA', () => {
  it('empresa sin registro → NO_DATA sin crear registro', async () => {
    const { provider } = createProvider({ record: null });
    const result = await provider.getCompliance(COMPANY_A);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'emergency-plan-no-data'));
    const meta = result.metadata as Record<string, any>;
    assert.equal(meta.noData, true);
  });

  it('registro completamente vacío → NO_DATA', async () => {
    const empty = record({
      complianceStatus: 'PENDING',
      plan: {}, threats: [], equipment: [], evacuationRoutes: [],
      meetingPoints: [], contacts: [], drills: [],
    });
    const { provider } = createProvider({ record: empty });
    const result = await provider.getCompliance(COMPANY_A);
    assert.equal(result.status, 'NO_DATA');
  });

  it('plan parcialmente diligenciado NO es NO_DATA', async () => {
    const partial = record({
      threats: [], equipment: [], evacuationRoutes: [], meetingPoints: [],
      contacts: [], drills: [],
      plan: { planName: 'Plan 2026', complianceStatus: undefined },
    });
    const breakdown = computeEmergencyPlanScore({ record: partial, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(breakdown.noData, false, 'plan con nombre es evidencia evaluable');
    assert.ok(breakdown.dimensions.plan.ratio !== null);
  });
});

// ── Dimensión PLAN ──

describe('EmergencyPlanProvider — dimensión Plan (25)', () => {
  it('plan completo (nombre + vigencia + aprobado + documento oficial) → ratio 1', async () => {
    const doc = planDocument();
    const r = record();
    r.plan.documentId = doc._id;
    const breakdown = computeEmergencyPlanScore({ record: r, planDocument: doc, companyId: COMPANY_A }, NOW);
    assert.equal(breakdown.dimensions.plan.ratio, 1);
    assert.equal(breakdown.details.plan.documentFromMaster, true);
  });

  it('plan sin aprobación (complianceStatus ≠ COMPLIES) → subcondición falla', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ complianceStatus: 'PENDING' }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.counters.planApproved, false);
    // nombre(1) + vigencia(1) + aprobación(0) + documento(0, sin documentId ni URL) = 2/4.
    assert.equal(breakdown.dimensions.plan.ratio, 0.5);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-plan-not-approved'));
  });

  it('plan vencido (expiración pasada) → subcondición falla + finding', () => {
    const r = record();
    r.plan.expirationDate = daysAgo(5);
    const breakdown = computeEmergencyPlanScore({ record: r, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(breakdown.counters.planCurrent, false);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-plan-expired'));
  });

  it('plan sin documento → documentOk false + finding emergency-plan-document-missing', () => {
    const r = record();
    r.plan.documentUrl = '';
    const breakdown = computeEmergencyPlanScore({ record: r, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(breakdown.details.plan.documentOk, false);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-plan-document-missing'));
  });

  it('documento EMERGENCY_PLAN correcto acredita la condición documental (una sola evidencia)', () => {
    const r = record();
    r.plan.documentId = new Types.ObjectId();
    r.plan.documentUrl = 'https://respaldo/plan.pdf'; // NO suma por separado
    const doc = planDocument();
    const breakdown = computeEmergencyPlanScore({ record: r, planDocument: doc, companyId: COMPANY_A }, NOW);
    assert.equal(breakdown.details.plan.documentOk, true);
    assert.equal(breakdown.counters.documentPresent, true);
    // La condición documental es una sola subcondición de 4: ratio plan sigue 1.
    assert.equal(breakdown.dimensions.plan.ratio, 1);
  });

  it('documentId cross-tenant NO acredita el documento (404-equivalente en scoring)', () => {
    const r = record();
    r.plan.documentId = new Types.ObjectId();
    const breakdown = computeEmergencyPlanScore(
      { record: r, planDocument: planDocument(new Types.ObjectId(COMPANY_B)), companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.details.plan.documentCrossTenant, true);
    assert.equal(breakdown.details.plan.documentOk, false);
  });
});

// ── Dimensión AMENAZAS ──

describe('EmergencyPlanProvider — dimensión Amenazas (20)', () => {
  it('amenaza completa → ratio 1', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ threats: [threat()] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.threats.ratio, 1);
    assert.equal(breakdown.counters.completeThreats, 1);
  });

  it('amenaza incompleta (sin medidas) → ratio 0.5 con dos activas', () => {
    const incomplete = threat({ preventiveMeasures: [], responseMeasures: [] });
    const breakdown = computeEmergencyPlanScore(
      { record: record({ threats: [threat(), incomplete] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.threats.ratio, 0.5);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-threat-matrix-incomplete'));
  });

  it('amenaza inactiva NO evalúa (borrado lógico)', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ threats: [threat({ active: false })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.threats.ratio, null, 'sin denominador → null (redistribuye)');
    assert.equal(breakdown.counters.activeThreats, 0);
  });

  it('sin amenazas activas NO convierte el estándar en NO_DATA (redistribuye peso)', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ threats: [] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.noData, false);
    assert.equal(breakdown.dimensions.threats.ratio, null);
    assert.ok(breakdown.score > 0, 'hay evidencia suficiente para evaluar parcialmente');
  });
});

// ── Dimensión RECURSOS ──

describe('EmergencyPlanProvider — dimensión Recursos operativos (10)', () => {
  it('OPERATIVE → crédito 1', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ equipment: [equipment({ operationalStatus: 'OPERATIVE', status: 'OPERATIVO' })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.resources.ratio, 1);
  });

  it('PARTIAL → crédito 0.5', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ equipment: [equipment({ operationalStatus: 'PARTIAL', status: 'PARCIAL' })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.resources.ratio, 0.5);
    assert.equal(breakdown.counters.partialResources, 1);
  });

  it('INOPERATIVE → crédito 0 (sin crédito por existencia)', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ equipment: [equipment({ operationalStatus: 'INOPERATIVE', status: 'INOPERATIVO' })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.resources.ratio, 0);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-resources-incomplete'));
  });

  it('recurso inactivo se excluye y legacy status se interpreta cuando falta tipado', () => {
    const breakdown = computeEmergencyPlanScore(
      {
        record: record({
          equipment: [
            equipment({ active: false }), // excluido
            equipment({ operationalStatus: undefined, status: 'OPERATIVO', type: 'EXTINTOR' }),
            equipment({ operationalStatus: undefined, status: 'VENCIDO', type: 'BOTIQUIN' }),
          ],
        }),
        planDocument: null, companyId: COMPANY_A,
      },
      NOW,
    );
    assert.equal(breakdown.counters.activeResources, 2, 'el inactivo se excluye');
    assert.equal(breakdown.dimensions.resources.ratio, 0.5, 'OPERATIVO=1 · VENCIDO=0');
  });
});

// ── Dimensión EVACUACIÓN ──

describe('EmergencyPlanProvider — dimensión Evacuación (10)', () => {
  it('ruta operativa + punto operativo → ratio 1', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record(), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.evacuation.ratio, 1);
    assert.equal(breakdown.counters.operativeRoutes, 1);
    assert.equal(breakdown.counters.operativeMeetingPoints, 1);
  });

  it('ruta incompleta (sin responsable) no es operativa → solo punto = 0.5', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ evacuationRoutes: [route({ responsible: '' })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.evacuation.ratio, 0.5);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-evacuation-incomplete'));
  });

  it('punto incompleto (sin countProcedure) no es operativo → solo ruta = 0.5', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ meetingPoints: [point({ countProcedure: '' })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.evacuation.ratio, 0.5);
  });

  it('sin ruta ni punto → ratio 0 (denominador fijo 2) + finding HIGH', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ evacuationRoutes: [], meetingPoints: [] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.evacuation.ratio, 0);
    assert.equal(breakdown.dimensions.evacuation.denominator, 2);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-evacuation-incomplete'));
  });
});

// ── Dimensión CONTACTOS ──

describe('EmergencyPlanProvider — dimensión Contactos (10)', () => {
  it('cadena completa (6 requeridos) → ratio 1', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record(), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.contacts.ratio, 1);
    assert.equal(breakdown.counters.validRequiredContacts, 6);
  });

  it('faltante ARL', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ contacts: FULL_CONTACT_CHAIN().filter((c) => c.type !== 'ARL') }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.contacts.ratio, 5 / 6);
    assert.equal(breakdown.dimensions.contacts.denominator, 6, 'denominador fijo');
    assert.ok((breakdown.dimensions.contacts.missingRequiredGroups as string[]).includes('ARL'));
  });

  it('faltante BOMBEROS', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ contacts: FULL_CONTACT_CHAIN().filter((c) => c.type !== 'BOMBEROS') }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.contacts.ratio, 5 / 6);
  });

  it('faltante AMBULANCIA', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ contacts: FULL_CONTACT_CHAIN().filter((c) => c.type !== 'AMBULANCIA') }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.contacts.ratio, 5 / 6);
  });

  it('faltante POLICIA', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ contacts: FULL_CONTACT_CHAIN().filter((c) => c.type !== 'POLICIA') }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.contacts.ratio, 5 / 6);
  });

  it('faltante HOSPITAL e IPS → grupo completo faltante', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ contacts: FULL_CONTACT_CHAIN().filter((c) => c.type !== 'HOSPITAL' && c.type !== 'IPS') }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.contacts.ratio, 5 / 6);
    assert.ok((breakdown.dimensions.contacts.missingRequiredGroups as string[]).includes('HOSPITAL'));
  });

  it('faltante INTERNO', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ contacts: FULL_CONTACT_CHAIN().filter((c) => c.type !== 'INTERNO') }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.contacts.ratio, 5 / 6);
  });

  it('complementarios (DEFENSA_CIVIL/CRUZ_ROJA/OTRO) NO aumentan el denominador; sin teléfono no valida', () => {
    const breakdown = computeEmergencyPlanScore(
      {
        record: record({
          contacts: [
            ...FULL_CONTACT_CHAIN(),
            contact('CRUZ_ROJA'), contact('DEFENSA_CIVIL', { phone: '' }),
            contact('INTERNO', { callOrder: 0, phone: '555' }), // sin orden válido: NO valida INTERNO
          ],
        }),
        planDocument: null, companyId: COMPANY_A,
      },
      NOW,
    );
    assert.equal(breakdown.counters.complementaryContacts, 2);
    assert.equal(breakdown.dimensions.contacts.denominator, 6, 'denominador requerido intacto');
    assert.equal(breakdown.counters.validRequiredContacts, 6, 'el segundo INTERNO (válido) cubre el grupo');
  });
});

// ── Dimensión SIMULACROS ──

describe('EmergencyPlanProvider — dimensión Simulacros (15)', () => {
  it('ejecutado dentro de 12 meses con cobertura 80% → ratio 0.9', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ drills: [drill({ participants: 40, expectedParticipants: 50 })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.drills.ratio, 0.9); // 0.5 + 0.5×0.8
    assert.equal(breakdown.counters.executedDrills12m, 1);
  });

  it('ejecutado fuera de ventana (>12 meses) → ratio 0 + finding', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ drills: [drill({ date: daysAgo(400) })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.drills.ratio, 0);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-drill-missing'));
  });

  it('cancelado se excluye del evaluable', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ drills: [drill({ status: 'Cancelado' })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.drills.ratio, null, 'sin evaluable → sin denominador');
    assert.equal(breakdown.counters.executedDrills12m, 0);
  });

  it('cobertura se limita a 1 aunque participants > expectedParticipants', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ drills: [drill({ participants: 80, expectedParticipants: 50 })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.drills.ratio, 1); // 0.5 + 0.5×1 (clamp)
    assert.equal(breakdown.counters.participants, 80);
    assert.equal(breakdown.counters.expectedParticipants, 50);
  });

  it('planActivityId solo es trazabilidad en metadata (sin doble scoring con AWP)', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ drills: [drill({ planActivityId: new Types.ObjectId() })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.counters.drillsLinkedToAnnualPlan, 1);
    const linked = breakdown.details.drills as { linkedToAnnualPlan: number };
    assert.equal(linked.linkedToAnnualPlan, 1);
  });

  it('simulacro inactivo no evalúa', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record({ drills: [drill({ active: false })] }), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.drills.ratio, null);
  });
});

// ── Dimensión SOCIALIZACIÓN ──

describe('EmergencyPlanProvider — dimensión Socialización (10)', () => {
  it('cobertura 90 + evidencia + fecha → ratio 1', () => {
    const breakdown = computeEmergencyPlanScore(
      { record: record(), planDocument: null, companyId: COMPANY_A }, NOW,
    );
    assert.equal(breakdown.dimensions.socialization.ratio, 1);
  });

  it('cobertura < 80 → subcondición falla', () => {
    const r = record();
    r.plan.socialization.coveragePercentage = 50;
    const breakdown = computeEmergencyPlanScore({ record: r, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(breakdown.dimensions.socialization.ratio, 2 / 3);
    assert.ok(breakdown.findings.some((f) => f.id === 'emergency-socialization-missing'));
  });

  it('sin evidencia → subcondición falla', () => {
    const r = record();
    r.plan.socialization.evidence = [];
    const breakdown = computeEmergencyPlanScore({ record: r, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(breakdown.dimensions.socialization.ratio, 2 / 3);
  });
});

// ── Frontera 5.1.2 y doble scoring ──

describe('EmergencyPlanProvider — frontera 5.1.2 y doble scoring', () => {
  it('brigada con 100% de integrantes y capacitación NO aumenta el score de 5.1.1', () => {
    const base = record({ brigades: [] });
    const withBrigade = record({
      brigades: [{
        brigadeId: 'b1', name: 'Brigada A', type: 'Evacuación', leader: 'Líder', active: true,
        members: ['Legacy 1', 'Legacy 2'],
        typedMembers: [
          { memberId: 'm1', employeeId: new Types.ObjectId(), employeeNameSnapshot: 'X', function: 'LEADER', isAlternate: false, active: true, trainingDate: daysAgo(10), trainingType: 'Brigada', trainingEvidence: 'url' },
          { memberId: 'm2', employeeId: new Types.ObjectId(), employeeNameSnapshot: 'Y', function: 'FIRST_AID', isAlternate: true, active: true, trainingDate: daysAgo(9), trainingType: 'Primeros auxilios', trainingEvidence: 'url' },
        ],
        meetingFrequency: 'Mensual',
      }],
    });
    const scoreBase = computeEmergencyPlanScore({ record: base, planDocument: null, companyId: COMPANY_A }, NOW);
    const scoreBrigade = computeEmergencyPlanScore({ record: withBrigade, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.equal(scoreBrigade.score, scoreBase.score, 'la brigada no altera el score (es 5.1.2)');
    assert.equal(scoreBrigade.counters.brigadesPresent, true, 'solo metadata complementaria');
  });

  it('el documento oficial produce UN solo crédito (documentId + DocumentMaster + documentUrl no suman 3)', () => {
    const doc = planDocument();
    const r = record();
    r.plan.documentId = doc._id;
    r.plan.documentUrl = 'https://respaldo/plan.pdf';
    const breakdown = computeEmergencyPlanScore({ record: r, planDocument: doc, companyId: COMPANY_A }, NOW);
    // La evidencia documental es UNA subcondición de 4 dentro del Plan.
    assert.equal(breakdown.dimensions.plan.ratio, 1);
    assert.equal(breakdown.dimensions.plan.denominator, 4);
  });

  it('score final dentro de 0–100; el provider lo expone redondeado e íntegro', async () => {
    const breakdown = computeEmergencyPlanScore({ record: record(), planDocument: planDocument(), companyId: COMPANY_A }, NOW);
    assert.ok(Number.isFinite(breakdown.score));
    assert.ok(breakdown.score >= 0 && breakdown.score <= 100);
    const { provider } = createProvider({ record: record(), document: planDocument() });
    const result = await provider.getCompliance(COMPANY_A);
    assert.equal(result.percentage, Math.round(result.percentage), 'percentage íntegro (0–100)');
  });
});

// ── Tenant y provider end-to-end ──

describe('EmergencyPlanProvider — tenant y contrato end-to-end', () => {
  it('empresa A no consume evidencia de empresa B (query tenant-scoped)', async () => {
    const { provider, captured } = createProvider({ record: record() });
    await provider.getCompliance(COMPANY_A);
    const query = captured.emergencies[0] as { companyId?: { toString?(): string } };
    assert.ok(query.companyId, 'la consulta filtra por companyId');
    assert.equal(String(query.companyId), COMPANY_A);
  });

  it('registro legacy 1.1.10 se puntúa igual (compatibilidad de lectura)', async () => {
    const legacy = record({ itemCode: '1.1.10' });
    const { provider } = createProvider({ record: legacy });
    const result = await provider.getCompliance(COMPANY_A);
    assert.notEqual(result.status, 'NO_DATA', 'el legacy es evaluable');
    assert.ok(result.percentage > 0);
  });

  it('registro real → TARGET_NOT_MET/MET con phases.do y metadata dimensions:v1', async () => {
    const { provider } = createProvider({ record: record(), document: planDocument() });
    const result = await provider.getCompliance(COMPANY_A);
    assert.ok(['TARGET_MET', 'TARGET_NOT_MET'].includes(result.status));
    assert.equal(result.phases?.do, result.percentage);
    assert.ok(Number.isFinite(result.percentage));
    const meta = result.metadata as Record<string, any>;
    assert.equal(meta.standardCode, '5.1.1');
    assert.equal(meta.formula, 'dimensions:v1');
    assert.deepEqual(meta.weights, { plan: 25, threats: 20, resources: 10, evacuation: 10, contacts: 10, drills: 15, socialization: 10 });
    assert.ok(meta.dimensions.plan, 'metadata por dimensión');
    assert.ok(meta.counters.activeThreats !== undefined, 'counters explican el score');
  });

  it('no NaN ni Infinity con datos raros (valores nulos/strings vacíos)', () => {
    const weird = record({
      threats: [threat({ scenario: '', probability: undefined, impact: undefined, riskLevel: undefined })],
      equipment: [equipment({ quantity: undefined, operationalStatus: undefined, status: '' })],
      drills: [drill({ participants: undefined, expectedParticipants: undefined, date: 'no-fecha' })],
      contacts: [contact('ARL', { phone: '', callOrder: undefined })],
      plan: { planName: 'Plan', socialization: { coveragePercentage: 500 } },
    });
    const breakdown = computeEmergencyPlanScore({ record: weird, planDocument: null, companyId: COMPANY_A }, NOW);
    assert.ok(Number.isFinite(breakdown.score), 'score finito');
    assert.ok(breakdown.score >= 0 && breakdown.score <= 100);
  });
});
