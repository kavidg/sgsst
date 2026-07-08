import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SocializationSessionDocument = HydratedDocument<SocializationSession>;

export enum SocializationStatus {
  PENDING = 'SOCIALIZATION_PENDING',
  IN_PROGRESS = 'SOCIALIZATION_IN_PROGRESS',
  SOCIALIZED = 'SOCIALIZED',
  COMPLIANT = 'COMPLIANT',
}

export enum TargetAudienceType {
  ALL = 'ALL_EMPLOYEES',
  DEPARTMENT = 'BY_DEPARTMENT',
  POSITION = 'BY_POSITION',
  SELECTED = 'SELECTED_EMPLOYEES',
}

@Schema({ timestamps: true })
export class SocializationSession {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PhvaAdvancedResponsibilities' })
  responsibilitiesDocId?: Types.ObjectId;

  @Prop({ required: true, default: '1.1.2' })
  itemCode!: string;

  @Prop({ required: true, default: '1.0' })
  documentVersion!: string;

  @Prop({ required: true, enum: Object.values(SocializationStatus), default: SocializationStatus.PENDING })
  status!: string;

  // Socialization configuration
  @Prop()
  startDate?: Date;

  @Prop()
  deadline?: Date;

  @Prop()
  responsibleName?: string;

  @Prop({ required: true, type: String, enum: Object.values(TargetAudienceType), default: TargetAudienceType.ALL })
  targetAudienceType!: string;

  @Prop({ type: [String], default: [] })
  targetDepartments!: string[];

  @Prop({ type: [String], default: [] })
  targetPositions!: string[];

  @Prop({ type: [Types.ObjectId], ref: 'Employee', default: [] })
  selectedEmployees!: Types.ObjectId[];

  // Presentation
  @Prop({ type: Types.ObjectId, ref: 'SocializationPresentation' })
  currentPresentationId?: Types.ObjectId;

  @Prop({ default: false })
  presentationUploaded!: boolean;

  // Statistics
  @Prop({ default: 0 })
  totalParticipants!: number;

  @Prop({ default: 0 })
  completedParticipants!: number;

  @Prop({ default: 0 })
  signedParticipants!: number;

  // Compliance
  @Prop({ default: false })
  isCompliant!: boolean;

  @Prop()
  completedAt?: Date;

  @Prop()
  socializedAt?: Date;
}

export const SocializationSessionSchema = SchemaFactory.createForClass(SocializationSession);
SocializationSessionSchema.index({ companyId: 1, itemCode: 1 });
