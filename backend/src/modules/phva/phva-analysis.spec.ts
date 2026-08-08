import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PhvaEngine } from '../ai/engines/phva.engine';
import { AIContext } from '../ai/interfaces/ai-context.interface';
import { AnnualWorkPlanService } from '../annual-work-plan/services/annual-work-plan.service';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import { PhvaAnalysisService } from './phva-analysis.service';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const COMPANY_WITHOUT_DATA = '64b000000000000000000002';

function buildContext(companyId: string | null): AIContext {
  return { userId: 'uid-test', companyId, timestamp: new Date(), question: '¿cómo va el plan?' };
}

describe('PhvaAnalysisService', () => {
  it('construye la estructura planear/hacer/verificar/actuar con datos reales', async () => {
    const service = new PhvaAnalysisService(
      {
        getOverview: async () => ({
          overallCompliance: 80,
          phaseCompliance: { plan: 80, do: 60, check: 75, act: 50 },
          findings: [
            { title: 'Hallazgo medio', priority: 'MEDIUM' },
            { title: 'Hallazgo alto', priority: 'HIGH' },
            { title: 'Hallazgo crítico', priority: 'CRITICAL' },
          ],
        }),
      } as unknown as ComplianceEngineService,
      {
        findCurrent: async () => ({ _id: 'plan-id' }),
        getActivities: async () => [
          { title: 'Actividad pendiente 1', status: 'Pending' },
          { title: 'Actividad en curso', status: 'InProgress' },
          { title: 'Actividad retrasada', status: 'Delayed' },
          { title: 'Actividad completada', status: 'Completed' },
        ],
      } as unknown as AnnualWorkPlanService,
      {
        findAll: async () => [
          { name: 'Política en borrador', status: 'DRAFT' },
          { name: 'Procedimiento en revisión', status: 'UNDER_REVIEW' },
          { name: 'Manual pendiente de aprobación', status: 'PENDING_APPROVAL' },
          { name: 'Formato aprobado', status: 'APPROVED' },
        ],
      } as unknown as DocumentMasterService,
    );

    const result = await service.analyzeCompanyPHVA(COMPANY_ID);

    // Estructura completa (overall + 4 fases)
    assert.deepEqual(Object.keys(result).sort(), ['actuar', 'hacer', 'overall', 'planear', 'verificar']);
    assert.equal(result.overall, 80);
    for (const phase of ['planear', 'hacer', 'verificar', 'actuar'] as const) {
      assert.equal(typeof result[phase].percentage, 'number');
      assert.ok(Array.isArray(result[phase].pending));
    }

    // Porcentajes del Compliance Engine
    assert.equal(result.planear.percentage, 80);
    assert.equal(result.hacer.percentage, 60);
    assert.equal(result.verificar.percentage, 75);
    assert.equal(result.actuar.percentage, 50);

    // Pendientes reales mapeados por fase
    assert.ok(result.planear.pending.includes('Actividad pendiente 1'));
    assert.ok(result.planear.pending.includes('Política en borrador'));
    assert.ok(result.hacer.pending.includes('Actividad en curso'));
    assert.ok(result.hacer.pending.includes('Actividad retrasada'));
    assert.ok(result.verificar.pending.includes('Manual pendiente de aprobación'));
    assert.ok(result.actuar.pending.includes('Hallazgo alto'));
    assert.ok(result.actuar.pending.includes('Hallazgo crítico'));
    // Sin datos inventados: no debe incluir la actividad completada
    assert.ok(!result.planear.pending.includes('Actividad completada'));
  });

  it('no rompe cuando un módulo no tiene datos (empresa sin plan ni documentos)', async () => {
    const service = new PhvaAnalysisService(
      {
        getOverview: async () => ({
          overallCompliance: 0,
          phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 },
          findings: [],
        }),
      } as unknown as ComplianceEngineService,
      {
        findCurrent: async () => {
          throw new Error('No annual work plan found');
        },
      } as unknown as AnnualWorkPlanService,
      {
        findAll: async () => [],
      } as unknown as DocumentMasterService,
    );

    const result = await service.analyzeCompanyPHVA(COMPANY_WITHOUT_DATA);

    assert.equal(result.overall, 0);
    assert.equal(result.planear.percentage, 0);
    assert.deepEqual(result.planear.pending, []);
    assert.deepEqual(result.actuar.pending, []);
  });
});

describe('PhvaEngine', () => {
  const withDataStub = {
    analyzeCompanyPHVA: async () => ({
      overall: 80,
      planear: { percentage: 80, pending: ['Actividad pendiente A'] },
      hacer: { percentage: 60, pending: [] },
      verificar: { percentage: 75, pending: [] },
      actuar: { percentage: 50, pending: ['Hallazgo crítico'] },
    }),
  } as unknown as PhvaAnalysisService;

  const emptyStub = {
    analyzeCompanyPHVA: async () => ({
      overall: 0,
      planear: { percentage: 0, pending: [] },
      hacer: { percentage: 0, pending: [] },
      verificar: { percentage: 0, pending: [] },
      actuar: { percentage: 0, pending: [] },
    }),
  } as unknown as PhvaAnalysisService;

  it('responde "Información insuficiente para análisis" cuando no hay datos', async () => {
    const engine = new PhvaEngine(emptyStub);

    const result = await engine.execute('¿cómo va el plan?', buildContext(COMPANY_WITHOUT_DATA));

    assert.equal(result.action, 'phva_analysis');
    assert.equal(result.response, 'Información insuficiente para análisis');
    assert.equal(result.confidence, 0.2);
  });

  it('responde "Información insuficiente para análisis" sin companyId', async () => {
    const engine = new PhvaEngine(withDataStub);

    const result = await engine.execute('¿cómo va el plan?', buildContext(null));

    assert.equal(result.response, 'Información insuficiente para análisis');
    assert.equal(result.confidence, 0.2);
  });

  it('responde con análisis inteligente cuando existen datos reales', async () => {
    const engine = new PhvaEngine(withDataStub);

    const result = await engine.execute('¿cómo va el plan?', buildContext(COMPANY_ID));

    assert.equal(result.action, 'phva_analysis');
    assert.match(result.response, /El cumplimiento actual del ciclo PHVA es \d+%/);
    assert.match(result.response, /oportunidades de mejora/);
    assert.ok(result.confidence > 0.5);
    assert.ok(result.suggestions.length > 0);
  });
});
