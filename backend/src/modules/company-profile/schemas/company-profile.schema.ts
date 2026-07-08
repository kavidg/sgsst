import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyProfileDoc = HydratedDocument<CompanyProfile>;

// ============ WORK CENTER ============
@Schema({ _id: false })
export class WorkCenter {
  @Prop({ required: true })
  name!: string;

  @Prop()
  address?: string;

  @Prop()
  city?: string;

  @Prop({ enum: ['I', 'II', 'III', 'IV', 'V'] })
  riskLevel?: string;

  @Prop({ default: 0 })
  employeeCount!: number;

  @Prop({ default: true })
  active!: boolean;
}

export const WorkCenterSchema = SchemaFactory.createForClass(WorkCenter);

// ============ CONTACT ============
@Schema({ _id: false })
export class CompanyContact {
  @Prop({ required: true })
  type!: string; // LEGAL_REPRESENTATIVE | HR | SST | EMERGENCY | ARL

  @Prop({ required: true })
  name!: string;

  @Prop()
  position?: string;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;
}

export const CompanyContactSchema = SchemaFactory.createForClass(CompanyContact);

// ============ COMPANY DOCUMENT ============
@Schema({ _id: false })
export class CompanyProfileDocument {
  @Prop({ required: true })
  type!: string; // CHAMBER_COMMERCE | RUT | LEGAL_REP_ID | ARL_CERTIFICATE | LOGO | OTHER

  @Prop({ required: true })
  name!: string;

  @Prop()
  fileUrl?: string;

  @Prop({ default: false })
  isVerified!: boolean;

  @Prop()
  uploadedAt?: string;
}

export const CompanyProfileDocumentSchema = SchemaFactory.createForClass(CompanyProfileDocument);

// ============ HISTORY ENTRY ============
@Schema({ _id: false })
export class CompanyProfileHistory {
  @Prop({ required: true })
  userId!: string;

  @Prop()
  userEmail?: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  field!: string;

  @Prop()
  previousValue?: string;

  @Prop()
  newValue?: string;

  @Prop({ default: () => new Date().toISOString() })
  timestamp!: string;
}

export const CompanyProfileHistorySchema = SchemaFactory.createForClass(CompanyProfileHistory);

// ============ MAIN SCHEMA ============
export type CompanySize = 'Microempresa' | 'Pequeña' | 'Mediana' | 'Grande';
export type RiskLevel = 'I' | 'II' | 'III' | 'IV' | 'V';
export type ImplementationStatus = 'Not Started' | 'Initial Stage' | 'In Progress' | 'Implemented' | 'Mature';

@Schema({ timestamps: true })
export class CompanyProfile {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', unique: true })
  companyId!: Types.ObjectId;

  // ========== TAB 1: INFORMACIÓN GENERAL ==========
  @Prop()
  companyName?: string; // Nombre comercial (sync desde Company.name)

  @Prop()
  legalName?: string; // Razón social

  @Prop()
  nit?: string; // NIT (sync desde Company.nit)

  @Prop()
  economicSector?: string; // Sector económico (sync desde Company.economicSector)

  @Prop()
  verificationDigit?: string;

  @Prop({ enum: ['Microempresa', 'Pequeña', 'Mediana', 'Grande'] })
  companySize?: CompanySize;

  @Prop({ enum: ['I', 'II', 'III', 'IV', 'V'] })
  riskLevel?: RiskLevel;

  @Prop()
  companyType?: string;

  @Prop()
  address?: string;

  @Prop()
  city?: string;

  @Prop()
  department?: string;

  @Prop({ default: 'Colombia' })
  country!: string;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  website?: string;

  @Prop()
  logoUrl?: string;

  // ========== TAB 2: INFORMACIÓN LABORAL ==========
  @Prop({ default: 0 })
  totalEmployees!: number;

  @Prop({ default: 0 })
  directEmployees!: number;

  @Prop({ default: 0 })
  contractors!: number;

  @Prop({ default: 0 })
  apprentices!: number;

  @Prop({ default: 0 })
  temporaryWorkers!: number;

  @Prop({ default: 0 })
  maleEmployees!: number;

  @Prop({ default: 0 })
  femaleEmployees!: number;

  @Prop({ default: 0 })
  otherGenderEmployees!: number;

  @Prop({ default: 0 })
  ageUnder18!: number;

  @Prop({ default: 0 })
  age18to25!: number;

  @Prop({ default: 0 })
  age26to35!: number;

  @Prop({ default: 0 })
  age36to45!: number;

  @Prop({ default: 0 })
  age46to60!: number;

  @Prop({ default: 0 })
  ageOver60!: number;

  @Prop({ type: [String], default: [] })
  workSchedules!: string[];

  // ========== TAB 3: INFORMACIÓN SG-SST ==========
  @Prop()
  arlName?: string;

  @Prop()
  arlAffiliateNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleSstUserId?: Types.ObjectId;

  @Prop()
  sstStartDate?: string;

  @Prop({ enum: ['Not Started', 'Initial Stage', 'In Progress', 'Implemented', 'Mature'] })
  implementationStatus?: ImplementationStatus;

  // ========== LEGAL REPRESENTATIVE CONFIGURATION ==========
  @Prop({ default: true })
  managerActsAsLegalRepresentative!: boolean;

  // ========== TAB 4: CENTROS DE TRABAJO ==========
  @Prop({ type: [WorkCenterSchema], default: [] })
  workCenters!: WorkCenter[];

  // ========== TAB 5: CONTACTOS ==========
  @Prop({ type: [CompanyContactSchema], default: [] })
  contacts!: CompanyContact[];

  // ========== TAB 6: DOCUMENTOS ==========
  @Prop({ type: [CompanyProfileDocumentSchema], default: [] })
  companyDocuments!: CompanyProfileDocument[];

  // ========== TAB 7: HISTORIAL ==========
  @Prop({ type: [CompanyProfileHistorySchema], default: [] })
  history!: CompanyProfileHistory[];

  // ========== PROFILE COMPLETION ==========
  @Prop({ default: 0 })
  completionPercentage!: number;
}

export const CompanyProfileSchema = SchemaFactory.createForClass(CompanyProfile);
