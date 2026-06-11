import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { 
  DocumentMaster, DocumentMasterDocument, 
  DocumentType, DocumentStatus 
} from '../schemas/document-master.schema';
import { DocumentVersion, DocumentVersionDocument } from '../schemas/document-version.schema';
import { DocumentHistoryService } from './document-history.service';
import { DocumentRetentionService } from './document-retention.service';
import { DocumentHistoryAction } from '../schemas/document-history.schema';
import { DocumentApproval, DocumentApprovalDocument, ApprovalStatus } from '../schemas/document-approval.schema';
import { DocumentSignature, DocumentSignatureDocument } from '../schemas/document-signature.schema';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';

interface UserRef {
  _id: Types.ObjectId;
  email?: string;
  name?: string;
}

@Injectable()
export class DocumentMasterService {
  constructor(
    @InjectModel(DocumentMaster.name)
    private readonly documentModel: Model<DocumentMasterDocument>,
    @InjectModel(DocumentVersion.name)
    private readonly versionModel: Model<DocumentVersionDocument>,
    @InjectModel(DocumentApproval.name)
    private readonly approvalModel: Model<DocumentApprovalDocument>,
    @InjectModel(DocumentSignature.name)
    private readonly signatureModel: Model<DocumentSignatureDocument>,
    private readonly historyService: DocumentHistoryService,
    private readonly retentionService: DocumentRetentionService,
    private readonly alertsService: AlertsService,
  ) {}

  // ==================== DOCUMENT CRUD ====================

  async create(
    companyId: Types.ObjectId,
    dto: {
      code: string;
      name: string;
      description?: string;
      documentType: DocumentType;
      process?: string;
      version?: number;
      status?: DocumentStatus;
      ownerUser?: Types.ObjectId;
      approvalUser?: Types.ObjectId;
      approvalDate?: Date;
      expirationDate?: Date;
    },
    user: UserRef,
  ): Promise<DocumentMasterDocument> {
    const existing = await this.documentModel
      .findOne({ companyId, code: dto.code })
      .exec();

    if (existing) {
      throw new BadRequestException(`Document with code "${dto.code}" already exists`);
    }

    const document = await this.documentModel.create({
      companyId,
      code: dto.code,
      name: dto.name,
      description: dto.description,
      documentType: dto.documentType,
      process: dto.process,
      version: dto.version ?? 1,
      status: dto.status ?? DocumentStatus.DRAFT,
      ownerUser: dto.ownerUser,
      approvalUser: dto.approvalUser,
      approvalDate: dto.approvalDate,
      expirationDate: dto.expirationDate,
    });

    // Create initial version
    if (dto.version && dto.version > 0) {
      await this.versionModel.create({
        documentId: document._id,
        versionNumber: document.version,
        fileUrl: '',
        uploadedBy: user._id,
        uploadDate: new Date(),
        changeDescription: 'Initial document creation',
        isCurrent: true,
      });
    }

    // Record history
    await this.historyService.record({
      companyId,
      documentId: document._id,
      userId: user._id,
      action: DocumentHistoryAction.CREATE,
      newValue: { code: dto.code, name: dto.name, documentType: dto.documentType },
      description: `Document "${dto.name}" created`,
    });

    return document;
  }

  async findAll(companyId: Types.ObjectId): Promise<DocumentMaster[]> {
    return this.documentModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .populate('ownerUser', 'name email')
      .populate('approvalUser', 'name email')
      .exec();
  }

  async findById(id: Types.ObjectId): Promise<DocumentMaster> {
    const doc = await this.documentModel
      .findById(id)
      .populate('ownerUser', 'name email')
      .populate('approvalUser', 'name email')
      .exec();

    if (!doc) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    return doc;
  }

  async findByCompanyAndCode(companyId: Types.ObjectId, code: string): Promise<DocumentMaster | null> {
    return this.documentModel
      .findOne({ companyId, code })
      .populate('ownerUser', 'name email')
      .populate('approvalUser', 'name email')
      .exec();
  }

  async update(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    updates: Record<string, unknown>,
    user: UserRef,
  ): Promise<DocumentMaster> {
    const document = await this.documentModel.findById(id).exec();
    if (!document) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    const previousValue = {
      name: document.name,
      description: document.description,
      documentType: document.documentType,
      status: document.status,
      process: document.process,
      ownerUser: document.ownerUser,
      approvalUser: document.approvalUser,
    };

    const updated = await this.documentModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('ownerUser', 'name email')
      .populate('approvalUser', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    await this.historyService.record({
      companyId,
      documentId: id,
      userId: user._id,
      action: DocumentHistoryAction.EDIT,
      previousValue: previousValue as Record<string, unknown>,
      newValue: updates as Record<string, unknown>,
      description: `Document "${document.name}" updated`,
    });

    return updated;
  }

  async updateStatus(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    status: DocumentStatus,
    reason: string | undefined,
    user: UserRef,
  ): Promise<DocumentMaster> {
    const document = await this.documentModel.findById(id).exec();
    if (!document) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    const previousStatus = document.status;

    const updated = await this.documentModel
      .findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .populate('ownerUser', 'name email')
      .populate('approvalUser', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    const action = status === DocumentStatus.ARCHIVED 
      ? DocumentHistoryAction.ARCHIVE 
      : status === DocumentStatus.ACTIVE
        ? DocumentHistoryAction.RESTORE
        : DocumentHistoryAction.STATUS_CHANGE;

    await this.historyService.record({
      companyId,
      documentId: id,
      userId: user._id,
      action,
      previousValue: { status: previousStatus } as Record<string, unknown>,
      newValue: { status } as Record<string, unknown>,
      description: reason || `Status changed from ${previousStatus} to ${status}`,
    });

    return updated;
  }

  async remove(id: Types.ObjectId, companyId: Types.ObjectId, user: UserRef): Promise<void> {
    const document = await this.documentModel.findById(id).exec();
    if (!document) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    // Delete all related data
    await Promise.all([
      this.versionModel.deleteMany({ documentId: id }).exec(),
      this.approvalModel.deleteMany({ documentId: id }).exec(),
      this.signatureModel.deleteMany({ documentId: id }).exec(),
      this.historyService.record({
        companyId,
        documentId: id,
        userId: user._id,
        action: DocumentHistoryAction.DELETE,
        previousValue: { code: document.code, name: document.name } as Record<string, unknown>,
        description: `Document "${document.name}" deleted`,
      }),
      this.documentModel.findByIdAndDelete(id).exec(),
    ]);
  }

  // ==================== VERSIONING ====================

  async uploadVersion(
    documentId: Types.ObjectId,
    companyId: Types.ObjectId,
    fileUrl: string,
    changeDescription: string | undefined,
    user: UserRef,
  ): Promise<{ document: DocumentMaster; version: DocumentVersion }> {
    const document = await this.documentModel.findById(documentId).exec();
    if (!document) {
      throw new NotFoundException(`Document with id ${documentId} not found`);
    }

    // Mark previous versions as not current
    await this.versionModel
      .updateMany(
        { documentId, isCurrent: true },
        { $set: { isCurrent: false } },
      )
      .exec();

    const newVersionNumber = document.version + 1;

    const version = await this.versionModel.create({
      documentId,
      versionNumber: newVersionNumber,
      fileUrl,
      uploadedBy: user._id,
      uploadDate: new Date(),
      changeDescription: changeDescription || `Version ${newVersionNumber}`,
      isCurrent: true,
    });

    // Update document version
    const updated = await this.documentModel
      .findByIdAndUpdate(
        documentId,
        { $set: { version: newVersionNumber, status: DocumentStatus.UNDER_REVIEW } },
        { new: true },
      )
      .populate('ownerUser', 'name email')
      .populate('approvalUser', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Document with id ${documentId} not found`);
    }

    await this.historyService.record({
      companyId,
      documentId,
      userId: user._id,
      action: DocumentHistoryAction.VERSION_CHANGE,
      previousValue: { version: document.version } as Record<string, unknown>,
      newValue: { version: newVersionNumber, fileUrl } as Record<string, unknown>,
      description: changeDescription || `Version updated from ${document.version} to ${newVersionNumber}`,
    });

    return { document: updated, version };
  }

  async getVersions(documentId: Types.ObjectId): Promise<DocumentVersion[]> {
    const versions = await this.versionModel
      .find({ documentId })
      .sort({ versionNumber: -1 })
      .populate('uploadedBy', 'name email')
      .exec();

    return versions;
  }

  async getCurrentVersion(documentId: Types.ObjectId): Promise<DocumentVersion | null> {
    return this.versionModel
      .findOne({ documentId, isCurrent: true })
      .populate('uploadedBy', 'name email')
      .exec();
  }

  // ==================== APPROVAL WORKFLOW ====================

  async submitForApproval(
    documentId: Types.ObjectId,
    companyId: Types.ObjectId,
    requestedBy: Types.ObjectId,
    comments?: string,
  ): Promise<DocumentApproval> {
    const document = await this.documentModel.findById(documentId).exec();
    if (!document) {
      throw new NotFoundException(`Document with id ${documentId} not found`);
    }

    if (document.status === DocumentStatus.ACTIVE) {
      throw new BadRequestException('Document is already active');
    }

    // Update document status
    await this.documentModel
      .findByIdAndUpdate(documentId, { $set: { status: DocumentStatus.PENDING_APPROVAL } })
      .exec();

    // Create approval request
    const approval = await this.approvalModel.create({
      companyId,
      documentId,
      requestedBy,
      status: ApprovalStatus.PENDING,
      comments,
    });

    // Create alert for managers
    await this.alertsService.createUnique({
      companyId,
      type: 'DOCUMENT_APPROVAL_REQUEST',
      message: `Documento "${document.name}" (${document.code}) requiere aprobación gerencial.`,
      severity: AlertSeverity.MEDIUM,
    });

    await this.historyService.record({
      companyId,
      documentId,
      userId: requestedBy,
      action: DocumentHistoryAction.STATUS_CHANGE,
      previousValue: { status: document.status } as Record<string, unknown>,
      newValue: { status: DocumentStatus.PENDING_APPROVAL } as Record<string, unknown>,
      description: `Document submitted for approval`,
    });

    return approval;
  }

  async approve(
    approvalId: Types.ObjectId,
    companyId: Types.ObjectId,
    approvedBy: Types.ObjectId,
    comments?: string,
    signatureHash?: string,
    signatureUrl?: string,
    signerName?: string,
    signerEmail?: string,
  ): Promise<{ approval: DocumentApproval; document: DocumentMaster }> {
    const approval = await this.approvalModel.findById(approvalId).exec();
    if (!approval) {
      throw new NotFoundException(`Approval request with id ${approvalId} not found`);
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Approval request is not pending');
    }

    // Update approval
    approval.status = ApprovalStatus.APPROVED;
    approval.approvedBy = approvedBy;
    approval.approvedAt = new Date();
    approval.comments = comments || approval.comments;
    await approval.save();

    // Update document status to ACTIVE
    const document = await this.documentModel
      .findByIdAndUpdate(
        approval.documentId,
        {
          $set: {
            status: DocumentStatus.ACTIVE,
            approvalUser: approvedBy,
            approvalDate: new Date(),
          },
        },
        { new: true },
      )
      .populate('ownerUser', 'name email')
      .populate('approvalUser', 'name email')
      .exec();

    if (!document) {
      throw new NotFoundException('Document not found after approval');
    }

    // Record signature if provided
    if (signatureHash || signatureUrl) {
      await this.signatureModel.create({
        companyId,
        documentId: document._id,
        userId: approvedBy,
        signerName: signerName || 'Approved Signer',
        signerEmail,
        signatureHash,
        signatureUrl,
        comments,
        isExecutiveSignature: true,
      });
    }

    // Record history
    await this.historyService.record({
      companyId,
      documentId: document._id,
      userId: approvedBy,
      action: DocumentHistoryAction.APPROVAL,
      previousValue: { status: DocumentStatus.PENDING_APPROVAL } as Record<string, unknown>,
      newValue: { status: DocumentStatus.ACTIVE, approvedBy } as Record<string, unknown>,
      description: `Document approved by ${signerName || 'manager'}`,
    });

    if (signatureHash || signatureUrl) {
      await this.historyService.record({
        companyId,
        documentId: document._id,
        userId: approvedBy,
        action: DocumentHistoryAction.SIGNATURE,
        description: `Digital signature registered for document`,
      });
    }

    return { approval, document };
  }

  async reject(
    approvalId: Types.ObjectId,
    rejectionReason: string,
    comments: string | undefined,
  ): Promise<DocumentApproval> {
    const approval = await this.approvalModel.findById(approvalId).exec();
    if (!approval) {
      throw new NotFoundException(`Approval request with id ${approvalId} not found`);
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Approval request is not pending');
    }

    approval.status = ApprovalStatus.REJECTED;
    approval.rejectionReason = rejectionReason;
    approval.comments = comments || approval.comments;
    await approval.save();

    // Revert document status
    await this.documentModel
      .findByIdAndUpdate(approval.documentId, { $set: { status: DocumentStatus.DRAFT } })
      .exec();

    return approval;
  }

  async getPendingApprovals(companyId: Types.ObjectId): Promise<DocumentApproval[]> {
    return this.approvalModel
      .find({ companyId, status: ApprovalStatus.PENDING })
      .sort({ createdAt: -1 })
      .populate('requestedBy', 'name email')
      .populate({
        path: 'documentId',
        populate: [
          { path: 'ownerUser', select: 'name email' },
          { path: 'approvalUser', select: 'name email' },
        ],
      })
      .exec();
  }

  async getApprovalHistory(companyId: Types.ObjectId): Promise<DocumentApproval[]> {
    return this.approvalModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate({
        path: 'documentId',
        select: 'code name documentType status',
      })
      .exec();
  }

  // ==================== DIGITAL SIGNATURES ====================

  async addSignature(params: {
    companyId: Types.ObjectId;
    documentId: Types.ObjectId;
    userId: Types.ObjectId;
    signerName: string;
    signerEmail?: string;
    signatureHash?: string;
    signatureUrl?: string;
    comments?: string;
    isExecutiveSignature?: boolean;
  }): Promise<DocumentSignature> {
    const signature = await this.signatureModel.create(params);

    await this.historyService.record({
      companyId: params.companyId,
      documentId: params.documentId,
      userId: params.userId,
      action: DocumentHistoryAction.SIGNATURE,
      description: `Signature registered by ${params.signerName}`,
    });

    return signature;
  }

  async getSignatures(documentId: Types.ObjectId): Promise<DocumentSignature[]> {
    return this.signatureModel
      .find({ documentId })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .exec();
  }

  // ==================== MODULE INTEGRATIONS ====================

  async registerDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    description?: string;
    documentType: DocumentType;
    process?: string;
    fileUrl?: string;
    ownerUser?: Types.ObjectId;
    approvalUser?: Types.ObjectId;
    expirationDate?: Date;
    sourceModule?: string;
  }): Promise<DocumentMaster> {
    const doc = await this.create(
      params.companyId,
      {
        code: params.code,
        name: params.name,
        description: params.description,
        documentType: params.documentType,
        process: params.process || params.sourceModule,
        ownerUser: params.ownerUser,
        approvalUser: params.approvalUser,
        expirationDate: params.expirationDate,
      },
      { _id: params.ownerUser || new Types.ObjectId(), email: 'system' },
    );

    if (params.fileUrl) {
      // Create initial version inline instead of calling uploadVersion
      // to avoid version numbering off-by-one
      await this.versionModel.create({
        documentId: doc._id,
        versionNumber: 1,
        fileUrl: params.fileUrl,
        uploadedBy: params.ownerUser,
        uploadDate: new Date(),
        changeDescription: `Initial upload from ${params.sourceModule || 'manual'}`,
        isCurrent: true,
      });
    }

    return doc;
  }

  async registerPolicyDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.POLICY,
      process: 'SG-SST Policy Management',
    });
  }

  async registerObjectiveDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.RECORD,
      process: 'SG-SST Objectives',
    });
  }

  async registerPlanDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.RECORD,
      process: 'Annual Work Plan',
    });
  }

  async registerCopasstDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.COPASST,
      process: 'COPASST Management',
    });
  }

  async registerCommitteeDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.COMMITTEE,
      process: 'Committee Management',
    });
  }

  async registerAuditDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.AUDIT,
      process: 'Audit Management',
    });
  }

  async registerTrainingDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.TRAINING_RECORD,
      process: 'Training Management',
    });
  }

  async registerInspectionDocument(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.INSPECTION,
      process: 'Inspection Management',
    });
  }

  async registerMeetingMinutes(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.MEETING_MINUTES,
      process: 'Meeting Management',
    });
  }

  async registerEmergencyPlan(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
  }): Promise<DocumentMaster> {
    return this.registerDocument({
      ...params,
      documentType: DocumentType.EMERGENCY_PLAN,
      process: 'Emergency Management',
    });
  }

  async registerMedicalRecord(params: {
    companyId: Types.ObjectId;
    code: string;
    name: string;
    fileUrl?: string;
    description?: string;
    ownerUser?: Types.ObjectId;
    expirationDate?: Date;
  }): Promise<DocumentMaster> {
    // Medical records default to 20 year retention
    const twentyYearsLater = new Date();
    twentyYearsLater.setFullYear(twentyYearsLater.getFullYear() + 20);

    return this.registerDocument({
      ...params,
      documentType: DocumentType.MEDICAL_RECORD,
      process: 'Medical Records',
      expirationDate: params.expirationDate || twentyYearsLater,
    });
  }
}
