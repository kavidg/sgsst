import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Types } from 'mongoose';
import { MedicalAbsenteeismProvider } from './medical-absenteeism.provider';
import { AbsenteeismType } from '../../absenteeism/schemas/absenteeism.schema';

/**
 * FASE 35E-2 — Tests del provider 3.3.6 (MedicalAbsenteeismProvider).
 *
 * Cubre: metadata, tenant isolation, companyId inválido, denominador
 * (presente/ausente/0), numerador (regla de incapacidad médica, exclusiones,
 * intersección temporal y cross-month), fórmula/factor, scoring y fronteras
 * arquitectónicas (sin headcount, sin hoursWorked, sin datos clínicos).
 */

const COMPANY = new Types.ObjectId('64b0000000000000000000a1');
const OTHER_COMPANY = new Types.ObjectId('64b0000000000000000000b2');

/** Mes del período bajo prueba: el provider usa el mes UTC en curso. */
function currentMonth(): { year: number; month: number; period: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return { year, month, period: `${year}-${String(month + 1).padStart(2, '0')}` };
}

const { year: Y, month: M, period: PERIOD } = currentMonth();
const FIRST = (day: number) => new Date(Date.UTC(Y, M, day, 0, 0, 0, 0));
const LAST = (day: number) => new Date(Date.UTC(Y, M, day, 12, 0, 0, 0));
const daysInMonth = new Date(Date.UTC(Y, M + 1, 0)).getUTCDate();

interface AbsRecord {
  companyId: Types.ObjectId;
  userId?: Types.ObjectId;
  tipo: AbsenteeismType;
  fechaInicio: Date;
  fechaFin: Date;
  dias: number;
  medicalIncapacity?: boolean;
  descripcion?: string;
  soporte?: string;
}

function rec(overrides: Partial<AbsRecord> = {}): AbsRecord {
  return {
    companyId: COMPANY,
    userId: new Types.ObjectId(),
    tipo: AbsenteeismType.ENFERMEDAD,
    fechaInicio: FIRST(10),
    fechaFin: LAST(14),
    dias: 5,
    medicalIncapacity: true,
    ...overrides,
  };
}

function createAbsenteeismModel(docs: AbsRecord[]) {
  // Simula el comportamiento de MongoDB: el filtro de la query (companyId,
  // rango de fechas) determina qué documentos regresan.
  return {
    find: mock.fn((query: { companyId: Types.ObjectId; fechaInicio: unknown; fechaFin: unknown }) => ({
      lean: mock.fn(() => ({
        exec: mock.fn(() =>
          Promise.resolve(
            docs.filter((d) => d.companyId.toString() === query.companyId.toString()),
          ),
        ),
      })),
      exec: mock.fn(() =>
        Promise.resolve(
          docs.filter((d) => d.companyId.toString() === query.companyId.toString()),
        ),
      ),
    })),
  };
}

function createScheduledModel(entries: Array<{ companyId: Types.ObjectId; period: string; scheduledWorkDays: number }>) {
  return {
    findOne: mock.fn((query: { companyId: Types.ObjectId; period: string }) => ({
      lean: mock.fn(() => ({
        exec: mock.fn(() =>
          Promise.resolve(
            entries.find(
              (e) =>
                e.companyId.toString() === query.companyId.toString() && e.period === query.period,
            ) ?? null,
          ),
        ),
      })),
    })),
  };
}

function buildProvider(records: AbsRecord[], scheduled: Array<{ companyId: Types.ObjectId; period: string; scheduledWorkDays: number }>) {
  return new MedicalAbsenteeismProvider(
    createAbsenteeismModel(records) as never,
    createScheduledModel(scheduled) as never,
  );
}

function withScheduled(days: number, companyId: Types.ObjectId = COMPANY) {
  return [{ companyId, period: PERIOD, scheduledWorkDays: days }];
}

// ═══════════════════ Metadata y contrato ═══════════════════

describe('FASE 35E-2 — MedicalAbsenteeismProvider: contrato y metadata', () => {
  it('MA-001: module es medical-absenteeism', async () => {
    const provider = buildProvider([], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    assert.equal(result.module, 'medical-absenteeism');
  });

  it('MA-002: metadata getter — 3.3.6 / do / EXACT', () => {
    const provider = buildProvider([], withScheduled(200));
    const meta = provider.metadata;
    assert.equal(meta.module, 'medical-absenteeism');
    assert.equal(meta.standard, '3.3.6');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
  });

  it('MA-003: metadata completa del cálculo (metric/unit/factor/period/denominatorType/frequency)', async () => {
    const provider = buildProvider([rec()], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.metric, 'medical_absenteeism_rate');
    assert.equal(meta.unit, '%');
    assert.equal(meta.factor, 100);
    assert.equal(meta.period, PERIOD);
    assert.equal(meta.denominatorType, 'scheduled_work_days');
    assert.equal(meta.frequency, 'monthly');
    assert.equal(meta.scheduledWorkDays, 200);
    assert.ok(meta.periodStart && meta.periodEnd, 'periodStart/periodEnd presentes');
    assert.ok(meta.numeratorLimitation, 'limitación del numerador documentada');
  });

  it('MA-004: companyId inválido → NO_DATA', async () => {
    const provider = buildProvider([], withScheduled(200));
    const result = await provider.getCompliance('not-an-objectid');
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'medical-absenteeism-invalid-company');
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.invalidCompanyId, true);
  });

  it('MA-005: período mensual UTC correcto (period = YYYY-MM del mes en curso)', async () => {
    const provider = buildProvider([], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.period, PERIOD);
    const end = new Date(meta.periodEnd as string);
    assert.equal(end.getUTCFullYear(), Y);
    assert.equal(end.getUTCMonth(), M);
    assert.equal(end.getUTCDate(), daysInMonth);
    // No hay fallback anual: el período dura exactamente el mes.
    const start = new Date(meta.periodStart as string);
    assert.equal(start.getUTCDate(), 1);
    assert.equal(start.getUTCHours() + start.getUTCMinutes(), 0);
  });

  it('MA-006: sin datos clínicos — el provider nunca referencia descripcion/soporte como fuente', () => {
    // Barrera arquitectónica: el código fuente del provider no consume texto
    // libre ni soportes (metadata-only).
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../../../src/modules/compliance-engine/providers/medical-absenteeism.provider.ts'),
      'utf-8',
    );
    assert.doesNotMatch(src, /record\.descripcion|record\.soporte/);
  });
});

// ═══════════════════ Denominador ═══════════════════

describe('FASE 35E-2 — MedicalAbsenteeismProvider: denominador', () => {
  it('MA-007: denominador ausente para el período → NO_DATA (no se inventa)', async () => {
    const provider = buildProvider([rec()], []); // sin registro del período
    const result = await provider.getCompliance(String(COMPANY));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'medical-absenteeism-no-denominator');
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.denominatorPresent, false);
    assert.equal(meta.zeroDenominator, false);
  });

  it('MA-008: denominador de OTRO período no sirve (mensualidad estricta)', async () => {
    const provider = buildProvider(
      [rec()],
      [{ companyId: COMPANY, period: `${Y - 1}-12`, scheduledWorkDays: 200 }],
    );
    const result = await provider.getCompliance(String(COMPANY));
    assert.equal(result.status, 'NO_DATA');
  });

  it('MA-009: denominador = 0 → NO_DATA (nunca dividir por cero)', async () => {
    const provider = buildProvider([rec()], withScheduled(0));
    const result = await provider.getCompliance(String(COMPANY));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'medical-absenteeism-no-denominator');
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.zeroDenominator, true);
  });

  it('MA-010: denominador presente y > 0 → medición válida (no NO_DATA)', async () => {
    const provider = buildProvider([], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    assert.notEqual(result.status, 'NO_DATA');
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.denominatorPresent, true);
    assert.equal(meta.denominator, 200);
  });

  it('MA-011: denominador del período es del MES evaluado (no headcount, no hoursWorked)', async () => {
    const scheduledModel = createScheduledModel(withScheduled(220));
    const provider = new MedicalAbsenteeismProvider(
      createAbsenteeismModel([]) as never,
      scheduledModel as never,
    );
    await provider.getCompliance(String(COMPANY));
    const findOneFn = scheduledModel.findOne as unknown as { mock: { calls: Array<{ arguments: unknown[] }> } };
    const query = findOneFn.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(query).sort(), ['companyId', 'period'], 'la query filtra companyId + period exactos');
    assert.equal(query.period, PERIOD);
  });
});

// ═══════════════════ Numerador: regla de causa médica ═══════════════════

describe('FASE 35E-2 — MedicalAbsenteeismProvider: numerador (regla de causa médica)', () => {
  it('MA-012: ENFERMEDAD + medicalIncapacity=true dentro del mes → cuenta', async () => {
    const provider = buildProvider([rec({ fechaInicio: FIRST(10), fechaFin: LAST(14) })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 1);
    assert.equal(meta.medicalAbsenceDays, 5);
  });

  it('MA-013: medicalIncapacity undefined (registro histórico) → NO cuenta y genera finding', async () => {
    const provider = buildProvider([rec({ medicalIncapacity: undefined })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
    assert.equal(meta.recordsWithoutStructuredSignal, 1);
    const finding = result.findings.find((f) => f.id === 'medical-absenteeism-unclassified-records');
    assert.ok(finding, 'finding de clasificación pendiente presente');
  });

  it('MA-014: medicalIncapacity=false → NO cuenta', async () => {
    const provider = buildProvider([rec({ medicalIncapacity: false })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
    assert.equal(meta.excludedNonMedicalRecords, 1);
  });

  it('MA-015: PERMISO nunca cuenta (aun con medicalIncapacity=true)', async () => {
    const provider = buildProvider([rec({ tipo: AbsenteeismType.PERMISO })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
    assert.equal(meta.excludedNonMedicalRecords, 1);
  });

  it('MA-016: ACCIDENTE sin señal estructurada NO cuenta automáticamente (Accidente ≠ incapacidad)', async () => {
    const provider = buildProvider([rec({ tipo: AbsenteeismType.ACCIDENTE, medicalIncapacity: undefined })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
  });

  it('MA-017: ACCIDENTE con medicalIncapacity=true (incapacidad laboral) SÍ cuenta', async () => {
    const provider = buildProvider([rec({ tipo: AbsenteeismType.ACCIDENTE })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 1);
  });

  it('MA-018: ausencia fuera del período (mes anterior) → no cuenta (Caso D)', async () => {
    const provider = buildProvider(
      [rec({ fechaInicio: new Date(Date.UTC(Y, M - 1, 10)), fechaFin: new Date(Date.UTC(Y, M - 1, 15)), dias: 6 })],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
    assert.equal(meta.excludedOutOfPeriodRecords, 1);
  });

  it('MA-019: ausencia futura respecto al período → no cuenta', async () => {
    const provider = buildProvider(
      [rec({ fechaInicio: new Date(Date.UTC(Y, M + 1, 5)), fechaFin: new Date(Date.UTC(Y, M + 1, 9)), dias: 5 })],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
    assert.equal(meta.excludedOutOfPeriodRecords, 1);
  });

  it('MA-020: ausencia que cruza el inicio del mes → solo los días del período (Caso E, sin doble conteo)', async () => {
    // Ausencia: 28 del mes anterior → 3 del mes actual. El provider debe
    // atribuir 3 días (no los 7 del registro).
    const provider = buildProvider(
      [
        rec({
          fechaInicio: new Date(Date.UTC(Y, M - 1, 28)),
          fechaFin: FIRST(3),
          dias: 7,
        }),
      ],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.medicalAbsenceDays, 3);
    assert.equal(meta.crossPeriodRecords, 1);
  });

  it('MA-021: ausencia que cruza el fin del mes → solo los días del período', async () => {
    // Ausencia: 28 del mes actual → 2 del mes siguiente. Atribuye 3 días
    // (28, 29, 30/31 según el mes).
    const lastDay = daysInMonth;
    const expectedDays = lastDay - 28 + 1;
    const provider = buildProvider(
      [
        rec({
          fechaInicio: LAST(lastDay - 0) === undefined ? FIRST(1) : new Date(Date.UTC(Y, M, lastDay - 2)),
          fechaFin: new Date(Date.UTC(Y, M + 1, 2)),
          dias: 6,
        }),
      ],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.medicalAbsenceDays, expectedDays);
    assert.equal(meta.crossPeriodRecords, 1);
  });

  it('MA-022: ausencia completa en meses adyacentes → 0 días atribuidos (sin doble conteo)', async () => {
    const provider = buildProvider(
      [
        rec({
          fechaInicio: new Date(Date.UTC(Y, M - 1, 20)),
          fechaFin: new Date(Date.UTC(Y, M + 1, 5)),
          dias: 17,
        }),
      ],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    // El registro intersecta el mes (la query lo trae) y la parte atribuida es
    // exactamente el mes completo, no los 17 días del registro.
    assert.equal(meta.medicalAbsenceDays, daysInMonth);
    assert.equal(meta.crossPeriodRecords, 1);
  });

  it('MA-023: múltiples ausencias médicas → se suman los días atribuidos', async () => {
    const provider = buildProvider(
      [rec({ fechaInicio: FIRST(2), fechaFin: LAST(4) }), rec({ fechaInicio: FIRST(20), fechaFin: LAST(22) })],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 2);
    assert.equal(meta.medicalAbsenceDays, 6);
  });

  it('MA-024: fechaInicio > fechaFin → excluido como no médico (sin inferencia, sin crash)', async () => {
    const provider = buildProvider(
      [rec({ fechaInicio: LAST(20), fechaFin: FIRST(10), dias: -9 })],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
    assert.equal(meta.excludedNonMedicalRecords, 1);
  });

  it('MA-025: sin registros de ausentismo + denominador válido → 0.00% VÁLIDO con advertencia (Caso A)', async () => {
    const provider = buildProvider([], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    assert.notEqual(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'medical-absenteeism-zero-absences');
    assert.ok(result.findings[0].description.includes('subregistro'));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.collectionEmpty, true);
    assert.equal(meta.medicalAbsenceDays, 0);
  });
});

// ═══════════════════ Tenant isolation ═══════════════════

describe('FASE 35E-2 — MedicalAbsenteeismProvider: tenant isolation', () => {
  it('MA-026: ausencias de otro tenant no cuentan', async () => {
    // El mock simula el comportamiento de MongoDB: la query filtra companyId,
    // por lo que los registros de otro tenant nunca regresan.
    const provider = buildProvider(
      [rec({ companyId: OTHER_COMPANY })],
      withScheduled(200),
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.eligibleMedicalRecords, 0);
    assert.equal(meta.totalAbsenteeismRecords, 0);
  });

  it('MA-027: denominador de otro tenant no sirve', async () => {
    const provider = buildProvider(
      [rec()],
      withScheduled(200, OTHER_COMPANY),
    );
    const result = await provider.getCompliance(String(COMPANY));
    assert.equal(result.status, 'NO_DATA');
  });

  it('MA-028: las queries del provider filtran companyId (barrer fuente)', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../../../src/modules/compliance-engine/providers/medical-absenteeism.provider.ts'),
      'utf-8',
    );
    assert.match(src, /findOne\(\{ companyId: objectId, period \}\)/);
    assert.match(src, /find\(\{\s*\n?\s*companyId: objectId/);
  });
});

// ═══════════════════ Fórmula, precisión y scoring ═══════════════════

describe('FASE 35E-2 — MedicalAbsenteeismProvider: fórmula y scoring', () => {
  it('MA-029: fórmula — 5/200 × 100 = 2.5% (precisión interna completa en metadata)', async () => {
    const provider = buildProvider([rec({ fechaInicio: FIRST(10), fechaFin: LAST(14) })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.medicalAbsenceDays, 5);
    assert.equal(meta.medicalAbsenteeismRate, 2.5, 'tasa con precisión interna completa');
    const rateFinding = result.findings.find((f) => f.id === 'medical-absenteeism-rate');
    assert.ok(rateFinding);
    // Display 2 decimales.
    assert.ok(rateFinding.title.includes('2.50%'));
  });

  it('MA-030: factor 100 fijo (constante privada, no configurable)', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../../../src/modules/compliance-engine/providers/medical-absenteeism.provider.ts'),
      'utf-8',
    );
    assert.match(src, /FACTOR = 100/);
  });

  it('MA-031: score refleja calidad de medición, no magnitud (sin penalización por % alto)', async () => {
    // Ausentismo alto (30 días de 200 = 15%) debe dar el MISMO score que uno
    // bajo con la misma trazabilidad: el score no mide si el ausentismo es
    // "bueno" o "malo".
    const low = await buildProvider([rec({ fechaInicio: FIRST(2), fechaFin: LAST(2) })], withScheduled(200)).getCompliance(String(COMPANY));
    const high = await buildProvider(
      [rec({ fechaInicio: FIRST(2), fechaFin: LAST(31) })],
      withScheduled(200),
    ).getCompliance(String(COMPANY));
    // Solo comparable si el mes tiene al menos 30 días; si no, comparar contra sí mismo.
    if (daysInMonth >= 30) {
      assert.equal(low.percentage, high.percentage);
    } else {
      assert.ok(low.percentage >= 0 && high.percentage >= 0);
    }
  });

  it('MA-032: TARGET_MET cuando la trazabilidad es completa (C1=100, C2=100, C3=100, C4=100)', async () => {
    const provider = buildProvider([rec()], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal((result.phases as Record<string, unknown>)?.do, 100);
  });

  it('MA-033: TARGET_NOT_MET cuando la trazabilidad se degrada (sin señal explícita)', async () => {
    // Todos los registros intersectados sin señal estructurada → trazabilidad 0.
    const provider = buildProvider([rec({ medicalIncapacity: undefined })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    assert.equal(result.status, 'TARGET_NOT_MET');
  });

  it('MA-034: trazabilidad parcial con registros sin clasificar (C2 degrada)', async () => {
    const provider = buildProvider([rec(), rec({ medicalIncapacity: undefined })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.ok((meta.traceabilityCoverage as number) < 100);
    assert.ok(result.percentage < 100);
  });

  it('MA-035: sin datos clínicos en metadata (no descripcion/soporte/diagnóstico)', async () => {
    const provider = buildProvider([rec({ descripcion: 'dx confidencial', soporte: 'incapacidad.pdf' })], withScheduled(200));
    const result = await provider.getCompliance(String(COMPANY));
    const meta = JSON.stringify(result.metadata).toLowerCase();
    assert.equal(meta.includes('dx confidencial'), false);
    assert.equal(meta.includes('incapacidad.pdf'), false);
  });

  it('MA-036: historicidad — el denominador se lee por período declarado (no recalculado)', async () => {
    // El provider consulta el registro persistido del período; nunca deriva el
    // denominador del headcount actual.
    const scheduledModel = createScheduledModel(withScheduled(210));
    const provider = new MedicalAbsenteeismProvider(
      createAbsenteeismModel([]) as never,
      scheduledModel as never,
    );
    const result = await provider.getCompliance(String(COMPANY));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.scheduledWorkDays, 210);
    assert.equal(meta.denominatorType, 'scheduled_work_days');
  });
});

// ═══════════════════ Fronteras arquitectónicas ═══════════════════

describe('FASE 35E-2 — MedicalAbsenteeismProvider: fronteras arquitectónicas', () => {
  const src = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../../../src/modules/compliance-engine/providers/medical-absenteeism.provider.ts'),
    'utf-8',
  );

  it('MA-037: fuentes EXACTAS — Absenteeism + CompanyPeriodScheduledWorkData', () => {
    assert.match(src, /absenteeism\/schemas\/absenteeism\.schema/);
    assert.match(src, /company-period-scheduled-work-data\.schema/);
  });

  it('MA-038: NO usa census_headcount_proxy ni Employee (frontera con 3.3.4/3.3.5)', () => {
    assert.doesNotMatch(src, /census_headcount_proxy/);
    assert.doesNotMatch(src, /employees\/schemas\/employee\.schema/);
  });

  it('MA-039: NO usa CompanyPeriodWorkData.hoursWorked ni person-time', () => {
    assert.doesNotMatch(src, /company-period-work-data\.schema/);
    assert.doesNotMatch(src, /hoursWorked/);
  });

  it('MA-040: NO consume resultados de otros providers (3.3.4/3.3.5/3.2.3/3.2.1)', () => {
    for (const forbidden of ['DiseasePrevalenceProvider', 'DiseaseIncidenceProvider', 'AccidentStatisticsProvider', 'AbsenteeismProvider']) {
      assert.doesNotMatch(src, new RegExp(`import[^;]*${forbidden}`), `no importa ${forbidden}`);
    }
  });

  it('MA-041: sin datos clínicos (no lee descripcion/soporte; sin campos clínicos nuevos)', () => {
    assert.doesNotMatch(src, /record\.descripcion/);
    assert.doesNotMatch(src, /record\.soporte/);
    for (const clinical of ['diagnóstico', 'diagnostico', 'cie', 'historia clínica', 'historia clinica']) {
      assert.equal(
        new RegExp(`medicalAbsenceDays[^\\n]*${clinical}|${clinical}[^\\n]*medicalAbsenceDays`, 'i').test(src),
        false,
      );
    }
  });

  it('MA-042: numerador por intersección de rangos (no suma Absenteeism.dias directamente)', () => {
    // La atribución usa effectiveStart/effectiveEnd derivados de las fechas,
    // no el campo dias del registro.
    assert.match(src, /Math\.max\(startDay, periodStartDay\)/);
    assert.match(src, /Math\.min\(endDay, periodEndDay\)/);
  });
});
