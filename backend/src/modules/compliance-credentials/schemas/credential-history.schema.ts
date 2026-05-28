import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CredentialHistoryAction } from '../enums/credential.enums';

export type CredentialHistoryDocument = HydratedDocument<CredentialHistory>;

@Schema({ timestamps: true, collection: 'credential_history' })
export class CredentialHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'ComplianceCredential', index: true }) credentialId?: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(CredentialHistoryAction) }) action!: CredentialHistoryAction;
  @Prop({ required: true }) field!: string;
  @Prop() oldValue?: string;
  @Prop() newValue?: string;
  @Prop() details?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy?: Types.ObjectId;
}

export const CredentialHistorySchema = SchemaFactory.createForClass(CredentialHistory);
CredentialHistorySchema.index({ companyId: 1, credentialId: 1, createdAt: -1 });
