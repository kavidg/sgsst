import { Type } from 'class-transformer';
import { IsNumber, IsString, Matches, Max, Min } from 'class-validator';

/**
 * E3-B (6.1.1) — Upsert del denominador oficial de horas trabajadas.
 *
 * `CompanyPeriodWorkData` alimenta ind-01-accident-frequency,
 * ind-02-accident-severity e ind-03-absenteeism-rate.
 *
 * DECISIÓN DE DOMINIO (E3-A): si no existe registro válido para el período,
 * el indicador dependiente de horas queda NO_DATA. La ausencia de horas nunca
 * se convierte en 0 evaluado.
 *
 * SEGURIDAD: el DTO deliberadamente NO incluye `companyId` — el tenant es
 * resuelto server-side (mismo patrón del módulo Indicators y de
 * scheduled-work-data). El `period` de la URL debe coincidir con el del cuerpo.
 */
export class UpsertCompanyPeriodWorkDataDto {
  /** Período mensual en formato estricto YYYY-MM (mes 01–12). */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'period must be YYYY-MM with month between 01 and 12',
  })
  period!: string;

  /** Horas trabajadas: número finito >= 0 (NaN/Infinity/negativos rechazados). */
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'hoursWorked must be >= 0' })
  @Max(1000000000, { message: 'hoursWorked must be a finite number' })
  hoursWorked!: number;
}
