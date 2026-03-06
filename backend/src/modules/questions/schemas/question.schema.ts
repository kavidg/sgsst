import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type QuestionDocument = HydratedDocument<Question>;

@Schema({ timestamps: true })
export class Question {
  @Prop({ required: true, trim: true, unique: true })
  code!: string;

  @Prop({ required: true, trim: true })
  question!: string;

  @Prop({ required: true, trim: true })
  category!: string;

  @Prop({ required: true, min: 0 })
  maxScore!: number;

  @Prop({ required: true, min: 0 })
  order!: number;

  @Prop({ default: true })
  active!: boolean;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

QuestionSchema.index({ category: 1, order: 1 });
