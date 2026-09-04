import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EducationLevel, EthnicGroup, Gender, HousingType, MaritalStatus, WorkSchedule } from '../schemas/employee.schema';

export class UpdateEmployeeDto {
  // ── Campos base (existentes) ──
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  contractType?: string;

  @IsOptional()
  @IsString()
  status?: string;

  // ── Campos sociodemográficos (3.1.1) — todos opcionales ──

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @IsOptional()
  @IsInt()
  @Min(0)
  dependents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  socioeconomicStratum?: number;

  @IsOptional()
  @IsEnum(HousingType)
  housingType?: HousingType;

  @IsOptional()
  @IsEnum(EthnicGroup)
  ethnicGroup?: EthnicGroup;

  @IsOptional()
  @IsBoolean()
  disability?: boolean;

  @IsOptional()
  @IsEnum(WorkSchedule)
  workSchedule?: WorkSchedule;

  @IsOptional()
  @IsDateString()
  admissionDate?: string;

  @IsOptional()
  @IsString()
  workCenter?: string;
}
