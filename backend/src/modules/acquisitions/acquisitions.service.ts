import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Supplier, SupplierDocument, SupplierStatus } from './schemas/supplier.schema';
import { Acquisition, AcquisitionDocument, AcquisitionStatus } from './schemas/acquisition.schema';
import { AcquisitionHistory, AcquisitionHistoryDocument } from './schemas/acquisition-history.schema';
import { ApprovalStatus } from '../approval-workflow/enums/approval-status.enum';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalNotificationService, ApprovalNotificationEvent } from '../approval-workflow/services/approval-notification.service';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AcquisitionsService {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Acquisition.name) private acquisitionModel: Model<AcquisitionDocument>,
    @InjectModel(AcquisitionHistory.name) private historyModel: Model<AcquisitionHistoryDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly approvalNotificationService: ApprovalNotificationService,
  ) {}

  // ==================== HELPERS ====================

  private async recordHistory(
    companyId: Types.ObjectId,
    userId: Types.ObjectId | undefined,
    userEmail: string,
    action: string,
    entityType: string,
    entityId: string,
    description: string,
    previousValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>,
  ) {
    await this.historyModel.create({
      companyId,
      userId,
      userEmail,
      action,
      entityType,
      entityId,
      description,
      previousValue,
      newValue,
    });
  }

  private async nextRequestNumber(companyId: Types.ObjectId): Promise<string> {
    const count = await this.acquisitionModel.countDocuments({ companyId }).exec();
    const year = new Date().getFullYear();
    return `ADQ-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private readonly logger = new Logger(AcquisitionsService.name);

  /**
   * Notifica a los usuarios relevantes sobre un evento del Approval Workflow.
   * Delega en ApprovalNotificationService (servicio genérico reutilizable).
   */
  async notifyApprovalEvent(
    companyId: Types.ObjectId,
    event: {
      type: string;
      message: string;
      severity: import('../alerts/schemas/alert.schema').AlertSeverity;
      acquisitionId: string;
      requestNumber: string;
      submittedBy?: string;
      actionUrl?: string;
    },
  ): Promise<void> {
    // Map legacy event type to ApprovalNotificationEvent
    const notificationEvent: ApprovalNotificationEvent = event.type.includes('SUBMITTED')
      ? 'APPROVAL_SUBMITTED'
      : event.type.includes('APPROVED')
        ? 'APPROVED'
        : event.type.includes('REJECTED')
          ? 'REJECTED'
          : 'ADJUSTMENTS_REQUESTED';

    await this.approvalNotificationService.notify({
      companyId,
      entity: ApprovalEntity.ACQUISITION,
      entityId: event.acquisitionId,
      entityLabel: event.requestNumber,
      event: notificationEvent,
      actorEmail: event.submittedBy,
      actionUrl: event.actionUrl,
    });
  }

  // ==================== DASHBOARD ====================

  async getDashboard(companyId: Types.ObjectId) {
    const [
      totalSuppliers,
      activeSuppliers,
      inactiveSuppliers,
      totalAcquisitions,
      draftAcquisitions,
      requestedAcquisitions,
      inReviewAcquisitions,
      supplierSelectedAcquisitions,
      inProgressAcquisitions,
      completedAcquisitions,
      cancelledAcquisitions,
    ] = await Promise.all([
      this.supplierModel.countDocuments({ companyId }).exec(),
      this.supplierModel.countDocuments({ companyId, status: SupplierStatus.ACTIVE }).exec(),
      this.supplierModel.countDocuments({ companyId, status: SupplierStatus.INACTIVE }).exec(),
      this.acquisitionModel.countDocuments({ companyId }).exec(),
      this.acquisitionModel.countDocuments({ companyId, status: AcquisitionStatus.DRAFT }).exec(),
      this.acquisitionModel.countDocuments({ companyId, status: AcquisitionStatus.REQUESTED }).exec(),
      this.acquisitionModel.countDocuments({ companyId, status: AcquisitionStatus.IN_REVIEW }).exec(),
      this.acquisitionModel.countDocuments({ companyId, status: AcquisitionStatus.SUPPLIER_SELECTED }).exec(),
      this.acquisitionModel.countDocuments({ companyId, status: AcquisitionStatus.IN_PROGRESS }).exec(),
      this.acquisitionModel.countDocuments({ companyId, status: AcquisitionStatus.COMPLETED }).exec(),
      this.acquisitionModel.countDocuments({ companyId, status: AcquisitionStatus.CANCELLED }).exec(),
    ]);

    return {
      totalSuppliers,
      activeSuppliers,
      inactiveSuppliers,
      totalAcquisitions,
      draftAcquisitions,
      requestedAcquisitions,
      inReviewAcquisitions,
      supplierSelectedAcquisitions,
      inProgressAcquisitions,
      completedAcquisitions,
      cancelledAcquisitions,
    };
  }

  // ==================== SUPPLIERS ====================

  async createSupplier(
    companyId: Types.ObjectId,
    payload: {
      name: string;
      legalName?: string;
      taxId?: string;
      type?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      observations?: string;
    },
    userId?: Types.ObjectId,
    userEmail?: string,
    userName?: string,
  ) {
    const supplier = await this.supplierModel.create({
      companyId,
      name: payload.name,
      legalName: payload.legalName,
      taxId: payload.taxId,
      type: payload.type ?? 'PROVIDER',
      contactName: payload.contactName,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      observations: payload.observations,
      status: SupplierStatus.ACTIVE,
      createdBy: userId,
      createdByName: userName,
    });

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'SUPPLIER_CREATED', 'Supplier', supplier._id.toString(),
      `Proveedor creado: ${payload.name}`,
      undefined, { name: payload.name, type: payload.type ?? 'PROVIDER' },
    );

    return supplier;
  }

  async findSuppliers(companyId: Types.ObjectId) {
    return this.supplierModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }

  async findSupplierById(companyId: Types.ObjectId, id: string) {
    const supplier = await this.supplierModel.findOne({ _id: new Types.ObjectId(id), companyId }).exec();
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async updateSupplier(
    companyId: Types.ObjectId,
    id: string,
    payload: Record<string, unknown>,
    userId?: Types.ObjectId,
    userEmail?: string,
  ) {
    const previous = await this.supplierModel.findOne({ _id: new Types.ObjectId(id), companyId }).exec();
    if (!previous) throw new NotFoundException('Supplier not found');

    const updated = await this.supplierModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), companyId },
      { $set: payload },
      { new: true },
    ).exec();

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'SUPPLIER_UPDATED', 'Supplier', id,
      `Proveedor actualizado: ${previous.name}`,
      { name: previous.name },
      { name: updated?.name ?? previous.name },
    );

    return updated;
  }

  async deleteSupplier(
    companyId: Types.ObjectId,
    id: string,
    userId?: Types.ObjectId,
    userEmail?: string,
  ) {
    const supplier = await this.supplierModel.findOne({ _id: new Types.ObjectId(id), companyId }).exec();
    if (!supplier) throw new NotFoundException('Supplier not found');

    // Check if supplier is used in any acquisition
    const acquisitionCount = await this.acquisitionModel.countDocuments({
      companyId,
      supplierId: new Types.ObjectId(id),
    }).exec();
    if (acquisitionCount > 0) {
      throw new BadRequestException('Cannot delete supplier with associated acquisitions. Set as INACTIVE instead.');
    }

    await this.supplierModel.findOneAndDelete({ _id: new Types.ObjectId(id), companyId }).exec();

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'SUPPLIER_DELETED', 'Supplier', id,
      `Proveedor eliminado: ${supplier.name}`,
      { name: supplier.name },
    );

    return { message: 'Supplier deleted' };
  }

  // ==================== ACQUISITIONS ====================

  async createAcquisition(
    companyId: Types.ObjectId,
    payload: {
      title: string;
      description?: string;
      requestingArea?: string;
      requestedBy?: string;
      responsibleUser?: string;
      priority?: string;
      sstCriteria?: string;
      observations?: string;
      requiredDate?: string;
    },
    userId?: Types.ObjectId,
    userEmail?: string,
    userName?: string,
  ) {
    const requestNumber = await this.nextRequestNumber(companyId);
    const acquisition = await this.acquisitionModel.create({
      companyId,
      requestNumber,
      title: payload.title,
      description: payload.description,
      requestingArea: payload.requestingArea,
      requestedBy: payload.requestedBy,
      responsibleUser: payload.responsibleUser ? new Types.ObjectId(payload.responsibleUser) : undefined,
      priority: payload.priority ?? 'MEDIUM',
      status: AcquisitionStatus.DRAFT,
      sstCriteria: payload.sstCriteria,
      observations: payload.observations,
      requestedAt: new Date(),
      requiredDate: payload.requiredDate ? new Date(payload.requiredDate) : undefined,
      createdBy: userId,
      createdByName: userName,
    });

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'ACQUISITION_CREATED', 'Acquisition', acquisition._id.toString(),
      `Adquisición creada: ${requestNumber} — ${payload.title}`,
      undefined, { requestNumber, title: payload.title },
    );

    return acquisition;
  }

  async findAcquisitions(companyId: Types.ObjectId) {
    return this.acquisitionModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }

  async findAcquisitionById(companyId: Types.ObjectId, id: string) {
    const acquisition = await this.acquisitionModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .populate('supplierId')
      .exec();
    if (!acquisition) throw new NotFoundException('Acquisition not found');
    return acquisition;
  }

  async updateAcquisition(
    companyId: Types.ObjectId,
    id: string,
    payload: Record<string, unknown>,
    userId?: Types.ObjectId,
    userEmail?: string,
  ) {
    const previous = await this.acquisitionModel.findOne({ _id: new Types.ObjectId(id), companyId }).exec();
    if (!previous) throw new NotFoundException('Acquisition not found');

    // Convert string fields to ObjectId where needed
    if (payload.responsibleUser && typeof payload.responsibleUser === 'string') {
      payload.responsibleUser = new Types.ObjectId(payload.responsibleUser);
    }
    if (payload.supplierId && typeof payload.supplierId === 'string') {
      payload.supplierId = new Types.ObjectId(payload.supplierId);
    }

    const updated = await this.acquisitionModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), companyId },
      { $set: payload },
      { new: true },
    ).exec();

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'ACQUISITION_UPDATED', 'Acquisition', id,
      `Adquisición actualizada: ${previous.requestNumber}`,
      { title: previous.title, status: previous.status },
      { title: updated?.title ?? previous.title, status: updated?.status ?? previous.status },
    );

    return updated;
  }

  async deleteAcquisition(
    companyId: Types.ObjectId,
    id: string,
    userId?: Types.ObjectId,
    userEmail?: string,
  ) {
    const acquisition = await this.acquisitionModel.findOne({ _id: new Types.ObjectId(id), companyId }).exec();
    if (!acquisition) throw new NotFoundException('Acquisition not found');

    await this.acquisitionModel.findOneAndDelete({ _id: new Types.ObjectId(id), companyId }).exec();

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'ACQUISITION_DELETED', 'Acquisition', id,
      `Adquisición eliminada: ${acquisition.requestNumber}`,
      { requestNumber: acquisition.requestNumber, title: acquisition.title },
    );

    return { message: 'Acquisition deleted' };
  }

  async changeStatus(
    companyId: Types.ObjectId,
    id: string,
    newStatus: string,
    userId?: Types.ObjectId,
    userEmail?: string,
  ) {
    const acquisition = await this.acquisitionModel.findOne({ _id: new Types.ObjectId(id), companyId }).exec();
    if (!acquisition) throw new NotFoundException('Acquisition not found');

    const validStatuses = Object.values(AcquisitionStatus);
    if (!validStatuses.includes(newStatus as AcquisitionStatus)) {
      throw new BadRequestException(`Invalid status: ${newStatus}`);
    }

    const previousStatus = acquisition.status;
    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === AcquisitionStatus.COMPLETED) {
      update.completedAt = new Date();
    }

    const updated = await this.acquisitionModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), companyId },
      { $set: update },
      { new: true },
    ).exec();

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'ACQUISITION_STATUS_CHANGED', 'Acquisition', id,
      `Estado cambiado: ${previousStatus} → ${newStatus}`,
      { status: previousStatus },
      { status: newStatus },
    );

    return updated;
  }

  async assignSupplier(
    companyId: Types.ObjectId,
    acquisitionId: string,
    supplierId: string,
    userId?: Types.ObjectId,
    userEmail?: string,
  ) {
    const acquisition = await this.acquisitionModel.findOne({
      _id: new Types.ObjectId(acquisitionId),
      companyId,
    }).exec();
    if (!acquisition) throw new NotFoundException('Acquisition not found');

    const supplier = await this.supplierModel.findOne({
      _id: new Types.ObjectId(supplierId),
      companyId,
    }).exec();
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.status !== SupplierStatus.ACTIVE) {
      throw new BadRequestException('Supplier is not active');
    }

    const previousSupplierId = acquisition.supplierId?.toString();

    const updated = await this.acquisitionModel.findOneAndUpdate(
      { _id: new Types.ObjectId(acquisitionId), companyId },
      { $set: { supplierId: new Types.ObjectId(supplierId), status: AcquisitionStatus.SUPPLIER_SELECTED } },
      { new: true },
    ).exec();

    await this.recordHistory(
      companyId, userId, userEmail ?? '',
      'ACQUISITION_SUPPLIER_ASSIGNED', 'Acquisition', acquisitionId,
      `Proveedor asignado: ${supplier.name} → ${acquisition.requestNumber}`,
      { supplierId: previousSupplierId },
      { supplierId: supplierId, supplierName: supplier.name },
    );

    return updated;
  }

  // ==================== HISTORY ====================

  async getHistory(companyId: Types.ObjectId, limit = 100, skip = 0) {
    return this.historyModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  // ==================== APPROVAL WORKFLOW ====================

  /**
   * Obtiene el estado de aprobación de una adquisición.
   * Derivado del campo approvalStatus (canónico ApprovalStatus).
   */
  async getApprovalStatus(
    companyId: Types.ObjectId,
    acquisitionId: string,
  ): Promise<{
    acquisitionId: string;
    approvalStatus: ApprovalStatus | null;
    canSubmit: boolean;
  }> {
    const acquisition = await this.acquisitionModel
      .findOne({ _id: new Types.ObjectId(acquisitionId), companyId })
      .exec();
    if (!acquisition) throw new NotFoundException('Acquisition not found');

    const approvalStatus = acquisition.approvalStatus ?? null;

    // Una adquisición puede enviarse a aprobación si:
    // - No tiene approvalStatus actual, O
    // - Está en DRAFT/REJECTED/ADJUSTMENTS_REQUESTED
    const canSubmit = !approvalStatus ||
      approvalStatus === ApprovalStatus.DRAFT ||
      approvalStatus === ApprovalStatus.REJECTED ||
      approvalStatus === ApprovalStatus.ADJUSTMENTS_REQUESTED;

    return {
      acquisitionId: acquisition._id.toString(),
      approvalStatus,
      canSubmit,
    };
  }

  /**
   * Prepara una adquisición para enviarla a aprobación.
   * Valida:
   * - La adquisición existe y pertenece al companyId
   * - La adquisición puede enviarse (no está ya PENDING_APPROVAL o APPROVED)
   * - No hay solicitud PENDING activa duplicada
   *
   * Retorna la información necesaria para que el controller cree la ApprovalRequest.
   * NO crea la ApprovalRequest directamente (eso lo hace el controller vía ApprovalWorkflowService).
   */
  async prepareForApproval(
    companyId: Types.ObjectId,
    acquisitionId: string,
    actor?: { userId?: string; userEmail?: string },
  ): Promise<{
    acquisitionId: string;
    requestNumber: string;
    title: string;
  }> {
    const acquisition = await this.acquisitionModel
      .findOne({ _id: new Types.ObjectId(acquisitionId), companyId })
      .exec();
    if (!acquisition) throw new NotFoundException('Acquisition not found');

    // Validar que puede enviarse a aprobación
    if (acquisition.approvalStatus === ApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Acquisition is already pending approval');
    }
    if (acquisition.approvalStatus === ApprovalStatus.APPROVED) {
      throw new BadRequestException('Acquisition is already approved. Create a new acquisition or submit for re-approval after changes.');
    }

    // Actualizar approvalStatus a PENDING_APPROVAL
    await this.acquisitionModel
      .findByIdAndUpdate(
        acquisition._id,
        { $set: { approvalStatus: ApprovalStatus.PENDING_APPROVAL } },
        { new: true },
      )
      .exec();

    // Registrar en historial
    await this.recordHistory(
      companyId,
      actor?.userId ? new Types.ObjectId(actor.userId) : undefined,
      actor?.userEmail ?? '',
      'ACQUISITION_SUBMITTED_FOR_APPROVAL',
      'Acquisition',
      acquisition._id.toString(),
      `Adquisición ${acquisition.requestNumber} enviada a aprobación`,
      { approvalStatus: acquisition.approvalStatus },
      { approvalStatus: ApprovalStatus.PENDING_APPROVAL },
    );

    return {
      acquisitionId: acquisition._id.toString(),
      requestNumber: acquisition.requestNumber,
      title: acquisition.title,
    };
  }

  /**
   * Solicita ajustes sobre una adquisición en estado PENDING_APPROVAL.
   * Cambia approvalStatus a ADJUSTMENTS_REQUESTED y registra la razón.
   */
  async requestAdjustments(
    companyId: Types.ObjectId,
    acquisitionId: string,
    reason: string,
    actor?: { userId?: string; userEmail?: string },
  ): Promise<{
    acquisitionId: string;
    requestNumber: string;
    approvalStatus: ApprovalStatus;
  }> {
    const acquisition = await this.acquisitionModel
      .findOne({ _id: new Types.ObjectId(acquisitionId), companyId })
      .exec();
    if (!acquisition) throw new NotFoundException('Acquisition not found');

    if (acquisition.approvalStatus !== ApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Acquisition must be in PENDING_APPROVAL status to request adjustments');
    }

    await this.acquisitionModel
      .findByIdAndUpdate(
        acquisition._id,
        { $set: { approvalStatus: ApprovalStatus.ADJUSTMENTS_REQUESTED } },
        { new: true },
      )
      .exec();

    await this.recordHistory(
      companyId,
      actor?.userId ? new Types.ObjectId(actor.userId) : undefined,
      actor?.userEmail ?? '',
      'ACQUISITION_ADJUSTMENTS_REQUESTED',
      'Acquisition',
      acquisition._id.toString(),
      `Ajustes solicitados en adquisición ${acquisition.requestNumber}: ${reason}`,
      { approvalStatus: acquisition.approvalStatus },
      { approvalStatus: ApprovalStatus.ADJUSTMENTS_REQUESTED, reason },
    );

    return {
      acquisitionId: acquisition._id.toString(),
      requestNumber: acquisition.requestNumber,
      approvalStatus: ApprovalStatus.ADJUSTMENTS_REQUESTED,
    };
  }

  /**
   * Obtiene las métricas de aprobación para una empresa.
   * Usado por el evidence adapter y el ComplianceAIInsight.
   */
  async getApprovalMetrics(companyId: Types.ObjectId): Promise<{
    totalPending: number;
    totalApproved: number;
    totalRejected: number;
    totalWithApproval: number;
  }> {
    const [totalPending, totalApproved, totalRejected, totalWithApproval] = await Promise.all([
      this.acquisitionModel.countDocuments({
        companyId,
        approvalStatus: ApprovalStatus.PENDING_APPROVAL,
      }).exec(),
      this.acquisitionModel.countDocuments({
        companyId,
        approvalStatus: ApprovalStatus.APPROVED,
      }).exec(),
      this.acquisitionModel.countDocuments({
        companyId,
        approvalStatus: ApprovalStatus.REJECTED,
      }).exec(),
      this.acquisitionModel.countDocuments({
        companyId,
        approvalStatus: { $exists: true, $ne: null },
      }).exec(),
    ]);

    return { totalPending, totalApproved, totalRejected, totalWithApproval };
  }
}
