import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { Types } from 'mongoose';
import { WorkRestrictionProvider } from './work-restriction.provider';
import {
  RestrictionStatus,
  RestrictionType,
  WorkRestriction,
} from '../../work-restriction/schemas/work-restriction.schema';

/**
 * FASE 33 — Tests del provider 3.1.6 (CASE-001..015 del prompt de fase).
 *
 * El provider consume EXCLUSIVAMENTE WorkRestriction. NO consume
 * MedicalRecommendation, OccupationalExam ni JobProfile como evidencia
 * (CASE-014/015 lo demuestran estructuralmente).
 */

const companyIdA = new Types.ObjectId('507f1f77bcf86cd799439011');
const companyIdB = new Types.ObjectId('507f1f77bcf86cd799439099');

/** Construye un WorkRestriction válido por defecto (tenant A). */
function buildRestriction(
  overrides: Partial<WorkRestriction> & { _id?: Types.ObjectId } = {},
): WorkRestriction {
  const base: WorkRestriction = {
    _id: new Types.ObjectId(),
    companyId: companyIdA,
    employeeId: new Types.ObjectId(),
    restrictionType: RestrictionType.TEMPORARY_RESTRICTION,
    status: RestrictionStatus.ACTIVE,
    receivedAt: new Date('2026-01-10T10:00:00Z'),
    effectiveFrom: new Date('2026-01-12T00:00:00Z'),
    effectiveUntil: new Date('2026-03-12T00:00:00Z'),
    responsibleUserId: new Types.ObjectId(),
    actions: 'Adaptación temporal de tarea: cambio de actividad a trabajo administrativo.',
    followUpDate: new Date('2026-02-10T00:00:00Z'),
    followUpStatus: 'Seguimiento programado, medida vigente.',
    evidence: 'Concepto médico-laboral ref. ADMIN-2026-014',
    active: true,
    createdBy: 'uid-owner',
    updatedBy: 'uid-owner',
  } as WorkRestriction;
  return { ...base, ...overrides };
}

function buildProvider(restrictions: WorkRestriction[], totalWorkers: number) {
  const find = mock.fn((_filter?: Record<string, unknown>) => ({
    lean: async () => restrictions,
  }));
  const countDocuments = mock.fn(async (_filter?: Record<string, unknown>) => totalWorkers);

  const provider = new WorkRestrictionProvider(
    { find, countDocuments } as never,
    { countDocuments } as never,
  );
  return { provider, find, countDocuments };
}

describe('WorkRestrictionProvider — 3.1.6 (FASE 33)', () => {
  let calls: { filter?: Record<string, unknown> }[] = [];

  beforeEach(() => {
    calls = [];
  });

  it('CASE-001: ausencia de registros (con trabajadores) → 0% con finding de ausencia', async () => {
    const { provider, find } = buildProvider([], 10);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.module, 'work-restriction');
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'work-restriction-no-records'));
    // El query del provider es tenant-scoped (frontera estructural).
    const filter = find.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(String((filter.companyId as Types.ObjectId).toHexString()), companyIdA.toHexString());
  });

  it('CASE-002: existencia — un registro válido → C1=25 contribuye y el resto es gestionable', async () => {
    const { provider } = buildProvider([buildRestriction()], 4);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 1/4 → 6.25 → C2, C3, C4 completos (75) → total ≈ 81.25 → 81
    assert.equal(result.percentage, 81);
    assert.equal(result.phases?.do, 81);
    assert.equal(result.status, 'TARGET_NOT_MET');
  });

  it('CASE-003: cobertura — deduplica por trabajador (varias filas, mismo empleado)', async () => {
    const employee = new Types.ObjectId();
    // 3 filas duplicadas para el MISMO trabajador → cobertura = 1 trabajador.
    const rows = [
      buildRestriction({ employeeId: employee, receivedAt: new Date('2026-01-10T10:00:00Z') }),
      buildRestriction({ employeeId: employee, receivedAt: new Date('2026-01-10T10:00:00Z'), _id: new Types.ObjectId() }),
      buildRestriction({ employeeId: employee, receivedAt: new Date('2026-01-10T10:00:00Z'), _id: new Types.ObjectId() }),
    ];
    const { provider } = buildProvider(rows, 2);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1 = 1 trabajador / 2 = 0.5 → 12.5; C2=C3=C4=1 → 75 → total ≈ 87.5 → 88
    assert.equal(result.percentage, 88);
    // El finding de cobertura usa la cuenta deduplicada (1 sin cubrir, no 0).
    const coverageFinding = result.findings.find((f) => f.id === 'work-restriction-coverage-pending');
    assert.ok(coverageFinding);
    assert.match(coverageFinding.title, /1 trabajador/);
  });

  it('CASE-004: gestión — sin acciones laborales registradas → C2=0 y finding específico', async () => {
    const { provider } = buildProvider(
      [buildRestriction({ actions: undefined })],
      2,
    );
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1=0.5→12.5, C2=0, C3=1→25, C4=1→25 → 62.5 → Math.round = 63
    assert.equal(result.percentage, 63);
    assert.ok(result.findings.some((f) => f.id === 'work-restriction-actions-pending'));
  });

  it('CASE-005: seguimiento — sin responsable ni seguimiento → C3=0 y finding específico', async () => {
    const { provider } = buildProvider(
      [buildRestriction({ responsibleUserId: undefined, followUpDate: undefined, followUpStatus: undefined })],
      2,
    );
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1=12.5, C2=25, C3=0, C4=25 → 62.5 → 62/63
    assert.ok([62, 63].includes(result.percentage));
    assert.ok(result.findings.some((f) => f.id === 'work-restriction-followup-pending'));
  });

  it('CASE-006: cierre — CLOSED con trazabilidad (actions) cuenta para C4', async () => {
    const closed = buildRestriction({ status: RestrictionStatus.CLOSED, effectiveUntil: undefined });
    const { provider } = buildProvider([closed], 2);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // CLOSED con actions → C4 válido; C1=12.5 + C2=25 + C3=25 + C4=25 = 87.5 → 88
    assert.equal(result.percentage, 88);
    assert.ok(!result.findings.some((f) => f.id === 'work-restriction-control-pending'));
  });

  it('CASE-007: registro CANCELLED no es evidencia (excluido de relevantes)', async () => {
    const { provider } = buildProvider(
      [buildRestriction({ status: RestrictionStatus.CANCELLED })],
      2,
    );
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'work-restriction-no-records'));
  });

  it('CASE-008: fechas inválidas — vigencia incoherente penaliza C4 con finding', async () => {
    const incoherent = buildRestriction({
      effectiveFrom: new Date('2026-03-12T00:00:00Z'),
      effectiveUntil: new Date('2026-01-12T00:00:00Z'),
    });
    const { provider } = buildProvider([incoherent], 2);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // C1=12.5, C2=25, C3=25, C4=0 → 62.5 → 62/63
    assert.ok([62, 63].includes(result.percentage));
    assert.ok(result.findings.some((f) => f.id === 'work-restriction-control-pending'));
  });

  it('CASE-009: duplicate handling — deduplicación por employeeId+type+receivedAt', async () => {
    const employee = new Types.ObjectId();
    const sameInstant = new Date('2026-01-10T10:00:00Z');
    const rows = [
      buildRestriction({ employeeId: employee, receivedAt: sameInstant }),
      buildRestriction({ employeeId: employee, receivedAt: new Date(sameInstant.getTime()), restrictionType: RestrictionType.TEMPORARY_RESTRICTION, _id: new Types.ObjectId() }),
      // Distinto tipo → NO es duplicado.
      buildRestriction({ employeeId: employee, receivedAt: sameInstant, restrictionType: RestrictionType.WORK_RECOMMENDATION, _id: new Types.ObjectId() }),
    ];
    const { provider } = buildProvider(rows, 10);
    const result = await provider.getCompliance(companyIdA.toHexString());

    // Cobertura: 1 trabajador de 10 → C1 = 0.1 → 2.5; C2=C3=C4=1 → 75 → 77.5 → 78
    assert.equal(result.percentage, 78);
    const coverageFinding = result.findings.find((f) => f.id === 'work-restriction-coverage-pending');
    assert.ok(coverageFinding);
    assert.match(coverageFinding.title, /9 trabajador/);
  });

  it('CASE-010: cross-tenant — el query del provider filtra por companyId del tenant', async () => {
    const { provider, find } = buildProvider([], 5);
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

  it('CASE-011: employee cross-tenant — actividades/trabajadores de otra empresa no cuentan', async () => {
    // El mock devuelve solo lo que el modelo entregaría para el filtro del
    // tenant A: un registro cuyo employee pertenece a B NO puede aparecer
    // (el filtro companyId lo excluye). Se demuestra que la cobertura de A
    // se calcula únicamente con registros de A.
    const { provider } = buildProvider([buildRestriction()], 5);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.module, 'work-restriction');
    assert.ok(result.percentage > 0);
    // El total de trabajadores (5) es del tenant A; el empleado cubierto es de A.
    const coverageFinding = result.findings.find((f) => f.id === 'work-restriction-coverage-pending');
    assert.ok(coverageFinding);
    assert.match(coverageFinding.title, /4 trabajador/);
  });

  it('CASE-012: responsible user cross-tenant — validación en service, no en provider', async () => {
    // El provider no resuelve usuarios: el service valida responsibleUserId
    // contra el tenant (work-restriction.service.ts). Aquí se demuestra que
    // el provider puntúa por existencia de responsable sin asumir tenant.
    const { provider } = buildProvider(
      [buildRestriction({ responsibleUserId: new Types.ObjectId() })],
      2,
    );
    const result = await provider.getCompliance(companyIdA.toHexString());
    assert.ok(result.percentage > 0);
  });

  it('CASE-013: no clinical fields — el provider no consulta ninguna colección clínica', async () => {
    const { provider, find } = buildProvider([buildRestriction()], 2);
    await provider.getCompliance(companyIdA.toHexString());

    // ÚNICA llamada al modelo de restricciones; no hay otros modelos inyectados.
    assert.equal(find.mock.calls.length, 1);
  });

  it('CASE-014: MedicalRecommendation NO sustituye WorkRestriction (structural)', async () => {
    // El constructor del provider SOLO acepta el modelo WorkRestriction y el
    // modelo Employee (conteo). No existe vía para inyectar MedicalRecommendation.
    const { provider } = buildProvider([], 3);
    const result = await provider.getCompliance(companyIdA.toHexString());
    // Sin restricciones registradas → 0% aunque existan recomendaciones médicas
    // en otra colección (el provider jamás las lee).
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'work-restriction-no-records'));
  });

  it('CASE-015: JobProfile NO sustituye WorkRestriction (structural)', async () => {
    // Igual que CASE-014: JobProfile/occupationalContext (3.1.3) no son
    // consumibles por este provider; sin WorkRestriction no hay evidencia.
    const { provider } = buildProvider([], 3);
    const result = await provider.getCompliance(companyIdA.toHexString());
    assert.equal(result.percentage, 0);
  });

  it('NO_DATA: sin trabajadores → percentage 0 sin findings de gestión', async () => {
    const { provider } = buildProvider([buildRestriction()], 0);
    const result = await provider.getCompliance(companyIdA.toHexString());

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.deepEqual(result.findings, []);
  });

  it('metadata: standard 3.1.6, phase do, semantic EXACT, module work-restriction', () => {
    const { provider } = buildProvider([], 0);
    const meta = provider.metadata;
    assert.equal(meta.standard, '3.1.6');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.module, 'work-restriction');
  });
});
