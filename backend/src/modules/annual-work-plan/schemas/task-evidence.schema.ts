import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TaskEvidenceDocument = HydratedDocument<TaskEvidence>;

@Schema({ timestamps: true })
export class TaskEvidence {
  @Prop({ required: true, type: Types.ObjectId, ref: 'PlanTask' })
  taskId!: Types.ObjectId;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop({ required: true })
  fileType!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  uploadDate!: Date;
}

export const TaskEvidenceSchema = SchemaFactory.createForClass(TaskEvidence);

TaskEvidenceSchema.index({ taskId: 1 });
