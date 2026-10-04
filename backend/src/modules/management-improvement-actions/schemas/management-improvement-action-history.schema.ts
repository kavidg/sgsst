import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ManagementImprovementActionHistoryDocument =
  HydratedDocument<ManagementImprovementActionHistory>;

/**
 * E1 (7.1.2) — Historial server-side APPEND-ONLY de las acciones de mejora de
 * la alta dirección (ManagementImprovementActionHistory).
 *
 * Patrón: corrective-preventive-action-history (7.1.1) / timestamps solo
 * createdAt: los eventos históricos nunca se modifican. El service es la única
 * vía de escritura; el cliente NUNCA envía `history` ni puede actualizar o
 * eliminar eventos mediante endpoints.
 */
export enum ManagementImprovementActionHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  EVIDENCE = 'EVIDENCE',
  FOLLOW_UP = 'FOLLOW_UP',
  CLOSURE = 'CLOSURE',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'managementimprovementactionhistories',
})
export class ManagementImprovementActionHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ManagementImprovementAction', index: true })
  actionId!: Types.ObjectId;

  /** Snapshot del actionCode en el momento del evento (trazabilidad). */
  @Prop({ trim: true, maxlength: 100 })
  actionCode?: string;

  @Prop({ required: true, enum: Object.values(ManagementImprovementActionHistoryAction) })
  action!: ManagementImprovementActionHistoryAction;

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

export const ManagementImprovementActionHistorySchema = SchemaFactory.createForClass(
  ManagementImprovementActionHistory,
);

ManagementImprovementActionHistorySchema.index({
  companyId: 1,
  actionId: 1,
  createdAt: -1,
});
