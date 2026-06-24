import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

export const EconomicSectors = [
  // Español (nuevos registros)
  'Agricultura', 'Ganadería', 'Silvicultura', 'Pesca',
  'Minería', 'Petróleo y Gas', 'Manufactura', 'Construcción',
  'Electricidad', 'Agua y Saneamiento', 'Transporte', 'Logística',
  'Telecomunicaciones', 'Tecnología', 'Servicios Financieros', 'Seguros',
  'Salud', 'Farmacéutica', 'Educación', 'Universidades',
  'Comercio Minorista', 'Comercio Mayorista', 'Hoteles', 'Restaurantes',
  'Turismo', 'Administración Pública', 'Servicios de Seguridad', 'Servicios de Limpieza',
  'Servicios Temporales', 'Servicios Profesionales', 'Servicios Legales', 'Consultoría',
  'Bienes Raíces', 'Mantenimiento Industrial', 'Gestión de Residuos', 'Otro',
  // Inglés (retrocompatibilidad con empresas existentes)
  'Agriculture', 'Livestock', 'Forestry', 'Fishing',
  'Mining', 'Oil and Gas', 'Manufacturing', 'Construction',
  'Electricity', 'Water and Sanitation', 'Transportation', 'Logistics',
  'Telecommunications', 'Technology', 'Financial Services', 'Insurance',
  'Healthcare', 'Pharmaceuticals', 'Education', 'Universities',
  'Retail Commerce', 'Wholesale Commerce', 'Hotels', 'Restaurants',
  'Tourism', 'Public Administration', 'Security Services', 'Cleaning Services',
  'Temporary Staffing', 'Professional Services', 'Legal Services', 'Consulting',
  'Real Estate', 'Industrial Maintenance', 'Waste Management', 'Other',
] as const;

export type EconomicSector = (typeof EconomicSectors)[number];

@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  nit!: string;

  @Prop({ required: true, enum: ['7', '21', '60'] })
  standardsType!: string;

  @Prop({ required: true, enum: EconomicSectors })
  economicSector!: EconomicSector;

  @Prop()
  economicActivity?: string;

  @Prop()
  ciiuCode?: string;

  @Prop({ enum: ['I', 'II', 'III', 'IV', 'V'] })
  arlRiskLevel?: string;

  @Prop({ default: 0 })
  employeeCount!: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  ownerId!: Types.ObjectId;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
