import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CredentialAlertType } from '../enums/credential.enums';

export type CredentialAlertDocument = HydratedDocument<CredentialAlert>;

@Schema({ timestamps: true, collection: 'credential_alerts' })
export class CredentialAlert {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'ComplianceCredential', index: true }) credentialId?: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(CredentialAlertType), index: true }) type!: CredentialAlertType;
  @Prop({ required: true }) message!: string;
  @Prop({ default: 'warning' }) severity!: 'info' | 'warning' | 'critical';
  @Prop() dueAt?: Date;
  @Prop({ default: false }) generated!: boolean;
  @Prop({ type: [String], default: [] }) targetRoles!: string[];
  @Prop({ default: false }) resolved!: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy?: Types.ObjectId;
}

export const CredentialAlertSchema = SchemaFactory.createForClass(CredentialAlert);
CredentialAlertSchema.index({ companyId: 1, credentialId: 1, type: 1, dueAt: 1 });
