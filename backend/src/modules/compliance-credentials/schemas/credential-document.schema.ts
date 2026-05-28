import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CredentialCourseType } from '../enums/credential.enums';

export type CredentialDocumentDocument = HydratedDocument<CredentialDocument>;

@Schema({ timestamps: true, collection: 'credential_documents' })
export class CredentialDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ComplianceCredential', index: true }) credentialId!: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(CredentialCourseType) }) courseType!: CredentialCourseType;
  @Prop({ required: true }) fileName!: string;
  @Prop({ required: true }) fileUrl!: string;
  @Prop() storagePath?: string;
  @Prop() mimeType?: string;
  @Prop({ default: true }) isActive!: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User' }) uploadedBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy?: Types.ObjectId;
}

export const CredentialDocumentSchema = SchemaFactory.createForClass(CredentialDocument);
CredentialDocumentSchema.index({ companyId: 1, credentialId: 1, isActive: 1 });
