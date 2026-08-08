import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import { PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST } from '../document-generation/types/document-generation.types';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { ResponsibleSgsstVariableResolver } from './responsible-sgsst-variable-resolver.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';

/** ObjectIds válidos de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';
const TEMPLATE_ID = '64b000000000000000000004';

/** Plantilla de sistema devuelta por el stub de SystemTemplateService. */
function buildSystemTemplate(): DocumentTemplateDocument {
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    name: 'Responsable del SG-SST (PHVA 1.1.1)',
    documentType: 'PHVA_RESPONSIBLE_SG_SST' as never,
    format: 'DOCX' as never,
    source: 'SYSTEM' as never,
    variables: ['company.name'],
    storageUrl: 'system-templates/phva-advanced/responsable-sgsst-template.docx',
    version: 1,
    active: true,
  } as unknown as DocumentTemplateDocument;
}

describe('PhvaAdvancedService.generateResponsibleSgsstDocument', () => {
  function buildService(overrides?: {
    record?: Record<string, unknown>;
    template?: DocumentTemplateDocument | null;
  }): {
    service: PhvaAdvancedService;
    generateDocumentCalls: unknown[][];
    instanceData: Record<string, unknown>;
  } {
    const record = {
      _id: new Types.ObjectId(RECORD_ID),
      companyId: new Types.ObjectId(COMPANY_ID),
      itemCode: '1.1.1',
      complianceStatus: 'COMPLIES',
      currentVersion: '1.0',
      ...overrides?.record,
    };
    const generateDocumentCalls: unknown[][] = [];
    const instanceData: Record<string, unknown> = {};

    // Stubs de los modelos usados por PhvaAdvancedService solo en este flujo.
    const responsableSstModel = {
      findById: () => ({ exec: async () => record }),
    };
    const companyModel = {
      findById: () => ({ exec: async () => null }),
    };
    const userModel = {
      findById: () => ({ exec: async () => null }),
    };
    const systemTemplateService = {
      ensureResponsibleSgsstTemplate: async () =>
        overrides?.template ?? buildSystemTemplate(),
    } as unknown as SystemTemplateService;
    const resolver = new ResponsibleSgsstVariableResolver(
      responsableSstModel as never,
      companyModel as never,
      userModel as never,
    );
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
          fileUrl: 'https://storage.googleapis.com/bucket/doc.docx',
          storagePath: 'document-generation/company/doc.docx',
          version: 1,
        };
      },
    } as unknown as DocumentGenerationService;

    // Constructor real de PhvaAdvancedService (23 params posicionales): 16
    // modelos + alerts + autoComm + policyTemplate + 3 dependencias de Fase 2
    // (documentGenerationService, systemTemplateService, resolver) + 2
    // dependencias de Fase 3 (copasstPeriodModel, copasstResolver).
    const service = new PhvaAdvancedService(
      responsableSstModel as never,                                // responsableSstModel
      { findOne: async () => null, create: async () => record } as never, // responsibilitiesModel
      { findOne: async () => null, create: async () => record } as never, // resourceAssignmentModel
      { findOne: async () => null, create: async () => record } as never, // arlAffiliationsModel
      { findOne: async () => null, create: async () => record } as never, // specialPensionModel
      { findOne: async () => null, create: async () => record } as never, // trainingManagementModel
      { findOne: async () => null, create: async () => record } as never, // sstPolicyModel
      { findOne: async () => null, create: async () => record } as never, // sstObjectivesModel
      { findOne: async () => null, create: async () => record } as never, // trainingModel
      { findOne: async () => null, create: async () => record } as never, // inspectionActivityModel
      { findOne: async () => null, create: async () => record } as never, // incidentModel
      companyModel as never,                                      // companyModel
      { findOne: async () => null, create: async () => record } as never, // employeeModel
      userModel as never,                                         // userModel
      { findOne: async () => null, create: async () => record } as never, // companyProfileModel
      { createUnique: async () => undefined, create: async () => undefined } as never, // alertsService
      { send: async () => undefined } as never,                   // autoCommService
      { getPolicyTemplate: async () => null } as never,           // policyTemplateService
      documentGenerationService,                                  // Fase 2
      systemTemplateService,                                      // Fase 2
      resolver,                                                   // Fase 2
      { findById: () => ({ exec: async () => null }) } as never,  // copasstPeriodModel (Fase 3)
      { resolve: async () => null } as never,                     // copasstResolver (Fase 3)
      { resolve: async () => null } as never,                     // responsibilitiesResolver (Fase 4)
      { resolve: async () => null } as never,                     // resourceAssignmentResolver (Fase 5)
      { resolve: async () => null } as never,                     // sstPolicyResolver (Fase 6)
    );

    return { service, generateDocumentCalls, instanceData };
  }

  it('genera el documento PHVA 1.1.1 con sourceModule PHVA_ADVANCED y sourceEntity RESPONSIBLE_SG_SST', async () => {
    const { service, generateDocumentCalls } = buildService();

    const result = await service.generateResponsibleSgsstDocument({
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
    assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST);
    assert.equal(request.sourceEntityId.toString(), RECORD_ID);
    // Contexto: dominio + control documental + aprobación pendiente.
    assert.ok(request.context.company);
    assert.ok(request.context.responsible);
    assert.equal((request.context.document as { code: string }).code, 'PHVA-1.1.1');
  });

  it('lanza NotFound si el registro pertenece a otra empresa', async () => {
    const { service } = buildService({
      record: { companyId: new Types.ObjectId('64b0000000000000000000ff') },
    });

    await assert.rejects(
      () =>
        service.generateResponsibleSgsstDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza BadRequest si el punto 1.1.1 no está completo (complianceStatus distinto de COMPLIES)', async () => {
    const { service } = buildService({ record: { complianceStatus: 'PENDING' } });

    await assert.rejects(
      () =>
        service.generateResponsibleSgsstDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /no está completo/.test(error.message),
    );
  });

  it('propaga los metadatos de aprobación hacia DocumentGenerationService', async () => {
    const { service, instanceData } = buildService();
    const approvedAt = new Date('2026-01-02T00:00:00.000Z');

    await service.generateResponsibleSgsstDocument({
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
