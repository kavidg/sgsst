import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * FASE 34C — Verificación estructural (source-level) del cableado del módulo
 * 3.1.9: registro en AppModule y en ComplianceEngineModule, y frontera
 * anti-double-scoring (el provider 3.1.9 SOLO importa sus propias colecciones
 * WasteManagementRecord + WasteTypeDeclaration).
 */

const BACKEND_ROOT = resolve(__dirname, '../../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(BACKEND_ROOT, relativePath), 'utf-8');
}

describe('FASE 34C — Cableado estructural del módulo 3.1.9', () => {
  it('WasteManagementModule está registrado en AppModule', () => {
    const source = readSource('src/app.module.ts');
    assert.match(source, /WasteManagementModule/);
    assert.match(source, /waste-management\/waste-management\.module/);
  });

  it('ComplianceEngineModule registra los schemas propios y el provider', () => {
    const source = readSource('src/modules/compliance-engine/compliance-engine.module.ts');
    assert.match(source, /WasteManagementRecordSchema/);
    assert.match(source, /WasteTypeDeclarationSchema/);
    assert.match(source, /WasteManagementProvider/);
  });

  it('ComplianceEngineService inyecta y lista el provider 3.1.9', () => {
    const source = readSource('src/modules/compliance-engine/compliance-engine.service.ts');
    assert.match(source, /WasteManagementProvider/);
    assert.match(source, /this\.wasteManagementProvider/);
  });

  it('FRONTERA: el provider 3.1.9 solo importa sus propias colecciones', () => {
    const source = readSource(
      'src/modules/compliance-engine/providers/waste-management.provider.ts',
    );
    // Imports locales permitidos: schemas propios + contratos del engine.
    assert.match(
      source,
      /waste-management\/schemas\/waste-management-record\.schema/,
    );
    assert.match(source, /waste-management\/schemas\/waste-type-declaration\.schema/);
    // Extraer SOLO las sentencias import (los comentarios pueden citar los
    // nombres de módulos ajenos para documentar la frontera).
    const importBlock = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    // NO importa modelos ajenos (evidencia de otros estándares).
    assert.doesNotMatch(importBlock, /HazardousSubstance/);
    assert.doesNotMatch(importBlock, /EnvironmentalMeasurement/);
    assert.doesNotMatch(importBlock, /InspectionActivity/);
    assert.doesNotMatch(importBlock, /Maintenance/);
    assert.doesNotMatch(importBlock, /HealthPromotionActivity/);
    assert.doesNotMatch(importBlock, /WorkplaceSanitaryCondition/);
    assert.doesNotMatch(importBlock, /WorkRestriction/);
    assert.doesNotMatch(importBlock, /JobProfile/);
    assert.doesNotMatch(importBlock, /DocumentMaster/);
    assert.doesNotMatch(importBlock, /Employee/);
  });

  it('FRONTERA: el provider declara la regla anti-double-scoring en su contrato', () => {
    const source = readSource(
      'src/modules/compliance-engine/providers/waste-management.provider.ts',
    );
    assert.match(source, /EXCLUSIVAMENTE WasteManagementRecord/);
    assert.match(source, /Employee se utiliza[\s*]+ÚNICAMENTE[\s*]+como[\s*]+denominador/);
  });

  it('FRONTERA 3.1.8 ≠ 3.1.9: ningún provider consume la colección del otro', () => {
    const wasteProvider = readSource(
      'src/modules/compliance-engine/providers/waste-management.provider.ts',
    );
    const sanitaryProvider = readSource(
      'src/modules/compliance-engine/providers/workplace-sanitary-conditions.provider.ts',
    );
    // El provider 3.1.9 NO consume WorkplaceSanitaryCondition.
    const wasteImports = wasteProvider
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    assert.doesNotMatch(wasteImports, /WorkplaceSanitaryCondition/);
    // El provider 3.1.8 NO consume WasteManagementRecord.
    const sanitaryImports = sanitaryProvider
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    assert.doesNotMatch(sanitaryImports, /WasteManagementRecord/);
  });

  it('el analyzer 3.1.9 está registrado en StandardAnalysisService', () => {
    const source = readSource(
      'src/modules/compliance-ai/standard-analysis/standard-analysis.service.ts',
    );
    assert.match(source, /WasteManagementStandardAnalyzer/);
    assert.match(source, /'3\.1\.9'/);
  });
});
