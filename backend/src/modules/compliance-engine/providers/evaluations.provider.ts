import { Injectable } from '@nestjs/common';
import { EvaluationsService } from '../../../evaluations/evaluations.service';
import { Evaluation, EvaluationStatus } from '../../../evaluations/schemas/evaluation.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

const PHASE_PREFIXES: Record<CompliancePhaseKey, string[]> = {
  plan: ['1.', '2.'],
  do: ['3.', '4.', '5.'],
  check: ['6.'],
  act: ['7.'],
};

/**
 * Cumplimiento del PHVA clásico (evaluaciones por estándar) y desglose por etapa.
 */
@Injectable()
export class EvaluationsProvider implements ComplianceProvider {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const evaluations = await this.evaluationsService.findAllByCompany(companyId);
    const applicable = evaluations.filter((evaluation) => evaluation.status !== EvaluationStatus.NO_APLICA);
    const compliant = applicable.filter((evaluation) => evaluation.status === EvaluationStatus.CUMPLE).length;
    const nonCompliant = applicable.filter((evaluation) => evaluation.status === EvaluationStatus.NO_CUMPLE).length;
    const percentage = applicable.length > 0 ? Math.round((compliant / applicable.length) * 100) : 0;

    const findings = applicable
      .filter((evaluation) => evaluation.status === EvaluationStatus.NO_CUMPLE)
      .map((evaluation) => ({
        id: `eval-${evaluation.code ?? 'sin-codigo'}`,
        module: 'evaluations',
        title: `Estándar ${evaluation.code ?? 'sin código'} sin cumplir`,
        description: evaluation.improvementPlan?.observations ?? '',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: evaluation.improvementPlan?.responsible ?? '',
        dueDate: evaluation.improvementPlan?.endDate?.toISOString() ?? '',
        createdAt: new Date().toISOString(),
      }));

    return {
      module: 'evaluations',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: nonCompliant,
      completed: compliant,
      phases: this.computePhases(applicable),
    };
  }

  private computePhases(evaluations: Evaluation[]): Partial<Record<CompliancePhaseKey, number>> {
    const result: Partial<Record<CompliancePhaseKey, number>> = {};
    for (const key of Object.keys(PHASE_PREFIXES) as CompliancePhaseKey[]) {
      // Tolerancia a datos históricos incompletos: `code` puede llegar undefined,
      // null o con tipos no-string en registros previos. Se normaliza con String()
      // antes de startsWith para no romper el cálculo; esos registros no se asignan
      // a ninguna fase y el resto continúa calculándose.
      const items = evaluations.filter((evaluation) =>
        PHASE_PREFIXES[key].some((prefix) => String(evaluation.code ?? '').startsWith(prefix)),
      );
      const compliant = items.filter((evaluation) => evaluation.status === EvaluationStatus.CUMPLE).length;
      result[key] = items.length > 0 ? Math.round((compliant / items.length) * 100) : 0;
    }
    return result;
  }
}
