import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CommitteeType } from '../dto/committee.dto';

export type CommitteePeriodDocument = HydratedDocument<CommitteePeriod>;

@Schema({ _id: false })
class CommitteeMember { @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId; @Prop({ required: true }) userName!: string; @Prop({ required: true }) committeeRole!: string; @Prop({ required: true }) representationType!: string; @Prop({ required: true }) principalType!: string; @Prop({ required: true }) startDate!: Date; @Prop({ required: true }) endDate!: Date; @Prop({ enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' }) status!: string; }
@Schema({ _id: false }) class CommitteeCandidate { @Prop({ required: true }) name!: string; @Prop({ required: true }) document!: string; @Prop({ required: true }) phone!: string; @Prop({ required: true }) area!: string; @Prop({ required: true }) position!: string; @Prop({ required: true }) motivation!: string; @Prop({ required: true }) accepted!: boolean; @Prop() photoUrl?: string; @Prop({ default: 0 }) votes!: number; }
@Schema({ _id: false }) class CommitteeVote { @Prop({ required: true }) electionId!: string; @Prop({ required: true }) document!: string; @Prop({ required: true }) phone!: string; @Prop({ required: true }) candidateDocument!: string; @Prop({ required: true }) otpValidated!: boolean; @Prop({ required: true }) votedAt!: Date; }
@Schema({ _id: false }) class CommitteeAuditHistory { @Prop({ required: true }) action!: string; @Prop({ required: true }) createdBy!: string; @Prop({ required: true }) createdAt!: Date; @Prop({ required: true }) data!: string; }

@Schema({ timestamps: true, collection: 'committee_periods' })
export class CommitteePeriod {
  @Prop({ type: Types.ObjectId, required: true, index: true }) companyId!: Types.ObjectId;
  @Prop({ enum: ['COPASST', 'CONVIVENCIA', 'BRIGADA', 'OTHER'], required: true }) committeeType!: CommitteeType;
  @Prop({ required: true }) periodName!: string;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;
  @Prop({ enum: ['ACTIVO', 'PROXIMO_A_VENCER', 'VENCIDO', 'ARCHIVADO'], default: 'ACTIVO' }) status!: string;
  @Prop({ type: [CommitteeMember], default: [] }) members!: CommitteeMember[];
  @Prop({ type: [CommitteeCandidate], default: [] }) candidates!: CommitteeCandidate[];
  @Prop({ type: [CommitteeVote], default: [] }) votes!: CommitteeVote[];
  @Prop({ type: [Object], default: [] }) meetings!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) commitments!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) documents!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) signatures!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) regulations!: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) confidentiality!: Record<string, unknown>[];
  @Prop({ type: [CommitteeAuditHistory], default: [] }) auditHistory!: CommitteeAuditHistory[];
}

export const CommitteePeriodSchema = SchemaFactory.createForClass(CommitteePeriod);
