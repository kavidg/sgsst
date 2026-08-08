import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PhvaAdvancedResponsableSstDocument = HydratedDocument<PhvaAdvancedResponsableSst>;

export enum ResponsableSstComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

export enum ResponsableSstDocumentType {
  DIPLOMA = 'DIPLOMA',
  FIFTY_HOUR_CERTIFICATE = 'FIFTY_HOUR_CERTIFICATE',
  TWENTY_HOUR_UPDATE_CERTIFICATE = 'TWENTY_HOUR_UPDATE_CERTIFICATE',
  SST_LICENSE_PDF = 'SST_LICENSE_PDF',
  SST_LICENSE_SCANNED = 'SST_LICENSE_SCANNED',
  SST_LICENSE_RESOLUTION = 'SST_LICENSE_RESOLUTION',
  SST_LICENSE_SUPPORTING = 'SST_LICENSE_SUPPORTING',
  /** Fase 8.3.C — documento/acto en el que consta la designación del responsable. */
  DESIGNATION = 'DESIGNATION',
}

/**
 * Estado de aprobación del punto PHVA 1.1.1 (Responsable del SG-SST).
 *
 * Fase 2 — el flujo de aprobación del Responsable del SG-SST se delega al
 * Approval Workflow Core; este estado local se conserva para compatibilidad
 * con el frontend y para el handler del adapter (mapStatus).
 *
 * APPROVED_AND_SIGNED es un estado compuesto de negocio (aprobado y firmado
 * por el representante legal) que se mapea al APPROVED canónico del motor.
 */
export enum ResponsableSstApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  APPROVED_AND_SIGNED = 'APPROVED_AND_SIGNED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

@Schema({ _id: false })
export class ResponsableSstStoredDocument {
  @Prop({ required: true, enum: Object.values(ResponsableSstDocumentType) })
  type!: ResponsableSstDocumentType;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop()
  detectedDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop()
  uploadedAt?: Date;
}

@Schema({ _id: false })
export class ResponsableSstOcrEntry {
  @Prop()
  detectedLicenseNumber?: string;

  @Prop()
  detectedIssueDate?: Date;

  @Prop()
  detectedExpirationDate?: Date;

  @Prop()
  detectedIssuingAuthority?: string;

  @Prop()
  detectedLicenseHolder?: string;

  @Prop()
  modifiedLicenseNumber?: string;

  @Prop()
  modifiedIssueDate?: Date;

  @Prop()
  modifiedExpirationDate?: Date;

  @Prop()
  modifiedIssuingAuthority?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  modifiedBy?: Types.ObjectId;

  @Prop()
  modifiedAt?: Date;

  @Prop({ default: false })
  hasManualModification!: boolean;

  @Prop()
  documentId?: string;

  @Prop()
  sourceFileName?: string;

  @Prop()
  rawOcrText?: string;

  @Prop({ default: 0 })
  confidence!: number;
}

@Schema({ _id: false })
export class ResponsableSstApprovalActor {
  @Prop({ required: true })
  userId!: string;
  @Prop({ required: true })
  email!: string;
  @Prop()
  role?: string;
  @Prop()
  companyId?: string;
  @Prop({ required: true })
  timestamp!: string;
}

@Schema({ _id: false })
export class ResponsableSstAuditEntry {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop()
  userEmail?: string;

  @Prop({ required: true })
  changedAt!: Date;

  @Prop({ required: true })
  field!: string;

  @Prop()
  oldValue?: string;

  @Prop()
  newValue?: string;

  @Prop()
  warning?: string;
}

@Schema({ _id: false })
export class ResponsableSstAlertEntry {
  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop({ required: true })
  dueAt!: Date;

  @Prop({ default: false })
  generated!: boolean;
}

/**
 * Snapshot inmutable de los datos relevantes del Responsable del SG-SST
 * (PHVA 1.1.1).
 *
 * Fase B — versionado estructurado: cada versión conserva una copia
 * independiente (sin referencias al registro vivo) para garantizar la
 * inmutabilidad histórica del contenido aprobado.
 */
@Schema({ _id: false })
export class ResponsableSstVersionSnapshot {
  @Prop({ default: '' })
  fullName!: string;

  @Prop({ default: '' })
  documentNumber!: string;

  @Prop({ default: '' })
  position!: string;

  @Prop({ default: '' })
  profession!: string;

  @Prop({ default: '' })
  sstProfessionalType!: string;

  @Prop({ default: '' })
  sstLicenseNumber!: string;

  @Prop({ default: '' })
  licenseType!: string;

  @Prop({ default: '' })
  issuingAuthority!: string;

  @Prop({ default: '' })
  department!: string;

  @Prop({ default: '' })
  observations!: string;

  @Prop()
  licenseIssueDate?: Date;

  @Prop()
  licenseExpiresAt?: Date;

  @Prop({ default: '' })
  licenseStatus!: string;

  @Prop()
  course50HoursDate?: Date;

  @Prop()
  course50HoursDetectedDate?: Date;

  @Prop()
  course20HoursDate?: Date;

  @Prop({ default: false })
  requires20HourUpdate!: boolean;

  // === Designación del Responsable SG-SST (Fase 8.3.C) ===
  // Datos del acto/documento mediante el cual se designa al responsable. La
  // evidencia (DESIGNATION) vive en documents[], igual que las demás.
  @Prop()
  designationDate?: Date;

  @Prop({ default: '' })
  designationNumber!: string;

  @Prop({ default: '' })
  designationIssuerName!: string;

  @Prop({ default: '' })
  designationIssuerPosition!: string;

  @Prop({ type: [ResponsableSstStoredDocument], default: [] })
  documents!: ResponsableSstStoredDocument[];

  @Prop({ type: [ResponsableSstOcrEntry], default: [] })
  licenseOcrEntries!: ResponsableSstOcrEntry[];
}

/**
 * Versión estructurada del Responsable del SG-SST (PHVA 1.1.1).
 *
 * Fase B — patrón consistente con PolicyVersion (2.1.1): cada entrada
 * representa un snapshot inmutable del contenido en un momento del ciclo de
 * aprobación (SUBMIT/RESUBMIT). La metadata (approvalStatus, approvedAt,
 * rejectionReason) refleja el ciclo de vida de esa versión.
 */
@Schema({ _id: false })
export class ResponsableSstVersion {
  @Prop({ required: true })
  version!: string;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdByEmail?: string;

  @Prop({ required: true, enum: ['SUBMIT', 'RESUBMIT'] })
  reason!: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ type: ResponsableSstVersionSnapshot, required: true })
  snapshot!: ResponsableSstVersionSnapshot;

  @Prop({ required: true, enum: Object.values(ResponsableSstApprovalStatus) })
  approvalStatus!: string;

  @Prop()
  rejectionReason?: string;

  @Prop()
  submittedAt?: Date;

  @Prop()
  approvedAt?: Date;
}

@Schema({ timestamps: true })
export class PhvaAdvancedResponsableSst {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, default: '1.1.1' })
  itemCode!: string;

  @Prop({ default: '' })
  fullName!: string;

  @Prop({ default: '' })
  documentNumber!: string;

  @Prop({ default: '' })
  position!: string;

  @Prop({ default: '' })
  profession!: string;

  @Prop({ default: '' })
  sstProfessionalType!: string;

  @Prop({ default: '' })
  sstLicenseNumber!: string;

  @Prop({ default: '' })
  licenseType!: string;

  @Prop({ default: '' })
  issuingAuthority!: string;

  @Prop({ default: '' })
  department!: string;

  @Prop({ default: '' })
  observations!: string;

  @Prop()
  licenseIssueDate?: Date;

  @Prop()
  licenseExpiresAt?: Date;

  @Prop({ default: 'Pendiente' })
  licenseStatus!: string;

  @Prop({ type: [ResponsableSstOcrEntry], default: [] })
  licenseOcrEntries!: ResponsableSstOcrEntry[];

  @Prop()
  course50HoursDate?: Date;

  @Prop()
  course50HoursDetectedDate?: Date;

  @Prop()
  course20HoursDate?: Date;

  @Prop({ default: false })
  requires20HourUpdate!: boolean;

  // === Designación del Responsable SG-SST (Fase 8.3.C) ===
  @Prop()
  designationDate?: Date;

  @Prop({ default: '' })
  designationNumber!: string;

  @Prop({ default: '' })
  designationIssuerName!: string;

  @Prop({ default: '' })
  designationIssuerPosition!: string;

  @Prop({ type: [ResponsableSstStoredDocument], default: [] })
  documents!: ResponsableSstStoredDocument[];

  @Prop({ type: [ResponsableSstAlertEntry], default: [] })
  alerts!: ResponsableSstAlertEntry[];

  @Prop({ type: [ResponsableSstAuditEntry], default: [] })
  auditHistory!: ResponsableSstAuditEntry[];

  @Prop({ required: true, enum: Object.values(ResponsableSstComplianceStatus), default: ResponsableSstComplianceStatus.PENDING })
  complianceStatus!: ResponsableSstComplianceStatus;

  @Prop({ default: 'Pendiente por completar la gestión avanzada.' })
  complianceReason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  // === Approval workflow fields (Fase 2) ===
  @Prop({ enum: ResponsableSstApprovalStatus, default: ResponsableSstApprovalStatus.DRAFT })
  approvalStatus!: ResponsableSstApprovalStatus;

  @Prop({ default: false })
  locked!: boolean;

  @Prop({ default: '' })
  rejectionReason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  submittedBy?: Types.ObjectId;

  @Prop()
  submittedAt?: Date;

  @Prop({ type: ResponsableSstApprovalActor })
  approvedBy?: ResponsableSstApprovalActor;

  @Prop({ type: ResponsableSstApprovalActor })
  rejectedBy?: ResponsableSstApprovalActor;

  @Prop({ default: '1.0' })
  currentVersion!: string;

  @Prop({ default: '' })
  assignedReviewer!: string;

  // === Versionado estructurado (Fase B) ===
  // Snapshot inmutables del contenido en cada ciclo de aprobación (SUBMIT /
  // RESUBMIT). La metadata de cada entrada refleja el ciclo de vida de esa
  // versión (PENDING_APPROVAL → APPROVED/REJECTED).
  @Prop({ type: [ResponsableSstVersion], default: [] })
  versions!: ResponsableSstVersion[];
}

export const PhvaAdvancedResponsableSstSchema = SchemaFactory.createForClass(PhvaAdvancedResponsableSst);
PhvaAdvancedResponsableSstSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
