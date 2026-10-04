import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IncidentHistoryDocument = HydratedDocument<IncidentHistory>;

/**
 * E1 (7.1.3) — Historial server-side APPEND-ONLY de las operaciones de
 * gestión avanzada sobre los casos accidentales del dominio incidents
 * (estándar 7.1.3 — Acciones por accidentes).
 *
 * Patrón: management-improvement-action-history (7.1.2) / timestamps solo
 * createdAt: los eventos históricos nunca se modifican ni se eliminan. El
 * service es la única vía de escritura; el cliente NUNCA envía `history` ni
 * puede alterar eventos mediante endpoints (no existen endpoints de
 * modificación/eliminación de history). Toda lectura es tenant-scoped.
 *
 * NOTA (E1): aplica a las operaciones de gestión avanzada 7.1.3 (investigación
 * causas/equipo, acciones, evidencia estructurada, follow-up, lifecycle,
 * cierre documentado). El CRUD básico de accidentalidad 3.2.1 no genera
 * history para no alterar su comportamiento actual.
 */
export enum IncidentHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  INVESTIGATION_STARTED = 'INVESTIGATION_STARTED',
  INVESTIGATION_UPDATED = 'INVESTIGATION_UPDATED',
  ACTION_CREATED = 'ACTION_CREATED',
  ACTION_UPDATED = 'ACTION_UPDATED',
  ACTION_STATUS_CHANGED = 'ACTION_STATUS_CHANGED',
  EVIDENCE_ADDED = 'EVIDENCE_ADDED',
  FOLLOW_UP = 'FOLLOW_UP',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'incidenthistories',
})
export class IncidentHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Incident', index: true })
  incidentId!: Types.ObjectId;

  /** actionId (string) de la acción involucrada, si aplica. */
  @Prop({ trim: true, maxlength: 64 })
  actionId?: string;

  /** Snapshot del tipo de caso accidental (ACCIDENT/INCIDENTE/DISEASE). */
  @Prop({ trim: true, maxlength: 40 })
  incidentTypeSnapshot?: string;

  @Prop({ required: true, enum: Object.values(IncidentHistoryAction) })
  action!: IncidentHistoryAction;

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

export const IncidentHistorySchema = SchemaFactory.createForClass(IncidentHistory);

IncidentHistorySchema.index({ companyId: 1, incidentId: 1, createdAt: -1 });
