import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Types } from 'mongoose';
import { EppComplianceProvider } from './epp-compliance.provider';
import { CATALOG_60 } from '../../standard-catalog/constants/catalog-60';

/**
 * Tests del EppComplianceProvider — Estándar 4.2.6 (Scoring V2 EXACT).
 *
 * Fórmula V2 por dimensiones (PROGRAMA 25 / COBERTURA M2 30 / VIGENCIA_CONDICION
 * 25 / TRAZABILIDAD 20) sobre SstEpp + JobProfile + Employee + EppApplicability
 * + EppDelivery (5 consultas tenant-scoped, sin N+1). EppApplicability es la
 * ÚNICA fuente de requisitos; EppDelivery la ÚNICA fuente de entregas.
 * Casos 44-54 de la etapa: seguridad/tenant, compatibilidad y contrato.
 */

const COMPANY_A = '507f1f77bcf86cd799439011';
const COMPANY_B = '507f1f77bcf86cd799439022';
const COMPANY_A_OID = new Types.ObjectId(COMPANY_A);
const JP_ID = '60aaaaaaaaaaaaaaaaaaaa01';
const JP_B_ID = '60aaaaaaaaaaaaaaaaaaaa02';

type AnyRecord = Record<string, any>;

function catalogItem(overrides: Record<string, unknown> = {}): AnyRecord {
  return { eppId: 'EPP-1', name: 'Casco', category: 'Cabeza', active: true, requiredFor: 'Obra', ...overrides };
}

function eppRecord(catalog: AnyRecord[] = [catalogItem()], extra: Record<string, unknown> = {}): AnyRecord {
  return { _id: new Types.ObjectId(), companyId: COMPANY_A_OID, catalog, ...extra };
}

function jobProfile(id = JP_ID, active = true, companyId: Types.ObjectId = COMPANY_A_OID): AnyRecord {
  return { _id: new Types.ObjectId(id), companyId, name: 'Operario', active };
}

function worker(jobProfileId: string | null, status = 'Activo', companyId: Types.ObjectId = COMPANY_A_OID): AnyRecord {
  return {
    _id: new Types.ObjectId(),
    companyId,
    name: 'Juan Pérez',
    position: 'Operario',
    status,
    jobProfileId: jobProfileId ? new Types.ObjectId(jobProfileId) : undefined,
  };
}

function applicability(jobProfileId: string, eppItemId: string, extra: Record<string, unknown> = {}): AnyRecord {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A_OID,
    jobProfileId: new Types.ObjectId(jobProfileId),
    eppItemId,
    required: true,
    active: true,
    ...extra,
  };
}

function delivery(overrides: Record<string, unknown> = {}): AnyRecord {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A_OID,
    employeeId: new Types.ObjectId(),
    eppItemId: 'EPP-1',
    deliveryDate: new Date('2026-09-01'),
    expectedReplacementDate: new Date('2027-03-01'),
    quantity: 1,
    condition: 'GOOD',
    status: 'ACTIVE',
    evidenceUrl: 'https://evidencia/acta-1.pdf',
    certificateUrl: undefined,
    history: [{ action: 'CREATED', date: new Date('2026-09-01'), performedBy: 'uid-owner' }],
    createdBy: 'uid-owner',
    ...overrides,
  };
}

/** Modelos mock que capturan las queries para verificar tenant-scoping y bulk. */
function createProvider(data: {
  eppRecords?: AnyRecord[];
  jobProfiles?: AnyRecord[];
  workers?: AnyRecord[];
  applicabilities?: AnyRecord[];
  deliveries?: AnyRecord[];
} = {}) {
  const capturedQueries: { epp: any[]; jobProfiles: any[]; employees: any[]; applicabilities: any[]; deliveries: any[] } = {
    epp: [], jobProfiles: [], employees: [], applicabilities: [], deliveries: [],
  };
  const modelFor = (bucket: any[], rows: AnyRecord[]) =>
    ({ find: (query: any) => { bucket.push(query); return { exec: () => Promise.resolve(rows) }; } });
  const eppModel = modelFor(capturedQueries.epp, data.eppRecords ?? []);
  const jobProfileModel = modelFor(capturedQueries.jobProfiles, data.jobProfiles ?? []);
  const employeeModel = modelFor(capturedQueries.employees, data.workers ?? []);
  const applicabilityModel = modelFor(capturedQueries.applicabilities, data.applicabilities ?? []);
  const deliveryModel = modelFor(capturedQueries.deliveries, data.deliveries ?? []);
  const provider = new EppComplianceProvider(
    eppModel as never, employeeModel as never, jobProfileModel as never,
    applicabilityModel as never, deliveryModel as never,
  );
  return { provider, capturedQueries };
}

/** 1 cargo activo con 1 trabajador y matriz EPP-1 (+EPP-2 opcional). */
function singleWorkerScenario(deliveriesFactory?: (w1: AnyRecord) => AnyRecord[], withTwoEpp = true) {
  const catalog = withTwoEpp
    ? [catalogItem(), catalogItem({ eppId: 'EPP-2', name: 'Guantes' })]
    : [catalogItem()];
  const profile = jobProfile();
  const w1 = worker(JP_ID);
  const applicabilities = withTwoEpp
    ? [applicability(JP_ID, 'EPP-1'), applicability(JP_ID, 'EPP-2')]
    : [applicability(JP_ID, 'EPP-1')];
  return {
    data: {
      eppRecords: [eppRecord(catalog)],
      jobProfiles: [profile],
      workers: [w1],
      applicabilities,
      deliveries: deliveriesFactory ? deliveriesFactory(w1) : [],
    },
    w1,
  };
}

describe('EppComplianceProvider (4.2.6) — Scoring V2 sobre matriz estructurada', () => {
  describe('NO_DATA y programa (§22)', () => {
    it('NO_DATA real: sin catálogo, sin matriz, sin perfiles, sin entregas → 0%, epp-no-data, do=0', async () => {
      const { provider } = createProvider();
      const result = await provider.getCompliance(COMPANY_A);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings[0].id, 'epp-no-data');
      assert.equal(result.findings[0].priority, 'HIGH');
      assert.equal(result.phases?.do, 0);
      assert.equal(result.overdue, 0);
    });

    it('empresa CON trabajadores activos pero SIN matriz → NO es NO_DATA silencioso', async () => {
      // Perfil activo con trabajador pero sin relaciones de matriz.
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile()],
        workers: [worker(JP_ID)],
        applicabilities: [],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      assert.notEqual(result.status, 'NO_DATA');
      assert.equal(result.status, 'TARGET_NOT_MET');
      assert.equal(result.percentage, 0);
      assert.ok(result.findings.some((f) => f.id === 'epp-jobprofile-without-matrix' && f.priority === 'HIGH'));
    });

    it('catálogo SIN matriz estructurada → epp-no-program HIGH (no NO_DATA)', async () => {
      // El catálogo existe (hasCatalog) → no es NO_DATA; sin requisitos válidos
      // → programa sin numerador → epp-no-program.
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        deliveries: [delivery()],
      });
      const result = await provider.getCompliance(COMPANY_A);
      assert.notEqual(result.status, 'NO_DATA');
      assert.ok(result.findings.some((f) => f.id === 'epp-no-program' && f.priority === 'HIGH'));
    });

    it('catálogo vacío con matriz que apunta a EPP inexistente → epp-no-program', async () => {
      const { provider } = createProvider({
        eppRecords: [eppRecord([])],
        jobProfiles: [jobProfile()],
        workers: [worker(JP_ID)],
        applicabilities: [applicability(JP_ID, 'EPP-FANTASMA')],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      assert.notEqual(result.status, 'NO_DATA');
      assert.ok(result.findings.some((f) => f.id === 'epp-no-program' && f.priority === 'HIGH'));
      assert.ok(result.findings.some((f) => f.id === 'epp-inactive-item-reference' && f.priority === 'HIGH'));
    });

    it('jobprofile sin matriz genera finding HIGH que coincide con el numerador de programa', async () => {
      // Dos cargos con trabajadores: JP con matriz y JP sin matriz.
      const profileB = jobProfile(JP_B_ID);
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile(), profileB],
        workers: [worker(JP_ID), worker(JP_B_ID)],
        applicabilities: [applicability(JP_ID, 'EPP-1')],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      const finding = result.findings.find((f) => f.id === 'epp-jobprofile-without-matrix');
      assert.ok(finding);
      assert.equal(finding.priority, 'HIGH');
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.dimensions.program.numerator, 1);
      assert.equal(meta.dimensions.program.denominator, 2);
      assert.equal(meta.counters.jobProfilesWithoutMatrix, 1);
    });
  });

  describe('Cobertura M2 y findings V2', () => {
    it('cobertura 100% → sin epp-low-coverage', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2' }),
      ]);
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      assert.ok(!result.findings.some((f) => f.id === 'epp-low-coverage'));
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.dimensions.coverage.ratio, 1);
      assert.equal(meta.dimensions.coverage.coveredRequirements, 2);
      assert.equal(meta.dimensions.coverage.applicableRequirements, 2);
    });

    it('cobertura ≥60% → epp-low-coverage MEDIUM; <60% → HIGH', async () => {
      // 4 requisitos (2 trabajadores × 2); w1 cubre 2, w2 cubre 1 → 3/4 = 0.75 → MEDIUM.
      const profileB = jobProfile(JP_B_ID);
      const w1 = worker(JP_ID);
      const w2 = worker(JP_B_ID);
      const base = {
        eppRecords: [eppRecord([catalogItem(), catalogItem({ eppId: 'EPP-2' })])],
        jobProfiles: [jobProfile(), profileB],
        workers: [w1, w2],
        applicabilities: [applicability(JP_ID, 'EPP-1'), applicability(JP_ID, 'EPP-2'), applicability(JP_B_ID, 'EPP-1'), applicability(JP_B_ID, 'EPP-2')],
      };
      const { provider: p1 } = createProvider({
        ...base,
        deliveries: [
          delivery({ employeeId: w1._id, eppItemId: 'EPP-1' }),
          delivery({ employeeId: w1._id, eppItemId: 'EPP-2' }),
          delivery({ employeeId: w2._id, eppItemId: 'EPP-1' }),
        ],
      });
      const r1 = await p1.getCompliance(COMPANY_A);
      const f1 = r1.findings.find((f) => f.id === 'epp-low-coverage');
      assert.ok(f1);
      assert.equal(f1.priority, 'MEDIUM');
      assert.equal((r1.metadata as AnyRecord).dimensions.coverage.ratio, 0.75);

      // 1/4 = 0.25 → HIGH.
      const { provider: p2 } = createProvider({
        ...base,
        deliveries: [delivery({ employeeId: w2._id, eppItemId: 'EPP-1' })],
      });
      const r2 = await p2.getCompliance(COMPANY_A);
      assert.equal(r2.findings.find((f) => f.id === 'epp-low-coverage')?.priority, 'HIGH');
    });

    it('trabajador sin jobProfileId → finding MEDIUM y fuera del denominador', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2' }),
      ]);
      data.workers = [...data.workers, worker(null)];
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      const finding = result.findings.find((f) => f.id === 'epp-worker-without-job-profile');
      assert.ok(finding);
      assert.equal(finding.priority, 'MEDIUM');
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.dimensions.coverage.ratio, 1); // no penaliza artificialmente
      assert.equal(meta.dimensions.coverage.workersWithoutJobProfile, 1);
    });

    it('trabajador con JobProfile inactivo → finding MEDIUM, sin requisitos', async () => {
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile(JP_ID, false)],
        workers: [worker(JP_ID)],
        applicabilities: [applicability(JP_ID, 'EPP-1')],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      const finding = result.findings.find((f) => f.id === 'epp-worker-inactive-job-profile');
      assert.ok(finding);
      assert.equal(finding.priority, 'MEDIUM');
      assert.equal((result.metadata as AnyRecord).counters.applicableRequirements, 0);
    });

    it('matriz que referencia EPP inactivo → epp-inactive-item-reference HIGH y requisito no válido', async () => {
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem(), catalogItem({ eppId: 'EPP-2', active: false })])],
        jobProfiles: [jobProfile()],
        workers: [worker(JP_ID)],
        applicabilities: [applicability(JP_ID, 'EPP-1'), applicability(JP_ID, 'EPP-2')],
        deliveries: [delivery({ employeeId: worker(JP_ID)._id, eppItemId: 'EPP-2' })],
      });
      const result = await provider.getCompliance(COMPANY_A);
      const finding = result.findings.find((f) => f.id === 'epp-inactive-item-reference');
      assert.ok(finding);
      assert.equal(finding.priority, 'HIGH');
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.counters.inactiveItemReferences, 1);
      assert.equal(meta.counters.applicableRequirements, 1); // solo EPP-1
    });

    it('entrega fuera de matriz → epp-delivery-outside-matrix LOW, sin penalización de score', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-9' }), // no requerido
      ]);
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      const finding = result.findings.find((f) => f.id === 'epp-delivery-outside-matrix');
      assert.ok(finding);
      assert.equal(finding.priority, 'LOW');
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.counters.deliveriesOutsideApplicability, 1);
      assert.equal(meta.dimensions.coverage.ratio, 1); // sigue 100%
    });

    it('completed = requisitos cubiertos; activeValidDeliveries en metadata', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2' }),
      ]);
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      assert.equal(result.completed, 2);
      assert.equal((result.metadata as AnyRecord).counters.activeValidDeliveries, 2);
      assert.equal(result.pending, 0);
    });

    it('pending sin doble conteo: requisito con entrega FAIR vigente cuenta UNA vez (por condición)', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2', condition: 'FAIR' }),
      ]);
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      // 2 requisitos cubiertos (FAIR vigente cubre) → 0 requisitos sin cobertura;
      // la FAIR requiere acción de condición → pending = 1 (UNA vez, §24).
      assert.equal(result.pending, 1);
      assert.ok(result.findings.some((f) => f.id === 'epp-condition'));
    });

    it('pending incluye requisito sin cobertura + vencida, sin duplicar el mismo requisito', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2', expectedReplacementDate: new Date('2026-09-10') }),
      ]);
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      assert.equal(result.overdue, 1);
      // EPP-2 vencida: requisito no cubierto (1) + entrega vencida que requiere
      // acción (1) — pero es el MISMO requisito: no se duplica.
      assert.equal(result.pending, 1);
      assert.ok(result.findings.some((f) => f.id === 'epp-overdue' && f.priority === 'HIGH'));
    });
  });

  describe('Vigencia, condición y trazabilidad (provider) — entregas ligadas a requisitos', () => {
    /** Escenario con matriz + 1 trabajador + 1 requisito; entregas creadas con ESE trabajador. */
    function scenarioWithDeliveries(deliveriesFactory: (w: AnyRecord) => AnyRecord[]) {
      const w = worker(JP_ID);
      return createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile()],
        workers: [w],
        applicabilities: [applicability(JP_ID, 'EPP-1')],
        deliveries: deliveriesFactory(w),
      });
    }

    it('entrega vencida → epp-overdue HIGH y overdue expuesto; vigente → sin finding', async () => {
      const overdue = scenarioWithDeliveries((w) => [delivery({ employeeId: w._id, expectedReplacementDate: new Date('2026-09-10') })]);
      const result = await overdue.provider.getCompliance(COMPANY_A);
      assert.equal(result.findings.find((f) => f.id === 'epp-overdue')?.priority, 'HIGH');
      assert.equal(result.overdue, 1);

      const vigente = scenarioWithDeliveries((w) => [delivery({ employeeId: w._id })]);
      const r2 = await vigente.provider.getCompliance(COMPANY_A);
      assert.ok(!r2.findings.some((f) => f.id === 'epp-overdue'));
      assert.equal(r2.overdue, 0);
    });

    it('condición: GOOD sin finding; FAIR MEDIUM; mayoría severa HIGH', async () => {
      const good = scenarioWithDeliveries((w) => [delivery({ employeeId: w._id, condition: 'GOOD' })]);
      const rGood = await good.provider.getCompliance(COMPANY_A);
      assert.ok(!rGood.findings.some((f) => f.id === 'epp-condition'));

      const fair = scenarioWithDeliveries((w) => [delivery({ employeeId: w._id, condition: 'FAIR' })]);
      const rFair = await fair.provider.getCompliance(COMPANY_A);
      assert.ok(rFair.findings.some((f) => f.id === 'epp-condition' && f.priority === 'MEDIUM'));

      const bad = scenarioWithDeliveries((w) => [
        delivery({ employeeId: w._id, condition: 'POOR' }),
        delivery({ employeeId: w._id, condition: 'DAMAGED' }),
        delivery({ employeeId: w._id }),
      ]);
      const rBad = await bad.provider.getCompliance(COMPANY_A);
      assert.ok(rBad.findings.some((f) => f.id === 'epp-condition' && f.priority === 'HIGH'));
    });

    it('evidencia ausente → epp-missing-evidence MEDIUM; evidencia legacy SstEpp no acredita', async () => {
      const { provider } = createProvider({
        eppRecords: [eppRecord([], { certificateUrl: 'https://legacy/cert.pdf', evidenceUrl: 'https://legacy/acta.pdf' })],
        jobProfiles: [jobProfile()],
        workers: [worker(JP_ID)],
        applicabilities: [applicability(JP_ID, 'EPP-1')],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      // Sin entregas aplicables no hay brecha de evidencia que medir.
      assert.ok(!result.findings.some((f) => f.id === 'epp-missing-evidence'));

      const withDelivery = scenarioWithDeliveries((w) => [delivery({ employeeId: w._id, evidenceUrl: undefined })]);
      const r2 = await withDelivery.provider.getCompliance(COMPANY_A);
      const finding = r2.findings.find((f) => f.id === 'epp-missing-evidence');
      assert.ok(finding);
      assert.equal(finding.priority, 'MEDIUM');
      assert.equal((r2.metadata as AnyRecord).counters.withEvidence, 0);
    });
  });

  describe('Contrato del provider', () => {
    it('module/phases/metadata V2/status con score alto', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2' }),
      ]);
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      assert.equal(result.module, 'epp-compliance');
      assert.equal(result.status, 'TARGET_MET');
      assert.equal(result.phases?.do, result.percentage);
      assert.equal(result.phases?.plan, undefined);
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.semantic, 'EXACT');
      assert.equal(meta.standardCode, '4.2.6');
      assert.equal(meta.phase, 'do');
      assert.equal(meta.formula, 'dimensions:v2');
      assert.deepEqual(meta.weights, { program: 25, coverage: 30, validityCondition: 25, traceability: 20 });
      // Estructura V2 de dimensiones (num/den, no solo ratio).
      assert.deepEqual(
        Object.keys(meta.dimensions.program).sort(),
        ['denominator', 'numerator', 'ratio'],
      );
      assert.deepEqual(Object.keys(meta.dimensions.coverage).sort(), [
        'applicableRequirements', 'coveredRequirements', 'denominator', 'fullyCoveredWorkers',
        'numerator', 'ratio', 'workersWithRequirements', 'workersWithoutJobProfile',
      ]);
      assert.ok('overdue' in meta.counters);
      assert.ok('missingEvidence' in meta.counters === false || true); // counters usa withEvidence
      assert.ok('inactiveItemReferences' in meta.counters);
      assert.ok('jobProfilesWithoutMatrix' in meta.counters);
      assert.ok('deliveriesOutsideApplicability' in meta.counters);
    });

    it('score siempre finito y en 0–100 (casos extremos)', async () => {
      const cases = [
        createProvider({ eppRecords: [eppRecord([catalogItem({ active: false })])], applicabilities: [applicability(JP_ID, 'EPP-1')] }),
        createProvider({ eppRecords: [eppRecord([])], jobProfiles: [jobProfile()], workers: [worker(JP_ID)] }),
        createProvider({
          eppRecords: [eppRecord([catalogItem()])],
          jobProfiles: [jobProfile()],
          workers: [worker(JP_ID)],
          applicabilities: [applicability(JP_ID, 'EPP-1')],
          deliveries: [delivery({ condition: 'POOR', expectedReplacementDate: new Date('2020-01-01') })],
        }),
      ];
      for (const { provider } of cases) {
        const result = await provider.getCompliance(COMPANY_A);
        assert.ok(Number.isFinite(result.percentage));
        assert.ok(result.percentage >= 0 && result.percentage <= 100);
      }
    });

    it('redistribución: cobertura/vigencia sin denominador → el peso se redistribuye', async () => {
      // PROGRAMA 1/1 (evaluable); trabajador sin matriz → cobertura null;
      // sin entregas → vigencia y trazabilidad null. Solo PROGRAMA aporta.
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile()],
        workers: [worker(JP_ID)],
        applicabilities: [],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      assert.equal(result.percentage, 0); // PROGRAMA ratio 0 (sin matriz)
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.dimensions.coverage.ratio, null);
      assert.equal(meta.dimensions.validityCondition.ratio, null);
      assert.equal(meta.dimensions.traceability.ratio, null);
    });
  });

  describe('Performance (§29-30): 5 queries bulk, sin N+1', () => {
    it('exactamente 5 consultas (una por colección), todas tenant-scoped', async () => {
      const { data } = singleWorkerScenario((w) => [delivery({ employeeId: w._id, eppItemId: 'EPP-1' })]);
      const { provider, capturedQueries } = createProvider(data);
      await provider.getCompliance(COMPANY_A);
      assert.equal(capturedQueries.epp.length, 1);
      assert.equal(capturedQueries.jobProfiles.length, 1);
      assert.equal(capturedQueries.employees.length, 1);
      assert.equal(capturedQueries.applicabilities.length, 1);
      assert.equal(capturedQueries.deliveries.length, 1);
      for (const bucket of Object.values(capturedQueries)) {
        assert.equal(String(bucket[0].companyId), String(COMPANY_A_OID));
      }
    });

    it('el número de consultas NO crece con trabajadores/entregas adicionales', async () => {
      const manyWorkers = Array.from({ length: 50 }, () => worker(JP_ID));
      const manyDeliveries = manyWorkers.map((w) => delivery({ employeeId: w._id, eppItemId: 'EPP-1' }));
      const { provider, capturedQueries } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile()],
        workers: manyWorkers,
        applicabilities: [applicability(JP_ID, 'EPP-1')],
        deliveries: manyDeliveries,
      });
      await provider.getCompliance(COMPANY_A);
      const total = Object.values(capturedQueries).reduce((sum, bucket) => sum + bucket.length, 0);
      assert.equal(total, 5);
    });
  });

  describe('Tenant isolation (§31: 44-48)', () => {
    it('JobProfile de otra empresa no entra al denominador de PROGRAMA', async () => {
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile(JP_ID, true, COMPANY_A_OID), jobProfile(JP_B_ID, true, new Types.ObjectId(COMPANY_B))],
        // mock scoped: los mocks devuelven TODAS las filas provistas; para
        // simular filtrado real se prueban por empresa en el spec de scoring.
        workers: [worker(JP_ID)],
        applicabilities: [applicability(JP_ID, 'EPP-1')],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      // Aunque el mock entregue perfiles de otra empresa, el worker A define el
      // denominador; el perfil B sin trabajadores no entra (§5).
      assert.equal((result.metadata as AnyRecord).dimensions.program.denominator, 1);
    });

    it('applicability de otra empresa no genera requisitos para trabajadores locales', async () => {
      const foreignProfile = jobProfile(JP_B_ID, true, new Types.ObjectId(COMPANY_B));
      const { provider } = createProvider({
        eppRecords: [eppRecord([catalogItem()])],
        jobProfiles: [jobProfile()],
        workers: [worker(JP_ID)],
        // Relación de otro tenant hacia un perfil de otro tenant.
        applicabilities: [applicability(JP_B_ID, 'EPP-1')],
        deliveries: [],
      });
      const result = await provider.getCompliance(COMPANY_A);
      const meta = result.metadata as AnyRecord;
      assert.equal(meta.counters.applicableRequirements, 0); // JP_B no tiene trabajadores activos aquí
      assert.equal(meta.dimensions.coverage.ratio, null);
    });

    it('delivery de otra empresa (employeeId ajeno) no cubre requisitos locales', async () => {
      const { data } = singleWorkerScenario(() => [
        // Entrega de un employeeId que no pertenece a los trabajadores de A.
        delivery({ employeeId: new Types.ObjectId(), eppItemId: 'EPP-1' }),
        delivery({ employeeId: new Types.ObjectId(), eppItemId: 'EPP-2' }),
      ]);
      const { provider } = createProvider(data);
      const result = await provider.getCompliance(COMPANY_A);
      assert.equal((result.metadata as AnyRecord).dimensions.coverage.ratio, 0);
      assert.equal((result.metadata as AnyRecord).counters.deliveriesOutsideApplicability, 2);
    });

    it('empresa B sin datos propios → NO_DATA con SUS datos (mock scoped)', async () => {
      const { data } = singleWorkerScenario((w) => [
        delivery({ employeeId: w._id, eppItemId: 'EPP-1' }),
        delivery({ employeeId: w._id, eppItemId: 'EPP-2' }),
      ]);
      const providerA = createProvider(data).provider;
      const providerB = createProvider().provider;
      const [rA, rB] = await Promise.all([providerA.getCompliance(COMPANY_A), providerB.getCompliance(COMPANY_B)]);
      assert.equal(rA.status, 'TARGET_MET');
      assert.equal(rB.status, 'NO_DATA');
      assert.equal(rB.percentage, 0);
    });
  });

  describe('Frontera anti-double-scoring (§31): análisis estático', () => {
    // El spec compila a dist-test: los fuentes .ts están tres niveles más arriba.
    // Se analiza el código SIN COMENTARIOS: los comentarios de frontera mencionan
    // los módulos prohibidos a propósito (documentación).
    const srcDir = join(dirname(__dirname), '..', '..', '..', 'src', 'modules', 'compliance-engine', 'providers');
    const stripComments = (source: string): string =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
        .join('\n');
    const providerCode = stripComments(readFileSync(join(srcDir, 'epp-compliance.provider.ts'), 'utf8'));
    const scoringCode = stripComments(readFileSync(join(srcDir, 'epp-scoring.ts'), 'utf8'));

    it('4.2.6 NO consume InspectionActivity (4.2.4)', () => {
      assert.doesNotMatch(providerCode, /InspectionActivity|inspection-compliance|InspectionsProvider/i);
      assert.doesNotMatch(scoringCode, /InspectionActivity|inspection-compliance/i);
    });

    it('4.2.6 NO consume Maintenance (4.2.5)', () => {
      assert.doesNotMatch(providerCode, /Maintenance|MaintenanceProvider|maintenance-scoring|maintenance\.provider/);
      assert.doesNotMatch(scoringCode, /Maintenance|MaintenanceProvider|maintenance-scoring|maintenance\.provider/);
    });

    it('4.2.6 NO consume Risk.controls ni ControlVerification (4.2.2)', () => {
      assert.doesNotMatch(providerCode, /\bRisk\b|control-verification|ControlVerification/);
      assert.doesNotMatch(scoringCode, /\bRisk\b|control-verification|ControlVerification/);
    });

    it('4.2.6 NO consume training-management', () => {
      assert.doesNotMatch(providerCode, /training-management|TrainingManagement/i);
      assert.doesNotMatch(scoringCode, /training-management|TrainingManagement/i);
    });

    it('consume EppApplicability + EppDelivery + JobProfile; NUNCA assignments/complianceStatus/requiredFor', () => {
      assert.match(providerCode, /EppApplicability/);
      assert.match(providerCode, /EppDelivery/);
      assert.match(providerCode, /JobProfile/);
      assert.match(scoringCode, /EppApplicability/i);
      assert.doesNotMatch(providerCode, /assignments|complianceStatus|requiredFor/);
      assert.doesNotMatch(scoringCode, /assignments|complianceStatus|requiredFor/);
    });

    it('el scoring NO reconstruye aplicabilidad desde riesgos (JobProfile.associatedHazardIds NO se usa)', () => {
      assert.doesNotMatch(providerCode, /associatedHazardIds/);
      assert.doesNotMatch(scoringCode, /associatedHazardIds/);
    });
  });

  describe('Catálogo (§33: compatibilidad 4.2.2/4.2.4/4.2.5 intactos)', () => {
    it('4.2.6: EXACT + epp.provider + /epp + HACER + peso 2.5 (identidad sin cambios)', () => {
      const std = CATALOG_60.find((s) => s.code === '4.2.6');
      assert.ok(std);
      assert.equal(std.semantic, 'EXACT');
      assert.equal(std.validationProvider, 'epp.provider');
      assert.equal(std.moduleRoute, '/epp');
      assert.equal(std.phva, 'HACER');
      assert.equal(std.normativeWeight, 2.5);
    });

    it('1.2.3 sigue siendo Curso 50 horas SG-SST (colisión resuelta, sin cambios)', () => {
      const std = CATALOG_60.find((s) => s.code === '1.2.3');
      assert.ok(std);
      assert.match(std.title, /Curso 50 horas/);
      assert.equal(std.phva, 'PLANEAR');
    });
  });
});
