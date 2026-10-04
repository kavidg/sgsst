import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  AnnualAudit,
  AnnualAuditDocument,
  AnnualAuditStatus,
  AuditActionStatus,
  AuditFinding,
  AuditFindingStatus,
  AuditFollowUpAction,
  ANNUAL_AUDIT_VALID_TRANSITIONS,
} from './schemas/annual-audit.schema';
import {
  AnnualAuditHistory,
  AnnualAuditHistoryAction,
  AnnualAuditHistoryDocument,
} from './schemas/annual-audit-history.schema';
import {
  AttachAuditEvidenceDto,
  CreateAnnualAuditDto,
  CreateAuditActionDto,
  CreateAuditFindingDto,
  MAX_ACTIONS_PER_FINDING,
  MAX_FINDINGS_PER_AUDIT,
  UpdateAnnualAuditDto,
  UpdateAnnualAuditStatusDto,
  UpdateAuditActionDto,
  UpdateAuditFindingDto,
} from './dto/annual-audit.dto';

/**
 * E1 (6.1.2) — Service del dominio ANNUAL-AUDIT (Auditoría anual SG-SST).
 *
 * Seguridad y trazabilidad:
 * - TODAS las operaciones son tenant-scoped: el companyId proviene del
 *   usuario autenticado (resuelto en el controller) y se incluye en cada
 *   query. Un id de otra empresa produce NotFoundException (404) — nunca
 *   información de otro tenant.
 * - El historial es SERVER-SIDE y APPEND-ONLY: se registra en cada mutación
 *   (CREATE, UPDATE, STATUS_CHANGE, FINDING_CREATED, FINDING_UPDATED,
 *   ACTION_CREATED, ACTION_UPDATED, EVIDENCE_ATTACHED) y el frontend nunca
 *   puede enviarlo ni alterarlo.
 * - Evidencia documental: las referencias a DocumentMaster se validan con
 *   companyId (tenant-safe). DocumentMaster es evidencia; AnnualAudit es el
 *   dominio operativo.
 * - Sin N+1: findings y acciones viven embebidos en el documento padre
 *   (lecturas/escrituras por documento); las validaciones de responsables son
 *   un solo query $in por operación.
 */
@Injectable()
export class AnnualAuditService {
  constructor(
    @InjectModel(AnnualAudit.name)
    private readonly auditModel: Model<AnnualAuditDocument>,
    @InjectModel(AnnualAuditHistory.name)
    private readonly historyModel: Model<AnnualAuditHistoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly documentMasterService: DocumentMasterService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  async create(companyId: Types.ObjectId, dto: CreateAnnualAuditDto, actor: AuditActor): Promise<AnnualAuditDocument> {
    if (dto.plannedStartDate && dto.plannedEndDate && new Date(dto.plannedStartDate) > new Date(dto.plannedEndDate)) {
      throw new BadRequestException('plannedStartDate no puede ser posterior a plannedEndDate');
    }

    if (dto.auditorUserId) {
      await this.assertUsersInTenant(companyId, [dto.auditorUserId]);
    }

    try {
      const created = await this.auditModel.create({
        companyId,
        ...dto,
        status: AnnualAuditStatus.DRAFT,
        createdBy: actor.userId,
      });

      await this.recordHistory(companyId, created._id, actor, AnnualAuditHistoryAction.CREATE, 'Auditoría creada', undefined, {
        title: created.title,
        status: created.status,
      });

      return created;
    } catch (err) {
      // Índice único {companyId, auditCode} (E11000) → conflicto de código.
      if ((err as { code?: number }).code === 11000) {
        throw new BadRequestException(`El auditCode '${dto.auditCode}' ya existe en esta empresa`);
      }
      throw err;
    }
  }

  async findAll(companyId: Types.ObjectId, status?: AnnualAuditStatus): Promise<AnnualAuditDocument[]> {
    const query: Record<string, unknown> = { companyId };
    if (status) {
      query.status = status;
    }
    return this.auditModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(companyId: Types.ObjectId, id: string): Promise<AnnualAuditDocument> {
    return this.findTenantAudit(companyId, id);
  }

  async update(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateAnnualAuditDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    this.assertNotCompleted(audit, 'Una auditoría COMPLETED es evidencia histórica y no puede editarse');

    const mergedDates = this.mergeDates(audit, dto);
    if (
      mergedDates.plannedStartDate &&
      mergedDates.plannedEndDate &&
      mergedDates.plannedStartDate > mergedDates.plannedEndDate
    ) {
      throw new BadRequestException('plannedStartDate no puede ser posterior a plannedEndDate');
    }
    if (
      mergedDates.actualStartDate &&
      mergedDates.actualEndDate &&
      mergedDates.actualStartDate > mergedDates.actualEndDate
    ) {
      throw new BadRequestException('actualStartDate no puede ser posterior a actualEndDate');
    }

    // Validar referencias: auditor y documentos (tenant-safe).
    const documentIds = [dto.auditorCompetenceEvidenceId, dto.reportDocumentId].filter(
      (v): v is string => typeof v === 'string',
    );
    for (const documentId of documentIds) {
      await this.assertDocumentInTenant(companyId, documentId);
    }
    if (dto.auditorUserId) {
      await this.assertUsersInTenant(companyId, [dto.auditorUserId]);
    }

    const previous = { status: audit.status, title: audit.title };
    Object.assign(audit, dto);
    const saved = await audit.save();

    await this.recordHistory(
      companyId,
      audit._id,
      actor,
      AnnualAuditHistoryAction.UPDATE,
      'Auditoría actualizada',
      previous,
      { title: saved.title, status: saved.status },
    );

    return saved;
  }

  // ── Estado ──────────────────────────────────────────────────────────────

  async updateStatus(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateAnnualAuditStatusDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    this.assertValidTransition(audit.status, dto.status);
    this.assertDatesCoherentWithStatus(audit, dto.status);

    if (dto.status === AnnualAuditStatus.COMPLETED) {
      this.assertCompletionIntegrity(audit);
    }

    const previous = { status: audit.status };
    audit.status = dto.status;
    const saved = await audit.save();

    await this.recordHistory(
      companyId,
      audit._id,
      actor,
      AnnualAuditHistoryAction.STATUS_CHANGE,
      dto.comment?.trim() || `Estado: ${previous.status} → ${dto.status}`,
      previous,
      { status: dto.status },
    );

    return saved;
  }

  // ── Hallazgos ───────────────────────────────────────────────────────────

  async addFinding(
    companyId: Types.ObjectId,
    id: string,
    dto: CreateAuditFindingDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    if (audit.status === AnnualAuditStatus.CANCELLED) {
      throw new BadRequestException('No se pueden registrar hallazgos en una auditoría CANCELLED');
    }
    this.assertNotCompleted(audit, 'No se pueden registrar hallazgos en una auditoría COMPLETED');
    if (audit.findings.length >= MAX_FINDINGS_PER_AUDIT) {
      throw new BadRequestException(`Límite de ${MAX_FINDINGS_PER_AUDIT} hallazgos por auditoría alcanzado`);
    }

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const finding: AuditFinding = {
      _id: new Types.ObjectId(),
      type: dto.type,
      description: dto.description,
      criterion: dto.criterion,
      evidence: dto.evidence,
      severity: dto.severity,
      responsibleUserId: dto.responsibleUserId ? new Types.ObjectId(dto.responsibleUserId) : undefined,
      responsibleNameSnapshot: dto.responsibleNameSnapshot,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      status: dto.status ?? AuditFindingStatus.OPEN,
      observations: dto.observations,
      actions: [],
    } as unknown as AuditFinding;

    audit.findings.push(finding);
    const saved = await audit.save();

    await this.recordHistory(companyId, audit._id, actor, AnnualAuditHistoryAction.FINDING_CREATED, 'Hallazgo registrado', undefined, {
      findingId: String(finding._id),
      type: finding.type,
      description: finding.description,
    });

    return saved;
  }

  async updateFinding(
    companyId: Types.ObjectId,
    id: string,
    findingId: string,
    dto: UpdateAuditFindingDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    this.assertNotCompleted(audit, 'No se pueden modificar hallazgos de una auditoría COMPLETED');

    const finding = this.findEmbeddedFinding(audit, findingId);
    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const previous = { status: finding.status, description: finding.description };
    Object.assign(finding, dto);
    const saved = await audit.save();

    await this.recordHistory(companyId, audit._id, actor, AnnualAuditHistoryAction.FINDING_UPDATED, 'Hallazgo actualizado', previous, {
      findingId,
      status: finding.status,
    });

    return saved;
  }

  // ── Acciones de seguimiento ─────────────────────────────────────────────

  async addAction(
    companyId: Types.ObjectId,
    id: string,
    findingId: string,
    dto: CreateAuditActionDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    this.assertNotCompleted(audit, 'No se pueden registrar acciones en una auditoría COMPLETED');

    const finding = this.findEmbeddedFinding(audit, findingId);
    if (finding.actions.length >= MAX_ACTIONS_PER_FINDING) {
      throw new BadRequestException(`Límite de ${MAX_ACTIONS_PER_FINDING} acciones por hallazgo alcanzado`);
    }

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }
    if (dto.status === AuditActionStatus.COMPLETED && !dto.completedDate) {
      throw new BadRequestException('Una acción COMPLETED requiere completedDate');
    }

    const action: AuditFollowUpAction = {
      _id: new Types.ObjectId(),
      description: dto.description,
      responsible: dto.responsible,
      responsibleUserId: dto.responsibleUserId ? new Types.ObjectId(dto.responsibleUserId) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      status: dto.status ?? AuditActionStatus.PENDING,
      completedDate: dto.completedDate ? new Date(dto.completedDate) : undefined,
      evidenceUrl: dto.evidenceUrl,
      observations: dto.observations,
    } as unknown as AuditFollowUpAction;

    finding.actions.push(action);
    const saved = await audit.save();

    await this.recordHistory(companyId, audit._id, actor, AnnualAuditHistoryAction.ACTION_CREATED, 'Acción registrada', undefined, {
      findingId,
      actionId: String(action._id),
      description: action.description,
    });

    return saved;
  }

  async updateAction(
    companyId: Types.ObjectId,
    id: string,
    findingId: string,
    actionId: string,
    dto: UpdateAuditActionDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    this.assertNotCompleted(audit, 'No se pueden modificar acciones de una auditoría COMPLETED');

    const finding = this.findEmbeddedFinding(audit, findingId);
    const action = this.findEmbeddedAction(finding, actionId);

    if (dto.responsibleUserId) {
      await this.assertUsersInTenant(companyId, [dto.responsibleUserId]);
    }

    const nextStatus = dto.status ?? action.status;
    const nextCompletedDate = dto.completedDate ? new Date(dto.completedDate) : action.completedDate;
    if (nextStatus === AuditActionStatus.COMPLETED && !nextCompletedDate) {
      throw new BadRequestException('Una acción COMPLETED requiere completedDate');
    }

    const previous = { status: action.status, description: action.description };
    Object.assign(action, dto);
    if (nextStatus === AuditActionStatus.COMPLETED && !action.completedDate) {
      action.completedDate = nextCompletedDate;
    }
    const saved = await audit.save();

    await this.recordHistory(companyId, audit._id, actor, AnnualAuditHistoryAction.ACTION_UPDATED, 'Acción actualizada', previous, {
      findingId,
      actionId,
      status: action.status,
    });

    return saved;
  }

  // ── Evidencia documental (DocumentMaster tenant-safe) ───────────────────

  async attachReportEvidence(
    companyId: Types.ObjectId,
    id: string,
    dto: AttachAuditEvidenceDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    this.assertNotCompleted(audit, 'No se puede adjuntar evidencia a una auditoría COMPLETED');

    // Validación de tenencia: el documento DEBE pertenecer a la misma empresa.
    await this.assertDocumentInTenant(companyId, dto.documentId);

    const previous = { reportDocumentId: audit.reportDocumentId?.toString() ?? null };
    audit.reportDocumentId = new Types.ObjectId(dto.documentId);
    const saved = await audit.save();

    await this.recordHistory(
      companyId,
      audit._id,
      actor,
      AnnualAuditHistoryAction.EVIDENCE_ATTACHED,
      dto.comment?.trim() || 'Evidencia documental adjuntada (informe)',
      previous,
      { reportDocumentId: dto.documentId },
    );

    return saved;
  }

  async attachCompetenceEvidence(
    companyId: Types.ObjectId,
    id: string,
    dto: AttachAuditEvidenceDto,
    actor: AuditActor,
  ): Promise<AnnualAuditDocument> {
    const audit = await this.findTenantAudit(companyId, id);
    this.assertNotCompleted(audit, 'No se puede adjuntar evidencia a una auditoría COMPLETED');

    await this.assertDocumentInTenant(companyId, dto.documentId);

    const previous = {
      auditorCompetenceEvidenceId: audit.auditorCompetenceEvidenceId?.toString() ?? null,
    };
    audit.auditorCompetenceEvidenceId = new Types.ObjectId(dto.documentId);
    const saved = await audit.save();

    await this.recordHistory(
      companyId,
      audit._id,
      actor,
      AnnualAuditHistoryAction.EVIDENCE_ATTACHED,
      dto.comment?.trim() || 'Evidencia documental adjuntada (competencia del auditor)',
      previous,
      { auditorCompetenceEvidenceId: dto.documentId },
    );

    return saved;
  }

  // ── Historial (append-only, server-side) ────────────────────────────────

  async getHistory(companyId: Types.ObjectId, id: string): Promise<AnnualAuditHistory[]> {
    const audit = await this.findTenantAudit(companyId, id);
    return this.historyModel
      .find({ companyId, auditId: audit._id })
      .sort({ createdAt: -1 })
      .exec();
  }

  // ── Helpers de dominio ──────────────────────────────────────────────────

  private async findTenantAudit(companyId: Types.ObjectId, id: string): Promise<AnnualAuditDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Annual audit with id ${id} not found`);
    }
    const audit = await this.auditModel.findOne({ _id: id, companyId }).exec();
    if (!audit) {
      throw new NotFoundException(`Annual audit with id ${id} not found`);
    }
    return audit;
  }

  private findEmbeddedFinding(audit: AnnualAuditDocument, findingId: string): AuditFinding {
    const finding = audit.findings.find((f) => String(f._id) === findingId);
    if (!finding) {
      throw new NotFoundException(`Finding with id ${findingId} not found`);
    }
    return finding;
  }

  private findEmbeddedAction(finding: AuditFinding, actionId: string): AuditFollowUpAction {
    const action = finding.actions.find((a) => String(a._id) === actionId);
    if (!action) {
      throw new NotFoundException(`Action with id ${actionId} not found`);
    }
    return action;
  }

  private assertNotCompleted(audit: AnnualAuditDocument, message: string): void {
    if (audit.status === AnnualAuditStatus.COMPLETED) {
      throw new BadRequestException(message);
    }
  }

  private assertValidTransition(current: AnnualAuditStatus, next: AnnualAuditStatus): void {
    if (current === next) {
      throw new BadRequestException(`La auditoría ya está en estado ${current}`);
    }
    const allowed = ANNUAL_AUDIT_VALID_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Transición de estado inválida: ${current} → ${next}. Permitidas: ${allowed.join(', ') || '(ninguna)'}`,
      );
    }
  }

  /** Integridad: fechas coherentes con el estado destino. */
  private assertDatesCoherentWithStatus(audit: AnnualAuditDocument, next: AnnualAuditStatus): void {
    if (next === AnnualAuditStatus.IN_PROGRESS && !audit.actualStartDate) {
      throw new BadRequestException(
        'No se puede pasar a IN_PROGRESS sin actualStartDate (regístrela vía PATCH /annual-audit/:id)',
      );
    }
    if (next === AnnualAuditStatus.COMPLETED && !audit.actualEndDate) {
      throw new BadRequestException(
        'No se puede COMPLETED sin actualEndDate (regístrela vía PATCH /annual-audit/:id)',
      );
    }
  }

  /** Integridad de COMPLETED: información mínima para considerarse ejecutada. */
  private assertCompletionIntegrity(audit: AnnualAuditDocument): void {
    const missing: string[] = [];
    if (!audit.actualStartDate) missing.push('actualStartDate');
    if (!audit.actualEndDate) missing.push('actualEndDate');
    if (!audit.reportTitle && !audit.reportDocumentId && !audit.reportEvidenceUrl) {
      missing.push('informe (reportTitle, reportDocumentId o reportEvidenceUrl)');
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `No se puede COMPLETED: falta información mínima de ejecución (${missing.join(', ')})`,
      );
    }
  }

  private mergeDates(
    audit: AnnualAuditDocument,
    dto: UpdateAnnualAuditDto,
  ): { plannedStartDate?: Date; plannedEndDate?: Date; actualStartDate?: Date; actualEndDate?: Date } {
    return {
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : audit.plannedStartDate ?? undefined,
      plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : audit.plannedEndDate ?? undefined,
      actualStartDate: dto.actualStartDate ? new Date(dto.actualStartDate) : audit.actualStartDate ?? undefined,
      actualEndDate: dto.actualEndDate ? new Date(dto.actualEndDate) : audit.actualEndDate ?? undefined,
    };
  }

  /** Todos los usuarios referenciados deben pertenecer al tenant. */
  private async assertUsersInTenant(companyId: Types.ObjectId, userIds: string[]): Promise<void> {
    const ids = userIds.filter((uid) => Types.ObjectId.isValid(uid)).map((uid) => new Types.ObjectId(uid));
    if (ids.length === 0) return;
    const count = await this.userModel.countDocuments({ _id: { $in: ids }, companyId }).exec();
    if (count !== ids.length) {
      throw new BadRequestException('El responsable/auditor indicado no pertenece a esta empresa');
    }
  }

  /** Evidencia tenant-safe: el documento debe existir Y pertenecer al tenant. */
  private async assertDocumentInTenant(companyId: Types.ObjectId, documentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new BadRequestException('documentId no es un ObjectId válido');
    }
    const doc = await this.documentMasterService.findById(new Types.ObjectId(documentId), companyId);
    if (!doc || doc.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException(`Document with id ${documentId} not found`);
    }
  }

  /** Historial server-side (append-only). El frontend nunca lo envía. */
  private async recordHistory(
    companyId: Types.ObjectId,
    auditId: Types.ObjectId,
    actor: AuditActor,
    action: AnnualAuditHistoryAction,
    comment?: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>,
  ): Promise<void> {
    await this.historyModel.create({
      companyId,
      auditId,
      userId: actor.userId,
      userEmail: actor.userEmail,
      action,
      comment,
      previousValue,
      newValue,
    });
  }
}

/** Actor autenticado (resuelto server-side en el controller). */
export interface AuditActor {
  userId?: Types.ObjectId;
  userEmail: string;
}
