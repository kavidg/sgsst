import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DocumentType } from './document-master.schema';

export type RetentionRuleDocument = HydratedDocument<RetentionRule>;

@Schema({ timestamps: true })
export class RetentionRule {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(DocumentType) })
  documentType!: DocumentType;

  @Prop({ required: true, min: 0 })
  retentionYears!: number;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RetentionRuleSchema = SchemaFactory.createForClass(RetentionRule);

RetentionRuleSchema.index({ companyId: 1, documentType: 1 }, { unique: true });
