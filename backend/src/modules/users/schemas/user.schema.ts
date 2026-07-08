import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  firebaseUid!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ default: '' })
  firstName!: string;

  @Prop({ default: '' })
  lastName!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: '' })
  jobTitle!: string;

  @Prop({ default: '' })
  avatarUrl!: string;

  @Prop({ default: '' })
  signatureUrl!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: ['owner', 'admin', 'member', 'manager'], default: 'member' })
  role!: 'owner' | 'admin' | 'member' | 'manager';

  @Prop({ default: true })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ firebaseUid: 1 }, { unique: true });
UserSchema.index({ companyId: 1 });
