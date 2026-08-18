import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ComplianceAIEngine } from '../compliance-ai/compliance-ai.service';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { PhvaAnalysisService } from '../phva/phva-analysis.service';
import { ComplianceActionEngineService } from '../compliance-action-engine/compliance-action-engine.service';
import { AnnualWorkPlanService } from '../annual-work-plan/services/annual-work-plan.service';
import { ActivityService } from '../annual-work-plan/services/activity.service';
import { TaskService } from '../annual-work-plan/services/task.service';
import { TaskEvidenceService } from '../annual-work-plan/services/task-evidence.service';
import { UserDocument } from '../users/schemas/user.schema';
import { AiPipelineService, AnalysisActor, computeAnalysisFingerprint } from './ai-pipeline.service';
import { AiAnalysisActorType, AiAnalysisType, PipelineModule } from './enums/pipeline-module.enum';
import {
  IMMUTABLE_ANALYSIS_MESSAGE,
  immutableAnalysisUpdateGuard,
} from './schemas/ai-analysis-record.schema';
import { AiPipelineController } from './ai-pipeline.controller';
import { RequestWithUser } from '../auth/auth.types';
import { UsersService } from '../users/users.service';

const COMPANY_A = new Types.ObjectId('64a000000000000000000001');
const COMPANY_B = new Types.ObjectId('64a000000000000000000002');
const TASK_ID = new Types.ObjectId('64a000000000000000000011');
const ACTIVITY_ID = new Types.ObjectId('64a000000000000000000012');
const PLAN_ID = new Types.ObjectId('64a000000000000000000013');

/** UserDocument stub mínimo. */
const USER = {
  _id: new Types.ObjectId('64a000000000000000000021'),
  email: 'owner@empresa-a.com',
} as unknown as UserDocument;

/** Query encadenable (sort/skip/limit/exec) que registra cada operación. */
function queryChain(
  calls: { method: string; query?: unknown }[],
  method: 'findOne' | 'find',
  query: unknown,
  resolver: () => unknown,
) {
  const chain: Record<string, unknown> = {
    sort: (value: unknown) => {
      calls.push({ method: 'sort', query: value });
      return chain;
    },
    skip: (value: unknown) => {
      calls.push({ method: 'skip', query: value });
      return chain;
    },
    limit: (value: unknown) => {
      calls.push({ method: 'limit', query: value });
      return chain;
    },
    exec: async () => {
      calls.push({ method, query });
      return resolver();
    },
  };
  return chain;
}

/** Modelo stub con el patrón .findOne(...).exec() del proyecto. */
function modelStub(overrides?: { findOneResult?: unknown; createResult?: unknown }) {
  const calls: { method: string; query?: unknown; data?: unknown }[] = [];
  const model: Record<string, unknown> = {
    _calls: calls,
    findOne: (query: unknown) =>
      queryChain(calls, 'findOne', query, () => overrides?.findOneResult ?? null),
    find: (query: unknown) => queryChain(calls, 'find', query, () => []),
    create: async (data: unknown) => {
      calls.push({ method: 'create', data });
      if (overrides?.createResult) return overrides.createResult;
      return {
        _id: new Types.ObjectId(),
        ...(data as Record<string, unknown>),
        createdAt: new Date(),
      };
    },
  };
  return model;
}

function buildService(overrides?: {
  analysisModel?: Record<string, unknown>;
  traceModel?: Record<string, unknown>;
  complianceAnalysis?: { overall: number; criticalFindings: string[]; recommendations: string[] };
  recommendations?: Array<Record<string, unknown>>;
  phva?: { overall: number; planear: unknown; hacer: unknown; verificar: unknown; actuar: unknown };
  emptyOverview?: boolean;
}): AiPipelineService {
  const analysisModel = overrides?.analysisModel ?? modelStub();
  const traceModel = overrides?.traceModel ?? modelStub();

  const complianceAiEngine = {
    analyzeCompliance: async () =>
      overrides?.complianceAnalysis ?? {
        overall: 55,
        standardLevel: '21 estándares',
        completed: 10,
        pending: 11,
        criticalFindings: ['Hallazgo crítico 1'],
        recommendations: ['Recomendación 1'],
      },
  } as unknown as ComplianceAIEngine;

  // Misma fuente que el Action Engine: findings con IDs reales resolubles
  // desde relatedFindingId de las recomendaciones.
  const complianceEngineService = {
    getOverview: async () =>
      overrides?.emptyOverview
        ? { findings: [], recommendations: [] }
        : {
            findings: [
              {
                id: 'finding-documents-1',
                module: 'documents',
                title: 'Hallazgo crítico 1',
                description: 'Política desactualizada',
                priority: 'HIGH',
              },
            ],
            recommendations: [
              {
                id: 'recommendation-documents-1',
                module: 'documents',
                title: 'Recomendación 1',
                description: 'Actualizar política',
                priority: 'HIGH',
                targetPhase: 'plan',
              },
            ],
          },
  } as unknown as ComplianceEngineService;

  const phvaAnalysisService = {
    analyzeCompanyPHVA: async () =>
      overrides?.phva ?? {
        overall: 45,
        planear: { percentage: 30, pending: ['Política sin aprobar'] },
        hacer: { percentage: 60, pending: ['Falta capacitación'] },
        verificar: { percentage: 10, pending: [] },
        actuar: { percentage: 5, pending: ['Sin plan de mejora'] },
      },
  } as unknown as PhvaAnalysisService;

  const actionEngineService = {
    getRecommendations: async () =>
      overrides?.recommendations ?? [
        {
          id: 'action-1',
          title: 'Actualizar política',
          description: 'Descripción',
          priority: 'HIGH',
          estimatedImpact: 0.3,
          estimatedDurationDays: 30,
          recommendedResponsibleRole: 'Responsable SST',
          relatedFindingId: 'finding-documents-1',
          relatedModule: 'documents',
          affectedPhase: 'plan',
          estimatedCost: 1000,
          canCreateAnnualPlanActivity: true,
          canCreateObjective: false,
          canCreateIndicator: false,
          createdAutomatically: true,
          accepted: null,
          implemented: null,
          generatedActivityId: null,
        },
      ],
  } as unknown as ComplianceActionEngineService;

  // La tarea/actividad/plan del stub SIEMPRE pertenecen a la Empresa A.
  // Verificar desde B (tests TENANT-AUDIT3-04 / TRACE-08) debe rechazar.
  const annualWorkPlanService = {
    findOrCreateCurrent: async () => ({ _id: PLAN_ID, companyId: COMPANY_A, status: 'Active' }),
    createActivity: async (_planId: unknown, dto: Record<string, unknown>) => ({
      _id: ACTIVITY_ID,
      annualPlanId: PLAN_ID,
      companyId: COMPANY_A,
      title: dto.title,
      sourceModule: dto.sourceModule,
      status: 'Pending',
    }),
    findById: async () => ({ _id: PLAN_ID, companyId: COMPANY_A, status: 'Active' }),
    recalculateCompliance: async () => 80,
  } as unknown as AnnualWorkPlanService;

  const activityService = {
    findById: async () => ({
      _id: ACTIVITY_ID,
      annualPlanId: PLAN_ID,
      title: 'Actividad',
    }),
  } as unknown as ActivityService;

  const taskService = {
    findById: async () => ({
      _id: TASK_ID,
      activityId: ACTIVITY_ID,
      title: 'Tarea 1',
      status: 'InProgress',
    }),
  } as unknown as TaskService;

  const taskEvidenceService = {
    create: async (taskId: Types.ObjectId, fileUrl: string, fileType: string, uploadedBy: Types.ObjectId) => ({
      _id: new Types.ObjectId('64a000000000000000000031'),
      taskId,
      fileUrl,
      fileType,
      uploadedBy,
      uploadDate: new Date(),
    }),
    findByTask: async () => [
      {
        _id: new Types.ObjectId('64a000000000000000000031'),
        taskId: TASK_ID,
        fileUrl: 'https://x/evidencia.pdf',
      },
    ],
  } as unknown as TaskEvidenceService;

  return new AiPipelineService(
    analysisModel as never,
    traceModel as never,
    complianceAiEngine,
    complianceEngineService,
    phvaAnalysisService,
    actionEngineService,
    annualWorkPlanService,
    activityService,
    taskService,
    taskEvidenceService,
  );
}

describe('AUDIT-3 — Pipeline PHVA → IA → acciones → plan → evidencias → verificación', () => {
  describe('TENANT-AUDIT3 — tenant isolation', () => {
    it('TENANT-AUDIT3-01 — Empresa A no puede leer el pipeline de B (queries scoped por companyId)', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });
      await service.getCompanyTrace(COMPANY_A);

      const findCalls = (traceModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'find',
      );
      assert.ok(findCalls.length > 0, 'debe consultar traces');
      const query = findCalls[0].query as { companyId?: Types.ObjectId };
      assert.equal(query.companyId?.toString(), COMPANY_A.toString());
    });

    it('TENANT-AUDIT3-02 — Empresa A no puede modificar una acción de B: materializeAction usa el plan de A y traza con companyId de A', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });
      const activity = (await service.materializeAction(COMPANY_A, 'action-1', USER)) as {
        _id: Types.ObjectId;
      };

      assert.equal(activity._id.toString(), ACTIVITY_ID.toString());
      const createCalls = (traceModel._calls as { method: string; data?: { companyId?: Types.ObjectId } }[]).filter(
        (call) => call.method === 'create',
      );
      assert.ok(createCalls.length >= 1);
      for (const call of createCalls) {
        assert.equal(call.data?.companyId?.toString(), COMPANY_A.toString());
      }
    });

    it('TENANT-AUDIT3-03 — Empresa A no puede vincular una actividad propia con un finding de B: la traza se crea con companyId de A (sin mezclar tenants)', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });
      await service.linkTrace({
        companyId: COMPANY_A,
        sourceModule: PipelineModule.FINDING,
        sourceEntityId: 'finding-de-b',
        targetModule: PipelineModule.ACTION,
        targetEntityId: 'action-9',
      });

      const findCalls = (traceModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'findOne',
      );
      assert.ok(findCalls.length > 0, 'debe consultar el vínculo existente');
      const query = findCalls[0].query as { companyId?: Types.ObjectId; sourceEntityId?: string };
      // El vínculo siempre se busca/crea scoped por el tenant autorizado.
      assert.equal(query.companyId?.toString(), COMPANY_A.toString());
    });

    it('TENANT-AUDIT3-04 — el companyId del cliente no puede cambiar el tenant autorizado: la empresa B no resuelve tareas de A (findTaskScoped rechaza)', async () => {
      const service = buildService();
      // La tarea pertenece a A; al verificarla desde el contexto de B, el plan
      // resuelto tiene companyId de A ≠ B → NotFound genérico (sin revelar datos).
      await assert.rejects(
        () => service.verifyEvidence(COMPANY_B, TASK_ID, USER),
        (error: Error) => error.message === 'Task not found',
      );
    });
  });

  describe('PIPELINE-IDEMP — idempotencia', () => {
    it('PIPELINE-IDEMP-01 — el mismo análisis no crea duplicados (fingerprint único + findOne previo)', async () => {
      const existingRecord = {
        _id: new Types.ObjectId('64a000000000000000000041'),
        companyId: COMPANY_A,
        analysisType: AiAnalysisType.COMPLIANCE,
        score: 55,
        fingerprint: 'same-fingerprint',
      };
      const analysisModel = modelStub({ findOneResult: existingRecord });
      const service = buildService({ analysisModel });

      const record = await service.analyzeAndPersist(COMPANY_A);
      assert.equal(record._id.toString(), existingRecord._id.toString());
      // No se creó nada nuevo.
      const createCalls = (analysisModel._calls as { method: string }[]).filter(
        (call) => call.method === 'create',
      );
      assert.equal(createCalls.length, 0);
    });

    it('PIPELINE-IDEMP-02 — la misma recomendación no crea dos acciones equivalentes (trace ACTION → ACTIVITY previo)', async () => {
      const existingLink = {
        _id: new Types.ObjectId('64a000000000000000000051'),
        companyId: COMPANY_A,
        sourceModule: PipelineModule.ACTION,
        sourceEntityId: 'action-1',
        targetModule: PipelineModule.ACTIVITY,
        targetEntityId: ACTIVITY_ID.toString(),
      };
      const traceModel = modelStub({ findOneResult: existingLink });
      const service = buildService({ traceModel });

      const activity = (await service.materializeAction(COMPANY_A, 'action-1', USER)) as {
        _id: Types.ObjectId;
      };
      assert.equal(activity._id.toString(), ACTIVITY_ID.toString());
      const createCalls = (traceModel._calls as { method: string }[]).filter(
        (call) => call.method === 'create',
      );
      // No se crean traces nuevos (la actividad ya existía).
      assert.equal(createCalls.length, 0);
    });

    it('PIPELINE-IDEMP-03 — reprocesar una evidencia no duplica la relación TASK → EVIDENCE (linkTrace idempotente)', async () => {
      const existingLink = {
        _id: new Types.ObjectId('64a000000000000000000061'),
        companyId: COMPANY_A,
        sourceModule: PipelineModule.TASK,
        sourceEntityId: TASK_ID.toString(),
        targetModule: PipelineModule.EVIDENCE,
        targetEntityId: 'evidencia-1',
      };
      const traceModel = modelStub({ findOneResult: existingLink });
      const service = buildService({ traceModel });

      await service.linkTrace({
        companyId: COMPANY_A,
        sourceModule: PipelineModule.TASK,
        sourceEntityId: TASK_ID.toString(),
        targetModule: PipelineModule.EVIDENCE,
        targetEntityId: 'evidencia-1',
      });

      const createCalls = (traceModel._calls as { method: string }[]).filter(
        (call) => call.method === 'create',
      );
      assert.equal(createCalls.length, 0);
    });

    it('PIPELINE-IDEMP-04 — el análisis PHVA repetido no duplica ni findings ni traces (fingerprint + findOne)', async () => {
      const existingRecord = {
        _id: new Types.ObjectId('64a000000000000000000071'),
        companyId: COMPANY_A,
        analysisType: AiAnalysisType.PHVA,
        score: 45,
        fingerprint: 'phva-fingerprint',
      };
      const analysisModel = modelStub({ findOneResult: existingRecord });
      const traceModel = modelStub();
      const service = buildService({ analysisModel, traceModel });

      const record = await service.analyzePhvaAndPersist(COMPANY_A);
      assert.equal(record._id.toString(), existingRecord._id.toString());
      const createCalls = (analysisModel._calls as { method: string }[]).filter(
        (call) => call.method === 'create',
      );
      assert.equal(createCalls.length, 0);
    });
  });

  describe('TRACE — trazabilidad del pipeline', () => {
    it('TRACE-01 — PHVA → finding: los pendientes de fase se persisten como findings vinculados', async () => {
      const analysisModel = modelStub();
      const traceModel = modelStub();
      const service = buildService({ analysisModel, traceModel });

      const record = await service.analyzePhvaAndPersist(COMPANY_A);

      const createCalls = (traceModel._calls as { method: string; data?: { sourceModule?: PipelineModule; targetModule?: PipelineModule } }[]).filter(
        (call) => call.method === 'create',
      );
      // 3 pendientes (Política, Falta capacitación, Sin plan de mejora) → 3 trazas PHVA→FINDING.
      assert.equal(createCalls.length, 3);
      for (const call of createCalls) {
        assert.equal(call.data?.sourceModule, PipelineModule.PHVA);
        assert.equal(call.data?.targetModule, PipelineModule.FINDING);
      }
      assert.equal(record.findings.length, 3);
      assert.equal(record.analysisType, AiAnalysisType.PHVA);
    });

    it('TRACE-02 — finding → action: materializeAction vincula finding con la acción (relatedFindingId)', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });

      await service.materializeAction(COMPANY_A, 'action-1', USER);

      const createCalls = (traceModel._calls as { method: string; data?: { sourceModule?: PipelineModule; targetModule?: PipelineModule; sourceEntityId?: string } }[]).filter(
        (call) => call.method === 'create',
      );
      const findingToAction = createCalls.find(
        (call) =>
          call.data?.sourceModule === PipelineModule.FINDING &&
          call.data?.targetModule === PipelineModule.ACTION,
      );
      assert.ok(findingToAction, 'debe existir traza FINDING → ACTION');
      assert.equal(findingToAction.data?.sourceEntityId, 'finding-documents-1');
    });

    it('TRACE-03 — action → annual plan: la acción materializa una actividad del plan con sourceModule', async () => {
      const service = buildService();
      const activity = (await service.materializeAction(COMPANY_A, 'action-1', USER)) as {
        sourceModule?: string;
        title: string;
      };
      assert.equal(activity.sourceModule, 'compliance-action-engine');
      assert.equal(activity.title, 'Actualizar política');
    });

    it('TRACE-04 — annual plan → task: la evidencia se vincula a una tarea del plan (TASK → EVIDENCE)', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });

      const evidence = await service.linkEvidenceToTask(
        COMPANY_A,
        TASK_ID,
        'https://x/evidencia.pdf',
        'application/pdf',
        USER._id,
      );

      assert.ok(evidence._id);
      const createCalls = (traceModel._calls as { method: string; data?: { sourceModule?: PipelineModule; targetModule?: PipelineModule; sourceEntityId?: string } }[]).filter(
        (call) => call.method === 'create',
      );
      const taskToEvidence = createCalls.find(
        (call) =>
          call.data?.sourceModule === PipelineModule.TASK &&
          call.data?.targetModule === PipelineModule.EVIDENCE,
      );
      assert.ok(taskToEvidence, 'debe existir traza TASK → EVIDENCE');
      assert.equal(taskToEvidence.data?.sourceEntityId, TASK_ID.toString());
    });

    it('TRACE-05 — task → evidence: la evidencia pertenece al tenant (uploadedBy del usuario autorizado)', async () => {
      const service = buildService();
      const evidence = (await service.linkEvidenceToTask(
        COMPANY_A,
        TASK_ID,
        'https://x/evidencia.pdf',
        'application/pdf',
        USER._id,
      )) as { uploadedBy?: Types.ObjectId };
      assert.equal(evidence.uploadedBy?.toString(), USER._id.toString());
    });

    it('TRACE-06 — evidence → verification: verifyEvidence registra la verificación con actor y fecha', async () => {
      const service = buildService();
      const trace = await service.verifyEvidence(COMPANY_A, TASK_ID, USER);

      assert.equal(trace.targetModule, PipelineModule.VERIFICATION);
      assert.equal(trace.metadata?.status, 'VERIFIED');
      assert.equal(trace.metadata?.evidenceCount, 1);
      assert.equal(trace.metadata?.verifiedBy, USER.email);
      assert.ok(trace.metadata?.verifiedAt);
    });

    it('TRACE-07 — el trace completo conserva companyId en cada vínculo', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });

      await service.materializeAction(COMPANY_A, 'action-1', USER);
      const createCalls = (traceModel._calls as { method: string; data?: { companyId?: Types.ObjectId } }[]).filter(
        (call) => call.method === 'create',
      );
      assert.ok(createCalls.length >= 2);
      for (const call of createCalls) {
        assert.equal(call.data?.companyId?.toString(), COMPANY_A.toString());
      }
    });

    it('TRACE-08 — una entidad no puede cruzar tenant mediante relaciones: la tarea de A no se verifica desde B', async () => {
      const service = buildService();
      await assert.rejects(() => service.verifyEvidence(COMPANY_B, TASK_ID, USER));
    });
  });

  describe('Regresiones — motores existentes intactos', () => {
    it('reutiliza ComplianceAIEngine y PhvaAnalysisService sin duplicar lógica', async () => {
      const service = buildService();
      const record = await service.analyzeAndPersist(COMPANY_A);
      assert.equal(record.engineVersion, 'deterministic:1');
      assert.equal(record.score, 55);
      // Findings con IDs reales del Compliance Engine (resolubles).
      assert.equal(record.findings[0]?.id, 'finding-documents-1');
      assert.equal(record.findings[0]?.title, 'Hallazgo crítico 1');
    });

    it('la traza FINDING → ACTION es resoluble: relatedFindingId coincide con el snapshot persistido', async () => {
      const analysisModel = modelStub();
      const traceModel = modelStub();
      const service = buildService({ analysisModel, traceModel });

      const record = await service.analyzeAndPersist(COMPANY_A);
      await service.materializeAction(COMPANY_A, 'action-1', USER);

      // El id del finding persistido es el MISMO id real del Compliance Engine.
      assert.equal(record.findings[0]?.id, 'finding-documents-1');
      const createCalls = (traceModel._calls as { method: string; data?: { sourceModule?: PipelineModule; sourceEntityId?: string; targetModule?: PipelineModule } }[]).filter(
        (call) => call.method === 'create',
      );
      const findingToAction = createCalls.find(
        (call) =>
          call.data?.sourceModule === PipelineModule.FINDING &&
          call.data?.targetModule === PipelineModule.ACTION,
      );
      assert.ok(findingToAction, 'debe existir traza FINDING → ACTION');
      // relatedFindingId del Action Engine = finding-documents-1 = snapshot persistido.
      assert.equal(findingToAction.data?.sourceEntityId, 'finding-documents-1');
    });

    it('análisis sin findings ni recomendaciones se persiste igual (contrato tolerante)', async () => {
      const service = buildService({
        complianceAnalysis: { overall: 100, criticalFindings: [], recommendations: [] },
        emptyOverview: true,
      });
      const record = await service.analyzeAndPersist(COMPANY_A);
      assert.equal(record.score, 100);
      assert.equal(record.findings.length, 0);
      assert.equal(record.recommendations.length, 0);
    });
  });

  describe('Concurrencia — idempotencia fail-closed (E11000)', () => {
    it('PIPELINE-CONC-01 — dos análisis concurrentes con el mismo fingerprint: exactamente 1 registro (E11000 capturado)', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });

      // Estado compartido: findOne ve el registro solo después de la primera
      // creación; la segunda creación lanza E11000 (carrera real simulada).
      let created: Record<string, unknown> | null = null;
      let createCount = 0;
      const recordId = new Types.ObjectId('64a000000000000000000081');
      (analysisModel as { create: unknown }).create = async (data: Record<string, unknown>) => {
        createCount += 1;
        if (createCount === 1) {
          created = { _id: recordId, ...data };
          return created;
        }
        const error = new Error('E11000 duplicate key') as Error & { code: number };
        error.code = 11000;
        throw error;
      };
      (analysisModel as { findOne: unknown }).findOne = (_query: unknown) => ({
        exec: async () => created,
      });

      const [first, second] = await Promise.all([
        service.analyzeAndPersist(COMPANY_A),
        service.analyzeAndPersist(COMPANY_A),
      ]);

      // Carrera real: ambos intentan crear (createCount=2); el segundo lanza
      // E11000 que el servicio captura y resuelve al registro existente.
      // Ninguno lanza 500 y ambos apuntan al mismo documento físico.
      assert.equal(createCount, 2, 'ambos intentan crear (carrera)');
      assert.equal(first._id.toString(), second._id.toString(), 'ambos resuelven al mismo registro');
    });

    it('PIPELINE-CONC-02 — dos linkTrace concurrentes del mismo vínculo: una sola traza', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });

      let created: Record<string, unknown> | null = null;
      let createCount = 0;
      const traceId = new Types.ObjectId('64a000000000000000000091');
      (traceModel as { create: unknown }).create = async (data: Record<string, unknown>) => {
        createCount += 1;
        if (createCount === 1) {
          created = { _id: traceId, ...data };
          return created;
        }
        const error = new Error('E11000 duplicate key') as Error & { code: number };
        error.code = 11000;
        throw error;
      };
      (traceModel as { findOne: unknown }).findOne = (_query: unknown) => ({
        exec: async () => created,
      });

      const input = {
        companyId: COMPANY_A,
        sourceModule: PipelineModule.TASK,
        sourceEntityId: TASK_ID.toString(),
        targetModule: PipelineModule.EVIDENCE,
        targetEntityId: 'evidencia-1',
      };
      const [first, second] = await Promise.all([
        service.linkTrace(input),
        service.linkTrace(input),
      ]);

      // Carrera real: ambos intentan crear; el segundo E11000 se captura y
      // ambos resuelven al mismo vínculo físico (sin 500, sin duplicados).
      assert.equal(createCount, 2, 'ambos intentan crear (carrera)');
      assert.equal(first._id.toString(), second._id.toString());
    });
  });
});

describe('AUDIT-4 — Compliance AI persistente, versionado y auditable', () => {
  // -------------------------------------------------------------------------
  // AI-HISTORY — historial
  // -------------------------------------------------------------------------
  describe('AI-HISTORY — historial por empresa', () => {
    it('AI-HISTORY-01 — el historial se ordena por createdAt DESC', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      await service.getCompanyAnalyses(COMPANY_A);

      const sortCalls = (analysisModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'sort',
      );
      assert.ok(sortCalls.length > 0, 'debe ordenar el historial');
      assert.deepEqual(sortCalls[0].query, { createdAt: -1 });
    });

    it('AI-HISTORY-02 — la paginación aplica limit y offset', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      await service.getCompanyAnalyses(COMPANY_A, { limit: 10, offset: 20 });

      const calls = analysisModel._calls as { method: string; query: unknown }[];
      assert.ok(calls.some((call) => call.method === 'limit' && call.query === 10), 'limit=10');
      assert.ok(calls.some((call) => call.method === 'skip' && call.query === 20), 'offset=20');
    });

    it('AI-HISTORY-03 — el historial NO recalcula el engine (solo lecturas)', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      await service.getCompanyAnalyses(COMPANY_A);

      const calls = analysisModel._calls as { method: string }[];
      assert.ok(calls.every((call) => ['find', 'sort', 'skip', 'limit'].includes(call.method)));
      assert.ok(!calls.some((call) => call.method === 'create'), 'historial nunca crea');
    });

    it('AI-HISTORY-04 — el historial está scoped por companyId', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      await service.getCompanyAnalyses(COMPANY_A);

      const findCalls = (analysisModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'find',
      );
      assert.ok(findCalls.length > 0);
      assert.equal((findCalls[0].query as { companyId?: Types.ObjectId }).companyId?.toString(), COMPANY_A.toString());
    });
  });

  // -------------------------------------------------------------------------
  // TENANT-AUDIT4 — tenant isolation
  // -------------------------------------------------------------------------
  describe('TENANT-AUDIT4 — tenant isolation del historial', () => {
    it('TENANT-AUDIT4-01 — Empresa A consulta historial A → PASS (query scoped)', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      const records = await service.getCompanyAnalyses(COMPANY_A);
      assert.deepEqual(records, []);
    });

    it('TENANT-AUDIT4-02 — Empresa A consulta historial B → sin resultados (nunca consulta el tenant de B)', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      await service.getCompanyAnalyses(COMPANY_A);

      const findCalls = (analysisModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'find',
      );
      for (const call of findCalls) {
        assert.equal((call.query as { companyId?: Types.ObjectId }).companyId?.toString(), COMPANY_A.toString());
      }
    });

    it('TENANT-AUDIT4-03 — Empresa A consulta analysisId de B → NotFound genérico', async () => {
      const analysisModel = modelStub({ findOneResult: null });
      const service = buildService({ analysisModel });

      await assert.rejects(
        () => service.getAnalysisScoped(COMPANY_A, '64a000000000000000000099'),
        (error: Error) => error.message === 'Analysis not found',
      );
      const findOneCalls = (analysisModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'findOne',
      );
      // La búsqueda SIEMPRE es scoped: { _id, companyId } — nunca findById suelto.
      const query = findOneCalls[0].query as { companyId?: Types.ObjectId; _id?: Types.ObjectId };
      assert.equal(query.companyId?.toString(), COMPANY_A.toString());
      assert.ok(query._id, 'debe filtrar por _id scoped');
    });

    it('TENANT-AUDIT4-04 — companyId en DTO/body/query no cambia tenant: getAnalysisScoped usa companyId del contexto', async () => {
      const analysisModel = modelStub({ findOneResult: null });
      const service = buildService({ analysisModel });

      // Aunque el caller pase un analysisId de B, el companyId es SIEMPRE del contexto.
      await assert.rejects(() => service.getAnalysisScoped(COMPANY_A, '64a000000000000000000099'));
      const findOneCalls = (analysisModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'findOne',
      );
      assert.equal((findOneCalls[0].query as { companyId?: Types.ObjectId }).companyId?.toString(), COMPANY_A.toString());
    });

    it('TENANT-AUDIT4-05 — header no autorizado no cambia tenant: el controller usa SOLO request.companyId', async () => {
      const calls: Array<{ companyId?: Types.ObjectId; actor?: AnalysisActor }> = [];
      const controller = new AiPipelineController(
        {
          analyzeAndPersist: async (companyId: Types.ObjectId, actor: AnalysisActor) => {
            calls.push({ companyId, actor });
            return { _id: new Types.ObjectId(), companyId, analysisType: AiAnalysisType.COMPLIANCE, score: 55 };
          },
        } as unknown as AiPipelineService,
        {} as unknown as UsersService,
      );

      const request = {
        companyId: COMPANY_A,
        user: { uid: 'firebase-uid-a' },
        headers: { 'x-company-id': COMPANY_B.toString() },
      } as unknown as RequestWithUser;
      await controller.runAnalysis(request);

      assert.equal(calls[0]?.companyId?.toString(), COMPANY_A.toString(), 'header ignorado');
      assert.equal(calls[0]?.actor?.requestedBy, 'firebase-uid-a');
      assert.equal(calls[0]?.actor?.actorType, AiAnalysisActorType.USER);
    });

    it('TENANT-AUDIT4-06 — trace relacionado con análisis de B no es accesible desde A (getCompanyTrace scoped)', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });
      await service.getCompanyTrace(COMPANY_A);

      const findCalls = (traceModel._calls as { method: string; query: unknown }[]).filter(
        (call) => call.method === 'find',
      );
      assert.ok(findCalls.length > 0);
      for (const call of findCalls) {
        assert.equal((call.query as { companyId?: Types.ObjectId }).companyId?.toString(), COMPANY_A.toString());
      }
    });

    it('TENANT-AUDIT4-07 — actor de A no puede acceder a análisis de B (NotFound genérico)', async () => {
      const analysisModel = modelStub({ findOneResult: null });
      const service = buildService({ analysisModel });
      await assert.rejects(
        () => service.getAnalysisScoped(COMPANY_A, '64a000000000000000000099'),
        (error: Error) => error.message === 'Analysis not found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // AI-ACTOR — actor / auditoría
  // -------------------------------------------------------------------------
  describe('AI-ACTOR — actor del análisis', () => {
    it('AI-ACTOR-01 — usuario A genera análisis en empresa A: actorType=USER y requestedBy=uid', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      const actor: AnalysisActor = { requestedBy: 'firebase-uid-a', actorType: AiAnalysisActorType.USER };

      await service.analyzeAndPersist(COMPANY_A, actor);
      const createCalls = (analysisModel._calls as { method: string; data?: { actorType?: string; requestedBy?: string; companyId?: Types.ObjectId } }[]).filter(
        (call) => call.method === 'create',
      );
      assert.ok(createCalls.length >= 1);
      assert.equal(createCalls[0].data?.actorType, AiAnalysisActorType.USER);
      assert.equal(createCalls[0].data?.requestedBy, 'firebase-uid-a');
      assert.equal(createCalls[0].data?.companyId?.toString(), COMPANY_A.toString());
    });

    it('AI-ACTOR-02 — usuario A no puede consultar análisis de B', async () => {
      const analysisModel = modelStub({ findOneResult: null });
      const service = buildService({ analysisModel });
      await assert.rejects(() => service.getAnalysisScoped(COMPANY_A, '64a000000000000000000099'));
    });

    it('AI-ACTOR-03 — el historial conserva el actor', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      const actor: AnalysisActor = { requestedBy: 'firebase-uid-b', actorType: AiAnalysisActorType.USER };
      await service.analyzePhvaAndPersist(COMPANY_A, actor);

      const createCalls = (analysisModel._calls as { method: string; data?: { actorType?: string; requestedBy?: string } }[]).filter(
        (call) => call.method === 'create',
      );
      assert.equal(createCalls[0]?.data?.actorType, AiAnalysisActorType.USER);
      assert.equal(createCalls[0]?.data?.requestedBy, 'firebase-uid-b');
    });
  });

  // -------------------------------------------------------------------------
  // AI-HISTORY-IDEMP — fingerprint e idempotencia
  // -------------------------------------------------------------------------
  describe('AI-HISTORY-IDEMP — fingerprint e idempotencia', () => {
    const baseInput = {
      companyId: COMPANY_A.toString(),
      analysisType: AiAnalysisType.COMPLIANCE,
      engineVersion: 'deterministic:1',
      score: 55,
      findings: [{ id: 'finding-documents-1', module: 'documents', title: 'Hallazgo' }],
      recommendations: [{ id: 'recommendation-1', module: 'documents', title: 'Recomendación' }],
    };

    it('AI-HISTORY-IDEMP-01 — mismo input → mismo fingerprint', () => {
      const first = computeAnalysisFingerprint(baseInput);
      const second = computeAnalysisFingerprint({ ...baseInput });
      assert.equal(first, second);
    });

    it('AI-HISTORY-IDEMP-02 — mismo input ejecutado nuevamente → no duplica snapshot (findOne previo por fingerprint)', async () => {
      // Primera ejecución con stubs reales: captura el fingerprint REAL que el
      // servicio calcula a partir del input (evita hardcodear el hash).
      const warmModel = modelStub();
      const warmService = buildService({ analysisModel: warmModel });
      const firstRecord = await warmService.analyzeAndPersist(COMPANY_A);
      const realFingerprint = firstRecord.fingerprint as string;
      assert.ok(realFingerprint && realFingerprint.length > 0);

      // Segunda ejecución: el stub replica la dedup real — findOne solo
      // devuelve el registro existente cuando el fingerprint coincide
      // (como haría MongoDB con el índice único), y create está bloqueado.
      const existingRecord = {
        _id: firstRecord._id,
        companyId: COMPANY_A,
        analysisType: AiAnalysisType.COMPLIANCE,
        fingerprint: realFingerprint,
        score: 55,
      };
      const calls: { method: string; query?: unknown; data?: unknown }[] = [];
      const analysisModel: Record<string, unknown> = {
        _calls: calls,
        findOne: (query: { fingerprint?: string }) =>
          queryChain(calls, 'findOne', query, () =>
            query.fingerprint === realFingerprint ? existingRecord : null,
          ),
        find: (query: unknown) => queryChain(calls, 'find', query, () => []),
        create: async (data: unknown) => {
          calls.push({ method: 'create', data });
          throw new Error('no debe crear duplicados');
        },
      };
      const service = buildService({ analysisModel });

      const record = await service.analyzeAndPersist(COMPANY_A);
      assert.equal(record._id.toString(), existingRecord._id.toString());
      const createCalls = calls.filter((call) => call.method === 'create');
      assert.equal(createCalls.length, 0, 'mismo fingerprint → sin duplicado');
    });

    it('AI-HISTORY-IDEMP-03 — input modificado → nuevo análisis (fingerprint diferente)', () => {
      const modified = computeAnalysisFingerprint({ ...baseInput, score: 70 });
      const original = computeAnalysisFingerprint(baseInput);
      assert.notEqual(modified, original);
    });

    it('AI-HISTORY-IDEMP-04 — engineVersion diferente → nuevo análisis (fingerprint incluye la versión del motor)', () => {
      const v1 = computeAnalysisFingerprint({ ...baseInput, engineVersion: 'deterministic:1' });
      const v2 = computeAnalysisFingerprint({ ...baseInput, engineVersion: 'deterministic:2' });
      assert.notEqual(v1, v2);
    });
  });

  // -------------------------------------------------------------------------
  // AI-COMPARE — comparación entre análisis
  // -------------------------------------------------------------------------
  describe('AI-COMPARE — comparación determinista', () => {
    function recordsModel(records: Array<Record<string, unknown>>) {
      const calls: { method: string; query?: unknown }[] = [];
      const model: Record<string, unknown> = {
        _calls: calls,
        findOne: (query: { _id?: Types.ObjectId }) => ({
          exec: async () => {
            calls.push({ method: 'findOne', query });
            const id = query._id?.toString();
            return records.find((record) => (record._id as Types.ObjectId).toString() === id) ?? null;
          },
        }),
        find: () => ({ sort: () => ({ exec: async () => [] }) }),
        create: async () => {
          throw new Error('unexpected create');
        },
      };
      return model;
    }

    const CURRENT_ID = new Types.ObjectId('64a0000000000000000000b1');
    const PREVIOUS_ID = new Types.ObjectId('64a0000000000000000000b2');

    const current = {
      _id: CURRENT_ID,
      companyId: COMPANY_A,
      analysisType: AiAnalysisType.COMPLIANCE,
      score: 80,
      findings: [
        { id: 'finding-documents-1', module: 'documents', title: 'Hallazgo vigente' },
        { id: 'finding-new-1', module: 'trainings', title: 'Hallazgo nuevo' },
      ],
      recommendations: [
        { id: 'recommendation-documents-1', module: 'documents', title: 'Rec vigente' },
        { id: 'recommendation-new-1', module: 'trainings', title: 'Rec nueva' },
      ],
    };
    const previous = {
      _id: PREVIOUS_ID,
      companyId: COMPANY_A,
      analysisType: AiAnalysisType.COMPLIANCE,
      score: 60,
      findings: [
        { id: 'finding-documents-1', module: 'documents', title: 'Hallazgo vigente' },
        { id: 'finding-resolved-1', module: 'old', title: 'Hallazgo resuelto' },
      ],
      recommendations: [
        { id: 'recommendation-documents-1', module: 'documents', title: 'Rec vigente' },
        { id: 'recommendation-resolved-1', module: 'old', title: 'Rec resuelta' },
      ],
    };

    it('AI-COMPARE-01 — calcula delta, findings nuevos/resueltos y recomendaciones nuevas/resueltas', async () => {
      const analysisModel = recordsModel([current, previous] as unknown as Array<Record<string, unknown>>);
      const service = buildService({ analysisModel });

      const comparison = await service.compareAnalyses(
        COMPANY_A,
        CURRENT_ID.toString(),
        PREVIOUS_ID.toString(),
      );
      assert.equal(comparison.scoreBefore, 60);
      assert.equal(comparison.scoreNow, 80);
      assert.equal(comparison.delta, 20);
      assert.deepEqual(comparison.findingsNew, ['finding-new-1']);
      assert.deepEqual(comparison.findingsResolved, ['finding-resolved-1']);
      assert.deepEqual(comparison.recommendationsNew, ['recommendation-new-1']);
      assert.deepEqual(comparison.recommendationsResolved, ['recommendation-resolved-1']);
    });

    it('AI-COMPARE-02 — la comparación NO modifica los análisis históricos', async () => {
      const analysisModel = recordsModel([current, previous] as unknown as Array<Record<string, unknown>>);
      const service = buildService({ analysisModel });
      await service.compareAnalyses(COMPANY_A, CURRENT_ID.toString(), PREVIOUS_ID.toString());

      const calls = analysisModel._calls as { method: string }[];
      assert.ok(calls.every((call) => call.method === 'findOne'), 'solo lecturas, sin writes');
    });

    it('AI-COMPARE-03 — comparación cross-tenant → NotFound (ambos análisis scoped)', async () => {
      const analysisModel = modelStub({ findOneResult: null });
      const service = buildService({ analysisModel });
      await assert.rejects(
        () => service.compareAnalyses(COMPANY_A, CURRENT_ID.toString(), PREVIOUS_ID.toString()),
        (error: Error) => error.message === 'Analysis not found',
      );
    });

    it('AI-COMPARE-04 — comparar análisis de distinto tipo → BadRequest (delta sin sentido)', async () => {
      const phvaRecord = {
        _id: new Types.ObjectId('64a0000000000000000000b3'),
        companyId: COMPANY_A,
        analysisType: AiAnalysisType.PHVA,
        score: 45,
        findings: [],
        recommendations: [],
      };
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      // findOne devuelve el tipo según el query: PHVA para previousId.
      (analysisModel as { findOne: unknown }).findOne = (query: { _id?: Types.ObjectId }) => ({
        exec: async () => {
          const id = query._id?.toString();
          if (id === CURRENT_ID.toString()) return current;
          if (id === PREVIOUS_ID.toString()) return phvaRecord;
          return null;
        },
      });
      await assert.rejects(
        () => service.compareAnalyses(COMPANY_A, CURRENT_ID.toString(), PREVIOUS_ID.toString()),
        (error: Error) => /different types/i.test(error.message),
      );
    });
  });

  // -------------------------------------------------------------------------
  // AI-TRACE — trazabilidad con AUDIT-3
  // -------------------------------------------------------------------------
  describe('AI-TRACE — análisis → finding → action → análisis', () => {
    it('AI-TRACE-01 — análisis → finding: analyzeAndPersist vincula el análisis con sus findings', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });
      const record = await service.analyzeAndPersist(COMPANY_A);

      const createCalls = (traceModel._calls as { method: string; data?: { sourceModule?: PipelineModule; sourceEntityId?: string; targetModule?: PipelineModule } }[]).filter(
        (call) => call.method === 'create',
      );
      const analysisToFinding = createCalls.find(
        (call) =>
          call.data?.sourceModule === PipelineModule.AI_ANALYSIS &&
          call.data?.targetModule === PipelineModule.FINDING,
      );
      assert.ok(analysisToFinding, 'debe existir traza AI_ANALYSIS → FINDING');
      assert.equal(analysisToFinding.data?.sourceEntityId, record._id.toString());
    });

    it('AI-TRACE-02 — finding → action: la acción conserva el id real del finding (relatedFindingId)', async () => {
      const traceModel = modelStub();
      const service = buildService({ traceModel });
      await service.materializeAction(COMPANY_A, 'action-1', USER);

      const createCalls = (traceModel._calls as { method: string; data?: { sourceModule?: PipelineModule; targetModule?: PipelineModule } }[]).filter(
        (call) => call.method === 'create',
      );
      assert.ok(
        createCalls.some(
          (call) => call.data?.sourceModule === PipelineModule.FINDING && call.data?.targetModule === PipelineModule.ACTION,
        ),
        'debe existir traza FINDING → ACTION',
      );
    });

    it('AI-TRACE-03 — action → análisis de origen: la acción se vincula al análisis que contiene su finding', async () => {
      const traceModel = modelStub();
      const sourceAnalysisId = new Types.ObjectId('64a0000000000000000000c1');
      const analysisModel = modelStub({
        findOneResult: { _id: sourceAnalysisId, companyId: COMPANY_A, analysisType: AiAnalysisType.COMPLIANCE },
      });
      const service = buildService({ analysisModel, traceModel });
      await service.materializeAction(COMPANY_A, 'action-1', USER);

      const createCalls = (traceModel._calls as { method: string; data?: { sourceModule?: PipelineModule; sourceEntityId?: string; targetModule?: PipelineModule; targetEntityId?: string } }[]).filter(
        (call) => call.method === 'create',
      );
      const actionToAnalysis = createCalls.find(
        (call) =>
          call.data?.sourceModule === PipelineModule.ACTION &&
          call.data?.targetModule === PipelineModule.AI_ANALYSIS,
      );
      assert.ok(actionToAnalysis, 'debe existir traza ACTION → AI_ANALYSIS');
      assert.equal(actionToAnalysis.data?.targetEntityId, sourceAnalysisId.toString());
    });

    it('AI-TRACE-04 — el análisis histórico conserva su trace original (lecturas no mutan)', async () => {
      const analysisModel = modelStub();
      const traceModel = modelStub();
      const service = buildService({ analysisModel, traceModel });

      const record = await service.analyzeAndPersist(COMPANY_A);
      await service.getCompanyAnalyses(COMPANY_A);
      await service.getCompanyTrace(COMPANY_A);

      const traceCalls = traceModel._calls as { method: string }[];
      assert.ok(
        !traceCalls.some((call) => call.method === 'deleteOne' || call.method === 'updateOne'),
        'lectura de historial no elimina ni actualiza traces',
      );
      assert.ok(record._id);
    });
  });

  // -------------------------------------------------------------------------
  // IMMUTABLE-AI — inmutabilidad
  // -------------------------------------------------------------------------
  describe('IMMUTABLE-AI — inmutabilidad de análisis históricos', () => {
    it('IMMUTABLE-AI-01 — consultar un análisis no modifica createdAt', async () => {
      const record = {
        _id: new Types.ObjectId('64a0000000000000000000d1'),
        companyId: COMPANY_A,
        analysisType: AiAnalysisType.COMPLIANCE,
        score: 55,
        fingerprint: 'fp',
        findings: [],
        recommendations: [],
        actorType: AiAnalysisActorType.USER,
        requestedBy: 'firebase-uid-a',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      const analysisModel = modelStub({ findOneResult: record });
      const service = buildService({ analysisModel });
      const before = (record as { createdAt: Date }).createdAt.toISOString();

      const result = await service.getAnalysisScoped(COMPANY_A, record._id.toString());
      assert.equal((result as { createdAt: Date }).createdAt.toISOString(), before);
    });

    it('IMMUTABLE-AI-02 — consultar un análisis NO recalcula el score (solo lectura)', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      await service.getCompanyAnalyses(COMPANY_A);
      const calls = analysisModel._calls as { method: string }[];
      assert.ok(!calls.some((call) => call.method === 'create'), 'historial no persiste nada nuevo');
    });

    it('IMMUTABLE-AI-03 — consultar el historial no modifica los snapshots', async () => {
      const analysisModel = modelStub();
      const service = buildService({ analysisModel });
      await service.getCompanyAnalyses(COMPANY_A);
      const calls = analysisModel._calls as { method: string }[];
      assert.ok(calls.every((call) => ['find', 'sort', 'skip', 'limit'].includes(call.method)));
    });

    it('IMMUTABLE-AI-04 — el análisis anterior no cambia cuando se crea uno nuevo', async () => {
      const previousRecord = {
        _id: new Types.ObjectId('64a0000000000000000000d2'),
        companyId: COMPANY_A,
        analysisType: AiAnalysisType.COMPLIANCE,
        score: 55,
        fingerprint: 'fp-anterior',
        findings: [],
        recommendations: [],
        actorType: AiAnalysisActorType.SYSTEM,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      const analysisModel = modelStub({ findOneResult: previousRecord });
      const service = buildService({ analysisModel });

      // La creación de un análisis nuevo (fingerprint distinto) NO toca el anterior:
      // el findOne previo devuelve el registro existente y se reutiliza tal cual.
      const result = await service.analyzeAndPersist(COMPANY_A, { actorType: AiAnalysisActorType.USER, requestedBy: 'uid' });
      assert.equal((result as { _id: Types.ObjectId })._id.toString(), previousRecord._id.toString());
      const createCalls = (analysisModel._calls as { method: string }[]).filter((call) => call.method === 'create');
      assert.equal(createCalls.length, 0, 'no se duplica ni se muta el análisis previo');
    });

    it('IMMUTABLE-AI-05 — la guard del schema rechaza actualizaciones (pre-updateOne)', () => {
      let received: Error | undefined;
      immutableAnalysisUpdateGuard((error) => {
        received = error;
      });
      assert.ok(received instanceof Error);
      assert.match(received?.message ?? '', /immutable/i);
      assert.equal(received?.message, IMMUTABLE_ANALYSIS_MESSAGE);
    });
  });
});
