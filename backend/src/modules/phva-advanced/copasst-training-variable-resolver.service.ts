import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { CopasstPeriod, CopasstPeriodDocument } from '../copasst/schemas/copasst.schema';
import {
  CopasstTrainingCoverage,
} from './phva-advanced-copasst-training.service';
import {
  CopasstTrainingParticipant,
  CopasstTrainingSession,
  PhvaAdvancedCopasstTrainingDocument,
} from './schemas/phva-advanced-copasst-training.schema';

/** Formatea una fecha ISO a formato YYYY-MM-DD para el documento. */
function formatDate(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Línea legible de un participante (snapshot histórico de la sesión). */
function participantLine(participant: CopasstTrainingParticipant): string {
  const role = participant.committeeRole ?? '';
  const representation = participant.representationType ?? '';
  return `${participant.name} — ${role}${representation ? ` (${representation})` : ''}`;
}

/** Contexto de variables del Certificado de capacitación COPASST (1.1.7). */
export interface CopasstTrainingCertificateContext {
  company: { name: string | null; nit: string | null };
  participant: {
    name: string;
    userId: string;
    committeeRole: string;
    representationType: string;
  };
  training: {
    title: string;
    type: string;
    date: string;
    endDate: string;
    duration: string;
    instructor: string;
    location: string;
    evaluation: string;
  };
}

/** Contexto de variables de la Lista de asistencia por sesión (1.1.7). */
export interface CopasstTrainingAttendanceContext {
  company: { name: string | null; nit: string | null };
  training: {
    title: string;
    type: string;
    date: string;
    duration: string;
    instructor: string;
    location: string;
  };
  /** Participantes como texto multilínea con espacio de firma. */
  participants: string;
}

/** Contexto de variables del Informe de capacitación (1.1.7). */
export interface CopasstTrainingReportContext {
  company: { name: string | null; nit: string | null };
  training: { year: number; period: string; program: string };
  sessions: { executed: number; programmed: number };
  participants: { total: number; trained: number; pending: number };
  coverage: { percentage: number };
  evidences: { total: number };
  evaluations: { attempts: number; passed: number };
  compliance: { status: string; reason: string };
  history: string;
}

/** Contexto de variables del Reporte de cumplimiento (1.1.7). */
export interface CopasstTrainingComplianceContext {
  company: { name: string | null; nit: string | null };
  compliance: { status: string; reason: string };
  coverage: {
    totalMembers: number;
    trainedMembers: number;
    pendingMembers: number;
    percentage: number;
  };
  sessions: { programmed: number; executed: number; expired: number };
  evidences: { total: number; attendance: number; signatures: number; certificates: number };
  evaluations: { attempts: number; passed: number };
  observations: string;
}

/**
 * Resolver de dominio de los documentos de la Capacitación COPASST (1.1.7,
 * Fase 4).
 *
 * Recibe los datos reales del dominio (empresa, sesión con su snapshot
 * histórico, cobertura calculada por PhvaAdvancedCopasstTrainingService) y
 * entrega SOLO el contexto de variables de cada plantilla. NO genera
 * documentos: es una consulta de solo lectura.
 *
 * Valores ausentes → cadena vacía (el renderer no inventa datos):
 * - company.nit: solo si la empresa lo tiene registrado.
 * - training.*: campos libres de la sesión (duration, instructor, ...).
 * - training.evaluation: resultado de evaluación solo si realmente existe.
 * - training.period: nombre del periodo COPASST si record.periodId apunta a
 *   un periodo válido de la misma empresa.
 */
@Injectable()
export class CopasstTrainingVariableResolverService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(CopasstPeriod.name)
    private readonly copasstPeriodModel: Model<CopasstPeriodDocument>,
  ) {}

  private async resolveCompany(
    companyId: Types.ObjectId,
  ): Promise<{ name: string | null; nit: string | null }> {
    const company = await this.companyModel.findById(companyId).exec();
    return { name: company?.name ?? null, nit: company?.nit ?? null };
  }

  /** Nombre del periodo COPASST de referencia (solo lectura, misma empresa). */
  private async resolvePeriodName(
    companyId: Types.ObjectId,
    periodId?: Types.ObjectId,
  ): Promise<string> {
    if (!periodId) return '';
    const period = await this.copasstPeriodModel.findById(periodId).exec();
    if (!period || period.companyId.toString() !== companyId.toString()) return '';
    return period.periodName ?? '';
  }

  /** Contexto del Certificado (1.1.7): participante concreto de sesión ejecutada. */
  async resolveCertificateContext(
    companyId: Types.ObjectId,
    session: CopasstTrainingSession,
    participant: CopasstTrainingParticipant,
  ): Promise<CopasstTrainingCertificateContext> {
    const company = await this.resolveCompany(companyId);
    return {
      company,
      participant: {
        name: participant.name,
        userId: participant.userId.toString(),
        committeeRole: participant.committeeRole ?? '',
        representationType: participant.representationType ?? '',
      },
      training: {
        title: session.title,
        type: session.type ?? '',
        date: formatDate(session.scheduledDate),
        endDate: formatDate(session.completionDate),
        duration: session.duration ?? '',
        instructor: session.instructor ?? '',
        location: session.location ?? '',
        evaluation: session.evaluation ?? '',
      },
    };
  }

  /** Contexto de la Lista de asistencia (1.1.7): snapshot de la sesión. */
  async resolveAttendanceContext(
    companyId: Types.ObjectId,
    session: CopasstTrainingSession,
  ): Promise<CopasstTrainingAttendanceContext> {
    const company = await this.resolveCompany(companyId);
    const participantLines = (session.copasstParticipants ?? []).map(
      (participant) => `${participantLine(participant)}\nFirma: ______________________________`,
    );
    return {
      company,
      training: {
        title: session.title,
        type: session.type ?? '',
        date: formatDate(session.scheduledDate),
        duration: session.duration ?? '',
        instructor: session.instructor ?? '',
        location: session.location ?? '',
      },
      participants: participantLines.join('\n\n'),
    };
  }

  /** Contexto del Informe de capacitación (1.1.7): estado completo del dominio. */
  async resolveReportContext(
    companyId: Types.ObjectId,
    record: PhvaAdvancedCopasstTrainingDocument,
    coverage: CopasstTrainingCoverage,
  ): Promise<CopasstTrainingReportContext> {
    const [company, period] = await Promise.all([
      this.resolveCompany(companyId),
      this.resolvePeriodName(companyId, record.periodId),
    ]);

    const programLines = (record.annualProgram ?? []).map((item) =>
      `${item.title ?? ''}${item.status ? ` (${item.status})` : ''}${item.scheduledDate ? ` — ${formatDate(item.scheduledDate)}` : ''}`,
    );
    const historyLines = (record.history ?? []).map(
      (entry) =>
        `${formatDate(entry.createdAt)} · ${entry.action}${entry.details ? ` — ${entry.details}` : ''}`,
    );

    const executed = coverage.executedSessions;
    const programmed = (record.sessions ?? []).length - executed;
    const passed = (record.evaluationAttempts ?? []).filter(
      (attempt) => attempt.passed,
    ).length;

    return {
      company,
      training: {
        year: record.year,
        period,
        program: programLines.join('\n'),
      },
      sessions: { executed, programmed },
      participants: {
        total: coverage.totalMembers,
        trained: coverage.trainedMembers,
        pending: coverage.totalMembers - coverage.trainedMembers,
      },
      coverage: { percentage: coverage.coveragePercentage },
      evidences: { total: (record.evidences ?? []).length },
      evaluations: {
        attempts: (record.evaluationAttempts ?? []).length,
        passed,
      },
      compliance: {
        status: record.complianceStatus,
        reason: record.complianceReason,
      },
      history: historyLines.join('\n'),
    };
  }

  /** Contexto del Reporte de cumplimiento (1.1.7): estado actual sin reglas de Compliance Engine. */
  async resolveComplianceContext(
    companyId: Types.ObjectId,
    record: PhvaAdvancedCopasstTrainingDocument,
    coverage: CopasstTrainingCoverage,
  ): Promise<CopasstTrainingComplianceContext> {
    const company = await this.resolveCompany(companyId);

    const evidences = record.evidences ?? [];
    const sessions = record.sessions ?? [];
    const now = Date.now();
    const expired = sessions.filter(
      (session) =>
        !this.isSessionExecuted(session) &&
        session.expirationDate &&
        new Date(session.expirationDate).getTime() < now,
    ).length;
    const passed = (record.evaluationAttempts ?? []).filter(
      (attempt) => attempt.passed,
    ).length;

    // Observaciones: solo datos reales del dominio (alertas persistidas y
    // observación de cumplimiento). No se inventan findings normativos.
    const observationsLines = [
      ...(record.complianceReason ? [record.complianceReason] : []),
      ...(record.alerts ?? []),
    ];

    return {
      company,
      compliance: {
        status: record.complianceStatus,
        reason: record.complianceReason,
      },
      coverage: {
        totalMembers: coverage.totalMembers,
        trainedMembers: coverage.trainedMembers,
        pendingMembers: coverage.totalMembers - coverage.trainedMembers,
        percentage: coverage.coveragePercentage,
      },
      sessions: {
        programmed: sessions.length - coverage.executedSessions,
        executed: coverage.executedSessions,
        expired,
      },
      evidences: {
        total: evidences.length,
        attendance: evidences.filter((evidence) => evidence.type === 'ATTENDANCE').length,
        signatures: evidences.filter((evidence) => evidence.type === 'SIGNATURE').length,
        certificates: evidences.filter((evidence) => evidence.type === 'CERTIFICATE').length,
      },
      evaluations: {
        attempts: (record.evaluationAttempts ?? []).length,
        passed,
      },
      observations: observationsLines.join('\n'),
    };
  }

  /**
   * Condición de dominio de sesión ejecutada (espejo de
   * PhvaAdvancedCopasstTrainingService.isSessionExecuted): status 'Ejecutada'
   * O completionDate registrado. Duplicado local para no acoplar el resolver
   * al servicio de dominio (evita ciclos); la regla es la misma.
   */
  private isSessionExecuted(session: CopasstTrainingSession): boolean {
    return session.status === 'Ejecutada' || Boolean(session.completionDate);
  }
}
