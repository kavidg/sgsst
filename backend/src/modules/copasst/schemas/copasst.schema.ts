import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CopasstPeriodDocument = HydratedDocument<CopasstPeriod>;

@Schema({ _id: false })
export class CopasstMember {
  @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true }) userName!: string;
  @Prop({ enum: ['PRESIDENTE', 'SECRETARIO', 'PRINCIPAL', 'SUPLENTE'], required: true }) committeeRole!: string;
  @Prop({ enum: ['EMPLEADOR', 'TRABAJADOR'], required: true }) representationType!: string;
  @Prop({ enum: ['PRINCIPAL', 'SUPLENTE'], required: true }) principalType!: string;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;
  @Prop({ enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' }) status!: string;
}

@Schema({ _id: false })
export class CopasstDocument {
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) content!: string;
  @Prop() pdfUrl?: string;
  @Prop({ default: 1 }) version!: number;
  @Prop({ type: Date, default: Date.now }) generatedAt!: Date;
}

@Schema({ _id: false })
export class CopasstSignature {
  @Prop({ required: true }) documentType!: string;
  @Prop({ required: true }) documentVersion!: number;
  @Prop({ required: true }) signatureImage!: string;
  @Prop({ required: true }) signedBy!: string;
  @Prop({ required: true }) signedAt!: Date;
}

@Schema({ _id: false })
export class CopasstCandidate {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) document!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) area!: string;
  @Prop({ required: true }) position!: string;
  @Prop({ required: true }) motivation!: string;
  @Prop({ required: true }) accepted!: boolean;
  @Prop() photoUrl?: string;
  @Prop({ default: 0 }) votes!: number;
}

@Schema({ _id: false })
export class CopasstVote {
  @Prop({ required: true }) electionId!: string;
  @Prop({ required: true }) document!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) candidateDocument!: string;
  @Prop({ required: true }) otpValidated!: boolean;
  @Prop({ required: true }) votedAt!: Date;
}

@Schema({ _id: false })
export class CopasstMeeting {
  @Prop({ required: true }) meetingDate!: Date;
  @Prop({ enum: ['PROGRAMADA', 'CANCELADA', 'CERRADA'], default: 'PROGRAMADA' }) status!: string;
  @Prop({ type: [String], default: [] }) attendees!: string[];
  @Prop({ default: '' }) agenda!: string;
  @Prop({ default: '' }) development!: string;
  @Prop({ type: [String], default: [] }) commitments!: string[];
}

@Schema({ _id: false })
export class CopasstAuditHistory {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) createdBy!: string;
  @Prop({ required: true }) createdAt!: Date;
  @Prop({ required: true }) data!: string;
}

@Schema({ timestamps: true, collection: 'copasst_periods' })
export class CopasstPeriod {
  @Prop({ type: Types.ObjectId, required: true, index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true }) periodName!: string;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;
  @Prop({ enum: ['ACTIVO', 'PROXIMO_A_VENCER', 'VENCIDO', 'ARCHIVADO'], default: 'ACTIVO' }) status!: string;
  @Prop({ type: [CopasstMember], default: [] }) members!: CopasstMember[];
  @Prop({ type: [CopasstCandidate], default: [] }) candidates!: CopasstCandidate[];
  @Prop({ type: [CopasstVote], default: [] }) votes!: CopasstVote[];
  @Prop({ type: [CopasstMeeting], default: [] }) meetings!: CopasstMeeting[];
  @Prop({ type: [CopasstDocument], default: [] }) documents!: CopasstDocument[];
  @Prop({ type: [CopasstSignature], default: [] }) signatures!: CopasstSignature[];
  @Prop({ type: [CopasstAuditHistory], default: [] }) auditHistory!: CopasstAuditHistory[];
}

export const CopasstPeriodSchema = SchemaFactory.createForClass(CopasstPeriod);
