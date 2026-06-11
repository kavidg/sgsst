import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LegalRegulationTemplateDocument = HydratedDocument<LegalRegulationTemplate>;

@Schema({ timestamps: true })
export class LegalRegulationTemplate {
  @Prop({ required: true, index: true })
  sector!: string;

  @Prop({ required: true })
  regulationCode!: string;

  @Prop({ required: true })
  regulationName!: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const LegalRegulationTemplateSchema = SchemaFactory.createForClass(LegalRegulationTemplate);

// Compound index to prevent duplicate regulations per sector
LegalRegulationTemplateSchema.index({ sector: 1, regulationCode: 1 }, { unique: true });
