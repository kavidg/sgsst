import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ExamType, ExamStatus, FitnessStatus } from '../schemas/occupational-exam.schema';

/**
 * Validador personalizado: si followUpRequired es true, followUpDate es obligatorio.
 */
@ValidatorConstraint({ name: 'FollowUpDateRequired', async: false })
class FollowUpDateRequiredValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    if (obj.followUpRequired === true && !obj.followUpDate) {
      return false;
    }
    return true;
  }

  defaultMessage(): string {
    return 'followUpDate es requerido cuando followUpRequired es true';
  }
}

/**
 * Validador personalizado: si status es COMPLETED, examDate es obligatorio.
 */
@ValidatorConstraint({ name: 'ExamDateRequiredForCompleted', async: false })
class ExamDateRequiredForCompletedValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    if (obj.status === ExamStatus.COMPLETED && !obj.examDate) {
      return false;
    }
    return true;
  }

  defaultMessage(): string {
    return 'examDate es requerido cuando status es COMPLETED';
  }
}

export class CreateOccupationalExamDto {
  /** ID del empleado asociado al examen. */
  @IsMongoId()
  employeeId!: string;

  /** Tipo de examen médico ocupacional. */
  @IsEnum(ExamType)
  examType!: ExamType;

  /** Fecha en que se realizó el examen. */
  @IsOptional()
  @IsDateString()
  examDate?: string;

  /** Estado administrativo del examen. */
  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  /** Fecha de próximo examen requerido. */
  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  /** Estado de aptitud médica (categoría administrativa). */
  @IsOptional()
  @IsEnum(FitnessStatus)
  fitnessStatus?: FitnessStatus;

  /** Indica si se requiere seguimiento post-examen. */
  @IsOptional()
  @IsBoolean()
  followUpRequired?: boolean;

  /** Fecha programada para seguimiento. */
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  // ── Campos adicionales para 3.1.4 ──

  /** Periodicidad administrativa de la evaluación periódica (en meses). */
  @IsOptional()
  @IsInt()
  @Min(1)
  periodicityMonths?: number;

  /** Referencias administrativas a peligros ocupacionales relacionados. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedHazards?: string[];

  /** Indica si existe constancia de comunicación de resultados al trabajador. */
  @IsOptional()
  @IsBoolean()
  workerAcknowledged?: boolean;

  /** Fecha administrativa de comunicación de resultados al trabajador. */
  @IsOptional()
  @IsDateString()
  communicationDate?: string;

  // Validadores de consistencia
  @Validate(FollowUpDateRequiredValidator)
  _followUpConsistency?: unknown;

  @Validate(ExamDateRequiredForCompletedValidator)
  _examDateConsistency?: unknown;
}
