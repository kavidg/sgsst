import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ResponsibleStatus, ResponsibleType } from '../enums/credential.enums';

export type CredentialResponsibleDocument = HydratedDocument<CredentialResponsible>;

@Schema({ timestamps: true, collection: 'credential_responsibles' })
export class CredentialResponsible {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee', index: true }) employeeId!: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(ResponsibleType) }) responsibleType!: ResponsibleType;
  @Prop({ required: true, enum: Object.values(ResponsibleStatus), default: ResponsibleStatus.ACTIVE }) status!: ResponsibleStatus;
  @Prop({ default: '' }) comments!: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy?: Types.ObjectId;
}

export const CredentialResponsibleSchema = SchemaFactory.createForClass(CredentialResponsible);
CredentialResponsibleSchema.index({ companyId: 1, employeeId: 1, responsibleType: 1 }, { unique: true });
