import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import {
  OccupationalExam,
  OccupationalExamDocument,
  ExamType,
  ExamStatus,
} from '../../occupational-exam/schemas/occupational-exam.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.4
 * "Realización de Evaluaciones Médicas Ocupacionales - Peligros - Periodicidad
 *  - Comunicación al Trabajador".
 *
 * Reutiliza el dominio de OccupationalExam (3.1.2) extendido con los campos
 * 3.1.4: periodicityMonths, relatedHazards, workerAcknowledged, communicationDate.
 *
 * Criterios y pesos (25/25/20/15/15):
 * - Evaluaciones de ingreso:               25%
 * - Evaluaciones periódicas vigentes:       25%
 * - Evaluaciones de egreso:                20%
 * - Comunicación al trabajador:            15%
 * - Relación con peligros ocupacionales:   15%
 *
 * NO_DATA: sin exámenes registrados.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class OccupationalEvaluationProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(OccupationalExam.name)
    private readonly examModel: Model<OccupationalExamDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const employees = await this.employeeModel
      .find({ companyId: companyObjectId })
      .exec();

    const totalWorkers = employees.length;

    // Obtener todos los exámenes de la empresa
    const exams = await this.examModel
      .find({ companyId: companyObjectId })
      .exec();

    // ── NO_DATA ──
    if (exams.length === 0) {
      return {
        module: 'occupational-evaluation',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'occupational-evaluation-no-data',
            module: 'occupational-evaluation',
            title: 'Sin datos de evaluaciones médicas ocupacionales',
            description:
              'No hay evaluaciones médicas ocupacionales registradas para evaluar el cumplimiento del estándar 3.1.4. Registrar evaluaciones para evaluar la realización, periodicidad, comunicación y relación con peligros.',
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

    // Construir mapa de empleados para referencia rápida
    const employeeMap = new Map<string, EmployeeDocument>();
    for (const emp of employees) {
      employeeMap.set(String(emp._id), emp);
    }

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Evaluaciones de ingreso (25%)
    //
    // Un trabajador tiene cumplido si existe al menos un examen
    // ENTRY con status COMPLETED.
    // ══════════════════════════════════════════════════════════

    const employeesWithEntryExam = new Set<string>();
    for (const exam of exams) {
      if (exam.examType === ExamType.ENTRY && exam.status === ExamStatus.COMPLETED) {
        employeesWithEntryExam.add(String(exam.employeeId));
      }
    }
    const entryScore = totalWorkers > 0
      ? employeesWithEntryExam.size / totalWorkers
      : 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Evaluaciones periódicas vigentes (25%)
    //
    // Evalúa: exámenes PERIODIC COMPLETED con nextDueDate vigente
    // + periodicityMonths definido.
    //
    // Un trabajador tiene cumplido si:
    // - Existe al menos un examen PERIODIC COMPLETED
    // - nextDueDate es vigente (>= hoy) o no tiene nextDueDate
    // - periodicityMonths > 0
    // ══════════════════════════════════════════════════════════

    const now = new Date();
    const employeesWithPeriodicVigente = new Set<string>();
    let periodicityPendingCount = 0;

    for (const exam of exams) {
      if (exam.examType === ExamType.PERIODIC && exam.status === ExamStatus.COMPLETED) {
        const empId = String(exam.employeeId);
        if (employeesWithPeriodicVigente.has(empId)) continue;

        // Verificar periodicidad definida
        const hasPeriodicity =
          exam.periodicityMonths !== undefined &&
          exam.periodicityMonths !== null &&
          exam.periodicityMonths > 0;

        if (!hasPeriodicity) {
          periodicityPendingCount++;
        }

        // Verificar nextDueDate vigente
        if (exam.nextDueDate) {
          const dueDate = new Date(exam.nextDueDate);
          if (dueDate.getTime() >= now.getTime() && hasPeriodicity) {
            employeesWithPeriodicVigente.add(empId);
          }
        } else if (hasPeriodicity) {
          // Sin nextDueDate pero con periodicidad definida
          employeesWithPeriodicVigente.add(empId);
        }
      }
    }
    const periodicScore = totalWorkers > 0
      ? employeesWithPeriodicVigente.size / totalWorkers
      : 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Evaluaciones de egreso (20%)
    //
    // Solo se evalúa para trabajadores inactivos ('No activo').
    // Si no hay trabajadores inactivos, el criterio se considera
    // cumplido al 100%.
    // ══════════════════════════════════════════════════════════

    const inactiveEmployees = employees.filter((e) => e.status === 'No activo');
    const totalInactive = inactiveEmployees.length;

    let exitScore: number;
    if (totalInactive === 0) {
      exitScore = 1;
    } else {
      const employeesWithExitExam = new Set<string>();
      for (const exam of exams) {
        if (exam.examType === ExamType.EXIT && exam.status === ExamStatus.COMPLETED) {
          employeesWithExitExam.add(String(exam.employeeId));
        }
      }
      let exitCompliant = 0;
      for (const emp of inactiveEmployees) {
        if (employeesWithExitExam.has(String(emp._id))) {
          exitCompliant++;
        }
      }
      exitScore = exitCompliant / totalInactive;
    }

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Comunicación al trabajador (15%)
    //
    // Evalúa la proporción de exámenes no cancelados con
    // workerAcknowledged === true.
    // ══════════════════════════════════════════════════════════

    const activeExams = exams.filter(
      (e) => e.status !== ExamStatus.CANCELLED,
    );
    const totalActive = activeExams.length;

    let communicationScore: number;
    let communicationPendingCount: number;
    if (totalActive === 0) {
      communicationScore = 1;
      communicationPendingCount = 0;
    } else {
      const acknowledged = activeExams.filter((e) => e.workerAcknowledged === true).length;
      communicationPendingCount = totalActive - acknowledged;
      communicationScore = acknowledged / totalActive;
    }

    // ══════════════════════════════════════════════════════════
    // CRITERIO 5 — Relación con peligros (15%)
    //
    // Evalúa la proporción de exámenes con relatedHazards
    // definidos (length > 0).
    // ══════════════════════════════════════════════════════════

    let hazardScore: number;
    let hazardPendingCount: number;
    if (totalActive === 0) {
      hazardScore = 1;
      hazardPendingCount = 0;
    } else {
      const withHazards = activeExams.filter(
        (e) =>
          e.relatedHazards !== undefined &&
          e.relatedHazards !== null &&
          e.relatedHazards.length > 0,
      ).length;
      hazardPendingCount = totalActive - withHazards;
      hazardScore = withHazards / totalActive;
    }

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (25/25/20/15/15)
    // Sin redondeos intermedios.
    // ══════════════════════════════════════════════════════════

    const percentage = Math.round(
      entryScore * 25 +
      periodicScore * 25 +
      exitScore * 20 +
      communicationScore * 15 +
      hazardScore * 15,
    );

    // ── Status ──
    const status =
      percentage >= OccupationalEvaluationProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: trabajadores sin examen de ingreso
    const missingEntry = totalWorkers - employeesWithEntryExam.size;
    if (missingEntry > 0) {
      findings.push({
        id: 'occupational-evaluation-entry-pending',
        module: 'occupational-evaluation',
        title: `${missingEntry} trabajador(es) sin evaluación de ingreso`,
        description:
          `${missingEntry} de ${totalWorkers} trabajadores no tienen evaluación médica ocupacional de ingreso completada. El estándar 3.1.4 requiere evidencia de evaluaciones de ingreso/preingreso.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: trabajadores sin evaluación periódica vigente
    const missingPeriodic = totalWorkers - employeesWithPeriodicVigente.size;
    if (missingPeriodic > 0) {
      findings.push({
        id: 'occupational-evaluation-periodic-pending',
        module: 'occupational-evaluation',
        title: `${missingPeriodic} trabajador(es) sin evaluación periódica vigente`,
        description:
          `${missingPeriodic} de ${totalWorkers} trabajadores no tienen evaluación periódica vigente con periodicidad definida. El estándar 3.1.4 requiere evaluaciones periódicas con periodicidad establecida.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: evaluaciones periódicas sin periodicidad definida
    if (periodicityPendingCount > 0) {
      findings.push({
        id: 'occupational-evaluation-periodicity-pending',
        module: 'occupational-evaluation',
        title: `${periodicityPendingCount} evaluación(es) periódica(s) sin periodicidad definida`,
        description:
          `${periodicityPendingCount} evaluaciones periódicas no tienen periodicityMonths definido. El estándar 3.1.4 requiere definir la frecuencia de las evaluaciones periódicas.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: evaluaciones pendientes de egreso
    if (totalInactive > 0) {
      const employeesWithExitExam = new Set<string>();
      for (const exam of exams) {
        if (exam.examType === ExamType.EXIT && exam.status === ExamStatus.COMPLETED) {
          employeesWithExitExam.add(String(exam.employeeId));
        }
      }
      const missingExit = totalInactive - [...inactiveEmployees].filter(
        (emp) => employeesWithExitExam.has(String(emp._id)),
      ).length;
      if (missingExit > 0) {
        findings.push({
          id: 'occupational-evaluation-exit-pending',
          module: 'occupational-evaluation',
          title: `${missingExit} trabajador(es) inactivos sin evaluación de egreso`,
          description:
            `${missingExit} de ${totalInactive} trabajadores inactivos no tienen evaluación médica ocupacional de egreso completada. El estándar 3.1.4 requiere evaluaciones de egreso/retiro.`,
          priority: FindingPriority.MEDIUM,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Finding: comunicación pendiente
    if (communicationPendingCount > 0) {
      findings.push({
        id: 'occupational-evaluation-communication-pending',
        module: 'occupational-evaluation',
        title: `${communicationPendingCount} evaluación(es) sin comunicación confirmada al trabajador`,
        description:
          `${communicationPendingCount} evaluaciones activas no tienen constancia de comunicación al trabajador (workerAcknowledged). El estándar 3.1.4 requiere comunicación por escrito de los resultados.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: cobertura de peligros pendiente
    if (hazardPendingCount > 0) {
      findings.push({
        id: 'occupational-evaluation-hazard-coverage-pending',
        module: 'occupational-evaluation',
        title: `${hazardPendingCount} evaluación(es) sin relación con peligros ocupacionales`,
        description:
          `${hazardPendingCount} evaluaciones activas no tienen peligros ocupacionales asociados (relatedHazards). El estándar 3.1.4 requiere evidencia de la relación entre evaluaciones y peligros/exposición.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Pending / Completed ──
    const completedExams = exams.filter((e) => e.status === ExamStatus.COMPLETED).length;
    const pending = exams.length - completedExams;

    return {
      module: 'occupational-evaluation',
      percentage,
      status,
      findings,
      pending,
      completed: completedExams,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
