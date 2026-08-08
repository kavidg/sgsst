import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import PizZip from 'pizzip';
import { Model, Types } from 'mongoose';

import {
  buildResponsibleSgsstTemplateDocx,
  RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES,
} from '../document-generation/system-templates/responsible-sgsst.template';
import { ResponsibleSgsstVariableResolver } from './responsible-sgsst-variable-resolver.service';
import {
  RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION,
  SystemTemplateService,
} from '../document-generation/services/system-template.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';
import { PhvaAdvancedResponsableSstDocument } from './schemas/phva-advanced-responsable-sst.schema';
import { CompanyDocument } from '../companies/schemas/company.schema';
import { UserDocument } from '../users/schemas/user.schema';

const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';

/** Extrae el XML de word/document.xml del DOCX generado por la plantilla. */
function readDocumentXml(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return zip.file('word/document.xml')?.asText() ?? '';
}

/** Registro PHVA 1.1.1 con datos completos para el documento oficial. */
function buildRecord(overrides?: Record<string, unknown>): PhvaAdvancedResponsableSstDocument {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.1',
    fullName: 'Juan Pérez',
    documentNumber: '123456789',
    position: 'Profesional SST',
    profession: 'Ingeniero Ambiental',
    sstProfessionalType: 'Profesional SST',
    sstLicenseNumber: 'L-2024-001',
    licenseType: 'Profesional SST',
    issuingAuthority: 'Ministerio de Trabajo',
    licenseIssueDate: new Date('2024-01-15T00:00:00.000Z'),
    licenseExpiresAt: new Date('2029-01-15T00:00:00.000Z'),
    licenseStatus: 'Pendiente',
    course50HoursDate: new Date('2022-03-01T00:00:00.000Z'),
    course20HoursDate: new Date('2025-06-01T00:00:00.000Z'),
    requires20HourUpdate: true,
    designationDate: new Date('2024-02-01T00:00:00.000Z'),
    designationNumber: 'ACT-014',
    designationIssuerName: 'María Gómez',
    designationIssuerPosition: 'Gerente General',
    complianceStatus: 'COMPLIES',
    complianceReason: 'Cumple con los requisitos del estándar 1.1.1.',
    approvalStatus: 'APPROVED',
    approvedBy: {
      userId: 'u1',
      email: 'gerente@acme.com',
      role: 'manager',
      timestamp: '2026-01-02T10:00:00.000Z',
    },
    documents: [
      { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'https://s/diploma.pdf' },
      { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50h.pdf', fileUrl: 'https://s/curso50h.pdf' },
      { type: 'TWENTY_HOUR_UPDATE_CERTIFICATE', fileName: 'curso20h.pdf', fileUrl: 'https://s/curso20h.pdf' },
      { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'https://s/designacion.pdf' },
    ],
    ...overrides,
  } as unknown as PhvaAdvancedResponsableSstDocument;
}

function buildResolver(overrides?: {
  record?: PhvaAdvancedResponsableSstDocument | null;
  company?: CompanyDocument | null;
  user?: UserDocument | null;
}): ResponsibleSgsstVariableResolver {
  const record = overrides?.record === undefined ? buildRecord() : overrides.record;
  const company = overrides?.company ?? ({
    _id: new Types.ObjectId(COMPANY_ID),
    name: 'ACME SAS',
    nit: '900123456',
    standardsType: '60',
  } as unknown as CompanyDocument);
  const user = overrides?.user ?? ({
    _id: new Types.ObjectId(USER_ID),
    email: 'juan.perez@acme.com',
  } as unknown as UserDocument);

  const recordModel = { findById: () => ({ exec: async () => record }) } as unknown as Model<PhvaAdvancedResponsableSstDocument>;
  const companyModel = { findById: () => ({ exec: async () => company }) } as unknown as Model<CompanyDocument>;
  const userModel = { findById: () => ({ exec: async () => user }) } as unknown as Model<UserDocument>;

  return new ResponsibleSgsstVariableResolver(recordModel, companyModel, userModel);
}

describe('FASE 8.3.D — DOCX oficial PHVA 1.1.1 (Responsable del SG-SST)', () => {
  it('1. el DOCX contiene las secciones del documento oficial', () => {
    const xml = readDocumentXml(buildResponsibleSgsstTemplateDocx());

    assert.match(xml, /RESPONSABLE DEL SG-SST — PHVA 1\.1\.1/);
    assert.match(xml, /1\. Identificación del Responsable/);
    assert.match(xml, /2\. Licencia de Seguridad y Salud en el Trabajo/);
    assert.match(xml, /3\. Formación requerida/);
    assert.match(xml, /4\. Designación del Responsable del SG-SST/);
    assert.match(xml, /5\. Evidencias verificadas/);
    assert.match(xml, /6\. Resultado de verificación/);
    assert.match(xml, /7\. Control documental/);
    assert.match(xml, /8\. Aprobación/);
  });

  it('2. los placeholders del documento están declarados como variables de la plantilla', () => {
    const xml = readDocumentXml(buildResponsibleSgsstTemplateDocx());
    const placeholders = [...xml.matchAll(/\{([a-zA-Z0-9.]+)\}/g)].map((match) => match[1]);

    assert.ok(placeholders.length > 0);
    for (const placeholder of placeholders) {
      assert.ok(
        RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES.includes(placeholder),
        `placeholder {${placeholder}} no declarado en RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES`,
      );
    }
    // Variables clave del documento oficial presente en el set declarado.
    for (const variable of [
      'license.number',
      'license.documentValidity',
      'formation.course50HoursDate',
      'designation.date',
      'designation.evidence',
      'evidences.list',
      'compliance.status',
    ]) {
      assert.ok(RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES.includes(variable), `falta variable ${variable}`);
    }
  });

  it('3. el resolver entrega todas las variables del template sin undefined/null', async () => {
    const resolver = buildResolver();
    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    // Recorre las variables de DOMINIO (las de document.* las añade el merge
    // de generateResponsibleSgsstDocument con valores garantizados) y verifica
    // que el path resuelva a un valor definido. Única excepción documentada:
    // company.address (el schema de Company no persiste dirección; null →
    // cadena vacía vía nullGetter, misma convención del resto de plantillas).
    for (const variable of RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES) {
      if (variable.startsWith('document.')) continue;
      const parts = variable.split('.');
      let value: unknown = context;
      for (const part of parts) {
        if (value == null || typeof value !== 'object') {
          assert.fail(`variable {${variable}} resuelve a null/undefined en el path ${part}`);
        }
        value = (value as Record<string, unknown>)[part];
      }
      assert.notEqual(value, undefined, `variable {${variable}} quedó undefined`);
      if (variable !== 'company.address') {
        assert.notEqual(value, null, `variable {${variable}} quedó null`);
      }
    }
  });

  it('4. el documento muestra los datos del responsable, licencia y formación', async () => {
    const resolver = buildResolver();
    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.responsible.name, 'Juan Pérez');
    assert.equal(context.responsible.document, '123456789');
    assert.equal(context.responsible.profession, 'Ingeniero Ambiental');
    assert.equal(context.responsible.sstProfessionalType, 'Profesional SST');
    assert.equal(context.license.number, 'L-2024-001');
    assert.equal(context.license.type, 'Profesional SST');
    assert.equal(context.license.issuingAuthority, 'Ministerio de Trabajo');
    assert.equal(context.license.issueDate, '2024-01-15');
    // La vigencia explícita del documento se conserva como dato documental.
    assert.equal(context.license.documentValidity, '2029-01-15');
    assert.equal(context.formation.course50HoursDate, '2022-03-01');
    assert.equal(context.formation.course20HoursState, 'Registrada');
  });

  it('5. la designación aparece completa y diferenciada de DIPLOMA', async () => {
    const resolver = buildResolver();
    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.designation.date, '2024-02-01');
    assert.equal(context.designation.number, 'ACT-014');
    assert.equal(context.designation.issuerName, 'María Gómez');
    assert.equal(context.designation.issuerPosition, 'Gerente General');
    assert.equal(context.designation.evidence, 'designacion.pdf');
    // La evidencia DESIGNATION no se confunde con el diploma.
    assert.match(context.evidences.list, /Designación del Responsable del SG-SST — designacion\.pdf/);
    assert.match(context.evidences.list, /Diploma \/ título profesional — diploma\.pdf/);
  });

  it('6. el resultado de verificación y la aprobación se consumen del backend', async () => {
    const resolver = buildResolver();
    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.compliance.status, 'COMPLIES');
    assert.equal(context.compliance.reason, 'Cumple con los requisitos del estándar 1.1.1.');
    assert.equal(context.approval.status, 'Aprobado');
    assert.equal(context.approval.approvedBy, 'gerente@acme.com');
    assert.equal(context.approval.approvedAt, '2026-01-02');
  });

  it('7. campos opcionales ausentes → fallback legible, nunca undefined', async () => {
    const resolver = buildResolver({
      record: buildRecord({
        sstLicenseNumber: '',
        licenseIssueDate: undefined,
        licenseExpiresAt: undefined,
        designationNumber: '',
        course20HoursDate: undefined,
        requires20HourUpdate: false,
        approvedBy: undefined,
        approvalStatus: 'DRAFT',
        documents: [],
      }),
    });
    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.license.number, 'No registrado');
    assert.equal(context.license.issueDate, 'No registrada');
    assert.equal(context.license.documentValidity, 'No registrada (sin vencimiento normativo)');
    assert.equal(context.designation.number, 'No registrado');
    assert.equal(context.designation.evidence, 'No registrado');
    assert.equal(context.formation.course20HoursDate, 'No registrada');
    assert.equal(context.formation.course20HoursState, 'No requerida según la condición registrada');
    assert.equal(context.evidences.list, 'Sin evidencias registradas');
    assert.equal(context.approval.status, 'Borrador');
    assert.equal(context.approval.approvedBy, 'No registrado');
  });

  it('8. la licencia sin fecha de vencimiento NO produce texto de vencida/vencimiento', async () => {
    const resolver = buildResolver({
      record: buildRecord({ licenseExpiresAt: undefined }),
    });
    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.license.documentValidity, 'No registrada (sin vencimiento normativo)');
    const flattened = JSON.stringify(context);
    assert.doesNotMatch(flattened, /"Vencida"|"Vencido"|días restantes/);
  });

  it('9. no se declara ningún placeholder de vencimiento calculado en el DOCX', () => {
    const xml = readDocumentXml(buildResponsibleSgsstTemplateDocx());
    assert.doesNotMatch(xml, /días restantes|vencida|próxima a vencer|Vencida|Próxima a vencer/i);
  });
});

describe('FASE 8.3.D — deriva de plantilla (SystemTemplateService)', () => {
  it('10. regenera el DOCX y sube la versión cuando las variables de la plantilla almacenada difieren', async () => {
    const uploads: Array<{ buffer: Buffer; path: string }> = [];
    const template = {
      _id: new Types.ObjectId(),
      name: 'Responsable del SG-SST (PHVA 1.1.1)',
      documentType: 'PHVA_RESPONSIBLE_SG_SST',
      format: 'DOCX',
      source: 'SYSTEM',
      variables: ['company.name'],
      storageUrl: 'system-templates/phva-advanced/old.docx',
      version: 1,
      active: true,
      save: async function () { return template; },
    } as unknown as DocumentTemplateDocument;
    let saved = false;
    template.save = async () => { saved = true; return template; };

    const templateModel = {
      findOne: () => ({ exec: async () => template }),
      create: async () => template,
    };
    const storageService = {
      upload: async (buffer: Buffer, _name: string, path: string) => {
        uploads.push({ buffer, path });
        return { storagePath: `system-templates/phva-advanced/new-${uploads.length}.docx` };
      },
    };

    const service = new SystemTemplateService(templateModel as never, storageService as never);
    const result = await service.ensureResponsibleSgsstTemplate();

    assert.equal(uploads.length, 1);
    assert.equal(saved, true);
    assert.equal(result.storageUrl, 'system-templates/phva-advanced/new-1.docx');
    assert.equal(result.version, 2);
    assert.deepEqual(result.variables, RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES);
  });

  it('11. no regenera cuando variables y versión de contenido coinciden (idempotencia)', async () => {
    let uploads = 0;
    const template = {
      _id: new Types.ObjectId(),
      variables: [...RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES],
      storageUrl: 'system-templates/phva-advanced/template.docx',
      version: RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION,
      active: true,
    } as unknown as DocumentTemplateDocument;
    const templateModel = {
      findOne: () => ({ exec: async () => template }),
      create: async () => template,
    };
    const storageService = {
      upload: async () => { uploads += 1; return { storagePath: 'x' }; },
    };

    const service = new SystemTemplateService(templateModel as never, storageService as never);
    const result = await service.ensureResponsibleSgsstTemplate();

    assert.equal(uploads, 0);
    assert.equal(result.version, RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION);
  });

  it('12. regenera cuando las variables coinciden pero la versión de contenido es vieja (cambio de solo cuerpo)', async () => {
    let uploads = 0;
    const template = {
      _id: new Types.ObjectId(),
      variables: [...RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES],
      storageUrl: 'system-templates/phva-advanced/old-body.docx',
      version: 1,
      active: true,
      save: async function () { return template; },
    } as unknown as DocumentTemplateDocument;
    const templateModel = {
      findOne: () => ({ exec: async () => template }),
      create: async () => template,
    };
    const storageService = {
      upload: async () => {
        uploads += 1;
        return { storagePath: 'system-templates/phva-advanced/refreshed.docx' };
      },
    };

    const service = new SystemTemplateService(templateModel as never, storageService as never);
    const result = await service.ensureResponsibleSgsstTemplate();

    assert.equal(uploads, 1);
    assert.equal(result.version, RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION);
    assert.equal(result.storageUrl, 'system-templates/phva-advanced/refreshed.docx');
  });
});
