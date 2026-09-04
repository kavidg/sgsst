import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
  InvestigationType,
} from '../../incidents/schemas/incident.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.2.2
 * "Investigación de enfermedades laborales".
 *
 * Evalúa la trazabilidad administrativa de la investigación de
 * enfermedades laborales conforme a la Resolución 0312 de 2019.
 *
 * Criterios y pesos (15/20/20/20/10/10/5):
 * - Registro de casos:                   15%
 * - Investigación formal:                20%
 * - Análisis causal:                     20%
 * - Acciones correctivas/preventivas:    20%
 * - Responsable:                         10%
 * - Evidencia:                           10%
 * - Cierre y seguimiento:                 5%
 *
 * NO_DATA: sin investigaciones de enfermedades laborales.
 * Filtra exclusivamente investigationType = DISEASE.
 */
@Injectable()
export class DiseaseInvestigationProvider implements ComplianceProvider {
  private static readonly MODULE = 'disease-investigation';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const diseases = await this.incidentModel
      .find({
        companyId: companyObjectId,
        investigationType: InvestigationType.DISEASE,
      })
      .sort({ date: -1 })
      .exec();

    const now = new Date();

    // ── NO_DATA ──
    if (diseases.length === 0) {
      return {
        module: DiseaseInvestigationProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'disease-investigation-no-data',
            module: DiseaseInvestigationProvider.MODULE,
            title: 'Sin investigaciones de enfermedades laborales',
            description:
              'No existen investigaciones de enfermedades laborales registradas para evaluar el cumplimiento del estándar 3.2.2. Registrar casos de enfermedad laboral para evaluar la trazabilidad administrativa.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = diseases.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Registro de casos (15%)
    //
    // Evalúa si existen investigaciones registradas.
    // Si hay al menos 1 → registro existente.
    // ══════════════════════════════════════════════════════════
    const registrationScore = 1; // Si llegamos aquí, total > 0

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Investigación formal (20%)
    //
    // Evalúa que exista investigationDate.
    // Proporción de investigaciones con fecha formal.
    // ══════════════════════════════════════════════════════════
    const withFormalResearch = diseases.filter(
      (d) => d.investigationDate != null,
    ).length;
    const formalResearchScore = withFormalResearch / total;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Análisis causal (20%)
    //
    // Evalúa si existen causas básicas, inmediatas y factores.
    // Una investigación tiene análisis causal cuando tiene al menos
    // rootCauses O immediateCauses O relatedFactors.
    // ══════════════════════════════════════════════════════════
    let causalCount = 0;
    for (const d of diseases) {
      const hasRoot = (d.rootCauses?.length ?? 0) > 0;
      const hasImmediate = (d.immediateCauses?.length ?? 0) > 0;
      const hasFactors = (d.relatedFactors?.length ?? 0) > 0;
      if (hasRoot || hasImmediate || hasFactors) {
        causalCount++;
      }
    }
    const causalScore = causalCount / total;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Acciones correctivas/preventivas (20%)
    //
    // Evalúa existencia de acciones y proporción completada.
    // Una investigación tiene acciones cuando tiene al menos
    // correctiveActions O preventiveActions.
    // ══════════════════════════════════════════════════════════
    let totalActions = 0;
    let completedActions = 0;
    let overdueActions = 0;

    for (const d of diseases) {
      const allActions = [
        ...(d.correctiveActions ?? []),
        ...(d.preventiveActions ?? []),
      ];
      totalActions += allActions.length;
      for (const action of allActions) {
        if (action.status === 'COMPLETED') {
          completedActions++;
        } else if (action.dueDate != null && action.dueDate.getTime() < now.getTime()) {
          overdueActions++;
        }
      }
    }

    const withActions = diseases.filter(
      (d) =>
        (d.correctiveActions?.length ?? 0) > 0 ||
        (d.preventiveActions?.length ?? 0) > 0,
    ).length;
    const hasActionsScore = withActions / total;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 5 — Responsable (10%)
    //
    // Evalúa si existe responsible asignado.
    // ══════════════════════════════════════════════════════════
    const withResponsible = diseases.filter(
      (d) => d.responsible != null && d.responsible !== '',
    ).length;
    const responsibleScore = withResponsible / total;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 6 — Evidencia (10%)
    //
    // Evalúa si existe evidencia documental.
    // ══════════════════════════════════════════════════════════
    const withEvidence = diseases.filter(
      (d) => (d.evidence?.length ?? 0) > 0,
    ).length;
    const evidenceScore = withEvidence / total;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 7 — Cierre y seguimiento (5%)
    //
    // Evalúa proporción de investigaciones cerradas.
    // ══════════════════════════════════════════════════════════
    const closedInvestigations = diseases.filter(
      (d) => d.closureDate != null,
    ).length;
    const closureScore = closedInvestigations / total;

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (15/20/20/20/10/10/5)
    // ══════════════════════════════════════════════════════════
    const percentage = Math.round(
      registrationScore * 15 +
      formalResearchScore * 20 +
      causalScore * 20 +
      hasActionsScore * 20 +
      responsibleScore * 10 +
      evidenceScore * 10 +
      closureScore * 5,
    );

    // ── Status ──
    const status =
      percentage >= DiseaseInvestigationProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: investigación formal pendiente
    const withoutFormalResearch = total - withFormalResearch;
    if (withoutFormalResearch > 0) {
      findings.push({
        id: 'disease-investigation-formal-research-gap',
        module: DiseaseInvestigationProvider.MODULE,
        title: `${withoutFormalResearch} investigación(es) sin fecha formal`,
        description:
          `${withoutFormalResearch} de ${total} investigaciones de enfermedades laborales no tienen fecha de investigación formal. Registrar la fecha de investigación para mejorar la trazabilidad del estándar 3.2.2.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: análisis causal incompleto
    const withoutCausal = total - causalCount;
    if (withoutCausal > 0) {
      findings.push({
        id: 'disease-investigation-causal-analysis-gap',
        module: DiseaseInvestigationProvider.MODULE,
        title: `${withoutCausal} investigación(es) sin análisis causal`,
        description:
          `${withoutCausal} de ${total} investigaciones no tienen causas básicas, causas inmediatas ni factores relacionados registrados. Completar la identificación de causas para mejorar la trazabilidad del estándar 3.2.2.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: acciones pendientes
    const withoutActions = total - withActions;
    if (withoutActions > 0) {
      findings.push({
        id: 'disease-investigation-actions-gap',
        module: DiseaseInvestigationProvider.MODULE,
        title: `${withoutActions} investigación(es) sin acciones correctivas/preventivas`,
        description:
          `${withoutActions} de ${total} investigaciones no tienen acciones correctivas ni preventivas registradas. Definir acciones derivadas de la investigación para mejorar el seguimiento del estándar 3.2.2.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: acciones vencidas
    if (overdueActions > 0) {
      findings.push({
        id: 'disease-investigation-overdue-actions',
        module: DiseaseInvestigationProvider.MODULE,
        title: `${overdueActions} acción(es) correctivas/preventivas vencidas`,
        description:
          `Existen ${overdueActions} acciones correctivas o preventivas con fecha vencida que no han sido completadas. Revisar y priorizar las acciones pendientes para mejorar el seguimiento del estándar 3.2.2.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: evidencia faltante
    const withoutEvidence = total - withEvidence;
    if (withoutEvidence > 0) {
      findings.push({
        id: 'disease-investigation-evidence-gap',
        module: DiseaseInvestigationProvider.MODULE,
        title: `${withoutEvidence} investigación(es) sin evidencia documental`,
        description:
          `${withoutEvidence} de ${total} investigaciones no tienen referencias de evidencia documental. Completar las evidencias administrativas para mejorar la trazabilidad del estándar 3.2.2.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: responsable faltante
    const withoutResponsible = total - withResponsible;
    if (withoutResponsible > 0) {
      findings.push({
        id: 'disease-investigation-responsible-gap',
        module: DiseaseInvestigationProvider.MODULE,
        title: `${withoutResponsible} investigación(es) sin responsable asignado`,
        description:
          `${withoutResponsible} de ${total} investigaciones no tienen responsable asignado. Asignar un responsable administrativo para mejorar la trazabilidad del estándar 3.2.2.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: investigaciones pendientes de cierre
    const pendingClosure = total - closedInvestigations;
    if (pendingClosure > 0) {
      findings.push({
        id: 'disease-investigation-pending-closure',
        module: DiseaseInvestigationProvider.MODULE,
        title: `${pendingClosure} investigación(es) pendientes de cierre`,
        description:
          `${pendingClosure} de ${total} investigaciones de enfermedades laborales no han sido formalmente cerradas. Revisar el estado de las investigaciones y proceder al cierre cuando corresponda.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: DiseaseInvestigationProvider.MODULE,
      percentage,
      status,
      findings,
      pending: pendingClosure,
      completed: closedInvestigations,
      overdue: overdueActions,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
