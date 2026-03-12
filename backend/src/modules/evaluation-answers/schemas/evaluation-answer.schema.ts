import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EvaluationAnswerDocument = HydratedDocument<EvaluationAnswer>;

@Schema({ timestamps: true })
export class EvaluationAnswer {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Evaluation' })
  evaluationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Question' })
  questionId!: Types.ObjectId;

  @Prop({ required: true })
  answer!: boolean;

  @Prop({ required: true, min: 0 })
  score!: number;

  @Prop({ default: '' })
  observation!: string;

  createdAt!: Date;
}

export const EvaluationAnswerSchema = SchemaFactory.createForClass(EvaluationAnswer);

EvaluationAnswerSchema.index({ evaluationId: 1, questionId: 1 }, { unique: true });
EvaluationAnswerSchema.index({ evaluationId: 1 });
