import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  ownerId!: Types.ObjectId;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
