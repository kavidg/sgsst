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
 * Evaluación automática del estándar 3.1.2 "Promoción y prevención en salud"
 * (FASE 30E). Semantic: EXACT.
 *
 * Mide actividades REALES de promoción y prevención dirigidas a la población
 * trabajadora. NO reutiliza exámenes médicos ocupacionales (3.1.4), ni
 * recomendaciones médicas (3.1.6), ni capacitación general (Trainings), ni
 * indicadores, ni documentos.
 *
 * Evidencia válida de ejecución: actividad con status COMPLETED, activityDate
 * presente y NO futura, responsable, evidencia y participantes identificados.
 * Una actividad futura o planificada NO demuestra ejecución histórica.
 *
 * C1 (25%) — Existencia y planificación: existe al menos una actividad no
 *   cancelada (planificada o ejecutada) durante el período evaluado.
 * C2 (25%) — Cobertura: trabajadores distintos alcanzados por actividades
 *   EJECUTADAS / total de trabajadores (solo participantes reales, nunca la
 *   población objetivo).
 * C3 (25%) — Ejecución: proporción de actividades ejecutadas sobre las
 *   planificadas, ponderada por la completitud de cada actividad ejecutada
 *   (responsable + evidencia + participantes).
 * C4 (25%) — Continuidad: la ejecución se distribuye en varios períodos
 *   (meses calendario distintos), demostrando gestión continua y no un
 *   registro aislado.
 *
 * REGLA ANTI-FALSIFICACIÓN: la existencia de exámenes, recomendaciones,
 * capacitaciones generales, indicadores o `Employee` NO es evidencia de
 * promoción/prevención. Solo actividades COMPLETED del módulo cuentan.
 *
 * REGLA ANTI-DOUBLE-SCORING (FASE 32): este provider consume EXCLUSIVAMENTE
 * actividades clasificadas con complianceStandard = STANDARD_3_1_2. Los
 * registros legacy (campo ausente, previos a la discriminación) se interpretan
 * como 3.1.2 para preservar el comportamiento histórico. Las actividades
 * clasificadas como 3.1.7 (estilos de vida y entornos saludables) NUNCA
 * puntúan aquí: las evalúa LifestyleHealthyEnvironmentProvider.
 */
@Injectable()
export class HealthPromotionProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(HealthPromotionActivity.name)
    private readonly activityModel: Model<HealthPromotionActivityDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const [employees, activities] = await Promise.all([
      this.employeeModel.find({ companyId: companyObjectId }).exec(),
      this.activityModel.find({ companyId: companyObjectId }).exec(),
    ]);

    const totalEmployees = employees.length;

    // ── NO_DATA: sin trabajadores no existe población a la que dirigir la
    // promoción/prevención ──
    if (totalEmployees === 0) {
      return {
        module: 'health-promotion',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'health-promotion-no-workers',
            module: 'health-promotion',
            title: 'Sin trabajadores registrados',
            description:
              'No hay trabajadores registrados para evaluar el estándar 3.1.2 (promoción y prevención en salud). Registrar empleados para evaluar el cumplimiento.',
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

    // FASE 32 — frontera anti-double-scoring: solo evidencia 3.1.2. Los
    // registros legacy (sin campo) cuentan como 3.1.2; los clasificados
    // STANDARD_3_1_7 quedan excluidos (los evalúa su provider EXACT).
    const standardBoundaryActivities = activities.filter(
      (activity) =>
        (activity.complianceStandard ?? HealthPromotionComplianceStandard.STANDARD_3_1_2) ===
        HealthPromotionComplianceStandard.STANDARD_3_1_2,
    );

    const now = Date.now();
    const notCancelled = standardBoundaryActivities.filter(
      (activity) => activity.status !== HealthPromotionActivityStatus.CANCELLED,
    );

    // Actividad EJECUTADA = COMPLETED + fecha presente y no futura.
    const executed = notCancelled.filter((activity) => {
      if (activity.status !== HealthPromotionActivityStatus.COMPLETED) return false;
      if (!activity.activityDate) return false;
      const date = new Date(activity.activityDate).getTime();
      return !Number.isNaN(date) && date <= now;
    });

    const relevant = notCancelled; // planificadas + ejecutadas (no canceladas)
    const totalRelevant = relevant.length;

    // ══════════════════════════════════════════════════════════════════════
    // C1 — Existencia y planificación (25%)
    // ══════════════════════════════════════════════════════════════════════
    const c1 = totalRelevant > 0 ? 1 : 0;

    // ══════════════════════════════════════════════════════════════════════
    // C2 — Cobertura de trabajadores alcanzados por actividades EJECUTADAS (25%)
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
    // C3 — Ejecución (25%): proporción ejecutada × completitud de la ejecución
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
    // C4 — Continuidad / gestión (25%): ejecución en varios períodos
    // (meses calendario distintos), demostrando que no es un registro aislado.
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
      percentage >= HealthPromotionProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    if (totalRelevant === 0) {
      findings.push({
        id: 'health-promotion-no-activities',
        module: 'health-promotion',
        title: 'Sin actividades de promoción y prevención en salud',
        description:
          'No existen actividades registradas de promoción y prevención en salud dirigidas a la población trabajadora. El estándar 3.1.2 exige planificar y ejecutar este tipo de actividades.',
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
        id: 'health-promotion-execution-pending',
        module: 'health-promotion',
        title: `${plannedNotExecuted} actividad(es) planificada(s) sin ejecución registrada`,
        description:
          `${plannedNotExecuted} de ${totalRelevant} actividades no están ejecutadas (COMPLETED con fecha, responsable, evidencia y participantes). La planificación sin ejecución no demuestra promoción y prevención en salud.`,
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
        id: 'health-promotion-execution-incomplete',
        module: 'health-promotion',
        title: `${executedIncomplete} actividad(es) ejecutada(s) con información incompleta`,
        description:
          'Actividades COMPLETED sin responsable, sin evidencia o sin participantes registrados. Completar la información para demostrar la ejecución real de promoción y prevención.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const uncovered = totalEmployees - coveredEmployees;
    if (uncovered > 0 && coveredEmployees === 0) {
      findings.push({
        id: 'health-promotion-coverage-pending',
        module: 'health-promotion',
        title: 'Sin trabajadores alcanzados por actividades ejecutadas',
        description:
          `${totalEmployees} trabajadores registrados y ninguna actividad ejecutada registra participantes alcanzados. Registrar los participantes reales de cada actividad ejecutada.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (executedMonths.size <= 1 && executed.length > 0) {
      findings.push({
        id: 'health-promotion-continuity-pending',
        module: 'health-promotion',
        title: 'Ejecución concentrada en un solo período',
        description:
          'Las actividades ejecutadas se concentran en un único mes calendario. El estándar 3.1.2 exige gestión continua de promoción y prevención durante el período evaluado, no un registro aislado.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Pending / Completed ──
    const completed = executed.length;
    const pending = totalRelevant > 0 ? totalRelevant - executed.length : 1;

    return {
      module: 'health-promotion',
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
