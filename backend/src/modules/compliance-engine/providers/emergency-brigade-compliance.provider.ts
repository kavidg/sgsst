import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import { SstEmergenciesDocument } from '../../phva-advanced/schemas/phva-advanced-emergencies.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  EMERGENCY_BRIGADE_FORMULA,
  EMERGENCY_BRIGADE_MODULE,
  EMERGENCY_BRIGADE_SCORE_WEIGHTS,
  EMERGENCY_BRIGADE_STANDARD_CODE,
  computeEmergencyBrigadeScore,
} from './emergency-brigade-scoring';

/**
 * Provider OFICIAL del estándar 5.1.2 — Brigada de prevención, preparación y
 * respuesta ante emergencias (HACER).
 *
 * FUENTE DE VERDAD: SstEmergencies.brigades[].typedMembers[] resuelta con la
 * función legacy-aware existente (findEmergenciesByCompany, $in [5.1.1,
 * 1.1.10]); NUNCA se consulta por itemCode directo y NUNCA se crea el
 * documento al scorear (lectura read-only estricta: sin findOrCreate).
 *
 * NO se usan como scoring: Brigade.leader (texto libre), Brigade.members[]
 * (legacy textual), AnnualWorkPlan, Training, COPASST, DocumentMaster ni los
 * providers emergencies/emergency-management (excluidos del scoring).
 *
 * FRONTERA 5.1.1: la brigada es evidencia COMPARTIDA en la misma colección,
 * pero los puntos de brigada (miembros, funciones, alternos, capacitación,
 * operación) pertenecen EXCLUSIVAMENTE a 5.1.2. 5.1.1 solo conserva
 * brigadesPresent como contexto (verificado en tests de frontera).
 *
 * TENANT: la pertenencia de cada employeeId al tenant se resuelve en UNA
 * consulta bulk de Employee (sin queries dentro de loops, sin N+1). El
 * provider pasa al scoring puro solo datos serializables.
 *
 * Employee.status NO filtra scoring (string libre sin política cerrada);
 * se registra el estado de los brigadistas en metadata como contexto.
 */
@Injectable()
export class EmergencyBrigadeProvider implements ComplianceProvider {
  private static readonly MODULE = EMERGENCY_BRIGADE_MODULE;
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    private readonly phvaAdvancedService: PhvaAdvancedService,
    // Lectura de SOLO validación de pertenencia al tenant de los brigadistas
    // (patrón del módulo: modelo inyectado directamente; el módulo de
    // empleados NO se modifica).
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const now = new Date();

    // Registro legacy-aware (5.1.1 / 1.1.10), lectura ESTRICTA: si no existe
    // registro → NO_DATA (nunca se crea por efecto de scorear).
    let record: SstEmergenciesDocument | null = null;
    try {
      record = await this.phvaAdvancedService.findEmergenciesByCompany(companyObjectId);
    } catch {
      record = null;
    }

    const brigades = (record?.brigades ?? []) as unknown[];

    // Resolución BULK de pertenencia al tenant de todos los employeeId
    // referenciados (UNA sola consulta; sin N+1). En la misma consulta se
    // obtiene Employee.status como contexto opcional (NO filtra scoring).
    const referencedIds = new Set<string>();
    for (const brigade of brigades) {
      const typed = ((brigade as Record<string, unknown>)?.typedMembers ?? []) as Array<Record<string, unknown>>;
      for (const member of typed) {
        const raw = member?.employeeId;
        if (raw !== undefined && raw !== null && raw !== '') {
          const key = typeof raw === 'string' ? raw.trim() : String(raw);
          if (key.length > 0) referencedIds.add(key);
        }
      }
    }
    const employeesInTenant = referencedIds.size > 0
      ? await this.employeeModel
        .find(
          {
            _id: {
              $in: [...referencedIds]
                // Robustez: solo se convierten ids con formato hex válido (24
                // caracteres); datos corruptos no deben romper el scoring.
                .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
                .map((id) => new Types.ObjectId(id)),
            },
            companyId,
          },
          { _id: 1, status: 1 },
        )
        .lean()
        .exec()
      : [];
    const employeeIdsInTenant = employeesInTenant.map((doc) => (doc._id as Types.ObjectId).toString());

    const breakdown = computeEmergencyBrigadeScore(
      { brigades: brigades as never, employeeIdsInTenant },
      now,
    );

    const toPriority = (priority: 'HIGH' | 'MEDIUM' | 'LOW'): FindingPriority =>
      priority === 'HIGH' ? FindingPriority.HIGH : priority === 'MEDIUM' ? FindingPriority.MEDIUM : FindingPriority.LOW;

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: EmergencyBrigadeProvider.MODULE,
      title: f.title,
      description: f.description,
      priority: toPriority(f.priority),
      status: 'OPEN', responsible: '', dueDate: '', createdAt: now.toISOString(),
    }));

    const percentage = breakdown.percentage;

    // Contexto opcional del estado de los empleados brigadistas (Employee.status
    // es string libre; NO filtra scoring — solo metadata explicativa). Derivado
    // de la MISMA consulta bulk (sin round-trips adicionales).
    const memberStatusContext = this.brigadeMemberStatusContext(employeesInTenant);

    if (breakdown.noData) {
      return {
        module: EmergencyBrigadeProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: this.metadata(breakdown, {
          noData: true,
          allBrigadesInactive: breakdown.allBrigadesInactive,
          employeeStatusContext: memberStatusContext,
        }),
      };
    }

    return {
      module: EmergencyBrigadeProvider.MODULE,
      percentage,
      status: percentage >= EmergencyBrigadeProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      // pending/completed con semántica de brechas (patrón 5.1.1):
      // pending = hallazgos abiertos; completed = porcentaje alcanzado.
      pending: findings.length,
      completed: percentage,
      overdue: breakdown.counters.lastMeetingDatePresent > 0 && breakdown.details.operation.latestMeetingDate === null
        ? 0
        : findings.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.metadata(breakdown, { employeeStatusContext: memberStatusContext }),
    };
  }

  /** Contexto opcional: distribución de Employee.status entre brigadistas (sin PII). */
  private brigadeMemberStatusContext(
    employeesInTenant: Array<{ _id: unknown; status?: string }>,
  ): Record<string, number> | null {
    if (employeesInTenant.length === 0) return null;
    const distribution: Record<string, number> = {};
    for (const employee of employeesInTenant) {
      const key = typeof employee.status === 'string' && employee.status.trim() !== '' ? employee.status : 'SIN_ESTADO';
      distribution[key] = (distribution[key] ?? 0) + 1;
    }
    return distribution;
  }

  /** Metadata serializable (sin documentos Mongo completos ni funciones). */
  private metadata(
    breakdown: ReturnType<typeof computeEmergencyBrigadeScore>,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      semantic: 'EXACT',
      standardCode: EMERGENCY_BRIGADE_STANDARD_CODE,
      phase: 'do',
      formula: EMERGENCY_BRIGADE_FORMULA,
      weights: { ...EMERGENCY_BRIGADE_SCORE_WEIGHTS },
      dimensions: {
        existence: { ...breakdown.dimensions.existence },
        composition: { ...breakdown.dimensions.composition },
        functionalCoverage: { ...breakdown.dimensions.functionalCoverage },
        training: { ...breakdown.dimensions.training },
        alternates: { ...breakdown.dimensions.alternates },
        traceability: { ...breakdown.dimensions.traceability },
        operation: { ...breakdown.dimensions.operation },
      },
      counters: { ...breakdown.counters },
      details: {
        existence: { ...breakdown.details.existence },
        composition: { ...breakdown.details.composition },
        functionalCoverage: { ...breakdown.details.functionalCoverage },
        training: { ...breakdown.details.training },
        alternates: { ...breakdown.details.alternates },
        traceability: { ...breakdown.details.traceability },
        operation: { ...breakdown.details.operation },
      },
      ...extra,
    };
  }
}
