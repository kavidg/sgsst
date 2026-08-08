import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedService } from './phva-advanced.service';
import { ResponsableSstComplianceStatus } from './schemas/phva-advanced-responsable-sst.schema';
import { UserDocument } from '../users/schemas/user.schema';

const COMPANY_ID = '64b000000000000000000021';
const USER_ID = '64b000000000000000000023';

type MockRecord = Record<string, unknown> & {
  documents: Array<{ type: string; fileName: string; fileUrl: string }>;
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

const COMPLETE_DOCUMENTS = [
  { type: 'DIPLOMA', fileName: 'diploma.pdf', fileUrl: 'x' },
  { type: 'FIFTY_HOUR_CERTIFICATE', fileName: 'curso50.pdf', fileUrl: 'x' },
  { type: 'SST_LICENSE_PDF', fileName: 'licencia.pdf', fileUrl: 'x' },
  { type: 'DESIGNATION', fileName: 'designacion.pdf', fileUrl: 'x' },
];

/** Registro COMPLETO por defecto (alcanza COMPLIES). Cada test elimina lo que necesita. */
function createMockRecord(overrides: Record<string, unknown> = {}): MockRecord {
  const record = {
    _id: new Types.ObjectId('64b000000000000000000022'),
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
    licenseExpiresAt: undefined,
    licenseStatus: undefined,
    licenseOcrEntries: [],
    course50HoursDate: new Date('2024-02-01T00:00:00.000Z'),
    course50HoursDetectedDate: undefined,
    course20HoursDate: undefined,
    requires20HourUpdate: false,
    designationDate: new Date('2024-03-01T00:00:00.000Z'),
    designationNumber: 'DES-001',
    designationIssuerName: 'Gerencia General',
    designationIssuerPosition: 'Gerente General',
    documents: [...COMPLETE_DOCUMENTS],
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

/** Construye PhvaAdvancedService con modelos mock (patrón posicional de 26 args). */
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
    findById: () => ({ exec: async () => record }),
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
    { resolve: async () => ({ company: { name: 'Acme', nit: '900000' }, responsible: { name: 'Ana' } }) } as never,
    { findById: () => ({ exec: async () => null }) } as never,
    { resolve: async () => null } as never,
    { resolve: async () => null } as never,
    { resolve: async () => null } as never,
    { resolve: async () => null } as never,
  );

  return { service, record };
}

describe('PHVA 1.1.1 — Designación, COMPLIES/PENDING/NON_COMPLIANT y Approval Gate (Fase 8.3.C)', () => {
  // ─────────────────────────── DESIGNACIÓN ───────────────────────────
  it('1. sin designación → PENDING', async () => {
    const record = createMockRecord({
      designationDate: undefined,
      designationIssuerName: '',
      designationIssuerPosition: '',
    });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.PENDING);
    assert.match(String(record.complianceReason), /Designación incompleta/);
  });

  it('2. datos de designación sin evidencia → PENDING', async () => {
    const record = createMockRecord({
      documents: COMPLETE_DOCUMENTS.filter((d) => d.type !== 'DESIGNATION'),
    });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.PENDING);
    assert.match(String(record.complianceReason), /Documento de designación pendiente/);
  });

  it('3. evidencia de designación completa → permite COMPLIES si el resto cumple', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);
  });

  it('4. designación incluida en el snapshot de versión', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    const snapshot = (record.versions[0] as {
      snapshot: {
        designationDate?: Date;
        designationNumber?: string;
        designationIssuerName?: string;
        designationIssuerPosition?: string;
        documents: Array<{ type: string }>;
      };
    }).snapshot;
    assert.equal(snapshot.designationDate?.toISOString().slice(0, 10), '2024-03-01');
    assert.equal(snapshot.designationNumber, 'DES-001');
    assert.equal(snapshot.designationIssuerName, 'Gerencia General');
    assert.equal(snapshot.designationIssuerPosition, 'Gerente General');
    assert.ok(snapshot.documents.some((d) => d.type === 'DESIGNATION'));
  });

  it('5. nueva versión conserva versiones anteriores intactas (designación anterior)', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    await service.rejectResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), 'Cambiar designación');

    record.designationNumber = 'DES-002';
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.versions.length, 2);
    const v2 = record.versions[0] as { snapshot: { designationNumber?: string } };
    const v1 = record.versions[1] as { snapshot: { designationNumber?: string } };
    assert.equal(v2.snapshot.designationNumber, 'DES-002');
    assert.equal(v1.snapshot.designationNumber, 'DES-001');
    assert.equal((record.versions[1] as { approvalStatus: string }).approvalStatus, 'REJECTED');
  });

  // ─────────────────────────── COMPLIANCE ───────────────────────────
  it('6. registro completo → COMPLIES', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);
  });

  it('7. curso 50h antiguo + sin actualización 20h → NON_COMPLIANT', async () => {
    const record = createMockRecord({ course50HoursDate: new Date('2020-01-01T00:00:00.000Z') });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.NON_COMPLIANT);
    assert.match(String(record.complianceReason), /actualización de 20 horas/);
  });

  it('8. curso 50h antiguo + actualización 20h válida → no NON_COMPLIANT por ese motivo', async () => {
    const record = createMockRecord({
      course50HoursDate: new Date('2020-01-01T00:00:00.000Z'),
      course20HoursDate: new Date('2023-06-01T00:00:00.000Z'),
      documents: [...COMPLETE_DOCUMENTS, { type: 'TWENTY_HOUR_UPDATE_CERTIFICATE', fileName: 'curso20.pdf', fileUrl: 'x' }],
    });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.notEqual(record.complianceStatus, ResponsableSstComplianceStatus.NON_COMPLIANT);
    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);
  });

  it('9. licencia sin fecha de vencimiento → nunca NON_COMPLIANT por vigencia', async () => {
    const record = createMockRecord({ licenseExpiresAt: undefined });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.notEqual(record.complianceStatus, ResponsableSstComplianceStatus.NON_COMPLIANT);
    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);
    assert.equal(record.licenseStatus, 'Pendiente');
  });

  it('10. fecha documental antigua de licencia → no genera incumplimiento por sí sola', async () => {
    const record = createMockRecord({ licenseExpiresAt: new Date('2020-01-01T00:00:00.000Z') });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.licenseStatus, 'Vencida', 'estado documental informativo');
    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.COMPLIES);
  });

  it('11. falta diploma → PENDING', async () => {
    const record = createMockRecord({
      documents: COMPLETE_DOCUMENTS.filter((d) => d.type !== 'DIPLOMA'),
    });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.PENDING);
  });

  it('12. falta certificado curso 50h → PENDING', async () => {
    const record = createMockRecord({
      documents: COMPLETE_DOCUMENTS.filter((d) => d.type !== 'FIFTY_HOUR_CERTIFICATE'),
    });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.PENDING);
  });

  it('13. falta designación (datos y evidencia) → PENDING', async () => {
    const record = createMockRecord({
      designationDate: undefined,
      designationIssuerName: '',
      designationIssuerPosition: '',
      documents: COMPLETE_DOCUMENTS.filter((d) => d.type !== 'DESIGNATION'),
    });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.PENDING);
  });

  // ─────────────────────────── APPROVAL GATE ───────────────────────────
  it('14. no se puede enviar a aprobación si está PENDING', async () => {
    const record = createMockRecord({
      documents: COMPLETE_DOCUMENTS.filter((d) => d.type !== 'DESIGNATION'),
    });
    const { service } = buildService(record);

    await assert.rejects(
      () => service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser()),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /no cumple todos los requisitos/.test(error.message) &&
        /PENDING/.test(error.message),
    );
    assert.equal(record.approvalStatus, 'DRAFT');
  });

  it('15. no se puede enviar a aprobación si está NON_COMPLIANT', async () => {
    const record = createMockRecord({ course50HoursDate: new Date('2020-01-01T00:00:00.000Z') });
    const { service } = buildService(record);

    await assert.rejects(
      () => service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser()),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /no cumple todos los requisitos/.test(error.message) &&
        /NON_COMPLIANT/.test(error.message),
    );
    assert.equal(record.approvalStatus, 'DRAFT');
  });

  it('16. no se puede aprobar directamente si no está COMPLIES', async () => {
    const record = createMockRecord({
      approvalStatus: 'PENDING_APPROVAL',
      documents: COMPLETE_DOCUMENTS.filter((d) => d.type !== 'DESIGNATION'),
    });
    const { service } = buildService(record);

    await assert.rejects(
      () => service.approveResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser()),
      (error: unknown) => error instanceof BadRequestException && /no cumple todos los requisitos/.test(error.message),
    );
    assert.equal(record.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(record.locked, false);
  });

  it('17. COMPLIES → submit exitoso (PENDING_APPROVAL + versión)', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.approvalStatus, 'PENDING_APPROVAL');
    assert.equal(record.locked, true);
    assert.equal(record.currentVersion, '1.1');
    assert.equal(record.versions.length, 1);
  });

  it('18. COMPLIES → approve exitoso (APPROVED + locked)', async () => {
    const record = createMockRecord();
    const { service } = buildService(record, { legalRepresentative: false });

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    await service.approveResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.approvalStatus, 'APPROVED');
    assert.equal(record.locked, true);
    assert.ok(record.approvedBy);
  });

  it('19. rechazo → corrección → RESUBMIT genera nueva versión', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());
    await service.rejectResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), 'Ajustar cargo');
    assert.equal(record.approvalStatus, 'REJECTED');

    // Corrección (la edición sigue disponible tras el rechazo).
    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      designationNumber: 'DES-002',
    } as never);
    await service.submitResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser());

    assert.equal(record.versions.length, 2);
    assert.equal(record.currentVersion, '1.2');
    assert.equal((record.versions[0] as { reason: string }).reason, 'RESUBMIT');
    assert.equal((record.versions[1] as { approvalStatus: string }).approvalStatus, 'REJECTED');
    assert.equal(record.approvalStatus, 'PENDING_APPROVAL');
  });

  // ─────────────────────────── REGRESIÓN ───────────────────────────
  it('20. no aparecen alertas LICENSE_EXPIRED', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.ok(!record.alerts.some((a) => a.type.includes('LICENSE_EXPIRED')));
  });

  it('21. no aparecen alertas LICENSE_*_DAYS', async () => {
    const record = createMockRecord();
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.ok(!record.alerts.some((a) => /LICENSE_\d+_DAYS/.test(a.type)));
  });

  it('22. el flujo de generación documental no se rompe para un registro COMPLIES', async () => {
    const record = createMockRecord({ complianceStatus: ResponsableSstComplianceStatus.COMPLIES });
    const { service } = buildService(record);

    const result = await service.generateResponsibleSgsstDocument({
      companyId: new Types.ObjectId(COMPANY_ID),
      sourceEntityId: record._id as Types.ObjectId,
    });

    assert.ok(result.instanceId);
  });

  it('23. perfil exigido pero con campos base faltantes → PENDING (datos insuficientes, no NON_COMPLIANT)', async () => {
    // Caso B requiere "suficiente información": si faltan campos base del
    // registro, el hueco de evidencia no se convierte en NON_COMPLIANT.
    const record = createMockRecord({
      fullName: '',
      documents: COMPLETE_DOCUMENTS.filter((d) => d.type !== 'SST_LICENSE_PDF'),
    });
    const { service } = buildService(record);

    await service.updateResponsableSst(new Types.ObjectId(COMPANY_ID), createMockUser(), {
      observations: 'x',
    } as never);

    assert.equal(record.complianceStatus, ResponsableSstComplianceStatus.PENDING);
  });
});
