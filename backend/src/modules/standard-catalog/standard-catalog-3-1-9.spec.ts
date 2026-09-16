import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATALOG_60 } from './constants/catalog-60';
import { StandardCatalogService } from './standard-catalog.service';

/**
 * FASE 34C — Promoción del estándar 3.1.9 a IMPLEMENTED (EXACT).
 *
 * 3.1.9 "Eliminación adecuada de residuos sólidos, líquidos o gaseosos":
 * - módulo propio waste-management (FASE 34A recomendó Opción B).
 * - provider EXACT waste-management.provider.
 * - phase HACER (do), niveles ['60'], peso normativo intacto (1).
 * - frontera anti-double-scoring: evidencia EXCLUSIVA de WasteManagementRecord
 *   (HazardousSubstance, EnvironmentalMeasurement, InspectionActivity y
 *   DocumentMaster NO son fuente de puntuación).
 * - frontera con 3.1.8: módulo, colección y provider distintos.
 */
describe('FASE 34C — 3.1.9 Eliminación adecuada de residuos (IMPLEMENTED · EXACT)', () => {
  const STANDARD = CATALOG_60.find((s) => s.code === '3.1.9');

  it('3.1.9 existe con título y descripción normativos correctos', () => {
    assert.ok(STANDARD, '3.1.9 presente en el catálogo');
    assert.equal(STANDARD.title, 'Eliminación adecuada de residuos sólidos, líquidos o gaseosos');
    assert.ok(STANDARD.description.includes('residuos sólidos'));
    assert.ok(STANDARD.description.includes('líquidos'));
    assert.ok(STANDARD.description.includes('gaseosos'));
  });

  it('3.1.9 es IMPLEMENTED con provider EXACT (waste-management)', () => {
    assert.ok(STANDARD, '3.1.9 presente');
    assert.equal(STANDARD.implementationStatus, 'IMPLEMENTED', '3.1.9 IMPLEMENTED (FASE 34C)');
    assert.equal(STANDARD.semantic, 'EXACT', 'semántica EXACT');
    assert.equal(
      STANDARD.validationProvider,
      'waste-management.provider',
      'provider EXACT de 3.1.9 registrado',
    );
  });

  it('3.1.9 tiene moduleRoute a la pantalla de gestión', () => {
    assert.ok(STANDARD, '3.1.9 presente');
    assert.equal(STANDARD.moduleRoute, '/waste-management');
  });

  it('3.1.9 mantiene su peso normativo intacto (1) y metadata PHVA', () => {
    assert.ok(STANDARD, '3.1.9 presente');
    assert.equal(STANDARD.normativeWeight, 1, 'peso normativo no alterado');
    assert.equal(STANDARD.phva, 'HACER');
    assert.deepEqual(STANDARD.applicableLevels, ['60']);
  });

  it('3.1.9 no tiene classification (implícitamente OFFICIAL)', () => {
    assert.ok(STANDARD, '3.1.9 presente');
    assert.equal(STANDARD.classification, undefined);
  });

  it('3.1.9 tiene criteria/modeReview normativos con frontera anti-double-scoring', () => {
    assert.ok(STANDARD, '3.1.9 presente');
    assert.ok(STANDARD.criteria && STANDARD.criteria.length > 0, 'criteria normativo presente');
    assert.ok(STANDARD.modeReview && STANDARD.modeReview.length > 0, 'modeReview presente');
    assert.equal(STANDARD.section?.id, 'do-condiciones-salud', 'sección PHVA HACER');
    // La frontera normativa queda documentada en modeReview.
    assert.match(STANDARD.modeReview, /EXCLUSIVAMENTE de WasteManagementRecord/);
    assert.match(STANDARD.modeReview, /4\.1\.3/);
    assert.match(STANDARD.modeReview, /4\.2\.4/);
    // hazardous ≠ cumplimiento automático.
    assert.match(STANDARD.modeReview, /hazardous=true/);
  });

  it('3.1.9 entra al catálogo efectivo (puntúa)', () => {
    const service = new StandardCatalogService();
    const effective = service.getEffectiveCatalog('60');
    const found = effective.standards.find((s) => s.code === '3.1.9');
    assert.ok(found, '3.1.9 IMPLEMENTED debe estar en el catálogo efectivo');
    assert.ok((found.effectiveWeight ?? 0) > 0, '3.1.9 debe tener peso efectivo positivo');
  });

  it('3.1.8 sigue IMPLEMENTED y aislado de 3.1.9 (módulo/provider distintos)', () => {
    const std3_1_8 = CATALOG_60.find((s) => s.code === '3.1.8');
    assert.ok(std3_1_8, '3.1.8 presente');
    assert.equal(std3_1_8.implementationStatus, 'IMPLEMENTED', '3.1.8 IMPLEMENTED (FASE 34B)');
    assert.equal(std3_1_8.validationProvider, 'workplace-sanitary-conditions.provider');
    // Frontera 3.1.8 ≠ 3.1.9: módulos y providers distintos (sin colección compartida).
    assert.notEqual(std3_1_8.moduleRoute, STANDARD?.moduleRoute);
    assert.notEqual(std3_1_8.validationProvider, STANDARD?.validationProvider);
  });
});
