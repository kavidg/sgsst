import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Types } from 'mongoose';
import { WasteManagementProvider } from './waste-management.provider';
import {
  WasteDisposalFrequency,
  WasteManagementRecord,
  WasteManagementStatus,
  WasteType,
} from '../../waste-management/schemas/waste-management-record.schema';

/**
 * FASE 34C — Tests del provider 3.1.9 (CASOS A–M del prompt de fase).
 *
 * El provider consume EXCLUSIVAMENTE WasteManagementRecord (+ la declaración
 * WasteTypeDeclaration como metadata C1). NO consume HazardousSubstance
 * (4.1.3), EnvironmentalMeasurement (4.1.4), InspectionActivity (4.2.4),
 * Maintenance (4.2.5), WorkplaceSanitaryCondition (3.1.8),
 * HealthPromotionActivity, WorkRestriction, JobProfile, Risk ni
 * DocumentMaster (CASOS E/F/G/H y las pruebas anti-double-scoring lo
 * demuestran estructuralmente).
 */

const companyIdA = new Types.ObjectId('507f1f77bcf86cd799439011');
const companyIdB = new Types.ObjectId('507f1f77bcf86cd799439099');

/** Fecha de referencia para las pruebas de vigencia (C4): 2026-09-01. */
const NOW_MS = new Date('2026-09-01T12:00:00Z').getTime();

function recentDate(daysAgo: number): Date {
  return new Date(NOW_MS - daysAgo * 24 * 60 * 60 * 1000);
}

/** Construye un registro de residuo completo y gestionado (tenant A). */
function buildRecord(
  overrides: Partial<WasteManagementRecord> & { _id?: Types.ObjectId } = {},
): WasteManagementRecord {
  const base = {
    _id: new Types.ObjectId(),
    companyId: companyIdA,
    code: 'RES-SOL-001',
    wasteType: WasteType.SOLID,
    hazardous: false,
    source: 'Talleres',
    generationDescription: 'Aceites usados y trapos contaminados',
    handlingMethod: 'Segregación en contenedores etiquetados',
    disposalMethod: 'Entrega a gestor autorizado',
    disposalDestination: 'Gestor XYZ — RMSD-2026-014',
    disposalFrequency: WasteDisposalFrequency.QUARTERLY,
    lastDisposalDate: recentDate(30),
    nextDisposalDate: recentDate(-62),
    responsible: 'Coordinadora SST',
    evidenceUrl: 'gestor-xyz.com/manifiesto-2026-014',
    observations: '',
    status: WasteManagementStatus.ACTIVE,
    active: true,
    createdBy: 'uid-owner',
    updatedBy: 'uid-owner',
  } as unknown as WasteManagementRecord;
  return { ...base, ...overrides };
}

function buildProvider(
  records: WasteManagementRecord[],
  declaration: { declaredWasteTypes?: string[] } | null = null,
) {
  const find = mock.fn((_filter?: Record<string, unknown>) => ({
    sort: () => ({
      lean: async () =>
        // Emula el sort del contrato real: última disposición primero.
        [...records].sort(
          (a, b) =>
            new Date(b.lastDisposalDate ?? 0).getTime() -
            new Date(a.lastDisposalDate ?? 0).getTime(),
        ),
    }),
  }));

  const declarationFindOne = mock.fn((_filter?: Record<string, unknown>) => ({
    lean: async () => declaration,
  }));

  const provider = new WasteManagementProvider(
    { find } as never,
    { findOne: declarationFindOne } as never,
  );
  return { provider, find, declarationFindOne };
}

/** Registro completo gestionado → C1=25, C2=25, C3=25, C4=25 → 100 por tipo cubierto. */
describe('WasteManagementProvider — 3.1.9 (FASE 34C)', () => {
  it('CASO A: sin registros → NO_DATA (0%, finding de ausencia)', async () => {
    const { provider, find } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.module, 'waste-management');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.ok(result.findings.some((f) => f.id === 'waste-management-no-records'));
    // El query del provider es tenant-scoped (frontera estructural).
    const filter = find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(
      String((filter.companyId as Types.ObjectId).toHexString()),
      companyIdA.toHexString(),
    );
  });

  it('CASO B: solo SOLID sin declaración → cobertura mínima = lo que la empresa registra (no se penaliza lo no generado)', async () => {
    const { provider } = buildProvider([buildRecord()]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // Sin declaración, el denominador C1 son los tipos cubiertos (SOLID):
    // C1 = 25, C2 = C3 = C4 = 25 → 100.
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.ok(!result.findings.some((f) => f.id === 'waste-management-missing-types'));
  });

  it('CASO B2: solo SOLID con declaración [SOLID, LIQUID] → C1 = 1/2 y finding de cobertura', async () => {
    const { provider } = buildProvider([buildRecord()], {
      declaredWasteTypes: [WasteType.SOLID, WasteType.LIQUID],
    });
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 1/2 → 12.5; C2 = C3 = C4 = 25 → 87.5 → 88
    assert.equal(result.percentage, 88);
    assert.equal(result.status, 'PARTIAL');
  });

  it('CASO C: residuo PLANNED sin disposalMethod → C2/C3/C4 = 0, NUNCA 100%', async () => {
    const { provider } = buildProvider([
      buildRecord({
        status: WasteManagementStatus.PLANNED,
        disposalMethod: undefined,
        disposalDestination: undefined,
        lastDisposalDate: undefined,
        nextDisposalDate: undefined,
        evidenceUrl: undefined,
      }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 25 (identificado); C2 = C3 = C4 = 0 → 25
    assert.equal(result.percentage, 25);
    assert.ok(result.findings.some((f) => f.id === 'waste-management-no-managed-records'));
    assert.equal(result.status, 'PARTIAL');
  });

  it('CASO D: disposalMethod pero sin evidencia → C3 incompleto', async () => {
    const { provider } = buildProvider([
      buildRecord({ evidenceUrl: undefined }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 25; C2 = 25; C3 = 0 (sin evidencia); C4 = 25 → 75
    assert.equal(result.percentage, 75);
    assert.ok(result.findings.some((f) => f.id === 'waste-management-traceability-pending'));
    assert.equal(result.status, 'PARTIAL');
  });

  it('CASO E: solo un documento en DocumentMaster → NO SCORE (structural)', async () => {
    // El constructor SOLO acepta WasteManagementRecord + WasteTypeDeclaration;
    // no existe vía para inyectar DocumentMaster. Sin registros → 0%.
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('CASO F: HazardousSubstance solamente → NO SCORE FOR 3.1.9 (structural)', async () => {
    // El provider NO puede consumir HazardousSubstance: sin registros propios
    // de residuos → 0% aunque existan sustancias peligrosas en otra colección.
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('CASO G: EnvironmentalMeasurement AIR_QUALITY → NO SCORE FOR 3.1.9 (structural)', async () => {
    // Una medición de calidad del aire NO es disposición de residuos
    // gaseosos: el provider jamás lee EnvironmentalMeasurement.
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
  });

  it('CASO H: InspectionActivity → NO SCORE FOR 3.1.9 (structural)', async () => {
    // Una inspección NO es disposición: el provider jamás lee InspectionActivity.
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
  });

  it('CASO I: disposición vencida (fuera de frecuencia) → C4 penalizado + finding', async () => {
    const { provider } = buildProvider([
      buildRecord({ lastDisposalDate: recentDate(200) }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // Frecuencia QUARTERLY (92 días): 200 días → vencida. C1=25, C2=25, C3=25, C4=0 → 75
    assert.equal(result.percentage, 75);
    assert.ok(result.findings.some((f) => f.id === 'waste-management-disposal-overdue'));
    assert.equal(result.overdue, 1);
    assert.equal(result.status, 'NON_COMPLIANT');
  });

  it('CASO I2: nextDisposalDate vencida → penaliza aunque la frecuencia no lo haga', async () => {
    const { provider } = buildProvider([
      buildRecord({ lastDisposalDate: recentDate(5), nextDisposalDate: recentDate(1) }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C4 = 0 → 75
    assert.equal(result.percentage, 75);
    assert.ok(result.findings.some((f) => f.id === 'waste-management-disposal-overdue'));
  });

  it('CASO J: disposición completa → puede alcanzar cumplimiento técnico (100%)', async () => {
    const { provider } = buildProvider([
      buildRecord(),
      buildRecord({ wasteType: WasteType.LIQUID, code: 'RES-LIQ-001' }),
      buildRecord({ wasteType: WasteType.GASEOUS, code: 'RES-GAS-001' }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.phases?.do, 100);
    assert.equal(result.completed, 3);
    assert.equal(result.pending, 0);
  });

  it('CASO K: cross tenant — el query del provider filtra por companyId (A ≠ B)', async () => {
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

  it('CASO L: hazardous = true NO produce cumplimiento automático', async () => {
    const { provider } = buildProvider([
      buildRecord({ hazardous: true, disposalMethod: undefined, disposalDestination: undefined }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // Identificado (C1=25) pero sin disposición (C2=C3=0) ni fecha (C4=0) → 25
    assert.equal(result.percentage, 25);
    assert.ok(
      result.findings.some((f) => f.id === 'waste-management-hazardous-not-evidence'),
      'finding específico de hazardous sin disposición',
    );
  });

  it('CASO L2: hazardous = true CON gestión completa sí puntúa (sin penalización extra)', async () => {
    const { provider } = buildProvider([buildRecord({ hazardous: true })]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 100);
    assert.ok(!result.findings.some((f) => f.id === 'waste-management-hazardous-not-evidence'));
  });

  it('CASO M: registros inactivos no contribuyen al score vigente', async () => {
    const { provider } = buildProvider([
      buildRecord({ active: false }),
      buildRecord({ active: false }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('CASO M2: SUSPENDED no cuenta como gestión demostrada (solo C1)', async () => {
    const { provider } = buildProvider([
      buildRecord({ status: WasteManagementStatus.SUSPENDED }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 25; C2 = C3 = C4 = 0 → 25
    assert.equal(result.percentage, 25);
    assert.ok(result.findings.some((f) => f.id === 'waste-management-no-managed-records'));
  });

  it('C2 parcial: manejo + disposición sin destino → 0.5 del registro', async () => {
    const { provider } = buildProvider([
      buildRecord({ disposalDestination: undefined }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1=25; C2=12.5; C3=0 (sin destino); C4=25 (disposición vigente) → 62.5 → 63
    assert.equal(result.percentage, 63);
  });

  it('ACTIVE sin disposalMethod (dato existente) → NON_COMPLIANT con finding', async () => {
    const { provider } = buildProvider([
      buildRecord({ disposalMethod: undefined, disposalDestination: undefined }),
    ]);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.ok(result.findings.some((f) => f.id === 'waste-management-disposal-method-pending'));
    assert.equal(result.status, 'NON_COMPLIANT');
  });

  it('ANTI-DOUBLE-SCORING: el provider hace exactamente UNA consulta a SU colección (+1 declaración)', async () => {
    const { provider, find, declarationFindOne } = buildProvider([buildRecord()]);
    await provider.getCompliance(companyIdA.toHexString());

    // ÚNICAS llamadas: WasteManagementRecord + WasteTypeDeclaration. Ningún
    // otro modelo (HazardousSubstance, EnvironmentalMeasurement,
    // InspectionActivity, DocumentMaster, WorkplaceSanitaryCondition…).
    assert.equal(find.mock.calls.length, 1);
    assert.equal(declarationFindOne.mock.calls.length, 1);
  });

  it('la declaración también es tenant-scoped', async () => {
    const { provider, declarationFindOne } = buildProvider([buildRecord()]);
    await provider.getCompliance(companyIdA.toHexString());

    const filter = declarationFindOne.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(
      String((filter.companyId as Types.ObjectId).toHexString()),
      companyIdA.toHexString(),
    );
  });

  it('companyId inválido → NO_DATA estructurado', async () => {
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance('no-es-objectid');

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });

  it('metadata: standard 3.1.9, phase do, semantic EXACT, module waste-management', () => {
    const { provider } = buildProvider([]);
    const meta = provider.metadata;
    assert.equal(meta.standard, '3.1.9');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.module, 'waste-management');
  });
});
