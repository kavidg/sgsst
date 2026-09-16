import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BadRequestException } from '@nestjs/common';

import {
  AutoEvaluationResult,
  AutoResultStatus,
  PHVA_EVALUATION_ENGINE_VERSION,
} from './interfaces/auto-evaluation-result';
import { StandardRule } from './interfaces/standard-rule';
import { ResponsableSstRule } from './rules/responsable-sst.rule';
import { ResponsibilitiesRule } from './rules/responsibilities.rule';
import { ResourceAssignmentRule } from './rules/resource-assignment.rule';
import { PhvaEvaluationEngineService } from './phva-evaluation-engine.service';

// ============================================================
// Tests Orquestador — PhvaEvaluationEngineService (FASE 1)
// ============================================================
//
// El orquestador solo resuelve la regla por código y valida el companyId.
// NO persiste, NO genera alertas y NO modifica el estado manual: los mocks de
// regla verifican exactamente qué llamadas recibe el motor.

const COMPANY_ID = '64b000000000000000000021';

function buildFakeResult(code: string, status: AutoResultStatus): AutoEvaluationResult {
  return {
    code,
    status,
    ruleTrace: [{ requirement: 'Requisito de prueba', satisfied: true }],
    findings: [],
    missingInformation: [],
    evaluatedAt: new Date().toISOString(),
    engineVersion: PHVA_EVALUATION_ENGINE_VERSION,
  };
}

/** Regla de prueba que registra las llamadas recibidas (auditoría de efectos). */
function createStubRule(code: string, calls: string[]): StandardRule {
  return {
    supports: (candidate: string) => candidate === code,
    getModule: () => `stub/${code}`,
    evaluate: async (context) => {
      calls.push(`evaluate:${code}:${context.companyId}`);
      return buildFakeResult(code, AutoResultStatus.CUMPLE_TOTALMENTE);
    },
  };
}

function buildService(options: {
  implemented?: string[];
  calls?: string[];
}): PhvaEvaluationEngineService {
  const implemented = options.implemented ?? ['1.1.1'];
  const calls = options.calls ?? [];
  // El constructor real exige las tres reglas concretas; para probar la
  // resolución genérica se inyectan stubs por el mismo canal (cast explícito
  // por posición, sin any). Los stubs no usados resuelven códigos que ningún
  // test consulta.
  return new PhvaEvaluationEngineService(
    createStubRule(implemented[0] ?? '1.1.1', calls) as unknown as ResponsableSstRule,
    createStubRule(implemented[1] ?? '1.1.2', calls) as unknown as ResponsibilitiesRule,
    createStubRule(implemented[2] ?? '1.1.3', calls) as unknown as ResourceAssignmentRule,
  );
}

describe('PhvaEvaluationEngineService — orquestador (FASE 1)', () => {
  it('resuelve la regla existente y devuelve su resultado tipado', async () => {
    const calls: string[] = [];
    const service = buildService({ implemented: ['1.1.1'], calls });

    const result = await service.evaluateStandard(COMPANY_ID, '1.1.1');

    assert.equal(result.code, '1.1.1');
    assert.equal(result.status, AutoResultStatus.CUMPLE_TOTALMENTE);
    assert.equal(result.engineVersion, PHVA_EVALUATION_ENGINE_VERSION);
    assert.equal(typeof result.evaluatedAt, 'string');
    assert.ok(result.ruleTrace.length > 0);
    // La regla recibió exactamente una llamada, con el companyId validado.
    assert.deepEqual(calls, [`evaluate:1.1.1:${COMPANY_ID}`]);
  });

  it('devuelve PENDIENTE_ANALISIS con mensaje exacto para un código sin regla', async () => {
    const calls: string[] = [];
    const service = buildService({ implemented: [], calls });

    const result = await service.evaluateStandard(COMPANY_ID, '2.1.1');

    assert.equal(result.status, AutoResultStatus.PENDIENTE_ANALISIS);
    assert.deepEqual(result.missingInformation, [
      'Motor de evaluación no implementado para este estándar',
    ]);
    assert.equal(result.findings.length, 0);
    assert.equal(result.ruleTrace[0].satisfied, false);
    // Ninguna regla fue invocada (no hay regla que la soporte).
    assert.deepEqual(calls, []);
  });

  it('rechaza un companyId inválido con BadRequestException antes de consultar reglas', async () => {
    const calls: string[] = [];
    const service = buildService({ implemented: ['1.1.1'], calls });

    await assert.rejects(
      service.evaluateStandard('no-es-un-objectid', '1.1.1'),
      (error: unknown) => error instanceof BadRequestException,
    );
    assert.deepEqual(calls, []);
  });

  it('rechaza un código de estándar con formato no canónico con NotFoundException', async () => {
    const calls: string[] = [];
    const service = buildService({ implemented: ['1.1.1'], calls });

    await assert.rejects(
      service.evaluateStandard(COMPANY_ID, 'codigo-falso'),
      (error: unknown) => error instanceof Error && error.message.includes('Unknown standard code'),
    );
    assert.deepEqual(calls, []);
  });

  it('evaluateCompany evalúa todos los estándares con regla activa y solo consulta lectura', async () => {
    const calls: string[] = [];
    const service = buildService({ implemented: ['1.1.1', '1.1.2', '1.1.3'], calls });

    const results = await service.evaluateCompany(COMPANY_ID);

    assert.equal(results.length, 3);
    assert.deepEqual(
      results.map((result) => result.code),
      ['1.1.1', '1.1.2', '1.1.3'],
    );
    assert.deepEqual(calls, [
      `evaluate:1.1.1:${COMPANY_ID}`,
      `evaluate:1.1.2:${COMPANY_ID}`,
      `evaluate:1.1.3:${COMPANY_ID}`,
    ]);
  });

  it('no expone operaciones de escritura (solo consulta): sin métodos mutadores', () => {
    const service = buildService({ implemented: ['1.1.1'] });
    const allMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(service) as object,
    ).filter((name) => name !== 'constructor');
    // La API pública del motor es evaluateStandard/evaluateCompany. Los
    // helpers privados emitidos por TS (assert*/build*) no son mutadores.
    const writeMethods = allMethods.filter((name) =>
      /^(save|create|update|delete|remove|upsert|insert|persist|patch)/i.test(name),
    );
    assert.deepEqual(writeMethods, []);
    assert.ok(allMethods.includes('evaluateStandard'));
    assert.ok(allMethods.includes('evaluateCompany'));
  });
});
