import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { CopasstTrainingVariableResolverService } from './copasst-training-variable-resolver.service';
import { CopasstTrainingCoverage } from './phva-advanced-copasst-training.service';
import {
  CopasstTrainingEvidenceType,
  CopasstTrainingSession,
  PhvaAdvancedCopasstTrainingDocument,
} from './schemas/phva-advanced-copasst-training.schema';

const COMPANY_ID = '64b000000000000000000001';
const PERIOD_ID = '64b000000000000000000002';

function buildCompanyModel() {
  return {
    findById: () => ({
      exec: async () => ({
        _id: new Types.ObjectId(COMPANY_ID),
        name: 'Empresa SAS',
        nit: '900123456',
        employeeCount: 42,
      }),
    }),
  };
}

function buildPeriodModel(overrides?: { periodName?: string; companyId?: string }) {
  return {
    findById: () => ({
      exec: async () => ({
        _id: new Types.ObjectId(PERIOD_ID),
        companyId: new Types.ObjectId(overrides?.companyId ?? COMPANY_ID),
        periodName: overrides?.periodName ?? 'Periodo 2024-2026',
      }),
    }),
  };
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
        userId: new Types.ObjectId('64b000000000000000000011'),
        name: 'Ana Gómez',
        committeeRole: 'PRESIDENTE',
        representationType: 'EMPLEADOR',
      },
    ],
  } as unknown as CopasstTrainingSession;
}

function buildRecord(overrides?: Partial<PhvaAdvancedCopasstTrainingDocument>) {
  return {
    _id: new Types.ObjectId('64b0000000000000000000dd'),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.7',
    year: 2025,
    periodId: new Types.ObjectId(PERIOD_ID),
    sessions: [executedSession()],
    annualProgram: [
      {
        title: 'Identificación de peligros',
        status: 'Ejecutada',
        scheduledDate: new Date('2025-02-01T00:00:00.000Z'),
      },
    ],
    evidences: [
      {
        type: CopasstTrainingEvidenceType.ATTENDANCE,
        fileName: 'lista.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/lista.pdf',
        uploadedAt: new Date(),
      },
      {
        type: CopasstTrainingEvidenceType.CERTIFICATE,
        fileName: 'certificado.pdf',
        fileUrl: 'https://storage.googleapis.com/bucket/certificado.pdf',
        uploadedAt: new Date(),
      },
      {
        type: CopasstTrainingEvidenceType.REPORT,
        fileName: 'informe.docx',
        fileUrl: 'https://storage.googleapis.com/bucket/informe.docx',
        uploadedAt: new Date(),
      },
    ],
    evaluationAttempts: [
      { attemptNumber: 1, score: 85, passed: true },
      { attemptNumber: 2, score: 60, passed: false },
    ],
    alerts: ['Sesión próxima a vencer'],
    history: [
      {
        action: 'CREATED',
        createdBy: 'system',
        createdAt: new Date('2025-01-10T00:00:00.000Z'),
        details: 'Entidad 1.1.7 creada',
      },
    ],
    complianceStatus: 'PENDING',
    complianceReason: 'Avance parcial',
    ...overrides,
  } as unknown as PhvaAdvancedCopasstTrainingDocument;
}

function buildCoverage(overrides?: Partial<CopasstTrainingCoverage>): CopasstTrainingCoverage {
  return {
    totalMembers: 5,
    trainedMembers: 3,
    coveragePercentage: 60,
    executedSessions: 1,
    ...overrides,
  };
}

function buildResolver(options?: { periodName?: string; periodCompanyId?: string }) {
  return new CopasstTrainingVariableResolverService(
    buildCompanyModel() as never,
    buildPeriodModel({
      periodName: options?.periodName,
      companyId: options?.periodCompanyId,
    }) as never,
  );
}

describe('CopasstTrainingVariableResolverService (1.1.7, Fase 4)', () => {
  describe('resolveCertificateContext', () => {
    it('resuelve empresa, participante (snapshot) y capacitación reales', async () => {
      const resolver = buildResolver();
      const session = executedSession();
      const participant = session.copasstParticipants![0];

      const context = await resolver.resolveCertificateContext(
        new Types.ObjectId(COMPANY_ID),
        session,
        participant,
      );

      assert.equal(context.company.name, 'Empresa SAS');
      assert.equal(context.company.nit, '900123456');
      assert.equal(context.participant.name, 'Ana Gómez');
      assert.equal(context.participant.userId, '64b000000000000000000011');
      assert.equal(context.participant.committeeRole, 'PRESIDENTE');
      assert.equal(context.participant.representationType, 'EMPLEADOR');
      assert.equal(context.training.title, 'Capacitación funciones COPASST');
      assert.equal(context.training.endDate, '2025-03-01');
      assert.equal(context.training.evaluation, 'Aprobado (85/100)');
    });

    it('no inventa datos: campos ausentes quedan vacíos', async () => {
      const resolver = buildResolver();
      const session = {
        title: 'Sesión sin detalles',
        copasstParticipants: [
          { userId: new Types.ObjectId('64b000000000000000000011'), name: 'Ana' },
        ],
      } as unknown as CopasstTrainingSession;

      const context = await resolver.resolveCertificateContext(
        new Types.ObjectId(COMPANY_ID),
        session,
        session.copasstParticipants![0],
      );

      assert.equal(context.participant.committeeRole, '');
      assert.equal(context.training.duration, '');
      assert.equal(context.training.endDate, '');
      assert.equal(context.training.evaluation, '');
    });
  });

  describe('resolveAttendanceContext', () => {
    it('entrega participantes como texto multilínea con espacio de firma', async () => {
      const resolver = buildResolver();
      const context = await resolver.resolveAttendanceContext(
        new Types.ObjectId(COMPANY_ID),
        executedSession(),
      );

      assert.equal(typeof context.participants, 'string');
      assert.ok(context.participants.includes('Ana Gómez — PRESIDENTE (EMPLEADOR)'));
      assert.ok(context.participants.includes('Firma: ________________'));
      assert.equal(context.training.date, '2025-03-01');
      assert.equal(context.training.duration, '4 horas');
    });

    it('participants vacío cuando la sesión no tiene snapshot', async () => {
      const resolver = buildResolver();
      const session = {
        title: 'Sesión sin participantes',
      } as unknown as CopasstTrainingSession;

      const context = await resolver.resolveAttendanceContext(
        new Types.ObjectId(COMPANY_ID),
        session,
      );
      assert.equal(context.participants, '');
    });
  });

  describe('resolveReportContext', () => {
    it('resuelve cobertura, programa, evaluaciones, historial y cumplimiento reales', async () => {
      const resolver = buildResolver();
      const record = buildRecord();
      const coverage = buildCoverage();

      const context = await resolver.resolveReportContext(
        new Types.ObjectId(COMPANY_ID),
        record,
        coverage,
      );

      assert.equal(context.training.year, 2025);
      assert.equal(context.training.period, 'Periodo 2024-2026');
      assert.ok(context.training.program.includes('Identificación de peligros (Ejecutada)'));
      assert.equal(context.sessions.executed, 1);
      assert.equal(context.sessions.programmed, 0);
      assert.equal(context.participants.total, 5);
      assert.equal(context.participants.trained, 3);
      assert.equal(context.participants.pending, 2);
      assert.equal(context.coverage.percentage, 60);
      assert.equal(context.evidences.total, 3);
      assert.equal(context.evaluations.attempts, 2);
      assert.equal(context.evaluations.passed, 1);
      assert.equal(context.compliance.status, 'PENDING');
      assert.ok(context.history.includes('CREATED'));
    });

    it('period vacío si la entidad no tiene periodId o el periodo no pertenece a la empresa', async () => {
      const resolver = buildResolver({ periodCompanyId: '64b0000000000000000000ff' });
      const record = buildRecord();
      const context = await resolver.resolveReportContext(
        new Types.ObjectId(COMPANY_ID),
        record,
        buildCoverage(),
      );
      assert.equal(context.training.period, '');
    });
  });

  describe('resolveComplianceContext', () => {
    it('cuenta sesiones vencidas y evidencias por tipo sin reglas de Compliance Engine', async () => {
      const resolver = buildResolver();
      const record = buildRecord();
      // Sesión vencida sin ejecutar (expirationDate en el pasado).
      record.sessions.push({
        title: 'Sesión vencida',
        status: 'Programada',
        scheduledDate: new Date('2025-01-01T00:00:00.000Z'),
        expirationDate: new Date('2025-01-15T00:00:00.000Z'),
        copasstParticipants: [],
      } as never);

      const context = await resolver.resolveComplianceContext(
        new Types.ObjectId(COMPANY_ID),
        record,
        buildCoverage(),
      );

      assert.equal(context.coverage.totalMembers, 5);
      assert.equal(context.coverage.pendingMembers, 2);
      assert.equal(context.sessions.executed, 1);
      assert.equal(context.sessions.expired, 1);
      assert.equal(context.evidences.total, 3);
      assert.equal(context.evidences.attendance, 1);
      assert.equal(context.evidences.signatures, 0);
      assert.equal(context.evidences.certificates, 1);
      assert.equal(context.evaluations.passed, 1);
      assert.ok(context.observations.includes('Avance parcial'));
      assert.ok(context.observations.includes('Sesión próxima a vencer'));
    });

    it('no cuenta como vencida una sesión ejecutada aunque tenga expirationDate pasado', async () => {
      const resolver = buildResolver();
      const record = buildRecord();
      record.sessions.push({
        title: 'Ejecutada vencida',
        status: 'Ejecutada',
        expirationDate: new Date('2025-01-15T00:00:00.000Z'),
        completionDate: new Date('2025-01-10T00:00:00.000Z'),
        copasstParticipants: [],
      } as never);

      const context = await resolver.resolveComplianceContext(
        new Types.ObjectId(COMPANY_ID),
        record,
        buildCoverage(),
      );
      assert.equal(context.sessions.expired, 0);
    });
  });
});
