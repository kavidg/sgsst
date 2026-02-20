import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  nit!: string;

  @Prop({ default: 'free' })
  plan!: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
