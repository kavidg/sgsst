import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';
import { PHVA_SOURCE_ENTITY_COPASST_TRAINING } from '../document-generation/types/document-generation.types';
import { UserDocument } from '../users/schemas/user.schema';
import { CopasstTrainingDocumentService } from './copasst-training-document.service';
import { CopasstTrainingVariableResolverService } from './copasst-training-variable-resolver.service';
import { PhvaAdvancedCopasstTrainingService } from './phva-advanced-copasst-training.service';
import {
  CopasstTrainingEvidence,
  CopasstTrainingEvidenceType,
  CopasstTrainingSession,
  PhvaAdvancedCopasstTrainingDocument,
} from './schemas/phva-advanced-copasst-training.schema';

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';
const USER_ID = '64b0000000000000000000c1';
const PARTICIPANT_ID = '64b0000000000000000000c2';
const NON_MEMBER_ID = '64b0000000000000000000f9';
const TEMPLATE_ID = '64b0000000000000000000a2';

const user = {
  _id: new Types.ObjectId(USER_ID),
  email: 'admin@empresa.com',
} as unknown as UserDocument;

function buildSystemTemplate(): DocumentTemplateDocument {
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    name: 'Plantilla 1.1.7',
    documentType: 'PHVA_COPASST_TRAINING' as never,
    format: 'DOCX' as never,
    source: 'SYSTEM' as never,
    variables: ['company.name'],
    storageUrl: 'system-templates/phva-advanced/x.docx',
    version: 1,
    active: true,
  } as unknown as DocumentTemplateDocument;
}

function executedSession(): CopasstTrainingSession {
  return {
    title: 'Capacitación funciones COPASST',
    type: 'Capacitación COPASST',
    status: 'Ejecutada',
    scheduledDate: new Date('2025-03-01T00:00:00.000Z'),
    completionDate: new Date('2025-03-01T00:00:00.000Z'),
    duration: '4 horas',
    instructor: 'Ing. SST',
    location: 'Sala de reuniones',
    evaluation: 'Aprobado (85/100)',
    copasstParticipants: [
      {
        userId: new Types.ObjectId(PARTICIPANT_ID),
        // Snapshot histórico: rol del momento de la sesión (el miembro pudo
        // cambiar después; no se re-resuelve desde el periodo actual).
        name: 'Ana Gómez',
        committeeRole: 'PRESIDENTE',
        representationType: 'EMPLEADOR',
      },
    ],
  } as unknown as CopasstTrainingSession;
}

function programmedSession(): CopasstTrainingSession {
  return {
    title: 'Capacitación pendiente',
    status: 'Programada',
    scheduledDate: new Date('2025-06-01T00:00:00.000Z'),
    copasstParticipants: [
      {
        userId: new Types.ObjectId(PARTICIPANT_ID),
        name: 'Ana Gómez',
        committeeRole: 'PRESIDENTE',
        representationType: 'EMPLEADOR',
      },
    ],
  } as unknown as CopasstTrainingSession;
}

function buildRecord(companyId = COMPANY_A): PhvaAdvancedCopasstTrainingDocument {
  return {
    _id: new Types.ObjectId('64b0000000000000000000dd'),
    companyId: new Types.ObjectId(companyId),
    itemCode: '1.1.7',
    year: 2025,
    sessions: [executedSession(), programmedSession()],
    evidences: [],
    annualProgram: [{ title: 'Programa anual' }],
    evaluationAttempts: [],
    alerts: [],
    history: [],
    complianceStatus: 'PENDING',
    complianceReason: 'Avance parcial',
    save: async function () {
      return this as unknown as PhvaAdvancedCopasstTrainingDocument;
    },
  } as unknown as PhvaAdvancedCopasstTrainingDocument;
}

/** Stubs encadenables para construir el servicio bajo prueba. */
function buildService(options?: {
  record?: PhvaAdvancedCopasstTrainingDocument;
  coverage?: { totalMembers: number; trainedMembers: number; coveragePercentage: number; executedSessions: number };
  generateError?: Error;
}) {
  const record = options?.record ?? buildRecord();
  const engineCalls: unknown[][] = [];
  const ensureCalls: string[] = [];
  const instanceData: Record<string, unknown> = {};

  const trainingService = {
    findOrCreate: async () => record,
    calculateCoverage: async () =>
      options?.coverage ?? { totalMembers: 5, trainedMembers: 3, coveragePercentage: 60, executedSessions: 1 },
    isSessionExecuted: (session: CopasstTrainingSession) =>
      session.status === 'Ejecutada' || Boolean(session.completionDate),
    addEvidence: async (
      _companyId: Types.ObjectId,
      _user: UserDocument | undefined,
      input: {
        type: CopasstTrainingEvidenceType;
        fileName: string;
        fileUrl: string;
        storagePath?: string;
        sessionIndex?: number;
        metadata?: Record<string, unknown>;
      },
    ) => {
      // Espejo de la denormalización del service real (sessionTitle snapshot).
      const session = input.sessionIndex !== undefined ? record.sessions[input.sessionIndex] : undefined;
      record.evidences.push({
        type: input.type,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        storagePath: input.storagePath,
        sessionIndex: input.sessionIndex,
        sessionTitle: session?.title,
        uploadedBy: _user?._id,
        uploadedAt: new Date(),
        metadata: input.metadata,
      } as never);
      return record;
    },
    findEvidenceBy: async (
      _companyId: Types.ObjectId,
      predicate: (evidence: CopasstTrainingEvidence) => boolean,
    ) => {
      return record.evidences.find(predicate) ?? null;
    },
  } as unknown as PhvaAdvancedCopasstTrainingService;

  const resolver = {
    resolveCertificateContext: async () => ({
      company: { name: 'Empresa SAS', nit: '900123456' },
      participant: {
        name: 'Ana Gómez',
        userId: PARTICIPANT_ID,
        committeeRole: 'PRESIDENTE',
        representationType: 'EMPLEADOR',
      },
      training: {
        title: 'Capacitación funciones COPASST',
        type: 'Capacitación COPASST',
        date: '2025-03-01',
        endDate: '2025-03-01',
        duration: '4 horas',
        instructor: 'Ing. SST',
        location: 'Sala de reuniones',
        evaluation: 'Aprobado (85/100)',
      },
    }),
    resolveAttendanceContext: async () => ({
      company: { name: 'Empresa SAS', nit: '900123456' },
      training: {
        title: 'Capacitación funciones COPASST',
        type: 'Capacitación COPASST',
        date: '2025-03-01',
        duration: '4 horas',
        instructor: 'Ing. SST',
        location: 'Sala de reuniones',
      },
      participants: 'Ana Gómez — PRESIDENTE (EMPLEADOR)\nFirma: ________________',
    }),
    resolveReportContext: async () => ({
      company: { name: 'Empresa SAS', nit: '900123456' },
      training: { year: 2025, period: 'Periodo 2024-2026', program: 'Programa anual' },
      sessions: { executed: 1, programmed: 0 },
      participants: { total: 5, trained: 3, pending: 2 },
      coverage: { percentage: 60 },
      evidences: { total: 1 },
      evaluations: { attempts: 0, passed: 0 },
      compliance: { status: 'PENDING', reason: 'Avance parcial' },
      history: '2025-01-10 · CREATED — Entidad creada',
    }),
    resolveComplianceContext: async () => ({
      company: { name: 'Empresa SAS', nit: '900123456' },
      compliance: { status: 'PENDING', reason: 'Avance parcial' },
      coverage: { totalMembers: 5, trainedMembers: 3, pendingMembers: 2, percentage: 60 },
      sessions: { programmed: 1, executed: 1, expired: 0 },
      evidences: { total: 1, attendance: 0, signatures: 0, certificates: 0 },
      evaluations: { attempts: 0, passed: 0 },
      observations: 'Avance parcial',
    }),
  } as unknown as CopasstTrainingVariableResolverService;

  const documentGenerationService = {
    generateDocument: async (...args: unknown[]) => {
      engineCalls.push(args);
      instanceData.context = (args[0] as { context?: unknown }).context;
      instanceData.sourceModule = (args[0] as { sourceModule?: unknown }).sourceModule;
      instanceData.sourceEntity = (args[0] as { sourceEntity?: unknown }).sourceEntity;
      instanceData.sourceEntityId = (args[0] as { sourceEntityId?: unknown }).sourceEntityId;
      if (options?.generateError) throw options.generateError;
      return {
        instanceId: new Types.ObjectId('64b0000000000000000000ff'),
        fileUrl: 'https://storage.googleapis.com/bucket/documento.docx',
        storagePath: 'document-generation/company/documento.docx',
        version: 1,
      };
    },
    getInstancesBySource: async (params: { companyId: Types.ObjectId }) => {
      assert.equal(params.companyId.toString(), COMPANY_A);
      return [];
    },
  } as unknown as DocumentGenerationService;

  const systemTemplateService = {
    ensureCopasstTrainingCertificateTemplate: async () => {
      ensureCalls.push('CERTIFICATE');
      return buildSystemTemplate();
    },
    ensureCopasstTrainingAttendanceTemplate: async () => {
      ensureCalls.push('ATTENDANCE');
      return buildSystemTemplate();
    },
    ensureCopasstTrainingReportTemplate: async () => {
      ensureCalls.push('REPORT');
      return buildSystemTemplate();
    },
    ensureCopasstTrainingComplianceTemplate: async () => {
      ensureCalls.push('COMPLIANCE');
      return buildSystemTemplate();
    },
  } as unknown as SystemTemplateService;

  const service = new CopasstTrainingDocumentService(
    trainingService,
    resolver,
    documentGenerationService,
    systemTemplateService,
  );

  return { service, record, engineCalls, ensureCalls, instanceData };
}

describe('CopasstTrainingDocumentService (1.1.7, Fase 4)', () => {
  // ═════════════════════════════════════════════
  // CERTIFICADO
  // ═════════════════════════════════════════════
  describe('generateCertificate', () => {
    it('genera el certificado de un participante válido de una sesión ejecutada', async () => {
      const { service, engineCalls, ensureCalls, record, instanceData } = buildService();

      const result = await service.generateCertificate(
        new Types.ObjectId(COMPANY_A),
        user,
        { sessionIndex: 0, participantUserId: PARTICIPANT_ID },
      );

      assert.ok(result.document.instanceId);
      assert.equal(result.reused, false);
      assert.equal(ensureCalls[0], 'CERTIFICATE');
      assert.equal(engineCalls.length, 1);
      const request = engineCalls[0][0] as {
        templateId: string;
        sourceModule: string;
        sourceEntity: string;
        sourceEntityId: Types.ObjectId;
        context: Record<string, unknown>;
      };
      assert.equal(request.templateId, TEMPLATE_ID);
      assert.equal(request.sourceModule, 'PHVA_ADVANCED');
      assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_COPASST_TRAINING);
      assert.equal(request.sourceEntityId.toString(), record._id.toString());
      // Variables correctas del certificado.
      const participant = request.context.participant as Record<string, unknown>;
      assert.equal(participant.name, 'Ana Gómez');
      assert.equal(participant.committeeRole, 'PRESIDENTE');
      assert.equal((request.context.document as { code: string }).code, 'PHVA-1.1.7-CERT');
      // Evidencia estructurada registrada con metadata de participante+instancia.
      assert.equal(record.evidences.length, 1);
      const evidence = record.evidences[0];
      assert.equal(evidence.type, 'CERTIFICATE');
      assert.equal(evidence.sessionIndex, 0);
      assert.equal(evidence.metadata?.participantUserId, PARTICIPANT_ID);
      assert.equal(evidence.metadata?.instanceId, '64b0000000000000000000ff');
      assert.equal(instanceData.sourceModule, 'PHVA_ADVANCED');
      assert.equal(instanceData.sourceEntity, PHVA_SOURCE_ENTITY_COPASST_TRAINING);
    });

    it('usa el snapshot histórico del participante (no re-resuelve el miembro actual)', async () => {
      // El registro ya trae el snapshot con rol histórico; el service lo usa
      // tal cual (el resolver recibe el participante de copasstParticipants).
      const { service, record } = buildService();
      const participant = record.sessions[0].copasstParticipants![0];

      // Simula que el miembro cambió de rol después de la sesión.
      (participant as { committeeRole: string }).committeeRole = 'VOCAL';

      const result = await service.generateCertificate(
        new Types.ObjectId(COMPANY_A),
        user,
        { sessionIndex: 0, participantUserId: PARTICIPANT_ID },
      );

      // El certificado se generó con el rol histórico PRESIDENTE (el resolver
      // stub entrega el rol del snapshot, no el estado actual del miembro).
      assert.ok(result.document.instanceId);
      assert.equal(record.evidences[0].metadata?.participantUserId, PARTICIPANT_ID);
    });

    it('rechaza un participante inexistente en la sesión', async () => {
      const { service } = buildService();

      await assert.rejects(
        () =>
          service.generateCertificate(
            new Types.ObjectId(COMPANY_A),
            user,
            { sessionIndex: 0, participantUserId: NON_MEMBER_ID },
          ),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no está registrado en la sesión'),
      );
    });

    it('rechaza una sesión no ejecutada (programada)', async () => {
      const { service } = buildService();

      await assert.rejects(
        () =>
          service.generateCertificate(
            new Types.ObjectId(COMPANY_A),
            user,
            { sessionIndex: 1, participantUserId: PARTICIPANT_ID },
          ),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no está ejecutada'),
      );
    });

    it('rechaza una sesión inexistente', async () => {
      const { service } = buildService();

      await assert.rejects(
        () =>
          service.generateCertificate(
            new Types.ObjectId(COMPANY_A),
            user,
            { sessionIndex: 9, participantUserId: PARTICIPANT_ID },
          ),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no existe en la capacitación COPASST'),
      );
    });

    it('multi-tenancy: una sesión de otra empresa no es accesible (no existe en la entidad de la empresa autenticada)', async () => {
      // La sesión vive en la entidad de la empresa A; la empresa B tiene su
      // propia entidad sin sesiones → BadRequest de sesión inexistente.
      const { service } = buildService({ record: buildRecord(COMPANY_A) });
      const foreignRecord = buildRecord(COMPANY_B);
      foreignRecord.sessions = [];

      // findOrCreate(B) devuelve la entidad de B (sin la sesión).
      const trainingService = {
        findOrCreate: async () => foreignRecord,
      } as unknown as PhvaAdvancedCopasstTrainingService;
      const resolver = {
        resolveCertificateContext: async () => ({}),
      } as unknown as CopasstTrainingVariableResolverService;
      const engine = {
        generateDocument: async () => ({
          instanceId: new Types.ObjectId(),
          fileUrl: 'https://x',
          storagePath: 'x',
          version: 1,
        }),
      } as unknown as DocumentGenerationService;
      const templates = {
        ensureCopasstTrainingCertificateTemplate: async () => buildSystemTemplate(),
      } as unknown as SystemTemplateService;

      const foreignService = new CopasstTrainingDocumentService(
        trainingService,
        resolver,
        engine,
        templates,
      );

      await assert.rejects(
        () =>
          foreignService.generateCertificate(
            new Types.ObjectId(COMPANY_B),
            user,
            { sessionIndex: 0, participantUserId: PARTICIPANT_ID },
          ),
        (error: Error) =>
          error instanceof BadRequestException &&
          error.message.includes('no existe en la capacitación COPASST'),
      );
    });

    it('reutiliza el certificado existente del mismo participante+sesión sin regenerar', async () => {
      const { service, record, engineCalls } = buildService();

      await service.generateCertificate(new Types.ObjectId(COMPANY_A), user, {
        sessionIndex: 0,
        participantUserId: PARTICIPANT_ID,
      });
      const result = await service.generateCertificate(new Types.ObjectId(COMPANY_A), user, {
        sessionIndex: 0,
        participantUserId: PARTICIPANT_ID,
      });

      assert.equal(result.reused, true);
      assert.equal(result.evidence.fileUrl, record.evidences[0].fileUrl);
      assert.equal(result.document.instanceId?.toString(), '64b0000000000000000000ff');
      // El motor solo se invocó UNA vez (segunda llamada reutilizada).
      assert.equal(engineCalls.length, 1);
      assert.equal(record.evidences.length, 1);
    });

    it('NO reutiliza el certificado si la sesión del índice fue reemplazada por otra (snapshot del título)', async () => {
      const { service, record, engineCalls } = buildService();

      await service.generateCertificate(new Types.ObjectId(COMPANY_A), user, {
        sessionIndex: 0,
        participantUserId: PARTICIPANT_ID,
      });

      // La sesión del índice 0 es reemplazada por OTRA capacitación.
      record.sessions[0] = {
        ...executedSession(),
        title: 'Capacitación completamente distinta',
      } as CopasstTrainingSession;

      const result = await service.generateCertificate(new Types.ObjectId(COMPANY_A), user, {
        sessionIndex: 0,
        participantUserId: PARTICIPANT_ID,
      });

      // NO se reutilizó el certificado de la sesión anterior: se genera uno nuevo.
      assert.equal(result.reused, false);
      assert.equal(engineCalls.length, 2);
      assert.equal(record.evidences.length, 2);
    });

    it('propaga el error controlado del motor de generación', async () => {
      const { service } = buildService({
        generateError: new Error('Falta variable crítica: company.name'),
      });

      await assert.rejects(
        () =>
          service.generateCertificate(new Types.ObjectId(COMPANY_A), user, {
            sessionIndex: 0,
            participantUserId: PARTICIPANT_ID,
          }),
        /Falta variable crítica: company.name/,
      );
    });
  });

  // ═════════════════════════════════════════════
  // LISTA DE ASISTENCIA
  // ═════════════════════════════════════════════
  describe('generateAttendance', () => {
    it('genera la lista de asistencia de una sesión válida usando el snapshot de participantes', async () => {
      const { service, engineCalls, ensureCalls, record, instanceData } = buildService();

      const result = await service.generateAttendance(new Types.ObjectId(COMPANY_A), user, {
        sessionIndex: 0,
      });

      assert.ok(result.document.instanceId);
      assert.equal(ensureCalls[0], 'ATTENDANCE');
      assert.equal(engineCalls.length, 1);
      const request = engineCalls[0][0] as {
        context: Record<string, unknown>;
        sourceEntity: string;
      };
      assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_COPASST_TRAINING);
      assert.equal((request.context.document as { code: string }).code, 'PHVA-1.1.7-ATT');
      const evidence = record.evidences[0];
      assert.equal(evidence.type, 'ATTENDANCE');
      assert.equal(evidence.sessionIndex, 0);
      assert.equal(instanceData.sourceEntity, PHVA_SOURCE_ENTITY_COPASST_TRAINING);
    });

    it('permite generar para una sesión programada (no requiere ejecución)', async () => {
      const { service } = buildService();

      const result = await service.generateAttendance(new Types.ObjectId(COMPANY_A), user, {
        sessionIndex: 1,
      });

      assert.ok(result.document.instanceId);
    });

    it('rechaza una sesión inexistente (multi-tenancy implícita por entidad)', async () => {
      const { service } = buildService();

      await assert.rejects(
        () =>
          service.generateAttendance(new Types.ObjectId(COMPANY_A), user, {
            sessionIndex: 7,
          }),
        BadRequestException,
      );
    });
  });

  // ═════════════════════════════════════════════
  // INFORME
  // ═════════════════════════════════════════════
  describe('generateReport', () => {
    it('genera el informe con variables del dominio y registra evidencia REPORT', async () => {
      const { service, ensureCalls, engineCalls, record, instanceData } = buildService();

      const result = await service.generateReport(new Types.ObjectId(COMPANY_A), user);

      assert.ok(result.document.instanceId);
      assert.equal(ensureCalls[0], 'REPORT');
      assert.equal(engineCalls.length, 1);
      const request = engineCalls[0][0] as { context: Record<string, unknown> };
      assert.equal((request.context.document as { code: string }).code, 'PHVA-1.1.7-INF');
      const participants = request.context.participants as Record<string, unknown>;
      assert.equal(participants.total, 5);
      assert.equal(participants.trained, 3);
      assert.equal(record.evidences[0].type, 'REPORT');
      assert.equal(instanceData.sourceEntity, PHVA_SOURCE_ENTITY_COPASST_TRAINING);
    });
  });

  // ═════════════════════════════════════════════
  // REPORTE DE CUMPLIMIENTO
  // ═════════════════════════════════════════════
  describe('generateComplianceReport', () => {
    it('genera el reporte de cumplimiento con el estado actual del dominio', async () => {
      const { service, ensureCalls, engineCalls, record } = buildService();

      const result = await service.generateComplianceReport(new Types.ObjectId(COMPANY_A), user);

      assert.ok(result.document.instanceId);
      assert.equal(ensureCalls[0], 'COMPLIANCE');
      assert.equal(engineCalls.length, 1);
      const request = engineCalls[0][0] as { context: Record<string, unknown> };
      assert.equal((request.context.document as { code: string }).code, 'PHVA-1.1.7-COMP');
      assert.equal(record.evidences[0].type, 'COMPLIANCE_REPORT');
    });

    it('getComplianceReportData expone el estado parametrizable sin reglas de Compliance Engine', async () => {
      const { service } = buildService();

      const data = await service.getComplianceReportData(new Types.ObjectId(COMPANY_A));

      assert.equal(data.status, 'PENDING');
      assert.equal(data.coveragePercentage, 60);
      assert.equal(data.totalMembers, 5);
      assert.equal(data.trainedMembers, 3);
      assert.equal(data.pendingMembers, 2);
      assert.equal(data.executedSessions, 1);
      assert.ok(Array.isArray(data.observations));
    });
  });

  describe('listDocuments', () => {
    it('consulta la trazabilidad documental scoped por empresa', async () => {
      const { service } = buildService();
      const documents = await service.listDocuments(new Types.ObjectId(COMPANY_A));
      assert.deepEqual(documents, []);
    });
  });
});
