import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnnualAuditHistoryDocument = HydratedDocument<AnnualAuditHistory>;

/**
 * E1 (6.1.2) — Historial server-side APPEND-ONLY de la auditoría anual.
 *
 * Patrón: accountability-history.schema.ts (timestamps solo createdAt;
 * nunca updatedAt — los eventos históricos no se modifican). El service es
 * la única vía de escritura; el frontend NUNCA envía `history`.
 */
export enum AnnualAuditHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  FINDING_CREATED = 'FINDING_CREATED',
  FINDING_UPDATED = 'FINDING_UPDATED',
  ACTION_CREATED = 'ACTION_CREATED',
  ACTION_UPDATED = 'ACTION_UPDATED',
  EVIDENCE_ATTACHED = 'EVIDENCE_ATTACHED',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'annualaudithistories' })
export class AnnualAuditHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'AnnualAudit' })
  auditId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  userEmail!: string;

  @Prop({ required: true, enum: Object.values(AnnualAuditHistoryAction) })
  action!: AnnualAuditHistoryAction;

  @Prop({ trim: true })
  comment?: string;

  @Prop({ type: Object })
  previousValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;
}

export const AnnualAuditHistorySchema = SchemaFactory.createForClass(AnnualAuditHistory);

AnnualAuditHistorySchema.index({ companyId: 1, auditId: 1, createdAt: -1 });
