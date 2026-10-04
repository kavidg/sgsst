import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CopasstAuditPlanningHistoryDocument = HydratedDocument<CopasstAuditPlanningHistory>;

/**
 * E1 (6.1.4) — Historial server-side APPEND-ONLY de la planificación de
 * auditorías COPASST.
 *
 * Patrón: annual-audit-history / management-review-direction-history
 * (timestamps solo createdAt; los eventos históricos nunca se modifican).
 * El service es la única vía de escritura; el cliente NUNCA envía `history`.
 * NO se reutiliza CopasstPeriod.auditHistory (log interno de otro dominio):
 * la trazabilidad de la planificación de auditorías es independiente.
 */
export enum CopasstAuditPlanningHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  ITEM_CREATED = 'ITEM_CREATED',
  ITEM_UPDATED = 'ITEM_UPDATED',
  ITEM_STATUS_CHANGE = 'ITEM_STATUS_CHANGE',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'copasstauditplanninghistories',
})
export class CopasstAuditPlanningHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'CopasstAuditPlanning', index: true })
  planningId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  /** Snapshot del actor (email); el historial sobrevive cambios del usuario. */
  @Prop({ required: true })
  userEmail!: string;

  @Prop({ required: true, enum: Object.values(CopasstAuditPlanningHistoryAction) })
  action!: CopasstAuditPlanningHistoryAction;

  /** Item afectado (para ITEM_*); null en eventos de la planificación. */
  @Prop({ type: Types.ObjectId })
  itemId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500 })
  comment?: string;

  @Prop({ type: Object })
  previousValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;
}

export const CopasstAuditPlanningHistorySchema = SchemaFactory.createForClass(
  CopasstAuditPlanningHistory,
);

CopasstAuditPlanningHistorySchema.index({ companyId: 1, planningId: 1, createdAt: -1 });
