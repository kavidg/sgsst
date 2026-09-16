import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WorkRestriction,
  WorkRestrictionDocument,
  RestrictionStatus,
} from '../../work-restriction/schemas/work-restriction.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.6 "Restricciones y recomendaciones
 * médico-laborales" (FASE 33). Semantic: EXACT.
 *
 * METADATA:
 *   standard: 3.1.6
 *   module: work-restriction
 *   phase: do
 *   semantic: EXACT
 *
 * REGLAS DE IMPLEMENTACIÓN (NO NEGOCIABLES):
 *
 * 1. La evidencia proviene EXCLUSIVAMENTE de WorkRestriction (entidad propia
 *    del estándar 3.1.6).
 * 2. NO consume como evidencia: MedicalRecommendation, OccupationalExam,
 *    JobProfile, historias clínicas ni diagnósticos.
 * 3. No almacena ni puntúa por contenido clínico: la calidad de la evidencia
 *    depende de existencia, gestión, seguimiento y control (§15).
 * 4. Deduplicación (§16): una misma restricción administrativa registrada en
 *    varias filas (mismo employeeId + restrictionType + receivedAt) cuenta
 *    UNA sola vez por trabajador para cobertura (C1).
 *
 * CRITERIOS C1–C4 (25% cada uno):
 *
 * C1 — Existencia: trabajadores distintos con al menos una restricción/
 *      recomendación válida (no cancelada) / total trabajadores.
 * C2 — Gestión: proporción de restricciones con acciones laborales
 *      registradas (no basta con almacenar que existe).
 * C3 — Seguimiento: proporción de restricciones con responsable asignado
 *      y/o seguimiento administrativo (followUpDate/followUpStatus).
 * C4 — Cierre/control: proporción de restricciones activas vigentes o
 *      cerradas con trazabilidad suficiente (receivedAt, acciones o
 *      seguimiento, sin solapamiento de vigencia).
 */
@Injectable()
export class WorkRestrictionProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(WorkRestriction.name)
    private readonly restrictionModel: Model<WorkRestrictionDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  /** Metadata del provider. */
  get metadata() {
    return {
      module: 'work-restriction',
      standard: '3.1.6',
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      title: 'Restricciones y recomendaciones médico-laborales',
      description:
        'Gestión administrativa y operacional de restricciones y recomendaciones médico-laborales con seguimiento y ajustes laborales.',
    };
  }

  /**
   * Calcula el cumplimiento del estándar 3.1.6 para una empresa.
   */
  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    if (!Types.ObjectId.isValid(companyId)) {
      return this.noData('work-restriction-invalid-company', 'companyId inválido');
    }

    const companyObjectId = new Types.ObjectId(companyId);

    const [restrictions, totalWorkers] = await Promise.all([
      this.restrictionModel.find({ companyId: companyObjectId }).lean(),
      this.countTotalWorkers(companyObjectId),
    ]);

    // ── NO_DATA: sin trabajadores no existe población a gestionar ──
    if (totalWorkers === 0) {
      return {
        module: 'work-restriction',
        percentage: 0,
        status: 'NO_DATA',
        findings: [],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // Registro administrativo VÁLIDO: activo y no cancelado (CANCELLED no es
    // evidencia; desactivado conserva trazabilidad histórica para C4).
    const relevant = restrictions.filter(
      (r) => r.active && r.status !== RestrictionStatus.CANCELLED,
    );

    // ── C1 — Existencia (25%): trabajadores cubiertos (deduplicados) / total ──
    // Deduplicación §16: misma restricción (employeeId + type + receivedAt)
    // registrada varias veces cuenta UNA vez por trabajador.
    const dedupKeys = new Set<string>();
    const employeeCovered = new Set<string>();
    for (const r of relevant) {
      const key = `${String(r.employeeId)}|${r.restrictionType}|${new Date(r.receivedAt).toISOString()}`;
      if (!dedupKeys.has(key)) {
        dedupKeys.add(key);
        employeeCovered.add(String(r.employeeId));
      }
    }
    const c1 = employeeCovered.size / totalWorkers;

    // ── C2 — Gestión (25%): acciones laborales registradas ──
    const withActions = relevant.filter((r) => (r.actions ?? '').trim().length > 0);
    const c2 = relevant.length > 0 ? withActions.length / relevant.length : 0;

    // ── C3 — Seguimiento (25%): responsable y/o seguimiento administrativo ──
    const withFollowUp = relevant.filter(
      (r) =>
        (r.responsibleUserId !== undefined && r.responsibleUserId !== null) ||
        r.followUpDate !== undefined ||
        (r.followUpStatus ?? '').trim().length > 0,
    );
    const c3 = relevant.length > 0 ? withFollowUp.length / relevant.length : 0;

    // ── C4 — Cierre/control (25%): vigencia coherente + cierre trazado ──
    const controlled = relevant.filter((r) => {
      // Cerradas con trazabilidad suficiente de la gestión realizada.
      if (r.status === RestrictionStatus.CLOSED) {
        return (
          (r.actions ?? '').trim().length > 0 ||
          (r.followUpStatus ?? '').trim().length > 0 ||
          (r.evidence ?? '').trim().length > 0
        );
      }
      // Activas/en seguimiento: vigencia coherente (sin solapamiento) o sin fechas.
      if (r.effectiveFrom && r.effectiveUntil) {
        return new Date(r.effectiveUntil).getTime() >= new Date(r.effectiveFrom).getTime();
      }
      return true;
    });
    const c4 = relevant.length > 0 ? controlled.length / relevant.length : 0;

    const percentage = Math.round(c1 * 25 + c2 * 25 + c3 * 25 + c4 * 25);

    const status =
      percentage >= WorkRestrictionProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    if (relevant.length === 0) {
      findings.push({
        id: 'work-restriction-no-records',
        module: 'work-restriction',
        title: 'Sin restricciones/recomendaciones médico-laborales registradas',
        description:
          'No existen restricciones o recomendaciones médico-laborales registradas y gestionadas administrativamente. Registrar las medidas laborales derivadas de conceptos del médico evaluador para evaluar el estándar 3.1.6.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (relevant.length > 0 && employeeCovered.size < totalWorkers) {
      findings.push({
        id: 'work-restriction-coverage-pending',
        module: 'work-restriction',
        title: `${totalWorkers - employeeCovered.size} trabajador(es) sin restricción/recomendación gestionada`,
        description:
          'La cobertura se calcula sobre trabajadores con al menos una restricción/recomendación registrada (deduplicada por trabajador, tipo y fecha de recepción).',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const withoutActions = relevant.length - withActions.length;
    if (withoutActions > 0) {
      findings.push({
        id: 'work-restriction-actions-pending',
        module: 'work-restriction',
        title: `${withoutActions} restricción(es) sin acciones laborales registradas`,
        description:
          'Registrar la gestión laboral (adaptación de tarea, cambio de actividad, ajuste de jornada, restricción de exposición, seguimiento administrativo). Registrar el hecho administrativo, no contenido clínico.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const withoutFollowUp = relevant.length - withFollowUp.length;
    if (withoutFollowUp > 0) {
      findings.push({
        id: 'work-restriction-followup-pending',
        module: 'work-restriction',
        title: `${withoutFollowUp} restricción(es) sin responsable/seguimiento administrativo`,
        description:
          'Asignar responsable de la gestión y/o registrar el seguimiento administrativo (fecha y resultado) de cada restricción.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const uncontrolled = relevant.length - controlled.length;
    if (uncontrolled > 0) {
      findings.push({
        id: 'work-restriction-control-pending',
        module: 'work-restriction',
        title: `${uncontrolled} restricción(es) sin cierre/control trazable`,
        description:
          'Las restricciones activas deben mantener vigencia coherente o cerrarse con trazabilidad administrativa suficiente (acciones, seguimiento o evidencia documental).',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const completed = relevant.filter((r) => r.status === RestrictionStatus.CLOSED).length;

    return {
      module: 'work-restriction',
      percentage,
      status,
      findings,
      pending: relevant.length - completed,
      completed,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  /** Resultado NO_DATA con finding estructurado (código, no solo texto). */
  private noData(findingId: string, title: string): ProviderComplianceResult {
    return {
      module: 'work-restriction',
      percentage: 0,
      status: 'NO_DATA',
      findings: [
        {
          id: findingId,
          module: 'work-restriction',
          title,
          description:
            'No fue posible evaluar el estándar 3.1.6. Verifique los datos de la empresa.',
          priority: FindingPriority.CRITICAL,
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

  /** Cuenta trabajadores del tenant (modelo Employee inyectado, tenant-scoped). */
  private async countTotalWorkers(companyId: Types.ObjectId): Promise<number> {
    return this.employeeModel.countDocuments({ companyId });
  }
}
