import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Contexto PRE-examen de una evaluación médica ocupacional (3.1.3, FASE 30D-2).
 *
 * Validación de tenant y coherencia temporal (providedAt <= examDate) se
 * realizan en OccupationalExamService (necesita consultas a JobProfile/Risk).
 */
export class ExamOccupationalContextDto {
  /** Perfil de cargo (JobProfile) del MISMO tenant considerado para la evaluación. */
  @IsOptional()
  @IsMongoId()
  jobProfileId?: string;

  /** Riesgos (Risk) del MISMO tenant considerados para la evaluación. */
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  riskIds?: string[];

  /** Indica que la información fue suministrada/disponibilizada al evaluador. */
  @IsOptional()
  @IsBoolean()
  providedToEvaluator?: boolean;

  /** Fecha en que la información fue suministrada (PRE-examen). */
  @IsOptional()
  @IsDateString()
  providedAt?: string;

  /** Actor (uid) que suministró/disponibilizó la información. */
  @IsOptional()
  @IsString()
  providedBy?: string;
}
