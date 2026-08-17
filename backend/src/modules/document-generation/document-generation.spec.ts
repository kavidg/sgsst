import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import PizZip from 'pizzip';

import { DocumentInstanceDocument, DocumentInstanceSchema } from './schemas/document-instance.schema';
import { DocumentTemplate, DocumentTemplateDocument, DocumentTemplateSchema } from './schemas/document-template.schema';
import { DocxRenderer } from './services/renderer.service';
import { DocumentGenerationService } from './services/document-generation.service';
import { RendererService } from './services/renderer.service';
import { StorageService } from './services/storage.service';
import { TemplateSourceService } from './services/template-source.service';
import { VariableResolverService } from './services/variable-resolver.service';
import { DocumentRenderer, RendererFormat } from './types/renderer.types';
import {
  DocumentSourceModule,
  DocumentStatus,
  DocumentTemplateSource,
  DocumentTemplateType,
  ResolvedTemplate,
} from './types/document-generation.types';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { TemplatesService } from '../templates/templates.service';
// Fase 8.2.A — publicación automática Approval → DocumentMaster (hook).
import { DocumentPublicationService } from '../document-management/services/document-publication.service';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const TEMPLATE_ID = '64b000000000000000000002';

/** Construye un .docx mínimo válido con la variable {company.name}. */
function buildMinimalDocx(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{company.name}</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Extrae el texto de document.xml desde un .docx renderizado. */
function readDocumentXmlText(docxBuffer: Buffer): string {
  const zip = new PizZip(docxBuffer);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  const match = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
  return match ? match[1] : '';
}

/** Compara índices del schema de forma insensible al orden de claves. */
function hasIndex(indexes: Array<Record<string, unknown>>, expected: Record<string, number>): boolean {
  const expectedEntries = JSON.stringify(Object.entries(expected).sort());
  return indexes.some((index) => JSON.stringify(Object.entries(index).sort()) === expectedEntries);
}

describe('DocumentTemplate schema', () => {
  it('define los campos requeridos y enums', () => {
    assert.equal(DocumentTemplateSchema.path('name').isRequired, true);
    assert.equal(DocumentTemplateSchema.path('format').isRequired, true);
    assert.equal(DocumentTemplateSchema.path('documentType').isRequired, true);
    assert.deepEqual(
      (DocumentTemplateSchema.path('documentType') as unknown as { options: { enum: string[] } }).options.enum,
      Object.values(DocumentTemplateType),
    );
    assert.deepEqual(
      (DocumentTemplateSchema.path('format') as unknown as { options: { enum: string[] } }).options.enum,
      Object.values(RendererFormat),
    );
  });

  it('usa defaults de Mongoose para source, version y active', () => {
    const pathDefault = (path: string): unknown =>
      (DocumentTemplateSchema.path(path) as unknown as { defaultValue: unknown }).defaultValue;
    assert.equal(pathDefault('source'), DocumentTemplateSource.SYSTEM);
    assert.equal(pathDefault('version'), 1);
    assert.equal(pathDefault('active'), true);
  });

  it('indexa por companyId + documentType y companyId + active', () => {
    const indexes = DocumentTemplateSchema.indexes().map(([fields]) => fields as Record<string, unknown>);
    assert.ok(hasIndex(indexes, { companyId: 1, documentType: 1 }));
    assert.ok(hasIndex(indexes, { companyId: 1, active: 1 }));
  });
});

describe('DocumentInstance schema', () => {
  it('define campos requeridos y enums', () => {
    assert.equal(DocumentInstanceSchema.path('companyId').isRequired, true);
    assert.equal(DocumentInstanceSchema.path('templateId').isRequired, true);
    assert.equal(DocumentInstanceSchema.path('fileUrl').isRequired, true);
    assert.equal(DocumentInstanceSchema.path('storagePath').isRequired, true);
    assert.deepEqual(
      (DocumentInstanceSchema.path('status') as unknown as { options: { enum: string[] } }).options.enum,
      Object.values(DocumentStatus),
    );
    assert.deepEqual(
      (DocumentInstanceSchema.path('format') as unknown as { options: { enum: string[] } }).options.enum,
      Object.values(RendererFormat),
    );
  });

  it('usa GENERATED como status por defecto', () => {
    const statusDefault = (DocumentInstanceSchema.path('status') as unknown as { defaultValue: unknown }).defaultValue;
    assert.equal(statusDefault, DocumentStatus.GENERATED);
  });

  it('indexa por companyId + sourceModule + sourceEntity + sourceEntityId', () => {
    const indexes = DocumentInstanceSchema.indexes().map(([fields]) => fields as Record<string, unknown>);
    assert.ok(hasIndex(indexes, { companyId: 1, sourceModule: 1, sourceEntity: 1, sourceEntityId: 1 }));
  });

  it('define el índice compuesto ÚNICO con approvalEventId (Fase 2.1, dedup)', () => {
    const unique = DocumentInstanceSchema.indexes().find(
      ([fields]) =>
        hasIndex(
          [fields as Record<string, unknown>],
          { companyId: 1, sourceModule: 1, sourceEntity: 1, sourceEntityId: 1, approvalEventId: 1 },
        ),
    );
    assert.ok(unique, 'debe existir el índice compuesto con approvalEventId');
    const options = unique?.[1] as { unique?: boolean; sparse?: boolean };
    assert.equal(options.unique, true);
    assert.equal(options.sparse, true);
  });

  it('F7B7-01: define documentCode como campo opcional (trazabilidad documental)', () => {
    const path = DocumentInstanceSchema.path('documentCode') as unknown as {
      isRequired?: boolean;
      options?: { trim?: boolean };
    };
    assert.ok(path, 'documentCode debe existir en DocumentInstance');
    // Opcional: las instancias legacy (anteriores a F7B-7) no tienen el campo
    // (isRequired es undefined para campos sin required en Mongoose).
    assert.ok(!path.isRequired, 'documentCode no debe ser requerido');
  });
});

describe('StorageService (mock)', () => {
  it('getPublicUrl construye la URL pública desde el bucket', () => {
    const previousBucket = process.env.FIREBASE_STORAGE_BUCKET;
    process.env.FIREBASE_STORAGE_BUCKET = 'sgsst-test-bucket';

    try {
      const storage = new StorageService({} as unknown as FirebaseAdminService);
      const url = storage.getPublicUrl('document-generation/company/doc.pdf');
      assert.equal(url, 'https://storage.googleapis.com/sgsst-test-bucket/document-generation/company/doc.pdf');
    } finally {
      if (previousBucket === undefined) {
        delete process.env.FIREBASE_STORAGE_BUCKET;
      } else {
        process.env.FIREBASE_STORAGE_BUCKET = previousBucket;
      }
    }
  });

  it('lanza error controlado si falta FIREBASE_STORAGE_BUCKET', () => {
    const previousBucket = process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.FIREBASE_STORAGE_BUCKET;

    try {
      const storage = new StorageService({} as unknown as FirebaseAdminService);
      assert.throws(
        () => storage.getPublicUrl('x/y.pdf'),
        /Missing FIREBASE_STORAGE_BUCKET/,
      );
    } finally {
      if (previousBucket !== undefined) {
        process.env.FIREBASE_STORAGE_BUCKET = previousBucket;
      }
    }
  });
});

describe('RendererService', () => {
  function buildTemplate(overrides?: Partial<DocumentTemplate>): DocumentTemplateDocument {
    return {
      _id: new Types.ObjectId(TEMPLATE_ID),
      name: 'Política SST',
      documentType: DocumentTemplateType.SST_POLICY,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: ['company.name'],
      storageUrl: 'templates/company/politica-sst.docx',
      version: 1,
      active: true,
      ...overrides,
    } as unknown as DocumentTemplateDocument;
  }

  function buildRendererService(overrides?: { download?: unknown }): RendererService {
    const storageService = {
      download: async () => overrides?.download ?? buildMinimalDocx(),
    } as unknown as StorageService;
    return new RendererService(storageService);
  }

  it('selecciona el renderer DOCX y renderiza las variables', async () => {
    const rendererService = buildRendererService();
    const template = buildTemplate();

    const result = await rendererService.renderDocument(RendererFormat.DOCX, template, {
      company: { name: 'ACME SAS' },
    });

    assert.ok(result.length > 0);
    assert.match(readDocumentXmlText(result), /ACME SAS/);
  });

  it('lanza error controlado para PDF (no implementado en esta fase)', async () => {
    const rendererService = buildRendererService();
    const template = buildTemplate({ format: RendererFormat.PDF });

    await assert.rejects(
      () => rendererService.renderDocument(RendererFormat.PDF, template, {}),
      /not implemented/,
    );
  });

  it('el contrato DocumentRenderer es satisfecho por DocxRenderer', async () => {
    const renderer: DocumentRenderer = new DocxRenderer();

    const result = await renderer.render(buildMinimalDocx(), { company: { name: 'ACME' } });
    assert.match(readDocumentXmlText(result), /ACME/);
  });
});

describe('VariableResolverService', () => {
  it('devuelve las variables existentes desde el contexto anidado', () => {
    const resolver = new VariableResolverService();
    const result = resolver.resolve(['company.name', 'responsible.name'], {
      company: { name: 'ACME SAS' },
      responsible: { name: 'Juan Pérez' },
    });

    assert.deepEqual(result, {
      company: { name: 'ACME SAS' },
      responsible: { name: 'Juan Pérez' },
    });
  });

  it('resuelve contexto plano legado (clave literal con puntos)', () => {
    const resolver = new VariableResolverService();
    const result = resolver.resolve(['company.name'], { 'company.name': 'ACME SAS' });

    assert.deepEqual(result, { company: { name: 'ACME SAS' } });
  });

  it('resuelve contexto plano legado (clave simple sin puntos)', () => {
    const resolver = new VariableResolverService();
    const result = resolver.resolve(['companyName'], { companyName: 'ABC' });

    assert.deepEqual(result, { companyName: 'ABC' });
  });

  it('prioriza la clave plana legada sobre el path anidado', () => {
    const resolver = new VariableResolverService();
    const result = resolver.resolve(['company.name'], {
      'company.name': 'FLAT',
      company: { name: 'NESTED' },
    });

    assert.deepEqual(result, { company: { name: 'FLAT' } });
  });

  it('devuelve null para variables faltantes sin lanzar excepción', () => {
    const resolver = new VariableResolverService();
    const result = resolver.resolve(['company.name', 'approval.date'], {});

    assert.deepEqual(result, {
      company: { name: null },
      approval: { date: null },
    });
  });

  it('resuelve sin contexto (estructura con null)', () => {
    const resolver = new VariableResolverService();
    const result = resolver.resolve(['company.name']);

    assert.deepEqual(result, { company: { name: null } });
  });
});

describe('DocumentGenerationService.generateDocument', () => {
  function buildTemplate(overrides?: Partial<ResolvedTemplate>): ResolvedTemplate {
    return {
      id: TEMPLATE_ID,
      name: 'Política SST',
      storageUrl: 'templates/politica.docx',
      variables: ['company.name'],
      version: 1,
      documentType: DocumentTemplateType.OTHER,
      ...overrides,
    };
  }

  function buildService(overrides?: {
    template?: ResolvedTemplate | null;
    rendered?: Buffer;
    uploaded?: { fileUrl: string; storagePath: string };
    existingInstance?: Record<string, unknown> | null;
    // Fase 8.2.A — stub del publication service para validar el hook.
    publicationService?: { publishFromInstance: (instance: unknown) => Promise<unknown> };
  }): {
    service: DocumentGenerationService;
    createdInstances: unknown[];
    uploadCalls: Array<{ buffer: Buffer; filename: string; folder: string }>;
    dedupQueries: Array<Record<string, unknown>>;
  } {
    const createdInstances: unknown[] = [];
    const uploadCalls: Array<{ buffer: Buffer; filename: string; folder: string }> = [];
    const dedupQueries: Array<Record<string, unknown>> = [];

    const templateSourceService = {
      getTemplate: async () => {
        if (!overrides?.template) {
          throw new NotFoundException('Template with id not found');
        }
        return overrides.template;
      },
    } as unknown as TemplateSourceService;
    const instanceModel = {
      create: async (data: unknown) => {
        createdInstances.push(data);
        return { _id: new Types.ObjectId(), ...(data as object) };
      },
      // Fase 2.1 — dedup por approvalEventId: la búsqueda previa a la
      // generación captura el filtro para validar la idempotencia.
      findOne: (filter: Record<string, unknown>) => {
        dedupQueries.push(filter);
        return { exec: async () => overrides?.existingInstance ?? null };
      },
    } as unknown as Model<DocumentInstanceDocument>;
    // El contrato real de VariableResolverService devuelve estructura ANIDADA
    // ({ company: { name } }) para que el parser de DocxRenderer resuelva
    // paths punto a punto. El mock replica ese shape.
    const variableResolverService = {
      resolve: (variables: string[]) =>
        variables.reduce<Record<string, unknown>>((acc, variable) => {
          const [root, key] = variable.split('.');
          const nested = (acc[root] as Record<string, unknown> | undefined) ?? {};
          nested[key ?? root] = 'resolved';
          acc[root] = nested;
          return acc;
        }, {}),
    } as unknown as VariableResolverService;
    const rendererService = {
      renderDocument: async () => overrides?.rendered ?? Buffer.from('rendered-docx'),
    } as unknown as RendererService;
    const storageService = {
      upload: async (buffer: Buffer, filename: string, folder: string) => {
        uploadCalls.push({ buffer, filename, folder });
        return (
          overrides?.uploaded ?? {
            fileUrl: 'https://storage.googleapis.com/bucket/doc.docx',
            storagePath: 'document-generation/company/doc.docx',
          }
        );
      },
    } as unknown as StorageService;

    return {
      service: new DocumentGenerationService(
        instanceModel,
        templateSourceService,
        variableResolverService,
        rendererService,
        storageService,
        overrides?.publicationService as unknown as DocumentPublicationService | undefined,
      ),
      createdInstances,
      uploadCalls,
      dedupQueries,
    };
  }

  it('genera una instancia documental completa cuando la plantilla existe', async () => {
    const template = buildTemplate({ version: 3 });
    const { service, createdInstances } = buildService({ template });

    const result = await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: 'RESPONSABLE_SST',
      generatedBy: new Types.ObjectId('64b000000000000000000003'),
      context: { company: { name: 'ACME' } },
    });

    assert.ok(result.instanceId);
    assert.equal(result.version, 3);
    assert.match(result.fileUrl, /^https:\/\/storage\.googleapis\.com\//);

    assert.equal(createdInstances.length, 1);
    const instance = createdInstances[0] as {
      status: DocumentStatus;
      format: RendererFormat;
      version: number;
      sourceModule: DocumentSourceModule;
      sourceEntity: string;
      generatedBy: Types.ObjectId | undefined;
      generatedAt: Date;
    };
    assert.equal(instance.status, DocumentStatus.GENERATED);
    assert.equal(instance.format, RendererFormat.DOCX);
    assert.equal(instance.version, 3);
    assert.equal(instance.sourceModule, DocumentSourceModule.PHVA_ADVANCED);
    assert.equal(instance.sourceEntity, 'RESPONSABLE_SST');
    assert.ok(instance.generatedBy);
    assert.ok(instance.generatedAt instanceof Date);
  });

  it('usa TEMPLATES como sourceModule y documentType como sourceEntity por defecto', async () => {
    const template = buildTemplate();
    const { service, createdInstances } = buildService({ template });

    const result = await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      context: { 'company.name': 'ACME' },
    });

    assert.ok(result.instanceId);
    assert.equal(createdInstances.length, 1);
    const instance = createdInstances[0] as {
      sourceModule: DocumentSourceModule;
      sourceEntity: string;
      templateId: Types.ObjectId;
      version: number;
      generatedAt: Date;
    };
    assert.equal(instance.sourceModule, DocumentSourceModule.TEMPLATES);
    assert.equal(instance.sourceEntity, DocumentTemplateType.OTHER);
    assert.equal(instance.templateId.toString(), TEMPLATE_ID);
    assert.equal(instance.version, 1);
    assert.ok(instance.generatedAt instanceof Date);
  });

  it('sube el documento renderizado a StorageService en la carpeta de la empresa', async () => {
    const rendered = Buffer.from('rendered-docx');
    const template = buildTemplate();
    const { service, uploadCalls } = buildService({ template, rendered });

    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
    });

    assert.equal(uploadCalls.length, 1);
    assert.equal(uploadCalls[0].buffer, rendered);
    assert.match(uploadCalls[0].filename, /^Pol_tica_SST-\d+\.docx$/);
    assert.equal(uploadCalls[0].folder, `document-generation/${COMPANY_ID}`);
  });

  it('lanza NotFoundException si la plantilla no existe', async () => {
    const { service } = buildService({ template: null });

    await assert.rejects(
      () =>
        service.generateDocument({
          companyId: new Types.ObjectId(COMPANY_ID),
          templateId: TEMPLATE_ID,
        }),
      /not found/,
    );
  });

  it('valida el request (companyId requerido)', async () => {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.generateDocument({
          companyId: undefined as unknown as Types.ObjectId,
          templateId: TEMPLATE_ID,
        }),
      /companyId is required/,
    );
  });

  it('retorna la instancia existente si ya existe para el approvalEventId (sin regenerar)', async () => {
    const existing = {
      _id: new Types.ObjectId('64b00000000000000000000c'),
      fileUrl: 'https://storage.googleapis.com/bucket/existing.docx',
      storagePath: 'document-generation/existing.docx',
      version: 2,
    };
    const template = buildTemplate();
    const { service, createdInstances, uploadCalls, dedupQueries } = buildService({
      template,
      existingInstance: existing,
    });

    const result = await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: 'RESPONSIBLE_SG_SST',
      sourceEntityId: new Types.ObjectId('64b00000000000000000000b'),
      approval: {
        status: 'APPROVED',
        approvalEventId: new Types.ObjectId('64b00000000000000000000d'),
      },
    });

    assert.equal(result.instanceId.toString(), '64b00000000000000000000c');
    assert.equal(result.fileUrl, existing.fileUrl);
    assert.equal(result.version, 2);
    // No se regeneró ni se subió nada.
    assert.equal(createdInstances.length, 0);
    assert.equal(uploadCalls.length, 0);
    // El filtro del dedup incluye companyId, origen y approvalEventId.
    assert.equal(dedupQueries.length, 1);
    assert.equal(
      (dedupQueries[0].approvalEventId as Types.ObjectId).toString(),
      '64b00000000000000000000d',
    );
  });

  it('no consulta dedup cuando el request no proviene de una aprobación', async () => {
    const template = buildTemplate();
    const { service, dedupQueries } = buildService({ template });

    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
    });

    assert.equal(dedupQueries.length, 0);
  });

  it('publica la instancia aprobada en DocumentMaster tras crearla (Fase 8.2.A)', async () => {
    const template = buildTemplate();
    const published: unknown[] = [];
    const publicationService = {
      publishFromInstance: async (instance: unknown) => {
        published.push(instance);
        return null;
      },
    };
    const { service, createdInstances } = buildService({ template, publicationService });

    const result = await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: 'RESPONSIBLE_SG_SST',
      sourceEntityId: new Types.ObjectId('64b00000000000000000000b'),
      approval: {
        status: 'APPROVED',
        approvalEventId: new Types.ObjectId('64b00000000000000000000d'),
      },
    });

    assert.ok(result.instanceId);
    assert.equal(createdInstances.length, 1);
    // La publicación se invoca con la instancia recién creada.
    assert.equal(published.length, 1);
    const instance = published[0] as {
      sourceEntity: string;
      approvalStatus?: string;
      fileUrl: string;
    };
    assert.equal(instance.sourceEntity, 'RESPONSIBLE_SG_SST');
    assert.equal(instance.approvalStatus, 'APPROVED');
    assert.ok(instance.fileUrl);
  });

  it('no rompe la generación si la publicación en DocumentMaster falla (Fase 8.2.A)', async () => {
    const template = buildTemplate();
    const publicationService = {
      publishFromInstance: async () => {
        throw new Error('boom');
      },
    };
    const { service, createdInstances } = buildService({ template, publicationService });

    const result = await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: 'RESPONSIBLE_SG_SST',
      approval: {
        status: 'APPROVED',
        approvalEventId: new Types.ObjectId('64b00000000000000000000d'),
      },
    });

    // La generación documental y la instancia se conservan pese al fallo.
    assert.ok(result.instanceId);
    assert.equal(createdInstances.length, 1);
  });

  it('publica también la instancia existente en el path de dedup (reintento de aprobación)', async () => {
    const existing = {
      _id: new Types.ObjectId('64b00000000000000000000c'),
      fileUrl: 'https://storage.googleapis.com/bucket/existing.docx',
      storagePath: 'document-generation/existing.docx',
      version: 2,
    };
    const published: unknown[] = [];
    const publicationService = {
      publishFromInstance: async (instance: unknown) => {
        published.push(instance);
        return null;
      },
    };
    const template = buildTemplate();
    const { service } = buildService({ template, existingInstance: existing, publicationService });

    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: 'RESPONSIBLE_SG_SST',
      sourceEntityId: new Types.ObjectId('64b00000000000000000000b'),
      approval: {
        status: 'APPROVED',
        approvalEventId: new Types.ObjectId('64b00000000000000000000d'),
      },
    });

    // El reintento publica la instancia existente (no se regenera).
    assert.equal(published.length, 1);
    assert.equal((published[0] as { fileUrl: string }).fileUrl, existing.fileUrl);
  });

  // ─────────────────────────────────────────────
  // F7B-7 — TRAZABILIDAD DOCUMENTAL (documentCode)
  // ─────────────────────────────────────────────

  it('F7B7-01: la instancia nueva persiste el documentCode desde context.document.code', async () => {
    const template = buildTemplate();
    const { service, createdInstances } = buildService({ template });

    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      sourceModule: DocumentSourceModule.CONVIVENCIA,
      sourceEntity: 'CONVIVENCIA',
      context: { company: { name: 'ACME' }, document: { code: 'PHVA-1.1.8-ACTA' } },
    });

    assert.equal(
      (createdInstances[0] as { documentCode?: string }).documentCode,
      'PHVA-1.1.8-ACTA',
    );
  });

  it('F7B7-02: el documentCode proviene del contexto del servidor, nunca del request', async () => {
    const template = buildTemplate();
    const { service, createdInstances } = buildService({ template });

    // El request intenta colar un documentCode ajeno: el contrato no lo acepta
    // y el motor solo lee context.document.code (construido por el dominio).
    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      documentCode: 'FAKE-SUPPLIED-BY-USER',
      context: { document: { code: 'PHVA-1.1.8-COMP' } },
    } as never);

    assert.equal(
      (createdInstances[0] as { documentCode?: string }).documentCode,
      'PHVA-1.1.8-COMP',
    );
  });

  it('F7B7-03/12/13: versiones distintas y regeneraciones conservan el mismo documentCode', async () => {
    const base = {
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      context: { document: { code: 'PHVA-1.1.8-ACTA' } },
    };

    const v1 = buildService({ template: buildTemplate({ version: 1 }) });
    await v1.service.generateDocument(base);
    // Regeneración del mismo documento (misma plantilla, mismo código).
    const v2 = buildService({ template: buildTemplate({ version: 2 }) });
    await v2.service.generateDocument(base);

    assert.equal(
      (v1.createdInstances[0] as { documentCode?: string; version: number }).documentCode,
      'PHVA-1.1.8-ACTA',
    );
    // v1 y v2 conservan el MISMO código documental.
    assert.equal(
      (v2.createdInstances[0] as { documentCode?: string; version: number }).documentCode,
      'PHVA-1.1.8-ACTA',
    );
    // La versión NO forma parte del documentCode.
    assert.equal((v2.createdInstances[0] as { version: number }).version, 2);
  });

  it('F7B7-04: documentos de tipos diferentes reciben códigos diferentes', async () => {
    const acta = buildService({ template: buildTemplate() });
    const reporte = buildService({ template: buildTemplate() });
    const base = { companyId: new Types.ObjectId(COMPANY_ID), templateId: TEMPLATE_ID };

    await acta.service.generateDocument({
      ...base,
      context: { document: { code: 'PHVA-1.1.8-ACTA' } },
    });
    await reporte.service.generateDocument({
      ...base,
      context: { document: { code: 'PHVA-1.1.8-COMP' } },
    });

    assert.notEqual(
      (acta.createdInstances[0] as { documentCode?: string }).documentCode,
      (reporte.createdInstances[0] as { documentCode?: string }).documentCode,
    );
  });

  it('F7B7-06: la serialización JSON de la instancia contiene documentCode', async () => {
    const template = buildTemplate();
    const { service, createdInstances } = buildService({ template });

    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      context: { document: { code: 'PHVA-1.1.8-ACTA' } },
    });

    const created = createdInstances[0] as { documentCode?: string };
    assert.equal(created.documentCode, 'PHVA-1.1.8-ACTA');
    // El JSON del documento persistido conserva el código: el contrato expone
    // el tipo documental sin depender de fileUrl ni storagePath.
    const serialized = JSON.stringify({ ...created, _id: new Types.ObjectId().toString() });
    assert.ok(serialized.includes('PHVA-1.1.8-ACTA'));
  });

  it('F7B7-08: la derivación del código es determinista (misma entrada → mismo código)', async () => {
    const context = { document: { code: 'PHVA-1.1.7-CERT' } };
    const base = { companyId: new Types.ObjectId(COMPANY_ID), templateId: TEMPLATE_ID, context };
    const first = buildService({ template: buildTemplate() });
    const second = buildService({ template: buildTemplate() });

    await first.service.generateDocument(base);
    await second.service.generateDocument(base);

    assert.equal(
      (first.createdInstances[0] as { documentCode?: string }).documentCode,
      'PHVA-1.1.7-CERT',
    );
    assert.equal(
      (second.createdInstances[0] as { documentCode?: string }).documentCode,
      'PHVA-1.1.7-CERT',
    );
  });

  it('F7B7-09: sin código derivable NO se inventa un documentCode', async () => {
    const template = buildTemplate();
    const { service, createdInstances } = buildService({ template });

    // Contexto sin document.code (p.ej. plantilla legada).
    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      context: { company: { name: 'ACME' } },
    });
    // Sin contexto alguno.
    const plain = buildService({ template });
    await plain.service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
    });

    assert.equal((createdInstances[0] as { documentCode?: string }).documentCode, undefined);
    assert.equal((plain.createdInstances[0] as { documentCode?: string }).documentCode, undefined);
  });

  it('F7B7-15: el usuario no puede suplantar el tipo documental con un código suministrado', async () => {
    const template = buildTemplate();
    const { service, createdInstances } = buildService({ template });

    // Incluso un código 'legítimo' colado a nivel raíz del request NO puede
    // sobreescribir el código del contexto (única vía de persistencia).
    await service.generateDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      templateId: TEMPLATE_ID,
      documentCode: 'PHVA-1.1.8-COMP',
      context: { document: { code: 'PHVA-1.1.8-ACTA' } },
    } as never);

    assert.equal(
      (createdInstances[0] as { documentCode?: string }).documentCode,
      'PHVA-1.1.8-ACTA',
    );
  });
});

describe('TemplateSourceService', () => {
  function buildService(overrides?: { template?: unknown }): TemplateSourceService {
    const templatesService = {
      findByIdForCompany: async () => {
        if (overrides?.template === null) {
          throw new NotFoundException('Template with id not found');
        }
        return (
          overrides?.template ?? {
            _id: new Types.ObjectId(TEMPLATE_ID),
            name: 'Política SST',
            storagePath: 'templates/company/politica.docx',
            variables: ['company.name'],
          }
        );
      },
    } as unknown as TemplatesService;
    return new TemplateSourceService(templatesService);
  }

  it('mapea la plantilla legada al contrato ResolvedTemplate', async () => {
    const service = buildService();

    const template = await service.getTemplate(TEMPLATE_ID, new Types.ObjectId(COMPANY_ID));

    assert.equal(template.id, TEMPLATE_ID);
    assert.equal(template.name, 'Política SST');
    assert.equal(template.storageUrl, 'templates/company/politica.docx');
    assert.deepEqual(template.variables, ['company.name']);
    assert.equal(template.version, 1);
    assert.equal(template.documentType, DocumentTemplateType.OTHER);
  });

  it('propaga NotFoundException cuando la plantilla no existe', async () => {
    const service = buildService({ template: null });

    await assert.rejects(
      () => service.getTemplate(TEMPLATE_ID, new Types.ObjectId(COMPANY_ID)),
      /not found/,
    );
  });
});
