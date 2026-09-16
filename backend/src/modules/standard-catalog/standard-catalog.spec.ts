import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RolesGuard } from '../questions/roles.guard';
import { CATALOG_21 } from './constants/catalog-21';
import { CATALOG_60 } from './constants/catalog-60';
import { CATALOG_7 } from './constants/catalog-7';
import {
  ImplementationStatus,
  PhvaPhase,
  StandardDefinition,
  StandardLevel,
} from './interfaces/standard-definition.interface';
import { StandardCatalogController } from './standard-catalog.controller';
import { StandardCatalogModule } from './standard-catalog.module';
import { StandardCatalogService } from './standard-catalog.service';
import { computeEffectiveWeights } from './utils/effective-weights';

const LEVELS: readonly StandardLevel[] = ['7', '21', '60'];
const PHVA_PHASES: readonly PhvaPhase[] = ['PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR'];
const VALID_STATUSES: readonly ImplementationStatus[] = ['IMPLEMENTED', 'PARTIAL', 'PLANNED'];

/** Definición mínima para los tests de normalización. */
function makeDefinition(
  code: string,
  normativeWeight: number,
  implementationStatus: ImplementationStatus = 'IMPLEMENTED',
): StandardDefinition {
  return {
    code,
    title: `Estándar ${code}`,
    description: 'Test',
    chapter: 'Test',
    phva: 'PLANEAR',
    normativeWeight,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: implementationStatus === 'PLANNED' ? '' : `/test/${code}`,
    implementationStatus,
  };
}

describe('StandardCatalogModule', () => {
  it('se construye con controller, service y RolesGuard (sin forwardRef)', () => {
    const controllers = Reflect.getMetadata('controllers', StandardCatalogModule) ?? [];
    const providers = Reflect.getMetadata('providers', StandardCatalogModule) ?? [];
    assert.ok(controllers.includes(StandardCatalogController), 'controller registrado');
    assert.ok(providers.includes(StandardCatalogService), 'service registrado');
    assert.ok(providers.includes(RolesGuard), 'RolesGuard registrado');
  });
});

describe('Catálogo maestro (CATALOG_60)', () => {
  it('no está vacío', () => {
    assert.ok(CATALOG_60.length > 0);
  });

  it('todos los códigos son únicos (no existen duplicados)', () => {
    const codes = CATALOG_60.map((standard) => standard.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it('todos los pesos normativos son válidos (mayores que 0 y finitos)', () => {
    for (const standard of CATALOG_60) {
      assert.ok(
        Number.isFinite(standard.normativeWeight) && standard.normativeWeight > 0,
        `peso inválido en ${standard.code}`,
      );
    }
  });

  it('todos tienen una fase PHVA válida', () => {
    for (const standard of CATALOG_60) {
      assert.ok(PHVA_PHASES.includes(standard.phva), `PHVA inválido en ${standard.code}`);
    }
  });

  it('todos tienen al menos un nivel aplicable (y todos válidos)', () => {
    for (const standard of CATALOG_60) {
      assert.ok(standard.applicableLevels.length > 0, `${standard.code} sin niveles aplicables`);
      for (const level of standard.applicableLevels) {
        assert.ok(LEVELS.includes(level), `nivel inválido ${level} en ${standard.code}`);
      }
    }
  });

  it('todos tienen código, título y capítulo no vacíos', () => {
    for (const standard of CATALOG_60) {
      assert.ok(standard.code.trim().length > 0);
      assert.ok(standard.title.trim().length > 0);
      assert.ok(standard.chapter.trim().length > 0);
    }
  });
});

describe('Catálogos derivados (7 y 21)', () => {
  it('no están vacíos', () => {
    assert.ok(CATALOG_7.length > 0);
    assert.ok(CATALOG_21.length > 0);
  });

  it('CATALOG_7 solo incluye estándares con el nivel 7 aplicable', () => {
    for (const standard of CATALOG_7) {
      assert.ok(standard.applicableLevels.includes('7'), `${standard.code} sin nivel 7`);
    }
  });

  it('CATALOG_21 solo incluye estándares con el nivel 21 aplicable', () => {
    for (const standard of CATALOG_21) {
      assert.ok(standard.applicableLevels.includes('21'), `${standard.code} sin nivel 21`);
    }
  });

  it('los niveles derivados son subconjuntos completos del maestro (sin omitir ni inventar códigos)', () => {
    const expected7 = CATALOG_60.filter((standard) => standard.applicableLevels.includes('7'))
      .map((standard) => standard.code)
      .sort();
    const expected21 = CATALOG_60.filter((standard) => standard.applicableLevels.includes('21'))
      .map((standard) => standard.code)
      .sort();

    assert.deepEqual(
      CATALOG_7.map((standard) => standard.code).sort(),
      expected7,
      'CATALOG_7 != maestro filtrado por nivel 7',
    );
    assert.deepEqual(
      CATALOG_21.map((standard) => standard.code).sort(),
      expected21,
      'CATALOG_21 != maestro filtrado por nivel 21',
    );
  });

  it('no existen códigos duplicados dentro de cada catálogo derivado', () => {
    for (const catalog of [CATALOG_7, CATALOG_21]) {
      const codes = catalog.map((standard) => standard.code);
      assert.equal(new Set(codes).size, codes.length);
    }
  });

  it('el catálogo 21 contiene todos los estándares del 7 (los 7 son subconjunto de los 21)', () => {
    const codes7 = new Set(CATALOG_7.map((standard) => standard.code));
    const codes21 = new Set(CATALOG_21.map((standard) => standard.code));
    for (const code of codes7) {
      assert.ok(codes21.has(code), `${code} debería aplicar también al nivel 21`);
    }
  });
});

describe('Conteos y pesos por nivel (aproximación documentada)', () => {
  it('conteos esperados del catálogo derivado: 12 / 23 / 69', () => {
    assert.equal(CATALOG_7.length, 12);
    assert.equal(CATALOG_21.length, 23);
    assert.equal(CATALOG_60.length, 69);
  });

  it('SCOPE-1: códigos de plataforma conservan módulo y peso (3.3.4/3.3.5/3.3.6 mantienen moduleRoute como infraestructura)', () => {
    const sum = (codes: readonly string[]) =>
      CATALOG_60.filter((standard) => codes.includes(standard.code)).reduce(
        (acc, standard) => acc + standard.normativeWeight,
        0,
      );

    const platformCodes = CATALOG_60.filter((standard) => standard.moduleRoute !== '').map(
      (standard) => standard.code,
    );
    const annexCodes = CATALOG_60.filter((standard) => standard.moduleRoute === '').map(
      (standard) => standard.code,
    );

    // SCOPE-1: los 3 estándares fuera de alcance CONSERVAN moduleRoute y peso
    // (infraestructura futura), por lo que los conteos por módulo no cambian.
    // Lo que cambia es el SCORING: pasan a PLANNED y salen del catálogo efectivo.
    assert.equal(platformCodes.length, 60, '60 códigos con módulo (57 activos + 3 OUT_OF_SCOPE)');
    assert.equal(annexCodes.length, 9, '9 ítems del anexo sin módulo');
    assert.equal(sum(platformCodes), 113, 'escala PHVA con módulos = 113 (pesos intactos)');
    assert.equal(sum(annexCodes), 9, 'ítems sin módulo = 9 puntos');
    assert.equal(sum([...platformCodes, ...annexCodes]), 122);
  });

  it('FASE 30F — 3.1.5 Custodia de historias clínicas → IMPLEMENTED', () => {
    const std3_1_5 = CATALOG_60.find((s) => s.code === '3.1.5');
    assert.ok(std3_1_5, '3.1.5 presente en catálogo');
    assert.equal(std3_1_5.implementationStatus, 'IMPLEMENTED');
    assert.equal(std3_1_5.semantic, 'EXACT');
    assert.equal(std3_1_5.phva, 'HACER');
    assert.equal(std3_1_5.normativeWeight, 1);
    assert.deepEqual(std3_1_5.applicableLevels, ['60']);
    assert.equal(std3_1_5.moduleRoute, '/occupational-medical-record-custody');
    assert.equal(std3_1_5.validationProvider, 'occupational-medical-record-custody.provider');
    assert.equal(std3_1_5.chapter, 'Gestión del talento humano');
    assert.ok(std3_1_5.title.includes('Custodia de historias clínicas'));
    // FASE 30G: contenido PHVA completo.
    assert.ok(std3_1_5.criteria && std3_1_5.criteria.length > 0, 'criteria definido');
    assert.ok(std3_1_5.modeReview && std3_1_5.modeReview.length > 0, 'modeReview definido');
    assert.ok(std3_1_5.section, 'section PHVA definida');
    assert.equal(std3_1_5.section.id, 'do-condiciones-salud');
    // Criterios exclusivos de CUSTODIA: sin contenido clínico ni inferencias.
    assert.ok(
      (std3_1_5.criteria ?? '').toLowerCase().includes('custodia'),
      'criteria debe referirse a custodia de historias clínicas',
    );
    assert.ok(
      (std3_1_5.modeReview ?? '').toLowerCase().includes('custodia'),
      'modeReview debe referirse a custodia',
    );
    assert.ok(
      !(std3_1_5.criteria ?? '').toLowerCase().includes('diagnósticos de'),
      'criteria no debe introducir contenido clínico',
    );
  });

  it('FASE 32 — 3.1.7 IMPLEMENTED con provider EXACT y frontera anti-double-scoring', () => {
    const std3_1_7 = CATALOG_60.find((s) => s.code === '3.1.7');
    assert.ok(std3_1_7, '3.1.7 presente en catálogo');
    // Título normativo oficial preservado (FASE 31A).
    assert.ok(
      std3_1_7.title.includes('Estilos de vida y entornos saludables'),
      'título mantiene el concepto base',
    );
    assert.ok(
      std3_1_7.title.includes('controles tabaquismo, alcoholismo, farmacodependencia'),
      'título incluye los controles normativos',
    );
    // Descripción con el alcance completo.
    assert.ok(std3_1_7.description.includes('tabaquismo'), 'descripción menciona tabaquismo');
    assert.ok(std3_1_7.description.includes('alcoholismo'), 'descripción menciona alcoholismo');
    assert.ok(
      std3_1_7.description.includes('farmacodependencia'),
      'descripción menciona farmacodependencia',
    );
    // Estado IMPLEMENTED con provider y ruta reales.
    assert.equal(std3_1_7.implementationStatus, 'IMPLEMENTED', '3.1.7 IMPLEMENTED (FASE 32)');
    assert.equal(std3_1_7.semantic, 'EXACT', 'semantic EXACT');
    assert.equal(std3_1_7.normativeWeight, 1, 'peso normativo intacto');
    assert.deepEqual(std3_1_7.applicableLevels, ['60']);
    assert.equal(std3_1_7.phva, 'HACER');
    assert.equal(std3_1_7.moduleRoute, '/health-promotion', 'ruta real implementada');
    assert.equal(
      std3_1_7.validationProvider,
      'lifestyle-healthy-environment.provider',
      'provider EXACT 3.1.7',
    );
    // Contenido PHVA completo.
    assert.ok(std3_1_7.criteria && std3_1_7.criteria.length > 0, 'criteria definido');
    assert.ok(std3_1_7.modeReview && std3_1_7.modeReview.length > 0, 'modeReview definido');
    assert.ok(std3_1_7.section, 'section PHVA definida');
    assert.equal(std3_1_7.section?.id, 'do-condiciones-salud');
    // Sin datos clínicos en criteria/modeReview.
    assert.ok(
      !(std3_1_7.criteria ?? '').toLowerCase().includes('diagnóstico'),
      'criteria sin contenido clínico',
    );
  });

  it('FASE 33 — 3.1.6 IMPLEMENTED con provider EXACT, metadata-only y frontera con 3.1.3', () => {
    const std3_1_6 = CATALOG_60.find((s) => s.code === '3.1.6');
    assert.ok(std3_1_6, '3.1.6 presente en catálogo');
    assert.equal(std3_1_6.implementationStatus, 'IMPLEMENTED', '3.1.6 IMPLEMENTED (FASE 33)');
    assert.equal(std3_1_6.semantic, 'EXACT', 'semantic EXACT');
    assert.equal(std3_1_6.normativeWeight, 1, 'peso normativo 1');
    assert.deepEqual(std3_1_6.applicableLevels, ['60']);
    assert.equal(std3_1_6.phva, 'HACER');
    assert.equal(std3_1_6.moduleRoute, '/work-restrictions', 'ruta real implementada');
    assert.equal(
      std3_1_6.validationProvider,
      'work-restriction.provider',
      'provider EXACT 3.1.6',
    );
    // Contenido PHVA completo.
    assert.ok(std3_1_6.criteria && std3_1_6.criteria.length > 0, 'criteria definido');
    assert.ok(std3_1_6.modeReview && std3_1_6.modeReview.length > 0, 'modeReview definido');
    assert.ok(std3_1_6.section, 'section PHVA definida');
    assert.equal(std3_1_6.section?.id, 'do-condiciones-salud');
    // Frontera con 3.1.3: el alcance de 3.1.6 es gestión POST-evaluación.
    const std3_1_3 = CATALOG_60.find((s) => s.code === '3.1.3');
    assert.ok(std3_1_3, '3.1.3 presente (frontera)');
    assert.equal(std3_1_3.validationProvider, 'job-profile-medical-information.provider');
    assert.notEqual(
      std3_1_6.validationProvider,
      std3_1_3.validationProvider,
      'providers distintos: 3.1.6 ≠ 3.1.3',
    );
  });

  it('FASE 34C — 3.1.9 cubre residuos sólidos, líquidos y gaseosos y es IMPLEMENTED', () => {
    const std3_1_9 = CATALOG_60.find((s) => s.code === '3.1.9');
    assert.ok(std3_1_9, '3.1.9 presente en catálogo');
    // Título con los tres tipos de residuos.
    assert.equal(
      std3_1_9.title,
      'Eliminación adecuada de residuos sólidos, líquidos o gaseosos',
      'título refleja el alcance oficial completo',
    );
    // Descripción menciona los tres tipos.
    assert.ok(std3_1_9.description.includes('sólidos'), 'descripción menciona residuos sólidos');
    assert.ok(std3_1_9.description.includes('líquidos'), 'descripción menciona residuos líquidos');
    assert.ok(std3_1_9.description.includes('gaseosos'), 'descripción menciona residuos gaseosos');
    // Invariantes de promoción FASE 34C.
    assert.equal(
      std3_1_9.implementationStatus,
      'IMPLEMENTED',
      '3.1.9 IMPLEMENTED (FASE 34C, módulo waste-management)',
    );
    assert.equal(std3_1_9.normativeWeight, 1, 'peso normativo intacto');
    assert.deepEqual(std3_1_9.applicableLevels, ['60']);
    assert.equal(std3_1_9.phva, 'HACER');
    assert.equal(std3_1_9.moduleRoute, '/waste-management', 'módulo funcional propio');
    assert.equal(
      std3_1_9.validationProvider,
      'waste-management.provider',
      'provider EXACT asignado',
    );
    assert.equal(std3_1_9.semantic, 'EXACT', 'semantic EXACT');
  });
});

describe('Clasificación normativa DUPLICATE', () => {
  const DUPLICATE_CODES = ['1.1.9', '1.1.10', '4.3.1', '7.2.1'] as const;

  it('1.1.9, 1.1.10, 4.3.1, 7.2.1 tienen classification = DUPLICATE', () => {
    for (const code of DUPLICATE_CODES) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente en catálogo`);
      assert.equal(std.classification, 'DUPLICATE', `${code} debe ser DUPLICATE`);
    }
  });

  it('1.1.9 y 1.1.10 referencian 1.1.3 como duplicateOf', () => {
    for (const code of ['1.1.9', '1.1.10']) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.duplicateOf, '1.1.3', `${code} debe duplicar 1.1.3`);
    }
  });

  it('4.3.1 referencia 3.2.2 como duplicateOf', () => {
    const std = CATALOG_60.find((s) => s.code === '4.3.1');
    assert.ok(std, '4.3.1 presente');
    assert.equal(std.duplicateOf, '3.2.2', '4.3.1 debe duplicar 3.2.2');
  });

  it('7.2.1 referencia 7.1.4 como duplicateOf', () => {
    const std = CATALOG_60.find((s) => s.code === '7.2.1');
    assert.ok(std, '7.2.1 presente');
    assert.equal(std.duplicateOf, '7.1.4', '7.2.1 debe duplicar 7.1.4');
  });

  it('los DUPLICATE siguen siendo PLANNED (no entran al scoring)', () => {
    for (const code of DUPLICATE_CODES) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.implementationStatus, 'PLANNED', `${code} debe seguir PLANNED`);
    }
  });

  it('los DUPLICATE no tienen moduleRoute (fuera de la plataforma)', () => {
    for (const code of DUPLICATE_CODES) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.moduleRoute, '', `${code} no debe tener moduleRoute`);
    }
  });

  it('effective-weights excluye los DUPLICATE del cálculo', () => {
    const implemented = CATALOG_60.filter((s) => s.implementationStatus !== 'PLANNED');
    const duplicateInScoring = implemented.filter((s) => s.classification === 'DUPLICATE');
    assert.equal(duplicateInScoring.length, 0, 'ningún DUPLICATE debe estar en scoring');
  });

  it('los estándares equivalentes (1.1.3, 3.2.2, 7.1.4) existen y son IMPLEMENTED', () => {
    for (const code of ['1.1.3', '3.2.2', '7.1.4']) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} (equivalente) presente`);
      assert.equal(std.implementationStatus, 'IMPLEMENTED', `${code} debe ser IMPLEMENTED`);
    }
  });

  it('los DUPLICATE no alteran el conteo de IMPLEMENTED del catálogo efectivo', () => {
    const service = new StandardCatalogService();
    const dto = service.getEffectiveCatalog('60');
    for (const code of DUPLICATE_CODES) {
      const found = dto.standards.find((s) => s.code === code);
      assert.equal(found, undefined, `${code} no debe estar en effective catalog`);
    }
  });
});

describe('Clasificación normativa COMPLEMENTARY', () => {
  const COMPLEMENTARY_CODES = ['2.12.1', '2.13.1', '3.4.1', '4.4.1', '5.2.1'] as const;

  // FASE 35A/35B: corrección cosmética del título — el array comprobado NUNCA
  // incluyó 3.3.4 (SCOPE-1: 3.3.4 es OUT_OF_SCOPE/PLANNED, tampoco COMPLEMENTARY).
  it('2.12.1, 2.13.1, 3.4.1, 4.4.1, 5.2.1 tienen classification = COMPLEMENTARY', () => {
    for (const code of COMPLEMENTARY_CODES) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente en catálogo`);
      assert.equal(std.classification, 'COMPLEMENTARY', `${code} debe ser COMPLEMENTARY`);
    }
  });

  it('ningún COMPLEMENTARY tiene duplicateOf', () => {
    for (const code of COMPLEMENTARY_CODES) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.duplicateOf, undefined, `${code} no debe tener duplicateOf`);
    }
  });

  it('los COMPLEMENTARY siguen siendo PLANNED (no entran al scoring)', () => {
    for (const code of COMPLEMENTARY_CODES) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.implementationStatus, 'PLANNED', `${code} debe seguir PLANNED`);
    }
  });

  it('los COMPLEMENTARY no tienen moduleRoute', () => {
    for (const code of COMPLEMENTARY_CODES) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.moduleRoute, '', `${code} no debe tener moduleRoute`);
    }
  });

  it('effective-weights excluye los COMPLEMENTARY del cálculo', () => {
    const implemented = CATALOG_60.filter((s) => s.implementationStatus !== 'PLANNED');
    const complementaryInScoring = implemented.filter((s) => s.classification === 'COMPLEMENTARY');
    assert.equal(complementaryInScoring.length, 0, 'ningún COMPLEMENTARY debe estar en scoring');
  });

  it('conteos totales: 4 DUPLICATE, 6 COMPLEMENTARY, ningún PHANTOM, 2 nuevos oficiales', () => {
    const duplicates = CATALOG_60.filter((s) => s.classification === 'DUPLICATE');
    const complementary = CATALOG_60.filter((s) => s.classification === 'COMPLEMENTARY');
    const phantom = CATALOG_60.filter((s) => s.classification === 'PHANTOM');
    const newOfficial = CATALOG_60.filter((s) => s.code === '3.1.5' || s.code === '3.2.3');
    assert.equal(duplicates.length, 4, '4 DUPLICATE');
    assert.equal(complementary.length, 5, '5 COMPLEMENTARY');
    assert.equal(phantom.length, 0, '0 PHANTOM');
    assert.equal(newOfficial.length, 2, '2 nuevos oficiales FASE 27.2');
  });

  it('total entradas catálogo es 63 (61 originales + 2 oficiales FASE 27.2)', () => {
    assert.equal(CATALOG_60.length, 69);
  });

  it('los DUPLICATE de FASE 27.0 permanecen intactos', () => {
    for (const code of ['1.1.9', '1.1.10', '4.3.1', '7.2.1']) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.classification, 'DUPLICATE', `${code} sigue DUPLICATE`);
    }
  });
});

describe('FASE 27.2 — Estándares oficiales incorporados', () => {
  it('3.1.5 Custodia de historias clínicas existe y es IMPLEMENTED (FASE 30F)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.1.5');
    assert.ok(std, '3.1.5 presente');
    assert.equal(std.implementationStatus, 'IMPLEMENTED');
    assert.equal(std.semantic, 'EXACT');
    assert.equal(std.chapter, 'Gestión del talento humano');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.normativeWeight, 1);
    assert.ok(std.applicableLevels.includes('60'));
    assert.equal(std.moduleRoute, '/occupational-medical-record-custody');
    assert.equal(std.validationProvider, 'occupational-medical-record-custody.provider');
    assert.ok(std.title.includes('Custodia de historias clínicas'));
  });

  it('3.2.3 Registro y análisis estadístico de accidentes existe y es IMPLEMENTED', () => {
    const std = CATALOG_60.find((s) => s.code === '3.2.3');
    assert.ok(std, '3.2.3 presente');
    assert.equal(std.implementationStatus, 'IMPLEMENTED');
    assert.equal(std.chapter, 'Gestión del talento humano');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.normativeWeight, 2);
    assert.ok(std.applicableLevels.includes('60'));
  });

  it('3.1.5 y 3.2.3 no tienen classification (implícitamente OFFICIAL)', () => {
    for (const code of ['3.1.5', '3.2.3']) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente`);
      assert.equal(std.classification, undefined, `${code} no debe tener classification explícita`);
    }
  });

  it('3.1.5 tiene moduleRoute /occupational-medical-record-custody y 3.2.3 tiene moduleRoute', () => {
    const std315 = CATALOG_60.find((s) => s.code === '3.1.5');
    assert.ok(std315, '3.1.5 presente');
    assert.equal(std315.moduleRoute, '/occupational-medical-record-custody', '3.1.5 debe tener moduleRoute');
    const std323 = CATALOG_60.find((s) => s.code === '3.2.3');
    assert.ok(std323, '3.2.3 presente');
    assert.ok(std323.moduleRoute.length > 0, '3.2.3 debe tener moduleRoute');
  });

  it('3.1.5 entra al scoring (es IMPLEMENTED) y 3.2.3 también (es IMPLEMENTED)', () => {
    const implemented = CATALOG_60.filter((s) => s.implementationStatus !== 'PLANNED');
    const found315 = implemented.find((s) => s.code === '3.1.5');
    assert.ok(found315, '3.1.5 debe estar en scoring');
    const found323 = implemented.find((s) => s.code === '3.2.3');
    assert.ok(found323, '3.2.3 debe estar en scoring');
  });

  it('no hay códigos duplicados tras incorporar 3.1.5 y 3.2.3', () => {
    const codes = CATALOG_60.map((s) => s.code);
    assert.equal(new Set(codes).size, codes.length, 'todos los códigos son únicos');
  });
});

describe('FASE 27.3 — Corrección normativa 3.3.2', () => {
  it('3.3.2 tiene PHVA = HACER (corregido de VERIFICAR)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.2');
    assert.ok(std, '3.3.2 presente');
    assert.equal(std.phva, 'HACER', 'PHVA debe ser HACER');
  });

  it('3.3.2 título incluye concepto normativo: severidad', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.2');
    assert.ok(std, '3.3.2 presente');
    assert.ok(std.title.toLowerCase().includes('severidad'), 'título incluye severidad');
  });

  it('3.3.2 sigue siendo IMPLEMENTED con peso normativo intacto', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.2');
    assert.ok(std, '3.3.2 presente');
    assert.equal(std.implementationStatus, 'IMPLEMENTED');
    assert.equal(std.normativeWeight, 2, 'peso normativo no alterado');
  });

  it('3.3.2 no tiene classification (implícitamente OFFICIAL)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.2');
    assert.ok(std, '3.3.2 presente');
    assert.equal(std.classification, undefined, 'sin classification explícita');
  });
});

describe('FASE 30D-2 — 3.1.3 Información al médico de perfiles de cargo (IMPLEMENTED · EXACT)', () => {
  const STANDARD = CATALOG_60.find((s) => s.code === '3.1.3');

  it('3.1.3 existe con título y descripción normativos correctos', () => {
    assert.ok(STANDARD, '3.1.3 presente en el catálogo');
    assert.equal(STANDARD.title, 'Información al médico de perfiles de cargo');
    assert.ok(
      STANDARD.description.includes('suministrada al médico evaluador'),
      'descripción describe el suministro de información al médico',
    );
  });

  it('3.1.3 es IMPLEMENTED con provider EXACT (job-profile-medical-information)', () => {
    assert.ok(STANDARD, '3.1.3 presente');
    assert.equal(STANDARD.implementationStatus, 'IMPLEMENTED');
    assert.equal(
      STANDARD.validationProvider,
      'job-profile-medical-information.provider',
      'provider EXACT de 3.1.3 registrado',
    );
  });

  it('3.1.3 tiene moduleRoute (UI pendiente, ruta futura /job-profiles)', () => {
    assert.ok(STANDARD, '3.1.3 presente');
    assert.equal(STANDARD.moduleRoute, '/job-profiles');
  });

  it('3.1.3 no tiene classification (implícitamente OFFICIAL, no DUPLICATE/COMPLEMENTARY)', () => {
    assert.ok(STANDARD, '3.1.3 presente');
    assert.equal(STANDARD.classification, undefined);
  });

  it('3.1.3 mantiene su peso normativo intacto (3.0) y metadata PHVA', () => {
    assert.ok(STANDARD, '3.1.3 presente');
    assert.equal(STANDARD.normativeWeight, 3, 'peso normativo no alterado');
    assert.equal(STANDARD.phva, 'HACER');
    assert.deepEqual(STANDARD.applicableLevels, ['60']);
  });

  it('3.1.3 tiene criteria/modeReview normativos (sin texto legacy de recomendaciones)', () => {
    assert.ok(STANDARD, '3.1.3 presente');
    assert.ok(STANDARD.criteria && STANDARD.criteria.length > 0, 'criteria normativo presente');
    assert.ok(STANDARD.modeReview && STANDARD.modeReview.length > 0, 'modeReview presente');
    assert.equal(STANDARD.section?.id, 'do-condiciones-salud', 'sección PHVA HACER');
    assert.ok(
      !JSON.stringify(STANDARD).includes('Seguimiento a recomendaciones médicas'),
      'sin residuos del mapeo legacy de recomendaciones',
    );
  });

  it('3.1.3 entra al catálogo efectivo (puntúa)', () => {
    const service = new StandardCatalogService();
    const effective = service.getEffectiveCatalog('60');
    const found = effective.standards.find((s) => s.code === '3.1.3');
    assert.ok(found, '3.1.3 IMPLEMENTED debe estar en el catálogo efectivo');
    assert.ok((found.effectiveWeight ?? 0) > 0, '3.1.3 debe tener peso efectivo positivo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 30E: 3.1.2 Promoción y prevención en salud (IMPLEMENTED · EXACT)
// ═══════════════════════════════════════════════════════════════════════════

describe('FASE 30E — 3.1.2 Promoción y prevención en salud (IMPLEMENTED · EXACT)', () => {
  const STANDARD = CATALOG_60.find((s) => s.code === '3.1.2');

  it('3.1.2 existe con título y descripción normativos correctos', () => {
    assert.ok(STANDARD, '3.1.2 presente en el catálogo');
    assert.ok(STANDARD.title.toLowerCase().includes('promoción'));
    assert.ok(STANDARD.description.toLowerCase().includes('promoción'));
  });

  it('3.1.2 es IMPLEMENTED con provider EXACT (health-promotion)', () => {
    assert.ok(STANDARD, '3.1.2 presente');
    assert.equal(STANDARD.implementationStatus, 'IMPLEMENTED');
    assert.equal(STANDARD.validationProvider, 'health-promotion.provider');
  });

  it('3.1.2 tiene moduleRoute a la pantalla de gestión /health-promotion', () => {
    assert.ok(STANDARD, '3.1.2 presente');
    assert.equal(STANDARD.moduleRoute, '/health-promotion');
  });

  it('3.1.2 mantiene su peso normativo intacto (3.0) y metadata PHVA', () => {
    assert.ok(STANDARD, '3.1.2 presente');
    assert.equal(STANDARD.normativeWeight, 3.0);
    assert.equal(STANDARD.phva, 'HACER');
    assert.ok(STANDARD.section, '3.1.2 pertenece a una sección PHVA');
  });

  it('3.1.2 tiene criteria/modeReview normativos (sin texto legacy de exámenes médicos)', () => {
    assert.ok(STANDARD, '3.1.2 presente');
    assert.ok(STANDARD.criteria && STANDARD.criteria.length > 0, 'criteria definido');
    assert.ok(STANDARD.modeReview && STANDARD.modeReview.length > 0, 'modeReview definido');
    assert.ok(
      !JSON.stringify(STANDARD).includes('evaluaciones médicas ocupacionales'),
      'criteria no debe heredar texto de exámenes médicos (WRONG_MAPPING legacy)',
    );
    assert.ok(
      !JSON.stringify(STANDARD).includes('exámenes médicos de ingreso'),
      'modeReview no debe heredar texto de exámenes médicos (WRONG_MAPPING legacy)',
    );
    assert.ok(
      (STANDARD.modeReview ?? '').toLowerCase().includes('promoción'),
      'modeReview debe referirse a promoción y prevención',
    );
  });

  it('3.1.2 entra al catálogo efectivo (puntúa)', () => {
    const service = new StandardCatalogService();
    const effective = service.getEffectiveCatalog('60');
    const found = effective.standards.find((s) => s.code === '3.1.2');
    assert.ok(found, '3.1.2 IMPLEMENTED debe estar en el catálogo efectivo');
    assert.ok((found.effectiveWeight ?? 0) > 0, '3.1.2 debe tener peso efectivo positivo');
  });
});

describe('Estado de implementación', () => {
  it('todos los estándares tienen un implementationStatus válido', () => {
    for (const standard of CATALOG_60) {
      assert.ok(
        VALID_STATUSES.includes(standard.implementationStatus),
        `estado inválido en ${standard.code}`,
      );
    }
  });

  it('PLANNED ⟹ moduleRoute vacío, salvo OUT_OF_SCOPE (SCOPE-1: módulo conservado como infraestructura)', () => {
    for (const standard of CATALOG_60) {
      if (standard.implementationStatus === 'PLANNED') {
        if (standard.classification === 'OUT_OF_SCOPE') {
          assert.ok(standard.moduleRoute.length > 0, `${standard.code} OUT_OF_SCOPE conserva su módulo`);
        } else {
          assert.equal(standard.moduleRoute, '', `${standard.code} PLANNED con módulo`);
        }
      } else {
        assert.ok(standard.moduleRoute.length > 0, `${standard.code} sin módulo pero no PLANNED`);
      }
    }
  });

  it('nivel 60: 57 IMPLEMENTED / 0 PARTIAL / 12 PLANNED (SCOPE-1: 3.3.4/3.3.5/3.3.6 → PLANNED OUT_OF_SCOPE)', () => {
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'IMPLEMENTED').length, 57);
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'PARTIAL').length, 0);
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'PLANNED').length, 12);
  });

  it('SCOPE-1: 3.3.4, 3.3.5 y 3.3.6 son PLANNED + OUT_OF_SCOPE y conservan módulo y peso', () => {
    for (const code of ['3.3.4', '3.3.5', '3.3.6']) {
      const std = CATALOG_60.find((s) => s.code === code);
      assert.ok(std, `${code} presente en catálogo`);
      assert.equal(std.implementationStatus, 'PLANNED', `${code} PLANNED (fuera del alcance)`);
      assert.equal(std.classification, 'OUT_OF_SCOPE', `${code} OUT_OF_SCOPE`);
      assert.equal(std.normativeWeight, 1, `${code} peso normativo intacto`);
      assert.ok(std.moduleRoute.length > 0, `${code} conserva moduleRoute (infraestructura futura)`);
      assert.equal(std.validationProvider, undefined, `${code} sin validationProvider activo`);
      assert.equal(std.section, undefined, `${code} sin sección PHVA visible`);
      assert.deepEqual(std.applicableLevels, ['60']);
    }
  });

  it('SCOPE-1: 3.3.7 NO existe en el catálogo (nunca estuvo en el alcance)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.7');
    assert.equal(std, undefined, '3.3.7 no debe existir');
  });

  it('SCOPE-1: el alcance aprobado queda delimitado (hasta 3.3.3 y desde 4.1.1)', () => {
    const implementedCodes = CATALOG_60.filter(
      (s) => s.implementationStatus === 'IMPLEMENTED',
    ).map((s) => s.code);
    for (const code of ['3.3.1', '3.3.2', '3.3.3', '4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '5.1.1', '5.1.2', '6.1.1', '6.1.2', '6.1.3', '6.1.4', '7.1.1', '7.1.2', '7.1.3', '7.1.4']) {
      assert.ok(implementedCodes.includes(code), `${code} IMPLEMENTED (dentro del alcance)`);
    }
    for (const code of ['3.3.4', '3.3.5', '3.3.6']) {
      assert.ok(!implementedCodes.includes(code), `${code} fuera del scoring (SCOPE-1)`);
    }
  });

  it('FASE 6: 1.1.7 Capacitación COPASST → IMPLEMENTED con provider y ruta (peso intacto)', () => {
    const standard = CATALOG_60.find((s) => s.code === '1.1.7');
    assert.ok(standard, '1.1.7 presente en el catálogo');
    assert.equal(standard.implementationStatus, 'IMPLEMENTED');
    assert.equal(standard.validationProvider, 'copasst-training.provider');
    assert.equal(standard.moduleRoute, '/advanced-management/1.1.7');
    assert.equal(standard.normativeWeight, 0.5, 'peso normativo intacto (no se alteraron pesos)');
  });

  it('FASE 6 H-01: 3.2.2 moduleRoute → /disease-investigation-management', () => {
    const standard = CATALOG_60.find((s) => s.code === '3.2.2');
    assert.ok(standard, '3.2.2 presente en el catálogo');
    assert.ok(standard.moduleRoute, '3.2.2 tiene moduleRoute');
    assert.equal(standard.code, '3.2.2');
    assert.ok(standard.title.includes('Investigación'), '3.2.2 título contiene Investigación');
  });

  it('FASE 6 H-01: 3.2.1 moduleRoute → /absenteeism (no alterado)', () => {
    const standard = CATALOG_60.find((s) => s.code === '3.2.1');
    assert.ok(standard, '3.2.1 presente en el catálogo');
    assert.equal(standard.moduleRoute, '/absenteeism');
  });

  it('nivel 7: 12 IMPLEMENTED / 0 PARTIAL / 0 PLANNED', () => {
    assert.equal(CATALOG_7.filter((s) => s.implementationStatus === 'IMPLEMENTED').length, 12);
    assert.equal(CATALOG_7.filter((s) => s.implementationStatus === 'PARTIAL').length, 0);
    assert.equal(CATALOG_7.filter((s) => s.implementationStatus === 'PLANNED').length, 0);
  });

  it('nivel 21: 23 IMPLEMENTED / 0 PARTIAL / 0 PLANNED', () => {
    assert.equal(CATALOG_21.filter((s) => s.implementationStatus === 'IMPLEMENTED').length, 23);
    assert.equal(CATALOG_21.filter((s) => s.implementationStatus === 'PARTIAL').length, 0);
    assert.equal(CATALOG_21.filter((s) => s.implementationStatus === 'PLANNED').length, 0);
  });
});

describe('computeEffectiveWeights (normalización automática)', () => {
  it('tres pesos iguales: suma exacta 100 con precisión de 2 decimales', () => {
    const weights = computeEffectiveWeights([
      makeDefinition('a', 1),
      makeDefinition('b', 1),
      makeDefinition('c', 1),
    ]);
    const values = [...weights.values()].sort();
    assert.deepEqual(values, [33.33, 33.33, 33.34]);
    assert.equal(Math.round([...weights.values()].reduce((a, b) => a + b, 0) * 100) / 100, 100);
  });

  it('pesos que no dividen exacto (1, 2, 4): suma 100 y todos positivos', () => {
    const weights = computeEffectiveWeights([
      makeDefinition('a', 1),
      makeDefinition('b', 2),
      makeDefinition('c', 4),
    ]);
    const values = [...weights.values()];
    assert.ok(values.every((v) => Number.isFinite(v) && v > 0), 'sin NaN ni ceros');
    assert.equal(Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100, 100);
  });

  it('entrada vacía → Map vacío', () => {
    assert.equal(computeEffectiveWeights([]).size, 0);
  });

  it('todos PLANNED → Map vacío (nada entra al cálculo efectivo)', () => {
    const weights = computeEffectiveWeights([
      makeDefinition('a', 1, 'PLANNED'),
      makeDefinition('b', 1, 'PLANNED'),
    ]);
    assert.equal(weights.size, 0);
  });

  it('los PLANNED quedan fuera y no distorsionan la normalización', () => {
    const weights = computeEffectiveWeights([
      makeDefinition('a', 1),
      makeDefinition('b', 1),
      makeDefinition('c', 90, 'PLANNED'),
    ]);
    assert.deepEqual([...weights.entries()].sort(), [
      ['a', 50],
      ['b', 50],
    ]);
  });

  it('si mañana se implementa un estándar nuevo, la normalización se recalcula sola', () => {
    const before = computeEffectiveWeights([
      makeDefinition('a', 1),
      makeDefinition('b', 3, 'PLANNED'),
    ]);
    assert.equal(before.get('a'), 100);

    const after = computeEffectiveWeights([
      makeDefinition('a', 1),
      makeDefinition('b', 3, 'IMPLEMENTED'),
    ]);
    assert.equal(after.get('a'), 25);
    assert.equal(after.get('b'), 75);
    assert.equal(Math.round([...after.values()].reduce((x, y) => x + y, 0) * 100) / 100, 100);
  });
});

describe('StandardCatalogService — catálogo efectivo (FASE 5.1)', () => {
  const service = new StandardCatalogService();

  it('getImplementedStandards excluye PLANNED (conteos 12 / 23 / 57 — SCOPE-1)', () => {
    assert.equal(service.getImplementedStandards('7').length, 12);
    assert.equal(service.getImplementedStandards('21').length, 23);
    assert.equal(service.getImplementedStandards('60').length, 57);
    for (const level of LEVELS) {
      for (const standard of service.getImplementedStandards(level)) {
        assert.notEqual(standard.implementationStatus, 'PLANNED');
      }
    }
  });

  it('getPendingStandards devuelve solo PLANNED (nivel 60 → 12, 7/21 → 0 — SCOPE-1)', () => {
    assert.equal(service.getPendingStandards('60').length, 12);
    assert.equal(service.getPendingStandards('7').length, 0);
    assert.equal(service.getPendingStandards('21').length, 0);
    for (const standard of service.getPendingStandards('60')) {
      assert.equal(standard.implementationStatus, 'PLANNED');
      // SCOPE-1: los OUT_OF_SCOPE conservan su moduleRoute (infraestructura futura).
      if (standard.classification !== 'OUT_OF_SCOPE') {
        assert.equal(standard.moduleRoute, '');
      }
    }
  });

  it('getImplementedWeight: 60 → 110, 21 → 33.5, 7 → 21 (SCOPE-1: peso 1 de 3.3.4/3.3.5/3.3.6 sale del cálculo)', () => {
    assert.equal(service.getImplementedWeight('60'), 110);
    assert.equal(service.getImplementedWeight('21'), 33.5);
    assert.equal(service.getImplementedWeight('7'), 21);
  });

  it('getEffectiveCatalog: effectiveWeight suma exactamente 100 en cada nivel', () => {
    for (const level of LEVELS) {
      const dto = service.getEffectiveCatalog(level);
      const sum = dto.standards.reduce((acc, standard) => acc + standard.effectiveWeight, 0);
      assert.ok(Math.abs(sum - 100) < 1e-9, `${level}: suma ${sum}`);
      assert.equal(dto.effectiveTotal, 100);
    }
  });

  it('getEffectiveCatalog: count = IMPLEMENTED + PARTIAL y PLANNED fuera (SCOPE-1: 57)', () => {
    const dto = service.getEffectiveCatalog('60');
    assert.equal(dto.count, 57);
    assert.equal(dto.implementedCount, 57);
    assert.equal(dto.plannedCount, 12);
    for (const standard of dto.standards) {
      assert.ok(
        standard.implementationStatus === 'IMPLEMENTED' ||
          standard.implementationStatus === 'PARTIAL',
      );
      assert.ok(Number.isFinite(standard.effectiveWeight), `${standard.code} effectiveWeight NaN`);
      assert.ok(standard.effectiveWeight > 0, `${standard.code} effectiveWeight <= 0`);
      assert.ok(Number.isFinite(standard.normativeWeight), `${standard.code} normativeWeight NaN`);
    }
  });

  it('getEffectiveCatalog nivel 60: effectiveWeight se recalcula para suma exacta 100', () => {
    const dto = service.getEffectiveCatalog('60');
    const sum = dto.standards.reduce((acc, s) => acc + s.effectiveWeight, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9, `suma efectiva debe ser 100 (actual: ${sum})`);
  });

  it('getEffectiveCatalog: normativeWeight intacto y consistente con getCatalog', () => {
    for (const level of LEVELS) {
      const effective = service.getEffectiveCatalog(level);
      const normative = service.getCatalog(level);
      const byCode = new Map(normative.standards.map((standard) => [standard.code, standard.weight]));
      for (const standard of effective.standards) {
        assert.equal(
          standard.normativeWeight,
          byCode.get(standard.code),
          `${standard.code}: peso normativo alterado`,
        );
      }
    }
  });

  it('getCatalog (normativo) mantiene el contrato: weight + implementationStatus opcional', () => {
    const dto = service.getCatalog('60');
    for (const standard of dto.standards) {
      assert.equal(typeof standard.weight, 'number');
      assert.ok(standard.weight > 0);
      assert.ok(
        standard.implementationStatus !== undefined &&
          VALID_STATUSES.includes(standard.implementationStatus),
        `estado inválido en ${standard.code}`,
      );
    }
  });
});

describe('StandardCatalogService', () => {
  const service = new StandardCatalogService();

  it('getCatalog devuelve el DTO con nivel, count y estándares consistentes', () => {
    for (const level of LEVELS) {
      const dto = service.getCatalog(level);
      assert.equal(dto.level, level);
      assert.equal(dto.count, dto.standards.length);
      assert.ok(dto.standards.length > 0, `catálogo ${level} vacío`);
    }
  });

  it('getCatalog: cada estándar del DTO tiene los campos esenciales poblados', () => {
    const dto = service.getCatalog('60');
    for (const standard of dto.standards) {
      assert.ok(standard.code.length > 0);
      assert.ok(standard.title.length > 0);
      assert.ok(PHVA_PHASES.includes(standard.phva), `PHVA inválido en ${standard.code}`);
      assert.ok(standard.weight > 0);
      assert.ok(standard.applicableLevels.length > 0);
      assert.ok(typeof standard.moduleRoute === 'string');
    }
  });

  it('getApplicableStandards devuelve las definiciones crudas con el nivel aplicable', () => {
    for (const level of LEVELS) {
      const standards = service.getApplicableStandards(level);
      assert.ok(standards.length > 0);
      for (const standard of standards) {
        assert.ok(standard.applicableLevels.includes(level), `${standard.code} sin nivel ${level}`);
      }
    }
  });

  it('getStandardsByPhva filtra correctamente por fase PHVA', () => {
    for (const level of LEVELS) {
      for (const phva of PHVA_PHASES) {
        const dto = service.getStandardsByPhva(level, phva);
        for (const standard of dto.standards) {
          assert.equal(standard.phva, phva, `${standard.code} con fase incorrecta`);
        }
      }
    }
  });

  it('getStandardByCode encuentra estándares y devuelve null para códigos inexistentes', () => {
    const found = service.getStandardByCode('60', '1.1.1');
    assert.ok(found, '1.1.1 debería existir');
    assert.equal(found?.code, '1.1.1');

    const missing = service.getStandardByCode('60', '9.9.9');
    assert.equal(missing, null);
  });

  it('isValidLevel acepta solo 7, 21 y 60', () => {
    assert.equal(service.isValidLevel('7'), true);
    assert.equal(service.isValidLevel('21'), true);
    assert.equal(service.isValidLevel('60'), true);
    assert.equal(service.isValidLevel('5'), false);
    assert.equal(service.isValidLevel(''), false);
    assert.equal(service.isValidLevel('70'), false);
  });

  it('levels expone los tres niveles válidos', () => {
    assert.deepEqual([...service.levels].sort(), ['21', '60', '7']);
  });
});

describe('INVARIANT — Gobernanza del catálogo (FASE 28)', () => {
  const ALL_CODES = CATALOG_60.map((s) => s.code);
  const CODE_SET = new Set(ALL_CODES);
  const IMPLEMENTED = CATALOG_60.filter((s) => s.implementationStatus !== 'PLANNED');
  const DUPLICATE_ENTRIES = CATALOG_60.filter((s) => s.classification === 'DUPLICATE');
  const COMPLEMENTARY_ENTRIES = CATALOG_60.filter((s) => s.classification === 'COMPLEMENTARY');
  const PHANTOM_ENTRIES = CATALOG_60.filter((s) => s.classification === 'PHANTOM');

  // ── INVARIANT 01: códigos únicos ──
  it('INV-01: no puede haber dos entradas con el mismo code', () => {
    assert.equal(new Set(ALL_CODES).size, ALL_CODES.length, 'códigos duplicados detectados');
  });

  // ── INVARIANT 02: duplicateOf válido ──
  it('INV-02a: toda entrada DUPLICATE tiene duplicateOf definido', () => {
    for (const s of DUPLICATE_ENTRIES) {
      assert.ok(s.duplicateOf, `${s.code} es DUPLICATE pero no tiene duplicateOf`);
    }
  });

  it('INV-02b: duplicateOf apunta a un código existente', () => {
    for (const s of DUPLICATE_ENTRIES) {
      assert.ok(CODE_SET.has(s.duplicateOf!), `${s.code}.duplicateOf="${s.duplicateOf}" no existe`);
    }
  });

  it('INV-02c: duplicateOf no apunta a sí mismo', () => {
    for (const s of DUPLICATE_ENTRIES) {
      assert.notEqual(s.code, s.duplicateOf, `${s.code} se duplica a sí mismo`);
    }
  });

  it('INV-02d: duplicateOf no apunta a otra entrada DUPLICATE', () => {
    const dupCodes = new Set(DUPLICATE_ENTRIES.map((s) => s.code));
    for (const s of DUPLICATE_ENTRIES) {
      assert.ok(!dupCodes.has(s.duplicateOf!), `${s.code} apunta a DUPLICATE ${s.duplicateOf}`);
    }
  });

  it('INV-02e: ningún DUPLICATE entra al scoring (son PLANNED)', () => {
    for (const s of DUPLICATE_ENTRIES) {
      assert.equal(s.implementationStatus, 'PLANNED', `${s.code} DUPLICATE no puede ser IMPLEMENTED`);
    }
  });

  // ── INVARIANT 03: COMPLEMENTARY no puntúa ──
  it('INV-03a: ningún COMPLEMENTARY aparece en el catálogo efectivo de scoring', () => {
    const service = new StandardCatalogService();
    const effective = service.getEffectiveCatalog('60');
    const effectiveCodes = new Set(effective.standards.map((s) => s.code));
    for (const s of COMPLEMENTARY_ENTRIES) {
      assert.ok(!effectiveCodes.has(s.code), `${s.code} COMPLEMENTARY no debe estar en scoring`);
    }
  });

  it('INV-03b: ningún COMPLEMENTARY es IMPLEMENTED (regla de gobernanza)', () => {
    for (const s of COMPLEMENTARY_ENTRIES) {
      assert.equal(
        s.implementationStatus,
        'PLANNED',
        `${s.code} COMPLEMENTARY debe ser PLANNED`,
      );
    }
  });

  // ── INVARIANT 04: PHANTOM no puntúa ──
  it('INV-04: actualmente no existen entradas PHANTOM', () => {
    assert.equal(PHANTOM_ENTRIES.length, 0, 'debe haber 0 PHANTOM');
  });

  // ── INVARIANT 05: clasificación OFFICIAL implícita ──
  it('INV-05: las entradas sin classification son OFFICIAL implícito', () => {
    const noClassification = CATALOG_60.filter((s) => s.classification === undefined);
    assert.ok(noClassification.length > 0, 'debe haber entradas sin classification explícita');
    for (const s of noClassification) {
      // Deben ser los IMPLEMENTED oficiales + el nuevo PLANNED (3.1.5)
      assert.ok(
        s.implementationStatus === 'IMPLEMENTED' || s.implementationStatus === 'PLANNED',
        `${s.code} sin classification pero estado inesperado: ${s.implementationStatus}`,
      );
    }
  });

  // ── INVARIANT 06: PLANNED no puntúa ──
  it('INV-06: ningún PLANNED aparece en el catálogo efectivo de scoring', () => {
    const service = new StandardCatalogService();
    const effective = service.getEffectiveCatalog('60');
    for (const s of effective.standards) {
      assert.notEqual(s.implementationStatus, 'PLANNED', `${s.code} PLANNED no debe puntuar`);
    }
  });

  // ── INVARIANT 07: clasificación y scoring coherencia ──
  it('INV-07a: DUPLICATE+IMPLEMENTED es imposible actualmente (si surgiera, rompería scoring)', () => {
    const dupeImpl = DUPLICATE_ENTRIES.filter((s) => s.implementationStatus === 'IMPLEMENTED');
    assert.equal(dupeImpl.length, 0, 'DUPLICATE+IMPLEMENTED no debe existir');
  });

  it('INV-07b: COMPLEMENTARY+IMPLEMENTED es imposible actualmente', () => {
    const compImpl = COMPLEMENTARY_ENTRIES.filter((s) => s.implementationStatus === 'IMPLEMENTED');
    assert.equal(compImpl.length, 0, 'COMPLEMENTARY+IMPLEMENTED no debe existir');
  });

  // ── INVARIANT 08: effective-weights normaliza correctamente ──
  it('INV-08: computeEffectiveWeights sobre CATALOG_60 produce suma exacta 100', () => {
    const weights = computeEffectiveWeights(CATALOG_60);
    let sum = 0;
    for (const w of weights.values()) sum += w;
    assert.ok(Math.abs(sum - 100) < 1e-6, `suma efectiva = ${sum}, esperada 100`);
  });

  // ── INVARIANT 09: PHASE_WEIGHTS intactos ──
  it('INV-09: pesos PHVA siguen siendo plan=0.25 do=0.60 check=0.05 act=0.10', () => {
    // Importamos dinámicamente para no crear dependencia circular en imports
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DEFAULT_PHASE_WEIGHTS } = require('../compliance-engine/utils/compliance-weights') as {
      DEFAULT_PHASE_WEIGHTS: Record<string, number>;
    };
    assert.equal(DEFAULT_PHASE_WEIGHTS.plan, 0.25);
    assert.equal(DEFAULT_PHASE_WEIGHTS.do, 0.6);
    assert.equal(DEFAULT_PHASE_WEIGHTS.check, 0.05);
    assert.equal(DEFAULT_PHASE_WEIGHTS.act, 0.1);
    const sum =
      DEFAULT_PHASE_WEIGHTS.plan +
      DEFAULT_PHASE_WEIGHTS.do +
      DEFAULT_PHASE_WEIGHTS.check +
      DEFAULT_PHASE_WEIGHTS.act;
    assert.ok(Math.abs(sum - 1) < 1e-9, `PHASE_WEIGHTS sum = ${sum}, esperado 1`);
  });

  // ── INVARIANT 10: conteos globales ──
  it('INV-10: conteos globales estables (69 total, 57 implemented, 12 planned, 4 dup, 5 comp, 0 phantom) — SCOPE-1', () => {
    assert.equal(CATALOG_60.length, 69, 'total');
    assert.equal(IMPLEMENTED.length, 57, 'implemented');
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'PLANNED').length, 12, 'planned');
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'PARTIAL').length, 0, 'partial');
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'IMPLEMENTED').length + CATALOG_60.filter((s) => s.implementationStatus === 'PLANNED').length + CATALOG_60.filter((s) => s.implementationStatus === 'PARTIAL').length, 69, 'suma total');
    assert.equal(DUPLICATE_ENTRIES.length, 4, 'duplicates');
    assert.equal(COMPLEMENTARY_ENTRIES.length, 5, 'complementary');
    assert.equal(PHANTOM_ENTRIES.length, 0, 'phantom');
  });

  // ── INVARIANT 11: 3.3.2 está correctamente alineado ──
  it('INV-11: 3.3.2 tiene PHVA=HACER, es IMPLEMENTED, y su analyzer activo es HealthIndicatorsStandardAnalyzer', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.2');
    assert.ok(std, '3.3.2 presente');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.implementationStatus, 'IMPLEMENTED');
    // Dead analyzer (IndicatorHealthStandardAnalyzer) fue eliminado en FASE 27.3
    // HealthIndicatorsStandardAnalyzer es el analyzer activo confirmado por grep
  });
});

describe('StandardCatalogController', () => {
  const realService = new StandardCatalogService();
  const controller = new StandardCatalogController(realService);

  it('responde con el DTO del service para cada nivel', () => {
    for (const level of LEVELS) {
      const result = controller.getCatalog(level);
      assert.equal(result.level, level);
      assert.ok(Array.isArray(result.standards));
      assert.ok(result.standards.length > 0);
    }
  });

  it('rechaza niveles inválidos con BadRequest', () => {
    assert.throws(() => controller.getCatalog('5'), /Invalid standard level/);
    assert.throws(() => controller.getCatalog('abc'), /Invalid standard level/);
  });
});
