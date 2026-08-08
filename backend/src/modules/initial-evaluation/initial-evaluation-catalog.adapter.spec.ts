import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StandardDefinition, StandardLevel } from '../standard-catalog/interfaces/standard-definition.interface';
import { StandardCatalogService } from '../standard-catalog/standard-catalog.service';
import { AlertsService } from '../alerts/alerts.service';
import {
  buildCatalogStandards,
  buildLegacyStandards,
  compareCatalogs,
  InitialEvaluationCatalogAdapter,
  LEGACY_INITIAL_EVALUATION_CATALOG,
} from './initial-evaluation-catalog.adapter';
import { InitialEvaluationService } from './initial-evaluation.service';
import { StandardEvaluationStatus } from './schemas/initial-evaluation.schema';

/** Definiciones del StandardCatalog que replican EXACTAMENTE el catálogo legacy. */
function makeEquivalentCatalog(): StandardDefinition[] {
  return LEGACY_INITIAL_EVALUATION_CATALOG.map((item) => ({
    code: item.code,
    title: item.title,
    description: item.description,
    chapter: item.chapter,
    phva: 'PLANEAR',
    normativeWeight: item.weight,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/documents/plan',
    implementationStatus: 'IMPLEMENTED',
  }));
}

/** Stub del StandardCatalogService con control de llamadas. */
class SpyCatalogService extends StandardCatalogService {
  applicableCalls = 0;
  throwOnNext = false;

  override getApplicableStandards(level: StandardLevel): readonly StandardDefinition[] {
    this.applicableCalls += 1;
    if (this.throwOnNext) throw new Error('catalog boom');
    return super.getApplicableStandards(level);
  }
}

describe('buildLegacyStandards', () => {
  it('genera 10 estándares legacy con estado DOES_NOT_COMPLY y defaults', () => {
    const standards = buildLegacyStandards();
    assert.equal(standards.length, 10);
    for (const standard of standards) {
      assert.equal(standard.status, StandardEvaluationStatus.DOES_NOT_COMPLY);
      assert.equal(standard.observations, '');
      assert.deepEqual(standard.evidence, []);
      assert.deepEqual(standard.attachments, []);
      assert.equal(standard.autoEvaluated, false);
    }
  });
});

describe('buildCatalogStandards', () => {
  it('convierte StandardDefinition → EvaluationStandard usando normativeWeight', () => {
    const standards = buildCatalogStandards([
      {
        code: '1.1.1',
        title: 'Responsable del SG-SST',
        description: 'Descripción',
        chapter: 'Recursos',
        phva: 'PLANEAR',
        normativeWeight: 0.5,
        applicableLevels: ['7', '21', '60'],
        moduleRoute: '/documents/plan',
        implementationStatus: 'IMPLEMENTED',
      },
    ]);
    assert.equal(standards.length, 1);
    assert.equal(standards[0].code, '1.1.1');
    assert.equal(standards[0].weight, 0.5);
    assert.equal(standards[0].chapter, 'Recursos');
    assert.equal(standards[0].status, StandardEvaluationStatus.DOES_NOT_COMPLY);
  });
});

describe('compareCatalogs (verificación de equivalencia)', () => {
  it('catálogos idénticos → equivalent', () => {
    const legacy = buildLegacyStandards();
    const standard = buildCatalogStandards(makeEquivalentCatalog());
    const result = compareCatalogs(legacy, standard);
    assert.equal(result.equivalent, true);
    assert.deepEqual(result.differences, []);
  });

  it('código ausente en StandardCatalog → no equivalente', () => {
    const legacy = buildLegacyStandards();
    const standard = buildCatalogStandards(makeEquivalentCatalog()).filter((s) => s.code !== '1.1.1');
    const result = compareCatalogs(legacy, standard);
    assert.equal(result.equivalent, false);
    assert.ok(result.differences.some((d) => d.includes('1.1.1: ausente')));
  });

  it('peso distinto (1.2.1 legacy=6 vs standard=2) → no equivalente', () => {
    const legacy = buildLegacyStandards();
    const standard = buildCatalogStandards(
      makeEquivalentCatalog().map((s) => (s.code === '1.2.1' ? { ...s, normativeWeight: 2 } : s)),
    );
    const result = compareCatalogs(legacy, standard);
    assert.equal(result.equivalent, false);
    assert.ok(result.differences.some((d) => d.includes('1.2.1: weight legacy=6 vs standard=2')));
  });

  it('capítulo distinto → no equivalente', () => {
    const legacy = buildLegacyStandards();
    const standard = buildCatalogStandards(
      makeEquivalentCatalog().map((s) => (s.code === '1.2.1' ? { ...s, chapter: 'Recursos' } : s)),
    );
    const result = compareCatalogs(legacy, standard);
    assert.equal(result.equivalent, false);
    assert.ok(result.differences.some((d) => d.includes('chapter legacy')));
  });

  it('orden distinto → no equivalente', () => {
    const legacy = buildLegacyStandards();
    const catalog = makeEquivalentCatalog();
    const swapped = [catalog[1], catalog[0], ...catalog.slice(2)];
    const standard = buildCatalogStandards(swapped);
    const result = compareCatalogs(legacy, standard);
    assert.equal(result.equivalent, false);
    assert.ok(result.differences.some((d) => d.includes('orden difiere')));
  });

  it('códigos extra en StandardCatalog → no equivalente y reportados', () => {
    const legacy = buildLegacyStandards();
    const catalog = makeEquivalentCatalog();
    const withExtra = [
      ...catalog,
      {
        code: '2.3.1',
        title: 'Evaluación inicial',
        description: 'x',
        chapter: 'Gestión integral',
        phva: 'PLANEAR' as const,
        normativeWeight: 1,
        applicableLevels: ['7', '21', '60'] as StandardLevel[],
        moduleRoute: '/documents/plan',
        implementationStatus: 'IMPLEMENTED' as const,
      },
    ];
    const result = compareCatalogs(legacy, buildCatalogStandards(withExtra));
    assert.equal(result.equivalent, false);
    assert.ok(result.differences.some((d) => d.includes('códigos extra')));
  });
});

describe('InitialEvaluationCatalogAdapter.resolveStandards', () => {
  it('company nulo → fallback legacy sin lanzar', () => {
    const adapter = new InitialEvaluationCatalogAdapter(new SpyCatalogService());
    const standards = adapter.resolveStandards(null);
    assert.equal(standards.length, 10);
  });

  it('standardsType inválido → fallback legacy', () => {
    const adapter = new InitialEvaluationCatalogAdapter(new SpyCatalogService());
    const standards = adapter.resolveStandards({ standardsType: '999' });
    assert.equal(standards.length, 10);
  });

  it('niveles 7/21/60: consulta el StandardCatalog y mantiene fallback legacy (no rompe creación)', () => {
    for (const level of ['7', '21', '60']) {
      const spy = new SpyCatalogService();
      const adapter = new InitialEvaluationCatalogAdapter(spy);
      const standards = adapter.resolveStandards({ standardsType: level });
      assert.equal(standards.length, 10, `nivel ${level}: fallback legacy`);
      assert.equal(spy.applicableCalls, 1, `nivel ${level}: StandardCatalog consultado`);
    }
  });

  it('catálogo vacío → fallback legacy', () => {
    const emptyService = {
      isValidLevel: (v: string): v is StandardLevel => v === '7' || v === '21' || v === '60',
      getApplicableStandards: () => [],
    } as unknown as StandardCatalogService;
    const adapter = new InitialEvaluationCatalogAdapter(emptyService);
    const standards = adapter.resolveStandards({ standardsType: '60' });
    assert.equal(standards.length, 10);
  });

  it('excepción del catálogo → fallback legacy sin lanzar', () => {
    const spy = new SpyCatalogService();
    spy.throwOnNext = true;
    const adapter = new InitialEvaluationCatalogAdapter(spy);
    const standards = adapter.resolveStandards({ standardsType: '60' });
    assert.equal(standards.length, 10);
  });

  it('equivalencia verificada → usa el catálogo oficial (migración activa)', () => {
    const equivalentService = {
      isValidLevel: (v: string): v is StandardLevel => v === '7' || v === '21' || v === '60',
      getApplicableStandards: () => makeEquivalentCatalog(),
    } as unknown as StandardCatalogService;
    const adapter = new InitialEvaluationCatalogAdapter(equivalentService);
    const standards = adapter.resolveStandards({ standardsType: '60' });
    assert.equal(standards.length, 10);
    // El primer estándar del catálogo oficial NO lleva autoSource legacy.
    assert.equal(standards[0].autoSource, undefined);
    assert.equal(standards[0].code, '1.1.1');
  });

  it('equivalencia verificada pero el orden legacy difiere → fallback (protección de orden)', () => {
    const service = {
      isValidLevel: (v: string): v is StandardLevel => v === '7' || v === '21' || v === '60',
      getApplicableStandards: () => {
        const catalog = makeEquivalentCatalog();
        return [catalog[1], catalog[0], ...catalog.slice(2)];
      },
    } as unknown as StandardCatalogService;
    const adapter = new InitialEvaluationCatalogAdapter(service);
    const standards = adapter.resolveStandards({ standardsType: '60' });
    assert.equal(standards.length, 10);
    assert.equal(standards[0].autoSource, 'Responsable SST', 'fallback legacy preserva autoSource');
  });
});

describe('InitialEvaluationService.findOrCreate (FASE 6A)', () => {
  const unusedModel = { findOne: () => ({ lean: () => ({ exec: async () => null }) }) };

  function buildService(options: {
    company?: { standardsType?: string } | null;
    existing?: { companyId: string; standards: unknown[]; actionPlan: unknown[]; status: string };
    catalogService?: StandardCatalogService;
  }) {
    let stored: Record<string, unknown> | null = options.existing ?? null;
    let createCalls = 0;
    let companyLookups = 0;

    const evaluationModel = {
      findOne: () => ({ exec: async () => stored }),
      create: async (doc: Record<string, unknown>) => {
        createCalls += 1;
        // Replica los defaults del schema Mongo (actionPlan/findings/gaps/...).
        stored = {
          ...doc,
          status: doc.status ?? 'Borrador',
          gaps: doc.gaps ?? [],
          findings: doc.findings ?? [],
          actionPlan: doc.actionPlan ?? [],
          signatures: doc.signatures ?? [],
          history: doc.history ?? [],
        };
        return stored;
      },
    };
    const companyModel = {
      findById: () => {
        companyLookups += 1;
        return { lean: () => ({ exec: async () => options.company ?? null }) };
      },
    };
    const adapter = new InitialEvaluationCatalogAdapter(
      options.catalogService ?? new SpyCatalogService(),
    );

    const service = new InitialEvaluationService(
      evaluationModel as never,
      companyModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      {} as AlertsService,
      adapter,
    );

    return { service, getCreateCalls: () => createCalls, getCompanyLookups: () => companyLookups, getStored: () => stored };
  }

  it('empresa nueva: resuelve standardsType y crea con los estándares del adapter', async () => {
    const { service, getCreateCalls, getCompanyLookups, getStored } = buildService({
      company: { standardsType: '60' },
    });
    const evaluation = await service.findOrCreate('a'.repeat(24) as never);

    assert.equal(getCreateCalls(), 1);
    assert.equal(getCompanyLookups(), 1);
    assert.ok((getStored()?.standards as unknown[]).length > 0);
    assert.ok((evaluation.standards as unknown[]).length > 0);
    assert.equal(typeof evaluation.overallCompliance, 'number');
  });

  it('empresa existente: NO crea ni consulta la empresa (sin cambios)', async () => {
    const { service, getCreateCalls, getCompanyLookups } = buildService({
      existing: { companyId: 'a'.repeat(24), standards: [], actionPlan: [], status: 'Aprobada' },
    });
    const evaluation = await service.findOrCreate('a'.repeat(24) as never);

    assert.equal(getCreateCalls(), 0);
    assert.equal(getCompanyLookups(), 0);
    assert.equal(evaluation.status, 'Aprobada');
  });

  it('creación repetida: solo crea la primera vez', async () => {
    const { service, getCreateCalls } = buildService({ company: { standardsType: '21' } });

    await service.findOrCreate('a'.repeat(24) as never);
    await service.findOrCreate('a'.repeat(24) as never);

    assert.equal(getCreateCalls(), 1);
  });

  it('empresa nueva sin empresa en BD: fallback legacy sin romper', async () => {
    const { service, getStored } = buildService({ company: null });
    await service.findOrCreate('a'.repeat(24) as never);
    assert.equal((getStored()?.standards as unknown[]).length, 10);
  });
});
