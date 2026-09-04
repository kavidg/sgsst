import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EducationLevel, EthnicGroup, Gender, HousingType, MaritalStatus, WorkSchedule } from '../schemas/employee.schema';

export class CreateEmployeeDto {
  // ── Campos base (existentes) ──
  @IsString()
  name!: string;

  @IsString()
  document!: string;

  @IsString()
  position!: string;

  @IsString()
  area!: string;

  @IsString()
  contractType!: string;

  @IsString()
  status!: string;

  // ── Campos sociodemográficos (3.1.1) — todos opcionales ──

  /** Fecha de nacimiento. No debe ser futura. */
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  /** Género del trabajador. */
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  /** Estado civil. */
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  /** Nivel educativo. */
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  /** Personas a cargo (>= 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  dependents?: number;

  /** Estrato socioeconómico (1-6). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  socioeconomicStratum?: number;

  /** Tipo de vivienda. */
  @IsOptional()
  @IsEnum(HousingType)
  housingType?: HousingType;

  /** Grupo étnico. */
  @IsOptional()
  @IsEnum(EthnicGroup)
  ethnicGroup?: EthnicGroup;

  /** Indica discapacidad. undefined = sin registrar. */
  @IsOptional()
  @IsBoolean()
  disability?: boolean;

  /** Jornada laboral. */
  @IsOptional()
  @IsEnum(WorkSchedule)
  workSchedule?: WorkSchedule;

  /** Fecha de ingreso. No debe ser futura. */
  @IsOptional()
  @IsDateString()
  admissionDate?: string;

  /** Centro de trabajo. */
  @IsOptional()
  @IsString()
  workCenter?: string;
}
