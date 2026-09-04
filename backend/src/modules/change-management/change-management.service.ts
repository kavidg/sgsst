import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ChangeRequest,
  ChangeRequestDocument,
  ChangeStatus,
  ChangeType,
  ImpactLevel,
} from './schema/change-request.schema';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { UpdateChangeRequestDto } from './dto/update-change-request.dto';

@Injectable()
export class ChangeManagementService {
  private readonly logger = new Logger(ChangeManagementService.name);

  constructor(
    @InjectModel(ChangeRequest.name)
    private changeRequestModel: Model<ChangeRequestDocument>,
  ) {}

  // ==================== VALIDATIONS ====================

  /**
   * Valida que riskAnalysis sea obligatorio para impactos MEDIUM, HIGH, CRITICAL.
   */
  private validateRiskAnalysis(
    impactLevel: ImpactLevel,
    riskAnalysis?: string,
  ): void {
    if (
      impactLevel !== ImpactLevel.LOW &&
      (!riskAnalysis || !riskAnalysis.trim())
    ) {
      throw new BadRequestException(
        `riskAnalysis is required for impact level ${impactLevel}`,
      );
    }
  }

  /**
   * Valida que controlActions no esté vacío para impactos MEDIUM, HIGH, CRITICAL.
   */
  private validateControlActions(
    impactLevel: ImpactLevel,
    controlActions?: string[],
  ): void {
    if (
      impactLevel !== ImpactLevel.LOW &&
      (!controlActions || controlActions.length === 0)
    ) {
      throw new BadRequestException(
        `At least one control action is required for impact level ${impactLevel}`,
      );
    }
  }

  /**
   * Valida que followUpDate no sea anterior a implementationDate.
   */
  private validateDates(
    implementationDate?: string,
    followUpDate?: string,
  ): void {
    if (implementationDate && followUpDate) {
      const impl = new Date(implementationDate);
      const follow = new Date(followUpDate);
      if (follow < impl) {
        throw new BadRequestException(
          'followUpDate must not be before implementationDate',
        );
      }
    }
  }

  /**
   * Valida transiciones de estado permitidas por el CRUD.
   *
   * El Approval Workflow futura será la autoridad definitiva de aprobación.
   * Estas reglas previenen modificaciones que invalidarían un flujo de aprobación.
   */
  private validateStatusTransition(
    currentStatus: ChangeStatus,
    newStatus: ChangeStatus,
  ): void {
    const allowedTransitions: Record<ChangeStatus, ChangeStatus[]> = {
      [ChangeStatus.DRAFT]: [
        ChangeStatus.DRAFT,
        ChangeStatus.PENDING_APPROVAL,
      ],
      [ChangeStatus.PENDING_APPROVAL]: [ChangeStatus.PENDING_APPROVAL],
      [ChangeStatus.APPROVED]: [ChangeStatus.APPROVED, ChangeStatus.IMPLEMENTED],
      [ChangeStatus.IMPLEMENTED]: [ChangeStatus.IMPLEMENTED],
      [ChangeStatus.REJECTED]: [
        ChangeStatus.REJECTED,
        ChangeStatus.DRAFT,
      ],
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus} via CRUD. ` +
          `Use the Approval Workflow for approval transitions.`,
      );
    }
  }

  // ==================== CRUD ====================

  /**
   * Crea una nueva solicitud de cambio.
   *
   * El estado inicial siempre es DRAFT.
   * companyId, createdBy, createdByName, requestedBy, requestedByName
   * se controlan exclusivamente en el backend.
   */
  async create(
    companyId: Types.ObjectId,
    dto: CreateChangeRequestDto,
    userId: Types.ObjectId,
    userName: string,
  ): Promise<ChangeRequestDocument> {
    this.validateRiskAnalysis(dto.impactLevel, dto.riskAnalysis);
    this.validateControlActions(dto.impactLevel, dto.controlActions);
    this.validateDates(dto.implementationDate, dto.followUpDate);

    const request = await this.changeRequestModel.create({
      companyId,
      title: dto.title,
      description: dto.description,
      changeType: dto.changeType,
      impactLevel: dto.impactLevel,
      status: ChangeStatus.DRAFT,
      requestedBy: userId,
      requestedByName: userName,
      riskAnalysis: dto.riskAnalysis,
      controlActions: dto.controlActions ?? [],
      affectedProcesses: dto.affectedProcesses ?? [],
      affectedWorkers: dto.affectedWorkers ?? [],
      implementationDate: dto.implementationDate
        ? new Date(dto.implementationDate)
        : undefined,
      followUpDate: dto.followUpDate
        ? new Date(dto.followUpDate)
        : undefined,
      observations: dto.observations,
      createdBy: userId,
      createdByName: userName,
    });

    this.logger.log(`Change request created: ${request._id} for company ${companyId}`);
    return request;
  }

  /**
   * Lista solicitudes de cambio de una empresa.
   *
   * Filtrado por companyId obligatorio.
   * Soporta filtros opcionales: status, changeType, impactLevel.
   */
  async findAll(
    companyId: Types.ObjectId,
    filters?: {
      status?: string;
      changeType?: string;
      impactLevel?: string;
    },
  ): Promise<ChangeRequestDocument[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.changeType) {
      query.changeType = filters.changeType;
    }
    if (filters?.impactLevel) {
      query.impactLevel = filters.impactLevel;
    }

    return this.changeRequestModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Obtiene una solicitud de cambio por ID dentro de la empresa.
   */
  async findOne(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<ChangeRequestDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Change request not found');
    }

    const request = await this.changeRequestModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!request) {
      throw new NotFoundException('Change request not found');
    }

    return request;
  }

  /**
   * Actualiza una solicitud de cambio.
   *
   * Aplica validaciones de negocio:
   * - Transiciones de estado protegidas
   * - riskAnalysis requerido para impactos MEDIUM+
   * - controlActions requerido para impactos MEDIUM+
   * - Validación de fechas
   */
  async update(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateChangeRequestDto,
  ): Promise<ChangeRequestDocument> {
    const existing = await this.findOne(companyId, id);

    // Validate status transition if provided
    if (dto.status && dto.status !== existing.status) {
      this.validateStatusTransition(existing.status, dto.status);
    }

    // Determine effective impact level (updated or current)
    const effectiveImpactLevel = dto.impactLevel ?? existing.impactLevel;

    // Validate riskAnalysis for MEDIUM+ impact
    if (dto.riskAnalysis !== undefined || dto.impactLevel !== undefined) {
      this.validateRiskAnalysis(
        effectiveImpactLevel,
        dto.riskAnalysis ?? existing.riskAnalysis,
      );
    }

    // Validate controlActions for MEDIUM+ impact
    if (dto.controlActions !== undefined || dto.impactLevel !== undefined) {
      this.validateControlActions(
        effectiveImpactLevel,
        dto.controlActions ?? existing.controlActions,
      );
    }

    // Validate dates
    if (dto.implementationDate !== undefined || dto.followUpDate !== undefined) {
      this.validateDates(
        dto.implementationDate ?? existing.implementationDate?.toISOString(),
        dto.followUpDate ?? existing.followUpDate?.toISOString(),
      );
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.changeType !== undefined) updateData.changeType = dto.changeType;
    if (dto.impactLevel !== undefined) updateData.impactLevel = dto.impactLevel;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.riskAnalysis !== undefined) updateData.riskAnalysis = dto.riskAnalysis;
    if (dto.controlActions !== undefined) updateData.controlActions = dto.controlActions;
    if (dto.affectedProcesses !== undefined) updateData.affectedProcesses = dto.affectedProcesses;
    if (dto.affectedWorkers !== undefined) updateData.affectedWorkers = dto.affectedWorkers;
    if (dto.implementationDate !== undefined)
      updateData.implementationDate = dto.implementationDate
        ? new Date(dto.implementationDate)
        : null;
    if (dto.followUpDate !== undefined)
      updateData.followUpDate = dto.followUpDate
        ? new Date(dto.followUpDate)
        : null;
    if (dto.observations !== undefined) updateData.observations = dto.observations;

    const updated = await this.changeRequestModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId },
        { $set: updateData },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Change request not found');
    }

    this.logger.log(`Change request updated: ${id} for company ${companyId}`);
    return updated;
  }

  /**
   * Elimina una solicitud de cambio.
   *
   * Solo disponible para owner (controlado en controller).
   * Mantiene tenant isolation.
   */
  async remove(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Change request not found');
    }

    const result = await this.changeRequestModel
      .findOneAndDelete({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!result) {
      throw new NotFoundException('Change request not found');
    }

    this.logger.log(`Change request deleted: ${id} from company ${companyId}`);
    return { message: 'Change request deleted' };
  }

  /**
   * Obtiene estadísticas de solicitudes de cambio por empresa.
   */
  async getStats(companyId: Types.ObjectId) {
    const all = await this.changeRequestModel
      .find({ companyId })
      .select('status changeType impactLevel')
      .exec();

    const total = all.length;
    const draft = all.filter((r) => r.status === ChangeStatus.DRAFT).length;
    const pendingApproval = all.filter((r) => r.status === ChangeStatus.PENDING_APPROVAL).length;
    const approved = all.filter((r) => r.status === ChangeStatus.APPROVED).length;
    const implemented = all.filter((r) => r.status === ChangeStatus.IMPLEMENTED).length;
    const rejected = all.filter((r) => r.status === ChangeStatus.REJECTED).length;

    const byImpactLevel: Record<string, number> = {};
    for (const level of Object.values(ImpactLevel)) {
      byImpactLevel[level] = all.filter((r) => r.impactLevel === level).length;
    }

    const byChangeType: Record<string, number> = {};
    for (const type of Object.values(ChangeType)) {
      byChangeType[type] = all.filter((r) => r.changeType === type).length;
    }

    return {
      total,
      draft,
      pendingApproval,
      approved,
      implemented,
      rejected,
      byImpactLevel,
      byChangeType,
    };
  }

  // ==================== APPROVAL WORKFLOW ====================

  /**
   * Prepara una solicitud de cambio para enviarla al Approval Workflow.
   *
   * Valida:
   * - La solicitud existe y pertenece a la empresa
   * - Está en estado DRAFT (o DRAFT después de rechazo/ajustes)
   * - Tiene los campos obligatorios para su nivel de impacto
   * - Actualiza status a PENDING_APPROVAL
   */
  async prepareForApproval(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<{ requestId: string; title: string }> {
    const existing = await this.findOne(companyId, id);

    // Only DRAFT can be submitted for approval
    if (
      existing.status !== ChangeStatus.DRAFT &&
      existing.status !== ChangeStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot submit for approval: request is in status ${existing.status}. Only DRAFT or REJECTED can be submitted.`,
      );
    }

    // Validate required fields based on impact level
    this.validateRiskAnalysis(existing.impactLevel, existing.riskAnalysis);
    this.validateControlActions(existing.impactLevel, existing.controlActions);

    // Update status to PENDING_APPROVAL
    const updated = await this.changeRequestModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId },
        { $set: { status: ChangeStatus.PENDING_APPROVAL } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Change request not found');
    }

    this.logger.log(`Change request ${id} prepared for approval (PENDING_APPROVAL)`);

    return {
      requestId: updated._id.toString(),
      title: updated.title,
    };
  }

  /**
   * Obtiene el estado de aprobación de una solicitud.
   */
  async getApprovalStatus(
    companyId: Types.ObjectId,
    id: string,
  ) {
    const request = await this.findOne(companyId, id);
    return {
      requestId: request._id.toString(),
      title: request.title,
      status: request.status,
      approvalStatus: request.approvalStatus,
    };
  }

  /**
   * Obtiene el historial de aprobación de una solicitud.
   * El historial real se obtiene del ApprovalWorkflowService.
   * Este método proporciona un wrapper para el controller.
   */
  async getApprovalHistory(
    companyId: Types.ObjectId,
    id: string,
  ) {
    await this.findOne(companyId, id);
    // The history is managed by ApprovalWorkflowService via ApprovalEvent
    // This endpoint exists for API consistency with other modules
    return {
      requestId: id,
      history: [], // Will be populated by ApprovalWorkflowService when integrated
    };
  }
}
