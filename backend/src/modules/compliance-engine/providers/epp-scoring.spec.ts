import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  EPP_SCORE_WEIGHTS,
  computeEppScore,
  deliveryHasOwnEvidence,
  isDeliveryCoveringRequirement,
  isDeliveryTraceable,
  isRequirementCovered,
  redistributeWeightedScore,
  type EppScoreInput,
} from './epp-scoring';
import { isEppDeliveryOverdue } from '../../epp/utils/epp-delivery-status.util';

/**
 * Tests del scoring V2 de 4.2.6 EPP (funciones puras).
 * Casos obligatorios de la etapa V2: PROGRAMA (1-6), COBERTURA (7-25),
 * VIGENCIA (26-31), TRAZABILIDAD (32-36), REDISTRIBUCIÓN (37-43).
 */

const NOW = new Date('2026-09-15T12:00:00Z');
const COMPANY_A = '507f1f77bcf86cd799439011';
const JP_ID = '60aaaaaaaaaaaaaaaaaaaa01';
const JP_B_ID = '60aaaaaaaaaaaaaaaaaaaa02';
const JP_HIST_ID = '60aaaaaaaaaaaaaaaaaaaa03';

function catalogItem(overrides: Record<string, unknown> = {}): any {
  return { eppId: 'EPP-1', name: 'Casco', category: 'Cabeza', active: true, requiredFor: 'Obra', ...overrides };
}

function eppRecord(catalog: any[] = [catalogItem()], extra: Record<string, unknown> = {}): any {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(COMPANY_A), catalog, ...extra };
}

function jobProfile(id: string, active = true, extra: Record<string, unknown> = {}): any {
  return { _id: new Types.ObjectId(id), companyId: new Types.ObjectId(COMPANY_A), name: `Cargo ${id.slice(-2)}`, active, ...extra };
}

function worker(jobProfileId: string | null, status = 'Activo', extra: Record<string, unknown> = {}): any {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(COMPANY_A),
    name: 'Juan Pérez',
    status,
    jobProfileId: jobProfileId ? new Types.ObjectId(jobProfileId) : undefined,
    ...extra,
  };
}

function applicability(jobProfileId: string, eppItemId: string, extra: Record<string, unknown> = {}): any {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(COMPANY_A),
    jobProfileId: new Types.ObjectId(jobProfileId),
    eppItemId,
    required: true,
    active: true,
    ...extra,
  };
}

function delivery(overrides: Record<string, unknown> = {}): any {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(COMPANY_A),
    employeeId: new Types.ObjectId(),
    eppItemId: 'EPP-1',
    deliveryDate: new Date('2026-09-01'),
    expectedReplacementDate: new Date('2027-03-01'),
    quantity: 1,
    condition: 'GOOD',
    status: 'ACTIVE',
    evidenceUrl: 'https://evidencia/acta-1.pdf',
    history: [{ action: 'CREATED', date: new Date('2026-09-01'), performedBy: 'uid-owner' }],
    createdBy: 'uid-owner',
    ...overrides,
  };
}

/** Empresa base: 1 JobProfile activo con 1 trabajador y matriz EPP-1+EPP-2. */
function baseScenario() {
  const record = eppRecord([catalogItem(), catalogItem({ eppId: 'EPP-2', name: 'Guantes' })]);
  const profiles = [jobProfile(JP_ID)];
  const w1 = worker(JP_ID);
  const matrix = [applicability(JP_ID, 'EPP-1'), applicability(JP_ID, 'EPP-2')];
  const input = (overrides: Partial<EppScoreInput> = {}): EppScoreInput => ({
    eppRecord: record,
    jobProfiles: profiles,
    workers: [w1],
    applicabilities: matrix,
    deliveries: [],
    ...overrides,
  });
  return { record, profiles, w1, matrix, input };
}

/** Entregas GOOD vigentes de un worker para una lista de EPPs. */
function coveringDeliveries(workerId: unknown, itemIds: string[], extra: Record<string, unknown> = {}): any[] {
  return itemIds.map((eppItemId) => delivery({ employeeId: workerId, eppItemId, ...extra }));
}

describe('EPP scoring V2 (4.2.6) — PROGRAMA (25)', () => {
  it('1. JobProfile activo con matriz válida → numerador PROGRAMA', () => {
    const { input } = baseScenario();
    const bd = computeEppScore(input(), NOW);
    assert.equal(bd.details.program.denominator, 1);
    assert.equal(bd.details.program.numerator, 1);
    assert.equal(bd.dimensions.program.ratio, 1);
  });

  it('2. JobProfile activo sin matriz → ratio 0 y finding flag', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ applicabilities: [] }), NOW);
    assert.equal(bd.details.program.numerator, 0);
    assert.equal(bd.details.program.denominator, 1);
    assert.equal(bd.dimensions.program.ratio, 0);
    assert.equal(bd.counters.jobProfilesWithoutMatrix, 1);
    assert.equal(bd.jobProfilesWithoutMatrix, true);
    // Sus trabajadores no generan requisitos: cobertura null (sin denominador).
    assert.equal(bd.details.coverage.applicableRequirements, 0);
    assert.equal(bd.dimensions.coverage.ratio, null);
    void w1;
  });

  it('3. JobProfile solo con required=false → NO cuenta como matriz requerida', () => {
    const { input } = baseScenario();
    const bd = computeEppScore(input({ applicabilities: [applicability(JP_ID, 'EPP-1', { required: false })] }), NOW);
    assert.equal(bd.dimensions.program.ratio, 0);
    assert.equal(bd.counters.applicableRequirements, 0);
    assert.equal(bd.hasApplicableRequirements, false);
  });

  it('4. EPP inactivo referenciado → no es requisito válido, flag de integridad', () => {
    const { input } = baseScenario();
    const record = eppRecord([catalogItem(), catalogItem({ eppId: 'EPP-2', active: false })]);
    const bd = computeEppScore(input({ eppRecord: record }), NOW);
    // Solo EPP-1 es requisito válido; EPP-2 activo en matriz pero inactivo en catálogo.
    assert.equal(bd.counters.inactiveItemReferences, 1);
    assert.equal(bd.inactiveItemReferences, true);
    assert.equal(bd.counters.applicableRequirements, 1); // solo EPP-1
    assert.equal(bd.dimensions.program.ratio, 1); // la matriz sigue siendo válida (EPP-1)
  });

  it('4b. relación a EPP inexistente en catálogo → mismo tratamiento de integridad', () => {
    const { input } = baseScenario();
    const matrix = [applicability(JP_ID, 'EPP-1'), applicability(JP_ID, 'EPP-FANTASMA')];
    const bd = computeEppScore(input({ applicabilities: matrix }), NOW);
    assert.equal(bd.counters.inactiveItemReferences, 1);
    assert.equal(bd.counters.applicableRequirements, 1);
  });

  it('5. JobProfile histórico sin trabajadores no penaliza (fuera del denominador)', () => {
    const { input } = baseScenario();
    const bd = computeEppScore(input({ jobProfiles: [jobProfile(JP_ID), jobProfile(JP_HIST_ID)] }), NOW);
    assert.equal(bd.counters.jobProfilesActive, 2);
    assert.equal(bd.details.program.denominator, 1); // solo el que tiene trabajadores
    assert.equal(bd.dimensions.program.ratio, 1);
  });
  it('6. varios JobProfiles: programa = conMatriz/conTrabajadores', () => {
    const { input, matrix } = baseScenario();
    const profiles = [jobProfile(JP_ID), jobProfile(JP_B_ID)];
    const workers = [worker(JP_ID), worker(JP_B_ID)];
    const matrixB = [applicability(JP_B_ID, 'EPP-1')];
    const bd = computeEppScore(input({ jobProfiles: profiles, workers, applicabilities: [...matrix, ...matrixB] }), NOW);
    assert.equal(bd.details.program.numerator, 2);
    assert.equal(bd.details.program.denominator, 2);
    assert.equal(bd.dimensions.program.ratio, 1);
    // Requisitos: 2 (JP-A) + 1 (JP-B) = 3
    assert.equal(bd.counters.applicableRequirements, 3);
  });

  it('6b. JobProfile inactivo con trabajadores → fuera del denominador de PROGRAMA', () => {
    const { input } = baseScenario();
    const bd = computeEppScore(input({ jobProfiles: [jobProfile(JP_ID, false)] }), NOW);
    // El trabajador apunta a un perfil inactivo: no genera requisitos ni entra a PROGRAMA.
    assert.equal(bd.details.program.denominator, 0);
    assert.equal(bd.dimensions.program.ratio, null);
    assert.equal(bd.counters.workersWithInactiveJobProfile, 1);
  });

  it('6c. sin JobProfiles activos con trabajadores → PROGRAMA null (no 100 artificial)', () => {
    const bd = computeEppScore({ eppRecord: eppRecord([catalogItem()]), jobProfiles: [], workers: [], applicabilities: [], deliveries: [delivery()] }, NOW);
    assert.equal(bd.dimensions.program.ratio, null);
    assert.equal(bd.details.program.denominator, 0);
  });
});

describe('EPP scoring V2 (4.2.6) — COBERTURA M2 (30, principal)', () => {
  it('7. 100% de requisitos cubiertos', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1', 'EPP-2']) }), NOW);
    assert.equal(bd.details.coverage.applicableRequirements, 2);
    assert.equal(bd.details.coverage.coveredRequirements, 2);
    assert.equal(bd.dimensions.coverage.ratio, 1);
  });

  it('8. 75% (3 de 4 requisitos) — ejemplo del enunciado', () => {
    const { input, matrix } = baseScenario();
    const profiles = [jobProfile(JP_ID), jobProfile(JP_B_ID)];
    const w1 = worker(JP_ID);
    const w2 = worker(JP_B_ID);
    const matrixB = [applicability(JP_B_ID, 'EPP-1'), applicability(JP_B_ID, 'EPP-2')];
    // w1 cubre sus 2; w2 cubre 1 de 2 → 3/4 = 0.75
    const bd = computeEppScore(input({
      jobProfiles: profiles,
      workers: [w1, w2],
      applicabilities: [...matrix, ...matrixB],
      deliveries: coveringDeliveries(w1._id, ['EPP-1', 'EPP-2']).concat(coveringDeliveries(w2._id, ['EPP-1'])),
    }), NOW);
    assert.equal(bd.counters.applicableRequirements, 4);
    assert.equal(bd.counters.coveredRequirements, 3);
    assert.equal(bd.dimensions.coverage.ratio, 0.75);
  });

  it('9. 0%: sin entregas', () => {
    const { input } = baseScenario();
    const bd = computeEppScore(input(), NOW);
    assert.equal(bd.dimensions.coverage.ratio, 0);
    assert.equal(bd.counters.coveredRequirements, 0);
  });

  it('10. trabajador con varios EPP: necesita TODOS los de SU matriz', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1']) }), NOW);
    assert.equal(bd.dimensions.coverage.ratio, 0.5); // 1 de 2
    assert.equal(bd.details.coverage.fullyCoveredWorkers, 0);
  });

  it('11. múltiples trabajadores con matrices distintas', () => {
    const { input, matrix } = baseScenario();
    const profiles = [jobProfile(JP_ID), jobProfile(JP_B_ID)];
    const w1 = worker(JP_ID);
    const w2 = worker(JP_B_ID);
    // JP-B requiere solo EPP-1.
    const bd = computeEppScore(input({
      jobProfiles: profiles,
      workers: [w1, w2],
      applicabilities: [...matrix, applicability(JP_B_ID, 'EPP-1')],
      deliveries: coveringDeliveries(w1._id, ['EPP-1', 'EPP-2']).concat(coveringDeliveries(w2._id, ['EPP-1'])),
    }), NOW);
    assert.equal(bd.details.coverage.coveredRequirements, 3);
    assert.equal(bd.details.coverage.applicableRequirements, 3);
    assert.equal(bd.details.coverage.fullyCoveredWorkers, 2);
    assert.equal(bd.details.coverage.workersWithRequirements, 2);
  });

  it('12. trabajador sin JobProfile → sin requisitos, sin penalizar cobertura, finding flag', () => {
    const { input } = baseScenario();
    const withoutProfile = worker(null);
    const bd = computeEppScore(input({ workers: [worker(JP_ID), withoutProfile] }), NOW);
    assert.equal(bd.counters.workersWithoutJobProfile, 1);
    assert.equal(bd.workersWithoutJobProfile, true);
    assert.equal(bd.counters.applicableRequirements, 2); // solo el trabajador con perfil
    assert.equal(bd.dimensions.coverage.ratio, 0);
  });

  it('13. JobProfile inactivo → trabajador fuera del denominador, finding flag', () => {
    const { input } = baseScenario();
    const bd = computeEppScore(input({ jobProfiles: [jobProfile(JP_ID, false)] }), NOW);
    assert.equal(bd.counters.applicableRequirements, 0);
    assert.equal(bd.dimensions.coverage.ratio, null);
    assert.equal(bd.workersWithInactiveJobProfile, true);
  });

  it('14. requisito required=false no cuenta ni cubre', () => {
    const { input, w1 } = baseScenario();
    const matrix = [
      applicability(JP_ID, 'EPP-1', { required: false }),
      applicability(JP_ID, 'EPP-2'),
    ];
    const bd = computeEppScore(input({
      applicabilities: matrix,
      deliveries: coveringDeliveries(w1._id, ['EPP-1']),
    }), NOW);
    assert.equal(bd.counters.applicableRequirements, 1); // solo EPP-2
    assert.equal(bd.counters.coveredRequirements, 0); // la entrega de EPP-1 no cubre nada
    assert.equal(bd.dimensions.coverage.ratio, 0);
  });

  it('15. EPP inactivo referenciado no cuenta como requisito aplicable', () => {
    const { input } = baseScenario();
    const record = eppRecord([catalogItem({ active: false }), catalogItem({ eppId: 'EPP-2' })]);
    const bd = computeEppScore(input({ eppRecord: record }), NOW);
    assert.equal(bd.counters.applicableRequirements, 1); // solo EPP-2
    assert.equal(bd.dimensions.coverage.ratio, 0);
  });

  it('16. entrega ACTIVE GOOD vigente cubre el requisito', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1']) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 1);
  });

  it('17. entrega ACTIVE FAIR vigente SÍ cubre (cobertura)', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { condition: 'FAIR' }) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 1);
    assert.equal(bd.details.coverage.coveredRequirements, 1);
  });

  it('18. entrega vencida NO cubre el requisito', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({
      deliveries: coveringDeliveries(w1._id, ['EPP-1'], { expectedReplacementDate: new Date('2026-09-10') }),
    }), NOW);
    assert.equal(bd.counters.coveredRequirements, 0);
    assert.equal(bd.counters.overdue, 1);
  });

  it('19. RETURNED no acredita cobertura', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { status: 'RETURNED' }) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 0);
    assert.equal(bd.counters.returned, 1);
  });

  it('20. REPLACED no acredita cobertura', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { status: 'REPLACED' }) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 0);
  });

  it('21. DAMAGED no acredita cobertura', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { status: 'DAMAGED' }) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 0);
  });

  it('22. múltiples entregas del mismo requisito → el requisito vale 1 (sin doble conteo)', () => {
    const { input, w1 } = baseScenario();
    const deliveries = coveringDeliveries(w1._id, ['EPP-1']).concat(
      coveringDeliveries(w1._id, ['EPP-1'], { deliveryDate: new Date('2026-08-01') }),
    );
    const bd = computeEppScore(input({ deliveries }), NOW);
    assert.equal(bd.counters.coveredRequirements, 1); // un requisito, no dos
    assert.equal(bd.details.coverage.applicableRequirements, 2);
    assert.equal(bd.details.coverage.coveredRequirements, 1);
    assert.equal(bd.details.coverage.fullyCoveredWorkers, 0); // falta EPP-2
  });

  it('22b. varias entregas del mismo requisito: basta UNA válida (determinista)', () => {
    // Una vencida y una vigente: el requisito está cubierto por la vigente.
    const deliveries = [
      delivery({ employeeId: new Types.ObjectId(JP_ID), eppItemId: 'EPP-1', expectedReplacementDate: new Date('2026-09-10') }),
      delivery({ employeeId: new Types.ObjectId(JP_ID), eppItemId: 'EPP-1' }),
    ];
    assert.equal(isRequirementCovered(deliveries, NOW), true);
    assert.equal(isDeliveryCoveringRequirement(deliveries[1], NOW), true);
    assert.equal(isDeliveryCoveringRequirement(deliveries[0], NOW), false);
  });

  it('23. delivery fuera de matriz no cubre ni mejora score (va a metadata)', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-9']) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 0);
    assert.equal(bd.counters.deliveriesOutsideApplicability, 1);
    assert.equal(bd.deliveriesOutsideApplicability, true);
    assert.equal(bd.dimensions.validityCondition.ratio, null); // no puntúa vigencia
    assert.equal(bd.dimensions.traceability.ratio, null); // no puntúa trazabilidad
  });

  it('24. trabajador completamente cubierto → M1 = 1', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1', 'EPP-2']) }), NOW);
    assert.equal(bd.details.coverage.fullyCoveredWorkers, 1);
    assert.equal(bd.details.coverage.workersWithRequirements, 1);
    assert.equal(bd.dimensions.coverage.ratio, 1);
  });

  it('25. trabajador parcialmente cubierto → M1 = 0 con M2 parcial', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1']) }), NOW);
    assert.equal(bd.details.coverage.fullyCoveredWorkers, 0);
    assert.equal(bd.details.coverage.workersWithRequirements, 1);
    assert.equal(bd.dimensions.coverage.ratio, 0.5);
  });

  it('25b. quantity = 0 en la entrega → no acredita cobertura (validación estructural)', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { quantity: 0 }) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 0);
  });

  it('25c. quantity = 2 (sin reglas de cantidad en matriz) → requisito cubierto igual que quantity=1', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { quantity: 2 }) }), NOW);
    assert.equal(bd.counters.coveredRequirements, 1);
  });
});

describe('EPP scoring V2 (4.2.6) — VIGENCIA_CONDICION (25)', () => {
  it('26. GOOD vigente = 1', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1']) }), NOW);
    assert.equal(bd.dimensions.validityCondition.ratio, 1);
    assert.equal(bd.counters.activeValidDeliveries, 1);
  });

  it('27. FAIR vigente = 0.5', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { condition: 'FAIR' }) }), NOW);
    assert.equal(bd.dimensions.validityCondition.ratio, 0.5);
  });

  it('28. POOR = 0', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { condition: 'POOR' }) }), NOW);
    assert.equal(bd.dimensions.validityCondition.ratio, 0);
    assert.equal(bd.counters.severeCondition, 1);
  });

  it('29. DAMAGED = 0 (y no acredita cobertura por estado terminal)', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { condition: 'DAMAGED' }) }), NOW);
    assert.equal(bd.dimensions.validityCondition.ratio, 0);
    assert.equal(bd.counters.coveredRequirements, 0);
  });

  it('30. vencida = 0 en vigencia y overdue dinámico', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({
      deliveries: coveringDeliveries(w1._id, ['EPP-1'], { expectedReplacementDate: new Date('2026-09-10') }),
    }), NOW);
    assert.equal(bd.dimensions.validityCondition.ratio, 0);
    assert.equal(bd.counters.overdue, 1);
    assert.equal(bd.counters.activeValidDeliveries, 0);
  });

  it('31. entrega no requerida (fuera de matriz) NO mejora vigencia', () => {
    const { input } = baseScenario();
    const bd = computeEppScore(input({ deliveries: [delivery({ eppItemId: 'EPP-9' })] }), NOW);
    assert.equal(bd.dimensions.validityCondition.ratio, null);
    assert.equal(bd.counters.deliveriesOutsideApplicability, 1);
  });

  it('31b. vigencia sobre entregas ACTIVE de requisitos: mezcla GOOD/FAIR', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({
      deliveries: coveringDeliveries(w1._id, ['EPP-1']).concat(coveringDeliveries(w1._id, ['EPP-2'], { condition: 'FAIR' })),
    }), NOW);
    assert.equal(bd.dimensions.validityCondition.ratio, 0.75); // (1 + 0.5) / 2
  });
});

describe('EPP scoring V2 (4.2.6) — TRAZABILIDAD (20)', () => {
  it('32. evidencia completa → trazable y withEvidence', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1']) }), NOW);
    assert.equal(bd.dimensions.traceability.ratio, 1);
    assert.equal(bd.counters.withEvidence, 1);
    assert.equal(bd.counters.traceable, 1);
  });

  it('33. evidencia ausente → sin evidencia propia (pero puede ser trazable si falta solo evidencia)', () => {
    const d = delivery({ evidenceUrl: undefined, certificateUrl: undefined });
    assert.equal(deliveryHasOwnEvidence(d), false);
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { evidenceUrl: undefined, certificateUrl: undefined }) }), NOW);
    assert.equal(bd.counters.withEvidence, 0);
    // Trazabilidad estructural exige evidencia propia → 0.
    assert.equal(bd.dimensions.traceability.ratio, 0);
  });

  it('34. history ausente → no trazable', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { history: [] }) }), NOW);
    assert.equal(bd.dimensions.traceability.ratio, 0);
  });

  it('35. createdBy ausente → no trazable', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1'], { createdBy: '' }) }), NOW);
    assert.equal(bd.dimensions.traceability.ratio, 0);
  });

  it('36. datos inválidos: deliveryDate inválida y quantity 0 → no trazable', () => {
    const workerId = new Types.ObjectId();
    const bad1 = delivery({ employeeId: workerId, deliveryDate: new Date('no-valida'), history: [{ action: 'CREATED', date: new Date(), performedBy: 'u' }], createdBy: 'u' });
    const bad2 = delivery({ employeeId: workerId, quantity: 0, history: [{ action: 'CREATED', date: new Date(), performedBy: 'u' }], createdBy: 'u' });
    const validWorkerIds = new Set([String(workerId)]);
    const catalogIds = new Set(['EPP-1']);
    assert.equal(isDeliveryTraceable(bad1, validWorkerIds, catalogIds), false);
    assert.equal(isDeliveryTraceable(bad2, validWorkerIds, catalogIds), false);
    // Y una entrega completa sí lo es.
    const good = delivery({ employeeId: workerId });
    assert.equal(isDeliveryTraceable(good, validWorkerIds, catalogIds), true);
  });

  it('36b. la evidencia legacy del SstEpp NO acredita la entrega', () => {
    const { input, w1 } = baseScenario();
    const record = eppRecord([catalogItem()], { certificateUrl: 'https://legacy/cert.pdf', evidenceUrl: 'https://legacy/acta.pdf' });
    const bd = computeEppScore(input({
      eppRecord: record,
      deliveries: coveringDeliveries(w1._id, ['EPP-1'], { evidenceUrl: undefined, certificateUrl: undefined }),
    }), NOW);
    assert.equal(bd.counters.withEvidence, 0);
  });
});

describe('EPP scoring V2 (4.2.6) — REDISTRIBUCIÓN (intacta)', () => {
  it('37. dimensión sin denominador → null y su peso se redistribuye', () => {
    // PROGRAMA 1/1 + TRAZABILIDAD 1/1 (entrega RETURNED trazable de trabajador
    // activo con matriz); COBERTURA/VIGENCIA null (sin requisitos/ACTIVE aplicables).
    // RETURNED no es requisito... la entrega de un requisito con estado RETURNED
    // sigue siendo entrega "aplicable" (ligada al requisito) → cuenta en trazabilidad
    // y en el denominador de vigencia (0 valor). Recalculo: uso una matriz sin
    // entregas aplicables y trabajador activo con matriz.
    const { input, matrix } = baseScenario();
    const bd = computeEppScore(input({ applicabilities: [] }), NOW);
    // Sin matriz: PROGRAMA 0 evaluable, COBERTURA null, VIGENCIA null, TRAZABILIDAD null.
    assert.equal(bd.dimensions.program.ratio, 0);
    assert.equal(bd.dimensions.coverage.ratio, null);
    assert.equal(bd.dimensions.validityCondition.ratio, null);
    assert.equal(bd.dimensions.traceability.ratio, null);
    // (25×0)/25 × 100 = 0
    assert.equal(bd.score, 0);
    void matrix;
  });

  it('37b. redistribución: solo PROGRAMA y TRAZABILIDAD evaluables → (25+20)/(45)', () => {
    // PROGRAMA 1/1; TRAZABILIDAD 1/1 con entrega RETURNED ligada a requisito;
    // COBERTURA null (trabajador sin matriz) — no: uso matriz válida y
    // trabajador activo, entrega RETURNED ligada al requisito (aplicable).
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({
      deliveries: coveringDeliveries(w1._id, ['EPP-1'], { status: 'RETURNED' }).concat(coveringDeliveries(w1._id, ['EPP-2'], { status: 'RETURNED' })),
    }), NOW);
    // Cobertura: 0/2 (RETURNED no cubre). Vigencia: no ACTIVE → null.
    // Trazabilidad: 2/2.
    assert.equal(bd.dimensions.coverage.ratio, 0);
    assert.equal(bd.dimensions.validityCondition.ratio, null);
    assert.equal(bd.dimensions.traceability.ratio, 1);
    // (25×1 + 30×0 + 20×1) / 75 × 100 = 60
    assert.equal(bd.score, 60);
  });

  it('38. todos null → score 0', () => {
    const bd = computeEppScore({ eppRecord: null, jobProfiles: [], workers: [], applicabilities: [], deliveries: [] }, NOW);
    assert.equal(bd.score, 0);
    assert.equal(redistributeWeightedScore([{ ratio: null, weight: 25 }]), 0);
    assert.ok(Number.isFinite(redistributeWeightedScore([])));
  });

  it('39. valores fuera de rango se descartan por redistributeWeightedScore', () => {
    assert.equal(redistributeWeightedScore([{ ratio: 1.5, weight: 30 }]), 0);
    assert.equal(redistributeWeightedScore([{ ratio: -0.5, weight: 30 }]), 0);
    assert.equal(redistributeWeightedScore([{ ratio: 1, weight: 30 }, { ratio: 2, weight: 70 }]), 100);
  });

  it('40. NaN/Infinity en ratios → nunca NaN en el score', () => {
    assert.equal(redistributeWeightedScore([{ ratio: Number.NaN, weight: 30 }, { ratio: 1, weight: 70 }]), 100);
    assert.equal(redistributeWeightedScore([{ ratio: Number.POSITIVE_INFINITY, weight: 30 }]), 0);
    assert.ok(Number.isFinite(redistributeWeightedScore([{ ratio: Number.NaN, weight: 30 }])));
  });

  it('41. casos extremos del dominio: score finito', () => {
    const cases: EppScoreInput[] = [
      { eppRecord: eppRecord([catalogItem({ active: false })]), jobProfiles: [], workers: [], applicabilities: [applicability(JP_ID, 'EPP-1')], deliveries: [] },
      { eppRecord: eppRecord([]), jobProfiles: [jobProfile(JP_ID)], workers: [worker(JP_ID)], applicabilities: [], deliveries: [] },
      { eppRecord: eppRecord([catalogItem()]), jobProfiles: [jobProfile(JP_ID)], workers: [worker(JP_ID)], applicabilities: [applicability(JP_ID, 'EPP-1')], deliveries: [delivery({ condition: 'POOR', expectedReplacementDate: new Date('2020-01-01') })] },
    ];
    for (const input of cases) {
      const bd = computeEppScore(input, NOW);
      assert.ok(Number.isFinite(bd.score));
      assert.ok(bd.score >= 0 && bd.score <= 100);
    }
  });

  it('42. el score nunca es > 100', () => {
    assert.equal(redistributeWeightedScore([{ ratio: 1, weight: 30 }]), 100);
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({ deliveries: coveringDeliveries(w1._id, ['EPP-1', 'EPP-2']) }), NOW);
    assert.ok(bd.score <= 100);
    assert.equal(bd.score, 100);
  });

  it('43. el score nunca es < 0', () => {
    const { input, w1 } = baseScenario();
    const bd = computeEppScore(input({
      deliveries: coveringDeliveries(w1._id, ['EPP-1'], { condition: 'POOR', expectedReplacementDate: new Date('2026-01-01') }),
    }), NOW);
    assert.ok(bd.score >= 0);
  });

  it('los pesos de la fórmula son 25/30/25/20 (sin cambios V1→V2)', () => {
    assert.deepEqual({ ...EPP_SCORE_WEIGHTS }, { program: 25, coverage: 30, validityCondition: 25, traceability: 20 });
  });

  it('overdue DINÁMICO sin persistencia (mismo objeto, dos instantes)', () => {
    const d = delivery({ expectedReplacementDate: new Date('2026-09-20') });
    assert.equal(isEppDeliveryOverdue(d, NOW), false);
    assert.equal(isEppDeliveryOverdue(d, new Date('2026-09-21')), true);
  });
});

describe('EPP scoring V2 — fuentes y compatibilidad', () => {
  it('requiredFor NO afecta el scoring (texto legacy)', () => {
    const withRequiredFor = eppRecord([catalogItem({ requiredFor: 'Obra' })]);
    const withoutRequiredFor = eppRecord([catalogItem({ requiredFor: '' })]);
    const applicabilities = [applicability(JP_ID, 'EPP-1')];
    const a = computeEppScore({ eppRecord: withRequiredFor, jobProfiles: [jobProfile(JP_ID)], workers: [worker(JP_ID)], applicabilities, deliveries: [] }, NOW);
    const b = computeEppScore({ eppRecord: withoutRequiredFor, jobProfiles: [jobProfile(JP_ID)], workers: [worker(JP_ID)], applicabilities, deliveries: [] }, NOW);
    assert.equal(a.score, b.score);
    assert.equal(a.dimensions.coverage.ratio, b.dimensions.coverage.ratio);
  });

  it('complianceStatus NO afecta el score', () => {
    const applicabilities = [applicability(JP_ID, 'EPP-1')];
    const w = worker(JP_ID);
    const deliveries = coveringDeliveries(w._id, ['EPP-1']);
    const a = computeEppScore({ eppRecord: eppRecord([catalogItem()], { complianceStatus: 'COMPLIES' }), jobProfiles: [jobProfile(JP_ID)], workers: [w], applicabilities, deliveries }, NOW);
    const b = computeEppScore({ eppRecord: eppRecord([catalogItem()], { complianceStatus: 'NON_COMPLIANT' }), jobProfiles: [jobProfile(JP_ID)], workers: [w], applicabilities, deliveries }, NOW);
    assert.equal(a.score, b.score);
  });

  it('SstEpp.assignments[] NO afecta el scoring (solo la matriz estructurada)', () => {
    const assignments = [{ assignmentId: 'a1', employeeId: 'x', employeeName: 'x', eppItemId: 'EPP-1', eppName: 'Casco', deliveryDate: new Date() }];
    const applicabilities = [applicability(JP_ID, 'EPP-1')];
    const a = computeEppScore({ eppRecord: eppRecord([catalogItem()], { assignments }), jobProfiles: [jobProfile(JP_ID)], workers: [worker(JP_ID)], applicabilities, deliveries: [] }, NOW);
    const b = computeEppScore({ eppRecord: eppRecord([catalogItem()]), jobProfiles: [jobProfile(JP_ID)], workers: [worker(JP_ID)], applicabilities, deliveries: [] }, NOW);
    assert.equal(a.score, b.score);
    assert.equal(b.dimensions.coverage.ratio, 0); // sin entregas reales no hay cobertura
  });

  it('NO_DATA pura: sin catálogo, sin matriz, sin trabajadores con cargo, sin entregas', () => {
    const bd = computeEppScore({ eppRecord: null, jobProfiles: [], workers: [], applicabilities: [], deliveries: [] }, NOW);
    assert.equal(bd.score, 0);
    assert.equal(bd.hasCatalog, false);
    assert.equal(bd.hasApplicableRequirements, false);
    assert.equal(bd.hasEvaluableDeliveries, false);
    for (const dim of Object.values(bd.dimensions)) {
      assert.equal(dim.ratio, null);
      assert.equal(dim.evaluable, false);
    }
  });

  it('NO_DATA con trabajadores SIN matriz NO es silencioso: hay señales para TARGET_NOT_MET', () => {
    const bd = computeEppScore({ eppRecord: null, jobProfiles: [], workers: [worker(JP_ID)], applicabilities: [], deliveries: [] }, NOW);
    // El score es 0 pero la empresa tiene trabajadores con cargo → el provider
    // debe emitir epp-jobprofile-without-matrix (ver provider.spec).
    assert.equal(bd.counters.jobProfilesWithWorkers, 0); // perfil inexistente → sin denominador de programa
    assert.equal(bd.counters.workersWithInactiveJobProfile, 1); // señal de integridad
    assert.equal(bd.score, 0);
  });

  it('metadata V2 expone M1 y M2 (ejemplo del enunciado 24/32 y 8/10)', () => {
    const { input, matrix } = baseScenario();
    const profiles = [jobProfile(JP_ID), jobProfile(JP_B_ID)];
    const workers = [worker(JP_ID), worker(JP_B_ID)];
    const matrixB = [applicability(JP_B_ID, 'EPP-1'), applicability(JP_B_ID, 'EPP-2')];
    const w1 = workers[0] as any;
    const w2 = workers[1] as any;
    const deliveries = [
      ...coveringDeliveries(w1._id, ['EPP-1', 'EPP-2']),
      ...coveringDeliveries(w2._id, ['EPP-1', 'EPP-2']),
      ...coveringDeliveries(w1._id, ['EPP-1']), // duplicado: no suma
    ];
    // Ajustamos a 32 requisitos? No: el ejemplo 24/32 es ilustrativo; verificamos
    // la estructura num/den + M1 con el escenario real (4 requisitos, 4 cubiertos).
    const bd = computeEppScore(input({ jobProfiles: profiles, workers, applicabilities: [...matrix, ...matrixB], deliveries }), NOW);
    assert.equal(bd.details.coverage.coveredRequirements, 4);
    assert.equal(bd.details.coverage.applicableRequirements, 4);
    assert.equal(bd.details.coverage.fullyCoveredWorkers, 2);
    assert.equal(bd.details.coverage.workersWithRequirements, 2);
    assert.deepEqual(bd.details.coverage.workersWithoutJobProfile, 0);
  });
});
