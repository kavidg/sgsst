import { Injectable, Optional, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { OccupationalMedicalRecordCustody, OccupationalMedicalRecordCustodyDocument } from '../../occupational-medical-record-custody/schemas/occupational-medical-record-custody.schema';

/**
 * Provider EXACT para el estándar 3.1.5 — Custodia de historias clínicas
 * ocupacionales (FASE 30F).
 *
 * METADATA:
 *   standard: 3.1.5
 *   module: occupational-medical-record-custody
 *   phase: do
 *   semantic: EXACT
 *
 * REGLAS DE IMPLEMENTACIÓN (NO NEGOCIABLES):
 *
 * 1. NO infiere custodia desde OccupationalExam.
 * 2. NO infiere custodia desde MedicalRecommendation.
 * 3. NO infiere custodia desde Employee, JobProfile, ni ninguna otra entidad.
 * 4. La evidencia de custodia proviene EXCLUSIVAMENTE de
 *    OccupationalMedicalRecordCustody.
 * 5. No almacena contenido clínico.
 * 6. Valida tenant isolation.
 *
 * CRITERIOS C1–C4 (25% cada uno):
 *
 * C1 — Existencia de custodia: porcentaje de trabajadores con al menos un
 *      registro de custodia activo y válido.
 * C2 — Identificación y trazabilidad: registros con employee,
 *      recordReference, recordType y custodyStartDate completos.
 * C3 — Responsable y ubicación controlada: registros con custodianName,
 *      custodianRole (opcional), storageLocationReference y custodyStatus válido.
 * C4 — Confidencialidad, integridad y disponibilidad: los tres flags confirmados
 *      deben ser true explícitamente (no inferidos).
 */
@Injectable()
export class OccupationalMedicalRecordCustodyProvider implements ComplianceProvider {
  constructor(
    @InjectModel(OccupationalMedicalRecordCustody.name)
    private readonly custodyModel: Model<OccupationalMedicalRecordCustodyDocument>,
    @Optional() @Inject('WORKER_COUNT_FN')
    private readonly workerCountFn?: (companyId: string) => Promise<number>,
  ) {}

  /** Metadata del provider. */
  get metadata() {
    return {
      module: 'occupational-medical-record-custody',
      standard: '3.1.5',
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      title: 'Custodia de historias clínicas ocupacionales',
      description: 'Custodia de las historias clínicas ocupacionales con confidencialidad, integridad, disponibilidad y conservación según la normatividad.',
    };
  }

  /**
   * Calcula el cumplimiento del estándar 3.1.5 para una empresa.
   *
   * @param companyId - Identificador de la empresa (tenant).
   * @returns Resultado de cumplimiento con hallazgos si corresponde.
   */
  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    // 1. Validar que companyId es un ObjectId válido
    if (!Types.ObjectId.isValid(companyId)) {
      return {
        module: this.metadata.module,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'custody-invalid-company',
            module: this.metadata.module,
            title: 'companyId inválido',
            description: `companyId inválido: ${companyId}`,
            priority: FindingPriority.CRITICAL,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // 2. Obtener registros de custodia válidos para este tenant
    const validRecords = await this.getValidCustodyRecords(new Types.ObjectId(companyId));

    // 3. Obtener total de trabajadores del tenant
    const totalWorkers = await (this.workerCountFn
      ? this.workerCountFn(companyId)
      : this.countTotalWorkers(new Types.ObjectId(companyId)));

    // 4. Si no hay trabajadores, NO_DATA
    if (totalWorkers === 0) {
      return {
        module: this.metadata.module,
        percentage: 0,
        status: 'NO_DATA',
        findings: [],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // 5. Si no hay custodia, pero hay trabajadores, C1 = 0 pero no es NO_DATA
    if (validRecords.length === 0) {
      return {
        module: this.metadata.module,
        percentage: 0,
        status: 'NOT_MET',
        findings: [
          {
            id: 'custody-no-records',
            module: this.metadata.module,
            title: 'Sin registros de custodia',
            description: 'No existen registros de custodia de historias clínicas ocupacionales para esta empresa.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // 6. Calcular C1-C4
    const uniqueEmployeesWithCustody = new Set(validRecords.map(r => r.employeeId.toString()));
    const totalEmployeesWithCustody = uniqueEmployeesWithCustody.size;

    // C1: Existencia de custodia (trabajadores con custodia válida / total trabajadores)
    const c1 = totalWorkers > 0 ? (totalEmployeesWithCustody / totalWorkers) * 100 : 0;

    // C2: Identificación y trazabilidad
    // (employee, recordReference, recordType, custodyStartDate completos)
    const c2ValidRecords = validRecords.filter(r =>
      r.employeeId &&
      r.recordReference &&
      r.recordReference.trim() !== '' &&
      r.recordType &&
      r.custodyStartDate
    );
    const c2 = validRecords.length > 0 ? (c2ValidRecords.length / validRecords.length) * 100 : 0;

    // C3: Responsable y ubicación controlada
    // (custodianName, storageLocationReference, custodyStatus válido)
    const c3ValidRecords = validRecords.filter(r =>
      r.custodianName &&
      r.custodianName.trim() !== '' &&
      r.storageLocationReference &&
      r.storageLocationReference.trim() !== '' &&
      ['IN_CUSTODY', 'TRANSFERRED', 'ARCHIVED'].includes(r.custodyStatus)
    );
    const c3 = validRecords.length > 0 ? (c3ValidRecords.length / validRecords.length) * 100 : 0;

    // C4: Confidencialidad, integridad y disponibilidad confirmadas
    // (confidentialityConfirmed === true, integrityConfirmed === true,
    //  availabilityConfirmed === true)
    const c4ValidRecords = validRecords.filter(r =>
      r.confidentialityConfirmed === true &&
      r.integrityConfirmed === true &&
      r.availabilityConfirmed === true
    );
    const c4 = validRecords.length > 0 ? (c4ValidRecords.length / validRecords.length) * 100 : 0;

    // 7. Calcular porcentaje final (promedio de C1-C4)
    const percentage = Math.round((c1 + c2 + c3 + c4) / 4);

    // 8. Generar hallazgos si hay registros incompletos
    const findings: ProviderComplianceResult['findings'] = [];

    // Hallazgo C1: trabajadores sin custodia
    const workersWithoutCustody = totalWorkers - totalEmployeesWithCustody;
    if (workersWithoutCustody > 0 && totalWorkers > 0) {
      findings.push({
        id: 'custody-workers-without-custody',
        module: this.metadata.module,
        title: `${workersWithoutCustody} trabajador(es) sin registro de custodia`,
        description: `${workersWithoutCustody} trabajador(es) sin registro de custodia de historia clínica ocupacional.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Hallazgos C2-C4: registros incompletos
    const incompleteC2 = validRecords.length - c2ValidRecords.length;
    if (incompleteC2 > 0) {
      findings.push({
        id: 'custody-incomplete-identification',
        module: this.metadata.module,
        title: `${incompleteC2} registro(s) con identificación/trazabilidad incompleta`,
        description: `${incompleteC2} registro(s) de custodia con campos de identificación/trazabilidad incompletos.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const incompleteC3 = validRecords.length - c3ValidRecords.length;
    if (incompleteC3 > 0) {
      findings.push({
        id: 'custody-incomplete-responsible',
        module: this.metadata.module,
        title: `${incompleteC3} registro(s) con responsable/ubicación incompleta`,
        description: `${incompleteC3} registro(s) de custodia con responsable/ubicación controlada incompleta.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const incompleteC4 = validRecords.length - c4ValidRecords.length;
    if (incompleteC4 > 0) {
      findings.push({
        id: 'custody-incomplete-confidentiality',
        module: this.metadata.module,
        title: `${incompleteC4} registro(s) sin confirmación CIA`,
        description: `${incompleteC4} registro(s) de custodia sin confirmación de confidencialidad, integridad o disponibilidad.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: this.metadata.module,
      percentage,
      status: percentage === 100 ? 'TARGET_MET' : 'PARTIAL',
      findings,
      pending: 0,
      completed: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  /**
   * Obtiene registros de custodia válidos para una empresa.
   *
   * Un registro es VÁLIDO cuando:
   * - active: true
   * - custodyStatus: IN_CUSTODY
   * - confidentialityConfirmed: true (C4)
   * - integrityConfirmed: true (C4)
   * - availabilityConfirmed: true (C4)
   *
   * NO se incluyen registros TRANSFERRED, ARCHIVED ni RELEASED porque no
   * representan custodia activa actual.
   */
  private async getValidCustodyRecords(
    companyId: Types.ObjectId,
  ): Promise<OccupationalMedicalRecordCustody[]> {
    const records = await this.custodyModel
      .find({
        companyId,
        active: true,
        custodyStatus: 'IN_CUSTODY',
        confidentialityConfirmed: true,
        integrityConfirmed: true,
        availabilityConfirmed: true,
      })
      .lean();
    return records as unknown as OccupationalMedicalRecordCustody[];
  }

  /**
   * Cuenta el total de trabajadores (empleados) de una empresa.
   */
  private async countTotalWorkers(
    companyId: Types.ObjectId,
  ): Promise<number> {
    // Default implementation: count employees from the Employee collection
    try {
      const { default: mongoose } = await import('mongoose');
      const EmployeeModel = mongoose.model('Employee');
      return await EmployeeModel.countDocuments({ companyId }).exec();
    } catch {
      return 0;
    }
  }
}
