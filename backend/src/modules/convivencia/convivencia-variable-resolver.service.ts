import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { ConvivenciaComplianceSnapshot } from './convivencia.service';
import { ConvivenciaPeriodDocument } from './schemas/convivencia.schema';

/** Formatea una fecha a YYYY-MM-DD para el documento (sin datos falsos). */
function formatDate(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Línea legible de un miembro del comité para el acta. */
function memberLine(member: {
  userName: string;
  committeeRole: string;
  representationType: string;
  status?: string;
}): string {
  const role = member.committeeRole ?? '';
  const representation = member.representationType ?? '';
  return `${member.userName} — ${role}${representation ? ` (${representation})` : ''}`;
}

/** Contexto de variables del Acta de conformación (1.1.8). */
export interface ConvivenciaConstitutionContext {
  company: { name: string | null; nit: string | null; workerCount: number };
  convivencia: {
    periodName: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  /** Miembros como texto multilínea. */
  members: string;
  /** Representantes del empleador (representationType EMPLEADOR). */
  employerRepresentatives: string;
  /** Representantes de los trabajadores (representationType TRABAJADOR). */
  workerRepresentatives: string;
  approval: { status: string; approvedBy: string; approvedAt: string };
}

/** Contexto de variables del Reporte de cumplimiento (1.1.8). */
export interface ConvivenciaComplianceContext {
  company: { name: string | null; nit: string | null };
  compliance: { status: string; reason: string; percentage: number };
  criteria: { met: string; missing: string };
  period: {
    status: string;
    approvalStatus: string;
    memberCount: number;
    meetingCount: number;
    completedMeetingCount: number;
    evidenceCount: number;
    commitmentCount: number;
  };
  /** Casos confidenciales: SOLO conteos agregados (nunca contenido). */
  cases: { total: number; open: number; closed: number };
}

/**
 * Resolver de dominio de los documentos del Comité de Convivencia (1.1.8,
 * Fase 5).
 *
 * Recibe los datos reales del dominio (empresa + periodo vigente o snapshot de
 * cumplimiento) y entrega SOLO el contexto de variables de cada plantilla. NO
 * genera documentos: es una consulta de solo lectura.
 *
 * Seguridad de datos: el contexto NUNCA incluye secureToken, OTP, teléfonos,
 * documentos de identidad, URLs de storage ni contenido de casos
 * confidenciales. Los casos se exponen únicamente como conteos agregados.
 *
 * NO reimplementa resolveCompliance(): el reporte de cumplimiento consume el
 * snapshot ya resuelto por el dominio (ConvivenciaComplianceSnapshot).
 */
@Injectable()
export class ConvivenciaVariableResolverService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  private async resolveCompany(
    companyId: Types.ObjectId,
  ): Promise<{ name: string | null; nit: string | null; workerCount: number }> {
    const company = await this.companyModel.findById(companyId).exec();
    return {
      name: company?.name ?? null,
      nit: company?.nit ?? null,
      workerCount: company?.employeeCount ?? 0,
    };
  }

  /** Contexto del Acta de conformación (1.1.8): datos reales del periodo. */
  async resolveConstitutionContext(
    companyId: Types.ObjectId,
    period: ConvivenciaPeriodDocument,
  ): Promise<ConvivenciaConstitutionContext> {
    const company = await this.resolveCompany(companyId);
    const members = period.members ?? [];

    const employerRepresentatives = members
      .filter((member) => member.representationType === 'EMPLEADOR')
      .map((member) => memberLine(member))
      .join('\n');
    const workerRepresentatives = members
      .filter((member) => member.representationType === 'TRABAJADOR')
      .map((member) => memberLine(member))
      .join('\n');

    return {
      company,
      convivencia: {
        periodName: period.periodName ?? '',
        startDate: formatDate(period.startDate),
        endDate: formatDate(period.endDate),
        status: period.status ?? '',
      },
      members: members.map((member) => memberLine(member)).join('\n'),
      employerRepresentatives: employerRepresentatives || '(sin representantes del empleador)',
      workerRepresentatives: workerRepresentatives || '(sin representantes de los trabajadores)',
      approval: {
        status: period.approvalStatus ?? '',
        approvedBy: period.approvedBy?.email ?? '',
        approvedAt: period.approvedBy?.timestamp ?? '',
      },
    };
  }

  /** Contexto del Reporte de cumplimiento (1.1.8): snapshot real del dominio. */
  async resolveComplianceContext(
    companyId: Types.ObjectId,
    snapshot: ConvivenciaComplianceSnapshot,
    period: ConvivenciaPeriodDocument,
  ): Promise<ConvivenciaComplianceContext> {
    const company = await this.resolveCompany(companyId);
    const meetings = period.meetings ?? [];
    const completedMeetings = meetings.filter(
      (meeting) => meeting.status === 'CERRADA',
    ).length;
    const cases = period.cases ?? [];

    return {
      company,
      compliance: {
        status: snapshot.complianceStatus,
        reason: snapshot.complianceReason,
        percentage: snapshot.percentage,
      },
      criteria: {
        met: snapshot.metCriteria.join('\n') || '(ninguno)',
        missing: snapshot.missingCriteria.join('\n') || '(ninguno)',
      },
      period: {
        status: snapshot.periodStatus,
        approvalStatus: snapshot.approvalStatus,
        memberCount: (period.members ?? []).length,
        meetingCount: meetings.length,
        completedMeetingCount: completedMeetings,
        evidenceCount: snapshot.evidenceCount,
        commitmentCount: (period.commitments ?? []).length,
      },
      // Casos confidenciales: SOLO conteos, nunca contenido ni PII.
      cases: {
        total: cases.length,
        open: cases.filter((c) => c.status !== 'CLOSED').length,
        closed: cases.filter((c) => c.status === 'CLOSED').length,
      },
    };
  }
}
