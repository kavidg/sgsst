import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import {
  bumpResponsableSstVersion,
  buildResponsableSstVersionSnapshot,
} from './phva-advanced-versioning.utils';
import { UserDocument } from '../users/schemas/user.schema';

const COMPANY_ID = '64b000000000000000000001';
const USER_ID = '64b000000000000000000003';

/** Versión interna mínima expuesta por el mock (misma forma que ResponsableSstVersion). */
type MockVersion = {
  version: string;
  reason: string;
  action: string;
  approvalStatus: string;
  rejectionReason?: string;
  approvedAt?: Date;
  submittedAt?: Date;
  snapshot: Record<string, unknown>;
};

type MockRecord = Record<string, unknown> & {
  versions: MockVersion[];
  auditHistory: Array<Record<string, unknown>>;
  documents: unknown[];
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

function createMockRecord(overrides: Record<string, unknown> = {}): MockRecord {
  const record = {
    _id: new Types.ObjectId('64b000000000000000000002'),
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
    licenseExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    licenseStatus: 'Vigente',
    licenseOcrEntries: [],
    course50HoursDate: new Date('2024-02-01T00:00:00.000Z'),
    course50HoursDetectedDate: undefined,
    course20HoursDate: undefined,
    requires20HourUpdate: false,
    // Fase 8.3.C — designación completa para que COMPLIES/sumbit/approve funcionen.
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

/** Construye PhvaAdvancedService con modelos mock (mismo patrón posicional de 26 args que el spec documental). */
function buildService(record: MockRecord, options?: { legalRepresentative?: boolean }) {
  const userModel = {
    find: () => ({ exec: async () => [{ _id: new Types.ObjectId(USER_ID), email: 'manager@empresa.com' }] }),
  };
  const alertsService = { create: async () => undefined };
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

describe('Versionado estructurado PHVA 1.1.1 (Responsable del SG-SST)', () => {
  it('crea un snapshot inmutable sin compartir referencias con el registro vivo', () => {
    const record = createMockRecord();
    const snapshot = buildResponsableSstVersionSnapshot(record as never);

    // Mutar el registro después del snapshot NO debe alterarlo.
    record.fullName = 'Nombre Cambiado';
    record.licenseExpiresAt = new Date('2099-01-01T00:00:00.000Z');
    record.documents.push({ type: 'DESIGNATION', fileName: 'designacion-v2.pdf', fileUrl: 'x' });
    record.designationNumber = 'DES-999';

    assert.equal(snapshot.fullName, 'Ana Pérez');
    assert.equal(snapshot.licenseExpiresAt?.toISOString(), '2027-01-01T00:00:00.000Z');
    assert.equal(snapshot.documents.length, 4);
    assert.equal(snapshot.designationNumber, 'DES-001');
    assert.equal(snapshot.sstLicenseNumber, 'LIC-001');
  });

  it('bumpResponsableSstVersion sigue el patrón 0.1 por ciclo', () => {
    assert.equal(bumpResponsableSstVersion(), '1.1');
    assert.equal(bumpResponsableSstVersion('1.0'), '1.1');
    assert.equal(bumpResponsableSstVersion('1.1'), '1.2');
    assert.equal(bumpResponsableSstVersion('3.2'), '3.3');
  });

  it('1. primer envío: crea la versión v1.1 (SUBMIT), PENDING_APPROVAL y locked', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.versions.length, 1);
    const version = record.versions[0];
    assert.equal(version.version, '1.1');
    assert.equal(version.reason, 'SUBMIT');
    assert.equal(version.approvalStatus, 'PENDING_APPROVAL');
    assert.ok(version.submittedAt);
    assert.equal(version.snapshot.fullName, 'Ana Pérez');
    assert.equal(record.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(record.locked, true);
    assert.equal(record.currentVersion, '1.1');
    assert.ok(record.submittedAt);
  });

  it('2. rechazo: conserva la versión (REJECTED + rejectionReason) y su snapshot', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    const snapshotBeforeReject = JSON.stringify(record.versions[0].snapshot);

    await service.rejectResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), 'Corregir profesión');

    assert.equal(record.versions.length, 1, 'no se crea una versión nueva al rechazar');
    assert.equal(record.versions[0].approvalStatus, 'REJECTED');
    assert.equal(record.versions[0].rejectionReason, 'Corregir profesión');
    assert.equal(JSON.stringify(record.versions[0].snapshot), snapshotBeforeReject, 'el snapshot no cambia');
    assert.equal(record.approvalStatus, 'REJECTED');
    assert.equal(record.locked, false);
    assert.equal(record.rejectionReason, 'Corregir profesión');
  });

  it('3. reenvío tras rechazo: nueva versión (RESUBMIT) conservando la anterior', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    // Ciclo real: DRAFT → submit → v1.1 PENDING → reject → REJECTED.
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    await service.rejectResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), 'Corregir profesión');

    // El usuario corrige la información y reenvía.
    record.fullName = 'Ana Pérez Corregida';
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.versions.length, 2);
    const latest = record.versions[0];
    const previous = record.versions[1];
    assert.equal(latest.version, '1.2');
    assert.equal(latest.reason, 'RESUBMIT');
    assert.equal(latest.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(latest.snapshot.fullName, 'Ana Pérez Corregida');
    // La versión rechazada se conserva intacta.
    assert.equal(previous.version, '1.1');
    assert.equal(previous.approvalStatus, 'REJECTED');
    assert.equal(previous.rejectionReason, 'Corregir profesión');
    assert.equal(previous.snapshot.fullName, 'Ana Pérez');
    // Estado vivo: PENDING_APPROVAL, locked y rechazo limpio.
    assert.equal(record.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(record.locked, true);
    assert.equal(record.currentVersion, '1.2');
    assert.equal(record.rejectionReason, '');
  });

  it('4. aprobación: marca la versión vigente como APPROVED + approvedAt y bloquea sin crear versión nueva', async () => {
    const record = createMockRecord();
    const { service } = buildService(record, { legalRepresentative: false });

    // Ciclo real: DRAFT → submit → reject → re-submit (v1.2) → approve.
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    await service.rejectResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), 'Ajustar cargo');
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    const versionsBeforeApprove = record.versions.length;
    const snapshotBeforeApprove = JSON.stringify(record.versions[0].snapshot);

    await service.approveResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.versions.length, versionsBeforeApprove, 'aprobar no crea una versión nueva');
    assert.equal(record.versions[0].approvalStatus, 'APPROVED');
    assert.ok(record.versions[0].approvedAt);
    assert.equal(JSON.stringify(record.versions[0].snapshot), snapshotBeforeApprove, 'el snapshot aprobado queda inmutable');
    assert.equal(record.approvalStatus, 'APPROVED');
    assert.equal(record.locked, true);
    assert.ok(record.approvedBy);
  });

  it('5. editar después de aprobación: lanza BadRequest (inmutabilidad)', async () => {
    const record = createMockRecord({ approvalStatus: 'APPROVED', locked: true, currentVersion: '1.2' });
    const { service } = buildService(record);

    await assert.rejects(
      () =>
        service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
          fullName: 'Intento de cambio',
        } as never),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /bloqueado/.test(error.message),
    );

    assert.equal(record.fullName, 'Ana Pérez', 'el registro no se modifica');
  });

  it('6. las versiones anteriores permanecen sin cambios tras todo el ciclo', async () => {
    const record = createMockRecord();
    const { service } = buildService(record, { legalRepresentative: false });

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    const v1Snapshot = JSON.stringify(record.versions[0].snapshot);

    await service.rejectResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), 'Corregir');
    record.fullName = 'Corregido';
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    await service.approveResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.versions.length, 2);
    assert.equal(JSON.stringify(record.versions[1].snapshot), v1Snapshot, 'la versión 1 sigue intacta');
    assert.equal(record.versions[1].approvalStatus, 'REJECTED');
    assert.equal(record.versions[0].approvalStatus, 'APPROVED');
  });
});
