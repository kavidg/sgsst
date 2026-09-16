import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  WasteDisposalFrequency,
  WasteManagementStatus,
  WasteType,
} from '../schemas/waste-management-record.schema';

/**
 * Creación de un registro de gestión de residuos (3.1.9 — FASE 34C).
 *
 * La empresa (companyId) SIEMPRE se deriva de la sesión autenticada en el
 * controller; nunca se acepta del cuerpo de la petición.
 *
 * METADATA-ONLY: sin información clínica, sin datos personales innecesarios,
 * sin resultados de mediciones ambientales.
 */
export class CreateWasteManagementRecordDto {
  // code: identificación operativa del registro.
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message: 'code solo admite letras, números, guiones y guiones bajos',
  })
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  // wasteType: discriminador obligatorio (enum cerrado: SOLID/LIQUID/GASEOUS).
  @IsEnum(WasteType)
  wasteType!: WasteType;

  // hazardous: clasificación operativa informativa (NO implica cumplimiento).
  @IsOptional()
  @IsBoolean()
  hazardous?: boolean;

  // source: fuente generadora (proceso/área operativa).
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  source!: string;

  // generationDescription: descripción operativa de la generación.
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  generationDescription!: string;

  // handlingMethod: segregación, almacenamiento temporal, contención…
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  handlingMethod!: string;

  // disposalMethod: gestor autorizado, tratamiento, disposición final…
  // Obligatorio cuando el registro queda ACTIVE (validado en service).
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  disposalMethod?: string;

  // disposalDestination: trazabilidad de dónde terminó el residuo.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  disposalDestination?: string;

  // disposalFrequency: frecuencia de disposición (default ANNUAL en schema).
  @IsOptional()
  @IsEnum(WasteDisposalFrequency)
  disposalFrequency?: WasteDisposalFrequency;

  // lastDisposalDate: última disposición ejecutada.
  @IsOptional()
  @IsDateString()
  lastDisposalDate?: string;

  // nextDisposalDate: próxima programada; >= lastDisposalDate (service).
  @IsOptional()
  @IsDateString()
  nextDisposalDate?: string;

  // responsible: responsable de la gestión (obligatorio).
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  responsible!: string;

  // evidenceUrl: referencia a manifiesto/certificado/registro/soporte.
  @IsOptional()
  @IsString()
  @Matches(/^\S+$/i, { message: 'evidenceUrl no debe contener espacios' })
  @MaxLength(500)
  evidenceUrl?: string;

  // observations: observaciones operativas.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  // status: estado de la gestión (default PLANNED en schema).
  @IsOptional()
  @IsEnum(WasteManagementStatus)
  status?: WasteManagementStatus;

  // active: opcional (por defecto true).
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
