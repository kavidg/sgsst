import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model } from 'mongoose';
import { NotFoundException } from '@nestjs/common';

import { AbsenteeismService } from '../../absenteeism/absenteeism.service';
import { ActivityStatus } from '../../annual-work-plan/schemas/plan-activity.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { Company, CompanyDocument } from '../../companies/schemas/company.schema';
import { ComplianceEngineService } from '../../compliance-engine/compliance-engine.service';
import { ConvivenciaService } from '../../convivencia/convivencia.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { IncidentsService } from '../../incidents/incidents.service';
import { InitialEvaluationService } from '../../initial-evaluation/initial-evaluation.service';
import { StandardEvaluationStatus } from '../../initial-evaluation/schemas/initial-evaluation.schema';
import { InspectionsService } from '../../inspections/inspections.service';
import { PhvaAnalysisService } from '../../phva/phva-analysis.service';
import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
import { TrainingsService } from '../../trainings/trainings.service';
import { AiContextService } from './ai-context.service';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';

/** Cobertura por defecto devuelta por el stub del dominio 1.1.7. */
const DEFAULT_COVERAGE = {
  totalMembers: 0,
  trainedMembers: 0,
  coveragePercentage: 0,
  executedSessions: 0,
};

/** Misma regla de dominio: sesión ejecutada = status 'Ejecutada' o completionDate. */
function stubIsSessionExecuted(session: { status?: string; completionDate?: unknown }): boolean {
  return session.status === 'Ejecutada' || Boolean(session.completionDate);
}

/** Excepción de dominio real: empresa sin periodo de convivencia vigente. */
function noPeriodError(): NotFoundException {
  return new NotFoundException('No existe un periodo activo para esta empresa');
}

function buildService(overrides?: {
  company?: unknown;
  overview?: unknown;
  phva?: unknown;
  documents?: unknown[];
  activities?: unknown[];
  copasstTraining?: { record?: unknown; coverage?: unknown };
  convivencia?: { snapshot?: unknown; period?: unknown };
  // AUDIT-5: dominios operativos (cada stub registra la llamada para
  // verificar que recibe el companyId autorizado).
  initialEvaluation?: unknown;
  indicators?: unknown;
  incidents?: unknown[];
  absenteeism?: { stats?: unknown; records?: unknown[] };
  programs?: unknown[];
  audits?: unknown[];
}): AiContextService {
  return buildServiceWithCalls(overrides);
}

/**
 * Variante de buildService que expone el registro de llamadas de los providers
 * (para TENANT-AUDIT5-04: todos deben recibir el companyId autorizado).
 * Un array compartido es más robusto que adjuntar estado a la función.
 */
function buildServiceWithCalls(
  overrides?: Parameters<typeof buildService>[0],
): AiContextService {
  // AUDIT-5: registro de los companyId que recibe cada provider.
  const providerCalls: Array<{ provider: string; companyId: string }> = [];
  const companyModel = {
    // Sin async: findById() debe devolver el objeto encadenable (Query) para .exec().
    findById: () => ({ exec: async () => overrides?.company ?? null }),
  } as unknown as Model<CompanyDocument>;
  const complianceEngineService = {
    getOverview: async () => overrides?.overview ?? null,
  } as unknown as ComplianceEngineService;
  const phvaAnalysisService = {
    analyzeCompanyPHVA: async () => overrides?.phva ?? null,
  } as unknown as PhvaAnalysisService;
  const documentMasterService = {
    findAll: async () => overrides?.documents ?? [],
  } as unknown as DocumentMasterService;
  const annualWorkPlanService = {
    // Solo devuelve plan si se indicaron actividades (el plan es requisito para leerlas).
    findCurrent: async () => (overrides?.activities !== undefined ? { _id: 'plan-id' } : null),
    getActivities: async () => overrides?.activities ?? [],
  } as unknown as AnnualWorkPlanService;
  const copasstTrainingService = {
    findByCompany: async () => overrides?.copasstTraining?.record ?? null,
    calculateCoverage: async () => overrides?.copasstTraining?.coverage ?? DEFAULT_COVERAGE,
    isSessionExecuted: stubIsSessionExecuted,
  } as unknown as PhvaAdvancedCopasstTrainingService;
  // Sin override: el dominio lanza NotFound (empresa sin periodo vigente), lo
  // que debe producir available: false sin romper el contexto.
  const convivenciaService = {
    getComplianceSnapshot: async () => {
      if (overrides?.convivencia === undefined) throw noPeriodError();
      return overrides.convivencia.snapshot;
    },
    findCurrent: async () => {
      if (overrides?.convivencia === undefined) throw noPeriodError();
      return overrides.convivencia.period;
    },
  } as unknown as ConvivenciaService;
  // ── AUDIT-5: stubs de los dominios operativos (reutilizan los mismos
  // métodos reales que consume AiContextService, registrando la llamada).
  const initialEvaluationService = {
    findCurrent: async (companyId: { toString(): string }) => {
      providerCalls.push({ provider: 'initialEvaluation', companyId: companyId.toString() });
      return overrides?.initialEvaluation ?? null;
    },
  } as unknown as InitialEvaluationService;
  const dashboardService = {
    getCompanyStats: async (companyId: { toString(): string }) => {
      providerCalls.push({ provider: 'indicators', companyId: companyId.toString() });
      return overrides?.indicators ?? null;
    },
  } as unknown as DashboardService;
  const incidentsService = {
    findAll: async (companyId: { toString(): string }) => {
      providerCalls.push({ provider: 'incidents', companyId: companyId.toString() });
      return overrides?.incidents ?? [];
    },
  } as unknown as IncidentsService;
  const absenteeismService = {
    getCompanyStats: async (companyId: string) => {
      providerCalls.push({ provider: 'absenteeism.stats', companyId });
      return (
        overrides?.absenteeism?.stats ?? {
          totalDiasPerdidos: 0,
          totalCasos: 0,
          promedioDias: 0,
        }
      );
    },
    findAllByCompany: async (companyId: string) => {
      providerCalls.push({ provider: 'absenteeism.records', companyId });
      return overrides?.absenteeism?.records ?? [];
    },
  } as unknown as AbsenteeismService;
  const trainingsService = {
    findAll: async (companyId: { toString(): string }) => {
      providerCalls.push({ provider: 'programs', companyId: companyId.toString() });
      return overrides?.programs ?? [];
    },
  } as unknown as TrainingsService;
  const inspectionsService = {
    findAll: async (companyId: { toString(): string }) => {
      providerCalls.push({ provider: 'audits', companyId: companyId.toString() });
      return overrides?.audits ?? [];
    },
  } as unknown as InspectionsService;

  const service = new AiContextService(
    companyModel,
    complianceEngineService,
    phvaAnalysisService,
    documentMasterService,
    annualWorkPlanService,
    copasstTrainingService,
    convivenciaService,
    initialEvaluationService,
    dashboardService,
    incidentsService,
    absenteeismService,
    trainingsService,
    inspectionsService,
  );
  // Expone el registro de llamadas para el test de tenant (TENANT-AUDIT5-04).
  (service as unknown as { __audit5Calls?: typeof providerCalls }).__audit5Calls = providerCalls;
  return service;
}

describe('AiContextService.buildCompanyContext', () => {
  it('construye el contexto completo con datos reales (empresa, compliance, phva, documentos, actividades)', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' },
      overview: {
        overallCompliance: 82,
        findings: [{ title: 'Falta política SST' }],
        recommendations: [{ title: 'Crear política SST' }],
      },
      phva: {
        overall: 82,
        planear: { percentage: 78, pending: ['Política DRAFT'] },
        hacer: { percentage: 84, pending: [] },
        verificar: { percentage: 90, pending: [] },
        actuar: { percentage: 75, pending: ['Hallazgo crítico'] },
      },
      documents: [
        { name: 'Política SST', status: DocumentStatus.ACTIVE, expirationDate: future },
        { name: 'Matriz Legal', status: DocumentStatus.DRAFT },
        { name: 'Plan Emergencia', status: DocumentStatus.ACTIVE, expirationDate: past },
      ],
      activities: [
        { title: 'Capacitación', status: ActivityStatus.PENDING },
        { title: 'Inspección', status: ActivityStatus.DELAYED },
        { title: 'Auditoría', status: ActivityStatus.COMPLETED },
      ],
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    // Empresa
    assert.equal(context.company.id, COMPANY_ID);
    assert.equal(context.company.name, 'Empresa Demo');
    assert.equal(context.company.standardsType, '21');

    // Compliance (reutiliza el Compliance Engine)
    assert.equal(context.compliance.overallCompliance, 82);
    assert.deepEqual(context.compliance.gaps, ['Falta política SST']);
    assert.deepEqual(context.compliance.recommendations, ['Crear política SST']);

    // PHVA (reutiliza PhvaAnalysisResult)
    assert.equal(context.phva.overall, 82);
    assert.equal(context.phva.planear.percentage, 78);
    assert.deepEqual(context.phva.planear.pending, ['Política DRAFT']);
    assert.equal(context.phva.actuar.percentage, 75);

    // Documentos
    assert.equal(context.documents.total, 3);
    assert.deepEqual(context.documents.pending, ['Matriz Legal']);
    assert.deepEqual(context.documents.expired, ['Plan Emergencia']);
    assert.equal(context.documents.generalStatus, 'CON_VENCIDOS');

    // Actividades
    assert.equal(context.activities.total, 3);
    assert.deepEqual(context.activities.pending, ['Capacitación']);
    assert.deepEqual(context.activities.delayed, ['Inspección']);
    assert.deepEqual(context.activities.completed, ['Auditoría']);
  });

  it('no rompe cuando la empresa no tiene plan anual ni documentos (valores por defecto)', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Nueva', standardsType: '7' },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.company.name, 'Empresa Nueva');
    assert.equal(context.company.standardsType, '7');
    assert.equal(context.compliance.overallCompliance, 0);
    assert.deepEqual(context.compliance.gaps, []);
    assert.equal(context.phva.overall, 0);
    assert.equal(context.phva.planear.percentage, 0);
    assert.equal(context.documents.total, 0);
    assert.equal(context.documents.generalStatus, 'SIN_DOCUMENTOS');
    assert.equal(context.activities.total, 0);

    // 1.1.7 sin entidad: sección con valores por defecto (contrato válido).
    assert.equal(context.copasstTraining.itemCode, null);
    assert.equal(context.copasstTraining.year, null);
    assert.equal(context.copasstTraining.complianceStatus, null);
    assert.equal(context.copasstTraining.complianceReason, null);
    assert.equal(context.copasstTraining.coverage.percentage, 0);
    assert.equal(context.copasstTraining.coverage.totalMembers, 0);
    assert.deepEqual(context.copasstTraining.coverage.pendingMemberNames, []);
    assert.equal(context.copasstTraining.sessions.total, 0);
    assert.equal(context.copasstTraining.sessions.executed, 0);
    assert.deepEqual(context.copasstTraining.members, []);
    assert.equal(context.copasstTraining.evaluations.attempts, 0);
    assert.equal(context.copasstTraining.evidences.structuredCount, 0);
    assert.equal(context.copasstTraining.trend, null);

    // 1.1.8 sin periodo: sección disponible con available: false (contrato válido).
    assert.equal(context.convivencia.available, false);
    assert.equal(context.convivencia.itemCode, null);
    assert.equal(context.convivencia.complianceStatus, null);
    assert.equal(context.convivencia.percentage, 0);
    assert.equal(context.convivencia.exempt, false);
    assert.deepEqual(context.convivencia.missingCriteria, []);
    assert.equal(context.convivencia.memberCount, 0);
    assert.equal(context.convivencia.meetingCount, 0);
    assert.equal(context.convivencia.completedMeetingCount, 0);
    assert.equal(context.convivencia.evidenceCount, 0);
    assert.deepEqual(context.convivencia.cases, { total: 0, open: 0, closed: 0 });
    assert.deepEqual(context.convivencia.members, []);
    assert.deepEqual(context.convivencia.meetings, []);
  });

  it('incorpora la información real de 1.1.7 (cobertura, sesiones, miembros, evaluaciones, evidencias)', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' },
      copasstTraining: {
        record: {
          itemCode: '1.1.7',
          year: 2026,
          complianceStatus: 'PENDING',
          complianceReason: 'Avance parcial: faltan sesiones ejecutadas (1.1.7).',
          sessions: [
            {
              title: 'Sesión 1',
              status: 'Ejecutada',
              completionDate: past,
              scheduledDate: past,
            },
            { title: 'Sesión 2', status: 'Programada', scheduledDate: future },
            { title: 'Sesión 3', status: 'Cancelada' },
            {
              title: 'Sesión 4',
              status: 'Programada',
              scheduledDate: past,
              expirationDate: past,
            },
          ],
          memberCoverage: [
            {
              userId: '64b000000000000000000002',
              name: 'Ana López',
              committeeRole: 'Presidente',
              representationType: 'Empleador',
              status: 'ACTIVO',
              trained: true,
              trainedAt: past,
              executedSessions: 1,
            },
            {
              userId: '64b000000000000000000003',
              name: 'Luis Pérez',
              status: 'ACTIVO',
              trained: false,
              executedSessions: 0,
            },
          ],
          evaluationAttempts: [
            { attemptNumber: 1, passed: true, score: 90 },
            { attemptNumber: 2, passed: false, score: 40 },
          ],
          attendanceEvidence: ['asistencia-1'],
          signatureEvidence: [],
          evidenceFiles: ['material.pdf'],
          certificates: ['cert-1'],
          evidences: [{ type: 'ATTENDANCE', fileName: 'asistencia-2', fileUrl: 'https://x' }],
        },
        coverage: {
          totalMembers: 2,
          trainedMembers: 1,
          coveragePercentage: 50,
          executedSessions: 1,
        },
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    // Identificación y estado del dominio (sin recalcular compliance).
    assert.equal(context.copasstTraining.itemCode, '1.1.7');
    assert.equal(context.copasstTraining.year, 2026);
    assert.equal(context.copasstTraining.complianceStatus, 'PENDING');
    assert.equal(
      context.copasstTraining.complianceReason,
      'Avance parcial: faltan sesiones ejecutadas (1.1.7).',
    );

    // Cobertura: reutiliza calculateCoverage del dominio (50% real).
    assert.equal(context.copasstTraining.coverage.percentage, 50);
    assert.equal(context.copasstTraining.coverage.totalMembers, 2);
    assert.equal(context.copasstTraining.coverage.trainedMembers, 1);
    assert.equal(context.copasstTraining.coverage.pendingMembers, 1);
    assert.deepEqual(context.copasstTraining.coverage.pendingMemberNames, ['Luis Pérez']);

    // Sesiones: ejecutada/programada/cancelada/vencida/próxima desde datos reales.
    assert.equal(context.copasstTraining.sessions.total, 4);
    assert.equal(context.copasstTraining.sessions.executed, 1);
    assert.equal(context.copasstTraining.sessions.scheduled, 2);
    assert.equal(context.copasstTraining.sessions.canceled, 1);
    assert.equal(context.copasstTraining.sessions.expired, 1);
    assert.equal(context.copasstTraining.sessions.upcoming, 1);

    // Miembros: snapshot real del dominio (sin re-resolver el periodo).
    assert.equal(context.copasstTraining.members.length, 2);
    assert.equal(context.copasstTraining.members[0].name, 'Ana López');
    assert.equal(context.copasstTraining.members[0].trained, true);
    assert.equal(context.copasstTraining.members[0].committeeRole, 'Presidente');
    assert.ok(context.copasstTraining.members[0].trainedAt !== null);
    assert.equal(context.copasstTraining.members[1].trained, false);
    assert.equal(context.copasstTraining.members[1].trainedAt, null);

    // Evaluaciones (globales a la entidad: 2 intentos, 1 aprobado, 1 reprobado).
    assert.equal(context.copasstTraining.evaluations.attempts, 2);
    assert.equal(context.copasstTraining.evaluations.passed, 1);
    assert.equal(context.copasstTraining.evaluations.failed, 1);

    // Evidencias: legacy (3 strings) + estructuradas (1).
    assert.equal(context.copasstTraining.evidences.legacyCount, 3);
    assert.equal(context.copasstTraining.evidences.structuredCount, 1);

    // Sin histórico suficiente: no se inventa una tendencia.
    assert.equal(context.copasstTraining.trend, null);
  });

  it('respeta el límite del contexto (pendientes y miembros truncados a 10)', async () => {
    // 14 miembros: 12 pendientes y 2 capacitados (para forzar truncado a 10).
    const members = Array.from({ length: 14 }, (_, index) => ({
      userId: `64b0000000000000000000${String(index + 2).padStart(2, '0')}`,
      name: `Miembro ${index + 1}`,
      status: 'ACTIVO',
      trained: index >= 12,
      executedSessions: index >= 12 ? 1 : 0,
    }));
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      copasstTraining: {
        record: {
          itemCode: '1.1.7',
          year: 2026,
          complianceStatus: 'PENDING',
          complianceReason: 'Pendiente',
          sessions: [],
          memberCoverage: members,
          evaluationAttempts: [],
          evidences: [],
        },
        coverage: {
          totalMembers: 14,
          trainedMembers: 2,
          coveragePercentage: 14,
          executedSessions: 1,
        },
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    // Los conteos globales son reales, pero las listas se limitan a 10.
    assert.equal(context.copasstTraining.coverage.totalMembers, 14);
    assert.equal(context.copasstTraining.coverage.percentage, 14);
    assert.equal(context.copasstTraining.coverage.pendingMembers, 12);
    assert.equal(context.copasstTraining.coverage.pendingMemberNames.length, 10);
    assert.equal(context.copasstTraining.members.length, 10);
  });

  it('respeta multi-tenancy: solo consulta la entidad 1.1.7 de la empresa autenticada', async () => {
    const calls: string[] = [];
    const copasstTrainingService = {
      findByCompany: async (companyId: { toString(): string }) => {
        calls.push(companyId.toString());
        // La empresa A solo ve su propia entidad; la de B no existe para ella.
        return companyId.toString() === COMPANY_ID
          ? {
              itemCode: '1.1.7',
              year: 2026,
              complianceStatus: 'COMPLIES',
              sessions: [],
              memberCoverage: [],
              evaluationAttempts: [],
              evidences: [],
            }
          : null;
      },
      calculateCoverage: async () => DEFAULT_COVERAGE,
      isSessionExecuted: stubIsSessionExecuted,
    } as unknown as PhvaAdvancedCopasstTrainingService;
    const companyModel = {
      findById: () => ({
        exec: async () => ({ _id: COMPANY_ID, name: 'Empresa A', standardsType: '21' }),
      }),
    } as unknown as Model<CompanyDocument>;
    const service = new AiContextService(
      companyModel,
      { getOverview: async () => null } as unknown as ComplianceEngineService,
      { analyzeCompanyPHVA: async () => null } as unknown as PhvaAnalysisService,
      { findAll: async () => [] } as unknown as DocumentMasterService,
      { findCurrent: async () => null, getActivities: async () => [] } as unknown as AnnualWorkPlanService,
      copasstTrainingService,
      { getComplianceSnapshot: async () => { throw noPeriodError(); }, findCurrent: async () => { throw noPeriodError(); } } as unknown as ConvivenciaService,
      { findCurrent: async () => null } as unknown as InitialEvaluationService,
      { getCompanyStats: async () => null } as unknown as DashboardService,
      { findAll: async () => [] } as unknown as IncidentsService,
      {
        getCompanyStats: async () => ({ totalDiasPerdidos: 0, totalCasos: 0, promedioDias: 0 }),
        findAllByCompany: async () => [],
      } as unknown as AbsenteeismService,
      { findAll: async () => [] } as unknown as TrainingsService,
      { findAll: async () => [] } as unknown as InspectionsService,
    );

    const contextA = await service.buildCompanyContext(COMPANY_ID);
    const contextB = await service.buildCompanyContext('64b0000000000000000000ff');

    // La consulta SIEMPRE se hace con el companyId autenticado (nunca entityId suelto).
    assert.deepEqual(calls, [COMPANY_ID, '64b0000000000000000000ff']);
    // Empresa A ve su entidad; una empresa sin 1.1.7 recibe la sección por defecto.
    assert.equal(contextA.copasstTraining.itemCode, '1.1.7');
    assert.equal(contextA.copasstTraining.complianceStatus, 'COMPLIES');
    assert.equal(contextB.copasstTraining.itemCode, null);
  });

  it('maneja errores de módulos sin romper el contexto (overview y phva fallan)', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      overview: null,
      phva: null,
      documents: [],
      activities: [],
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    // El contexto se construye igual con valores por defecto.
    assert.equal(context.company.name, 'Empresa Demo');
    assert.equal(context.compliance.overallCompliance, 0);
    assert.equal(context.phva.overall, 0);
    assert.equal(context.documents.total, 0);
    assert.equal(context.activities.total, 0);
  });

  it('no rompe el contexto cuando un módulo lanza un error (try/catch tolerante)', async () => {
    // Stubs que lanzan: simulan módulos caídos.
    const companyModel = {
      findById: () => ({ exec: async () => ({ _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' }) }),
    } as unknown as Model<CompanyDocument>;
    const complianceEngineService = {
      getOverview: async () => {
        throw new Error('overview down');
      },
    } as unknown as ComplianceEngineService;
    const phvaAnalysisService = {
      analyzeCompanyPHVA: async () => {
        throw new Error('phva down');
      },
    } as unknown as PhvaAnalysisService;
    const documentMasterService = {
      findAll: async () => {
        throw new Error('documents down');
      },
    } as unknown as DocumentMasterService;
    const annualWorkPlanService = {
      findCurrent: async () => {
        throw new Error('plan down');
      },
      getActivities: async () => [],
    } as unknown as AnnualWorkPlanService;
    const copasstTrainingService = {
      findByCompany: async () => {
        throw new Error('copasst training down');
      },
      calculateCoverage: async () => DEFAULT_COVERAGE,
      isSessionExecuted: stubIsSessionExecuted,
    } as unknown as PhvaAdvancedCopasstTrainingService;
    const convivenciaService = {
      getComplianceSnapshot: async () => {
        throw new Error('convivencia down');
      },
      findCurrent: async () => {
        throw new Error('convivencia down');
      },
    } as unknown as ConvivenciaService;

    const service = new AiContextService(
      companyModel,
      complianceEngineService,
      phvaAnalysisService,
      documentMasterService,
      annualWorkPlanService,
      copasstTrainingService,
      convivenciaService,
      { findCurrent: async () => null } as unknown as InitialEvaluationService,
      { getCompanyStats: async () => null } as unknown as DashboardService,
      { findAll: async () => [] } as unknown as IncidentsService,
      {
        getCompanyStats: async () => ({ totalDiasPerdidos: 0, totalCasos: 0, promedioDias: 0 }),
        findAllByCompany: async () => [],
      } as unknown as AbsenteeismService,
      { findAll: async () => [] } as unknown as TrainingsService,
      { findAll: async () => [] } as unknown as InspectionsService,
    );

    const context = await service.buildCompanyContext(COMPANY_ID);

    // Un módulo caído no debe romper el contexto: valores por defecto.
    assert.equal(context.company.name, 'Empresa Demo');
    assert.equal(context.compliance.overallCompliance, 0);
    assert.deepEqual(context.compliance.gaps, []);
    assert.equal(context.phva.overall, 0);
    assert.equal(context.phva.planear.percentage, 0);
    assert.equal(context.documents.total, 0);
    assert.equal(context.documents.generalStatus, 'SIN_DOCUMENTOS');
    assert.equal(context.activities.total, 0);

    // El módulo 1.1.7 caído tampoco rompe el contexto: sección por defecto.
    assert.equal(context.copasstTraining.itemCode, null);
    assert.equal(context.copasstTraining.coverage.percentage, 0);
    assert.deepEqual(context.copasstTraining.members, []);

    // El módulo 1.1.8 caído tampoco rompe el contexto: available: false.
    assert.equal(context.convivencia.available, false);
    assert.equal(context.convivencia.percentage, 0);
    assert.deepEqual(context.convivencia.members, []);
    assert.deepEqual(context.convivencia.meetings, []);
  });

  it('detecta documentos pendientes y estado AL_DIA cuando no hay vencidos', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' },
      documents: [
        { name: 'Política SST', status: DocumentStatus.ACTIVE },
        { name: 'Registro Capacitación', status: DocumentStatus.APPROVED },
      ],
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.documents.total, 2);
    assert.deepEqual(context.documents.pending, []);
    assert.deepEqual(context.documents.expired, []);
    assert.equal(context.documents.generalStatus, 'AL_DIA');
  });

  // ─────────────────────────────────────────────
  // FASE 4 (1.1.8) — sección convivencia del CompanyAIContext
  // ─────────────────────────────────────────────

  const PERIOD_COMPLIES = {
    itemCode: '1.1.8',
    periodName: 'Comité 2026',
    status: 'ACTIVO',
    approvalStatus: 'APPROVED_AND_SIGNED',
    members: [{ userId: '64b000000000000000000002', userName: 'Ana López', committeeRole: 'PRESIDENTE', representationType: 'EMPLEADOR', status: 'ACTIVO' }],
    meetings: [{ meetingDate: new Date('2026-01-10'), status: 'CERRADA' }],
    commitments: [],
    cases: [],
    evidence: [],
  };

  function buildSnapshot(overrides?: Record<string, unknown>): Record<string, unknown> {
    return {
      complianceStatus: 'PENDING',
      complianceReason: 'Avance parcial del Comité de Convivencia: falta aprobación del periodo.',
      percentage: 50,
      exempt: false,
      metCriteria: ['Periodo activo', 'Miembros conformados'],
      missingCriteria: ['Comité aprobado', 'Reuniones realizadas'],
      periodStatus: 'ACTIVO',
      approvalStatus: 'DRAFT',
      evidenceCount: 0,
      ...overrides,
    };
  }

  it('AI1 — empresa con periodo: la sección convivencia está disponible con datos reales', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: { snapshot: buildSnapshot(), period: PERIOD_COMPLIES },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.convivencia.available, true);
    assert.equal(context.convivencia.itemCode, '1.1.8');
    assert.equal(context.convivencia.complianceStatus, 'PENDING');
    assert.equal(context.convivencia.percentage, 50);
    assert.equal(context.convivencia.periodStatus, 'ACTIVO');
    assert.equal(context.convivencia.memberCount, 1);
    assert.equal(context.convivencia.meetingCount, 1);
    assert.equal(context.convivencia.completedMeetingCount, 1);
  });

  it('AI2 — empresa sin periodo: contexto controlado con available: false y sin error', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Nueva', standardsType: '7' },
      // Sin convivencia: el dominio lanza NotFound → sección por defecto.
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.convivencia.available, false);
    assert.equal(context.convivencia.complianceStatus, null);
    assert.equal(context.convivencia.percentage, 0);
    assert.deepEqual(context.convivencia.members, []);
    assert.deepEqual(context.convivencia.meetings, []);
  });

  it('AI3 — estado COMPLIES: el contexto refleja COMPLIES y 100%', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: {
        snapshot: buildSnapshot({
          complianceStatus: 'COMPLIES',
          complianceReason: 'Comité conformado, aprobado y operando.',
          percentage: 100,
          metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
          missingCriteria: [],
          approvalStatus: 'APPROVED_AND_SIGNED',
        }),
        period: PERIOD_COMPLIES,
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.convivencia.complianceStatus, 'COMPLIES');
    assert.equal(context.convivencia.percentage, 100);
    assert.deepEqual(context.convivencia.missingCriteria, []);
    assert.equal(context.convivencia.approvalStatus, 'APPROVED_AND_SIGNED');
  });

  it('AI4 — estado PENDING: el contexto refleja PENDING y el porcentaje real del snapshot', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: { snapshot: buildSnapshot(), period: PERIOD_COMPLIES },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.convivencia.complianceStatus, 'PENDING');
    assert.equal(context.convivencia.percentage, 50);
    assert.deepEqual(context.convivencia.missingCriteria, ['Comité aprobado', 'Reuniones realizadas']);
    // Coherencia: el porcentaje viene del snapshot (nunca recalculado por la IA).
    assert.notEqual(context.convivencia.percentage, 100);
  });

  it('AI5 — estado NON_COMPLIANT: el contexto refleja NON_COMPLIANT y 0%', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: {
        snapshot: buildSnapshot({
          complianceStatus: 'NON_COMPLIANT',
          complianceReason: 'Sin información funcional registrada.',
          percentage: 0,
          metCriteria: [],
          missingCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
        }),
        period: { ...PERIOD_COMPLIES, members: [], meetings: [] },
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.convivencia.complianceStatus, 'NON_COMPLIANT');
    assert.equal(context.convivencia.percentage, 0);
    assert.equal(context.convivencia.memberCount, 0);
    assert.equal(context.convivencia.completedMeetingCount, 0);
  });

  it('AI6 — exención: el contexto refleja exempt + COMPLIES + 100%', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: {
        snapshot: buildSnapshot({
          complianceStatus: 'COMPLIES',
          complianceReason: 'Empresa exenta de Comité de Convivencia Laboral.',
          percentage: 100,
          exempt: true,
          metCriteria: ['Empresa exenta'],
          missingCriteria: [],
        }),
        period: { ...PERIOD_COMPLIES, members: [], meetings: [] },
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.convivencia.exempt, true);
    assert.equal(context.convivencia.complianceStatus, 'COMPLIES');
    assert.equal(context.convivencia.percentage, 100);
    assert.equal(context.convivencia.memberCount, 0);
  });

  it('AI7 — coherencia real: el contexto replica exactamente el snapshot del dominio (sin recalcular)', async () => {
    // El periodo en bruto sugiere condiciones completas, pero el snapshot del
    // dominio (fuente de verdad) dice PENDING 50: la IA NO debe recalcular.
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: { snapshot: buildSnapshot(), period: PERIOD_COMPLIES },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    // Aunque members+meeting CERRADA estén presentes, el estado y porcentaje
    // son EXACTAMENTE los del snapshot (PENDING 50), no un recálculo.
    assert.equal(context.convivencia.complianceStatus, 'PENDING');
    assert.equal(context.convivencia.percentage, 50);
    assert.equal(context.convivencia.memberCount, 1);
    assert.equal(context.convivencia.completedMeetingCount, 1);
    assert.deepEqual(context.convivencia.missingCriteria, ['Comité aprobado', 'Reuniones realizadas']);
  });

  it('AI8 — multi-tenancy: cada empresa solo ve su propio periodo de convivencia', async () => {
    const companyA = COMPANY_ID;
    const companyB = '64b0000000000000000000ff';
    const convivenciaService = {
      getComplianceSnapshot: async (companyId: { toString(): string }) => {
        if (companyId.toString() === companyA) {
          return buildSnapshot({ complianceStatus: 'COMPLIES', percentage: 100 });
        }
        if (companyId.toString() === companyB) {
          return buildSnapshot({ complianceStatus: 'PENDING', percentage: 25, complianceReason: 'Periodo B pendiente' });
        }
        throw noPeriodError();
      },
      findCurrent: async (companyId: { toString(): string }) => {
        if (companyId.toString() === companyA) {
          return { ...PERIOD_COMPLIES, periodName: 'Comité A' };
        }
        if (companyId.toString() === companyB) {
          return { ...PERIOD_COMPLIES, periodName: 'Comité B', members: [] };
        }
        throw noPeriodError();
      },
    } as unknown as ConvivenciaService;
    const companyModel = {
      findById: () => ({ exec: async () => ({ _id: COMPANY_ID, name: 'Empresa', standardsType: '60' }) }),
    } as unknown as Model<CompanyDocument>;
    const service = new AiContextService(
      companyModel,
      { getOverview: async () => null } as unknown as ComplianceEngineService,
      { analyzeCompanyPHVA: async () => null } as unknown as PhvaAnalysisService,
      { findAll: async () => [] } as unknown as DocumentMasterService,
      { findCurrent: async () => null, getActivities: async () => [] } as unknown as AnnualWorkPlanService,
      { findByCompany: async () => null, calculateCoverage: async () => DEFAULT_COVERAGE, isSessionExecuted: stubIsSessionExecuted } as unknown as PhvaAdvancedCopasstTrainingService,
      convivenciaService,
      { findCurrent: async () => null } as unknown as InitialEvaluationService,
      { getCompanyStats: async () => null } as unknown as DashboardService,
      { findAll: async () => [] } as unknown as IncidentsService,
      {
        getCompanyStats: async () => ({ totalDiasPerdidos: 0, totalCasos: 0, promedioDias: 0 }),
        findAllByCompany: async () => [],
      } as unknown as AbsenteeismService,
      { findAll: async () => [] } as unknown as TrainingsService,
      { findAll: async () => [] } as unknown as InspectionsService,
    );

    const contextA = await service.buildCompanyContext(companyA);
    const contextB = await service.buildCompanyContext(companyB);
    const contextC = await service.buildCompanyContext('64b0000000000000000000aa');

    // A → solo información de A.
    assert.equal(contextA.convivencia.available, true);
    assert.equal(contextA.convivencia.periodStatus, 'ACTIVO');
    assert.equal(contextA.convivencia.complianceStatus, 'COMPLIES');
    // B → solo información de B.
    assert.equal(contextB.convivencia.available, true);
    assert.equal(contextB.convivencia.complianceStatus, 'PENDING');
    assert.equal(contextB.convivencia.complianceReason, 'Periodo B pendiente');
    // Empresa sin periodo → available: false, sin fuga ni error.
    assert.equal(contextC.convivencia.available, false);
    assert.equal(contextC.convivencia.complianceStatus, null);
  });

  it('AI9 — casos confidenciales: el contexto solo expone conteos agregados, nunca contenido', async () => {
    const periodWithCases = {
      ...PERIOD_COMPLIES,
      cases: [
        {
          caseNumber: 'CC-2026-0001',
          isAnonymous: false,
          complainantName: 'María Secreta',
          respondentName: 'Pedro Confidencial',
          description: 'Situación delicada de acoso laboral con detalles íntimos',
          evidence: ['evidencia-sensible.pdf'],
          status: 'PENDING',
        },
        {
          caseNumber: 'CC-2026-0002',
          isAnonymous: true,
          complainantName: 'Anónimo',
          respondentName: 'Otro Confidencial',
          description: 'Otro detalle reservado',
          evidence: [],
          status: 'CLOSED',
        },
      ],
    };
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: { snapshot: buildSnapshot(), period: periodWithCases },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);
    const serialized = JSON.stringify(context.convivencia);

    // Solo conteos: total 2, abiertos 1, cerrados 1.
    assert.deepEqual(context.convivencia.cases, { total: 2, open: 1, closed: 1 });
    // Ningún contenido sensible del caso llega al contexto.
    assert.ok(!serialized.includes('María Secreta'));
    assert.ok(!serialized.includes('Pedro Confidencial'));
    assert.ok(!serialized.includes('acoso laboral'));
    assert.ok(!serialized.includes('evidencia-sensible.pdf'));
    assert.ok(!serialized.includes('CC-2026-0001'));
  });

  it('AI10 — límites: las listas de miembros y reuniones respetan el máximo del contexto (10)', async () => {
    const members = Array.from({ length: 14 }, (_, index) => ({
      userId: `64b0000000000000000000${String(index + 2).padStart(2, '0')}`,
      userName: `Miembro ${index + 1}`,
      committeeRole: 'PRINCIPAL',
      representationType: 'TRABAJADOR',
      status: 'ACTIVO',
    }));
    const meetings = Array.from({ length: 14 }, (_, index) => ({
      meetingDate: new Date(2026, 0, index + 1),
      status: index % 2 === 0 ? 'CERRADA' : 'PROGRAMADA',
    }));
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: {
        snapshot: buildSnapshot(),
        period: { ...PERIOD_COMPLIES, members, meetings },
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    // Conteos globales reales, listas limitadas a 10.
    assert.equal(context.convivencia.memberCount, 14);
    assert.equal(context.convivencia.meetingCount, 14);
    assert.equal(context.convivencia.completedMeetingCount, 7);
    assert.equal(context.convivencia.members.length, 10);
    assert.equal(context.convivencia.meetings.length, 10);
  });

  it('AI11 — sin URLs privadas: el contexto no expone fileUrl, secureToken, OTP ni storage', async () => {
    const periodWithSecrets = {
      ...PERIOD_COMPLIES,
      evidence: [{ type: 'PDF', title: 'Acta', fileName: 'acta.pdf', fileUrl: 'https://storage.example.com/acta.pdf' }],
      registrationCampaign: { secureToken: 'TOKEN-SECRETO-ABC', isActive: true },
      members: [
        {
          userId: '64b000000000000000000002',
          userName: 'Ana López',
          committeeRole: 'PRESIDENTE',
          representationType: 'EMPLEADOR',
          status: 'ACTIVO',
          phone: '3001234567',
        },
      ],
      meetings: [
        { meetingDate: new Date('2026-01-10'), status: 'CERRADA', minutesPdfUrl: 'https://storage.example.com/acta-min.pdf' },
      ],
    };
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: {
        snapshot: buildSnapshot({ evidenceCount: 1 }),
        period: periodWithSecrets,
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);
    const serialized = JSON.stringify(context.convivencia);

    // Conteo de evidencias sí (agregado), pero ninguna URL/token/OTP/PII.
    assert.equal(context.convivencia.evidenceCount, 1);
    assert.ok(!serialized.includes('https://'));
    assert.ok(!serialized.includes('secureToken'));
    assert.ok(!serialized.includes('TOKEN-SECRETO'));
    assert.ok(!serialized.includes('otp'));
    assert.ok(!serialized.includes('3001234567'));
    assert.ok(!serialized.includes('acta.pdf'));
    // Miembros solo con campos seguros.
    assert.deepEqual(Object.keys(context.convivencia.members[0]).sort(), ['committeeRole', 'name', 'representationType', 'status', 'userId']);
  });

  it('AI14 — no segunda fuente: el contexto consume el snapshot sin reimplementar la regla de compliance', async () => {
    // El periodo en bruto cumple todas las condiciones (activo, aprobado,
    // miembros, reunión CERRADA), pero el snapshot dice NON_COMPLIANT 0:
    // la IA debe replicar el snapshot tal cual (fuente de verdad), nunca
    // recomputar un estado propio.
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      convivencia: {
        snapshot: buildSnapshot({
          complianceStatus: 'NON_COMPLIANT',
          complianceReason: 'Sin información funcional registrada.',
          percentage: 0,
          metCriteria: [],
          missingCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
        }),
        period: {
          ...PERIOD_COMPLIES,
          approvalStatus: 'APPROVED_AND_SIGNED',
          members: [{ userId: '64b000000000000000000002', userName: 'Ana López', committeeRole: 'PRESIDENTE', representationType: 'EMPLEADOR', status: 'ACTIVO' }],
          meetings: [{ meetingDate: new Date('2026-01-10'), status: 'CERRADA' }],
        },
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.convivencia.complianceStatus, 'NON_COMPLIANT');
    assert.equal(context.convivencia.percentage, 0);
    assert.deepEqual(context.convivencia.metCriteria, []);
    // Los conteos reales sí se reflejan (son datos del periodo, no cumplimiento).
    assert.equal(context.convivencia.memberCount, 1);
    assert.equal(context.convivencia.completedMeetingCount, 1);
  });

  // ═════════════════════════════════════════════
  // AUDIT-5 — CONTEXT-AUDIT5
  // Dominios operativos: initialEvaluation, indicators, incidents,
  // absenteeism, programs, audits (datos REALES del tenant, agregados sin PII).
  // ═════════════════════════════════════════════
  it('CONTEXT-AUDIT5-01 — autoevaluación: agregados reales (status, cumplimiento, estándares, hallazgos, acciones)', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' },
      initialEvaluation: {
        status: 'COMPLETED',
        overallCompliance: 72,
        standards: [
          { status: StandardEvaluationStatus.COMPLIES },
          { status: StandardEvaluationStatus.DOES_NOT_COMPLY },
          { status: StandardEvaluationStatus.COMPLIES },
        ],
        findings: [{ id: 'f1' }, { id: 'f2' }],
        actionPlan: [{ id: 'a1' }],
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.initialEvaluation.available, true);
    assert.equal(context.initialEvaluation.status, 'COMPLETED');
    assert.equal(context.initialEvaluation.overallCompliance, 72);
    assert.equal(context.initialEvaluation.totalStandards, 3);
    assert.equal(context.initialEvaluation.compliant, 2);
    assert.equal(context.initialEvaluation.nonCompliant, 1);
    assert.equal(context.initialEvaluation.findings, 2);
    assert.equal(context.initialEvaluation.actionItems, 1);
  });

  it('CONTEXT-AUDIT5-02 — indicadores: agregados reales del dashboard', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      indicators: { employees: 42, incidents: 3, trainings: 8, compliance: 81, highRisks: 2 },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.indicators.employees, 42);
    assert.equal(context.indicators.incidents, 3);
    assert.equal(context.indicators.trainings, 8);
    assert.equal(context.indicators.compliance, 81);
    assert.equal(context.indicators.highRisks, 2);
  });

  it('CONTEXT-AUDIT5-03 — accidentalidad: agregados sin PII (nunca employeeId ni descripción)', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      incidents: [
        { type: 'Leve', severity: 'Baja', status: 'Abierto', date: new Date('2026-08-01') },
        { type: 'Grave', severity: 'Alta', status: 'Abierto', date: new Date('2026-08-05') },
        { type: 'Leve', severity: 'Baja', status: 'Cerrado', date: new Date('2026-07-01') },
      ],
    });

    const context = await service.buildCompanyContext(COMPANY_ID);
    const serialized = JSON.stringify(context.incidents);

    assert.equal(context.incidents.total, 3);
    assert.equal(context.incidents.open, 2);
    assert.deepEqual(context.incidents.severitySummary, [
      { severity: 'Baja', count: 2 },
      { severity: 'Alta', count: 1 },
    ]);
    assert.equal(context.incidents.recent.length, 3);
    assert.ok(!serialized.includes('employeeId'));
    assert.ok(!serialized.includes('descripcion'));
  });

  it('CONTEXT-AUDIT5-04 — ausentismo: agregados reales (días, casos, causas) sin PII', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      absenteeism: {
        stats: { totalDiasPerdidos: 15, totalCasos: 4, promedioDias: 3.75 },
        records: [
          { tipo: 'Enfermedad general', fechaInicio: new Date('2026-08-01'), dias: 5 },
          { tipo: 'Accidente laboral', fechaInicio: new Date('2026-08-02'), dias: 10 },
        ],
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);
    const serialized = JSON.stringify(context.absenteeism);

    assert.equal(context.absenteeism.total, 4);
    assert.equal(context.absenteeism.totalDaysLost, 15);
    assert.equal(context.absenteeism.averageDays, 3.75);
    assert.deepEqual(context.absenteeism.causes, [
      { type: 'Enfermedad general', count: 1 },
      { type: 'Accidente laboral', count: 1 },
    ]);
    assert.ok(!serialized.includes('userId'));
    assert.ok(!serialized.includes('soporte'));
  });

  it('CONTEXT-AUDIT5-05 — programas: conteos y temas sin instructores ni listas de asistencia', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' },
      programs: [
        { topic: 'Trabajo en alturas', date: new Date('2026-08-01') },
        {
          topic: 'Primeros auxilios',
          date: new Date('2026-08-10'),
          attendanceControl: { initialListUrl: 'https://x/lista' },
        },
        { topic: 'Manejo de extintores' },
      ],
    });

    const context = await service.buildCompanyContext(COMPANY_ID);
    const serialized = JSON.stringify(context.programs);

    assert.equal(context.programs.total, 3);
    assert.equal(context.programs.withAttendanceControl, 1);
    assert.equal(context.programs.recent.length, 3);
    assert.ok(!serialized.includes('instructor'));
    assert.ok(!serialized.includes('initialListUrl'));
  });

  it('CONTEXT-AUDIT5-06 — auditorías: títulos y estados sin responsables ni notas', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      audits: [
        { title: 'Auditoría interna', status: 'pendiente', plannedDate: new Date('2026-09-01') },
        {
          title: 'Inspección instalaciones',
          status: 'completada',
          plannedDate: new Date('2026-07-01'),
          completedDate: new Date('2026-07-15'),
        },
      ],
    });

    const context = await service.buildCompanyContext(COMPANY_ID);
    const serialized = JSON.stringify(context.audits);

    assert.equal(context.audits.total, 2);
    assert.equal(context.audits.pending, 1);
    assert.equal(context.audits.completed, 1);
    assert.equal(context.audits.recent.length, 2);
    assert.ok(!serialized.includes('responsable'));
  });

  it('CONTEXT-AUDIT5-07 — dominios sin datos: resumen vacío consistente (no rompe el contexto)', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Nueva', standardsType: '7' },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.deepEqual(context.initialEvaluation, {
      available: false,
      status: null,
      overallCompliance: 0,
      totalStandards: 0,
      evaluated: 0,
      compliant: 0,
      nonCompliant: 0,
      findings: 0,
      actionItems: 0,
    });
    assert.deepEqual(context.indicators, {
      employees: 0,
      incidents: 0,
      trainings: 0,
      compliance: 0,
      highRisks: 0,
    });
    assert.equal(context.incidents.total, 0);
    assert.deepEqual(context.incidents.recent, []);
    assert.deepEqual(context.absenteeism, {
      total: 0,
      totalDaysLost: 0,
      averageDays: 0,
      causes: [],
      recent: [],
    });
    assert.equal(context.programs.total, 0);
    assert.equal(context.audits.total, 0);
  });

  it('CONTEXT-AUDIT5-08 — un módulo caído (excepción) no rompe el contexto: sección con valores por defecto', async () => {
    // incidentes lanza → el safe getter lo tolera con []. Los demás dominios
    // siguen funcionando con sus datos reales.
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' },
      incidents: [] as unknown[],
      programs: [{ topic: 'Curso', date: new Date('2026-08-01') }],
    });
    // Fuerza el fallo del módulo de incidentes sobrescribiendo el stub.
    (service as unknown as { incidentsService: { findAll: () => Promise<never> } }).incidentsService.findAll =
      async () => {
        throw new Error('módulo caído');
      };

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.incidents.total, 0);
    assert.deepEqual(context.incidents.recent, []);
    // El resto del contexto sigue intacto.
    assert.equal(context.programs.total, 1);
    assert.equal(context.company.name, 'Empresa Demo');
  });

  it('TENANT-AUDIT5-04 — cada provider recibe el companyId autorizado (nunca uno del DTO/body/header)', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa A', standardsType: '21' },
      initialEvaluation: { status: 'COMPLETED', overallCompliance: 50, standards: [], findings: [], actionPlan: [] },
      indicators: { employees: 1, incidents: 0, trainings: 0, compliance: 50, highRisks: 0 },
      incidents: [],
      absenteeism: { stats: { totalDiasPerdidos: 0, totalCasos: 0, promedioDias: 0 }, records: [] },
      programs: [],
      audits: [],
    });

    await service.buildCompanyContext(COMPANY_ID);

    const calls = (service as unknown as {
      __audit5Calls: Array<{ provider: string; companyId: string }>;
    }).__audit5Calls;
    assert.ok(calls.length > 0);
    const providers = ['initialEvaluation', 'indicators', 'incidents', 'absenteeism.stats', 'absenteeism.records', 'programs', 'audits'];
    const seen = new Set(calls.map((call) => call.provider));
    for (const provider of providers) {
      assert.ok(seen.has(provider), `provider ${provider} debe ser consultado`);
    }
    // TODAS las llamadas usan el companyId autorizado (COMPANY_ID).
    for (const call of calls) {
      assert.equal(call.companyId, COMPANY_ID, `${call.provider} debe recibir el companyId autorizado`);
    }
  });

  it('PRIVACY-AUDIT5-01 — el contexto extendido no expone secretos, tokens, OTP ni PII (otp/password/token/phone)', async () => {
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '60' },
      initialEvaluation: {
        status: 'COMPLETED',
        overallCompliance: 70,
        standards: [{ status: StandardEvaluationStatus.COMPLIES }],
        findings: [{ secret: 'HALLAZGO-CONFIDENCIAL' }],
        actionPlan: [{ secret: 'ACCION-CONFIDENCIAL' }],
      },
      indicators: { employees: 5, incidents: 1, trainings: 1, compliance: 70, highRisks: 0 },
      incidents: [
        {
          type: 'Leve',
          severity: 'Baja',
          status: 'Abierto',
          employeeId: 'EMP-SECRETO',
          description: 'DESCRIPCION-SENSIBLE',
          phone: '3001234567',
        },
      ],
      absenteeism: {
        stats: { totalDiasPerdidos: 2, totalCasos: 1, promedioDias: 2 },
        records: [{ tipo: 'Enfermedad', fechaInicio: new Date('2026-08-01'), dias: 2, userId: 'USR-SECRETO', soporte: 'SOPORTE-SENSIBLE' }],
      },
      programs: [
        { topic: 'Curso', instructor: 'INSTRUCTOR-SECRETO', attendanceControl: { finalListUrl: 'https://x/lista' } },
      ],
      audits: [{ title: 'Auditoría', status: 'pendiente', responsable: 'RESPONSABLE-SECRETO', notes: 'NOTA-SENSIBLE' }],
    });

    const context = await service.buildCompanyContext(COMPANY_ID);
    const serialized = JSON.stringify(context);

    // Sin secretos, tokens, OTP, teléfonos ni PII en NINGÚN dominio.
    assert.ok(!serialized.includes('SECRETO'));
    assert.ok(!serialized.includes('SENSIBLE'));
    assert.ok(!serialized.includes('otp'));
    assert.ok(!serialized.includes('password'));
    assert.ok(!serialized.includes('token'));
    assert.ok(!serialized.includes('3001234567'));
    assert.ok(!serialized.includes('https://'));
    assert.ok(!serialized.includes('USR-'));
  });

  it('REGRESSION-AUDIT5-01 — los dominios originales del contexto (compliance, phva, documentos, actividades, copasst, convivencia) siguen funcionando con datos reales', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const service = buildService({
      company: { _id: COMPANY_ID, name: 'Empresa Demo', standardsType: '21' },
      overview: { overallCompliance: 80, findings: [{ title: 'F1' }], recommendations: [{ title: 'R1' }] },
      phva: { overall: 80, planear: { percentage: 70, pending: [] }, hacer: { percentage: 80, pending: [] }, verificar: { percentage: 90, pending: [] }, actuar: { percentage: 60, pending: [] } },
      documents: [{ name: 'Política', status: DocumentStatus.ACTIVE, expirationDate: future }],
      activities: [{ title: 'A1', status: ActivityStatus.PENDING }],
      copasstTraining: {
        record: { itemCode: '1.1.7', year: 2026, complianceStatus: 'COMPLIES', sessions: [], memberCoverage: [], evaluationAttempts: [], evidences: [] },
        coverage: { totalMembers: 1, trainedMembers: 1, coveragePercentage: 100, executedSessions: 1 },
      },
      convivencia: {
        snapshot: buildSnapshot({ complianceStatus: 'COMPLIES', percentage: 100 }),
        period: PERIOD_COMPLIES,
      },
    });

    const context = await service.buildCompanyContext(COMPANY_ID);

    assert.equal(context.compliance.overallCompliance, 80);
    assert.equal(context.phva.overall, 80);
    assert.equal(context.documents.total, 1);
    assert.equal(context.activities.total, 1);
    assert.equal(context.copasstTraining.complianceStatus, 'COMPLIES');
    assert.equal(context.convivencia.complianceStatus, 'COMPLIES');
  });
});
