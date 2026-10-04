import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ManagementReviewDirectionHistoryDocument = HydratedDocument<ManagementReviewDirectionHistory>;

/**
 * E1 (6.1.3) — Historial server-side APPEND-ONLY de la revisión por la
 * dirección.
 *
 * Patrón: annual-audit-history.schema.ts (timestamps solo createdAt; nunca
 * updatedAt — los eventos históricos no se modifican). El service es la única
 * vía de escritura; el frontend NUNCA envía `history`.
 */
export enum ManagementReviewDirectionHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  INPUT_CREATED = 'INPUT_CREATED',
  INPUT_UPDATED = 'INPUT_UPDATED',
  DECISION_CREATED = 'DECISION_CREATED',
  DECISION_UPDATED = 'DECISION_UPDATED',
  EVIDENCE_ATTACHED = 'EVIDENCE_ATTACHED',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'managementreviewdirectionhistories',
})
export class ManagementReviewDirectionHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ManagementReviewDirection' })
  reviewId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  userEmail!: string;

  @Prop({ required: true, enum: Object.values(ManagementReviewDirectionHistoryAction) })
  action!: ManagementReviewDirectionHistoryAction;

  @Prop({ trim: true })
  comment?: string;

  @Prop({ type: Object })
  previousValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;
}

export const ManagementReviewDirectionHistorySchema = SchemaFactory.createForClass(
  ManagementReviewDirectionHistory,
);

ManagementReviewDirectionHistorySchema.index({ companyId: 1, reviewId: 1, createdAt: -1 });
