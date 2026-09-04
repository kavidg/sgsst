import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SstEmergenciesDocument = HydratedDocument<SstEmergencies>;

export enum SstEmergenciesComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

@Schema({ _id: false })
export class EmergencyPlan {
  @Prop({ default: '' }) planName!: string;
  @Prop({ default: '' }) version!: string;
  @Prop() effectiveDate?: Date;
  @Prop() expirationDate?: Date;
  @Prop({ default: '' }) approvedBy!: string;
  @Prop() approvedAt?: Date;
  @Prop({ default: '' }) documentUrl!: string;
}

@Schema({ _id: false })
export class Brigade {
  @Prop({ required: true }) brigadeId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: 'Evacuación' }) type!: string;
  @Prop({ default: '' }) leader!: string;
  @Prop({ type: [String], default: [] }) members!: string[];
  @Prop({ default: 'Mensual' }) meetingFrequency!: string;
  @Prop() lastMeetingDate?: Date;
}

@Schema({ _id: false })
export class MeetingPoint {
  @Prop({ required: true }) pointId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: '' }) location!: string;
  @Prop({ default: 0 }) capacity!: number;
  @Prop({ type: [Number], default: [] }) coordinates!: number[];
  @Prop({ default: true }) active!: boolean;
}

@Schema({ _id: false })
export class EvacuationRoute {
  @Prop({ required: true }) routeId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: '' }) floor!: string;
  @Prop({ default: '' }) diagramUrl!: string;
  @Prop({ default: 5 }) estimatedTimeMinutes!: number;
  @Prop({ default: true }) active!: boolean;
}

@Schema({ _id: false })
export class EmergencyEquipment {
  @Prop({ required: true }) equipmentId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: 'General' }) type!: string;
  @Prop({ default: '' }) location!: string;
  @Prop({ default: 1 }) quantity!: number;
  @Prop() lastInspectionDate?: Date;
  @Prop() nextInspectionDate?: Date;
  @Prop({ default: 'OPERATIVO' }) status!: string;
  @Prop({ default: '' }) certificateUrl!: string;
}

@Schema({ _id: false })
export class Drill {
  @Prop({ required: true }) drillId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: 'Evacuación' }) type!: string;
  @Prop({ required: true }) date!: Date;
  @Prop({ default: 0 }) participants!: number;
  @Prop({ default: 0 }) expectedParticipants!: number;
  @Prop({ default: 0 }) durationMinutes!: number;
  @Prop({ default: '' }) results!: string;
  @Prop({ default: '' }) findings!: string;
  @Prop({ default: '' }) improvements!: string;
  @Prop({ type: [String], default: [] }) evidence!: string[];
  @Prop({ default: 'Programado' }) status!: string;
}

@Schema({ _id: false })
export class SstEmergenciesHistoryEntry {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) timestamp!: Date;
  @Prop({ required: true }) userId!: string;
  @Prop({ default: '' }) userName!: string;
  @Prop({ default: '' }) details!: string;
}

/**
 * Entidad principal Emergencias (1.1.10) — UNO por empresa.
 *
 * Contiene:
 * - plan de emergencias
 * - brigadas
 * - puntos de encuentro
 * - rutas de evacuación
 * - equipos
 * - simulacros
 * - historial
 * - estado de cumplimiento
 */
@Schema({ timestamps: false, collection: 'phva_advanced_emergencies' })
export class SstEmergencies {
  @Prop({ required: true, type: Types.ObjectId, index: true }) companyId!: Types.ObjectId;
  @Prop({ default: '1.1.10' }) itemCode!: string;
  @Prop({ default: new Date().getFullYear() }) year!: number;
  @Prop({ default: SstEmergenciesComplianceStatus.PENDING }) complianceStatus!: string;
  @Prop({ default: '' }) complianceReason!: string;

  @Prop({ type: EmergencyPlan, default: () => ({}) }) plan!: EmergencyPlan;
  @Prop({ type: [Brigade], default: [] }) brigades!: Brigade[];
  @Prop({ type: [MeetingPoint], default: [] }) meetingPoints!: MeetingPoint[];
  @Prop({ type: [EvacuationRoute], default: [] }) evacuationRoutes!: EvacuationRoute[];
  @Prop({ type: [EmergencyEquipment], default: [] }) equipment!: EmergencyEquipment[];
  @Prop({ type: [Drill], default: [] }) drills!: Drill[];
  @Prop({ type: [SstEmergenciesHistoryEntry], default: [] }) history!: SstEmergenciesHistoryEntry[];
}

export const SstEmergenciesSchema = SchemaFactory.createForClass(SstEmergencies);
SstEmergenciesSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
