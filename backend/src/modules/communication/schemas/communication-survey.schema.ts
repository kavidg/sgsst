import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'OPEN_TEXT';
export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

@Schema({ timestamps: true })
export class CommunicationSurvey {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  companyId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ enum: ['DRAFT','ACTIVE','CLOSED'], default: 'DRAFT' })
  status!: SurveyStatus;

  @Prop({ type: [{
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    questionType: { type: String, enum: ['SINGLE_CHOICE','MULTIPLE_CHOICE','OPEN_TEXT'], required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
  }], default: [] })
  questions!: Array<{
    questionId: string;
    questionText: string;
    questionType: QuestionType;
    options: string[];
    required: boolean;
  }>;

  @Prop({ type: Types.ObjectId, ref: 'Communication' })
  communicationId?: Types.ObjectId;

  @Prop()
  startDate?: string;

  @Prop()
  endDate?: string;

  @Prop({ default: 0 })
  totalResponses!: number;

  @Prop({ default: 0 })
  totalInvited!: number;
}

export const CommunicationSurveySchema = SchemaFactory.createForClass(CommunicationSurvey);
