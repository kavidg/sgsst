import { IndicatorFrequency } from '../enums/indicator-frequency.enum';

/**
 * Valida que un string de período tenga el formato correcto según la frecuencia.
 *
 * MONTHLY:    YYYY-MM     (ej: 2026-01)
 * QUARTERLY:  YYYY-QN     (ej: 2026-Q1)
 * SEMESTRAL:  YYYY-SN     (ej: 2026-S1)
 * ANNUAL:     YYYY        (ej: 2026)
 *
 * @throws Error si el formato es inválido
 */
export function validatePeriodFormat(period: string, frequency: IndicatorFrequency): void {
  const trimmed = period.trim();

  switch (frequency) {
    case IndicatorFrequency.MONTHLY: {
      const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
      if (!match) {
        throw new Error(`Invalid monthly period format: "${trimmed}". Expected YYYY-MM.`);
      }
      const month = parseInt(match[2], 10);
      if (month < 1 || month > 12) {
        throw new Error(`Invalid month in period: "${trimmed}". Month must be 01-12.`);
      }
      break;
    }

    case IndicatorFrequency.QUARTERLY: {
      const match = /^(\d{4})-Q([1-4])$/.exec(trimmed);
      if (!match) {
        throw new Error(`Invalid quarterly period format: "${trimmed}". Expected YYYY-QN (N=1-4).`);
      }
      break;
    }

    case IndicatorFrequency.SEMESTRAL: {
      const match = /^(\d{4})-S([1-2])$/.exec(trimmed);
      if (!match) {
        throw new Error(`Invalid semestral period format: "${trimmed}". Expected YYYY-SN (N=1-2).`);
      }
      break;
    }

    case IndicatorFrequency.ANNUAL: {
      const match = /^(\d{4})$/.exec(trimmed);
      if (!match) {
        throw new Error(`Invalid annual period format: "${trimmed}". Expected YYYY.`);
      }
      break;
    }

    default:
      throw new Error(`Unknown frequency: "${frequency}".`);
  }
}

/**
 * Calcula las fechas de inicio y fin para un período dado.
 */
export function getPeriodDates(period: string, frequency: IndicatorFrequency): { start: Date; end: Date } {
  const trimmed = period.trim();

  switch (frequency) {
    case IndicatorFrequency.MONTHLY: {
      const [year, month] = trimmed.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0); // último día del mes
      return { start, end };
    }

    case IndicatorFrequency.QUARTERLY: {
      const match = /^(\d{4})-Q([1-4])$/.exec(trimmed);
      if (!match) throw new Error(`Invalid quarterly period: "${trimmed}"`);
      const year = parseInt(match[1], 10);
      const quarter = parseInt(match[2], 10);
      const startMonth = (quarter - 1) * 3;
      const start = new Date(year, startMonth, 1);
      const end = new Date(year, startMonth + 3, 0);
      return { start, end };
    }

    case IndicatorFrequency.SEMESTRAL: {
      const match = /^(\d{4})-S([1-2])$/.exec(trimmed);
      if (!match) throw new Error(`Invalid semestral period: "${trimmed}"`);
      const year = parseInt(match[1], 10);
      const semester = parseInt(match[2], 10);
      const startMonth = (semester - 1) * 6;
      const start = new Date(year, startMonth, 1);
      const end = new Date(year, startMonth + 6, 0);
      return { start, end };
    }

    case IndicatorFrequency.ANNUAL: {
      const year = parseInt(trimmed, 10);
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return { start, end };
    }

    default:
      throw new Error(`Unknown frequency: "${frequency}".`);
  }
}
