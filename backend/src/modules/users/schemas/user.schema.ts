import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  firebaseUid!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: ['owner', 'admin', 'member'], default: 'member' })
  role!: 'owner' | 'admin' | 'member';
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ firebaseUid: 1 }, { unique: true });
UserSchema.index({ companyId: 1 });
