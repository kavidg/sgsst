import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model } from 'mongoose';
import { NotFoundException } from '@nestjs/common';

import { ActivityStatus } from '../../annual-work-plan/schemas/plan-activity.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { Company, CompanyDocument } from '../../companies/schemas/company.schema';
import { ComplianceEngineService } from '../../compliance-engine/compliance-engine.service';
import { ConvivenciaService } from '../../convivencia/convivencia.service';
import { DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { PhvaAnalysisService } from '../../phva/phva-analysis.service';
import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
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
}): AiContextService {
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

  return new AiContextService(
    companyModel,
    complianceEngineService,
    phvaAnalysisService,
    documentMasterService,
    annualWorkPlanService,
    copasstTrainingService,
    convivenciaService,
  );
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
});
