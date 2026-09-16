import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * FASE 34B — Verificación estructural (source-level) del cableado del módulo
 * 3.1.8: registro en AppModule y en ComplianceEngineModule, y frontera
 * anti-double-scoring (el provider 3.1.8 SOLO importa su propia colección).
 */

const BACKEND_ROOT = resolve(__dirname, '../../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(BACKEND_ROOT, relativePath), 'utf-8');
}

describe('FASE 34B — Cableado estructural del módulo 3.1.8', () => {
  it('WorkplaceSanitaryConditionsModule está registrado en AppModule', () => {
    const source = readSource('src/app.module.ts');
    assert.match(source, /WorkplaceSanitaryConditionsModule/);
    assert.match(source, /workplace-sanitary-conditions\/workplace-sanitary-conditions\.module/);
  });

  it('ComplianceEngineModule registra el schema propio y el provider', () => {
    const source = readSource('src/modules/compliance-engine/compliance-engine.module.ts');
    assert.match(source, /WorkplaceSanitaryConditionSchema/);
    assert.match(source, /WorkplaceSanitaryConditionsProvider/);
  });

  it('ComplianceEngineService inyecta y lista el provider 3.1.8', () => {
    const source = readSource('src/modules/compliance-engine/compliance-engine.service.ts');
    assert.match(source, /WorkplaceSanitaryConditionsProvider/);
    assert.match(source, /this\.workplaceSanitaryConditionsProvider/);
  });

  it('FRONTERA: el provider 3.1.8 solo importa su propia colección', () => {
    const source = readSource(
      'src/modules/compliance-engine/providers/workplace-sanitary-conditions.provider.ts',
    );
    // Imports locales permitidos: schema propio + contratos del engine.
    assert.match(source, /workplace-sanitary-conditions\/schemas\/workplace-sanitary-condition\.schema/);
    // Extraer SOLO las sentencias import (los comentarios pueden citar los
    // nombres de módulos ajenos para documentar la frontera).
    const importBlock = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    // NO importa modelos ajenos (evidencia de otros estándares).
    assert.doesNotMatch(importBlock, /InspectionActivity/);
    assert.doesNotMatch(importBlock, /EnvironmentalMeasurement/);
    assert.doesNotMatch(importBlock, /HazardousSubstance/);
    assert.doesNotMatch(importBlock, /HealthPromotionActivity/);
    assert.doesNotMatch(importBlock, /WorkRestriction/);
    assert.doesNotMatch(importBlock, /JobProfile/);
    assert.doesNotMatch(importBlock, /DocumentMaster/);
    assert.doesNotMatch(importBlock, /Employee/);
  });

  it('FRONTERA: el provider declara la regla anti-double-scoring en su contrato', () => {
    const source = readSource(
      'src/modules/compliance-engine/providers/workplace-sanitary-conditions.provider.ts',
    );
    assert.match(source, /EXCLUSIVAMENTE de WorkplaceSanitaryCondition/);
    assert.match(source, /Employee se utiliza[\s*]+ÚNICAMENTE como[\s*]+denominador/);
  });

  it('el analyzer 3.1.8 está registrado en StandardAnalysisService', () => {
    const source = readSource(
      'src/modules/compliance-ai/standard-analysis/standard-analysis.service.ts',
    );
    assert.match(source, /WorkplaceSanitaryConditionsStandardAnalyzer/);
    assert.match(source, /'3\.1\.8'/);
  });
});
