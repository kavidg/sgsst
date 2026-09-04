import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Risk, RiskDocument } from '../../risks/schemas/risk.schema';
import { InspectionActivity, InspectionActivityDocument } from '../../inspections/schemas/inspection-activity.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.3.1
 * "Verificación de controles".
 *
 * Evalúa la existencia y calidad de la verificación de los controles
 * asociados a los riesgos. Combina datos de Risk e InspectionActivity.
 *
 * Criterios (25/25/25/25):
 * - Riesgos con medidas de control definidas:      25%
 * - Inspecciones/verificaciones asociadas:          25%
 * - Verificaciones completadas y a tiempo:         25%
 * - Verificaciones con responsable asignado:       25%
 *
 * NOTA: Contribuye a phases.check (VERIFICAR).
 */
@Injectable()
export class ControlVerificationStandardProvider implements ComplianceProvider {
  private static readonly MODULE = 'control-verification-standard';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
    @InjectModel(InspectionActivity.name)
    private readonly inspectionModel: Model<InspectionActivityDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const [risks, inspections] = await Promise.all([
      this.riskModel.find({ companyId: companyObjectId }).exec(),
      this.inspectionModel.find({ companyId: companyObjectId }).exec(),
    ]);

    // ── NO_DATA: neither risks nor inspections exist ──
    if (risks.length === 0 && inspections.length === 0) {
      return {
        module: ControlVerificationStandardProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'control-verification-standard-no-data',
          module: ControlVerificationStandardProvider.MODULE,
          title: 'Sin datos para verificar controles',
          description: 'No existen riesgos ni inspecciones registradas. No es posible evaluar la verificación de controles.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // ── Criterion 1: Risks with control measures defined (25%) ──
    const riskScore = risks.length > 0
      ? risks.filter((r) => r.controlMeasures && r.controlMeasures.trim().length > 0).length / risks.length
      : 0;

    // ── Criterion 2: Inspections exist as verification evidence (25%) ──
    const inspectionScore = inspections.length > 0 ? 1 : 0;

    // ── Criterion 3: Inspections completed and on time (25%) ──
    const now = new Date();
    let completionScore = 0;
    if (inspections.length > 0) {
      const completed = inspections.filter(
        (i) => i.status === 'completada' || i.status === 'Completada',
      ).length;
      const onTime = inspections.filter((i) => {
        if (i.status === 'completada' || i.status === 'Completada') return true;
        return new Date(i.plannedDate).getTime() >= now.getTime();
      }).length;
      completionScore = (completed / inspections.length * 0.6) + (onTime / inspections.length * 0.4);
    }

    // ── Criterion 4: Responsible assigned (25%) ──
    const responsibleScore = inspections.length > 0
      ? inspections.filter((i) => i.responsible && i.responsible.trim().length > 0).length / inspections.length
      : 0;

    const percentage = Math.round(
      riskScore * 25 +
      inspectionScore * 25 +
      completionScore * 25 +
      responsibleScore * 25,
    );

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    const riskWithControls = risks.filter((r) => r.controlMeasures && r.controlMeasures.trim().length > 0).length;
    const riskWithoutControls = risks.length - riskWithControls;
    if (risks.length > 0 && riskWithoutControls > 0) {
      findings.push({
        id: 'control-verification-standard-no-controls',
        module: ControlVerificationStandardProvider.MODULE,
        title: `${riskWithoutControls} riesgo(s) sin medidas de control`,
        description: `${riskWithoutControls} de ${risks.length} riesgos no tienen medidas de control definidas para ser verificadas.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    if (risks.length > 0 && inspections.length === 0) {
      findings.push({
        id: 'control-verification-standard-no-verifications',
        module: ControlVerificationStandardProvider.MODULE,
        title: 'Sin evidencia de verificación de controles',
        description: 'Existen riesgos con controles pero no se han registrado inspecciones o verificaciones.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const overdue = inspections.filter(
      (i) => i.status !== 'completada' && i.status !== 'Completada' && new Date(i.plannedDate).getTime() < now.getTime(),
    ).length;
    if (overdue > 0) {
      findings.push({
        id: 'control-verification-standard-overdue',
        module: ControlVerificationStandardProvider.MODULE,
        title: `${overdue} verificación(es) vencida(s)`,
        description: `${overdue} inspecciones de verificación tienen fecha vencida sin completar.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutResponsible = inspections.filter(
      (i) => !i.responsible || i.responsible.trim().length === 0,
    ).length;
    if (withoutResponsible > 0) {
      findings.push({
        id: 'control-verification-standard-no-responsible',
        module: ControlVerificationStandardProvider.MODULE,
        title: `${withoutResponsible} verificación(es) sin responsable`,
        description: `${withoutResponsible} verificaciones no tienen responsable asignado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ControlVerificationStandardProvider.MODULE,
      percentage,
      status: percentage >= ControlVerificationStandardProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: riskWithoutControls + overdue,
      completed: riskWithControls + inspections.filter((i) => i.status === 'completada' || i.status === 'Completada').length,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
