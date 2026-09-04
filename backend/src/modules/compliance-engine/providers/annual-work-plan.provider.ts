import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { AWP_CONSOLIDATED_SOURCES } from '../utils/compliance-weights';

/**
 * Cumplimiento del plan anual de trabajo vigente.
 * Reutiliza PlanComplianceService a través de AnnualWorkPlanService.
 *
 * Cuando el plan tiene actividades sincronizadas desde SST Objectives o
 * InitialEvaluation (sourceModule ∈ AWP_CONSOLIDATED_SOURCES), el provider
 * considera que AWP consolida esas fuentes y contribuye a phases.plan.
 *
 * La detección de consolidación se realiza vía
 * AnnualWorkPlanService.hasActivitiesFromSourceModules() — un método
 * público, testeable y tenant-safe que consulta el campo sourceModule
 * de las actividades.
 *
 * La deduplicación explícita (evitar doble conteo con SST/IE) se aplica
 * en ComplianceEngineService.resolvePhaseCompliance().
 */
@Injectable()
export class AnnualWorkPlanProvider implements ComplianceProvider {
  constructor(private readonly annualWorkPlanService: AnnualWorkPlanService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    try {
      const plan = await this.annualWorkPlanService.findCurrent(new Types.ObjectId(companyId));
      const report = await this.annualWorkPlanService.getComplianceReport(plan._id);

      // Detectar si el plan consolida fuentes externas (SST Objectives, IE).
      // Usa el método público hasActivitiesFromSourceModules del service,
      // que consulta el campo sourceModule de las actividades.
      // SOLO actividades reales sincronizadas activan la consolidación.
      // Actividades manuales (sin sourceModule) NO cuentan.
      const hasConsolidated = await this.annualWorkPlanService.hasActivitiesFromSourceModules(
        plan._id,
        AWP_CONSOLIDATED_SOURCES,
      );

      const findings =
        report.overdueTasks > 0
          ? [
              {
                id: 'awp-overdue',
                module: 'annual-work-plan',
                title: `${report.overdueTasks} tareas vencidas en el plan anual`,
                description: 'Existen tareas del plan anual de trabajo vencidas sin completar.',
                priority: FindingPriority.HIGH,
                status: 'OPEN',
                responsible: '',
                dueDate: '',
                createdAt: new Date().toISOString(),
              },
            ]
          : [];

      const result: ProviderComplianceResult = {
        module: 'annual-work-plan',
        percentage: report.overallPercentage,
        status: classifyComplianceLevel(report.overallPercentage),
        findings,
        pending: report.totalTasks - report.completedTasks,
        completed: report.completedTasks,
        overdue: report.overdueTasks,
      };

      // phases.plan: solo cuando el plan consolida fuentes externas.
      // phases.do: siempre que exista un plan con ejecución válida.
      const phases: Partial<Record<CompliancePhaseKey, number>> = {};

      if (hasConsolidated) {
        phases.plan = report.overallPercentage;
      }

      // El porcentaje del AWP representa ejecución real del plan anual:
      // ponderado por completitud de actividades (25%), tareas (45%),
      // evidencia (20%) y justificación de vencimientos (10%).
      // Esto es directamente ejecución del SG-SST → HACER.
      phases.do = report.overallPercentage;

      result.phases = phases;

      return result;
    } catch {
      return {
        module: 'annual-work-plan',
        percentage: 0,
        status: 'NO_DATA',
        findings: [],
        pending: 0,
        completed: 0,
        overdue: 0,
      };
    }
  }
}
