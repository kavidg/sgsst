import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RiskDocument = HydratedDocument<Risk>;

@Schema({ timestamps: true })
export class Risk {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  process!: string;

  @Prop({ required: true })
  activity!: string;

  @Prop({ required: true })
  hazard!: string;

  @Prop({ required: true })
  risk!: string;

  @Prop({ required: true, min: 0 })
  probability!: number;

  @Prop({ required: true, min: 0 })
  consequence!: number;

  @Prop({ required: true, min: 0 })
  riskLevel!: number;

  @Prop({ required: true })
  controlMeasures!: string;
}

export const RiskSchema = SchemaFactory.createForClass(Risk);
RiskSchema.index({ companyId: 1, process: 1, activity: 1 });

function assignRiskLevel(
  this: RiskDocument,
  next: (error?: Error) => void,
) {
  if (typeof this.probability === 'number' && typeof this.consequence === 'number') {
    this.riskLevel = this.probability * this.consequence;
  }

  next();
}

RiskSchema.pre('save', assignRiskLevel);
RiskSchema.pre('findOneAndUpdate', function setRiskLevel(next) {
  const update = this.getUpdate() as Record<string, unknown> | undefined;

  if (!update) {
    next();
    return;
  }

  const currentSet = (update.$set as Record<string, unknown> | undefined) ?? {};

  const probabilityValue =
    typeof currentSet.probability === 'number'
      ? currentSet.probability
      : typeof update.probability === 'number'
        ? update.probability
        : undefined;

  const consequenceValue =
    typeof currentSet.consequence === 'number'
      ? currentSet.consequence
      : typeof update.consequence === 'number'
        ? update.consequence
        : undefined;

  if (probabilityValue === undefined && consequenceValue === undefined) {
    next();
    return;
  }

  this.model
    .findOne(this.getFilter())
    .select('probability consequence')
    .lean()
    .then((existingDoc) => {
      const existing = existingDoc as { probability: number; consequence: number } | null;

      if (!existing) {
        next();
        return;
      }

      const resolvedProbability = probabilityValue ?? existing.probability;
      const resolvedConsequence = consequenceValue ?? existing.consequence;

      this.setUpdate({
        ...update,
        $set: {
          ...currentSet,
          riskLevel: resolvedProbability * resolvedConsequence,
        },
      });

      next();
    })
    .catch((error: Error) => next(error));
});
