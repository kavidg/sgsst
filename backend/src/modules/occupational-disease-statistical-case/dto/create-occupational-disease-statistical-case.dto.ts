import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  OccupationalDiseaseCaseStatus,
  OccupationalDiseaseQualification,
} from '../schemas/occupational-disease-statistical-case.schema';

/**
 * Creación de un caso estadístico de enfermedad laboral (FASE 35B).
 *
 * La empresa (companyId) SIEMPRE se deriva de la sesión autenticada en el
 * controller (server-side); NUNCA se acepta del frontend. El período
 * estadístico (period/periodYear/periodMonth) se DERIVA en el service a
 * partir de recognitionDate (Regla F) y por tanto NO se acepta del body.
 * caseStatus inicia siempre OPEN (ciclo de vida; el cierre es una
 * transición explícita del service, no un campo libre del frontend).
 *
 * METADATA-ONLY (§3): este DTO NO acepta diagnóstico, código CIE, historia
 * clínica, síntomas, tratamientos, medicamentos, resultados clínicos,
 * exámenes médicos, incapacidades detalladas ni observaciones clínicas.
 */
export class CreateOccupationalDiseaseStatisticalCaseDto {
  /**
   * Identificador estadístico estable del caso (único dentro del tenant).
   * Formato controlado: letras, números, punto, guion y guion bajo.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'statisticalCaseId solo acepta letras, números, punto, guion y guion bajo',
  })
  statisticalCaseId!: string;

  /**
   * Referencia administrativa opcional al trabajador (Employee del MISMO
   * tenant; validada en el service). Opcional: la deduplicación depende del
   * par { companyId, statisticalCaseId }, no de employeeId.
   */
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  /** Calificación ocupacional (enum cerrado; Reglas A–D). */
  @IsEnum(OccupationalDiseaseQualification)
  occupationalQualification!: OccupationalDiseaseQualification;

  /**
   * Fecha de reconocimiento/registro administrativo.
   * Obligatoria para QUALIFIED (Regla B); no puede ser futura (Regla E).
   * El período estadístico se deriva de esta fecha (Regla F).
   */
  @IsOptional()
  @IsDateString()
  recognitionDate?: string;

  /**
   * Primera ocurrencia estadística. El service valida contra el historial
   * del tenant: un statisticalCaseId que ya existió nunca puede registrarse
   * de nuevo como primera ocurrencia (Gate 9).
   */
  @IsOptional()
  @IsBoolean()
  firstOccurrence?: boolean;

  /**
   * Referencia administrativa opcional y explícita a una investigación
   * (Incident DISEASE, 3.2.2). NUNCA es conversión automática: es un
   * vínculo manual de trazabilidad.
   */
  @IsOptional()
  @IsMongoId()
  investigationRef?: string;

  /**
   * Estado inicial administrativo. Default OPEN. Cerrado únicamente vía
   * transición explícita (endpoint close).
   */
  @IsOptional()
  @IsEnum(OccupationalDiseaseCaseStatus)
  caseStatus?: OccupationalDiseaseCaseStatus;
}
