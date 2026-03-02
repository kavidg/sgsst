import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyUserDocument = HydratedDocument<CompanyUser>;

@Schema({ timestamps: true })
export class CompanyUser {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;
}

export const CompanyUserSchema = SchemaFactory.createForClass(CompanyUser);
CompanyUserSchema.index({ companyId: 1, userId: 1 }, { unique: true });
CompanyUserSchema.index({ userId: 1 });

