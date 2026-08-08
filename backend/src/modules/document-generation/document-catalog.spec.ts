import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { DocumentCatalogService } from './services/document-catalog.service';
import {
  DocumentInstance,
  DocumentInstanceDocument,
} from './schemas/document-instance.schema';
import {
  DocumentTemplate,
  DocumentTemplateDocument,
} from './schemas/document-template.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { DocumentStatus, DocumentTemplateType } from './types/document-generation.types';
import { DocumentSourceModule, RendererFormat } from './types/renderer.types';

const COMPANY_A = '64b000000000000000000001';
const COMPANY_B = '64b000000000000000000002';
const TEMPLATE_POLICY = '64b000000000000000000003';
const TEMPLATE_COPASST = '64b000000000000000000004';
const INSTANCE_1 = '64b000000000000000000005';
const INSTANCE_2 = '64b000000000000000000006';
const INSTANCE_3 = '64b000000000000000000007';
const APPROVER_ID = '64b000000000000000000008';

/** Mini-motor de filtros Mongo soportando igualdad, $in, $or, $gte/$lte, $ne y regex. */
function matches(filter: Record<string, unknown>, row: Record<string, unknown>): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$or') {
      const or = condition as Array<Record<string, unknown>>;
      if (!or.some((sub) => matches(sub, row))) return false;
      continue;
    }
    const value = row[key];

    if (condition instanceof RegExp) {
      if (typeof value !== 'string' || !condition.test(value)) return false;
      continue;
    }

    // Los ObjectId son objetos pero NO son contenedores de operadores:
    // se comparan por igualdad directa antes de entrar al branch de $in/$ne/etc.
    if (condition instanceof Types.ObjectId) {
      if (!eq(condition, value)) return false;
      continue;
    }

    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const operators = condition as Record<string, unknown>;
      if ('$in' in operators) {
        const list = operators.$in as unknown[];
        if (!list.some((item) => eq(item, value))) return false;
      }
      if ('$ne' in operators) {
        if (eq(operators.$ne, value)) return false;
      }
      if ('$gte' in operators) {
        if (!(value as Date).getTime || (value as Date).getTime() < (operators.$gte as Date).getTime()) return false;
      }
      if ('$lte' in operators) {
        if (!(value as Date).getTime || (value as Date).getTime() > (operators.$lte as Date).getTime()) return false;
      }
      continue;
    }

    if (!eq(condition, value)) return false;
  }
  return true;
}

function eq(a: unknown, b: unknown): boolean {
  if (a instanceof Types.ObjectId || b instanceof Types.ObjectId) {
    return a?.toString() === b?.toString();
  }
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date).getTime() === new Date(b as Date).getTime();
  }
  return a === b;
}

interface TestData {
  instances: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
  companies: Array<Record<string, unknown>>;
}

function buildData(): TestData {
  return {
    instances: [
      {
        _id: new Types.ObjectId(INSTANCE_1),
        companyId: new Types.ObjectId(COMPANY_A),
        templateId: new Types.ObjectId(TEMPLATE_POLICY),
        sourceModule: DocumentSourceModule.PHVA_ADVANCED,
        sourceEntity: 'SST_POLICY',
        sourceEntityId: new Types.ObjectId('64b00000000000000000000a'),
        status: DocumentStatus.APPROVED,
        format: RendererFormat.DOCX,
        fileUrl: 'https://storage.googleapis.com/bucket/policy.docx',
        storagePath: 'document-generation/company/policy.docx',
        version: 2,
        generatedAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        approvedAt: new Date('2026-02-02T00:00:00.000Z'),
        approvedBy: new Types.ObjectId(APPROVER_ID),
        approvalStatus: 'APPROVED',
        approvalEventId: new Types.ObjectId('64b00000000000000000000b'),
      },
      {
        _id: new Types.ObjectId(INSTANCE_2),
        companyId: new Types.ObjectId(COMPANY_A),
        templateId: new Types.ObjectId(TEMPLATE_COPASST),
        sourceModule: DocumentSourceModule.PHVA_ADVANCED,
        sourceEntity: 'COPASST',
        sourceEntityId: new Types.ObjectId('64b00000000000000000000c'),
        status: DocumentStatus.GENERATED,
        format: RendererFormat.DOCX,
        fileUrl: 'https://storage.googleapis.com/bucket/copasst.docx',
        storagePath: 'document-generation/company/copasst.docx',
        version: 1,
        generatedAt: new Date('2026-03-01T00:00:00.000Z'),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        _id: new Types.ObjectId(INSTANCE_3),
        companyId: new Types.ObjectId(COMPANY_B),
        templateId: new Types.ObjectId(TEMPLATE_POLICY),
        sourceModule: DocumentSourceModule.PHVA_ADVANCED,
        sourceEntity: 'SST_POLICY',
        sourceEntityId: new Types.ObjectId('64b00000000000000000000d'),
        status: DocumentStatus.GENERATED,
        format: RendererFormat.DOCX,
        fileUrl: 'https://storage.googleapis.com/bucket/policy-b.docx',
        storagePath: 'document-generation/company/policy-b.docx',
        version: 1,
        generatedAt: new Date('2026-04-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ],
    templates: [
      {
        _id: new Types.ObjectId(TEMPLATE_POLICY),
        name: 'Política de Seguridad y Salud en el Trabajo',
        documentType: DocumentTemplateType.PHVA_SST_POLICY,
        version: 3,
      },
      {
        _id: new Types.ObjectId(TEMPLATE_COPASST),
        name: 'Conformación del COPASST',
        documentType: DocumentTemplateType.PHVA_COPASST,
        version: 1,
      },
    ],
    companies: [
      { _id: new Types.ObjectId(COMPANY_A), name: 'Empresa A SAS' },
      { _id: new Types.ObjectId(COMPANY_B), name: 'Empresa B SAS' },
    ],
  };
}

function buildService(data: TestData): {
  service: DocumentCatalogService;
} {
  // Chain stubs de Mongoose (sort/skip/limit/select → exec).
  function buildInstanceModel() {
    const chain = (filter: Record<string, unknown>) => {
      const state: { sort?: Record<string, 1 | -1>; skip?: number; limit?: number } = {};
      const c = {
        sort: (sort: Record<string, 1 | -1>) => {
          state.sort = sort;
          return c;
        },
        skip: (skip: number) => {
          state.skip = skip;
          return c;
        },
        limit: (limit: number) => {
          state.limit = limit;
          return c;
        },
        select: () => c,
        exec: async () => {
          let rows = data.instances.filter((row) => matches(filter, row));
          if (state.sort) {
            const [field, direction] = Object.entries(state.sort)[0];
            rows = [...rows].sort((a, b) => {
              const av = a[field] as unknown;
              const bv = b[field] as unknown;
              const cmp =
                av instanceof Date && bv instanceof Date
                  ? av.getTime() - bv.getTime()
                  : av instanceof Types.ObjectId
                    ? (av as Types.ObjectId).toString().localeCompare((bv as Types.ObjectId).toString())
                    : String(av).localeCompare(String(bv));
              return cmp * direction;
            });
          }
          if (state.skip) rows = rows.slice(state.skip);
          if (state.limit) rows = rows.slice(0, state.limit);
          return rows;
        },
      };
      return c;
    };

    return {
      countDocuments: (filter: Record<string, unknown>) => ({
        exec: async () => data.instances.filter((row) => matches(filter, row)).length,
      }),
      find: (filter: Record<string, unknown>) => chain(filter),
      findById: (id: Types.ObjectId) => ({
        exec: async () =>
          data.instances.find((row) => eq(row._id, id)) ?? null,
      }),
    } as unknown as Model<DocumentInstanceDocument>;
  }

  function buildTemplateModel() {
    return {
      find: (filter: Record<string, unknown>) => ({
        select: () => ({
          exec: async () => data.templates.filter((row) => matches(filter, row)),
        }),
        exec: async () => data.templates.filter((row) => matches(filter, row)),
      }),
      findById: (id: Types.ObjectId) => ({
        exec: async () =>
          data.templates.find((row) => eq(row._id, id)) ?? null,
      }),
    } as unknown as Model<DocumentTemplateDocument>;
  }

  function buildCompanyModel() {
    return {
      find: (filter: Record<string, unknown>) => ({
        exec: async () => data.companies.filter((row) => matches(filter, row)),
      }),
      findById: (id: Types.ObjectId) => ({
        exec: async () =>
          data.companies.find((row) => eq(row._id, id)) ?? null,
      }),
    } as unknown as Model<CompanyDocument>;
  }

  const service = new DocumentCatalogService(
    buildInstanceModel(),
    buildTemplateModel(),
    buildCompanyModel(),
  );

  return { service };
}

describe('DocumentCatalogService.list', () => {
  it('devuelve catálogo vacío cuando no existen instancias', async () => {
    const { service } = buildService({ instances: [], templates: [], companies: [] });

    const page = await service.list({});

    assert.equal(page.items.length, 0);
    assert.equal(page.total, 0);
    assert.equal(page.totalPages, 0);
  });

  it('devuelve todos los documentos sin filtros (paginación default)', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({});

    assert.equal(page.total, 3);
    assert.equal(page.items.length, 3);
    assert.equal(page.page, 1);
    assert.equal(page.limit, 20);
    assert.equal(page.totalPages, 1);
  });

  it('enriquece el ViewModel con title, documentType y companyName', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({});

    const policy = page.items.find((item) => item.id === INSTANCE_1);
    assert.ok(policy);
    assert.equal(policy.title, 'Política de Seguridad y Salud en el Trabajo');
    assert.equal(policy.documentType, DocumentTemplateType.PHVA_SST_POLICY);
    assert.equal(policy.companyName, 'Empresa A SAS');
    assert.equal(policy.downloadUrl, 'https://storage.googleapis.com/bucket/policy.docx');
    assert.equal(policy.status, DocumentStatus.APPROVED);
    assert.equal(policy.version, 2);
    assert.equal(policy.sourceModule, DocumentSourceModule.PHVA_ADVANCED);
    assert.equal(policy.sourceEntity, 'SST_POLICY');
    assert.equal(policy.approvedAt?.toISOString(), '2026-02-02T00:00:00.000Z');
    assert.equal(policy.approvedBy, APPROVER_ID);
  });

  it('filtra por companyId', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ companyId: COMPANY_B });

    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, INSTANCE_3);
    assert.equal(page.items[0].companyName, 'Empresa B SAS');
  });

  it('filtra por status', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ status: DocumentStatus.APPROVED });

    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, INSTANCE_1);
  });

  it('filtra por sourceModule', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ sourceModule: DocumentSourceModule.PHVA_ADVANCED });

    assert.equal(page.total, 3);
  });

  it('filtra por documentType resolviendo templateIds', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ documentType: DocumentTemplateType.PHVA_COPASST });

    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, INSTANCE_2);
  });

  it('devuelve vacío cuando documentType no tiene plantillas', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ documentType: DocumentTemplateType.PHVA_RESPONSIBLE_SG_SST });

    assert.equal(page.total, 0);
    assert.equal(page.items.length, 0);
  });

  it('busca por texto en el título de la plantilla', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ search: 'copasst' });

    assert.equal(page.total, 1);
    assert.equal(page.items[0].id, INSTANCE_2);
  });

  it('busca por texto en la entidad de origen', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ search: 'sst_policy' });

    assert.equal(page.total, 2);
  });

  it('filtra por rango de fechas generatedFrom/generatedTo', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({
      generatedFrom: '2026-03-01T00:00:00.000Z',
      generatedTo: '2026-04-01T00:00:00.000Z',
    });

    assert.equal(page.total, 2);
  });

  it('pagina correctamente (limit y page)', async () => {
    const { service } = buildService(buildData());

    const page1 = await service.list({ limit: 2, page: 1 });
    assert.equal(page1.items.length, 2);
    assert.equal(page1.total, 3);
    assert.equal(page1.totalPages, 2);

    const page2 = await service.list({ limit: 2, page: 2 });
    assert.equal(page2.items.length, 1);
    assert.equal(page2.total, 3);
  });

  it('ordena por generatedAt ascendente explícito', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ sort: 'generatedAt' });

    assert.equal(page.items[0].id, INSTANCE_1); // Feb
    assert.equal(page.items[2].id, INSTANCE_3); // Abr
  });

  it('ordena por generatedAt descendente (-generatedAt)', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({ sort: '-generatedAt' });

    assert.equal(page.items[0].id, INSTANCE_3); // Abr
    assert.equal(page.items[2].id, INSTANCE_1); // Feb
  });
});

describe('DocumentCatalogService.listByCompany', () => {
  it('fuerza el filtro por empresa y enriquece companyName', async () => {
    const { service } = buildService(buildData());

    const page = await service.listByCompany(COMPANY_A, {});

    assert.equal(page.total, 2);
    assert.ok(page.items.every((item) => item.companyId === COMPANY_A));
  });

  it('lanza BadRequest con companyId inválido', async () => {
    const { service } = buildService(buildData());

    await assert.rejects(
      () => service.listByCompany('not-an-objectid', {}),
      BadRequestException,
    );
  });
});

describe('DocumentCatalogService.getById', () => {
  it('devuelve el detalle con metadatos de aprobación y versiones', async () => {
    const { service } = buildService(buildData());

    const detail = await service.getById(INSTANCE_1);

    assert.equal(detail.id, INSTANCE_1);
    assert.equal(detail.title, 'Política de Seguridad y Salud en el Trabajo');
    assert.equal(detail.companyName, 'Empresa A SAS');
    assert.equal(detail.storagePath, 'document-generation/company/policy.docx');
    assert.equal(detail.sourceEntityId, '64b00000000000000000000a');
    assert.equal(detail.templateId, TEMPLATE_POLICY);
    assert.equal(detail.template?.documentType, DocumentTemplateType.PHVA_SST_POLICY);
    assert.deepEqual(detail.approval, {
      status: 'APPROVED',
      approvedBy: APPROVER_ID,
      approvedAt: new Date('2026-02-02T00:00:00.000Z'),
      approvalEventId: '64b00000000000000000000b',
      approvalRequestId: null,
    });
    // Sin duplicar: la versión consultada no aparece en versions.
    assert.equal(detail.versions.length, 0);
  });

  it('devuelve las versiones de la misma entidad de origen en el detalle', async () => {
    const data = buildData();
    data.instances.push({
      _id: new Types.ObjectId('64b000000000000000000009'),
      companyId: new Types.ObjectId(COMPANY_A),
      templateId: new Types.ObjectId(TEMPLATE_POLICY),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: 'SST_POLICY',
      sourceEntityId: new Types.ObjectId('64b00000000000000000000a'),
      status: DocumentStatus.SIGNED,
      format: RendererFormat.DOCX,
      fileUrl: 'https://storage.googleapis.com/bucket/policy-v3.docx',
      storagePath: 'document-generation/company/policy-v3.docx',
      version: 3,
      generatedAt: new Date('2026-05-01T00:00:00.000Z'),
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    const { service } = buildService(data);

    const detail = await service.getById(INSTANCE_1);

    assert.equal(detail.versions.length, 1);
    assert.equal(detail.versions[0].version, 3);
    assert.equal(detail.versions[0].id, '64b000000000000000000009');
  });

  it('lanza NotFound si la instancia no existe', async () => {
    const { service } = buildService(buildData());

    await assert.rejects(
      () => service.getById('64b0000000000000000000ff'),
      NotFoundException,
    );
  });

  it('lanza BadRequest si el id no es un ObjectId válido', async () => {
    const { service } = buildService(buildData());

    await assert.rejects(
      () => service.getById('not-an-id'),
      BadRequestException,
    );
  });
});

describe('DocumentCatalogService compatibilidad', () => {
  it('no expone el schema completo en el listado (solo ViewModel)', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({});

    const item = page.items[0] as unknown as Record<string, unknown>;
    assert.equal(item.storagePath, undefined);
    assert.equal(item.templateId, undefined);
    assert.equal(item.sourceEntityId, undefined);
  });

  it('la consulta principal usa DocumentInstance como única fuente (sin tocar otros motores)', async () => {
    const { service } = buildService(buildData());

    const page = await service.list({});
    const detail = await service.getById(INSTANCE_1);

    assert.equal(page.total, 3);
    assert.ok(detail.versions);
    // El catálogo no depende de Approval Workflow ni del servicio de generación:
    // solo consulta DocumentInstance (+ plantilla/empresa para enriquecer).
  });
});
