import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkerParticipationDocument = HydratedDocument<WorkerParticipation>;

/**
 * Tipos de actividad de participación de trabajadores
 * en la gestión de peligros y riesgos.
 */
export enum ParticipationActivityType {
  HAZARD_IDENTIFICATION = 'HAZARD_IDENTIFICATION',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',
  RISK_VALUATION = 'RISK_VALUATION',
  CONTROL_DECISION = 'CONTROL_DECISION',
  CONTROL_ESTABLISHMENT = 'CONTROL_ESTABLISHMENT',
  OTHER = 'OTHER',
}

/**
 * Estado operativo de una actividad de participación.
 * NO confundir con Approval Workflow.
 */
export enum ParticipationStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class WorkerParticipation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Tipo de actividad de participación */
  @Prop({ required: true, enum: Object.values(ParticipationActivityType) })
  activityType!: ParticipationActivityType;

  /** Fecha en que se realizó la actividad de participación */
  @Prop({ required: true, type: Date })
  participationDate!: Date;

  /** Trabajadores que participaron (referencias a Employee) */
  @Prop({ type: [Types.ObjectId], ref: 'Employee', default: [] })
  participants!: Types.ObjectId[];

  /** Descripción de la actividad de participación */
  @Prop({ required: true, trim: true, maxlength: 2000 })
  description!: string;

  /** Observaciones adicionales */
  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** Referencia opcional al Risk asociado */
  @Prop({ type: Types.ObjectId, ref: 'Risk' })
  riskId?: Types.ObjectId;

  /** Proceso/área donde se realizó la participación */
  @Prop({ trim: true })
  process?: string;

  /** Área específica */
  @Prop({ trim: true })
  area?: string;

  /** Actividad específica */
  @Prop({ trim: true })
  activity?: string;

  /** Estado operativo de la participación */
  @Prop({ required: true, enum: Object.values(ParticipationStatus), default: ParticipationStatus.COMPLETED })
  status!: ParticipationStatus;
}

export const WorkerParticipationSchema = SchemaFactory.createForClass(WorkerParticipation);
WorkerParticipationSchema.index({ companyId: 1, activityType: 1, participationDate: -1 });
WorkerParticipationSchema.index({ companyId: 1, riskId: 1 });
