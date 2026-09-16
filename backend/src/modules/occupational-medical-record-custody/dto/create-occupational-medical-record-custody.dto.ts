import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CustodyStatus,
  RecordType,
} from '../schemas/occupational-medical-record-custody.schema';

/**
 * Creación de un registro de custodia de historia clínica ocupacional (3.1.5).
 *
 * La empresa (companyId) SIEMPRE se deriva de la sesión autenticada en el
 * controller; nunca se acepta del cuerpo de la petición.
 *
 * REGLA ANTI-FALSIFICACIÓN: este DTO NO acepta examId, medicalRecommendationId,
 * ni ninguna referencia que pueda inferir custodia. La custodia se demuestra
 * ÚNICAMENTE con este registro explícito.
 */
export class CreateOccupationalMedicalRecordCustodyDto {
  // employeeId es requerido y debe pertenecer al mismo tenant (validado en service)
  @IsMongoId()
  employeeId!: string;

  // recordReference: referencia administrativa al documento/registro bajo custodia.
  // NO puede ser información clínica.
  @IsString()
  @MaxLength(200)
  @Matches(/^[\w\s\-\.\,\/\(\)#&@+=\*\:;!?\u00C0-\u024F]+$/, {
    message:
      'recordReference contiene caracteres no permitidos. Solo caracteres alfanuméricos, espacios y puntuación básica permitidos.',
  })
  recordReference!: string;

  // recordType: tipo de registro médico ocupacional bajo custodia.
  @IsEnum(RecordType)
  recordType!: RecordType;

  // custodyStatus: inicialmente IN_CUSTODY (predeterminado en schema, pero explícito en DTO)
  @IsEnum(CustodyStatus)
  custodyStatus!: CustodyStatus;

  // custodianName: responsable de la custodia (OBLIGATORIO para in custody).
  @IsString()
  @MaxLength(200)
  custodianName!: string;

  // custodianRole: opcional.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  custodianRole?: string;

  // custodyStartDate: obligatorio, debe ser fecha válida.
  @IsDateString()
  custodyStartDate!: string;

  // retentionUntil: opcional (puede no tener fecha de retención definida).
  // Si existe, debe ser >= custodyStartDate (validado en service).
  @IsOptional()
  @IsDateString()
  retentionUntil?: string;

  // storageLocationReference: obligatorio, referencia controlada a la ubicación.
  @IsString()
  @MaxLength(300)
  storageLocationReference!: string;

  // accessControlDescription: opcional.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessControlDescription?: string;

  // confidentialityConfirmed: obligatorio para in custody.
  @IsBoolean()
  confidentialityConfirmed!: boolean;

  // integrityConfirmed: obligatorio para in custody.
  @IsBoolean()
  integrityConfirmed!: boolean;

  // availabilityConfirmed: obligatorio para in custody.
  @IsBoolean()
  availabilityConfirmed!: boolean;

  // notes: opcional, NO información clínica.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // active: opcional (por defecto true).
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
