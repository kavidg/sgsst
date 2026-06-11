import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LegalRegulatoryChangeDocument = HydratedDocument<LegalRegulatoryChange>;

export type ChangeType = 'NEW_REGULATION' | 'AMENDMENT' | 'REPEAL' | 'UPDATE';
export type ChangeImpact = 'HIGH' | 'MEDIUM' | 'LOW';

@Schema({ timestamps: true })
export class LegalRegulatoryChange {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: ['NEW_REGULATION', 'AMENDMENT', 'REPEAL', 'UPDATE'] })
  changeType!: ChangeType;

  @Prop({ required: true })
  regulationCode!: string;

  @Prop({ required: true })
  regulationName!: string;

  @Prop()
  previousRegulationCode?: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: ['HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' })
  impact!: ChangeImpact;

  @Prop({ required: true })
  effectiveDate!: Date;

  @Prop({ default: false })
  isReviewed!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ default: false })
  alertGenerated!: boolean;

  @Prop()
  source?: string;

  @Prop()
  url?: string;
}

export const LegalRegulatoryChangeSchema = SchemaFactory.createForClass(LegalRegulatoryChange);

LegalRegulatoryChangeSchema.index({ companyId: 1, effectiveDate: -1 });
LegalRegulatoryChangeSchema.index({ companyId: 1, isReviewed: 1 });
