import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EvaluationDocument = HydratedDocument<Evaluation>;

export enum EvaluationStatus {
  CUMPLE = 'CUMPLE',
  NO_CUMPLE = 'NO_CUMPLE',
  NO_APLICA = 'NO_APLICA',
}

@Schema({ _id: false })
export class ImprovementPlan {
  @Prop()
  activity?: string;

  @Prop()
  responsible?: string;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop()
  observations?: string;
}

@Schema({ timestamps: true })
export class Evaluation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  code!: string;

  @Prop({
    required: true,
    enum: Object.values(EvaluationStatus),
  })
  status!: EvaluationStatus;

  @Prop({ type: [String], default: [] })
  evidence!: string[];

  @Prop({ type: ImprovementPlan })
  improvementPlan?: ImprovementPlan;
}

export const EvaluationSchema = SchemaFactory.createForClass(Evaluation);
EvaluationSchema.index({ companyId: 1, code: 1 }, { unique: true });
EvaluationSchema.index({ companyId: 1 });
