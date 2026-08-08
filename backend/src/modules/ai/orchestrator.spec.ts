import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PhvaAnalysisService } from '../phva/phva-analysis.service';
import { AlertsEngine } from './engines/alerts.engine';
import { DocumentsEngine } from './engines/documents.engine';
import { IndicatorsEngine } from './engines/indicators.engine';
import { PhvaEngine } from './engines/phva.engine';
import { AIContext } from './interfaces/ai-context.interface';
import { AIEngine } from './interfaces/ai-engine.interface';
import { OrchestratorService } from './orchestrator.service';
import { resolveEngineName } from './utils/intent-router';

const phvaAnalysisStub = {
  analyzeCompanyPHVA: async () => ({
    overall: 80,
    planear: { percentage: 80, pending: ['Actividad pendiente A'] },
    hacer: { percentage: 60, pending: [] },
    verificar: { percentage: 75, pending: [] },
    actuar: { percentage: 50, pending: ['Hallazgo crítico'] },
  }),
} as unknown as PhvaAnalysisService;

const ENGINES: readonly AIEngine[] = [
  new IndicatorsEngine(),
  new DocumentsEngine(),
  new PhvaEngine(phvaAnalysisStub),
  new AlertsEngine(),
];

function buildContext(question: string): AIContext {
  return {
    userId: 'uid-test',
    companyId: 'company-test',
    timestamp: new Date(),
    question,
  };
}

describe('intent-router', () => {
  it('enruta "cumplimiento" a indicators', () => {
    assert.equal(resolveEngineName('¿Cómo va el cumplimiento?'), 'indicators');
  });

  it('enruta "indicador" y "avance" a indicators', () => {
    assert.equal(resolveEngineName('muéstrame el indicador de ausentismo'), 'indicators');
    assert.equal(resolveEngineName('¿cuál es el avance del plan?'), 'indicators');
  });

  it('enruta "documento" y "evidencia" a documents', () => {
    assert.equal(resolveEngineName('¿qué documentos están vencidos?'), 'documents');
    assert.equal(resolveEngineName('faltan evidencias de la capacitación'), 'documents');
  });

  it('enruta "plan" y "actividad" a phva', () => {
    assert.equal(resolveEngineName('¿cómo va el plan anual?'), 'phva');
    assert.equal(resolveEngineName('actividades pendientes del plan'), 'phva');
  });

  it('enruta "alerta" a alerts', () => {
    assert.equal(resolveEngineName('¿existen alertas críticas?'), 'alerts');
  });

  it('enruta "estándares" y "nivel de cumplimiento" a compliance', () => {
    assert.equal(resolveEngineName('¿qué estándares aplican a mi empresa?'), 'compliance');
    assert.equal(resolveEngineName('¿cuál es el nivel de cumplimiento SG-SST?'), 'compliance');
  });

  it('retorna null cuando ninguna regla coincide', () => {
    assert.equal(resolveEngineName('hola mundo'), null);
  });
});

describe('engines', () => {
  for (const engine of ENGINES) {
    it(`el engine ${engine.getName()} expone nombre y resultado estructurado`, async () => {
      const result = await engine.execute('consulta de prueba', buildContext('consulta de prueba'));

      assert.equal(typeof engine.getName(), 'string');
      assert.ok(engine.getName().length > 0);
      assert.equal(typeof result.action, 'string');
      assert.ok(result.confidence >= 0 && result.confidence <= 1);
      assert.ok(result.response.length > 0);
      assert.ok(Array.isArray(result.suggestions));
    });
  }
});

describe('OrchestratorService', () => {
  const service = new OrchestratorService(ENGINES);

  it('enruta y ejecuta el engine de indicadores', async () => {
    const response = await service.query('¿Cómo va el cumplimiento?', buildContext('¿Cómo va el cumplimiento?'));

    assert.equal(response.module, 'indicators');
    assert.equal(response.action, 'indicators_analysis');
    assert.ok(response.confidence > 0 && response.confidence <= 1);
    assert.ok(response.response.length > 0);
    assert.ok(Array.isArray(response.suggestions) && response.suggestions.length > 0);
  });

  it('retorna fallback de baja confianza cuando no hay coincidencia', async () => {
    const response = await service.query('hola mundo', buildContext('hola mundo'));

    assert.equal(response.module, 'general');
    assert.equal(response.action, 'clarify');
    assert.equal(response.confidence, 0.2);
    assert.ok(response.suggestions.length > 0);
  });

  it('el engine PHVA responde con análisis inteligente', async () => {
    const response = await service.query('¿cómo va el plan anual?', buildContext('¿cómo va el plan anual?'));

    assert.equal(response.module, 'phva');
    assert.equal(response.action, 'phva_analysis');
    assert.match(response.response, /El cumplimiento actual del ciclo PHVA es/);
    assert.ok(response.confidence > 0.5);
  });

  it('devuelve la estructura completa del contrato', async () => {
    const response = await service.query('¿cómo va el plan anual?', buildContext('¿cómo va el plan anual?'));

    assert.deepEqual(Object.keys(response).sort(), ['action', 'confidence', 'module', 'response', 'suggestions']);
  });
});
