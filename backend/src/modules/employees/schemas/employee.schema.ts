import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ timestamps: true })
export class Employee {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  document!: string;

  @Prop({ required: true })
  position!: string;

  @Prop({ required: true })
  area!: string;

  @Prop({ required: true })
  contractType!: string;

  @Prop({ required: true })
  status!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
EmployeeSchema.index({ companyId: 1, document: 1 });
