import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import {
  DocumentGenerationResult,
  PHVA_SOURCE_ENTITY_COPASST_TRAINING,
} from '../document-generation/types/document-generation.types';
import { DocumentSourceModule } from '../document-generation/types/renderer.types';
import { UserDocument } from '../users/schemas/user.schema';
import { CopasstTrainingVariableResolverService } from './copasst-training-variable-resolver.service';
import {
  CopasstTrainingCoverage,
  PhvaAdvancedCopasstTrainingService,
} from './phva-advanced-copasst-training.service';
import {
  CopasstTrainingEvidence,
  CopasstTrainingEvidenceType,
  CopasstTrainingParticipant,
  CopasstTrainingSession,
} from './schemas/phva-advanced-copasst-training.schema';

/** Código documental del Certificado de capacitación COPASST (1.1.7). */
export const COPASST_TRAINING_DOCUMENT_CODE_CERTIFICATE = 'PHVA-1.1.7-CERT';
/** Código documental de la Lista de asistencia por sesión (1.1.7). */
export const COPASST_TRAINING_DOCUMENT_CODE_ATTENDANCE = 'PHVA-1.1.7-ATT';
/** Código documental del Informe de capacitación (1.1.7). */
export const COPASST_TRAINING_DOCUMENT_CODE_REPORT = 'PHVA-1.1.7-INF';
/** Código documental del Reporte de cumplimiento (1.1.7). */
export const COPASST_TRAINING_DOCUMENT_CODE_COMPLIANCE = 'PHVA-1.1.7-COMP';

/** Nombre de archivo del informe de capacitación (1.1.7). */
export const COPASST_TRAINING_REPORT_FILENAME = 'informe-capacitacion-copasst.docx';
/** Nombre de archivo del reporte de cumplimiento (1.1.7). */
export const COPASST_TRAINING_COMPLIANCE_FILENAME = 'reporte-cumplimiento-copasst.docx';

/**
 * Reporte de cumplimiento parametrizable de 1.1.7 (Fase 4).
 *
 * Consume ÚNICAMENTE el estado actual del dominio (cobertura calculada por
 * PhvaAdvancedCopasstTrainingService, sesiones, evidencias estructuradas,
 * evaluaciones y observaciones persistidas). NO implementa reglas del
 * Compliance Engine: esa lógica llegará en una fase posterior y podrá
 * reutilizar esta estructura como fuente de datos.
 */
export interface CopasstTrainingComplianceData {
  status: string;
  coveragePercentage: number;
  totalMembers: number;
  trainedMembers: number;
  pendingMembers: number;
  scheduledSessions: number;
  executedSessions: number;
  expiredSessions: number;
  availableEvidences: number;
  evaluationAttempts: number;
  passedEvaluations: number;
  observations: string[];
}

/** Resultado de una generación documental de 1.1.7 (contrato del frontend). */
export interface CopasstTrainingDocumentResult {
  /**
   * Resultado del Document Generation Engine. En el caso REUTILIZADO,
   * `instanceId` puede ser undefined cuando la evidencia legada no persistió
   * el id de la instancia en su metadata (nunca se fabrica un id).
   */
  document: {
    instanceId?: Types.ObjectId;
    fileUrl: string;
    storagePath: string;
    version: number;
  };
  /** Evidencia estructurada registrada en la entidad 1.1.7. */
  evidence: CopasstTrainingEvidence;
  /** true si se reutilizó un documento existente (sin regenerar). */
  reused: boolean;
}

/**
 * CopasstTrainingDocumentService: generación documental de la Capacitación
 * COPASST (PHVA 1.1.7, Fase 4).
 *
 * Sigue EXACTAMENTE el patrón del motor existente (mismo flujo que
 * PhvaAdvancedService.generateCopasstDocument):
 *
 *   1. Validar dominio (sesión/participante/estado + multi-tenancy por
 *      companyId; NUNCA se acepta companyId del cliente).
 *   2. Asegurar la plantilla de sistema (SystemTemplateService).
 *   3. Resolver variables de dominio (CopasstTrainingVariableResolverService).
 *   4. Delegar en DocumentGenerationService.generateDocument() con
 *      sourceModule PHVA_ADVANCED, sourceEntity COPASST_TRAINING y
 *      sourceEntityId = id de la entidad 1.1.7.
 *   5. Registrar el documento generado como evidencia estructurada en la
 *      entidad (persistencia real, sin URLs ficticias).
 *
 * NO duplica RendererService, StorageService, TemplateSourceService ni
 * DocumentGenerationService.
 */
@Injectable()
export class CopasstTrainingDocumentService {
  constructor(
    private readonly trainingService: PhvaAdvancedCopasstTrainingService,
    private readonly resolver: CopasstTrainingVariableResolverService,
    private readonly documentGenerationService: DocumentGenerationService,
    private readonly systemTemplateService: SystemTemplateService,
  ) {}

  // ─────────────────────────────────────────────
  // CERTIFICADO DE CAPACITACIÓN (1.1.7)
  // ─────────────────────────────────────────────

  /**
   * Genera el certificado de capacitación de un participante concreto de una
   * sesión EJECUTADA.
   *
   * Reglas de dominio (Fase 4):
   * - Solo participantes REALMENTE presentes en la sesión (snapshot histórico
   *   de `copasstParticipants`; nunca se re-resuelve el miembro actual del
   *   periodo COPASST).
   * - Solo sesiones ejecutadas (status 'Ejecutada' o completionDate).
   * - Si ya existe un certificado para el mismo participante+sesión, se
   *   REUTILIZA (comportamiento estándar de reutilización del sistema).
   *
   * @param params.sessionIndex - Índice estable de la sesión en record.sessions.
   * @param params.participantUserId - userId del snapshot histórico del participante.
   */
  async generateCertificate(
    companyId: Types.ObjectId,
    user: UserDocument | undefined,
    params: { sessionIndex: number; participantUserId: string },
  ): Promise<CopasstTrainingDocumentResult> {
    const record = await this.trainingService.findOrCreate(companyId);
    const session = this.assertSessionExists(record.sessions, params.sessionIndex);

    if (!this.trainingService.isSessionExecuted(session)) {
      throw new BadRequestException(
        'La sesión no está ejecutada: no se puede generar el certificado de capacitación.',
      );
    }

    const participant = this.findParticipantInSession(
      session,
      params.participantUserId,
    );

    // Reutilización estándar: certificado existente para el mismo participante
    // + sesión (evidencia estructurada ya persistida). Además del índice
    // estable se compara el snapshot del título de la sesión: si la sesión de
    // ese índice fue reemplazada/eliminada y reordenada, NO se reutiliza un
    // certificado de otra capacitación (se genera uno nuevo).
    const existing = (record.evidences ?? []).find(
      (evidence) =>
        evidence.type === CopasstTrainingEvidenceType.CERTIFICATE &&
        evidence.sessionIndex === params.sessionIndex &&
        evidence.sessionTitle === session.title &&
        evidence.metadata?.participantUserId === params.participantUserId,
    );
    if (existing) {
      return {
        document: {
          instanceId: this.instanceIdFromMetadata(existing),
          fileUrl: existing.fileUrl,
          storagePath: existing.storagePath ?? '',
          version: this.versionFromMetadata(existing),
        },
        evidence: existing,
        reused: true,
      };
    }

    const template = await this.systemTemplateService.ensureCopasstTrainingCertificateTemplate();
    const domainContext = await this.resolver.resolveCertificateContext(
      companyId,
      session,
      participant,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: COPASST_TRAINING_DOCUMENT_CODE_CERTIFICATE,
        year: record.year,
        generatedAt: new Date().toISOString(),
      },
    };

    const document = await this.documentGenerationService.generateDocument({
      companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
      sourceEntityId: record._id,
      generatedBy: this.resolveUserId(user),
      context,
    });

    const evidence = await this.registerEvidence(companyId, user, {
      type: CopasstTrainingEvidenceType.CERTIFICATE,
      fileName: `certificado-${this.sanitize(participant.name)}.docx`,
      fileUrl: document.fileUrl,
      storagePath: document.storagePath,
      sessionIndex: params.sessionIndex,
      metadata: {
        participantUserId: params.participantUserId,
        instanceId: document.instanceId.toString(),
        version: document.version,
      },
    });

    return { document, evidence, reused: false };
  }

  // ─────────────────────────────────────────────
  // LISTA DE ASISTENCIA (1.1.7)
  // ─────────────────────────────────────────────

  /**
   * Genera la lista de asistencia de una sesión de 1.1.7.
   *
   * Usa EXCLUSIVAMENTE el snapshot histórico de participantes de la sesión
   * (inmutable); NO vuelve a resolver los participantes desde
   * CopasstPeriod.members. Se permite para sesiones ejecutadas y programadas
   * (el backend solo valida que la sesión exista y pertenezca a la empresa).
   */
  async generateAttendance(
    companyId: Types.ObjectId,
    user: UserDocument | undefined,
    params: { sessionIndex: number },
  ): Promise<CopasstTrainingDocumentResult> {
    const record = await this.trainingService.findOrCreate(companyId);
    const session = this.assertSessionExists(record.sessions, params.sessionIndex);

    const template = await this.systemTemplateService.ensureCopasstTrainingAttendanceTemplate();
    const domainContext = await this.resolver.resolveAttendanceContext(
      companyId,
      session,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: COPASST_TRAINING_DOCUMENT_CODE_ATTENDANCE,
        year: record.year,
        generatedAt: new Date().toISOString(),
      },
    };

    const document = await this.documentGenerationService.generateDocument({
      companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
      sourceEntityId: record._id,
      generatedBy: this.resolveUserId(user),
      context,
    });

    const evidence = await this.registerEvidence(companyId, user, {
      type: CopasstTrainingEvidenceType.ATTENDANCE,
      fileName: `lista-asistencia-${this.sanitize(session.title)}.docx`,
      fileUrl: document.fileUrl,
      storagePath: document.storagePath,
      sessionIndex: params.sessionIndex,
    });

    return { document, evidence, reused: false };
  }

  // ─────────────────────────────────────────────
  // INFORME DE CAPACITACIÓN (1.1.7)
  // ─────────────────────────────────────────────

  /**
   * Genera el informe documental de la capacitación COPASST. Usa únicamente
   * datos reales del dominio (empresa, programa anual, sesiones, cobertura,
   * evidencias, evaluaciones, estado de cumplimiento e historial). No inventa
   * contenido normativo.
   */
  async generateReport(
    companyId: Types.ObjectId,
    user: UserDocument | undefined,
  ): Promise<CopasstTrainingDocumentResult> {
    const record = await this.trainingService.findOrCreate(companyId);
    const coverage = await this.trainingService.calculateCoverage(companyId, record);

    const template = await this.systemTemplateService.ensureCopasstTrainingReportTemplate();
    const domainContext = await this.resolver.resolveReportContext(
      companyId,
      record,
      coverage,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: COPASST_TRAINING_DOCUMENT_CODE_REPORT,
        generatedAt: new Date().toISOString(),
      },
    };

    const document = await this.documentGenerationService.generateDocument({
      companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
      sourceEntityId: record._id,
      generatedBy: this.resolveUserId(user),
      context,
    });

    const evidence = await this.registerEvidence(companyId, user, {
      type: CopasstTrainingEvidenceType.REPORT,
      fileName: COPASST_TRAINING_REPORT_FILENAME,
      fileUrl: document.fileUrl,
      storagePath: document.storagePath,
    });

    return { document, evidence, reused: false };
  }

  // ─────────────────────────────────────────────
  // REPORTE DE CUMPLIMIENTO (1.1.7)
  // ─────────────────────────────────────────────

  /**
   * Reporte de cumplimiento parametrizable de 1.1.7 (Fase 4). Expone el
   * estado actual del dominio sin implementar reglas del Compliance Engine;
   * podrá ser reutilizado por Compliance/PHVA en fases posteriores.
   */
  async getComplianceReportData(
    companyId: Types.ObjectId,
  ): Promise<CopasstTrainingComplianceData> {
    const record = await this.trainingService.findOrCreate(companyId);
    const coverage = await this.trainingService.calculateCoverage(companyId, record);

    const sessions = record.sessions ?? [];
    const evidences = record.evidences ?? [];
    const now = Date.now();
    const expired = sessions.filter(
      (session) =>
        !this.trainingService.isSessionExecuted(session) &&
        session.expirationDate &&
        new Date(session.expirationDate).getTime() < now,
    ).length;

    return {
      status: record.complianceStatus,
      coveragePercentage: coverage.coveragePercentage,
      totalMembers: coverage.totalMembers,
      trainedMembers: coverage.trainedMembers,
      pendingMembers: coverage.totalMembers - coverage.trainedMembers,
      scheduledSessions: sessions.length - coverage.executedSessions,
      executedSessions: coverage.executedSessions,
      expiredSessions: expired,
      availableEvidences: evidences.length,
      evaluationAttempts: (record.evaluationAttempts ?? []).length,
      passedEvaluations: (record.evaluationAttempts ?? []).filter(
        (attempt) => attempt.passed,
      ).length,
      observations: [
        ...(record.complianceReason ? [record.complianceReason] : []),
        ...(record.alerts ?? []),
      ],
    };
  }

  /** Genera el documento del Reporte de cumplimiento (1.1.7). */
  async generateComplianceReport(
    companyId: Types.ObjectId,
    user: UserDocument | undefined,
  ): Promise<CopasstTrainingDocumentResult> {
    const record = await this.trainingService.findOrCreate(companyId);
    const coverage = await this.trainingService.calculateCoverage(companyId, record);

    const template = await this.systemTemplateService.ensureCopasstTrainingComplianceTemplate();
    const domainContext = await this.resolver.resolveComplianceContext(
      companyId,
      record,
      coverage,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: COPASST_TRAINING_DOCUMENT_CODE_COMPLIANCE,
        generatedAt: new Date().toISOString(),
      },
    };

    const document = await this.documentGenerationService.generateDocument({
      companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
      sourceEntityId: record._id,
      generatedBy: this.resolveUserId(user),
      context,
    });

    const evidence = await this.registerEvidence(companyId, user, {
      type: CopasstTrainingEvidenceType.COMPLIANCE_REPORT,
      fileName: COPASST_TRAINING_COMPLIANCE_FILENAME,
      fileUrl: document.fileUrl,
      storagePath: document.storagePath,
    });

    return { document, evidence, reused: false };
  }

  /**
   * Trazabilidad documental de la entidad 1.1.7 de la empresa: todas las
   * DocumentInstance generadas para COPASST_TRAINING (sin filtrar por
   * instancia concreta). Consulta SIEMPRE scoped por companyId.
   */
  async listDocuments(companyId: Types.ObjectId) {
    return this.documentGenerationService.getInstancesBySource({
      companyId,
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
    });
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private assertSessionExists(
    sessions: CopasstTrainingSession[],
    sessionIndex: number,
  ): CopasstTrainingSession {
    const session = sessions[sessionIndex];
    if (!session) {
      throw new BadRequestException('La sesión indicada no existe en la capacitación COPASST');
    }
    return session;
  }

  private findParticipantInSession(
    session: CopasstTrainingSession,
    participantUserId: string,
  ): CopasstTrainingParticipant {
    const participant = (session.copasstParticipants ?? []).find(
      (entry) => entry.userId.toString() === participantUserId,
    );
    if (!participant) {
      throw new BadRequestException(
        'El participante indicado no está registrado en la sesión de capacitación.',
      );
    }
    return participant;
  }

  /** Registra el documento generado como evidencia estructurada persistente. */
  private async registerEvidence(
    companyId: Types.ObjectId,
    user: UserDocument | undefined,
    input: {
      type: CopasstTrainingEvidenceType;
      fileName: string;
      fileUrl: string;
      storagePath: string;
      sessionIndex?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<CopasstTrainingEvidence> {
    await this.trainingService.addEvidence(companyId, user, input);
    const created = await this.trainingService.findEvidenceBy(
      companyId,
      (evidence) =>
        evidence.fileUrl === input.fileUrl &&
        evidence.type === input.type,
    );
    if (!created) {
      throw new BadRequestException('No se pudo registrar la evidencia del documento generado');
    }
    return created;
  }

  private resolveUserId(user: UserDocument | undefined): Types.ObjectId | undefined {
    const id = (user as unknown as { _id?: Types.ObjectId } | undefined)?._id;
    return id ?? undefined;
  }

  /**
   * instanceId persistido en la metadata de la evidencia (reutilización).
   * Devuelve undefined si la evidencia legada no lo guardó: NUNCA se fabrica
   * un identificador (regla de Fase 4: no inventar datos).
   */
  private instanceIdFromMetadata(evidence: CopasstTrainingEvidence): Types.ObjectId | undefined {
    const raw = evidence.metadata?.instanceId;
    if (typeof raw === 'string' && Types.ObjectId.isValid(raw)) {
      return new Types.ObjectId(raw);
    }
    return undefined;
  }

  /** Versión persistida en la metadata de la evidencia (reutilización). */
  private versionFromMetadata(evidence: CopasstTrainingEvidence): number {
    const raw = evidence.metadata?.version;
    if (typeof raw === 'number' && raw > 0) return raw;
    return 1;
  }

  private sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'documento';
  }
}
