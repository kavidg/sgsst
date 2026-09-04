import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HazardousSubstanceDocument = HydratedDocument<HazardousSubstance>;

/**
 * Tipo de sustancia química peligrosa.
 * Valores abiertos: el catálogo normativo no define una lista cerrada
 * internacionalmente estandarizada para este campo en la Resolución 0312.
 * Se utilizan categorías comunes de clasificación de peligros.
 */
export enum SubstanceType {
  CHEMICAL = 'CHEMICAL',
  BIOLOGICAL = 'BIOLOGICAL',
  FLAMMABLE = 'FLAMMABLE',
  CORROSIVE = 'CORROSIVE',
  TOXIC = 'TOXIC',
  EXPLOSIVE = 'EXPLOSIVE',
  OXIDIZER = 'OXIDIZER',
  COMPRESSED_GAS = 'COMPRESSED_GAS',
  OTHER = 'OTHER',
}

/**
 * Estado de la Hoja de Datos de Seguridad (SDS/HDS).
 */
export enum SdsStatus {
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  PENDING = 'PENDING',
  CURRENT = 'CURRENT',
  EXPIRED = 'EXPIRED',
}

/**
 * Estado operativo de una sustancia en el inventario.
 * NO confundir con Approval Workflow.
 */
export enum HazardousSubstanceStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Schema({ timestamps: true })
export class HazardousSubstance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Nombre comercial o químico de la sustancia */
  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  /** Número CAS (Chemical Abstracts Service) — opcional pero recomendado */
  @Prop({ trim: true, maxlength: 50 })
  casNumber?: string;

  /** Clasificación de peligro (GHS, NFPA u otra taxonomy) */
  @Prop({ trim: true, maxlength: 200 })
  hazardClassification?: string;

  /** Tipo de sustancia */
  @Prop({ required: true, enum: Object.values(SubstanceType), default: SubstanceType.CHEMICAL })
  substanceType!: SubstanceType;

  /** Proveedor o fabricante */
  @Prop({ trim: true, maxlength: 200 })
  supplier?: string;

  /** Ubicación de almacenamiento */
  @Prop({ trim: true, maxlength: 200 })
  storageLocation?: string;

  /** Estado de la Hoja de Datos de Seguridad (SDS/HDS) */
  @Prop({ required: true, enum: Object.values(SdsStatus), default: SdsStatus.NOT_AVAILABLE })
  sdsStatus!: SdsStatus;

  /** URL o referencia documental de la SDS/HDS */
  @Prop({ trim: true, maxlength: 500 })
  sdsUrl?: string;

  /** Fecha de emisión de la SDS */
  @Prop({ type: Date })
  sdsIssueDate?: Date;

  /** Fecha de revisión/vencimiento de la SDS */
  @Prop({ type: Date })
  sdsReviewDate?: Date;

  /** Controles implementados para manipulación, almacenamiento y disposición */
  @Prop({ trim: true, maxlength: 2000 })
  controlsImplemented?: string;

  /** Referencia opcional al Risk asociado */
  @Prop({ type: Types.ObjectId, ref: 'Risk' })
  riskId?: Types.ObjectId;

  /** Notas adicionales */
  @Prop({ trim: true, maxlength: 2000 })
  notes?: string;

  /** Estado operativo de la sustancia en el inventario */
  @Prop({ required: true, enum: Object.values(HazardousSubstanceStatus), default: HazardousSubstanceStatus.ACTIVE })
  status!: HazardousSubstanceStatus;
}

export const HazardousSubstanceSchema = SchemaFactory.createForClass(HazardousSubstance);
HazardousSubstanceSchema.index({ companyId: 1, name: 1 });
HazardousSubstanceSchema.index({ companyId: 1, status: 1 });
HazardousSubstanceSchema.index({ companyId: 1, riskId: 1 });
HazardousSubstanceSchema.index({ companyId: 1, casNumber: 1 });
