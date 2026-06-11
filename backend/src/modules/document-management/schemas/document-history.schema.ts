import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DocumentHistoryDocument = HydratedDocument<DocumentHistory>;

export enum DocumentHistoryAction {
  CREATE = 'CREATE',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
  VERSION_CHANGE = 'VERSION_CHANGE',
  APPROVAL = 'APPROVAL',
  SIGNATURE = 'SIGNATURE',
  ARCHIVE = 'ARCHIVE',
  RESTORE = 'RESTORE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  DOWNLOAD = 'DOWNLOAD',
  REPLACEMENT = 'REPLACEMENT',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class DocumentHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'DocumentMaster', index: true })
  documentId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(DocumentHistoryAction) })
  action!: DocumentHistoryAction;

  @Prop({ type: MongooseSchema.Types.Mixed })
  previousValue?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  newValue?: Record<string, unknown>;

  @Prop()
  description?: string;

  createdAt!: Date;
}

export const DocumentHistorySchema = SchemaFactory.createForClass(DocumentHistory);

DocumentHistorySchema.index({ companyId: 1, documentId: 1, createdAt: -1 });
DocumentHistorySchema.index({ companyId: 1, userId: 1 });
DocumentHistorySchema.index({ companyId: 1, action: 1 });
