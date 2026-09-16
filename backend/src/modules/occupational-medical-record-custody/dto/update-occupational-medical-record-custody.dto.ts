import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CustodyStatus,
  RecordType,
} from '../schemas/occupational-medical-record-custody.schema';

/**
 * Actualización parcial de un registro de custodia de historia clínica
 * ocupacional (3.1.5).
 *
 * Todos los campos son opcionales para permitir PATCH parcial.
 * La empresa (companyId) NO se acepta del body; se deriva de la sesión.
 */
export class UpdateOccupationalMedicalRecordCustodyDto {
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[\w\s\-\.\,\/\(\)#&@+=\*\:;!?\u00C0-\u024F]+$/, {
    message:
      'recordReference contiene caracteres no permitidos.',
  })
  recordReference?: string;

  @IsOptional()
  @IsEnum(RecordType)
  recordType?: RecordType;

  @IsOptional()
  @IsEnum(CustodyStatus)
  custodyStatus?: CustodyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  custodianName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  custodianRole?: string;

  @IsOptional()
  @IsDateString()
  custodyStartDate?: string;

  @IsOptional()
  @IsDateString()
  retentionUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  storageLocationReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessControlDescription?: string;

  @IsOptional()
  @IsBoolean()
  confidentialityConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  integrityConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  availabilityConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
