import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `annual_plan` del Centro de Implementación usando datos reales
 * del plan anual de trabajo:
 *
 * - Existe un plan vigente para el año actual (findCurrent).
 * - Actividades creadas y asignadas (getActivities).
 * - Avance real del plan (compliancePercentage).
 *
 * Ponderación interna: 40% plan vigente, 30% actividades creadas,
 * 30% avance real del cumplimiento del plan.
 */
@Injectable()
export class AnnualPlanProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'annual_plan';

  constructor(private readonly annualWorkPlanService: AnnualWorkPlanService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const plan = await this.annualWorkPlanService.findCurrent(
        new Types.ObjectId(companyId),
      );

      const activities = await this.annualWorkPlanService.getActivities(plan._id);

      let percentage = 0;
      // 40% — plan vigente existe
      percentage += 40;
      // 30% — al menos una actividad creada y asignada
      if (activities.length > 0) percentage += 30;
      // 30% — avance real del plan (proporcional al cumplimiento reportado)
      const compliance = Math.max(
        0,
        Math.min(100, plan.compliancePercentage ?? 0),
      );
      percentage += Math.round((compliance / 100) * 30);

      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `Plan anual ${plan.year}: ${activities.length} actividades, ${compliance}% de avance`,
        criteria: [
          'Plan anual vigente creado',
          ...(activities.length > 0 ? ['Actividades creadas y asignadas'] : []),
          ...(compliance >= 80 ? ['Avance del plan en nivel esperado'] : []),
        ],
        pendingCriteria: [
          ...(activities.length > 0 ? [] : ['Crear actividades en el plan anual']),
          ...(compliance >= 80 ? [] : ['Avanzar en la ejecución del plan anual']),
        ],
        data: {
          year: plan.year,
          activities: activities.length,
          compliancePercentage: compliance,
          status: plan.status,
        },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Plan anual vigente no encontrado',
      };
    }
  }
}
