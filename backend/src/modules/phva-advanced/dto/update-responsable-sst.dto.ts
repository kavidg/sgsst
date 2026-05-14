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
  licenseExpiresAt?: string;

  @IsOptional()
  @IsString()
  course50HoursDate?: string;

  @IsOptional()
  @IsString()
  course50HoursDetectedDate?: string;

  @IsOptional()
  @IsString()
  course20HoursDate?: string;
}
