import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SupplierDocument = HydratedDocument<Supplier>;

export enum SupplierType {
  PROVIDER = 'PROVIDER',
  CONTRACTOR = 'CONTRACTOR',
  THIRD_PARTY = 'THIRD_PARTY',
}

export enum SupplierStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Schema({ timestamps: true })
export class Supplier {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  legalName?: string;

  @Prop()
  taxId?: string;

  @Prop({ required: true, enum: Object.values(SupplierType), default: SupplierType.PROVIDER })
  type!: SupplierType;

  @Prop()
  contactName?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  address?: string;

  @Prop({ required: true, enum: Object.values(SupplierStatus), default: SupplierStatus.ACTIVE })
  status!: SupplierStatus;

  @Prop()
  observations?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdByName?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
SupplierSchema.index({ companyId: 1, name: 1 });
SupplierSchema.index({ companyId: 1, status: 1 });
SupplierSchema.index({ companyId: 1, taxId: 1 }, { sparse: true });
