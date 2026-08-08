import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model } from 'mongoose';

import { ActivityStatus } from '../../annual-work-plan/schemas/plan-activity.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { Company, CompanyDocument } from '../../companies/schemas/company.schema';
import { ComplianceEngineService } from '../../compliance-engine/compliance-engine.service';
import { DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { PhvaAnalysisService } from '../../phva/phva-analysis.service';
import { AiContextService } from './ai-context.service';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';

function buildService(overrides?: {
  company?: unknown;
  overview?: unknown;
  phva?: unknown;
  documents?: unknown[];
  activities?: unknown[];
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

  return new AiContextService(
    companyModel,
    complianceEngineService,
    phvaAnalysisService,
    documentMasterService,
    annualWorkPlanService,
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

    const service = new AiContextService(
      companyModel,
      complianceEngineService,
      phvaAnalysisService,
      documentMasterService,
      annualWorkPlanService,
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
});
