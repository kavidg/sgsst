import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ResponsableSstRule, isCourseOlderThanThreeYearsFrom } from './responsable-sst.rule';
import { AutoResultStatus } from '../interfaces/auto-evaluation-result';

// ============================================================
// Tests Regla 1.1.1 — Responsable del SG-SST (FASE 1)
// ============================================================
//
// Replica los casos del spec real del módulo (responsible-sgsst-designation.spec.ts):
// base completa → COMPLIES; campos/evidencias faltantes → PENDING; curso 50h
// vencido sin 20h o licencia exigida sin documento → NON_COMPLIANT.

const COMPANY_ID = '64b000000000000000000021';

type RuleDocument = { type: string; fileName: string; fileUrl: string };

type MockRecord = {
  fullName: string;
  documentNumber: string;
  position: string;
  profession: string;
  sstProfessionalType: string;
  sstLicenseNumber: string;
  licenseType: string;
  issuingAuthority: string;
  course50HoursDate?: Date;
  course20HoursDate?: Date;
  designationDate?: Date;
  designationIssuerName: string;
  designationIssuerPosition: string;
  documents: RuleDocument[];
};

const TODAY = new Date('2026-09-16T00:00:00.000Z');

function startOfToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Registro COMPLETO por defecto (alcanza CUMPLE_TOTALMENTE). Cada test ajusta lo que necesita. */
function createMockRecord(overrides: Partial<MockRecord> = {}): MockRecord {
  return {
    fullName: 'Ana Pérez',
    documentNumber: '123456789',
    position: 'Profesional SST',
    profession: 'Profesional en Seguridad y Salud en el Trabajo',
    sstProfessionalType: 'Profesional SST',
    sstLicenseNumber: 'LIC-2024-001',
    licenseType: 'Tecnólogo SST',
    issuingAuthority: 'Ministerio de Trabajo',
    course50HoursDate: new Date('2024-06-23T00:00:00.000Z'),
    designationDate: new Date('2024-03-01T00:00:00.000Z'),
    designationIssuerName: 'Gerencia General',
    designationIssuerPosition: 'Gerente General',
    documents: [
      { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
      { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
      { type: 'SST_LICENSE_PDF', fileName: 'licencia.pdf', fileUrl: 'x' },
      { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
    ],
    ...overrides,
  };
}

function buildRule(record: MockRecord | null): ResponsableSstRule {
  const phvaAdvancedService = {
    findResponsableSstByCompany: async () => {
      if (!record) throw new Error('Responsable SST not found');
      return record;
    },
  };
  return new ResponsableSstRule(phvaAdvancedService as never);
}

async function evaluate(record: MockRecord | null) {
  return buildRule(record).evaluate({ companyId: COMPANY_ID });
}

describe('ResponsableSstRule — 1.1.1 (FASE 1)', () => {
  it('contract: soporta únicamente el código 1.1.1', () => {
    const rule = buildRule(createMockRecord());
    assert.equal(rule.supports('1.1.1'), true);
    assert.equal(rule.supports('1.1.2'), false);
    assert.equal(rule.getModule(), 'phva-advanced/responsable-sst');
  });

  it('CUMPLE_TOTALMENTE cuando todos los requisitos están demostrados', async () => {
    const result = await evaluate(createMockRecord());
    assert.equal(result.code, '1.1.1');
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    assert.equal(result.findings.length, 0);
    assert.equal(result.missingInformation.length, 0);
    assert.ok(result.ruleTrace.length > 0);
    assert.ok(result.ruleTrace.every((trace) => trace.satisfied === true));
    assert.equal(typeof result.evaluatedAt, 'string');
    assert.equal(typeof result.engineVersion, 'string');
  });

  it('PENDIENTE_ANALISIS cuando faltan campos base y evidencias (sin incumplimiento demostrable)', async () => {
    const record = createMockRecord({
      fullName: '',
      licenseType: '',
      course50HoursDate: undefined,
      designationDate: undefined,
      documents: [],
    });
    const result = await evaluate(record);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation.length > 0);
    assert.ok(result.missingInformation.some((message) => message.includes('nombre completo')));
    assert.ok(result.missingInformation.some((message) => message.includes('diploma')));
    assert.ok(result.missingInformation.some((message) => message.includes('designación')));
    assert.equal(result.findings.length, 0);
  });

  it('PENDIENTE_ANALISIS cuando la gestión avanzada no ha sido iniciada (sin registro)', async () => {
    const result = await evaluate(null);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('no ha sido iniciada'));
  });

  it('NO_CUMPLE cuando el curso de 50 horas supera 3 años sin actualización de 20 horas', async () => {
    const result = await evaluate(
      createMockRecord({ course50HoursDate: new Date('2020-01-01T00:00:00.000Z') }),
    );
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('Actualización de 20 horas'));
    assert.equal(result.findings[0].source, 'phva-advanced/responsable-sst');
  });

  it('NO_CUMPLE cuando el curso supera 3 años con fecha de 20 horas pero sin certificado cargado', async () => {
    const result = await evaluate(
      createMockRecord({
        course50HoursDate: new Date('2020-01-01T00:00:00.000Z'),
        course20HoursDate: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
    assert.ok(result.findings.length === 1);
  });

  it('CUMPLE_TOTALMENTE cuando el curso supera 3 años pero hay actualización de 20 horas completa', async () => {
    const result = await evaluate(
      createMockRecord({
        course50HoursDate: new Date('2020-01-01T00:00:00.000Z'),
        course20HoursDate: new Date('2026-01-01T00:00:00.000Z'),
        documents: [
          { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
          { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
          { type: 'SST_LICENSE_PDF', fileName: 'licencia.pdf', fileUrl: 'x' },
          { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
          { type: 'TWENTY_HOUR_UPDATE_CERTIFICATE', fileName: 'curso20.pdf', fileUrl: 'x' },
        ],
      }),
    );
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
  });

  it('frontera: curso exactamente a 3 años NO está vencido (CUMPLE_TOTALMENTE)', async () => {
    // Límite exacto: 2023-09-16 + 3 años = 2026-09-16 === hoy → NO vencido.
    const result = await evaluate(
      createMockRecord({ course50HoursDate: new Date('2023-09-16T00:00:00.000Z') }),
    );
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
  });

  it('frontera: curso a 3 años + 1 día SÍ está vencido (NO_CUMPLE sin 20h)', async () => {
    const result = await evaluate(
      createMockRecord({ course50HoursDate: new Date('2023-09-15T00:00:00.000Z') }),
    );
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
  });

  it('NO_CUMPLE cuando el tipo de licencia exige documento y no está cargado (base completa)', async () => {
    const result = await evaluate(
      createMockRecord({
        documents: [
          { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
          { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
          { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
        ],
      }),
    );
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
    assert.ok(result.findings[0].title.includes('licencia SST'));
  });

  it('CUMPLE_TOTALMENTE con licencia cargada como escaneada (ambos tipos cuentan)', async () => {
    const result = await evaluate(
      createMockRecord({
        documents: [
          { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
          { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
          { type: 'SST_LICENSE_SCANNED', fileName: 'licencia.png', fileUrl: 'x' },
          { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
        ],
      }),
    );
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
  });

  it('PENDIENTE_ANALISIS (no NO_CUMPLE) con licencia exigida sin documento cuando la base está incompleta', async () => {
    // Caso C del módulo: datos faltantes no se convierten en NON_COMPLIANT.
    const result = await evaluate(
      createMockRecord({
        position: '',
        documents: [
          { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
          { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
          { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
        ],
      }),
    );
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.equal(result.findings.length, 0);
  });

  it('CUMPLE_TOTALMENTE cuando el tipo de licencia no exige documento (Tecnólogo SST → sí exige; tipo libre → no)', async () => {
    const result = await evaluate(
      createMockRecord({
        licenseType: 'Otro',
        documents: [
          { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
          { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
          { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
        ],
      }),
    );
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    const licenseTrace = result.ruleTrace.find((trace) => trace.requirement.includes('Documento de licencia'));
    assert.equal(licenseTrace?.satisfied, true);
    assert.ok(licenseTrace?.evidence?.includes('no exige documento'));
  });

  it('normativa: licenseExpiresAt antigua NO afecta el veredicto (la licencia no vence normativamente)', async () => {
    // El registro no incluye licenseExpiresAt en el espejo de la regla porque
    // el módulo nunca lo evalúa: este test documenta que la ausencia de ese
    // campo en la evaluación es intencional.
    const result = await evaluate(createMockRecord());
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    assert.ok(!result.ruleTrace.some((trace) => trace.requirement.toLowerCase().includes('vencimiento')));
  });
});

describe('isCourseOlderThanThreeYearsFrom — umbral del curso 50h', () => {
  it('fecha + 3 años anterior a hoy → vencido', () => {
    assert.equal(
      isCourseOlderThanThreeYearsFrom(
        new Date('2020-01-01T00:00:00.000Z'),
        startOfToday(new Date('2026-09-16T10:00:00.000Z')),
      ),
      true,
    );
  });

  it('límite exacto (fecha + 3 años === hoy) → NO vencido', () => {
    assert.equal(
      isCourseOlderThanThreeYearsFrom(
        new Date('2023-09-16T00:00:00.000Z'),
        startOfToday(new Date('2026-09-16T10:00:00.000Z')),
      ),
      false,
    );
  });

  it('dentro del umbral → NO vencido', () => {
    assert.equal(
      isCourseOlderThanThreeYearsFrom(
        new Date('2024-06-23T00:00:00.000Z'),
        startOfToday(new Date('2026-09-16T10:00:00.000Z')),
      ),
      false,
    );
  });
});
