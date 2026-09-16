import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Types } from 'mongoose';
import { WorkplaceSanitaryConditionsProvider } from './workplace-sanitary-conditions.provider';
import {
  SanitaryConditionResult,
  SanitaryConditionStatus,
  SanitaryConditionType,
  VerificationFrequency,
  WorkplaceSanitaryCondition,
} from '../../workplace-sanitary-conditions/schemas/workplace-sanitary-condition.schema';

/**
 * FASE 34B — Tests del provider 3.1.8 (CASOS A–G del prompt de fase).
 *
 * El provider consume EXCLUSIVAMENTE WorkplaceSanitaryCondition. NO consume
 * InspectionActivity (4.2.4), Maintenance (4.2.5), EnvironmentalMeasurement
 * (4.1.4), HazardousSubstance (4.1.3), HealthPromotionActivity (3.1.2/3.1.7),
 * WorkRestriction, JobProfile, Risk ni DocumentMaster (CASO E/F/G y las
 * pruebas anti-double-scoring lo demuestran estructuralmente).
 */

const companyIdA = new Types.ObjectId('507f1f77bcf86cd799439011');
const companyIdB = new Types.ObjectId('507f1f77bcf86cd799439099');

/** Fecha de referencia para las pruebas de vigencia (C4): 2026-09-01. */
const NOW_MS = new Date('2026-09-01T12:00:00Z').getTime();

function recentDate(daysAgo: number): Date {
  return new Date(NOW_MS - daysAgo * 24 * 60 * 60 * 1000);
}

/** Construye un WorkplaceSanitaryCondition válido por defecto (tenant A). */
function buildCondition(
  overrides: Partial<WorkplaceSanitaryCondition> & { _id?: Types.ObjectId } = {},
): WorkplaceSanitaryCondition {
  const base = {
    _id: new Types.ObjectId(),
    companyId: companyIdA,
    conditionType: SanitaryConditionType.POTABLE_WATER,
    code: 'AGUA-001',
    description: 'Verificación de potabilidad del agua',
    location: 'Sede principal — cocina',
    status: SanitaryConditionStatus.OPERATIONAL,
    conditionResult: SanitaryConditionResult.APT,
    lastVerificationDate: recentDate(10),
    nextVerificationDate: recentDate(-355),
    verificationFrequency: VerificationFrequency.ANNUAL,
    responsible: 'Coordinadora SST',
    evidenceUrl: 'lab.example.com/informe-2026',
    observations: 'Tanque lavado trimestralmente.',
    active: true,
    createdBy: 'uid-owner',
    updatedBy: 'uid-owner',
  } as unknown as WorkplaceSanitaryCondition;
  return { ...base, ...overrides };
}

function buildProvider(conditions: WorkplaceSanitaryCondition[]) {
  const find = mock.fn((_filter?: Record<string, unknown>) => ({
    sort: () => ({
      lean: async () =>
        // Emula el sort del contrato real: lastVerificationDate desc.
        [...conditions].sort(
          (a, b) =>
            new Date(b.lastVerificationDate).getTime() -
            new Date(a.lastVerificationDate).getTime(),
        ),
    }),
  }));

  const provider = new WorkplaceSanitaryConditionsProvider({ find } as never);
  return { provider, find };
}

describe('WorkplaceSanitaryConditionsProvider — 3.1.8 (FASE 34B)', () => {
  it('CASO 0: sin registros → NO_DATA (0%, finding de ausencia)', async () => {
    const { provider, find } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.module, 'workplace-sanitary-conditions');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.ok(result.findings.some((f) => f.id === 'workplace-sanitary-no-records'));
    // El query del provider es tenant-scoped (frontera estructural).
    const filter = find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(
      String((filter.companyId as Types.ObjectId).toHexString()),
      companyIdA.toHexString(),
    );
  });

  it('CASO A: solo POTABLE_WATER → C1 parcial (1/3), nunca 100%', async () => {
    const { provider } = buildProvider([buildCondition()]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 1/3 → 8.33; C2 = 1 → 25; C3 = 1 → 25; C4 = 1 → 25 → 83.33 → 83
    assert.equal(result.percentage, 83);
    assert.ok(result.findings.some((f) => f.id === 'workplace-sanitary-missing-types'));
    assert.equal(result.status, 'PARTIAL');
  });

  it('CASO B: tres tipos, SANITARY_SERVICE OUT_OF_SERVICE → C1 cubierto, C2 < 100%', async () => {
    const { provider } = buildProvider([
      buildCondition(),
      buildCondition({
        conditionType: SanitaryConditionType.SANITARY_SERVICE,
        code: 'BAÑO-001',
        status: SanitaryConditionStatus.OUT_OF_SERVICE,
        conditionResult: SanitaryConditionResult.NOT_APT,
      }),
      buildCondition({ conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT, code: 'BASURA-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 3/3 → 25; C2 = (1 + 0 + 1)/3 → 16.67; C3 = 25; C4 = 25 → 91.67 → 92
    assert.equal(result.percentage, 92);
    assert.equal(result.status, 'NON_COMPLIANT');
    assert.ok(result.findings.some((f) => f.id === 'workplace-sanitary-deficient-conditions'));
  });

  it('CASO C: tres tipos sin responsable/evidencia en uno → C3 < 100%', async () => {
    const { provider } = buildProvider([
      buildCondition(),
      buildCondition({
        conditionType: SanitaryConditionType.SANITARY_SERVICE,
        code: 'BAÑO-001',
        evidenceUrl: undefined,
      }),
      buildCondition({ conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT, code: 'BASURA-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 25; C2 = 25; C3 = 2/3 → 16.67; C4 = 25 → 91.67 → 92 (≥90 → TARGET_MET)
    assert.equal(result.percentage, 92);
    assert.ok(result.findings.some((f) => f.id === 'workplace-sanitary-traceability-pending'));
  });

  it('CASO D: verificación antigua fuera de frecuencia → C4 < 100%', async () => {
    const { provider } = buildProvider([
      buildCondition({ lastVerificationDate: recentDate(400), nextVerificationDate: undefined }),
      buildCondition({
        conditionType: SanitaryConditionType.SANITARY_SERVICE,
        code: 'BAÑO-001',
      }),
      buildCondition({ conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT, code: 'BASURA-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 25; C2 = 25; C3 = 25; C4 = 2/3 → 16.67 → 91.67 → 92
    assert.equal(result.percentage, 92);
    assert.ok(result.findings.some((f) => f.id === 'workplace-sanitary-verification-overdue'));
  });

  it('CASO E: solo un documento en otra colección (DocumentMaster) → sin evidencia, 0%', async () => {
    // Estructural: el provider SOLO acepta el modelo WorkplaceSanitaryCondition
    // en su constructor; no existe vía para inyectar DocumentMaster. Sin
    // registros propios → 0% aunque exista un PDF en DocumentMaster.
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('CASO F: InspectionActivity sobre baños NO es evidencia de 3.1.8 (structural)', async () => {
    // El constructor del provider NO acepta InspectionActivity. Una inspección
    // en otra colección jamás altera el score: sin registros propios → 0%.
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
  });

  it('CASO G: EnvironmentalMeasurement de calidad del aire NO es evidencia (structural)', async () => {
    // Igual que CASO F: EnvironmentalMeasurement no es consumible por este
    // provider. Sin registros propios → 0%.
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
  });

  it('COMPLIANT: tres tipos conformes, trazables y vigentes → 100% TARGET_MET', async () => {
    const { provider } = buildProvider([
      buildCondition(),
      buildCondition({ conditionType: SanitaryConditionType.SANITARY_SERVICE, code: 'BAÑO-001' }),
      buildCondition({ conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT, code: 'BASURA-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.phases?.do, 100);
    assert.equal(result.completed, 3);
    assert.equal(result.pending, 0);
  });

  it('REGISTROS INACTIVOS: no son evidencia vigente (C1 no los cuenta)', async () => {
    const { provider } = buildProvider([
      buildCondition({ active: false }),
      buildCondition({ active: false }),
      buildCondition({ active: false }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('ÚLTIMO REGISTRO: el último por fecha es el evaluado por componente', async () => {
    const { provider } = buildProvider([
      // Más antiguo → no debe ser el evaluado.
      buildCondition({ lastVerificationDate: recentDate(100), status: SanitaryConditionStatus.OUT_OF_SERVICE }),
      // Más reciente → el evaluado (OPERATIONAL/APT).
      buildCondition({ lastVerificationDate: recentDate(5) }),
      buildCondition({ conditionType: SanitaryConditionType.SANITARY_SERVICE, code: 'BAÑO-001' }),
      buildCondition({ conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT, code: 'BASURA-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // Si evaluara el antiguo, C2 < 100 y status NON_COMPLIANT.
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
  });

  it('DEFICIENT: sigue siendo evidencia (C1/C3), pero C2 lo penaliza (0.5)', async () => {
    const { provider } = buildProvider([
      buildCondition({ status: SanitaryConditionStatus.DEFICIENT }),
      buildCondition({ conditionType: SanitaryConditionType.SANITARY_SERVICE, code: 'BAÑO-001' }),
      buildCondition({ conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT, code: 'BASURA-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 25; C2 = (0.5 + 1 + 1)/3 → 20.83; C3 = 25; C4 = 25 → 95.83 → 96
    assert.equal(result.percentage, 96);
    // DEFICIENT NO es NON_COMPLIANT explícito (solo NOT_APT/OUT_OF_SERVICE lo son).
    assert.equal(result.status, 'TARGET_MET');
  });

  it('nextVerificationDate vencida penaliza C4 aunque la frecuencia no lo haga', async () => {
    const { provider } = buildProvider([
      buildCondition({
        lastVerificationDate: recentDate(5),
        nextVerificationDate: recentDate(1), // vencida ayer
      }),
      buildCondition({ conditionType: SanitaryConditionType.SANITARY_SERVICE, code: 'BAÑO-001' }),
      buildCondition({ conditionType: SanitaryConditionType.GARBAGE_MANAGEMENT, code: 'BASURA-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C4 = 2/3 → 16.67 → total 91.67 → 92
    assert.equal(result.percentage, 92);
    assert.ok(result.findings.some((f) => f.id === 'workplace-sanitary-verification-overdue'));
    assert.equal(result.overdue, 1);
  });

  it('TENANT: el query del provider filtra por companyId del tenant (A ≠ B)', async () => {
    const { provider, find } = buildProvider([]);
    await provider.getCompliance(companyIdA.toHexString());

    const filter = find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(
      (filter.companyId as Types.ObjectId).toHexString(),
      companyIdA.toHexString(),
    );
    assert.notEqual(
      (filter.companyId as Types.ObjectId).toHexString(),
      companyIdB.toHexString(),
    );
  });

  it('ANTI-DOUBLE-SCORING: el provider hace exactamente UNA consulta a SU colección', async () => {
    const { provider, find } = buildProvider([buildCondition()]);
    await provider.getCompliance(companyIdA.toHexString());

    // ÚNICA llamada al modelo propio; no hay otros modelos inyectados que
    // puedan ser consultados (InspectionActivity, EnvironmentalMeasurement,
    // HazardousSubstance, HealthPromotionActivity, DocumentMaster, etc.).
    assert.equal(find.mock.calls.length, 1);
  });

  it('companyId inválido → NO_DATA estructurado', async () => {
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance('no-es-objectid');

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });

  it('metadata: standard 3.1.8, phase do, semantic EXACT, module workplace-sanitary-conditions', () => {
    const { provider } = buildProvider([]);
    const meta = provider.metadata;
    assert.equal(meta.standard, '3.1.8');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.module, 'workplace-sanitary-conditions');
  });
});
