import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmployeeDocument = HydratedDocument<Employee>;

/**
 * Enumeraciones del perfil sociodemográfico (3.1.1).
 *
 * Todos los valores son opcionales en el schema para mantener compatibilidad
 * con empleados existentes que no tengan estos campos.
 */
export enum Gender {
  MASCULINO = 'MASCULINO',
  FEMENINO = 'FEMENINO',
  OTRO = 'OTRO',
}

export enum MaritalStatus {
  SOLTERO = 'SOLTERO',
  CASADO = 'CASADO',
  DIVORCIADO = 'DIVORCIADO',
  VIUDO = 'VIUDO',
  UNION_LIBRE = 'UNION_LIBRE',
}

export enum EducationLevel {
  PRIMARIA = 'PRIMARIA',
  SECUNDARIA = 'SECUNDARIA',
  TECNICO = 'TECNICO',
  TECNOLOGO = 'TECNOLOGO',
  PROFESIONAL = 'PROFESIONAL',
  POSGRADO = 'POSGRADO',
}

export enum HousingType {
  PROPIA = 'PROPIA',
  ARRENDADA = 'ARRENDADA',
  FAMILIAR = 'FAMILIAR',
  OTRO = 'OTRO',
}

export enum EthnicGroup {
  INDIGENA = 'INDIGENA',
  ROM = 'ROM',
  RAIZAL = 'RAIZAL',
  PALENQUERO = 'PALENQUERO',
  AFROCOLOMBIANO = 'AFROCOLOMBIANO',
  NINGUNO = 'NINGUNO',
  OTRO = 'OTRO',
}

export enum WorkSchedule {
  DIURNA = 'DIURNA',
  NOCTURNA = 'NOCTURNA',
  MIXTA = 'MIXTA',
  ROTATIVA = 'ROTATIVA',
}

@Schema({ timestamps: true })
export class Employee {
  // ── Campos base (existentes) ──
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

  // ── Campos sociodemográficos (3.1.1) — todos opcionales ──

  /** Fecha de nacimiento del trabajador. */
  @Prop({ type: Date })
  birthDate?: Date;

  /** Género del trabajador. */
  @Prop({ enum: Object.values(Gender) })
  gender?: Gender;

  /** Estado civil del trabajador. */
  @Prop({ enum: Object.values(MaritalStatus) })
  maritalStatus?: MaritalStatus;

  /** Nivel educativo del trabajador. */
  @Prop({ enum: Object.values(EducationLevel) })
  educationLevel?: EducationLevel;

  /** Número de personas a cargo (mínimo 0). */
  @Prop({ type: Number })
  dependents?: number;

  /** Estrato socioeconómico (1-6). */
  @Prop({ type: Number })
  socioeconomicStratum?: number;

  /** Tipo de vivienda. */
  @Prop({ enum: Object.values(HousingType) })
  housingType?: HousingType;

  /** Grupo étnico. */
  @Prop({ enum: Object.values(EthnicGroup) })
  ethnicGroup?: EthnicGroup;

  /** Indica si el trabajador tiene discapacidad. undefined = sin registrar. */
  @Prop({ type: Boolean })
  disability?: boolean;

  /** Jornada laboral. */
  @Prop({ enum: Object.values(WorkSchedule) })
  workSchedule?: WorkSchedule;

  /** Fecha de ingreso a la empresa. */
  @Prop({ type: Date })
  admissionDate?: Date;

  /** Centro de trabajo. */
  @Prop({ type: String })
  workCenter?: string;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
EmployeeSchema.index({ companyId: 1, document: 1 }, { unique: true });
