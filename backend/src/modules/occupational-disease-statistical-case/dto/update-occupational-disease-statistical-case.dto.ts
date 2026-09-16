import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
} from 'class-validator';
import { OccupationalDiseaseQualification } from '../schemas/occupational-disease-statistical-case.schema';

/**
 * Actualización parcial de un caso estadístico (FASE 35B).
 *
 * INVARIANTS (control anti-reconteo, Gate 9):
 * - statisticalCaseId NO es modificable (identificador estadístico estable).
 * - firstOccurrence NO es modificable tras la creación (la primera
 *   ocurrencia se fija al registrar; una reapertura NUNCA convierte el caso
 *   en nuevo caso).
 * - caseStatus NO se modifica por aquí: el cierre/reapertura son
 *   transiciones explícitas del service (endpoints close/reopen).
 * - companyId nunca se acepta del frontend (server-side en el controller).
 * - El período se re-deriva de recognitionDate en el service (Regla F).
 */
export class UpdateOccupationalDiseaseStatisticalCaseDto {
  /** Calificación ocupacional (transiciones según ciclo de vida). */
  @IsOptional()
  @IsEnum(OccupationalDiseaseQualification)
  occupationalQualification?: OccupationalDiseaseQualification;

  /** Fecha de reconocimiento (revalida Reglas B/E/F contra valores finales). */
  @IsOptional()
  @IsDateString()
  recognitionDate?: string;

  /** Referencia administrativa al trabajador (Employee del mismo tenant). */
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  /** Referencia administrativa opcional a investigación (no automática). */
  @IsOptional()
  @IsMongoId()
  investigationRef?: string;

  /**
   * Baja/reactivación lógica explícita (deactivate/reactivate usan su propio
   * endpoint; este campo permite operaciones administrativas combinadas).
   */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
