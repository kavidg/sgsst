import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ResourceAssignmentRule } from './resource-assignment.rule';
import { AutoResultStatus } from '../interfaces/auto-evaluation-result';

// ============================================================
// Tests Regla 1.1.3 — Asignación de recursos (FASE 1)
// ============================================================
//
// Replica la semántica real del módulo (updateResourceAssignment):
// COMPLIES del módulo exige los CINCO requisitos simultáneos:
//   1) recursos financieros registrados,
//   2) al menos un recurso humano activo,
//   3) recursos técnicos registrados,
//   4) evidencias (repositorio o evidencia por fila financiera/técnica),
//   5) aprobación gerencial con firma (approval.approved && signatureImage).
//
// Traducción del motor (sin equivalencias genéricas):
// - Falta de cualquier requisito → PENDIENTE_ANALISIS (información insuficiente
//   para concluir cumplimiento; equivale al PENDING del módulo).
// - approvalStatus REJECTED → NO_CUMPLE (incumplimiento demostrable).
// - Módulo sin información registrada → PENDIENTE_ANALISIS (nunca NO_APLICA ni
//   NO_CUMPLE: datos vacíos no son incumplimiento demostrable).

const COMPANY_ID = '64b000000000000000000021';

type MockEvidence = { fileName: string; fileUrl: string };

type MockRecord = {
  financialResources: Array<{ concept: string; value?: number; responsible?: string; evidence?: MockEvidence }>;
  humanResources: Array<{ employeeId: string; role: string; responsibilities?: string[]; active?: boolean }>;
  technicalResources: Array<{ name: string; quantity?: number; responsible?: string; evidence?: MockEvidence }>;
  evidences: MockEvidence[];
  approval: { approved?: boolean; signatureImage?: string; signedAt?: Date; signedBy?: string };
  approvalStatus: string;
};

/** Registro COMPLETO por defecto (alcanza CUMPLE_TOTALMENTE). Cada test ajusta lo que necesita. */
function createMockRecord(overrides: Partial<MockRecord> = {}): MockRecord {
  return {
    financialResources: [
      { concept: 'Capacitación SG-SST', value: 5_000_000, responsible: 'Gerencia General' },
    ],
    humanResources: [
      { employeeId: 'EMP-001', role: 'Coordinador SST', responsibilities: ['Coordinar el SG-SST'], active: true },
    ],
    technicalResources: [
      { name: 'Extintor PQS', quantity: 4, responsible: 'Mantenimiento' },
    ],
    evidences: [{ fileName: 'soporte-presupuesto.pdf', fileUrl: 'https://storage/soporte.pdf' }],
    approval: {
      approved: true,
      signatureImage: 'data:image/png;base64,AAA',
      signedAt: new Date('2026-03-01T00:00:00.000Z'),
      signedBy: 'Gerente General',
    },
    approvalStatus: 'APPROVED_AND_SIGNED',
    ...overrides,
  };
}

function buildRule(record: MockRecord | null): ResourceAssignmentRule {
  const phvaAdvancedService = {
    findResourceAssignmentByCompany: async () => {
      if (!record) throw new Error('Resource assignment not found');
      return record;
    },
  };
  return new ResourceAssignmentRule(phvaAdvancedService as never);
}

async function evaluate(record: MockRecord | null) {
  return buildRule(record).evaluate({ companyId: COMPANY_ID });
}

describe('ResourceAssignmentRule — 1.1.3 (FASE 1)', () => {
  it('contract: soporta únicamente el código 1.1.3', () => {
    const rule = buildRule(createMockRecord());
    assert.equal(rule.supports('1.1.3'), true);
    assert.equal(rule.supports('1.1.1'), false);
    assert.equal(rule.getModule(), 'phva-advanced/resource-assignment');
  });

  it('CUMPLE_TOTALMENTE con los cinco requisitos demostrados', async () => {
    const result = await evaluate(createMockRecord());
    assert.equal(result.code, '1.1.3');
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    assert.equal(result.findings.length, 0);
    assert.equal(result.missingInformation.length, 0);
    assert.ok(result.ruleTrace.length === 5);
    assert.ok(result.ruleTrace.every((trace) => trace.satisfied === true));
    const approvalTrace = result.ruleTrace.find((trace) => trace.requirement.includes('Aprobación gerencial'));
    assert.ok(approvalTrace?.evidence?.includes('Gerente General'));
  });

  it('PENDIENTE_ANALISIS cuando la gestión avanzada no ha sido iniciada (sin registro)', async () => {
    const result = await evaluate(null);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('no ha sido iniciada'));
    assert.equal(result.findings.length, 0);
  });

  it('PENDIENTE_ANALISIS cuando el módulo no tiene ningún recurso registrado (nunca NO_APLICA ni NO_CUMPLE)', async () => {
    const result = await evaluate(
      createMockRecord({
        financialResources: [],
        humanResources: [],
        technicalResources: [],
        evidences: [],
        approval: {},
        approvalStatus: 'DRAFT',
      }),
    );
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation.some((message) => message.includes('no tiene información registrada')));
    assert.equal(result.findings.length, 0);
  });

  it('PENDIENTE_ANALISIS cuando faltan recursos financieros (módulo ya diligenciado)', async () => {
    const result = await evaluate(createMockRecord({ financialResources: [] }));
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('recursos financieros'));
  });

  it('PENDIENTE_ANALISIS cuando no hay recursos humanos activos (activo=false no cuenta)', async () => {
    const result = await evaluate(
      createMockRecord({
        humanResources: [{ employeeId: 'EMP-001', role: 'Coordinador SST', active: false }],
      }),
    );
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation.some((message) => message.includes('recursos humanos activos')));
  });

  it('PENDIENTE_ANALISIS cuando faltan recursos técnicos', async () => {
    const result = await evaluate(createMockRecord({ technicalResources: [] }));
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation.some((message) => message.includes('recursos técnicos')));
  });

  it('PENDIENTE_ANALISIS cuando faltan evidencias', async () => {
    const result = await evaluate(createMockRecord({ evidences: [] }));
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation.some((message) => message.includes('evidencias')));
  });

  it('frontera: la evidencia por fila (financiera o técnica) sustituye al repositorio de evidencias', async () => {
    const result = await evaluate(
      createMockRecord({
        evidences: [],
        financialResources: [
          {
            concept: 'Capacitación SG-SST',
            value: 5_000_000,
            evidence: { fileName: 'soporte.pdf', fileUrl: 'https://storage/soporte.pdf' },
          },
        ],
      }),
    );
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    const evidenceTrace = result.ruleTrace.find((trace) => trace.requirement.includes('Evidencias'));
    assert.ok(evidenceTrace?.evidence?.includes('repositorio o evidencia por fila'));
  });

  it('PENDIENTE_ANALISIS cuando falta la aprobación gerencial con firma (DRAFT)', async () => {
    const result = await evaluate(
      createMockRecord({ approval: {}, approvalStatus: 'DRAFT' }),
    );
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('aprobación gerencial con firma'));
  });

  it('PENDIENTE_ANALISIS cuando el presupuesto está pendiente de aprobación (PENDING_APPROVAL)', async () => {
    const result = await evaluate(
      createMockRecord({ approval: {}, approvalStatus: 'PENDING_APPROVAL' }),
    );
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('pendiente de aprobación gerencial'));
  });

  it('frontera: aprobación marcada sin imagen de firma NO cuenta como aprobación (regla del módulo)', async () => {
    const result = await evaluate(
      createMockRecord({ approval: { approved: true }, approvalStatus: 'APPROVED' }),
    );
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('aprobación gerencial con firma'));
  });

  it('NO_CUMPLE cuando el ciclo de aprobación gerencial fue rechazado (REJECTED)', async () => {
    const result = await evaluate(
      createMockRecord({ approval: {}, approvalStatus: 'REJECTED' }),
    );
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('rechazado'));
    assert.equal(result.findings[0].source, 'phva-advanced/resource-assignment');
  });

  it('NO_CUMPLE prevalece sobre pendientes (rechazo + recursos humanos faltantes conviven)', async () => {
    const result = await evaluate(
      createMockRecord({
        humanResources: [],
        approval: {},
        approvalStatus: 'REJECTED',
      }),
    );
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
    assert.equal(result.findings.length, 1);
    assert.ok(result.missingInformation.length > 0);
  });
});
