import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CopasstService } from '../copasst/copasst.service';
import { CopasstMember, CopasstPeriodDocument } from '../copasst/schemas/copasst.schema';
import { UserDocument } from '../users/schemas/user.schema';
import {
  CopasstMemberCoverage,
  CopasstTrainingParticipant,
  CopasstTrainingSession,
  PhvaAdvancedCopasstTraining,
  PhvaAdvancedCopasstTrainingDocument,
} from './schemas/phva-advanced-copasst-training.schema';

/** Discriminador estable del estándar 1.1.7 (nunca editable). */
export const COPASST_TRAINING_ITEM_CODE = '1.1.7';

/**
 * Checklist normativo base de 1.1.7 (temas mínimos del modo de revisión del
 * estándar). Estructura abierta: el usuario puede agregar/quitar temas sin
 * cambiar el schema. NO es el catálogo normativo definitivo (fases posteriores).
 */
export const DEFAULT_COPASST_TRAINING_CHECKLIST = [
  { key: 'peligros', label: 'Identificación de peligros', status: 'PENDING' as const },
  { key: 'investigacion', label: 'Investigación de incidentes y accidentes', status: 'PENDING' as const },
  { key: 'inspecciones', label: 'Inspecciones de seguridad', status: 'PENDING' as const },
  { key: 'funciones', label: 'Funciones y responsabilidades del COPASST', status: 'PENDING' as const },
  { key: 'normatividad', label: 'Normatividad aplicable', status: 'PENDING' as const },
];

/** Campos editables de la entidad base (itemCode NUNCA es editable). */
type CopasstTrainingUpdateDto = Partial<{
  year: number;
  periodId: string;
  annualProgram: PhvaAdvancedCopasstTraining['annualProgram'];
  sessions: CopasstTrainingSession[];
  checklistTemplate: PhvaAdvancedCopasstTraining['checklistTemplate'];
  evaluationAttempts: PhvaAdvancedCopasstTraining['evaluationAttempts'];
  certificates: string[];
  evidenceFiles: string[];
  attendanceEvidence: string[];
  signatureEvidence: string[];
  signatures: PhvaAdvancedCopasstTraining['signatures'];
  alerts: string[];
}>;

/** Resultado del cálculo de cobertura de capacitación. */
export interface CopasstTrainingCoverage {
  /** Miembros activos del periodo COPASST vigente (denominador). */
  totalMembers: number;
  /** Miembros activos con al menos una sesión ejecutada (numerador). */
  trainedMembers: number;
  /** Porcentaje redondeado: trainedMembers / totalMembers * 100 (0 si no hay miembros). */
  coveragePercentage: number;
  /** Sesiones consideradas ejecutadas (condiciones de dominio). */
  executedSessions: number;
}

/** Miembro COPASST disponible para ser seleccionado en una sesión de 1.1.7. */
export interface AvailableCopasstMember {
  userId: string;
  name: string;
  committeeRole?: string;
  representationType?: string;
  status: 'ACTIVO';
}

/**
 * Service de dominio del estándar 1.1.7 — Capacitación COPASST (Fase 1).
 *
 * Base de dominio independiente de 1.2.1 (colección propia
 * `phva_advanced_copasst_training`). Multi-tenancy estricto: TODA consulta
 * filtra por `companyId`; nunca existe un `findById` sin verificar la empresa.
 *
 * Reutiliza los mecanismos existentes del módulo COPASST (1.1.6) vía
 * CopasstService.findCurrent para resolver el periodo vigente y sus miembros
 * activos, SIN modificar ese módulo.
 *
 * Fuera de alcance en esta fase: Approval Workflow, Document Generation,
 * Compliance, IA y Frontend.
 */
@Injectable()
export class PhvaAdvancedCopasstTrainingService {
  constructor(
    @InjectModel(PhvaAdvancedCopasstTraining.name)
    private readonly model: Model<PhvaAdvancedCopasstTrainingDocument>,
    private readonly copasstService: CopasstService,
  ) {}

  // ─────────────────────────────────────────────
  // LECTURA / CREACIÓN (siempre scoped por companyId)
  // ─────────────────────────────────────────────

  /**
   * Devuelve la entidad 1.1.7 del año indicado (o del año actual) creándola si
   * no existe. El itemCode SIEMPRE se fija a '1.1.7' en creación; las consultas
   * siempre filtran por companyId + itemCode + year.
   */
  async findOrCreate(
    companyId: Types.ObjectId,
    year = new Date().getFullYear(),
  ): Promise<PhvaAdvancedCopasstTrainingDocument> {
    const existing = await this.model
      .findOne({ companyId, itemCode: COPASST_TRAINING_ITEM_CODE, year })
      .exec();
    if (existing) return existing;

    const period = await this.getCurrentCopasstPeriod(companyId);
    const created = await this.model.create({
      companyId,
      itemCode: COPASST_TRAINING_ITEM_CODE,
      year,
      periodId: period?._id,
      checklistTemplate: DEFAULT_COPASST_TRAINING_CHECKLIST,
      history: [
        {
          action: 'CREATED',
          createdBy: 'system',
          createdAt: new Date(),
          details: `Entidad 1.1.7 creada para el año ${year}`,
        },
      ],
    });
    return created;
  }

  /**
   * Busca por identificador validando SIEMPRE pertenencia por companyId.
   * Devuelve NotFound tanto si el documento no existe como si pertenece a otra
   * empresa (no filtra información entre tenants).
   */
  async findById(
    companyId: Types.ObjectId,
    id: Types.ObjectId,
  ): Promise<PhvaAdvancedCopasstTrainingDocument> {
    const record = await this.model.findById(id).exec();
    if (!record || record.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException('Capacitación COPASST no encontrada');
    }
    return record;
  }

  /**
   * Devuelve la entidad de la empresa (opcionalmente de un año concreto).
   * Devuelve null si aún no existe (sin crear efectos secundarios).
   */
  async findByCompany(
    companyId: Types.ObjectId,
    year?: number,
  ): Promise<PhvaAdvancedCopasstTrainingDocument | null> {
    const filter: Record<string, unknown> = {
      companyId,
      itemCode: COPASST_TRAINING_ITEM_CODE,
    };
    if (year !== undefined) filter.year = year;
    return this.model.findOne(filter).sort({ year: -1 }).exec();
  }

  // ─────────────────────────────────────────────
  // INTEGRACIÓN COPASST (1.1.6) — solo lectura
  // ─────────────────────────────────────────────

  /**
   * Periodo COPASST vigente de la empresa reutilizando
   * CopasstService.findCurrent (periodo no archivado más reciente).
   * Devuelve null si no existe (escenario válido: empresa sin COPASST).
   */
  async getCurrentCopasstPeriod(
    companyId: Types.ObjectId,
  ): Promise<CopasstPeriodDocument | null> {
    try {
      return await this.copasstService.findCurrent(companyId);
    } catch (error) {
      // Solo el caso "empresa sin periodo" (NotFoundException) es un escenario
      // válido de negocio; cualquier otro error (conexión, timeout) debe
      // propagarse y NO enmascararse.
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  /**
   * Miembros ACTIVOS del periodo COPASST vigente (denominador de cobertura).
   * Los miembros inactivos no forman parte de la cobertura.
   */
  async getActiveCopasstMembers(companyId: Types.ObjectId): Promise<CopasstMember[]> {
    const period = await this.getCurrentCopasstPeriod(companyId);
    if (!period) return [];
    return (period.members ?? []).filter((member) => member.status === 'ACTIVO');
  }

  /**
   * Miembros disponibles para ser seleccionados como participantes de una
   * sesión de capacitación (Fase 2). Única fuente de verdad: los miembros
   * ACTIVOS del periodo COPASST vigente vía CopasstService.findCurrent.
   *
   * NO devuelve el CopasstPeriod completo: solo el shape mínimo consumible por
   * el frontend para construir el selector de participantes.
   */
  async getAvailableMembers(companyId: Types.ObjectId): Promise<AvailableCopasstMember[]> {
    const members = await this.getActiveCopasstMembers(companyId);
    return members.map((member) => ({
      userId: member.userId.toString(),
      name: member.userName,
      committeeRole: member.committeeRole,
      representationType: member.representationType,
      status: 'ACTIVO' as const,
    }));
  }

  /**
   * Valida que el periodo COPASST indicado pertenezca a la empresa (protección
   * de multi-tenancy: una empresa A nunca puede referenciar el periodo de B).
   */
  private async assertPeriodBelongsToCompany(
    companyId: Types.ObjectId,
    periodId: Types.ObjectId,
  ): Promise<void> {
    let period: CopasstPeriodDocument;
    try {
      period = await this.copasstService.findById(periodId);
    } catch (error) {
      // Solo el "periodo no existe" (NotFoundException) es un caso de dominio
      // manejable → 400. Cualquier otro error (conexión, etc.) debe propagarse
      // y NO enmascararse como si fuera un problema del cliente.
      if (error instanceof NotFoundException) {
        throw new BadRequestException('El periodo COPASST indicado no existe');
      }
      throw error;
    }
    if (period.companyId.toString() !== companyId.toString()) {
      throw new BadRequestException('El periodo COPASST no pertenece a esta empresa');
    }
  }

  // ─────────────────────────────────────────────
  // COBERTURA (1.1.7)
  // ─────────────────────────────────────────────

  /**
   * Condición de dominio para considerar una sesión como EJECUTADA (1.1.7):
   * una sesión solo cuenta para la cobertura cuando tiene `status ===
   * 'Ejecutada'` o registra `completionDate`. Las sesiones solamente
   * programadas NO cuentan. (Condición propia de 1.1.7; NO copia la lógica de
   * 1.2.1, que queda fuera de alcance.)
   */
  isSessionExecuted(session: CopasstTrainingSession): boolean {
    return session.status === 'Ejecutada' || Boolean(session.completionDate);
  }

  /** Sesiones ejecutadas de la entidad (única fuente para cobertura y compliance). */
  private getExecutedSessions(
    record?: PhvaAdvancedCopasstTrainingDocument,
  ): CopasstTrainingSession[] {
    return (record?.sessions ?? []).filter((session) => this.isSessionExecuted(session));
  }

  /**
   * Set de userId con al menos una sesión ejecutada (deduplicado). Fuente única
   * compartida entre calculateCoverage y recalculateCoverage (evita duplicar
   * la lógica de numerador).
   */
  private computeTrainedMemberIds(executed: CopasstTrainingSession[]): Set<string> {
    const trainedUserIds = new Set<string>();
    for (const session of executed) {
      for (const participant of session.copasstParticipants ?? []) {
        trainedUserIds.add(participant.userId.toString());
      }
    }
    return trainedUserIds;
  }

  // ─────────────────────────────────────────────
  // RESOLUCIÓN DE PARTICIPANTES (Fase 2)
  // ─────────────────────────────────────────────

  /**
   * Normaliza las sesiones entrantes de un update:
   *
   * 1. Deduplica participantes por userId dentro de cada sesión (Caso D).
   * 2. Para sesiones EJECUTADAS: conserva el snapshot histórico tal cual
   *    (inmutable). El contexto de una sesión ya realizada no se recalcula
   *    desde el periodo actual ni se re-valida contra los miembros vigentes
   *    (un miembro pudo salir después de la sesión).
   * 3. Para sesiones NO ejecutadas (nuevas/programadas): valida que cada
   *    participante sea un miembro ACTIVO del periodo vigente (Casos A/B/C) y
   *    construye el snapshot desde la información maestra del miembro.
   */
  private async resolveSessions(
    companyId: Types.ObjectId,
    sessions: CopasstTrainingSession[],
  ): Promise<CopasstTrainingSession[]> {
    const activeMembers = await this.getActiveCopasstMembers(companyId);
    const activeById = new Map(activeMembers.map((m) => [m.userId.toString(), m]));

    return sessions.map((session) => {
      const participants = this.dedupeParticipants(session.copasstParticipants ?? []);

      if (this.isSessionExecuted(session)) {
        // Snapshot histórico inmutable: se conserva tal cual fue registrado.
        return { ...session, copasstParticipants: participants };
      }

      // Sesión nueva o todavía no ejecutada: validar y construir snapshot.
      const resolved = participants.map((participant) => {
        const member = activeById.get(participant.userId.toString());
        if (!member) {
          throw new BadRequestException(
            `El participante ${participant.userId.toString()} no es un miembro activo del COPASST`,
          );
        }
        return {
          userId: member.userId,
          name: member.userName,
          committeeRole: member.committeeRole,
          representationType: member.representationType,
        };
      });

      return { ...session, copasstParticipants: resolved };
    });
  }

  /** Deduplica participantes por userId dentro de una misma sesión. */
  private dedupeParticipants(
    participants: CopasstTrainingParticipant[],
  ): CopasstTrainingParticipant[] {
    const seen = new Set<string>();
    const result: CopasstTrainingParticipant[] = [];
    for (const participant of participants) {
      const key = participant.userId.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(participant);
    }
    return result;
  }

  /**
   * Calcula la cobertura de capacitación:
   *
   *   coveragePercentage = miembros activos con ≥1 sesión ejecutada
   *                        / miembros activos del periodo vigente * 100
   *
   * - Sin duplicados: cada miembro cuenta UNA sola vez aunque participe en
   *   varias sesiones ejecutadas (Set de userId).
   * - Solo miembros ACTIVOS del periodo vigente.
   * - 0% si no hay miembros activos.
   */
  async calculateCoverage(
    companyId: Types.ObjectId,
    record?: PhvaAdvancedCopasstTrainingDocument,
  ): Promise<CopasstTrainingCoverage> {
    const members = await this.getActiveCopasstMembers(companyId);
    const executed = this.getExecutedSessions(record);
    const trainedUserIds = this.computeTrainedMemberIds(executed);

    const trainedMembers = members.filter((member) =>
      trainedUserIds.has(member.userId.toString()),
    ).length;

    return {
      totalMembers: members.length,
      trainedMembers,
      coveragePercentage:
        members.length > 0
          ? Math.round((trainedMembers / members.length) * 100)
          : 0,
      executedSessions: executed.length,
    };
  }

  /**
   * Recalcula de forma DETERMINISTA el snapshot `memberCoverage` y devuelve el
   * resumen de cobertura (Fase 2).
   *
   * Reglas de dominio:
   * - Denominador: miembros ACTIVOS del periodo COPASST vigente.
   * - Numerador: miembros activos con ≥1 sesión EJECUTADA (Set de userId: cada
   *   miembro cuenta UNA sola vez para la cobertura, aunque participe en varias).
   * - `executedSessions` por miembro: cantidad de sesiones ejecutadas donde
   *   participa (concepto distinto del numerador).
   * - `trainedAt`: primera fecha relevante de capacitación ejecutada del
   *   miembro (determinista): `completionDate` de la sesión; si no existe,
   *   `scheduledDate` solamente si la sesión cumple la condición de ejecutada.
   * - `totalHours`: 0 (default) — `Session.duration` es texto libre, no puede
   *   sumarse de forma segura; se documenta para una fase posterior.
   * - `lastEvaluationScore`/`lastEvaluationDate`: sin dato — `evaluationAttempts`
   *   no tiene relación con un participante concreto; no se inventa la relación.
   *
   * NO persiste (el caller decide): update() guarda el record tras recalcular;
   * el endpoint GET de cobertura recalcula en memoria.
   */
  async recalculateCoverage(
    companyId: Types.ObjectId,
    record: PhvaAdvancedCopasstTrainingDocument,
  ): Promise<CopasstTrainingCoverage> {
    const members = await this.getActiveCopasstMembers(companyId);
    const executed = this.getExecutedSessions(record);
    const trainedUserIds = this.computeTrainedMemberIds(executed);

    const coverage: CopasstMemberCoverage[] = members.map((member) => {
      const memberSessions = executed.filter((session) =>
        (session.copasstParticipants ?? []).some(
          (participant) => participant.userId.toString() === member.userId.toString(),
        ),
      );
      return {
        userId: member.userId,
        name: member.userName,
        committeeRole: member.committeeRole,
        representationType: member.representationType,
        status: member.status,
        trained: trainedUserIds.has(member.userId.toString()),
        trainedAt: memberSessions.length > 0
          ? this.firstTrainedDate(memberSessions)
          : undefined,
        executedSessions: memberSessions.length,
        totalHours: 0, // duración libre: no calculable de forma segura (documentado)
        lastEvaluationScore: undefined,
        lastEvaluationDate: undefined,
      };
    });

    record.memberCoverage = coverage;
    return this.buildCoverageSummary(record, executed.length);
  }

  /**
   * Alias de recalculateCoverage que devuelve el record mutado (compatibilidad
   * con el flujo de Fase 1: refresh → save en update()).
   */
  async refreshMemberCoverage(
    companyId: Types.ObjectId,
    record: PhvaAdvancedCopasstTrainingDocument,
  ): Promise<PhvaAdvancedCopasstTrainingDocument> {
    await this.recalculateCoverage(companyId, record);
    return record;
  }

  /** Resumen numérico de cobertura (denominador, numerador y porcentaje). */
  private buildCoverageSummary(
    record: PhvaAdvancedCopasstTrainingDocument,
    executedSessions: number,
  ): CopasstTrainingCoverage {
    const coverage = record.memberCoverage ?? [];
    const trainedMembers = coverage.filter((entry) => entry.trained).length;
    return {
      totalMembers: coverage.length,
      trainedMembers,
      coveragePercentage:
        coverage.length > 0
          ? Math.round((trainedMembers / coverage.length) * 100)
          : 0,
      executedSessions,
    };
  }

  /**
   * Primera fecha relevante de capacitación ejecutada del miembro (determinista):
   * min(fechaRelevante de cada sesión ejecutada) donde
   * fechaRelevante = completionDate ?? (scheduledDate si la sesión cumple la
   * condición de ejecutada). Si no hay fecha, undefined (no se inventa).
   */
  private firstTrainedDate(sessions: CopasstTrainingSession[]): Date | undefined {
    const dates = sessions
      .map((session) => this.sessionRelevantDate(session))
      .filter((date): date is Date => Boolean(date));
    if (dates.length === 0) return undefined;
    return new Date(Math.min(...dates.map((date) => date.getTime())));
  }

  private sessionRelevantDate(session: CopasstTrainingSession): Date | undefined {
    if (session.completionDate) return this.toDate(session.completionDate);
    if (this.isSessionExecuted(session) && session.scheduledDate) {
      return this.toDate(session.scheduledDate);
    }
    return undefined;
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  // ─────────────────────────────────────────────
  // ACTUALIZACIÓN BASE (Fase 1: sin approval/evidencias reales aún)
  // ─────────────────────────────────────────────

  /**
   * Actualiza los datos base de la entidad 1.1.7:
   * - itemCode NO es editable (siempre '1.1.7').
   * - Tras guardar datos, recalcula memberCoverage y compliance básico.
   * - Registra historial append-only.
   */
  async update(
    companyId: Types.ObjectId,
    user: UserDocument,
    dto: CopasstTrainingUpdateDto,
  ): Promise<PhvaAdvancedCopasstTrainingDocument> {
    if (dto.year !== undefined && dto.year < 2000) {
      throw new BadRequestException('Año inválido para capacitación COPASST');
    }

    // Resolver el año objetivo: si el cliente no envía `year`, se usa el del
    // registro existente (si lo hay) para no crear una entidad paralela del
    // año actual; si no existe registro, se usa el año actual.
    let targetYear = dto.year;
    if (targetYear === undefined) {
      const existing = await this.findByCompany(companyId);
      targetYear = existing?.year ?? new Date().getFullYear();
    }
    const record = await this.findOrCreate(companyId, targetYear);

    // Aplicar campos base permitidos (nunca itemCode).
    if (dto.periodId !== undefined) {
      if (!Types.ObjectId.isValid(dto.periodId)) {
        throw new BadRequestException('periodId inválido');
      }
      const periodId = new Types.ObjectId(dto.periodId);
      // Multi-tenancy: el periodo debe pertenecer a la misma empresa.
      await this.assertPeriodBelongsToCompany(companyId, periodId);
      record.periodId = periodId;
    }
    if (dto.annualProgram !== undefined) record.annualProgram = dto.annualProgram;
    if (dto.sessions !== undefined) {
      // Valida participantes, deduplica y construye snapshots (Fase 2).
      record.sessions = await this.resolveSessions(companyId, dto.sessions);
    }
    if (dto.checklistTemplate !== undefined) record.checklistTemplate = dto.checklistTemplate;
    if (dto.evaluationAttempts !== undefined) record.evaluationAttempts = dto.evaluationAttempts;
    if (dto.certificates !== undefined) record.certificates = dto.certificates;
    if (dto.evidenceFiles !== undefined) record.evidenceFiles = dto.evidenceFiles;
    if (dto.attendanceEvidence !== undefined) record.attendanceEvidence = dto.attendanceEvidence;
    if (dto.signatureEvidence !== undefined) record.signatureEvidence = dto.signatureEvidence;
    if (dto.signatures !== undefined) record.signatures = dto.signatures;
    if (dto.alerts !== undefined) record.alerts = dto.alerts;

    await this.refreshMemberCoverage(companyId, record);
    this.resolveCompliance(record);
    this.pushAudit(record, 'UPDATED', user, 'Actualización integral de capacitación COPASST (1.1.7)');

    return record.save();
  }

  // ─────────────────────────────────────────────
  // COMPLIANCE BÁSICO (1.1.7)
  // ─────────────────────────────────────────────

  /**
   * Regla de cumplimiento BASE de 1.1.7 (no copia la de 1.2.1):
   *
   * COMPLIES       → programa anual definido + ≥1 sesión ejecutada +
   *                  cobertura > 0% + evidencia de asistencia.
   * PENDING        → hay programa o sesiones (avance parcial).
   * NON_COMPLIANT  → sin programa, sin sesiones y sin cobertura.
   *
   * Es una regla mínima de Fase 1: Approval, Document Generation y
   * Compliance Engine la refinarán en fases posteriores.
   */
  private resolveCompliance(record: PhvaAdvancedCopasstTrainingDocument): void {
    const hasProgram = (record.annualProgram ?? []).length > 0;
    const hasExecuted = (record.sessions ?? []).some((session) =>
      this.isSessionExecuted(session),
    );
    const hasAttendance =
      (record.attendanceEvidence ?? []).length > 0 ||
      (record.signatureEvidence ?? []).length > 0;
    const hasCoverage = (record.memberCoverage ?? []).some((entry) => entry.trained);

    if (hasProgram && hasExecuted && hasCoverage && hasAttendance) {
      record.complianceStatus = 'COMPLIES';
      record.complianceReason = 'Programa anual definido, sesiones ejecutadas, cobertura y evidencias de asistencia (1.1.7).';
    } else if (hasProgram || hasExecuted) {
      record.complianceStatus = 'PENDING';
      record.complianceReason = 'Avance parcial: faltan sesiones ejecutadas, cobertura o evidencias de asistencia (1.1.7).';
    } else {
      record.complianceStatus = 'NON_COMPLIANT';
      record.complianceReason = 'Sin programa, sesiones ni cobertura de capacitación COPASST (1.1.7).';
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private pushAudit(
    record: PhvaAdvancedCopasstTrainingDocument,
    action: string,
    user: UserDocument,
    details: string,
  ): void {
    record.history.push({
      action,
      createdBy: user.email ?? 'system',
      createdAt: new Date(),
      details,
    } as never);
  }
}
