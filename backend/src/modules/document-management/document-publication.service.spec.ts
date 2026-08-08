import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { DocumentSourceModule } from '../document-generation/types/renderer.types';
import { DocumentInstanceDocument } from '../document-generation/schemas/document-instance.schema';
import { DocumentMaster, DocumentStatus, DocumentType } from './schemas/document-master.schema';
import { DocumentPublicationService } from './services/document-publication.service';
import { DocumentMasterService } from './services/document-master.service';

const COMPANY_ID = '64b000000000000000000001';
const APPROVED_BY = '64b000000000000000000003';
const EVENT_ID = '64b000000000000000000004';
const INSTANCE_ID = '64b00000000000000000000a';
const FILE_URL = 'https://storage.googleapis.com/bucket/doc.docx';

/** Construye una DocumentInstance publicable (PHVA, APPROVED). */
function buildInstance(overrides?: Partial<Record<string, unknown>>): DocumentInstanceDocument {
  return {
    _id: new Types.ObjectId(INSTANCE_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    sourceModule: DocumentSourceModule.PHVA_ADVANCED,
    sourceEntity: 'RESPONSIBLE_SG_SST',
    approvalStatus: 'APPROVED',
    fileUrl: FILE_URL,
    approvedBy: new Types.ObjectId(APPROVED_BY),
    approvedAt: new Date('2026-01-01T00:00:00Z'),
    approvalEventId: new Types.ObjectId(EVENT_ID),
    ...overrides,
  } as unknown as DocumentInstanceDocument;
}

type DocumentMasterWithId = DocumentMaster & { _id: Types.ObjectId };

function buildDocument(overrides?: Partial<DocumentMaster>): DocumentMasterWithId {
  return {
    _id: new Types.ObjectId('64b0000000000000000000aa'),
    companyId: new Types.ObjectId(COMPANY_ID),
    code: 'PHVA-1.1.1',
    name: 'Designación Responsable SG-SST',
    documentType: DocumentType.LEGAL_DOCUMENT,
    status: DocumentStatus.ACTIVE,
    version: 1,
    ...overrides,
  } as unknown as DocumentMasterWithId;
}

function buildHarness(overrides?: {
  existingDoc?: DocumentMasterWithId | null;
  /** Documento creado "concurrentemente" por otra publicación (carrera E11000). */
  raceExistingDoc?: DocumentMasterWithId | null;
  linkedDoc?: DocumentMasterWithId | null;
  linkedNotFound?: boolean;
  registerThrows?: boolean;
  currentVersionFileUrl?: string;
}): {
  service: DocumentPublicationService;
  registerCalls: unknown[];
  uploadVersionCalls: unknown[];
  updateStatusCalls: unknown[];
  instanceUpdates: Array<{ set: Record<string, unknown> }>;
} {
  const registerCalls: unknown[] = [];
  const uploadVersionCalls: unknown[] = [];
  const updateStatusCalls: unknown[] = [];
  const instanceUpdates: Array<{ set: Record<string, unknown> }> = [];
  let findByCompanyAndCodeCalls = 0;

  const documentMasterService = {
    registerDocument: async (params: unknown) => {
      registerCalls.push(params);
      if (overrides?.registerThrows) {
        throw new Error('Document with code "PHVA-1.1.1" already exists');
      }
      return buildDocument();
    },
    findByCompanyAndCode: async () => {
      findByCompanyAndCodeCalls += 1;
      // Carrera: en la primera consulta el código aún no existe; solo aparece
      // tras el intento de create fallido (creado por la otra publicación).
      if (overrides?.raceExistingDoc && findByCompanyAndCodeCalls === 1) {
        return null;
      }
      return overrides?.existingDoc ?? overrides?.raceExistingDoc ?? null;
    },
    findById: async () => {
      if (overrides?.linkedNotFound) {
        throw new NotFoundException('Document with id not found');
      }
      return overrides?.linkedDoc ?? null;
    },
    getCurrentVersion: async () => ({
      fileUrl: overrides?.currentVersionFileUrl ?? FILE_URL,
    }),
    uploadVersion: async (documentId: Types.ObjectId, companyId: Types.ObjectId, fileUrl: string) => {
      uploadVersionCalls.push({ documentId: documentId.toString(), companyId: companyId.toString(), fileUrl });
      return {
        document: buildDocument({ status: DocumentStatus.UNDER_REVIEW, version: 2 }),
        version: { versionNumber: 2 },
      };
    },
    updateStatus: async (
      documentId: Types.ObjectId,
      companyId: Types.ObjectId,
      status: DocumentStatus,
      reason: string,
      user: unknown,
      meta: unknown,
    ) => {
      updateStatusCalls.push({ documentId: documentId.toString(), companyId: companyId.toString(), status, reason, meta });
      return buildDocument({ status, version: 2 });
    },
  } as unknown as DocumentMasterService;

  const instanceModel = {
    updateOne: (filter: unknown, set: { $set: Record<string, unknown> }) => {
      // Se captura el payload real del $set (no el envoltorio mongo).
      instanceUpdates.push({ set: set.$set });
      return { exec: async () => ({}) };
    },
  };

  const service = new DocumentPublicationService(
    documentMasterService,
    instanceModel as never,
  );

  return { service, registerCalls, uploadVersionCalls, updateStatusCalls, instanceUpdates };
}

describe('DocumentPublicationService.publishFromInstance', () => {
  it('no publica instancias de módulos distintos a PHVA_ADVANCED', async () => {
    const { service, registerCalls, instanceUpdates } = buildHarness();
    const instance = buildInstance({ sourceModule: DocumentSourceModule.TEMPLATES });

    const result = await service.publishFromInstance(instance);

    assert.equal(result, null);
    assert.equal(registerCalls.length, 0);
    assert.equal(instanceUpdates.length, 0);
  });

  it('no publica entidades sin mapeo declarativo', async () => {
    const { service, registerCalls, instanceUpdates } = buildHarness();
    const instance = buildInstance({ sourceEntity: 'UNKNOWN_ENTITY' });

    const result = await service.publishFromInstance(instance);

    assert.equal(result, null);
    assert.equal(registerCalls.length, 0);
    assert.equal(instanceUpdates.length, 0);
  });

  it('no publica instancias sin estado de aprobación aprobado', async () => {
    const { service, registerCalls, instanceUpdates } = buildHarness();
    const instance = buildInstance({ approvalStatus: 'PENDING_APPROVAL' });

    const result = await service.publishFromInstance(instance);

    assert.equal(result, null);
    assert.equal(registerCalls.length, 0);
    assert.equal(instanceUpdates.length, 0);
  });

  it('crea el DocumentMaster cuando no existe (registerDocument con ACTIVE)', async () => {
    const { service, registerCalls, instanceUpdates } = buildHarness();
    const instance = buildInstance();

    const result = await service.publishFromInstance(instance);

    assert.equal(result?.action, 'created');
    assert.equal(result?.standardCode, '1.1.1');
    assert.equal(registerCalls.length, 1);

    const params = registerCalls[0] as {
      code: string;
      documentType: DocumentType;
      status: DocumentStatus;
      fileUrl: string;
      approvalUser?: Types.ObjectId;
      approvalDate?: Date;
      skipCommunication: boolean;
      ownerUser?: Types.ObjectId;
    };
    assert.equal(params.code, 'PHVA-1.1.1');
    assert.equal(params.documentType, DocumentType.LEGAL_DOCUMENT);
    assert.equal(params.status, DocumentStatus.ACTIVE);
    assert.equal(params.fileUrl, FILE_URL);
    assert.equal(params.approvalUser?.toString(), APPROVED_BY);
    assert.equal(params.ownerUser?.toString(), APPROVED_BY);
    assert.ok(params.approvalDate instanceof Date);
    assert.equal(params.skipCommunication, true);

    // La instancia queda vinculada con documentMasterId y standardCode.
    assert.equal(instanceUpdates.length, 1);
    const set = instanceUpdates[0].set;
    const documentMasterId = set.documentMasterId as Types.ObjectId;
    assert.equal(documentMasterId.toString(), '64b0000000000000000000aa');
    assert.equal(set.standardCode, '1.1.1');
  });

  it('acepta APPROVED_AND_SIGNED como estado aprobado', async () => {
    const { service, registerCalls } = buildHarness();
    const instance = buildInstance({ approvalStatus: 'APPROVED_AND_SIGNED' });

    const result = await service.publishFromInstance(instance);

    assert.equal(result?.action, 'created');
    assert.equal(registerCalls.length, 1);
  });

  it('crea una nueva versión cuando el código ya existe (uploadVersion + ACTIVE)', async () => {
    // Publicado previamente por el servicio: process coincide con el mapeo.
    const existing = buildDocument({ process: 'SG-SST' });
    const { service, registerCalls, uploadVersionCalls, updateStatusCalls, instanceUpdates } =
      buildHarness({ existingDoc: existing });

    const result = await service.publishFromInstance(buildInstance());

    assert.equal(result?.action, 'updated');
    assert.equal(registerCalls.length, 0);
    assert.equal(uploadVersionCalls.length, 1);
    assert.equal(updateStatusCalls.length, 1);

    const statusCall = updateStatusCalls[0] as {
      status: DocumentStatus;
      meta?: { approvalUser?: Types.ObjectId; approvalDate?: Date; skipCommunication?: boolean };
    };
    assert.equal(statusCall.status, DocumentStatus.ACTIVE);
    assert.equal(statusCall.meta?.approvalUser?.toString(), APPROVED_BY);
    assert.equal(statusCall.meta?.skipCommunication, true);
    assert.equal(instanceUpdates.length, 1);
  });

  it('salta la publicación si la instancia ya está vinculada a un maestro vigente (backfill standardCode)', async () => {
    const linked = buildDocument();
    const { service, registerCalls, uploadVersionCalls, instanceUpdates } = buildHarness({
      linkedDoc: linked,
    });
    const instance = buildInstance({ documentMasterId: linked._id });

    const result = await service.publishFromInstance(instance);

    assert.equal(result?.action, 'skipped');
    assert.equal(registerCalls.length, 0);
    assert.equal(uploadVersionCalls.length, 0);
    // No crea ni versiona, pero sí re-escribe la instancia para mantener
    // consistencia (backfill de standardCode en instancias legadas).
    assert.equal(instanceUpdates.length, 1);
    const set = instanceUpdates[0].set;
    assert.equal((set.documentMasterId as Types.ObjectId).toString(), '64b0000000000000000000aa');
    assert.equal(set.standardCode, '1.1.1');
  });

  it('omite la publicación si el código colisiona con un documento manual', async () => {
    const manual = buildDocument({ process: 'Documentación General' });
    const { service, registerCalls, uploadVersionCalls, instanceUpdates } = buildHarness({
      existingDoc: manual,
    });

    const result = await service.publishFromInstance(buildInstance());

    assert.equal(result, null);
    assert.equal(registerCalls.length, 0);
    assert.equal(uploadVersionCalls.length, 0);
    assert.equal(instanceUpdates.length, 0);
  });

  it('recrea el maestro si el vinculado fue eliminado', async () => {
    const { service, registerCalls } = buildHarness({ linkedNotFound: true });
    const instance = buildInstance({
      documentMasterId: new Types.ObjectId('64b0000000000000000000bb'),
    });

    const result = await service.publishFromInstance(instance);

    assert.equal(result?.action, 'created');
    assert.equal(registerCalls.length, 1);
  });

  it('ante carrera E11000 reutiliza el maestro concurrente sin versión redundante', async () => {
    const existing = buildDocument();
    const { service, registerCalls, uploadVersionCalls, instanceUpdates } = buildHarness({
      registerThrows: true,
      raceExistingDoc: existing,
      currentVersionFileUrl: FILE_URL,
    });

    const result = await service.publishFromInstance(buildInstance());

    assert.equal(result?.action, 'skipped');
    assert.equal(registerCalls.length, 1);
    assert.equal(uploadVersionCalls.length, 0);
    assert.equal(instanceUpdates.length, 1);
  });

  it('mapea SST_POLICY a POLICY y COPASST a COPASST con standardCode 1.1.6', async () => {
    const { service, registerCalls } = buildHarness();

    await service.publishFromInstance(
      buildInstance({ sourceEntity: 'SST_POLICY', approvalStatus: 'APPROVED' }),
    );
    let params = registerCalls[0] as { code: string; documentType: DocumentType };
    assert.equal(params.code, 'PHVA-2.1.1');
    assert.equal(params.documentType, DocumentType.POLICY);

    await service.publishFromInstance(
      buildInstance({ sourceEntity: 'COPASST', approvalStatus: 'APPROVED' }),
    );
    params = registerCalls[1] as { code: string; documentType: DocumentType };
    assert.equal(params.code, 'PHVA-COPASST');
    assert.equal(params.documentType, DocumentType.COPASST);
  });
});
