import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { DocumentMaster, DocumentType, DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 5.1.2
 * "Registros SG-SST".
 *
 * Evalúa si existen registros documentales que soporten
 * la ejecución del SG-SST.
 *
 * Fuente de datos: DocumentMaster (documentType ∈ record types)
 *
 * Criterios (25/25/25/25):
 * - Existencia de registros:              25%
 * - Registros activos/aprobados:          25%
 * - Registros vigentes (no vencidos):     25%
 * - Registros con responsable:            25%
 *
 * NOTA: Contribuye a phases.do (HACER).
 */
@Injectable()
export class RecordsDocProvider implements ComplianceProvider {
  private static readonly MODULE = 'records-doc';
  private static readonly COMPLIANCE_TARGET = 90;

  /** Document types considered as records */
  private static readonly RECORD_TYPES: DocumentType[] = [
    DocumentType.RECORD,
    DocumentType.MEETING_MINUTES,
    DocumentType.TRAINING_RECORD,
    DocumentType.AUDIT,
    DocumentType.INSPECTION,
  ];

  constructor(
    private readonly documentMasterService: DocumentMasterService,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const allDocs = await this.documentMasterService.findAll(new Types.ObjectId(companyId));

    // Filter to record-related documents only
    const records = allDocs.filter((d) =>
      RecordsDocProvider.RECORD_TYPES.includes(d.documentType as DocumentType),
    );

    if (records.length === 0) {
      return {
        module: RecordsDocProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'records-doc-no-data',
          module: RecordsDocProvider.MODULE,
          title: 'Sin registros SG-SST registrados',
          description: 'No existen documentos clasificados como registros, actas, capacitaciones, auditorías o inspecciones. El estándar 5.1.2 requiere registros documentales del SG-SST.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = records.length;
    const now = new Date();

    // Criterion 1: Existence (25%)
    const existenceScore = 1;

    // Criterion 2: Active/Approved status (25%)
    const activeOrApproved = records.filter(
      (d) => d.status === DocumentStatus.ACTIVE || d.status === DocumentStatus.APPROVED,
    ).length;
    const statusScore = activeOrApproved / total;

    // Criterion 3: Not expired (25%)
    const notExpired = records.filter(
      (d) => !d.expirationDate || d.expirationDate.getTime() >= now.getTime(),
    ).length;
    const expiryScore = notExpired / total;

    // Criterion 4: Has responsible/owner (25%)
    const withOwner = records.filter(
      (d) => d.ownerUser && d.ownerUser.toString().length > 0,
    ).length;
    const ownerScore = withOwner / total;

    const percentage = Math.round(
      existenceScore * 25 +
      statusScore * 25 +
      expiryScore * 25 +
      ownerScore * 25,
    );

    // Findings
    const findings: ProviderComplianceResult['findings'] = [];

    const inactive = total - activeOrApproved;
    if (inactive > 0) {
      findings.push({
        id: 'records-doc-inactive',
        module: RecordsDocProvider.MODULE,
        title: `${inactive} registro(s) sin estado activo/aprobado`,
        description: `${inactive} de ${total} registros no tienen estado ACTIVE o APPROVED.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const expired = records.filter(
      (d) => d.expirationDate && d.expirationDate.getTime() < now.getTime(),
    ).length;
    if (expired > 0) {
      findings.push({
        id: 'records-doc-expired',
        module: RecordsDocProvider.MODULE,
        title: `${expired} registro(s) vencido(s)`,
        description: `${expired} registros han pasado su fecha de expiración.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutOwner = total - withOwner;
    if (withoutOwner > 0) {
      findings.push({
        id: 'records-doc-no-responsible',
        module: RecordsDocProvider.MODULE,
        title: `${withoutOwner} registro(s) sin responsable`,
        description: `${withoutOwner} registros no tienen responsable/owner asignado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: RecordsDocProvider.MODULE,
      percentage,
      status: percentage >= RecordsDocProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: inactive + expired,
      completed: activeOrApproved,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
