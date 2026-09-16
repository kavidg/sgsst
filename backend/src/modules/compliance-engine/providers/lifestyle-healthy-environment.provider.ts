import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  HealthPromotionActivity,
  HealthPromotionActivityDocument,
  HealthPromotionActivityStatus,
  HealthPromotionComplianceStandard,
} from '../../health-promotion/schemas/health-promotion-activity.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.7 "Estilos de vida y entornos
 * saludables (controles tabaquismo, alcoholismo, farmacodependencia y otros)"
 * (FASE 32). Semantic: EXACT.
 *
 * Mide EXCLUSIVAMENTE evidencia de HealthPromotionActivity clasificada con
 * complianceStandard = STANDARD_3_1_7 (frontera anti-double-scoring con
 * 3.1.2/HealthPromotionProvider: una evidencia = un estándar de scoring).
 *
 * Este provider NO reutiliza ni infiere evidencia de: exámenes médicos
 * ocupacionales (3.1.4), recomendaciones médicas (3.1.3/3.1.6), historias
 * clínicas, diagnósticos, tratamientos, medicamentos ni resultados médicos
 * individuales. La evidencia es metadata operacional de gestión SST:
 * campañas, jornadas, controles y sensibilizaciones con cobertura real.
 *
 * C1 (25%) — Existencia: existe al menos una actividad 3.1.7 no cancelada.
 * C2 (25%) — Cobertura: trabajadores distintos alcanzados por actividades
 *   3.1.7 EJECUTADAS / total de trabajadores (solo participantes reales,
 *   nunca la población objetivo).
 * C3 (25%) — Ejecución: proporción de actividades ejecutadas sobre las
 *   planificadas, ponderada por completitud (responsable + evidencia +
 *   participantes).
 * C4 (25%) — Continuidad: ejecución distribuida en meses calendario
 *   distintos (patrón 3.1.2), no un registro aislado.
 */
@Injectable()
export class LifestyleHealthyEnvironmentProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(HealthPromotionActivity.name)
    private readonly activityModel: Model<HealthPromotionActivityDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // Frontera anti-double-scoring: solo evidencia clasificada para 3.1.7.
    // Las actividades 3.1.2 y las legacy (sin clasificación, default
    // STANDARD_3_1_2) NUNCA entran en este provider.
    const [employees, activities] = await Promise.all([
      this.employeeModel.find({ companyId: companyObjectId }).exec(),
      this.activityModel
        .find({
          companyId: companyObjectId,
          complianceStandard: HealthPromotionComplianceStandard.STANDARD_3_1_7,
        })
        .exec(),
    ]);

    const totalEmployees = employees.length;

    // ── NO_DATA: sin trabajadores no existe población a intervenir ──
    if (totalEmployees === 0) {
      return {
        module: 'lifestyle-healthy-environment',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'lifestyle-healthy-environment-no-workers',
            module: 'lifestyle-healthy-environment',
            title: 'Sin trabajadores registrados',
            description:
              'No hay trabajadores registrados para evaluar el estándar 3.1.7 (estilos de vida y entornos saludables). Registrar empleados para evaluar el cumplimiento.',
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

    const now = Date.now();
    const notCancelled = activities.filter(
      (activity) => activity.status !== HealthPromotionActivityStatus.CANCELLED,
    );

    // Actividad EJECUTADA = COMPLETED + fecha presente y no futura.
    const executed = notCancelled.filter((activity) => {
      if (activity.status !== HealthPromotionActivityStatus.COMPLETED) return false;
      if (!activity.activityDate) return false;
      const date = new Date(activity.activityDate).getTime();
      return !Number.isNaN(date) && date <= now;
    });

    const relevant = notCancelled;
    const totalRelevant = relevant.length;

    // ══════════════════════════════════════════════════════════════════════
    // C1 — Existencia (25%)
    // ══════════════════════════════════════════════════════════════════════
    const c1 = totalRelevant > 0 ? 1 : 0;

    // ══════════════════════════════════════════════════════════════════════
    // C2 — Cobertura real de trabajadores alcanzados por ejecutadas (25%)
    // ══════════════════════════════════════════════════════════════════════
    const coveredEmployeeIds = new Set<string>();
    for (const activity of executed) {
      for (const participantId of activity.participantEmployeeIds ?? []) {
        coveredEmployeeIds.add(String(participantId));
      }
    }
    const coveredEmployees = [...coveredEmployeeIds].filter((id) =>
      employees.some((employee) => String(employee._id) === id),
    ).length;
    const c2 = coveredEmployees / totalEmployees;

    // ══════════════════════════════════════════════════════════════════════
    // C3 — Ejecución (25%): proporción ejecutada × completitud
    // ══════════════════════════════════════════════════════════════════════
    let c3 = 0;
    if (totalRelevant > 0) {
      const executionRatio = executed.length / totalRelevant;
      let qualitySum = 0;
      if (executed.length > 0) {
        for (const activity of executed) {
          let quality = 0;
          if ((activity.responsible ?? '').trim().length > 0) quality += 1 / 3;
          if ((activity.evidence ?? '').trim().length > 0) quality += 1 / 3;
          if ((activity.participantEmployeeIds ?? []).length > 0) quality += 1 / 3;
          qualitySum += quality;
        }
        qualitySum /= executed.length;
      }
      c3 = executionRatio * qualitySum;
    }

    // ══════════════════════════════════════════════════════════════════════
    // C4 — Continuidad (25%): meses calendario distintos de ejecución
    // ══════════════════════════════════════════════════════════════════════
    const executedMonths = new Set<string>();
    for (const activity of executed) {
      const date = new Date(activity.activityDate as Date);
      executedMonths.add(`${date.getUTCFullYear()}-${date.getUTCMonth()}`);
    }
    const c4 = executedMonths.size > 0 ? Math.min((executedMonths.size - 1) / 2, 1) : 0;

    // ══════════════════════════════════════════════════════════════════════
    // CÁLCULO FINAL (25/25/25/25) — sin redondeos intermedios
    // ══════════════════════════════════════════════════════════════════════
    const percentage = Math.round(c1 * 25 + c2 * 25 + c3 * 25 + c4 * 25);

    const status =
      percentage >= LifestyleHealthyEnvironmentProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    if (totalRelevant === 0) {
      findings.push({
        id: 'lifestyle-healthy-environment-no-activities',
        module: 'lifestyle-healthy-environment',
        title: 'Sin actividades de estilos de vida y entornos saludables',
        description:
          'No existen actividades registradas y clasificadas para el estándar 3.1.7 (controles de tabaquismo, alcoholismo, farmacodependencia y otros; estilos de vida y entornos saludables). Registrar actividades con clasificación 3.1.7 para evaluar el cumplimiento.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const plannedNotExecuted = totalRelevant - executed.length;
    if (plannedNotExecuted > 0) {
      findings.push({
        id: 'lifestyle-healthy-environment-execution-pending',
        module: 'lifestyle-healthy-environment',
        title: `${plannedNotExecuted} actividad(es) 3.1.7 planificada(s) sin ejecución registrada`,
        description:
          `${plannedNotExecuted} de ${totalRelevant} actividades clasificadas como 3.1.7 no están ejecutadas (COMPLETED con fecha, responsable, evidencia y participantes). La planificación sin ejecución no demuestra el estándar.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const executedIncomplete = executed.filter(
      (activity) =>
        (activity.responsible ?? '').trim().length === 0 ||
        (activity.evidence ?? '').trim().length === 0 ||
        (activity.participantEmployeeIds ?? []).length === 0,
    ).length;
    if (executedIncomplete > 0) {
      findings.push({
        id: 'lifestyle-healthy-environment-execution-incomplete',
        module: 'lifestyle-healthy-environment',
        title: `${executedIncomplete} actividad(es) 3.1.7 ejecutada(s) con información incompleta`,
        description:
          'Actividades COMPLETED sin responsable, sin evidencia o sin participantes registrados. Completar la información para demostrar la ejecución real.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (coveredEmployees === 0 && executed.length > 0) {
      findings.push({
        id: 'lifestyle-healthy-environment-coverage-pending',
        module: 'lifestyle-healthy-environment',
        title: 'Sin trabajadores alcanzados por actividades 3.1.7 ejecutadas',
        description:
          `${totalEmployees} trabajadores registrados y ninguna actividad 3.1.7 ejecutada registra participantes alcanzados. Registrar los participantes reales de cada actividad ejecutada.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (executedMonths.size <= 1 && executed.length > 0) {
      findings.push({
        id: 'lifestyle-healthy-environment-continuity-pending',
        module: 'lifestyle-healthy-environment',
        title: 'Ejecución 3.1.7 concentrada en un solo período',
        description:
          'Las actividades ejecutadas se concentran en un único mes calendario. El estándar 3.1.7 exige gestión continua, no un registro aislado.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const completed = executed.length;
    const pending = totalRelevant > 0 ? totalRelevant - executed.length : 1;

    return {
      module: 'lifestyle-healthy-environment',
      percentage,
      status,
      findings,
      pending,
      completed,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
