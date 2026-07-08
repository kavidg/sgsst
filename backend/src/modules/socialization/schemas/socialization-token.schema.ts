import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SocializationTokenDocument = HydratedDocument<SocializationToken>;

@Schema({ timestamps: true })
export class SocializationToken {
  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'SocializationParticipant' })
  participantId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'SocializationSession' })
  sessionId!: Types.ObjectId;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: false })
  used!: boolean;

  @Prop()
  usedAt?: Date;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;
}

export const SocializationTokenSchema = SchemaFactory.createForClass(SocializationToken);
SocializationTokenSchema.index({ token: 1 }, { unique: true });
SocializationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
