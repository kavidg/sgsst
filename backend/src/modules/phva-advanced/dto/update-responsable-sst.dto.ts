import { IsOptional, IsString } from 'class-validator';

export class UpdateResponsableSstDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  sstProfessionalType?: string;

  @IsOptional()
  @IsString()
  sstLicenseNumber?: string;

  @IsOptional()
  @IsString()
  licenseType?: string;

  @IsOptional()
  @IsString()
  issuingAuthority?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  licenseIssueDate?: string;

  @IsOptional()
  @IsString()
  licenseExpiresAt?: string;

  @IsOptional()
  @IsString()
  licenseStatus?: string;

  @IsOptional()
  @IsString()
  course50HoursDate?: string;

  @IsOptional()
  @IsString()
  course50HoursDetectedDate?: string;

  @IsOptional()
  @IsString()
  course20HoursDate?: string;

  // === Designación del Responsable SG-SST (Fase 8.3.C) ===
  @IsOptional()
  @IsString()
  designationDate?: string;

  @IsOptional()
  @IsString()
  designationNumber?: string;

  @IsOptional()
  @IsString()
  designationIssuerName?: string;

  @IsOptional()
  @IsString()
  designationIssuerPosition?: string;
}
