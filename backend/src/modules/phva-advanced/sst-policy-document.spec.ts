import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import { SstPolicyVariableResolverService } from './sst-policy-variable-resolver.service';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';
import { PHVA_SOURCE_ENTITY_SST_POLICY } from '../document-generation/types/document-generation.types';

/** ObjectIds válidos de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';
const TEMPLATE_ID = '64b000000000000000000004';

/** Plantilla de sistema devuelta por el stub de SystemTemplateService. */
function buildSystemTemplate(): DocumentTemplateDocument {
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    name: 'Política de Seguridad y Salud en el Trabajo (PHVA 2.1.1)',
    documentType: 'PHVA_SST_POLICY' as never,
    format: 'DOCX' as never,
    source: 'SYSTEM' as never,
    variables: ['company.name'],
    storageUrl: 'system-templates/phva-advanced/sst-policy-template.docx',
    version: 1,
    active: true,
  } as unknown as DocumentTemplateDocument;
}

/** Registro de la política SST aprobado con contenido y versión vigente. */
function buildPolicy() {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '2.1.1',
    documentCode: 'SST-POL-001',
    documentName: 'Política de Seguridad y Salud en el Trabajo',
    currentVersion: '1.0',
    status: 'Aprobado',
    content:
      'La empresa se compromete a implementar el SG-SST garantizando la salud y seguridad de sus trabajadores.',
    versions: [
      {
        version: '1.0',
        content: 'Contenido vigente',
        status: 'Aprobado',
        issuedAt: new Date('2026-01-01T00:00:00.000Z'),
        approvedAt: new Date('2026-01-02T00:00:00.000Z'),
        expiresAt: new Date('2027-01-02T00:00:00.000Z'),
        archived: false,
      },
    ],
  };
}

describe('PhvaAdvancedService.generateSstPolicyDocument', () => {
  function buildService(overrides?: {
    record?: Record<string, unknown> | null;
    template?: DocumentTemplateDocument | null;
  }): {
    service: PhvaAdvancedService;
    generateDocumentCalls: unknown[][];
    instanceData: Record<string, unknown>;
  } {
    const record = {
      ...buildPolicy(),
      ...overrides?.record,
    };
    const generateDocumentCalls: unknown[][] = [];
    const instanceData: Record<string, unknown> = {};

    // Stub del modelo sstPolicy (usado por findSstPolicyById).
    const sstPolicyModel = {
      findById: () => ({
        exec: async () => (overrides?.record === null ? null : record),
      }),
      findOne: async () => null,
      create: async () => record,
    };
    // Stub del resolver de dominio: contexto real de la política.
    const sstPolicyResolver = {
      resolve: async () => ({
        company: { name: 'Empresa SAS', nit: '900123456', address: null, city: null },
        policy: {
          objective: null,
          scope: null,
          commitments: null,
          content: 'La empresa se compromete a implementar el SG-SST.',
          legalFramework: null,
          version: '1.0',
          reviewDate: '2027-01-02T00:00:00.000Z',
        },
      }),
    } as unknown as SstPolicyVariableResolverService;
    const systemTemplateService = {
      ensureSstPolicyTemplate: async () =>
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
          fileUrl: 'https://storage.googleapis.com/bucket/sst-policy.docx',
          storagePath: 'document-generation/company/sst-policy.docx',
          version: 1,
        };
      },
    } as unknown as DocumentGenerationService;

    // Constructor real de PhvaAdvancedService (26 params posicionales).
    const service = new PhvaAdvancedService(
      { findById: () => ({ exec: async () => null }) } as never,      // responsableSstModel
      { findOne: async () => null, create: async () => record } as never, // responsibilitiesModel
      { findOne: async () => null, create: async () => record } as never, // resourceAssignmentModel
      { findOne: async () => null, create: async () => record } as never, // arlAffiliationsModel
      { findOne: async () => null, create: async () => record } as never, // specialPensionModel
      { findOne: async () => null, create: async () => record } as never, // trainingManagementModel
      sstPolicyModel as never,                                        // sstPolicyModel
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
      { resolve: async () => null } as never,                         // resourceAssignmentResolver (Fase 5)
      sstPolicyResolver,                                              // sstPolicyResolver (Fase 6)
    );

    return { service, generateDocumentCalls, instanceData };
  }

  it('genera el documento con sourceModule PHVA_ADVANCED y sourceEntity SST_POLICY', async () => {
    const { service, generateDocumentCalls } = buildService();

    const result = await service.generateSstPolicyDocument({
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
    assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_SST_POLICY);
    assert.equal(request.sourceEntityId.toString(), RECORD_ID);
  });

  it('incluye control documental (código, versión) y aprobación en el contexto', async () => {
    const { service, generateDocumentCalls } = buildService();

    await service.generateSstPolicyDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(RECORD_ID),
    });

    const context = generateDocumentCalls[0][0] as {
      context: Record<string, unknown>;
    };
    const document = context.context.document as { code: string; version: string };
    assert.equal(document.code, 'PHVA-2.1.1');
    assert.equal(document.version, '1.0');
    const policy = context.context.policy as { content: string; reviewDate: string };
    assert.ok(policy.content.includes('implementar el SG-SST'));
    assert.equal(policy.reviewDate, '2027-01-02T00:00:00.000Z');
  });

  it('lanza NotFound si el registro pertenece a otra empresa', async () => {
    const { service } = buildService({
      record: { companyId: new Types.ObjectId('64b0000000000000000000ff') },
    });

    await assert.rejects(
      () =>
        service.generateSstPolicyDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza NotFound si la política no existe', async () => {
    const { service } = buildService({ record: null });

    await assert.rejects(
      () =>
        service.generateSstPolicyDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza BadRequest si la política no está aprobada (Borrador) y no hay metadata', async () => {
    const { service } = buildService({
      record: { status: 'Borrador' },
    });

    await assert.rejects(
      () =>
        service.generateSstPolicyDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /no está aprobada/.test(error.message),
    );
  });

  it('propaga los metadatos de aprobación hacia DocumentGenerationService', async () => {
    const { service, instanceData } = buildService();
    const approvedAt = new Date('2026-01-02T00:00:00.000Z');

    await service.generateSstPolicyDocument({
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
