import { classifyImplementationLevel } from '../../implementation-validator/implementation-calculator';
import { PriorityItemDto } from '../dto/priority-item.dto';
import { PriorityOverviewDto } from '../dto/priority-overview.dto';
import { PriorityInput } from '../interfaces/priority-input.interface';

/**
 * Construye PriorityOverviewDto a partir del input normalizado y de los items
 * priorizados.
 *
 * FASE 1A: ensamblado estructural (sin algoritmo). Los contadores readyCount /
 * blockedCount se derivan de los flags ya presentes en cada item; con items
 * vacíos quedan en 0. FASE 2/3 alimentará `items` con los resultados del motor.
 */
export function buildPriorityOverview(
  input: PriorityInput,
  items: PriorityItemDto[],
): PriorityOverviewDto {
  return {
    companyId: input.companyId,
    generatedAt: new Date().toISOString(),
    overallPercentage: input.overallPercentage,
    overallScore: input.overallScore,
    level: input.level || classifyImplementationLevel(input.overallPercentage),
    completedSteps: input.completedSteps,
    totalSteps: input.totalSteps,
    readyCount: items.filter((item) => item.ready).length,
    blockedCount: items.filter((item) => !item.ready).length,
    priorities: items,
  };
}
