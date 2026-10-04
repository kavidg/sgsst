import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Types, Model } from 'mongoose';
import { AnnualAuditComplianceProvider } from './annual-audit-compliance.provider';
import { AnnualAudit, AnnualAuditDocument } from '../../annual-audit/schemas/annual-audit.schema';
import { AccountabilityMeeting } from '../../accountability/schemas/accountability-meeting.schema';
import { AccountabilityCommitment } from '../../accountability/schemas/accountability-commitment.schema';
import { DocumentMaster } from '../../document-management/schemas/document-master.schema';

/**
 * E2 (6.1.2) — Tests del PROVIDER oficial de la Auditoría anual.
 *
 * Cobertura: tenant isolation (query scoped), snapshot serializable,
 * delegación al scoring puro, metadata dimensions:v1, comportamiento sin
 * auditorías / con auditorías, NO acceso a Accountability/DocumentMaster
 * como fuente de score, y serialización (sin funciones/Mongoose en metadata).
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

/** Auditoría evaluable completa (persistida en el fake model). */
function evaluableDoc(companyId: Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    companyId,
    title: 'Auditoría interna anual SG-SST',
    auditCode: 'AUD-2026',
    status: 'COMPLETED',
    plannedStartDate: new Date('2026-02-01T00:00:00.000Z'),
    plannedEndDate: new Date('2026-02-28T00:00:00.000Z'),
    scope: 'Todo el SG-SST',
    objectives: 'Verificar conformidad',
    criteria: 'Resolución 0312',
    methodology: 'Revisión documental',
    auditorUserId: new Types.ObjectId(),
    actualStartDate: new Date('2026-03-02T00:00:00.000Z'),
    actualEndDate: new Date('2026-03-20T00:00:00.000Z'),
    reportTitle: 'Informe 2026',
    reportDate: new Date('2026-03-25T00:00:00.000Z'),
    reportSummary: 'Conforme en general',
    reportDocumentId: new Types.ObjectId(),
    findings: [],
    ...overrides,
  };
}

function buildFakeModel(seedDocs: Array<Record<string, unknown>> = []) {
  const docs = seedDocs.map((d) => ({ ...d }));
  const queries: Array<Record<string, unknown>> = [];
  const model = {
    find(query: Record<string, unknown>) {
      queries.push(query);
      const filtered = docs.filter((d) => String(d.companyId) === String(query.companyId));
      return {
        lean: () => ({ exec: async () => filtered.map((d) => ({ ...d })) }),
        exec: async () => filtered.map((d) => ({ ...d })),
      };
    },
  } as unknown as Model<AnnualAuditDocument>;
  return { model, queries };
}

function buildProvider(seedDocs: Array<Record<string, unknown>> = []) {
  const { model, queries } = buildFakeModel(seedDocs);
  const provider = new AnnualAuditComplianceProvider(model);
  return { provider, queries };
}

describe('ANNUAL-AUDIT-PROVIDER: Consulta y tenant isolation', () => {
  it('consulta ÚNICAMENTE AnnualAudit scoped por companyId (una query, sin N+1)', async () => {
    const { provider, queries } = buildProvider([evaluableDoc(COMPANY_A)]);
    await provider.getCompliance(String(COMPANY_A));
    assert.equal(queries.length, 1, 'exactamente una consulta');
    assert.ok(queries[0].companyId, 'query con filtro companyId');
    assert.equal(String(queries[0].companyId), String(COMPANY_A));
  });

  it('no consulta AccountabilityMeeting/Commitment ni DocumentMaster como fuente', async () => {
    // El provider se construye SOLO con el modelo AnnualAudit: si intentara
    // usar accountability/document-master fallaría de inmediato. La prueba
    // documenta la frontera anti-double-scoring.
    const { provider } = buildProvider([evaluableDoc(COMPANY_A)]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.ok(result);
    void AccountabilityMeeting;
    void AccountabilityCommitment;
    void DocumentMaster;
  });

  it('tenant isolation: solo devuelve datos de la empresa consultada', async () => {
    const { provider } = buildProvider([
      evaluableDoc(COMPANY_A),
      evaluableDoc(COMPANY_B, { auditCode: 'AUD-B' }),
    ]);
    const resultA = await provider.getCompliance(String(COMPANY_A));
    assert.equal((resultA.metadata as Record<string, unknown> && (resultA.metadata as Record<string, any>).counters.totalAudits) ?? 0, 1);
    const resultB = await provider.getCompliance(String(COMPANY_B));
    const metaB = resultB.metadata as Record<string, any>;
    assert.equal(metaB.counters.totalAudits, 1);
  });
});

describe('ANNUAL-AUDIT-PROVIDER: Comportamiento y contrato', () => {
  it('sin auditorías → NO_DATA no-audits con finding y metadata completa', async () => {
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.module, 'annual-audit');
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'annual-audit-no-data'));
    const meta = result.metadata as Record<string, any>;
    assert.equal(meta.noDataReason, 'no-audits');
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.standardCode, '6.1.2');
    assert.equal(meta.phase, 'check');
    assert.equal(meta.formula, 'dimensions:v1');
    assert.deepEqual(meta.weights, {
      program: 15,
      executionReport: 25,
      findingsDocumentation: 20,
      followUpClosure: 20,
      evidenceAnalysis: 10,
      periodicityHistory: 10,
    });
  });

  it('con auditoría evaluable → score real, status por meta 90 y fases check', async () => {
    const { provider } = buildProvider([evaluableDoc(COMPANY_A)]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.notEqual(result.status, 'NO_DATA');
    assert.equal(result.phases?.check, result.percentage);
    const expectedStatus = result.percentage >= 90 ? 'TARGET_MET' : 'TARGET_NOT_MET';
    assert.equal(result.status, expectedStatus);
    assert.equal(typeof result.percentage, 'number');
    assert.ok(result.percentage >= 0 && result.percentage <= 100);
  });

  it('metadata serializable: sin funciones ni documentos Mongoose completos', async () => {
    const { provider } = buildProvider([evaluableDoc(COMPANY_A)]);
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, unknown>;
    const serialized = JSON.parse(JSON.stringify(meta));
    assert.ok(serialized, 'metadata JSON-serializable');
    assert.deepEqual(Object.keys(serialized.dimensions).sort(), [
      'evidenceAnalysis',
      'executionReport',
      'findingsDocumentation',
      'followUpClosure',
      'periodicityHistory',
      'program',
    ]);
    for (const dim of Object.values(serialized.dimensions) as Array<Record<string, unknown>>) {
      assert.ok('ratio' in dim && 'numerator' in dim && 'denominator' in dim && 'weight' in dim);
    }
    assert.ok(serialized.counters && typeof serialized.counters.totalAudits === 'number');
  });

  it('brechas: pending/completed/overdue derivados de counters (sin recálculo)', async () => {
    const doc = evaluableDoc(COMPANY_A, {
      findings: [
        {
          _id: 'f1',
          type: 'NON_CONFORMITY',
          description: 'NC',
          criterion: 'c',
          evidence: 'e',
          responsibleNameSnapshot: 'r',
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: 'OPEN',
          actions: [
            { _id: 'a1', description: 'a', responsible: 'r', status: 'PENDING', dueDate: new Date('2026-01-01T00:00:00.000Z') },
            { _id: 'a2', description: 'a', responsible: 'r', status: 'COMPLETED', completedDate: new Date('2026-02-01T00:00:00.000Z') },
          ],
        },
      ],
    });
    const { provider } = buildProvider([doc]);
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, any>;
    // pending = incompleteFindings(0) + openActions(1); completed = completedActions(1)
    assert.equal(result.pending, meta.counters.incompleteFindings + meta.counters.openActions);
    assert.equal(result.completed, meta.counters.completedActions);
    assert.equal(result.overdue, meta.counters.overdueActions);
  });

  it('evaluabilidad usa fechas reales del documento (Date), no solo strings', async () => {
    const { provider } = buildProvider([evaluableDoc(COMPANY_A)]);
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, any>;
    assert.equal(meta.counters.evaluableAudits, 1);
    assert.equal(meta.noDataReason, undefined);
  });
});

// Referencia de tipos para asegurar que el contrato del schema E1 no se rompe.
type SchemaFieldsCheck = Pick<
  AnnualAudit,
  'companyId' | 'title' | 'status' | 'actualStartDate' | 'actualEndDate' | 'reportTitle' | 'findings'
>;
type _SchemaFieldsAreCompatible = SchemaFieldsCheck;
void (0 as unknown as never as _SchemaFieldsAreCompatible | undefined);
