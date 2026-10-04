import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ComplianceEngineService } from './compliance-engine.service.js';
import type { ComplianceProvider, ProviderComplianceResult } from './providers/compliance-provider.interface.js';
import type { ComplianceOverviewDto } from './dto/compliance-overview.dto.js';

/**
 * ETAPA 4.2.6 — Contrato de transporte de metadata V2 en el overview.
 *
 * Verifica que el flujo
 *
 *   EppComplianceProvider (resultado V2)
 *     ↓ ComplianceEngineService.getOverview()
 *     ↓ toModuleCompliance
 *     ↓ moduleCompliance[]
 *
 * expone `status/pending/completed/overdue/phases/metadata` SIN transformación
 * semántica (sin recalcular, sin renombrar, sin redondear), y que un provider
 * SIN esos campos continúa funcionando exactamente igual (compatibilidad).
 *
 * El servicio se prueba con providers stub inyectados en `this.providers`:
 * getOverview() no accede a BD por sí mismo — solo agrega resultados de
 * providers — por lo que el stub aísla el contrato del transporte.
 * El provider real de EPP no se instancia: su metadata ya está testeada en
 * epp-compliance.provider.spec.ts; aquí se prueba SOLO el transporte.
 */

function buildServiceWith(providers: ComplianceProvider[]): ComplianceEngineService {
  const service = new ComplianceEngineService(
    ...([] as unknown[]).concat(
      Array.from({ length: 70 }, () => ({} as never)),
    ) as ConstructorParameters<typeof ComplianceEngineService>,
  );
  (service as unknown as { providers: ComplianceProvider[] }).providers = providers;
  return service;
}

function resultWithMetadata(): ProviderComplianceResult {
  // Estructura equivalente a la que produce EppComplianceProvider (V2),
  // con la metadata EXACTA que genera epp-scoring.ts.
  return {
    module: 'epp-compliance',
    percentage: 72,
    status: 'TARGET_MET',
    findings: [
      {
        id: 'epp-low-coverage',
        module: 'epp-compliance',
        title: 'Cobertura de requisitos EPP por debajo de la meta',
        description: '6 de 32 requisitos EPP aplicables sin cobertura',
        priority: 'MEDIUM' as ProviderComplianceResult['findings'][number]['priority'],
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: '2026-09-21T00:00:00.000Z',
      },
    ],
    pending: 9,
    completed: 24,
    overdue: 3,
    phases: { do: 72 },
    metadata: {
      semantic: 'EXACT',
      standardCode: '4.2.6',
      phase: 'do',
      formula: 'dimensions:v2',
      weights: { program: 25, coverage: 30, validityCondition: 25, traceability: 20 },
      dimensions: {
        program: { ratio: 1, numerator: 3, denominator: 3 },
        coverage: {
          ratio: 0.75,
          numerator: 24,
          denominator: 32,
          coveredRequirements: 24,
          applicableRequirements: 32,
          fullyCoveredWorkers: 8,
          workersWithRequirements: 10,
          workersWithoutJobProfile: 1,
        },
        validityCondition: { ratio: 0.9, numerator: 18, denominator: 20 },
        traceability: { ratio: 0.8, numerator: 16, denominator: 20 },
      },
      counters: {
        overdue: 3,
        missingEvidence: 4,
        inactiveItemReferences: 0,
        jobProfilesWithoutMatrix: 0,
        deliveriesOutsideApplicability: 2,
      },
    },
  };
}

function resultWithoutMetadata(module: string): ProviderComplianceResult {
  return {
    module,
    percentage: 50,
    status: 'OK',
    findings: [],
    pending: 0,
    completed: 0,
  };
}

describe('OVERVIEW-CONTRACT: transporte de resultados V2 (4.2.6) en moduleCompliance', () => {
  it('EPP → status/pending/completed/overdue/phases/metadata llegan sin transformación', async () => {
    const service = buildServiceWith([{
      getCompliance: async () => resultWithMetadata(),
    }]);
    const overview: ComplianceOverviewDto = await service.getOverview('company-a');

    const epp = overview.moduleCompliance.find((m) => m.module === 'epp-compliance');
    assert.ok(epp, 'epp-compliance debe aparecer en moduleCompliance');

    // Campos base intactos
    assert.equal(epp.compliance, 72);
    assert.equal(epp.level, 'MEDIUM'); // classifyComplianceLevel(72) — sin cambios
    assert.equal(typeof epp.lastUpdated, 'string');

    // Campos nuevos transportados SIN transformación
    assert.equal(epp.status, 'TARGET_MET');
    assert.equal(epp.pending, 9);
    assert.equal(epp.completed, 24);
    assert.equal(epp.overdue, 3);
    assert.deepEqual(epp.phases, { do: 72 });

    // Metadata V2 EXACTA (sin recalcular ni redondear)
    assert.equal(epp.metadata?.formula, 'dimensions:v2');
    assert.deepEqual(epp.metadata?.weights, {
      program: 25, coverage: 30, validityCondition: 25, traceability: 20,
    });
    const coverage = (epp.metadata?.dimensions as Record<string, Record<string, unknown>>)?.coverage;
    assert.equal(coverage?.ratio, 0.75);
    assert.equal(coverage?.numerator, 24);
    assert.equal(coverage?.denominator, 32);
    assert.equal(coverage?.fullyCoveredWorkers, 8);
    assert.equal(coverage?.workersWithRequirements, 10);
  });

  it('los hallazgos epp-* del provider llegan en overview.findings', async () => {
    const service = buildServiceWith([{
      getCompliance: async () => resultWithMetadata(),
    }]);
    const overview = await service.getOverview('company-a');
    assert.ok(overview.findings.some((f) => f.id === 'epp-low-coverage'));
  });

  it('la metadata es JSON-serializable (sin ObjectId/funciones/ciclos)', async () => {
    const service = buildServiceWith([{
      getCompliance: async () => resultWithMetadata(),
    }]);
    const overview = await service.getOverview('company-a');
    const epp = overview.moduleCompliance.find((m) => m.module === 'epp-compliance');
    const serialized = JSON.parse(JSON.stringify(epp)) as typeof epp;
    assert.deepEqual(serialized, epp, 'round-trip JSON debe ser idéntico');
  });
});

describe('OVERVIEW-CONTRACT: compatibilidad con providers sin metadata', () => {
  it('provider legacy: los campos opcionales quedan undefined y no rompe nada', async () => {
    const service = buildServiceWith([
      { getCompliance: async () => resultWithoutMetadata('risks') },
      { getCompliance: async () => resultWithoutMetadata('trainings') },
    ]);
    const overview = await service.getOverview('company-a');

    const risks = overview.moduleCompliance.find((m) => m.module === 'risks');
    assert.ok(risks);
    assert.equal(risks.compliance, 50);
    // `status` es obligatorio en ProviderComplianceResult → ahora se transporta
    // (antes se perdía). Igual que pending/completed (obligatorios, 0 aquí).
    // Comportamiento aditivo esperado del nuevo contrato.
    assert.equal(risks.status, 'OK');
    assert.equal(risks.pending, 0);
    assert.equal(risks.completed, 0);
    // Campos verdaderamente opcionales: el provider legacy no los produce
    assert.equal(risks.overdue, undefined);
    assert.equal(risks.phases, undefined);
    assert.equal(risks.metadata, undefined);

    // La serialización JSON omite los undefined (sin claves artificiales)
    const raw = JSON.parse(JSON.stringify(risks)) as Record<string, unknown>;
    assert.ok(!('metadata' in raw));
    assert.ok(!('phases' in raw));
  });

  it('mezcla provider con metadata + provider sin metadata en el mismo overview', async () => {
    const service = buildServiceWith([
      { getCompliance: async () => resultWithMetadata() },
      { getCompliance: async () => resultWithoutMetadata('inspections') },
    ]);
    const overview = await service.getOverview('company-a');

    const epp = overview.moduleCompliance.find((m) => m.module === 'epp-compliance');
    const inspections = overview.moduleCompliance.find((m) => m.module === 'inspections');
    assert.equal(epp?.metadata?.formula, 'dimensions:v2');
    assert.equal(inspections?.metadata, undefined);
    // El scoring agregado no cambia por la extensión
    assert.equal(typeof overview.overallCompliance, 'number');
  });

  it('tenant isolation: getOverview solo consulta providers con el companyId recibido', async () => {
    const requested: string[] = [];
    const service = buildServiceWith([{
      getCompliance: async (companyId: string) => {
        requested.push(companyId);
        return resultWithoutMetadata('risks');
      },
    }]);
    await service.getOverview('company-a');
    assert.deepEqual(requested, ['company-a']);
  });
});
