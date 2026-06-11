import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class CommunicationSurveyResponse {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  companyId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'CommunicationSurvey' })
  surveyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop()
  employeeName?: string;

  @Prop({ type: [{
    questionId: { type: String, required: true },
    answer: { type: String },
    selectedOptions: { type: [String], default: [] },
  }], default: [] })
  answers!: Array<{
    questionId: string;
    answer?: string;
    selectedOptions: string[];
  }>;

  @Prop()
  submittedAt?: string;

  @Prop({ default: false })
  isAnonymous!: boolean;
}

export const CommunicationSurveyResponseSchema = SchemaFactory.createForClass(CommunicationSurveyResponse);
