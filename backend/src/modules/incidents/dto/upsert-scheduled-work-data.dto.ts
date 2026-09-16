import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  Matches,
  Min,
} from 'class-validator';

/**
 * DTO de carga del denominador mensual de 3.3.6 (FASE 35E-2, Parte A).
 *
 * El companyId NO es autoridad del frontend: el controller lo deriva del
 * usuario autenticado vía CompanyAccessGuard (request.companyId) y valida
 * pertenencia al tenant. Este DTO solo transporta el período y el valor.
 */
export class UpsertScheduledWorkDataDto {
  /** Período del dato en formato YYYY-MM. */
  @IsNotEmpty()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must have format YYYY-MM (month 01-12)' })
  period!: string;

  /**
   * Días de trabajo programados en el mes (entero >= 0).
   * Sin NaN/Infinity: class-validator rechaza no-números con @IsNumber y
   * @IsInt excluye fraccionarios; los decimales NO se aceptan.
   */
  @Type(() => Number)
  @IsNumber()
  @IsInt()
  @Min(0)
  scheduledWorkDays!: number;

  /** companyId crudo del payload — SOLO se valida contra el tenant resuelto server-side. */
  @IsMongoId()
  companyId?: string;
}
