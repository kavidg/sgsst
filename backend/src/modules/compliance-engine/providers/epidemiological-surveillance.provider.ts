import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EpidemiologicalSurveillanceProgram,
  EpidemiologicalSurveillanceProgramDocument,
  SurveillanceActivityStatus,
} from '../../epidemiological-surveillance/schemas/epidemiological-surveillance.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { Risk, RiskDocument } from '../../risks/schemas/risk.schema';
import {
  OccupationalExam,
  OccupationalExamDocument,
  ExamStatus,
} from '../../occupational-exam/schemas/occupational-exam.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.3.1
 * "Programas de vigilancia epidemiológica".
 *
 * Evalúa la existencia, priorización, población objetivo,
 * cobertura de exámenes, ejecución de actividades y seguimiento
 * de los programas de vigilancia epidemiológica.
 *
 * Criterios y pesos (15/20/15/25/15/10):
 * - Existencia de PVE:                     15%
 * - PVE priorizado por matriz de peligros: 20%
 * - Población objetivo definida:           15%
 * - Cobertura de exámenes:                 25%
 * - Actividades ejecutadas:                15%
 * - Seguimiento y cierre:                  10%
 *
 * NO_DATA: sin programas de vigilancia epidemiológica.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class EpidemiologicalSurveillanceProvider implements ComplianceProvider {
  private static readonly MODULE = 'epidemiological-surveillance';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(EpidemiologicalSurveillanceProgram.name)
    private readonly programModel: Model<EpidemiologicalSurveillanceProgramDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
    @InjectModel(OccupationalExam.name)
    private readonly examModel: Model<OccupationalExamDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const programs = await this.programModel
      .find({ companyId: companyObjectId })
      .exec();

    // ── NO_DATA ──
    if (programs.length === 0) {
      return {
        module: EpidemiologicalSurveillanceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'pve-no-data',
            module: EpidemiologicalSurveillanceProvider.MODULE,
            title: 'Sin programas de vigilancia epidemiológica',
            description:
              'No existen programas de vigilancia epidemiológica registrados para evaluar el cumplimiento del estándar 3.3.1. Crear al menos un programa de vigilancia epidemiológica para comenzar la evaluación.',
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

    const totalPrograms = programs.length;
    const now = new Date();

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Existencia de PVE (15%)
    //
    // Si hay al menos 1 programa → 15 puntos.
    // ══════════════════════════════════════════════════════════
    const existenceScore = 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Priorización por matriz de peligros (20%)
    //
    // Evalúa si los PVE tienen peligros relacionados que existen
    // en la matriz de riesgos de la empresa.
    // Normalización case-insensitive para comparación segura.
    // ══════════════════════════════════════════════════════════

    const risks = await this.riskModel
      .find({ companyId: companyObjectId })
      .exec();

    // Construir set normalizado de hazards existentes en Risk
    const existingHazards = new Set<string>();
    for (const risk of risks) {
      if (risk.hazard) {
        existingHazards.add(risk.hazard.trim().toLowerCase());
      }
    }

    // Evaluar alineación de cada PVE con la matriz de peligros
    let programsWithAlignedHazards = 0;
    const programsWithoutHazards: string[] = [];

    for (const program of programs) {
      const programHazards = program.relatedHazards ?? [];
      if (programHazards.length === 0) {
        programsWithoutHazards.push(program.name);
        continue;
      }

      const hasAlignedHazard = programHazards.some((h) =>
        existingHazards.has(h.trim().toLowerCase()),
      );

      if (hasAlignedHazard) {
        programsWithAlignedHazards++;
      }
    }

    const hazardScore = programsWithAlignedHazards / totalPrograms;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Población objetivo definida (15%)
    //
    // Evalúa si los PVE tienen targetAreas o targetPositions.
    // Al menos una dimensión define población objetivo.
    // ══════════════════════════════════════════════════════════

    let programsWithTargetPopulation = 0;
    const programsWithoutTarget: string[] = [];

    for (const program of programs) {
      const hasAreas = (program.targetAreas?.length ?? 0) > 0;
      const hasPositions = (program.targetPositions?.length ?? 0) > 0;

      if (hasAreas || hasPositions) {
        programsWithTargetPopulation++;
      } else {
        programsWithoutTarget.push(program.name);
      }
    }

    const targetPopulationScore = programsWithTargetPopulation / totalPrograms;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Cobertura de exámenes (25%)
    //
    // Calcula la proporción de empleados de la población objetivo
    // que tienen un OccupationalExam completado relacionado con
    // los peligros del PVE.
    // ══════════════════════════════════════════════════════════

    const employees = await this.employeeModel
      .find({ companyId: companyObjectId })
      .exec();

    const exams = await this.examModel
      .find({ companyId: companyObjectId })
      .exec();

    // Calcular población total cubierta por todos los PVE
    let totalTargetPopulation = 0;
    let totalCoveredPopulation = 0;

    for (const program of programs) {
      const targetEmpIds = this.getEmployeesForProgram(
        program,
        employees,
      );
      totalTargetPopulation += targetEmpIds.size;

      if (targetEmpIds.size === 0) continue;

      // Contar cuántos empleados objetivo tienen examen completado
      // con relación a los peligros del PVE
      let covered = 0;
      for (const empId of targetEmpIds) {
        const empExams = exams.filter(
          (e) =>
            String(e.employeeId) === empId &&
            e.status === ExamStatus.COMPLETED,
        );

        // Un empleado está cubierto si tiene al menos un examen completado
        // cuyos relatedHazards coincidan con los del PVE
        const programHazards = (program.relatedHazards ?? []).map((h) =>
          h.trim().toLowerCase(),
        );

        if (programHazards.length === 0) {
          // Sin peligros definidos, se considera cubierto si tiene examen
          if (empExams.length > 0) {
            covered++;
          }
        } else {
          const hasMatchingExam = empExams.some((exam) => {
            const examHazards = (exam.relatedHazards ?? []).map((h) =>
              h.trim().toLowerCase(),
            );
            return programHazards.some((ph) => examHazards.includes(ph));
          });

          if (hasMatchingExam) {
            covered++;
          }
        }
      }

      totalCoveredPopulation += covered;
    }

    const coveragePercentage =
      totalTargetPopulation > 0
        ? Math.round(
            (totalCoveredPopulation / totalTargetPopulation) * 100,
          )
        : 0;

    const COVERAGE_THRESHOLD = 70;
    const coverageScore =
      totalTargetPopulation === 0
        ? 0
        : coveragePercentage >= COVERAGE_THRESHOLD
          ? 1
          : coveragePercentage / COVERAGE_THRESHOLD;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 5 — Actividades ejecutadas (15%)
    //
    // Evalúa la proporción de actividades completadas vs total.
    // Detecta actividades vencidas.
    // ══════════════════════════════════════════════════════════

    let totalActivities = 0;
    let completedActivities = 0;
    let overdueActivities = 0;

    for (const program of programs) {
      for (const activity of program.activities ?? []) {
        totalActivities++;

        if (activity.status === SurveillanceActivityStatus.COMPLETED) {
          completedActivities++;
        } else if (
          activity.endDate < now &&
          activity.status !== SurveillanceActivityStatus.CANCELLED
        ) {
          overdueActivities++;
        }
      }
    }

    const activityScore =
      totalActivities > 0
        ? completedActivities / totalActivities
        : 0;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 6 — Seguimiento y cierre (10%)
    //
    // Evalúa si los programas tienen periodicidad definida
    // y si empleados objetivo tienen seguimiento en exámenes.
    // ══════════════════════════════════════════════════════════

    let programsWithPeriodicity = 0;
    let programsWithFollowUpEvidence = 0;

    for (const program of programs) {
      if (
        program.periodicityMonths !== undefined &&
        program.periodicityMonths !== null &&
        program.periodicityMonths > 0
      ) {
        programsWithPeriodicity++;
      }

      // Verificar si hay evidencia de seguimiento en exámenes
      // de la población objetivo
      const targetEmpIds = this.getEmployeesForProgram(
        program,
        employees,
      );

      if (targetEmpIds.size === 0) continue;

      let hasFollowUpEvidence = false;
      for (const empId of targetEmpIds) {
        const empExams = exams.filter(
          (e) => String(e.employeeId) === empId,
        );

        const hasFollowUp = empExams.some(
          (e) => e.followUpRequired || e.workerAcknowledged,
        );

        if (hasFollowUp) {
          hasFollowUpEvidence = true;
          break;
        }
      }

      if (hasFollowUpEvidence) {
        programsWithFollowUpEvidence++;
      }
    }

    const periodicityScore = programsWithPeriodicity / totalPrograms;
    const followUpScore = programsWithFollowUpEvidence / totalPrograms;

    // El score de seguimiento es la media de periodicidad y follow-up
    const followUpCombinedScore =
      (periodicityScore + followUpScore) / 2;

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (15/20/15/25/15/10)
    // ══════════════════════════════════════════════════════════

    const percentage = Math.round(
      existenceScore * 15 +
      hazardScore * 20 +
      targetPopulationScore * 15 +
      coverageScore * 25 +
      activityScore * 15 +
      followUpCombinedScore * 10,
    );

    // ── Status ──
    const status =
      percentage >= EpidemiologicalSurveillanceProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: PVE sin peligros asociados
    if (programsWithoutHazards.length > 0) {
      findings.push({
        id: 'pve-no-hazards',
        module: EpidemiologicalSurveillanceProvider.MODULE,
        title: `${programsWithoutHazards.length} programa(s) sin peligros asociados de la matriz de riesgos`,
        description:
          `Los programas "${programsWithoutHazards.join('", "')}" no tienen peligros asociados (relatedHazards). El estándar 3.3.1 requiere que los PVE estén priorizados según la matriz de peligros.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: PVE sin población objetivo
    if (programsWithoutTarget.length > 0) {
      findings.push({
        id: 'pve-no-target-population',
        module: EpidemiologicalSurveillanceProvider.MODULE,
        title: `${programsWithoutTarget.length} programa(s) sin población objetivo definida`,
        description:
          `Los programas "${programsWithoutTarget.join('", "')}" no tienen áreas ni cargos objetivo definidos (targetAreas/targetPositions). El estándar 3.3.1 requiere identificar la población expuesta.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: cobertura insuficiente
    if (
      totalTargetPopulation > 0 &&
      coveragePercentage < COVERAGE_THRESHOLD
    ) {
      findings.push({
        id: 'pve-insufficient-coverage',
        module: EpidemiologicalSurveillanceProvider.MODULE,
        title: `Cobertura de vigilancia insuficiente: ${coveragePercentage}% (mínimo ${COVERAGE_THRESHOLD}%)`,
        description:
          `La población cubierta por exámenes relacionados con los peligros del PVE es ${totalCoveredPopulation} de ${totalTargetPopulation} empleados objetivo (${coveragePercentage}%). El estándar 3.3.1 requiere evidencia de cobertura adecuada.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: actividades vencidas
    if (overdueActivities > 0) {
      findings.push({
        id: 'pve-overdue-activities',
        module: EpidemiologicalSurveillanceProvider.MODULE,
        title: `${overdueActivities} actividad(es) de vigilancia vencida(s)`,
        description:
          `Existen ${overdueActivities} actividades de programas de vigilancia epidemiológica con fecha vencida que no han sido completadas ni canceladas. Revisar y priorizar las actividades pendientes.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: periodicidad no definida
    const programsWithoutPeriodicity =
      totalPrograms - programsWithPeriodicity;
    if (programsWithoutPeriodicity > 0) {
      findings.push({
        id: 'pve-no-periodicity',
        module: EpidemiologicalSurveillanceProvider.MODULE,
        title: `${programsWithoutPeriodicity} programa(s) sin periodicidad definida`,
        description:
          `${programsWithoutPeriodicity} de ${totalPrograms} programas no tienen periodicidad de actividades definida (periodicityMonths). El estándar 3.3.1 requiere definir la frecuencia de vigilancia.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: sin evidencia de seguimiento
    const programsWithoutFollowUp =
      totalPrograms - programsWithFollowUpEvidence;
    if (programsWithoutFollowUp > 0 && totalPrograms > 0) {
      findings.push({
        id: 'pve-no-follow-up',
        module: EpidemiologicalSurveillanceProvider.MODULE,
        title: `${programsWithoutFollowUp} programa(s) sin evidencia de seguimiento`,
        description:
          `${programsWithoutFollowUp} de ${totalPrograms} programas no tienen evidencia de seguimiento en exámenes de la población objetivo (followUpRequired o workerAcknowledged). El estándar 3.3.1 requiere seguimiento de resultados.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Pending / Completed ──
    const completedPrograms = programs.filter(
      (p) => p.status === 'COMPLETED',
    ).length;
    const pendingPrograms = totalPrograms - completedPrograms;

    return {
      module: EpidemiologicalSurveillanceProvider.MODULE,
      percentage,
      status,
      findings,
      pending: pendingPrograms,
      completed: completedPrograms,
      overdue: overdueActivities,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  /**
   * Determina los IDs de empleados que pertenecen a la población
   * objetivo de un programa, basándose en áreas y cargos.
   *
   * Returns a Set of employee ID strings to avoid double counting.
   */
  private getEmployeesForProgram(
    program: EpidemiologicalSurveillanceProgramDocument,
    employees: EmployeeDocument[],
  ): Set<string> {
    const targetAreas = (program.targetAreas ?? []).map((a) =>
      a.trim().toLowerCase(),
    );
    const targetPositions = (program.targetPositions ?? []).map((p) =>
      p.trim().toLowerCase(),
    );

    const hasAreas = targetAreas.length > 0;
    const hasPositions = targetPositions.length > 0;

    if (!hasAreas && !hasPositions) {
      return new Set();
    }

    const result = new Set<string>();

    for (const emp of employees) {
      // Solo empleados activos
      if (emp.status !== 'Activo') continue;

      const empArea = (emp.area ?? '').trim().toLowerCase();
      const empPosition = (emp.position ?? '').trim().toLowerCase();

      const matchesArea = hasAreas && targetAreas.includes(empArea);
      const matchesPosition =
        hasPositions && targetPositions.includes(empPosition);

      // Un empleado está en la población objetivo si cumple
      // al menos una de las dimensiones definidas
      if (matchesArea || matchesPosition) {
        result.add(String(emp._id));
      }
    }

    return result;
  }
}
