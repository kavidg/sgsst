import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Company } from '../../companies/schemas/company.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  firebaseUid!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: Company.name })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: ['admin', 'employee'] })
  role!: 'admin' | 'employee';

  @Prop({ default: true })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
