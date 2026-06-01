import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SstPolicyDocument = HydratedDocument<SstPolicy>;

export enum SstPolicyStatus {
  DRAFT = 'Borrador',
  PENDING_APPROVAL = 'Pendiente aprobación',
  APPROVED = 'Aprobado',
  EXPIRED = 'Vencido',
  ARCHIVED = 'Archivado',
}

export enum PolicySignatureStatus {
  PENDING = 'Pendiente firma',
  SIGNED = 'Firmado',
  REJECTED = 'Rechazado',
}

export enum PolicySocializationStatus {
  PENDING = 'Pendiente',
  READ = 'Leído',
  DIGITALLY_SIGNED = 'Firmado digitalmente',
}

@Schema({ _id: false })
export class PolicyVersion {
  @Prop({ required: true })
  version!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ required: true, enum: Object.values(SstPolicyStatus), default: SstPolicyStatus.DRAFT })
  status!: SstPolicyStatus;

  @Prop()
  issuedAt?: Date;

  @Prop()
  approvedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ default: false })
  archived!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;
}

export const PolicyVersionSchema = SchemaFactory.createForClass(PolicyVersion);

@Schema({ _id: false })
export class PolicySignature {
  @Prop({ required: true })
  role!: string;

  @Prop({ required: true })
  signerName!: string;

  @Prop({ required: true })
  signerEmail!: string;

  @Prop({ required: true, default: true })
  required!: boolean;

  @Prop({ required: true, enum: Object.values(PolicySignatureStatus), default: PolicySignatureStatus.PENDING })
  status!: PolicySignatureStatus;

  @Prop()
  signedAt?: Date;

  @Prop()
  evidence?: string;

  @Prop()
  rejectionReason?: string;
}

export const PolicySignatureSchema = SchemaFactory.createForClass(PolicySignature);

@Schema({ _id: false })
export class PolicySocialization {
  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  employeeId?: Types.ObjectId;

  @Prop({ required: true })
  employeeName!: string;

  @Prop()
  area?: string;

  @Prop({ required: true, enum: Object.values(PolicySocializationStatus), default: PolicySocializationStatus.PENDING })
  status!: PolicySocializationStatus;

  @Prop()
  readAt?: Date;

  @Prop()
  signedAt?: Date;

  @Prop()
  evidence?: string;
}

export const PolicySocializationSchema = SchemaFactory.createForClass(PolicySocialization);

@Schema({ _id: false })
export class PolicyAlert {
  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ required: true })
  recipients!: string[];

  @Prop({ required: true })
  dueAt!: Date;

  @Prop({ default: false })
  generated!: boolean;
}

export const PolicyAlertSchema = SchemaFactory.createForClass(PolicyAlert);

@Schema({ _id: false })
export class PolicyHistory {
  @Prop()
  userId?: string;

  @Prop()
  userEmail?: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true, default: Date.now })
  date!: Date;

  @Prop()
  previousValue?: string;

  @Prop()
  newValue?: string;
}

export const PolicyHistorySchema = SchemaFactory.createForClass(PolicyHistory);

@Schema({ timestamps: true })
export class SstPolicy {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, default: '2.1.1' })
  itemCode!: string;

  @Prop({ required: true })
  documentCode!: string;

  @Prop({ required: true, default: 'Política de Seguridad y Salud en el Trabajo' })
  documentName!: string;

  @Prop({ required: true, default: '1.0' })
  currentVersion!: string;

  @Prop({ required: true, enum: Object.values(SstPolicyStatus), default: SstPolicyStatus.DRAFT })
  status!: SstPolicyStatus;

  @Prop()
  content?: string;

  @Prop({ type: [PolicyVersionSchema], default: [] })
  versions!: PolicyVersion[];

  @Prop({ type: [PolicySignatureSchema], default: [] })
  signatures!: PolicySignature[];

  @Prop({ type: [PolicySocializationSchema], default: [] })
  socializations!: PolicySocialization[];

  @Prop({ type: [PolicyAlertSchema], default: [] })
  alerts!: PolicyAlert[];

  @Prop({ type: [PolicyHistorySchema], default: [] })
  history!: PolicyHistory[];

  @Prop({ required: true, default: 'NON_COMPLIANT' })
  complianceStatus!: 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT';

  @Prop({ default: 'No existe política SST aprobada, firmada, socializada y vigente.' })
  complianceReason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const SstPolicySchema = SchemaFactory.createForClass(SstPolicy);
SstPolicySchema.index({ companyId: 1, documentCode: 1 }, { unique: true });
SstPolicySchema.index({ companyId: 1, itemCode: 1 });
