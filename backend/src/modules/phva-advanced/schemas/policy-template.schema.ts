import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PolicyTemplateDocument = HydratedDocument<PolicyTemplate>;

@Schema({ _id: false })
export class SectorAnnualObjective {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  indicator!: string;

  @Prop({ required: true, default: 100 })
  targetValue!: number;

  @Prop({ required: true })
  responsible!: string;

  @Prop()
  description?: string;
}

export const SectorAnnualObjectiveSchema = SchemaFactory.createForClass(SectorAnnualObjective);

@Schema({ timestamps: true })
export class PolicyTemplate {
  @Prop({ required: true, unique: true })
  sector!: string;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ type: [String], default: [] })
  sectorRisks!: string[];

  @Prop({ type: [String], default: [] })
  sectorCommitments!: string[];

  @Prop({ type: [String], default: [] })
  legalReferences!: string[];

  @Prop({ type: [String], default: [] })
  recommendedResponsibilities!: string[];

  @Prop({ type: [SectorAnnualObjectiveSchema], default: [] })
  suggestedAnnualObjectives!: SectorAnnualObjective[];

  @Prop({ default: 0 })
  version!: number;

  @Prop()
  lastUpdatedBy?: Types.ObjectId;

  @Prop({ default: 'Sistema' })
  updatedByName?: string;
}

export const PolicyTemplateSchema = SchemaFactory.createForClass(PolicyTemplate);
PolicyTemplateSchema.index({ sector: 1 }, { unique: true });
