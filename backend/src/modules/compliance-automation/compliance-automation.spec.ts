import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ComplianceAutomationService } from './compliance-automation.service';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { ComplianceActionEngineService } from '../compliance-action-engine/compliance-action-engine.service';
import { ActionRecommendationDto } from '../compliance-action-engine/dto/action-recommendation.dto';
import { AcceptRecommendationDto } from './dto/accept-recommendation.dto';
import { AutomationStatus } from './enums/automation-status.enum';
import { FindingPriority } from '../compliance-engine/enums/finding-priority.enum';
import { validateAcceptRequest, validateRecommendationState, isAcceptableRecommendation, validateRole } from './utils/automation-validator';
import { resolveTemplate, buildActionsForRecommendation, computeGeneratedCounts, buildAutomationSummary } from './utils/automation-factory';

const COMPANY_A = '64a000000000000000000001';
const COMPANY_B = '64a000000000000000000002';

function buildRecommendation(overrides?: Partial<ActionRecommendationDto>): ActionRecommendationDto {
  return {
    id: 'action-1',
    title: 'Actualizar documentos',
    description: 'Gap documental detectado',
    priority: FindingPriority.HIGH,
    estimatedImpact: 80,
    estimatedDurationDays: 30,
    recommendedResponsibleRole: 'Responsable SST' as never,
    relatedFindingId: 'finding-1',
    relatedModule: 'documents',
    affectedPhase: 'check',
    estimatedCost: 500,
    canCreateAnnualPlanActivity: true,
    canCreateObjective: true,
    canCreateIndicator: false,
    createdAutomatically: true,
    accepted: null,
    implemented: null,
    generatedActivityId: null,
    ...overrides,
  };
}

function buildAcceptDto(overrides?: Partial<AcceptRecommendationDto>): AcceptRecommendationDto {
  return {
    recommendationId: 'action-1',
    companyId: COMPANY_A,
    acceptedBy: 'owner@test.com',
    acceptDate: new Date().toISOString(),
    ...overrides,
  };
}

function buildService(overrides?: {
  overview?: unknown;
  recommendations?: ActionRecommendationDto[];
}) {
  const complianceEngineService = {
    getOverview: async () => overrides?.overview ?? {},
  } as unknown as ComplianceEngineService;

  const complianceActionEngineService = {
    getRecommendations: async () => overrides?.recommendations ?? [buildRecommendation()],
  } as unknown as ComplianceActionEngineService;

  const service = new ComplianceAutomationService(
    complianceEngineService,
    complianceActionEngineService,
  );

  return { service, complianceEngineService, complianceActionEngineService };
}

// ==================== AUTO-01: Validación del request ====================

describe('AUTO-01: validateAcceptRequest valida campos obligatorios', () => {
  it('request válido', () => {
    const result = validateAcceptRequest(buildAcceptDto());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('recommendationId vacío → inválido', () => {
    const result = validateAcceptRequest(buildAcceptDto({ recommendationId: '' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('recommendationId')));
  });

  it('companyId inválido → inválido', () => {
    const result = validateAcceptRequest(buildAcceptDto({ companyId: 'invalid' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('companyId')));
  });

  it('acceptedBy vacío → inválido', () => {
    const result = validateAcceptRequest(buildAcceptDto({ acceptedBy: '' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('acceptedBy')));
  });

  it('acceptDate inválida → inválido', () => {
    const result = validateAcceptRequest(buildAcceptDto({ acceptDate: 'not-a-date' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('acceptDate')));
  });
});

// ==================== AUTO-02: validateRecommendationState ====================

describe('AUTO-02: validateRecommendationState valida existencia y estado', () => {
  it('recomendación null → inválido', () => {
    const result = validateRecommendationState(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('no existe')));
  });

  it('recomendación aceptada → inválido', () => {
    const result = validateRecommendationState(buildRecommendation({ accepted: true }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('ya fue aceptada')));
  });

  it('recomendación no aceptada → válido', () => {
    const result = validateRecommendationState(buildRecommendation({ accepted: null }));
    assert.equal(result.valid, true);
  });
});

// ==================== AUTO-03: isAcceptableRecommendation ====================

describe('AUTO-03: isAcceptableRecommendation type guard', () => {
  it('null → false', () => {
    assert.equal(isAcceptableRecommendation(null), false);
  });

  it('accepted=true → false', () => {
    assert.equal(isAcceptableRecommendation(buildRecommendation({ accepted: true })), false);
  });

  it('accepted=null → true', () => {
    assert.equal(isAcceptableRecommendation(buildRecommendation({ accepted: null })), true);
  });
});

// ==================== AUTO-04: validateRole ====================

describe('AUTO-04: validateRole valida roles', () => {
  it('owner → válido', () => {
    assert.equal(validateRole('owner').valid, true);
  });

  it('admin → válido', () => {
    assert.equal(validateRole('admin').valid, true);
  });

  it('manager → válido', () => {
    assert.equal(validateRole('manager').valid, true);
  });

  it('viewer → inválido', () => {
    assert.equal(validateRole('viewer').valid, false);
  });

  it('undefined → inválido', () => {
    assert.equal(validateRole(undefined).valid, false);
  });
});

// ==================== AUTO-05: acceptRecommendation flujo completo ====================

describe('AUTO-05: acceptRecommendation produce resultado válido', () => {
  it('aceptación exitosa retorna AutomationResultDto con acciones preparadas', async () => {
    const { service } = buildService({
      recommendations: [buildRecommendation({ relatedModule: 'documents' })],
    });

    const result = await service.acceptRecommendation(buildAcceptDto());

    assert.equal(result.accepted, true);
    assert.equal(result.automationStatus, AutomationStatus.READY);
    assert.ok(Array.isArray(result.generatedActions));
    assert.ok(result.generatedActions.length > 0, 'Debe generar al menos una acción');
    assert.equal(typeof result.summary, 'string');
    assert.equal(result.createdAutomatically, true);
  });

  it('todas las acciones tienen executable=false', async () => {
    const { service } = buildService();

    const result = await service.acceptRecommendation(buildAcceptDto());

    for (const action of result.generatedActions) {
      assert.equal(action.executable, false, 'Acciones preparadas no deben ser ejecutables aún');
    }
  });
});

// ==================== AUTO-06: recommendación inexistente rechazada ====================

describe('AUTO-06: recommendación inexistente es rechazada', () => {
  it('recommendationId que no existe → NotFoundException', async () => {
    const { service } = buildService({ recommendations: [] });

    await assert.rejects(
      () => service.acceptRecommendation(buildAcceptDto({ recommendationId: 'nonexistent' })),
      (err: Error) => {
        // NestJS NotFoundException message format
        assert.ok(err.constructor.name === 'NotFoundException' || err.message.includes('Not Found'));
        return true;
      },
    );
  });

  it('recommendationId ya aceptada → BadRequestException', async () => {
    const { service } = buildService({
      recommendations: [buildRecommendation({ accepted: true })],
    });

    await assert.rejects(
      () => service.acceptRecommendation(buildAcceptDto()),
      (err: Error) => {
        // NestJS BadRequestException message format
        assert.ok(err.constructor.name === 'BadRequestException' || err.message.includes('Bad Request') || Array.isArray(JSON.parse(err.message)));
        return true;
      },
    );
  });
});

// ==================== Factory: resolveTemplate ====================

describe('Factory: resolveTemplate', () => {
  it('documents → DOCUMENTS_UPDATE', () => {
    assert.equal(resolveTemplate('documents'), 'DOCUMENTS_UPDATE');
  });

  it('trainings → TRAINING_SCHEDULE', () => {
    assert.equal(resolveTemplate('trainings'), 'TRAINING_SCHEDULE');
  });

  it('risks → RISK_CONTROLS', () => {
    assert.equal(resolveTemplate('risks'), 'RISK_CONTROLS');
  });

  it('incidents → INCIDENT_INVESTIGATION', () => {
    assert.equal(resolveTemplate('incidents'), 'INCIDENT_INVESTIGATION');
  });

  it('legal-matrix → LEGAL_UPDATE', () => {
    assert.equal(resolveTemplate('legal-matrix'), 'LEGAL_UPDATE');
  });

  it('annual-work-plan → ANNUAL_PLAN_RESCHEDULE', () => {
    assert.equal(resolveTemplate('annual-work-plan'), 'ANNUAL_PLAN_RESCHEDULE');
  });

  it('phva → PHVA_ACTIVITIES', () => {
    assert.equal(resolveTemplate('phva'), 'PHVA_ACTIVITIES');
  });

  it('unknown module → null', () => {
    assert.equal(resolveTemplate('unknown-module'), null);
  });
});

// ==================== Factory: buildActionsForRecommendation ====================

describe('Factory: buildActionsForRecommendation', () => {
  it('genera acciones con executable=false', () => {
    const rec = buildRecommendation({ relatedModule: 'documents' });
    const actions = buildActionsForRecommendation(rec);

    assert.ok(actions.length > 0);
    for (const action of actions) {
      assert.equal(action.executable, false);
      assert.equal(action.module, 'documents');
    }
  });

  it('módulo desconocido → 0 acciones', () => {
    const rec = buildRecommendation({ relatedModule: 'unknown' });
    const actions = buildActionsForRecommendation(rec);

    assert.equal(actions.length, 0);
  });
});

// ==================== Factory: computeGeneratedCounts ====================

describe('Factory: computeGeneratedCounts', () => {
  it('canCreateAnnualPlanActivity=true → activities = actions.length', () => {
    const rec = buildRecommendation({ canCreateAnnualPlanActivity: true });
    const actions = [{ actionId: 'a1' }, { actionId: 'a2' }] as never[];
    const counts = computeGeneratedCounts(rec, actions);

    assert.equal(counts.activities, 2);
  });

  it('canCreateAnnualPlanActivity=false → activities = 0', () => {
    const rec = buildRecommendation({ canCreateAnnualPlanActivity: false });
    const counts = computeGeneratedCounts(rec, [{ actionId: 'a1' }] as never[]);

    assert.equal(counts.activities, 0);
  });

  it('canCreateObjective=true → objectives = 1', () => {
    const rec = buildRecommendation({ canCreateObjective: true });
    const counts = computeGeneratedCounts(rec, []);

    assert.equal(counts.objectives, 1);
  });

  it('canCreateIndicator=true → indicators = 1', () => {
    const rec = buildRecommendation({ canCreateIndicator: true });
    const counts = computeGeneratedCounts(rec, []);

    assert.equal(counts.indicators, 1);
  });
});

// ==================== Factory: buildAutomationSummary ====================

describe('Factory: buildAutomationSummary', () => {
  it('con acciones → resumen descriptivo', () => {
    const rec = buildRecommendation({ title: 'Test Rec', relatedModule: 'documents' });
    const actions = [{ actionId: 'a1' }] as never[];
    const summary = buildAutomationSummary(rec, actions);

    assert.ok(summary.includes('Test Rec'));
    assert.ok(summary.includes('acciones automáticas'));
  });

  it('sin acciones → resumen indicando falta de acciones', () => {
    const rec = buildRecommendation({ title: 'Test Rec', relatedModule: 'unknown' });
    const summary = buildAutomationSummary(rec, []);

    assert.ok(summary.includes('Test Rec'));
    assert.ok(summary.includes('no se pudieron preparar'));
  });
});
