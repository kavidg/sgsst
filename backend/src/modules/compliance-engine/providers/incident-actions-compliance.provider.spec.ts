import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Types, Model } from 'mongoose';
import { IncidentActionsProvider } from './incident-actions-compliance.provider';
import { Incident, IncidentDocument } from '../../incidents/schemas/incident.schema';
import { IncidentActionsStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/incident-actions-standard.analyzer';

/**
 * E2 (7.1.3) — Tests del PROVIDER OFICIAL: una sola query tenant-scoped, sin
 * N+1, sin queries cruzadas, contrato estándar + phases.act + metadata
 * dimensions:v1, y score 100% delegado al scorer puro.
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

function buildDoc(overrides: Record<string, unknown> = {}): Partial<Incident> {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    type: 'Accidente de trabajo',
    date: new Date('2026-06-15'),
    description: 'Caída en escalera',
    severity: 'Media',
    status: 'Abierto',
    investigationType: 'ACCIDENT' as never,
    investigationDate: new Date('2026-06-16'),
    investigationResponsibleUserId: new Types.ObjectId(),
    methodology: 'Ivanov',
    investigationStatus: 'CONCLUDED' as never,
    immediateCauses: ['Superficie mojada'],
    basicCauses: ['Falta de señalización'],
    relatedFactors: ['Ergonomía'],
    conclusions: 'Reforzar señalización',
    lifecycleStage: 'IN_PROGRESS' as never,
    evidence: [],
    investigationEvidence: [{ evidenceUrl: 'https://e.test/acta.pdf' }] as never,
    correctiveActions: [
      {
        actionId: 'ACT-001',
        action: 'Instalar barandas',
        responsible: 'Ana',
        status: 'COMPLETED' as never,
        completedDate: new Date('2026-07-01'),
        dueDate: new Date('2026-09-01'),
        evidence: { evidenceUrl: 'https://e.test/soporte.pdf' } as never,
        followUp: { followUpDate: new Date('2026-07-02'), implementationStatus: 'IMPLEMENTED' as never },
      } as never,
    ],
    preventiveActions: [],
    ...overrides,
  } as Partial<Incident>;
}

function buildFakeModel(docs: Array<Partial<Incident>> = []) {
  const queries: Array<Record<string, unknown>> = [];
  const model = {
    find(query: Record<string, unknown>) {
      queries.push(query);
      const filtered = docs.filter((d) => String(d.companyId) === String(query.companyId));
      return {
        lean: () => ({
          exec: async () => filtered,
        }),
      };
    },
  } as unknown as Model<IncidentDocument>;
  return { model, queries };
}

describe('IA-PROVIDER: consultas y tenant', () => {
  it('1. UNA sola query con {companyId} server-side (sin N+1: 25 casos = 1 query)', () => {
    const docs = Array.from({ length: 25 }, (_, i) => buildDoc({ _id: new Types.ObjectId() }));
    const { model, queries } = buildFakeModel(docs);
    const provider = new IncidentActionsProvider(model);
    void provider.getCompliance(String(COMPANY_A));
    assert.equal(queries.length, 1);
    assert.equal(String(queries[0].companyId), String(COMPANY_A));
  });

  it('2. tenant isolation: empresa B nunca ve score/datos de empresa A (NO_DATA)', async () => {
    const { model } = buildFakeModel([buildDoc()]);
    const provider = new IncidentActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_B));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    const meta = result.metadata as { noDataReason?: string; counters?: { totalIncidents: number } };
    assert.equal(meta.noDataReason, 'no-evaluable-cases');
    assert.equal(meta.counters?.totalIncidents, 0);
    assert.ok(result.findings.every((f) => f.module === 'incident-actions'));
  });

  it('3. NO consulta dominios prohibidos (solo Incident inyectado)', () => {
    const ctorArgs = IncidentActionsProvider.length;
    assert.equal(ctorArgs, 1);
  });
});

describe('IA-PROVIDER: contrato y metadata', () => {
  it('4. contrato estándar: module/percentage/status/findings/pending/completed/phases.act', async () => {
    const { model } = buildFakeModel([buildDoc()]);
    const provider = new IncidentActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.module, 'incident-actions');
    assert.equal(typeof result.percentage, 'number');
    assert.ok(['TARGET_MET', 'TARGET_NOT_MET'].includes(result.status as string));
    assert.ok(Array.isArray(result.findings));
    assert.deepEqual(result.phases, { act: result.percentage });
    assert.equal(result.completed, 1);
  });

  it('5. metadata dimensions:v1 completa (code/title/formula/target/weights/dimensions/counters)', async () => {
    const { model } = buildFakeModel([buildDoc()]);
    const provider = new IncidentActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.standardCode, '7.1.3');
    assert.equal(meta.standardTitle, 'Acciones por accidentes');
    assert.equal(meta.formula, 'dimensions:v1');
    assert.equal(meta.target, 90);
    assert.deepEqual(meta.weights, { investigation: 25, causalAnalysis: 20, actions: 20, execution: 20, evidence: 15 });
    assert.ok(meta.dimensions);
    assert.ok(meta.counters);
    assert.ok(meta.latestIncident);
  });

  it('6. NO_DATA: contract completo con phases.act=0 y finding no-data', async () => {
    const { model } = buildFakeModel([]);
    const provider = new IncidentActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.deepEqual(result.phases, { act: 0 });
    assert.ok(result.findings.some((f) => f.id === 'incident-actions-no-data'));
  });

  it('7. findings del provider = findings del scorer (misma fuente, sin recálculo)', async () => {
    const { model } = buildFakeModel([
      buildDoc({
        investigationDate: undefined,
        investigationResponsibleUserId: undefined,
        immediateCauses: [],
        basicCauses: [],
        relatedFactors: [],
        conclusions: undefined,
        recommendations: undefined,
      }),
    ]);
    const provider = new IncidentActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    const ids = result.findings.map((f) => f.id);
    assert.ok(ids.includes('incident-actions-no-investigation'));
    assert.ok(ids.includes('incident-actions-incomplete-causal-analysis'));
  });
});

describe('IA-ANALYZER (IA oficial 7.1.3)', () => {
  const analyzer = new IncidentActionsStandardAnalyzer();

  it('8. soporta 7.1.3 con module incident-actions (único analyzer)', () => {
    assert.equal(analyzer.supports('7.1.3'), true);
    assert.equal(analyzer.supports('7.1.1'), false);
    assert.equal(analyzer.getModule(), 'incident-actions');
  });

  it('9. NO_DATA: narrativa explica exclusión de DISEASE sin inventar datos', () => {
    const interpretation = analyzer.analyze({
      standardCode: '7.1.3',
      moduleCompliance: {
        module: 'incident-actions',
        compliance: 0,
        level: 'CRITICAL',
        lastUpdated: new Date().toISOString(),
        status: 'NO_DATA',
        metadata: {
          formula: 'dimensions:v1',
          noDataReason: 'no-evaluable-cases',
          counters: { diseasesExcluded: 2, evaluableIncidents: 0 },
        },
      },
      findings: [
        {
          id: 'incident-actions-no-data',
          module: 'incident-actions',
          title: 'Sin casos evaluable',
          description: 'No existen casos de accidente o incidente',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    } as never);
    assert.match(interpretation.summary, /3\.2\.2/);
    assert.match(interpretation.summary, /2 caso\(s\) de enfermedad laboral/);
    assert.equal(interpretation.keyIssues.length, 0);
  });

  it('10. findings oficiales → keyIssues con recomendaciones estables', () => {
    const interpretation = analyzer.analyze({
      standardCode: '7.1.3',
      moduleCompliance: {
        module: 'incident-actions',
        compliance: 55,
        level: 'MEDIUM',
        lastUpdated: new Date().toISOString(),
        status: 'TARGET_NOT_MET',
        metadata: {
          formula: 'dimensions:v1',
          evaluatedPeriod: '2026',
          counters: {
            evaluableIncidents: 2,
            accidents: 1,
            incidents: 1,
            diseasesExcluded: 0,
            casesWithoutInvestigation: 1,
            casesWithoutCausalAnalysis: 1,
            casesWithoutActions: 0,
            overdueActions: 1,
            pendingActions: 2,
            actionsWithoutEvidence: 1,
            casesClosed: 0,
            casesNotClosed: 2,
          },
        },
      },
      findings: [
        {
          id: 'incident-actions-overdue',
          module: 'incident-actions',
          title: '1 acción(es) vencida(s) sin cierre',
          description: 'Existen acciones vencidas',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    } as never);
    assert.ok(interpretation.keyIssues.length >= 1);
    assert.equal(interpretation.keyIssues[0].id, 'incident-actions-overdue');
    assert.ok(interpretation.summary.includes('1 acción(es) vencida(s)'));
  });

  it('11. metrics exponen porcentajes oficiales y ratios dimensionales', () => {
    const metrics = analyzer.getMetrics({
      standardCode: '7.1.3',
      moduleCompliance: {
        module: 'incident-actions',
        compliance: 78,
        level: 'HIGH',
        lastUpdated: new Date().toISOString(),
        metadata: {
          formula: 'dimensions:v1',
          counters: { totalIncidents: 3, evaluableIncidents: 2, overdueActions: 0 },
          dimensions: {
            investigation: { ratio: 1 },
            causalAnalysis: { ratio: 0.75 },
            actions: { ratio: 1 },
            execution: { ratio: 0.5 },
            evidence: { ratio: 0.66 },
          },
        },
      },
      findings: [],
    } as never);
    const m = metrics as Record<string, unknown>;
    assert.equal(m.compliancePercentage, 78);
    assert.equal(m.investigationRatio, 1);
    assert.equal(m.causalAnalysisRatio, 0.75);
    assert.equal(m.executionRatio, 0.5);
  });
});
