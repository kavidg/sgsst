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
  // Los conteos no replican uno a uno los 7/21 ítems textuales de la norma:
  // la plataforma desglosa los estándares en códigos más granulares. Son una
  // aproximación documentada (ver cabeceras de catalog-7.ts/catalog-21.ts).
  it('conteos esperados del catálogo derivado: 11 / 22 / 60', () => {
    assert.equal(CATALOG_7.length, 11);
    assert.equal(CATALOG_21.length, 22);
    assert.equal(CATALOG_60.length, 60);
  });

  it('los 50 códigos de plataforma suman 100 y el maestro 60 suma 110 (pesos anexo intencionales)', () => {
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

    assert.equal(platformCodes.length, 50, '50 códigos verificados de la plataforma');
    assert.equal(annexCodes.length, 10, '10 ítems del anexo sin módulo');
    assert.equal(sum(platformCodes), 100, 'escala PHVA de la plataforma = 100');
    assert.equal(sum(annexCodes), 10, 'ítems del anexo = 1 punto cada uno');
    assert.equal(sum([...platformCodes, ...annexCodes]), 110);
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

  it('PLANNED ⟺ moduleRoute vacío (sin módulo en la plataforma)', () => {
    for (const standard of CATALOG_60) {
      if (standard.implementationStatus === 'PLANNED') {
        assert.equal(standard.moduleRoute, '', `${standard.code} PLANNED con módulo`);
      } else {
        assert.ok(standard.moduleRoute.length > 0, `${standard.code} sin módulo pero no PLANNED`);
      }
    }
  });

  it('nivel 60: 29 IMPLEMENTED / 21 PARTIAL / 10 PLANNED', () => {
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'IMPLEMENTED').length, 29);
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'PARTIAL').length, 21);
    assert.equal(CATALOG_60.filter((s) => s.implementationStatus === 'PLANNED').length, 10);
  });

  it('FASE 6: 1.1.7 Capacitación COPASST → IMPLEMENTED con provider y ruta (peso intacto)', () => {
    const standard = CATALOG_60.find((s) => s.code === '1.1.7');
    assert.ok(standard, '1.1.7 presente en el catálogo');
    assert.equal(standard.implementationStatus, 'IMPLEMENTED');
    assert.equal(standard.validationProvider, 'copasst-training.provider');
    assert.equal(standard.moduleRoute, '/advanced-management/1.1.7');
    assert.equal(standard.normativeWeight, 0.5, 'peso normativo intacto (no se alteraron pesos)');
  });

  it('nivel 7: 10 IMPLEMENTED / 1 PARTIAL / 0 PLANNED', () => {
    assert.equal(CATALOG_7.filter((s) => s.implementationStatus === 'IMPLEMENTED').length, 10);
    assert.equal(CATALOG_7.filter((s) => s.implementationStatus === 'PARTIAL').length, 1);
    assert.equal(CATALOG_7.filter((s) => s.implementationStatus === 'PLANNED').length, 0);
  });

  it('nivel 21: 20 IMPLEMENTED / 2 PARTIAL / 0 PLANNED', () => {
    assert.equal(CATALOG_21.filter((s) => s.implementationStatus === 'IMPLEMENTED').length, 20);
    assert.equal(CATALOG_21.filter((s) => s.implementationStatus === 'PARTIAL').length, 2);
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
    // Hoy: solo 'a' implementado (peso 1) → absorbe el 100%.
    const before = computeEffectiveWeights([
      makeDefinition('a', 1),
      makeDefinition('b', 3, 'PLANNED'),
    ]);
    assert.equal(before.get('a'), 100);

    // Mañana: 'b' pasa a IMPLEMENTED sin tocar código → reparte 1:3 → 25/75.
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

  it('getImplementedStandards excluye PLANNED (conteos 11 / 22 / 50)', () => {
    assert.equal(service.getImplementedStandards('7').length, 11);
    assert.equal(service.getImplementedStandards('21').length, 22);
    assert.equal(service.getImplementedStandards('60').length, 50);
    for (const level of LEVELS) {
      for (const standard of service.getImplementedStandards(level)) {
        assert.notEqual(standard.implementationStatus, 'PLANNED');
      }
    }
  });

  it('getPendingStandards devuelve solo PLANNED (nivel 60 → 10, 7/21 → 0)', () => {
    assert.equal(service.getPendingStandards('60').length, 10);
    assert.equal(service.getPendingStandards('7').length, 0);
    assert.equal(service.getPendingStandards('21').length, 0);
    for (const standard of service.getPendingStandards('60')) {
      assert.equal(standard.implementationStatus, 'PLANNED');
      assert.equal(standard.moduleRoute, '');
    }
  });

  it('getImplementedWeight: 60 → 100, 21 → 30.5, 7 → 18', () => {
    assert.equal(service.getImplementedWeight('60'), 100);
    assert.equal(service.getImplementedWeight('21'), 30.5);
    assert.equal(service.getImplementedWeight('7'), 18);
  });

  it('getEffectiveCatalog: effectiveWeight suma exactamente 100 en cada nivel', () => {
    for (const level of LEVELS) {
      const dto = service.getEffectiveCatalog(level);
      const sum = dto.standards.reduce((acc, standard) => acc + standard.effectiveWeight, 0);
      assert.ok(Math.abs(sum - 100) < 1e-9, `${level}: suma ${sum}`);
      assert.equal(dto.effectiveTotal, 100);
    }
  });

  it('getEffectiveCatalog: count = IMPLEMENTED + PARTIAL y PLANNED fuera', () => {
    const dto = service.getEffectiveCatalog('60');
    assert.equal(dto.count, 50);
    assert.equal(dto.implementedCount, 29);
    assert.equal(dto.plannedCount, 10);
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

  it('getEffectiveCatalog nivel 60: effectiveWeight === normativeWeight (escala 1)', () => {
    const dto = service.getEffectiveCatalog('60');
    for (const standard of dto.standards) {
      assert.equal(standard.effectiveWeight, standard.normativeWeight, standard.code);
    }
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
