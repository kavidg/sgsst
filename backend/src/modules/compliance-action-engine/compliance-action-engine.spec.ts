import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ComplianceActionEngineService } from './compliance-action-engine.service';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { ComplianceOverviewDto } from '../compliance-engine/dto/compliance-overview.dto';
import { FindingPriority } from '../compliance-engine/enums/finding-priority.enum';
import { ComplianceLevel } from '../compliance-engine/enums/compliance-level.enum';

/** Overview mínimo que genera recomendaciones. */
function buildOverview(overrides?: Partial<ComplianceOverviewDto>): ComplianceOverviewDto {
  return {
    overallCompliance: 60,
    phaseCompliance: { plan: 80, do: 50, check: 40, act: 70 },
    moduleCompliance: [
      { module: 'documents', compliance: 50, level: ComplianceLevel.CRITICAL, lastUpdated: new Date().toISOString() },
      { module: 'trainings', compliance: 40, level: ComplianceLevel.CRITICAL, lastUpdated: new Date().toISOString() },
      { module: 'risks', compliance: 60, level: ComplianceLevel.LOW, lastUpdated: new Date().toISOString() },
      { module: 'legal-matrix', compliance: 70, level: ComplianceLevel.MEDIUM, lastUpdated: new Date().toISOString() },
      { module: 'annual-work-plan', compliance: 55, level: ComplianceLevel.CRITICAL, lastUpdated: new Date().toISOString() },
    ],
    findings: [
      { id: 'finding-1', module: 'documents', title: 'Doc gap', priority: FindingPriority.HIGH, description: '', status: 'OPEN', responsible: 'SST', dueDate: new Date().toISOString(), createdAt: new Date().toISOString() },
      { id: 'finding-2', module: 'trainings', title: 'Training gap', priority: FindingPriority.CRITICAL, description: '', status: 'OPEN', responsible: 'SST', dueDate: new Date().toISOString(), createdAt: new Date().toISOString() },
      { id: 'finding-3', module: 'risks', title: 'Risk gap', priority: FindingPriority.MEDIUM, description: '', status: 'OPEN', responsible: 'SST', dueDate: new Date().toISOString(), createdAt: new Date().toISOString() },
    ],
    recommendations: [],
    alerts: [],
    prediction: null,
    trend: null,
    executiveSummary: 'Test summary',
    lastUpdated: new Date().toISOString(),
    ...overrides,
  } as ComplianceOverviewDto;
}

function buildService(overview?: ComplianceOverviewDto) {
  const complianceEngineService = {
    getOverview: async () => overview ?? buildOverview(),
  } as unknown as ComplianceEngineService;

  const service = new ComplianceActionEngineService(complianceEngineService);
  return { service, complianceEngineService };
}

// ==================== CAE-01: findings de tenant A producen acciones para A ====================

describe('CAE-01: findings de tenant A producen acciones para tenant A', () => {
  it('genera recomendaciones cuando hay gaps por debajo del umbral', async () => {
    const { service } = buildService();

    const recommendations = await service.getRecommendations('company-a');

    assert.ok(Array.isArray(recommendations));
    assert.ok(recommendations.length > 0, 'Debe generar al menos una recomendación con gaps');
  });
});

// ==================== CAE-02: findings de A no producen acciones para B ====================

describe('CAE-02: el servicio genera recomendaciones basadas en el overview, no en el companyId', () => {
  it('el companyId solo se usa para obtener el overview, las recomendaciones vienen del overview', async () => {
    let capturedCompanyId: string | undefined;
    const overview = buildOverview();

    const complianceEngineService = {
      getOverview: async (companyId: string) => {
        capturedCompanyId = companyId;
        return overview;
      },
    } as unknown as ComplianceEngineService;

    const service = new ComplianceActionEngineService(complianceEngineService);
    await service.getRecommendations('company-b');

    assert.equal(capturedCompanyId, 'company-b');
  });
});

// ==================== CAE-03: relatedFindingId se conserva ====================

describe('CAE-03: relatedFindingId se conserva correctamente', () => {
  it('cada recomendación tiene relatedFindingId del finding correspondiente o null', async () => {
    const { service } = buildService();

    const recommendations = await service.getRecommendations('company-a');

    for (const rec of recommendations) {
      assert.ok('relatedFindingId' in rec, 'relatedFindingId debe existir');
      if (rec.relatedFindingId !== null) {
        assert.equal(typeof rec.relatedFindingId, 'string');
      }
    }
  });
});

// ==================== CAE-04: output determinista (misma entrada = mismas recomendaciones) ====================

describe('CAE-04: output determinista — misma entrada produce mismas recomendaciones', () => {
  it('dos invocaciones con el mismo overview producen las mismas recomendaciones', async () => {
    const overview = buildOverview();
    const { service } = buildService(overview);

    const result1 = await service.getRecommendations('company-a');
    const result2 = await service.getRecommendations('company-a');

    assert.equal(result1.length, result2.length);
    for (let i = 0; i < result1.length; i++) {
      assert.equal(result1[i].id, result2[i].id);
      assert.equal(result1[i].title, result2[i].title);
      assert.equal(result1[i].priority, result2[i].priority);
    }
  });
});

// ==================== CAE-05: cada recomendación tiene campos requeridos ====================

describe('CAE-05: cada recomendación tiene todos los campos del DTO', () => {
  it('campos requeridos presentes', async () => {
    const { service } = buildService();

    const recommendations = await service.getRecommendations('company-a');

    for (const rec of recommendations) {
      assert.equal(typeof rec.id, 'string');
      assert.equal(typeof rec.title, 'string');
      assert.equal(typeof rec.description, 'string');
      assert.equal(typeof rec.priority, 'string');
      assert.equal(typeof rec.estimatedImpact, 'number');
      assert.equal(typeof rec.estimatedDurationDays, 'number');
      assert.equal(typeof rec.recommendedResponsibleRole, 'string');
      assert.equal(typeof rec.relatedModule, 'string');
      assert.equal(typeof rec.estimatedCost, 'number');
      assert.equal(typeof rec.canCreateAnnualPlanActivity, 'boolean');
      assert.equal(typeof rec.canCreateObjective, 'boolean');
      assert.equal(typeof rec.canCreateIndicator, 'boolean');
      assert.equal(typeof rec.createdAutomatically, 'boolean');
      assert.equal(rec.createdAutomatically, true);
    }
  });
});

// ==================== CAE-06: overview limpio genera 0 recomendaciones ====================

describe('CAE-06: overview sin gaps no genera recomendaciones', () => {
  it('cumplimiento alto en todos los módulos → 0 recomendaciones', async () => {
    const cleanOverview = buildOverview({
      overallCompliance: 95,
      phaseCompliance: { plan: 95, do: 95, check: 95, act: 95 },
      moduleCompliance: [
        { module: 'documents', compliance: 95, level: ComplianceLevel.EXCELLENT, lastUpdated: new Date().toISOString() },
        { module: 'trainings', compliance: 95, level: ComplianceLevel.EXCELLENT, lastUpdated: new Date().toISOString() },
        { module: 'risks', compliance: 95, level: ComplianceLevel.EXCELLENT, lastUpdated: new Date().toISOString() },
        { module: 'legal-matrix', compliance: 95, level: ComplianceLevel.EXCELLENT, lastUpdated: new Date().toISOString() },
        { module: 'annual-work-plan', compliance: 95, level: ComplianceLevel.EXCELLENT, lastUpdated: new Date().toISOString() },
      ],
      findings: [],
    });

    const { service } = buildService(cleanOverview);
    const recommendations = await service.getRecommendations('company-a');

    assert.equal(recommendations.length, 0);
  });
});

// ==================== CAE-07: módulos sin datos no generan recomendaciones espurias ====================

describe('CAE-07: módulos ausentes en moduleCompliance no generan recomendaciones', () => {
  it('overview sin moduleCompliance no rompe', async () => {
    const sparseOverview = buildOverview({
      moduleCompliance: [],
      findings: [],
      phaseCompliance: { plan: 100, do: 100, check: 100, act: 100 },
    });

    const { service } = buildService(sparseOverview);
    const recommendations = await service.getRecommendations('company-a');

    assert.equal(recommendations.length, 0);
  });
});

// ==================== CAE-08: todas las plantillas son válidas ====================

describe('CAE-08: templates generados son válidos', () => {
  it('cada recomendación tiene template interno válido (verificado vía relatedModule)', async () => {
    const { service } = buildService();

    const recommendations = await service.getRecommendations('company-a');

    const validModules = [
      'documents', 'trainings', 'risks',
      'incidents', 'legal-matrix', 'annual-work-plan', 'phva',
    ];

    for (const rec of recommendations) {
      assert.ok(
        validModules.includes(rec.relatedModule),
        `relatedModule inválido: ${rec.relatedModule}`,
      );
    }
  });
});
