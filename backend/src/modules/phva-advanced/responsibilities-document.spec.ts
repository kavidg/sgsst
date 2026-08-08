import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import { ResponsibilitiesVariableResolverService } from './responsibilities-variable-resolver.service';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';
import { PHVA_SOURCE_ENTITY_RESPONSIBILITIES } from '../document-generation/types/document-generation.types';

/** ObjectIds válidos de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';
const TEMPLATE_ID = '64b000000000000000000004';

/** Plantilla de sistema devuelta por el stub de SystemTemplateService. */
function buildSystemTemplate(): DocumentTemplateDocument {
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    name: 'Matriz de Responsabilidades del SG-SST (PHVA 1.1.2)',
    documentType: 'PHVA_RESPONSIBILITIES' as never,
    format: 'DOCX' as never,
    source: 'SYSTEM' as never,
    variables: ['company.name'],
    storageUrl: 'system-templates/phva-advanced/responsibilities-template.docx',
    version: 1,
    active: true,
  } as unknown as DocumentTemplateDocument;
}

/** Registro 1.1.2 con fila __META__ aprobada (equivalente a approve). */
function buildRecord() {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.2',
    complianceStatus: 'COMPLIES',
    complianceReason: 'Cumple con responsabilidades, asignaciones y firmas requeridas.',
    responsibilities: [
      {
        title: 'Responsable del SG-SST',
        category: 'Dirección',
        role: 'MANAGER',
        employeeId: new Types.ObjectId('64b00000000000000000000b'),
        active: true,
        requiresSignature: true,
        status: 'PENDING',
        signature: { accepted: true, signedAt: new Date(), version: 1 },
      },
      {
        title: '__META__',
        category: JSON.stringify({
          approvalStatus: 'APPROVED',
          locked: true,
          currentVersion: '1.2',
        }),
        role: 'SYSTEM',
        active: false,
        requiresSignature: false,
        status: 'PENDIENTE',
        signature: { accepted: false, version: 1 },
      },
    ],
  };
}

describe('PhvaAdvancedService.generateResponsibilitiesDocument', () => {
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

    // Stub del modelo responsibilities (usado por findResponsibilitiesById).
    const responsibilitiesModel = {
      findById: () => ({
        exec: async () => (overrides?.record === null ? null : record),
      }),
      findOne: async () => null,
      create: async () => record,
    };
    // Stub del resolver de dominio: contexto real con listas.
    const responsibilitiesResolver = {
      resolve: async () => ({
        company: { name: 'Empresa SAS', nit: '900123456' },
        responsibilities: {
          title: 'Matriz de Responsabilidades del SG-SST',
          description: 'Cumple con responsabilidades, asignaciones y firmas requeridas.',
        },
        responsible: {
          name: 'Ana Gómez',
          position: 'Representante Legal',
          functions: 'Representa legalmente a la empresa en el SG-SST.',
        },
        responsiblePersons: ['Responsable del SG-SST — MANAGER'],
        assignments: ['Responsable del SG-SST — asignado (firmado)'],
        legalRepresentative: { name: 'Ana Gómez', signed: true },
      }),
    } as unknown as ResponsibilitiesVariableResolverService;
    const systemTemplateService = {
      ensureResponsibilitiesTemplate: async () =>
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
          fileUrl: 'https://storage.googleapis.com/bucket/responsibilities.docx',
          storagePath: 'document-generation/company/responsibilities.docx',
          version: 1,
        };
      },
    } as unknown as DocumentGenerationService;

    // Constructor real de PhvaAdvancedService (24 params posicionales).
    const service = new PhvaAdvancedService(
      { findById: () => ({ exec: async () => null }) } as never,      // responsableSstModel
      responsibilitiesModel as never,                                 // responsibilitiesModel
      { findOne: async () => null, create: async () => record } as never, // resourceAssignmentModel
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
      responsibilitiesResolver,                                       // responsibilitiesResolver (Fase 4)
      { resolve: async () => null } as never,                         // resourceAssignmentResolver (Fase 5)
      { resolve: async () => null } as never,                         // sstPolicyResolver (Fase 6)
    );

    return { service, generateDocumentCalls, instanceData };
  }

  it('genera el documento con sourceModule PHVA_ADVANCED y sourceEntity RESPONSIBILITIES', async () => {
    const { service, generateDocumentCalls } = buildService();

    const result = await service.generateResponsibilitiesDocument({
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
    assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_RESPONSIBILITIES);
    assert.equal(request.sourceEntityId.toString(), RECORD_ID);
  });

  it('formatea las listas de responsables/asignaciones como texto multilínea', async () => {
    const { service, generateDocumentCalls } = buildService();

    await service.generateResponsibilitiesDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: new Types.ObjectId(RECORD_ID),
    });

    const context = generateDocumentCalls[0][0] as {
      context: Record<string, unknown>;
    };
    assert.equal(typeof context.context.responsiblePersons, 'string');
    assert.ok(
      (context.context.responsiblePersons as string).includes(
        'Responsable del SG-SST',
      ),
    );
    const document = context.context.document as { code: string };
    assert.equal(document.code, 'PHVA-1.1.2');
  });

  it('lanza NotFound si el registro pertenece a otra empresa', async () => {
    const { service } = buildService({
      record: { companyId: new Types.ObjectId('64b0000000000000000000ff') },
    });

    await assert.rejects(
      () =>
        service.generateResponsibilitiesDocument({
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
        service.generateResponsibilitiesDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          sourceEntityId: new Types.ObjectId(RECORD_ID),
        }),
      NotFoundException,
    );
  });

  it('lanza BadRequest si el registro no está aprobado (REJECTED) y no hay metadata', async () => {
    const { service } = buildService({
      record: {
        responsibilities: [
          {
            title: '__META__',
            category: JSON.stringify({ approvalStatus: 'REJECTED' }),
            role: 'SYSTEM',
            active: false,
            requiresSignature: false,
            status: 'PENDIENTE',
            signature: { accepted: false, version: 1 },
          },
        ],
      },
    });

    await assert.rejects(
      () =>
        service.generateResponsibilitiesDocument({
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

    await service.generateResponsibilitiesDocument({
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
