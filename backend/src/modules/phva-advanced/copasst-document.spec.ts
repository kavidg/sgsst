import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import { CopasstVariableResolverService } from './copasst-variable-resolver.service';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';
import { PHVA_SOURCE_ENTITY_COPASST } from '../document-generation/types/document-generation.types';

/** ObjectIds válidos de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const PERIOD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';
const TEMPLATE_ID = '64b000000000000000000004';

/** Plantilla de sistema devuelta por el stub de SystemTemplateService. */
function buildSystemTemplate(): DocumentTemplateDocument {
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    name: 'Conformación del COPASST',
    documentType: 'PHVA_COPASST' as never,
    format: 'DOCX' as never,
    source: 'SYSTEM' as never,
    variables: ['company.name'],
    storageUrl: 'system-templates/phva-advanced/copasst-template.docx',
    version: 1,
    active: true,
  } as unknown as DocumentTemplateDocument;
}

/** Periodo COPASST usado por el stub del modelo. */
function buildPeriod() {
  return {
    _id: new Types.ObjectId(PERIOD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    periodName: 'Periodo 2024-2026',
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    currentVersion: '1.2',
    status: 'ACTIVO',
    // Defensa en profundidad (patrón Fase 2): la generación exige periodo
    // aprobado (o metadata de aprobación cargada).
    approvalStatus: 'APPROVED',
    members: [],
  };
}

describe('PhvaAdvancedService.generateCopasstDocument', () => {
  function buildService(overrides?: {
    period?: Record<string, unknown> | null;
    template?: DocumentTemplateDocument | null;
  }): {
    service: PhvaAdvancedService;
    generateDocumentCalls: unknown[][];
    instanceData: Record<string, unknown>;
  } {
    const period = {
      ...buildPeriod(),
      ...overrides?.period,
    };
    const generateDocumentCalls: unknown[][] = [];
    const instanceData: Record<string, unknown> = {};

    // Stub del modelo CopasstPeriod. `period` ya mergea los overrides truthy
    // (empresa incorrecta, DRAFT); solo el caso explícito null debe devolver
    // null para ejercitar el NotFound del servicio (?? trataría null como
    // ausente y devolvería el periodo por defecto).
    const copasstPeriodModel = {
      findById: () => ({
        exec: async () => (overrides?.period === null ? null : period),
      }),
    };
    // Stub del resolver de dominio: entrega un contexto real con listas.
    const copasstResolver = {
      resolve: async () => ({
        company: { name: 'Empresa SAS', nit: '900123456', address: null, workerCount: 42 },
        copasst: { startDate: '2024-01-01', endDate: '2026-12-31', period: 'Periodo 2024-2026' },
        members: ['Ana Gómez — PRESIDENTE'],
        employerRepresentatives: ['Ana Gómez — PRESIDENTE'],
        workerRepresentatives: ['Luis Pérez — SECRETARIO'],
        functions: ['Función 1', 'Función 2'],
      }),
    } as unknown as CopasstVariableResolverService;
    const systemTemplateService = {
      ensureCopasstTemplate: async () => overrides?.template ?? buildSystemTemplate(),
    } as unknown as SystemTemplateService;
    const documentGenerationService = {
      generateDocument: async (...args: unknown[]) => {
        generateDocumentCalls.push(args);
        instanceData.approval = (args[0] as { approval?: unknown }).approval;
        instanceData.context = (args[0] as { context?: unknown }).context;
        instanceData.sourceModule = (args[0] as { sourceModule?: unknown }).sourceModule;
        instanceData.sourceEntity = (args[0] as { sourceEntity?: unknown }).sourceEntity;
        instanceData.sourceEntityId = (args[0] as { sourceEntityId?: unknown }).sourceEntityId;
        return {
          instanceId: new Types.ObjectId(),
          fileUrl: 'https://storage.googleapis.com/bucket/copasst.docx',
          storagePath: 'document-generation/company/copasst.docx',
          version: 1,
        };
      },
    } as unknown as DocumentGenerationService;

    // Constructor real de PhvaAdvancedService (23 params posicionales). Solo el
    // copasstPeriodModel, systemTemplateService, copasstResolver y
    // documentGenerationService se usan en este flujo; el resto son stubs.
    const service = new PhvaAdvancedService(
      { findById: () => ({ exec: async () => null }) } as never,      // responsableSstModel
      { findOne: async () => null, create: async () => period } as never, // responsibilitiesModel
      { findOne: async () => null, create: async () => period } as never, // resourceAssignmentModel
      { findOne: async () => null, create: async () => period } as never, // arlAffiliationsModel
      { findOne: async () => null, create: async () => period } as never, // specialPensionModel
      { findOne: async () => null, create: async () => period } as never, // trainingManagementModel
      { findOne: async () => null, create: async () => period } as never, // sstPolicyModel
      { findOne: async () => null, create: async () => period } as never, // sstObjectivesModel
      { findOne: async () => null, create: async () => period } as never, // trainingModel
      { findOne: async () => null, create: async () => period } as never, // inspectionActivityModel
      { findOne: async () => null, create: async () => period } as never, // incidentModel
      { findById: () => ({ exec: async () => null }) } as never,       // companyModel
      { findOne: async () => null, create: async () => period } as never, // employeeModel
      { findById: () => ({ exec: async () => null }) } as never,       // userModel
      { findOne: async () => null, create: async () => period } as never, // companyProfileModel
      { createUnique: async () => undefined, create: async () => undefined } as never, // alertsService
      { send: async () => undefined } as never,                       // autoCommService
      { getPolicyTemplate: async () => null } as never,               // policyTemplateService
      documentGenerationService,                                      // Fase 2
      systemTemplateService,                                          // Fase 2
      { resolve: async () => null } as never,                         // responsibleSgsstResolver (Fase 2)
      copasstPeriodModel as never,                                    // copasstPeriodModel (Fase 3)
      copasstResolver,                                                // copasstResolver (Fase 3)
      { resolve: async () => null } as never,                         // responsibilitiesResolver (Fase 4)
      { resolve: async () => null } as never,                         // resourceAssignmentResolver (Fase 5)
      { resolve: async () => null } as never,                         // sstPolicyResolver (Fase 6)
    );

    return { service, generateDocumentCalls, instanceData };
  }

  it('genera el documento COPASST con sourceModule PHVA_ADVANCED y sourceEntity COPASST', async () => {
    const { service, generateDocumentCalls } = buildService();

    const result = await service.generateCopasstDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(PERIOD_ID),
    });

    assert.ok(result.instanceId);
    assert.equal(generateDocumentCalls.length, 1);
    const request = generateDocumentCalls[0][0] as {
      templateId: string;
      sourceModule: string;
      sourceEntity: string;
      sourceEntityId: Types.ObjectId;
      context: Record<string, unknown>;
    };
    assert.equal(request.templateId, TEMPLATE_ID);
    assert.equal(request.sourceModule, 'PHVA_ADVANCED');
    assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_COPASST);
    assert.equal(request.sourceEntityId.toString(), PERIOD_ID);
  });

  it('formatea las listas de integrantes/funciones como texto multilínea para el renderer', async () => {
    const { service, generateDocumentCalls } = buildService();

    await service.generateCopasstDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(PERIOD_ID),
    });

    const context = generateDocumentCalls[0][0] as {
      context: Record<string, unknown>;
    };
    assert.equal(typeof context.context.members, 'string');
    assert.ok((context.context.members as string).includes('Ana Gómez'));
    assert.ok((context.context.functions as string).includes('Función 1'));
    const document = context.context.document as { code: string };
    assert.equal(document.code, 'PHVA-COPASST');
  });

  it('lanza NotFound si el periodo pertenece a otra empresa', async () => {
    const { service } = buildService({
      period: { companyId: new Types.ObjectId('64b0000000000000000000ff') },
    });

    await assert.rejects(
      () =>
        service.generateCopasstDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(PERIOD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza NotFound si el periodo no existe', async () => {
    const { service } = buildService({ period: null });

    await assert.rejects(
      () =>
        service.generateCopasstDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(PERIOD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza BadRequest si el periodo no está aprobado y no hay metadata de aprobación', async () => {
    const { service } = buildService({
      period: { approvalStatus: 'DRAFT' },
    });

    await assert.rejects(
      () =>
        service.generateCopasstDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(PERIOD_ID),
        }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /no está aprobado/.test(error.message),
    );
  });

  it('propaga los metadatos de aprobación hacia DocumentGenerationService', async () => {
    const { service, instanceData } = buildService();
    const approvedAt = new Date('2026-01-02T00:00:00.000Z');

    await service.generateCopasstDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(PERIOD_ID),
      approval: {
        status: 'APPROVED',
        approvedBy: new Types.ObjectId(USER_ID),
        approvedAt,
        approvalEventId: new Types.ObjectId('64b00000000000000000000c'),
        approvalRequestId: new Types.ObjectId('64b00000000000000000000a'),
      },
    });

    const approval = instanceData.approval as {
      status: string;
      approvedBy: Types.ObjectId;
      approvalEventId: Types.ObjectId;
    };
    assert.equal(approval.status, 'APPROVED');
    assert.equal(approval.approvedBy.toString(), USER_ID);
    assert.equal(approval.approvalEventId.toString(), '64b00000000000000000000c');
  });
});
