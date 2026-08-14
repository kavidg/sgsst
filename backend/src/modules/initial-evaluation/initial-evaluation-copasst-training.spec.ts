import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { StandardCatalogService } from '../standard-catalog/standard-catalog.service';
import { AlertsService } from '../alerts/alerts.service';
import { InitialEvaluationCatalogAdapter } from './initial-evaluation-catalog.adapter';
import { InitialEvaluationService } from './initial-evaluation.service';
import { StandardEvaluationStatus } from './schemas/initial-evaluation.schema';

const COMPANY_A = '64a00000000000000000000a';
const COMPANY_B = '64a00000000000000000000b';

/**
 * Stub del StandardCatalogService que devuelve catálogo vacío → el adapter usa
 * el fallback legacy (comportamiento permanente documentado), que desde FASE 6
 * incluye 1.1.7. Así el diagnóstico automático siempre evalúa 1.1.7.
 */
function catalogAdapter(): InitialEvaluationCatalogAdapter {
  const service = {
    isValidLevel: (v: string): v is '7' | '21' | '60' => v === '7' || v === '21' || v === '60',
    getApplicableStandards: () => [],
  } as unknown as StandardCatalogService;
  return new InitialEvaluationCatalogAdapter(service);
}

interface DiagnosticSources {
  copasstTrainingCompliance?: 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT';
  copasstMembers?: unknown[];
  existingEvaluation?: Record<string, unknown> | null;
  onCopasstTrainingLookup?: (companyId: string, itemCode: string) => void;
}

function buildService(sources: DiagnosticSources = {}) {
  let stored: Record<string, unknown> | null = sources.existingEvaluation ?? null;
  let createCalls = 0;

  const leanModel = (value: unknown) => ({ lean: () => ({ exec: async () => value }) });

  const evaluationModel = {
    findOne: () => ({ exec: async () => stored }),
    create: async (doc: Record<string, unknown>) => {
      createCalls += 1;
      stored = {
        ...doc,
        status: doc.status ?? 'Borrador',
        gaps: doc.gaps ?? [],
        findings: doc.findings ?? [],
        actionPlan: doc.actionPlan ?? [],
        signatures: doc.signatures ?? [],
        history: doc.history ?? [],
        save: async function () {
          return this;
        },
      };
      return stored;
    },
  };
  const companyModel = {
    findById: () => ({ lean: () => ({ exec: async () => ({ standardsType: '60' }) }) }),
  };
  const unusedModel = () => ({
    findOne: () => ({ lean: () => ({ exec: async () => null }) }),
  });
  const copasstTrainingModel = {
    findOne: (filter: { companyId: string; itemCode: string }) => {
      sources.onCopasstTrainingLookup?.(filter.companyId.toString(), filter.itemCode);
      return leanModel(
        sources.copasstTrainingCompliance
          ? { complianceStatus: sources.copasstTrainingCompliance }
          : null,
      );
    },
  };
  const copasstModel = {
    findOne: () => leanModel({ members: sources.copasstMembers ?? [] }),
  };
  const alertsService = { createUnique: async () => ({}) } as unknown as AlertsService;

  const service = new InitialEvaluationService(
    evaluationModel as never,
    companyModel as never,
    unusedModel() as never,
    unusedModel() as never,
    unusedModel() as never,
    copasstModel as never,
    unusedModel() as never,
    copasstTrainingModel as never,
    alertsService,
    catalogAdapter(),
  );

  return {
    service,
    getStored: () => stored,
    getCreateCalls: () => createCalls,
  };
}

function standardByCode(stored: Record<string, unknown> | null, code: string) {
  const standards = (stored?.standards as Array<Record<string, unknown>>) ?? [];
  return standards.find((s) => s.code === code);
}

describe('runAutoDiagnostic · 1.1.7 Capacitación COPASST (FASE 6)', () => {
  it('empresa sin entidad 1.1.7 → estándar presente (legacy) y NO cumple', async () => {
    const { service, getStored } = buildService();
    await service.runAutoDiagnostic(COMPANY_A as never);

    const standard = standardByCode(getStored(), '1.1.7');
    assert.ok(standard, '1.1.7 debe existir en la evaluación inicial');
    assert.equal(standard?.status, StandardEvaluationStatus.DOES_NOT_COMPLY);
    assert.equal(standard?.autoEvaluated, true);
    assert.equal(standard?.autoSource, 'Capacitación COPASST');
  });

  it('empresa con complianceStatus COMPLIES → 1.1.7 Cumple', async () => {
    const { service, getStored } = buildService({ copasstTrainingCompliance: 'COMPLIES' });
    await service.runAutoDiagnostic(COMPANY_A as never);

    const standard = standardByCode(getStored(), '1.1.7');
    assert.equal(standard?.status, StandardEvaluationStatus.COMPLIES);
    assert.ok((standard?.observations as string).includes('cumple'));
  });

  it('empresa con complianceStatus PENDING → NO cumple (con brecha registrada)', async () => {
    const { service, getStored } = buildService({ copasstTrainingCompliance: 'PENDING' });
    await service.runAutoDiagnostic(COMPANY_A as never);

    const standard = standardByCode(getStored(), '1.1.7');
    assert.equal(standard?.status, StandardEvaluationStatus.DOES_NOT_COMPLY);
    assert.ok((standard?.observations as string).includes('brecha'));
  });

  it('consulta la entidad 1.1.7 SOLO con el companyId de la empresa (aislamiento)', async () => {
    const lookups: Array<{ companyId: string; itemCode: string }> = [];
    const { service } = buildService({
      copasstTrainingCompliance: 'COMPLIES',
      onCopasstTrainingLookup: (companyId, itemCode) => lookups.push({ companyId, itemCode }),
    });
    await service.runAutoDiagnostic(COMPANY_B as never);

    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].companyId, COMPANY_B);
    assert.equal(lookups[0].itemCode, '1.1.7');
  });

  it('idempotencia: ejecutar dos veces no duplica EvaluationItems ni registros', async () => {
    const { service, getStored, getCreateCalls } = buildService({ copasstTrainingCompliance: 'COMPLIES' });

    await service.runAutoDiagnostic(COMPANY_A as never);
    await service.runAutoDiagnostic(COMPANY_A as never);

    const standards = (getStored()?.standards as Array<Record<string, unknown>>) ?? [];
    assert.equal(getCreateCalls(), 1);
    assert.equal(standards.length, 11, 'legacy con 1.1.7 = 11 estándares, sin duplicados');
    assert.equal(standards.filter((s) => s.code === '1.1.7').length, 1);
  });

  it('evaluación existente: no la destruye ni agrega estándares duplicados', async () => {
    const existing = {
      companyId: COMPANY_A,
      status: 'Aprobada',
      save: async function () {
        return this;
      },
      standards: [
        { code: '1.1.1', status: StandardEvaluationStatus.COMPLIES, weight: 0.5, autoEvaluated: false },
        { code: '1.1.7', status: StandardEvaluationStatus.COMPLIES, weight: 0.5, autoEvaluated: false },
      ],
      actionPlan: [],
      gaps: [],
      findings: [],
      signatures: [],
      history: [],
      overallCompliance: 50,
      totalStandardsEvaluated: 2,
    };
    const { service, getStored, getCreateCalls } = buildService({
      existingEvaluation: existing,
      copasstTrainingCompliance: 'COMPLIES',
    });

    await service.runAutoDiagnostic(COMPANY_A as never);

    assert.equal(getCreateCalls(), 0);
    const standards = (getStored()?.standards as Array<Record<string, unknown>>) ?? [];
    assert.equal(standards.length, 2, 'no agrega estándares a una evaluación existente');
    assert.equal(standardByCode(getStored(), '1.1.7')?.status, StandardEvaluationStatus.COMPLIES);
  });

  it('genera el gap 1.1.7 con recommendedAction específica', async () => {
    const { service, getStored } = buildService();
    await service.runAutoDiagnostic(COMPANY_A as never);

    const gaps = (getStored()?.gaps as Array<Record<string, unknown>>) ?? [];
    const gap = gaps.find((g) => g.code === '1.1.7');
    assert.ok(gap);
    assert.equal(gap.recommendedAction, 'Capacitar a los integrantes del COPASST');
  });
});
