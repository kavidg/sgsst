import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { ResponsibleSgsstVariableResolver } from './responsible-sgsst-variable-resolver.service';
import { PhvaAdvancedResponsableSstDocument } from './schemas/phva-advanced-responsable-sst.schema';
import { CompanyDocument } from '../companies/schemas/company.schema';
import { UserDocument } from '../users/schemas/user.schema';

/** ObjectIds válidos de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000003';

/** Registro PHVA 1.1.1 por defecto devuelto por el stub del modelo. */
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
    observations: 'Gestiona el SG-SST de la empresa',
    complianceStatus: 'COMPLIES',
    updatedBy: new Types.ObjectId(USER_ID),
    ...overrides,
  } as unknown as PhvaAdvancedResponsableSstDocument;
}

/** Empresa por defecto devuelta por el stub del modelo. */
function buildCompany(overrides?: Record<string, unknown>): CompanyDocument {
  return {
    _id: new Types.ObjectId(COMPANY_ID),
    name: 'ACME SAS',
    nit: '900123456',
    standardsType: '60',
    ...overrides,
  } as unknown as CompanyDocument;
}

/** Usuario responsable (updatedBy) por defecto. */
function buildUser(overrides?: Record<string, unknown>): UserDocument {
  return {
    _id: new Types.ObjectId(USER_ID),
    email: 'juan.perez@acme.com',
    ...overrides,
  } as unknown as UserDocument;
}

/** Construye el resolver con modelos stub. */
function buildResolver(overrides?: {
  record?: PhvaAdvancedResponsableSstDocument | null;
  company?: CompanyDocument | null;
  user?: UserDocument | null;
}): ResponsibleSgsstVariableResolver {
  const record = overrides?.record === undefined ? buildRecord() : overrides.record;
  const company = overrides?.company === undefined ? buildCompany() : overrides.company;
  const user = overrides?.user === undefined ? buildUser() : overrides.user;

  const recordModel = {
    findById: () => ({ exec: async () => record }),
  } as unknown as Model<PhvaAdvancedResponsableSstDocument>;
  const companyModel = {
    findById: () => ({ exec: async () => company }),
  } as unknown as Model<CompanyDocument>;
  const userModel = {
    findById: () => ({ exec: async () => user }),
  } as unknown as Model<UserDocument>;

  return new ResponsibleSgsstVariableResolver(recordModel, companyModel, userModel);
}

describe('ResponsibleSgsstVariableResolver', () => {
  it('resuelve datos de empresa, responsable, sgsst y assignment desde datos reales', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.deepEqual(context.company, { name: 'ACME SAS', nit: '900123456', address: null });
    assert.deepEqual(context.responsible, {
      name: 'Juan Pérez',
      document: '123456789',
      position: 'Profesional SST',
      profession: 'Ingeniero Ambiental',
      sstProfessionalType: 'Profesional SST',
      email: 'juan.perez@acme.com',
    });
    assert.deepEqual(context.sgsst, { standardType: '60', evaluationLevel: 'COMPLIES' });
    assert.equal(context.assignment.responsibility, 'Responsable del SG-SST: Profesional SST');
    assert.equal(context.assignment.functions, 'Gestiona el SG-SST de la empresa');
    // Secciones nuevas (Fase 8.3.D) con fallbacks legibles cuando no hay datos.
    assert.equal(context.license.number, 'No registrado');
    assert.equal(context.license.documentValidity, 'No registrada (sin vencimiento normativo)');
    assert.equal(context.formation.course20HoursState, 'No requerida según la condición registrada');
    assert.equal(context.designation.evidence, 'No registrado');
    assert.equal(context.evidences.list, 'Sin evidencias registradas');
    assert.equal(context.compliance.status, 'COMPLIES');
    assert.equal(context.approval.status, 'Borrador');
  });

  it('devuelve null para company.address y fallback legible para datos ausentes', async () => {
    const resolver = buildResolver({ user: null });

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    // El schema de Company no persiste dirección → null (renderer → cadena vacía).
    assert.equal(context.company.address, null);
    // Sin usuario updatedBy no hay email → fallback legible del documento.
    assert.equal(context.responsible.email, 'No registrado');
  });

  it('lanza NotFoundException si el registro no existe', async () => {
    const resolver = buildResolver({ record: null });

    await assert.rejects(
      () => resolver.resolve(new Types.ObjectId(COMPANY_ID), new Types.ObjectId(RECORD_ID)),
      NotFoundException,
    );
  });

  it('lanza NotFoundException si el registro pertenece a otra empresa', async () => {
    const resolver = buildResolver({
      record: buildRecord({ companyId: new Types.ObjectId('64b0000000000000000000ff') }),
    });

    await assert.rejects(
      () => resolver.resolve(new Types.ObjectId(COMPANY_ID), new Types.ObjectId(RECORD_ID)),
      /not found/,
    );
  });

  it('usa profession como fallback de funciones cuando no hay observations', async () => {
    const resolver = buildResolver({
      record: buildRecord({ observations: '' }),
    });

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.assignment.functions, 'Ingeniero Ambiental');
  });

  it('Fase 8.3.D — resuelve licencia, formación, designación y evidencias con datos reales', async () => {
    const resolver = buildResolver({
      record: buildRecord({
        sstLicenseNumber: 'L-2024-001',
        licenseType: 'Profesional SST',
        issuingAuthority: 'Ministerio de Trabajo',
        licenseIssueDate: new Date('2024-01-15T00:00:00.000Z'),
        licenseExpiresAt: new Date('2029-01-15T00:00:00.000Z'),
        licenseStatus: 'Pendiente',
        course50HoursDate: new Date('2022-03-01T00:00:00.000Z'),
        requires20HourUpdate: true,
        course20HoursDate: new Date('2025-06-01T00:00:00.000Z'),
        designationDate: new Date('2024-02-01T00:00:00.000Z'),
        designationNumber: 'ACT-014',
        designationIssuerName: 'María Gómez',
        designationIssuerPosition: 'Gerente General',
        documents: [
          {
            type: 'DIPLOMA',
            fileName: 'diploma.pdf',
            fileUrl: 'https://storage/diploma.pdf',
            uploadedAt: new Date('2024-01-20T00:00:00.000Z'),
          },
          {
            type: 'FIFTY_HOUR_CERTIFICATE',
            fileName: 'curso50h.pdf',
            fileUrl: 'https://storage/curso50h.pdf',
            uploadedAt: new Date('2024-01-21T00:00:00.000Z'),
          },
          {
            type: 'TWENTY_HOUR_UPDATE_CERTIFICATE',
            fileName: 'curso20h.pdf',
            fileUrl: 'https://storage/curso20h.pdf',
            uploadedAt: new Date('2025-06-10T00:00:00.000Z'),
          },
          {
            type: 'DESIGNATION',
            fileName: 'designacion.pdf',
            fileUrl: 'https://storage/designacion.pdf',
            uploadedAt: new Date('2024-02-05T00:00:00.000Z'),
          },
        ],
      }),
    });

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.license.number, 'L-2024-001');
    assert.equal(context.license.type, 'Profesional SST');
    assert.equal(context.license.issuingAuthority, 'Ministerio de Trabajo');
    assert.equal(context.license.issueDate, '2024-01-15');
    // Vigencia documental explícita: se conserva como dato, sin cálculo de días.
    assert.equal(context.license.documentValidity, '2029-01-15');
    assert.equal(context.formation.course50HoursDate, '2022-03-01');
    assert.equal(context.formation.course50HoursEvidence, 'curso50h.pdf');
    assert.equal(context.formation.course20HoursState, 'Registrada');
    assert.equal(context.formation.course20HoursDate, '2025-06-01');
    assert.equal(context.formation.course20HoursEvidence, 'curso20h.pdf');
    assert.equal(context.designation.date, '2024-02-01');
    assert.equal(context.designation.number, 'ACT-014');
    assert.equal(context.designation.issuerName, 'María Gómez');
    assert.equal(context.designation.issuerPosition, 'Gerente General');
    assert.equal(context.designation.evidence, 'designacion.pdf');
    // Evidencias: DIPLOMA, 50h, 20h y DESIGNATION identificadas.
    assert.match(context.evidences.list, /Diploma \/ título profesional/);
    assert.match(context.evidences.list, /Certificado curso virtual 50 horas — curso50h\.pdf/);
    assert.match(context.evidences.list, /Certificado actualización 20 horas — curso20h\.pdf/);
    assert.match(context.evidences.list, /Designación del Responsable del SG-SST — designacion\.pdf/);
  });

  it('Fase 8.3.D — actualización 20h pendiente cuando el backend la exige sin fecha', async () => {
    const resolver = buildResolver({
      record: buildRecord({
        requires20HourUpdate: true,
        course20HoursDate: undefined,
      }),
    });

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.formation.course20HoursState, 'Pendiente de actualización');
  });

  it('Fase 8.3.D — la aprobación legible usa la metadata del registro', async () => {
    const resolver = buildResolver({
      record: buildRecord({
        approvalStatus: 'APPROVED_AND_SIGNED',
        approvedBy: {
          userId: 'u1',
          email: 'gerente@acme.com',
          role: 'manager',
          timestamp: '2026-01-02T10:00:00.000Z',
        },
      }),
    });

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.approval.status, 'Aprobado');
    assert.equal(context.approval.approvedBy, 'gerente@acme.com');
    assert.equal(context.approval.approvedAt, '2026-01-02');
  });

  it('Fase 8.3.D — la licencia sin fecha de vencimiento NUNCA produce estado vencido', async () => {
    const resolver = buildResolver({
      record: buildRecord({
        sstLicenseNumber: 'L-2024-001',
        licenseIssueDate: new Date('2024-01-15T00:00:00.000Z'),
        licenseExpiresAt: undefined,
      }),
    });

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    // Sin fecha de vencimiento: se conserva la fecha de expedición y la
    // vigencia queda como dato documental ausente, sin inventar vencimiento.
    assert.equal(context.license.issueDate, '2024-01-15');
    assert.equal(context.license.documentValidity, 'No registrada (sin vencimiento normativo)');
    assert.doesNotMatch(context.license.documentValidity, /Vencida|vencida/);
  });
});
