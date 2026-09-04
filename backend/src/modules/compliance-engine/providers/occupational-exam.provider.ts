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
 * Evaluación automática del estándar 3.1.2 "Exámenes médicos ocupacionales".
 *
 * Conecta el dominio de Empleados y Exámenes Médicos con ComplianceEngine
 * para evaluar la trazabilidad administrativa de exámenes médicos ocupacionales.
 *
 * Criterios y pesos (30/30/20/20):
 * - Exámenes de ingreso:       30%
 * - Exámenes periódicos:       30%
 * - Exámenes de egreso:        20%
 * - Seguimiento a resultados:  20%
 *
 * NO_DATA: sin empleados registrados.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class OccupationalExamProvider implements ComplianceProvider {
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

    // ── NO_DATA ──
    if (totalWorkers === 0) {
      return {
        module: 'occupational-exam',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'exam-no-data',
            module: 'occupational-exam',
            title: 'Sin datos de exámenes médicos ocupacionales',
            description:
              'No hay empleados registrados para evaluar exámenes médicos ocupacionales. Registrar empleados para evaluar el cumplimiento de 3.1.2.',
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

    // Obtener todos los exámenes de la empresa
    const exams = await this.examModel
      .find({ companyId: companyObjectId })
      .exec();

    // Construir mapa de empleados para referencia rápida
    const employeeMap = new Map<string, EmployeeDocument>();
    for (const emp of employees) {
      employeeMap.set(String(emp._id), emp);
    }

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Exámenes de ingreso (30%)
    // Un trabajador tiene cumplido si existe al menos un examen
    // ENTRY con status COMPLETED.
    // Múltiples exámenes del mismo trabajador cuentan como 1.
    // ══════════════════════════════════════════════════════════

    const employeesWithEntryExam = new Set<string>();
    for (const exam of exams) {
      if (exam.examType === ExamType.ENTRY && exam.status === ExamStatus.COMPLETED) {
        employeesWithEntryExam.add(String(exam.employeeId));
      }
    }
    const entryScore = employeesWithEntryExam.size / totalWorkers;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Exámenes periódicos (30%)
    // Un trabajador tiene cumplido si existe un examen PERIODIC
    // con status COMPLETED.
    // Si existe nextDueDate, se verifica que esté vigente (>= hoy).
    // Si NO existe nextDueDate, se cuenta como cumplido con la
    // información disponible (no se asume incumplimiento sin evidencia).
    // ══════════════════════════════════════════════════════════

    const now = new Date();
    const employeesWithPeriodicExam = new Set<string>();
    for (const exam of exams) {
      if (exam.examType === ExamType.PERIODIC && exam.status === ExamStatus.COMPLETED) {
        const empId = String(exam.employeeId);
        // Si ya tiene un examen periódico vigente registrado, no sobrescribir
        if (employeesWithPeriodicExam.has(empId)) continue;

        // Si tiene nextDueDate, verificar que esté vigente
        if (exam.nextDueDate) {
          const dueDate = new Date(exam.nextDueDate);
          if (dueDate.getTime() >= now.getTime()) {
            employeesWithPeriodicExam.add(empId);
          }
          // Si nextDueDate < hoy, el examen está vencido → no cuenta como vigente
        } else {
          // Sin nextDueDate: el examen existe y está completado.
          // No asumir incumplimiento sin evidencia de vencimiento.
          employeesWithPeriodicExam.add(empId);
        }
      }
    }
    const periodicScore = employeesWithPeriodicExam.size / totalWorkers;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Exámenes de egreso (20%)
    //
    // REGLA: NO penalizar automáticamente a trabajadores activos
    // por no tener examen de egreso. El examen de egreso aplica
    // conceptualmente cuando existe una situación de terminación.
    //
    // El modelo Employee tiene campo status: 'Activo' | 'No activo'.
    // Solo se evalúa egreso para trabajadores 'No activo'.
    // Si NO hay trabajadores 'No activo', el criterio se considera
    // cumplido al 100% (no hay situaciones de egreso que evaluar).
    // ══════════════════════════════════════════════════════════

    const inactiveEmployees = employees.filter((e) => e.status === 'No activo');
    const totalInactive = inactiveEmployees.length;

    let exitScore: number;
    if (totalInactive === 0) {
      // No hay trabajadores inactivos → no hay situaciones de egreso que evaluar
      // El criterio se considera cumplido (no hay evidencia de incumplimiento)
      exitScore = 1;
    } else {
      const employeesWithExitExam = new Set<string>();
      for (const exam of exams) {
        if (exam.examType === ExamType.EXIT && exam.status === ExamStatus.COMPLETED) {
          employeesWithExitExam.add(String(exam.employeeId));
        }
      }
      // Evaluar solo sobre trabajadores inactivos
      let exitCompliant = 0;
      for (const emp of inactiveEmployees) {
        if (employeesWithExitExam.has(String(emp._id))) {
          exitCompliant++;
        }
      }
      exitScore = exitCompliant / totalInactive;
    }

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Seguimiento a resultados (20%)
    //
    // REGLA: El modelo NO contiene campo 'followUpCompleted'.
    // No inventar cumplimiento que no se puede demostrar.
    //
    // Se evalúa: de los exámenes que requieren seguimiento
    // (followUpRequired=true), cuántos tienen followUpDate definida.
    //
    // NOTA: Tener followUpDate no significa que el seguimiento
    // ya fue realizado. Solo demuestra que existe seguimiento
    // programado. Reflejar esta limitación en el cálculo.
    //
    // Si NO hay exámenes que requieran seguimiento, el criterio
    // se considera cumplido (no hay seguimientos pendientes que evaluar).
    // ══════════════════════════════════════════════════════════

    const examsRequiringFollowUp = exams.filter((e) => e.followUpRequired);
    const totalRequiringFollowUp = examsRequiringFollowUp.length;

    let followUpScore: number;
    if (totalRequiringFollowUp === 0) {
      // No hay exámenes que requieran seguimiento
      followUpScore = 1;
    } else {
      const examsWithFollowUpDate = examsRequiringFollowUp.filter(
        (e) => e.followUpDate,
      ).length;
      followUpScore = examsWithFollowUpDate / totalRequiringFollowUp;
    }

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (30/30/20/20)
    // Sin redondeos intermedios.
    // ══════════════════════════════════════════════════════════

    const percentage = Math.round(
      entryScore * 30 +
      periodicScore * 30 +
      exitScore * 20 +
      followUpScore * 20,
    );

    // ── Status ──
    const status =
      percentage >= OccupationalExamProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: trabajadores sin examen de ingreso
    const missingEntry = totalWorkers - employeesWithEntryExam.size;
    if (missingEntry > 0) {
      findings.push({
        id: 'exam-missing-entry',
        module: 'occupational-exam',
        title: `${missingEntry} trabajador(es) sin examen de ingreso`,
        description:
          `${missingEntry} de ${totalWorkers} trabajadores no tienen examen de ingreso registrado (ENTRY COMPLETED). El estándar 3.1.2 requiere evidencia de exámenes médicos de ingreso.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: trabajadores sin examen periódico vigente
    const missingPeriodic = totalWorkers - employeesWithPeriodicExam.size;
    if (missingPeriodic > 0) {
      findings.push({
        id: 'exam-missing-periodic',
        module: 'occupational-exam',
        title: `${missingPeriodic} trabajador(es) sin examen periódico vigente`,
        description:
          `${missingPeriodic} de ${totalWorkers} trabajadores no tienen examen periódico vigente registrado (PERIODIC COMPLETED con nextDueDate vigente o sin nextDueDate).`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: exámenes con seguimiento requerido sin fecha
    const missingFollowUp = examsRequiringFollowUp.filter((e) => !e.followUpDate).length;
    if (missingFollowUp > 0) {
      findings.push({
        id: 'exam-missing-follow-up',
        module: 'occupational-exam',
        title: `${missingFollowUp} examen(es) con seguimiento requerido sin fecha`,
        description:
          `${missingFollowUp} exámenes tienen followUpRequired=true pero no tienen followUpDate definida. Programar las fechas de seguimiento.`,
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
      module: 'occupational-exam',
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
