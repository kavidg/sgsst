import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyLegalMatrixDocument = HydratedDocument<CompanyLegalMatrix>;

export type LegalMatrixItemStatus = 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA' | 'PENDIENTE';

@Schema({ timestamps: true })
export class LegalMatrixItem {
  @Prop({ required: true })
  regulationCode!: string;

  @Prop({ required: true })
  regulationName!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: ['CUMPLE', 'NO_CUMPLE', 'NO_APLICA', 'PENDIENTE'], default: 'PENDIENTE' })
  status!: LegalMatrixItemStatus;

  @Prop()
  observation?: string;

  @Prop()
  evidenceUrl?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop()
  lastUpdatedAt?: Date;
}

export const LegalMatrixItemSchema = SchemaFactory.createForClass(LegalMatrixItem);

@Schema({ timestamps: true })
export class CompanyLegalMatrix {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', unique: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  economicSector!: string;

  @Prop({ type: [LegalMatrixItemSchema], default: [] })
  items!: LegalMatrixItem[];
}

export const CompanyLegalMatrixSchema = SchemaFactory.createForClass(CompanyLegalMatrix);
