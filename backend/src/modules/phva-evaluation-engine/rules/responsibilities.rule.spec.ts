import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ResponsibilitiesRule } from './responsibilities.rule';
import { AutoResultStatus } from '../interfaces/auto-evaluation-result';
import {
  PhvaAdvancedResponsibilitiesDocument,
  ResponsibilityAssignmentEntry,
} from '../../phva-advanced/schemas/phva-advanced-responsibilities.schema';

// ============================================================
// Tests Regla 1.1.2 — Responsabilidades en SG-SST (FASE 1)
// ============================================================
//
// Replica la semántica real del módulo (updateResponsibilities + ciclo de
// aprobación __META__):
// - matriz activa completa (asignadas, firmadas, cobertura MANAGER/ADMIN/MEMBER,
//   aprobada) → CUMPLE_TOTALMENTE;
// - sin asignar / sin firmar / sin cobertura / sin aprobación → PENDIENTE_ANALISIS;
// - matriz diligenciada sin ninguna fila activa → NO_CUMPLE (alerta
//   'Cargo sin responsabilidades activas.' del módulo);
// - matriz rechazada (REJECTED) → NO_CUMPLE.

const COMPANY_ID = '64b000000000000000000021';

type MockSignature = {
  accepted?: boolean;
  signedAt?: Date;
  signedBy?: Types.ObjectId;
};

type MockEntry = {
  title: string;
  category: string;
  role: string;
  employeeId?: Types.ObjectId;
  active: boolean;
  requiresSignature: boolean;
  signature: MockSignature;
};

type MockMeta = {
  approvalStatus: string;
};

function createMetaEntry(meta: MockMeta): ResponsibilityAssignmentEntry {
  return {
    title: '__META__',
    category: JSON.stringify(meta),
    role: 'MANAGER',
    active: true,
    requiresSignature: false,
    status: 'PENDING',
    signature: { version: 1 },
  } as unknown as ResponsibilityAssignmentEntry;
}

function createResponsibilityEntry(overrides: Partial<MockEntry> = {}): ResponsibilityAssignmentEntry {
  return {
    title: 'Implementar el SG-SST',
    category: 'Planeación',
    role: 'MANAGER',
    employeeId: new Types.ObjectId(),
    active: true,
    requiresSignature: true,
    status: 'SIGNED',
    signature: { accepted: true, signedAt: new Date('2026-03-02T00:00:00.000Z'), version: 1 },
    ...overrides,
  } as unknown as ResponsibilityAssignmentEntry;
}

function buildDocument(entries: ResponsibilityAssignmentEntry[]): PhvaAdvancedResponsibilitiesDocument {
  return {
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.2',
    responsibilities: entries,
    alerts: [],
    auditHistory: [],
    complianceStatus: 'PENDING',
    complianceReason: '',
    save: async () => undefined,
  } as unknown as PhvaAdvancedResponsibilitiesDocument;
}

function buildRule(document: PhvaAdvancedResponsibilitiesDocument | null): ResponsibilitiesRule {
  const phvaAdvancedService = {
    findResponsibilitiesByCompany: async () => {
      if (!document) throw new Error('Responsibilities not found');
      return document;
    },
  };
  return new ResponsibilitiesRule(phvaAdvancedService as never);
}

/** Matriz COMPLETA por defecto (alcanza CUMPLE_TOTALMENTE): cobertura + firma + __META__ aprobado. */
function createCompleteMatrix(): ResponsibilityAssignmentEntry[] {
  return [
    createMetaEntry({ approvalStatus: 'APPROVED' }),
    createResponsibilityEntry({ role: 'MANAGER' }),
    createResponsibilityEntry({ title: 'Administrar recursos del SG-SST', category: 'Recursos', role: 'ADMIN' }),
    createResponsibilityEntry({ title: 'Reportar incidentes', category: 'Operación', role: 'MEMBER' }),
  ];
}

async function evaluate(entries: ResponsibilityAssignmentEntry[]) {
  return buildRule(buildDocument(entries)).evaluate({ companyId: COMPANY_ID });
}

describe('ResponsibilitiesRule — 1.1.2 (FASE 1)', () => {
  it('contract: soporta únicamente el código 1.1.2', () => {
    const rule = buildRule(buildDocument(createCompleteMatrix()));
    assert.equal(rule.supports('1.1.2'), true);
    assert.equal(rule.supports('1.1.1'), false);
    assert.equal(rule.getModule(), 'phva-advanced/responsibilities');
  });

  it('CUMPLE_TOTALMENTE con matriz activa completa, firmada y aprobada', async () => {
    const result = await evaluate(createCompleteMatrix());
    assert.equal(result.code, '1.1.2');
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    assert.equal(result.findings.length, 0);
    assert.equal(result.missingInformation.length, 0);
    assert.ok(result.ruleTrace.length > 0);
    assert.ok(result.ruleTrace.every((trace) => trace.satisfied === true));
  });

  it('CUMPLE_TOTALMENTE con APPROVED_AND_SIGNED (estado compuesto del ciclo real)', async () => {
    const result = await evaluate([
      createMetaEntry({ approvalStatus: 'APPROVED_AND_SIGNED' }),
      ...createCompleteMatrix().filter((entry) => entry.title !== '__META__'),
    ]);
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
  });

  it('PENDIENTE_ANALISIS cuando no hay responsabilidades registradas', async () => {
    const result = await evaluate([createMetaEntry({ approvalStatus: 'DRAFT' })]);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('responsabilidades registradas'));
  });

  it('PENDIENTE_ANALISIS cuando la gestión avanzada no ha sido iniciada (sin registro)', async () => {
    const result = await buildRule(null).evaluate({ companyId: COMPANY_ID });
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('no ha sido iniciada'));
  });

  it('PENDIENTE_ANALISIS cuando una responsabilidad activa no tiene usuario asignado', async () => {
    const entries = createCompleteMatrix().map((entry) =>
      entry.title === 'Reportar incidentes' ? { ...entry, employeeId: undefined } : entry,
    );
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation.some((message) => message.includes('sin usuario asignado')));
    assert.ok(result.missingInformation.some((message) => message.includes('Reportar incidentes')));
    assert.equal(result.findings.length, 0);
  });

  it('PENDIENTE_ANALISIS cuando falta la firma de una responsabilidad que la requiere', async () => {
    const entries = createCompleteMatrix().map((entry) =>
      entry.title === 'Reportar incidentes'
        ? { ...entry, signature: { accepted: false, version: 1 } }
        : entry,
    );
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('firma de aceptación pendiente'));
  });

  it('PENDIENTE_ANALISIS cuando falta cobertura por rol (sin MEMBER)', async () => {
    const entries = createCompleteMatrix().filter((entry) => entry.role !== 'MEMBER');
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('MEMBER'));
  });

  it('PENDIENTE_ANALISIS cuando la matriz no ha sido enviada a aprobación (DRAFT)', async () => {
    const entries = createCompleteMatrix().map((entry) =>
      entry.title === '__META__' ? createMetaEntry({ approvalStatus: 'DRAFT' }) : entry,
    );
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('no ha sido enviada a aprobación'));
  });

  it('PENDIENTE_ANALISIS cuando la matriz está pendiente de aprobación (PENDING_APPROVAL)', async () => {
    const entries = createCompleteMatrix().map((entry) =>
      entry.title === '__META__' ? createMetaEntry({ approvalStatus: 'PENDING_APPROVAL' }) : entry,
    );
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('pendiente de aprobación'));
  });

  it('PENDIENTE_ANALISIS cuando el __META__ de aprobación es ilegible (JSON corrupto)', async () => {
    const entries = createCompleteMatrix().map((entry) =>
      entry.title === '__META__'
        ? { ...entry, category: '{no-es-json' }
        : entry,
    );
    const result = await evaluate(entries as ResponsibilityAssignmentEntry[]);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('no ha sido enviada a aprobación'));
  });

  it('PENDIENTE_ANALISIS cuando el __META__ no existe (sin fila de metadatos)', async () => {
    const entries = createCompleteMatrix().filter((entry) => entry.title !== '__META__');
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.ok(result.missingInformation[0].includes('no ha sido enviada a aprobación'));
  });

  it('NO_CUMPLE cuando la matriz diligenciada no tiene ninguna responsabilidad activa', async () => {
    const entries = [
      createMetaEntry({ approvalStatus: 'APPROVED' }),
      createResponsibilityEntry({ active: false }),
    ];
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('Sin responsabilidades activas'));
    assert.equal(result.findings[0].source, 'phva-advanced/responsibilities');
  });

  it('NO_CUMPLE cuando el ciclo de aprobación fue rechazado (REJECTED)', async () => {
    const entries = createCompleteMatrix().map((entry) =>
      entry.title === '__META__' ? createMetaEntry({ approvalStatus: 'REJECTED' }) : entry,
    );
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.NO_CUMPLE);
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('rechazada'));
  });

  it('frontera: responsabilidades activas que NO requieren firma no bloquean el cumplimiento', async () => {
    const entries = [
      createMetaEntry({ approvalStatus: 'APPROVED' }),
      createResponsibilityEntry({ requiresSignature: false }),
      createResponsibilityEntry({ title: 'Administrar recursos', category: 'Recursos', role: 'ADMIN', requiresSignature: false }),
      createResponsibilityEntry({ title: 'Reportar incidentes', category: 'Operación', role: 'MEMBER', requiresSignature: false }),
    ];
    const result = await evaluate(entries);
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    const signatureTrace = result.ruleTrace.find((trace) => trace.requirement.includes('Firmas'));
    assert.ok(signatureTrace?.evidence?.includes('Ninguna responsabilidad activa requiere firma'));
  });

  it('la fila __META__ se excluye del conteo de responsabilidades', async () => {
    const result = await evaluate(createCompleteMatrix());
    const activeTrace = result.ruleTrace.find((trace) => trace.requirement.includes('activas registradas'));
    assert.ok(activeTrace?.evidence?.includes('3 responsabilidad(es) activa(s)'));
  });
});
