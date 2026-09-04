import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { AbsenteeismProvider } from './absenteeism.provider';
import { AbsenteeismType } from '../../absenteeism/schemas/absenteeism.schema';
import { Types } from 'mongoose';

// ── Mock helpers ──

function createCompanyId() {
  return new Types.ObjectId('64b0000000000000000000a1');
}

function createUserId(suffix: string) {
  return new Types.ObjectId(`64b0000000000000000000${suffix}`);
}

function buildRecord(
  companyId: Types.ObjectId,
  userId: Types.ObjectId,
  overrides: {
    tipo?: AbsenteeismType;
    fechaInicio?: Date;
    fechaFin?: Date;
    dias?: number;
    descripcion?: string;
    soporte?: string;
  } = {},
) {
  const fechaInicio = overrides.fechaInicio ?? new Date('2026-06-15');
  const fechaFin = overrides.fechaFin ?? new Date('2026-06-20');
  return {
    _id: new Types.ObjectId(),
    companyId,
    userId,
    tipo: overrides.tipo ?? AbsenteeismType.ENFERMEDAD,
    fechaInicio,
    fechaFin,
    dias: overrides.dias ?? 5,
    descripcion: overrides.descripcion,
    soporte: overrides.soporte,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockModel(docs: unknown[]) {
  return {
    find: mock.fn(() => ({
      sort: mock.fn(() => ({
        exec: mock.fn(() => Promise.resolve(docs)),
      })),
    })),
  };
}

// ── Tests ──

describe('AbsenteeismProvider (3.2.1 · Registro de ausentismo)', () => {
  const companyId = createCompanyId();

  it('SUPPORTS-001: module es absenteeism', async () => {
    const model = createMockModel([]);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));
    assert.equal(result.module, 'absenteeism');
  });

  it('NO-DATA-001: Sin registros retorna NO_DATA', async () => {
    const model = createMockModel([]);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    assert.equal(result.module, 'absenteeism');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'absenteeism-no-data');
    assert.equal(result.findings[0].priority, 'HIGH');
    assert.equal((result.phases as Record<string, unknown>)?.do, 0);
  });

  it('NO-DATA-002: NO_DATA incluye mensaje descriptivo', async () => {
    const model = createMockModel([]);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    assert.ok(result.findings[0].description.includes('ausentismo'));
    assert.ok(result.findings[0].description.includes('3.2.1'));
  });

  it('RECORDS-001: Un solo registro válido', async () => {
    const userId = createUserId('01');
    const records = [
      buildRecord(companyId, userId, {
        tipo: AbsenteeismType.ENFERMEDAD,
        fechaInicio: new Date('2025-06-01'),
        fechaFin: new Date('2025-06-05'),
        dias: 5,
      }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    assert.ok(result.percentage > 0, `Expected > 0, got ${result.percentage}`);
    assert.equal(result.status, 'TARGET_NOT_MET');
    assert.equal(result.completed, 1);
    assert.equal(result.pending, 0);
  });

  it('RECORDS-002: Múltiples registros de diferentes tipos → alta clasificación', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { tipo: AbsenteeismType.ENFERMEDAD }),
      buildRecord(companyId, createUserId('02'), { tipo: AbsenteeismType.ACCIDENTE }),
      buildRecord(companyId, createUserId('03'), { tipo: AbsenteeismType.PERMISO }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    // classification: 3/3 = 100% → 30 points
    // volume: recent → 35 points
    // completeness: all complete → 20 points
    // temporal: 1 month → 0.5 * 15 = 7.5 → 8
    // total ≈ 35 + 30 + 20 + 8 = 93
    assert.ok(result.percentage >= 80, `Expected >= 80, got ${result.percentage}`);
    assert.equal(result.completed, 3);
  });

  it('CLASSIFICATION-001: Solo un tipo → finding de baja diversidad', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { tipo: AbsenteeismType.ENFERMEDAD }),
      buildRecord(companyId, createUserId('02'), { tipo: AbsenteeismType.ENFERMEDAD }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const diversityFinding = result.findings.find((f) => f.id === 'absenteeism-low-type-diversity');
    assert.ok(diversityFinding, 'Should have low-type-diversity finding');
  });

  it('CLASSIFICATION-002: Dos tipos → sin finding de baja diversidad', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { tipo: AbsenteeismType.ENFERMEDAD }),
      buildRecord(companyId, createUserId('02'), { tipo: AbsenteeismType.ACCIDENTE }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const diversityFinding = result.findings.find((f) => f.id === 'absenteeism-low-type-diversity');
    assert.equal(diversityFinding, undefined, 'Should not have low-type-diversity finding with 2 types');
  });

  it('COMPLETENESS-001: Registros completos → sin finding de incompletos', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), {
        tipo: AbsenteeismType.ENFERMEDAD,
        fechaInicio: new Date('2025-06-01'),
        fechaFin: new Date('2025-06-05'),
        dias: 5,
      }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const incompleteFinding = result.findings.find((f) => f.id === 'absenteeism-records-incomplete');
    assert.equal(incompleteFinding, undefined, 'Should not have incomplete finding for complete records');
  });

  it('COMPLETENESS-002: Registro sin días → finding de incompletos', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        companyId,
        userId: createUserId('01'),
        tipo: AbsenteeismType.ENFERMEDAD,
        fechaInicio: new Date('2025-06-01'),
        fechaFin: new Date('2025-06-05'),
        dias: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const incompleteFinding = result.findings.find((f) => f.id === 'absenteeism-records-incomplete');
    assert.ok(incompleteFinding, 'Should have incomplete finding for records without dias');
  });

  it('TEMPORAL-001: Registros en 3+ meses → cobertura temporal completa', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { fechaInicio: new Date('2025-01-15'), fechaFin: new Date('2025-01-20'), dias: 5 }),
      buildRecord(companyId, createUserId('02'), { fechaInicio: new Date('2025-03-10'), fechaFin: new Date('2025-03-15'), dias: 5 }),
      buildRecord(companyId, createUserId('03'), { fechaInicio: new Date('2025-06-01'), fechaFin: new Date('2025-06-05'), dias: 4 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const limitedFinding = result.findings.find((f) => f.id === 'absenteeism-limited-temporal-coverage');
    assert.equal(limitedFinding, undefined, 'Should not have limited-temporal-coverage finding with 3+ months');
  });

  it('TEMPORAL-002: Registros en 1 solo mes → finding de cobertura limitada', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { fechaInicio: new Date('2026-06-15'), fechaFin: new Date('2026-06-20'), dias: 5 }),
      buildRecord(companyId, createUserId('02'), { fechaInicio: new Date('2026-06-25'), fechaFin: new Date('2026-06-28'), dias: 5 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const limitedFinding = result.findings.find((f) => f.id === 'absenteeism-limited-temporal-coverage');
    assert.ok(limitedFinding, 'Should have limited-temporal-coverage finding with only 1 month');
  });

  it('RECENT-001: Registros recientes → sin finding de no-recent', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { fechaInicio: new Date(), fechaFin: new Date(), dias: 1 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const noRecentFinding = result.findings.find((f) => f.id === 'absenteeism-no-recent-records');
    assert.equal(noRecentFinding, undefined, 'Should not have no-recent-records finding with recent records');
  });

  it('RECENT-002: Solo registros antiguos → finding de no-recent', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), {
        fechaInicio: new Date('2023-01-15'),
        fechaFin: new Date('2023-01-20'),
        dias: 5,
      }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const noRecentFinding = result.findings.find((f) => f.id === 'absenteeism-no-recent-records');
    assert.ok(noRecentFinding, 'Should have no-recent-records finding with only old records');
  });

  it('TRENDS-001: Pocos datos → finding de datos insuficientes para tendencias', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { fechaInicio: new Date('2025-06-01'), fechaFin: new Date('2025-06-05'), dias: 5 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const trendsFinding = result.findings.find((f) => f.id === 'absenteeism-insufficient-trend-data');
    assert.ok(trendsFinding, 'Should have insufficient-trend-data finding with only 1 record');
  });

  it('TRENDS-002: Suficientes datos → sin finding de tendencias', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { fechaInicio: new Date('2025-01-15'), fechaFin: new Date('2025-01-20'), dias: 5 }),
      buildRecord(companyId, createUserId('02'), { fechaInicio: new Date('2025-02-10'), fechaFin: new Date('2025-02-15'), dias: 5 }),
      buildRecord(companyId, createUserId('03'), { fechaInicio: new Date('2025-03-01'), fechaFin: new Date('2025-03-05'), dias: 4 }),
      buildRecord(companyId, createUserId('04'), { fechaInicio: new Date('2025-04-10'), fechaFin: new Date('2025-04-15'), dias: 5 }),
      buildRecord(companyId, createUserId('05'), { fechaInicio: new Date('2025-05-01'), fechaFin: new Date('2025-05-05'), dias: 4 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    const trendsFinding = result.findings.find((f) => f.id === 'absenteeism-insufficient-trend-data');
    assert.equal(trendsFinding, undefined, 'Should not have insufficient-trend-data finding with 5+ records in 2+ months');
  });

  it('SCORING-001: Scoring completo con datos ideales', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { tipo: AbsenteeismType.ENFERMEDAD, fechaInicio: new Date('2026-01-15'), fechaFin: new Date('2026-01-20'), dias: 5 }),
      buildRecord(companyId, createUserId('02'), { tipo: AbsenteeismType.ACCIDENTE, fechaInicio: new Date('2026-02-10'), fechaFin: new Date('2026-02-15'), dias: 5 }),
      buildRecord(companyId, createUserId('03'), { tipo: AbsenteeismType.PERMISO, fechaInicio: new Date('2026-03-01'), fechaFin: new Date('2026-03-05'), dias: 4 }),
      buildRecord(companyId, createUserId('04'), { tipo: AbsenteeismType.ENFERMEDAD, fechaInicio: new Date('2026-04-10'), fechaFin: new Date('2026-04-15'), dias: 5 }),
      buildRecord(companyId, createUserId('05'), { tipo: AbsenteeismType.ACCIDENTE, fechaInicio: new Date('2026-05-01'), fechaFin: new Date('2026-05-05'), dias: 4 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    // volume: recent → 35
    // classification: 3/3 → 30
    // completeness: 5/5 → 20
    // temporal: 5 months → 15
    // total = 35 + 30 + 20 + 15 = 100
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
  });

  it('SCORING-002: Scoring parcial', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { tipo: AbsenteeismType.ENFERMEDAD, fechaInicio: new Date('2026-06-01'), fechaFin: new Date('2026-06-05'), dias: 5 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    // volume: recent → 35
    // classification: 1/3 → 10
    // completeness: 1/1 → 20
    // temporal: 1 month → 0.5 * 15 = 7.5 → 8
    // total = 35 + 10 + 20 + 8 = 73
    assert.ok(result.percentage >= 60 && result.percentage <= 80, `Expected 60-80, got ${result.percentage}`);
    assert.equal(result.status, 'TARGET_NOT_MET');
  });

  it('TENANT-001: Tenant isolation — consulta con companyId', async () => {
    const model = createMockModel([]);
    const provider = new AbsenteeismProvider(model as never);

    await provider.getCompliance(String(companyId));

    assert.ok(model.find.mock.callCount() > 0, 'model.find should have been called');
    const findArg = (model.find.mock.calls[0] as unknown as { arguments: [{ companyId: Types.ObjectId }] }).arguments[0];
    assert.equal(String(findArg.companyId), String(companyId));
  });

  it('PRIVACY-001: Resultado no contiene PII', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), {
        tipo: AbsenteeismType.ENFERMEDAD,
        descripcion: 'Gripe común',
      }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('Gripe'), 'Should not contain individual descriptions');
    assert.ok(!resultStr.includes('64b000000000000000000001'), 'Should not contain userId');
    assert.ok(!resultStr.includes('diagnosis'), 'Should not contain diagnoses');
    assert.ok(!resultStr.includes('clinicalNotes'), 'Should not contain clinical notes');
    assert.ok(!resultStr.includes('medicalHistory'), 'Should not contain medical history');
  });

  it('PHASES-001: Contribuye únicamente a HACER', async () => {
    const records = [
      buildRecord(companyId, createUserId('01')),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    assert.ok((result.phases as Record<string, unknown>)?.do !== undefined, 'Should have phases.do');
    assert.equal((result.phases as Record<string, unknown>)?.plan, undefined, 'Should not have phases.plan');
    assert.equal((result.phases as Record<string, unknown>)?.check, undefined, 'Should not have phases.check');
    assert.equal((result.phases as Record<string, unknown>)?.act, undefined, 'Should not have phases.act');
  });

  it('RESULT-001: Resultado está entre 0 y 100', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { tipo: AbsenteeismType.ENFERMEDAD }),
      buildRecord(companyId, createUserId('02'), { tipo: AbsenteeismType.ACCIDENTE }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    assert.ok(result.percentage >= 0, `Percentage should be >= 0, got ${result.percentage}`);
    assert.ok(result.percentage <= 100, `Percentage should be <= 100, got ${result.percentage}`);
  });

  it('FINDINGS-001: Genera findings con módulo correcto', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { tipo: AbsenteeismType.ENFERMEDAD }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    for (const finding of result.findings) {
      assert.equal(finding.module, 'absenteeism', `Finding ${finding.id} should have module 'absenteeism'`);
    }
  });

  it('DAYS-001: Total de días se refleja en completed', async () => {
    const records = [
      buildRecord(companyId, createUserId('01'), { dias: 3 }),
      buildRecord(companyId, createUserId('02'), { dias: 7 }),
      buildRecord(companyId, createUserId('03'), { dias: 2 }),
    ];

    const model = createMockModel(records);
    const provider = new AbsenteeismProvider(model as never);
    const result = await provider.getCompliance(String(companyId));

    assert.equal(result.completed, 3, 'completed should equal total records');
    assert.equal(result.pending, 0, 'pending should be 0 for absenteeism');
  });
});
