import { PriorityItemDto } from './priority-item.dto';

/**
 * Respuesta de GET /implementation-priority/company/:companyId/priorities.
 *
 * DTO propio (sin schemas Mongo) que agrega las prioridades del Centro de
 * Implementación junto con el contexto global del wizard validado.
 */
export class PriorityOverviewDto {
  companyId!: string;
  /** Timestamp de generación del análisis de prioridades. */
  generatedAt!: string;
  overallPercentage!: number;
  overallScore!: number;
  level!: string;
  completedSteps!: number;
  totalSteps!: number;
  /** Pasos listos para ejecutar (sin prerrequisitos incompletos). FASE 3. */
  readyCount!: number;
  /** Pasos bloqueados por prerrequisitos incompletos. FASE 3. */
  blockedCount!: number;
  /** Prioridades ordenadas por priorityScore desc (top N). FASE 2. */
  priorities!: PriorityItemDto[];
}
