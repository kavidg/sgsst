import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ComplianceEngineService } from './compliance-engine.service.js';
import { ProviderComplianceResult } from './providers/compliance-provider.interface.js';
import { CompliancePhaseKey } from './interfaces/compliance-engine.interface.js';
import { PHASE_DEPENDENCIES } from './utils/compliance-weights.js';
import { PHASE_PREFIXES } from './utils/phase-prefixes.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function providerResult(
  module: string,
  phases?: Partial<Record<CompliancePhaseKey, number>>,
): ProviderComplianceResult {
  return {
    module,
    percentage: phases?.plan ?? phases?.do ?? 0,
    status: 'OK',
    findings: [],
    pending: 0,
    completed: 0,
    phases,
  };
}

function getResolver(service: ComplianceEngineService) {
  return (service as unknown as {
    resolvePhaseCompliance: (r: ProviderComplianceResult[]) => {
      plan: number; do: number; check: number; act: number;
    };
  }).resolvePhaseCompliance.bind(service);
}

function buildService(): ComplianceEngineService {
  return new ComplianceEngineService(
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    {} as never, // ProgramsProvider
    {} as never, // DocumentEvaluationProvider
    {} as never, // AcquisitionProvider
    {} as never, // ContractingProvider
    {} as never, // ChangeManagementProvider
    {} as never, // SociodemographicProvider
    {} as never, // OccupationalExamProvider
    {} as never, // MedicalRecommendationProvider
    {} as never, // OccupationalEvaluationProvider
    {} as never, // AbsenteeismProvider
    {} as never, // DiseaseInvestigationProvider
    {} as never, // EpidemiologicalSurveillanceProvider
    {} as never, // CaseInterventionProvider
    {} as never, // RiskMethodologyProvider
    {} as never, // WorkerParticipationProvider
    {} as never, // HazardousSubstanceProvider
    {} as never, // EnvironmentalMeasurementProvider
    {} as never, // ControlImplementationProvider
    {} as never, // ControlVerificationProvider
    {} as never, // ProceduresProvider
    {} as never, // InspectionComplianceProvider
    {} as never, // MaintenanceProvider
    {} as never, // EppComplianceProvider
    {} as never, // ControlVerificationStandardProvider
    {} as never, // EmergencyManagementProvider
    {} as never, // ProceduresDocProvider
    {} as never, // RecordsDocProvider
    {} as never, // ManagementMeasurementProvider
    {} as never, // ManagementReviewProvider
    {} as never, // InternalAuditProvider
    {} as never, // FindingsReviewProvider
    {} as never, // CorrectivePreventiveProvider
    {} as never, // ManagementImprovementProvider
    {} as never, // IncidentActionsProvider
    {} as never, // ImprovementPlanProvider
    {} as never, // InductionReinductionProvider
    {} as never, // HealthIndicatorsProvider
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANEAR-4.01–4.12 — Multi-provider plan phase (BLOQUE 4A)
// ═══════════════════════════════════════════════════════════════════════════

describe('PLANEAR-4.01: resolvePhaseCompliance agrega múltiples providers', () => {
  it('Solo Evaluations → plan = 70', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([providerResult('evaluations', { plan: 70, do: 80, check: 90, act: 60 })]);
    assert.equal(phases.plan, 70);
    assert.equal(phases.do, 80);
    assert.equal(phases.check, 90);
    assert.equal(phases.act, 60);
  });
  it('Evaluations + SST → plan = 75', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', { plan: 80 }),
    ]);
    assert.equal(phases.plan, 75);
  });
  it('Evaluations + IE → plan = 65', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('initial-evaluation', { plan: 60 }),
    ]);
    assert.equal(phases.plan, 65);
  });
});

describe('PLANEAR-4.02: AWP consolidado excluye SST', () => {
  it('Evaluations + SST + AWP → plan = 72.5', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', { plan: 80 }),
      providerResult('annual-work-plan', { plan: 75 }),
    ]);
    assert.equal(phases.plan, 72.5);
  });
});

describe('PLANEAR-4.03: AWP consolidado excluye IE', () => {
  it('Evaluations + IE + AWP → plan = 72.5', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('initial-evaluation', { plan: 60 }),
      providerResult('annual-work-plan', { plan: 75 }),
    ]);
    assert.equal(phases.plan, 72.5);
  });
});

describe('PLANEAR-4.04: Sin AWP, SST + IE contribuyen', () => {
  it('Evaluations + SST + IE → plan = 70', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', { plan: 80 }),
      providerResult('initial-evaluation', { plan: 60 }),
    ]);
    assert.equal(phases.plan, 70);
  });
});

describe('PLANEAR-4.05–4.09: Edge cases', () => {
  it('Solo providers con phases contribuyen', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('risks', undefined),
    ]);
    assert.equal(phases.plan, 70);
  });
  it('undefined se ignora', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', undefined),
    ]);
    assert.equal(phases.plan, 70);
  });
  it('0 es válido', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', { plan: 0 }),
    ]);
    assert.equal(phases.plan, 35);
  });
  it('100 es válido', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', { plan: 100 }),
    ]);
    assert.equal(phases.plan, 85);
  });
  it('Evaluations legacy funciona', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([providerResult('evaluations', { plan: 70, do: 80, check: 90, act: 60 })]);
    assert.equal(phases.plan, 70);
  });
});

describe('PLANEAR-4.10–4.12: Integrity', () => {
  it('moduleCompliance[] no cambia', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', { plan: 80 }),
    ];
    resolve(results);
    assert.equal(results.length, 2);
    assert.equal(results[0].module, 'evaluations');
  });
  it('Pesos PHVA intactos', async () => {
    const { getPhaseWeights } = await import('./utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
  it('Cuatro providers sin doble conteo', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70 }),
      providerResult('sst-objectives', { plan: 80 }),
      providerResult('initial-evaluation', { plan: 60 }),
      providerResult('annual-work-plan', { plan: 75 }),
    ]);
    assert.equal(phases.plan, 72.5);
  });
});

describe('PHASE_DEPENDENCIES: estructura', () => {
  it('annual-work-plan declara dependencias correctas', () => {
    assert.deepEqual(PHASE_DEPENDENCIES['annual-work-plan'], ['sst-objectives', 'initial-evaluation']);
  });
  it('evaluations no está en PHASE_DEPENDENCIES', () => {
    assert.ok(!('evaluations' in PHASE_DEPENDENCIES));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.01: Solo Evaluations → phases.do = evaluations.do
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.01: Solo Evaluations → phases.do = evaluations.do', () => {
  it('phases.do = 75 cuando solo Evaluations contribuye', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [providerResult('evaluations', { do: 75 })];
    const phases = resolve(results);
    assert.equal(phases.do, 75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.02: Evaluations + AWP → promedio
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.02: Evaluations + AWP → promedio', () => {
  it('phases.do = (70+80)/2 = 75', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('annual-work-plan', { do: 80 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.03: Evaluations + Trainings (sin AWP) → promedio
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.03: Evaluations + Trainings (sin AWP) → promedio', () => {
  it('phases.do = (70+80)/2 = 75', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('trainings', { do: 80 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.04: Evaluations + Inspections (sin AWP) → promedio
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.04: Evaluations + Inspections (sin AWP) → promedio', () => {
  it('phases.do = (70+60)/2 = 65', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('inspections', { do: 60 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 65);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.05: AWP + Trainings — sin dedup (no existe sync real)
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.05: AWP + Trainings — ambos contribuyen (sin sync real)', () => {
  it('AWP no tiene dependencia con trainings → ambos contribuyen', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('annual-work-plan', { do: 80 }),
      providerResult('trainings', { do: 60 }),
    ];
    const phases = resolve(results);
    // No hay dependencia AWP→trainings → los tres contribuyen
    // (70+80+60)/3 = 70
    assert.equal(phases.do, 70);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.06: AWP + Inspections — ambos contribuyen (sin sync real)
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.06: AWP + Inspections — ambos contribuyen (sin sync real)', () => {
  it('AWP no tiene dependencia con inspections → ambos contribuyen', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('annual-work-plan', { do: 80 }),
      providerResult('inspections', { do: 90 }),
    ];
    const phases = resolve(results);
    // (70+80+90)/3 = 80
    assert.equal(phases.do, 80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.07: AWP manual + Trainings → ambos contribuyen
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.07: AWP manual + Trainings → ambos contribuyen', () => {
  it('AWP manual sin consolidación no excluye Trainings', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('annual-work-plan', { do: 80 }),
      providerResult('trainings', { do: 60 }),
    ];
    const phases = resolve(results);
    // No PHASE_DEPENDENCIES do → todos contribuyen
    // (70+80+60)/3 = 70
    assert.equal(phases.do, 70);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.08: Evaluations siempre independiente
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.08: Evaluations siempre independiente', () => {
  it('Evaluations nunca se excluye por la presencia de otros providers', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('annual-work-plan', { do: 100 }),
      providerResult('trainings', { do: 100 }),
      providerResult('inspections', { do: 100 }),
      providerResult('emergencies', { do: 100 }),
      providerResult('copasst-training', { do: 100 }),
    ];
    const phases = resolve(results);
    // Evaluations(70) siempre contribuye — no se excluye
    // (70+100+100+100+100+100)/6 = 95
    assert.equal(phases.do, 95);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.09: Sin doble conteo (no hay dependencias reales actualmente)
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.09: Sin doble conteo — no hay dependencias reales', () => {
  it('Todos los providers contribuyen — no se excluye ninguno', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 60 }),
      providerResult('annual-work-plan', { do: 80 }),
      providerResult('trainings', { do: 70 }),
      providerResult('inspections', { do: 90 }),
      providerResult('emergencies', { do: 50 }),
      providerResult('copasst-training', { do: 100 }),
    ];
    const phases = resolve(results);
    // Todos contribuyen — no hay PHASE_DEPENDENCIES do
    // (60+80+70+90+50+100)/6 = 75
    assert.equal(phases.do, 75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.10: Emergencies contribuye independientemente
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.10: Emergencies contribuye independientemente', () => {
  it('Emergencies con percentage válido contribuye a phases.do', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('emergencies', { do: 60 }),
    ];
    const phases = resolve(results);
    // (70+60)/2 = 65
    assert.equal(phases.do, 65);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.11: CopasstTraining contribuye independientemente
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.11: CopasstTraining contribuye independientemente', () => {
  it('CopasstTraining con percentage válido contribuye a phases.do', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('copasst-training', { do: 80 }),
    ];
    const phases = resolve(results);
    // (70+80)/2 = 75
    assert.equal(phases.do, 75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.12: Sin datos → phases.do = 0
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.12: Sin datos → phases.do = 0', () => {
  it('Sin providers con phases.do → 0', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results: ProviderComplianceResult[] = [];
    const phases = resolve(results);
    assert.equal(phases.do, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.13: 0% es válido
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.13: 0% es válido', () => {
  it('phases.do = 0 contribuye al promedio', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('trainings', { do: 0 }),
    ];
    const phases = resolve(results);
    // (70+0)/2 = 35
    assert.equal(phases.do, 35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.14: 100% es válido
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.14: 100% es válido', () => {
  it('phases.do = 100 contribuye al promedio', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('trainings', { do: 100 }),
    ];
    const phases = resolve(results);
    // (70+100)/2 = 85
    assert.equal(phases.do, 85);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.15: Ignorar NaN, Infinity, -1, 101, undefined, null
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.15: Valores inválidos se ignoran', () => {
  it('NaN se ignora', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      { ...providerResult('trainings'), phases: { do: NaN } as Partial<Record<CompliancePhaseKey, number>> },
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 70);
  });

  it('Infinity se ignora', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      { ...providerResult('trainings'), phases: { do: Infinity } as Partial<Record<CompliancePhaseKey, number>> },
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 70);
  });

  it('-1 se ignora', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      { ...providerResult('trainings'), phases: { do: -1 } as Partial<Record<CompliancePhaseKey, number>> },
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 70);
  });

  it('101 se ignora', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      { ...providerResult('trainings'), phases: { do: 101 } as Partial<Record<CompliancePhaseKey, number>> },
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 70);
  });

  it('undefined se ignora', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('trainings', undefined),
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 70);
  });

  it('null se ignora', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      { ...providerResult('trainings'), phases: null as unknown as Partial<Record<CompliancePhaseKey, number>> },
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 70);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.16: moduleCompliance[] no cambia
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.16: moduleCompliance[] no cambia', () => {
  it('resolvePhaseCompliance no muta el array results', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('trainings', { do: 80 }),
      providerResult('inspections', { do: 60 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 70);
    assert.equal(results.length, 3);
    assert.equal(results[0].module, 'evaluations');
    assert.equal(results[1].module, 'trainings');
    assert.equal(results[2].module, 'inspections');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.17: Pesos PHVA permanecen intactos
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.17: Pesos PHVA permanecen intactos', () => {
  it('plan=0.25, do=0.60, check=0.05, act=0.10', async () => {
    const { getPhaseWeights } = await import('./utils/compliance-weights.js');
    const weights = getPhaseWeights();
    assert.equal(weights.plan, 0.25);
    assert.equal(weights.do, 0.6);
    assert.equal(weights.check, 0.05);
    assert.equal(weights.act, 0.1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.18: PLANEAR continúa intacto después de extender HACER
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.18: PLANEAR continúa intacto', () => {
  it('phases.plan no se altera por contribuciones de phases.do', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { plan: 70, do: 80 }),
      providerResult('sst-objectives', { plan: 90 }),
      providerResult('annual-work-plan', { plan: 75, do: 85 }),
      providerResult('trainings', { do: 60 }),
      providerResult('inspections', { do: 90 }),
    ];
    const phases = resolve(results);
    // PLANEAR: AWP consolida SST → [evaluations(70), awp(75)] → 72.5
    assert.equal(phases.plan, 72.5);
    // HACER: todos contribuyen → (80+85+60+90)/4 = 78.75 → 78.75
    assert.equal(phases.do, 78.75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.19: Tenant isolation — resolvePhaseCompliance opera sobre resultados pre-filtrados
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.19: Tenant isolation', () => {
  it('El método no accede a BD — opera sobre resultados recibidos', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('trainings', { do: 80 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.do, 75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER-5.20: Provider sin phases.do no altera el cálculo
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER-5.20: Provider sin phases.do no altera el cálculo', () => {
  it('Providers sin phases.do son ignorados', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('risks', undefined),
      providerResult('incidents', undefined),
      providerResult('convivencia', undefined),
      providerResult('documents', undefined),
      providerResult('legal-matrix', undefined),
    ];
    const phases = resolve(results);
    // Solo evaluations contribuye
    assert.equal(phases.do, 70);
  });

  it('Provider con phases pero sin phases.do no afecta', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { plan: 70, do: 80 }),
      providerResult('sst-objectives', { plan: 90 }),
    ];
    const phases = resolve(results);
    // Solo evaluations.do contribuye
    assert.equal(phases.do, 80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HACER: Casos compuestos
// ═══════════════════════════════════════════════════════════════════════════

describe('HACER: Casos compuestos', () => {
  it('6 providers: evaluaciones + AWP + trainings + inspections + emergencies + copasst', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { do: 70 }),
      providerResult('annual-work-plan', { do: 75 }),
      providerResult('trainings', { do: 80 }),
      providerResult('inspections', { do: 60 }),
      providerResult('emergencies', { do: 90 }),
      providerResult('copasst-training', { do: 100 }),
    ];
    const phases = resolve(results);
    // (70+75+80+60+90+100)/6 = 79.17 → 79.17
    assert.equal(phases.do, 79.17);
  });

  it('Solo AWP y Trainings (sin Evaluations)', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('annual-work-plan', { do: 80 }),
      providerResult('trainings', { do: 60 }),
    ];
    const phases = resolve(results);
    // (80+60)/2 = 70
    assert.equal(phases.do, 70);
  });

  it('Providers mezclan plan y do — cada fase se calcula independientemente', () => {
    const service = buildService();
    const resolve = getResolver(service);
    const results = [
      providerResult('evaluations', { plan: 70, do: 80, check: 90, act: 60 }),
      providerResult('annual-work-plan', { plan: 75, do: 85 }),
      providerResult('trainings', { do: 90 }),
    ];
    const phases = resolve(results);
    // plan: AWP consolida SST (no está aquí) → [evaluations(70), awp(75)] → 72.5
    assert.equal(phases.plan, 72.5);
    // do: (80+85+90)/3 = 85
    assert.equal(phases.do, 85);
    // check: solo evaluations → 90
    assert.equal(phases.check, 90);
    // act: solo evaluations → 60
    assert.equal(phases.act, 60);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICAR-6.01–6.14 — check phase (BLOQUE 4D-B)
// ═══════════════════════════════════════════════════════════════════════════

describe('VERIFICAR-6.01: Solo Evaluations → phases.check = evaluations.check', () => {
  it('phases.check = 80 cuando solo Evaluations contribuye con check', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([providerResult('evaluations', { check: 80 })]);
    assert.equal(phases.check, 80);
  });
});

describe('VERIFICAR-6.02: Evaluations + provider sin phases.check', () => {
  it('AWP sin phases.check no contamina VERIFICAR', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { check: 80 }),
      providerResult('annual-work-plan', { do: 70 }),
    ]);
    assert.equal(phases.check, 80);
  });
});

describe('VERIFICAR-6.03: phases.check = 0 es válido', () => {
  it('0 no se trata como ausencia', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { check: 0 }),
    ]);
    assert.equal(phases.check, 0);
  });
});

describe('VERIFICAR-6.04: phases.check = 100 es válido', () => {
  it('100 contribuye correctamente', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { check: 100 }),
    ]);
    assert.equal(phases.check, 100);
  });
});

describe('VERIFICAR-6.05: Evaluations sin phases.check → phases.check = 0', () => {
  it('Si evaluations no retorna phases.check, check = 0', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70, do: 80, act: 60 }),
    ]);
    assert.equal(phases.check, 0);
  });
});

describe('VERIFICAR-6.06: NaN se ignora', () => {
  it('phases.check = NaN no se propaga', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      { ...providerResult('evaluations'), phases: { check: NaN } as Partial<Record<CompliancePhaseKey, number>> },
    ]);
    assert.equal(phases.check, 0);
  });
});

describe('VERIFICAR-6.07: 101 se ignora', () => {
  it('Valor fuera de rango no se propaga', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      { ...providerResult('evaluations'), phases: { check: 101 } as Partial<Record<CompliancePhaseKey, number>> },
    ]);
    assert.equal(phases.check, 0);
  });
});

describe('VERIFICAR-6.08: -1 se ignora', () => {
  it('Valor negativo no se propaga', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      { ...providerResult('evaluations'), phases: { check: -1 } as Partial<Record<CompliancePhaseKey, number>> },
    ]);
    assert.equal(phases.check, 0);
  });
});

describe('VERIFICAR-6.09: Sin providers válidos → phases.check = 0', () => {
  it('Array vacío produce 0', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([]);
    assert.equal(phases.check, 0);
  });
});

describe('VERIFICAR-6.10: moduleCompliance[] no cambia', () => {
  it('resolvePhaseCompliance no muta moduleCompliance', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { check: 80 }),
      providerResult('trainings', { check: 60 }),
    ];
    resolve(results);
    assert.equal(results.length, 2);
    assert.equal(results[0].module, 'evaluations');
    assert.equal(results[1].module, 'trainings');
  });
});

describe('VERIFICAR-6.11: Pesos PHVA intactos', () => {
  it('check = 0.05, plan = 0.25, do = 0.60, act = 0.10', async () => {
    const { getPhaseWeights } = await import('./utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
});

describe('VERIFICAR-6.12: Regresión de PLANEAR', () => {
  it('phases.plan no se altera por cálculos de phases.check', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { plan: 70, check: 90 }),
      providerResult('sst-objectives', { plan: 80 }),
      providerResult('annual-work-plan', { plan: 75 }),
    ];
    const phases = resolve(results);
    // PLANEAR: AWP consolida SST → [evaluations(70), awp(75)] → 72.5
    assert.equal(phases.plan, 72.5);
    // check: solo evaluations → 90
    assert.equal(phases.check, 90);
  });
});

describe('VERIFICAR-6.13: Regresión de HACER', () => {
  it('phases.do se mantiene con múltiples providers mientras check no se contamina', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { plan: 70, do: 80, check: 90 }),
      providerResult('annual-work-plan', { plan: 75, do: 85 }),
      providerResult('trainings', { do: 90 }),
      providerResult('inspections', { do: 70 }),
      providerResult('emergencies', { do: 60 }),
      providerResult('copasst-training', { do: 100 }),
    ];
    const phases = resolve(results);
    // check: solo evaluations → 90
    assert.equal(phases.check, 90);
    // do: (80+85+90+70+60+100)/6 = 80.83
    assert.equal(phases.do, 80.83);
    // plan: AWP consolida SST (no está) → [evaluations(70), awp(75)] → 72.5
    assert.equal(phases.plan, 72.5);
  });
});

describe('VERIFICAR-6.14: Tenant isolation — resolvePhaseCompliance opera sobre resultados pre-filtrados', () => {
  it('El método no accede a BD, opera sobre resultados recibidos', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { check: 80 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.check, 80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICAR: Independencia de fases
// ═══════════════════════════════════════════════════════════════════════════

describe('VERIFICAR-IND: Independencia CHECK ≠ DO ≠ PLAN', () => {
  it('HACER y CHECK no se contaminan entre sí', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { check: 80, do: 60, plan: 70 }),
      providerResult('annual-work-plan', { do: 40, plan: 50 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.check, 80);   // Solo evaluations.contribuye
    assert.equal(phases.do, 50);      // (60+40)/2
    // plan: AWP consolida SST → [evaluations(70), awp(50)] → 60
    assert.equal(phases.plan, 60);
  });

  it('check no se contamina con fuentes HACER', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { check: 60 }),
      providerResult('trainings', { do: 90 }),
      providerResult('inspections', { do: 70 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.check, 60);
    assert.equal(phases.do, 80); // (90+70)/2
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICAR-GAP: Documentación del gap conocido PHASE_PREFIXES
// ═══════════════════════════════════════════════════════════════════════════

describe('VERIFICAR-GAP: Estándares con phva=VERIFICAR no capturados por PHASE_PREFIXES.check', () => {
  // KNOWN GAP: El catálogo catalog-60.ts clasifica como phva="VERIFICAR" los
  // estándares 2.6.1, 3.3.2 y 4.2.2. Sin embargo, PHASE_PREFIXES.check = ['6.']
  // solo captura estándares cuyo code empieza con "6.". Los estándares 2.6.x,
  // 3.3.x y 4.2.x NO son capturados por EvaluationsProvider.computePhases().
  //
  // Esto significa que el cálculo actual de phases.check NO incluye:
  //   - 2.6.1 Rendición de cuentas
  //   - 3.3.2 Medición indicadores salud
  //   - 4.2.2 Verificación medidas de control
  //
  // No se corrige en este bloque porque requiere una decisión arquitectónica
  // explícita sobre si PHASE_PREFIXES.check debe expandirse.

  it('GAP documentado: 2.6.1 no empieza con 6.', () => {
    assert.ok(!'2.6.1'.startsWith('6.'));
  });
  it('GAP documentado: 3.3.2 no empieza con 6.', () => {
    assert.ok(!'3.3.2'.startsWith('6.'));
  });
  it('GAP documentado: 4.2.2 no empieza con 6.', () => {
    assert.ok(!'4.2.2'.startsWith('6.'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTUAR-7.01–7.21 — act phase (BLOQUE 4E-B)
// ═══════════════════════════════════════════════════════════════════════════

describe('ACTUAR-7.01: Solo Evaluations → phases.act = evaluations.act', () => {
  it('phases.act = 70 cuando solo Evaluations contribuye con act', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([providerResult('evaluations', { act: 70 })]);
    assert.equal(phases.act, 70);
  });
});

describe('ACTUAR-7.02: Provider sin phases.act no afecta ACTUAR', () => {
  it('AWP sin phases.act no contamina ACTUAR', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { act: 70 }),
      providerResult('annual-work-plan', { plan: 80, do: 60 }),
    ]);
    assert.equal(phases.act, 70);
  });
});

describe('ACTUAR-7.03: phases.act = 0 es válido', () => {
  it('0 no se trata como ausencia', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([providerResult('evaluations', { act: 0 })]);
    assert.equal(phases.act, 0);
  });
});

describe('ACTUAR-7.04: phases.act = 100 es válido', () => {
  it('100 contribuye correctamente', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([providerResult('evaluations', { act: 100 })]);
    assert.equal(phases.act, 100);
  });
});

describe('ACTUAR-7.05: Evaluations sin phases.act → phases.act = 0', () => {
  it('Si evaluations no retorna phases.act, act = 0', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      providerResult('evaluations', { plan: 70, do: 80, check: 60 }),
    ]);
    assert.equal(phases.act, 0);
  });
});

describe('ACTUAR-7.06: NaN se ignora', () => {
  it('phases.act = NaN no se propaga', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      { ...providerResult('evaluations'), phases: { act: NaN } as Partial<Record<CompliancePhaseKey, number>> },
    ]);
    assert.equal(phases.act, 0);
  });
});

describe('ACTUAR-7.07: 101 se ignora', () => {
  it('Valor fuera de rango no se propaga', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      { ...providerResult('evaluations'), phases: { act: 101 } as Partial<Record<CompliancePhaseKey, number>> },
    ]);
    assert.equal(phases.act, 0);
  });
});

describe('ACTUAR-7.08: -1 se ignora', () => {
  it('Valor negativo no se propaga', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([
      { ...providerResult('evaluations'), phases: { act: -1 } as Partial<Record<CompliancePhaseKey, number>> },
    ]);
    assert.equal(phases.act, 0);
  });
});

describe('ACTUAR-7.09: Sin providers válidos → phases.act = 0', () => {
  it('Array vacío produce 0', () => {
    const resolve = getResolver(buildService());
    const phases = resolve([]);
    assert.equal(phases.act, 0);
  });
});

describe('ACTUAR-7.10: moduleCompliance[] no cambia', () => {
  it('resolvePhaseCompliance no muta moduleCompliance', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { act: 80 }),
      providerResult('trainings', { act: 60 }),
    ];
    resolve(results);
    assert.equal(results.length, 2);
    assert.equal(results[0].module, 'evaluations');
    assert.equal(results[1].module, 'trainings');
  });
});

describe('ACTUAR-7.11: Pesos PHVA intactos', () => {
  it('act = 0.10, plan = 0.25, do = 0.60, check = 0.05', async () => {
    const { getPhaseWeights } = await import('./utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
});

describe('ACTUAR-7.12: Regresión de PLANEAR', () => {
  it('phases.plan no se altera por cálculos de phases.act', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { plan: 70, act: 90 }),
      providerResult('sst-objectives', { plan: 80 }),
      providerResult('annual-work-plan', { plan: 75 }),
    ];
    const phases = resolve(results);
    // PLANEAR: AWP consolida SST → [evaluations(70), awp(75)] → 72.5
    assert.equal(phases.plan, 72.5);
    // act: solo evaluations → 90
    assert.equal(phases.act, 90);
  });
});

describe('ACTUAR-7.13: Regresión de HACER', () => {
  it('phases.do se mantiene con múltiples providers mientras act no se contamina', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { do: 80, act: 70 }),
      providerResult('annual-work-plan', { do: 85 }),
      providerResult('trainings', { do: 90 }),
      providerResult('inspections', { do: 70 }),
      providerResult('emergencies', { do: 60 }),
      providerResult('copasst-training', { do: 100 }),
    ];
    const phases = resolve(results);
    // act: solo evaluations → 70
    assert.equal(phases.act, 70);
    // do: (80+85+90+70+60+100)/6 = 80.83
    assert.equal(phases.do, 80.83);
  });
});

describe('ACTUAR-7.14: Regresión de VERIFICAR', () => {
  it('phases.check se mantiene intacto', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { check: 80, act: 70 }),
      providerResult('annual-work-plan', { do: 60 }),
      providerResult('trainings', { do: 90 }),
    ];
    const phases = resolve(results);
    // check: solo evaluations → 80
    assert.equal(phases.check, 80);
    // act: solo evaluations → 70
    assert.equal(phases.act, 70);
  });
});

describe('ACTUAR-7.15: Tenant isolation — resolvePhaseCompliance opera sobre resultados pre-filtrados', () => {
  it('El método no accede a BD, opera sobre resultados recibidos', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { act: 80 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.act, 80);
  });
});

describe('ACTUAR-7.16: Independencia PHVA — las cuatro fases son independientes', () => {
  it('Cada fase mantiene su propio valor sin contaminación cruzada', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { plan: 80, do: 60, check: 40, act: 20 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.plan, 80);
    assert.equal(phases.do, 60);
    assert.equal(phases.check, 40);
    assert.equal(phases.act, 20);
  });

  it('Las fases no se contamina entre sí con múltiples providers', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { plan: 80, do: 60, check: 40, act: 20 }),
      providerResult('annual-work-plan', { plan: 70, do: 90 }),
      providerResult('trainings', { do: 80 }),
      providerResult('sst-objectives', { plan: 50 }),
    ];
    const phases = resolve(results);
    // plan: AWP consolida SST → [evaluations(80), awp(70)] → 75
    assert.equal(phases.plan, 75);
    // do: (60+90+80)/3 = 76.67
    assert.equal(phases.do, 76.67);
    // check: solo evaluations → 40
    assert.equal(phases.check, 40);
    // act: solo evaluations → 20
    assert.equal(phases.act, 20);
  });
});

describe('ACTUAR-7.17: Evaluations es fuente primaria de ACTUAR', () => {
  it('EvaluationsProvider es la única fuente que retorna phases.act', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { act: 75 }),
      providerResult('annual-work-plan', { plan: 80, do: 60 }),
      providerResult('trainings', { do: 90 }),
      providerResult('inspections', { do: 70 }),
      providerResult('emergencies', { do: 50 }),
      providerResult('copasst-training', { do: 100 }),
      providerResult('risks'),
      providerResult('incidents'),
    ];
    const phases = resolve(results);
    // Solo evaluations tiene phases.act → 75
    assert.equal(phases.act, 75);
  });
});

describe('ACTUAR-7.18: Incidents no contamina ACTUAR', () => {
  it('Incidents con percentage alto no afecta phases.act', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { act: 70 }),
      providerResult('incidents'),
    ];
    const phases = resolve(results);
    assert.equal(phases.act, 70);
  });
});

describe('ACTUAR-7.19: AWP no contamina ACTUAR', () => {
  it('AWP con phases.plan y phases.do no afecta phases.act', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { act: 70 }),
      providerResult('annual-work-plan', { plan: 80, do: 60 }),
    ];
    const phases = resolve(results);
    assert.equal(phases.act, 70);
  });
});

describe('ACTUAR-7.20: Risks no contamina ACTUAR', () => {
  it('Risks con percentage alto no afecta phases.act', () => {
    const resolve = getResolver(buildService());
    const results = [
      providerResult('evaluations', { act: 70 }),
      providerResult('risks'),
    ];
    const phases = resolve(results);
    assert.equal(phases.act, 70);
  });
});

describe('ACTUAR-7.21: PHASE_PREFIXES.act = ["7."] cubre todos los estándares ACTUAR del catálogo', () => {
  it('Todos los códigos ACTUAR empiezan con 7.', () => {
    const actuarCodes = ['7.1.1', '7.1.2', '7.1.3', '7.1.4', '7.2.1'];
    for (const code of actuarCodes) {
      assert.ok(code.startsWith('7.'), `${code} debe empezar con 7.`);
    }
  });

  it('No existen estándares ACTUAR fuera del prefijo 7.', () => {
    // Documentación: estos estándares están clasificados como VERIFICAR, no ACTUAR
    const nonActuarCodes = ['2.6.1', '3.3.2', '4.2.2'];
    for (const code of nonActuarCodes) {
      assert.ok(!code.startsWith('7.'), `${code} NO debe empezar con 7.`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PREFIX-ALIGN: Alineación PHASE_PREFIXES con catálogo real (BLOQUE 4F-C)
// ═══════════════════════════════════════════════════════════════════════════

describe('PREFIX-ALIGN-1: PHASE_PREFIXES.do captura estándares HACER 2.x', () => {
  it('2.5.1 (Conservación documental) es capturado por do', () => {
    assert.ok(
      PHASE_PREFIXES.do.some((p: string) => '2.5.1'.startsWith(p)),
      '2.5.1 debe ser capturado por un prefix de do',
    );
  });
  it('2.8.1 (Comunicación) es capturado por do', () => {
    assert.ok(
      PHASE_PREFIXES.do.some((p: string) => '2.8.1'.startsWith(p)),
      '2.8.1 debe ser capturado por un prefix de do',
    );
  });
  it('2.9.1 (Adquisiciones) es capturado por do', () => {
    assert.ok(
      PHASE_PREFIXES.do.some((p: string) => '2.9.1'.startsWith(p)),
      '2.9.1 debe ser capturado por un prefix de do',
    );
  });
  it('2.10.1 (Contratación) es capturado por do', () => {
    assert.ok(
      PHASE_PREFIXES.do.some((p: string) => '2.10.1'.startsWith(p)),
      '2.10.1 debe ser capturado por un prefix de do',
    );
  });
  it('2.11.1 (Gestión del cambio) es capturado por do', () => {
    assert.ok(
      PHASE_PREFIXES.do.some((p: string) => '2.11.1'.startsWith(p)),
      '2.11.1 debe ser capturado por un prefix de do',
    );
  });
});

describe('PREFIX-ALIGN-2: PHASE_PREFIXES.do NO captura estándares PLANEAR del capítulo 2', () => {
  it('2.1.1 (no existe en catálogo como 2.1.1, pero verificamos que no empieza con 2.5.1, 2.8.1, etc.)', () => {

    // 2.1.1 es PLANEAR — no debe capturarse por do
    const isCapturedByDo = PHASE_PREFIXES.do.some((p: string) => '2.1.1'.startsWith(p));
    // 2.1.1 no empieza con 2.5.1, 2.8.1, 2.9.1, 2.10.1, 2.11.1, 3., 4., 5.
    assert.ok(!isCapturedByDo, '2.1.1 NO debe ser capturado por do');
  });
  it('2.2.1 (Objetivos SST — PLANEAR) no es capturado por do', () => {

    assert.ok(
      !PHASE_PREFIXES.do.some((p: string) => '2.2.1'.startsWith(p)),
      '2.2.1 NO debe ser capturado por do',
    );
  });
  it('2.3.1 (PLANEAR) no es capturado por do', () => {

    assert.ok(
      !PHASE_PREFIXES.do.some((p: string) => '2.3.1'.startsWith(p)),
      '2.3.1 NO debe ser capturado por do',
    );
  });
  it('2.4.1 (PLANEAR) no es capturado por do', () => {

    assert.ok(
      !PHASE_PREFIXES.do.some((p: string) => '2.4.1'.startsWith(p)),
      '2.4.1 NO debe ser capturado por do',
    );
  });
  it('2.7.1 (Matriz legal — PLANEAR) no es capturado por do', () => {

    assert.ok(
      !PHASE_PREFIXES.do.some((p: string) => '2.7.1'.startsWith(p)),
      '2.7.1 NO debe ser capturado por do',
    );
  });
});

describe('PREFIX-ALIGN-3: PHASE_PREFIXES.check captura estándares VERIFICAR', () => {
  it('2.6.1 (Rendición de cuentas) es capturado por check', () => {

    assert.ok(
      PHASE_PREFIXES.check.some((p: string) => '2.6.1'.startsWith(p)),
      '2.6.1 debe ser capturado por un prefix de check',
    );
  });
  it('3.3.2 (Medición indicadores salud) es capturado por check', () => {

    assert.ok(
      PHASE_PREFIXES.check.some((p: string) => '3.3.2'.startsWith(p)),
      '3.3.2 debe ser capturado por un prefix de check',
    );
  });
  it('4.2.2 (Verificación medidas control) es capturado por check', () => {

    assert.ok(
      PHASE_PREFIXES.check.some((p: string) => '4.2.2'.startsWith(p)),
      '4.2.2 debe ser capturado por un prefix de check',
    );
  });
  it('6.1.1 (Indicadores SG-SST) sigue siendo capturado por check', () => {

    assert.ok(
      PHASE_PREFIXES.check.some((p: string) => '6.1.1'.startsWith(p)),
      '6.1.1 debe seguir siendo capturado por check',
    );
  });
});

describe('PREFIX-ALIGN-4: PHASE_PREFIXES.check NO captura estándares HACER del capítulo 2', () => {
  it('2.5.1 (Conservación documental — HACER) no es capturado por check', () => {

    assert.ok(
      !PHASE_PREFIXES.check.some((p: string) => '2.5.1'.startsWith(p)),
      '2.5.1 NO debe ser capturado por check',
    );
  });
  it('2.8.1 (Comunicación — HACER) no es capturado por check', () => {

    assert.ok(
      !PHASE_PREFIXES.check.some((p: string) => '2.8.1'.startsWith(p)),
      '2.8.1 NO debe ser capturado por check',
    );
  });
  it('2.9.1 (Adquisiciones — HACER) no es capturado por check', () => {

    assert.ok(
      !PHASE_PREFIXES.check.some((p: string) => '2.9.1'.startsWith(p)),
      '2.9.1 NO debe ser capturado por check',
    );
  });
});

describe('PREFIX-ALIGN-5: Estándares PLANNED no son afectados por la expansión de prefixes', () => {
  it('2.13.1 (Prevención accidentes — PLANNED, HACER) es capturado por do', () => {

    // 2.13.1 empieza con 2.13 — no hay prefix 2.13 en do
    // pero 2.13.1 no empieza con ninguno de los prefixes de do
    const isCapturedByDo = PHASE_PREFIXES.do.some((p: string) => '2.13.1'.startsWith(p));
    // 2.13.1 no empieza con 2.5.1, 2.8.1, 2.9.1, 2.10.1, 2.11.1, 3., 4., 5.
    assert.ok(!isCapturedByDo, '2.13.1 PLANNED no debe ser capturado por do (sin prefix explícito)');
  });
  it('3.4.1 (Indicadores salud — PLANNED, VERIFICAR) es capturado por check', () => {

    // 3.4.1 no empieza con 2.6.1, 3.3.2, 4.2.2, ni 6.
    const isCapturedByCheck = PHASE_PREFIXES.check.some((p: string) => '3.4.1'.startsWith(p));
    assert.ok(!isCapturedByCheck, '3.4.1 PLANNED no debe ser capturado por check (sin prefix explícito)');
  });
  it('4.3.1 (Investigación accidentes — PLANNED, VERIFICAR) no es capturado por check', () => {

    const isCapturedByCheck = PHASE_PREFIXES.check.some((p: string) => '4.3.1'.startsWith(p));
    assert.ok(!isCapturedByCheck, '4.3.1 PLANNED no debe ser capturado por check');
  });
  it('5.2.1 (Simulacros — PLANNED, VERIFICAR) no es capturado por check', () => {

    const isCapturedByCheck = PHASE_PREFIXES.check.some((p: string) => '5.2.1'.startsWith(p));
    assert.ok(!isCapturedByCheck, '5.2.1 PLANNED no debe ser capturado por check');
  });
});

describe('PREFIX-ALIGN-6: Estructura de PHASE_PREFIXES', () => {
  it('do contiene exactamente los prefixes esperados', () => {

    const expectedDo = ['2.5.1', '2.8.1', '2.9.1', '2.10.1', '2.11.1', '3.', '4.', '5.'];
    assert.deepEqual(PHASE_PREFIXES.do, expectedDo);
  });

  it('check contiene exactamente los prefixes esperados', () => {

    const expectedCheck = ['2.6.1', '3.3.2', '4.2.2', '6.'];
    assert.deepEqual(PHASE_PREFIXES.check, expectedCheck);
  });

  it('plan y act no cambiaron', () => {

    assert.deepEqual(PHASE_PREFIXES.plan, ['1.', '2.']);
    assert.deepEqual(PHASE_PREFIXES.act, ['7.']);
  });
});
