import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EvaluationDocument = HydratedDocument<Evaluation>;

@Schema({ timestamps: true })
export class Evaluation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  standard!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, default: false })
  complies!: boolean;

  @Prop({ default: '' })
  observation!: string;
}

export const EvaluationSchema = SchemaFactory.createForClass(Evaluation);
EvaluationSchema.index({ companyId: 1, standard: 1 }, { unique: true });
EvaluationSchema.index({ companyId: 1 });
