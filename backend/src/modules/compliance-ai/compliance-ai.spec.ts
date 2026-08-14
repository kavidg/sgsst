import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model } from 'mongoose';

import { AIContext } from '../ai/interfaces/ai-context.interface';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import { EvaluationsService } from '../../evaluations/evaluations.service';
import { InitialEvaluation, InitialEvaluationDocument } from '../initial-evaluation/schemas/initial-evaluation.schema';
import { ComplianceAIEngine } from './compliance-ai.service';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';

function buildContext(companyId: string | null): AIContext {
  return { userId: 'uid-test', companyId, timestamp: new Date(), question: '¿cómo va el cumplimiento?' };
}

function buildEngine(overrides?: {
  company?: unknown;
  evaluations?: unknown[];
  overview?: unknown;
  documents?: unknown[];
  initialEvaluation?: unknown;
}): ComplianceAIEngine {
  const companyModel = {
    // Sin async: findById() debe devolver el objeto encadenable (Query) para .exec().
    findById: () => ({ exec: async () => overrides?.company ?? null }),
  } as unknown as Model<CompanyDocument>;
  const initialEvaluationModel = {
    // Sin async: findOne() devuelve el Query; .lean().exec() completa la cadena.
    findOne: () => ({
      lean: () => ({ exec: async () => overrides?.initialEvaluation ?? null }),
    }),
  } as unknown as Model<InitialEvaluationDocument>;
  const evaluationsService = {
    findAllByCompany: async () => overrides?.evaluations ?? [],
  } as unknown as EvaluationsService;
  const complianceEngineService = {
    getOverview: async () => overrides?.overview ?? null,
  } as unknown as ComplianceEngineService;
  const documentMasterService = {
    findAll: async () => overrides?.documents ?? [],
  } as unknown as DocumentMasterService;

  return new ComplianceAIEngine(
    companyModel,
    initialEvaluationModel,
    evaluationsService,
    complianceEngineService,
    documentMasterService,
  );
}

describe('ComplianceAIEngine.analyzeCompliance', () => {
  it('construye el resultado con datos reales (marco 21 estándares + autoevaluaciones + evaluación inicial)', async () => {
    const engine = buildEngine({
      company: { _id: COMPANY_ID, standardsType: '21' },
      evaluations: [
        { code: '1.1.1', status: 'CUMPLE' },
        { code: '1.1.2', status: 'NO_CUMPLE' },
        { code: '1.1.3', status: 'CUMPLE' },
      ],
      overview: {
        overallCompliance: 72,
        findings: [
          { title: 'Falta política SST', priority: 'CRITICAL' },
          { title: 'Sin COPASST', priority: 'HIGH' },
          { title: 'Evidencia pendiente', priority: 'LOW' },
        ],
        recommendations: [{ title: 'Crear política SST' }, { title: 'Conformar COPASST' }],
      },
      documents: [{ name: 'Política SST v1' }],
      initialEvaluation: {
        standards: [
          { code: '1.1.1', status: 'Cumple' },
          { code: '2.1.1', status: 'No Cumple' },
        ],
        overallCompliance: 65,
        gaps: [{ code: '2.1.1', recommendedAction: 'Crear política SST' }],
        findings: [{ title: 'Incumplimiento legal', severity: 'Critical' }],
      },
    });

    const result = await engine.analyzeCompliance(COMPANY_ID);

    // Estructura completa
    assert.deepEqual(Object.keys(result).sort(), [
      'completed',
      'criticalFindings',
      'overall',
      'pending',
      'recommendations',
      'standardLevel',
    ]);

    // Marco de estándares aplicables
    assert.equal(result.standardLevel, '21 estándares');

    // overall reutiliza el Compliance Engine (fuente única de verdad)
    assert.equal(result.overall, 72);

    // completed/pending: estándares (1 Cumple) + autoevaluaciones (2 CUMPLE / 1 NO_CUMPLE)
    assert.equal(result.completed, 3);
    assert.equal(result.pending, 2);

    // Hallazgos críticos/altos deduplicados (overview + evaluación inicial)
    assert.ok(result.criticalFindings.includes('Falta política SST'));
    assert.ok(result.criticalFindings.includes('Sin COPASST'));
    assert.ok(result.criticalFindings.includes('Incumplimiento legal'));
    assert.equal(result.criticalFindings.length, 3);

    // Recomendaciones reales deduplicadas
    assert.ok(result.recommendations.includes('Crear política SST'));
    assert.ok(result.recommendations.includes('Conformar COPASST'));
  });

  it('retorna ceros y arrays vacíos cuando no existen datos', async () => {
    const engine = buildEngine();

    const result = await engine.analyzeCompliance(COMPANY_ID);

    assert.equal(result.overall, 0);
    assert.equal(result.standardLevel, 'Sin catálogo de estándares');
    assert.equal(result.completed, 0);
    assert.equal(result.pending, 0);
    assert.deepEqual(result.criticalFindings, []);
    assert.deepEqual(result.recommendations, []);
  });

  it('soporta marcos de 7 y 60 estándares', async () => {
    const engine7 = buildEngine({ company: { _id: COMPANY_ID, standardsType: '7' } });
    const engine60 = buildEngine({ company: { _id: COMPANY_ID, standardsType: '60' } });

    const result7 = await engine7.analyzeCompliance(COMPANY_ID);
    const result60 = await engine60.analyzeCompliance(COMPANY_ID);

    assert.equal(result7.standardLevel, '7 estándares');
    assert.equal(result60.standardLevel, '60 estándares');
  });

  it('consume los findings y recomendaciones reales de 1.1.7 (copasst-training) desde el overview', async () => {
    // Fase 6 registró CopasstTrainingProvider en el Compliance Engine: sus
    // findings/recomendaciones llegan al overview y ComplianceAI los consume
    // sin duplicar reglas ni inventar datos.
    const engine = buildEngine({
      company: { _id: COMPANY_ID, standardsType: '60' },
      overview: {
        overallCompliance: 40,
        findings: [
          {
            title: 'Programa de capacitación COPASST no registrado',
            priority: 'HIGH',
            module: 'copasst-training',
          },
        ],
        recommendations: [{ title: 'Capacitar integrantes COPASST' }],
      },
    });

    const result = await engine.analyzeCompliance(COMPANY_ID);

    // Los hallazgos HIGH de 1.1.7 aparecen como hallazgos de alta prioridad.
    assert.ok(result.criticalFindings.includes('Programa de capacitación COPASST no registrado'));
    // La recomendación generada por el provider de 1.1.7 se expone al usuario.
    assert.ok(result.recommendations.includes('Capacitar integrantes COPASST'));
    // No se inventa un porcentaje de 1.1.7: se reutiliza el overview real.
    assert.equal(result.overall, 40);
  });
});

describe('ComplianceAIEngine.execute', () => {
  it('responde "Información insuficiente para análisis de cumplimiento" cuando no hay datos', async () => {
    const engine = buildEngine();

    const result = await engine.execute('¿cómo va el cumplimiento?', buildContext(COMPANY_ID));

    assert.equal(result.action, 'compliance_analysis');
    assert.equal(result.response, 'Información insuficiente para análisis de cumplimiento');
    assert.equal(result.confidence, 0.2);
  });

  it('responde "Información insuficiente" sin companyId', async () => {
    const engine = buildEngine();

    const result = await engine.execute('¿cómo va el cumplimiento?', buildContext(null));

    assert.equal(result.response, 'Información insuficiente para análisis de cumplimiento');
  });

  it('responde "Información insuficiente" cuando la empresa solo tiene documentos (sin fuentes de evaluación)', async () => {
    const engine = buildEngine({
      documents: [{ name: 'Política SST v1' }],
    });

    const result = await engine.execute('¿cómo va el cumplimiento?', buildContext(COMPANY_ID));

    // Los documentos/evidencias por sí solos no sustentan un porcentaje de
    // cumplimiento: no se debe afirmar un "0%" engañoso.
    assert.equal(result.response, 'Información insuficiente para análisis de cumplimiento');
    assert.equal(result.confidence, 0.2);
  });

  it('responde con análisis inteligente cuando existen datos reales', async () => {
    const engine = buildEngine({
      company: { _id: COMPANY_ID, standardsType: '21' },
      evaluations: [{ code: '1.1.1', status: 'CUMPLE' }],
      overview: { overallCompliance: 72, findings: [], recommendations: [] },
      documents: [{ name: 'Política SST v1' }],
      initialEvaluation: { standards: [], overallCompliance: 65, gaps: [], findings: [] },
    });

    const result = await engine.execute('¿cómo va el cumplimiento?', buildContext(COMPANY_ID));

    assert.equal(result.action, 'compliance_analysis');
    assert.match(result.response, /El cumplimiento SG-SST es del 72%/);
    assert.match(result.response, /21 estándares/);
    assert.ok(result.confidence > 0.5);
    assert.ok(result.suggestions.length > 0);
  });
});
