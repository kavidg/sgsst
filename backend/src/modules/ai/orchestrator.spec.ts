import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';

import { AbsenteeismService } from '../absenteeism/absenteeism.service';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { ComplianceAIEngine } from '../compliance-ai/compliance-ai.service';
import { IncidentsService } from '../incidents/incidents.service';
import { InspectionsService } from '../inspections/inspections.service';
import { PhvaAnalysisService } from '../phva/phva-analysis.service';
import { TrainingsService } from '../trainings/trainings.service';
import { AbsenteeismEngine } from './engines/absenteeism.engine';
import { AlertsEngine } from './engines/alerts.engine';
import { AuditsEngine } from './engines/audits.engine';
import { DocumentsEngine } from './engines/documents.engine';
import { IncidentsEngine } from './engines/incidents.engine';
import { IndicatorsEngine } from './engines/indicators.engine';
import { PhvaEngine } from './engines/phva.engine';
import { ProgramsEngine } from './engines/programs.engine';
import { AIContext } from './interfaces/ai-context.interface';
import { AIEngine } from './interfaces/ai-engine.interface';
import { ContextService } from './context.service';
import { OrchestratorService } from './orchestrator.service';
import { OrchestratorController } from './orchestrator.controller';
import { resolveEngineName } from './utils/intent-router';

const phvaAnalysisStub = {
  analyzeCompanyPHVA: async () => ({
    overall: 80,
    planear: { percentage: 80, pending: ['Actividad pendiente A'] },
    hacer: { percentage: 60, pending: [] },
    verificar: { percentage: 75, pending: [] },
    actuar: { percentage: 50, pending: ['Hallazgo crítico'] },
  }),
} as unknown as PhvaAnalysisService;

const ENGINES: readonly AIEngine[] = [
  new IndicatorsEngine(),
  new DocumentsEngine(),
  new PhvaEngine(phvaAnalysisStub),
  new AlertsEngine(),
  // AUDIT-1: engine compliance real (determinista, sin LLM) para cubrir el
  // dominio completo del routing en TENANT-AI-06. Stubs mínimos: los engines
  // responden "información insuficiente" ante datos ausentes.
  new ComplianceAIEngine(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ),
];

function buildContext(question: string): AIContext {
  return {
    userId: 'uid-test',
    companyId: 'company-test',
    timestamp: new Date(),
    question,
  };
}

describe('intent-router', () => {
  it('enruta "cumplimiento" a indicators', () => {
    assert.equal(resolveEngineName('¿Cómo va el cumplimiento?'), 'indicators');
  });

  it('enruta "indicador" y "avance" a indicators', () => {
    assert.equal(resolveEngineName('muéstrame el indicador de ausentismo'), 'indicators');
    assert.equal(resolveEngineName('¿cuál es el avance del plan?'), 'indicators');
  });

  it('enruta "documento" y "evidencia" a documents', () => {
    assert.equal(resolveEngineName('¿qué documentos están vencidos?'), 'documents');
    assert.equal(resolveEngineName('faltan evidencias de la capacitación'), 'documents');
  });

  it('enruta "plan" y "actividad" a phva', () => {
    assert.equal(resolveEngineName('¿cómo va el plan anual?'), 'phva');
    assert.equal(resolveEngineName('actividades pendientes del plan'), 'phva');
  });

  it('enruta "alerta" a alerts', () => {
    assert.equal(resolveEngineName('¿existen alertas críticas?'), 'alerts');
  });

  it('enruta "estándares" y "nivel de cumplimiento" a compliance', () => {
    assert.equal(resolveEngineName('¿qué estándares aplican a mi empresa?'), 'compliance');
    assert.equal(resolveEngineName('¿cuál es el nivel de cumplimiento SG-SST?'), 'compliance');
  });

  it('enruta consultas de capacitación/integrantes/cobertura del COPASST (1.1.7) a compliance', () => {
    assert.equal(resolveEngineName('¿Cómo está la capacitación del COPASST?'), 'compliance');
    assert.equal(resolveEngineName('¿Qué integrantes del COPASST están pendientes?'), 'compliance');
    assert.equal(resolveEngineName('¿Cuál es la cobertura de capacitación de los integrantes del COPASST?'), 'compliance');
    assert.equal(resolveEngineName('¿qué integrantes del copasst ya están capacitados?'), 'compliance');
  });

  it('las consultas que mencionan COPASST + plan/actividad enrutan a compliance (decisión intencional: el contexto 1.1.7 vive en los findings de cumplimiento)', () => {
    // La regla 'copasst' está en la PRIMERA regla (compliance), por lo que gana
    // sobre 'plan'/'actividad' (phva). Es un cambio deliberado de Fase 7 para
    // que toda consulta COPASST use los findings reales de 1.1.7.
    assert.equal(resolveEngineName('¿cómo va el plan de capacitación del COPASST?'), 'compliance');
    assert.equal(resolveEngineName('¿qué actividades de capacitación del copasst están pendientes?'), 'compliance');
  });

  it('enruta consultas del Comité de Convivencia Laboral (1.1.8) a compliance', () => {
    assert.equal(resolveEngineName('¿Cómo está el Comité de Convivencia?'), 'compliance');
    assert.equal(resolveEngineName('¿Cumplimos el estándar 1.1.8?'), 'compliance');
    assert.equal(resolveEngineName('¿Qué nos falta para cumplir convivencia?'), 'compliance');
    assert.equal(resolveEngineName('¿Cuántas reuniones del comité de convivencia se han realizado?'), 'compliance');
    assert.equal(resolveEngineName('¿Cómo está la conformación del Comité de Convivencia?'), 'compliance');
    assert.equal(resolveEngineName('¿Qué hallazgos tenemos sobre convivencia?'), 'compliance');
    assert.equal(resolveEngineName('¿Qué recomendaciones hay para el comité de convivencia?'), 'compliance');
  });

  it('no captura consultas de otros estándares con la palabra convivencia (COPASST y capacitación siguen intactos)', () => {
    // La regla 'convivencia' no debe alterar el routing de COPASST (1.1.6/1.1.7),
    // capacitación (1.2.1) ni de documentos/planes.
    assert.equal(resolveEngineName('¿Cómo está la capacitación del COPASST?'), 'compliance');
    assert.equal(resolveEngineName('¿qué integrantes del copasst están pendientes?'), 'compliance');
    assert.equal(resolveEngineName('¿cómo va el plan anual?'), 'phva');
    assert.equal(resolveEngineName('¿qué documentos están vencidos?'), 'documents');
    assert.equal(resolveEngineName('¿existen alertas críticas?'), 'alerts');
  });

  it('retorna null cuando ninguna regla coincide', () => {
    assert.equal(resolveEngineName('hola mundo'), null);
  });

  // ═════════════════════════════════════════════
  // AUDIT-5 — INTENT-AUDIT5
  // Nuevos intents de dominios operativos con keywords específicas.
  // ═════════════════════════════════════════════
  it('INTENT-AUDIT5-01 — accidentalidad/incidentes enruta a incidents', () => {
    assert.equal(resolveEngineName('¿Qué problemas de accidentalidad tenemos?'), 'incidents');
    assert.equal(resolveEngineName('¿cuántos accidentes hubo este mes?'), 'incidents');
    assert.equal(resolveEngineName('¿hay incidentes laborales abiertos?'), 'incidents');
  });

  it('INTENT-AUDIT5-02 — ausentismo enruta a absenteeism (sin capturar indicador de ausentismo)', () => {
    assert.equal(resolveEngineName('¿Cómo está el ausentismo?'), 'absenteeism');
    assert.equal(resolveEngineName('¿cuántas ausencias laborales tenemos?'), 'absenteeism');
    // La keyword 'indicador' (regla indicators, anterior) gana: el indicador
    // de ausentismo sigue enrumbando a indicators, no a absenteeism.
    assert.equal(resolveEngineName('muéstrame el indicador de ausentismo'), 'indicators');
  });

  it('INTENT-AUDIT5-03 — capacitaciones/entrenamiento enrutan a programs', () => {
    assert.equal(resolveEngineName('¿qué capacitaciones hay pendientes?'), 'programs');
    assert.equal(resolveEngineName('¿cómo va el programa de capacitación?'), 'programs');
  });

  it('INTENT-AUDIT5-04 — auditorías/inspecciones enrutan a audits', () => {
    assert.equal(resolveEngineName('¿qué hallazgos de auditoría tenemos?'), 'audits');
    assert.equal(resolveEngineName('¿cuántas inspecciones están pendientes?'), 'audits');
  });

  it('INTENT-AUDIT5-05 — las keywords nuevas NO alteran el routing certificado (compliance/phva/documents/alerts)', () => {
    assert.equal(resolveEngineName('¿cuál es el nivel de cumplimiento SG-SST?'), 'compliance');
    assert.equal(resolveEngineName('¿cómo va el plan anual?'), 'phva');
    assert.equal(resolveEngineName('¿qué documentos están vencidos?'), 'documents');
    assert.equal(resolveEngineName('¿existen alertas críticas?'), 'alerts');
    assert.equal(resolveEngineName('¿cómo va la capacitación del COPASST?'), 'compliance');
  });

  it('INTENT-AUDIT5-06 — consulta compuesta prioriza el dominio específico sin romper compliance', () => {
    // 'hallazgos' no es keyword propia: la consulta de accidentalidad gana por
    // la keyword 'accidentalidad' (regla incidents), no por 'hallazgos'.
    assert.equal(resolveEngineName('¿qué hallazgos tenemos sobre accidentalidad?'), 'incidents');
  });
});

describe('engines', () => {
  for (const engine of ENGINES) {
    it(`el engine ${engine.getName()} expone nombre y resultado estructurado`, async () => {
      const result = await engine.execute('consulta de prueba', buildContext('consulta de prueba'));

      assert.equal(typeof engine.getName(), 'string');
      assert.ok(engine.getName().length > 0);
      assert.equal(typeof result.action, 'string');
      assert.ok(result.confidence >= 0 && result.confidence <= 1);
      assert.ok(result.response.length > 0);
      assert.ok(Array.isArray(result.suggestions));
    });
  }
});

// ═════════════════════════════════════════════
// AUDIT-5 — ENGINE-AUDIT5
// Engines delgados de dominios operativos: capas de composición sobre los
// services reales (IncidentsService, AbsenteeismService, TrainingsService,
// InspectionsService). Nunca acceden a MongoDB ni duplican lógica de negocio.
// ═════════════════════════════════════════════
describe('AUDIT-5 — Engines de dominios operativos', () => {
  // ObjectId válido: los engines convierten companyId con new Types.ObjectId().
  const companyContext: AIContext = {
    userId: 'uid-test',
    companyId: '64b0000000000000000000a1',
    timestamp: new Date(),
    question: '¿cómo está la accidentalidad?',
  };

  it('ENGINE-AUDIT5-01 — incidents: resume datos reales del tenant sin PII', async () => {
    const incidentsService = {
      findAll: async () => [
        { type: 'Leve', severity: 'Baja', status: 'Abierto' },
        { type: 'Grave', severity: 'Alta', status: 'Abierto' },
        { type: 'Leve', severity: 'Baja', status: 'Cerrado' },
      ],
    } as unknown as IncidentsService;
    const engine = new IncidentsEngine(incidentsService);

    const result = await engine.execute('¿cómo está la accidentalidad?', companyContext);

    assert.equal(engine.getName(), 'incidents');
    assert.equal(result.action, 'incidents_summary');
    assert.match(result.response, /3 incidentes/);
    assert.match(result.response, /2 abiertos/);
    assert.equal(result.confidence, 0.7);
  });

  it('ENGINE-AUDIT5-02 — incidents: sin datos devuelve resumen vacío consistente', async () => {
    const incidentsService = { findAll: async () => [] } as unknown as IncidentsService;
    const engine = new IncidentsEngine(incidentsService);

    const result = await engine.execute('¿accidentes?', companyContext);

    assert.match(result.response, /No hay incidentes/);
    assert.equal(result.confidence, 0.5);
  });

  it('ENGINE-AUDIT5-03 — absenteeism: resume stats + causas reales', async () => {
    const absenteeismService = {
      getCompanyStats: async () => ({ totalCasos: 4, totalDiasPerdidos: 15, promedioDias: 3.75 }),
      findAllByCompany: async () => [
        { tipo: 'Enfermedad general', dias: 5 },
        { tipo: 'Accidente laboral', dias: 10 },
      ],
    } as unknown as AbsenteeismService;
    const engine = new AbsenteeismEngine(absenteeismService);

    const result = await engine.execute('¿cómo está el ausentismo?', companyContext);

    assert.equal(engine.getName(), 'absenteeism');
    assert.equal(result.action, 'absenteeism_summary');
    assert.match(result.response, /4 casos/);
    assert.match(result.response, /15 días perdidos/);
    assert.match(result.response, /Enfermedad general: 1/);
  });

  it('ENGINE-AUDIT5-04 — programs: resume capacitaciones reales sin listas de asistencia', async () => {
    const trainingsService = {
      findAll: async () => [{ topic: 'Alturas' }, { topic: 'Primeros auxilios' }, { topic: 'Extintores' }],
    } as unknown as TrainingsService;
    const engine = new ProgramsEngine(trainingsService);

    const result = await engine.execute('¿qué capacitaciones hay?', companyContext);

    assert.equal(engine.getName(), 'programs');
    assert.equal(result.action, 'programs_summary');
    assert.match(result.response, /3 capacitaciones/);
  });

  it('ENGINE-AUDIT5-05 — audits: resume pendientes y completadas', async () => {
    const inspectionsService = {
      findAll: async () => [
        { title: 'Auditoría interna', status: 'pendiente' },
        { title: 'Inspección instalaciones', status: 'completada', completedDate: new Date() },
      ],
    } as unknown as InspectionsService;
    const engine = new AuditsEngine(inspectionsService);

    const result = await engine.execute('¿qué auditorías hay?', companyContext);

    assert.equal(engine.getName(), 'audits');
    assert.equal(result.action, 'audits_summary');
    assert.match(result.response, /1 pendientes/);
    assert.match(result.response, /1 completadas/);
  });

  it('ENGINE-AUDIT5-06 — sin companyId autorizado: engines devuelven información insuficiente (nunca consultan datos)', async () => {
    let consulted = false;
    const incidentsService = {
      findAll: async () => {
        consulted = true;
        return [];
      },
    } as unknown as IncidentsService;
    const engine = new IncidentsEngine(incidentsService);

    const result = await engine.execute('¿accidentes?', {
      userId: 'uid-test',
      companyId: null,
      timestamp: new Date(),
      question: '¿accidentes?',
    });

    assert.equal(consulted, false);
    assert.equal(result.confidence, 0.2);
    assert.match(result.response, /insuficiente/);
  });

  it('ENGINE-AUDIT5-07 — contrato intacto: la respuesta de cada engine mantiene {action, confidence, response, suggestions}', async () => {
    const engines: AIEngine[] = [
      new IncidentsEngine({ findAll: async () => [] } as unknown as IncidentsService),
      new AbsenteeismEngine({
        getCompanyStats: async () => ({ totalCasos: 0, totalDiasPerdidos: 0, promedioDias: 0 }),
        findAllByCompany: async () => [],
      } as unknown as AbsenteeismService),
      new ProgramsEngine({ findAll: async () => [] } as unknown as TrainingsService),
      new AuditsEngine({ findAll: async () => [] } as unknown as InspectionsService),
    ];

    for (const engine of engines) {
      const result = await engine.execute('consulta', companyContext);
      assert.deepEqual(Object.keys(result).sort(), ['action', 'confidence', 'response', 'suggestions']);
    }
  });
});

describe('OrchestratorService', () => {
  const service = new OrchestratorService(ENGINES);

  it('enruta y ejecuta el engine de indicadores', async () => {
    const response = await service.query('¿Cómo va el cumplimiento?', buildContext('¿Cómo va el cumplimiento?'));

    assert.equal(response.module, 'indicators');
    assert.equal(response.action, 'indicators_analysis');
    assert.ok(response.confidence > 0 && response.confidence <= 1);
    assert.ok(response.response.length > 0);
    assert.ok(Array.isArray(response.suggestions) && response.suggestions.length > 0);
  });

  it('retorna fallback de baja confianza cuando no hay coincidencia', async () => {
    const response = await service.query('hola mundo', buildContext('hola mundo'));

    assert.equal(response.module, 'general');
    assert.equal(response.action, 'clarify');
    assert.equal(response.confidence, 0.2);
    assert.ok(response.suggestions.length > 0);
  });

  it('el engine PHVA responde con análisis inteligente', async () => {
    const response = await service.query('¿cómo va el plan anual?', buildContext('¿cómo va el plan anual?'));

    assert.equal(response.module, 'phva');
    assert.equal(response.action, 'phva_analysis');
    assert.match(response.response, /El cumplimiento actual del ciclo PHVA es/);
    assert.ok(response.confidence > 0.5);
  });

  it('devuelve la estructura completa del contrato', async () => {
    const response = await service.query('¿cómo va el plan anual?', buildContext('¿cómo va el plan anual?'));

    assert.deepEqual(Object.keys(response).sort(), ['action', 'confidence', 'module', 'response', 'suggestions']);
  });
});

// ═════════════════════════════════════════════
// AUDIT-1 — TENANT ISOLATION DEL AI ORCHESTRATOR
// (TENANT-AI-01..06)
// ═════════════════════════════════════════════
// Cierra el IDOR cross-tenant: el tenant debe provenir EXCLUSIVAMENTE de
// request.companyId (fijado por CompanyAccessGuard tras validar la membresía
// real del usuario autenticado). El header x-company-id y cualquier companyId
// del DTO/body/query NO tienen autoridad.
describe('AUDIT-1 — Tenant isolation del AI Orchestrator', () => {
  const contextService = new ContextService();

  it('TENANT-AI-01 — un usuario autorizado de Empresa A consulta su propio tenant: el contexto usa el companyId autorizado', () => {
    // request.companyId ya fue fijado por CompanyAccessGuard (membresía real).
    const request = {
      companyId: '64b0000000000000000000a1',
      user: { uid: 'uid-A' },
      headers: {},
    } as never;

    const context = contextService.buildContext(request, '¿cómo va el cumplimiento?');

    assert.equal(context.companyId, '64b0000000000000000000a1');
    assert.equal(context.userId, 'uid-A');
  });

  it('TENANT-AI-02 — el header x-company-id de Empresa B NO tiene autoridad: solo cuenta el companyId autorizado', () => {
    // Aunque el cliente envíe x-company-id de B, el guard fijó companyId de A;
    // el contexto SIEMPRE usa el companyId autorizado y NUNCA el header.
    const request = {
      companyId: '64b0000000000000000000a1',
      user: { uid: 'uid-A' },
      headers: { 'x-company-id': '64b0000000000000000000b1' },
    } as never;

    const context = contextService.buildContext(request, '¿cómo va el cumplimiento?');

    assert.equal(context.companyId, '64b0000000000000000000a1');
    assert.notEqual(context.companyId, '64b0000000000000000000b1');
  });

  it('TENANT-AI-03 — sin tenant autorizado (sin companyId en request) el contexto es null: ningún engine consulta datos', () => {
    // Sin CompanyAccessGuard aprobando una empresa, request.companyId no existe
    // → companyId null → los engines responden sin datos de ninguna empresa.
    const request = {
      user: { uid: 'uid-A' },
      headers: { 'x-company-id': '64b0000000000000000000b1' },
    } as never;

    const context = contextService.buildContext(request, '¿cómo va el cumplimiento?');

    assert.equal(context.companyId, null);
  });

  it('TENANT-AI-04 — ContextService ya NO usa request.headers[x-company-id] como fuente de tenant', () => {
    const source = ContextService.toString();
    assert.ok(!source.includes('x-company-id'));
    assert.ok(source.includes('request.companyId'));
  });

  it('TENANT-AI-05 — un companyId arbitrario en el body/DTO no puede cambiar el tenant autorizado', async () => {
    const engines: readonly AIEngine[] = [
      {
        getName: () => 'phva',
        // Si el engine llegara a ejecutarse con el companyId del body, fallaría.
        execute: async (_, context: AIContext) => {
          assert.equal(context.companyId, '64b0000000000000000000a1');
          return {
            action: 'phva_analysis',
            confidence: 0.9,
            response: 'ok',
            suggestions: [],
          };
        },
      },
    ];
    const orchestrator = new OrchestratorService(engines);
    const controller = new OrchestratorController(
      orchestrator,
      contextService as never,
    );

    // El DTO solo lleva question; un companyId inyectado en el body es ignorado
    // porque el contexto se construye únicamente desde el request autorizado.
    const dto = {
      question: '¿cómo va el plan anual?',
      companyId: '64b0000000000000000000b1',
    } as never;
    const request = {
      companyId: '64b0000000000000000000a1',
      user: { uid: 'uid-A' },
      headers: {},
    } as never;

    const response = await controller.query(dto, request);
    assert.equal(response.module, 'phva');
  });

  it('TENANT-AI-06 — regresión: el flujo normal del orchestrator sigue resolviendo para el tenant autorizado', async () => {
    const service = new OrchestratorService(ENGINES);

    // Los 5 dominios del router siguen funcionando con el contexto autorizado.
    const compliance = await service.query('¿qué estándares aplican?', buildContext('¿qué estándares aplican?'));
    assert.equal(compliance.module, 'compliance');
    const phva = await service.query('¿cómo va el plan anual?', buildContext('¿cómo va el plan anual?'));
    assert.equal(phva.module, 'phva');
    const indicators = await service.query('¿cómo va el cumplimiento?', buildContext('¿cómo va el cumplimiento?'));
    assert.equal(indicators.module, 'indicators');
    const documents = await service.query('¿qué documentos están vencidos?', buildContext('¿qué documentos están vencidos?'));
    assert.equal(documents.module, 'documents');
    const alerts = await service.query('¿existen alertas críticas?', buildContext('¿existen alertas críticas?'));
    assert.equal(alerts.module, 'alerts');
  });

  it('CompanyAccessGuard real: sin membresía en la empresa solicitada → ForbiddenException (IDOR cerrado)', async () => {
    // Prueba del guard REAL (no simulado) con stubs de modelos: valida la
    // cadena guard → request.companyId que protege el endpoint.
    const userModel = {
      findOne: () => ({
        exec: async () => ({ _id: 'user-A', firebaseUid: 'uid-A', email: 'a@x.com', role: 'owner' }),
      }),
    } as never;
    // Usuario A NO tiene membresía en la empresa B → el guard rechaza.
    const companyUserModel = {
      findOne: () => ({
        exec: async () => null,
      }),
    } as never;
    const guard = new CompanyAccessGuard(userModel, companyUserModel);

    const request = {
      user: { uid: 'uid-A' },
      headers: { 'x-company-id': '64b0000000000000000000b1' },
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await assert.rejects(
      () => guard.canActivate(context),
      (error: Error) =>
        error instanceof ForbiddenException &&
        error.message.includes('do not belong'),
    );
  });

  it('CompanyAccessGuard real: con membresía válida fija request.companyId a la empresa autorizada', async () => {
    const userModel = {
      findOne: () => ({
        exec: async () => ({ _id: 'user-A', firebaseUid: 'uid-A', email: 'a@x.com', role: 'owner' }),
      }),
    } as never;
    // Usuario A SÍ tiene membresía en la empresa A.
    const companyUserModel = {
      findOne: () => ({
        exec: async () => ({ companyId: '64b0000000000000000000a1' }),
      }),
    } as never;
    const guard = new CompanyAccessGuard(userModel, companyUserModel);

    const request = {
      user: { uid: 'uid-A' },
      headers: { 'x-company-id': '64b0000000000000000000a1' },
    } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    const allowed = await guard.canActivate(context);
    assert.equal(allowed, true);
    // El companyId autorizado queda disponible para ContextService.
    assert.equal((request as { companyId?: unknown }).companyId, '64b0000000000000000000a1');
  });
});
