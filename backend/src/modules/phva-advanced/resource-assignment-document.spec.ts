import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import { ResourceAssignmentVariableResolverService } from './resource-assignment-variable-resolver.service';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';
import { PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT } from '../document-generation/types/document-generation.types';

/** ObjectIds válidos de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';
const TEMPLATE_ID = '64b000000000000000000004';

/** Plantilla de sistema devuelta por el stub de SystemTemplateService. */
function buildSystemTemplate(): DocumentTemplateDocument {
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    name: 'Asignación de Recursos para el SG-SST (PHVA 1.1.3)',
    documentType: 'PHVA_RESOURCE_ASSIGNMENT' as never,
    format: 'DOCX' as never,
    source: 'SYSTEM' as never,
    variables: ['company.name'],
    storageUrl: 'system-templates/phva-advanced/resource-assignment-template.docx',
    version: 1,
    active: true,
  } as unknown as DocumentTemplateDocument;
}

/** Registro 1.1.3 aprobado con recursos y aprobador. */
function buildRecord() {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.3',
    approvalStatus: 'APPROVED',
    currentVersion: '1.2',
    humanResources: [
      { employeeId: 'emp-1', role: 'Profesional SST', responsibilities: [], active: true },
    ],
    technicalResources: [
      { name: 'Software SG-SST', status: 'OPERATIVO', quantity: 2, responsible: '' },
    ],
    financialResources: [
      { concept: 'Capacitación', description: '', value: 5000000, status: 'APROBADO', responsible: '' },
    ],
    evidences: [{ fileName: 'evidencia-presupuesto.pdf', fileUrl: 'https://bucket/x' }],
    approvedBy: {
      userId: '64b00000000000000000000a',
      email: 'manager@empresa.com',
      role: 'manager',
      timestamp: '2026-01-02T00:00:00.000Z',
    },
  };
}

describe('PhvaAdvancedService.generateResourceAssignmentDocument', () => {
  function buildService(overrides?: {
    record?: Record<string, unknown> | null;
    template?: DocumentTemplateDocument | null;
  }): {
    service: PhvaAdvancedService;
    generateDocumentCalls: unknown[][];
    instanceData: Record<string, unknown>;
  } {
    const record = {
      ...buildRecord(),
      ...overrides?.record,
    };
    const generateDocumentCalls: unknown[][] = [];
    const instanceData: Record<string, unknown> = {};

    // Stub del modelo resource assignment (usado por findResourceAssignmentById).
    const resourceAssignmentModel = {
      findById: () => ({
        exec: async () => (overrides?.record === null ? null : record),
      }),
      findOne: async () => null,
      create: async () => record,
    };
    // Stub del resolver de dominio: contexto real con listas.
    const resourceAssignmentResolver = {
      resolve: async () => ({
        company: { name: 'Empresa SAS', nit: '900123456' },
        resources: {
          human: ['Profesional SST'],
          technical: ['Software SG-SST (2) — OPERATIVO'],
          financial: ['Capacitación — $5.000.000 (APROBADO)'],
          physical: ['evidencia-presupuesto.pdf'],
        },
        assignment: { responsible: 'manager@empresa.com' },
      }),
    } as unknown as ResourceAssignmentVariableResolverService;
    const systemTemplateService = {
      ensureResourceAssignmentTemplate: async () =>
        overrides?.template ?? buildSystemTemplate(),
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
          fileUrl: 'https://storage.googleapis.com/bucket/resource-assignment.docx',
          storagePath: 'document-generation/company/resource-assignment.docx',
          version: 1,
        };
      },
    } as unknown as DocumentGenerationService;

    // Constructor real de PhvaAdvancedService (25 params posicionales).
    const service = new PhvaAdvancedService(
      { findById: () => ({ exec: async () => null }) } as never,      // responsableSstModel
      { findOne: async () => null, create: async () => record } as never, // responsibilitiesModel
      resourceAssignmentModel as never,                               // resourceAssignmentModel
      { findOne: async () => null, create: async () => record } as never, // arlAffiliationsModel
      { findOne: async () => null, create: async () => record } as never, // specialPensionModel
      { findOne: async () => null, create: async () => record } as never, // trainingManagementModel
      { findOne: async () => null, create: async () => record } as never, // sstPolicyModel
      { findOne: async () => null, create: async () => record } as never, // sstObjectivesModel
      { findOne: async () => null, create: async () => record } as never, // trainingModel
      { findOne: async () => null, create: async () => record } as never, // inspectionActivityModel
      { findOne: async () => null, create: async () => record } as never, // incidentModel
      { findById: () => ({ exec: async () => null }) } as never,       // companyModel
      { findOne: async () => null, create: async () => record } as never, // employeeModel
      { findById: () => ({ exec: async () => null }) } as never,       // userModel
      { findOne: async () => null, create: async () => record } as never, // companyProfileModel
      { createUnique: async () => undefined, create: async () => undefined } as never, // alertsService
      { send: async () => undefined } as never,                       // autoCommService
      { getPolicyTemplate: async () => null } as never,               // policyTemplateService
      documentGenerationService,                                      // Fase 2
      systemTemplateService,                                          // Fase 2
      { resolve: async () => null } as never,                         // responsibleSgsstResolver (Fase 2)
      { findById: () => ({ exec: async () => null }) } as never,      // copasstPeriodModel (Fase 3)
      { resolve: async () => null } as never,                         // copasstResolver (Fase 3)
      { resolve: async () => null } as never,                         // responsibilitiesResolver (Fase 4)
      resourceAssignmentResolver,                                     // resourceAssignmentResolver (Fase 5)
      { resolve: async () => null } as never,                         // sstPolicyResolver (Fase 6)
    );

    return { service, generateDocumentCalls, instanceData };
  }

  it('genera el documento con sourceModule PHVA_ADVANCED y sourceEntity RESOURCE_ASSIGNMENT', async () => {
    const { service, generateDocumentCalls } = buildService();

    const result = await service.generateResourceAssignmentDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(RECORD_ID),
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
    assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT);
    assert.equal(request.sourceEntityId.toString(), RECORD_ID);
  });

  it('formatea las listas de recursos como texto multilínea', async () => {
    const { service, generateDocumentCalls } = buildService();

    await service.generateResourceAssignmentDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(RECORD_ID),
    });

    const context = generateDocumentCalls[0][0] as {
      context: Record<string, unknown>;
    };
    const resources = context.context.resources as {
      human: string;
      technical: string;
      financial: string;
      physical: string;
    };
    assert.equal(typeof resources.human, 'string');
    assert.ok(resources.human.includes('Profesional SST'));
    assert.ok(resources.technical.includes('Software SG-SST'));
    const document = context.context.document as { code: string };
    assert.equal(document.code, 'PHVA-1.1.3');
  });

  it('lanza NotFound si el registro pertenece a otra empresa', async () => {
    const { service } = buildService({
      record: { companyId: new Types.ObjectId('64b0000000000000000000ff') },
    });

    await assert.rejects(
      () =>
        service.generateResourceAssignmentDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza NotFound si el registro no existe', async () => {
    const { service } = buildService({ record: null });

    await assert.rejects(
      () =>
        service.generateResourceAssignmentDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza BadRequest si el registro no está aprobado (REJECTED) y no hay metadata', async () => {
    const { service } = buildService({
      record: { approvalStatus: 'REJECTED' },
    });

    await assert.rejects(
      () =>
        service.generateResourceAssignmentDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /no está aprobado/.test(error.message),
    );
  });

  it('propaga los metadatos de aprobación hacia DocumentGenerationService', async () => {
    const { service, instanceData } = buildService();
    const approvedAt = new Date('2026-01-02T00:00:00.000Z');

    await service.generateResourceAssignmentDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(RECORD_ID),
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
