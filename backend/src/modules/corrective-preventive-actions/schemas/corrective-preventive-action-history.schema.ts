import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CorrectivePreventiveActionHistoryDocument =
  HydratedDocument<CorrectivePreventiveActionHistory>;

/**
 * E1 (7.1.1) — Historial server-side APPEND-ONLY de las acciones preventivas
 * y correctivas (CorrectivePreventiveActionHistory).
 *
 * Patrón: copasst-audit-planning-history / annual-audit-history
 * (timestamps solo createdAt; los eventos históricos nunca se modifican).
 * El service es la única vía de escritura; el cliente NUNCA envía `history`
 * ni puede actualizar/eliminar eventos mediante endpoints.
 */
export enum CorrectivePreventiveActionHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  EVIDENCE = 'EVIDENCE',
  EFFECTIVENESS = 'EFFECTIVENESS',
  CLOSURE = 'CLOSURE',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'correctivepreventiveactionhistories',
})
export class CorrectivePreventiveActionHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'CorrectivePreventiveAction', index: true })
  actionId!: Types.ObjectId;

  /** Snapshot del actionCode en el momento del evento (trazabilidad). */
  @Prop({ trim: true, maxlength: 100 })
  actionCode?: string;

  @Prop({ required: true, enum: Object.values(CorrectivePreventiveActionHistoryAction) })
  action!: CorrectivePreventiveActionHistoryAction;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorUserId?: Types.ObjectId;

  /** Snapshot del actor (email); el historial sobrevive cambios del usuario. */
  @Prop({ required: true, maxlength: 300 })
  actorSnapshot!: string;

  /** Detalles del evento (descripción legible / contexto). */
  @Prop({ type: Object })
  details?: Record<string, unknown>;

  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;
}

export const CorrectivePreventiveActionHistorySchema = SchemaFactory.createForClass(
  CorrectivePreventiveActionHistory,
);

CorrectivePreventiveActionHistorySchema.index({ companyId: 1, actionId: 1, createdAt: -1 });
