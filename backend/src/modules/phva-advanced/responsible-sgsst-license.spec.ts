import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import { ResponsableSstComplianceStatus } from './schemas/phva-advanced-responsable-sst.schema';
import { UserDocument } from '../users/schemas/user.schema';

const COMPANY_ID = '64b000000000000000000011';
const USER_ID = '64b000000000000000000013';

type MockRecord = Record<string, unknown> & {
  documents: unknown[];
  alerts: Array<{ type: string; message: string; severity: string; dueAt: Date; generated: boolean }>;
  versions: unknown[];
  licenseOcrEntries: unknown[];
  save: () => Promise<MockRecord>;
};

function createMockUser(role = 'manager'): UserDocument {
  return {
    _id: new Types.ObjectId(USER_ID),
    email: 'manager@empresa.com',
    firstName: 'Ana',
    lastName: 'Gerente',
    role,
  } as unknown as UserDocument;
}

/** Registro COMPLETO salvo que el test diga lo contrario: cumple sin depender
 * de licenseExpiresAt (la licencia SST no posee vencimiento normativo). */
function createMockRecord(overrides: Record<string, unknown> = {}): MockRecord {
  const record = {
    _id: new Types.ObjectId('64b000000000000000000012'),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.1',
    fullName: 'Ana Pérez',
    documentNumber: '123456789',
    position: 'Coordinadora SST',
    profession: 'Ingeniera Industrial',
    sstProfessionalType: 'Profesional SST',
    sstLicenseNumber: 'LIC-001',
    licenseType: 'Profesional SST',
    issuingAuthority: 'Ministerio de Trabajo',
    department: 'Sede Principal',
    observations: 'Ninguna',
    licenseIssueDate: new Date('2024-01-01T00:00:00.000Z'),
    // NOTA normativa (1.1.1): SIN licenseExpiresAt es un estado NORMAL.
    licenseExpiresAt: undefined,
    licenseStatus: undefined,
    licenseOcrEntries: [],
    course50HoursDate: new Date('2024-02-01T00:00:00.000Z'),
    course50HoursDetectedDate: undefined,
    course20HoursDate: undefined,
    requires20HourUpdate: false,
    // Fase 8.3.C — designación completa para que COMPLIES se alcance cuando
    // el resto de requisitos documentales están cubiertos.
    designationDate: new Date('2024-03-01T00:00:00.000Z'),
    designationNumber: 'DES-001',
    designationIssuerName: 'Gerencia General',
    designationIssuerPosition: 'Gerente General',
    documents: [
      { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
      { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
      { type: 'SST_LICENSE_PDF', fileName: 'licencia.pdf', fileUrl: 'x' },
      { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
    ],
    alerts: [],
    auditHistory: [],
    complianceStatus: 'PENDING',
    complianceReason: 'Pendiente',
    approvalStatus: 'DRAFT',
    locked: false,
    rejectionReason: '',
    currentVersion: '1.0',
    submittedAt: undefined,
    approvedBy: undefined,
    assignedReviewer: '',
    versions: [],
    ...overrides,
  } as unknown as MockRecord;
  record.save = async () => record;
  return record;
}

/** Construye PhvaAdvancedService con modelos mock (mismo patrón posicional de
 * 26 args que responsible-sgsst-versioning.spec). Añade createUnique en
 * alertsService porque update/attach disparan generateAlerts. */
function buildService(record: MockRecord, options?: { legalRepresentative?: boolean }) {
  const userModel = {
    find: () => ({ exec: async () => [{ _id: new Types.ObjectId(USER_ID), email: 'manager@empresa.com' }] }),
  };
  const alertsService = {
    create: async () => undefined,
    createUnique: async () => undefined,
  };
  const companyProfileModel = {
    findOne: () => ({
      lean: () => ({
        exec: async () =>
          options?.legalRepresentative === false
            ? { managerActsAsLegalRepresentative: false }
            : null,
      }),
    }),
  };
  const responsableSstModel = {
    findOne: () => ({ exec: async () => record }),
    create: async () => record,
  };
  const genericModel = {
    findOne: async () => null,
    findById: () => ({ exec: async () => null }),
    create: async () => record,
  };

  const service = new PhvaAdvancedService(
    responsableSstModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    genericModel as never,
    userModel as never,
    companyProfileModel as never,
    alertsService as never,
    { send: async () => undefined } as never,
    { getPolicyTemplate: async () => null } as never,
    { generateDocument: async () => ({ instanceId: new Types.ObjectId(), fileUrl: '', storagePath: '', version: 1 }) } as never,
    { ensureResponsibleSgsstTemplate: async () => ({ _id: new Types.ObjectId(), name: 'tpl' }) } as never,
    { resolve: async () => null } as never,
    { findById: () => ({ exec: async () => null }) } as never,
    { resolve: async () => null } as never,
    { resolve: async () => null } as never,
    { resolve: async () => null } as never,
    { resolve: async () => null } as never,
  );

  return { service, record };
}

describe('Licencia SST 1.1.1 — sin vencimiento normativo obligatorio', () => {
  it('1. un responsable SIN licenseExpiresAt puede cumplir los requisitos documentales', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'Sin fecha de vencimiento registrada',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);
    assert.equal(record.licenseExpiresAt, undefined);
  });

  it('2. licenseExpiresAt vacío NO produce NON_COMPLIANT (ni motivo de vigencia)', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'Actualización',
    } as never);

    assert.notEqual(record.complianceStatus, ResponsableSstComplianceStatus.NON_COMPLIANT);
    assert.ok(!String(record.complianceReason).includes('no vigente'), 'el motivo no debe citar vigencia');
    // Fase 8.3.C — con un perfil que NO exige documentalmente la licencia, la
    // mera falta de datos queda en PENDING (nunca NON_COMPLIANT por la licencia
    // ni por vigencia). Un perfil exigido sin documento SÍ es NON_COMPLIANT
    // (incumplimiento demostrable, Caso B).
    const incomplete = createMockRecord({ licenseType: 'Consultor SST', documents: [] });
    const { service: serviceIncomplete } = buildService(incomplete);
    await serviceIncomplete.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'Sin documentos',
    } as never);
    assert.equal(incomplete.complianceStatus, ResponsableSstComplianceStatus.PENDING);

    const licenseDocMissing = createMockRecord({ documents: [] });
    const { service: serviceLicenseMissing } = buildService(licenseDocMissing);
    await serviceLicenseMissing.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'Perfil exigido sin licencia',
    } as never);
    assert.equal(licenseDocMissing.complianceStatus, ResponsableSstComplianceStatus.NON_COMPLIANT);
  });

  it('3. licenseExpiresAt vacío NO genera alerta de vencimiento', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    const types = record.alerts.map((a) => a.type);
    assert.ok(!types.some((t) => t.includes('LICENSE_EXPIRED')), 'no debe existir alerta LICENSE_EXPIRED');
    assert.ok(!types.some((t) => /LICENSE_\d+_DAYS/.test(t)), 'no debe existir alerta próxima a vencer');
    assert.deepEqual(types, [], 'sin documentos faltantes ni curso vencido no hay alertas');
  });

  it('4. licenseIssueDate NO calcula automáticamente una fecha de vencimiento', async () => {
    const record = createMockRecord({ licenseExpiresAt: undefined });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      licenseIssueDate: '2025-06-01',
    } as never);

    assert.ok(record.licenseIssueDate, 'la fecha de expedición se guarda');
    assert.equal(record.licenseExpiresAt, undefined, 'no se deriva vencimiento de la expedición');
  });

  it('5. una fecha detectada por OCR se conserva como dato documental sin volverse requisito', async () => {
    const record = createMockRecord({ licenseExpiresAt: undefined });
    const { service } = buildService(record);

    await service.attachLicenseDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      user: createMockUser(),
      type: 'SST_LICENSE_PDF' as never,
      fileName: 'licencia.pdf',
      fileUrl: 'https://cdn.test/licencia.pdf',
      ocrLicenseNumber: 'LIC-001',
      ocrIssueDate: '2024-01-15',
      ocrExpirationDate: '2029-01-15',
    });

    const ocrEntry = record.licenseOcrEntries[0] as { detectedExpirationDate?: Date };
    assert.ok(ocrEntry.detectedExpirationDate, 'el dato OCR se conserva');
    assert.equal(
      (ocrEntry.detectedExpirationDate as Date).toISOString().slice(0, 10),
      '2029-01-15',
    );
    assert.equal(record.licenseExpiresAt, undefined, 'el OCR no auto-asigna el campo normativo');
  });

  it('6. una fecha documental explícita se conserva y su estado es informativo (nunca incumplimiento)', async () => {
    const record = createMockRecord({ licenseExpiresAt: new Date('2029-06-01T00:00:00.000Z') });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'Licencia con vigencia indicada en el acto',
    } as never);

    assert.ok(record.licenseExpiresAt, 'la fecha explícita se conserva');
    assert.equal(record.licenseStatus, 'Vigente', 'estado documental informativo');
    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);

    // Una vigencia pasada indicada por el documento es dato documental: estado
    // informativo 'Vencida' pero NUNCA afecta el cumplimiento del estándar.
    const past = createMockRecord({ licenseExpiresAt: new Date('2020-01-01T00:00:00.000Z') });
    const { service: servicePast } = buildService(past);
    await servicePast.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'Vigencia pasada indicada en documento',
    } as never);
    assert.equal(past.licenseStatus, 'Vencida');
    assert.equal(past.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);
  });

  it('7. el snapshot de versión conserva los datos de licencia (incluida su ausencia)', async () => {
    // Con fecha explícita: el snapshot la conserva.
    const withDate = createMockRecord({ licenseExpiresAt: new Date('2028-01-01T00:00:00.000Z') });
    const { service: serviceWithDate } = buildService(withDate);
    await serviceWithDate.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    const snapshotWithDate = (withDate.versions[0] as { snapshot: { licenseExpiresAt?: Date; sstLicenseNumber?: string } }).snapshot;
    assert.equal(snapshotWithDate.licenseExpiresAt?.toISOString().slice(0, 10), '2028-01-01');

    // Sin fecha: el snapshot también es válido (la ausencia es normal).
    const withoutDate = createMockRecord({ licenseExpiresAt: undefined });
    const { service: serviceWithoutDate } = buildService(withoutDate);
    await serviceWithoutDate.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    const snapshotWithoutDate = (withoutDate.versions[0] as { snapshot: { licenseExpiresAt?: Date; sstLicenseNumber?: string } }).snapshot;
    assert.equal(snapshotWithoutDate.licenseExpiresAt, undefined);
    assert.equal(snapshotWithoutDate.sstLicenseNumber, 'LIC-001');
  });

  it('8. el ciclo submit → reject → resubmit → approve funciona sin licenseExpiresAt', async () => {
    const record = createMockRecord({ licenseExpiresAt: undefined });
    const { service } = buildService(record, { legalRepresentative: false });

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    assert.equal(record.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(record.locked, true);

    await service.rejectResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), 'Corregir cargo');
    assert.equal(record.approvalStatus, 'REJECTED');
    assert.equal(record.locked, false);

    record.position = 'Coordinadora SST ajustada';
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    assert.equal(record.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(record.versions.length, 2, 'se conserva la versión rechazada y se crea una nueva');

    await service.approveResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    assert.equal(record.approvalStatus, 'APPROVED');
    assert.equal(record.locked, true);
    assert.equal((record.versions[0] as { approvalStatus: string }).approvalStatus, 'APPROVED');
    assert.equal((record.versions[1] as { approvalStatus: string }).approvalStatus, 'REJECTED');
  });
});
