import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATALOG_60 } from './constants/catalog-60';
import { StandardCatalogService } from './standard-catalog.service';

/**
 * FASE 34B — Promoción del estándar 3.1.8 a IMPLEMENTED (EXACT).
 *
 * 3.1.8 "Agua potable, servicios sanitarios y disposición de basuras":
 * - módulo propio workplace-sanitary-conditions (FASE 34A recomendó Opción B).
 * - provider EXACT workplace-sanitary-conditions.provider.
 * - phase HACER (do), niveles ['60'], peso normativo intacto (1).
 * - frontera anti-double-scoring: evidencia EXCLUSIVA de WorkplaceSanitaryCondition.
 */
describe('FASE 34B — 3.1.8 Agua potable, servicios sanitarios y disposición de basuras (IMPLEMENTED · EXACT)', () => {
  const STANDARD = CATALOG_60.find((s) => s.code === '3.1.8');

  it('3.1.8 existe con título y descripción normativos correctos', () => {
    assert.ok(STANDARD, '3.1.8 presente en el catálogo');
    assert.equal(STANDARD.title, 'Agua potable, servicios sanitarios y disposición de basuras');
    assert.ok(STANDARD.description.includes('agua potable'));
    assert.ok(STANDARD.description.includes('servicios sanitarios'));
    assert.ok(STANDARD.description.includes('residuos sólidos'));
  });

  it('3.1.8 es IMPLEMENTED con provider EXACT (workplace-sanitary-conditions)', () => {
    assert.ok(STANDARD, '3.1.8 presente');
    assert.equal(STANDARD.implementationStatus, 'IMPLEMENTED', '3.1.8 IMPLEMENTED (FASE 34B)');
    assert.equal(STANDARD.semantic, 'EXACT', 'semántica EXACT');
    assert.equal(
      STANDARD.validationProvider,
      'workplace-sanitary-conditions.provider',
      'provider EXACT de 3.1.8 registrado',
    );
  });

  it('3.1.8 tiene moduleRoute a la pantalla de gestión', () => {
    assert.ok(STANDARD, '3.1.8 presente');
    assert.equal(STANDARD.moduleRoute, '/workplace-sanitary-conditions');
  });

  it('3.1.8 mantiene su peso normativo intacto (1) y metadata PHVA', () => {
    assert.ok(STANDARD, '3.1.8 presente');
    assert.equal(STANDARD.normativeWeight, 1, 'peso normativo no alterado');
    assert.equal(STANDARD.phva, 'HACER');
    assert.deepEqual(STANDARD.applicableLevels, ['60']);
  });

  it('3.1.8 no tiene classification (implícitamente OFFICIAL)', () => {
    assert.ok(STANDARD, '3.1.8 presente');
    assert.equal(STANDARD.classification, undefined);
  });

  it('3.1.8 tiene criteria/modeReview normativos con frontera anti-double-scoring', () => {
    assert.ok(STANDARD, '3.1.8 presente');
    assert.ok(STANDARD.criteria && STANDARD.criteria.length > 0, 'criteria normativo presente');
    assert.ok(STANDARD.modeReview && STANDARD.modeReview.length > 0, 'modeReview presente');
    assert.equal(STANDARD.section?.id, 'do-condiciones-salud', 'sección PHVA HACER');
    // La frontera normativa queda documentada en modeReview.
    assert.match(STANDARD.modeReview, /EXCLUSIVAMENTE de WorkplaceSanitaryCondition/);
    assert.match(STANDARD.modeReview, /4\.2\.4/);
    assert.match(STANDARD.modeReview, /4\.1\.4/);
  });

  it('3.1.8 entra al catálogo efectivo (puntúa)', () => {
    const service = new StandardCatalogService();
    const effective = service.getEffectiveCatalog('60');
    const found = effective.standards.find((s) => s.code === '3.1.8');
    assert.ok(found, '3.1.8 IMPLEMENTED debe estar en el catálogo efectivo');
    assert.ok((found.effectiveWeight ?? 0) > 0, '3.1.8 debe tener peso efectivo positivo');
  });

  it('3.1.9 es IMPLEMENTED desde FASE 34C (módulo propio, frontera con 3.1.8)', () => {
    const std3_1_9 = CATALOG_60.find((s) => s.code === '3.1.9');
    assert.ok(std3_1_9, '3.1.9 presente');
    assert.equal(std3_1_9.implementationStatus, 'IMPLEMENTED', '3.1.9 IMPLEMENTED (FASE 34C)');
    assert.equal(std3_1_9.moduleRoute, '/waste-management', 'módulo propio de 3.1.9');
    assert.equal(std3_1_9.validationProvider, 'waste-management.provider');
    // Frontera 3.1.8 ≠ 3.1.9: módulos y providers distintos.
    assert.notEqual(std3_1_9.moduleRoute, STANDARD?.moduleRoute);
    assert.notEqual(std3_1_9.validationProvider, STANDARD?.validationProvider);
  });
});
