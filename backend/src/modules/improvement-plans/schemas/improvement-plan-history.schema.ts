import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ImprovementPlanHistoryDocument = HydratedDocument<ImprovementPlanHistory>;

/**
 * E1 (7.1.4) — Historial server-side APPEND-ONLY de los planes de mejoramiento
 * (ImprovementPlanHistory).
 *
 * Patrón: management-improvement-action-history (7.1.2) / incident-history
 * (7.1.3) — timestamps solo createdAt: los eventos históricos nunca se
 * modifican ni se eliminan. El service es la única vía de escritura; el
 * cliente NUNCA envía `history` ni puede alterar eventos mediante endpoints
 * (no existen endpoints de modificación/eliminación de history). Toda lectura
 * es tenant-scoped.
 */
export enum ImprovementPlanHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  ACTIVITY_CREATED = 'ACTIVITY_CREATED',
  ACTIVITY_UPDATED = 'ACTIVITY_UPDATED',
  ACTIVITY_STATUS_CHANGED = 'ACTIVITY_STATUS_CHANGED',
  EVIDENCE_ADDED = 'EVIDENCE_ADDED',
  FOLLOW_UP = 'FOLLOW_UP',
  MONITORING_ADDED = 'MONITORING_ADDED',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'improvementplanhistories',
})
export class ImprovementPlanHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ImprovementPlan', index: true })
  planId!: Types.ObjectId;

  /** activityId (string) de la actividad involucrada, si aplica. */
  @Prop({ trim: true, maxlength: 64 })
  activityId?: string;

  /** monitoringId (string) del seguimiento involucrado, si aplica. */
  @Prop({ trim: true, maxlength: 64 })
  monitoringId?: string;

  /** Snapshot del código del plan en el momento del evento (trazabilidad). */
  @Prop({ trim: true, maxlength: 100 })
  planCode?: string;

  @Prop({ required: true, enum: Object.values(ImprovementPlanHistoryAction) })
  action!: ImprovementPlanHistoryAction;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorUserId?: Types.ObjectId;

  /** Snapshot del actor (email); el historial sobrevive cambios del usuario. */
  @Prop({ required: true, maxlength: 300 })
  actorSnapshot!: string;

  /** Detalles del evento (descripción legible / contexto mínimo). */
  @Prop({ type: Object })
  details?: Record<string, unknown>;

  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;
}

export const ImprovementPlanHistorySchema = SchemaFactory.createForClass(
  ImprovementPlanHistory,
);

ImprovementPlanHistorySchema.index({ companyId: 1, planId: 1, createdAt: -1 });
