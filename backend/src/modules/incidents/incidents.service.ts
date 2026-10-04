import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { DocumentMaster } from '../document-management/schemas/document-master.schema';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import {
  AddActionEvidenceDto,
  AddInvestigationEvidenceDto,
  CreateInvestigationActionDto,
  RegisterActionFollowUpDto,
  UpdateIncidentLifecycleDto,
  UpdateInvestigationActionDto,
  UpdateInvestigationActionStatusDto,
  UpdateInvestigationDto,
} from './dto/investigation-management.dto';
import { Incident, IncidentDocument, InvestigationType } from './schemas/incident.schema';
import {
  IncidentHistory,
  IncidentHistoryAction,
  IncidentHistoryDocument,
} from './schemas/incident-history.schema';
import {
  INCIDENT_LIFECYCLE_TRANSITIONS,
  INCIDENT_TERMINAL_STAGES,
  IncidentLifecycleStage,
  isValidIncidentTransition,
  resolveLifecycleStage,
} from './schemas/incident-lifecycle.schema';
import {
  InvestigationAction,
  InvestigationActionEvidenceRef,
  InvestigationActionFollowUp,
  InvestigationActionStatus,
  InvestigationActionType,
} from './schemas/incident.schema';

/**
 * Estadísticas agregadas de investigación de enfermedades laborales (3.2.2).
 *
 * Solo contiene datos agregados: conteos, porcentajes, métricas temporales.
 * NO contiene employeeId, nombres, descripciones individuales ni datos clínicos.
 */
export interface DiseaseInvestigationStats {
  /** Cantidad total de investigaciones DISEASE. */
  totalInvestigations: number;

  /** Investigaciones pendientes (sin closureDate y status no cerrado). */
  pendingInvestigations: number;

  /** Investigaciones formalmente cerradas (con closureDate válido). */
  closedInvestigations: number;

  /** Investigaciones con investigationDate definida (investigación formal iniciada). */
  investigationsWithFormalResearch: number;

  /** Investigaciones sin investigationDate definida. */
  investigationsWithoutFormalResearch: number;

  /** Investigaciones con al menos una causa básica registrada. */
  investigationsWithRootCauses: number;

  /** Investigaciones con al menos una causa inmediata registrada. */
  investigationsWithImmediateCauses: number;

  /** Investigaciones con al menos un factor relacionado registrado. */
  investigationsWithRelatedFactors: number;

  /** Investigaciones con al menos una acción correctiva registrada. */
  investigationsWithCorrectiveActions: number;

  /** Investigaciones con al menos una acción preventiva registrada. */
  investigationsWithPreventiveActions: number;

  /** Investigaciones con evidencia documental registrada. */
  investigationsWithEvidence: number;

  /** Investigaciones con responsable asignado. */
  investigationsWithResponsible: number;

  /** Acciones correctivas pendientes (status != COMPLETED). */
  openCorrectiveActions: number;

  /** Acciones correctivas vencidas (dueDate < now y status != COMPLETED). */
  overdueCorrectiveActions: number;

  /** Acciones correctivas completadas. */
  completedCorrectiveActions: number;

  /** Acciones preventivas pendientes (status != COMPLETED). */
  openPreventiveActions: number;

  /** Acciones preventivas vencidas (dueDate < now y status != COMPLETED). */
  overduePreventiveActions: number;

  /** Acciones preventivas completadas. */
  completedPreventiveActions: number;

  /** Tiempo promedio de cierre en días (closureDate - investigationDate). 0 si no hay datos. */
  averageClosureDays: number;

  /** Tendencia mensual de investigaciones [{month: 'YYYY-MM', count}]. */
  monthlyTrend: Array<{ month: string; count: number }>;
}

@Injectable()
export class IncidentsService {
  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    private readonly autoCommService: AutoCommunicationService,
    // E1 (7.1.3): historial append-only de la gestión avanzada (server-side).
    @InjectModel(IncidentHistory.name)
    private readonly historyModel: Model<IncidentHistoryDocument>,
    // E1 (7.1.3): validación tenant-safe de la evidencia ({_id, companyId}).
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMaster>,
    // E1 (7.1.3): validación tenant-safe de responsables/equipo ($in agrupado).
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateIncidentDto): Promise<Incident> {
    const created = new this.incidentModel({
      ...dto,
      employeeId: new Types.ObjectId(dto.employeeId),
      companyId,
    });

    const saved = await created.save();

    // Auto-generate communication for emergency-type incidents (e.g., emergency drill, serious incident)
    const emergencyTypes = ['EMERGENCIA', 'EMERGENCY', 'INCENDIO', 'FIRE', 'TERREMOTO', 'EARTHQUAKE', 
      'DERRAME', 'SPILL', 'EVACUACION', 'EVACUATION', 'SIMULACRO', 'DRILL', 'ACCIDENTE_GRAVE', 'SERIOUS_ACCIDENT'];
    const incidentType = (dto.type || '').toUpperCase();
    const isEmergency = emergencyTypes.some((et) => incidentType.includes(et));

    if (isEmergency) {
      await this.autoCommService.generateCommunication({
        companyId,
        title: `Aviso de Emergencia: ${dto.type}`,
        body: `Se ha reportado un incidente de tipo "${dto.type}" en la empresa. Descripción: ${dto.description || 'Sin descripción'}. Fecha: ${dto.date || new Date().toISOString().slice(0, 10)}. Por favor tomar las medidas de seguridad correspondientes.`,
        communicationType: 'EMERGENCY_NOTICE',
        priority: 'URGENT',
        targetAudience: 'ALL_COMPANY',
        requiresSignature: false,
        sourceModule: 'EMERGENCY_DRILL',
        sourceEntityId: saved._id.toString(),
      }).catch((err) => {
        console.error('Auto-communication generation failed for emergency:', err.message);
      });
    }

    return saved;
  }

  async findAll(companyId: Types.ObjectId, investigationType?: InvestigationType): Promise<Incident[]> {
    const filter: Record<string, unknown> = { companyId };
    if (investigationType) {
      filter.investigationType = investigationType;
    }
    return this.incidentModel.find(filter).sort({ date: -1, createdAt: -1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<Incident> {
    const incident = await this.incidentModel.findOne({ _id: id, companyId }).exec();

    if (!incident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }

    return incident;
  }

  async update(id: string, companyId: Types.ObjectId, dto: UpdateIncidentDto): Promise<Incident> {
    const payload = dto.employeeId
      ? { ...dto, employeeId: new Types.ObjectId(dto.employeeId) }
      : dto;

    const incident = await this.incidentModel
      .findOneAndUpdate({ _id: id, companyId }, payload, { new: true, runValidators: true })
      .exec();

    if (!incident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }

    return incident;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedIncident = await this.incidentModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedIncident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }
  }

  // ── Estadísticas de Investigación de Enfermedades Laborales (3.2.2) ──

  /**
   * Calcula estadísticas agregadas de investigaciones de enfermedades laborales.
   *
   * Filtra exclusivamente investigaciones con investigationType = DISEASE.
   * NO acepta companyId arbitrario: siempre utiliza el del tenant autenticado.
   * NO devuelve registros individuales, employeeId, nombres ni datos clínicos.
   */
  async getDiseaseInvestigationStats(companyId: Types.ObjectId): Promise<DiseaseInvestigationStats> {
    const diseases = await this.incidentModel
      .find({
        companyId,
        investigationType: InvestigationType.DISEASE,
      })
      .sort({ date: -1 })
      .exec();

    const now = new Date();
    const CLOSED_STATUS = 'Cerrado';

    // ── Casos investigados ──
    const totalInvestigations = diseases.length;

    // ── Pendientes vs Cerrados ──
    const closedInvestigations = diseases.filter((d) => d.closureDate != null).length;
    const pendingInvestigations = totalInvestigations - closedInvestigations;

    // ── Investigación formal ──
    const investigationsWithFormalResearch = diseases.filter((d) => d.investigationDate != null).length;
    const investigationsWithoutFormalResearch = totalInvestigations - investigationsWithFormalResearch;

    // ── Calidad de investigación (conteos) ──
    const investigationsWithRootCauses = diseases.filter((d) => (d.rootCauses?.length ?? 0) > 0).length;
    const investigationsWithImmediateCauses = diseases.filter((d) => (d.immediateCauses?.length ?? 0) > 0).length;
    const investigationsWithRelatedFactors = diseases.filter((d) => (d.relatedFactors?.length ?? 0) > 0).length;
    const investigationsWithCorrectiveActions = diseases.filter((d) => (d.correctiveActions?.length ?? 0) > 0).length;
    const investigationsWithPreventiveActions = diseases.filter((d) => (d.preventiveActions?.length ?? 0) > 0).length;
    const investigationsWithEvidence = diseases.filter((d) => (d.evidence?.length ?? 0) > 0).length;
    const investigationsWithResponsible = diseases.filter((d) => d.responsible != null && d.responsible !== '').length;

    // ── Acciones correctivas ──
    let openCorrectiveActions = 0;
    let overdueCorrectiveActions = 0;
    let completedCorrectiveActions = 0;
    for (const disease of diseases) {
      for (const action of disease.correctiveActions ?? []) {
        if (action.status === 'COMPLETED') {
          completedCorrectiveActions++;
        } else {
          openCorrectiveActions++;
          if (action.dueDate != null && action.dueDate.getTime() < now.getTime()) {
            overdueCorrectiveActions++;
          }
        }
      }
    }

    // ── Acciones preventivas ──
    let openPreventiveActions = 0;
    let overduePreventiveActions = 0;
    let completedPreventiveActions = 0;
    for (const disease of diseases) {
      for (const action of disease.preventiveActions ?? []) {
        if (action.status === 'COMPLETED') {
          completedPreventiveActions++;
        } else {
          openPreventiveActions++;
          if (action.dueDate != null && action.dueDate.getTime() < now.getTime()) {
            overduePreventiveActions++;
          }
        }
      }
    }

    // ── Tiempo promedio de cierre ──
    let totalClosureDays = 0;
    let closureCount = 0;
    for (const disease of diseases) {
      if (disease.investigationDate != null && disease.closureDate != null) {
        const diffMs = disease.closureDate.getTime() - disease.investigationDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays >= 0) {
          totalClosureDays += diffDays;
          closureCount++;
        }
      }
    }
    const averageClosureDays = closureCount > 0 ? Math.round(totalClosureDays / closureCount) : 0;

    // ── Tendencia mensual ──
    const monthlyMap = new Map<string, number>();
    for (const disease of diseases) {
      const dateSource = disease.investigationDate ?? disease.date;
      if (dateSource != null) {
        const key = `${dateSource.getFullYear()}-${String(dateSource.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
      }
    }
    const monthlyTrend = Array.from(monthlyMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalInvestigations,
      pendingInvestigations,
      closedInvestigations,
      investigationsWithFormalResearch,
      investigationsWithoutFormalResearch,
      investigationsWithRootCauses,
      investigationsWithImmediateCauses,
      investigationsWithRelatedFactors,
      investigationsWithCorrectiveActions,
      investigationsWithPreventiveActions,
      investigationsWithEvidence,
      investigationsWithResponsible,
      openCorrectiveActions,
      overdueCorrectiveActions,
      completedCorrectiveActions,
      openPreventiveActions,
      overduePreventiveActions,
      completedPreventiveActions,
      averageClosureDays,
      monthlyTrend,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // E1 (7.1.3) — GESTIÓN AVANZADA DE CASOS ACCIDENTALES
  //
  // Unidad normativa: Accidente/Incidente → Investigación → Acciones →
  // Ejecución → Evidencia/seguimiento → Cierre documentado.
  //
  // Seguridad (patrón 7.1.1/7.1.2):
  // - companyId SIEMPRE server-side (controller); TODAS las queries incluyen
  //   companyId → cross-tenant = NotFoundException (404).
  // - Responsables/equipo validados tenant-safe con UN query $in agrupado por
  //   operación (sin N+1); snapshots generados server-side.
  // - DocumentMaster validado tenant-safe ({_id, companyId}); sin upload propio.
  // - History append-only; el cliente NUNCA lo envía ni puede alterarlo.
  // - OVERDUE derivado (isInvestigationActionOverdue); NUNCA persistido.
  // - El CRUD 3.2.1 y el DISEASE (3.2.2) NO se modifican (compatibilidad).
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Un query $in agrupado: valida que TODOS los usuarios existan en el tenant.
   * Sin N+1; ForbiddenException si alguno pertenece a otra empresa.
   */
  private async assertUsersInTenant(
    companyId: Types.ObjectId,
    userIds: string[],
  ): Promise<void> {
    const ids = userIds
      .filter((uid) => Types.ObjectId.isValid(uid))
      .map((uid) => new Types.ObjectId(uid));
    if (ids.length === 0) return;
    const unique = [...new Map(ids.map((id) => [String(id), id])).values()];
    const count = await this.userModel.countDocuments({ _id: { $in: unique }, companyId }).exec();
    if (count !== unique.length) {
      throw new ForbiddenException('El usuario indicado no pertenece a esta empresa');
    }
  }

  /** Snapshot de identidad server-side (nombre o email; nunca datos clínicos). */
  private async resolveUserSnapshot(
    companyId: Types.ObjectId,
    userId: string,
  ): Promise<string> {
    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(userId), companyId })
      .select({ firstName: 1, lastName: 1, email: 1 })
      .exec();
    if (!user) {
      throw new ForbiddenException('El usuario indicado no pertenece a esta empresa');
    }
    const u = user as unknown as { firstName?: string; lastName?: string; email?: string };
    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return name || u.email || '';
  }

  /** Evidencia declarativa tenant-safe: { _id: documentId, companyId }. */
  private async resolveDocumentRef(
    companyId: Types.ObjectId,
    documentId?: string,
  ): Promise<string | undefined> {
    if (!documentId) return undefined;
    if (!Types.ObjectId.isValid(documentId)) {
      throw new BadRequestException('documentId no es un ObjectId válido');
    }
    const doc = await this.documentMasterModel
      .findOne({ _id: new Types.ObjectId(documentId), companyId })
      .select({ code: 1, name: 1 })
      .exec();
    if (!doc) {
      throw new NotFoundException(`DocumentMaster with id ${documentId} not found`);
    }
    const d = doc as unknown as { code?: string; name?: string };
    return [d.code, d.name].filter(Boolean).join(' — ') || undefined;
  }

  /** Escritura append-only del historial (server-side; nunca desde cliente). */
  private async recordHistory(
    companyId: Types.ObjectId,
    incidentId: Types.ObjectId,
    actor: IncidentActor,
    action: IncidentHistoryAction,
    details?: string,
    extras?: { actionId?: string; before?: Record<string, unknown>; after?: Record<string, unknown> },
  ): Promise<void> {
    await this.historyModel.create({
      companyId,
      incidentId,
      actionId: extras?.actionId,
      action,
      actorUserId: actor.userId,
      actorSnapshot: actor.userEmail,
      details: details ? { message: details } : undefined,
      before: extras?.before,
      after: extras?.after,
    });
  }

  /** Historial del caso (solo lectura, orden cronológico, tenant-scoped). */
  async getIncidentHistory(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<IncidentHistory[]> {
    await this.findOne(id, companyId); // 404 si no es del tenant
    return this.historyModel
      .find({ companyId, incidentId: new Types.ObjectId(id) })
      .sort({ createdAt: 1 })
      .exec();
  }

  /** Carga el caso tenant-scoped y resuelve su etapa canónica (mapper legacy). */
  private async loadCase(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<{ incident: IncidentDocument; stage: IncidentLifecycleStage }> {
    // findOne() declara Promise<Incident> por compatibilidad con el CRUD 3.2.1;
    // el valor real es un documento hidratado (necesario para .save()).
    const incident = (await this.findOne(id, companyId)) as IncidentDocument;
    return { incident, stage: resolveLifecycleStage(incident) };
  }

  /** Caso terminal (CLOSED/CANCELLED) = solo lectura. */
  private assertCaseEditable(stage: IncidentLifecycleStage): void {
    if (INCIDENT_TERMINAL_STAGES.includes(stage)) {
      throw new BadRequestException(`El caso está en estado terminal (${stage}) y no admite modificaciones`);
    }
  }

  /** Acción COMPLETED/CANCELLED = solo lectura. */
  private assertActionEditable(action: InvestigationAction): void {
    if (action.status === 'COMPLETED' || action.status === 'CANCELLED') {
      throw new BadRequestException(`La acción está en estado terminal (${action.status}) y no admite modificaciones`);
    }
  }

  /** Ninguna fecha operativa se acepta en el futuro (patrón 7.1.1/7.1.2). */
  private assertNotFutureDate(date: Date | string | undefined, field: string): void {
    if (date == null) return;
    const t = date instanceof Date ? date.getTime() : Date.parse(String(date));
    if (Number.isNaN(t)) {
      throw new BadRequestException(`${field} inválida`);
    }
    if (t > Date.now()) {
      throw new BadRequestException(`${field} no puede ser una fecha futura`);
    }
  }

  /** Coherencia plannedDate ≤ dueDate; completedDate ≥ plannedDate. */
  private assertActionDates(
    action: { plannedDate?: Date | null; dueDate?: Date | null; completedDate?: Date | null },
  ): void {
    if (action.plannedDate && action.dueDate && action.plannedDate.getTime() > action.dueDate.getTime()) {
      throw new BadRequestException('plannedDate no puede ser posterior a dueDate');
    }
    if (action.plannedDate && action.completedDate && action.completedDate.getTime() < action.plannedDate.getTime()) {
      throw new BadRequestException('completedDate no puede ser anterior a plannedDate');
    }
  }

  /** Identificador estable de acción (server-side; único dentro del caso). */
  private nextActionId(incident: IncidentDocument): string {
    const existing = new Set<string>();
    for (const a of [...(incident.correctiveActions ?? []), ...(incident.preventiveActions ?? [])]) {
      if (a.actionId) existing.add(a.actionId);
    }
    let i = existing.size + 1;
    while (existing.has(`ACT-${String(i).padStart(3, '0')}`)) i += 1;
    return `ACT-${String(i).padStart(3, '0')}`;
  }

  /** Localiza una acción por actionId en ambos arreglos (o por índice legacy). */
  private findAction(
    incident: IncidentDocument,
    actionId: string,
  ): { action: InvestigationAction; list: 'corrective' | 'preventive' } | null {
    const inCorrective = (incident.correctiveActions ?? []).find((a) => a.actionId === actionId);
    if (inCorrective) return { action: inCorrective, list: 'corrective' };
    const inPreventive = (incident.preventiveActions ?? []).find((a) => a.actionId === actionId);
    if (inPreventive) return { action: inPreventive, list: 'preventive' };
    return null;
  }

  // ── Investigación ───────────────────────────────────────────────────────

  /**
   * Inicia/actualiza la investigación del caso (7.1.3). Acepta incidencia del
   * CRUD 3.2.1 (rootCauses legacy como causas básicas); NO rompe DISEASE.
   */
  async updateInvestigation(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateInvestigationDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    this.assertCaseEditable(stage);

    // Validación tenant-safe agrupada (responsable + equipo) — 1 query $in.
    const userIds = [
      ...(dto.investigationResponsibleUserId ? [dto.investigationResponsibleUserId] : []),
      ...(dto.investigationTeam ?? []).map((m) => m.userId),
    ];
    await this.assertUsersInTenant(companyId, userIds);

    if (dto.investigationDate) {
      this.assertNotFutureDate(dto.investigationDate, 'investigationDate');
    }

    const previous = {
      investigationResponsibleUserId: incident.investigationResponsibleUserId?.toString(),
      investigationStatus: incident.investigationStatus,
    };
    const wasNotInvestigating = stage !== IncidentLifecycleStage.INVESTIGATING;

    if (dto.investigationResponsibleUserId) {
      incident.investigationResponsibleUserId = new Types.ObjectId(dto.investigationResponsibleUserId);
      incident.investigationResponsibleSnapshot = await this.resolveUserSnapshot(
        companyId,
        dto.investigationResponsibleUserId,
      );
    }
    if (dto.methodology !== undefined) incident.methodology = dto.methodology;
    if (dto.investigationTeam !== undefined) {
      const snapshots = await Promise.all(
        dto.investigationTeam.map(async (m) => ({
          userId: new Types.ObjectId(m.userId),
          participationRole: m.participationRole,
          participantSnapshot: await this.resolveUserSnapshot(companyId, m.userId),
        })),
      );
      incident.investigationTeam = snapshots;
    }
    if (dto.immediateCauses !== undefined) incident.immediateCauses = dto.immediateCauses;
    if (dto.basicCauses !== undefined) incident.basicCauses = dto.basicCauses;
    // Compatibilidad: rootCauses (legacy 3.2.1/3.2.2) sigue siendo escribible.
    if (dto.rootCauses !== undefined) incident.rootCauses = dto.rootCauses;
    if (dto.relatedFactors !== undefined) incident.relatedFactors = dto.relatedFactors;
    if (dto.conclusions !== undefined) incident.conclusions = dto.conclusions;
    if (dto.recommendations !== undefined) incident.recommendations = dto.recommendations;
    if (dto.investigationStatus !== undefined) incident.investigationStatus = dto.investigationStatus;
    if (dto.investigationDate) {
      incident.investigationDate = dto.investigationDate;
      if (!incident.responsible && dto.responsible) {
        incident.responsible = dto.responsible;
      }
    }

    // Primera vez que se registra investigación → etapa INVESTIGATING.
    if (wasNotInvestigating && incident.investigationDate) {
      incident.lifecycleStage = IncidentLifecycleStage.INVESTIGATING;
    } else if (wasNotInvestigating && incident.investigationResponsibleUserId) {
      incident.lifecycleStage = IncidentLifecycleStage.INVESTIGATING;
    }

    const saved = await incident.save();

    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      wasNotInvestigating
        ? IncidentHistoryAction.INVESTIGATION_STARTED
        : IncidentHistoryAction.INVESTIGATION_UPDATED,
      wasNotInvestigating ? 'Investigación iniciada' : 'Investigación actualizada',
      { before: previous, after: { investigationStatus: saved.investigationStatus } },
    );
    return saved;
  }

  /** Evidencia estructurada de la investigación (DocumentMaster tenant-safe / URL). */
  async addInvestigationEvidence(
    companyId: Types.ObjectId,
    id: string,
    dto: AddInvestigationEvidenceDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    this.assertCaseEditable(stage);

    if (!dto.documentId && !dto.evidenceUrl?.trim()) {
      throw new BadRequestException('La evidencia requiere documentId (DocumentManagement) o evidenceUrl');
    }
    const documentSnapshot = await this.resolveDocumentRef(companyId, dto.documentId);

    incident.investigationEvidence = [
      ...(incident.investigationEvidence ?? []),
      {
        ...(dto.documentId ? { documentId: new Types.ObjectId(dto.documentId) } : {}),
        ...(documentSnapshot ? { documentSnapshot } : {}),
        ...(dto.evidenceUrl?.trim() ? { evidenceUrl: dto.evidenceUrl.trim() } : {}),
        ...(dto.comment?.trim() ? { comment: dto.comment.trim() } : {}),
      } as InvestigationActionEvidenceRef,
    ];
    const saved = await incident.save();

    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      IncidentHistoryAction.EVIDENCE_ADDED,
      'Evidencia de investigación registrada',
      { after: { count: saved.investigationEvidence?.length ?? 0 } },
    );
    return saved;
  }

  // ── Acciones de investigación ───────────────────────────────────────────

  /** Crea una acción derivada de la investigación (tenant-safe; sin N+1). */
  async createInvestigationAction(
    companyId: Types.ObjectId,
    id: string,
    dto: CreateInvestigationActionDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    this.assertCaseEditable(stage);

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }
    this.assertActionDates({ plannedDate: dto.plannedDate, dueDate: dto.dueDate });
    if (dto.dueDate) this.assertNotFutureDate(dto.dueDate, 'dueDate');
    if (dto.plannedDate) this.assertNotFutureDate(dto.plannedDate, 'plannedDate');

    const list = dto.actionType === InvestigationActionType.PREVENTIVE ? 'preventive' : 'corrective';
    const now = new Date();
    const newAction: InvestigationAction = {
      actionId: this.nextActionId(incident),
      action: dto.action,
      ...(dto.actionType ? { actionType: dto.actionType } : {}),
      responsible: dto.responsibleSnapshot ?? '',
      ...(dto.responsibleUserId
        ? {
            responsibleUserId: new Types.ObjectId(dto.responsibleUserId),
            responsibleSnapshot: await this.resolveUserSnapshot(companyId, dto.responsibleUserId),
          }
        : {}),
      status: dto.status ?? InvestigationActionStatus.PENDING,
      ...(dto.plannedDate ? { plannedDate: dto.plannedDate } : {}),
      ...(dto.dueDate ? { dueDate: dto.dueDate } : {}),
    } as unknown as InvestigationAction;

    if (list === 'preventive') {
      incident.preventiveActions = [...(incident.preventiveActions ?? []), newAction];
    } else {
      incident.correctiveActions = [...(incident.correctiveActions ?? []), newAction];
    }

    // Si el caso estaba pre-acciones, avanza a IN_PROGRESS (acc. definidas).
    if (
      stage === IncidentLifecycleStage.ACTIONS_PENDING ||
      stage === IncidentLifecycleStage.INVESTIGATING
    ) {
      incident.lifecycleStage = IncidentLifecycleStage.IN_PROGRESS;
    }

    const saved = await incident.save();
    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      IncidentHistoryAction.ACTION_CREATED,
      'Acción derivada creada',
      {
        actionId: newAction.actionId,
        after: { action: newAction.action, list, status: newAction.status },
      },
    );
    return saved;
  }

  /** Actualiza contenido de una acción no terminal (estado va por /status). */
  async updateInvestigationAction(
    companyId: Types.ObjectId,
    id: string,
    actionId: string,
    dto: UpdateInvestigationActionDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    this.assertCaseEditable(stage);
    const found = this.findAction(incident, actionId);
    if (!found) throw new NotFoundException(`Action ${actionId} not found`);
    this.assertActionEditable(found.action);

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const previous = { action: found.action.action, status: found.action.status };
    if (dto.action !== undefined) found.action.action = dto.action;
    if (dto.actionType !== undefined) found.action.actionType = dto.actionType;
    if (dto.responsibleUserId) {
      found.action.responsibleUserId = new Types.ObjectId(dto.responsibleUserId);
      found.action.responsibleSnapshot = await this.resolveUserSnapshot(companyId, dto.responsibleUserId);
    } else if (dto.responsibleSnapshot !== undefined) {
      found.action.responsible = dto.responsibleSnapshot;
    }
    if (dto.plannedDate !== undefined) found.action.plannedDate = dto.plannedDate;
    if (dto.dueDate !== undefined) found.action.dueDate = dto.dueDate;
    this.assertActionDates(found.action);
    if (found.action.dueDate) this.assertNotFutureDate(found.action.dueDate, 'dueDate');
    if (found.action.plannedDate) this.assertNotFutureDate(found.action.plannedDate, 'plannedDate');

    const saved = await incident.save();
    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      IncidentHistoryAction.ACTION_UPDATED,
      'Acción actualizada',
      { actionId, before: previous, after: { action: found.action.action } },
    );
    return saved;
  }

  /** Cambia el estado de una acción (máquina de estados server-side). */
  async updateInvestigationActionStatus(
    companyId: Types.ObjectId,
    id: string,
    actionId: string,
    dto: UpdateInvestigationActionStatusDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    this.assertCaseEditable(stage);
    const found = this.findAction(incident, actionId);
    if (!found) throw new NotFoundException(`Action ${actionId} not found`);
    this.assertActionEditable(found.action);

    const prevStatus = found.action.status;
    if (prevStatus === dto.status) {
      throw new BadRequestException(`La acción ya está en estado ${dto.status}`);
    }
    if (prevStatus === 'CANCELLED') {
      throw new BadRequestException('Una acción CANCELLED es terminal y no admite cambios');
    }
    // Transiciones válidas de acción (patrón 7.1.1/7.1.2):
    // PENDING → IN_PROGRESS | CANCELLED; IN_PROGRESS → COMPLETED | CANCELLED.
    const allowed: Record<string, readonly string[]> = {
      PENDING: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!allowed[prevStatus]?.includes(dto.status)) {
      throw new BadRequestException(`Transición inválida: ${prevStatus} → ${dto.status}`);
    }

    const previous = { status: prevStatus };
    found.action.status = dto.status;
    if (dto.status === 'COMPLETED') {
      // COMPLETED exige completedDate (no futura; default: ahora).
      if (!found.action.completedDate) found.action.completedDate = new Date();
      this.assertNotFutureDate(found.action.completedDate, 'completedDate');
      this.assertActionDates(found.action);
    }

    const saved = await incident.save();
    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      IncidentHistoryAction.ACTION_STATUS_CHANGED,
      dto.comment?.trim() || `Estado de acción: ${prevStatus} → ${dto.status}`,
      { actionId, before: previous, after: { status: dto.status } },
    );
    return saved;
  }

  /** Evidencia declarativa de la acción (documentId tenant-safe / URL). */
  async addActionEvidence(
    companyId: Types.ObjectId,
    id: string,
    actionId: string,
    dto: AddActionEvidenceDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    this.assertCaseEditable(stage);
    const found = this.findAction(incident, actionId);
    if (!found) throw new NotFoundException(`Action ${actionId} not found`);
    this.assertActionEditable(found.action);
    if (!dto.documentId && !dto.evidenceUrl?.trim()) {
      throw new BadRequestException('La evidencia requiere documentId (DocumentManagement) o evidenceUrl');
    }
    const documentSnapshot = await this.resolveDocumentRef(companyId, dto.documentId);

    found.action.evidence = {
      ...(dto.documentId ? { documentId: new Types.ObjectId(dto.documentId) } : {}),
      ...(documentSnapshot ? { documentSnapshot } : {}),
      ...(dto.evidenceUrl?.trim() ? { evidenceUrl: dto.evidenceUrl.trim() } : {}),
      ...(dto.comment?.trim() ? { comment: dto.comment.trim() } : {}),
    } as InvestigationActionEvidenceRef;

    const saved = await incident.save();
    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      IncidentHistoryAction.EVIDENCE_ADDED,
      'Evidencia de acción registrada',
      { actionId, after: { documentId: dto.documentId, evidenceUrl: dto.evidenceUrl } },
    );
    return saved;
  }

  /**
   * Registra seguimiento de la acción. `perceivedEffectiveness` es PERCEPCIÓN
   * declarada — NO verificación formal de eficacia (frontera con 7.1.1).
   */
  async registerActionFollowUp(
    companyId: Types.ObjectId,
    id: string,
    actionId: string,
    dto: RegisterActionFollowUpDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    this.assertCaseEditable(stage);
    const found = this.findAction(incident, actionId);
    if (!found) throw new NotFoundException(`Action ${actionId} not found`);
    this.assertActionEditable(found.action);

    const followUpDate = dto.followUpDate ?? new Date();
    this.assertNotFutureDate(followUpDate, 'followUpDate');

    const previous = found.action.followUp
      ? { followUpDate: found.action.followUp.followUpDate, implementationStatus: found.action.followUp.implementationStatus }
      : undefined;

    found.action.followUp = {
      followUpDate,
      ...(dto.observations?.trim() ? { observations: dto.observations.trim() } : {}),
      ...(dto.implementationStatus ? { implementationStatus: dto.implementationStatus } : {}),
      ...(dto.perceivedEffectiveness ? { perceivedEffectiveness: dto.perceivedEffectiveness } : {}),
    } as InvestigationActionFollowUp;

    const saved = await incident.save();
    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      IncidentHistoryAction.FOLLOW_UP,
      'Seguimiento de acción registrado',
      {
        actionId,
        before: previous,
        after: {
          implementationStatus: dto.implementationStatus,
          perceivedEffectiveness: dto.perceivedEffectiveness,
        },
      },
    );
    return saved;
  }

  // ── Lifecycle del caso ──────────────────────────────────────────────────

  /**
   * Cambia la etapa canónica del caso (máquina de estados server-side).
   * COMPLETED exige acciones completadas cuando existen; CLOSED exige cierre
   * documentado (investigación + análisis causal + acciones + evidencia).
   */
  async updateLifecycle(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateIncidentLifecycleDto,
    actor: IncidentActor,
  ): Promise<Incident> {
    const { incident, stage } = await this.loadCase(companyId, id);
    if (stage === dto.stage) {
      throw new BadRequestException(`El caso ya está en estado ${dto.stage}`);
    }
    if (!isValidIncidentTransition(stage, dto.stage)) {
      throw new BadRequestException(
        `Transición inválida: ${stage} → ${dto.stage}. Permitidas: ${INCIDENT_LIFECYCLE_TRANSITIONS[stage].join(', ') || 'ninguna'}`,
      );
    }

    const allActions = [...(incident.correctiveActions ?? []), ...(incident.preventiveActions ?? [])];

    if (dto.stage === IncidentLifecycleStage.COMPLETED) {
      // COMPLETED: todas las acciones no canceladas deben estar COMPLETED.
      const pending = allActions.filter(
        (a) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED',
      );
      if (allActions.length > 0 && pending.length > 0) {
        throw new BadRequestException(
          `No se puede COMPLETED con ${pending.length} acción(es) sin completar (complete o cancele las acciones pendientes)`,
        );
      }
    }

    if (dto.stage === IncidentLifecycleStage.CLOSED) {
      // Cierre documentado: investigación + análisis causal + acciones + evidencia.
      if (!incident.investigationDate) {
        throw new BadRequestException('No se puede CLOSED sin investigación registrada (investigationDate)');
      }
      const hasCauses =
        (incident.immediateCauses?.length ?? 0) > 0 ||
        (incident.basicCauses?.length ?? 0) > 0 ||
        (incident.rootCauses?.length ?? 0) > 0;
      if (!hasCauses) {
        throw new BadRequestException('No se puede CLOSED sin análisis causal (causas inmediatas/básicas)');
      }
      const pending = allActions.filter(
        (a) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED',
      );
      if (allActions.length > 0 && pending.length > 0) {
        throw new BadRequestException(
          `No se puede CLOSED con ${pending.length} acción(es) sin completar`,
        );
      }
      const hasEvidence =
        (incident.investigationEvidence?.length ?? 0) > 0 ||
        (incident.evidence?.length ?? 0) > 0;
      if (!hasEvidence) {
        throw new BadRequestException('No se puede CLOSED sin evidencia de cierre');
      }
      incident.closureDate = incident.closureDate ?? new Date();
      incident.closedByUserId = actor.userId;
      incident.closedBySnapshot = actor.userEmail;
    }

    const previous = { stage };
    incident.lifecycleStage = dto.stage;
    const saved = await incident.save();

    const historyAction =
      dto.stage === IncidentLifecycleStage.COMPLETED
        ? IncidentHistoryAction.COMPLETED
        : dto.stage === IncidentLifecycleStage.CLOSED
          ? IncidentHistoryAction.CLOSED
          : dto.stage === IncidentLifecycleStage.CANCELLED
            ? IncidentHistoryAction.CANCELLED
            : IncidentHistoryAction.UPDATE;

    await this.recordHistory(
      companyId,
      saved._id as Types.ObjectId,
      actor,
      historyAction,
      dto.comment?.trim() || `Estado del caso: ${stage} → ${dto.stage}`,
      { before: previous, after: { stage: dto.stage } },
    );
    return saved;
  }
}

/** Actor de una mutación 7.1.3 (resuelto server-side en el controller). */
export interface IncidentActor {
  userId?: Types.ObjectId;
  userEmail: string;
}
