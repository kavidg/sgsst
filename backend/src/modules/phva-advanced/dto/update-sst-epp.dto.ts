import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTO estricto de actualización del catálogo/matriz EPP (SstEpp).
 *
 * SEGURIDAD (auditoría 4.2.6): sustituye al antiguo `Record<string, unknown>`
 * de updateEpp. Solo acepta campos de GESTIÓN (catálogo, asignaciones,
 * inspecciones, razón de cumplimiento, año). Quedan explícitamente fuera del
 * contrato los campos de scoring/identidad:
 *
 *   companyId, itemCode, complianceStatus, history, _id
 *
 * El ValidationPipe global (whitelist + forbidNonWhitelisted) rechaza cualquier
 * campo adicional enviado por el cliente, por lo que complianceStatus ya no es
 * manipulable desde la API.
 */
export class UpdateSstEppCatalogItemDto {
  @IsString() @MinLength(1) @MaxLength(128)
  eppId!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  category!: string;

  @IsOptional() @IsString() @MaxLength(120)
  standard?: string;

  @IsOptional() @IsString() @MaxLength(200)
  requiredFor?: string;

  @IsOptional() @IsInt() @Min(1) @Max(240)
  expectedLifespanMonths?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateSstEppAssignmentDto {
  @IsString() @MinLength(1) @MaxLength(128)
  assignmentId!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  employeeId!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  employeeName!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  eppItemId!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  eppName!: string;

  @IsDateString()
  deliveryDate!: string;

  @IsOptional() @IsDateString()
  expectedReplacementDate?: string;

  @IsOptional() @IsDateString()
  actualReplacementDate?: string;

  @IsOptional() @IsIn(['GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  condition?: string;

  @IsOptional() @IsInt() @Min(1) @Max(1000)
  quantity?: number;

  @IsOptional() @IsString() @MaxLength(128)
  serialNumber?: string;

  @IsOptional() @IsIn(['ACTIVE', 'EXPIRED', 'RETURNED', 'DAMAGED', 'REPLACED'])
  status?: string;
}

export class UpdateSstEppInspectionDto {
  @IsString() @MinLength(1) @MaxLength(128)
  inspectionId!: string;

  @IsDateString()
  date!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  inspector!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  area!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  findings?: string;

  @IsOptional() @IsIn(['OPEN', 'CLOSED'])
  status?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  correctiveActions?: string[];
}

export class UpdateSstEppDto {
  /** Razón/comentario del estado de cumplimiento (texto informativo; el estado lo decide la aprobación). */
  @IsOptional() @IsString() @MaxLength(500)
  complianceReason?: string;

  /** Año de la matriz EPP. */
  @IsOptional() @IsInt() @Min(2000) @Max(2100)
  year?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateSstEppCatalogItemDto)
  catalog?: UpdateSstEppCatalogItemDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateSstEppAssignmentDto)
  assignments?: UpdateSstEppAssignmentDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateSstEppInspectionDto)
  inspections?: UpdateSstEppInspectionDto[];
}
