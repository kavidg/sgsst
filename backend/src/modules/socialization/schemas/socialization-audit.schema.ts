import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SocializationAuditDocument = HydratedDocument<SocializationAudit>;

@Schema({ timestamps: true })
export class SocializationAudit {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SocializationSession' })
  sessionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SocializationParticipant' })
  participantId?: Types.ObjectId;

  @Prop({ required: true })
  action!: string;

  @Prop()
  userEmail?: string;

  @Prop()
  userName?: string;

  @Prop()
  employeeName?: string;

  @Prop()
  employeeIdentification?: string;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: () => new Date() })
  timestamp!: Date;
}

export const SocializationAuditSchema = SchemaFactory.createForClass(SocializationAudit);
SocializationAuditSchema.index({ companyId: 1, timestamp: -1 });
SocializationAuditSchema.index({ sessionId: 1 });
